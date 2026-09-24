/**
 * Re-grade completed quiz attempts after a teacher edits a question.
 *
 * The teacher PATCH returns immediately; kickQuizQuestionRegrade() runs this
 * in the background (same fire-and-forget pattern as kickEssayGrading on this
 * long-lived Node/PM2 server). Only the edited question is re-evaluated.
 * Other answers — including teacher essay verdicts and notes — stay as they
 * are unless that essay question itself was edited.
 */

import { prisma } from "@/lib/prisma";
import { acquireAdvisoryLock } from "@/lib/distributed-lock";
import { parseDegree, recomputeQuizResult } from "@/lib/quiz-grading";

export type QuestionGradingFields = {
  question: string;
  questionType: string;
  optionA: string;
  optionB: string;
  optionC: string;
  optionD: string;
  correctAnswer: string;
  degree: number;
};

export type QuestionEditDiff = {
  correctAnswerChanged: boolean;
  optionsChanged: boolean;
  degreeChanged: boolean;
  questionTextChanged: boolean;
  questionTypeChanged: boolean;
  /** Auto-grade key, options, degree, or essay prompt changed — attempts must be refreshed. */
  needsRegrade: boolean;
  /** Wipe teacherReply / reviewedAt / official verdict for THIS essay only. */
  resetEssayFeedback: boolean;
};

function norm(value: string | null | undefined): string {
  return (value ?? "").trim();
}

export function evaluateMcqSelected(
  selectedAnswer: string | null | undefined,
  correctAnswer: string
): boolean {
  if (!selectedAnswer) return false;
  return selectedAnswer === correctAnswer;
}

export type AnswerRegradePlan = {
  isCorrect: boolean;
  status: "PENDING" | "APPROVED" | "DISAPPROVED";
  teacherReply: string | null;
  reviewedAt: Date | null;
  wipeAiGrade: boolean;
};

/**
 * Per-answer decision for one edited question. Other answers on the attempt
 * are never passed in — they stay as stored. Essay teacherReply / reviewedAt
 * survive unless THIS essay was content-edited (or converted to/from MCQ).
 */
export function planAnswerRegrade(params: {
  questionType: string;
  selectedAnswer: string | null | undefined;
  correctAnswer: string;
  existing: {
    isCorrect: boolean;
    status: string | null;
    teacherReply: string | null;
    reviewedAt: Date | null;
  };
  resetEssayFeedback: boolean;
}): AnswerRegradePlan {
  const isEssay = params.questionType === "essay";
  if (isEssay) {
    if (params.resetEssayFeedback) {
      return {
        isCorrect: false,
        status: "PENDING",
        teacherReply: null,
        reviewedAt: null,
        wipeAiGrade: true,
      };
    }
    const status =
      params.existing.status === "APPROVED" || params.existing.status === "DISAPPROVED"
        ? params.existing.status
        : "PENDING";
    return {
      isCorrect: params.existing.isCorrect,
      status,
      teacherReply: params.existing.teacherReply,
      reviewedAt: params.existing.reviewedAt,
      wipeAiGrade: false,
    };
  }

  return {
    isCorrect: evaluateMcqSelected(params.selectedAnswer, params.correctAnswer),
    status: "APPROVED",
    teacherReply: params.resetEssayFeedback ? null : params.existing.teacherReply,
    reviewedAt: params.resetEssayFeedback ? null : params.existing.reviewedAt,
    wipeAiGrade: params.resetEssayFeedback,
  };
}

export function diffQuestionEdit(
  before: QuestionGradingFields,
  after: QuestionGradingFields
): QuestionEditDiff {
  const correctAnswerChanged = before.correctAnswer !== after.correctAnswer;
  const optionsChanged =
    norm(before.optionA) !== norm(after.optionA) ||
    norm(before.optionB) !== norm(after.optionB) ||
    norm(before.optionC) !== norm(after.optionC) ||
    norm(before.optionD) !== norm(after.optionD);
  const degreeChanged = before.degree !== after.degree;
  const questionTextChanged = norm(before.question) !== norm(after.question);
  const questionTypeChanged = before.questionType !== after.questionType;
  const wasOrIsEssay = before.questionType === "essay" || after.questionType === "essay";

  const needsRegrade =
    correctAnswerChanged ||
    optionsChanged ||
    degreeChanged ||
    questionTypeChanged ||
    (wasOrIsEssay && questionTextChanged);

  // Degree-only edits change the total but do not invalidate a teacher's
  // accept/reject of that essay. Content / type / key changes do.
  const resetEssayFeedback =
    wasOrIsEssay &&
    (questionTextChanged || questionTypeChanged || optionsChanged || correctAnswerChanged);

  return {
    correctAnswerChanged,
    optionsChanged,
    degreeChanged,
    questionTextChanged,
    questionTypeChanged,
    needsRegrade,
    resetEssayFeedback,
  };
}

