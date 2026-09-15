import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { getConfigBool, getConfigNumberClamped } from "@/lib/config";
import { withProviderFallback, completeWithProvider, ProviderCallError } from "@/lib/ai-provider";
import { recomputeQuizResult, setEssayVerdict } from "@/lib/quiz-grading";
import {
  MAX_ATTEMPTS,
  LEASE_MS,
  buildGradingPrompt,
  buildExplanationPrompt,
  buildExemplarPrompt,
  canAutoApply,
  effectiveMode,
  fullMarkShare,
  guideFingerprint,
  hasUsableCriteria,
  officialStatusFor,
  parseModelJson,
  safeParse,
  validateExemplar,
  validateExplanation,
  validateGradeOutput,
  GradeValidationError,
  type EssayFeedback,
  type Exemplar,
  type Explanation,
  type GradingMode,
  type GuideInput,
  type Verdict,
} from "@/lib/essay-ai-core";

/**
 * AI-assisted essay grading — orchestration and persistence.
 *
 * Flow: the quiz submit route saves the student's answers FIRST, then calls
 * enqueueEssayGrading(). That only inserts EssayAIGrade rows; the answer rows
 * are never touched by a failed AI call. kickEssayGrading() runs the grader in
 * the background (the same fire-and-forget pattern as plan project grading on
 * this long-lived Node server). Each row is claimed atomically with a lease, so
 * a crashed worker's row is re-claimed later, and attempts are capped.
 *
 * Nothing here is reachable unless the course owner set the course to "assist"
 * or "auto" AND the platform switch `ai_essay_grading_enabled` is on.
 */

const GRADING_MAX_TOKENS = 1500;
const EXPLAIN_MAX_TOKENS = 1200;
const EXEMPLAR_MAX_TOKENS = 1400;
const GRADING_TIMEOUT_MS = 45_000;
/** Explanation / exemplar generation claim — blocks duplicate parallel calls. */
const GENERATION_CLAIM_MS = 60_000;

// ── Scope helpers ────────────────────────────────────────────────────────────

export async function platformEssayAIEnabled(): Promise<boolean> {
  return getConfigBool("ai_essay_grading_enabled");
}

/** Mode that actually applies right now (platform switch included). */
export async function activeCourseMode(courseId: string | null | undefined): Promise<GradingMode> {
  if (!courseId) return "off"; // plan-lesson quizzes have no course → never graded by AI
  const course = await prisma.course.findUnique({ where: { id: courseId }, select: { aiEssayGradingMode: true } });
  const mode = effectiveMode(course?.aiEssayGradingMode);
  if (mode === "off") return "off";
  return (await platformEssayAIEnabled()) ? mode : "off";
}

function guideOf(g: { referenceAnswer: string | null; rubric: string | null; maxPoints: number } | null): GuideInput | null {
  return g ? { referenceAnswer: g.referenceAnswer, rubric: g.rubric, maxPoints: g.maxPoints } : null;
}

// ── Enqueue (called by the submit route after answers are saved) ─────────────

/**
 * Creates one EssayAIGrade per essay answer of a submitted result. Answers
 * that cannot be graded are recorded as SKIPPED with the reason, so the UI can
 * say why ("the teacher has not added grading criteria") instead of spinning.
 * Idempotent: the unique answerId makes a replayed call a no-op.
 * Returns the number of rows queued for grading.
 */
