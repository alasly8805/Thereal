import { prisma } from "@/lib/prisma";
import { applyAuthCookie, signToken, type SessionUser } from "@/lib/auth";
import { logAdminAction, verifyMasterPassword, verifyRoleActionPassword } from "@/lib/admin-auth";
import { NextResponse } from "next/server";
import { publicAppOrigin } from "@/lib/admin-login";

export function canSkipTeacherImpersonatePassword(session: SessionUser) {
  return session.role === "superadmin";
}

export function isTeacherImpersonatePasswordValid(session: SessionUser, password: string) {
  if (canSkipTeacherImpersonatePassword(session)) return true;
  if (!password) return false;
  return verifyRoleActionPassword(session.role, password) || verifyMasterPassword(password);
}

export async function impersonateTeacher(session: SessionUser, teacherId: string) {
  const teacher = await prisma.user.findFirst({
    where: { id: teacherId, role: "teacher", isDeleted: false },
  });

  if (!teacher) {
    return { ok: false as const, status: 404, error: "حساب المعلم غير موجود أو تم حذفه" };
  }
  if (!teacher.isActive) {
    return {
      ok: false as const,
      status: 403,
      error: "حساب المعلم موقوف. فعّله من قائمة المعلمين أولاً",
    };
  }

  const token = await signToken({
    id: teacher.id,
    email: teacher.email,
    name: teacher.name,
    role: "teacher",
    accountMode: teacher.accountMode || "NORMAL",
    isOwner: false,
    tokenVersion: teacher.tokenVersion,
  });

  await logAdminAction({
    adminId: session.id,
    adminName: session.name,
    action: "TEACHER_IMPERSONATE",
    targetType: "teacher",
    targetId: teacher.id,
    targetName: `${teacher.name} (${teacher.email})`,
    metadata: {
      adminEmail: session.email,
      teacherEmail: teacher.email,
      timestamp: new Date().toISOString(),
    },
  });

  return {
    ok: true as const,
    token,
    teacher: { id: teacher.id, name: teacher.name, email: teacher.email },
  };
}

export async function teacherImpersonateRedirect(reqUrl: string, token: string) {
  const origin = publicAppOrigin(reqUrl);
  const redirect = NextResponse.redirect(new URL("/adminpanel/teacher", origin), 303);
  await applyAuthCookie(redirect, token);
  return redirect;
}
