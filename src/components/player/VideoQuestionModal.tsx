"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

/**
 * Hardened In-Video Interactive Question Modal.
 *
 * Protections:
 * 1. Blocks playback until answered or explanation understood.
 * 2. Background blur (backdrop-blur-md).
 * 3. Prevents context menu (right click) and developer shortcuts.
 * 4. Never exposes correctIndex locally — validates via POST /api/videos/questions/check.
 * 5. Rate limits to max 2 attempts per question.
 * 6. Supports 2, 3, or 4 dynamic options.
 */

export type VideoQuestionItem = {
  id: string;
  timestamp?: number;
  triggerSecond?: number;
  question?: string;
  questionText?: string;
  options?: string[];
  optionA?: string | null;
  optionB?: string | null;
  optionC?: string | null;
  optionD?: string | null;
  isRequired?: boolean;
  explanation?: string | null;
  answered?: boolean;
};

interface CheckResponse {
  isCorrect: boolean;
  attempts: number;
  maxAttempts: number;
  canRetry: boolean;
  canContinue: boolean;
  explanation?: string | null;
  message?: string;
}

export function VideoQuestionModal({
  question,
  videoId,
  onAnswered,
}: {
  question: VideoQuestionItem;
  videoId: string;
  watchSessionId?: string;
  currentSecond?: number;
  onAnswered: (result: { isCorrect: boolean; attempts: number }) => void;
}) {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [checkResult, setCheckResult] = useState<CheckResponse | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Normalize options array (supports 2, 3, or 4 options)
  const optionsList: string[] = Array.isArray(question.options) && question.options.length >= 2
    ? question.options
    : [question.optionA, question.optionB, question.optionC, question.optionD]
        .filter((o): o is string => typeof o === "string" && o.trim().length > 0);

  const questionTitle = (question.question || question.questionText || "").trim();
  const timeSeconds = typeof question.timestamp === "number" && question.timestamp >= 0
    ? question.timestamp
    : (question.triggerSecond || 0);
  const timeFormatted = `${Math.floor(timeSeconds / 60)}:${String(timeSeconds % 60).padStart(2, "0")}`;

  // DevTools deterrents & Right-click prevention while question is shown
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "F12") {
        e.preventDefault();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && ["I", "J", "C"].includes(e.key.toUpperCase())) {
        e.preventDefault();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toUpperCase() === "U") {
        e.preventDefault();
        return;
      }
    };

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, []);

  const handleSubmit = async () => {
    if (selectedIndex === null || submitting) return;
    setSubmitting(true);
    setErrorMsg(null);

    try {
      const res = await fetch("/api/videos/questions/check", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          questionId: question.id,
          selectedIndex,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error || "تعذر التحقق من الإجابة");
        setSubmitting(false);
        return;
      }

      setCheckResult(data);
    } catch {
      setErrorMsg("حدث خطأ في الاتصال بالخادم، يرجى المحاولة ثانية");
    } finally {
      setSubmitting(false);
    }
  };

  const handleContinue = () => {
    onAnswered({
      isCorrect: checkResult?.isCorrect ?? false,
      attempts: checkResult?.attempts ?? 1,
    });
  };

  const handleRetry = () => {
    setSelectedIndex(null);
    setCheckResult(null);
    setErrorMsg(null);
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/85 backdrop-blur-md select-none"
        onContextMenu={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
        onClick={(e) => e.stopPropagation()}
        dir="rtl"
      >
        <motion.div
          initial={{ scale: 0.92, y: 16 }}
          animate={{ scale: 1, y: 0 }}
          exit={{ scale: 0.92, y: 16 }}
          transition={{ type: "spring", damping: 26, stiffness: 340 }}
          className="bg-slate-900 border border-slate-700/80 rounded-2xl w-full max-w-lg p-5 sm:p-7 shadow-2xl max-h-[92vh] overflow-y-auto text-slate-100"
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-slate-800 pb-3.5 mb-4">
            <div className="flex items-center gap-2.5">
              <span className="w-9 h-9 rounded-xl bg-sky-500/15 border border-sky-500/30 text-sky-400 flex items-center justify-center text-lg">
                💡
              </span>
              <div>
                <h3 className="font-bold text-sm sm:text-base text-white">
                  سؤال تفاعلي أثناء المشاهدة
                </h3>
                <p className="text-[11px] text-slate-400 flex items-center gap-1.5 mt-0.5">
                  <span>⏱️ التوقيت: <strong className="font-mono text-slate-300">{timeFormatted}</strong></span>
                  {question.isRequired !== false && (
                    <span className="px-1.5 py-0.2 rounded bg-rose-500/20 text-rose-300 font-bold text-[10px]">
                      مطلوب للمتابعة
                    </span>
                  )}
                </p>
              </div>
            </div>

            {checkResult && (
              <span
                className={`text-xs font-bold px-2.5 py-1 rounded-full border ${
                  checkResult.isCorrect
                    ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-400"
                    : "bg-rose-500/15 border-rose-500/40 text-rose-400"
                }`}
              >
                {checkResult.isCorrect ? "✓ صحيح" : "✗ خطأ"}
              </span>
            )}
          </div>

          {/* Question Text */}
          <div className="mb-5">
            <p className="text-sm sm:text-base font-bold text-white leading-relaxed">
              {questionTitle}
            </p>
          </div>

          {/* Dynamic Options: 2, 3, or 4 options */}
          <div className="space-y-2.5 mb-5">
            {optionsList.map((opt, i) => {
              const isChosen = selectedIndex === i;
              let optionStyle =
                "border-slate-800 bg-slate-800/60 hover:bg-slate-800 hover:border-slate-700 text-slate-200";

              if (checkResult) {
                if (isChosen) {
                  optionStyle = checkResult.isCorrect
                    ? "border-emerald-500 bg-emerald-500/20 text-emerald-300 shadow-[0_0_15px_rgba(16,185,129,0.25)]"
                    : "border-rose-500 bg-rose-500/20 text-rose-300 shadow-[0_0_15px_rgba(244,63,94,0.25)]";
                } else {
                  optionStyle = "border-slate-800/80 bg-slate-900/50 text-slate-500 opacity-50";
                }
              } else if (isChosen) {
                optionStyle =
                  "border-sky-500 bg-sky-500/15 text-white ring-2 ring-sky-500/30";
              }

              const letters = ["أ", "ب", "ج", "د"];
              const letterLabel = letters[i] || String(i + 1);

              return (
                <button
                  key={i}
                  type="button"
                  disabled={submitting || (checkResult !== null && (checkResult.isCorrect || !checkResult.canRetry))}
                  onClick={() => {
                    if (!checkResult || checkResult.canRetry) {
                      setSelectedIndex(i);
                      if (checkResult) setCheckResult(null);
                    }
                  }}
                  className={`w-full flex items-center gap-3 p-3 sm:p-3.5 rounded-xl border-2 text-right transition-all cursor-pointer ${optionStyle}`}
                >
                  <span
                    className={`shrink-0 w-7 h-7 rounded-lg flex items-center justify-center text-xs font-black transition-colors ${
                      checkResult && isChosen && checkResult.isCorrect
                        ? "bg-emerald-500 text-white"
                        : checkResult && isChosen && !checkResult.isCorrect
                        ? "bg-rose-500 text-white"
                        : isChosen
                        ? "bg-sky-500 text-white"
                        : "bg-slate-800 text-slate-400 border border-slate-700"
                    }`}
                  >
                    {letterLabel}
                  </span>
                  <span className="text-xs sm:text-sm font-semibold flex-1 leading-snug">
                    {opt}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Feedback & Result Message */}
          {errorMsg && (
            <div className="p-3 mb-4 rounded-xl bg-rose-500/15 border border-rose-500/40 text-rose-300 text-xs font-bold text-center">
              {errorMsg}
            </div>
          )}

          {checkResult && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className={`p-4 rounded-xl mb-4 border ${
                checkResult.isCorrect
                  ? "bg-emerald-950/50 border-emerald-500/40 text-emerald-200"
                  : "bg-rose-950/50 border-rose-500/40 text-rose-200"
              }`}
            >
              <div className="flex items-center gap-2 font-bold text-sm mb-1">
                <span>{checkResult.isCorrect ? "🎉 برافو! إجابة صحيحة" : "❌ إجابة غير صحيحة"}</span>
              </div>

              {checkResult.message && (
                <p className="text-xs opacity-90 leading-relaxed mb-1.5">
                  {checkResult.message}
                </p>
              )}

              {/* Show explanation if provided */}
              {checkResult.explanation && (
                <div className="mt-2.5 pt-2 border-t border-white/10 text-xs leading-relaxed text-slate-300">
                  <span className="font-bold text-amber-300 block mb-1">💡 الشرح والتوضيح:</span>
                  <p className="bg-slate-900/60 p-2.5 rounded-lg border border-slate-800 text-slate-200">
                    {checkResult.explanation}
                  </p>
                </div>
              )}
            </motion.div>
          )}

          {/* Action Buttons */}
          <div className="pt-2">
            {!checkResult ? (
              <button
                type="button"
                onClick={handleSubmit}
                disabled={selectedIndex === null || submitting}
                className="w-full py-3.5 px-4 rounded-xl bg-sky-500 hover:bg-sky-400 text-white font-bold text-sm transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-[0_4px_16px_rgba(14,165,233,0.35)] cursor-pointer"
              >
                {submitting ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    جارٍ التحقق...
                  </span>
                ) : (
                  "تأكيد الإجابة ✓"
                )}
              </button>
            ) : checkResult.isCorrect ? (
              <button
                type="button"
                onClick={handleContinue}
                className="w-full py-3.5 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-white font-black text-sm transition-all shadow-[0_4px_16px_rgba(16,185,129,0.35)] flex items-center justify-center gap-2 cursor-pointer"
              >
                <span>كمل الفيديو ▶️</span>
              </button>
            ) : checkResult.canRetry ? (
              <div className="flex gap-2.5">
                <button
                  type="button"
                  onClick={handleRetry}
                  className="w-full py-3.5 px-4 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-sm transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer"
                >
                  <span>حاول تاني 🔄</span>
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={handleContinue}
                className="w-full py-3.5 px-4 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-sm transition-all shadow-[0_4px_16px_rgba(245,158,11,0.35)] flex items-center justify-center gap-2 cursor-pointer"
              >
                <span>فهمت، كمل بعد الشرح ▶️</span>
              </button>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

export default VideoQuestionModal;
