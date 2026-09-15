"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Student-facing AI essay feedback. Everything rendered here is plain text
 * (React escapes it); model output is never injected as HTML.
 *
 * Visual rule: the OFFICIAL grade and the AI's PRELIMINARY evaluation are
 * always visually separate and labelled, so a student never mistakes an AI
 * suggestion for the teacher's grade.
 */

type Feedback = {
  summary: string;
  criteria: Array<{ index: number; criterion: string; met: "yes" | "partial" | "no"; evidence: string }>;
  correctPoints: string[];
  missingPoints: string[];
  misconceptions: string[];
  improvements: string[];
  fullMarkGuidance: string;
};

type Explanation = {
  whyThisResult: string;
  whatYouDidWell: string[];
  whatWasMissing: string[];
  howToGetFullMarks: string;
  nextTime: string[];
  certainty: "clear" | "uncertain";
  uncertaintyNote: string;
};

type Exemplar = { keyElements: string[]; exampleAnswer: string; pitfalls: string[]; tips: string[] };

export type EssayAIItem = {
  answerId: string;
  questionId: string;
  official: { status: string; source: "TEACHER" | "AI" | null; teacherReply: string | null };
  ai: null | {
    status: "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED" | "SKIPPED";
    skipReason: string | null;
    score: number | null;
    maxPoints: number | null;
    verdict: string | null;
    confidence: "high" | "medium" | "low" | null;
    needsReview: boolean;
    feedback: Feedback | null;
  };
  explanation: Explanation | null;
  hasCriteria: boolean;
};

export type EssayFeedbackState = {
  aiEnabled: boolean;
  inProgress: boolean;
  items: EssayAIItem[];
};

const POLL_MS = 4000;
const MAX_POLLS = 30;

