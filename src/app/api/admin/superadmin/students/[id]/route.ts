import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { verifyRoleActionPassword, logAdminAction, LOG_ACTIONS } from "@/lib/admin-auth";
import { hasPermission } from "@/lib/rbac";
import { getStudentMaxDevices } from "@/lib/settings";
import { invalidateUserSessionCache } from "@/lib/cache";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session || !hasPermission(session.role, "view_students")) {
    return NextResponse.json({ error: "غير مصرح" }, { status: 403 });
  }

  try {
    const { id } = await params;

    const student = await prisma.user.findFirst({
      where: { id, role: "student" },
      select: {
        id: true,
        name: true,
        email: true,
        points: true,
        age: true,
        phone: true,
        parentPhone: true,
        educationalStage: true,
        isActive: true,
        profileCompleted: true,
        createdAt: true,
        lastLoginAt: true,
        accessCodes: {
          select: {
            id: true,
            isActive: true,
            usedAt: true,
            course: {
              select: {
                id: true,
                title: true,
                subject: true,
                educationalStage: true,
                teacher: { select: { id: true, name: true } },
              },
            },
          },
          orderBy: { usedAt: "desc" },
        },
        studentSubscriptions: {
          select: {
            id: true,
            planType: true,
            planLabel: true,
            amount: true,
            paymentSource: true,
            paymentRef: true,
            status: true,
            createdAt: true,
            expiresAt: true,
            teacher: {
              select: {
                id: true,
                name: true,
              },
            },
          },
          orderBy: { createdAt: "desc" },
        },
      },
    });

    if (!student) {
      return NextResponse.json({ error: "المتعلم غير موجود" }, { status: 404 });
    }

    const [rawQuizResults, watchedCount, devices, maxDevices] = await Promise.all([
      prisma.quizResult.findMany({
        where: { studentId: id },
        select: {
          id: true,
          score: true,
          totalQ: true,
          completedAt: true,
          // Essay answers stay PENDING until a teacher grades them; while any
          // are pending the stored score is partial, not a final grade.
          answers: { where: { status: "PENDING" }, select: { id: true } },
          quiz: {
            select: {
              id: true,
              title: true,
              folder: {
                select: {
                  course: { select: { id: true, title: true } },
                },
              },
            },
          },
        },
        orderBy: { completedAt: "desc" },
      }),
      prisma.progress.count({ where: { studentId: id, watched: true } }),
      prisma.device.findMany({
        where: { userId: id },
        select: { id: true, label: true, lastSeenAt: true, ipAddress: true },
        orderBy: { lastSeenAt: "desc" },
      }),
      getStudentMaxDevices(),
    ]);

    const quizResults = rawQuizResults.map(({ answers, ...r }) => ({
      ...r,
      pendingEssays: answers.length,
      gradingStatus: answers.length > 0 ? ("PENDING" as const) : ("GRADED" as const),
    }));

    return NextResponse.json({ student, quizResults, watchedCount, devices, maxDevices });
  } catch (error) {
    console.error("Superadmin student detail error:", error);
    return NextResponse.json({ error: "تعذر جلب بيانات المتعلم" }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();

    if (session && session.role === "superadmin") {
      try {
        await logAdminAction({
          adminId: session.id,
          adminName: session.name,
          action: "SUPERADMIN_ACTION",
          targetType: "API_ROUTE",
          targetId: req.nextUrl ? req.nextUrl.pathname : req.url,
          targetName: req.method,
        });
      } catch (e) {}
    }
  if (!session || !hasPermission(session.role, "suspend_student")) {
    return NextResponse.json({ error: "غير مصرح" }, { status: 403 });
  }

  try {
    const { id } = await params;
    const body = (await req.json()) as { actionPassword?: string; isActive?: boolean };

    if (!verifyRoleActionPassword(session.role, body.actionPassword ?? "")) {
      return NextResponse.json({ error: "كلمة المرور غير صحيحة" }, { status: 401 });
    }

    if (typeof body.isActive !== "boolean") {
      return NextResponse.json({ error: "قيمة isActive مطلوبة" }, { status: 400 });
    }

    const student = await prisma.user.findFirst({
      where: { id, role: "student", isDeleted: false },
      select: { id: true, name: true },
    });

    if (!student) {
      return NextResponse.json({ error: "المتعلم غير موجود" }, { status: 404 });
    }

    await prisma.user.update({
      where: { id },
      data: {
        isActive: body.isActive,
        ...(body.isActive === false ? { tokenVersion: { increment: 1 } } : {}),
      } as any,
    });
    invalidateUserSessionCache(id);

    await logAdminAction({
      adminId: session.id,
      adminName: session.name,
      action: body.isActive ? LOG_ACTIONS.UNSUSPEND_STUDENT : LOG_ACTIONS.SUSPEND_STUDENT,
      targetType: "student",
      targetId: id,
      targetName: student.name,
    });

    return NextResponse.json({ success: true, isActive: body.isActive });
  } catch (error) {
    console.error("Superadmin student PATCH error:", error);
    return NextResponse.json({ error: "تعذر تعديل حالة المتعلم" }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();

    if (session && session.role === "superadmin") {
      try {
        await logAdminAction({
          adminId: session.id,
          adminName: session.name,
          action: "SUPERADMIN_ACTION",
          targetType: "API_ROUTE",
          targetId: req.nextUrl ? req.nextUrl.pathname : req.url,
          targetName: req.method,
        });
      } catch (e) {}
    }
  const body = (await req.json().catch(() => ({}))) as {
    actionPassword?: string;
    permanent?: boolean;
  };

  const isPermanent = body.permanent === true;
  const requiredPerm = isPermanent ? "hard_delete_student" : "soft_delete_student";

  if (!session || !hasPermission(session.role, requiredPerm)) {
    return NextResponse.json({ error: "غير مصرح" }, { status: 403 });
  }

  try {
    const { id } = await params;

    if (!verifyRoleActionPassword(session.role, body.actionPassword ?? "")) {
      return NextResponse.json({ error: "كلمة المرور غير صحيحة" }, { status: 401 });
    }

    const whereClause = isPermanent
      ? { id, role: "student", isDeleted: true }
      : { id, role: "student", isDeleted: false };

    const student = await prisma.user.findFirst({
      where: whereClause,
      select: { id: true, name: true },
    });

    if (!student) {
      return NextResponse.json({ error: "المتعلم غير موجود" }, { status: 404 });
    }

    if (isPermanent) {
      await prisma.user.delete({ where: { id } });
    } else {
      await prisma.user.update({
        where: { id },
        data: {
          isDeleted: true,
          deletedAt: new Date(),
          isActive: false,
          tokenVersion: { increment: 1 },
        } as any,
      });
    }
    invalidateUserSessionCache(id);

    await logAdminAction({
      adminId: session.id,
      adminName: session.name,
      action: isPermanent ? LOG_ACTIONS.HARD_DELETE_STUDENT : LOG_ACTIONS.SOFT_DELETE_STUDENT,
      targetType: "student",
      targetId: id,
      targetName: student.name,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Superadmin student DELETE error:", error);
    return NextResponse.json({ error: "تعذر حذف المتعلم" }, { status: 500 });
  }
}
