"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Navbar } from "@/components/ui/Navbar";
import { Footer } from "@/components/ui/Footer";
import { useToast } from "@/components/ui/Toast";
import { EssayAIPanel, useEssayFeedback } from "@/components/student/EssayAIFeedback";

type QuizQuestion = {
  id: string;
  question: string;
  questionType?: string;
  imageUrl?: string | null;
  optionA: string;
  optionB: string;
  optionC: string;
  optionD: string;
  order: number;
};

type QuizPayload = {
  id: string;
  title: string;
  timeLimitMinutes: number;
  folderId: string;
  courseId: string;
  course: { title: string; subject: string };
  questions: QuizQuestion[];
};

type ResultBreakdown = {
  questionId: string;
  questionType?: string;
  question: string;
  imageUrl?: string | null;
  optionA: string;
  optionB: string;
  optionC: string;
  optionD: string;
  yourAnswer: string | null;
  essayAnswer?: string | null;
  correctAnswer: string;
  isCorrect: boolean;
  status?: string;
  teacherReply?: string | null;
  reviewedAt?: string | null;
};

type QuizResult = {
  score: number;
  correct: number;
  totalQ: number;
  /** null while essay questions are still waiting for the teacher */
  passed: boolean | null;
  pendingEssays: number;
  mcqCount: number;
  mcqCorrect: number;
  essayCount: number;
  breakdown: ResultBreakdown[];
  quizTitle: string;
  courseId: string;
  completedAt?: string | null;
  /** true when this is a revisit of a previously submitted attempt */
  isPrevious: boolean;
};

const optionLabels = ["A", "B", "C", "D"] as const;

