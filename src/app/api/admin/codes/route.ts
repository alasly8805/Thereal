import { logAdminAction } from "@/lib/admin-auth";
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { isTeacherLike, actingTeacherId, hasAssistantPermission, maskPhone } from "@/lib/teacher-scope";
import { prisma } from "@/lib/prisma";
import crypto from "crypto";

export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session || (!isTeacherLike(session.role) && session.role !== "superadmin")) {
      return NextResponse.json({ error: "غير مصرح" }, { status: 403 });
    }
    if (
      isTeacherLike(session.role) &&
      !hasAssistantPermission(session, "manageCodes") &&
      !hasAssistantPermission(session, "viewStudents")
    ) {
      return NextResponse.json({ error: "المدرّس لم يمنحك صلاحية الأكواد أو الطلاب" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const courseId = searchParams.get("courseId");
    const planId = searchParams.get("planId");

    if (planId) {
      if (isTeacherLike(session.role)) {
        const plan = await prisma.plan.findUnique({
          where: { id: planId },
          select: { createdById: true },
        });
        if (!plan || plan.createdById !== actingTeacherId(session)) {
          return NextResponse.json({ error: "غير مصرح لك بإدارة هذه الخطة" }, { status: 403 });
        }
      }

      const codes = await prisma.planAccessCode.findMany({
        where: { planId },
        orderBy: { createdAt: "desc" },
      });
      return NextResponse.json({ codes });
    }

    if (!courseId) return NextResponse.json({ error: "courseId أو planId مطلوب" }, { status: 400 });

    if (isTeacherLike(session.role)) {
      const course = await prisma.course.findFirst({
        where: { id: courseId, teacherId: actingTeacherId(session) },
        select: { id: true },
      });
      if (!course) {
        return NextResponse.json({ error: "الكورس غير موجود أو غير مصرح لك بإدارته" }, { status: 403 });
      }
    }

    const courseWhere: Record<string, unknown> = { courseId };
    if (isTeacherLike(session.role)) {
      courseWhere.OR = [
        { studentId: null },
        { student: { accountMode: { not: "TESTER" } } },
      ];
    }

    const codes = await prisma.accessCode.findMany({
      where: courseWhere,
      include: { student: { select: { id: true, name: true, email: true, phone: true } } },
      orderBy: { createdAt: "desc" },
    });

    const canSeePhones = hasAssistantPermission(session, "viewStudentPhones");
    return NextResponse.json({
      codes: codes.map((c) => ({
        ...c,
        student: c.student
          ? { ...c.student, phone: canSeePhones ? c.student.phone : maskPhone(c.student.phone) }
          : null,
      })),
    });
  } catch (error) {
    console.error("[admin/codes] error:", error);
    return NextResponse.json({ error: "حدث خطأ داخلي" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
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
    if (!session || (!isTeacherLike(session.role) && session.role !== "superadmin")) {
      return NextResponse.json({ error: "غير مصرح" }, { status: 403 });
    }
    if (isTeacherLike(session.role) && !hasAssistantPermission(session, "manageCodes")) {
      return NextResponse.json({ error: "المدرّس لم يمنحك صلاحية أكواد الوصول" }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const { courseId, planId, prefix } = body;
    const count = Math.min(Math.max(1, Math.floor(Number(body.count) || 1)), 200);

    const cleanPrefix = prefix ? String(prefix).trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 10) : "";

    // Handle Plan Codes (B31: check teacher ownership)
    if (planId) {
      const plan = await prisma.plan.findUnique({ where: { id: planId } });
      if (!plan) return NextResponse.json({ error: "الخطة غير موجودة" }, { status: 404 });

      if (isTeacherLike(session.role) && plan.createdById !== actingTeacherId(session)) {
        return NextResponse.json({ error: "غير مصرح لك بإنشاء أكواد لهذه الخطة" }, { status: 403 });
      }

      const createdCodes: any[] = [];
      for (let i = 0; i < count; i++) {
        let code = "";
        let exists = true;
        let attempts = 0;
        while (exists && attempts < 20) {
          attempts++;
          const hex = crypto.randomBytes(4).toString("hex").toUpperCase();
          code = cleanPrefix ? `${cleanPrefix}-${hex}` : hex;
          if (!createdCodes.some((c) => c.code === code)) {
            const dbExists = await prisma.planAccessCode.findUnique({ where: { code }, select: { id: true } });
            if (!dbExists) exists = false;
          }
        }
        if (exists) return NextResponse.json({ error: "تعذر إنشاء كود فريد — حاول مجدداً" }, { status: 409 });

        const created = await prisma.planAccessCode.create({
          data: { code, planId },
        });
        createdCodes.push(created);
      }

      return NextResponse.json({ codes: createdCodes }, { status: 201 });
    }

    // Handle Course Codes (B26: check teacher ownership)
    if (!courseId) return NextResponse.json({ error: "courseId أو planId مطلوب" }, { status: 400 });

    const courseWhere = session.role === "superadmin" ? { id: courseId } : { id: courseId, teacherId: actingTeacherId(session) };
    const course = await prisma.course.findFirst({ where: courseWhere });
    if (!course) return NextResponse.json({ error: "الكورس غير موجود أو غير مصرح لك بإدارته" }, { status: 404 });

    const accessType: "TERM" | "FOLDER" | "VIDEO" = ["TERM", "FOLDER", "VIDEO"].includes(body.accessType) ? body.accessType : "TERM";
    const folderId: string | null = body.folderId || null;
    const videoId: string | null = body.videoId || null;

    const createdCodes: any[] = [];
    for (let i = 0; i < count; i++) {
      let code = "";
      let exists = true;
      let attempts = 0;
      while (exists && attempts < 20) {
        attempts++;
        const hex = crypto.randomBytes(4).toString("hex").toUpperCase();
        code = cleanPrefix ? `${cleanPrefix}-${hex}` : hex;
        if (!createdCodes.some((c) => c.code === code)) {
          const dbExists = await prisma.accessCode.findUnique({ where: { code }, select: { id: true } });
          if (!dbExists) exists = false;
        }
      }
      if (exists) return NextResponse.json({ error: "تعذر إنشاء كود فريد — حاول مجدداً" }, { status: 409 });

      const created = await prisma.accessCode.create({
        data: {
          code,
          courseId,
          accessType,
          folderId: accessType === "FOLDER" ? folderId : null,
          videoId: accessType === "VIDEO" ? videoId : null,
        },
      });
      createdCodes.push(created);
    }

    return NextResponse.json({ codes: createdCodes }, { status: 201 });
  } catch (error) {
    console.error("[admin/codes] error:", error);
    return NextResponse.json({ error: "حدث خطأ داخلي" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session || (!isTeacherLike(session.role) && session.role !== "superadmin")) {
      return NextResponse.json({ error: "غير مصرح" }, { status: 403 });
    }
    if (isTeacherLike(session.role) && !hasAssistantPermission(session, "manageCodes")) {
      return NextResponse.json({ error: "المدرّس لم يمنحك صلاحية أكواد الوصول" }, { status: 403 });
    }

    const { codeId, isActive, isPlanCode } = await req.json();

    if (isPlanCode) {
      const code = await prisma.planAccessCode.findFirst({
        where: { id: codeId },
        include: { plan: { select: { createdById: true } } },
      });
      if (!code) return NextResponse.json({ error: "الكود غير موجود" }, { status: 404 });
      if (isTeacherLike(session.role) && code.plan?.createdById !== actingTeacherId(session)) {
        return NextResponse.json({ error: "غير مصرح لك بتعديل هذا الكود" }, { status: 403 });
      }
      if (isActive === true && !!code.usedAt) {
        return NextResponse.json({ error: "لا يمكن إعادة تفعيل كود تم استخدامه من قبل" }, { status: 400 });
      }
      const updated = await prisma.planAccessCode.update({
        where: { id: codeId },
        data: { isActive },
      });
      return NextResponse.json({ code: updated });
    }

    const code = await prisma.accessCode.findFirst({
      where: { id: codeId },
      include: { course: { select: { teacherId: true } } },
    });
    if (!code) return NextResponse.json({ error: "الكود غير موجود" }, { status: 404 });

    if (isTeacherLike(session.role) && code.course?.teacherId !== actingTeacherId(session)) {
      return NextResponse.json({ error: "غير مصرح لك بتعديل هذا الكود" }, { status: 403 });
    }

    if (isActive === true && !!code.usedAt) {
      return NextResponse.json({ error: "لا يمكن إعادة تفعيل كود تم استخدامه من قبل" }, { status: 400 });
    }

    const updated = await prisma.accessCode.update({
      where: { id: codeId },
      data: { isActive },
    });
    return NextResponse.json({ code: updated });
  } catch (error) {
    console.error("[admin/codes] error:", error);
    return NextResponse.json({ error: "حدث خطأ داخلي" }, { status: 500 });
  }
}
