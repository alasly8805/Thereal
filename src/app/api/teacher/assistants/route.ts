import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { invalidateUserSessionCache } from "@/lib/cache";
import { requireTeacherContext } from "@/lib/teacher-scope-server";
import {
  ASSISTANT_PERMISSION_KEYS,
  DEFAULT_ASSISTANT_PERMISSIONS,
  generateAssistantPassword,
  parseAssistantPermissions,
  type AssistantPermissions,
} from "@/lib/teacher-scope";

const MAX_ASSISTANTS = 8;

function sanitizeName(raw: string): string {
  return raw.replace(/\s+/g, " ").trim().slice(0, 40);
}

function applyPermissionPatch(
  current: AssistantPermissions,
  incoming: unknown
): AssistantPermissions {
  const next = { ...current };
  if (!incoming || typeof incoming !== "object") return next;
  const rec = incoming as Record<string, unknown>;
  for (const key of ASSISTANT_PERMISSION_KEYS) {
    if (typeof rec[key] === "boolean") next[key] = rec[key];
  }
  return next;
}

export async function GET() {
  const gate = await requireTeacherContext();
  if (!gate.ok) return gate.response;
  if (gate.ctx.isAssistant) {
    return NextResponse.json({ error: "المساعد لا يدير حسابات المساعدين" }, { status: 403 });
  }

  const assistants = await prisma.user.findMany({
    where: {
      role: "assistant",
      assistantOfTeacherId: gate.ctx.teacherId,
      isDeleted: false,
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      isActive: true,
      lastLoginAt: true,
      createdAt: true,
      assistantPermissions: true,
    },
  });

  return NextResponse.json({
    assistants: assistants.map((a) => ({
      id: a.id,
      name: a.name,
      isActive: a.isActive,
      lastLoginAt: a.lastLoginAt,
      createdAt: a.createdAt,
      permissions: parseAssistantPermissions(a.assistantPermissions),
    })),
    maxAssistants: MAX_ASSISTANTS,
  });
}

export async function POST(req: NextRequest) {
  const gate = await requireTeacherContext();
  if (!gate.ok) return gate.response;
  if (gate.ctx.isAssistant) {
    return NextResponse.json({ error: "المساعد لا ينشئ حسابات أخرى" }, { status: 403 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    name?: string;
    permissions?: unknown;
  };
  const name = sanitizeName(body.name || "");
  if (name.length < 2) {
    return NextResponse.json({ error: "اكتب اسم المساعد (حرفين على الأقل)" }, { status: 400 });
  }

  const existingCount = await prisma.user.count({
    where: {
      role: "assistant",
      assistantOfTeacherId: gate.ctx.teacherId,
      isDeleted: false,
    },
  });
  if (existingCount >= MAX_ASSISTANTS) {
    return NextResponse.json(
      { error: `الحد الأقصى ${MAX_ASSISTANTS} مساعدين. عطّل حساب قديم أولاً.` },
      { status: 400 }
    );
  }

  const nameTaken = await prisma.user.findFirst({
    where: { role: "assistant", isDeleted: false, name },
    select: { id: true },
  });
  if (nameTaken) {
    return NextResponse.json(
      { error: "اسم الدخول ده مستخدم. اختار اسم تاني عشان المساعد يسجّل بيه." },
      { status: 409 }
    );
  }

  const permissions = applyPermissionPatch(DEFAULT_ASSISTANT_PERMISSIONS, body.permissions);
  const plainPassword = generateAssistantPassword();
  const passwordHash = await bcrypt.hash(plainPassword, 10);
  const email = `asst.${gate.ctx.teacherId.slice(-6)}.${Date.now().toString(36)}@assistant.code-up.local`;

  const created = await prisma.user.create({
    data: {
      name,
      email,
      password: passwordHash,
      role: "assistant",
      isActive: true,
      profileCompleted: true,
      assistantOfTeacherId: gate.ctx.teacherId,
      assistantPermissions: JSON.stringify(permissions),
    },
    select: { id: true, name: true, createdAt: true, isActive: true },
  });

  return NextResponse.json({
    success: true,
    assistant: {
      ...created,
      permissions,
    },
    password: plainPassword,
    loginHint: "لوحة الإدارة → تبويب Assistant → الاسم + الباسورد",
  });
}
