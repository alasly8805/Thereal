import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validateParentToken } from "@/lib/whatsapp/parentToken";
import { parentRateLimiter } from "@/lib/whatsapp/parentRateLimiter";
import { whatsappOrchestrator } from "@/lib/whatsapp/orchestrator";
import { averagePercent, examResultPercent, quizResultPercent } from "@/lib/scoring";
import { getClientIp } from "@/lib/vpn-guard";

function maskPhone(phone?: string | null): string | null {
  if (!phone || phone.trim().length < 7) return null;
  const clean = phone.trim();
  return `${clean.slice(0, 3)}****${clean.slice(-4)}`;
}

export async function GET(req: NextRequest) {
  try {
    // 1. IP Rate Limiting (30 requests/minute) using hardened client IP resolution
    const ip = getClientIp(req.headers);
    const rateCheck = parentRateLimiter.checkRateLimit(ip);

    if (!rateCheck.allowed) {
      return NextResponse.json(
        { error: `تم تجاوز حد الزيارات المسموح به. يرجى الانتظار لمدة ${rateCheck.resetInSeconds} ثانية.` },
        { status: 429 }
      );
    }

    const { searchParams } = req.nextUrl;
    const token = searchParams.get("token");

    if (!token) {
      return NextResponse.json({ success: true, stage: "DEAD" });
    }

    // 2. Validate Token
    const userAgent = req.headers.get("user-agent") || undefined;
    const parentToken = await validateParentToken(token, ip, userAgent);
    if (!parentToken || !parentToken.student) {
      return NextResponse.json({ success: true, stage: "DEAD" });
    }

    const student = parentToken.student;
    const studentId = student.id;

    // Check Feature Flag for Parent Verification Requirement
    const waConfig = await whatsappOrchestrator.getConfig();
    const requireVerification = waConfig.requireParentVerification;

    // GATE state check: If feature flag active and status is PENDING
    if (requireVerification && parentToken.status === "PENDING") {
      return NextResponse.json({
        success: true,
        stage: "GATE",
        child: {
          name: student.name,
          stage: student.educationalStage || null,
          maskedStudentPhone: maskPhone(student.phone),
        },
      });
    }

    // 3. Fetch Full Academic & Financial Report (only reached if verified or feature flag disabled)
    const quizResults = await prisma.quizResult.findMany({
      where: { studentId },
      include: {
        quiz: { select: { title: true } },
        // Essay answers awaiting teacher review — no final grade yet.
        answers: { where: { status: "PENDING" }, select: { id: true } },
      },
      orderBy: { completedAt: "desc" },
      take: 10,
    });

    const dailyExamResults = await prisma.dailyExamResult.findMany({
      where: { studentId },
      include: { exam: { select: { title: true } } },
      orderBy: { completedAt: "desc" },
      take: 10,
    });

    const homeworkSubmissions = await prisma.homeworkSubmission.findMany({
      where: { studentId },
      include: { homework: { select: { title: true } } },
      orderBy: { completedAt: "desc" },
      take: 10,
    });

    const feedbacks = await prisma.studentFeedback.findMany({
      where: { studentId },
      include: { teacher: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
      take: 5,
    });

    const subscriptions = await prisma.teacherSubscription.findMany({
      where: { studentId, status: "active" },
      include: { teacher: { select: { id: true, name: true, phone: true } } },
      orderBy: { createdAt: "desc" },
    });

    const validQuizResults = quizResults.filter((q) => typeof q.totalQ === "number" && q.totalQ > 0);
    // Results with pending essays have no final grade — they are listed as
    // "under review" but must not drag the average down as 0%.
    const gradedQuizResults = validQuizResults.filter((q) => q.answers.length === 0);
    const validExamResults = dailyExamResults.filter((e) => typeof e.totalQ === "number" && e.totalQ > 0);

    // QuizResult.score is already a percentage while DailyExamResult.score is a
    // raw correct-count, so the previous "sum scores / sum totalQ" mixed units:
    // a quiz scored 85 with 3 questions contributed 85/3 = 2833%, which made
    // every student read as ممتاز regardless of how they were actually doing.
    const overallAveragePercent = averagePercent(gradedQuizResults, validExamResults);

    let overallStatusBadge: { label: string; color: string; text: string } | null = null;
    if (overallAveragePercent !== null) {
      if (overallAveragePercent >= 85) {
        overallStatusBadge = { label: "ممتاز", color: "emerald", text: "التزام ممتاز وحضور منتظم" };
      } else if (overallAveragePercent >= 65) {
        overallStatusBadge = { label: "كويس، ومحتاج شوية تحسين", color: "amber", text: "أداء جيد ويمكن تحسينه" };
      } else {
        overallStatusBadge = { label: "محتاج متابعة", color: "rose", text: "يرجى التواصل مع معلم المادة" };
      }
    }

    const completedHomeworkCount = homeworkSubmissions.filter((h) => h.status === "GRADED" || h.status === "SUBMITTED").length;
    const pendingHomeworkCount = homeworkSubmissions.filter((h) => h.status === "PENDING").length;

    const recentExams = [
      ...validQuizResults.map((q) => {
        const pct = Math.round(quizResultPercent(q));
        const pendingEssays = q.answers.length;
        if (pendingEssays > 0) {
          return {
            title: q.quiz?.title || "اختبار تفاعلي",
            score: null,
            maxScore: 100,
            percent: null,
            status: "⏳",
            statusLabel: "يتم المراجعة",
            pendingEssays,
            date: q.completedAt.toISOString().split("T")[0],
          };
        }
        return {
          title: q.quiz?.title || "اختبار تفاعلي",
          // Reported out of 100 because the stored score is a percentage;
          // showing it out of totalQ (the question count) implied 85/3.
          score: pct,
          maxScore: 100,
          percent: pct,
          status: pct >= 85 ? "🟢" : pct >= 65 ? "🟡" : "🔴",
          date: q.completedAt.toISOString().split("T")[0],
        };
      }),
      ...validExamResults.map((e) => {
        // Correct as written — DailyExamResult.score IS a raw correct-count, so
        // dividing by totalQ is right here even though it was wrong for quizzes.
        const max = e.totalQ;
        const pct = Math.round(examResultPercent(e));
        return {
          title: e.exam?.title || "امتحان لوحة الشرف",
          score: e.score,
          maxScore: max,
          percent: pct,
          status: pct >= 85 ? "🟢" : pct >= 65 ? "🟡" : "🔴",
          date: e.completedAt.toISOString().split("T")[0],
        };
      }),
    ].slice(0, 8);

    return NextResponse.json(
      {
        success: true,
        stage: "REPORT",
        student: {
          id: student.id,
          name: student.name,
          educationalStage: student.educationalStage || null,
          points: student.points,
          parentPhone: maskPhone(student.parentPhone),
          phone: maskPhone(student.phone),
        },
        overallAveragePercent,
        overallStatusBadge,
        attendancePercent: null,
        homeworkStats: {
          completed: completedHomeworkCount,
          pending: pendingHomeworkCount,
          late: null,
        },
        recentExams,
        teacherNotes: feedbacks.map((f) => ({
          teacherName: f.teacher?.name || "المعلم",
          content: f.content,
          date: f.createdAt.toISOString().split("T")[0],
        })),
        subscriptions: subscriptions.map((sub) => ({
          id: sub.id,
          teacherName: sub.teacher?.name || "المعلم",
          teacherPhone: maskPhone(sub.teacher?.phone),
          planLabel: sub.planLabel,
          amount: sub.amount,
          createdAt: sub.createdAt.toISOString().split("T")[0],
          status: sub.status,
        })),
      },
      {
        headers: {
          "Cache-Control": "private, no-cache, no-store, must-revalidate",
        },
      }
    );
  } catch (error: unknown) {
    console.error("[parent/portal] Error:", error);
    return NextResponse.json({ error: "حدث خطأ أثناء تحميل تقرير ولي الأمر" }, { status: 500 });
  }
}
