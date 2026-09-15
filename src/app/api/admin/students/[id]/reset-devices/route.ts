import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { isTeacherLike, actingTeacherId } from "@/lib/teacher-scope";
import { prisma } from "@/lib/prisma";
import { isAdminRole, hasPermission } from "@/lib/rbac";
import { logAdminAction } from "@/lib/admin-auth";
import { invalidateUserSessionCache } from "@/lib/cache";

/**
 * Clears a student's registered devices so they can sign in from a new device
 * (e.g. changed phone). Allowed for superadmin, admin with permission,
 * or a teacher who has the student enrolled in one of their courses.
 */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "غير مصرح" }, { status: 401 });

  const { id: studentId } = await params;

  const student = await prisma.user.findUnique({
    where: { id: studentId },
    select: { name: true }
  });
  if (!student) return NextResponse.json({ error: "الطالب غير موجود" }, { status: 404 });

  let allowed = false;
  if (isTeacherLike(session.role)) {
    const enrolled = await prisma.accessCode.findFirst({
      where: { studentId, course: { teacherId: actingTeacherId(session) } },
      select: { id: true },
    });
    allowed = !!enrolled;
  } else if (session.role === "superadmin") {
    allowed = true;
  } else if (isAdminRole(session.role)) {
    allowed = hasPermission(session.role, "reset_student_devices");
  }

  if (!allowed) return NextResponse.json({ error: "غير مصرح" }, { status: 403 });

  // Delete registered devices and revoke active JWT sessions globally
  const [deleteResult] = await prisma.$transaction([
    prisma.device.deleteMany({ where: { userId: studentId } }),
    prisma.user.update({
      where: { id: studentId },
      data: ({ tokenVersion: { increment: 1 } } as any),
    }),
  ]);
  invalidateUserSessionCache(studentId);

  try {
    await logAdminAction({
      adminId: session.id,
      adminName: session.name,
      action: "RESET_STUDENT_DEVICES",
      targetType: "STUDENT",
      targetId: studentId,
      targetName: student.name,
    });
  } catch (err) {
    console.error("Failed to log admin action for device reset:", err);
  }

  return NextResponse.json({ success: true, cleared: deleteResult.count });
}
