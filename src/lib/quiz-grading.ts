import { prisma } from "@/lib/prisma";
import { ContentType, recordContentCompleted } from "@/lib/content-access-engine";
import { addPoints, POINTS } from "@/lib/points";
import { acquireAdvisoryLock } from "@/lib/distributed-lock";

/**
 * Shared grading rules for quizzes that mix auto-graded MCQ questions with
 * teacher-graded essay questions.
 *
 * Shared grading rules for quizzes that mix auto-graded MCQ questions with
 * teacher-graded essay questions.
 *
 * The score is `earnedDegree / totalDegree * 100`. Each question's `degree`
 * defaults to 1, so existing equal-weight quizzes stay `correct / totalQ`.
 * Essay questions are stored with `status = "PENDING"` and `isCorrect = false`
 * until a teacher/assistant reviews them, so a result with pending answers is
 * NOT a final grade. Every consumer must check `pendingCount` before labelling
 * a result as passed/failed.
 */

export const PASS_MARK = 50;

export type GradingStatus = "PENDING" | "GRADED";

export const MIN_DEGREE = 1;
export const MAX_DEGREE = 100;

/** Points a question contributes. Missing/invalid values count as 1 so legacy rows stay equal-weight. */
export function parseDegree(raw: unknown): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return MIN_DEGREE;
  return Math.min(MAX_DEGREE, Math.max(MIN_DEGREE, Math.round(n)));
}

export function answerDegree(a: { degree?: number | null }): number {
  const n = Number(a.degree);
  return Number.isFinite(n) && n > 0 ? n : MIN_DEGREE;
}

export type AnswerLike = {
  questionType: string | null;
  isCorrect: boolean;
  status: string | null;
  degree?: number | null;
};

export type GradingSummary = {
  totalQ: number;
  correct: number;
  score: number;
  /** essay answers still waiting for a teacher decision */
  pendingCount: number;
  essayCount: number;
  mcqCount: number;
  mcqCorrect: number;
  essayApproved: number;
  gradingStatus: GradingStatus;
  /** null while essays are pending — pass/fail is not known yet */
  passed: boolean | null;
};

export function isEssayAnswer(a: { questionType?: string | null; essayAnswer?: string | null }): boolean {
  return a.questionType === "essay";
}

export function summarizeAnswers(answers: AnswerLike[], totalQOverride?: number | null): GradingSummary {
  const totalQ = totalQOverride && totalQOverride > 0 ? totalQOverride : answers.length;
  const correct = answers.filter((a) => a.isCorrect).length;
  const essays = answers.filter((a) => a.questionType === "essay");
  const mcqs = answers.filter((a) => a.questionType !== "essay");
  const pendingCount = essays.filter((a) => a.status === "PENDING").length;
  const earnedDegree = answers.filter((a) => a.isCorrect).reduce((sum, a) => sum + answerDegree(a), 0);
  const answerDegreeSum = answers.reduce((sum, a) => sum + answerDegree(a), 0);
  // Questions with no stored answer row (shouldn't happen after submit) count as 1 each.
  const totalDegree = answerDegreeSum + Math.max(0, totalQ - answers.length);
  const score = totalDegree > 0 ? Number(((earnedDegree / totalDegree) * 100).toFixed(2)) : 0;
  const gradingStatus: GradingStatus = pendingCount > 0 ? "PENDING" : "GRADED";
  return {
    totalQ,
    correct,
    score,
    pendingCount,
    essayCount: essays.length,
    mcqCount: mcqs.length,
    mcqCorrect: mcqs.filter((a) => a.isCorrect).length,
    essayApproved: essays.filter((a) => a.isCorrect).length,
    gradingStatus,
    passed: gradingStatus === "GRADED" ? score >= PASS_MARK : null,
  };
}

/**
 * Recomputes a QuizResult from its stored answers after a teacher graded an
 * essay. When the last pending essay is decided the grade becomes final and the
 * side effects that the submit route deferred (lesson progress, prerequisite
 * graph, points) are applied here exactly once.
 */
