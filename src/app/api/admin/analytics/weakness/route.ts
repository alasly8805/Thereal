import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { isTeacherLike, actingTeacherId } from "@/lib/teacher-scope";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  try {
  const session = await getSession();
  if (!session || !isTeacherLike(session.role)) {
    return NextResponse.json({ error: "غير مصرح" }, { status: 403 });
  }

  const teacherId = session.id;

  // Fetch all quiz results for courses taught by this teacher
  const quizResults = await prisma.quizResult.findMany({
    where: {
      quiz: {
        folder: {
          course: {
            teacherId: teacherId,
          },
        },
      },
    },
    select: {
      score: true,
      quiz: {
        select: {
          title: true,
          folder: {
            select: {
              course: {
                select: {
                  subject: true,
                  title: true,
                },
              },
            },
          },
        },
      },
    },
  });

  // Group by subject to build the heatmap data
  type SubjectAgg = { subject: string; sum: number; count: number; minScore: number; maxScore: number };
  const subjectMap = new Map<string, SubjectAgg>();

  for (const q of quizResults) {
    const subject = q.quiz?.folder?.course?.subject?.trim() || "عام";
    let agg = subjectMap.get(subject);
    if (!agg) {
      agg = { subject, sum: 0, count: 0, minScore: 100, maxScore: 0 };
      subjectMap.set(subject, agg);
    }
    agg.sum += q.score;
    agg.count += 1;
    if (q.score < agg.minScore) agg.minScore = q.score;
    if (q.score > agg.maxScore) agg.maxScore = q.score;
  }

  const heatmap = [...subjectMap.values()].map((a) => ({
    subject: a.subject,
    avgScore: Math.round(a.sum / a.count),
    quizCount: a.count,
    minScore: a.minScore === 100 && a.count === 0 ? 0 : a.minScore,
    maxScore: a.maxScore,
  })).sort((a, b) => a.avgScore - b.avgScore);

  return NextResponse.json({ heatmap });
} catch (error) {
    console.error("[admin/analytics/weakness] error:", error);
    return NextResponse.json(
      { error: "حدث خطأ داخلي" },
      { status: 500 }
    );
  }
}
