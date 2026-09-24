/**
 * Re-grade completed exam-homework submissions after a teacher edits a question.
 *
 * The teacher PATCH returns immediately; kickHomeworkQuestionRegrade() runs this
 * in the background (same fire-and-forget pattern as quiz regrade). Answers are
 * a JSON map on HomeworkSubmission — only the edited question's key/degree
 * changes, then the whole-sheet total is recalculated from the stored answers.
 *
 * Homework exams are MCQ today. Teacher review notes (HomeworkReview.note /
 * verdict) are never wiped — that is the homework equivalent of keeping essay
 * manual feedback.
 */

import { prisma } from "@/lib/prisma";
import { acquireAdvisoryLock } from "@/lib/distributed-lock";
import { PASS_MARK, parseDegree, summarizeAnswers } from "@/lib/quiz-grading";
import { evaluateMcqSelected } from "@/lib/quiz-regrade";
import {
  ContentType,
  syncHomeworkContentProgress,
} from "@/lib/content-access-engine";

export type HomeworkExamQuestion = {
  id: string;
  correctAnswer: string;
  degree?: number | null;
};

export function parseHomeworkAnswers(raw: string | null | undefined): Record<string, string> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const out: Record<string, string> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === "string") out[key] = value;
    }
    return out;
  } catch {
    return {};
  }
}

export function scoreHomeworkExam(
  questions: HomeworkExamQuestion[],
  answers: Record<string, string>
): { score: number; totalQ: number; correct: number; status: "passed" | "failed" } {
  const likes = questions.map((q) => ({
    questionType: "mcq",
    isCorrect: evaluateMcqSelected(answers[q.id], q.correctAnswer),
    status: "APPROVED" as const,
    degree: parseDegree(q.degree),
  }));
  const summary = summarizeAnswers(likes, questions.length);
  return {
    score: summary.score,
    totalQ: questions.length,
    correct: summary.correct,
    status: summary.score >= PASS_MARK ? "passed" : "failed",
  };
}

export type HomeworkRegradeJob = {
  homeworkId: string;
  questionId: string;
};

const tails = new Map<string, Promise<void>>();

/** Fire-and-forget; never throws into the caller's request. */
export function kickHomeworkQuestionRegrade(job: HomeworkRegradeJob): void {
  const prev = tails.get(job.homeworkId) ?? Promise.resolve();
  const next = prev
    .then(() => regradeCompletedHomeworkAttempts(job))
    .then(() => undefined)
    .catch((err) => {
      console.error(
        `[homework-regrade] homework ${job.homeworkId} question ${job.questionId} failed:`,
        err instanceof Error ? err.message : err
      );
    });
  tails.set(job.homeworkId, next);
}

export async function regradeCompletedHomeworkAttempts(
  job: HomeworkRegradeJob
): Promise<{ updated: number }> {
  const homework = await prisma.homework.findUnique({
    where: { id: job.homeworkId },
    select: {
      id: true,
      title: true,
      type: true,
      questions: {
        orderBy: { order: "asc" },
        select: { id: true, correctAnswer: true, degree: true },
      },
    },
  });
  if (!homework || homework.type !== "exam") return { updated: 0 };
  if (!homework.questions.some((q) => q.id === job.questionId)) return { updated: 0 };

  const submissions = await prisma.homeworkSubmission.findMany({
    where: { homeworkId: job.homeworkId, answers: { not: null } },
    select: { id: true },
  });

  let updated = 0;
  for (const submission of submissions) {
    const did = await regradeOneHomeworkSubmission({
      submissionId: submission.id,
      homeworkId: homework.id,
      homeworkTitle: homework.title,
      questions: homework.questions,
    });
    if (did) updated++;
  }
  return { updated };
}

async function regradeOneHomeworkSubmission(params: {
  submissionId: string;
  homeworkId: string;
  homeworkTitle: string;
  questions: HomeworkExamQuestion[];
}): Promise<boolean> {
  const { submissionId, homeworkId, homeworkTitle, questions } = params;

  return prisma.$transaction(async (tx) => {
    await acquireAdvisoryLock(`homework-grade:${submissionId}`, tx);
    const submission = await tx.homeworkSubmission.findUnique({
      where: { id: submissionId },
      select: {
        id: true,
        studentId: true,
        answers: true,
        completedAt: true,
      },
    });
    if (!submission?.answers) return false;

    const graded = scoreHomeworkExam(questions, parseHomeworkAnswers(submission.answers));
    // Only score / totalQ / status. HomeworkReview.note and verdict stay as
    // the teacher wrote them — this job never deletes or rewrites the review.
    await tx.homeworkSubmission.update({
      where: { id: submissionId },
      data: {
        score: graded.score,
        totalQ: graded.totalQ,
        status: graded.status,
      },
    });

    await syncHomeworkContentProgress(
      submission.studentId,
      { type: ContentType.HOMEWORK, sourceId: homeworkId, title: homeworkTitle },
      graded.status,
      { score: graded.score, completedAt: submission.completedAt },
      tx
    );
    return true;
  });
}
