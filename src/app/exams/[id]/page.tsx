"use client";

import React, { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { Navbar } from "@/components/ui/Navbar";
import { Footer } from "@/components/ui/Footer";
import { useToast } from "@/components/ui/Toast";

interface SafeQuestion {
  id: string;
  type: "MCQ" | "ESSAY";
  question: string;
  options?: string[];
  order: number;
}

export default function StudentExamTakingPage() {
  const params = useParams();
  const router = useRouter();
  const { error: toastError, success: toastSuccess } = useToast();

  const examId = params?.id as string;

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [examTitle, setExamTitle] = useState("");
  const [modelName, setModelName] = useState("");
  const [attemptId, setAttemptId] = useState("");
  const [questions, setQuestions] = useState<SafeQuestion[]>([]);

  // إجابات الطالب
  // answers: Record<questionId, { selectedIndex?: number; essayText?: string }>
  const [answers, setAnswers] = useState<
    Record<string, { selectedIndex?: number | null; essayText?: string }>
  >({});

  // بدء أو استئناف الامتحان
  useEffect(() => {
    if (!examId) return;

    const startExam = async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/exams/${examId}/start`, {
          method: "POST",
        });

        const data = await res.json();
        if (data.success) {
          setAttemptId(data.attemptId);
          setExamTitle(data.examTitle);
          setModelName(data.modelName);
          setQuestions(data.questions || []);

          // استعادة الإجابات المحفوظة إذا كانت موجودة
          if (Array.isArray(data.savedAnswers)) {
            const savedMap: Record<string, any> = {};
            data.savedAnswers.forEach((a: any) => {
              savedMap[a.questionId] = {
                selectedIndex: a.selectedIndex ?? null,
                essayText: a.essayText ?? "",
              };
            });
            setAnswers(savedMap);
          }
        } else {
          toastError(data.error || "تعذر بدء الامتحان");
        }
      } catch (err) {
        toastError("فشل في الاتصال بالخادم لبدء الامتحان");
      } finally {
        setLoading(false);
      }
    };

    startExam();
  }, [examId]);

  const handleSelectMCQ = (questionId: string, optionIndex: number) => {
    setAnswers((prev) => ({
      ...prev,
      [questionId]: {
        ...prev[questionId],
        selectedIndex: optionIndex,
      },
    }));
  };

  const handleEssayChange = (questionId: string, text: string) => {
    setAnswers((prev) => ({
      ...prev,
      [questionId]: {
        ...prev[questionId],
        essayText: text,
      },
    }));
  };

  const handleSubmitExam = async () => {
    // حساب كم سؤال تم حله
    const totalQ = questions.length;
    let answeredCount = 0;
    questions.forEach((q) => {
      const ans = answers[q.id];
      if (q.type === "MCQ" && typeof ans?.selectedIndex === "number") answeredCount++;
      if (q.type === "ESSAY" && ans?.essayText?.trim()) answeredCount++;
    });

    const unanswered = totalQ - answeredCount;
    if (unanswered > 0) {
      if (!confirm(`لديك ${unanswered} أسئلة لم تجب عليها بعد. هل أنت متأكد من رغبتك في تسليم الامتحان؟`)) {
        return;
      }
    } else {
      if (!confirm("هل أنت متأكد من تسليم إجابات الامتحان؟")) {
        return;
      }
    }

    setSubmitting(true);
    try {
      const answersArray = questions.map((q) => {
        const studentAns = answers[q.id];
        return {
          questionId: q.id,
          selectedIndex: studentAns?.selectedIndex ?? undefined,
          essayText: studentAns?.essayText ?? undefined,
        };
      });

      const res = await fetch(`/api/exams/attempt/${attemptId}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers: answersArray }),
      });

      const data = await res.json();
      if (data.success) {
        toastSuccess("تم تسليم الامتحان بنجاح!");
        router.push(`/exams/${examId}/result/${attemptId}`);
      } else {
        toastError(data.error || "فشل في تسليم الامتحان");
      }
    } catch (err) {
      toastError("حدث خطأ أثناء تسليم الامتحان");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div dir="rtl" className="min-h-screen flex flex-col bg-[var(--background)] text-[var(--ink)]">
      <Navbar />

      <main className="flex-1 max-w-4xl w-full mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
        {loading ? (
          <div className="p-16 text-center text-sm text-[var(--ink-muted)]">
            جاري تحضير نموذج الامتحان الخاص بك...
          </div>
        ) : (
          <>
            {/* بطاقة رأس الامتحان */}
            <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-6 shadow-sm flex flex-wrap items-center justify-between gap-4">
              <div>
                <h1 className="text-xl sm:text-2xl font-bold text-[var(--ink)]">{examTitle}</h1>
                <div className="flex items-center gap-2 mt-2">
                  <span className="px-3 py-1 text-xs font-bold rounded-lg bg-sky-500/10 text-sky-600 border border-sky-500/20">
                    النموذج المخصص: {modelName}
                  </span>
                  <span className="text-xs text-[var(--ink-muted)]">عدد الأسئلة: {questions.length}</span>
                </div>
              </div>

              <button
                type="button"
                onClick={handleSubmitExam}
                disabled={submitting}
                className="px-6 py-2.5 text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-md transition-all disabled:opacity-50"
              >
                {submitting ? "جاري التسليم..." : "تسليم الامتحان ✅"}
              </button>
            </div>

            {/* قائمة الأسئلة */}
            <div className="space-y-6">
              {questions.map((q, idx) => {
                const currentAnswer = answers[q.id];

                return (
                  <div
                    key={q.id}
                    className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-6 shadow-sm space-y-4"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <span className="w-7 h-7 rounded-full bg-sky-600 text-white flex items-center justify-center text-xs font-black">
                          {idx + 1}
                        </span>
                        <span
                          className={`text-xs font-bold px-2.5 py-0.5 rounded-lg ${
                            q.type === "MCQ"
                              ? "bg-sky-500/10 text-sky-600"
                              : "bg-emerald-500/10 text-emerald-600"
                          }`}
                        >
                          {q.type === "MCQ" ? "اختيار من متعدد" : "سؤال مقالي"}
                        </span>
                      </div>
                    </div>

                    {/* نص السؤال */}
                    <div className="text-base font-bold text-[var(--ink)] leading-relaxed">{q.question}</div>

                    {/* خيارات MCQ */}
                    {q.type === "MCQ" && q.options && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                        {q.options.map((opt, optIdx) => {
                          const isSelected = currentAnswer?.selectedIndex === optIdx;

                          return (
                            <button
                              key={optIdx}
                              type="button"
                              onClick={() => handleSelectMCQ(q.id, optIdx)}
                              className={`flex items-center gap-3 p-3.5 rounded-xl border text-right transition-all ${
                                isSelected
                                  ? "border-sky-500 bg-sky-500/10 shadow-sm font-bold text-sky-600"
                                  : "border-[var(--border)] bg-[var(--surface-sunken)] hover:bg-[var(--surface-raised)] text-[var(--ink)]"
                              }`}
                            >
                              <div
                                className={`w-5 h-5 rounded-full border flex items-center justify-center shrink-0 ${
                                  isSelected ? "border-sky-600 bg-sky-600 text-white" : "border-[var(--border)]"
                                }`}
                              >
                                {isSelected && <div className="w-2 h-2 rounded-full bg-white" />}
                              </div>
                              <span className="text-sm">{opt}</span>
                            </button>
                          );
                        })}
                      </div>
                    )}

                    {/* مساحة كتابة الإجابة المقالية */}
                    {q.type === "ESSAY" && (
                      <div className="pt-2 space-y-2">
                        <textarea
                          rows={4}
                          value={currentAnswer?.essayText || ""}
                          onChange={(e) => handleEssayChange(q.id, e.target.value)}
                          placeholder="اكتب إجابتك المقالية بالتفصيل هنا..."
                          className="w-full p-4 text-sm rounded-xl border border-[var(--border)] bg-[var(--surface-sunken)] text-[var(--ink)] focus:ring-2 focus:ring-sky-500 outline-none leading-relaxed"
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* زر التسليم في الأسفل */}
            <div className="flex justify-center pt-4 pb-8">
              <button
                type="button"
                onClick={handleSubmitExam}
                disabled={submitting}
                className="w-full sm:w-auto px-12 py-3.5 text-base font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-2xl shadow-lg transition-all disabled:opacity-50"
              >
                {submitting ? "جاري التسليم..." : "تسليم إجابات الامتحان"}
              </button>
            </div>
          </>
        )}
      </main>

      <Footer />
    </div>
  );
}
