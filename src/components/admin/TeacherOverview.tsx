"use client";

import { useCallback, useEffect, useState } from "react";
import { ViewsAreaChart, HBarList, DistBars } from "./Charts";
import {
  IconUsers, IconEye, IconVideo, IconClipboard, IconPlus, IconBook,
  IconTicket, IconChat, IconShield, IconFile, IconChart,
} from "./AdminIcons";

// ─── Types (mirror /api/admin/analytics) ──────────────────────────────────────
type Kpi = { value: number; deltaPct: number; newThisPeriod?: number };
type Issue = { kind: string; severity: "high" | "med" | "low"; title: string; detail: string; at: string | null };
type Analytics = {
  teacherName: string;
  period: string;
  empty: boolean;
  kpis: { students: Kpi; views: Kpi; completions: Kpi; avgQuizScore: Kpi } | null;
  series: { date: string; views: number; enrollments: number }[];
  topVideos: { id: string; title: string; course: string; views: number }[];
  lowVideos: { id: string; title: string; course: string; views: number }[];
  courseBreakdown: { id: string; title: string; students: number; views: number }[];
  quizBuckets: { label: string; count: number }[];
  issues: Issue[];
  lastAuditAt?: string;
  nextAuditAt?: string;
  totals?: { courses: number; videos: number };
};

const PERIODS: { id: string; label: string }[] = [
  { id: "7d", label: "7 أيام" },
  { id: "30d", label: "30 يوم" },
  { id: "90d", label: "90 يوم" },
  { id: "all", label: "الكل" },
];

const card = "bg-[var(--surface)] rounded-2xl border border-[var(--border)]";
const cardPad = `${card} p-5`;

function timeAgo(iso: string | null) {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const h = Math.floor(diff / 3600000);
  if (h < 1) return "منذ قليل";
  if (h < 24) return `منذ ${h} ساعة`;
  const d = Math.floor(h / 24);
  return `منذ ${d} يوم`;
}