export async function enqueueEssayGrading(resultId: string): Promise<number> {
  const result = await prisma.quizResult.findUnique({
    where: { id: resultId },
    select: {
      completedAt: true,
      quiz: { select: { folder: { select: { courseId: true } } } },
      answers: {
        where: { questionType: "essay" },
        select: { id: true, questionId: true, essayAnswer: true },
      },
    },
  });
  if (!result?.completedAt || result.answers.length === 0) return 0;

  const mode = await activeCourseMode(result.quiz.folder?.courseId);
  if (mode === "off") return 0;

  const maxChars = await getConfigNumberClamped("ai_essay_max_chars", 200, 20_000);
  const guides = await prisma.quizQuestionGradingGuide.findMany({
    where: { questionId: { in: result.answers.map((a) => a.questionId) } },
    select: { questionId: true, referenceAnswer: true, rubric: true },
  });
  const guideByQuestion = new Map(guides.map((g) => [g.questionId, g]));

  const rows = result.answers.map((a) => {
    const text = (a.essayAnswer ?? "").trim();
    let skipReason: string | null = null;
    if (!text) skipReason = "EMPTY_ANSWER";
    else if (!hasUsableCriteria(guideByQuestion.get(a.questionId))) skipReason = "NO_CRITERIA";
    else if (text.length > maxChars) skipReason = "TOO_LONG";
    return {
      answerId: a.id,
      mode,
      status: skipReason ? "SKIPPED" : "PENDING",
      skipReason,
    };
  });

  await prisma.essayAIGrade.createMany({ data: rows, skipDuplicates: true });
  return rows.filter((r) => r.status === "PENDING").length;
}

// ── Processing ───────────────────────────────────────────────────────────────

const inFlight = new Set<string>();

/**
 * Process-wide cap on concurrent grading calls. A whole class submitting an
 * exam at once must queue here instead of hammering the provider into 429s.
 */
const MAX_CONCURRENT_GRADING_CALLS = 3;
let activeCalls = 0;
const waiters: Array<() => void> = [];
async function withGradingSlot<T>(fn: () => Promise<T>): Promise<T> {
  if (activeCalls >= MAX_CONCURRENT_GRADING_CALLS) {
    await new Promise<void>((resolve) => waiters.push(resolve));
  }
  activeCalls++;
  try {
    return await fn();
  } finally {
    activeCalls--;
    waiters.shift()?.();
  }
}

/** Fire-and-forget; never throws into the caller's request. */
export function kickEssayGrading(resultId: string): void {
  if (inFlight.has(resultId)) return;
  inFlight.add(resultId);
  processResultEssays(resultId)
    .catch((err) => console.error(`[essay-ai] processing result ${resultId} failed:`, err instanceof Error ? err.message : err))
    .finally(() => inFlight.delete(resultId));
}

/** Grades the result's queued essays one at a time (keeps provider load and cost bounded). */
export async function processResultEssays(resultId: string): Promise<void> {
  const rows = await prisma.essayAIGrade.findMany({
    where: { answer: { resultId }, status: { in: ["PENDING", "PROCESSING"] }, attempts: { lt: MAX_ATTEMPTS } },
    select: { id: true },
    orderBy: { createdAt: "asc" },
  });
  for (const row of rows) {
    // Provider is throttling us: stop here; recoverStalled() resumes later.
    if ((await gradeOne(row.id)) === "RATE_LIMITED") break;
  }
}

/** Atomically claims a row; returns the claim timestamp or null if someone else holds it. */
async function claim(gradeId: string): Promise<Date | null> {
  const now = new Date();
  const stale = new Date(now.getTime() - LEASE_MS);
  const res = await prisma.essayAIGrade.updateMany({
    where: {
      id: gradeId,
      attempts: { lt: MAX_ATTEMPTS },
      OR: [{ status: "PENDING" }, { status: "PROCESSING", claimedAt: { lt: stale } }],
    },
    data: { status: "PROCESSING", claimedAt: now, attempts: { increment: 1 } },
  });
  return res.count === 1 ? now : null;
}

export type GradeOneOutcome = "COMPLETED" | "APPLIED" | "FAILED" | "RETRY" | "RATE_LIMITED" | "SKIPPED" | "NOT_CLAIMED";

/**
 * Grades one essay. Exported for tests, which inject `complete` to simulate
 * provider success, malformed output and outages without network access.
 */
