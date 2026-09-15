"use client";

import { useEffect, useState } from "react";
import { useToast } from "@/components/ui/Toast";

type Mode = "off" | "assist" | "auto";

interface CourseRow {
  id: string;
  title: string;
  mode: Mode;
  essayQuestions: number;
  withCriteria: number;
}

interface QuestionRow {
  id: string;
  question: string;
  quizTitle: string;
  folderName: string;
  guide: { referenceAnswer: string | null; rubric: string | null; maxPoints: number; updatedAt: string } | null;
  ready: boolean;
  criteriaCount: number;
}

const MODES: Array<{ id: Mode; label: string; hint: string }> = [
  { id: "off", label: "إيقاف", hint: "لا تُرسل أي إجابة للذكاء الاصطناعي. التصحيح يدوي بالكامل (الافتراضي)." },
  {
    id: "assist",
    label: "مساعد",
    hint: "يحصل الطالب فوراً على تقييم مبدئي وملاحظات، وتبقى الدرجة الرسمية بقرارك أنت.",
  },
  {
    id: "auto",
    label: "تلقائي",
    hint: "يعتمد الحكم آلياً فقط عندما يكون واضحاً (صحيح/خطأ) وبثقة عالية ومدعوماً باقتباس من إجابة الطالب. الإجابات الجزئية أو غير الواضحة تنتظر تصحيحك، ويمكنك تعديل أي درجة.",
  },
];

