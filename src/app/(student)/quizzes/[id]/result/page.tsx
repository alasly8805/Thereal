"use client";

import React, { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { Navbar } from "@/components/ui/Navbar";
import { Footer } from "@/components/ui/Footer";
import { useToast } from "@/components/ui/Toast";

export default function StudentQuizResultPage() {
  const params = useParams();
  const router = useRouter();
  const { error: toastError } = useToast();

  const id = params?.id as string; // attemptId or quizId

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any | null>(null);

  const fetchResult = async () => {
    if (!id) return;
    setLoading(true);
    try {
      // 1. جرب جلب النتيجة من endpoint المحاولة
      let res = await fetch(`/api/quiz-attempt/${id}/result`);
      let result = await res.json();

      if (!res.ok && res.status === 404) {
        // إذا كان المعرف هو quizId وليس attemptId
        res = await fetch(`/api/quizzes/${id}?review=1`);
        const fallback = await res.json();
        if (fallback?.result) {
          result = {
            hideAnswers: Boolean(fallback.hideAnswersUntilEssayGraded),
            essayGraded: !fallback.hideAnswersUntilEssayGraded,
            score: fallback.result.score,
            totalScore: 100,
            quizTitle: fallback.quiz?.title || "الاختبار",
            questions: fallback.result.breakdown?.map((b: any) => ({
              id: b.questionId,
              question: b.question,
              type: b.questionType?.toUpperCase() || "MCQ",
              options: [b.optionA, b.optionB, b.optionC, b.optionD].filter(Boolean),
              order: 0,
              correctIndex: b.correctAnswer ? ["A", "B", "C", "D"].indexOf(b.correctAnswer) : null,
              explanation: null,
            })) || [],
            studentAnswers: fallback.result.breakdown?.map((b: any) => ({
              questionId: b.questionId,
              selectedIndex: b.yourAnswer ? ["A", "B", "C", "D"].indexOf(b.yourAnswer) : null,
              essayText: b.essayAnswer || "",
            })) || [],
          };
        }
      }

      if (result && !result.error) {
        setData(result);
      } else {
        toastError(result?.error || "تعذر جلب نتيجة الاختبار");
      }
    } catch (err) {
      toastError("فشل الاتصال بالخادم لجلب النتيجة");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchResult();
  }, [id]);

  return (
    <div dir="rtl" className="min-h-screen flex flex-col bg-[var(--background)] text-[var(--ink)]">
      <Navbar />

      <main className="flex-1 max-w-4xl w-full mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
        {loading ? (
          <div className="p-16 text-center text-sm text-[var(--ink-muted)]">جاري تحميل نتيجة الاختبار...</div>
        ) : !data ? (
          <div className="p-12 text-center bg-[var(--surface)] border border-[var(--border)] rounded-2xl">
            <p className="text-base font-bold text-red-500">لم يتم العثور على نتيجة هذه المحاولة.</p>
          </div>
        ) : data.hideAnswers ? (
          /* حالة الحجب: الطالب يرى فقط "تم التسليم + في انتظار التصحيح" */
          <div className="space-y-6">
            <div className="bg-[var(--surface)] border border-[var(--border)] rounded-3xl p-6 sm:p-8 shadow-sm space-y-4 text-center">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-amber-500/10 text-amber-600 text-3xl mb-2">
                ⏳
              </div>
              <h1 className="text-2xl sm:text-3xl font-black text-[var(--ink)]">
                {data.quizTitle || "الاختبار"}
              </h1>
              <div className="inline-block px-4 py-1.5 rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-300 text-sm font-bold">
                تم التسليم بنجاح — في انتظار التصحيح
              </div>
              <p className="text-sm text-[var(--ink-muted)] max-w-xl mx-auto leading-relaxed">
                {data.message ||
                  "تم تسليم إجاباتك بنجاح. الدرجات والإجابات الصحيحة (الاختياري والمقالي) محجوبة حتى يصحح المعلم المقالي."}
              </p>
              <div className="pt-2">
                <button
                  onClick={fetchResult}
                  className="px-5 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold transition-all shadow-sm"
                >
                  🔄 تحديث الصفحة للتحقق من حالة التصحيح
                </button>
              </div>
            </div>

            {/* عرض إجابات الطالب بدون أي إشارة للإجابات الصحيحة أو ألوان صح/خطأ */}
            <div className="space-y-4">
              <h2 className="text-lg font-bold text-[var(--ink)]">مراجعة إجاباتك المسلمة</h2>
              {data.questions?.map((q: any, idx: number) => {
                const studentAns = Array.isArray(data.studentAnswers)
                  ? data.studentAnswers.find((a: any) => a.questionId === q.id)
                  : data.studentAnswers?.[q.id];

                const isEssay = q.type === "ESSAY" || q.questionType === "essay";

                return (
                  <div
                    key={q.id || idx}
                    className="p-5 sm:p-6 rounded-2xl border border-[var(--border)] bg-[var(--surface)] space-y-3"
                  >
                    <div className="flex items-center gap-3">
                      <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl font-bold bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 text-sm">
                        {idx + 1}
                      </span>
                      <h3 className="font-bold text-base text-[var(--ink)]">{q.question}</h3>
                    </div>

                    {q.imageUrl && (
                      <div className="overflow-hidden rounded-xl border border-[var(--border)] max-w-md">
                        <img src={q.imageUrl} alt="صورة السؤال" className="w-full object-contain" />
                      </div>
                    )}

                    {isEssay ? (
                      <div className="space-y-1.5 pt-2">
                        <p className="text-xs font-bold text-[var(--ink-muted)]">إجابتك المقالية:</p>
                        <div className="p-4 rounded-xl border border-[var(--border)] bg-[var(--background)] text-sm text-[var(--ink)] whitespace-pre-wrap">
                          {studentAns?.essayText || (typeof studentAns === "string" ? studentAns : "— لم تكتب إجابة —")}
                        </div>
                        <p className="text-xs text-amber-600 dark:text-amber-400 font-semibold">
                          بانتظار تصحيح المعلم واعتماد الدرجة ⏳
                        </p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2">
                        {Array.isArray(q.options) &&
                          q.options.map((opt: string, optIdx: number) => {
                            const isSelected =
                              studentAns?.selectedIndex === optIdx ||
                              studentAns === optIdx ||
                              studentAns === ["A", "B", "C", "D"][optIdx];

                            return (
                              <div
                                key={optIdx}
                                className={`p-3 rounded-xl border text-sm transition-all ${
                                  isSelected
                                    ? "border-sky-500 bg-sky-500/10 text-sky-900 dark:text-sky-200 font-bold"
                                    : "border-[var(--border)] bg-[var(--background)] text-[var(--ink)] opacity-75"
                                }`}
                              >
                                <span className="text-xs font-bold ml-2 opacity-60">
                                  {["أ", "ب", "ج", "د"][optIdx] || optIdx + 1}-
                                </span>
                                {opt}
                                {isSelected && (
                                  <span className="text-xs mr-2 font-bold text-sky-600 dark:text-sky-400">
                                    (إجابتك)
                                  </span>
                                )}
                              </div>
                            );
                          })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          /* بعد التصحيح أو في حال عدم الحجب: عرض النتيجة كاملة مع الإجابات الصحيحة والدرجة */
          <div className="space-y-6">
            <div className="bg-[var(--surface)] border border-[var(--border)] rounded-3xl p-6 sm:p-8 shadow-sm space-y-4 text-center">
              <h1 className="text-2xl sm:text-3xl font-black text-[var(--ink)]">
                {data.quizTitle || "الاختبار"}
              </h1>
              <div className="text-5xl font-black text-emerald-600 dark:text-emerald-400 my-2">
                {Math.round(data.score ?? 0)}%
              </div>
              <p className="text-sm font-bold text-slate-700 dark:text-slate-300">
                الدرجة الإجمالية: {data.score ?? 0} من {data.totalScore ?? 100}
              </p>
            </div>

            {/* تفاصيل الأسئلة مع الإجابات الصحيحة وألوان التقييم */}
            <div className="space-y-4">
              <h2 className="text-lg font-bold text-[var(--ink)]">مراجعة الإجابات والدرجات</h2>
              {data.questions?.map((q: any, idx: number) => {
                const studentAns = Array.isArray(data.studentAnswers)
                  ? data.studentAnswers.find((a: any) => a.questionId === q.id)
                  : data.studentAnswers?.[q.id];

                const isEssay = q.type === "ESSAY" || q.questionType === "essay";
                const isCorrect =
                  !isEssay &&
                  typeof q.correctIndex === "number" &&
                  (studentAns?.selectedIndex === q.correctIndex || studentAns === q.correctIndex);

                return (
                  <div
                    key={q.id || idx}
                    className={`p-5 sm:p-6 rounded-2xl border ${
                      isEssay
                        ? "border-[var(--border)] bg-[var(--surface)]"
                        : isCorrect
                        ? "border-emerald-500/30 bg-emerald-50/50 dark:bg-emerald-950/20"
                        : "border-rose-500/30 bg-rose-50/50 dark:bg-rose-950/20"
                    } space-y-3`}
                  >
                    <div className="flex items-center gap-3">
                      <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl font-bold bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 text-sm">
                        {idx + 1}
                      </span>
                      <h3 className="font-bold text-base text-[var(--ink)]">{q.question}</h3>
                      <span className="text-lg mr-auto">
                        {isEssay ? "📝" : isCorrect ? "✓" : "✕"}
                      </span>
                    </div>

                    {isEssay ? (
                      <div className="space-y-2 pt-2">
                        <p className="text-xs font-bold text-[var(--ink-muted)]">إجابتك:</p>
                        <div className="p-3 rounded-xl border border-[var(--border)] bg-[var(--background)] text-sm">
                          {studentAns?.essayText || (typeof studentAns === "string" ? studentAns : "— لم تكتب إجابة —")}
                        </div>
                        {q.explanation && (
                          <div className="p-3 rounded-xl bg-violet-500/10 text-violet-700 dark:text-violet-300 text-xs">
                            <span className="font-bold">ملاحظة المعلم: </span>
                            {q.explanation}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2">
                        {Array.isArray(q.options) &&
                          q.options.map((opt: string, optIdx: number) => {
                            const isCorrectOpt = q.correctIndex === optIdx;
                            const isStudentOpt =
                              studentAns?.selectedIndex === optIdx || studentAns === optIdx;

                            return (
                              <div
                                key={optIdx}
                                className={`p-3 rounded-xl border text-sm ${
                                  isCorrectOpt
                                    ? "border-emerald-500 bg-emerald-500/15 text-emerald-800 dark:text-emerald-200 font-bold"
                                    : isStudentOpt
                                    ? "border-rose-500 bg-rose-500/15 text-rose-800 dark:text-rose-200 font-bold"
                                    : "border-[var(--border)] bg-[var(--background)] text-[var(--ink)] opacity-60"
                                }`}
                              >
                                <span className="text-xs font-bold ml-2 opacity-60">
                                  {["أ", "ب", "ج", "د"][optIdx] || optIdx + 1}-
                                </span>
                                {opt}
                                {isCorrectOpt && (
                                  <span className="text-xs mr-2 font-bold text-emerald-600 dark:text-emerald-400">
                                    (الإجابة الصحيحة)
                                  </span>
                                )}
                                {isStudentOpt && !isCorrectOpt && (
                                  <span className="text-xs mr-2 font-bold text-rose-600 dark:text-rose-400">
                                    (إجابتك الخاطئة)
                                  </span>
                                )}
                              </div>
                            );
                          })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="flex gap-3 justify-center pt-4">
          <button
            onClick={() => router.push("/library")}
            className="px-6 py-2.5 rounded-xl border border-[var(--border)] bg-[var(--surface)] text-sm font-bold text-[var(--ink)] hover:bg-[var(--border)] transition-colors"
          >
            العودة لمكتبتي
          </button>
        </div>
      </main>

      <Footer />
    </div>
  );
}