export async function gradeOne(
  gradeId: string,
  deps: { complete?: (system: string, user: string) => Promise<{ text: string; tokensUsed: number; provider: string; model: string }> } = {}
): Promise<GradeOneOutcome> {
  const claimedAt = await claim(gradeId);
  if (!claimedAt) return "NOT_CLAIMED";

  // Every write after the claim is conditioned on still holding it, so a
  // reclaimed-after-timeout duplicate can never overwrite a newer result.
  const mine = { id: gradeId, status: "PROCESSING", claimedAt };

  const row = await prisma.essayAIGrade.findUnique({
    where: { id: gradeId },
    select: {
      attempts: true,
      answer: {
        select: {
          id: true,
          resultId: true,
          studentId: true,
          quizId: true,
          questionId: true,
          question: true,
          essayAnswer: true,
          status: true,
          result: { select: { quiz: { select: { title: true, folder: { select: { courseId: true } } } } } },
        },
      },
    },
  });
  if (!row) return "NOT_CLAIMED";
  const answer = row.answer;

  // Re-check scope at grading time: the teacher may have switched AI off (or
  // edited criteria) after the student submitted.
  const mode = await activeCourseMode(answer.result.quiz.folder?.courseId);
  const guideRow = await prisma.quizQuestionGradingGuide.findUnique({
    where: { questionId: answer.questionId },
    select: { referenceAnswer: true, rubric: true, maxPoints: true },
  });
  const guide = guideOf(guideRow);
  const text = (answer.essayAnswer ?? "").trim();
  const skip = mode === "off" ? "DISABLED" : !guide || !hasUsableCriteria(guide) ? "NO_CRITERIA" : !text ? "EMPTY_ANSWER" : null;
  if (skip || !guide) {
    await prisma.essayAIGrade.updateMany({ where: mine, data: { status: "SKIPPED", skipReason: skip ?? "NO_CRITERIA", claimedAt: null } });
    return "SKIPPED";
  }

  const prompt = buildGradingPrompt({ question: answer.question, answer: text, guide });

  let graded: { grade: ReturnType<typeof validateGradeOutput>; tokensUsed: number; provider: string; model: string };
  try {
    graded = await withGradingSlot(async () => {
    if (deps.complete) {
      const out = await deps.complete(prompt.system, prompt.user);
      return { grade: validateGradeOutput(parseModelJson(out.text), { maxPoints: guide.maxPoints, rubric: guide.rubric, answer: text }), tokensUsed: out.tokensUsed, provider: out.provider, model: out.model };
    }
      // Output that fails validation is rejected per provider, so the backup
      // provider gets a chance before the attempt counts as failed.
      const { value, provider } = await withProviderFallback(async (p) => {
        const out = await completeWithProvider(p, {
          system: prompt.system,
          user: prompt.user,
          maxTokens: GRADING_MAX_TOKENS,
          temperature: 0,
          timeoutMs: GRADING_TIMEOUT_MS,
          json: true,
        });
        return { grade: validateGradeOutput(parseModelJson(out.text), { maxPoints: guide.maxPoints, rubric: guide.rubric, answer: text }), tokensUsed: out.tokensUsed };
      });
      return { ...value, provider: provider.name, model: provider.model };
    });
  } catch (err) {
    const code =
      err instanceof GradeValidationError ? `INVALID_${err.code}` : err instanceof ProviderCallError ? err.code : "UNKNOWN";
    if (code === "RATE_LIMITED") {
      // Throttling is not the answer's fault: refund the attempt and back off.
      await prisma.essayAIGrade.updateMany({
        where: mine,
        data: { status: "PENDING", lastError: code, attempts: { decrement: 1 } },
      });
      console.warn(`[essay-ai] grade ${gradeId} rate limited — will retry later`);
      return "RATE_LIMITED";
    }
    const exhausted = row.attempts >= MAX_ATTEMPTS;
    // The student's answer is untouched; only this advisory row records the failure.
    await prisma.essayAIGrade.updateMany({
      where: mine,
      data: { status: exhausted ? "FAILED" : "PENDING", lastError: code.slice(0, 80) },
    });
    console.warn(`[essay-ai] grade ${gradeId} attempt ${row.attempts} failed: ${code}`);
    return exhausted ? "FAILED" : "RETRY";
  }

  const { grade } = graded;
  const saved = await prisma.essayAIGrade.updateMany({
    where: mine,
    data: {
      status: "COMPLETED",
      score: grade.score,
      maxPoints: grade.maxPoints,
      verdict: grade.verdict,
      confidence: grade.confidence,
      needsReview: grade.needsReview,
      feedback: JSON.stringify(grade.feedback),
      provider: graded.provider.slice(0, 80),
      model: graded.model.slice(0, 120),
      tokensUsed: graded.tokensUsed,
      mode,
      lastError: null,
      claimedAt: null,
    },
  });
  if (saved.count === 0) return "NOT_CLAIMED";

  if (!canAutoApply(mode, grade)) return "COMPLETED";
  const official = officialStatusFor(grade.verdict);
  if (!official) return "COMPLETED";

  // Auto mode: the AI verdict becomes the official grade — but only if the
  // answer is still undecided. A teacher's decision is never overwritten.
  const appliedAt = new Date();
  const { applied, becameFinal } = await setEssayVerdict({
    answerId: answer.id,
    resultId: answer.resultId,
    status: official,
    reviewedAt: appliedAt,
    onlyIfPending: true,
  });
  if (!applied) return "COMPLETED";

  await prisma.essayAIGrade.update({ where: { id: gradeId }, data: { appliedAt } });
  const recomputed = await recomputeQuizResult(answer.resultId, { wasPendingBefore: becameFinal });
  try {
    const pending = recomputed?.summary.pendingCount ?? 0;
    await prisma.notification.create({
      data: {
        userId: answer.studentId,
        type: "grade_resolved",
        title: official === "APPROVED" ? "✅ تم تصحيح إجابتك المقالية تلقائياً" : "📝 تم تصحيح إجابتك المقالية تلقائياً",
        body:
          `صُحِّحت إجابتك في اختبار (${answer.result.quiz.title}) بالتصحيح الآلي بالذكاء الاصطناعي، ويمكن للمعلم مراجعتها وتعديلها. ` +
          (pending > 0 ? `ما زال ${pending} سؤال مقالي قيد التصحيح.` : `الدرجة الحالية: ${recomputed?.summary.score ?? 0}%.`),
        link: `/quizzes/${answer.quizId}`,
      },
    });
  } catch (err) {
    console.error("[essay-ai] notification failed:", err instanceof Error ? err.message : err);
  }
  return "APPLIED";
}

