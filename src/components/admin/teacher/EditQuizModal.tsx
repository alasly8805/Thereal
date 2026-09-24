"use client";

import React, { useMemo, useState } from "react";
import { useToast } from "@/components/ui/Toast";
import { X, Pencil, HelpCircle } from "lucide-react";

export type EditableQuizQuestion = {
  id: string;
  question: string;
  imageUrl?: string | null;
  optionA?: string;
  optionB?: string;
  optionC?: string;
  optionD?: string;
  correctAnswer?: string;
  questionType?: string;
  degree?: number;
};

export function EditQuizModal({
  isOpen,
  quizId,
  quizTitle,
  questions: initialQuestions,
  onClose,
  onSuccess,
}: {
  isOpen: boolean;
  quizId: string;
  quizTitle: string;
  questions: EditableQuizQuestion[];
  onClose: () => void;
  onSuccess: () => Promise<void>;
}) {
  const { success: toastSuccess, error: toastError } = useToast();
  const [drafts, setDrafts] = useState<EditableQuizQuestion[]>(() =>
    initialQuestions.map(cloneQuestion)
  );
  const [savingId, setSavingId] = useState<string | null>(null);

  const questions = useMemo(
    () => (drafts.length ? drafts : initialQuestions.map(cloneQuestion)),
    [drafts, initialQuestions]
  );

  if (!isOpen) return null;

  const updateDraft = (id: string, patch: Partial<EditableQuizQuestion>) => {
    setDrafts((prev) => {
      const base = prev.length ? prev : initialQuestions.map(cloneQuestion);
      return base.map((q) => (q.id === id ? { ...q, ...patch } : q));
    });
  };

  const handleSave = async (q: EditableQuizQuestion) => {
    const isEssay = q.questionType === "essay";
    if (!q.question.trim()) {
      toastError("نص السؤال مطلوب");
      return;
    }
    if (!isEssay && !(q.optionA || "").trim() && !(q.optionB || "").trim()) {
      toastError("يجب كتابة خيارين على الأقل");
      return;
    }

    setSavingId(q.id);
    try {
      const res = await fetch(`/api/admin/quizzes/${quizId}/questions/${q.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: q.question.trim(),
          questionType: isEssay ? "essay" : "mcq",
          imageUrl: q.imageUrl?.trim() || "",
          optionA: isEssay ? "" : (q.optionA || "").trim(),
          optionB: isEssay ? "" : (q.optionB || "").trim(),
          optionC: isEssay ? "" : (q.optionC || "").trim(),
          optionD: isEssay ? "" : (q.optionD || "").trim(),
          correctAnswer: isEssay ? "A" : q.correctAnswer || "A",
          degree: Number(q.degree) > 0 ? Math.round(Number(q.degree)) : 1,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toastError(data.error || "تعذر حفظ السؤال");
        return;
      }
      toastSuccess(
        data.regrading
          ? "تم حفظ السؤال. جاري إعادة تصحيح إجابات الطلاب في الخلفية دون تعطيل الصفحة."
          : "تم حفظ السؤال"
      );
      await onSuccess();
    } catch {
      toastError("حدث خطأ أثناء حفظ السؤال");
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-xs" dir="rtl">
      <div className="w-full max-w-2xl max-h-[92vh] rounded-3xl overflow-hidden flex flex-col shadow-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
        <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-950/60">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="p-2 rounded-xl bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/20">
              <Pencil className="w-5 h-5" />
            </span>
            <div className="min-w-0">
              <h3 className="text-sm sm:text-base font-black text-slate-900 dark:text-white truncate">
                تعديل أسئلة الاختبار
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{quizTitle}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-xl bg-slate-200/70 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 flex items-center justify-center"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
          <p className="text-[11px] text-slate-500 dark:text-slate-400 flex items-start gap-1.5">
            <HelpCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            تغيير الإجابة الصحيحة أو الخيارات أو الدرجة يعيد تصحيح السؤال فقط لكل المحاولات المكتملة، ويحدّث الدرجة الكلية في الخلفية. ملاحظات تصحيح المقالي تبقى كما هي إلا إذا عدّلت ذلك السؤال المقالي نفسه.
          </p>

          {questions.map((q, idx) => {
            const isEssay = q.questionType === "essay";
            const count = q.optionD ? 4 : q.optionC ? 3 : 2;
            return (
              <div
                key={q.id}
                className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/40 space-y-3"
              >
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span className="text-xs font-mono font-black text-sky-600 dark:text-sky-400">
                    السؤال #{idx + 1}
                  </span>
                  <div className="flex items-center gap-2">
                    <select
                      value={isEssay ? "essay" : "mcq"}
                      onChange={(e) => updateDraft(q.id, { questionType: e.target.value })}
                      className="px-2 py-1 rounded-lg border border-slate-200 bg-white text-[11px] font-bold dark:border-slate-800 dark:bg-slate-900"
                    >
                      <option value="mcq">اختيار من متعدد</option>
                      <option value="essay">مقالي</option>
                    </select>
                    <label className="flex items-center gap-1 text-[11px] font-bold text-slate-600 dark:text-slate-400">
                      <span>الدرجة</span>
                      <input
                        type="number"
                        min={1}
                        max={100}
                        value={q.degree ?? 1}
                        onChange={(e) => updateDraft(q.id, { degree: Number(e.target.value) || 1 })}
                        className="w-14 px-2 py-1 rounded-lg border border-slate-200 bg-white text-[11px] font-mono font-bold dark:border-slate-800 dark:bg-slate-900"
                      />
                    </label>
                  </div>
                </div>

                <input
                  type="text"
                  value={q.question}
                  onChange={(e) => updateDraft(q.id, { question: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs dark:border-slate-800 dark:bg-slate-900"
                />

                {!isEssay && (
                  <>
                    <div className={`grid gap-2 ${count === 3 ? "grid-cols-1 sm:grid-cols-3" : "grid-cols-1 sm:grid-cols-2"}`}>
                      {(["A", "B", "C", "D"] as const).map((opt) => {
                        if (opt === "C" && count < 3) return null;
                        if (opt === "D" && count < 4) return null;
                        const key = `option${opt}` as "optionA" | "optionB" | "optionC" | "optionD";
                        return (
                          <div key={opt}>
                            <label className="text-[11px] text-slate-500 block mb-0.5 font-bold">
                              الخيار ({opt === "A" ? "أ" : opt === "B" ? "ب" : opt === "C" ? "ج" : "د"})
                            </label>
                            <input
                              type="text"
                              value={q[key] || ""}
                              onChange={(e) => updateDraft(q.id, { [key]: e.target.value })}
                              className="w-full px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs dark:border-slate-800 dark:bg-slate-900"
                            />
                          </div>
                        );
                      })}
                    </div>
                    <div className="flex items-center gap-3">
                      <label className="text-xs font-bold text-slate-700 dark:text-slate-300">الإجابة الصحيحة:</label>
                      <select
                        value={q.correctAnswer || "A"}
                        onChange={(e) => updateDraft(q.id, { correctAnswer: e.target.value })}
                        className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-bold dark:border-slate-800 dark:bg-slate-900"
                      >
                        <option value="A">أ</option>
                        <option value="B">ب</option>
                        {count >= 3 && <option value="C">ج</option>}
                        {count >= 4 && <option value="D">د</option>}
                      </select>
                    </div>
                  </>
                )}

                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => void handleSave(q)}
                    disabled={savingId === q.id}
                    className="px-4 py-1.5 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-xs font-bold disabled:opacity-50"
                  >
                    {savingId === q.id ? "جارٍ الحفظ..." : "حفظ هذا السؤال"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function cloneQuestion(q: EditableQuizQuestion): EditableQuizQuestion {
  return {
    id: q.id,
    question: q.question || "",
    imageUrl: q.imageUrl || "",
    optionA: q.optionA || "",
    optionB: q.optionB || "",
    optionC: q.optionC || "",
    optionD: q.optionD || "",
    correctAnswer: q.correctAnswer || "A",
    questionType: q.questionType === "essay" ? "essay" : "mcq",
    degree: Number(q.degree) > 0 ? Number(q.degree) : 1,
  };
}
