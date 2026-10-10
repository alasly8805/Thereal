"use client";

import React, { useState, useRef } from "react";
import { useToast } from "@/components/ui/Toast";
import {
  X,
  Plus,
  Trash2,
  Upload,
  Download,
  HelpCircle,
  BookOpen,
  Code,
  Link as LinkIcon,
  Paperclip,
  FileText,
  Sparkles,
  Copy,
} from "lucide-react";
import {
  TeacherJSONGuideModal,
  downloadJsonFile,
  sampleQuizData,
  sampleHomeworkData,
} from "./TeacherJSONGuideModal";

export function TimedCloseFields({
  enableAutoClose,
  closeAt,
  onEnableChange,
  onCloseAtChange,
}: {
  enableAutoClose: boolean;
  closeAt: string;
  onEnableChange: (value: boolean) => void;
  onCloseAtChange: (value: string) => void;
}) {
  return (
    <div className="space-y-2 rounded-2xl border border-rose-200/80 dark:border-rose-900/40 bg-rose-50/40 dark:bg-rose-950/20 p-3">
      <label className="flex items-center gap-2 text-xs font-bold text-slate-700 dark:text-slate-300 cursor-pointer">
        <input
          type="checkbox"
          checked={enableAutoClose}
          onChange={(e) => onEnableChange(e.target.checked)}
          className="w-4 h-4 rounded"
        />
        إغلاق تلقائي بعد الوقت المحدد
      </label>
      <div>
        <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 mb-1">
          وقت الإغلاق (close_at)
        </label>
        <input
          type="datetime-local"
          value={closeAt}
          onChange={(e) => onCloseAtChange(e.target.value)}
          disabled={!enableAutoClose}
          className="w-full px-3.5 py-2 rounded-xl border border-slate-200 bg-slate-50 text-xs font-mono text-slate-900 outline-none focus:border-rose-500 focus:bg-white dark:border-slate-800 dark:bg-slate-950 dark:text-white disabled:opacity-50"
          dir="ltr"
        />
        <p className="mt-1 text-[10px] text-slate-500 dark:text-slate-400">
          بعد هذا الوقت يُغلق الاختبار/الواجب. الدعم الفني يمكنه إعادة الفتح لطالب أو للجميع.
        </p>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. ADD QUIZ MODAL
// ─────────────────────────────────────────────────────────────────────────────

export interface QuizQuestion {
  question: string;
  imageUrl?: string;
  optionA: string;
  optionB: string;
  optionC: string;
  optionD: string;
  correctAnswer: string;
  questionType?: "mcq" | "essay";
  optionsCount?: 2 | 3 | 4;
  /** Points this question is worth. Default 1. */
  degree?: number;
  /** Exam model number (1, 2, ...). Default 1. */
  modelNumber?: number;
}

export function exportQuizToJson(quiz: { title?: string; timeLimitMinutes?: number; questions?: any[] }) {
  const data = {
    title: quiz.title || "اختبار",
    timeLimitMinutes: quiz.timeLimitMinutes || 30,
    questions: (quiz.questions || []).map((q: any) => {
      const isEssay = q.questionType === "essay";
      const item: Record<string, any> = {
        question: q.question || "",
        questionType: isEssay ? "essay" : "mcq",
      };
      if (q.imageUrl) item.imageUrl = q.imageUrl;
      if (!isEssay) {
        item.optionA = q.optionA || "";
        item.optionB = q.optionB || "";
        if (q.optionC?.trim()) item.optionC = q.optionC.trim();
        if (q.optionD?.trim()) item.optionD = q.optionD.trim();
        item.correctAnswer = q.correctAnswer || "A";
      }
      if (typeof q.degree === "number" && q.degree !== 1) item.degree = q.degree;
      return item;
    }),
  };
  const safeTitle = (quiz.title || "quiz").replace(/[/\\?%*:|"<>]/g, "-").trim();
  downloadJsonFile(`${safeTitle}.json`, data);
}

export function exportHomeworkToJson(hw: { title?: string; description?: string | null; type: string; timeLimitMinutes?: number; questions?: any[] }) {
  const data = {
    title: hw.title || "واجب",
    description: hw.description || "",
    type: hw.type || "exam",
    timeLimitMinutes: hw.timeLimitMinutes || 30,
    questions: (hw.questions || []).map((q: any) => {
      const item: Record<string, any> = {
        question: q.question || "",
      };
      if (q.imageUrl) item.imageUrl = q.imageUrl;
      item.optionA = q.optionA || "";
      item.optionB = q.optionB || "";
      if (q.optionC?.trim()) item.optionC = q.optionC.trim();
      if (q.optionD?.trim()) item.optionD = q.optionD.trim();
      item.correctAnswer = q.correctAnswer || "A";
      if (typeof q.degree === "number" && q.degree !== 1) item.degree = q.degree;
      return item;
    }),
  };
  const safeTitle = (hw.title || "homework").replace(/[/\\?%*:|"<>]/g, "-").trim();
  downloadJsonFile(`${safeTitle}.json`, data);
}

export interface AddQuizModalProps {
  isOpen: boolean;
  folderId: string;
  folderName: string;
  onClose: () => void;
  onSuccess: () => Promise<void>;
}

export function AddQuizModal({
  isOpen,
  folderId,
  folderName,
  onClose,
  onSuccess,
}: AddQuizModalProps) {
  const { success: toastSuccess, error: toastError } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [title, setTitle] = useState("");
  const [timeLimitMinutes, setTimeLimitMinutes] = useState(30);
  const [enableAutoClose, setEnableAutoClose] = useState(false);
  const [closeAt, setCloseAt] = useState("");
  const [hideAnswersUntilEssayGraded, setHideAnswersUntilEssayGraded] = useState(false);
  const [quizModels, setQuizModels] = useState<number[]>([1]);
  const [activeQuizModel, setActiveQuizModel] = useState<number>(1);
  const [showGuide, setShowGuide] = useState(false);
  const [questions, setQuestions] = useState<QuizQuestion[]>([
    {
      question: "",
      imageUrl: "",
      questionType: "mcq",
      optionsCount: 4,
      optionA: "",
      optionB: "",
      optionC: "",
      optionD: "",
      correctAnswer: "A",
      degree: 1,
      modelNumber: 1,
    },
  ]);
  const [submitting, setSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleAddQuestion = () => {
    setQuestions((prev) => [
      ...prev,
      {
        question: "",
        imageUrl: "",
        questionType: "mcq",
        optionsCount: 4,
        optionA: "",
        optionB: "",
        optionC: "",
        optionD: "",
        correctAnswer: "A",
        degree: 1,
        modelNumber: activeQuizModel,
      },
    ]);
  };

  const handleAddQuizModel = () => {
    const nextModel = (quizModels.length > 0 ? Math.max(...quizModels) : 0) + 1;
    setQuizModels((prev) => [...prev, nextModel]);
    setActiveQuizModel(nextModel);
    setQuestions((prev) => [
      ...prev,
      {
        question: "",
        imageUrl: "",
        questionType: "mcq",
        optionsCount: 4,
        optionA: "",
        optionB: "",
        optionC: "",
        optionD: "",
        correctAnswer: "A",
        degree: 1,
        modelNumber: nextModel,
      },
    ]);
  };

  const handleRemoveQuizModel = (m: number) => {
    if (m === 1) return;
    setQuizModels((prev) => prev.filter((item) => item !== m));
    setQuestions((prev) => prev.filter((q) => (q.modelNumber || 1) !== m));
    setActiveQuizModel(1);
  };

  const handleCopyFromModel1 = () => {
    const model1Questions = questions.filter((q) => (q.modelNumber || 1) === 1);
    if (!model1Questions.length || !model1Questions.some((q) => q.question.trim())) {
      toastError("لا توجد أسئلة مكتوبة في نموذج 1 لنسخها");
      return;
    }
    const cloned = model1Questions.map((q) => ({
      ...q,
      modelNumber: activeQuizModel,
    }));
    setQuestions((prev) => [
      ...prev.filter((q) => (q.modelNumber || 1) !== activeQuizModel),
      ...cloned,
    ]);
    toastSuccess(`تم نسخ ${cloned.length} سؤال من نموذج 1 إلى نموذج ${activeQuizModel} بنجاح ✅`);
  };

  const handleRemoveQuestion = (index: number) => {
    if (questions.length <= 1) {
      toastError("يجب أن يحتوي الاختبار على سؤال واحد على الأقل");
      return;
    }
    setQuestions((prev) => prev.filter((_, i) => i !== index));
  };

  const handleQuestionChange = (index: number, field: keyof QuizQuestion, value: any) => {
    setQuestions((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  };

  const handleSetOptionsCount = (index: number, count: 2 | 3 | 4) => {
    setQuestions((prev) => {
      const updated = [...prev];
      const q = { ...updated[index], optionsCount: count };
      if (count === 2 && (q.correctAnswer === "C" || q.correctAnswer === "D")) {
        q.correctAnswer = "A";
      } else if (count === 3 && q.correctAnswer === "D") {
        q.correctAnswer = "A";
      }
      updated[index] = q;
      return updated;
    });
  };

  const handleSetTrueFalse = (index: number) => {
    setQuestions((prev) => {
      const updated = [...prev];
      updated[index] = {
        ...updated[index],
        optionsCount: 2,
        optionA: "صح",
        optionB: "خطأ",
        correctAnswer: "A",
      };
      return updated;
    });
  };

  const handleJsonImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        const parsed = JSON.parse(text);
        let rawQuestions: unknown[] = [];
        let importedTitle = "";
        let importedTime = 30;

        if (Array.isArray(parsed)) {
          rawQuestions = parsed;
        } else if (parsed && typeof parsed === "object") {
          const obj = parsed as Record<string, unknown>;
          if (typeof obj.title === "string") importedTitle = obj.title;
          if (typeof obj.timeLimitMinutes === "number") importedTime = obj.timeLimitMinutes;
          if (Array.isArray(obj.questions)) rawQuestions = obj.questions;
        }

        if (!rawQuestions || rawQuestions.length === 0) {
          toastError("الملف لا يحتوي على أي أسئلة صحيحة");
          return;
        }

        const validQuestions: QuizQuestion[] = rawQuestions.map((q, idx) => {
          if (!q || typeof q !== "object") throw new Error(`السؤال ${idx + 1} بتنسيق غير صحيح`);
          const row = q as Record<string, unknown>;
          const qText = String(row.question || row.title || "").trim();
          if (!qText) throw new Error(`السؤال ${idx + 1} بدون نص`);
          const isEssay = row.questionType === "essay";
          const optA = isEssay ? "" : String(row.optionA || row.a || "").trim();
          const optB = isEssay ? "" : String(row.optionB || row.b || "").trim();
          const optC = isEssay ? "" : String(row.optionC || row.c || "").trim();
          const optD = isEssay ? "" : String(row.optionD || row.d || "").trim();

          let count: 2 | 3 | 4 = 4;
          if (!optD && !optC) count = 2;
          else if (!optD) count = 3;

          let correct = String(row.correctAnswer || "A").toUpperCase();
          if (count === 2 && !["A", "B"].includes(correct)) correct = "A";
          if (count === 3 && !["A", "B", "C"].includes(correct)) correct = "A";
          if (!["A", "B", "C", "D"].includes(correct)) correct = "A";

          return {
            question: qText,
            questionType: isEssay ? "essay" : "mcq",
            optionsCount: count,
            imageUrl: typeof row.imageUrl === "string" ? row.imageUrl.trim() : "",
            optionA: optA,
            optionB: optB,
            optionC: optC,
            optionD: optD,
            correctAnswer: isEssay ? "A" : correct,
            degree: Number(row.degree) > 0 ? Math.round(Number(row.degree)) : 1,
            modelNumber: typeof row.modelNumber === "number" ? row.modelNumber : activeQuizModel,
          };
        });

        if (importedTitle) setTitle(importedTitle);
        if (importedTime) setTimeLimitMinutes(importedTime);
        const importedModels = [...new Set(validQuestions.map((q) => q.modelNumber || 1))];
        setQuizModels(importedModels.length ? importedModels : [1]);
        setActiveQuizModel(importedModels[0] || 1);
        setQuestions(validQuestions);
        toastSuccess(`تم استيراد ${validQuestions.length} سؤال بنجاح ✅`);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "فشل قراءة ملف الـ JSON";
        toastError(message);
      }
    };
    reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      toastError("يرجى إدخال عنوان الاختبار");
      return;
    }

    // Validation
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      const modelNum = q.modelNumber || 1;
      if (!q.question.trim()) {
        toastError(`يرجى كتابة نص السؤال رقم ${i + 1} (النموذج ${modelNum})`);
        return;
      }
      if (q.questionType !== "essay") {
        if (!q.optionA.trim() || !q.optionB.trim()) {
          toastError(`يرجى كتابة الخيار (أ) والخيار (ب) للسؤال رقم ${i + 1} (النموذج ${modelNum})`);
          return;
        }
        const count = q.optionsCount ?? (q.optionD ? 4 : q.optionC ? 3 : 2);
        if (count >= 3 && !q.optionC.trim()) {
          toastError(`يرجى كتابة الخيار (ج) للسؤال رقم ${i + 1} (النموذج ${modelNum})`);
          return;
        }
        if (count === 4 && !q.optionD.trim()) {
          toastError(`يرجى كتابة الخيار (د) للسؤال رقم ${i + 1} (النموذج ${modelNum})`);
          return;
        }
      }
    }

    setSubmitting(true);
    try {
      const formattedQuestions = questions.map((q) => {
        const isEssay = q.questionType === "essay";
        const count = q.optionsCount ?? (q.optionD ? 4 : q.optionC ? 3 : 2);
        return {
          question: q.question.trim(),
          questionType: isEssay ? "essay" : "mcq",
          imageUrl: q.imageUrl?.trim() || "",
          optionA: isEssay ? "" : q.optionA.trim(),
          optionB: isEssay ? "" : q.optionB.trim(),
          optionC: isEssay || count < 3 ? "" : q.optionC.trim(),
          optionD: isEssay || count < 4 ? "" : q.optionD.trim(),
          correctAnswer: isEssay ? "A" : q.correctAnswer,
          degree: Number(q.degree) > 0 ? Math.round(Number(q.degree)) : 1,
          modelNumber: q.modelNumber || 1,
        };
      });

      const res = await fetch(`/api/admin/folders/${folderId}/quizzes`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          timeLimitMinutes: Number(timeLimitMinutes) || 30,
          enableAutoClose,
          closeAt: enableAutoClose ? closeAt : closeAt || undefined,
          hideAnswersUntilEssayGraded,
          questions: formattedQuestions,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        toastSuccess("تم إنشاء الاختبار بنجاح ✅");
        await onSuccess();
        onClose();
      } else {
        toastError(data.error || "تعذر إضافة الاختبار");
      }
    } catch {
      toastError("حدث خطأ أثناء الاتصال بالخادم");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-xs animate-in fade-in duration-150" dir="rtl">
        <div className="w-full max-w-2xl max-h-[92vh] rounded-3xl overflow-hidden flex flex-col shadow-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100">
          {/* Header */}
          <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-950/60">
            <div className="flex items-center gap-2.5">
              <span className="p-2 rounded-xl bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/20">
                <HelpCircle className="w-5 h-5" />
              </span>
              <div>
                <h3 className="text-sm sm:text-base font-black text-slate-900 dark:text-white">
                  إضافة اختبار جديد
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  المحاضرة: <strong className="text-sky-600 dark:text-sky-400">{folderName}</strong>
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 rounded-xl bg-slate-200/70 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 flex items-center justify-center transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Form Body */}
          <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2">
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  عنوان الاختبار *
                </label>
                <input
                  type="text"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="مثال: اختبار الفهم السريع للمحاضرة"
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-200 bg-slate-50 text-xs text-slate-900 outline-none focus:border-sky-500 focus:bg-white dark:border-slate-800 dark:bg-slate-950 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  المدة (بالدقائق) *
                </label>
                <input
                  type="number"
                  min={1}
                  max={240}
                  required
                  value={timeLimitMinutes}
                  onChange={(e) => setTimeLimitMinutes(Number(e.target.value))}
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-200 bg-slate-50 text-xs font-mono text-slate-900 outline-none focus:border-sky-500 focus:bg-white dark:border-slate-800 dark:bg-slate-950 dark:text-white"
                />
              </div>
            </div>

            <TimedCloseFields
              enableAutoClose={enableAutoClose}
              closeAt={closeAt}
              onEnableChange={setEnableAutoClose}
              onCloseAtChange={setCloseAt}
            />

            {/* Toggle: Hide answers until essay graded */}
            <div className="p-3.5 rounded-2xl bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-900/50">
              <label className="flex items-center gap-2.5 text-xs font-bold text-slate-800 dark:text-slate-200 cursor-pointer">
                <input
                  type="checkbox"
                  checked={hideAnswersUntilEssayGraded}
                  onChange={(e) => setHideAnswersUntilEssayGraded(e.target.checked)}
                  className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500"
                />
                <span>إخفاء الإجابات الصحيحة حتى تصحيح المقالي</span>
              </label>
              <p className="text-[11px] text-slate-600 dark:text-slate-400 mt-1 mr-6">
                عند تفعيل هذا الخيار: لن تظهر درجات الأسئلة أو الإجابات الصحيحة للطالب بعد التسليم حتى يقوم المعلم بتصحيح الأسئلة المقالية ورصد درجاتها.
              </p>
            </div>

            {/* Multi-Model Tabs */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-3 pt-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-bold text-slate-600 dark:text-slate-400">نماذج الاختبار:</span>
                <div className="flex items-center gap-1.5 p-1 bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl">
                  {quizModels.map((m) => {
                    const qCount = questions.filter((q) => (q.modelNumber || 1) === m).length;
                    const isActive = activeQuizModel === m;
                    return (
                      <div key={m} className="flex items-center">
                        <button
                          type="button"
                          onClick={() => setActiveQuizModel(m)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                            isActive
                              ? "bg-sky-600 text-white shadow-xs"
                              : "text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-white dark:hover:bg-slate-700"
                          }`}
                        >
                          <span>نموذج {m}</span>
                          <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${isActive ? "bg-white/20 text-white" : "bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300"}`}>
                            {qCount}
                          </span>
                        </button>
                        {m !== 1 && (
                          <button
                            type="button"
                            title={`حذف نموذج ${m}`}
                            onClick={() => handleRemoveQuizModel(m)}
                            className="mr-1 text-red-400 hover:text-red-600 text-xs px-1 cursor-pointer"
                          >
                            ✕
                          </button>
                        )}
                      </div>
                    );
                  })}
                  <button
                    type="button"
                    onClick={handleAddQuizModel}
                    className="px-2.5 py-1.5 rounded-lg text-xs font-bold text-sky-600 dark:text-sky-400 hover:bg-sky-50 dark:hover:bg-sky-950/50 transition-colors flex items-center gap-1 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>إضافة نموذج</span>
                  </button>
                </div>
              </div>

              {activeQuizModel !== 1 && (
                <button
                  type="button"
                  onClick={handleCopyFromModel1}
                  className="px-3 py-1.5 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-600 dark:text-amber-400 text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
                >
                  <Copy className="w-3.5 h-3.5" />
                  <span>نسخ أسئلة من نموذج 1</span>
                </button>
              )}
            </div>

            {/* JSON Bulk Import Banner */}
            <div className="p-3.5 rounded-2xl bg-sky-50 dark:bg-sky-950/30 border border-sky-200 dark:border-sky-900/50 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5">
              <div className="text-xs text-sky-800 dark:text-sky-300">
                <p className="font-bold flex items-center gap-1.5">
                  <Upload className="w-4 h-4" />
                  <span>استيراد الأسئلة دفعة واحدة من ملف JSON</span>
                </p>
                <p className="text-[11px] text-sky-700/80 dark:text-sky-400 mt-0.5">
                  يدعم خيارين (صح/خطأ)، ٣ خيارات، ٤ خيارات، والمقالي.
                </p>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".json,application/json"
                  onChange={handleJsonImport}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="px-3 py-1.5 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-xs font-bold transition-colors cursor-pointer shrink-0 shadow-xs flex items-center gap-1"
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>استيراد JSON</span>
                </button>
                <button
                  type="button"
                  onClick={() => downloadJsonFile("quiz_sample.json", sampleQuizData)}
                  className="px-3 py-1.5 rounded-xl bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 text-xs font-bold transition-colors cursor-pointer flex items-center gap-1"
                >
                  <Download className="w-3.5 h-3.5 text-sky-600" />
                  <span>تحميل نموذج JSON</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowGuide(true)}
                  className="px-3 py-1.5 rounded-xl bg-sky-100 dark:bg-sky-950/60 hover:bg-sky-200 dark:hover:bg-sky-900 text-sky-700 dark:text-sky-300 text-xs font-bold transition-colors cursor-pointer flex items-center gap-1"
                >
                  <HelpCircle className="w-3.5 h-3.5" />
                  <span>دليل الصياغة</span>
                </button>
              </div>
            </div>

            {/* Questions Header */}
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-2">
              <h4 className="text-xs font-black text-slate-900 dark:text-white flex items-center gap-2">
                <span>أسئلة نموذج {activeQuizModel}</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 font-mono font-bold">
                  {questions.filter((q) => (q.modelNumber || 1) === activeQuizModel).length} سؤال
                </span>
                <span className="text-[10px] text-slate-400">
                  (إجمالي كل النماذج: {questions.length})
                </span>
              </h4>
              <button
                type="button"
                onClick={handleAddQuestion}
                className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-200 text-xs font-bold transition-all flex items-center gap-1 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>إضافة سؤال</span>
              </button>
            </div>

            {/* Questions List */}
            <div className="space-y-4">
              {(() => {
                const activeQuestions = questions
                  .map((q, originalIdx) => ({ ...q, originalIdx }))
                  .filter((q) => (q.modelNumber || 1) === activeQuizModel);

                if (activeQuestions.length === 0) {
                  return (
                    <div className="p-8 text-center border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-2xl">
                      <p className="text-sm font-bold text-slate-600 dark:text-slate-400">
                        لا توجد أسئلة في نموذج {activeQuizModel} حتى الآن
                      </p>
                      <div className="mt-3 flex items-center justify-center gap-2 flex-wrap">
                        <button
                          type="button"
                          onClick={handleAddQuestion}
                          className="px-3 py-1.5 rounded-xl bg-sky-600 text-white text-xs font-bold transition-all flex items-center gap-1 cursor-pointer"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>إضافة سؤال في نموذج {activeQuizModel}</span>
                        </button>
                        {activeQuizModel !== 1 && (
                          <button
                            type="button"
                            onClick={handleCopyFromModel1}
                            className="px-3 py-1.5 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-600 dark:text-amber-400 text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
                          >
                            <Copy className="w-3.5 h-3.5" />
                            <span>نسخ أسئلة من نموذج 1</span>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                }

                return activeQuestions.map((q, displayIdx) => {
                  const idx = q.originalIdx;
                  const count = q.optionsCount ?? (q.optionD ? 4 : q.optionC ? 3 : 2);
                  const isEssay = q.questionType === "essay";

                return (
                  <div
                    key={idx}
                    className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/40 space-y-3 relative"
                  >
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono font-black text-sky-600 dark:text-sky-400">
                          السؤال #{displayIdx + 1}
                        </span>
                        <span className="text-[10px] px-2 py-0.5 rounded-md bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300 font-bold">
                          نموذج {activeQuizModel}
                        </span>

                        {/* Type toggle */}
                        <select
                          value={q.questionType || "mcq"}
                          onChange={(e) => handleQuestionChange(idx, "questionType", e.target.value)}
                          className="px-2 py-1 rounded-lg border border-slate-200 bg-white text-[11px] font-bold dark:border-slate-800 dark:bg-slate-900"
                        >
                          <option value="mcq">اختيار من متعدد (MCQ)</option>
                          <option value="essay">سؤال مقالي (تصحيح يدوي)</option>
                        </select>
                        <label className="flex items-center gap-1 text-[11px] font-bold text-slate-600 dark:text-slate-400">
                          <span>الدرجة</span>
                          <input
                            type="number"
                            min={1}
                            max={100}
                            value={q.degree ?? 1}
                            onChange={(e) => handleQuestionChange(idx, "degree", Number(e.target.value) || 1)}
                            className="w-14 px-2 py-1 rounded-lg border border-slate-200 bg-white text-[11px] font-mono font-bold dark:border-slate-800 dark:bg-slate-900"
                          />
                        </label>
                      </div>

                      <div className="flex items-center gap-2">
                        {!isEssay && (
                          <div className="flex items-center bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-0.5 text-[11px]">
                            <button
                              type="button"
                              onClick={() => handleSetOptionsCount(idx, 2)}
                              className={`px-2 py-1 rounded-lg font-bold transition-all cursor-pointer ${
                                count === 2
                                  ? "bg-sky-600 text-white shadow-xs"
                                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900"
                              }`}
                            >
                              خيارين (صح/خطأ)
                            </button>
                            <button
                              type="button"
                              onClick={() => handleSetOptionsCount(idx, 3)}
                              className={`px-2 py-1 rounded-lg font-bold transition-all cursor-pointer ${
                                count === 3
                                  ? "bg-sky-600 text-white shadow-xs"
                                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900"
                              }`}
                            >
                              ٣ خيارات
                            </button>
                            <button
                              type="button"
                              onClick={() => handleSetOptionsCount(idx, 4)}
                              className={`px-2 py-1 rounded-lg font-bold transition-all cursor-pointer ${
                                count === 4
                                  ? "bg-sky-600 text-white shadow-xs"
                                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900"
                              }`}
                            >
                              ٤ خيارات
                            </button>
                          </div>
                        )}

                        {questions.length > 1 && (
                          <button
                            type="button"
                            onClick={() => handleRemoveQuestion(idx)}
                            className="p-1.5 rounded-lg text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors cursor-pointer"
                            title="حذف هذا السؤال"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>

                    <div>
                      <input
                        type="text"
                        required
                        value={q.question}
                        onChange={(e) => handleQuestionChange(idx, "question", e.target.value)}
                        placeholder="اكتب نص السؤال هنا..."
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs text-slate-900 outline-none focus:border-sky-500 dark:border-slate-800 dark:bg-slate-900 dark:text-white"
                      />
                    </div>

                    {/* Image URL optional */}
                    <div className="flex gap-2 items-center">
                      <input
                        type="url"
                        value={q.imageUrl || ""}
                        onChange={(e) => handleQuestionChange(idx, "imageUrl", e.target.value)}
                        placeholder="رابط صورة توضيحية للسؤال https://... (اختياري)"
                        className="flex-1 px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-[11px] font-mono text-slate-900 outline-none focus:border-sky-500 dark:border-slate-800 dark:bg-slate-900 dark:text-white"
                        dir="ltr"
                      />
                      {count === 2 && !isEssay && (
                        <button
                          type="button"
                          onClick={() => handleSetTrueFalse(idx)}
                          className="px-2.5 py-1.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 text-[11px] font-bold shrink-0 transition-colors cursor-pointer"
                        >
                          ⚡ ملء تلقائي: صح / خطأ
                        </button>
                      )}
                    </div>

                    {isEssay ? (
                      <div className="p-3 bg-purple-500/10 border border-purple-500/20 rounded-xl text-xs text-purple-700 dark:text-purple-300 font-medium">
                        📝 سؤال مقالي: الطالب سيجيب بنص مقالي حر، وسيظهر لك في لوحة المعلم لمراجعته ورصد الدرجة.
                      </div>
                    ) : (
                      <>
                        <div className={`grid gap-2 ${count === 3 ? "grid-cols-1 sm:grid-cols-3" : "grid-cols-1 sm:grid-cols-2"}`}>
                          <div>
                            <label className="text-[11px] text-slate-500 block mb-0.5 font-bold">الخيار (أ)</label>
                            <input
                              type="text"
                              required
                              value={q.optionA}
                              onChange={(e) => handleQuestionChange(idx, "optionA", e.target.value)}
                              placeholder="أ) الخيار الأول"
                              className="w-full px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs dark:border-slate-800 dark:bg-slate-900"
                            />
                          </div>
                          <div>
                            <label className="text-[11px] text-slate-500 block mb-0.5 font-bold">الخيار (ب)</label>
                            <input
                              type="text"
                              required
                              value={q.optionB}
                              onChange={(e) => handleQuestionChange(idx, "optionB", e.target.value)}
                              placeholder="ب) الخيار الثاني"
                              className="w-full px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs dark:border-slate-800 dark:bg-slate-900"
                            />
                          </div>
                          {count >= 3 && (
                            <div>
                              <label className="text-[11px] text-slate-500 block mb-0.5 font-bold">الخيار (ج)</label>
                              <input
                                type="text"
                                required
                                value={q.optionC}
                                onChange={(e) => handleQuestionChange(idx, "optionC", e.target.value)}
                                placeholder="ج) الخيار الثالث"
                                className="w-full px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs dark:border-slate-800 dark:bg-slate-900"
                              />
                            </div>
                          )}
                          {count >= 4 && (
                            <div>
                              <label className="text-[11px] text-slate-500 block mb-0.5 font-bold">الخيار (د)</label>
                              <input
                                type="text"
                                required
                                value={q.optionD}
                                onChange={(e) => handleQuestionChange(idx, "optionD", e.target.value)}
                                placeholder="د) الخيار الرابع"
                                className="w-full px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs dark:border-slate-800 dark:bg-slate-900"
                              />
                            </div>
                          )}
                        </div>

                        <div className="flex items-center gap-3 pt-1">
                          <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                            الإجابة الصحيحة:
                          </label>
                          <select
                            value={q.correctAnswer}
                            onChange={(e) => handleQuestionChange(idx, "correctAnswer", e.target.value)}
                            className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-bold dark:border-slate-800 dark:bg-slate-900"
                          >
                            <option value="A">الخيار (أ) {q.optionA ? `— ${q.optionA.slice(0, 20)}` : ""}</option>
                            <option value="B">الخيار (ب) {q.optionB ? `— ${q.optionB.slice(0, 20)}` : ""}</option>
                            {count >= 3 && <option value="C">الخيار (ج) {q.optionC ? `— ${q.optionC.slice(0, 20)}` : ""}</option>}
                            {count >= 4 && <option value="D">الخيار (د) {q.optionD ? `— ${q.optionD.slice(0, 20)}` : ""}</option>}
                          </select>
                        </div>
                      </>
                    )}
                  </div>
                );
              });
            })()}
            </div>

            <button
              type="button"
              onClick={handleAddQuestion}
              className="w-full py-2.5 rounded-xl border border-dashed border-sky-300 dark:border-sky-800 bg-sky-50/50 dark:bg-sky-950/20 hover:bg-sky-50 dark:hover:bg-sky-950/40 text-sky-600 dark:text-sky-400 text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>إضافة سؤال جديد في نموذج {activeQuizModel}</span>
            </button>

            {/* Footer Submit Bar */}
            <div className="border-t border-slate-200 dark:border-slate-800 pt-4 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-bold transition-colors cursor-pointer"
              >
                إلغاء
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="px-5 py-2 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-xs font-bold transition-colors cursor-pointer disabled:opacity-50 shadow-sm"
              >
                {submitting ? "جارٍ الحفظ..." : "حفظ ونشر الاختبار"}
              </button>
            </div>
          </form>
        </div>
      </div>

      <TeacherJSONGuideModal
        isOpen={showGuide}
        onClose={() => setShowGuide(false)}
        initialTab="quiz"
      />
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. ADD HOMEWORK MODAL
// ─────────────────────────────────────────────────────────────────────────────

export interface AddHomeworkModalProps {
  isOpen: boolean;
  folderId: string;
  folderName: string;
  courseId: string;
  onClose: () => void;
  onSuccess: () => Promise<void>;
}

export function AddHomeworkModal({
  isOpen,
  folderId,
  folderName,
  courseId,
  onClose,
  onSuccess,
}: AddHomeworkModalProps) {
  const { success: toastSuccess, error: toastError } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [type, setType] = useState<"exam" | "terminal" | "upload" | "link">("exam");
  const [linkUrl, setLinkUrl] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [timeLimitMinutes, setTimeLimitMinutes] = useState(30);
  const [enableAutoClose, setEnableAutoClose] = useState(false);
  const [closeAt, setCloseAt] = useState("");
  const [isPublished, setIsPublished] = useState(true);
  const [showGuide, setShowGuide] = useState(false);

  // Terminal fields
  const [expectedOutput, setExpectedOutput] = useState("");
  const [codeTemplate, setCodeTemplate] = useState("");
  const [codeLanguage, setCodeLanguage] = useState("python");

  // Upload fields
  const [allowedFileTypes, setAllowedFileTypes] = useState("pdf,py,js,zip");

  // Exam questions
  const [questions, setQuestions] = useState<QuizQuestion[]>([
    {
      question: "",
      imageUrl: "",
      optionsCount: 4,
      optionA: "",
      optionB: "",
      optionC: "",
      optionD: "",
      correctAnswer: "A",
    },
  ]);
  const [submitting, setSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleAddQuestion = () => {
    setQuestions((prev) => [
      ...prev,
      {
        question: "",
        imageUrl: "",
        optionsCount: 4,
        optionA: "",
        optionB: "",
        optionC: "",
        optionD: "",
        correctAnswer: "A",
      },
    ]);
  };

  const handleRemoveQuestion = (index: number) => {
    if (questions.length <= 1) {
      toastError("يجب أن يحتوي واجب الأسئلة على سؤال واحد على الأقل");
      return;
    }
    setQuestions((prev) => prev.filter((_, i) => i !== index));
  };

  const handleQuestionChange = (index: number, field: keyof QuizQuestion, value: any) => {
    setQuestions((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  };

  const handleSetOptionsCount = (index: number, count: 2 | 3 | 4) => {
    setQuestions((prev) => {
      const updated = [...prev];
      const q = { ...updated[index], optionsCount: count };
      if (count === 2 && (q.correctAnswer === "C" || q.correctAnswer === "D")) {
        q.correctAnswer = "A";
      } else if (count === 3 && q.correctAnswer === "D") {
        q.correctAnswer = "A";
      }
      updated[index] = q;
      return updated;
    });
  };

  const handleSetTrueFalse = (index: number) => {
    setQuestions((prev) => {
      const updated = [...prev];
      updated[index] = {
        ...updated[index],
        optionsCount: 2,
        optionA: "صح",
        optionB: "خطأ",
        correctAnswer: "A",
      };
      return updated;
    });
  };

  const handleJsonImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        const parsed = JSON.parse(text);
        let rawQuestions: unknown[] = [];
        let importedTitle = "";
        let importedTime = 30;

        if (Array.isArray(parsed)) {
          rawQuestions = parsed;
        } else if (parsed && typeof parsed === "object") {
          const obj = parsed as Record<string, unknown>;
          if (typeof obj.title === "string") importedTitle = obj.title;
          if (typeof obj.timeLimitMinutes === "number") importedTime = obj.timeLimitMinutes;
          if (Array.isArray(obj.questions)) rawQuestions = obj.questions;
        }

        if (!rawQuestions || rawQuestions.length === 0) {
          toastError("الملف لا يحتوي على أي أسئلة صحيحة");
          return;
        }

        const validQuestions: QuizQuestion[] = rawQuestions.map((q, idx) => {
          if (!q || typeof q !== "object") throw new Error(`السؤال ${idx + 1} بتنسيق غير صحيح`);
          const row = q as Record<string, unknown>;
          const qText = String(row.question || row.title || "").trim();
          if (!qText) throw new Error(`السؤال ${idx + 1} بدون نص`);

          const optA = String(row.optionA || row.a || "").trim();
          const optB = String(row.optionB || row.b || "").trim();
          const optC = String(row.optionC || row.c || "").trim();
          const optD = String(row.optionD || row.d || "").trim();

          let count: 2 | 3 | 4 = 4;
          if (!optD && !optC) count = 2;
          else if (!optD) count = 3;

          let correct = String(row.correctAnswer || "A").toUpperCase();
          if (count === 2 && !["A", "B"].includes(correct)) correct = "A";
          if (count === 3 && !["A", "B", "C"].includes(correct)) correct = "A";
          if (!["A", "B", "C", "D"].includes(correct)) correct = "A";

          return {
            question: qText,
            optionsCount: count,
            imageUrl: typeof row.imageUrl === "string" ? row.imageUrl.trim() : "",
            optionA: optA,
            optionB: optB,
            optionC: optC,
            optionD: optD,
            correctAnswer: correct,
          };
        });

        if (importedTitle) setTitle(importedTitle);
        if (importedTime) setTimeLimitMinutes(importedTime);
        setQuestions(validQuestions);
        toastSuccess(`تم استيراد ${validQuestions.length} سؤال بنجاح ✅`);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "فشل قراءة ملف الـ JSON";
        toastError(message);
      }
    };
    reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      toastError("يرجى إدخال عنوان الواجب");
      return;
    }

    const payload: Record<string, unknown> = {
      title: title.trim(),
      description: description.trim() || undefined,
      type,
      courseId,
      folderId,
      dueAt: dueAt || undefined,
      timeLimitMinutes: Number(timeLimitMinutes) || 30,
      enableAutoClose,
      closeAt: closeAt || undefined,
      isPublished,
    };

    if (type === "link") {
      if (!linkUrl.trim()) {
        toastError("يرجى إدخال رابط الواجب");
        return;
      }
      payload.linkUrl = linkUrl.trim();
    }

    if (type === "terminal") {
      if (!expectedOutput.trim()) {
        toastError("يرجى إدخال الناتج المتوقع للكود");
        return;
      }
      payload.expectedOutput = expectedOutput.trim();
      payload.codeTemplate = codeTemplate.trim() || undefined;
      payload.codeLanguage = codeLanguage;
    }

    if (type === "upload") {
      payload.allowedFileTypes = allowedFileTypes.trim() || undefined;
    }

    if (type === "exam") {
      for (let i = 0; i < questions.length; i++) {
        const q = questions[i];
        if (!q.question.trim()) {
          toastError(`يرجى كتابة نص السؤال رقم ${i + 1}`);
          return;
        }
        if (!q.optionA.trim() || !q.optionB.trim()) {
          toastError(`يرجى كتابة الخيارين الأول والثاني للسؤال رقم ${i + 1}`);
          return;
        }
        const count = q.optionsCount ?? (q.optionD ? 4 : q.optionC ? 3 : 2);
        if (count >= 3 && !q.optionC.trim()) {
          toastError(`يرجى كتابة الخيار الثالث للسؤال رقم ${i + 1}`);
          return;
        }
        if (count === 4 && !q.optionD.trim()) {
          toastError(`يرجى كتابة الخيار الرابع للسؤال رقم ${i + 1}`);
          return;
        }
      }
      payload.questions = questions.map((q) => {
        const count = q.optionsCount ?? (q.optionD ? 4 : q.optionC ? 3 : 2);
        return {
          question: q.question.trim(),
          imageUrl: q.imageUrl?.trim() || "",
          optionA: q.optionA.trim(),
          optionB: q.optionB.trim(),
          optionC: count < 3 ? "" : q.optionC.trim(),
          optionD: count < 4 ? "" : q.optionD.trim(),
          correctAnswer: q.correctAnswer,
          degree: Number(q.degree) > 0 ? Math.round(Number(q.degree)) : 1,
        };
      });
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/admin/homework", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (res.ok) {
        toastSuccess("تم إضافة الواجب للمحاضرة بنجاح ✅");
        await onSuccess();
        onClose();
      } else {
        toastError(data.error || "تعذر إضافة الواجب");
      }
    } catch {
      toastError("حدث خطأ أثناء الاتصال بالخادم");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-xs animate-in fade-in duration-150" dir="rtl">
        <div className="w-full max-w-2xl max-h-[92vh] rounded-3xl overflow-hidden flex flex-col shadow-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100">
          {/* Header */}
          <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-950/60">
            <div className="flex items-center gap-2.5">
              <span className="p-2 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                <BookOpen className="w-5 h-5" />
              </span>
              <div>
                <h3 className="text-sm sm:text-base font-black text-slate-900 dark:text-white">
                  إضافة واجب جديد للمحاضرة
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  المحاضرة: <strong className="text-amber-600 dark:text-amber-400">{folderName}</strong>
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 rounded-xl bg-slate-200/70 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 flex items-center justify-center transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Form Body */}
          <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2">
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  عنوان الواجب *
                </label>
                <input
                  type="text"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="مثال: واجب التطبيق العملي للدرس"
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-200 bg-slate-50 text-xs text-slate-900 outline-none focus:border-amber-500 focus:bg-white dark:border-slate-800 dark:bg-slate-950 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  نوع الواجب *
                </label>
                <select
                  value={type}
                  onChange={(e) => setType(e.target.value as any)}
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-200 bg-slate-50 text-xs font-bold text-slate-900 outline-none focus:border-amber-500 focus:bg-white dark:border-slate-800 dark:bg-slate-950 dark:text-white"
                >
                  <option value="exam">📝 اختبار أسئلة MCQ</option>
                  <option value="terminal">💻 كود برمجي / Terminal</option>
                  <option value="upload">📎 تسليم ملفات</option>
                  <option value="link">🔗 رابط خارجي</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                الوصف والتعليمات (اختياري)
              </label>
              <textarea
                rows={2}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="اكتب أي تعليمات أو تفاصيل توضيحية للطلاب..."
                className="w-full px-3.5 py-2 rounded-xl border border-slate-200 bg-slate-50 text-xs text-slate-900 outline-none focus:border-amber-500 focus:bg-white dark:border-slate-800 dark:bg-slate-950 dark:text-white"
              />
            </div>

            <TimedCloseFields
              enableAutoClose={enableAutoClose}
              closeAt={closeAt}
              onEnableChange={setEnableAutoClose}
              onCloseAtChange={setCloseAt}
            />

            {/* Type-Specific Fields */}
            {type === "link" && (
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  رابط الواجب الخارجي *
                </label>
                <input
                  type="url"
                  required
                  dir="ltr"
                  value={linkUrl}
                  onChange={(e) => setLinkUrl(e.target.value)}
                  placeholder="https://..."
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-200 bg-slate-50 text-xs font-mono text-slate-900 outline-none focus:border-amber-500 focus:bg-white dark:border-slate-800 dark:bg-slate-950 dark:text-white"
                />
              </div>
            )}

            {type === "terminal" && (
              <div className="space-y-3 p-4 rounded-2xl bg-slate-50 dark:bg-slate-950/40 border border-slate-200 dark:border-slate-800">
                <div className="flex items-center gap-3">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    لغة البرمجة:
                  </label>
                  <select
                    value={codeLanguage}
                    onChange={(e) => setCodeLanguage(e.target.value)}
                    className="px-3 py-1 rounded-lg border border-slate-200 bg-white text-xs font-mono font-bold dark:border-slate-800 dark:bg-slate-900"
                  >
                    <option value="python">Python</option>
                    <option value="javascript">JavaScript</option>
                    <option value="cpp">C++</option>
                    <option value="java">Java</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    الناتج المتوقع من تشغيل الكود *
                  </label>
                  <input
                    type="text"
                    required
                    dir="ltr"
                    value={expectedOutput}
                    onChange={(e) => setExpectedOutput(e.target.value)}
                    placeholder="مثال: Hello, World! أو 42"
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-mono dark:border-slate-800 dark:bg-slate-900"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    قالب الكود المبدئي للبدء به (اختياري)
                  </label>
                  <textarea
                    rows={3}
                    dir="ltr"
                    value={codeTemplate}
                    onChange={(e) => setCodeTemplate(e.target.value)}
                    placeholder="# اكتب كود البداية هنا..."
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-mono dark:border-slate-800 dark:bg-slate-900"
                  />
                </div>
              </div>
            )}

            {type === "upload" && (
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  صيغ الملفات المسموح بها
                </label>
                <input
                  type="text"
                  dir="ltr"
                  value={allowedFileTypes}
                  onChange={(e) => setAllowedFileTypes(e.target.value)}
                  placeholder="pdf,py,js,zip"
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-200 bg-slate-50 text-xs font-mono text-slate-900 outline-none focus:border-amber-500 focus:bg-white dark:border-slate-800 dark:bg-slate-950 dark:text-white"
                />
              </div>
            )}

            {type === "exam" && (
              <div className="space-y-3 pt-2">
                {/* JSON Bulk Import Banner */}
                <div className="p-3.5 rounded-2xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5">
                  <div className="text-xs text-amber-800 dark:text-amber-300">
                    <p className="font-bold flex items-center gap-1.5">
                      <Upload className="w-3.5 h-3.5" />
                      <span>استيراد أسئلة الواجب من ملف JSON</span>
                    </p>
                    <p className="text-[11px] text-amber-700/80 dark:text-amber-400 mt-0.5">
                      يدعم أسئلة بخيارين (صح/خطأ)، ٣ خيارات، أو ٤ خيارات.
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".json,application/json"
                      onChange={handleJsonImport}
                      className="hidden"
                    />
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="px-3 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold transition-colors cursor-pointer shrink-0 shadow-xs flex items-center gap-1"
                    >
                      <Upload className="w-3.5 h-3.5" />
                      <span>استيراد JSON</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => downloadJsonFile("homework_sample.json", sampleHomeworkData)}
                      className="px-3 py-1.5 rounded-xl bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 text-xs font-bold transition-colors cursor-pointer flex items-center gap-1"
                    >
                      <Download className="w-3.5 h-3.5 text-amber-600" />
                      <span>تحميل نموذج JSON</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowGuide(true)}
                      className="px-3 py-1.5 rounded-xl bg-amber-100 dark:bg-amber-950/60 hover:bg-amber-200 dark:hover:bg-amber-900 text-amber-700 dark:text-amber-300 text-xs font-bold transition-colors cursor-pointer flex items-center gap-1"
                    >
                      <BookOpen className="w-3.5 h-3.5" />
                      <span>دليل الصياغة</span>
                    </button>
                  </div>
                </div>

                {/* Questions List */}
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    الأسئلة ({questions.length})
                  </span>
                  <button
                    type="button"
                    onClick={handleAddQuestion}
                    className="px-3 py-1 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-200 text-xs font-bold transition-all cursor-pointer flex items-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>إضافة سؤال</span>
                  </button>
                </div>

                <div className="space-y-3">
                  {questions.map((q, idx) => {
                    const count = q.optionsCount ?? (q.optionD ? 4 : q.optionC ? 3 : 2);

                    return (
                      <div
                        key={idx}
                        className="p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/40 space-y-2.5"
                      >
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <span className="text-xs font-mono font-bold text-amber-600 dark:text-amber-400">
                            سؤال #{idx + 1}
                          </span>

                          <div className="flex items-center gap-2">
                            <div className="flex items-center bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-0.5 text-[11px]">
                              <button
                                type="button"
                                onClick={() => handleSetOptionsCount(idx, 2)}
                                className={`px-2 py-0.5 rounded-lg font-bold transition-all cursor-pointer ${
                                  count === 2
                                    ? "bg-amber-600 text-white shadow-xs"
                                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900"
                                }`}
                              >
                                خيارين (صح/خطأ)
                              </button>
                              <button
                                type="button"
                                onClick={() => handleSetOptionsCount(idx, 3)}
                                className={`px-2 py-0.5 rounded-lg font-bold transition-all cursor-pointer ${
                                  count === 3
                                    ? "bg-amber-600 text-white shadow-xs"
                                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900"
                                }`}
                              >
                                ٣ خيارات
                              </button>
                              <button
                                type="button"
                                onClick={() => handleSetOptionsCount(idx, 4)}
                                className={`px-2 py-0.5 rounded-lg font-bold transition-all cursor-pointer ${
                                  count === 4
                                    ? "bg-amber-600 text-white shadow-xs"
                                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900"
                                }`}
                              >
                                ٤ خيارات
                              </button>
                            </div>

                            {questions.length > 1 && (
                              <button
                                type="button"
                                onClick={() => handleRemoveQuestion(idx)}
                                className="text-rose-500 hover:underline text-xs cursor-pointer"
                              >
                                حذف
                              </button>
                            )}
                          </div>
                        </div>

                        <input
                          type="text"
                          required
                          value={q.question}
                          onChange={(e) => handleQuestionChange(idx, "question", e.target.value)}
                          placeholder="نص السؤال..."
                          className="w-full px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs dark:border-slate-800 dark:bg-slate-900"
                        />

                        {/* Image URL optional */}
                        <div className="flex gap-2 items-center">
                          <input
                            type="url"
                            value={q.imageUrl || ""}
                            onChange={(e) => handleQuestionChange(idx, "imageUrl", e.target.value)}
                            placeholder="رابط صورة توضيحية للسؤال https://... (اختياري)"
                            className="flex-1 px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-[11px] font-mono text-slate-900 outline-none focus:border-amber-500 dark:border-slate-800 dark:bg-slate-900 dark:text-white"
                            dir="ltr"
                          />
                          {count === 2 && (
                            <button
                              type="button"
                              onClick={() => handleSetTrueFalse(idx)}
                              className="px-2 py-1 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 text-[11px] font-bold shrink-0 transition-colors cursor-pointer"
                            >
                              ⚡ صح / خطأ
                            </button>
                          )}
                        </div>

                        <div className={`grid gap-2 ${count === 3 ? "grid-cols-1 sm:grid-cols-3" : "grid-cols-1 sm:grid-cols-2"}`}>
                          <div>
                            <label className="text-[10px] text-slate-500 block font-bold mb-0.5">الخيار الأول (أ)</label>
                            <input
                              type="text"
                              required
                              value={q.optionA}
                              onChange={(e) => handleQuestionChange(idx, "optionA", e.target.value)}
                              placeholder="أ) الخيار الأول"
                              className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-xs dark:border-slate-800 dark:bg-slate-900"
                            />
                          </div>
                          <div>
                            <label className="text-[10px] text-slate-500 block font-bold mb-0.5">الخيار الثاني (ب)</label>
                            <input
                              type="text"
                              required
                              value={q.optionB}
                              onChange={(e) => handleQuestionChange(idx, "optionB", e.target.value)}
                              placeholder="ب) الخيار الثاني"
                              className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-xs dark:border-slate-800 dark:bg-slate-900"
                            />
                          </div>
                          {count >= 3 && (
                            <div>
                              <label className="text-[10px] text-slate-500 block font-bold mb-0.5">الخيار الثالث (ج)</label>
                              <input
                                type="text"
                                required
                                value={q.optionC}
                                onChange={(e) => handleQuestionChange(idx, "optionC", e.target.value)}
                                placeholder="ج) الخيار الثالث"
                                className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-xs dark:border-slate-800 dark:bg-slate-900"
                              />
                            </div>
                          )}
                          {count >= 4 && (
                            <div>
                              <label className="text-[10px] text-slate-500 block font-bold mb-0.5">الخيار الرابع (د)</label>
                              <input
                                type="text"
                                required
                                value={q.optionD}
                                onChange={(e) => handleQuestionChange(idx, "optionD", e.target.value)}
                                placeholder="د) الخيار الرابع"
                                className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-xs dark:border-slate-800 dark:bg-slate-900"
                              />
                            </div>
                          )}
                        </div>

                        <div className="flex items-center gap-2 pt-1 text-xs">
                          <span className="font-bold">الإجابة الصحيحة:</span>
                          <select
                            value={q.correctAnswer}
                            onChange={(e) => handleQuestionChange(idx, "correctAnswer", e.target.value)}
                            className="px-2 py-1 rounded-md border border-slate-200 bg-white text-xs font-bold dark:border-slate-800 dark:bg-slate-900"
                          >
                            <option value="A">أ {q.optionA ? `— ${q.optionA.slice(0, 15)}` : ""}</option>
                            <option value="B">ب {q.optionB ? `— ${q.optionB.slice(0, 15)}` : ""}</option>
                            {count >= 3 && <option value="C">ج {q.optionC ? `— ${q.optionC.slice(0, 15)}` : ""}</option>}
                            {count >= 4 && <option value="D">د {q.optionD ? `— ${q.optionD.slice(0, 15)}` : ""}</option>}
                          </select>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Footer Submit Bar */}
            <div className="border-t border-slate-200 dark:border-slate-800 pt-4 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-bold transition-colors cursor-pointer"
              >
                إلغاء
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="px-5 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold transition-colors cursor-pointer disabled:opacity-50 shadow-sm"
              >
                {submitting ? "جارٍ الحفظ..." : "حفظ ونشر الواجب"}
              </button>
            </div>
          </form>
        </div>
      </div>

      <TeacherJSONGuideModal
        isOpen={showGuide}
        onClose={() => setShowGuide(false)}
        initialTab="homework"
      />
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. ADD MATERIAL MODAL
// ─────────────────────────────────────────────────────────────────────────────

export interface AddMaterialModalProps {
  isOpen: boolean;
  folderId: string;
  folderName: string;
  onClose: () => void;
  onSuccess: () => Promise<void>;
}

export function AddMaterialModal({
  isOpen,
  folderId,
  folderName,
  onClose,
  onSuccess,
}: AddMaterialModalProps) {
  const { success: toastSuccess, error: toastError } = useToast();

  const [title, setTitle] = useState("");
  const [type, setType] = useState<"pdf" | "link">("pdf");
  const [url, setUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      toastError("يرجى إدخال عنوان الملحق");
      return;
    }
    if (!url.trim()) {
      toastError("يرجى إدخال رابط الملف أو المستند");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`/api/admin/folders/${folderId}/materials`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          type,
          url: url.trim(),
        }),
      });

      const data = await res.json();
      if (res.ok) {
        toastSuccess("تم إضافة الملحق للمحاضرة بنجاح ✅");
        await onSuccess();
        onClose();
      } else {
        toastError(data.error || "تعذر إضافة الملحق");
      }
    } catch {
      toastError("حدث خطأ أثناء الاتصال بالخادم");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-xs animate-in fade-in duration-150" dir="rtl">
      <div className="w-full max-w-lg rounded-3xl overflow-hidden flex flex-col shadow-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-950/60">
          <div className="flex items-center gap-2.5">
            <span className="p-2 rounded-xl bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20">
              <FileText className="w-5 h-5" />
            </span>
            <div>
              <h3 className="text-sm sm:text-base font-black text-slate-900 dark:text-white">
                إضافة ملحق أو ملف (PDF)
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                المحاضرة: <strong className="text-purple-600 dark:text-purple-400">{folderName}</strong>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-xl bg-slate-200/70 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 flex items-center justify-center transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-4 sm:p-6 space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
              عنوان الملحق *
            </label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="مثال: مذكرة المحاضرة والشرح الكامل PDF"
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-xs text-slate-900 outline-none focus:border-purple-500 focus:bg-white dark:border-slate-800 dark:bg-slate-950 dark:text-white"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
              نوع الملحق
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setType("pdf")}
                className={`py-2 px-3 rounded-xl text-xs font-bold border-2 transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                  type === "pdf"
                    ? "border-purple-500 bg-purple-500/10 text-purple-700 dark:text-purple-300"
                    : "border-slate-200 text-slate-600 dark:border-slate-800 dark:text-slate-400"
                }`}
              >
                <FileText className="w-4 h-4" />
                <span>ملف PDF</span>
              </button>
              <button
                type="button"
                onClick={() => setType("link")}
                className={`py-2 px-3 rounded-xl text-xs font-bold border-2 transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                  type === "link"
                    ? "border-purple-500 bg-purple-500/10 text-purple-700 dark:text-purple-300"
                    : "border-slate-200 text-slate-600 dark:border-slate-800 dark:text-slate-400"
                }`}
              >
                <LinkIcon className="w-4 h-4" />
                <span>رابط خارجي</span>
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
              رابط الملف (URL) *
            </label>
            <input
              type="url"
              required
              dir="ltr"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://..."
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-xs font-mono text-slate-900 outline-none focus:border-purple-500 focus:bg-white dark:border-slate-800 dark:bg-slate-950 dark:text-white"
            />
          </div>

          {/* Footer Bar */}
          <div className="border-t border-slate-200 dark:border-slate-800 pt-4 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-bold transition-colors cursor-pointer"
            >
              إلغاء
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold transition-colors cursor-pointer disabled:opacity-50 shadow-sm"
            >
              {submitting ? "جارٍ الإضافة..." : "إضافة الملحق"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
