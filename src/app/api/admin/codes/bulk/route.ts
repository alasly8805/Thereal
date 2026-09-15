import { logAdminAction } from "@/lib/admin-auth";
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { isTeacherLike, actingTeacherId, hasAssistantPermission } from "@/lib/teacher-scope";
import { prisma } from "@/lib/prisma";
import crypto from "crypto";

const MAX_BULK = 200;

function generateCode(prefix?: string): string {
  const hex = crypto.randomBytes(4).toString("hex").toUpperCase();
  return prefix ? `${prefix.toUpperCase()}-${hex}` : hex;
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

    const body = await req.json();
    const { courseId, planId, prefix, format } = body as {
      courseId?: string;
      planId?: string;
      count?: number;
      prefix?: string;
      format?: string;
    };
    const count = Math.min(Math.max(1, Math.floor(Number(body.count) || 1)), MAX_BULK);

    const cleanPrefix = prefix ? String(prefix).trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 10) : undefined;

    // Plan bulk codes
    if (planId) {
      const plan = await prisma.plan.findUnique({
        where: { id: planId },
        select: { id: true, title: true },
      });
      if (!plan) return NextResponse.json({ error: "الخطة غير موجودة" }, { status: 404 });

      const codes: string[] = [];
      const maxAttempts = count * 3;
      let attempts = 0;
      while (codes.length < count && attempts < maxAttempts) {
        attempts++;
        const code = generateCode(cleanPrefix);
        if (!codes.includes(code)) {
          const exists = await prisma.planAccessCode.findUnique({ where: { code }, select: { id: true } });
          if (!exists) codes.push(code);
        }
      }

      if (codes.length < count) {
        return NextResponse.json({ error: `تعذر إنشاء ${count} كود فريد — حاول بعدد أقل أو بادئة مختلفة` }, { status: 409 });
      }

      const created = await prisma.$transaction(
        codes.map((code) => prisma.planAccessCode.create({ data: { code, planId } }))
      );

      if (format === "csv") {
        const csvHeader = "code,planId,planTitle,createdAt";
        const csvRows = created.map(
          (c) => `${c.code},${c.planId},"${plan.title.replace(/"/g, '""')}",${c.createdAt.toISOString()}`
        );
        const csvContent = [csvHeader, ...csvRows].join("\n");
        const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);

        return new NextResponse(csvContent, {
          status: 200,
          headers: {
            "Content-Type": "text/csv; charset=utf-8",
            "Content-Disposition": `attachment; filename="plan-codes-${planId}-${timestamp}.csv"`,
          },
        });
      }

      return NextResponse.json({ codes: created, count: created.length }, { status: 201 });
    }

    // Course bulk codes
    if (!courseId) {
      return NextResponse.json({ error: "courseId أو planId مطلوب" }, { status: 400 });
    }

    const courseWhere = session.role === "superadmin" ? { id: courseId } : { id: courseId, teacherId: actingTeacherId(session) };
    const course = await prisma.course.findFirst({
      where: courseWhere,
      select: { id: true, title: true },
    });
    if (!course) {
      return NextResponse.json({ error: "الكورس غير موجود" }, { status: 404 });
    }

    const codes: string[] = [];
    const maxAttempts = count * 3;
    let attempts = 0;
    while (codes.length < count && attempts < maxAttempts) {
      attempts++;
      const code = generateCode(cleanPrefix);
      if (!codes.includes(code)) {
        const exists = await prisma.accessCode.findUnique({ where: { code }, select: { id: true } });
        if (!exists) codes.push(code);
      }
    }

    if (codes.length < count) {
      return NextResponse.json({ error: `تعذر إنشاء ${count} كود فريد — حاول بعدد أقل أو بادئة مختلفة` }, { status: 409 });
    }

    const created = await prisma.$transaction(
      codes.map((code) => prisma.accessCode.create({ data: { code, courseId } }))
    );

    if (format === "csv") {
      const csvHeader = "code,courseId,courseTitle,createdAt";
      const csvRows = created.map(
        (c) => `${c.code},${c.courseId},"${course.title.replace(/"/g, '""')}",${c.createdAt.toISOString()}`
      );
      const csvContent = [csvHeader, ...csvRows].join("\n");
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);

      return new NextResponse(csvContent, {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="codes-${courseId}-${timestamp}.csv"`,
        },
      });
    }

    return NextResponse.json({ codes: created, count: created.length }, { status: 201 });
  } catch (error) {
    console.error("[admin/codes/bulk] error:", error);
    return NextResponse.json({ error: "حدث خطأ داخلي" }, { status: 500 });
  }
}
