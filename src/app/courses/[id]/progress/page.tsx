"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Navbar } from "@/components/ui/Navbar";
import { Footer } from "@/components/ui/Footer";

type QuizState = "NOT_STARTED" | "IN_PROGRESS" | "PENDING_GRADING" | "GRADED";

type ProgressData = {
  course: { id: string; title: string; subject: string; teacherName: string; teacherSlug: string | null };
  subscription: { planLabel: string; expiresAt: string | null } | null;
  aiEssayFeedback: boolean;
  totals: {
    videos: { total: number; watched: number };
    quizzes: { total: number; completed: number };
    homeworks: { total: number; submitted: number };
    averageScore: number | null;
    pendingEssays: number;
    aiEvaluated: number;
  };
  folders: Array<{
    id: string;
    name: string;
    videos: { total: number; watched: number };
    quizzes: Array<{ id: string; title: string; state: QuizState; score: number | null; passed?: boolean | null; pendingEssays: number }>;
    homeworks: Array<{ id: string; title: string; status: string; score: number | null }>;
  }>;
};

const QUIZ_STATE: Record<QuizState, { label: string; cls: string }> = {
  NOT_STARTED: { label: "لم يبدأ", cls: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300" },
  IN_PROGRESS: { label: "لم يُسلَّم", cls: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300" },
  PENDING_GRADING: { label: "قيد التصحيح", cls: "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300" },
  GRADED: { label: "مُصحَّح", cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300" },
};

const HW_STATUS: Record<string, string> = {
  NOT_SUBMITTED: "لم يُسلَّم",
  pending: "بانتظار المراجعة",
  passed: "ناجح ✓",
  failed: "يحتاج إعادة",
  review_requested: "طُلبت مراجعة",
};

function pct(done: number, total: number) {
  return total > 0 ? Math.round((done / total) * 100) : 0;
}

function Bar({ value }: { value: number }) {
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-gray-700" role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100}>
      <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${value}%` }} />
    </div>
  );
}

export default function CourseProgressPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const courseId = params.id;
  const [user, setUser] = useState<{ name: string; role: string } | null>(null);
  const [data, setData] = useState<ProgressData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{ message: string; code?: string } | null>(null);
  const [open, setOpen] = useState<Record<string, boolean>>({});

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => setUser(d.user ? { name: d.user.name, role: d.user.role } : null))
      .catch(() => setUser(null));
  }, []);

  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!courseId) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/courses/${encodeURIComponent(courseId)}/progress`, { credentials: "include", cache: "no-store" });
        const body = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (res.status === 401) {
          router.push(`/login?redirect_url=/courses/${courseId}/progress`);
          return;
        }
        if (!res.ok) {
          setError({ message: body.error || "تعذر تحميل المتابعة", code: body.code });
          return;
        }
        setError(null);
        setData(body as ProgressData);
        const first = (body as ProgressData).folders[0]?.id;
        if (first) setOpen({ [first]: true });
      } catch {
        if (!cancelled) setError({ message: "تعذر الاتصال بالخادم، تحقق من الإنترنت وحاول مرة أخرى" });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [courseId, router, reloadKey]);

  const retry = () => {
    setLoading(true);
    setError(null);
    setReloadKey((k) => k + 1);
  };

  return (
    <div className="flex min-h-screen flex-col bg-gray-50 dark:bg-gray-950" dir="rtl">
      <Navbar user={user} />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-6 lg:px-8">
        {loading ? (
          <div className="space-y-4" aria-busy="true">
            <div className="skeleton h-28 rounded-3xl" />
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="skeleton h-24 rounded-2xl" />
              ))}
            </div>
            <div className="skeleton h-64 rounded-3xl" />
          </div>
        ) : error ? (
          <div className="mx-auto max-w-md space-y-4 rounded-3xl border border-gray-100 bg-white p-8 text-center dark:border-gray-700 dark:bg-gray-800">
            <p className="text-3xl">{error.code === "NOT_ENROLLED" ? "🔒" : "⚠️"}</p>
            <p className="text-base font-bold text-gray-900 dark:text-white">{error.message}</p>
            <div className="flex justify-center gap-3">
              {error.code === "NOT_ENROLLED" || error.code === "STUDENTS_ONLY" ? (
                <Link href={`/courses/${courseId}`} className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-blue-700">
                  صفحة الكورس
                </Link>
              ) : (
                <button onClick={retry} className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-blue-700">
                  إعادة المحاولة
                </button>
              )}
            </div>
          </div>
        ) : data ? (
          <div className="space-y-6">
            {/* Whose follow-up this is — always this one teacher and course. */}
            <section className="rounded-3xl bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-6 text-white sm:p-8">
              <p className="text-sm font-bold text-emerald-300">📊 متابعة</p>
              <h1 className="mt-1 text-2xl font-black sm:text-3xl">{data.course.title}</h1>
              <p className="mt-2 text-sm text-white/80">
                مع {data.course.teacherSlug ? (
                  <Link href={`/${data.course.teacherSlug}`} className="font-bold underline decoration-white/30 underline-offset-4">
                    {data.course.teacherName}
                  </Link>
                ) : (
                  <span className="font-bold">{data.course.teacherName}</span>
                )}
                {" · "}
                {data.course.subject}
              </p>
              {data.subscription && (
                <p className="mt-3 inline-block rounded-full border border-emerald-400/40 bg-emerald-500/20 px-3 py-1 text-xs font-bold text-emerald-200">
                  {data.subscription.planLabel}
                  {data.subscription.expiresAt && ` · حتى ${new Date(data.subscription.expiresAt).toLocaleDateString("ar-EG")}`}
                </p>
              )}
              <p className="mt-3 text-xs text-white/60">هذه بياناتك أنت فقط في هذا الكورس — لا يراها أي طالب آخر.</p>
            </section>

            <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <div className="rounded-2xl border border-gray-100 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
                <p className="text-xs text-gray-500 dark:text-gray-400">المحاضرات المُشاهَدة</p>
                <p className="mt-1 text-2xl font-black text-gray-900 dark:text-white" dir="ltr">
                  {data.totals.videos.watched}/{data.totals.videos.total}
                </p>
                <div className="mt-2">
                  <Bar value={pct(data.totals.videos.watched, data.totals.videos.total)} />
                </div>
              </div>
              <div className="rounded-2xl border border-gray-100 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
                <p className="text-xs text-gray-500 dark:text-gray-400">الاختبارات المُسلَّمة</p>
                <p className="mt-1 text-2xl font-black text-gray-900 dark:text-white" dir="ltr">
                  {data.totals.quizzes.completed}/{data.totals.quizzes.total}
                </p>
                <div className="mt-2">
                  <Bar value={pct(data.totals.quizzes.completed, data.totals.quizzes.total)} />
                </div>
              </div>
              <div className="rounded-2xl border border-gray-100 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
                <p className="text-xs text-gray-500 dark:text-gray-400">متوسط درجاتك</p>
                <p className="mt-1 text-2xl font-black text-gray-900 dark:text-white">
                  {data.totals.averageScore === null ? "—" : `${data.totals.averageScore}%`}
                </p>
                <p className="mt-1 text-[11px] text-gray-500 dark:text-gray-400">للاختبارات المُصحَّحة نهائياً</p>
              </div>
              <div className="rounded-2xl border border-gray-100 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
                <p className="text-xs text-gray-500 dark:text-gray-400">الواجبات المُسلَّمة</p>
                <p className="mt-1 text-2xl font-black text-gray-900 dark:text-white" dir="ltr">
                  {data.totals.homeworks.submitted}/{data.totals.homeworks.total}
                </p>
                <div className="mt-2">
                  <Bar value={pct(data.totals.homeworks.submitted, data.totals.homeworks.total)} />
                </div>
              </div>
            </section>

            {(data.totals.pendingEssays > 0 || data.totals.aiEvaluated > 0) && (
              <p className="rounded-2xl border border-violet-200 bg-violet-50 p-4 text-sm text-violet-800 dark:border-violet-900/40 dark:bg-violet-950/30 dark:text-violet-200">
                {data.totals.pendingEssays > 0 && `📝 ${data.totals.pendingEssays} إجابة مقالية بانتظار التصحيح النهائي. `}
                {data.aiEssayFeedback && data.totals.aiEvaluated > 0 && `🤖 ${data.totals.aiEvaluated} إجابة لها ملاحظات تقييم بالذكاء الاصطناعي — افتح الاختبار لرؤيتها.`}
              </p>
            )}

            <section className="overflow-hidden rounded-3xl border border-gray-100 bg-white dark:border-gray-700 dark:bg-gray-800">
              <h2 className="border-b border-gray-100 px-6 py-4 text-lg font-bold text-gray-900 dark:border-gray-700 dark:text-white">
                التقدم في كل وحدة
              </h2>
              {data.folders.length === 0 ? (
                <p className="px-6 py-10 text-center text-sm text-gray-500 dark:text-gray-400">لم يُنشر محتوى في هذا الكورس بعد.</p>
              ) : (
                <ul className="divide-y divide-gray-100 dark:divide-gray-700">
                  {data.folders.map((f) => {
                    const isOpen = !!open[f.id];
                    const v = pct(f.videos.watched, f.videos.total);
                    return (
                      <li key={f.id}>
                        <button
                          onClick={() => setOpen((p) => ({ ...p, [f.id]: !p[f.id] }))}
                          aria-expanded={isOpen}
                          className="flex w-full items-center gap-4 px-6 py-4 text-right transition-colors hover:bg-gray-50 dark:hover:bg-gray-800/60"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold text-gray-900 dark:text-white">📁 {f.name}</p>
                            <div className="mt-2 flex items-center gap-3">
                              <Bar value={v} />
                              <span className="shrink-0 text-xs text-gray-500 dark:text-gray-400" dir="ltr">
                                {f.videos.watched}/{f.videos.total}
                              </span>
                            </div>
                          </div>
                          <span className="text-xs text-gray-400">{isOpen ? "▴" : "▾"}</span>
                        </button>
                        {isOpen && (
                          <div className="space-y-3 bg-gray-50/60 px-6 pb-4 pt-1 dark:bg-gray-900/30">
                            {f.quizzes.length === 0 && f.homeworks.length === 0 && (
                              <p className="py-2 text-xs text-gray-500 dark:text-gray-400">لا توجد اختبارات أو واجبات في هذه الوحدة.</p>
                            )}
                            {f.quizzes.map((q) => (
                              <Link
                                key={q.id}
                                href={`/quizzes/${q.id}`}
                                className="flex items-center justify-between gap-3 rounded-xl border border-gray-100 bg-white px-4 py-3 text-sm hover:border-blue-300 dark:border-gray-700 dark:bg-gray-800 dark:hover:border-blue-700"
                              >
                                <span className="min-w-0 truncate font-medium text-gray-800 dark:text-gray-100">📝 {q.title}</span>
                                <span className="flex shrink-0 items-center gap-2">
                                  {q.score !== null && (
                                    <span className={`font-black ${q.passed ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"}`}>
                                      {q.score}%
                                    </span>
                                  )}
                                  <span className={`rounded-lg px-2 py-0.5 text-[11px] font-bold ${QUIZ_STATE[q.state].cls}`}>
                                    {QUIZ_STATE[q.state].label}
                                  </span>
                                </span>
                              </Link>
                            ))}
                            {f.homeworks.map((h) => (
                              <div
                                key={h.id}
                                className="flex items-center justify-between gap-3 rounded-xl border border-gray-100 bg-white px-4 py-3 text-sm dark:border-gray-700 dark:bg-gray-800"
                              >
                                <span className="min-w-0 truncate font-medium text-gray-800 dark:text-gray-100">📚 {h.title}</span>
                                <span className="shrink-0 text-xs font-bold text-gray-600 dark:text-gray-300">
                                  {HW_STATUS[h.status] ?? h.status}
                                  {h.score !== null && ` · ${Math.round(h.score)}%`}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            <div className="flex flex-wrap gap-3">
              <Link href={`/courses/${data.course.id}/learn`} className="rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-emerald-700">
                متابعة التعلم ←
              </Link>
              <Link href={`/courses/${data.course.id}`} className="rounded-xl border border-gray-300 px-5 py-2.5 text-sm font-bold text-gray-700 hover:bg-gray-100 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800">
                صفحة الكورس
              </Link>
            </div>
          </div>
        ) : null}
      </main>
      <Footer />
    </div>
  );
}
