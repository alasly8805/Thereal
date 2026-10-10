"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

type VideoQuestion = {
  id: string;
  timestamp?: number;
  triggerSecond?: number;
  mode?: string;
  question?: string;
  questionText?: string;
  options?: string[];
  optionA?: string | null;
  optionB?: string | null;
  optionC?: string | null;
  optionD?: string | null;
};

export function VideoQuestionOverlay({
  question,
  videoId,
  onAnswered,
  onDismiss,
}: {
  question: VideoQuestion;
  videoId: string;
  watchSessionId?: string;
  currentSecond?: number;
  onAnswered: (result: { isCorrect: boolean; attempts: number }) => void;
  onDismiss: () => void;
}) {
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{
    isCorrect: boolean;
    attempts: number;
    explanation?: string | null;
  } | null>(null);

  const optionsList: string[] = Array.isArray(question.options) && question.options.length >= 2
    ? question.options
    : [question.optionA, question.optionB, question.optionC, question.optionD]
        .filter((o): o is string => typeof o === "string" && o.trim().length > 0);

  const submit = async () => {
    if (selectedIdx === null || submitting) return;
    setSubmitting(true);

    try {
      const res = await fetch("/api/videos/questions/check", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          questionId: question.id,
          selectedIndex: selectedIdx,
        }),
      });
      const data = await res.json();
      setResult({
        isCorrect: data.isCorrect ?? false,
        attempts: data.attempts ?? 1,
        explanation: data.explanation ?? null,
      });
    } catch {
      setSubmitting(false);
    }
  };

  const dismiss = () => {
    onAnswered(result || { isCorrect: false, attempts: 1 });
  };

  const letters = ["أ", "ب", "ج", "د"];

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 20, scale: 0.95 }}
        className="absolute bottom-16 right-4 z-40 w-80 max-w-[calc(100%-2rem)] bg-slate-900/95 border border-slate-700/80 rounded-2xl p-4 shadow-2xl backdrop-blur-md"
        dir="rtl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-2 mb-2">
          <span className="text-xs font-bold text-sky-400 flex items-center gap-1.5">
            <span>❓</span>
            <span>سؤال سريع</span>
          </span>
          <button
            onClick={onDismiss}
            aria-label="إغلاق السؤال"
            className="text-slate-400 hover:text-white text-xs cursor-pointer"
          >
            ✕
          </button>
        </div>

        <p className="text-xs font-bold text-white mb-3">
          {question.question || question.questionText}
        </p>

        <div className="space-y-1.5 mb-3">
          {optionsList.map((opt, i) => {
            const isChosen = selectedIdx === i;
            let optStyle = "border-slate-800 bg-slate-800/60 text-slate-200 hover:border-slate-700";
            if (result) {
              if (isChosen) {
                optStyle = result.isCorrect
                  ? "border-emerald-500 bg-emerald-500/20 text-emerald-300"
                  : "border-rose-500 bg-rose-500/20 text-rose-300";
              } else {
                optStyle = "border-slate-800 bg-slate-900/40 text-slate-500 opacity-50";
              }
            } else if (isChosen) {
              optStyle = "border-sky-500 bg-sky-500/20 text-white";
            }

            return (
              <button
                key={i}
                type="button"
                disabled={!!result}
                onClick={() => setSelectedIdx(i)}
                className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-lg border text-right text-xs transition-colors cursor-pointer ${optStyle}`}
              >
                <span className="w-5 h-5 rounded bg-black/40 flex items-center justify-center font-bold text-[10px] shrink-0">
                  {letters[i] || (i + 1)}
                </span>
                <span className="flex-1">{opt}</span>
              </button>
            );
          })}
        </div>

        {result && (
          <div className={`p-2 rounded-lg text-xs font-bold mb-2.5 ${result.isCorrect ? "bg-emerald-500/15 text-emerald-300" : "bg-rose-500/15 text-rose-300"}`}>
            <p>{result.isCorrect ? "✓ إجابة صحيحة!" : "✗ إجابة غير صحيحة"}</p>
            {result.explanation && <p className="text-[11px] font-normal mt-1 opacity-90">{result.explanation}</p>}
          </div>
        )}

        {!result ? (
          <button
            type="button"
            onClick={submit}
            disabled={selectedIdx === null || submitting}
            className="w-full py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold transition-colors disabled:opacity-50 cursor-pointer"
          >
            {submitting ? "جارٍ التحقق..." : "إرسال الإجابة"}
          </button>
        ) : (
          <button
            type="button"
            onClick={dismiss}
            className="w-full py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold transition-colors cursor-pointer"
          >
            إغلاق
          </button>
        )}
      </motion.div>
    </AnimatePresence>
  );
}
