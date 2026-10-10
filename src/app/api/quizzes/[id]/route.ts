/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getConfigBool } from "@/lib/config";
import { checkQuizAccess } from "@/lib/authorization";
import { canAccessContent, contentDeniedPayload, ContentType, hasActiveSupportReopen, restartQuizClockForSupportReopen } from "@/lib/content-access-engine";
import { summarizeAnswers } from "@/lib/quiz-grading";
import { parseDraftAnswers, quizActiveElapsedMs, quizRemainingMs, retakeCooldownRemainingMs } from "@/lib/quiz-attempt";
import { buildQuizLobby, pauseQuizAttempt } from "@/lib/quiz-session";
import { parsePresentation, presentStudentView } from "@/lib/attempt-presentation";

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
      let supportReopen = false;

      // One graded attempt. An in-progress start (no completedAt) can resume.
      // A submitted result is frozen unless a teacher explicitly allowed a retake.
      // After the exam window closes, a finished attempt stays readable so the
      // student sees grades instead of "انتهى وقت الامتحان". Unfinished attempts
      // stay closed, and a closed window does not open a new retake.
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

        const access = await canAccessContent(session.id, {
          type: ContentType.QUIZ,
          sourceId: quizId,
          title: quiz.title,
        });
        // Support added this student (or everyone) to a reopen window. That
        // opens the quiz they already have, even after the original close time.
        supportReopen = await hasActiveSupportReopen(session.id, quizId, [
          ContentType.QUIZ,
          ContentType.EXAM,
        ]);
        const closedBySchedule = !access.allowed && access.code === "CONTENT_CLOSED";
        const windowClosed = closedBySchedule && !supportReopen;
        const finished = !!existingResult?.completedAt;
        if (!(finished && windowClosed) && !(supportReopen && closedBySchedule)) {
          const denied = contentDeniedPayload(access);
          // A closed exam still opens the waiting page so the student sees the
          // teacher's end time. Other locks (a missing lesson) stay a hard deny.
          if (denied && denied.body.code !== "CONTENT_CLOSED") {
            return NextResponse.json(denied.body, { status: denied.status });
          }
        }

        const wantReview = req.nextUrl.searchParams.get("review") === "1";
        if (existingResult?.completedAt) {
          if (!wantReview) {
            // Waiting page lists this try. The sheet is only returned for review=1.
          } else {
          // Read-only review. allowRetake only unlocks the "Start new attempt"
          // button — opening this page must never clear completedAt.
          // A closed window hides that button; the saved sheet stays visible.
          const summary = summarizeAnswers(existingResult.answers, existingResult.totalQ);
          const order = new Map(quiz.questions.map((q: any, i: number) => [q.id, i]));
          const breakdown = presentStudentView([...existingResult.answers]
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
            })), parsePresentation(existingResult.presentation));
          const allowRetake = (!!existingResult.allowRetake || supportReopen) && !windowClosed;
          const cooldownRemainingMs =
            allowRetake && !supportReopen
              ? retakeCooldownRemainingMs(existingResult.completedAt, (quiz as any).retakeCooldownHours ?? 0)
              : 0;
          const isHidden = Boolean((quiz as any).hideAnswersUntilEssayGraded) && !existingResult.essayGraded;
          const finalBreakdown = isHidden
            ? breakdown.map((b: any) => ({
                ...b,
                correctAnswer: "",
                isCorrect: false,
              }))
            : breakdown;

          return NextResponse.json({
            alreadyCompleted: true,
            allowRetake,
            cooldownRemainingMs,
            hideAnswersUntilEssayGraded: isHidden,
            result: {
              score: isHidden ? null : existingResult.score,
              totalQ: existingResult.totalQ,
              completedAt: existingResult.completedAt,
              allowRetake,
              correct: isHidden ? 0 : summary.correct,
              pendingEssays: summary.pendingCount,
              gradingStatus: summary.gradingStatus,
              passed: isHidden ? null : summary.passed,
              mcqCount: summary.mcqCount,
              mcqCorrect: isHidden ? 0 : summary.mcqCorrect,
              essayCount: summary.essayCount,
              breakdown: finalBreakdown,
            },
            quiz: { id: quiz.id, title: quiz.title, courseId: quiz.folder?.courseId ?? 'plan', course: quiz.folder?.course },
          });
          }
        }

        const resumeExam = req.nextUrl.searchParams.get("resume") === "1";
        const limitMinutesForPause = (quiz as any).timeLimitMinutes || 30;
        const running =
          !!existingResult &&
          !existingResult.completedAt &&
          !!existingResult.startedAt &&
          !existingResult.pausedAt;
        // Opening the waiting page means the student left the exam, so the
        // clock pauses. Questions are returned only for an explicit resume.
        if (running && !resumeExam && existingResult) {
          await pauseQuizAttempt(existingResult.id, limitMinutesForPause);
          existingResult.pausedAt = new Date();
        }

        const stillRunning =
          !!existingResult &&
          !existingResult.completedAt &&
          !!existingResult.startedAt &&
          !existingResult.pausedAt &&
          resumeExam;

        if (!stillRunning) {
          if (supportReopen) {
            await restartQuizClockForSupportReopen(quizId, session.id);
          }
          const fresh = existingResult
            ? await prisma.quizResult.findUnique({
                where: { id: existingResult.id },
                select: {
                  id: true,
                  score: true,
                  totalQ: true,
                  allowRetake: true,
                  startedAt: true,
                  pausedAt: true,
                  elapsedMs: true,
                  completedAt: true,
                },
              })
            : null;
          const timeLimitEnforced = !(await getConfigBool("quiz_time_limit_disabled"));
          return NextResponse.json(
            await buildQuizLobby({
              studentId: session.id,
              quiz: {
                id: quiz.id,
                title: quiz.title,
                timeLimitMinutes: limitMinutesForPause,
                enableAutoClose: quiz.enableAutoClose,
                closeAt: quiz.closeAt,
                retakeCooldownHours: quiz.retakeCooldownHours ?? 0,
                folder: quiz.folder,
              },
              attempt: fresh,
              supportReopen,
              windowClosed,
              timeLimitEnforced,
            })
          );
        }
      }

      // The client needs to know whether the timer is real. When enforcement is
      // off it must not auto-submit at zero — the server would accept the
      // answers, but the student would have been thrown out of their own quiz.
      const timeLimitEnforced = !(await getConfigBool("quiz_time_limit_disabled"));
      const limitMinutes = (quiz as any).timeLimitMinutes || 30;
      const inProgress = isStudent ? await prisma.quizResult.findUnique({
        where: { studentId_quizId: { studentId: session.id, quizId } },
        select: { startedAt: true, pausedAt: true, elapsedMs: true, draftAnswers: true, completedAt: true, presentation: true, modelNumber: true },
      }) : null;

      let chosenModel = inProgress?.modelNumber;
      if (!chosenModel && isStudent) {
        const availableModels = [...new Set(quiz.questions.map((q: any) => q.modelNumber || 1))];
        chosenModel = availableModels[Math.floor(Math.random() * availableModels.length)] || 1;
        if (inProgress) {
          await prisma.quizResult.update({
            where: { studentId_quizId: { studentId: session.id, quizId } },
            data: { modelNumber: chosenModel },
          });
        }
      }

      const questionsToFilter = isStudent
        ? quiz.questions.filter((q: any) => (q.modelNumber || 1) === (chosenModel || 1))
        : quiz.questions;

      const strippedQuestions = questionsToFilter.map((question: any) => {
        const { correctAnswer: _ca, ...q } = question;
        return q;
      });

      const remainingSeconds = Math.floor(
        quizRemainingMs(
          limitMinutes,
          quizActiveElapsedMs({
            startedAt: inProgress?.startedAt,
            pausedAt: inProgress?.pausedAt,
            elapsedMs: inProgress?.elapsedMs,
          })
        ) / 1000
      );

      const questions = isStudent
        ? presentStudentView(strippedQuestions, parsePresentation(inProgress?.presentation))
        : quiz.questions;

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
