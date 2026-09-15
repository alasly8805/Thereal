/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getConfigBool } from "@/lib/config";
import { checkQuizAccess } from "@/lib/authorization";
import { canAccessContent, ContentType } from "@/lib/content-access-engine";
import { summarizeAnswers } from "@/lib/quiz-grading";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {

      try {
      const session = await getSession();
      if (!session) return NextResponse.json({ error: "غير مصرح" }, { status: 401 });

      const { id: quizId } = await params;
      const quiz = await prisma.quiz.findUnique({
        where: { id: quizId },
        include: {
          questions: { orderBy: { order: "asc" } },
          folder: {
            select: {
              courseId: true,
              course: {
                select: { teacherId: true, title: true, subject: true },
              },
            },
          },
          planLesson: { select: { id: true, planId: true } },
        },
      });

      if (!quiz) return NextResponse.json({ error: "الاختبار غير موجود" }, { status: 404 });

      const hasAccess = await checkQuizAccess(session.id, session.role, quizId);
      if (!hasAccess) {
        return NextResponse.json({ error: "لا يوجد صلاحية للوصول" }, { status: 403 });
      }

      const isStudent = session.role === "student";

      if (isStudent) {
        const access = await canAccessContent(session.id, {
          type: ContentType.QUIZ,
          sourceId: quizId,
          title: quiz.title,
        });
        if ("requiredItem" in access) {
          return NextResponse.json(
            {
              error: `يجب إكمال «${access.requiredItem.title}» أولًا.`,
              code: access.code,
              requiredItem: access.requiredItem,
            },
            { status: 403 }
          );
        }
      }

      // One graded attempt. An in-progress start (no completedAt) can resume.
      // A submitted result is frozen unless a teacher explicitly allowed a retake.
      if (isStudent) {
        const existingResult = await prisma.quizResult.findUnique({
          where: { studentId_quizId: { studentId: session.id, quizId } },
          include: {
            answers: {
              orderBy: { createdAt: "asc" },
              select: {
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
              },
            },
          },
        });
        if (existingResult?.completedAt && !existingResult.allowRetake) {
          // The student can always review their own sheet: MCQ answers with the
          // correct option, and essay answers with the teacher's verdict once
          // graded. Pending essays are reported so the UI does not show a
          // 0% / راسب grade that has not been decided yet.
          const summary = summarizeAnswers(existingResult.answers, existingResult.totalQ);
          const order = new Map(quiz.questions.map((q: any, i: number) => [q.id, i]));
          const breakdown = [...existingResult.answers]
            .sort((a, b) => (order.get(a.questionId) ?? 0) - (order.get(b.questionId) ?? 0))
            .map((a) => ({
              questionId: a.questionId,
              questionType: a.questionType,
              question: a.question,
              imageUrl: a.imageUrl,
              optionA: a.optionA,
              optionB: a.optionB,
              optionC: a.optionC,
              optionD: a.optionD,
              yourAnswer: a.selectedAnswer,
              essayAnswer: a.essayAnswer,
              correctAnswer: a.correctAnswer,
              isCorrect: a.isCorrect,
              status: a.status,
              teacherReply: a.teacherReply,
              reviewedAt: a.reviewedAt,
            }));
          return NextResponse.json({
            alreadyCompleted: true,
            result: {
              score: existingResult.score,
              totalQ: existingResult.totalQ,
              completedAt: existingResult.completedAt,
              correct: summary.correct,
              pendingEssays: summary.pendingCount,
              gradingStatus: summary.gradingStatus,
              passed: summary.passed,
              mcqCount: summary.mcqCount,
              mcqCorrect: summary.mcqCorrect,
              essayCount: summary.essayCount,
              breakdown,
            },
            quiz: { id: quiz.id, title: quiz.title, courseId: quiz.folder?.courseId ?? 'plan', course: quiz.folder?.course },
          });
        }

        if (existingResult?.completedAt && existingResult.allowRetake) {
          const cooldownHours = (quiz as any).retakeCooldownHours ?? 0;
          if (cooldownHours > 0) {
            const cooldownMs = cooldownHours * 3_600_000;
            const elapsed = Date.now() - new Date(existingResult.completedAt).getTime();
            if (elapsed < cooldownMs) {
              return NextResponse.json({
                alreadyCompleted: true,
                cooldownRemainingMs: cooldownMs - elapsed,
                result: {
                  score: existingResult.score,
                  totalQ: existingResult.totalQ,
                  completedAt: existingResult.completedAt,
                },
                quiz: { id: quiz.id, title: quiz.title, courseId: quiz.folder?.courseId ?? 'plan', course: quiz.folder?.course },
              });
            }
          }
          // Reopen the attempt: completedAt must be cleared or the submit
          // route will treat the retake as a duplicate submission.
          await prisma.quizResult.update({
            where: { id: existingResult.id },
            data: { startedAt: new Date(), completedAt: null, allowRetake: false },
          });
        } else if (!existingResult) {
          // In-progress placeholder. completedAt stays NULL until submit.
          await prisma.quizResult.create({
            data: {
              studentId: session.id,
              quizId,
              score: 0,
              totalQ: 0,
              startedAt: new Date(),
              completedAt: null,
              allowRetake: false,
            },
          });
        } else if (!existingResult.startedAt) {
          // Legacy row without a start time (pre-dates the start/submit split):
          // give it one so the submit route accepts the attempt.
          await prisma.quizResult.update({
            where: { id: existingResult.id },
            data: { startedAt: new Date() },
          });
        }
      }

      const questions = isStudent
        ? quiz.questions.map((question: any) => {
            const { correctAnswer: _ca, ...q } = question;
            return q;
          })
        : quiz.questions;

      // The client needs to know whether the timer is real. When enforcement is
      // off it must not auto-submit at zero — the server would accept the
      // answers, but the student would have been thrown out of their own quiz.
      const timeLimitEnforced = !(await getConfigBool("quiz_time_limit_disabled"));

      return NextResponse.json({
        quiz: {
          id: quiz.id,
          title: quiz.title,
          timeLimitMinutes: (quiz as any).timeLimitMinutes,
          questions,
          folderId: quiz.folderId,
          courseId: quiz.folder?.courseId ?? 'plan',
          course: quiz.folder?.course,
        },
        timeLimitMinutes: (quiz as any).timeLimitMinutes,
        timeLimitEnforced,
      });
    } catch (error) {
        console.error("[quizzes/[id]] error:", error);
        return NextResponse.json(
          { error: "حدث خطأ داخلي" },
          { status: 500 }
        );
      }
}
