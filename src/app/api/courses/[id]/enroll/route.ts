import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { randomBytes } from "crypto";
import { isCenterRequest, isCourseOnSite } from "@/lib/center-mode";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "يجب تسجيل الدخول أولاً" }, { status: 401 });
    }
    if (session.role === "staff") {
      return NextResponse.json(
        { error: "حساب الموظف لا يمكنه التسجيل في الكورسات — هذا الإجراء مخصص للمتعلمين والمعلمين." },
        { status: 403 }
      );
    }

    const { id: courseId } = await params;

    const course = await prisma.course.findUnique({
      where: { id: courseId },
      select: { id: true, isPaid: true, price: true, discountPercent: true, discountExpiresAt: true, deliveryMode: true },
    });
    if (!course) return NextResponse.json({ error: "الكورس غير موجود" }, { status: 404 });

    // Don't let an online visitor enrol in a centre-only course (or vice versa).
    if (!isCourseOnSite(course.deliveryMode, isCenterRequest(req))) {
      return NextResponse.json({ error: "هذا الكورس غير متاح على هذه المنصة" }, { status: 404 });
    }

    const now = new Date();
    const discountActive =
      course.discountPercent != null &&
      course.discountPercent > 0 &&
      (course.discountExpiresAt == null || course.discountExpiresAt > now);
    const effectivelyFree = !course.isPaid || (discountActive && course.discountPercent === 100);

    if (!effectivelyFree) {
      return NextResponse.json({ error: "هذا الكورس مدفوع — استخدم كود الوصول" }, { status: 400 });
    }

    const existing = await prisma.accessCode.findFirst({
      where: { courseId, studentId: session.id },
    });
    if (existing) {
      return NextResponse.json({ message: "أنت مسجّل في هذا الكورس مسبقاً" });
    }

    const randomPart = randomBytes(4).toString("hex").toUpperCase();
    const code = `FREE-${Date.now().toString(36).toUpperCase()}-${randomPart}`;

    await prisma.accessCode.create({
      data: { code, courseId, studentId: session.id, isActive: true },
    });

    return NextResponse.json({ message: "تم التسجيل بنجاح" });
  } catch (error) {
    console.error("Enroll API error:", error);
    return NextResponse.json({ error: "حدث خطأ أثناء التسجيل" }, { status: 500 });
  }
}
