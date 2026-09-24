import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { signToken, setAuthCookie } from "@/lib/auth";
import { normalizeEgyptPhone } from "@/lib/phone";
import { readDeviceId, setDeviceCookie, deviceLabelFromUA } from "@/lib/devices";
import { getStudentMaxDevices } from "@/lib/settings";
import {
  clearFailedLogins,
  enforceCaptcha,
  getLockoutState,
  lockoutResponseBody,
  recordFailedLogin,
} from "@/lib/login-guard";

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as { phone?: string; password?: string; recaptchaToken?: string };
    const { phone, password, recaptchaToken } = body;

    // ── reCAPTCHA Enterprise verification ──────────────────────────────────────
    const captchaGate = await enforceCaptcha(recaptchaToken, "login");
    if (!captchaGate.ok) {
      return NextResponse.json({ error: captchaGate.error }, { status: captchaGate.status });
    }

    if (!phone || !password) {
      return NextResponse.json({ error: "رقم الهاتف وكلمة المرور مطلوبان" }, { status: 400 });
    }

    const normalizedPhone = normalizeEgyptPhone(String(phone));

    const user = await prisma.user.findFirst({ where: { phone: normalizedPhone } });
    if (!user) {
      return NextResponse.json({ error: "بيانات الدخول غير صحيحة" }, { status: 401 });
    }

    if (!user.password) {
      return NextResponse.json({ error: "بيانات الدخول غير صحيحة" }, { status: 401 });
    }

    // Lockout is checked before the bcrypt compare so a locked account also
    // stops burning CPU on attacker-supplied passwords.
    const lockout = getLockoutState(user);
    if (lockout.locked) {
      return NextResponse.json(lockoutResponseBody(lockout.retryAfterSeconds), { status: 429 });
    }

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      await recordFailedLogin(user.id);
      return NextResponse.json({ error: "بيانات الدخول غير صحيحة" }, { status: 401 });
    }

    if (user.role !== "student") {
      return NextResponse.json({ error: "استخدم لوحة الإدارة لتسجيل الدخول" }, { status: 403 });
    }

    if (user.accountMode === "CENTER_ID") {
      return NextResponse.json(
        {
          error: "هذا حساب رقم تعريفي. سجّل الدخول من center.code-up.tech عبر Get by ID.",
          code: "CENTER_ID_LOGIN",
        },
        { status: 403 }
      );
    }

    await clearFailedLogins(user.id);

    // ── Device lock: bind the account to a limited number of devices ──────────
    const { deviceId, isNew } = await readDeviceId();
    const ipAddress = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
    const userAgent = req.headers.get("user-agent") ?? null;

    const known = await prisma.device.findUnique({
      where: { userId_deviceId: { userId: user.id, deviceId } },
    });
    if (known) {
      await prisma.device.update({
        where: { id: known.id },
        data: { lastSeenAt: new Date(), ipAddress, userAgent },
      });
    } else {
      const maxDevices = await getStudentMaxDevices();
      const count = await prisma.device.count({ where: { userId: user.id } });
      if (count >= maxDevices) {
        return NextResponse.json(
          {
            error: `لقد سجّلت الدخول من الحد الأقصى للأجهزة المسموح بها (${maxDevices}). تواصل مع معلمك لإعادة ضبط الأجهزة.`,
            code: "DEVICE_LIMIT",
          },
          { status: 403 }
        );
      }
      await prisma.device.create({
        data: { userId: user.id, deviceId, label: deviceLabelFromUA(userAgent), userAgent, ipAddress },
      });
    }

    const token = await signToken({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      deviceId,
      tokenVersion: (user as { tokenVersion?: number | null }).tokenVersion ?? 0,
    });
    await setAuthCookie(token);
    if (isNew) await setDeviceCookie(deviceId);

    // Points Logic: Award daily login points
    const { awardDailyLoginPoints } = await import("@/lib/points");
    await awardDailyLoginPoints(user.id);

    return NextResponse.json({ user: { id: user.id, name: user.name, role: user.role } });
  } catch (err) {
    console.error("Login error:", err);
    return NextResponse.json({ error: "حدث خطأ في الخادم" }, { status: 500 });
  }
}
