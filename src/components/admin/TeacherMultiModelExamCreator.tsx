"use client";

import React, { useState, useEffect } from "react";
import {
  IconPlus,
  IconTrash,
  IconCheck,
  IconClose,
  IconClock,
  IconEye,
  IconEdit,
  IconBook,
} from "@/components/admin/AdminIcons";
import { useToast } from "@/components/ui/Toast";

interface QuestionInput {
  id?: string;
  type: "MCQ" | "ESSAY";
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
}

interface ModelTab {
  modelNumber: number;
  name: string;
  questions: QuestionInput[];
}

interface ExamData {
  id: string;
  title: string;
  description: string | null;
  hideAnswersUntilEssayGraded: boolean;
  showResultImmediately: boolean;
  createdAt: string;
  modelNumbers: number[];
  totalQuestions: number;
  attemptsCount: number;
}

interface AttemptData {
  id: string;
  userId: string;
  user: {
    id: string;
    name: string;
    email: string;
    phone: string | null;
  };
  modelNumber: number;
  modelName: string;
  status: string;
  essayGraded: boolean;
  score: number | null;
  createdAt: string;
}

export function TeacherMultiModelExamCreator() {
  const { success: toastSuccess, error: toastError } = useToast();

  const [viewMode, setViewMode] = useState<"list" | "create" | "grading">("list");
  const [exams, setExams] = useState<ExamData[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // حالة الامتحان
  const [editingExamId, setEditingExamId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [hideAnswersUntilEssayGraded, setHideAnswersUntilEssayGraded] = useState(false);

  // تبويبات النماذج: كل Tab له modelNumber مختلف
  const [models, setModels] = useState<ModelTab[]>([
    {
      modelNumber: 1,
      name: "نموذج 1",
      questions: [
        {
          type: "MCQ",
          question: "",
          options: ["", "", "", ""],
          correctIndex: 0,
          explanation: "",
        },
      ],
    },
  ]);
  const [activeModelIndex, setActiveModelIndex] = useState(0);

  // حالة تصحيح المحاولات
  const [selectedExamForGrading, setSelectedExamForGrading] = useState<ExamData | null>(null);
  const [attempts, setAttempts] = useState<AttemptData[]>([]);
  const [loadingAttempts, setLoadingAttempts] = useState(false);
  const [selectedAttemptForGrading, setSelectedAttemptForGrading] = useState<any | null>(null);
  const [essayGrades, setEssayGrades] = useState<Record<string, { score: number; feedback: string }>>({});
  const [submittingGrade, setSubmittingGrade] = useState(false);

  const fetchExams = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/exams");
      const data = await res.json();
      if (data.success) {
        setExams(data.exams || []);
      } else {
        toastError(data.error || "تعذر جلب الامتحانات");
      }
    } catch (err) {
      toastError("فشل الاتصال بالخادم");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchExams();
  }, []);

  // إضافة نموذج جديد (+ اضافة نموذج)
  const handleAddModel = () => {
    const nextNumber = models.length + 1;
    const newModel: ModelTab = {
      modelNumber: nextNumber,
      name: `نموذج ${nextNumber}`,
      questions: [
        {
          type: "MCQ",
          question: "",
          options: ["", "", "", ""],
          correctIndex: 0,
          explanation: "",
        },
      ],
    };
    setModels([...models, newModel]);
    setActiveModelIndex(models.length);
    toastSuccess(`تمت إضافة نموذج ${nextNumber}`);
  };

  // حذف نموذج
  const handleDeleteModel = (indexToDelete: number) => {
    if (models.length <= 1) {
      toastError("يجب أن يحتوي الامتحان على نموذج واحد على الأقل");
      return;
    }
    const updated = models
      .filter((_, i) => i !== indexToDelete)
      .map((m, idx) => ({
        ...m,
        modelNumber: idx + 1,
        name: `نموذج ${idx + 1}`,
      }));
    setModels(updated);
    setActiveModelIndex(Math.max(0, indexToDelete - 1));
  };

  // زرار نسخ اسئلة من نموذج 1
  const handleCopyFromModel1 = () => {
    if (activeModelIndex === 0) {
      toastError("أنت بالفعل في نموذج 1");
      return;
    }
    const model1Questions = models[0]?.questions || [];
    if (model1Questions.length === 0) {
      toastError("نموذج 1 لا يحتوي على أي أسئلة لنسخها");
      return;
    }

    const clonedQuestions: QuestionInput[] = JSON.parse(JSON.stringify(model1Questions));

    setModels((prev) => {
      const next = [...prev];
      next[activeModelIndex] = {
        ...next[activeModelIndex],
        questions: clonedQuestions,
      };
      return next;
    });

    toastSuccess(`تم نسخ ${clonedQuestions.length} سؤال من نموذج 1 بنجاح`);
  };

  // إضافة سؤال إلى النموذج الحالي
  const handleAddQuestion = (type: "MCQ" | "ESSAY") => {
    const newQuestion: QuestionInput = {
      type,
      question: "",
      options: type === "MCQ" ? ["", "", "", ""] : [],
      correctIndex: 0,
      explanation: "",
    };

    setModels((prev) => {
      const next = [...prev];
      const cur = next[activeModelIndex];
      next[activeModelIndex] = {
        ...cur,
        questions: [...cur.questions, newQuestion],
      };
      return next;
    });
  };

  // تعديل سؤال
  const handleUpdateQuestion = (qIndex: number, field: keyof QuestionInput, value: any) => {
    setModels((prev) => {
      const next = [...prev];
      const curQuestions = [...next[activeModelIndex].questions];
      curQuestions[qIndex] = {
        ...curQuestions[qIndex],
        [field]: value,
      };
      next[activeModelIndex] = {
        ...next[activeModelIndex],
        questions: curQuestions,
      };
      return next;
    });
  };

  // حذف سؤال
  const handleDeleteQuestion = (qIndex: number) => {
    setModels((prev) => {
      const next = [...prev];
      const curQuestions = next[activeModelIndex].questions.filter((_, i) => i !== qIndex);
      next[activeModelIndex] = {
        ...next[activeModelIndex],
        questions: curQuestions,
      };
      return next;
    });
  };

  // حفظ الامتحان
  const handleSaveExam = async () => {
    if (!title.trim()) {
      toastError("يرجى إدخال عنوان الامتحان");
      return;
    }

    // التحقق من صحة الأسئلة
    for (let m = 0; m < models.length; m++) {
      const mod = models[m];
      if (!mod.questions || mod.questions.length === 0) {
        toastError(`النموذج ${mod.modelNumber} فارغ، يرجى إضافة سؤال واحد على الأقل`);
        return;
      }
      for (let q = 0; q < mod.questions.length; q++) {
        const question = mod.questions[q];
        if (!question.question.trim()) {
          toastError(`يرجى إدخال نص السؤال رقم ${q + 1} في نموذج ${mod.modelNumber}`);
          return;
        }
        if (question.type === "MCQ") {
          const filled = question.options.filter((opt) => opt.trim());
          if (filled.length < 2) {
            toastError(`سؤال الاختيار من متعدد ${q + 1} في نموذج ${mod.modelNumber} يحتاج إلى خيارين على الأقل`);
            return;
          }
        }
      }
    }

    // تجميع كافة الأسئلة وإسناد modelNumber لكل منها
    const allQuestions = models.flatMap((m) =>
      m.questions.map((q, idx) => ({
        modelNumber: m.modelNumber,
        type: q.type,
        question: q.question.trim(),
        options: q.type === "MCQ" ? q.options : null,
        correctIndex: q.type === "MCQ" ? q.correctIndex : null,
        explanation: q.explanation || null,
        order: idx,
      }))
    );

    setSaving(true);
    try {
      const payload = {
        title: title.trim(),
        description: description.trim() || undefined,
        hideAnswersUntilEssayGraded,
        showResultImmediately: true,
        questions: allQuestions,
      };

      const url = editingExamId ? `/api/exams/${editingExamId}` : "/api/exams";
      const method = editingExamId ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (data.success) {
        toastSuccess(editingExamId ? "تم تحديث الامتحان بنجاح!" : "تم إنشاء الامتحان بنجاح!");
        resetForm();
        setViewMode("list");
        fetchExams();
      } else {
        toastError(data.error || "فشل في حفظ الامتحان");
      }
    } catch (err) {
      toastError("حدث خطأ أثناء حفظ الامتحان");
    } finally {
      setSaving(false);
    }
  };

  const resetForm = () => {
    setEditingExamId(null);
    setTitle("");
    setDescription("");
    setHideAnswersUntilEssayGraded(false);
    setModels([
      {
        modelNumber: 1,
        name: "نموذج 1",
        questions: [
          {
            type: "MCQ",
            question: "",
            options: ["", "", "", ""],
            correctIndex: 0,
            explanation: "",
          },
        ],
      },
    ]);
    setActiveModelIndex(0);
  };

  const handleEditExam = async (examId: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/exams/${examId}`);
      const data = await res.json();
      if (data.success && data.exam) {
        const ex = data.exam;
        setEditingExamId(ex.id);
        setTitle(ex.title);
        setDescription(ex.description || "");
        setHideAnswersUntilEssayGraded(ex.hideAnswersUntilEssayGraded);

        // توزيع الأسئلة على التبويبات بحسب modelNumber
        const questionsByModel = new Map<number, QuestionInput[]>();
        if (Array.isArray(ex.questions)) {
          ex.questions.forEach((q: any) => {
            const mNum = q.modelNumber || 1;
            if (!questionsByModel.has(mNum)) {
              questionsByModel.set(mNum, []);
            }
            questionsByModel.get(mNum)!.push({
              id: q.id,
              type: q.type,
              question: q.question,
              options: q.options || ["", "", "", ""],
              correctIndex: q.correctIndex ?? 0,
              explanation: q.explanation || "",
            });
          });
        }

        const loadedModels: ModelTab[] = [];
        const sortedModelNums = Array.from(questionsByModel.keys()).sort((a, b) => a - b);
        if (sortedModelNums.length === 0) sortedModelNums.push(1);

        sortedModelNums.forEach((num) => {
          loadedModels.push({
            modelNumber: num,
            name: `نموذج ${num}`,
            questions: questionsByModel.get(num) || [
              {
                type: "MCQ",
                question: "",
                options: ["", "", "", ""],
                correctIndex: 0,
                explanation: "",
              },
            ],
          });
        });

        setModels(loadedModels);
        setActiveModelIndex(0);
        setViewMode("create");
      } else {
        toastError(data.error || "تعذر جلب تفاصيل الامتحان");
      }
    } catch (err) {
      toastError("فشل تحميل الامتحان");
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteExam = async (examId: string) => {
    if (!confirm("هل أنت متأكد من حذف هذا الامتحان ونتائج الطلاب؟")) return;

    try {
      const res = await fetch(`/api/exams/${examId}`, { method: "DELETE" });
      const data = await res.json();
      if (data.success) {
        toastSuccess("تم حذف الامتحان بنجاح");
        fetchExams();
      } else {
        toastError(data.error || "تعذر حذف الامتحان");
      }
    } catch (err) {
      toastError("فشل في حذف الامتحان");
    }
  };

  const handleOpenGrading = async (exam: ExamData) => {
    setSelectedExamForGrading(exam);
    setViewMode("grading");
    setLoadingAttempts(true);
    try {
      const res = await fetch(`/api/exams/${exam.id}/attempts`);
      const data = await res.json();
      if (data.success) {
        setAttempts(data.attempts || []);
      } else {
        toastError(data.error || "تعذر جلب المحاولات");
      }
    } catch (err) {
      toastError("فشل جلب المحاولات");
    } finally {
      setLoadingAttempts(false);
    }
  };

  const handleOpenAttemptDetail = async (attemptId: string) => {
    try {
      const res = await fetch(`/api/exams/attempt/${attemptId}/result`);
      const data = await res.json();
      if (data.success) {
        setSelectedAttemptForGrading(data);
        const initialGrades: Record<string, { score: number; feedback: string }> = {};
        data.questions.forEach((q: any) => {
          if (q.type === "ESSAY") {
            initialGrades[q.id] = {
              score: q.studentAnswer?.score ?? 0,
              feedback: q.studentAnswer?.feedback ?? "",
            };
          }
        });
        setEssayGrades(initialGrades);
      } else {
        toastError(data.error || "تعذر جلب إجابات المحاولة");
      }
    } catch (err) {
      toastError("فشل جلب إجابات المحاولة");
    }
  };

  const handleSaveGrades = async (attemptId: string) => {
    setSubmittingGrade(true);
    try {
      const gradesArray = Object.entries(essayGrades).map(([questionId, g]) => ({
        questionId,
        score: Number(g.score) || 0,
        feedback: g.feedback,
      }));

      const res = await fetch(`/api/exams/attempt/${attemptId}/grade`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ grades: gradesArray }),
      });

      const data = await res.json();
      if (data.success) {
        toastSuccess("تم حفظ التصحيح واعتماد النتيجة بنجاح!");
        setSelectedAttemptForGrading(null);
        if (selectedExamForGrading) {
          handleOpenGrading(selectedExamForGrading);
        }
      } else {
        toastError(data.error || "تعذر حفظ التصحيح");
      }
    } catch (err) {
      toastError("فشل حفظ التصحيح");
    } finally {
      setSubmittingGrade(false);
    }
  };

  const activeModel = models[activeModelIndex] || models[0];

  return (
    <div className="w-full space-y-6">
      {/* الشريط العلوي */}
      <div className="flex flex-wrap items-center justify-between gap-4 p-5 bg-[var(--surface)] border border-[var(--border)] rounded-2xl shadow-sm">
        <div>
          <h2 className="text-xl font-bold text-[var(--ink)] flex items-center gap-2">
            <IconBook className="w-6 h-6 text-sky-500" />
            نظام الامتحانات (النماذج المتعددة)
          </h2>
          <p className="text-xs text-[var(--ink-muted)] mt-1">
            إنشاء نماذج عشوائية لمنع الغش مع ميزة حجب الإجابات والدرجات حتى تصحيح الأسئلة المقالية
          </p>
        </div>

        <div className="flex items-center gap-2">
          {viewMode !== "list" && (
            <button
              onClick={() => {
                setViewMode("list");
                resetForm();
                setSelectedAttemptForGrading(null);
              }}
              className="px-4 py-2 text-sm font-semibold rounded-xl border border-[var(--border)] bg-[var(--surface-sunken)] hover:bg-[var(--surface-raised)] text-[var(--ink)] transition-colors"
            >
              العودة للقائمة
            </button>
          )}

          {viewMode === "list" && (
            <button
              onClick={() => {
                resetForm();
                setViewMode("create");
              }}
              className="flex items-center gap-2 px-5 py-2.5 text-sm font-bold text-white bg-sky-600 hover:bg-sky-700 rounded-xl shadow-md transition-all"
            >
              <IconPlus className="w-4 h-4" />
              إنشاء امتحان جديد
            </button>
          )}
        </div>
      </div>

      {/* 1. وضع القائمة */}
      {viewMode === "list" && (
        <div className="space-y-4">
          {loading ? (
            <div className="p-12 text-center text-sm text-[var(--ink-muted)]">جاري تحميل الامتحانات...</div>
          ) : exams.length === 0 ? (
            <div className="p-12 text-center bg-[var(--surface)] border border-[var(--border)] rounded-2xl">
              <IconBook className="w-12 h-12 text-[var(--ink-muted)] mx-auto mb-3 opacity-40" />
              <p className="text-base font-bold text-[var(--ink)]">لا توجد امتحانات بعد</p>
              <p className="text-xs text-[var(--ink-muted)] mt-1 mb-4">
                ابدأ بإنشاء أول امتحان بنماذج متعددة وخيار حجب الإجابات
              </p>
              <button
                onClick={() => {
                  resetForm();
                  setViewMode("create");
                }}
                className="px-5 py-2.5 text-sm font-bold text-white bg-sky-600 hover:bg-sky-700 rounded-xl"
              >
                إنشاء امتحان الآن
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {exams.map((exam) => (
                <div
                  key={exam.id}
                  className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-5 flex flex-col justify-between hover:border-sky-500/50 transition-all shadow-sm"
                >
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="font-bold text-base text-[var(--ink)] line-clamp-1">{exam.title}</h3>
                      <span className="px-2.5 py-1 text-[11px] font-bold rounded-lg bg-sky-500/10 text-sky-600 border border-sky-500/20">
                        {exam.modelNumbers?.length || 1} نماذج
                      </span>
                    </div>

                    {exam.description && (
                      <p className="text-xs text-[var(--ink-muted)] line-clamp-2">{exam.description}</p>
                    )}

                    <div className="pt-2">
                      {exam.hideAnswersUntilEssayGraded ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-semibold text-amber-700 dark:text-amber-300 bg-amber-500/10 border border-amber-500/20 rounded-lg">
                          🔒 إخفاء الإجابات حتى تصحيح المقالي: مفعّل
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-semibold text-[var(--ink-muted)] bg-[var(--surface-sunken)] rounded-lg">
                          🔓 عرض النتيجة فورياً للطالب
                        </span>
                      )}
                    </div>

                    <div className="text-[11px] text-[var(--ink-muted)] flex items-center justify-between pt-1">
                      <span>المحاولات: {exam.attemptsCount ?? 0} طالب</span>
                      <span>{new Date(exam.createdAt).toLocaleDateString("ar-EG")}</span>
                    </div>
                  </div>

                  <div className="pt-5 mt-4 border-t border-[var(--border)] flex flex-wrap items-center gap-2">
                    <button
                      onClick={() => handleOpenGrading(exam)}
                      className="flex-1 py-2 text-xs font-bold text-sky-600 bg-sky-500/10 hover:bg-sky-500/20 rounded-xl transition-colors text-center"
                    >
                      تصحيح ومحاولات الطلاب
                    </button>

                    <button
                      onClick={() => {
                        const link = `${window.location.origin}/exams/${exam.id}`;
                        navigator.clipboard.writeText(link);
                        toastSuccess("تم نسخ رابط الامتحان للطالب بنجاح!");
                      }}
                      title="نسخ رابط الامتحان للطالب"
                      className="p-2 text-xs rounded-xl border border-[var(--border)] hover:bg-[var(--surface-sunken)] text-[var(--ink)]"
                    >
                      🔗
                    </button>

                    <button
                      onClick={() => handleEditExam(exam.id)}
                      title="تعديل الامتحان"
                      className="p-2 text-xs rounded-xl border border-[var(--border)] hover:bg-[var(--surface-sunken)] text-sky-600"
                    >
                      <IconEdit className="w-4 h-4" />
                    </button>

                    <button
                      onClick={() => handleDeleteExam(exam.id)}
                      title="حذف الامتحان"
                      className="p-2 text-xs rounded-xl border border-red-500/20 hover:bg-red-500/10 text-red-600"
                    >
                      <IconTrash className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 2. وضع إنشاء الامتحان */}
      {viewMode === "create" && (
        <div className="space-y-6">
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-6 space-y-5">
            <h3 className="font-bold text-base text-[var(--ink)] border-b border-[var(--border)] pb-3">
              1. بيانات الامتحان
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-[var(--ink)] mb-1.5">
                  عنوان الامتحان <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="مثال: امتحان الأحياء الشامل"
                  className="w-full px-4 py-2.5 text-sm rounded-xl border border-[var(--border)] bg-[var(--surface-sunken)] focus:ring-2 focus:ring-sky-500 text-[var(--ink)] outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[var(--ink)] mb-1.5">وصف أو تعليمات (اختياري)</label>
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="تعليمات للطالب قبل بدء الحل..."
                  className="w-full px-4 py-2.5 text-sm rounded-xl border border-[var(--border)] bg-[var(--surface-sunken)] focus:ring-2 focus:ring-sky-500 text-[var(--ink)] outline-none"
                />
              </div>
            </div>

            {/* Toggle اخفاء الاجابات حتى تصحيح المقالي */}
            <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 flex flex-wrap items-center justify-between gap-4">
              <div className="max-w-2xl">
                <div className="flex items-center gap-2">
                  <span className="text-base">🔒</span>
                  <span className="text-sm font-bold text-[var(--ink)]">
                    اخفاء الاجابات حتى تصحيح المقالي
                  </span>
                </div>
                <p className="text-xs text-[var(--ink-muted)] mt-1">
                  عند التفعيل: لن يتمكن الطالب من رؤية أي إجابة صحيحة أو درجات MCQ حتى يقوم المعلم بتصحيح كافة الأسئلة المقالية.
                </p>
              </div>

              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={hideAnswersUntilEssayGraded}
                  onChange={(e) => setHideAnswersUntilEssayGraded(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-12 h-6 bg-gray-300 peer-focus:outline-none rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-amber-600"></div>
              </label>
            </div>
          </div>

          {/* فوق الاسئلة: Tabs نموذج 1 | نموذج 2 | + اضافة نموذج + زرار نسخ اسئلة من نموذج 1 */}
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-6 space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] pb-4">
              <div>
                <h3 className="font-bold text-base text-[var(--ink)]">2. نماذج الأسئلة</h3>
                <p className="text-xs text-[var(--ink-muted)] mt-0.5">
                  يتلقى كل طالب نموذجاً عشوائياً، ويتم تثبيت نفس النموذج للطالب عند إعادة المحاولة لمنع الغش
                </p>
              </div>

              <div className="flex items-center gap-2">
                {activeModelIndex !== 0 && (
                  <button
                    type="button"
                    onClick={handleCopyFromModel1}
                    className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold rounded-xl border border-sky-500/30 bg-sky-500/10 hover:bg-sky-500/20 text-sky-600 transition-colors"
                  >
                    📋 نسخ اسئلة من نموذج 1
                  </button>
                )}

                <button
                  type="button"
                  onClick={handleAddModel}
                  className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-white bg-sky-600 hover:bg-sky-700 rounded-xl transition-all shadow-sm"
                >
                  <IconPlus className="w-3.5 h-3.5" />
                  + اضافة نموذج
                </button>
              </div>
            </div>

            {/* شريط Tabs: نموذج 1 | نموذج 2 | ... */}
            <div className="flex flex-wrap items-center gap-2 border-b border-[var(--border)] pb-3">
              {models.map((model, idx) => (
                <div
                  key={idx}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold cursor-pointer transition-all ${
                    activeModelIndex === idx
                      ? "bg-sky-600 text-white shadow-sm"
                      : "bg-[var(--surface-sunken)] text-[var(--ink)] hover:bg-[var(--surface-raised)] border border-[var(--border)]"
                  }`}
                  onClick={() => setActiveModelIndex(idx)}
                >
                  <span>نموذج {model.modelNumber}</span>
                  <span
                    className={`text-[11px] px-1.5 py-0.5 rounded-full ${
                      activeModelIndex === idx ? "bg-white/20 text-white" : "bg-[var(--surface)] text-[var(--ink-muted)]"
                    }`}
                  >
                    {model.questions.length} أسئلة
                  </span>

                  {models.length > 1 && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteModel(idx);
                      }}
                      className="hover:text-red-300 ml-1"
                      title="حذف هذا النموذج"
                    >
                      <IconClose className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>

            {/* محرر الأسئلة للنموذج النشط */}
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs font-bold text-[var(--ink)]">
                  أسئلة نموذج {activeModel.modelNumber} (يتم حفظها بـ modelNumber = {activeModel.modelNumber}):
                </span>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleAddQuestion("MCQ")}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-sky-600 bg-sky-500/10 hover:bg-sky-500/20 rounded-lg transition-colors"
                  >
                    <IconPlus className="w-3.5 h-3.5" />
                    إضافة سؤال اختيار من متعدد (MCQ)
                  </button>

                  <button
                    type="button"
                    onClick={() => handleAddQuestion("ESSAY")}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-emerald-600 bg-emerald-500/10 hover:bg-emerald-500/20 rounded-lg transition-colors"
                  >
                    <IconPlus className="w-3.5 h-3.5" />
                    إضافة سؤال مقالي (ESSAY)
                  </button>
                </div>
              </div>

              {/* بطاقات الأسئلة */}
              <div className="space-y-4 pt-2">
                {activeModel.questions.map((q, qIdx) => (
                  <div
                    key={qIdx}
                    className="p-5 rounded-2xl border border-[var(--border)] bg-[var(--surface-sunken)]/50 space-y-4 relative"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <span className="w-6 h-6 rounded-full bg-sky-500/20 text-sky-600 flex items-center justify-center text-xs font-black">
                          {qIdx + 1}
                        </span>
                        <span
                          className={`text-xs font-black px-2.5 py-0.5 rounded-lg ${
                            q.type === "MCQ"
                              ? "bg-sky-500/10 text-sky-600 border border-sky-500/20"
                              : "bg-emerald-500/10 text-emerald-600 border border-emerald-500/20"
                          }`}
                        >
                          {q.type === "MCQ" ? "اختيار من متعدد (MCQ)" : "سؤال مقالي (ESSAY)"}
                        </span>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleDeleteQuestion(qIdx)}
                        className="text-red-500 hover:text-red-600 p-1"
                        title="حذف السؤال"
                      >
                        <IconTrash className="w-4 h-4" />
                      </button>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-[var(--ink)] mb-1">نص السؤال:</label>
                      <textarea
                        rows={2}
                        value={q.question}
                        onChange={(e) => handleUpdateQuestion(qIdx, "question", e.target.value)}
                        placeholder="اكتب نص السؤال هنا..."
                        className="w-full p-3 text-sm rounded-xl border border-[var(--border)] bg-[var(--surface)] text-[var(--ink)] focus:ring-2 focus:ring-sky-500 outline-none"
                      />
                    </div>

                    {q.type === "MCQ" && (
                      <div className="space-y-3">
                        <label className="block text-xs font-bold text-[var(--ink)]">
                          الخيارات (حدد الدائرة بجانب الخيار الصحيح):
                        </label>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          {q.options.map((opt, optIdx) => (
                            <div
                              key={optIdx}
                              className={`flex items-center gap-2 p-2.5 rounded-xl border transition-all ${
                                q.correctIndex === optIdx
                                  ? "border-emerald-500 bg-emerald-500/10"
                                  : "border-[var(--border)] bg-[var(--surface)]"
                              }`}
                            >
                              <input
                                type="radio"
                                name={`q_${activeModel.modelNumber}_${qIdx}_correct`}
                                checked={q.correctIndex === optIdx}
                                onChange={() => handleUpdateQuestion(qIdx, "correctIndex", optIdx)}
                                className="w-4 h-4 text-emerald-600 cursor-pointer"
                              />
                              <input
                                type="text"
                                value={opt}
                                onChange={(e) => {
                                  const updatedOpts = [...q.options];
                                  updatedOpts[optIdx] = e.target.value;
                                  handleUpdateQuestion(qIdx, "options", updatedOpts);
                                }}
                                placeholder={`اختيار ${optIdx + 1}`}
                                className="flex-1 bg-transparent text-sm text-[var(--ink)] outline-none"
                              />
                            </div>
                          ))}
                        </div>

                        <div>
                          <label className="block text-xs font-bold text-[var(--ink-muted)] mb-1">
                            تفسير الإجابة الصحيحة (يظهر للطالب بعد التصحيح):
                          </label>
                          <input
                            type="text"
                            value={q.explanation}
                            onChange={(e) => handleUpdateQuestion(qIdx, "explanation", e.target.value)}
                            placeholder="توضيح أو تعليل الإجابة الصحيحة..."
                            className="w-full px-3 py-2 text-xs rounded-xl border border-[var(--border)] bg-[var(--surface)] text-[var(--ink)] outline-none"
                          />
                        </div>
                      </div>
                    )}

                    {q.type === "ESSAY" && (
                      <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-xs text-[var(--ink)] space-y-1">
                        <p className="font-bold flex items-center gap-1.5 text-emerald-700 dark:text-emerald-300">
                          <span>✍️</span> هذا السؤال مقالي
                        </p>
                        <p className="text-[var(--ink-muted)]">
                          سيظهر للطالب مربع كتابة لإدخال إجابته النصية، وستظهر إجابته في قسم التصحيح لتمنحه الدرجة وملاحظاتك يدوياً.
                        </p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-4">
            <button
              type="button"
              onClick={() => {
                resetForm();
                setViewMode("list");
              }}
              className="px-5 py-2.5 text-sm font-bold rounded-xl border border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--surface-sunken)] text-[var(--ink)]"
            >
              إلغاء
            </button>

            <button
              type="button"
              onClick={handleSaveExam}
              disabled={saving}
              className="flex items-center gap-2 px-6 py-2.5 text-sm font-bold text-white bg-sky-600 hover:bg-sky-700 rounded-xl shadow-md disabled:opacity-50"
            >
              <IconCheck className="w-4 h-4" />
              {saving ? "جاري الحفظ..." : editingExamId ? "تحديث الامتحان" : "حفظ ونشر الامتحان"}
            </button>
          </div>
        </div>
      )}

      {/* 3. قسم تصحيح المحاولات */}
      {viewMode === "grading" && selectedExamForGrading && (
        <div className="space-y-5">
          <div className="p-5 bg-[var(--surface)] border border-[var(--border)] rounded-2xl flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-lg font-bold text-[var(--ink)]">
                محاولات الطلاب: {selectedExamForGrading.title}
              </h3>
              <p className="text-xs text-[var(--ink-muted)] mt-0.5">
                تصحيح الأسئلة المقالية واعتماد النتيجة لرفع الحجب عن الطالب
              </p>
            </div>

            <span className="px-3 py-1.5 text-xs font-bold rounded-xl bg-sky-500/10 text-sky-600 border border-sky-500/20">
              إجمالي المحاولات: {attempts.length}
            </span>
          </div>

          {loadingAttempts ? (
            <div className="p-12 text-center text-sm text-[var(--ink-muted)]">جاري تحميل المحاولات...</div>
          ) : attempts.length === 0 ? (
            <div className="p-12 text-center bg-[var(--surface)] border border-[var(--border)] rounded-2xl text-[var(--ink-muted)] text-sm">
              لم يقم أي طالب ببدء هذا الامتحان حتى الآن.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-[var(--border)] bg-[var(--surface)]">
              <table className="w-full text-right text-sm">
                <thead className="bg-[var(--surface-sunken)] border-b border-[var(--border)] text-xs text-[var(--ink-muted)]">
                  <tr>
                    <th className="p-4">الطالب</th>
                    <th className="p-4">رقم الهاتف</th>
                    <th className="p-4">النموذج</th>
                    <th className="p-4">حالة المحاولة</th>
                    <th className="p-4">الدرجة</th>
                    <th className="p-4">تاريخ المحاولة</th>
                    <th className="p-4 text-center">الإجراء</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {attempts.map((att) => (
                    <tr key={att.id} className="hover:bg-[var(--surface-sunken)]/50 transition-colors">
                      <td className="p-4 font-bold text-[var(--ink)]">{att.user?.name || "طالب"}</td>
                      <td className="p-4 text-xs text-[var(--ink-muted)]">{att.user?.phone || "—"}</td>
                      <td className="p-4 text-xs font-semibold text-sky-600">{att.modelName || `نموذج ${att.modelNumber}`}</td>
                      <td className="p-4">
                        {att.status === "PENDING_ESSAY_CORRECTION" ? (
                          <span className="px-2.5 py-1 text-xs font-bold rounded-lg bg-amber-500/10 text-amber-600 border border-amber-500/20">
                            ⏳ بانتظار تصحيح المقالي
                          </span>
                        ) : att.status === "GRADED" ? (
                          <span className="px-2.5 py-1 text-xs font-bold rounded-lg bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
                            ✅ تم التصحيح والتقييم
                          </span>
                        ) : (
                          <span className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-blue-500/10 text-blue-600">
                            🔄 قيد الحل
                          </span>
                        )}
                      </td>
                      <td className="p-4 font-bold text-[var(--ink)]">
                        {att.score !== null ? `${att.score}%` : "—"}
                      </td>
                      <td className="p-4 text-xs text-[var(--ink-muted)]">
                        {new Date(att.createdAt).toLocaleDateString("ar-EG")}
                      </td>
                      <td className="p-4 text-center">
                        <button
                          onClick={() => handleOpenAttemptDetail(att.id)}
                          className="px-3.5 py-1.5 text-xs font-bold text-white bg-sky-600 hover:bg-sky-700 rounded-xl transition-all"
                        >
                          {att.status === "PENDING_ESSAY_CORRECTION" ? "تصحيح المقالي ✍️" : "مراجعة الإجابات 👁️"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* نافذة تفاصيل وتصحيح محاولة */}
          {selectedAttemptForGrading && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
              <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-6 max-w-3xl w-full max-h-[90vh] overflow-y-auto shadow-2xl space-y-6">
                <div className="flex items-center justify-between border-b border-[var(--border)] pb-4">
                  <div>
                    <h3 className="text-base font-bold text-[var(--ink)]">
                      تصحيح إجابات: {selectedAttemptForGrading.student?.name}
                    </h3>
                    <p className="text-xs text-[var(--ink-muted)] mt-0.5">
                      النموذج: {selectedAttemptForGrading.modelName || `نموذج ${selectedAttemptForGrading.modelNumber}`} | الحالة: {selectedAttemptForGrading.status}
                    </p>
                  </div>
                  <button
                    onClick={() => setSelectedAttemptForGrading(null)}
                    className="p-2 text-[var(--ink-muted)] hover:text-[var(--ink)]"
                  >
                    <IconClose className="w-5 h-5" />
                  </button>
                </div>

                <div className="space-y-4">
                  {selectedAttemptForGrading.questions.map((q: any, idx: number) => (
                    <div
                      key={q.id}
                      className={`p-4 rounded-xl border ${
                        q.type === "ESSAY"
                          ? "border-amber-500/30 bg-amber-500/5"
                          : "border-[var(--border)] bg-[var(--surface-sunken)]/50"
                      } space-y-3`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-[var(--ink)]">
                          السؤال {idx + 1}: {q.question}
                        </span>
                        <span
                          className={`text-[11px] font-bold px-2 py-0.5 rounded-lg ${
                            q.type === "ESSAY"
                              ? "bg-amber-500/20 text-amber-600"
                              : "bg-sky-500/20 text-sky-600"
                          }`}
                        >
                          {q.type === "ESSAY" ? "سؤال مقالي" : "اختيار من متعدد"}
                        </span>
                      </div>

                      {q.type === "MCQ" ? (
                        <div className="text-xs space-y-1">
                          <p className="text-[var(--ink-muted)]">
                            إجابة الطالب:{" "}
                            <span className="font-bold text-[var(--ink)]">
                              {q.options && q.studentAnswer?.selectedIndex !== null
                                ? q.options[q.studentAnswer.selectedIndex]
                                : "لم يجب"}
                            </span>
                          </p>
                          <p className="text-emerald-600 font-bold">
                            الإجابة الصحيحة: {q.options ? q.options[q.correctIndex] : ""}
                          </p>
                        </div>
                      ) : (
                        <div className="space-y-3 pt-2">
                          <div>
                            <label className="block text-xs font-bold text-[var(--ink-muted)] mb-1">
                              إجابة الطالب النصية:
                            </label>
                            <div className="p-3 rounded-xl bg-[var(--surface)] border border-[var(--border)] text-sm text-[var(--ink)] font-mono whitespace-pre-wrap">
                              {q.studentAnswer?.essayText || "لا توجد إجابة مقدمة"}
                            </div>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                            <div>
                              <label className="block text-xs font-bold text-[var(--ink)] mb-1">
                                درجة هذا السؤال (من 10):
                              </label>
                              <input
                                type="number"
                                min={0}
                                max={10}
                                value={essayGrades[q.id]?.score ?? 0}
                                onChange={(e) =>
                                  setEssayGrades((prev) => ({
                                    ...prev,
                                    [q.id]: {
                                      ...prev[q.id],
                                      score: Number(e.target.value),
                                    },
                                  }))
                                }
                                className="w-full px-3 py-2 text-sm rounded-xl border border-[var(--border)] bg-[var(--surface)] text-[var(--ink)]"
                              />
                            </div>

                            <div>
                              <label className="block text-xs font-bold text-[var(--ink)] mb-1">
                                ملاحظات للطالب (اختياري):
                              </label>
                              <input
                                type="text"
                                value={essayGrades[q.id]?.feedback ?? ""}
                                onChange={(e) =>
                                  setEssayGrades((prev) => ({
                                    ...prev,
                                    [q.id]: {
                                      ...prev[q.id],
                                      feedback: e.target.value,
                                    },
                                  }))
                                }
                                placeholder="ملاحظات المعلم على الإجابة..."
                                className="w-full px-3 py-2 text-sm rounded-xl border border-[var(--border)] bg-[var(--surface)] text-[var(--ink)]"
                              />
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                <div className="flex items-center justify-end gap-3 pt-4 border-t border-[var(--border)]">
                  <button
                    type="button"
                    onClick={() => setSelectedAttemptForGrading(null)}
                    className="px-4 py-2 text-xs font-bold rounded-xl border border-[var(--border)] text-[var(--ink)]"
                  >
                    إغلاق
                  </button>

                  <button
                    type="button"
                    disabled={submittingGrade}
                    onClick={() => {
                      const att = attempts.find(
                        (a) => a.user?.id === selectedAttemptForGrading.student?.id
                      );
                      if (att) handleSaveGrades(att.id);
                    }}
                    className="px-5 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-md disabled:opacity-50"
                  >
                    {submittingGrade ? "جاري الحفظ..." : "اعتماد النتيجة ورفع الحجب عن الطالب ✅"}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