/** Loads the student's own essay feedback; polls while AI evaluation runs. */
export function useEssayFeedback(quizId: string, enabled: boolean) {
  const [state, setState] = useState<EssayFeedbackState | null>(null);
  const polls = useRef(0);

  const load = useCallback(async (): Promise<EssayFeedbackState | null> => {
    try {
      const res = await fetch(`/api/quizzes/${quizId}/essay-feedback`, { credentials: "include", cache: "no-store" });
      if (!res.ok) return null;
      const data = (await res.json()) as EssayFeedbackState;
      setState(data);
      return data;
    } catch {
      return null;
    }
  }, [quizId]);

  useEffect(() => {
    if (!enabled || !quizId) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    polls.current = 0;
    const tick = async () => {
      const data = await load();
      if (cancelled) return;
      if (data?.inProgress && polls.current < MAX_POLLS) {
        polls.current += 1;
        timer = setTimeout(tick, POLL_MS);
      }
    };
    void tick();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [enabled, quizId, load]);

  return { state, reload: load };
}

const SKIP_TEXT: Record<string, string> = {
  NO_CRITERIA: "سيصحح المعلم هذا السؤال يدوياً.",
  EMPTY_ANSWER: "لم تكتب إجابة لهذا السؤال.",
  TOO_LONG: "إجابتك طويلة جداً للتقييم الآلي — سيصححها المعلم يدوياً.",
  DISABLED: "سيصحح المعلم هذا السؤال يدوياً.",
  NOT_GRADED: "سيصحح المعلم هذا السؤال يدوياً.",
};

function List({ title, items, tone }: { title: string; items: string[]; tone: "good" | "bad" | "warn" | "tip" }) {
  if (!items.length) return null;
  const color =
    tone === "good"
      ? "text-emerald-700 dark:text-emerald-300"
      : tone === "bad"
        ? "text-rose-700 dark:text-rose-300"
        : tone === "warn"
          ? "text-amber-700 dark:text-amber-300"
          : "text-sky-700 dark:text-sky-300";
  return (
    <div>
      <p className={`mb-1 text-xs font-bold ${color}`}>{title}</p>
      <ul className="list-disc space-y-1 pe-1 ps-5 text-sm leading-relaxed text-slate-700 dark:text-slate-300">
        {items.map((t, i) => (
          <li key={i}>{t}</li>
        ))}
      </ul>
    </div>
  );
}

export function EssayAIPanel({ quizId, item, aiEnabled }: { quizId: string; item: EssayAIItem | undefined; aiEnabled: boolean }) {
  const [fetchedExplanation, setExplanation] = useState<Explanation | null>(null);
  const [explaining, setExplaining] = useState(false);
  const [explainError, setExplainError] = useState("");
  const [exemplar, setExemplar] = useState<{ exemplar: Exemplar; share: number | null } | null>(null);
  const [loadingExemplar, setLoadingExemplar] = useState(false);
  const [exemplarError, setExemplarError] = useState("");

  const explanation = fetchedExplanation ?? item?.explanation ?? null;

  if (!item) return null;
  const { official, ai } = item;
  const showAI = aiEnabled || official.source === "AI";
  // Courses without AI grading keep exactly the existing essay UI.
  if (!showAI) return null;

  const decided = official.status === "APPROVED" || official.status === "DISAPPROVED";
  const aiDone = ai?.status === "COMPLETED";
  const canExplain = showAI && item.hasCriteria && (decided || aiDone);
  const canExemplar = aiEnabled && item.hasCriteria;

  const explain = async () => {
    setExplaining(true);
    setExplainError("");
    try {
      const res = await fetch(`/api/quizzes/${quizId}/essay-feedback/explain`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questionId: item.questionId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) setExplainError(data.error || "تعذر تجهيز الشرح");
      else setExplanation(data.explanation);
    } catch {
      setExplainError("تعذر الاتصال بالخادم");
    } finally {
      setExplaining(false);
    }
  };

  const loadExemplar = async () => {
    setLoadingExemplar(true);
    setExemplarError("");
    try {
      const res = await fetch(`/api/quizzes/${quizId}/essay-feedback/strong-answer`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questionId: item.questionId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) setExemplarError(data.error || "تعذر تجهيز المثال");
      else setExemplar({ exemplar: data.exemplar, share: typeof data.fullMarkSharePercent === "number" ? data.fullMarkSharePercent : null });
    } catch {
      setExemplarError("تعذر الاتصال بالخادم");
    } finally {
      setLoadingExemplar(false);
    }
  };

  return (
    <div className="space-y-3">
      {decided && official.source && (
        <p className="text-xs font-bold text-slate-500 dark:text-slate-400">
          {official.source === "AI"
            ? "🤖 صُحِّحت هذه الإجابة تلقائياً بالذكاء الاصطناعي — يمكن للمعلم مراجعتها وتعديلها."
            : "👨‍🏫 الدرجة الرسمية من تصحيح المعلم."}
        </p>
      )}

      {showAI && ai && (ai.status === "PENDING" || ai.status === "PROCESSING") && (
        <div className="flex items-center gap-2 rounded-2xl border border-sky-200 bg-sky-50 p-3 text-sm font-bold text-sky-700 dark:border-sky-900/40 dark:bg-sky-950/30 dark:text-sky-300" role="status">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-sky-500 border-t-transparent" aria-hidden />
          جارٍ التقييم المبدئي لإجابتك بالذكاء الاصطناعي…
        </div>
      )}

      {showAI && ai?.status === "FAILED" && (
        <p className="rounded-2xl border border-slate-200 bg-white/80 p-3 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-800/70 dark:text-slate-300">
          تعذر التقييم الآلي لهذه الإجابة. لا تقلق — إجابتك محفوظة وسيصححها المعلم.
        </p>
      )}

      {showAI && ai?.status === "SKIPPED" && !decided && (
        <p className="text-xs text-slate-500 dark:text-slate-400">{SKIP_TEXT[ai.skipReason ?? ""] ?? SKIP_TEXT.NOT_GRADED}</p>
      )}

      {showAI && aiDone && ai?.feedback && (
        <div className="space-y-3 rounded-2xl border border-sky-200 bg-sky-50/70 p-4 dark:border-sky-900/40 dark:bg-sky-950/20">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-black text-sky-800 dark:text-sky-200">🤖 تقييم مبدئي بالذكاء الاصطناعي</span>
            {ai.score !== null && ai.maxPoints !== null && (
              <span className="rounded-lg bg-white px-2 py-0.5 text-sm font-black text-slate-900 dark:bg-slate-900 dark:text-white" dir="ltr">
                {ai.score} / {ai.maxPoints}
              </span>
            )}
            {official.source !== "AI" && (
              <span className="rounded-lg bg-slate-200 px-2 py-0.5 text-[11px] font-bold text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                ليس الدرجة الرسمية
              </span>
            )}
          </div>
          {(ai.confidence === "low" || ai.needsReview) && !decided && (
            <p className="text-xs font-bold text-amber-700 dark:text-amber-300">
              هذا التقييم غير مؤكد تماماً وسيراجعه المعلم — لا تعتبره نهائياً.
            </p>
          )}
          <p className="text-sm leading-relaxed text-slate-800 dark:text-slate-200">{ai.feedback.summary}</p>
          {ai.feedback.criteria.length > 0 && (
            <ul className="space-y-1 text-sm">
              {ai.feedback.criteria.map((c) => (
                <li key={c.index} className="flex gap-2 text-slate-700 dark:text-slate-300">
                  <span aria-label={c.met === "yes" ? "متحقق" : c.met === "partial" ? "متحقق جزئياً" : "غير متحقق"}>
                    {c.met === "yes" ? "✅" : c.met === "partial" ? "🟡" : "⬜"}
                  </span>
                  <span>{c.criterion}</span>
                </li>
              ))}
            </ul>
          )}
          <List title="✓ ما أصبت فيه" items={ai.feedback.correctPoints} tone="good" />
          <List title="✕ ما ينقص إجابتك" items={ai.feedback.missingPoints} tone="bad" />
          <List title="⚠ أخطاء في الفهم" items={ai.feedback.misconceptions} tone="warn" />
          <List title="💡 كيف تحسّن إجابتك" items={ai.feedback.improvements} tone="tip" />
          {ai.feedback.fullMarkGuidance && (
            <div>
              <p className="mb-1 text-xs font-bold text-violet-700 dark:text-violet-300">🎯 إجابة الدرجة الكاملة تحتوي على</p>
              <p className="text-sm leading-relaxed text-slate-700 dark:text-slate-300">{ai.feedback.fullMarkGuidance}</p>
            </div>
          )}
        </div>
      )}

      {(canExplain || canExemplar) && (
        <div className="flex flex-wrap gap-2">
          {canExplain && !explanation && (
            <button
              onClick={() => void explain()}
              disabled={explaining}
              className="rounded-xl bg-sky-600 px-4 py-2 text-xs font-bold text-white hover:bg-sky-500 disabled:opacity-60"
            >
              {explaining ? "جارٍ تجهيز الشرح…" : "💬 اشرح لي درجتي"}
            </button>
          )}
          {canExemplar && !exemplar && (
            <button
              onClick={() => void loadExemplar()}
              disabled={loadingExemplar}
              className="rounded-xl border border-violet-300 px-4 py-2 text-xs font-bold text-violet-700 hover:bg-violet-50 disabled:opacity-60 dark:border-violet-800 dark:text-violet-300 dark:hover:bg-violet-950/40"
            >
              {loadingExemplar ? "جارٍ التجهيز…" : "🏆 كيف يحصل الطلاب على الدرجة الكاملة؟"}
            </button>
          )}
        </div>
      )}
      {explainError && <p className="text-xs font-bold text-rose-600 dark:text-rose-400">{explainError}</p>}
      {exemplarError && <p className="text-xs font-bold text-rose-600 dark:text-rose-400">{exemplarError}</p>}

      {explanation && (
        <div className="space-y-3 rounded-2xl border border-slate-200 bg-white/80 p-4 dark:border-slate-700 dark:bg-slate-800/70">
          <p className="text-sm font-black text-slate-900 dark:text-white">💬 لماذا حصلت على هذه النتيجة؟</p>
          {explanation.certainty === "uncertain" && (
            <p className="text-xs font-bold text-amber-700 dark:text-amber-300">
              ⚠ الشرح غير مؤكد تماماً{explanation.uncertaintyNote ? `: ${explanation.uncertaintyNote}` : ""} — اسأل المعلم للتأكد.
            </p>
          )}
          <p className="text-sm leading-relaxed text-slate-700 dark:text-slate-300">{explanation.whyThisResult}</p>
          <List title="ما فعلته بشكل صحيح" items={explanation.whatYouDidWell} tone="good" />
          <List title="ما كان ناقصاً" items={explanation.whatWasMissing} tone="bad" />
          {explanation.howToGetFullMarks && (
            <div>
              <p className="mb-1 text-xs font-bold text-violet-700 dark:text-violet-300">كيف تصل للدرجة الكاملة</p>
              <p className="text-sm leading-relaxed text-slate-700 dark:text-slate-300">{explanation.howToGetFullMarks}</p>
            </div>
          )}
          <List title="في المرة القادمة" items={explanation.nextTime} tone="tip" />
          <p className="text-[11px] text-slate-500 dark:text-slate-400">شرح آلي مبني على معايير المعلم ودرجتك الفعلية — قرار المعلم هو النهائي.</p>
        </div>
      )}

      {exemplar && (
        <div className="space-y-3 rounded-2xl border border-violet-200 bg-violet-50/70 p-4 dark:border-violet-900/40 dark:bg-violet-950/20">
          <p className="text-sm font-black text-violet-800 dark:text-violet-200">🏆 ماذا تحتوي إجابة الدرجة الكاملة؟</p>
          {exemplar.share !== null && (
            <p className="text-xs font-bold text-slate-600 dark:text-slate-300">
              حصل حوالي {exemplar.share}% من الطلاب على الدرجة الكاملة في هذا السؤال.
            </p>
          )}
          <List title="العناصر الأساسية" items={exemplar.exemplar.keyElements} tone="good" />
          <div>
            <p className="mb-1 text-xs font-bold text-slate-600 dark:text-slate-300">مثال لإجابة كاملة</p>
            <p className="whitespace-pre-wrap rounded-xl border border-violet-200 bg-white/80 p-3 text-sm leading-relaxed text-slate-800 dark:border-violet-900/40 dark:bg-slate-900/60 dark:text-slate-200">
              {exemplar.exemplar.exampleAnswer}
            </p>
          </div>
          <List title="أخطاء شائعة تُفقد الدرجة" items={exemplar.exemplar.pitfalls} tone="warn" />
          <List title="نصائح للكتابة" items={exemplar.exemplar.tips} tone="tip" />
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            مثال تعليمي كتبه الذكاء الاصطناعي من معايير المعلم — ليس إجابة طالب حقيقي. أي صياغة أخرى بنفس المعنى مقبولة.
          </p>
        </div>
      )}
    </div>
  );
}
