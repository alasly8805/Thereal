"use client";

import { useMemo, useState, type ReactNode } from "react";
import {
  Activity,
  AlertTriangle,
  BookOpen,
  Brain,
  GraduationCap,
  KeyRound,
  Landmark,
  PlayCircle,
  RefreshCw,
  Settings2,
  ShieldCheck,
  Sparkles,
  Tag,
  Ticket,
  Timer,
  UserPlus,
  Users,
  Wallet,
  HelpCircle,
  Layers,
} from "lucide-react";
import BookingIntelligenceSection from "@/components/admin/superadmin/BookingIntelligenceSection";
import { Badge, Button, Notice, PageHeader, Panel, Tabs } from "@/components/admin/ui/kit";
import type { OverviewData, OverviewKpis } from "./types";
import { extractKpis, KPI_LORE } from "./kpis";
import { Delta, Pill, SkeletonBlock, Stat, ar, egp, fmtDateTime, fmtTime, pct, tone } from "./primitives";
import { TeachersTab } from "./TeachersTab";
import { PaymentsPanel } from "./PaymentsPanel";
import { SignupsByDay } from "./SignupsByDay";
import { PricingTab } from "./PricingTab";
import { MonitorTab } from "./MonitorTab";
import { PendingPaymentsPanel } from "./PendingPaymentsPanel";
import { TimeMachinePanel, type TimeView } from "./TimeMachinePanel";

type Tab = "teachers" | "pricing" | "intelligence" | "monitor";

export interface OverviewSectionProps {
  overview: OverviewData | null;
  loading: boolean;
  error?: boolean;
  refreshing: boolean;
  onBrutalRefresh: () => void;
  onOpenMoneyControl: () => void;
  onAddTeacher: () => void;
  onOpenCopilot?: () => void;
  expandedTeacher: string | null;
  setExpandedTeacher: (id: string | null) => void;
  onDeleteTeacher: (t: { id: string; name: string }) => void;
  onOpenCourseStudents: (course: { id: string; title: string }, teacher: { name: string }) => void;
  onRefreshOverview: () => void;
  onRetry?: () => void;
}

