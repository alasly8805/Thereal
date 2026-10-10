"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { EditHomeworkModal } from "@/components/admin/teacher/EditHomeworkModal";
import { HomeworkIntegrityModal } from "@/components/admin/teacher/HomeworkIntegrityModal";
import { Badge, Button, Chip, EmptyState, IconButton, SkeletonRows, Switch, admConfirm } from "@/components/admin/ui/kit";
import {
  BarChart3,
  CalendarClock,
  Eye,
  EyeOff,
  FileText,
  Link2,
  ListChecks,
  Pencil,
  ShieldCheck,
  Terminal,
  Trash2,
  Upload,
} from "lucide-react";

function toDatetimeLocal(value: string | null | undefined): string {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface ReviewSnapshot {
  fileUrl?: string | null;
  fileName?: string | null;
  submittedOutput?: string | null;
}

interface Submission {
  id: string;
  studentId: string;
  student: { id: string; name: string; email: string };
  submittedOutput?: string | null;
  fileUrl?: string | null;
  fileName?: string | null;
  /** MCQ answers JSON: { questionId: "A"|"B"|"C"|"D" } — exam type only */
  answers?: string | null;
  score?: number | null;
  totalQ?: number | null;
  status: string;
  completedAt: string;
  review?: { verdict?: string | null; note?: string | null } | null;
  snapshot?: ReviewSnapshot | null;
  contentChanged?: boolean;
  allowRetake?: boolean;
  /** Order/draw this student saw (JSON). Answers above are in original letters. */
  presentation?: string | null;
  focusLosses?: number | null;
  startedAt?: string | null;
}

interface HWQuestion {
  id: string;
  question: string;
  imageUrl?: string | null;
  optionA: string;
  optionB: string;
  optionC: string;
  optionD: string;
  correctAnswer: string;
  order: number;
}

const OPTION_KEYS = ["A", "B", "C", "D"] as const;

function optionText(q: HWQuestion, key: string): string {
  const idx = OPTION_KEYS.indexOf(key as (typeof OPTION_KEYS)[number]);
  const text = [q.optionA, q.optionB, q.optionC, q.optionD][idx];
  return text?.trim() ? text : "";
}

interface HwWithSubs {
  id: string;
  title: string;
  type: string;
  expectedOutput?: string | null;
  reviewQueueCount?: number;
  failedCount?: number;
  submissions?: Submission[];
}

function hwTypeLabel(type: string) {
  if (type === "upload") return "📎 رفع ملف";
  if (type === "terminal") return "💻 كود";
  if (type === "exam") return "📝 اختبار";
  if (type === "link") return "🔗 رابط";
  return type;
}

function statusLabel(status: string, allowRetake?: boolean, reviewVerdict?: string | null, contentChanged?: boolean) {
  if (contentChanged && reviewVerdict === "failed" && (status === "review_requested" || status === "pending")) {
    return { text: "اترفض — رُفع من جديد", cls: "bg-rose-500/15 text-rose-500" };
  }
  if (allowRetake && status === "failed") return { text: "مرفوض — مسموح إعادة الرفع", cls: "bg-rose-500/15 text-rose-500" };
  if (allowRetake) return { text: "مسموح إعادة المحاولة", cls: "bg-sky-500/15 text-sky-500" };
  if (status === "passed") return { text: "تمت الموافقة", cls: "bg-emerald-500/15 text-emerald-500" };
  if (status === "failed") return { text: "مرفوض", cls: "bg-rose-500/15 text-rose-500" };
  if (status === "review_requested") return { text: "قيد المراجعة", cls: "bg-amber-500/15 text-amber-500" };
  return { text: "معلق — رفع ملف", cls: "bg-sky-500/15 text-sky-500" };
}

function isPendingStatus(status: string) {
  return status === "pending" || status === "review_requested";
}

// ─── ExamAnswersBreakdown ─────────────────────────────────────────────────────
// Per-question right/wrong view for an MCQ exam submission.

/** Page exits and solving time for one exam sheet. Hints, not verdicts. */
function IntegrityLine({ sub }: { sub: Submission }) {
  const minutes =
    sub.startedAt && sub.completedAt
      ? Math.max(0, Math.round((new Date(sub.completedAt).getTime() - new Date(sub.startedAt).getTime()) / 6000) / 10)
      : null;
  if (sub.focusLosses == null && minutes == null) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {minutes != null && <Badge tone="neutral">حلّه في {minutes} دقيقة</Badge>}
      {sub.focusLosses != null &&
        (sub.focusLosses >= 3 ? (
          <Badge tone="bad">خرج من الصفحة {sub.focusLosses} مرة</Badge>
        ) : (
          <Badge tone="ok">خرج من الصفحة {sub.focusLosses} مرة</Badge>
        ))}
    </div>
  );
}