/**
 * Re-kicks work that the background task lost (process restart, crash). Rows
 * are retried with a growing delay and never beyond MAX_ATTEMPTS.
 */
export async function recoverStalled(resultId: string): Promise<void> {
  const now = Date.now();
  const rows = await prisma.essayAIGrade.findMany({
    where: { answer: { resultId }, status: { in: ["PENDING", "PROCESSING"] }, attempts: { lt: MAX_ATTEMPTS } },
    select: { status: true, attempts: true, claimedAt: true, createdAt: true },
  });
  const stalled = rows.some((r) => {
    if (r.status === "PROCESSING") return !!r.claimedAt && now - r.claimedAt.getTime() > LEASE_MS;
    const since = (r.claimedAt ?? r.createdAt).getTime();
    return now - since > 20_000 * Math.max(1, r.attempts);
  });
  if (stalled) kickEssayGrading(resultId);
}

// ── Official decision source ─────────────────────────────────────────────────

/**
 * APPROVED/DISAPPROVED came from the AI grader iff it applied the verdict and
 * no teacher has re-graded since (a teacher re-grade stamps a new reviewedAt).
 */
export function officialSource(
  answer: { status: string; reviewedAt: Date | null },
  ai: { appliedAt: Date | null } | null
): "TEACHER" | "AI" | null {
  if (answer.status !== "APPROVED" && answer.status !== "DISAPPROVED") return null;
  if (ai?.appliedAt && answer.reviewedAt && ai.appliedAt.getTime() === answer.reviewedAt.getTime()) return "AI";
  return "TEACHER";
}

