import { prisma } from "@/lib/prisma";
import { addPoints } from "@/lib/points";
import { withProviderFallback, completeWithProvider, ProviderCallError } from "@/lib/ai-provider";
import { buildGradingPrompt, parseModelJson, validateGradeOutput } from "@/lib/essay-ai-core";
import { practicePoints } from "@/lib/practice";

/**
 * AI grading for practice essays, plus the one-time points award.
 *
 * Practice is self-assessment, so the AI verdict is final (the student is told
 * the AI can be wrong). Grading reuses the quiz essay grader's prompt and
 * validator against the model answer + criteria written when the question was
 * banked. An answer flagged as trying to steer the grader earns nothing.
 */

const MAX_TRIES = 3;
const LEASE_MS = 3 * 60_000;
/** A failed essay is retried this soon (the lease would otherwise hold it for LEASE_MS). */
const RETRY_AFTER_MS = 20_000;
/** Essays of one attempt graded side by side — one at a time made 10 essays take minutes. */
const GRADING_CONCURRENCY = 4;
const GRADING_MAX_TOKENS = 1500;
const GRADING_TIMEOUT_MS = 45_000;

const running = new Set<string>();

/** Fire-and-forget entry point used by the routes; safe to call repeatedly. */
export function kickPracticeGrading(attemptId: string): void {
  if (running.has(attemptId)) return;
  running.add(attemptId);
  gradeAttempt(attemptId)
    .catch((err) => console.error("[practice] grading failed:", err instanceof Error ? err.message : err))
    .finally(() => running.delete(attemptId));
}

async function gradeOne(answerId: string): Promise<void> {
  const lease = new Date(Date.now() - LEASE_MS);
  const claimed = await prisma.practiceAnswer.updateMany({
    where: { id: answerId, status: "PENDING", OR: [{ claimedAt: null }, { claimedAt: { lt: lease } }] },
    data: { claimedAt: new Date(), attempts: { increment: 1 } },
  });
  if (claimed.count === 0) return;

  const a = await prisma.practiceAnswer.findUnique({ where: { id: answerId } });
  if (!a) return;
  const q = await prisma.practiceQuestion.findUnique({
    where: { id: a.questionId },
    select: { question: true, referenceAnswer: true, rubric: true },
  });
  const text = (a.essayAnswer ?? "").trim();
  if (!q || !text) {
    await prisma.practiceAnswer.update({ where: { id: answerId }, data: { status: "GRADED", isCorrect: false, verdict: "INCORRECT", claimedAt: null } });
    return;
  }

  const guide = { referenceAnswer: q.referenceAnswer, rubric: q.rubric, maxPoints: 10 };
  const prompt = buildGradingPrompt({ question: q.question, answer: text, guide });
  try {
    const { value: grade } = await withProviderFallback(async (p) => {
      const out = await completeWithProvider(p, {
        system: prompt.system,
        user: prompt.user,
        maxTokens: GRADING_MAX_TOKENS,
        temperature: 0,
        timeoutMs: GRADING_TIMEOUT_MS,
        json: true,
      });
      return validateGradeOutput(parseModelJson(out.text), { maxPoints: 10, rubric: q.rubric, answer: text });
    });
    const verdict = grade.feedback.injectionSuspected ? "INCORRECT" : grade.verdict;
    await prisma.practiceAnswer.update({
      where: { id: answerId },
      data: {
        status: "GRADED",
        verdict,
        isCorrect: verdict === "CORRECT",
        aiScore: grade.score,
        feedback: JSON.stringify({
          summary: grade.feedback.summary,
          correctPoints: grade.feedback.correctPoints,
          missingPoints: grade.feedback.missingPoints,
        }),
        claimedAt: null,
      },
    });
  } catch (err) {
    const code = err instanceof ProviderCallError ? err.code : "INVALID";
    const exhausted = a.attempts >= MAX_TRIES;
    await prisma.practiceAnswer.update({
      where: { id: answerId },
      data: exhausted
        ? { status: "FAILED", isCorrect: false, claimedAt: null }
        : // Back-date the claim so the lease expires RETRY_AFTER_MS from now — a short
          // back-off before the page's polling re-kicks grading. Throttling is not the answer's fault: give the try back.
          { claimedAt: new Date(Date.now() - LEASE_MS + RETRY_AFTER_MS), ...(code === "RATE_LIMITED" ? { attempts: { decrement: 1 } } : {}) },
    });
    console.warn(`[practice] essay ${answerId} not graded (${code})${exhausted ? " — giving up" : ""}`);
  }
}

export async function gradeAttempt(attemptId: string): Promise<void> {
  const pending = await prisma.practiceAnswer.findMany({
    where: { attemptId, status: "PENDING" },
    select: { id: true },
  });
  const queue = pending.map((p) => p.id);
  await Promise.all(
    Array.from({ length: Math.min(GRADING_CONCURRENCY, queue.length) }, async () => {
      for (let id = queue.shift(); id; id = queue.shift()) await gradeOne(id);
    })
  );
  await finalizeAttempt(attemptId);
}

/**
 * Once nothing is pending, stores the totals and awards points — exactly once,
 * guarded by finalizedAt.
 */
export async function finalizeAttempt(attemptId: string): Promise<void> {
  const attempt = await prisma.practiceAttempt.findUnique({
    where: { id: attemptId },
    select: { studentId: true, submittedAt: true, finalizedAt: true, answers: { select: { status: true, isCorrect: true, verdict: true, essayAnswer: true, choice: true } } },
  });
  if (!attempt?.submittedAt || attempt.finalizedAt) return;
  if (attempt.answers.some((a) => a.status === "PENDING" || a.status === "DRAFT")) return;

  // Essay rows always carry a string (submit stores "" for a blank essay); MCQ rows never do.
  const essays = attempt.answers.filter((a) => a.essayAnswer !== null);
  const mcqs = attempt.answers.filter((a) => !essays.includes(a));
  const mcqCorrect = mcqs.filter((a) => a.isCorrect).length;
  const essayCorrect = essays.filter((a) => a.verdict === "CORRECT").length;
  const essayPartial = essays.filter((a) => a.verdict === "PARTIAL").length;
  const points = practicePoints({ mcqCorrect, essayCorrect, essayPartial, total: attempt.answers.length });

  const done = await prisma.practiceAttempt.updateMany({
    where: { id: attemptId, finalizedAt: null },
    data: {
      finalizedAt: new Date(),
      mcqCorrect,
      mcqTotal: mcqs.length,
      essayCorrect,
      essayTotal: essays.length,
      pointsAwarded: points,
    },
  });
  if (done.count === 1 && points > 0) await addPoints(attempt.studentId, points);
}