export async function recomputeQuizResult(resultId: string, opts: { wasPendingBefore: boolean }) {
  const result = await prisma.quizResult.findUnique({
    where: { id: resultId },
    include: {
      answers: { select: { questionType: true, isCorrect: true, status: true, degree: true } },
      student: { select: { id: true, role: true } },
      quiz: { select: { id: true, title: true, planLessonId: true, planLesson: { select: { planId: true } } } },
    },
  });
  if (!result) return null;

  const summary = summarizeAnswers(result.answers, result.totalQ);

  await prisma.quizResult.update({
    where: { id: resultId },
    data: { score: summary.score },
  });

  const becameFinal = opts.wasPendingBefore && summary.gradingStatus === "GRADED";
  const isStudent = result.student.role === "student";

  if (isStudent && result.completedAt) {
    // Keep the prerequisite graph in sync with the corrected grade.
    await recordContentCompleted(
      result.studentId,
      { type: ContentType.QUIZ, sourceId: result.quizId, title: result.quiz.title },
      { score: summary.score, completedAt: result.completedAt }
    );
  }

  if (result.quiz.planLessonId && result.quiz.planLesson) {
    const enrollment = await prisma.planEnrollment.findFirst({
      where: { planId: result.quiz.planLesson.planId, studentId: result.studentId },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });
    if (enrollment) {
      await prisma.planLessonProgress.upsert({
        where: { enrollmentId_planLessonId: { enrollmentId: enrollment.id, planLessonId: result.quiz.planLessonId } },
        create: {
          enrollmentId: enrollment.id,
          planLessonId: result.quiz.planLessonId,
          quizPassed: summary.passed === true,
          quizScore: summary.score,
        },
        update: { quizPassed: summary.passed === true, quizScore: summary.score },
      });
    }
  }

  // Points were deferred by the submit route while essays were pending.
  if (becameFinal && isStudent) {
    let pointsEarned = 0;
    if (summary.passed) pointsEarned += POINTS.FIRST_TRY_BONUS;
    if (summary.score === 100) pointsEarned += POINTS.EXAM_FULL_SCORE;
    if (pointsEarned > 0) await addPoints(result.studentId, pointsEarned);
  }

  return { summary, becameFinal };
}

/**
 * Records an official essay verdict (teacher decision or an AI verdict in a
 * course's "auto" mode) under a per-result advisory lock.
 *
 * `becameFinal` is true only for the one write that moved the result from
 * "some essays pending" to "none pending". Callers pass it to
 * recomputeQuizResult as `wasPendingBefore`, so the deferred points are awarded
 * exactly once even when a teacher and the AI grader decide the last two essays
 * at the same moment.
 *
 * With `onlyIfPending` the write is skipped if the answer was already decided —
 * the AI grader uses this so it can never overwrite a teacher's decision.
 */
export async function setEssayVerdict(params: {
  answerId: string;
  resultId: string;
  status: "APPROVED" | "DISAPPROVED";
  teacherReply?: string | null;
  reviewedAt: Date;
  onlyIfPending: boolean;
}): Promise<{ applied: boolean; becameFinal: boolean }> {
  return prisma.$transaction(async (tx) => {
    await acquireAdvisoryLock(`quiz-grade:${params.resultId}`, tx);
    const pendingBefore = await tx.quizAnswer.count({ where: { resultId: params.resultId, status: "PENDING" } });
    const updated = await tx.quizAnswer.updateMany({
      where: {
        id: params.answerId,
        resultId: params.resultId,
        ...(params.onlyIfPending ? { status: "PENDING" } : {}),
      },
      data: {
        status: params.status,
        isCorrect: params.status === "APPROVED",
        reviewedAt: params.reviewedAt,
        ...(params.teacherReply !== undefined ? { teacherReply: params.teacherReply } : {}),
      },
    });
    if (updated.count === 0) return { applied: false, becameFinal: false };
    const pendingAfter = await tx.quizAnswer.count({ where: { resultId: params.resultId, status: "PENDING" } });
    return { applied: true, becameFinal: pendingBefore > 0 && pendingAfter === 0 };
  });
}