function ExamAnswersBreakdown({
  answersJson,
  presentationJson,
  questions: allQuestions,
  score,
  totalQ,
}: {
  answersJson?: string | null;
  presentationJson?: string | null;
  questions: HWQuestion[];
  score?: number | null;
  totalQ?: number | null;
}) {
  const [open, setOpen] = useState(false);

  // A bank draw: list only the questions this student was given.
  const questions = useMemo(() => {
    if (!presentationJson) return allQuestions;
    try {
      const p = JSON.parse(presentationJson) as { pool?: boolean; questionIds?: string[] };
      if (!p?.pool || !Array.isArray(p.questionIds)) return allQuestions;
      const ids = new Set(p.questionIds);
      return allQuestions.filter((q) => ids.has(q.id));
    } catch {
      return allQuestions;
    }
  }, [allQuestions, presentationJson]);

  const answers = useMemo(() => {
    if (!answersJson) return {} as Record<string, string>;
    try {
      return JSON.parse(answersJson) as Record<string, string>;
    } catch {
      return {} as Record<string, string>;
    }
  }, [answersJson]);

  if (questions.length === 0) return null;

  const results = questions.map((q, i) => {
    const given = answers[q.id];
    const correct = !!given && given === q.correctAnswer;
    return { q, idx: i, given, correct };
  });
  const correctCount = results.filter((r) => r.correct).length;
  const total = totalQ ?? questions.length;
  const pct = score != null ? Math.round(score) : total > 0 ? Math.round((correctCount / total) * 100) : 0;

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between gap-2 rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3.5 py-2.5 text-sm font-bold text-[var(--ink)] hover:border-sky-400/50 transition-colors"
      >
        <span>📝 إجابات الاختبار</span>
        <span className="flex items-center gap-2 shrink-0">
          <span className="text-xs font-black">
            <span className="text-emerald-500">{correctCount} صحيحة</span>
            {" · "}
            <span className="text-rose-500">{total - correctCount} خاطئة</span>
            {" · "}
            <span className="text-[var(--ink)]">{pct}%</span>
          </span>
          <span className="text-[10px] text-[var(--ink-muted)]">{open ? "إخفاء ▲" : "التفاصيل ▼"}</span>
        </span>
      </button>

      {/* Compact per-question chips: green ✓ / red ✗ */}
      {!open && (
        <div className="flex flex-wrap gap-1.5">
          {results.map(({ q, idx, correct }) => (
            <span
              key={q.id}
              className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-black ${
                correct ? "bg-emerald-500/10 text-emerald-500" : "bg-rose-500/10 text-rose-500"
              }`}
            >
              س{idx + 1} {correct ? "✓" : "✗"}
            </span>
          ))}
        </div>
      )}

      {open && (
        <div className="space-y-2">
          {results.map(({ q, idx, given, correct }) => (
            <div
              key={q.id}
              className={`rounded-xl border p-3 text-sm ${
                correct ? "border-emerald-500/30 bg-emerald-500/5" : "border-rose-500/40 bg-rose-500/5"
              }`}
            >
              <div className="flex items-start gap-2">
                <span
                  className={`inline-flex items-center justify-center w-6 h-6 rounded-lg text-xs font-black shrink-0 ${
                    correct ? "bg-emerald-500 text-white" : "bg-rose-500 text-white"
                  }`}
                >
                  {correct ? "✓" : "✗"}
                </span>
                <div className="flex-1 space-y-1.5 min-w-0">
                  <p className="font-bold text-[var(--ink)] leading-relaxed">
                    س{idx + 1}: {q.question}
                  </p>
                  {q.imageUrl && (
                    <img src={q.imageUrl} alt="صورة السؤال" className="max-h-40 rounded-lg border border-[var(--border)] object-contain" />
                  )}
                  <p className={`text-xs font-bold ${correct ? "text-emerald-500" : "text-rose-500"}`}>
                    إجابة الطالب:{" "}
                    {given ? `(${given}) ${optionText(q, given) || "—"}` : "— لم يجب على هذا السؤال —"}
                  </p>
                  {!correct && (
                    <p className="text-xs font-bold text-emerald-500">
                      الإجابة الصحيحة: ({q.correctAnswer}) {optionText(q, q.correctAnswer) || "—"}
                    </p>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── LiveReviewPanel ──────────────────────────────────────────────────────────

export function LiveReviewPanel({ notify }: { notify: (t: "success" | "error", m: string) => void }) {
  const [homeworks, setHomeworks] = useState<HwWithSubs[]>([]);
  const [selected, setSelected] = useState<HwWithSubs | null>(null);
  const [subs, setSubs] = useState<Submission[]>([]);
  const [questions, setQuestions] = useState<HWQuestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [verdicting, setVerdicting] = useState<string | null>(null);
  const [noteMap, setNoteMap] = useState<Record<string, string>>({});
  const [typeFilter, setTypeFilter] = useState<"all" | "upload" | "other">("all");
  const [statusFilter, setStatusFilter] = useState<"pending" | "passed" | "failed" | "all">("pending");
  const [diffOpen, setDiffOpen] = useState<Record<string, boolean>>({});
  const [retrying, setRetrying] = useState<string | null>(null);

  const fetchHomeworks = useCallback(async () => {
    const res = await fetch("/api/admin/homework", { credentials: "include" });
    const data = await res.json();
    const list = (data.homeworks || []) as HwWithSubs[];
    list.sort((a, b) => {
      const au = a.type === "upload" ? 0 : 1;
      const bu = b.type === "upload" ? 0 : 1;
      if (au !== bu) return au - bu;
      return (b.reviewQueueCount ?? 0) - (a.reviewQueueCount ?? 0);
    });
    setHomeworks(list);
  }, []);

  useEffect(() => {
    void fetchHomeworks();
  }, [fetchHomeworks]);

  const loadReview = async (hw: HwWithSubs) => {
    setSelected(hw);
    setLoading(true);
    setDiffOpen({});
    setQuestions([]);
    try {
      const res = await fetch(`/api/homework/${hw.id}/review`, { credentials: "include" });
      const data = await res.json();
      setSubs(data.submissions || []);
      setQuestions(data.hw?.questions || []);
    } finally {
      setLoading(false);
    }
  };

  const verdict = async (sub: Submission, v: "passed" | "failed") => {
    setVerdicting(sub.id);
    try {
      const res = await fetch(`/api/homework/${selected!.id}/review`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ submissionId: sub.id, verdict: v, note: noteMap[sub.id] || "" }),
      });
      const data = await res.json();
      if (res.ok) {
                    notify("success", v === "passed" ? "تم قبول الإجابة ✅ — لسه ظاهرة تحت" : "تم رفض الإجابة ❌");
        setSubs((list) =>
          list.map((x) =>
            x.id === sub.id
              ? {
                  ...x,
                  status: v,
                  allowRetake: false,
                  contentChanged: false,
                  snapshot: {
                    fileUrl: x.fileUrl,
                    fileName: x.fileName,
                    submittedOutput: x.submittedOutput,
                  },
                  review: { verdict: v, note: noteMap[sub.id] || x.review?.note || null },
                }
              : x
          )
        );
        setHomeworks((list) =>
          list.map((h) => {
            if (h.id !== selected?.id) return h;
            const pendingDelta = isPendingStatus(sub.status) ? 1 : 0;
            const failedDelta = v === "failed" && sub.status !== "failed" ? 1 : v === "passed" && sub.status === "failed" ? -1 : 0;
            return {
              ...h,
              reviewQueueCount: Math.max(0, (h.reviewQueueCount ?? 0) - pendingDelta),
              failedCount: Math.max(0, (h.failedCount ?? 0) + failedDelta),
            };
          })
        );
      } else {
        notify("error", data.error || "تعذر حفظ الحكم");
      }
    } finally {
      setVerdicting(null);
    }
  };

  const toggleRetry = async (sub: Submission, allowRetake: boolean) => {
    if (!selected) return;
    setRetrying(sub.id);
    try {
      const res = await fetch(`/api/homework/${selected.id}/retry`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ submissionId: sub.id, allowRetake }),
      });
      const data = await res.json();
      if (res.ok) {
        notify(
          "success",
          allowRetake
            ? "اتفتحت محاولة تانية للطالب — يقدر يرفع الملف من تاني"
            : "اتقفلت إعادة المحاولة"
        );
        setSubs((list) =>
          list.map((x) => (x.id === sub.id ? { ...x, allowRetake } : x))
        );
        setHomeworks((list) =>
          list.map((h) => {
            if (h.id !== selected?.id) return h;
            if (sub.status !== "failed") return h;
            const delta = allowRetake ? -1 : 1;
            return { ...h, failedCount: Math.max(0, (h.failedCount ?? 0) + delta) };
          })
        );
      } else {
        notify("error", data.error || "تعذر تحديث إعادة المحاولة");
      }
    } finally {
      setRetrying(null);
    }
  };

  const pendingTotal = homeworks.reduce((s, h) => s + (h.reviewQueueCount ?? 0), 0);
  const failedTotal = homeworks.reduce((s, h) => s + (h.failedCount ?? 0), 0);
  const uploadPending = homeworks
    .filter((h) => h.type === "upload")
    .reduce((s, h) => s + (h.reviewQueueCount ?? 0), 0);

  const visibleHomeworks = useMemo(() => {
    return homeworks.filter((h) => {
      if (typeFilter === "upload" && h.type !== "upload") return false;
      if (typeFilter === "other" && h.type === "upload") return false;
      if (statusFilter === "pending" && (h.reviewQueueCount ?? 0) === 0 && typeFilter !== "upload") return false;
      if (statusFilter === "failed" && (h.failedCount ?? 0) === 0) return false;
      return true;
    });
  }, [homeworks, typeFilter, statusFilter]);

  const visibleSubs = useMemo(() => {
    return subs.filter((s) => {
      if (statusFilter === "pending") return isPendingStatus(s.status) || s.contentChanged;
      if (statusFilter === "passed") return s.status === "passed" || s.contentChanged;
      if (statusFilter === "failed") return s.status === "failed";
      return true;
    });
  }, [subs, statusFilter]);

  const input =
    "w-full px-3 py-2 rounded-xl border border-[var(--border)] bg-[var(--bg)] text-[var(--ink)] text-sm focus:outline-none focus:border-sky-400/60 transition-all";

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <h2 className="text-lg font-black text-[var(--ink)]">🔍 مراجعة التسليمات</h2>
        {pendingTotal > 0 && (
          <span className="bg-amber-500/15 text-amber-500 text-xs font-bold px-2.5 py-1 rounded-full w-fit">
            {pendingTotal} يحتاج مراجعة
          </span>
        )}
        {failedTotal > 0 && (
          <button
            type="button"
            onClick={() => {
              setStatusFilter("failed");
              setSelected(null);
            }}
            className="bg-rose-500/15 text-rose-500 text-xs font-bold px-2.5 py-1 rounded-full w-fit"
          >
            {failedTotal} مرفوض — اسمح بإعادة المحاولة
          </button>
        )}
      </div>

      {uploadPending > 0 && (
        <button
          type="button"
          onClick={() => {
            setTypeFilter("upload");
            setStatusFilter("pending");
            setSelected(null);
          }}
          className="w-full text-right rounded-2xl border-2 border-amber-400 bg-amber-500/15 px-4 py-3.5 shadow-[0_0_0_4px_rgba(245,158,11,0.15)]"
        >
          <p className="text-sm font-black text-amber-600 dark:text-amber-300">📎 واجبات الرفع جاهزة للمراجعة</p>
          <p className="text-xs mt-1 font-bold text-amber-700/80 dark:text-amber-200/80">
            {uploadPending} ملف في الانتظار — دوس هنا عشان تلاقيهم فوراً
          </p>
        </button>
      )}

      {!selected ? (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {(
              [
                { id: "all", label: "كل الأنواع" },
                { id: "upload", label: "📎 رفع ملفات" },
                { id: "other", label: "اختبار / كود" },
              ] as const
            ).map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTypeFilter(t.id)}
                className={`min-h-11 px-3.5 rounded-xl text-xs font-black border-2 ${
                  typeFilter === t.id
                    ? t.id === "upload"
                      ? "border-amber-500 bg-amber-500 text-white"
                      : "border-sky-500 bg-sky-500 text-white"
                    : "border-[var(--border)] text-[var(--ink-muted)]"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            {(
              [
                { id: "pending", label: "يحتاج مراجعة" },
                { id: "failed", label: "مرفوض" },
                { id: "passed", label: "تمت الموافقة" },
                { id: "all", label: "الكل" },
              ] as const
            ).map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setStatusFilter(t.id)}
                className={`min-h-10 px-3 rounded-xl text-xs font-bold ${
                  statusFilter === t.id ? "bg-[var(--ink)] text-[var(--bg)]" : "bg-[var(--surface-2)] text-[var(--ink-2)]"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {visibleHomeworks.length === 0 ? (
            <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-12 text-center">
              <p className="text-4xl mb-3">✅</p>
              <p className="text-[var(--ink-muted)]">
                {typeFilter === "upload" ? "لا توجد واجبات رفع في الفلتر ده" : "لا توجد إجابات في الفلتر الحالي"}
              </p>
            </div>
          ) : (
            visibleHomeworks.map((hw) => (
              <button
                key={hw.id}
                onClick={() => void loadReview(hw)}
                className={`w-full bg-[var(--surface)] border rounded-2xl p-4 flex items-center justify-between gap-3 text-right transition-colors ${
                  hw.type === "upload" ? "border-amber-400/60 hover:border-amber-400" : "border-[var(--border)] hover:border-sky-400/50"
                }`}
              >
                <div>
                  <p className="font-bold text-[var(--ink)]">{hw.title}</p>
                  <p className="text-xs text-[var(--ink-muted)] mt-0.5">{hwTypeLabel(hw.type)}</p>
                </div>
                <span className="flex items-center gap-1.5 shrink-0">
                  {(hw.failedCount ?? 0) > 0 && (
                    <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-rose-500/15 text-rose-500">
                      {hw.failedCount} مرفوض
                    </span>
                  )}
                  <span
                    className={`text-xs font-bold px-2.5 py-1 rounded-full ${
                      (hw.reviewQueueCount ?? 0) > 0 ? "bg-amber-500/15 text-amber-500" : "bg-slate-500/15 text-[var(--ink-muted)]"
                    }`}
                  >
                    {hw.reviewQueueCount ?? 0} معلق
                  </span>
                </span>
              </button>
            ))
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <button onClick={() => { setSelected(null); setQuestions([]); }} className="text-sm text-sky-500 hover:underline flex items-center gap-1">
            ← العودة لقائمة الواجبات
          </button>
          <div>
            <h3 className="font-bold text-[var(--ink)]">{selected.title}</h3>
            <p className="text-xs text-[var(--ink-muted)] mt-1">{hwTypeLabel(selected.type)} — التسليمات المعتمدة تفضل ظاهرة</p>
          </div>

          <div className="flex flex-wrap gap-2">
            {(
              [
                { id: "pending", label: "يحتاج مراجعة" },
                { id: "failed", label: "مرفوض" },
                { id: "passed", label: "تمت الموافقة" },
                { id: "all", label: "الكل" },
              ] as const
            ).map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setStatusFilter(t.id)}
                className={`min-h-10 px-3 rounded-xl text-xs font-bold ${
                  statusFilter === t.id ? "bg-[var(--ink)] text-[var(--bg)]" : "bg-[var(--surface-2)] text-[var(--ink-2)]"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {selected.expectedOutput && (
            <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4">
              <p className="text-xs font-bold text-[var(--ink-muted)] mb-1">الناتج المتوقع (المرجع):</p>
              <pre className="text-sm text-emerald-400 font-mono whitespace-pre-wrap">{selected.expectedOutput}</pre>
            </div>
          )}

          {loading ? (
            <div className="text-center py-8 text-[var(--ink-muted)]">جارٍ التحميل...</div>
          ) : visibleSubs.length === 0 ? (
            <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-12 text-center">
              <p className="text-4xl mb-2">✅</p>
              <p className="text-[var(--ink-muted)]">لا توجد تسليمات في الفلتر ده</p>
            </div>
          ) : (
            visibleSubs.map((sub) => {
              const st = statusLabel(sub.status, sub.allowRetake, sub.review?.verdict, sub.contentChanged);
              const open = !!diffOpen[sub.id];
              return (
                <div
                  key={sub.id}
                  className={`bg-[var(--surface)] border rounded-2xl p-5 space-y-3 ${
                    sub.contentChanged ? "border-rose-500 ring-4 ring-rose-500/30" : "border-[var(--border)]"
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-bold text-[var(--ink)]">{sub.student.name}</p>
                      <p className="text-xs text-[var(--ink-muted)]">{sub.student.email}</p>
                    </div>
                    <span className={`text-xs px-2.5 py-1 rounded-full font-bold ${st.cls}`}>{st.text}</span>
                  </div>

                  {selected.type === "exam" && (
                    <>
                      <IntegrityLine sub={sub} />
                      <ExamAnswersBreakdown
                        answersJson={sub.answers}
                        presentationJson={sub.presentation}
                        questions={questions}
                        score={sub.score}
                        totalQ={sub.totalQ}
                      />
                    </>
                  )}

                  {sub.submittedOutput && (
                    <div>
                      <p className="text-xs font-bold text-[var(--ink-muted)] mb-1">ناتج الطالب:</p>
                      <pre className="bg-[var(--bg)] border border-[var(--border)] rounded-xl p-3 text-sm font-mono whitespace-pre-wrap overflow-x-auto">
                        {sub.submittedOutput}
                      </pre>
                    </div>
                  )}
                  {sub.fileUrl && (
                    <div>
                      <p className="text-xs font-bold text-[var(--ink-muted)] mb-1">ملف مرفق:</p>
                      <div className="flex flex-wrap items-center gap-2">
                        <a
                          href={`/api/homework/${selected.id}/file?studentId=${sub.studentId}&fileName=${encodeURIComponent(sub.fileUrl.split("/").pop() || "")}&inline=1`}
                          target="_blank"
                          rel="noreferrer"
                          className="adm-btn is-sm is-primary"
                        >
                          <Eye size={14} aria-hidden /> افتح الملف
                        </a>
                        <a
                          href={`/api/homework/${selected.id}/file?studentId=${sub.studentId}&fileName=${encodeURIComponent(sub.fileUrl.split("/").pop() || "")}`}
                          className="text-sm text-sky-500 font-mono hover:underline truncate max-w-full"
                        >
                          📎 {sub.fileName || "تحميل الملف"}
                        </a>
                      </div>
                    </div>
                  )}

                  {(sub.status === "passed" || sub.contentChanged || selected.expectedOutput) && (
                    <button
                      type="button"
                      onClick={() => setDiffOpen((m) => ({ ...m, [sub.id]: !open }))}
                      className={`w-full min-h-12 rounded-2xl text-sm font-black ${
                        sub.contentChanged
                          ? "bg-rose-600 text-white animate-pulse"
                          : "bg-slate-900 text-white dark:bg-amber-500 dark:text-black"
                      }`}
                    >
                      {open ? "إخفاء المقارنة" : sub.contentChanged ? (sub.review?.verdict === "failed" ? "⚠️ الملف اتغيّر بعد الرفض — دوس هنا" : "⚠️ المحتوى اتغيّر بعد الموافقة — دوس هنا") : "عرض هل المحتوى مختلف؟"}
                    </button>
                  )}

                  {open && (
                    <div
                      className={`rounded-2xl p-4 space-y-3 ${
                        sub.contentChanged ||
                        (selected.expectedOutput &&
                          sub.submittedOutput &&
                          sub.submittedOutput.trim() !== selected.expectedOutput.trim())
                          ? "bg-rose-600 text-white border-4 border-yellow-300 shadow-[0_0_0_6px_rgba(244,63,94,0.35)]"
                          : "bg-emerald-600 text-white"
                      }`}
                    >
                      {sub.contentChanged ? (
                        <>
                          <p className="text-xl font-black leading-8">المحتوى مختلف عن اللي ا توافق عليه</p>
                          {sub.fileName || sub.snapshot?.fileName ? (
                            <div className="text-sm font-bold space-y-2 leading-7">
                              <p>وقت الموافقة: {sub.snapshot?.fileName || "ملف قديم"}</p>
                              <p>دلوقتي: {sub.fileName || "ملف جديد"}</p>
                            </div>
                          ) : null}
                          {sub.submittedOutput || sub.snapshot?.submittedOutput ? (
                            <div className="grid sm:grid-cols-2 gap-2 text-xs font-mono">
                              <pre className="bg-black/25 rounded-xl p-3 whitespace-pre-wrap">قبل: {sub.snapshot?.submittedOutput || "—"}</pre>
                              <pre className="bg-black/25 rounded-xl p-3 whitespace-pre-wrap">دلوقتي: {sub.submittedOutput || "—"}</pre>
                            </div>
                          ) : null}
                        </>
                      ) : selected.expectedOutput && sub.submittedOutput ? (
                        sub.submittedOutput.trim() === selected.expectedOutput.trim() ? (
                          <p className="text-lg font-black">نفس الناتج المتوقع ✓</p>
                        ) : (
                          <>
                            <p className="text-xl font-black leading-8">الناتج مختلف عن المتوقع</p>
                            <div className="grid sm:grid-cols-2 gap-2 text-xs font-mono">
                              <pre className="bg-black/25 rounded-xl p-3 whitespace-pre-wrap">المتوقع: {selected.expectedOutput}</pre>
                              <pre className="bg-black/25 rounded-xl p-3 whitespace-pre-wrap">الطالب: {sub.submittedOutput}</pre>
                            </div>
                          </>
                        )
                      ) : (
                        <p className="text-lg font-black">نفس الملف اللي ا توافق عليه ✓</p>
                      )}
                    </div>
                  )}

                  {isPendingStatus(sub.status) && (
                    <>
                      <div>
                        <label className="text-xs font-bold text-[var(--ink-muted)] block mb-1">ملاحظة للطالب (اختياري):</label>
                        <input
                          type="text"
                          className={input}
                          placeholder="مثال: ارفع الملف بصيغة PDF"
                          value={noteMap[sub.id] || ""}
                          onChange={(e) => setNoteMap((m) => ({ ...m, [sub.id]: e.target.value }))}
                        />
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => void verdict(sub, "passed")}
                          disabled={verdicting === sub.id}
                          className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold transition-colors disabled:opacity-50"
                        >
                          ✅ قبول
                        </button>
                        <button
                          onClick={() => void verdict(sub, "failed")}
                          disabled={verdicting === sub.id}
                          className="flex-1 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white text-sm font-bold transition-colors disabled:opacity-50"
                        >
                          ❌ رفض
                        </button>
                      </div>
                    </>
                  )}

                  {(sub.status === "passed" || sub.status === "failed") && (
                    <button
                      type="button"
                      onClick={() => void toggleRetry(sub, !sub.allowRetake)}
                      disabled={retrying === sub.id}
                      className={`w-full min-h-12 rounded-2xl text-sm font-black transition-colors disabled:opacity-50 ${
                        sub.allowRetake
                          ? "bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200"
                          : "bg-sky-600 text-white hover:bg-sky-500"
                      }`}
                    >
                      {retrying === sub.id
                        ? "جارٍ..."
                        : sub.allowRetake
                          ? "🔒 إلغاء إعادة المحاولة"
                          : "🔓 السماح بإعادة المحاولة"}
                    </button>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

// ─── HomeworkManagerSection ───────────────────────────────────────────────────

interface Course { id: string; title: string }
interface Folder { id: string; name: string; videos?: Array<{ id: string; title: string }>; homeworks?: Array<{ id: string; title: string; type: string }> }

export function HomeworkManagerSection({
  courses,
  folders: initialFolders,
  selectedCourse,
  onSelectCourse,
  notify,
}: {
  courses: Course[];
  folders: Folder[];
  selectedCourse: Course | null;
  onSelectCourse: (c: Course) => void;
  notify: (t: "success" | "error", m: string) => void;
}) {
  const [homeworks, setHomeworks] = useState<any[]>([]);
  const [loadingHw, setLoadingHw] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [courseFolders, setCourseFolders] = useState<Folder[]>(initialFolders || []);
  const [loadingFolders, setLoadingFolders] = useState(false);

  const [form, setForm] = useState({
    title: "",
    description: "",
    type: "exam" as "link" | "exam" | "terminal" | "upload",
    linkUrl: "",
    courseId: selectedCourse?.id || "",
    folderId: "",
    videoId: "",
    dueAt: "",
    timeLimitMinutes: 30,
    enableAutoClose: false,
    closeAt: "",
    isPublished: false,
    // terminal
    expectedOutput: "",
    codeTemplate: "",
    codeLanguage: "python",
    // upload
    allowedFileTypes: "pdf,py,js,zip",
    // exam
    questions: [{ question: "", imageUrl: "", optionA: "", optionB: "", optionC: "", optionD: "", correctAnswer: "A" }],
    // exam anti-cheating
    shuffleQuestions: false,
    shuffleChoices: false,
    revealAnswers: true,
    questionsPerStudent: "",
  });

  const [showGuide, setShowGuide] = useState(false);
  const [listType, setListType] = useState<"all" | "upload" | "exam" | "terminal" | "link">("all");
  const [closeDrafts, setCloseDrafts] = useState<Record<string, { enableAutoClose: boolean; closeAt: string }>>({});
  const [openSchedule, setOpenSchedule] = useState<Record<string, boolean>>({});
  const [integrityFor, setIntegrityFor] = useState<{ hw: any; tab: "settings" | "report" } | null>(null);
  const [editHomework, setEditHomework] = useState<{
    id: string;
    title: string;
    questions: Array<{
      id: string;
      question: string;
      imageUrl?: string | null;
      optionA?: string;
      optionB?: string;
      optionC?: string;
      optionD?: string;
      correctAnswer?: string;
      degree?: number;
    }>;
  } | null>(null);
  const input = "w-full px-3.5 py-2.5 rounded-xl border border-[var(--border)] bg-[var(--bg)] text-[var(--ink)] text-sm focus:outline-none focus:border-sky-400/60 transition-all";
  const label = "block text-xs font-semibold text-[var(--ink-muted)] mb-1.5";
  const btn = "inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-white text-sm font-bold transition-colors disabled:opacity-50";

  // Keep form.courseId updated if selectedCourse changes
  useEffect(() => {
    if (selectedCourse?.id) {
      setForm(f => ({ ...f, courseId: selectedCourse.id }));
    }
  }, [selectedCourse]);

  // Fetch folders for the currently selected courseId in the form
  useEffect(() => {
    if (!form.courseId) {
      setCourseFolders([]);
      return;
    }
    let isMounted = true;
    setLoadingFolders(true);
    fetch(`/api/admin/courses/${form.courseId}/folders`, { credentials: "include" })
      .then(res => res.json())
      .then(data => {
        if (isMounted) setCourseFolders(data.folders || []);
      })
      .catch(() => {
        if (isMounted) setCourseFolders([]);
      })
      .finally(() => {
        if (isMounted) setLoadingFolders(false);
      });
    return () => { isMounted = false; };
  }, [form.courseId]);

  const fetchHomeworks = useCallback(async () => {
    setLoadingHw(true);
    try {
      const res = await fetch("/api/admin/homework", { credentials: "include" });
      const data = await res.json();
      setHomeworks(data.homeworks || []);
    } finally { setLoadingHw(false); }
  }, []);

  useEffect(() => { void fetchHomeworks(); }, [fetchHomeworks]);

  const allVideos = courseFolders.flatMap(f => (f.videos ?? []).map(v => ({ ...v, folderName: f.name })));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        title: form.title,
        description: form.description || undefined,
        type: form.type,
        courseId: form.courseId || selectedCourse?.id || undefined,
        folderId: form.folderId || undefined,
        videoId: form.videoId || undefined,
        dueAt: form.dueAt || undefined,
        timeLimitMinutes: form.timeLimitMinutes,
        enableAutoClose: form.enableAutoClose,
        closeAt: form.closeAt || undefined,
        isPublished: form.isPublished,
      };
      if (form.type === "link") payload.linkUrl = form.linkUrl;
      if (form.type === "terminal") {
        payload.expectedOutput = form.expectedOutput;
        payload.codeTemplate = form.codeTemplate || undefined;
        payload.codeLanguage = form.codeLanguage;
      }
      if (form.type === "upload") payload.allowedFileTypes = form.allowedFileTypes || undefined;
      if (form.type === "exam") {
        payload.questions = form.questions;
        payload.shuffleQuestions = form.shuffleQuestions;
        payload.shuffleChoices = form.shuffleChoices;
        payload.revealAnswers = form.revealAnswers;
        payload.questionsPerStudent = form.questionsPerStudent ? Number(form.questionsPerStudent) : null;
      }

      const res = await fetch("/api/admin/homework", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (res.ok) {
        notify("success", "تم إنشاء الواجب بنجاح ✅");
        setShowForm(false);
        void fetchHomeworks();
        setForm(f => ({ ...f, title: "", description: "", linkUrl: "", folderId: "", videoId: "", expectedOutput: "", codeTemplate: "", questions: [{ question: "", imageUrl: "", optionA: "", optionB: "", optionC: "", optionD: "", correctAnswer: "A" }] }));
      } else {
        notify("error", data.error || "تعذر إنشاء الواجب");
      }
    } finally { setSaving(false); }
  };

  const deleteHw = async (hw: any) => {
    const subs = hw._count?.submissions ?? 0;
    const ok = await admConfirm({
      title: `حذف «${hw.title}»؟`,
      text: subs
        ? `هيتمسح الواجب و${subs} تسليم ودرجات الطلاب عليه نهائياً. مفيش رجوع.`
        : "هيتمسح الواجب نهائياً. مفيش رجوع.",
      confirmLabel: "حذف نهائي",
      danger: true,
    });
    if (!ok) return;
    const res = await fetch("/api/admin/homework", {
      method: "DELETE",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ homeworkId: hw.id }),
    });
    if (res.ok) { notify("success", "تم حذف الواجب"); void fetchHomeworks(); }
    else notify("error", "تعذر حذف الواجب");
  };

  const togglePublish = async (hw: any) => {
    const res = await fetch("/api/admin/homework", {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ homeworkId: hw.id, isPublished: !hw.isPublished }),
    });
    if (res.ok) { notify("success", hw.isPublished ? "تم إخفاء الواجب" : "تم نشر الواجب ✅"); void fetchHomeworks(); }
    else notify("error", "تعذر تحديث حالة الواجب");
  };

  const saveClose = async (hw: any) => {
    const draft = closeDrafts[hw.id] ?? {
      enableAutoClose: !!hw.enableAutoClose,
      closeAt: toDatetimeLocal(hw.closeAt),
    };
    const res = await fetch("/api/admin/homework", {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        homeworkId: hw.id,
        enableAutoClose: draft.enableAutoClose,
        closeAt: draft.enableAutoClose ? draft.closeAt : null,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      notify("success", "تم حفظ وقت الإغلاق");
      void fetchHomeworks();
    } else {
      notify("error", data.error || "تعذر حفظ وقت الإغلاق");
    }
  };

  const downloadSampleHwJson = () => {
    const sample = {
      title: "واجب المراجعة الأسبوعية",
      timeLimitMinutes: 30,
      questions: [
        {
          question: "ما الفرق بين السرعة المتجهة والسرعة القياسية؟",
          optionA: "السرعة المتجهة تتضمن الاتجاه والقياسية لا تتضمنه",
          optionB: "السرعة القياسية أسرع دائماً",
          optionC: "لا يوجد فرق بينهما",
          optionD: "السرعة المتجهة تُقاس بالفولت",
          correctAnswer: "A"
        },
        {
          question: "احسب القوة الناتجة عن كتلة 5 كجم بتسارع 2 م/ث²",
          optionA: "10 نيوتن",
          optionB: "2.5 نيوتن",
          optionC: "7 نيوتن",
          optionD: "3 نيوتن",
          correctAnswer: "A"
        }
      ]
    };
    const blob = new Blob([JSON.stringify(sample, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "homework_sample.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleHwJsonImport = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target?.result as string;
        const parsed = JSON.parse(text);
        let importedTitle = "";
        let importedTime = 30;
        let rawQuestions: any[] = [];

        if (Array.isArray(parsed)) {
          rawQuestions = parsed;
        } else if (parsed && typeof parsed === "object") {
          if (typeof parsed.title === "string") importedTitle = parsed.title;
          if (typeof parsed.timeLimitMinutes === "number") importedTime = parsed.timeLimitMinutes;
          if (Array.isArray(parsed.questions)) rawQuestions = parsed.questions;
        }

        if (!rawQuestions || rawQuestions.length === 0) {
          notify("error", "ملف الـ JSON لا يحتوي على أي أسئلة صحيحة");
          return;
        }

        const validQuestions = rawQuestions.map((q, idx) => {
          if (!q || typeof q !== "object") throw new Error(`السؤال ${idx + 1} بتنسيق غير صحيح`);
          return {
            question: String(q.question || q.title || "").trim(),
            imageUrl: typeof q.imageUrl === "string" ? q.imageUrl.trim() : "",
            optionA: String(q.optionA || q.a || "").trim(),
            optionB: String(q.optionB || q.b || "").trim(),
            optionC: String(q.optionC || q.c || "").trim(),
            optionD: String(q.optionD || q.d || "").trim(),
            correctAnswer: (["A", "B", "C", "D"].includes(String(q.correctAnswer).toUpperCase()) ? String(q.correctAnswer).toUpperCase() : "A"),
          };
        });

        setForm((prev) => ({
          ...prev,
          title: importedTitle || prev.title,
          timeLimitMinutes: importedTime || prev.timeLimitMinutes,
          questions: validQuestions,
        }));
        notify("success", `تم استيراد ${validQuestions.length} سؤال من ملف الـ JSON بنجاح ✅`);
      } catch (err: any) {
        notify("error", err?.message || "فشل قراءة ملف الـ JSON، تأكد من صحة التنسيق");
      }
    };
    reader.readAsText(file);
  };

  const TYPE_LABELS: Record<string, string> = {
    link: "🔗 رابط خارجي",
    exam: "📝 اختبار MCQ",
    terminal: "💻 كود / Terminal",
    upload: "📎 رفع ملف",
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h2 className="text-lg font-black text-[var(--ink)]">📚 إدارة الواجبات</h2>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              setForm((f) => ({ ...f, type: "upload" }));
              setShowForm(true);
            }}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-white text-sm font-bold"
          >
            + واجب رفع ملف
          </button>
          <button onClick={() => setShowForm((s) => !s)} className={btn}>
            {showForm ? "إلغاء" : "+ واجب جديد"}
          </button>
        </div>
      </div>

      {/* Course context hint */}
      {selectedCourse && (
        <div className="text-xs text-[var(--ink-muted)] bg-sky-500/8 border border-sky-500/20 rounded-xl px-4 py-2.5">
          الكورس المختار حالياً: <strong className="text-sky-500">{selectedCourse.title}</strong>
        </div>
      )}

      {/* Create Form */}
      {showForm && (
        <form onSubmit={submit} className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-5 space-y-4">
          <h3 className="font-bold text-[var(--ink)]">واجب جديد</h3>

          {/* Type selector */}
          <div>
            <label className={label}>نوع الواجب</label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {(["exam","terminal","upload","link"] as const).map(t => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setForm(f => ({ ...f, type: t }))}
                  className={`py-2 px-3 rounded-xl text-xs font-bold border-2 transition-colors text-center ${form.type === t ? "border-sky-500 bg-sky-500/10 text-sky-500" : "border-[var(--border)] text-[var(--ink-muted)] hover:border-sky-400/40"}`}
                >
                  {TYPE_LABELS[t]}
                </button>
              ))}
            </div>
          </div>

          {/* Course, Folder & Lesson Selectors */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className={label}>الكورس التابع له الواجب</label>
              <select
                value={form.courseId}
                onChange={e => setForm(f => ({ ...f, courseId: e.target.value, folderId: "", videoId: "" }))}
                className={input}
              >
                <option value="">— اختر الكورس —</option>
                {courses.map(c => (
                  <option key={c.id} value={c.id}>{c.title}</option>
                ))}
              </select>
            </div>

            <div>
              <label className={label}>المحاضرة / الوحدة (Folder)</label>
              <select
                value={form.folderId}
                onChange={e => setForm(f => ({ ...f, folderId: e.target.value, videoId: "" }))}
                className={input}
                disabled={!form.courseId || loadingFolders}
              >
                {!form.courseId ? (
                  <option value="">اختر الكورس أولاً</option>
                ) : loadingFolders ? (
                  <option value="">جارٍ تحميل المحاضرات...</option>
                ) : courseFolders.length === 0 ? (
                  <option value="">لا توجد محاضرات في هذا الكورس بعد</option>
                ) : (
                  <>
                    <option value="">— اختر المحاضرة —</option>
                    {courseFolders.map(f => (
                      <option key={f.id} value={f.id}>
                        📁 {f.name}
                      </option>
                    ))}
                  </>
                )}
              </select>
            </div>

            <div>
              <label className={label}>ربط بدرس محدد (اختياري)</label>
              <select
                value={form.videoId}
                onChange={e => {
                  const selectedVidId = e.target.value;
                  const matchingVideo = allVideos.find(v => v.id === selectedVidId);
                  const matchingFolder = matchingVideo ? courseFolders.find(f => f.videos?.some(v => v.id === selectedVidId)) : null;
                  setForm(f => ({
                    ...f,
                    videoId: selectedVidId,
                    folderId: f.folderId || matchingFolder?.id || f.folderId,
                  }));
                }}
                className={input}
                disabled={!form.courseId || loadingFolders}
              >
                {!form.courseId ? (
                  <option value="">اختر الكورس أولاً</option>
                ) : loadingFolders ? (
                  <option value="">جارٍ تحميل الدروس...</option>
                ) : allVideos.length === 0 ? (
                  <option value="">لا توجد دروس في هذا الكورس بعد</option>
                ) : (
                  <>
                    <option value="">— بدون تحديد درس معين —</option>
                    {(form.folderId
                      ? (courseFolders.find(f => f.id === form.folderId)?.videos ?? [])
                      : allVideos
                    ).map((v: any) => (
                      <option key={v.id} value={v.id}>
                        {v.folderName ? `📁 ${v.folderName} ← ` : ""}🎥 {v.title}
                      </option>
                    ))}
                  </>
                )}
              </select>
            </div>
          </div>

          <div>
            <label className={label}>عنوان الواجب *</label>
            <input required value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} className={input} placeholder="مثال: واجب الدرس الأول" />
          </div>

          <div>
            <label className={label}>وصف (اختياري)</label>
            <textarea rows={2} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} className={`${input} resize-none`} />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={label}>تاريخ التسليم</label>
              <input type="datetime-local" value={form.dueAt} onChange={e => setForm(f => ({ ...f, dueAt: e.target.value }))} className={input} dir="ltr" />
            </div>
            <div>
              <label className={label}>مدة الاختبار (دقيقة)</label>
              <input type="number" min={1} max={300} value={form.timeLimitMinutes} onChange={e => setForm(f => ({ ...f, timeLimitMinutes: Number(e.target.value) || 30 }))} className={input} dir="ltr" />
            </div>
          </div>

          <div className="rounded-xl border border-rose-400/30 bg-rose-500/5 p-3 space-y-2">
            <label className="flex items-center gap-2 text-xs font-bold text-[var(--ink)]">
              <input
                type="checkbox"
                checked={form.enableAutoClose}
                onChange={e => setForm(f => ({ ...f, enableAutoClose: e.target.checked }))}
                className="w-4 h-4 rounded"
              />
              إغلاق تلقائي بعد الوقت المحدد
            </label>
            <input
              type="datetime-local"
              value={form.closeAt}
              disabled={!form.enableAutoClose}
              onChange={e => setForm(f => ({ ...f, closeAt: e.target.value }))}
              className={input}
              dir="ltr"
            />
            <p className="text-[10px] text-[var(--ink-muted)]">بعد هذا الوقت يُغلق الواجب/الامتحان. الدعم يمكنه إعادة الفتح.</p>
          </div>

          {/* Type-specific fields */}
          {form.type === "link" && (
            <div>
              <label className={label}>الرابط الخارجي *</label>
              <input required type="url" value={form.linkUrl} onChange={e => setForm(f => ({ ...f, linkUrl: e.target.value }))} className={input} dir="ltr" placeholder="https://…" />
            </div>
          )}

          {form.type === "terminal" && (
            <>
              <div>
                <label className={label}>لغة البرمجة</label>
                <select value={form.codeLanguage} onChange={e => setForm(f => ({ ...f, codeLanguage: e.target.value }))} className={input}>
                  <option value="python">Python</option>
                  <option value="javascript">JavaScript</option>
                  <option value="cpp">C++</option>
                  <option value="java">Java</option>
                  <option value="other">أخرى</option>
                </select>
              </div>
              <div>
                <label className={label}>الناتج المتوقع (expected output) *</label>
                <textarea required rows={4} value={form.expectedOutput} onChange={e => setForm(f => ({ ...f, expectedOutput: e.target.value }))} className={`${input} font-mono resize-y`} dir="ltr" placeholder="Hello World&#10;Sum = 15" />
                <p className="text-[10px] text-[var(--ink-muted)] mt-1">الفراغات وتغيير السطر لا تؤثر في التصحيح التلقائي</p>
              </div>
              <div>
                <label className={label}>كود بدئي للطالب (اختياري)</label>
                <textarea rows={4} value={form.codeTemplate} onChange={e => setForm(f => ({ ...f, codeTemplate: e.target.value }))} className={`${input} font-mono resize-y`} dir="ltr" placeholder="# أكمل الكود هنا&#10;name = input()" />
              </div>
            </>
          )}

          {form.type === "upload" && (
            <div>
              <label className={label}>أنواع الملفات المسموحة</label>
              <input value={form.allowedFileTypes} onChange={e => setForm(f => ({ ...f, allowedFileTypes: e.target.value }))} className={input} dir="ltr" placeholder="pdf,py,js,zip" />
              <p className="text-[10px] text-[var(--ink-muted)] mt-1">افصل بفاصلة، اتركه فارغاً للسماح بأي نوع</p>
            </div>
          )}

          {form.type === "exam" && (
            <div className="space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <label className={label}>الأسئلة</label>
                <div className="flex items-center gap-2 flex-wrap">
                  <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-sky-500/10 hover:bg-sky-500/20 text-sky-500 text-xs font-bold transition-all cursor-pointer">
                    <span>📥 استيراد أسئلة من JSON</span>
                    <input
                      type="file"
                      accept=".json,application/json"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleHwJsonImport(file);
                        e.target.value = "";
                      }}
                    />
                  </label>
                  <button
                    type="button"
                    onClick={downloadSampleHwJson}
                    className="px-3 py-1.5 rounded-xl border border-[var(--border)] hover:bg-[var(--bg)] text-[var(--ink-muted)] hover:text-[var(--ink)] text-xs font-bold transition-all"
                  >
                    📄 تحميل قالب JSON
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowGuide(true)}
                    className="px-3 py-1.5 rounded-xl bg-purple-500/10 hover:bg-purple-500/20 text-purple-500 text-xs font-bold transition-all"
                  >
                    ❓ دليل صياغة JSON
                  </button>
                </div>
              </div>
              {form.questions.map((q, qi) => (
                <div key={qi} className="border border-[var(--border)] rounded-xl p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-[var(--ink-muted)]">سؤال {qi + 1}</span>
                    {form.questions.length > 1 && (
                      <button type="button" onClick={() => setForm(f => ({ ...f, questions: f.questions.filter((_, i) => i !== qi) }))} className="text-xs text-red-500 hover:underline">حذف</button>
                    )}
                  </div>
                  <input required value={q.question} onChange={e => { const qs = [...form.questions]; qs[qi] = { ...qs[qi], question: e.target.value }; setForm(f => ({ ...f, questions: qs })); }} className={input} placeholder="نص السؤال *" />
                  <input value={q.imageUrl} onChange={e => { const qs = [...form.questions]; qs[qi] = { ...qs[qi], imageUrl: e.target.value }; setForm(f => ({ ...f, questions: qs })); }} className={input} placeholder="رابط صورة (اختياري)" dir="ltr" />
                  <div className="grid grid-cols-2 gap-2">
                    {(["A","B","C","D"] as const).map(opt => (
                      <div key={opt} className="flex gap-1.5 items-center">
                        <button
                          type="button"
                          onClick={() => { const qs = [...form.questions]; qs[qi] = { ...qs[qi], correctAnswer: opt }; setForm(f => ({ ...f, questions: qs })); }}
                          className={`w-6 h-6 rounded-full text-xs font-black shrink-0 transition-colors ${q.correctAnswer === opt ? "bg-emerald-500 text-white" : "bg-[var(--border)] text-[var(--ink-muted)] hover:bg-emerald-500/30"}`}
                        >{opt}</button>
                        <input required value={q[`option${opt}` as keyof typeof q] as string} onChange={e => { const qs = [...form.questions]; (qs[qi] as any)[`option${opt}`] = e.target.value; setForm(f => ({ ...f, questions: qs })); }} className={`${input} flex-1`} placeholder={`الخيار ${opt}`} />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
              <button type="button" onClick={() => setForm(f => ({ ...f, questions: [...f.questions, { question: "", imageUrl: "", optionA: "", optionB: "", optionC: "", optionD: "", correctAnswer: "A" }] }))} className="text-sm text-sky-500 hover:underline">+ إضافة سؤال</button>
            </div>
          )}

          {form.type === "exam" && (
            <fieldset className="adm-well p-4 space-y-3">
              <legend className="px-1 text-sm font-black text-[var(--ink)] flex items-center gap-1.5">
                <ShieldCheck size={15} aria-hidden /> منع الغش
              </legend>
              {(
                [
                  ["revealAnswers", "إظهار الإجابات الصحيحة للطالب بعد التسليم"],
                ] as const
              ).map(([key, text]) => (
                <div key={key} className="flex items-center justify-between gap-3">
                  <span className="text-sm text-[var(--ink)]">{text}</span>
                  <Switch checked={form[key]} onChange={(v) => setForm((f) => ({ ...f, [key]: v }))} label={text} />
                </div>
              ))}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span className="text-sm text-[var(--ink)]">
                  بنك أسئلة: كل طالب ياخد
                  <span className="text-[var(--ink-muted)]"> (فاضي = كل الأسئلة)</span>
                </span>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={1}
                    max={form.questions.length}
                    value={form.questionsPerStudent}
                    onChange={(e) => setForm((f) => ({ ...f, questionsPerStudent: e.target.value }))}
                    className="adm-input is-sm"
                    style={{ width: 90 }}
                    dir="ltr"
                    aria-label="عدد الأسئلة لكل طالب"
                    placeholder="الكل"
                  />
                  <span className="text-xs text-[var(--ink-muted)]">من {form.questions.length} سؤال</span>
                </div>
              </div>
            </fieldset>
          )}

          <div className="flex items-center gap-3 pt-2">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input type="checkbox" checked={form.isPublished} onChange={e => setForm(f => ({ ...f, isPublished: e.target.checked }))} className="w-4 h-4 rounded" />
              <span className="text-sm font-semibold text-[var(--ink)]">نشر فور الإنشاء</span>
            </label>
          </div>

          <button type="submit" disabled={saving} className={`${btn} w-full`}>
            {saving ? "جارٍ الحفظ..." : "إنشاء الواجب"}
          </button>
        </form>
      )}

      {/* Homeworks List */}
      <section className="space-y-3" aria-label="الواجبات الحالية">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-bold text-[var(--ink-muted)] ml-auto">
            الواجبات الحالية ({listType === "all" ? homeworks.length : homeworks.filter((h) => h.type === listType).length})
          </h3>
          {(
            [
              { id: "all", label: "الكل" },
              { id: "upload", label: "رفع ملف" },
              { id: "exam", label: "اختبار" },
              { id: "terminal", label: "كود" },
              { id: "link", label: "رابط" },
            ] as const
          ).map((t) => (
            <Chip
              key={t.id}
              pressed={listType === t.id}
              onClick={() => setListType(t.id)}
              count={t.id === "all" ? homeworks.length : homeworks.filter((h) => h.type === t.id).length}
            >
              {t.label}
            </Chip>
          ))}
        </div>

        {loadingHw && homeworks.length === 0 ? (
          <SkeletonRows rows={4} h={76} />
        ) : homeworks.length === 0 ? (
          <EmptyState icon={<FileText size={22} />} title="لا توجد واجبات بعد" text="أنشئ أول واجب من الزرار اللي فوق." />
        ) : (
          homeworks.filter((hw) => listType === "all" || hw.type === listType).map((hw) => {
            const scheduleOpen = openSchedule[hw.id] ?? false;
            const isExam = hw.type === "exam";
            const qCount = hw._count?.questions ?? hw.questions?.length ?? 0;
            return (
              <article
                key={hw.id}
                className="adm-panel"
                style={hw.isPublished ? undefined : { borderStyle: "dashed" }}
              >
                <div className="adm-row" style={{ alignItems: "flex-start" }}>
                  <span className="adm-avatar" aria-hidden>
                    {hw.type === "upload" ? <Upload size={17} /> : hw.type === "terminal" ? <Terminal size={17} /> : hw.type === "link" ? <Link2 size={17} /> : <ListChecks size={17} />}
                  </span>
                  <div className="min-w-0 flex-1" style={{ flexBasis: 240 }}>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <p className="font-bold text-[var(--ink)] truncate">{hw.title}</p>
                      <Badge tone="info">{TYPE_LABELS[hw.type] ?? hw.type}</Badge>
                      {hw.isPublished ? <Badge tone="ok" dot>منشور</Badge> : <Badge tone="neutral" dot>مخفي عن الطلاب</Badge>}
                      {(hw.reviewQueueCount ?? 0) > 0 && <Badge tone="warn" live>{hw.reviewQueueCount} مستني مراجعة</Badge>}
                      {(hw.focusFlagCount ?? 0) > 0 && <Badge tone="bad" title="طلاب خرجوا من صفحة الواجب 3 مرات أو أكتر">{hw.focusFlagCount} خروج متكرر</Badge>}
                    </div>
                    <p className="adm-muted text-[12.5px] mt-1">
                      {hw._count?.submissions ?? 0} تسليم
                      {hw.avgScore != null && <> · متوسط الدرجة {Math.round(hw.avgScore)}٪</>}
                      {isExam && <> · {qCount} سؤال</>}
                      {" · "}
                      {hw.video?.title ?? "الكورس كله"}
                    </p>
                    {isExam && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {hw.questionsPerStudent != null && <Badge tone="gold">بنك: {hw.questionsPerStudent} من {qCount}</Badge>}
                        {hw.revealAnswers === false && <Badge tone="neutral">الحل مخفي بعد التسليم</Badge>}
                      </div>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5 ms-auto">
                    {isExam && (
                      <>
                        <Button size="sm" icon={<ShieldCheck size={14} />} onClick={() => setIntegrityFor({ hw, tab: "settings" })}>
                          منع الغش
                        </Button>
                        <Button size="sm" icon={<BarChart3 size={14} />} onClick={() => setIntegrityFor({ hw, tab: "report" })}>
                          تقرير
                        </Button>
                        <Button
                          size="sm"
                          icon={<Pencil size={14} />}
                          onClick={() => setEditHomework({ id: hw.id, title: hw.title || "واجب", questions: hw.questions || [] })}
                        >
                          الأسئلة
                        </Button>
                      </>
                    )}
                    <Button
                      size="sm"
                      variant={hw.isPublished ? "secondary" : "primary"}
                      icon={hw.isPublished ? <EyeOff size={14} /> : <Eye size={14} />}
                      onClick={() => togglePublish(hw)}
                    >
                      {hw.isPublished ? "إخفاء" : "نشر"}
                    </Button>
                    <IconButton
                      size="sm"
                      label={scheduleOpen ? "إخفاء موعد الإغلاق" : "موعد الإغلاق التلقائي"}
                      aria-expanded={scheduleOpen}
                      onClick={() => setOpenSchedule((m) => ({ ...m, [hw.id]: !scheduleOpen }))}
                    >
                      <CalendarClock size={15} />
                    </IconButton>
                    <IconButton size="sm" variant="danger" label="حذف الواجب" onClick={() => void deleteHw(hw)}>
                      <Trash2 size={15} />
                    </IconButton>
                  </div>
                </div>

                {hw.enableAutoClose && hw.closeAt && !scheduleOpen && (
                  <div className="adm-panel-foot adm-muted text-[12.5px]">
                    بيتقفل تلقائي: {new Date(hw.closeAt).toLocaleString("ar-EG")}
                  </div>
                )}

                {scheduleOpen && (
                  <div className="adm-panel-foot flex flex-wrap items-end gap-3">
                    <label className="adm-check">
                      <input
                        type="checkbox"
                        checked={(closeDrafts[hw.id]?.enableAutoClose ?? !!hw.enableAutoClose) === true}
                        onChange={(e) =>
                          setCloseDrafts((prev) => ({
                            ...prev,
                            [hw.id]: {
                              enableAutoClose: e.target.checked,
                              closeAt: prev[hw.id]?.closeAt ?? toDatetimeLocal(hw.closeAt),
                            },
                          }))
                        }
                      />
                      إغلاق تلقائي بعد الوقت المحدد
                    </label>
                    <input
                      type="datetime-local"
                      value={closeDrafts[hw.id]?.closeAt ?? toDatetimeLocal(hw.closeAt)}
                      disabled={!(closeDrafts[hw.id]?.enableAutoClose ?? hw.enableAutoClose)}
                      onChange={(e) =>
                        setCloseDrafts((prev) => ({
                          ...prev,
                          [hw.id]: {
                            enableAutoClose: prev[hw.id]?.enableAutoClose ?? !!hw.enableAutoClose,
                            closeAt: e.target.value,
                          },
                        }))
                      }
                      className="adm-input is-sm"
                      style={{ maxWidth: 240 }}
                      dir="ltr"
                      aria-label="وقت الإغلاق"
                    />
                    <Button size="sm" variant="primary" onClick={() => saveClose(hw)}>
                      حفظ وقت الإغلاق
                    </Button>
                  </div>
                )}
              </article>
            );
          })
        )}
      </section>
      {integrityFor && (
        <HomeworkIntegrityModal
          homework={{
            id: integrityFor.hw.id,
            title: integrityFor.hw.title,
            questionCount: integrityFor.hw._count?.questions ?? integrityFor.hw.questions?.length ?? 0,
            shuffleQuestions: false,
            shuffleChoices: false,
            questionsPerStudent: integrityFor.hw.questionsPerStudent ?? null,
            revealAnswers: integrityFor.hw.revealAnswers !== false,
          }}
          initialTab={integrityFor.tab}
          onClose={() => setIntegrityFor(null)}
          onSaved={(next) =>
            setHomeworks((list) => list.map((h) => (h.id === integrityFor.hw.id ? { ...h, ...next } : h)))
          }
        />
      )}
      {showGuide && <HwJsonGuideModal onClose={() => setShowGuide(false)} notify={notify} />}

      {editHomework && (
        <EditHomeworkModal
          isOpen={Boolean(editHomework)}
          homeworkId={editHomework.id}
          homeworkTitle={editHomework.title}
          questions={editHomework.questions}
          onClose={() => setEditHomework(null)}
          onSuccess={async () => {
            await fetchHomeworks();
          }}
        />
      )}
    </div>
  );
}

function HwJsonGuideModal({ onClose, notify }: { onClose: () => void; notify: (type: "success" | "error", text: string) => void }) {
  const fullSample = {
    title: "واجب الرياضيات الشامل",
    timeLimitMinutes: 30,
    questions: [
      {
        question: "ما حاصل ضرب 7 × 8؟",
        optionA: "56",
        optionB: "48",
        optionC: "64",
        optionD: "54",
        correctAnswer: "A"
      }
    ]
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl max-w-2xl w-full p-6 space-y-5 text-right max-h-[90vh] overflow-y-auto shadow-2xl">
        <div className="flex items-center justify-between border-b border-[var(--border)] pb-3">
          <h3 className="text-lg font-bold text-[var(--ink)] flex items-center gap-2">
            <span>💡 دليل صياغة أسئلة الواجب بصيغة JSON</span>
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-200 text-lg font-bold p-1">✕</button>
        </div>

        <div className="space-y-4 text-xs leading-relaxed text-[var(--ink-muted)]">
          <p className="text-sm font-semibold text-[var(--ink)]">
            انسخ الكود التالي وحفظه في ملف باسم <code className="bg-sky-500/10 text-sky-400 px-1.5 py-0.5 rounded font-mono">homework.json</code> لاستيراده فوراً:
          </p>

          <div className="bg-[var(--bg)] border border-[var(--border)] rounded-xl p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-bold text-sky-400">📋 نموذج كود JSON جاهز:</span>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(JSON.stringify(fullSample, null, 2));
                  notify("success", "تم نسخ كود الـ JSON إلى الحافظة 📋");
                }}
                className="px-2.5 py-1 rounded bg-sky-500/20 text-sky-400 hover:bg-sky-500/30 text-[11px] font-bold"
              >
                📋 نسخ الكود
              </button>
            </div>
            <pre className="font-mono text-[11px] text-emerald-400 bg-black/40 p-3 rounded-lg overflow-x-auto text-left" dir="ltr">
{JSON.stringify(fullSample, null, 2)}
            </pre>
          </div>

          <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 text-amber-500 space-y-1">
            <p className="font-bold">⚠️ تنبيهات:</p>
            <ul className="list-disc list-inside space-y-1 text-[11px]">
              <li>الإجابة الصحيحة <code className="font-mono font-bold">correctAnswer</code> تكون بالحروف الكبيرة: <code className="font-mono">"A"</code>, <code className="font-mono">"B"</code>, <code className="font-mono">"C"</code>, أو <code className="font-mono">"D"</code>.</li>
              <li>يمكنك أيضاً استيراد مصفوفة أسئلة مباشرة <code className="font-mono">[ &#123; ... &#125; ]</code>.</li>
            </ul>
          </div>
        </div>

        <div className="pt-2 text-left">
          <button type="button" onClick={onClose} className="px-5 py-2 rounded-xl bg-sky-500 hover:bg-sky-400 text-white font-bold text-xs">
            إغلاق
          </button>
        </div>
      </div>
    </div>
  );
}
