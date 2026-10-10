import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getStudentSession } from "@/lib/auth";

const ID_MAX_LEN = 100;

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;

    // Guard against oversized IDs before DB work
    if (!id || id.length > ID_MAX_LEN) {
      return NextResponse.json({ error: "الخطة غير موجودة" }, { status: 404 });
    }

    const session = await getStudentSession();

    const plan = await prisma.plan.findUnique({
      where: { id },
      include: {
        lessons: {
          orderBy: { order: "asc" },
        },
      },
    });

    if (!plan) {
      return NextResponse.json({ error: "الخطة غير موجودة" }, { status: 404 });
    }

    let hasAccess = false;
    if (session) {
      const enrollment = await prisma.planEnrollment.findUnique({
        where: { planId_studentId: { planId: id, studentId: session.id } },
      });
      hasAccess = !!enrollment;
    }

    // Effective price
    let effectivePrice = plan.price;
    if (plan.discountPrice !== null && plan.discountExpiresAt && new Date(plan.discountExpiresAt) > new Date()) {
      effectivePrice = plan.discountPrice;
    }

    return NextResponse.json({
      success: true,
      plan: {
        id: plan.id,
        title: plan.title,
        educationalStage: plan.educationalStage,
        description: plan.description,
        price: plan.price,
        discountPrice: plan.discountPrice,
        discountExpiresAt: plan.discountExpiresAt,
        effectivePrice,
        totalLessons: plan.lessons.length,
        lessons: plan.lessons,
        hasAccess,
      },
    });
  } catch (error) {
    console.error("Plan API error:", error);
    return NextResponse.json({ error: "حدث خطأ داخلي" }, { status: 500 });
  }
}
