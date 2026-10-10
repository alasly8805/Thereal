import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getStudentSession } from "@/lib/auth";

// Whitelist of valid educational stage values
const VALID_STAGES = new Set([
  "primary", "preparatory", "secondary",
  "ابتدائي", "إعدادي", "ثانوي",
  "1", "2", "3", "4", "5", "6",
  "7", "8", "9", "10", "11", "12",
]);

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const stageParam = searchParams.get("stage");

    // Only pass validated stage values to Prisma
    const stage = stageParam && VALID_STAGES.has(stageParam) ? stageParam : null;

    const session = await getStudentSession();

    const where: Record<string, unknown> = { status: "published" };

    if (stage && stage !== "all") {
      where.educationalStage = stage;
    } else if (!stage && session) {
      const user = await prisma.user.findUnique({
        where: { id: session.id },
        select: { educationalStage: true },
      });
      if (user?.educationalStage) {
        where.educationalStage = user.educationalStage;
      }
    }

    let plans = await prisma.plan.findMany({
      where,
      include: { _count: { select: { lessons: true } } },
      orderBy: [{ educationalStage: "asc" }, { monthIndex: "asc" }],
    });

    // Fallback: if the user's stage returned no plans, return all published
    if (plans.length === 0 && where.educationalStage && !stage) {
      delete where.educationalStage;
      plans = await prisma.plan.findMany({
        where,
        include: { _count: { select: { lessons: true } } },
        orderBy: [{ educationalStage: "asc" }, { monthIndex: "asc" }],
      });
    }

    const now = new Date();
    const addEffectivePrice = (plan: (typeof plans)[number]) => {
      const effectivePrice =
        plan.discountPrice !== null &&
        plan.discountExpiresAt &&
        new Date(plan.discountExpiresAt) > now
          ? plan.discountPrice
          : plan.price;
      return { ...plan, effectivePrice };
    };

    if (!session) {
      const response = NextResponse.json({
        plans: plans.map((p) => ({ ...addEffectivePrice(p), hasAccess: false })),
      });
      response.headers.set("Cache-Control", "public, max-age=60, s-maxage=300, stale-while-revalidate=600");
      return response;
    }

    const enrollments = await prisma.planEnrollment.findMany({
      where: { studentId: session.id, planId: { in: plans.map((p) => p.id) } },
      select: { planId: true },
    });
    const accessMap = new Set(enrollments.map((e) => e.planId));

    const response = NextResponse.json({
      plans: plans.map((p) => ({ ...addEffectivePrice(p), hasAccess: accessMap.has(p.id) })),
    });
    response.headers.set("Cache-Control", "private, no-cache, no-store, max-age=0, must-revalidate");
    return response;
  } catch (error) {
    console.error("Plans API error:", error);
    return NextResponse.json({ error: "حدث خطأ أثناء تحميل الخطط" }, { status: 500 });
  }
}
