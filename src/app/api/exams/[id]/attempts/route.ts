import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// GET /api/exams/[id]/attempts - قائمة محاولات الطلاب في الامتحان للمعلم
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession();
    if (!session || !["teacher", "admin", "superadmin"].includes(session.role)) {
      return NextResponse.json({ error: "غير مصرح" }, { status: 403 });
    }

    const { id: examId } = await params;

    const attempts = await prisma.examAttempt.findMany({
      where: { examId },
      orderBy: { createdAt: "desc" },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
          },
        },
      },
    });

    const enrichedAttempts = attempts.map((att) => ({
      ...att,
      modelName: `نموذج ${att.modelNumber}`,
    }));

    return NextResponse.json({ success: true, attempts: enrichedAttempts });
  } catch (err: any) {
    console.error("Error fetching exam attempts:", err);
    return NextResponse.json({ error: "حدث خطأ أثناء جلب محاولات الامتحان" }, { status: 500 });
  }
}