export function OverviewSection({
  overview,
  loading,
  error,
  refreshing,
  onBrutalRefresh,
  onOpenMoneyControl,
  onAddTeacher,
  onOpenCopilot,
  expandedTeacher,
  setExpandedTeacher,
  onDeleteTeacher,
  onOpenCourseStudents,
  onRefreshOverview,
  onRetry,
}: OverviewSectionProps) {
  const [tab, setTab] = useState<Tab>("teachers");
  const [timeView, setTimeView] = useState<TimeView>({ mode: "live" });
  const [machineOpen, setMachineOpen] = useState(false);
  const [explain, setExplain] = useState(false);

  const liveKpis = useMemo(() => (overview ? extractKpis(overview, overview.bookings?.generatedAt) : null), [overview]);
  const shown = useMemo(() => {
    if (timeView.mode === "snapshot") return timeView.snapshot.kpis;
    if (timeView.mode === "reconstructed") return timeView.kpis;
    return liveKpis;
  }, [timeView, liveKpis]);
  const traveling = timeView.mode !== "live";
  const d = (key: keyof OverviewKpis) => {
    if (!traveling || !liveKpis || !shown) return null;
    const a = liveKpis[key];
    const b = shown[key];
    if (typeof a !== "number" || typeof b !== "number") return null;
    return a - b;
  };
  const lore = (key: keyof typeof KPI_LORE) => (explain ? KPI_LORE[key].body : undefined);

  const mc = overview?.moneyControl;
  const bi = overview?.bookingIntelligence;
  const liveAlerts = overview?.accessMonitorAlertCount ?? 0;
  const pendingStudents = shown?.pendingStudentCount ?? 0;
  const openTasks = pendingStudents + (shown?.accessMonitorAlertCount ?? 0);
  const todaySignups = useMemo(() => {
    const key = new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Cairo" });
    return overview?.signupsByDay?.find((x) => x.date === key)?.count ?? 0;
  }, [overview?.signupsByDay]);

  const tabs: Array<{ id: Tab; label: string; icon: ReactNode; badge?: ReactNode }> = [
    { id: "teachers", label: "المعلمون والأرباح", icon: <GraduationCap size={15} />, badge: <Badge>{ar(overview?.totalTeachers ?? 0)}</Badge> },
    { id: "pricing", label: "الأسعار", icon: <Tag size={15} />, badge: <Badge>{ar(overview?.totalCourses ?? 0)}</Badge> },
    {
      id: "intelligence",
      label: "ذكاء الحجوزات",
      icon: <Brain size={15} />,
      badge: bi ? <Badge tone={bi.totals.coveragePercent < 60 ? "warn" : "neutral"}>{pct(bi.totals.coveragePercent)}</Badge> : undefined,
    },
    {
      id: "monitor",
      label: "المراقبة",
      icon: <ShieldCheck size={15} />,
      badge: liveAlerts > 0 ? <Badge tone="bad">{ar(liveAlerts)}</Badge> : <Badge tone="ok">سليم</Badge>,
    },
  ];

  const initialLoading = loading && !overview;

  return (
    <div dir="rtl" className="flex flex-col gap-5">
      <PageHeader
        title="نظرة عامة"
        description="الحجوزات والأموال والمهام المفتوحة على المنصة الآن."
        meta={
          traveling && shown ? (
            <Badge tone="gold" dot>تشاهد لحظة سابقة · {fmtDateTime(shown.capturedAt)}</Badge>
          ) : overview?.bookings?.generatedAt ? (
            <Badge tone="ok" live>مباشر · آخر تحديث {fmtTime(overview.bookings.generatedAt)} · يتحدث كل دقيقة</Badge>
          ) : null
        }
        actions={
          <>
            <Button
              variant="primary"
              onClick={onBrutalRefresh}
              loading={refreshing}
              icon={<RefreshCw size={15} />}
              title="فحص فوري لبوابات الدفع ومزامنة الاشتراكات والأرباح"
            >
              {refreshing ? "جارٍ المزامنة" : "مزامنة المدفوعات"}
            </Button>
            <Button onClick={onOpenMoneyControl} icon={<Settings2 size={15} />}>
              نسب الأرباح
            </Button>
            {onOpenCopilot && (
              <Button variant="gold" onClick={onOpenCopilot} icon={<Sparkles size={15} />} title="اسأل المساعد عن الصافي والطلاب والأسعار">
                اسأل المساعد
              </Button>
            )}
            <a
              href="/adminpanel/superadmin?section=teacher-packages"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-black transition-all shadow-sm text-white"
              style={{ background: "linear-gradient(135deg, #10b981, #059669)" }}
              title="إدارة باقات وكورسات المعلمين، تفعيل كورس الشهر الثاني، إشعار الكورس الجديد، ومقارنة الفرق بيانيا"
            >
              <Layers size={14} />
              <span>باقات وكورسات المعلمين ومقارنة الفرق 📊</span>
            </a>
            <Button variant="ghost" onClick={onAddTeacher} icon={<UserPlus size={15} />}>
              إضافة معلم
            </Button>
          </>
        }
      />

      {/* Tools row: time machine + explanations */}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant={machineOpen || traveling ? "gold" : "secondary"}
          onClick={() => setMachineOpen((v) => !v)}
          icon={<Timer size={14} />}
          aria-expanded={machineOpen}
        >
          آلة الزمن
        </Button>
        <Button
          size="sm"
          variant={explain ? "primary" : "secondary"}
          onClick={() => setExplain((v) => !v)}
          icon={<HelpCircle size={14} />}
          aria-pressed={explain}
        >
          {explain ? "إخفاء شرح الأرقام" : "اشرح الأرقام"}
        </Button>
        {traveling && (
          <Button size="sm" variant="ghost" onClick={() => setTimeView({ mode: "live" })}>
            العودة للآن
          </Button>
        )}
      </div>

      {machineOpen && <TimeMachinePanel liveKpis={liveKpis} view={timeView} onChange={setTimeView} />}

      {error && !overview && (
        <Notice
          tone="bad"
          title="تعذر تحميل بيانات النظرة العامة"
          action={onRetry && <Button size="sm" onClick={onRetry}>إعادة المحاولة</Button>}
        >
          تحقق من الاتصال ثم أعد المحاولة. باقي الأقسام تعمل بشكل مستقل.
        </Notice>
      )}

      {/* ── Headline numbers ─────────────────────────────────────────────── */}
      {initialLoading ? (
        <div className="adm-stats">
          {Array.from({ length: 4 }).map((_, i) => <SkeletonBlock key={i} h={112} />)}
        </div>
      ) : (
        <div className="adm-stats" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 220px), 1fr))" }}>
          <Stat
            label="صافي ربح المنصة"
            value={egp(shown?.net)}
            sub={`بعد مصروفات ${egp(shown?.expenses)}`}
            color={(shown?.net ?? 0) >= 0 ? "green" : "red"}
            icon={<Landmark size={16} />}
            lore={lore("net")}
            delta={d("net")}
          />
          <Stat
            label="حجوزات نشطة الآن"
            value={ar(shown?.bookingsActiveNow)}
            sub={`${ar(shown?.bookingsActiveStudents)} طالب · +${ar(shown?.bookingsAddedToday)} اليوم · ${egp(shown?.revenueActive)} قيمة سارية`}
            color="green"
            icon={<Activity size={16} />}
            lore={lore("bookingsActiveNow")}
            delta={d("bookingsActiveNow")}
          />
          <Stat
            label="طلاب دفعوا حجز معلم"
            value={ar(shown?.uniquePaidStudents)}
            sub="طلاب مختلفون دفعوا مرة على الأقل — رقم تراكمي"
            color="sky"
            icon={<Wallet size={16} />}
            lore={lore("uniquePaidStudents")}
            delta={d("uniquePaidStudents")}
          />
          <Stat
            label="مهام مفتوحة"
            value={ar(openTasks)}
            sub={
              timeView.mode === "reconstructed"
                ? "الفواتير المعلّقة لا يمكن إعادة بنائها من الماضي بدقة"
                : `${ar(pendingStudents)} عالق في الدفع (${egp(shown?.pendingAmount)}) · ${ar(shown?.accessMonitorAlertCount)} تنبيه مراقبة`
            }
            color={openTasks > 0 ? "amber" : "green"}
            icon={<AlertTriangle size={16} />}
            lore={explain ? "الطلاب العالقون في الدفع + تنبيهات المراقبة. الصفر يعني لا شيء ينتظرك." : undefined}
          />
        </div>
      )}

      {/* Pending payments are actionable — keep them next to the numbers. */}
      <PendingPaymentsPanel data={overview?.pendingPayments} onConfirmed={onRefreshOverview} />

      {/* ── Money flow ──────────────────────────────────────────────────── */}
      {initialLoading ? (
        <SkeletonBlock h={200} />
      ) : (
        <Panel
          title="أين تذهب الأموال"
          icon={<Landmark size={16} />}
          description="ما دفعه الطلاب فعلاً (بدون الكورسات المجانية وبدون تكرار) ← حصة المعلمين وحصة المنصة ← بعد المصروفات = صافي الربح."
          actions={
            <>
              <Pill color="slate">نسبة المنصة {ar(shown?.defaultPercentage ?? mc?.defaultPercentage ?? 25)}٪</Pill>
              {(shown?.customTeacherPctCount ?? Object.keys(mc?.teacherPercentages ?? {}).length) > 0 && (
                <Pill color="sky">
                  {ar(shown?.customTeacherPctCount ?? Object.keys(mc?.teacherPercentages ?? {}).length)} معلم بنسبة مخصصة
                </Pill>
              )}
              <Pill color="slate">{ar(shown?.expensesCount ?? mc?.expensesCount ?? 0)} بند مصروفات</Pill>
            </>
          }
        >
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <FlowStep label="إجمالي المدفوع" value={egp(shown?.gross)} color={tone.gold} sub={explain ? KPI_LORE.gross.body : "من الطلاب لكل المعلمين"} delta={d("gross")} money />
            <FlowStep
              label="مستحقات المعلمين"
              value={egp(shown?.teachersShare)}
              color={tone.amber}
              sub={shown?.gross ? `${pct((shown.teachersShare / shown.gross) * 100)} من الإجمالي` : "—"}
              delta={d("teachersShare")}
              money
            />
            <FlowStep
              label="حصة المنصة"
              value={egp(shown?.platformShare)}
              color={tone.sky}
              sub={shown?.gross ? `${pct((shown.platformShare / shown.gross) * 100)} من الإجمالي` : "—"}
              delta={d("platformShare")}
              money
            />
            <FlowStep
              label="صافي الربح"
              value={egp(shown?.net)}
              color={(shown?.net ?? 0) >= 0 ? tone.green : tone.red}
              sub={`بعد مصروفات ${egp(shown?.expenses)}`}
              highlight
              delta={d("net")}
              money
            />
          </div>

          <div className="mt-4">
            <div className="adm-bar" style={{ height: 10 }} role="img" aria-label="توزيع الإجمالي بين المعلمين والمنصة والمصروفات">
              {(shown?.gross ?? 0) > 0 && shown && (
                <>
                  <span style={{ width: `${(shown.teachersShare / shown.gross) * 100}%`, background: tone.amber }} title={`مستحقات المعلمين ${egp(shown.teachersShare)}`} />
                  <span style={{ width: `${(Math.max(0, shown.net) / shown.gross) * 100}%`, background: tone.green }} title={`صافي المنصة ${egp(shown.net)}`} />
                  <span style={{ width: `${(Math.min(shown.expenses, shown.platformShare) / shown.gross) * 100}%`, background: tone.red }} title={`مصروفات ${egp(shown.expenses)}`} />
                </>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mt-2 text-xs font-semibold" style={{ color: "var(--ink-2)" }}>
              <Legend color={tone.amber} label="مستحقات المعلمين" />
              <Legend color={tone.green} label="صافي المنصة" />
              <Legend color={tone.red} label="المصروفات" />
              <span className="ms-auto adm-num" style={{ color: "var(--ink-3)" }}>
                إيداعات بوابات الدفع: <b style={{ color: "var(--ink)" }}>{egp(shown?.totalGatewayDeposits)}</b>
                {shown?.outstandingValue != null && (
                  <>
                    {" "}· مقابل محتوى لم يُنشر بعد: <b style={{ color: tone.orange }}>{egp(shown.outstandingValue)}</b>
                  </>
                )}
              </span>
            </div>
            {explain && (
              <p className="adm-hint mt-2">
                {KPI_LORE.totalGatewayDeposits.body} {KPI_LORE.outstandingValue.body}
              </p>
            )}
          </div>
        </Panel>
      )}

      {/* ── Secondary KPIs ──────────────────────────────────────────────── */}
      {initialLoading ? (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <SkeletonBlock h={220} />
          <SkeletonBlock h={220} />
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <Panel title="المستخدمون" icon={<Users size={16} />}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Stat compact label="الطلاب المسجلون" value={ar(shown?.totalStudents)} sub={todaySignups > 0 ? `+${ar(todaySignups)} اليوم · حسابات حقيقية` : "حسابات حقيقية نشطة"} icon={<Users size={15} />} lore={lore("totalStudents")} delta={d("totalStudents")} />
              <Stat compact label="المعلمون" value={ar(shown?.totalTeachers)} sub={`${ar(shown?.totalCourses)} كورس منشور`} icon={<GraduationCap size={15} />} lore={lore("totalTeachers")} delta={d("totalTeachers")} />
              <Stat compact label="مسجّلون في كورس مدفوع" value={ar(shown?.totalPaidStudentsAcrossPlatform)} sub="يشمل منح الإدارة — ليس بالضرورة دفع بوابة" color="green" icon={<Wallet size={15} />} lore={lore("totalPaidStudentsAcrossPlatform")} delta={d("totalPaidStudentsAcrossPlatform")} />
              <Stat compact label="يشاهدون فعلاً" value={ar(shown?.totalActiveContentConsumers)} sub="فتحوا محتوى مدفوعاً أكثر من ١٠ ثوانٍ" color="violet" icon={<PlayCircle size={15} />} lore={lore("totalActiveContentConsumers")} delta={d("totalActiveContentConsumers")} />
            </div>
          </Panel>

          <Panel title="الحجوزات والكورسات" icon={<Ticket size={16} />}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Stat
                compact
                label="إجمالي حجوزات الباقات"
                value={ar(shown?.totalRealReservations)}
                sub={`${ar(shown?.totalRealPaidReservations)} مدفوع · ${ar((shown?.totalRealReservations ?? 0) - (shown?.totalRealPaidReservations ?? 0))} مجاني`}
                color="sky"
                icon={<Ticket size={15} />}
                lore={lore("totalRealReservations")}
                delta={d("totalRealReservations")}
              />
              <Stat compact label="تسجيلات الكورسات المدفوعة" value={ar(shown?.totalCourseEnrollmentsCount)} sub="بدون الدروس المنفردة والتعريفية" color="gold" icon={<BookOpen size={15} />} lore={lore("totalCourseEnrollmentsCount")} delta={d("totalCourseEnrollmentsCount")} />
              <Stat
                compact
                label="أكواد الوصول"
                value={`${ar(shown?.totalCodesUsed)} / ${ar(shown?.totalCodesBooked)}`}
                sub="مستخدم / إجمالي"
                color="amber"
                icon={<KeyRound size={15} />}
                lore={lore("totalCodesUsed")}
                delta={d("totalCodesUsed")}
              />
              <Stat
                compact
                label="قيمة الاشتراكات السارية"
                value={egp(shown?.revenueActive)}
                sub="اشتراكات لم تنتهِ بعد"
                color="green"
                icon={<Activity size={15} />}
                delta={d("revenueActive")}
              />
            </div>
          </Panel>
        </div>
      )}

      {overview && !loading && <SignupsByDay days={overview.signupsByDay ?? []} />}

      {overview && !loading && (
        <Panel
          title="تفاصيل المدفوعات"
          description="من دفع ماذا وكم. الباقات والكورسات مجمّعة في رقم واحد، والتفصيل تحته. المغطى بالباقة لا يدخل إيراد الكورس."
        >
          <PaymentsPanel teachers={overview.teachers} />
        </Panel>
      )}

      {/* ── Detail tabs ─────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-3">
        <Tabs<Tab> label="تفاصيل النظرة العامة" items={tabs} value={tab} onChange={setTab} />
        {traveling && (
          <p className="adm-hint">هذه التبويبات تعرض الحالة الحية الآن — آلة الزمن تغيّر الأرقام بالأعلى فقط.</p>
        )}
        {initialLoading ? (
          <SkeletonBlock h={320} />
        ) : overview ? (
          <>
            {tab === "teachers" && (
              <TeachersTab
                overview={overview}
                expandedTeacher={expandedTeacher}
                setExpandedTeacher={setExpandedTeacher}
                onDeleteTeacher={onDeleteTeacher}
                onOpenCourseStudents={onOpenCourseStudents}
              />
            )}
            {tab === "pricing" && <PricingTab teachers={overview.teachers} onOpenCourseStudents={onOpenCourseStudents} />}
            {tab === "intelligence" && <BookingIntelligenceSection data={overview.bookingIntelligence} loading={false} />}
            {tab === "monitor" && <MonitorTab events={overview.accessMonitor ?? []} alertCount={overview.accessMonitorAlertCount ?? 0} />}
          </>
        ) : null}
      </div>
    </div>
  );
}

/* ─── local bits ─────────────────────────────────────────────────────────── */

function FlowStep({
  label,
  value,
  sub,
  color,
  highlight = false,
  delta,
  money = false,
}: {
  label: string;
  value: string;
  sub?: ReactNode;
  color: string;
  highlight?: boolean;
  delta?: number | null;
  money?: boolean;
}) {
  return (
    <div
      className="adm-stat is-well"
      style={
        highlight
          ? { background: `color-mix(in srgb, ${color} 8%, var(--surface-2))`, borderColor: `color-mix(in srgb, ${color} 35%, var(--border))` }
          : undefined
      }
    >
      <div className="adm-stat-label">
        <span className="flex items-center gap-1.5 min-w-0">
          <span className="w-2 h-2 rounded-full shrink-0" style={{ background: color }} aria-hidden />
          <span className="truncate">{label}</span>
        </span>
        {delta != null && <Delta n={delta} money={money} />}
      </div>
      <div className="adm-stat-value" style={{ fontSize: 19, color: highlight ? color : "var(--ink)" }}>
        {value}
      </div>
      {sub && <div className="adm-stat-sub">{sub}</div>}
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="w-2.5 h-2.5 rounded-sm" style={{ background: color }} aria-hidden />
      {label}
    </span>
  );
}
