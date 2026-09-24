import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { invalidateUserSessionCache } from "@/lib/cache";
import { requireTeacherContext } from "@/lib/teacher-scope-server";
import {
  applyAssistantPermissionPatch,
  generateAssistantPassword,
  parseAssistantPermissions,
} from "@/lib/teacher-scope";

async function loadOwnedAssistant(teacherId: string, assistantId: string) {
  return prisma.user.findFirst({
    where: {
      id: assistantId,
      role: "assistant",
      assistantOfTeacherId: teacherId,
      isDeleted: false,
    },
  });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const gate = await requireTeacherContext();
  if (!gate.ok) return gate.response;
  if (gate.ctx.isAssistant) {
    return NextResponse.json({ error: "غير مصرح" }, { status: 403 });
  }

  const { id } = await params;
  const assistant = await loadOwnedAssistant(gate.ctx.teacherId, id);
  if (!assistant) {
    return NextResponse.json({ error: "المساعد غير موجود" }, { status: 404 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    action?: string;
    permissions?: unknown;
    isActive?: boolean;
    canViewStudents?: boolean;
  };

  if (body.action === "reset_password") {
    const plainPassword = generateAssistantPassword();
    const passwordHash = await bcrypt.hash(plainPassword, 10);
    await prisma.user.update({
      where: { id: assistant.id },
      data: { password: passwordHash, tokenVersion: { increment: 1 } },
    });
    invalidateUserSessionCache(assistant.id);
    return NextResponse.json({
      success: true,
      password: plainPassword,
      message: "باسورد جديد — انسخه ودّيه للمساعد. الجلسات القديمة اتقفلت.",
    });
  }

  const data: Record<string, unknown> = {};
  if (typeof body.isActive === "boolean") {
    data.isActive = body.isActive;
    if (!body.isActive) data.tokenVersion = { increment: 1 };
  }
  if (body.permissions || typeof body.canViewStudents === "boolean") {
    const current = parseAssistantPermissions(assistant.assistantPermissions, assistant.canViewStudents);
    const permissions = applyAssistantPermissionPatch(current, {
      ...(body.permissions && typeof body.permissions === "object" ? body.permissions : {}),
      ...(typeof body.canViewStudents === "boolean" ? { canViewStudents: body.canViewStudents } : {}),
    });
    data.assistantPermissions = JSON.stringify(permissions);
    data.canViewStudents = permissions.canViewStudents;
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "لا يوجد تعديل" }, { status: 400 });
  }

  const updated = await prisma.user.update({
    where: { id: assistant.id },
    data,
    select: {
      id: true,
      name: true,
      isActive: true,
      assistantPermissions: true,
      canViewStudents: true,
      lastLoginAt: true,
      createdAt: true,
    },
  });
  invalidateUserSessionCache(assistant.id);

  return NextResponse.json({
    success: true,
    assistant: {
      ...updated,
      permissions: parseAssistantPermissions(updated.assistantPermissions, updated.canViewStudents),
    },
  });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const gate = await requireTeacherContext();
  if (!gate.ok) return gate.response;
  if (gate.ctx.isAssistant) {
    return NextResponse.json({ error: "غير مصرح" }, { status: 403 });
  }

  const { id } = await params;
  const assistant = await loadOwnedAssistant(gate.ctx.teacherId, id);
  if (!assistant) {
    return NextResponse.json({ error: "المساعد غير موجود" }, { status: 404 });
  }

  await prisma.user.update({
    where: { id: assistant.id },
    data: {
      isDeleted: true,
      isActive: false,
      deletedAt: new Date(),
      tokenVersion: { increment: 1 },
      name: `${assistant.name} (محذوف)`,
      email: `deleted.${assistant.id}@assistant.code-up.local`,
    },
  });
  invalidateUserSessionCache(assistant.id);

  return NextResponse.json({ success: true });
}