// ── Student view ─────────────────────────────────────────────────────────────

export interface StudentEssayAIView {
  answerId: string;
  questionId: string;
  official: { status: string; source: "TEACHER" | "AI" | null; teacherReply: string | null };
  ai:
    | null
    | {
        status: string;
        skipReason: string | null;
        score: number | null;
        maxPoints: number | null;
        verdict: string | null;
        confidence: string | null;
        needsReview: boolean;
        feedback: EssayFeedback | null;
      };
  explanation: Explanation | null;
  hasCriteria: boolean;
}

/**
 * The signed-in student's own essay feedback for one quiz. The result is
 * looked up by (session student, quiz) — never by an id from the client — so a
 * student can only ever read their own answers.
 */
export async function getStudentEssayFeedback(studentId: string, quizId: string) {
  const result = await prisma.quizResult.findUnique({
    where: { studentId_quizId: { studentId, quizId } },
    select: {
      id: true,
      completedAt: true,
      quiz: { select: { folder: { select: { courseId: true } } } },
      answers: {
        where: { questionType: "essay" },
        select: {
          id: true,
          questionId: true,
          status: true,
          reviewedAt: true,
          teacherReply: true,
          aiGrade: {
            select: {
              status: true,
              skipReason: true,
              score: true,
              maxPoints: true,
              verdict: true,
              confidence: true,
              needsReview: true,
              feedback: true,
              appliedAt: true,
              explanation: true,
              explanationKey: true,
            },
          },
        },
      },
    },
  });
  if (!result?.completedAt) return null;

  const mode = await activeCourseMode(result.quiz.folder?.courseId);
  const guides = await prisma.quizQuestionGradingGuide.findMany({
    where: { questionId: { in: result.answers.map((a) => a.questionId) } },
    select: { questionId: true, referenceAnswer: true, rubric: true },
  });
  const withCriteria = new Set(guides.filter((g) => hasUsableCriteria(g)).map((g) => g.questionId));

  const items: StudentEssayAIView[] = result.answers.map((a) => {
    const g = a.aiGrade;
    const source = officialSource(a, g);
    // When the teacher has switched AI off, students stop seeing AI output —
    // except an AI verdict that is still the official grade, which the student
    // is entitled to have explained.
    const showAI = !!g && (mode !== "off" || source === "AI");
    const key = explanationKey(a, g);
    return {
      answerId: a.id,
      questionId: a.questionId,
      official: { status: a.status, source, teacherReply: a.teacherReply },
      ai: showAI && g
        ? {
            status: g.status,
            skipReason: g.skipReason,
            score: g.score,
            maxPoints: g.maxPoints,
            verdict: g.verdict,
            confidence: g.confidence,
            needsReview: g.needsReview,
            feedback: safeParse<EssayFeedback>(g.feedback),
          }
        : null,
      explanation: showAI && g?.explanation && g.explanationKey === key ? safeParse<Explanation>(g.explanation) : null,
      hasCriteria: withCriteria.has(a.questionId),
    };
  });

  const inProgress = items.some((i) => i.ai && (i.ai.status === "PENDING" || i.ai.status === "PROCESSING"));
  if (inProgress) await recoverStalled(result.id);

  return { resultId: result.id, aiEnabled: mode !== "off", mode, items, inProgress };
}

/**
 * Identifies the grading state an explanation was written for: the official
 * decision plus a COMPLETED AI grade. Deliberately ignores placeholder or
 * in-flight AI rows, so creating the cache row itself never invalidates it.
 */
