/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getConfigBool } from "@/lib/config";
import { checkQuizAccess } from "@/lib/authorization";
import { canAccessContent, contentDeniedPayload, ContentType } from "@/lib/content-access-engine";
import { summarizeAnswers } from "@/lib/quiz-grading";
import { parseDraftAnswers, retakeCooldownRemainingMs } from "@/lib/quiz-attempt";

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
        const denied = contentDeniedPayload(access);
        if (denied) return NextResponse.json(denied.body, { status: denied.status });
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
                degree: true,
              },
            },
          },
        });
        if (existingResult?.completedAt) {
          // Read-only review. allowRetake only unlocks the "Start new attempt"
          // button — opening this page must never clear completedAt.
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
          const cooldownRemainingMs = existingResult.allowRetake
            ? retakeCooldownRemainingMs(existingResult.completedAt, (quiz as any).retakeCooldownHours ?? 0)
            : 0;
          return NextResponse.json({
            alreadyCompleted: true,
            allowRetake: !!existingResult.allowRetake,
            cooldownRemainingMs,
            result: {
              score: existingResult.score,
              totalQ: existingResult.totalQ,
              completedAt: existingResult.completedAt,
              allowRetake: !!existingResult.allowRetake,
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

        if (!existingResult) {
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
      const limitMinutes = (quiz as any).timeLimitMinutes || 30;
      const inProgress = isStudent ? await prisma.quizResult.findUnique({
        where: { studentId_quizId: { studentId: session.id, quizId } },
        select: { startedAt: true, draftAnswers: true, completedAt: true },
      }) : null;
      const elapsedSeconds = inProgress?.startedAt
        ? Math.floor((Date.now() - inProgress.startedAt.getTime()) / 1000)
        : 0;
      const remainingSeconds = Math.max(0, limitMinutes * 60 - elapsedSeconds);

      return NextResponse.json({
        quiz: {
          id: quiz.id,
          title: quiz.title,
          timeLimitMinutes: limitMinutes,
          questions,
          folderId: quiz.folderId,
          courseId: quiz.folder?.courseId ?? 'plan',
          course: quiz.folder?.course,
        },
        timeLimitMinutes: limitMinutes,
        timeLimitEnforced,
        startedAt: inProgress?.startedAt ?? null,
        remainingSeconds,
        draftAnswers: parseDraftAnswers(inProgress?.draftAnswers),
      });
    } catch (error) {
        console.error("[quizzes/[id]] error:", error);
        return NextResponse.json(
          { error: "حدث خطأ داخلي" },
          { status: 500 }
        );
      }
}
