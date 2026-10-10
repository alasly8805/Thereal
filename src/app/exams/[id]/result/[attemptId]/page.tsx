"use client";

import React, { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { Navbar } from "@/components/ui/Navbar";
import { Footer } from "@/components/ui/Footer";
import { useToast } from "@/components/ui/Toast";

export default function StudentExamResultPage() {
  const params = useParams();
  const router = useRouter();
  const { error: toastError } = useToast();

  const examId = params?.id as string;
  const attemptId = params?.attemptId as string;

  const [loading, setLoading] = useState(true);
  const [resultData, setResultData] = useState<any | null>(null);

  const fetchResult = async () => {
    if (!attemptId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/exams/attempt/${attemptId}/result`);
      const data = await res.json();
      if (data.success) {
        setResultData(data);
      } else {
        toastError(data.error || "تعذر جلب نتيجة الامتحان");
      }
    } catch (err) {
      toastError("فشل الاتصال بالخادم لجلب النتيجة");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchResult();
  }, [attemptId]);

  return (
    <div dir="rtl" className="min-h-screen flex flex-col bg-[var(--background)] text-[var(--ink)]">
      <Navbar />

      <main className="flex-1 max-w-4xl w-full mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
        {loading ? (
          <div className="p-16 text-center text-sm text-[var(--ink-muted)]">جاري تحميل نتيجة الامتحان...</div>
        ) : !resultData ? (
          <div className="p-12 text-center bg-[var(--surface)] border border-[var(--border)] rounded-2xl">
            <p className="text-base font-bold text-red-500">لم يتم العثور على نتيجة هذه المحاولة.</p>
          </div>
        ) : (
          <>
            {/* بطاقة ملخص النتيجة */}
            <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-6 sm:p-8 shadow-sm space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h1 className="text-xl sm:text-2xl font-bold text-[var(--ink)]">{resultData.examTitle}</h1>
                  <p className="text-xs text-[var(--ink-muted)] mt-1">النموذج: {resultData.modelName}</p>
                </div>

                {/* شارة الدرجة أو الحجب */}
                {resultData.hideAnswersUntilEssayGraded && !resultData.essayGraded ? (
                  <div className="px-4 py-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-300 text-sm font-bold flex items-center gap-2">
                    <span>🔒</span>
                    النتيجة محجوبة مؤقتاً
                  </div>
                ) : (
                  <div className="text-center px-6 py-3 rounded-2xl bg-sky-500/10 border border-sky-500/20">
                    <span className="block text-2xl sm:text-3xl font-black text-sky-600">
                      {resultData.score ?? 0}%
                    </span>
                    <span className="text-[11px] font-bold text-[var(--ink-muted)]">الدرجة النهائية</span>
                  </div>
                )}
              </div>

              {/* تنبيه حجب الإجابات */}
              {resultData.hideAnswersUntilEssayGraded && !resultData.essayGraded && (
                <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs sm:text-sm text-[var(--ink)] space-y-2">
                  <div className="font-bold flex items-center gap-2 text-amber-700 dark:text-amber-300">
                    <span>⏳</span>
                    تم استلام إجاباتك بنجاح، والنتيجة بانتظار تصحيح الأسئلة المقالية
                  </div>
                  <p className="text-[var(--ink-muted)] leading-relaxed">
                    قام المعلم بتفعيل ميزة إخفاء الإجابات الصحيحة ودرجات الـ MCQ حتى يتم الانتهاء من تصحيح الأسئلة المقالية واعتماد النتيجة. ستظهر درجاتك وإجاباتك النموذجية كاملة فور انتهاء المعلم من التصحيح.
                  </p>
                  <button
                    onClick={fetchResult}
                    className="mt-2 px-4 py-1.5 text-xs font-bold text-amber-800 dark:text-amber-200 bg-amber-500/20 hover:bg-amber-500/30 rounded-lg transition-colors"
                  >
                    🔄 تحديث الصفحة للتحقق من حالة التصحيح
                  </button>
                </div>
              )}
            </div>

            {/* مراجعة الأسئلة والإجابات */}
            <div className="space-y-4">
              <h2 className="text-base font-bold text-[var(--ink)]">مراجعة الأسئلة والإجابات المُسلّمة</h2>

              {resultData.questions.map((q: any, idx: number) => {
                const isHidden = resultData.hideAnswersUntilEssayGraded && !resultData.essayGraded;
                const studentAnswer = q.studentAnswer;

                return (
                  <div
                    key={q.id}
                    className={`bg-[var(--surface)] border rounded-2xl p-6 shadow-sm space-y-4 transition-all ${
                      isHidden
                        ? "border-[var(--border)]"
                        : q.type === "MCQ"
                        ? studentAnswer?.isCorrect
                          ? "border-emerald-500/40 bg-emerald-500/5"
                          : "border-red-500/40 bg-red-500/5"
                        : "border-[var(--border)]"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <span className="w-6 h-6 rounded-full bg-sky-500/20 text-sky-600 flex items-center justify-center text-xs font-black">
                          {idx + 1}
                        </span>
                        <span className="text-xs font-bold text-[var(--ink-muted)]">
                          {q.type === "MCQ" ? "اختيار من متعدد" : "سؤال مقالي"}
                        </span>
                      </div>

                      {/* شارة التصحيح إن لم تكن محجوبة */}
                      {!isHidden && (
                        <div>
                          {q.type === "MCQ" ? (
                            studentAnswer?.isCorrect ? (
                              <span className="px-2.5 py-1 text-xs font-bold text-emerald-600 bg-emerald-500/10 rounded-lg">
                                ✅ إجابة صحيحة
                              </span>
                            ) : (
                              <span className="px-2.5 py-1 text-xs font-bold text-red-600 bg-red-500/10 rounded-lg">
                                ❌ إجابة غير صحيحة
                              </span>
                            )
                          ) : (
                            <span className="px-2.5 py-1 text-xs font-bold text-sky-600 bg-sky-500/10 rounded-lg">
                              درجة المقالي: {studentAnswer?.score ?? 0} / 10
                            </span>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="text-sm sm:text-base font-bold text-[var(--ink)] leading-relaxed">
                      {q.question}
                    </div>

                    {/* خيارات الـ MCQ */}
                    {q.type === "MCQ" && q.options && (
                      <div className="space-y-2 pt-1">
                        {q.options.map((opt: string, optIdx: number) => {
                          const isStudentSelected = studentAnswer?.selectedIndex === optIdx;
                          const isCorrectOption = !isHidden && q.correctIndex === optIdx;

                          let optionStyle = "border-[var(--border)] bg-[var(--surface-sunken)] text-[var(--ink)]";

                          if (isHidden) {
                            if (isStudentSelected) {
                              optionStyle = "border-sky-500 bg-sky-500/10 font-bold text-sky-600";
                            }
                          } else {
                            if (isCorrectOption) {
                              optionStyle = "border-emerald-500 bg-emerald-500/10 font-bold text-emerald-600";
                            } else if (isStudentSelected && !isCorrectOption) {
                              optionStyle = "border-red-500 bg-red-500/10 font-bold text-red-600";
                            }
                          }

                          return (
                            <div
                              key={optIdx}
                              className={`flex items-center justify-between p-3 rounded-xl border text-sm transition-all ${optionStyle}`}
                            >
                              <span>{opt}</span>
                              <div className="flex items-center gap-2 text-xs">
                                {isStudentSelected && (
                                  <span className="text-[11px] px-2 py-0.5 rounded-md bg-black/10 dark:bg-white/10">
                                    إجابتك
                                  </span>
                                )}
                                {!isHidden && isCorrectOption && <span>✓ الإجابة النموذجية</span>}
                              </div>
                            </div>
                          );
                        })}

                        {/* تفسير الإجابة بعد رفع الحجب */}
                        {!isHidden && q.explanation && (
                          <div className="p-3 rounded-xl bg-[var(--surface-sunken)] border border-[var(--border)] text-xs text-[var(--ink-muted)] mt-2">
                            <span className="font-bold text-[var(--ink)]">توضيح: </span>
                            {q.explanation}
                          </div>
                        )}
                      </div>
                    )}

                    {/* السؤال المقالي */}
                    {q.type === "ESSAY" && (
                      <div className="space-y-3 pt-1">
                        <div>
                          <label className="block text-xs font-bold text-[var(--ink-muted)] mb-1">
                            إجابتك التي قمت بتسليمها:
                          </label>
                          <div className="p-3.5 rounded-xl bg-[var(--surface-sunken)] border border-[var(--border)] text-sm text-[var(--ink)] font-mono whitespace-pre-wrap">
                            {studentAnswer?.essayText || "لا توجد إجابة مقدمة"}
                          </div>
                        </div>

                        {/* ملاحظات المعلم بعد التصحيح */}
                        {!isHidden && studentAnswer?.feedback && (
                          <div className="p-3 rounded-xl bg-sky-500/10 border border-sky-500/20 text-xs text-[var(--ink)]">
                            <span className="font-bold text-sky-600">ملاحظات المعلم: </span>
                            {studentAnswer.feedback}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="flex justify-center pt-4 pb-8">
              <button
                type="button"
                onClick={() => router.push("/")}
                className="px-8 py-2.5 text-sm font-bold rounded-xl border border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--surface-sunken)] text-[var(--ink)]"
              >
                العودة للرئيسية
              </button>
            </div>
          </>
        )}
      </main>

      <Footer />
    </div>
  );
}
