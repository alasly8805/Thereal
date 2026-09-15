import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { isTeacherLike, actingTeacherId, hasAssistantPermission } from "@/lib/teacher-scope";
import { prisma } from "@/lib/prisma";
import { summarizeAnswers } from "@/lib/quiz-grading";
import { safeParse, type EssayFeedback } from "@/lib/essay-ai-core";
import { officialSource } from "@/lib/essay-ai-grading";

/**
 * GET — one student's full answer sheet for a quiz attempt.
 *
 * Used by the teacher / assistant "عرض الإجابات" modal: every MCQ answer with
 * the chosen and correct option, and every essay answer with its grading
 * status and the teacher's reply. Essays are graded through
 * /api/admin/teacher/quiz-essay-responses (PATCH).
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession();
    if (!session || (!isTeacherLike(session.role) && session.role !== "superadmin")) {
      return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
    }
    if (isTeacherLike(session.role) && !hasAssistantPermission(session, "viewQuizResults")) {
      return NextResponse.json({ error: "المدرّس لم يمنحك صلاحية نتائج الاختبارات" }, { status: 403 });
    }

    const { id: resultId } = await params;

    const result = await prisma.quizResult.findUnique({
      where: { id: resultId },
      include: {
        student: { select: { id: true, name: true, email: true, phone: true, accountMode: true } },
        quiz: {
          select: {
            id: true,
            title: true,
            folder: {
              select: {
                name: true,
                courseId: true,
                course: { select: { title: true, teacherId: true } },
              },
            },
          },
        },
        answers: {
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            questionId: true,
            questionType: true,
            question: true,
            imageUrl: true,
            optionA: true,
            optionB: true,
            optionC: true,
            optionD: true,
            selectedAnswer: true,
            essayAnswer: true,
            correctAnswer: true,
            isCorrect: true,
            status: true,
            teacherReply: true,
            reviewedAt: true,
            aiGrade: {
              select: {
                status: true,
                skipReason: true,
                attempts: true,
                lastError: true,
                score: true,
                maxPoints: true,
                verdict: true,
                confidence: true,
                needsReview: true,
                feedback: true,
                model: true,
                mode: true,
                appliedAt: true,
                updatedAt: true,
              },
            },
          },
        },
      },
    });

    if (!result) {
      return NextResponse.json({ error: "النتيجة غير موجودة" }, { status: 404 });
    }

    if (isTeacherLike(session.role)) {
      if (result.student.accountMode === "TESTER") {
        return NextResponse.json({ error: "النتيجة غير موجودة" }, { status: 404 });
      }
      const ownerId = result.quiz.folder?.course?.teacherId;
      if (!ownerId || ownerId !== actingTeacherId(session)) {
        return NextResponse.json({ error: "ليست لديك صلاحية" }, { status: 403 });
      }
    }

    // Keep the sheet in the quiz's question order (answers are created in
    // that order, but be explicit in case rows were rewritten on a retake).
    const questionOrder = await prisma.quizQuestion.findMany({
      where: { quizId: result.quizId },
      select: { id: true, order: true },
    });
    const orderMap = new Map(questionOrder.map((q) => [q.id, q.order]));
    const answers = [...result.answers]
      .sort((a, b) => (orderMap.get(a.questionId) ?? 0) - (orderMap.get(b.questionId) ?? 0))
      .map(({ aiGrade, ...a }) => ({
        ...a,
        // Advisory AI evaluation (teacher-only view). `appliedByAI` is true while
        // the official verdict is still the one the AI set in "auto" mode.
        aiGrade: aiGrade
          ? {
              ...aiGrade,
              feedback: safeParse<EssayFeedback>(aiGrade.feedback),
              appliedByAI: officialSource(a, aiGrade) === "AI",
            }
          : null,
      }));

    const summary = summarizeAnswers(result.answers, result.totalQ);

    return NextResponse.json({
      result: {
        id: result.id,
        score: result.score,
        totalQ: result.totalQ,
        completedAt: result.completedAt,
        allowRetake: result.allowRetake,
        student: {
          id: result.student.id,
          name: result.student.name,
          email: result.student.email,
          phone: hasAssistantPermission(session, "viewStudentPhones") ? result.student.phone : null,
        },
        quiz: {
          id: result.quiz.id,
          title: result.quiz.title,
          folderName: result.quiz.folder?.name ?? "اختبار خطة",
          courseId: result.quiz.folder?.courseId ?? "",
          courseTitle: result.quiz.folder?.course?.title ?? "خطة دراسية",
        },
        ...summary,
      },
      answers,
    });
  } catch (error) {
    console.error("[admin/quiz-results/[id]] error:", error);
    return NextResponse.json({ error: "حدث خطأ داخلي" }, { status: 500 });
  }
}