export function TeacherAIGradingSettings() {
  const { success, error } = useToast();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [platformEnabled, setPlatformEnabled] = useState(true);
  const [courses, setCourses] = useState<CourseRow[]>([]);
  const [savingCourse, setSavingCourse] = useState<string | null>(null);
  const [editorCourse, setEditorCourse] = useState<CourseRow | null>(null);

  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/admin/teacher/ai-grading");
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok) {
          setLoadError(data.error || "تعذر تحميل إعدادات التصحيح الذكي");
          return;
        }
        setLoadError("");
        setCourses(data.courses || []);
        setPlatformEnabled(data.platformEnabled !== false);
      } catch {
        if (!cancelled) setLoadError("تعذر الاتصال بالخادم");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  const load = () => {
    setLoading(true);
    setReloadKey((k) => k + 1);
  };

  const setMode = async (course: CourseRow, mode: Mode) => {
    if (mode === course.mode) return;
    if (
      mode === "auto" &&
      !window.confirm(
        "في الوضع التلقائي قد تُعتمد بعض الدرجات المقالية آلياً دون مراجعتك (فقط الأحكام الواضحة عالية الثقة). يمكنك تعديل أي درجة لاحقاً. هل تريد التفعيل؟"
      )
    ) {
      return;
    }
    setSavingCourse(course.id);
    try {
      const res = await fetch("/api/admin/teacher/ai-grading", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ courseId: course.id, mode }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        error(data.error || "تعذر حفظ الإعداد");
        return;
      }
      setCourses((prev) => prev.map((c) => (c.id === course.id ? { ...c, mode } : c)));
      success(mode === "off" ? "تم إيقاف التصحيح الذكي لهذا الكورس" : "تم حفظ إعداد التصحيح الذكي");
    } catch {
      error("حدث خطأ");
    } finally {
      setSavingCourse(null);
    }
  };

  const activeCount = courses.filter((c) => c.mode !== "off").length;

  return (
    <section className="rounded-2xl border border-slate-200 dark:border-gray-700 bg-white dark:bg-gray-800">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full flex items-center justify-between gap-3 p-4 text-right"
      >
        <div>
          <h3 className="font-black text-slate-900 dark:text-white">🤖 التصحيح بالذكاء الاصطناعي للأسئلة المقالية</h3>
          <p className="text-xs text-slate-500 dark:text-gray-400 mt-1">
            {loading
              ? "جارٍ التحميل..."
              : !platformEnabled
                ? "موقوف حالياً من إدارة المنصة"
                : activeCount > 0
                  ? `مفعّل في ${activeCount} من ${courses.length} كورس`
                  : "غير مفعّل في أي كورس — التصحيح يدوي"}
          </p>
        </div>
        <span className="text-slate-400 text-sm">{open ? "▴" : "▾"}</span>
      </button>

      {open && (
        <div className="border-t border-slate-200 dark:border-gray-700 p-4 space-y-4">
          {!platformEnabled && (
            <p className="rounded-xl bg-amber-500/10 border border-amber-500/30 p-3 text-xs font-bold text-amber-600 dark:text-amber-300">
              أوقفت إدارة المنصة التصحيح بالذكاء الاصطناعي مؤقتاً. إعداداتك محفوظة وستعمل عند إعادة التفعيل.
            </p>
          )}

          <ul className="grid gap-2 sm:grid-cols-3 text-xs">
            {MODES.map((m) => (
              <li key={m.id} className="rounded-xl bg-slate-50 dark:bg-gray-900/60 border border-slate-200 dark:border-gray-700 p-3">
                <p className="font-bold text-slate-800 dark:text-gray-100 mb-1">{m.label}</p>
                <p className="text-slate-500 dark:text-gray-400 leading-relaxed">{m.hint}</p>
              </li>
            ))}
          </ul>
          <p className="text-xs text-slate-500 dark:text-gray-400 leading-relaxed">
            لا يُصحَّح أي سؤال آلياً إلا إذا أضفت له <b>معايير تصحيح</b> (إجابة نموذجية و/أو نقاط مطلوبة). يقيّم الذكاء الاصطناعي المعنى وليس
            تطابق الكلمات، وتظهر المعايير للطالب بعد التسليم ضمن ملاحظات تصحيحه.
          </p>

          {loading ? (
            <p className="py-6 text-center text-sm text-slate-500 dark:text-gray-400">جارٍ التحميل...</p>
          ) : loadError ? (
            <div className="py-6 text-center space-y-2">
              <p className="text-sm text-rose-500">{loadError}</p>
              <button onClick={load} className="text-xs font-bold text-sky-500 underline">
                إعادة المحاولة
              </button>
            </div>
          ) : courses.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-500 dark:text-gray-400">لا توجد كورسات بعد.</p>
          ) : (
            <div className="space-y-2">
              {courses.map((c) => (
                <div
                  key={c.id}
                  className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 dark:border-gray-700 p-3"
                >
                  <div className="flex-1 min-w-[180px]">
                    <p className="text-sm font-bold text-slate-900 dark:text-white">{c.title}</p>
                    <p className="text-[11px] text-slate-500 dark:text-gray-400 mt-0.5">
                      {c.essayQuestions === 0
                        ? "لا توجد أسئلة مقالية"
                        : `${c.withCriteria} من ${c.essayQuestions} سؤال مقالي لها معايير تصحيح`}
                    </p>
                  </div>
                  <div
                    role="radiogroup"
                    aria-label={`وضع التصحيح الذكي لكورس ${c.title}`}
                    className="inline-flex rounded-xl border border-slate-200 dark:border-gray-700 p-0.5 bg-slate-50 dark:bg-gray-900"
                  >
                    {MODES.map((m) => (
                      <button
                        key={m.id}
                        role="radio"
                        aria-checked={c.mode === m.id}
                        disabled={savingCourse === c.id}
                        onClick={() => void setMode(c, m.id)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors disabled:opacity-50 ${
                          c.mode === m.id
                            ? m.id === "off"
                              ? "bg-slate-600 text-white"
                              : m.id === "assist"
                                ? "bg-sky-500 text-white"
                                : "bg-purple-600 text-white"
                            : "text-slate-600 dark:text-gray-300 hover:bg-slate-200 dark:hover:bg-gray-800"
                        }`}
                      >
                        {m.label}
                      </button>
                    ))}
                  </div>
                  <button
                    onClick={() => setEditorCourse(c)}
                    disabled={c.essayQuestions === 0}
                    className="px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-100 dark:bg-gray-700 text-slate-800 dark:text-gray-100 hover:bg-slate-200 dark:hover:bg-gray-600 disabled:opacity-40"
                  >
                    ✏️ معايير التصحيح
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {editorCourse && (
        <CriteriaEditor
          course={editorCourse}
          onClose={() => {
            setEditorCourse(null);
            load();
          }}
        />
      )}
    </section>
  );
}

function CriteriaEditor({ course, onClose }: { course: CourseRow; onClose: () => void }) {
  const { success, error } = useToast();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [questions, setQuestions] = useState<QuestionRow[]>([]);
  const [drafts, setDrafts] = useState<Record<string, { referenceAnswer: string; rubric: string; maxPoints: string }>>({});
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/admin/teacher/ai-grading/questions?courseId=${encodeURIComponent(course.id)}`);
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok) {
          setLoadError(data.error || "تعذر تحميل الأسئلة");
          return;
        }
        const rows: QuestionRow[] = data.questions || [];
        setQuestions(rows);
        setDrafts(
          Object.fromEntries(
            rows.map((q) => [
              q.id,
              {
                referenceAnswer: q.guide?.referenceAnswer ?? "",
                rubric: q.guide?.rubric ?? "",
                maxPoints: String(q.guide?.maxPoints ?? 10),
              },
            ])
          )
        );
      } catch {
        if (!cancelled) setLoadError("تعذر الاتصال بالخادم");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [course.id]);

  const save = async (q: QuestionRow) => {
    const d = drafts[q.id];
    if (!d) return;
    setSaving(q.id);
    try {
      const res = await fetch("/api/admin/teacher/ai-grading/questions", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questionId: q.id, referenceAnswer: d.referenceAnswer, rubric: d.rubric, maxPoints: d.maxPoints }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        error(data.error || "تعذر الحفظ");
        return;
      }
      setQuestions((prev) => prev.map((x) => (x.id === q.id ? { ...x, ready: !!data.ready } : x)));
      success(data.ready ? "تم حفظ معايير التصحيح" : "تم حذف معايير التصحيح لهذا السؤال");
    } catch {
      error("حدث خطأ");
    } finally {
      setSaving(null);
    }
  };

  const field =
    "w-full rounded-xl border border-slate-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-slate-900 dark:text-gray-100 focus:outline-none focus:border-purple-400";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose} dir="rtl">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`معايير التصحيح — ${course.title}`}
        className="w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-3xl bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-700 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-slate-200 dark:border-gray-700 bg-white/95 dark:bg-gray-900/95 backdrop-blur px-5 py-4">
          <div>
            <h3 className="text-lg font-black text-slate-900 dark:text-white">معايير التصحيح — {course.title}</h3>
            <p className="text-xs text-slate-500 dark:text-gray-400 mt-1">
              اكتب إجابة نموذجية واحدة (يُقبل أي تعبير آخر بنفس المعنى) و/أو النقاط المطلوبة — سطر لكل نقطة.
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg px-3 py-1.5 text-sm font-bold text-slate-600 hover:bg-slate-100 dark:text-gray-300 dark:hover:bg-gray-800"
          >
            إغلاق ✕
          </button>
        </div>
        <div className="p-5 space-y-4">
          {loading ? (
            <p className="py-10 text-center text-sm text-slate-500 dark:text-gray-400">جارٍ التحميل...</p>
          ) : loadError ? (
            <p className="py-10 text-center text-sm text-rose-500">{loadError}</p>
          ) : questions.length === 0 ? (
            <p className="py-10 text-center text-sm text-slate-500 dark:text-gray-400">لا توجد أسئلة مقالية في هذا الكورس.</p>
          ) : (
            questions.map((q) => {
              const d = drafts[q.id] ?? { referenceAnswer: "", rubric: "", maxPoints: "10" };
              const set = (patch: Partial<typeof d>) => setDrafts((prev) => ({ ...prev, [q.id]: { ...d, ...patch } }));
              return (
                <article key={q.id} className="rounded-2xl border border-slate-200 dark:border-gray-700 bg-slate-50 dark:bg-gray-800/60 p-4 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[11px] text-slate-500 dark:text-gray-400">
                        {q.folderName} · {q.quizTitle}
                      </p>
                      <p className="text-sm font-bold text-slate-900 dark:text-white leading-relaxed mt-0.5">{q.question}</p>
                    </div>
                    <span
                      className={`shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-lg ${
                        q.ready ? "bg-emerald-500/15 text-emerald-500" : "bg-amber-500/15 text-amber-500"
                      }`}
                    >
                      {q.ready ? "جاهز للتصحيح الذكي" : "بدون معايير"}
                    </span>
                  </div>
                  <label className="block text-xs font-bold text-slate-600 dark:text-gray-300">
                    الإجابة النموذجية
                    <textarea
                      rows={3}
                      maxLength={4000}
                      value={d.referenceAnswer}
                      onChange={(e) => set({ referenceAnswer: e.target.value })}
                      className={`${field} mt-1`}
                      placeholder="مثال لإجابة كاملة..."
                    />
                  </label>
                  <label className="block text-xs font-bold text-slate-600 dark:text-gray-300">
                    النقاط المطلوبة (سطر لكل نقطة — للتصحيح التلقائي)
                    <textarea
                      rows={3}
                      maxLength={4000}
                      value={d.rubric}
                      onChange={(e) => set({ rubric: e.target.value })}
                      className={`${field} mt-1`}
                      placeholder={"يذكر تعريف المفهوم\nيعطي مثالاً صحيحاً\nيوضح السبب"}
                    />
                  </label>
                  <div className="flex flex-wrap items-end gap-3">
                    <label className="text-xs font-bold text-slate-600 dark:text-gray-300">
                      الدرجة العظمى للتقييم
                      <input
                        type="number"
                        min={1}
                        max={100}
                        value={d.maxPoints}
                        onChange={(e) => set({ maxPoints: e.target.value })}
                        className={`${field} mt-1 w-24`}
                        dir="ltr"
                      />
                    </label>
                    <button
                      onClick={() => void save(q)}
                      disabled={saving === q.id}
                      className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold disabled:opacity-50"
                    >
                      {saving === q.id ? "جارٍ الحفظ..." : "حفظ"}
                    </button>
                    {q.criteriaCount === 0 && q.ready && (
                      <span className="text-[11px] text-slate-500 dark:text-gray-400">
                        بدون نقاط مطلوبة يبقى التقييم استرشادياً ولا يُعتمد تلقائياً.
                      </span>
                    )}
                  </div>
                </article>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
