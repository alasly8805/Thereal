"use client";

import React, { useState, useRef } from "react";
import { useToast } from "@/components/ui/Toast";
import {
  X,
  Plus,
  Trash2,
  Upload,
  HelpCircle,
  BookOpen,
  Code,
  Link as LinkIcon,
  Paperclip,
  FileText,
} from "lucide-react";

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
  const [questions, setQuestions] = useState<QuizQuestion[]>([
    {
      question: "",
      imageUrl: "",
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
      toastError("يجب أن يحتوي الاختبار على سؤال واحد على الأقل");
      return;
    }
    setQuestions((prev) => prev.filter((_, i) => i !== index));
  };

  const handleQuestionChange = (index: number, field: keyof QuizQuestion, value: string) => {
    setQuestions((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
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
          return {
            question: qText,
            imageUrl: typeof row.imageUrl === "string" ? row.imageUrl.trim() : "",
            optionA: String(row.optionA || row.a || "").trim(),
            optionB: String(row.optionB || row.b || "").trim(),
            optionC: String(row.optionC || row.c || "").trim(),
            optionD: String(row.optionD || row.d || "").trim(),
            correctAnswer: (["A", "B", "C", "D"].includes(String(row.correctAnswer).toUpperCase())
              ? String(row.correctAnswer).toUpperCase()
              : "A"),
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
      toastError("يرجى إدخال عنوان الاختبار");
      return;
    }

    // Validation
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      if (!q.question.trim()) {
        toastError(`يرجى كتابة نص السؤال رقم ${i + 1}`);
        return;
      }
      if (!q.optionA.trim() || !q.optionB.trim() || !q.optionC.trim() || !q.optionD.trim()) {
        toastError(`يرجى استكمال جميع خيارات السؤال رقم ${i + 1}`);
        return;
      }
    }

    setSubmitting(true);
    try {
      const res = await fetch(`/api/admin/folders/${folderId}/quizzes`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          timeLimitMinutes: Number(timeLimitMinutes) || 30,
          questions,
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

          {/* JSON Bulk Import Banner */}
          <div className="p-3.5 rounded-2xl bg-sky-50 dark:bg-sky-950/30 border border-sky-200 dark:border-sky-900/50 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5">
            <div className="text-xs text-sky-800 dark:text-sky-300">
              <p className="font-bold flex items-center gap-1.5">
                <Upload className="w-4 h-4" />
                <span>استيراد الأسئلة دفعة واحدة من ملف JSON</span>
              </p>
              <p className="text-[11px] text-sky-700/80 dark:text-sky-400 mt-0.5">
                يدعم ملفات JSON التي تحتوي على الأسئلة والخيارات والإجابة الصحيحة.
              </p>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              onChange={handleJsonImport}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="px-3.5 py-2 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-xs font-bold transition-colors cursor-pointer shrink-0 shadow-xs flex items-center gap-1.5"
            >
              <Upload className="w-3.5 h-3.5" />
              <span>اختيار ملف JSON</span>
            </button>
          </div>

          {/* Questions Header */}
          <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-2">
            <h4 className="text-xs font-black text-slate-900 dark:text-white flex items-center gap-2">
              <span>أسئلة الاختبار</span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 font-mono font-bold">
                {questions.length} سؤال
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
            {questions.map((q, idx) => (
              <div
                key={idx}
                className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/40 space-y-3 relative"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-mono font-black text-sky-600 dark:text-sky-400">
                    السؤال #{idx + 1}
                  </span>
                  {questions.length > 1 && (
                    <button
                      type="button"
                      onClick={() => handleRemoveQuestion(idx)}
                      className="p-1 rounded-lg text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors cursor-pointer"
                      title="حذف هذا السؤال"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
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

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div>
                    <label className="text-[11px] text-slate-500 block mb-0.5">الخيار (أ)</label>
                    <input
                      type="text"
                      required
                      value={q.optionA}
                      onChange={(e) => handleQuestionChange(idx, "optionA", e.target.value)}
                      className="w-full px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs dark:border-slate-800 dark:bg-slate-900"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-slate-500 block mb-0.5">الخيار (ب)</label>
                    <input
                      type="text"
                      required
                      value={q.optionB}
                      onChange={(e) => handleQuestionChange(idx, "optionB", e.target.value)}
                      className="w-full px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs dark:border-slate-800 dark:bg-slate-900"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-slate-500 block mb-0.5">الخيار (ج)</label>
                    <input
                      type="text"
                      required
                      value={q.optionC}
                      onChange={(e) => handleQuestionChange(idx, "optionC", e.target.value)}
                      className="w-full px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs dark:border-slate-800 dark:bg-slate-900"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-slate-500 block mb-0.5">الخيار (د)</label>
                    <input
                      type="text"
                      required
                      value={q.optionD}
                      onChange={(e) => handleQuestionChange(idx, "optionD", e.target.value)}
                      className="w-full px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs dark:border-slate-800 dark:bg-slate-900"
                    />
                  </div>
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
                    <option value="A">الخيار أ</option>
                    <option value="B">الخيار ب</option>
                    <option value="C">الخيار ج</option>
                    <option value="D">الخيار د</option>
                  </select>
                </div>
              </div>
            ))}
          </div>

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
  const [isPublished, setIsPublished] = useState(true);

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

  const handleQuestionChange = (index: number, field: keyof QuizQuestion, value: string) => {
    setQuestions((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
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
          return {
            question: String(row.question || row.title || "").trim(),
            imageUrl: typeof row.imageUrl === "string" ? row.imageUrl.trim() : "",
            optionA: String(row.optionA || row.a || "").trim(),
            optionB: String(row.optionB || row.b || "").trim(),
            optionC: String(row.optionC || row.c || "").trim(),
            optionD: String(row.optionD || row.d || "").trim(),
            correctAnswer: (["A", "B", "C", "D"].includes(String(row.correctAnswer).toUpperCase())
              ? String(row.correctAnswer).toUpperCase()
              : "A"),
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
        if (!q.optionA.trim() || !q.optionB.trim() || !q.optionC.trim() || !q.optionD.trim()) {
          toastError(`يرجى استكمال خيارات السؤال رقم ${i + 1}`);
          return;
        }
      }
      payload.questions = questions;
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
                إضافة واجب للمحاضرة
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
          {/* Type Picker */}
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
              نوع الواجب
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {[
                { id: "exam" as const, label: "📝 اختبار MCQ", icon: HelpCircle },
                { id: "terminal" as const, label: "💻 كود برمجي", icon: Code },
                { id: "upload" as const, label: "📎 تسليم ملف", icon: Paperclip },
                { id: "link" as const, label: "🔗 رابط خارجي", icon: LinkIcon },
              ].map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setType(t.id)}
                  className={`py-2 px-2.5 rounded-xl text-xs font-bold border-2 transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                    type === t.id
                      ? "border-amber-500 bg-amber-500/10 text-amber-700 dark:text-amber-300 shadow-xs"
                      : "border-slate-200 text-slate-600 hover:border-slate-300 dark:border-slate-800 dark:text-slate-400"
                  }`}
                >
                  <t.icon className="w-3.5 h-3.5" />
                  <span>{t.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Title & Timing */}
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
                placeholder="مثال: واجب الأسبوع الأول - التدريب العملي"
                className="w-full px-3.5 py-2 rounded-xl border border-slate-200 bg-slate-50 text-xs text-slate-900 outline-none focus:border-amber-500 focus:bg-white dark:border-slate-800 dark:bg-slate-950 dark:text-white"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                المدة (دقائق)
              </label>
              <input
                type="number"
                min={1}
                max={300}
                value={timeLimitMinutes}
                onChange={(e) => setTimeLimitMinutes(Number(e.target.value))}
                className="w-full px-3.5 py-2 rounded-xl border border-slate-200 bg-slate-50 text-xs font-mono text-slate-900 outline-none focus:border-amber-500 focus:bg-white dark:border-slate-800 dark:bg-slate-950 dark:text-white"
              />
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
              وصف أو إرشادات الواجب (اختياري)
            </label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="اكتب أي تعليمات أو تفاصيل توضيحية للطلاب..."
              className="w-full px-3.5 py-2 rounded-xl border border-slate-200 bg-slate-50 text-xs text-slate-900 outline-none focus:border-amber-500 focus:bg-white dark:border-slate-800 dark:bg-slate-950 dark:text-white"
            />
          </div>

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
              <div className="p-3 rounded-2xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5">
                <div className="text-xs text-amber-800 dark:text-amber-300">
                  <p className="font-bold flex items-center gap-1.5">
                    <Upload className="w-3.5 h-3.5" />
                    <span>استيراد أسئلة الواجب من ملف JSON</span>
                  </p>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".json"
                  onChange={handleJsonImport}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="px-3 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold transition-colors cursor-pointer shrink-0 shadow-xs"
                >
                  استيراد JSON
                </button>
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
                {questions.map((q, idx) => (
                  <div
                    key={idx}
                    className="p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/40 space-y-2.5"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-mono font-bold text-amber-600 dark:text-amber-400">
                        سؤال #{idx + 1}
                      </span>
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
                    <input
                      type="text"
                      required
                      value={q.question}
                      onChange={(e) => handleQuestionChange(idx, "question", e.target.value)}
                      placeholder="نص السؤال..."
                      className="w-full px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs dark:border-slate-800 dark:bg-slate-900"
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        type="text"
                        required
                        value={q.optionA}
                        onChange={(e) => handleQuestionChange(idx, "optionA", e.target.value)}
                        placeholder="أ) الخيار الأول"
                        className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-xs dark:border-slate-800 dark:bg-slate-900"
                      />
                      <input
                        type="text"
                        required
                        value={q.optionB}
                        onChange={(e) => handleQuestionChange(idx, "optionB", e.target.value)}
                        placeholder="ب) الخيار الثاني"
                        className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-xs dark:border-slate-800 dark:bg-slate-900"
                      />
                      <input
                        type="text"
                        required
                        value={q.optionC}
                        onChange={(e) => handleQuestionChange(idx, "optionC", e.target.value)}
                        placeholder="ج) الخيار الثالث"
                        className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-xs dark:border-slate-800 dark:bg-slate-900"
                      />
                      <input
                        type="text"
                        required
                        value={q.optionD}
                        onChange={(e) => handleQuestionChange(idx, "optionD", e.target.value)}
                        placeholder="د) الخيار الرابع"
                        className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-xs dark:border-slate-800 dark:bg-slate-900"
                      />
                    </div>
                    <div className="flex items-center gap-2 pt-1 text-xs">
                      <span>الإجابة الصحيحة:</span>
                      <select
                        value={q.correctAnswer}
                        onChange={(e) => handleQuestionChange(idx, "correctAnswer", e.target.value)}
                        className="px-2 py-1 rounded-md border border-slate-200 bg-white text-xs font-bold dark:border-slate-800 dark:bg-slate-900"
                      >
                        <option value="A">أ</option>
                        <option value="B">ب</option>
                        <option value="C">ج</option>
                        <option value="D">د</option>
                      </select>
                    </div>
                  </div>
                ))}
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