function explanationKey(
  answer: { status: string; reviewedAt: Date | null; teacherReply: string | null },
  ai: { status: string; score: number | null; verdict?: string | null } | null
): string {
  const aiPart = ai?.status === "COMPLETED" ? `${ai.score}|${ai.verdict ?? ""}` : "none";
  return createHash("sha256")
    .update(JSON.stringify([answer.status, answer.reviewedAt?.toISOString() ?? "", answer.teacherReply ?? "", aiPart]))
    .digest("hex")
    .slice(0, 32);
}

// ── "Explain my result" ──────────────────────────────────────────────────────

export type ExplainOutcome =
  | { ok: true; explanation: Explanation; cached: boolean }
  | { ok: false; code: "NOT_FOUND" | "AI_DISABLED" | "NO_CRITERIA" | "NOT_GRADED_YET" | "RATE_LIMITED" | "IN_PROGRESS" | "FAILED" };

export async function explainEssayResult(
  studentId: string,
  quizId: string,
  questionId: string,
  deps: { complete?: (system: string, user: string) => Promise<{ text: string }> } = {}
): Promise<ExplainOutcome> {
  const answer = await prisma.quizAnswer.findFirst({
    where: { studentId, quizId, questionId, questionType: "essay", result: { studentId, completedAt: { not: null } } },
    select: {
      id: true,
      question: true,
      essayAnswer: true,
      status: true,
      reviewedAt: true,
      teacherReply: true,
      result: { select: { quiz: { select: { folder: { select: { courseId: true } } } } } },
      aiGrade: {
        select: {
          id: true,
          status: true,
          score: true,
          maxPoints: true,
          verdict: true,
          feedback: true,
          appliedAt: true,
          explanation: true,
          explanationKey: true,
        },
      },
    },
  });
  if (!answer) return { ok: false, code: "NOT_FOUND" };

  const mode = await activeCourseMode(answer.result.quiz.folder?.courseId);
  const source = officialSource(answer, answer.aiGrade);
  if (mode === "off" && source !== "AI") return { ok: false, code: "AI_DISABLED" };
  if (!(await platformEssayAIEnabled())) return { ok: false, code: "AI_DISABLED" };

  const guideRow = await prisma.quizQuestionGradingGuide.findUnique({
    where: { questionId },
    select: { referenceAnswer: true, rubric: true, maxPoints: true },
  });
  const guide = guideOf(guideRow);
  if (!guide || !hasUsableCriteria(guide)) return { ok: false, code: "NO_CRITERIA" };

  const ai = answer.aiGrade;
  const aiCompleted = ai?.status === "COMPLETED" && ai.score !== null && ai.maxPoints !== null && !!ai.verdict;
  if (answer.status === "PENDING" && !aiCompleted) return { ok: false, code: "NOT_GRADED_YET" };

  const key = explanationKey(answer, ai);
  if (ai?.explanation && ai.explanationKey === key) {
    const cached = safeParse<Explanation>(ai.explanation);
    if (cached) return { ok: true, explanation: cached, cached: true };
  }

  // Daily per-student cap. Attempts count (not just successes), so a request
  // that keeps failing cannot be used to burn provider credit.
  const limit = await getConfigNumberClamped("ai_essay_explain_daily_limit", 1, 500);
  const used = await prisma.essayAIGrade.count({
    where: { answer: { studentId }, explanationAt: { gte: new Date(Date.now() - 24 * 3_600_000) } },
  });
  if (used >= limit) return { ok: false, code: "RATE_LIMITED" };

  // Explanations are cached on the answer's EssayAIGrade row; answers graded
  // before AI was enabled get a SKIPPED placeholder row to hold the cache.
  const gradeRow =
    ai ??
    (await prisma.essayAIGrade.upsert({
      where: { answerId: answer.id },
      create: { answerId: answer.id, status: "SKIPPED", skipReason: "NOT_GRADED", mode },
      update: {},
      select: { id: true },
    }));

  const now = new Date();
  const claimed = await prisma.essayAIGrade.updateMany({
    where: {
      id: gradeRow.id,
      OR: [{ explanationClaimedAt: null }, { explanationClaimedAt: { lt: new Date(now.getTime() - GENERATION_CLAIM_MS) } }],
    },
    data: { explanationClaimedAt: now, explanationAt: now },
  });
  if (claimed.count === 0) return { ok: false, code: "IN_PROGRESS" };

  const feedback = safeParse<EssayFeedback>(ai?.feedback);
  const prompt = buildExplanationPrompt({
    question: answer.question,
    answer: (answer.essayAnswer ?? "").trim() || "(empty answer)",
    guide,
    officialStatus: answer.status,
    officialSource: source,
    teacherReply: answer.teacherReply,
    aiGrade:
      aiCompleted && feedback
        ? { score: ai!.score!, maxPoints: ai!.maxPoints!, verdict: ai!.verdict as Verdict, feedback }
        : null,
  });

  try {
    let explanation: Explanation;
    if (deps.complete) {
      explanation = validateExplanation(parseModelJson((await deps.complete(prompt.system, prompt.user)).text));
    } else {
      explanation = (
        await withProviderFallback(async (p) => {
          const out = await completeWithProvider(p, { system: prompt.system, user: prompt.user, maxTokens: EXPLAIN_MAX_TOKENS, temperature: 0.2, json: true });
          return validateExplanation(parseModelJson(out.text));
        })
      ).value;
    }
    await prisma.essayAIGrade.update({
      where: { id: gradeRow.id },
      data: { explanation: JSON.stringify(explanation), explanationKey: key, explanationClaimedAt: null },
    });
    return { ok: true, explanation, cached: false };
  } catch (err) {
    console.warn("[essay-ai] explanation failed:", err instanceof Error ? err.message : err);
    await prisma.essayAIGrade.update({ where: { id: gradeRow.id }, data: { explanationClaimedAt: null } });
    return { ok: false, code: "FAILED" };
  }
}