export default function QuizPage() {
  const router = useRouter();
  const { success: toastSuccess, error: toastError } = useToast();
  const params = useParams<{ id: string }>();
  const quizId = params.id;

  const [quiz, setQuiz] = useState<QuizPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [startedAt] = useState(() => new Date().toISOString());
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  // Server decides whether the countdown is binding (quiz_time_limit_disabled).
  // Defaults to false so a failed/older response never auto-submits a student.
  const [timeLimitEnforced, setTimeLimitEnforced] = useState(false);
  const [user, setUser] = useState<{ name: string; role: string } | null>(null);
  const [result, setResult] = useState<QuizResult | null>(null);
  const [submitted, setSubmitted] = useState(false);
  // AI essay feedback (only returns data when the course owner enabled it).
  const { state: essayAI } = useEssayFeedback(quizId, !!result && result.essayCount > 0);
  const essayAIByQuestion = useMemo(
    () => new Map((essayAI?.items ?? []).map((i) => [i.questionId, i])),
    [essayAI]
  );
  // An AI verdict applied in "auto" mode changes the official grade after this
  // page loaded; offer a refresh instead of showing a stale score.
  const officialChanged = useMemo(
    () =>
      !!result &&
      (essayAI?.items ?? []).some((i) => {
        const b = result.breakdown.find((x) => x.questionId === i.questionId);
        return !!b && (b.status ?? "PENDING") !== i.official.status;
      }),
    [essayAI, result]
  );

  const totalQuestions = quiz?.questions.length ?? 0;
  const answeredCount = useMemo(() => Object.values(answers).filter(Boolean).length, [answers]);

  // Normalises both the fresh submit response and the "already completed"
  // payload (which may come from an older server without grading fields).
  const toResult = (
    data: Record<string, unknown>,
    fallback: { quizTitle: string; courseId: string },
    isPrevious: boolean
  ): QuizResult => {
    const breakdown = (Array.isArray(data.breakdown) ? data.breakdown : []) as ResultBreakdown[];
    const pendingEssays =
      typeof data.pendingEssays === "number"
        ? data.pendingEssays
        : breakdown.filter((b) => b.questionType === "essay" && b.status === "PENDING").length;
    const mcq = breakdown.filter((b) => b.questionType !== "essay");
    const score = Number(data.score ?? 0);
    return {
      score,
      correct: typeof data.correct === "number" ? data.correct : breakdown.filter((b) => b.isCorrect).length,
      totalQ: Number(data.totalQ ?? breakdown.length),
      passed: pendingEssays > 0 ? null : typeof data.passed === "boolean" ? data.passed : score >= 50,
      pendingEssays,
      mcqCount: typeof data.mcqCount === "number" ? data.mcqCount : mcq.length,
      mcqCorrect: typeof data.mcqCorrect === "number" ? data.mcqCorrect : mcq.filter((b) => b.isCorrect).length,
      essayCount: typeof data.essayCount === "number" ? data.essayCount : breakdown.length - mcq.length,
      breakdown,
      quizTitle: (data.quizTitle as string) || fallback.quizTitle,
      courseId: (data.courseId as string) || fallback.courseId,
      completedAt: (data.completedAt as string | null | undefined) ?? null,
      isPrevious,
    };
  };

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => setUser(d.user ? { name: d.user.name, role: d.user.role } : null))
      .catch(() => setUser(null));
  }, []);

  useEffect(() => {
    const loadQuiz = async () => {
      try {
        const res = await fetch(`/api/quizzes/${quizId}`);
        const data = await res.json();

        if (!res.ok) {
          if (res.status === 401) {
            router.push("/login");
            return;
          }
          throw new Error(data.error || "تعذر تحميل الاختبار");
        }

        if (data.alreadyCompleted) {
          setSubmitted(true);
          setResult(
            toResult(
              { ...data.result, quizTitle: data.quiz.title, courseId: data.quiz.courseId },
              { quizTitle: data.quiz.title, courseId: data.quiz.courseId },
              true
            )
          );
          return;
        }

        setQuiz(data.quiz);
        setTimeLimitEnforced(data.timeLimitEnforced === true);
        setRemainingSeconds((data.timeLimitMinutes || 30) * 60);
      } catch (err) {
        setError(err instanceof Error ? err.message : "تعذر تحميل الاختبار");
      } finally {
        setLoading(false);
      }
    };

    if (quizId) loadQuiz();
  }, [quizId, router]);

  const submitQuiz = useCallback(
    async (isAutoSubmit = false) => {
      if (!quiz || saving || submitted) return;
      setSaving(true);
      setError("");

      try {
        const res = await fetch(`/api/quizzes/${quiz.id}/submit`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ answers, startedAt }),
        });
        const data = await res.json();

        if (!res.ok) {
          if (res.status === 409 && data.alreadySubmitted && data.result) {
            setSubmitted(true);
            // Reload the saved sheet so the student sees their answers, not just a number.
            try {
              const again = await fetch(`/api/quizzes/${quiz.id}`);
              const saved = await again.json();
              if (again.ok && saved.alreadyCompleted) {
                setResult(
                  toResult(
                    { ...saved.result, quizTitle: quiz.title, courseId: quiz.courseId },
                    { quizTitle: quiz.title, courseId: quiz.courseId },
                    true
                  )
                );
              } else {
                setResult(toResult(data.result, { quizTitle: quiz.title, courseId: quiz.courseId }, true));
              }
            } catch {
              setResult(toResult(data.result, { quizTitle: quiz.title, courseId: quiz.courseId }, true));
            }
            toastSuccess("تم تسليم هذا الاختبار من قبل ولا يمكن الإعادة");
            return;
          }
          throw new Error(data.error || "فشل تسليم الاختبار");
        }

        setSubmitted(true);
        const nextResult = toResult(data, { quizTitle: quiz.title, courseId: quiz.courseId }, false);
        setResult(nextResult);

        toastSuccess(
          isAutoSubmit
            ? "انتهى الوقت وتم حفظ إجاباتك تلقائياً"
            : nextResult.pendingEssays > 0
              ? "تم تسليم إجاباتك — الأسئلة المقالية قيد التصحيح"
              : `شكراً — تم احتساب درجتك ${nextResult.score}%`
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : "فشل تسليم الاختبار";
        setError(message);
        toastError(message);
      } finally {
        setSaving(false);
      }
    },
    [answers, quiz, saving, startedAt, submitted, toastSuccess, toastError]
  );

  useEffect(() => {
    // No countdown at all when the time limit is not enforced: the quiz stays
    // open until the student submits it themselves.
    if (!quiz || submitted || !timeLimitEnforced) return;

    const timer = window.setInterval(() => {
      setRemainingSeconds((current) => {
        if (current <= 1) {
          window.clearInterval(timer);
          void submitQuiz(true);
          return 0;
        }
        return current - 1;
      });
    }, 1000);

    return () => window.clearInterval(timer);
  }, [quiz, submitQuiz, submitted, timeLimitEnforced]);

  const formatTime = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  };

  const optionText = (item: ResultBreakdown, label: string) => {
    const key = `option${label}` as keyof ResultBreakdown;
    return String(item[key] ?? "");
  };

  return (
    <div className="flex min-h-screen flex-col bg-[radial-gradient(circle_at_top,_rgba(59,130,246,0.18),_transparent_35%),linear-gradient(180deg,#f8fbff_0%,#f4f7fb_100%)] dark:bg-[radial-gradient(circle_at_top,_rgba(30,64,175,0.24),_transparent_30%),linear-gradient(180deg,#020617_0%,#0f172a_100%)]">
      <Navbar user={user} />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-6 lg:px-8">
        {loading ? (
          <div className="rounded-3xl border border-white/60 bg-white/80 p-10 text-center text-slate-500 shadow-xl backdrop-blur dark:border-white/10 dark:bg-slate-900/80 dark:text-slate-400">
            جارٍ تجهيز الاختبار...
          </div>
        ) : error && !result ? (
          <div className="rounded-3xl border border-red-200 bg-red-50 p-8 text-center shadow-xl dark:border-red-900/40 dark:bg-red-950/30">
            <p className="mb-4 text-red-700 dark:text-red-300">{error}</p>
            <button
              onClick={() => router.push("/courses")}
              className="rounded-xl bg-slate-900 px-5 py-2.5 text-white dark:bg-white dark:text-slate-900"
            >
              العودة للكورسات
            </button>
          </div>
        ) : result ? (
          <div className="space-y-6">
            <section className="rounded-[2rem] border border-white/50 bg-white/85 p-6 shadow-xl backdrop-blur-xl dark:border-white/10 dark:bg-slate-900/85 sm:p-8">
              <p className="mb-2 text-sm text-slate-500 dark:text-slate-400">
                {result.isPrevious ? "نتيجتك السابقة" : "نتيجة الاختبار"}
              </p>
              <h1 className="text-2xl font-black text-slate-900 dark:text-white sm:text-3xl">{result.quizTitle}</h1>

              {result.pendingEssays > 0 ? (
                /* Essay questions are waiting for the teacher: no final grade yet. */
                <div className="mt-6 rounded-3xl border border-violet-200 bg-violet-50 p-6 text-center dark:border-violet-900/40 dark:bg-violet-950/30">
                  <div className="text-4xl font-black text-violet-600 dark:text-violet-400">قيد التصحيح ⏳</div>
                  <p className="mt-2 text-lg font-bold text-slate-800 dark:text-slate-200">
                    تم تسليم إجاباتك بنجاح
                  </p>
                  <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                    {result.pendingEssays} سؤال مقالي بانتظار تصحيح المعلم — ستظهر درجتك النهائية وملاحظات المعلم هنا بعد التصحيح.
                  </p>
                  {result.mcqCount > 0 && (
                    <p className="mt-2 text-sm font-bold text-slate-700 dark:text-slate-300">
                      الأسئلة الاختيارية: {result.mcqCorrect} صحيحة من {result.mcqCount}
                    </p>
                  )}
                  {result.completedAt && (
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-500">
                      تاريخ الحل: {new Date(result.completedAt).toLocaleString("ar-EG")}
                    </p>
                  )}
                  <p className="mt-3 text-sm font-bold text-amber-700 dark:text-amber-300">
                    🔒 محاولة واحدة فقط — لا يمكن إعادة الاختبار
                  </p>
                </div>
              ) : (
                <div
                  className={`mt-6 rounded-3xl border p-6 text-center ${
                    result.passed
                      ? "border-emerald-200 bg-emerald-50 dark:border-emerald-900/40 dark:bg-emerald-950/30"
                      : "border-amber-200 bg-amber-50 dark:border-amber-900/40 dark:bg-amber-950/30"
                  }`}
                >
                  <div
                    className={`text-5xl font-black ${result.passed ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"}`}
                  >
                    {Math.round(result.score)}%
                  </div>
                  <p className="mt-2 text-lg font-bold text-slate-800 dark:text-slate-200">
                    {result.passed ? "شكراً — تم احتساب درجتك 🎉" : "شكراً — تم احتساب درجتك"}
                    {" "}
                    <span className="text-base">{result.passed ? "ناجح ✓" : "راسب ✕"}</span>
                  </p>
                  <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                    {result.correct} إجابة صحيحة من {result.totalQ} سؤال
                    {result.essayCount > 0 && ` (منها ${result.essayCount} مقالي تم تصحيحه)`}
                  </p>
                  {result.completedAt && (
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-500">
                      تاريخ الحل: {new Date(result.completedAt).toLocaleString("ar-EG")}
                    </p>
                  )}
                  <p className="mt-3 text-sm font-bold text-amber-700 dark:text-amber-300">
                    🔒 محاولة واحدة فقط — لا يمكن إعادة الاختبار
                  </p>
                </div>
              )}

              <div className="mt-6 flex flex-wrap gap-3">
                <button
                  onClick={() => router.push(`/courses/${result.courseId}`)}
                  className="rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-bold text-white dark:bg-white dark:text-slate-900"
                >
                  العودة للكورس
                </button>
                <button
                  onClick={() => router.push("/library")}
                  className="rounded-xl border border-slate-200 px-5 py-2.5 text-sm font-bold text-slate-700 dark:border-slate-700 dark:text-slate-200"
                >
                  مكتبتي
                </button>
              </div>
            </section>

            <section className="space-y-4">
              <h2 className="text-lg font-black text-slate-900 dark:text-white">مراجعة الإجابات</h2>
              {officialChanged && (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-bold text-emerald-800 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-200" role="status">
                  <span>تم تصحيح بعض إجاباتك المقالية — حدّث الصفحة لرؤية درجتك المحدّثة.</span>
                  <button
                    onClick={() => window.location.reload()}
                    className="rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-500"
                  >
                    تحديث النتيجة
                  </button>
                </div>
              )}
              {result.breakdown.length === 0 && (
                <p className="rounded-2xl border border-slate-200 bg-white/80 p-5 text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-400">
                  لا توجد تفاصيل إجابات محفوظة لهذه المحاولة.
                </p>
              )}
              {result.breakdown.map((item, index) => {
                const isEssay = item.questionType === "essay";
                const essayState: "pending" | "approved" | "rejected" | null = !isEssay
                  ? null
                  : item.status === "APPROVED"
                    ? "approved"
                    : item.status === "DISAPPROVED"
                      ? "rejected"
                      : "pending";
                const good = isEssay ? essayState === "approved" : item.isCorrect;
                const pending = essayState === "pending";
                const frame = pending
                  ? "border-violet-200 bg-violet-50/50 dark:border-violet-900/40 dark:bg-violet-950/20"
                  : good
                    ? "border-emerald-200 bg-emerald-50/50 dark:border-emerald-900/40 dark:bg-emerald-950/20"
                    : "border-rose-200 bg-rose-50/50 dark:border-rose-900/40 dark:bg-rose-950/20";
                const badge = pending
                  ? "bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-300"
                  : good
                    ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300"
                    : "bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300";
                return (
                <article key={item.questionId} className={`rounded-[1.75rem] border p-5 sm:p-6 ${frame}`}>
                  <div className="mb-4 flex items-center gap-3">
                    <span className={`inline-flex h-9 w-9 items-center justify-center rounded-2xl font-black ${badge}`}>
                      {index + 1}
                    </span>
                    <h3 className="flex-1 text-lg font-bold leading-relaxed text-slate-900 dark:text-white">
                      {item.question}
                    </h3>
                    <span className="text-xl">{pending ? "⏳" : good ? "✓" : "✕"}</span>
                  </div>

                  {item.imageUrl && (
                    <div className="mb-4 overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 p-2 dark:border-slate-700 dark:bg-slate-800/60">
                      <img src={item.imageUrl} alt="صورة توضيحية للسؤال" className="max-h-72 w-full rounded-xl object-contain" />
                    </div>
                  )}

                  {isEssay ? (
                    <div className="space-y-3">
                      <div className="flex items-center gap-2 text-xs font-bold">
                        <span className="text-violet-600 dark:text-violet-300">📝 سؤال مقالي</span>
                        <span
                          className={`rounded-lg px-2.5 py-1 ${
                            essayState === "approved"
                              ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-300"
                              : essayState === "rejected"
                                ? "bg-rose-500/15 text-rose-600 dark:text-rose-300"
                                : "bg-violet-500/15 text-violet-600 dark:text-violet-300"
                          }`}
                        >
                          {essayState === "approved"
                            ? "تم قبول إجابتك ✓"
                            : essayState === "rejected"
                              ? "لم تُقبل الإجابة ✕"
                              : "بانتظار تصحيح المعلم ⏳"}
                        </span>
                      </div>
                      <div>
                        <p className="mb-1 text-xs font-bold text-slate-500 dark:text-slate-400">إجابتك:</p>
                        <p className="whitespace-pre-wrap rounded-2xl border border-slate-200 bg-white/80 p-4 text-sm leading-relaxed text-slate-800 dark:border-slate-700 dark:bg-slate-800/70 dark:text-slate-200">
                          {item.essayAnswer?.trim() || "— لم تكتب إجابة —"}
                        </p>
                      </div>
                      {essayState !== "pending" && item.teacherReply && (
                        <div className="rounded-2xl border border-violet-200 bg-violet-50 p-4 text-sm dark:border-violet-900/40 dark:bg-violet-950/30">
                          <p className="mb-1 text-xs font-bold text-violet-700 dark:text-violet-300">ملاحظة المعلم:</p>
                          <p className="text-slate-800 dark:text-slate-200">{item.teacherReply}</p>
                        </div>
                      )}
                      <EssayAIPanel
                        quizId={quizId}
                        item={essayAIByQuestion.get(item.questionId)}
                        aiEnabled={essayAI?.aiEnabled ?? false}
                      />
                    </div>
                  ) : (
                  <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                    {optionLabels
                      .filter((label) => !!optionText(item, label).trim())
                      .map((label) => {
                      const isCorrectOption = item.correctAnswer === label;
                      const isYourAnswer = item.yourAnswer === label;
                      return (
                        <div
                          key={label}
                          className={`rounded-2xl border px-4 py-3 text-sm ${
                            isCorrectOption
                              ? "border-emerald-500 bg-emerald-100/80 text-emerald-900 dark:border-emerald-400 dark:bg-emerald-500/15 dark:text-emerald-100"
                              : isYourAnswer
                                ? "border-rose-500 bg-rose-100/80 text-rose-900 dark:border-rose-400 dark:bg-rose-500/15 dark:text-rose-100"
                                : "border-slate-200 bg-white/80 text-slate-700 dark:border-slate-700 dark:bg-slate-800/70 dark:text-slate-300"
                          }`}
                        >
                          <div className="mb-1 text-xs font-bold opacity-70">{label}</div>
                          <div>{optionText(item, label)}</div>
                          {isYourAnswer && !isCorrectOption && (
                            <div className="mt-1 text-xs font-medium text-rose-600 dark:text-rose-400">إجابتك</div>
                          )}
                          {isCorrectOption && (
                            <div className="mt-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                              الإجابة الصحيحة
                            </div>
                          )}
                        </div>
                      );
                    })}
                    {!item.yourAnswer && (
                      <p className="text-xs font-bold text-rose-600 dark:text-rose-400 md:col-span-2">لم تختر إجابة لهذا السؤال</p>
                    )}
                  </div>
                  )}
                </article>
                );
              })}
            </section>
          </div>
        ) : quiz ? (
          <div className="space-y-6">
            <section className="rounded-[2rem] border border-white/50 bg-white/85 p-6 shadow-[0_30px_80px_-35px_rgba(15,23,42,0.45)] backdrop-blur-xl dark:border-white/10 dark:bg-slate-900/85 sm:p-8">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="mb-2 text-sm text-slate-500 dark:text-slate-400">اختبار الكورس</p>
                  <h1 className="text-2xl font-black text-slate-900 dark:text-white sm:text-3xl">{quiz.title}</h1>
                  <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                    {quiz.course.title} • {quiz.course.subject}
                  </p>
                </div>
                <div className="min-w-[140px] rounded-2xl bg-slate-900 px-5 py-3 text-center text-white shadow-lg dark:bg-white dark:text-slate-900">
                  <div className="text-xs opacity-80">{timeLimitEnforced ? "الوقت المتبقي" : "الوقت"}</div>
                  {timeLimitEnforced ? (
                    <div
                      className={`text-2xl font-black ${remainingSeconds <= 60 ? "text-rose-500 dark:text-rose-600" : ""}`}
                    >
                      {formatTime(remainingSeconds)}
                    </div>
                  ) : (
                    <div className="text-2xl font-black">مفتوح</div>
                  )}
                </div>
              </div>

              <div className="mt-6 grid grid-cols-1 gap-3 text-sm text-slate-600 dark:text-slate-300 sm:grid-cols-3">
                <div className="rounded-2xl bg-slate-50 px-4 py-3 dark:bg-slate-800/70">
                  عدد الأسئلة: <span className="font-bold text-slate-900 dark:text-white">{totalQuestions}</span>
                </div>
                <div className="rounded-2xl bg-slate-50 px-4 py-3 dark:bg-slate-800/70">
                  المجاب عنها: <span className="font-bold text-slate-900 dark:text-white">{answeredCount}</span>
                </div>
                <div className="rounded-2xl bg-slate-50 px-4 py-3 dark:bg-slate-800/70">
                  المدة:{" "}
                  <span className="font-bold text-slate-900 dark:text-white">
                    {timeLimitEnforced ? `${quiz.timeLimitMinutes} دقيقة` : "بدون حد زمني"}
                  </span>
                </div>
              </div>
            </section>

            <section className="space-y-4">
              {quiz.questions.map((question, index) => (
                <article
                  key={question.id}
                  className="rounded-[1.75rem] border border-white/60 bg-white/90 p-5 shadow-lg dark:border-white/10 dark:bg-slate-900/90 sm:p-6"
                >
                  <div className="mb-4 flex flex-col gap-3">
                    <div className="flex items-center gap-3">
                      <span className="inline-flex h-9 w-9 items-center justify-center rounded-2xl bg-sky-100 font-black text-sky-700 dark:bg-sky-500/20 dark:text-sky-300 shrink-0">
                        {index + 1}
                      </span>
                      <h2 className="text-lg font-bold leading-relaxed text-slate-900 dark:text-white">
                        {question.question}
                      </h2>
                    </div>

                    {question.imageUrl && (
                      <div className="my-1 overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 p-2 dark:border-slate-700 dark:bg-slate-800/60">
                        <img
                          src={question.imageUrl}
                          alt="صورة توضيحية للسؤال"
                          className="max-h-80 w-full object-contain rounded-xl"
                        />
                      </div>
                    )}
                  </div>

                  {question.questionType === "essay" ? (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-xs font-bold text-sky-500">
                        <span>📝 سؤال مقالي</span>
                        <span className="text-slate-500 dark:text-slate-400 font-normal">(اكتب إجابتك النصية كاملة)</span>
                      </div>
                      <textarea
                        rows={4}
                        value={answers[question.id] || ""}
                        onChange={(e) => setAnswers((current) => ({ ...current, [question.id]: e.target.value }))}
                        placeholder="اكتب إجابتك المقالية بالتفصيل هنا..."
                        className="w-full rounded-2xl border border-slate-200 bg-slate-50/80 p-4 text-sm text-slate-900 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20 dark:border-slate-700 dark:bg-slate-800/70 dark:text-white"
                      />
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                      {optionLabels
                        .filter((label) => !!question[`option${label}` as const]?.trim())
                        .map((label) => {
                        const fieldName = `option${label}` as const;
                        const active = answers[question.id] === label;
                        return (
                          <button
                            key={label}
                            type="button"
                            onClick={() => setAnswers((current) => ({ ...current, [question.id]: label }))}
                            className={`rounded-2xl border px-4 py-4 text-right transition-all ${
                              active
                                ? "border-sky-500 bg-sky-50 text-sky-900 shadow-sm dark:border-sky-400 dark:bg-sky-500/15 dark:text-sky-100"
                                : "border-slate-200 bg-slate-50/80 text-slate-700 hover:border-sky-300 hover:bg-sky-50 dark:border-slate-700 dark:bg-slate-800/70 dark:text-slate-200 dark:hover:border-sky-500/60"
                            }`}
                          >
                            <div className="mb-2 text-xs font-bold tracking-[0.2em] opacity-70">{label}</div>
                            <div className="text-sm leading-7">{question[fieldName]}</div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </article>
              ))}
            </section>

            <div className="sticky bottom-4 z-10 flex justify-center">
              <div className="flex w-full max-w-3xl items-center justify-between gap-4 rounded-full border border-white/60 bg-white/90 px-4 py-3 shadow-2xl backdrop-blur-xl dark:border-white/10 dark:bg-slate-900/90">
                <span className="text-sm text-slate-600 dark:text-slate-300">
                  راجعت {answeredCount} من {totalQuestions} سؤال
                </span>
                <button
                  onClick={() => submitQuiz(false)}
                  disabled={saving}
                  className="rounded-full bg-slate-900 px-6 py-2.5 text-sm font-bold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-white dark:text-slate-900"
                >
                  {saving ? "جارٍ الإرسال..." : "تسليم الاختبار"}
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </main>
      <Footer />
    </div>
  );
}
