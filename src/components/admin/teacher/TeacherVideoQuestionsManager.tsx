"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { useToast } from "@/components/ui/Toast";
import {
  HelpCircle,
  Play,
  Trash2,
  Clock,
  CheckCircle2,
  AlertCircle,
  Move,
  Eye,
  RotateCcw,
  Sparkles,
} from "lucide-react";
import { VideoQuestionModal, VideoQuestionItem } from "@/components/player/VideoQuestionModal";

interface Props {
  videoId: string;
  videoTitle: string;
  videoDurationMinutes?: number;
  videoProvider?: string;
  providerVideoId?: string;
  onCountChange?: (count: number) => void;
}

interface AdminQuestionItem {
  id: string;
  timestamp: number;
  triggerSecond?: number;
  question: string;
  questionText?: string;
  options: string[];
  correctIndex: number;
  correctOption?: string;
  explanation?: string | null;
  isRequired: boolean;
  mode: string;
  createdAt: string;
  analytics?: {
    totalResponses: number;
    correctPercent: number;
  };
}

const fmtTime = (seconds: number) => {
  const s = Math.max(0, Math.floor(seconds));
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${String(sec).padStart(2, "0")}`;
};

export function TeacherVideoQuestionsManager({
  videoId,
  videoTitle,
  videoDurationMinutes = 45,
  onCountChange,
}: Props) {
  const { success: toastSuccess, error: toastError } = useToast();

  const [questions, setQuestions] = useState<AdminQuestionItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Add Question Form State
  const [questionText, setQuestionText] = useState("");
  const [optionsCount, setOptionsCount] = useState<2 | 3 | 4>(4);
  const [options, setOptions] = useState<string[]>(["", "", "", ""]);
  const [correctIndex, setCorrectIndex] = useState<number>(0);
  const [explanation, setExplanation] = useState("");
  const [isRequired, setIsRequired] = useState(true);
  const [timestampSeconds, setTimestampSeconds] = useState<number>(60);
  const [manualTimeInput, setManualTimeInput] = useState<string>("01:00");

  // Timeline dragging state
  const timelineRef = useRef<HTMLDivElement>(null);
  const [isDraggingNew, setIsDraggingNew] = useState(false);
  const [draggingQuestionId, setDraggingQuestionId] = useState<string | null>(null);

  // Preview Mode State
  const [previewActive, setPreviewActive] = useState(false);
  const [previewQuestion, setPreviewQuestion] = useState<VideoQuestionItem | null>(null);

  const totalDurationSeconds = Math.max(60, (videoDurationMinutes || 45) * 60);

  // Load questions
  const loadQuestions = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/videos/${videoId}/questions`, {
        credentials: "include",
      });
      const data = await res.json();
      if (res.ok && Array.isArray(data.questions)) {
        setQuestions(data.questions);
        onCountChange?.(data.questions.length);
      }
    } catch {
      toastError("تعذر تحميل أسئلة الفيديو");
    } finally {
      setLoading(false);
    }
  }, [videoId, toastError, onCountChange]);

  useEffect(() => {
    void loadQuestions();
  }, [loadQuestions]);

  // Update manual time input when timestamp changes
  const updateTimestamp = (seconds: number) => {
    const clamped = Math.max(0, Math.min(totalDurationSeconds, Math.round(seconds)));
    setTimestampSeconds(clamped);
    setManualTimeInput(fmtTime(clamped));
  };

  // Handle manual input text changes
  const handleManualTimeChange = (val: string) => {
    setManualTimeInput(val);
    if (val.includes(":")) {
      const parts = val.split(":");
      const m = parseInt(parts[0], 10);
      const s = parseInt(parts[1], 10);
      if (!isNaN(m) && !isNaN(s)) {
        setTimestampSeconds(Math.max(0, Math.min(totalDurationSeconds, m * 60 + s)));
      }
    } else {
      const s = parseInt(val, 10);
      if (!isNaN(s)) {
        setTimestampSeconds(Math.max(0, Math.min(totalDurationSeconds, s)));
      }
    }
  };

  // Timeline scrubbing for new question
  const handleTimelineInteraction = (clientX: number) => {
    if (!timelineRef.current) return;
    const rect = timelineRef.current.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const seconds = ratio * totalDurationSeconds;
    updateTimestamp(seconds);
  };

  // Timeline scrubbing for an existing question being dragged
  const handleQuestionDragInteraction = (clientX: number, qId: string) => {
    if (!timelineRef.current) return;
    const rect = timelineRef.current.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const newSeconds = Math.max(0, Math.min(totalDurationSeconds, Math.round(ratio * totalDurationSeconds)));

    // Optimistically update local questions
    setQuestions((prev) =>
      prev.map((q) => (q.id === qId ? { ...q, timestamp: newSeconds } : q))
    );
  };

  // Save dragged question timestamp
  const saveQuestionTimestamp = async (qId: string, newSeconds: number) => {
    try {
      const res = await fetch(`/api/admin/videos/${videoId}/questions`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          questionId: qId,
          timestamp: newSeconds,
        }),
      });
      if (res.ok) {
        toastSuccess(`تم تحديث توقيت السؤال إلى ${fmtTime(newSeconds)} ✅`);
      } else {
        await loadQuestions();
      }
    } catch {
      await loadQuestions();
    }
  };

  // Global mouse move and mouse up for dragging
  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (isDraggingNew) {
        handleTimelineInteraction(e.clientX);
      } else if (draggingQuestionId) {
        handleQuestionDragInteraction(e.clientX, draggingQuestionId);
      }
    };

    const onMouseUp = () => {
      if (isDraggingNew) {
        setIsDraggingNew(false);
      }
      if (draggingQuestionId) {
        const targetQ = questions.find((q) => q.id === draggingQuestionId);
        if (targetQ) {
          void saveQuestionTimestamp(targetQ.id, targetQ.timestamp);
        }
        setDraggingQuestionId(null);
      }
    };

    if (isDraggingNew || draggingQuestionId) {
      window.addEventListener("mousemove", onMouseMove);
      window.addEventListener("mouseup", onMouseUp);
      return () => {
        window.removeEventListener("mousemove", onMouseMove);
        window.removeEventListener("mouseup", onMouseUp);
      };
    }
  }, [isDraggingNew, draggingQuestionId, totalDurationSeconds, questions]);

  // Adjust options array when optionsCount changes
  const handleOptionsCountChange = (count: 2 | 3 | 4) => {
    setOptionsCount(count);
    if (correctIndex >= count) {
      setCorrectIndex(count - 1);
    }
    setOptions((prev) => {
      const next = [...prev];
      while (next.length < count) next.push("");
      return next.slice(0, count);
    });
  };

  const updateOptionText = (index: number, text: string) => {
    setOptions((prev) => {
      const next = [...prev];
      next[index] = text;
      return next;
    });
  };

  // Submit New Question
  const handleAddQuestion = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!questionText.trim()) {
      toastError("يرجى كتابة نص السؤال");
      return;
    }

    const activeOpts = options.slice(0, optionsCount).map((o) => o.trim());
    if (activeOpts.some((o) => !o)) {
      toastError(`يرجى كتابة جميع الاختيارات (${optionsCount} اختيارات)`);
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`/api/admin/videos/${videoId}/questions`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          timestamp: timestampSeconds,
          question: questionText.trim(),
          options: activeOpts,
          correctIndex,
          isRequired,
          explanation: explanation.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        toastSuccess("تم إضافة السؤال التفاعلي بنجاح! 🎯");
        setQuestionText("");
        setOptions(["", "", "", ""]);
        setExplanation("");
        setCorrectIndex(0);
        updateTimestamp(Math.min(totalDurationSeconds, timestampSeconds + 60));
        await loadQuestions();
      } else {
        toastError(data.error || "تعذر إضافة السؤال");
      }
    } catch {
      toastError("حدث خطأ أثناء الاتصال بالخادم");
    } finally {
      setSubmitting(false);
    }
  };

  // Delete Question
  const handleDeleteQuestion = async (qId: string) => {
    if (!window.confirm("هل أنت متأكد من حذف هذا السؤال التفاعلي؟")) return;
    try {
      const res = await fetch(`/api/admin/videos/${videoId}/questions`, {
        method: "DELETE",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questionId: qId }),
      });
      if (res.ok) {
        toastSuccess("تم حذف السؤال");
        await loadQuestions();
      } else {
        const d = await res.json();
        toastError(d.error || "تعذر حذف السؤال");
      }
    } catch {
      toastError("حدث خطأ أثناء الحذف");
    }
  };

  // Start Interactive Preview Mode
  const startPreview = (q?: AdminQuestionItem) => {
    const targetQ = q || questions[0];
    if (!targetQ) {
      toastError("لا توجد أسئلة لتجربتها، أضف سؤالاً أولاً");
      return;
    }

    console.log("🧪 [TeacherPreview] Initializing interactive questions preview for video:", {
      videoId,
      videoTitle,
      questionId: targetQ.id,
      timestamp: targetQ.timestamp,
    });

    setPreviewQuestion({
      id: targetQ.id,
      timestamp: targetQ.timestamp,
      question: targetQ.question || targetQ.questionText || "",
      options: targetQ.options,
      isRequired: targetQ.isRequired,
      explanation: targetQ.explanation || undefined,
    });
    setPreviewActive(true);
  };

  return (
    <div className="space-y-6 text-slate-800 dark:text-slate-200" dir="rtl">
      {/* ── Top Bar: Header & Preview Action ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
        <div className="flex items-center gap-3">
          <span className="w-10 h-10 rounded-xl bg-sky-500/10 text-sky-500 flex items-center justify-center shrink-0">
            <HelpCircle className="w-5 h-5" />
          </span>
          <div>
            <h4 className="font-bold text-sm sm:text-base text-slate-900 dark:text-white">
              نظام الأسئلة التفاعلية داخل الفيديو
            </h4>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              تظهر للطالب أثناء تشغيل الفيديو في الثانية المحددة وتمنع تخطي الفيديو دون إجابة
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Test Questions as Student Button */}
          <button
            type="button"
            onClick={() => startPreview()}
            disabled={questions.length === 0}
            className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-sky-500 to-indigo-600 hover:from-sky-600 hover:to-indigo-700 text-white text-xs font-black shadow-md flex items-center gap-2 cursor-pointer transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Play className="w-4 h-4 fill-white" />
            <span>جرب الأسئلة كطالب 🎯</span>
          </button>
        </div>
      </div>

      {/* ── 1. Video Timeline Scrubber & Drag Zone ── */}
      <div className="p-4 sm:p-5 rounded-2xl bg-slate-900 text-white border border-slate-800 space-y-3.5 shadow-md">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-sky-400" />
            <span className="text-xs font-bold text-white">
              الجدول الزمني للأسئلة على مدار الفيديو (Timeline)
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400">توقيت السؤال الجديد:</span>
            <span className="text-xs font-mono font-black px-2 py-0.5 rounded-lg bg-sky-500/20 text-sky-300 border border-sky-500/30">
              ⏱️ {manualTimeInput} ({timestampSeconds}ث)
            </span>
          </div>
        </div>

        {/* The Interactive Visual Track */}
        <div className="relative pt-6 pb-2">
          <div
            ref={timelineRef}
            onMouseDown={(e) => {
              setIsDraggingNew(true);
              handleTimelineInteraction(e.clientX);
            }}
            className="relative h-4 bg-slate-800 rounded-full cursor-pointer select-none overflow-visible border border-slate-700/80"
          >
            {/* Filled progress up to new question timestamp */}
            <div
              className="absolute top-0 bottom-0 left-0 bg-sky-500/40 rounded-full pointer-events-none"
              style={{
                width: `${(timestampSeconds / totalDurationSeconds) * 100}%`,
              }}
            />

            {/* Existing Questions Pins on the Timeline */}
            {questions.map((q) => {
              const qRatio = Math.max(0, Math.min(1, q.timestamp / totalDurationSeconds));
              const isSelectedPin = draggingQuestionId === q.id;

              return (
                <div
                  key={q.id}
                  style={{ left: `${qRatio * 100}%` }}
                  onMouseDown={(e) => {
                    e.stopPropagation();
                    setDraggingQuestionId(q.id);
                  }}
                  title={`اسحب لتغيير التوقيت: ${q.question || q.questionText} (${fmtTime(q.timestamp)})`}
                  className={`absolute top-1/2 -translate-x-1/2 -translate-y-1/2 z-20 cursor-grab active:cursor-grabbing group ${
                    isSelectedPin ? "scale-125 z-30" : ""
                  }`}
                >
                  <div className="w-5 h-5 rounded-full bg-amber-500 border-2 border-white shadow-md flex items-center justify-center text-[9px] font-black text-slate-950 transition-transform group-hover:scale-125">
                    ❓
                  </div>
                  {/* Tooltip on Hover */}
                  <div className="absolute bottom-6 left-1/2 -translate-x-1/2 hidden group-hover:flex flex-col items-center bg-slate-950 text-white border border-slate-700 text-[10px] px-2.5 py-1 rounded-lg whitespace-nowrap shadow-xl pointer-events-none z-30">
                    <span className="font-bold truncate max-w-[150px]">
                      {q.question || q.questionText}
                    </span>
                    <span className="text-amber-400 font-mono font-bold">
                      ⏱️ {fmtTime(q.timestamp)} (اسحب لتعديل المكان)
                    </span>
                  </div>
                </div>
              );
            })}

            {/* New Question Target Handle */}
            <div
              style={{
                left: `${(timestampSeconds / totalDurationSeconds) * 100}%`,
              }}
              className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 z-10 pointer-events-none"
            >
              <div className="w-6 h-6 rounded-full bg-sky-400 border-2 border-white shadow-[0_0_12px_rgba(56,189,248,0.8)] flex items-center justify-center animate-pulse">
                <div className="w-2 h-2 rounded-full bg-white" />
              </div>
            </div>
          </div>

          {/* Timeline Time Labels */}
          <div className="flex justify-between text-[10px] text-slate-400 mt-2 font-mono">
            <span>00:00</span>
            <span>{fmtTime(totalDurationSeconds * 0.25)}</span>
            <span>{fmtTime(totalDurationSeconds * 0.5)}</span>
            <span>{fmtTime(totalDurationSeconds * 0.75)}</span>
            <span>{fmtTime(totalDurationSeconds)}</span>
          </div>
        </div>

        <p className="text-[11px] text-slate-400 flex items-center gap-1.5 pt-1 border-t border-slate-800">
          <Move className="w-3.5 h-3.5 text-amber-400" />
          <span>
            اسحب المؤشر الأزرق لتحديد وقت السؤال الجديد، أو اسحب أي علامة سؤال صفراء لتعديل توقيتها فوراً.
          </span>
        </p>
      </div>

      {/* ── 2. Add Question Form (Dynamic 2, 3, 4 Options + Radio Correct Answer) ── */}
      <form
        onSubmit={handleAddQuestion}
        className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4"
      >
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
          <h5 className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-sky-500" />
            <span>+ إضافة سؤال تفاعلي جديد</span>
          </h5>

          {/* Options Count Dynamic Selector: 2, 3, 4 */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-600 dark:text-slate-400">
              عدد الاختيارات:
            </span>
            <div className="flex rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden p-0.5 bg-slate-50 dark:bg-slate-800">
              {[2, 3, 4].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => handleOptionsCountChange(n as 2 | 3 | 4)}
                  className={`px-3 py-1 rounded-md text-xs font-black transition-all cursor-pointer ${
                    optionsCount === n
                      ? "bg-sky-500 text-white shadow-xs"
                      : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                  }`}
                >
                  {n} اختيارات
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {/* Question Text */}
          <div className="sm:col-span-2">
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
              نص السؤال *
            </label>
            <input
              type="text"
              required
              placeholder="اكتب السؤال بوضوح للطالب..."
              value={questionText}
              onChange={(e) => setQuestionText(e.target.value)}
              className="w-full px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs sm:text-sm focus:border-sky-500 focus:outline-none"
            />
          </div>

          {/* Manual Timestamp Input */}
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
              توقيت الظهور (MM:SS أو ثواني) *
            </label>
            <input
              type="text"
              required
              dir="ltr"
              value={manualTimeInput}
              onChange={(e) => handleManualTimeChange(e.target.value)}
              placeholder="مثال: 02:30"
              className="w-full px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs sm:text-sm font-mono font-bold focus:border-sky-500 focus:outline-none text-center"
            />
          </div>
        </div>

        {/* Dynamic Options List with Radio Button Selection */}
        <div className="space-y-2 pt-2">
          <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
            الخيارات (اختر الإجابة الصحيحة بالضغط على الدائرة الخضراء) *
          </label>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {Array.from({ length: optionsCount }).map((_, i) => {
              const isCorrectChoice = correctIndex === i;
              const letters = ["أ", "ب", "ج", "د"];

              return (
                <div
                  key={i}
                  className={`flex items-center gap-2 p-2 rounded-xl border-2 transition-all ${
                    isCorrectChoice
                      ? "border-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/30"
                      : "border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950"
                  }`}
                >
                  {/* Radio Button for selecting correct answer */}
                  <label
                    className="flex items-center gap-1.5 cursor-pointer select-none shrink-0"
                    title="حدد هذا الخيار كإجابة صحيحة"
                  >
                    <input
                      type="radio"
                      name="correctOptionRadio"
                      checked={isCorrectChoice}
                      onChange={() => setCorrectIndex(i)}
                      className="w-4 h-4 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                    />
                    <span
                      className={`w-6 h-6 rounded-lg text-xs font-black flex items-center justify-center ${
                        isCorrectChoice
                          ? "bg-emerald-500 text-white"
                          : "bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400"
                      }`}
                    >
                      {letters[i]}
                    </span>
                  </label>

                  <input
                    type="text"
                    required
                    placeholder={`نص الاختيار (${letters[i]})...`}
                    value={options[i] || ""}
                    onChange={(e) => updateOptionText(i, e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-transparent text-xs font-medium focus:outline-none"
                  />

                  {isCorrectChoice && (
                    <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 shrink-0 px-1.5 py-0.5 rounded bg-emerald-500/10">
                      صحيح ✓
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Explanation & Options */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
          <div className="sm:col-span-2">
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
              التفسير / الشرح للطالب بعد الإجابة (يظهر إذا أخطأ أو نجح)
            </label>
            <input
              type="text"
              placeholder="اكتب شرحاً مبسطاً لسبب هذه الإجابة..."
              value={explanation}
              onChange={(e) => setExplanation(e.target.value)}
              className="w-full px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs focus:border-sky-500 focus:outline-none"
            />
          </div>

          <div className="flex items-center gap-3 pt-4">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={isRequired}
                onChange={(e) => setIsRequired(e.target.checked)}
                className="w-4 h-4 rounded text-sky-600 focus:ring-sky-500"
              />
              <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                سؤال إجباري (يوقف الفيديو)
              </span>
            </label>
          </div>
        </div>

        {/* Submit Button */}
        <div className="pt-2 flex justify-end">
          <button
            type="submit"
            disabled={submitting}
            className="px-6 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold shadow-md transition-all cursor-pointer disabled:opacity-50 flex items-center gap-2"
          >
            {submitting ? (
              <>
                <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <span>جارٍ الحفظ...</span>
              </>
            ) : (
              <>
                <span>حفظ السؤال التفاعلي ✓</span>
              </>
            )}
          </button>
        </div>
      </form>

      {/* ── 3. Questions List Table / Cards ── */}
      <div className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-3">
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2.5">
          <h5 className="font-bold text-xs sm:text-sm text-slate-900 dark:text-white flex items-center gap-2">
            <span>الأسئلة التفاعلية المضافة ({questions.length})</span>
            {loading && (
              <span className="w-3.5 h-3.5 border-2 border-sky-500/30 border-t-sky-500 rounded-full animate-spin" />
            )}
          </h5>
          <span className="text-xs text-slate-500">
            يمكنك اختبار أي سؤال فوراً بالضغط على &quot;اختبر السؤال&quot;
          </span>
        </div>

        {questions.length === 0 ? (
          <div className="text-center py-8 text-slate-400 text-xs">
            لا توجد أسئلة تفاعلية مضافة لهذا الفيديو بعد. أضف أول سؤال من النموذج أعلاه.
          </div>
        ) : (
          <div className="space-y-3">
            {questions.map((q, idx) => {
              const letters = ["أ", "ب", "ج", "د"];
              return (
                <div
                  key={q.id}
                  className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/50 space-y-2.5 hover:border-slate-300 dark:hover:border-slate-700 transition-all"
                >
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-xs font-black px-2.5 py-0.5 rounded-lg bg-sky-500/15 text-sky-600 dark:text-sky-400 border border-sky-500/30">
                        ⏱️ {fmtTime(q.timestamp)}
                      </span>
                      <span className="text-xs font-bold text-slate-500">#{idx + 1}</span>
                      {q.isRequired && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-rose-500/10 text-rose-500 border border-rose-500/20">
                          إجباري للمتابعة
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      {/* Test Individual Question Button */}
                      <button
                        type="button"
                        onClick={() => startPreview(q)}
                        className="px-2.5 py-1 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-xs font-bold transition-all flex items-center gap-1 cursor-pointer"
                        title="اختبر هذا السؤال كطالب"
                      >
                        <Eye className="w-3 h-3" />
                        <span>اختبر السؤال 🎯</span>
                      </button>

                      {/* Delete Button */}
                      <button
                        type="button"
                        onClick={() => handleDeleteQuestion(q.id)}
                        className="p-1 rounded-lg text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors cursor-pointer"
                        title="حذف هذا السؤال"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <p className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white">
                    {q.question || q.questionText}
                  </p>

                  {/* Options List */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-xs">
                    {q.options.map((opt, optIdx) => {
                      const isCorrect = q.correctIndex === optIdx;
                      return (
                        <div
                          key={optIdx}
                          className={`p-1.5 px-2 rounded-lg flex items-center gap-1.5 border ${
                            isCorrect
                              ? "bg-emerald-500/10 border-emerald-500/40 text-emerald-700 dark:text-emerald-300 font-bold"
                              : "border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400"
                          }`}
                        >
                          <span className="w-4 h-4 rounded bg-black/10 dark:bg-white/10 flex items-center justify-center font-bold text-[10px]">
                            {letters[optIdx]}
                          </span>
                          <span className="flex-1 truncate">{opt}</span>
                          {isCorrect && <span>✓</span>}
                        </div>
                      );
                    })}
                  </div>

                  {q.explanation && (
                    <div className="text-[11px] text-amber-600 dark:text-amber-400 bg-amber-50/50 dark:bg-amber-950/30 p-2 rounded-lg border border-amber-200 dark:border-amber-900/40">
                      💡 <strong>الشرح:</strong> {q.explanation}
                    </div>
                  )}

                  {/* Analytics */}
                  {q.analytics && q.analytics.totalResponses > 0 && (
                    <div className="pt-2 border-t border-slate-200 dark:border-slate-800 flex items-center gap-4 text-[10px] text-slate-500">
                      <span>إجمالي إجابات الطلاب: <strong>{q.analytics.totalResponses}</strong></span>
                      <span>نسبة الإجابة الصحيحة: <strong className="text-emerald-600">{q.analytics.correctPercent}%</strong></span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── 4. Live Student Preview Modal ("جرب الأسئلة") ── */}
      {previewActive && previewQuestion && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="relative w-full max-w-xl bg-slate-950 rounded-2xl border border-slate-800 overflow-hidden shadow-2xl">
            {/* Top Toolbar in Preview */}
            <div className="p-3 bg-slate-900 border-b border-slate-800 flex items-center justify-between text-white text-xs">
              <span className="font-bold flex items-center gap-1.5 text-amber-400">
                <span>🧪 وضع المعاينة التفاعلي كطالب</span>
              </span>
              <button
                type="button"
                onClick={() => setPreviewActive(false)}
                className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold cursor-pointer"
              >
                إغلاق المعاينة ✕
              </button>
            </div>

            {/* Simulated Player View with VideoQuestionModal */}
            <div className="relative aspect-video bg-black flex items-center justify-center overflow-hidden">
              <div className="text-center p-6 space-y-2">
                <div className="w-12 h-12 rounded-full bg-slate-800 flex items-center justify-center mx-auto text-xl">
                  🎬
                </div>
                <p className="text-xs text-slate-400 font-bold">{videoTitle}</p>
                <p className="text-[11px] text-slate-500 font-mono">
                  تم إيقاف الفيديو عند التوقيت {fmtTime(previewQuestion.timestamp)} لعرض السؤال
                </p>
              </div>

              {/* The Actual Video Question Modal Rendered */}
              <VideoQuestionModal
                question={previewQuestion}
                videoId={videoId}
                onAnswered={(result) => {
                  console.log("🧪 [TeacherPreview] Question answer completed:", {
                    questionId: previewQuestion.id,
                    isCorrect: result.isCorrect,
                    attempts: result.attempts,
                  });
                  toastSuccess(
                    result.isCorrect
                      ? "أحسنت! إجابة صحيحة في المعاينة"
                      : "تم تجربة الإجابة الخاطئة والشرح في المعاينة"
                  );
                  setPreviewActive(false);
                }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default TeacherVideoQuestionsManager;