// ── "How do students get full marks?" ────────────────────────────────────────

export type StrongAnswerOutcome =
  | { ok: true; exemplar: Exemplar; fullMarkSharePercent: number | null; cached: boolean }
  | { ok: false; code: "NOT_FOUND" | "RETAKE_OPEN" | "AI_DISABLED" | "NO_CRITERIA" | "IN_PROGRESS" | "FAILED" };

/**
 * Teaches what a strong answer contains WITHOUT exposing any classmate's
 * answer: the example is generated from the teacher's own guide (no student
 * text is ever sent to the model for it), cached per guide version, and the
 * only cohort data is a rounded full-marks percentage over ≥ MIN_COHORT graded
 * answers. Available only after the student's own attempt is final, so it can
 * never serve as an answer key for an open attempt.
 */
export async function getStrongAnswerInsight(
  studentId: string,
  quizId: string,
  questionId: string,
  deps: { complete?: (system: string, user: string) => Promise<{ text: string }> } = {}
): Promise<StrongAnswerOutcome> {
  const own = await prisma.quizAnswer.findFirst({
    where: { studentId, quizId, questionId, questionType: "essay", result: { studentId, completedAt: { not: null } } },
    select: {
      question: true,
      result: { select: { allowRetake: true, quiz: { select: { folder: { select: { courseId: true } } } } } },
    },
  });
  if (!own) return { ok: false, code: "NOT_FOUND" };
  if (own.result.allowRetake) return { ok: false, code: "RETAKE_OPEN" };

  const mode = await activeCourseMode(own.result.quiz.folder?.courseId);
  if (mode === "off") return { ok: false, code: "AI_DISABLED" };

  const guideRow = await prisma.quizQuestionGradingGuide.findUnique({
    where: { questionId },
    select: { id: true, referenceAnswer: true, rubric: true, maxPoints: true, exemplar: true, exemplarKey: true },
  });
  const guide = guideOf(guideRow);
  if (!guideRow || !guide || !hasUsableCriteria(guide)) return { ok: false, code: "NO_CRITERIA" };

  const question = await prisma.quizQuestion.findUnique({ where: { id: questionId }, select: { question: true } });
  const questionText = question?.question ?? own.question;

  // Aggregate only — no names, ids, text or timestamps of other students.
  const [graded, approved] = await Promise.all([
    prisma.quizAnswer.count({
      where: {
        questionId,
        questionType: "essay",
        status: { in: ["APPROVED", "DISAPPROVED"] },
        result: { completedAt: { not: null }, student: { accountMode: { not: "TESTER" } } },
      },
    }),
    prisma.quizAnswer.count({
      where: {
        questionId,
        questionType: "essay",
        status: "APPROVED",
        result: { completedAt: { not: null }, student: { accountMode: { not: "TESTER" } } },
      },
    }),
  ]);
  const share = fullMarkShare(graded, approved);

  const key = guideFingerprint(questionText, guide);
  if (guideRow.exemplar && guideRow.exemplarKey === key) {
    const cached = safeParse<Exemplar>(guideRow.exemplar);
    if (cached) return { ok: true, exemplar: cached, fullMarkSharePercent: share, cached: true };
  }

  // One generation per guide version, shared by every student. The claim is
  // kept on failure so a failing provider is retried at most once a minute.
  const now = new Date();
  const claimed = await prisma.quizQuestionGradingGuide.updateMany({
    where: {
      id: guideRow.id,
      OR: [{ exemplarClaimedAt: null }, { exemplarClaimedAt: { lt: new Date(now.getTime() - GENERATION_CLAIM_MS) } }],
    },
    data: { exemplarClaimedAt: now },
  });
  if (claimed.count === 0) return { ok: false, code: "IN_PROGRESS" };

  const prompt = buildExemplarPrompt(questionText, guide);
  try {
    let exemplar: Exemplar;
    if (deps.complete) {
      exemplar = validateExemplar(parseModelJson((await deps.complete(prompt.system, prompt.user)).text));
    } else {
      exemplar = (
        await withProviderFallback(async (p) => {
          const out = await completeWithProvider(p, { system: prompt.system, user: prompt.user, maxTokens: EXEMPLAR_MAX_TOKENS, temperature: 0.3, json: true });
          return validateExemplar(parseModelJson(out.text));
        })
      ).value;
    }
    // Only store if the guide was not edited while we were generating.
    await prisma.quizQuestionGradingGuide.updateMany({
      where: { id: guideRow.id, referenceAnswer: guide.referenceAnswer, rubric: guide.rubric, maxPoints: guide.maxPoints },
      data: { exemplar: JSON.stringify(exemplar), exemplarKey: key, exemplarClaimedAt: null },
    });
    return { ok: true, exemplar, fullMarkSharePercent: share, cached: false };
  } catch (err) {
    console.warn("[essay-ai] exemplar failed:", err instanceof Error ? err.message : err);
    return { ok: false, code: "FAILED" };
  }
}

// ── Teacher retry ────────────────────────────────────────────────────────────

/** Teacher-triggered retry of a FAILED evaluation (ownership checked by the route). */
export async function retryFailedGrade(answerId: string): Promise<boolean> {
  const res = await prisma.essayAIGrade.updateMany({
    where: { answerId, status: "FAILED" },
    data: { status: "PENDING", attempts: 0, claimedAt: null, lastError: null },
  });
  if (res.count === 0) return false;
  const a = await prisma.quizAnswer.findUnique({ where: { id: answerId }, select: { resultId: true } });
  if (a) kickEssayGrading(a.resultId);
  return true;
}