function Delta({ pct, suffix }: { pct: number; suffix?: string }) {
  const up = pct > 0, down = pct < 0;
  const cls = up ? "text-emerald-500 bg-emerald-500/10" : down ? "text-rose-500 bg-rose-500/10" : "text-[var(--ink-muted)] bg-[var(--border)]";
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] font-bold px-1.5 py-0.5 rounded-md ${cls}`} dir="ltr">
      <span>{up ? "▲" : down ? "▼" : "—"}</span>
      <span>{Math.abs(pct)}%{suffix ? ` ${suffix}` : ""}</span>
    </span>
  );
}

const ISSUE_ICON: Record<string, (p: { className?: string }) => React.ReactElement> = {
  ticket: IconTicket, feedback: IconChat, error: IconShield, health: IconFile,
};
const SEV_DOT: Record<string, string> = { high: "bg-rose-500", med: "bg-amber-500", low: "bg-slate-400" };

export function TeacherOverview({
  courses, onCreateCourse, loadingCourses, onGoToMyPage,
}: {
  courses: { id: string; title: string }[];
  onCreateCourse?: () => void;
  loadingCourses: boolean;
  onGoToMyPage?: () => void;
}) {
  const [period, setPeriod] = useState("30d");
  const [courseId, setCourseId] = useState("");
  const [data, setData] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [recheckingAudit, setRecheckingAudit] = useState(false);

  const load = useCallback(async (recheckAudit = false) => {
    if (recheckAudit) setRecheckingAudit(true);
    try {
      const qs = new URLSearchParams({ period });
      if (courseId) qs.set("courseId", courseId);
      if (recheckAudit) qs.set("recheckAudit", "true");
      const res = await fetch(`/api/admin/analytics?${qs}`, { credentials: "include" });
      if (res.ok) setData(await res.json());
    } catch { /* keep last data */ }
    finally {
      setLoading(false);
      setRecheckingAudit(false);
    }
  }, [period, courseId]);

  useEffect(() => {
    let ignore = false;
    const qs = new URLSearchParams({ period });
    if (courseId) qs.set("courseId", courseId);
    fetch(`/api/admin/analytics?${qs}`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((res) => {
        if (!ignore && res) setData(res);
      })
      .catch(() => {})
      .finally(() => {
        if (!ignore) setLoading(false);
      });
    return () => {
      ignore = true;
    };
  }, [period, courseId]);

  const firstName = data?.teacherName?.replace(/^(مستر|مس|د\.|أ\.|أستاذة?|دكتور)\s*/u, "").split(" ")[0] || data?.teacherName;

  // ── Empty (no courses at all) ──
  if (!loading && data?.empty) {
    return (
      <div className={`${cardPad} py-16 text-center`}>
        <div className="mx-auto mb-4 w-14 h-14 rounded-2xl border border-[var(--border)] bg-[var(--bg)] text-[var(--ink-muted)] flex items-center justify-center">
          <IconBook className="w-7 h-7" />
        </div>
        <p className="font-bold text-[var(--ink)] text-lg">أهلاً بك في Code-UP{firstName ? `، ${firstName}` : ""} 👋</p>
        <p className="text-sm text-[var(--ink-muted)] mt-1.5 max-w-sm mx-auto leading-6">ابدأ بإنشاء كورسك الأول، وستظهر هنا كل إحصائياتك ومخططاتك مباشرة.</p>
        <div className="flex items-center justify-center gap-3 mt-5">
          {onCreateCourse && (
            <button onClick={onCreateCourse} className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-white text-sm font-bold transition-colors">
              <IconPlus className="w-4 h-4" /> إنشاء كورس
            </button>
          )}
          {onGoToMyPage && (
            <button onClick={onGoToMyPage} className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl border border-[var(--border)] text-[var(--ink)] text-sm font-bold transition-colors hover:bg-[var(--surface-2)]">
              إضافة صورة شخصية 📸
            </button>
          )}
        </div>
      </div>
    );
  }

  const kpiDefs = data?.kpis ? [
    { key: "students", label: "إجمالي المتعلمين", Icon: IconUsers, kpi: data.kpis.students, extra: data.kpis.students.newThisPeriod != null ? `+${data.kpis.students.newThisPeriod} هذه الفترة` : undefined },
    { key: "views", label: "المشاهدات", Icon: IconEye, kpi: data.kpis.views },
    { key: "completions", label: "محاضرات مكتملة", Icon: IconVideo, kpi: data.kpis.completions },
    { key: "quiz", label: "متوسط درجات الاختبارات", Icon: IconClipboard, kpi: data.kpis.avgQuizScore, suffix: "٪" },
  ] : [];

  return (
    <div className="space-y-5">
      {/* ── Welcome + filters ── */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div className="min-w-0 flex items-center gap-3">
          {onGoToMyPage && (
            <button
              onClick={onGoToMyPage}
              className="relative group shrink-0 w-12 h-12 rounded-full bg-sky-500/10 border border-sky-500/30 overflow-hidden flex items-center justify-center transition-transform hover:scale-105"
              title="تعديل الصورة الشخصية"
            >
              <span className="text-sm font-black text-sky-500">{(firstName || "م")[0]}</span>
              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white text-xs transition-opacity">📷</div>
            </button>
          )}
          <div>
            <h2 className="text-xl sm:text-2xl font-black text-[var(--ink)] truncate">
              أهلاً، {firstName || "أستاذنا"} <span className="inline-block">👋</span>
            </h2>
            <p className="text-sm text-[var(--ink-muted)] mt-0.5">نظرة سريعة على أداء كورساتك وتفاعل طلابك.</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {/* course filter */}
          <select
            value={courseId}
            onChange={(e) => setCourseId(e.target.value)}
            className="px-3 py-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] text-[var(--ink)] text-sm font-semibold focus:outline-none focus:border-sky-400/60 cursor-pointer max-w-[180px] truncate"
            aria-label="تصفية حسب الكورس"
          >
            <option value="">كل الكورسات</option>
            {courses.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
          </select>
          {/* period chips */}
          <div className="flex items-center gap-1 p-1 rounded-xl bg-[var(--surface)] border border-[var(--border)]">
            {PERIODS.map((p) => (
              <button
                key={p.id}
                onClick={() => setPeriod(p.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${period === p.id ? "bg-sky-500 text-white" : "text-[var(--ink-muted)] hover:text-[var(--ink)]"}`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── KPI cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {(loading && !data ? Array.from({ length: 4 }) : kpiDefs).map((k, i) =>
          (loading && !data) ? (
            <div key={i} className="h-28 rounded-2xl skeleton" />
          ) : (
            <div key={(k as typeof kpiDefs[number]).key} className={`${cardPad} flex flex-col gap-3`}>
              <div className="flex items-center justify-between">
                <span className="w-10 h-10 rounded-xl bg-sky-500/12 text-sky-500 dark:text-sky-300 flex items-center justify-center">
                  {(() => { const Icon = (k as typeof kpiDefs[number]).Icon; return <Icon className="w-5 h-5" />; })()}
                </span>
                <Delta pct={(k as typeof kpiDefs[number]).kpi.deltaPct} />
              </div>
              <div>
                <div className="text-2xl sm:text-3xl font-black text-[var(--ink)] tabular-nums leading-none">
                  {(k as typeof kpiDefs[number]).kpi.value}{(k as typeof kpiDefs[number]).suffix ?? ""}
                </div>
                <div className="text-[var(--ink-muted)] text-xs mt-1.5">{(k as typeof kpiDefs[number]).label}</div>
                {(k as typeof kpiDefs[number]).extra && (
                  <div className="text-[11px] text-emerald-500 font-semibold mt-0.5">{(k as typeof kpiDefs[number]).extra}</div>
                )}
              </div>
            </div>
          )
        )}
      </div>

      {/* ── Main chart ── */}
      <div className={cardPad}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-[var(--ink)] flex items-center gap-2"><IconChart className="w-4 h-4 text-sky-500" /> المشاهدات والاشتراكات عبر الزمن</h3>
        </div>
        {loading && !data ? <div className="h-64 rounded-xl skeleton" /> : data && <ViewsAreaChart series={data.series} />}
      </div>

      {/* ── Top / low videos ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className={cardPad}>
          <h3 className="font-bold text-[var(--ink)] mb-4 flex items-center gap-2"><IconEye className="w-4 h-4 text-sky-500" /> الأكثر مشاهدة</h3>
          {data && <HBarList items={data.topVideos.map((v) => ({ label: v.title, value: v.views, sub: v.course }))} color="#38bdf8" />}
        </div>
        <div className={cardPad}>
          <h3 className="font-bold text-[var(--ink)] mb-1 flex items-center gap-2"><IconVideo className="w-4 h-4 text-amber-500" /> تحتاج اهتمامك — الأقل مشاهدة</h3>
          <p className="text-[11px] text-[var(--ink-muted)] mb-4">فيديوهات بمشاهدات منخفضة قد تحتاج مراجعة العنوان أو الترتيب.</p>
          {data && <HBarList items={data.lowVideos.map((v) => ({ label: v.title, value: v.views, sub: v.course }))} color="#f59e0b" />}
        </div>
      </div>

      {/* ── Course breakdown + quiz distribution ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className={cardPad}>
          <h3 className="font-bold text-[var(--ink)] mb-4 flex items-center gap-2"><IconBook className="w-4 h-4 text-sky-500" /> أداء الكورسات (مشاهدات)</h3>
          {data && <HBarList items={data.courseBreakdown.map((c) => ({ label: c.title, value: c.views, sub: `${c.students} طالب` }))} color="#6366f1" />}
        </div>
        <div className={cardPad}>
          <h3 className="font-bold text-[var(--ink)] mb-4 flex items-center gap-2"><IconClipboard className="w-4 h-4 text-indigo-400" /> توزيع درجات الاختبارات</h3>
          {data && <DistBars buckets={data.quizBuckets} />}
        </div>
      </div>

      {/* ── Issues feed (24-Hour Periodic Audit Cycle) ── */}
      <div className={card}>
        <div className="px-5 py-4 border-b border-[var(--border)] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-black text-sm text-[var(--ink)] flex items-center gap-2">
                <IconShield className="w-4 h-4 text-rose-500" />
                <span>ما يحتاج انتباهك</span>
              </h3>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                ⏰ فحص دوري كل 24 ساعة
              </span>
              {data && (
                <span className="text-xs font-bold text-[var(--ink-muted)]">
                  ({data.issues.length} عنصر)
                </span>
              )}
            </div>
            <p className="text-[11px] text-[var(--ink-muted)] mt-0.5">
              يتم التحقق الشامل من روابط وصور وفيديوهات الكورسات تلقائياً كل 24 ساعة.
            </p>
          </div>

          <button
            type="button"
            onClick={() => void load(true)}
            disabled={recheckingAudit}
            className="px-3 py-1.5 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] hover:bg-[var(--border)] text-xs font-bold text-[var(--ink)] transition-all flex items-center gap-1.5 cursor-pointer shadow-xs disabled:opacity-50 shrink-0 self-start sm:self-auto"
            title="إجراء فحص فوري وتحديث تقرير الصحة الآن"
          >
            <span className={recheckingAudit ? "animate-spin" : ""}>🔄</span>
            <span>{recheckingAudit ? "جارٍ الفحص..." : "إعادة الفحص الآن"}</span>
          </button>
        </div>

        {data && data.issues.length === 0 ? (
          <div className="py-12 text-center">
            <p className="text-sm font-bold text-emerald-500">كل شيء على ما يُرام ✓</p>
            <p className="text-xs text-[var(--ink-muted)] mt-1">
              تم الفحص الدوري بنجاح ولا توجد مشاكل أو روابط مفقودة في كورساتك حالياً.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-[var(--border)]">
            {data?.issues.map((it, i) => {
              const Icon = ISSUE_ICON[it.kind] ?? IconFile;
              return (
                <li key={i} className="px-5 py-3.5 flex items-start gap-3">
                  <span className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${SEV_DOT[it.severity]}`} aria-hidden />
                  <span className="shrink-0 w-8 h-8 rounded-lg bg-[var(--border)] text-[var(--ink-muted)] flex items-center justify-center">
                    <Icon className="w-4 h-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-[var(--ink)]">{it.title}</p>
                    <p className="text-xs text-[var(--ink-muted)] truncate">{it.detail}</p>
                  </div>
                  {it.at && <span className="text-[11px] text-[var(--ink-muted)] shrink-0">{timeAgo(it.at)}</span>}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {!loadingCourses && courses.length > 0 && (
        <p className="text-center text-[11px] text-[var(--ink-muted)]">
          {data?.totals ? `${data.totals.courses} كورس · ${data.totals.videos} فيديو` : ""}
        </p>
      )}
    </div>
  );
}
