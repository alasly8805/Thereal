import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { signToken, setAuthCookie } from "@/lib/auth";
import { getLockoutState, lockoutResponseBody, recordFailedLogin, clearFailedLogins } from "@/lib/login-guard";
import {
  centerHostLoginDenied,
  getCenterPassGrant,
  normalizePublicId,
} from "@/lib/center-pass";

const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 12;
const ipAttempts = new Map<string, { n: number; resetAt: number }>();

function allowIp(ip: string) {
  const now = Date.now();
  const row = ipAttempts.get(ip);
  if (!row || row.resetAt < now) {
    ipAttempts.set(ip, { n: 1, resetAt: now + WINDOW_MS });
    return true;
  }
  row.n += 1;
  return row.n <= MAX_ATTEMPTS;
}

function clientIp(req: NextRequest) {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";
}

export async function POST(req: NextRequest) {
  try {
    const hostDenied = centerHostLoginDenied(req);
    if (hostDenied) return hostDenied;

    const ip = clientIp(req);
    if (!allowIp(ip)) {
      return NextResponse.json(
        { error: "محاولات كثيرة. انتظر قليلاً ثم أعد المحاولة.", code: "RATE_LIMIT" },
        { status: 429 }
      );
    }

    const body = (await req.json().catch(() => ({}))) as { publicId?: string; password?: string };
    const publicId = normalizePublicId(String(body.publicId || ""));
    const password = String(body.password || "");

    if (!publicId || !password) {
      return NextResponse.json({ error: "الرقم التعريفي وكلمة المرور مطلوبان" }, { status: 400 });
    }

    const pass = await prisma.centerPass.findUnique({
      where: { publicId },
      include: { student: true },
    });

    if (!pass || !pass.student || pass.student.isDeleted || pass.student.accountMode !== "CENTER_ID") {
      return NextResponse.json({ error: "بيانات الدخول غير صحيحة" }, { status: 401 });
    }

    if (!pass.isActive || !pass.student.isActive) {
      return NextResponse.json({ error: "هذا الرقم التعريفي موقوف. تواصل مع الإدارة." }, { status: 403 });
    }

    if (!pass.student.password) {
      return NextResponse.json({ error: "بيانات الدخول غير صحيحة" }, { status: 401 });
    }

    const lockout = getLockoutState(pass.student);
    if (lockout.locked) {
      return NextResponse.json(lockoutResponseBody(lockout.retryAfterSeconds), { status: 429 });
    }

    const valid = await bcrypt.compare(password, pass.student.password);
    if (!valid) {
      await recordFailedLogin(pass.student.id);
      return NextResponse.json({ error: "بيانات الدخول غير صحيحة" }, { status: 401 });
    }

    await clearFailedLogins(pass.student.id);
    await prisma.centerPass.update({
      where: { id: pass.id },
      data: { lastLoginAt: new Date() },
    });
    await prisma.user.update({
      where: { id: pass.student.id },
      data: { lastLoginAt: new Date() },
    });

    const token = await signToken({
      id: pass.student.id,
      email: pass.student.email,
      name: pass.student.name,
      role: pass.student.role,
      accountMode: "CENTER_ID",
      tokenVersion: pass.student.tokenVersion ?? 0,
    });
    await setAuthCookie(token);

    const grant = await getCenterPassGrant(pass.student.id);

    return NextResponse.json({
      user: {
        id: pass.student.id,
        name: pass.student.name,
        role: pass.student.role,
        accountMode: "CENTER_ID",
      },
      pass: {
        publicId: pass.publicId,
        title: pass.title,
        courseCount: grant?.courseIds.size ?? 0,
      },
    });
  } catch (err) {
    console.error("Center ID login error:", err);
    return NextResponse.json({ error: "حدث خطأ في الخادم" }, { status: 500 });
  }
}