export type RegradeJob = {
  quizId: string;
  questionId: string;
  resetEssayFeedback: boolean;
};

type QuestionRow = QuestionGradingFields & {
  id: string;
  quizId: string;
  imageUrl: string | null;
};

/** Serialize regrades per quiz so two rapid edits cannot race on the same results. */
const tails = new Map<string, Promise<void>>();

/** Fire-and-forget; never throws into the caller's request. */
export function kickQuizQuestionRegrade(job: RegradeJob): void {
  const prev = tails.get(job.quizId) ?? Promise.resolve();
  const next = prev
    .then(() => regradeCompletedAttempts(job))
    .then(() => undefined)
    .catch((err) => {
      console.error(
        `[quiz-regrade] quiz ${job.quizId} question ${job.questionId} failed:`,
        err instanceof Error ? err.message : err
      );
    });
  tails.set(job.quizId, next);
}

export async function regradeCompletedAttempts(job: RegradeJob): Promise<{ updated: number }> {
  const question = await prisma.quizQuestion.findUnique({ where: { id: job.questionId } });
  if (!question || question.quizId !== job.quizId) return { updated: 0 };

  const results = await prisma.quizResult.findMany({
    where: { quizId: job.quizId, completedAt: { not: null } },
    select: { id: true },
  });

  let updated = 0;
  for (const result of results) {
    const did = await regradeOneAttempt({
      resultId: result.id,
      question: {
        id: question.id,
        quizId: question.quizId,
        question: question.question,
        questionType: question.questionType,
        imageUrl: question.imageUrl,
        optionA: question.optionA,
        optionB: question.optionB,
        optionC: question.optionC,
        optionD: question.optionD,
        correctAnswer: question.correctAnswer,
        degree: parseDegree(question.degree),
      },
      resetEssayFeedback: job.resetEssayFeedback,
    });
    if (did) updated++;
  }
  return { updated };
}

async function regradeOneAttempt(params: {
  resultId: string;
  question: QuestionRow;
  resetEssayFeedback: boolean;
}): Promise<boolean> {
  const { resultId, question, resetEssayFeedback } = params;

  const outcome = await prisma.$transaction(async (tx) => {
    await acquireAdvisoryLock(`quiz-grade:${resultId}`, tx);
    const answer = await tx.quizAnswer.findFirst({
      where: { resultId, questionId: question.id },
      select: {
        id: true,
        selectedAnswer: true,
        questionType: true,
        status: true,
        teacherReply: true,
        reviewedAt: true,
        isCorrect: true,
      },
    });
    if (!answer) return { applied: false, wasPendingBefore: false };

    const pendingBefore = await tx.quizAnswer.count({
      where: { resultId, status: "PENDING" },
    });

    const isEssay = question.questionType === "essay";
    const snapshot = {
      question: question.question,
      questionType: question.questionType,
      imageUrl: question.imageUrl,
      optionA: isEssay ? "" : question.optionA,
      optionB: isEssay ? "" : question.optionB,
      optionC: isEssay ? "" : question.optionC,
      optionD: isEssay ? "" : question.optionD,
      correctAnswer: isEssay ? "" : question.correctAnswer,
      degree: question.degree,
    };
    const plan = planAnswerRegrade({
      questionType: question.questionType,
      selectedAnswer: answer.selectedAnswer,
      correctAnswer: question.correctAnswer,
      existing: {
        isCorrect: answer.isCorrect,
        status: answer.status,
        teacherReply: answer.teacherReply,
        reviewedAt: answer.reviewedAt,
      },
      resetEssayFeedback,
    });

    if (plan.wipeAiGrade) {
      await tx.essayAIGrade.deleteMany({ where: { answerId: answer.id } });
    }
    await tx.quizAnswer.update({
      where: { id: answer.id },
      data: {
        ...snapshot,
        isCorrect: plan.isCorrect,
        status: plan.status,
        teacherReply: plan.teacherReply,
        reviewedAt: plan.reviewedAt,
      },
    });

    return { applied: true, wasPendingBefore: pendingBefore > 0 };
  });

  if (!outcome.applied) return false;
  await recomputeQuizResult(resultId, { wasPendingBefore: outcome.wasPendingBefore });
  return true;
}
