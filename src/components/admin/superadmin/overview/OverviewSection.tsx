"use client";

import { useMemo, useState, type ReactNode } from "react";
import {
  Activity,
  BookOpen,
  Brain,
  Clock,
  GraduationCap,
  KeyRound,
  Landmark,
  PlayCircle,
  RefreshCw,
  Settings2,
  ShieldCheck,
  Swords,
  Tag,
  Ticket,
  Timer,
  TrendingDown,
  UserPlus,
  Users,
  Wallet,
} from "lucide-react";
import BookingIntelligenceSection from "@/components/admin/superadmin/BookingIntelligenceSection";
import type { OverviewData, OverviewKpis } from "./types";
import { extractKpis, KPI_LORE } from "./kpis";
import { ActionButton, Card, Delta, Pill, SkeletonBlock, Stat, XpBar, ar, egp, fmtDateTime, fmtTime, pct, tone } from "./primitives";
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
}

export function OverviewSection({
  overview,
  loading,
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
}: OverviewSectionProps) {
  const [tab, setTab] = useState<Tab>("teachers");
  const [timeView, setTimeView] = useState<TimeView>({ mode: "live" });
  const [machineOpen, setMachineOpen] = useState(true);
  const [explain, setExplain] = useState(true);

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

  const mc = overview?.moneyControl;
  const bi = overview?.bookingIntelligence;
  const alertCount = shown?.accessMonitorAlertCount ?? overview?.accessMonitorAlertCount ?? 0;
  const level = hqLevel(shown);
  const xpMax = xpCap(shown?.net ?? 0);
  const todaySignups = useMemo(() => {
    const key = new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Cairo" });
    return overview?.signupsByDay?.find((d) => d.date === key)?.count ?? 0;
  }, [overview?.signupsByDay]);

  const tabs: Array<{ id: Tab; label: string; icon: ReactNode; badge?: string; badgeColor?: "red" | "slate" | "amber" }> = [
    { id: "teachers", label: "المعلمون والأرباح", icon: <GraduationCap size={14} />, badge: ar(overview?.totalTeachers ?? 0) },
    { id: "pricing", label: "الأسعار", icon: <Tag size={14} />, badge: `${ar(overview?.totalCourses ?? 0)} كورس` },
    {
      id: "intelligence",
      label: "ذكاء الحجوزات",
      icon: <Brain size={14} />,
      badge: bi ? `${pct(bi.totals.coveragePercent)} تغطية` : undefined,
      badgeColor: bi && bi.totals.coveragePercent < 60 ? "amber" : "slate",
    },
    {
      id: "monitor",
      label: "المراقبة",
      icon: <ShieldCheck size={14} />,
      badge: alertCount > 0 ? `${ar(overview?.accessMonitorAlertCount ?? alertCount)} تنبيه` : "سليم",
      badgeColor: (overview?.accessMonitorAlertCount ?? 0) > 0 ? "red" : "slate",
    },
  ];

  return (
    <div dir="rtl" className="space-y-4">
      {/* ── HQ Hero ──────────────────────────────────────────────────────── */}
      <div
        className="relative overflow-hidden rounded-2xl hq-hero-scan"
        style={{
          background:
            "linear-gradient(145deg, color-mix(in srgb, var(--brand) 18%, var(--surface)) 0%, var(--surface) 42%, color-mix(in srgb, var(--gold) 10%, var(--surface)) 100%)",
          border: "1px solid var(--border-strong)",
          boxShadow: "var(--shadow)",
        }}
      >
        <div className="noise" />
        <div className="relative p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-start gap-3 min-w-0">
              <span
                className="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0"
                style={{ background: "var(--brand)", color: "#fff", boxShadow: "0 8px 20px -8px var(--brand-shadow)" }}
              >
                <Swords size={20} />
              </span>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="font-black text-lg leading-none" style={{ color: "var(--ink)", fontFamily: "var(--font-head)" }}>
                    مقر قيادة المنصة
                  </h1>
                  <span className="inline-flex items-center gap-1.5 text-[10px] font-black" style={{ color: traveling ? tone.gold : tone.green }}>
                    <span className="hq-pulse-dot inline-block h-2 w-2 rounded-full" style={{ background: traveling ? tone.gold : tone.green }} />
                    {traveling ? "وضع السفر عبر الزمن" : "مباشر"}
                  </span>
                  <Pill color="gold">مستوى {ar(level)} · {rankName(level)}</Pill>
                </div>
                <p className="text-[11px] mt-1.5 leading-relaxed max-w-xl" style={{ color: "var(--ink-2)" }}>
                  {traveling
                    ? "الأرقام بالأسفل من اللحظة التي اخترتها. الجداول التفصيلية (المعلمون / الأسعار / المراقبة) تبقى حية كما هي الآن."
                    : "لوحة المهام: نفس الأرقام السابقة مرتّبة كمركز قيادة. مرّر على أي رقم أو فعّل الشرح لتعرف ماذا يعني."}
                </p>
                <div className="flex items-center gap-2 mt-2 text-[11px]" style={{ color: "var(--ink-3)" }}>
                  <Clock size={12} />
                  <span>
                    {traveling && shown
                      ? `تشاهد ${fmtDateTime(shown.capturedAt)}`
                      : overview?.bookings?.generatedAt
                        ? `آخر تحديث ${fmtTime(overview.bookings.generatedAt)} · يتحدث تلقائياً كل دقيقة`
                        : "جارٍ التحميل"}
                  </span>
                </div>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <ActionButton onClick={onBrutalRefresh} disabled={refreshing} variant="primary" title="فحص فوري لبوابات الدفع ومزامنة الاشتراكات والأرباح">
                <RefreshCw size={13} className={refreshing ? "animate-spin" : ""} />
                {refreshing ? "جارٍ المزامنة..." : "مزامنة بوابات الدفع"}
              </ActionButton>
              <ActionButton onClick={onOpenMoneyControl} variant="gold" title="نسب الأرباح والمصروفات">
                <Settings2 size={13} /> التحكم في الأموال
              </ActionButton>
              {onOpenCopilot && (
                <ActionButton onClick={onOpenCopilot} variant="gold" title="اسأل المساعد عن الصافي والطلاب والأسعار — للمشرف العام فقط">
                  <Brain size={13} /> اسأل المقر
                </ActionButton>
              )}
              <ActionButton onClick={onAddTeacher} variant="ghost">
                <UserPlus size={13} /> إضافة مدرس
              </ActionButton>
              <ActionButton
                onClick={() => setMachineOpen((v) => !v)}
                variant={machineOpen || traveling ? "gold" : "ghost"}
                title="قارن الأرقام بلحظة سابقة"
              >
                <Timer size={13} /> آلة الزمن
              </ActionButton>
              <ActionButton onClick={() => setExplain((v) => !v)} variant={explain ? "primary" : "ghost"} title="إظهار شرح كل رقم">
                {explain ? "إخفاء الشرح" : "اشرح الأرقام"}
              </ActionButton>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3">
            <HeroScore
              label="صافي ربح المنصة — سكور المقر"
              value={egp(shown?.net)}
              color={ (shown?.net ?? 0) >= 0 ? tone.green : tone.red }
              bar={<XpBar value={Math.max(0, shown?.net ?? 0)} max={xpMax} color={tone.gold} label={`بعد مصروفات ${egp(shown?.expenses)}`} />}
              lore={explain ? KPI_LORE.net.body : undefined}
              delta={d("net")}
              moneyDelta
            />
            <HeroScore
              label="حجوزات نشطة الآن"
              value={ar(shown?.bookingsActiveNow)}
              color={tone.green}
              bar={<XpBar value={shown?.bookingsActiveNow ?? 0} max={Math.max(10, (shown?.bookingsActiveNow ?? 0) * 1.35)} color={tone.green} label={`${ar(shown?.bookingsActiveStudents)} طالب ساري · +${ar(shown?.bookingsAddedToday)} اليوم`} />}
              lore={explain ? KPI_LORE.bookingsActiveNow.body : undefined}
              delta={d("bookingsActiveNow")}
            />
            <HeroScore
              label="مهام مفتوحة"
              value={ar((shown?.pendingStudentCount ?? 0) + (shown?.accessMonitorAlertCount ?? 0))}
              color={(shown?.pendingStudentCount ?? 0) + (shown?.accessMonitorAlertCount ?? 0) > 0 ? tone.amber : tone.green}
              bar={
                <XpBar
                  value={(shown?.pendingStudentCount ?? 0) + (shown?.accessMonitorAlertCount ?? 0)}
                  max={Math.max(3, (shown?.pendingStudentCount ?? 0) + (shown?.accessMonitorAlertCount ?? 0))}
                  color={tone.amber}
                  label={`${ar(shown?.pendingStudentCount)} عالق في الدفع · ${ar(shown?.accessMonitorAlertCount)} تنبيه مراقبة`}
                />
              }
              lore={explain ? "مجموع الطلاب العالقين في الدفع + تنبيهات المراقبة. كلما كان صفر، المقر نظيف." : undefined}
              delta={null}
            />
          </div>
        </div>
      </div>

      {machineOpen && (
        <TimeMachinePanel liveKpis={liveKpis} view={timeView} onChange={setTimeView} />
      )}

      {/* ── Live money vs pending ─────────────────────────────────────────── */}
      {loading && !overview ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
          {Array.from({ length: 3 }).map((_, i) => <SkeletonBlock key={i} h={120} />)}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
          <Stat
            label="حجوزات نشطة الآن"
            value={ar(shown?.bookingsActiveNow)}
            sub={`${ar(shown?.bookingsActiveStudents)} طالب ساري · +${ar(shown?.bookingsAddedToday)} اليوم · ${egp(shown?.revenueActive)} قيمة الاشتراكات التي لم تنتهِ بعد`}
            color="green"
            icon={<Activity size={14} />}
            lore={explain ? KPI_LORE.bookingsActiveNow.body : undefined}
            delta={d("bookingsActiveNow")}
          />
          <Stat
            label="طلاب دفعوا حجز معلم"
            value={ar(shown?.uniquePaidStudents)}
            sub="عدد الطلاب المختلفين الذين دفعوا اشتراك معلم مرة على الأقل — ليس نفس رقم الحجوزات النشطة"
            color="sky"
            icon={<Wallet size={14} />}
            lore={explain ? KPI_LORE.uniquePaidStudents.body : undefined}
            delta={d("uniquePaidStudents")}
          />
          <Stat
            label="بدأوا الدفع ولم يكتمل"
            value={ar(shown?.pendingStudentCount)}
            sub={
              timeView.mode === "reconstructed"
                ? "لا يمكن إعادة بناء الفواتير المعلّقة من الماضي بدقة — استخدم قراءة «فُتحت اللوحة» لرؤية الرقم الحقيقي آنذاك"
                : `${ar(shown?.pendingTransactionCount)} فاتورة معلّقة · ${egp(shown?.pendingAmount)} — لم يدخلوا في رقم الحجوزات النشطة`
            }
            color="amber"
            icon={<Clock size={14} />}
            lore={explain ? KPI_LORE.pendingStudentCount.body : undefined}
            delta={timeView.mode === "reconstructed" ? null : d("pendingStudentCount")}
          />
        </div>
      )}
      <p className="text-[11px] leading-relaxed px-0.5" style={{ color: "var(--ink-3)" }}>
        رقم الحجوزات النشطة هو اشتراكات سارية لم تنتهِ بعد، وليس كل من دفع عبر الزمن.
        الطلاب الذين بدأوا فاتورة ولم يدفعوا لا يدخلون هذا الرقم حتى تضغط «اعتباره مدفوعاً» أو تؤكد البوابة الدفع.
        {traveling ? " قائمة العالقين بالأسفل حيّة الآن وليست من آلة الزمن، لأن الفاتورة المعلّقة تختفي بمجرد اكتمال الدفع." : ""}
      </p>

      {/* ── Money flow ──────────────────────────────────────────────────── */}
      {loading && !overview ? (
        <SkeletonBlock h={170} />
      ) : (
        <Card padded>
          <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
            <div className="flex items-center gap-2">
              <span className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "var(--gold-soft)", color: "var(--gold)" }}>
                <Landmark size={16} />
              </span>
              <div>
                <h2 className="font-black text-sm" style={{ color: "var(--ink)", fontFamily: "var(--font-head)" }}>غنائم المنصة — أين تذهب الأموال</h2>
                <p className="text-[11px]" style={{ color: "var(--ink-3)" }}>
                  ما دفعه الطلاب فعلاً (بدون الكورسات المجانية وبدون تكرار) → حصة المعلمين وحصة المنصة → بعد خصم المصروفات = صافي الربح
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <Pill color="slate">نسبة المنصة الافتراضية {ar(shown?.defaultPercentage ?? mc?.defaultPercentage ?? 25)}٪</Pill>
              {(shown?.customTeacherPctCount ?? Object.keys(mc?.teacherPercentages ?? {}).length) > 0 && (
                <Pill color="sky">{ar(shown?.customTeacherPctCount ?? Object.keys(mc!.teacherPercentages).length)} معلم بنسبة مخصصة</Pill>
              )}
              <Pill color="slate">{ar(shown?.expensesCount ?? mc?.expensesCount ?? 0)} بند مصروفات</Pill>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
            <FlowStep label="إجمالي المدفوع (Gross)" value={egp(shown?.gross)} color={tone.gold} sub={explain ? KPI_LORE.gross.body : "من الطلاب لكل المعلمين"} delta={d("gross")} money />
            <FlowStep
              label="مستحقات المعلمين"
              value={egp(shown?.teachersShare)}
              color={tone.amber}
              sub={shown?.gross ? `${pct(((shown.teachersShare) / shown.gross) * 100)} من الإجمالي` : "—"}
              delta={d("teachersShare")}
              money
            />
            <FlowStep
              label="حصة المنصة"
              value={egp(shown?.platformShare)}
              color={tone.sky}
              sub={shown?.gross ? `${pct(((shown.platformShare) / shown.gross) * 100)} من الإجمالي` : "—"}
              delta={d("platformShare")}
              money
            />
            <FlowStep
              label="صافي ربح المنصة (Net)"
              value={egp(shown?.net)}
              color={(shown?.net ?? 0) >= 0 ? tone.green : tone.red}
              sub={<span className="inline-flex items-center gap-1"><TrendingDown size={10} /> بعد مصروفات {egp(shown?.expenses)}</span>}
              highlight
              delta={d("net")}
              money
            />
          </div>

          <div className="mt-3">
            <div className="w-full h-3 rounded-full overflow-hidden flex" style={{ background: "var(--surface-2)" }}>
              {(shown?.gross ?? 0) > 0 && shown && (
                <>
                  <div style={{ width: `${(shown.teachersShare / shown.gross) * 100}%`, background: tone.amber }} title={`مستحقات المعلمين ${egp(shown.teachersShare)}`} />
                  <div style={{ width: `${(Math.max(0, shown.net) / shown.gross) * 100}%`, background: tone.green }} title={`صافي المنصة ${egp(shown.net)}`} />
                  <div style={{ width: `${(Math.min(shown.expenses, shown.platformShare) / shown.gross) * 100}%`, background: tone.red }} title={`مصروفات ${egp(shown.expenses)}`} />
                </>
              )}
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1.5 text-[10px] font-semibold" style={{ color: "var(--ink-2)" }}>
              <Legend color={tone.amber} label="مستحقات المعلمين" />
              <Legend color={tone.green} label="صافي المنصة" />
              <Legend color={tone.red} label="المصروفات" />
              <span className="mr-auto tabular-nums" style={{ color: "var(--ink-3)" }}>
                إيداعات بوابات الدفع: <b style={{ color: "var(--ink)" }}>{egp(shown?.totalGatewayDeposits)}</b>
                {shown?.outstandingValue != null && (
                  <>
                    {" "}· أموال مقابل محتوى لم يُنشر بعد: <b style={{ color: tone.orange }}>{egp(shown.outstandingValue)}</b>
                  </>
                )}
              </span>
            </div>
            {explain && (
              <p className="text-[10px] mt-2 leading-relaxed" style={{ color: "var(--ink-3)" }}>
                {KPI_LORE.totalGatewayDeposits.body} {KPI_LORE.outstandingValue.body}
              </p>
            )}
          </div>
        </Card>
      )}

      {/* ── KPI groups ──────────────────────────────────────────────────── */}
      {loading && !overview ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
          {Array.from({ length: 8 }).map((_, i) => <SkeletonBlock key={i} h={86} />)}
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
          <KpiGroup title="فريق المنصة" icon={<Users size={14} />}>
            <Stat compact label="الطلاب المسجلون" value={ar(shown?.totalStudents)} sub={todaySignups > 0 ? `+${ar(todaySignups)} اليوم · حسابات حقيقية نشطة` : "حسابات حقيقية نشطة"} color="brand" icon={<Users size={14} />} lore={explain ? KPI_LORE.totalStudents.body : undefined} delta={d("totalStudents")} />
            <Stat compact label="المعلمون" value={ar(shown?.totalTeachers)} sub={`${ar(shown?.totalCourses)} كورس منشور`} color="brand" icon={<GraduationCap size={14} />} lore={explain ? KPI_LORE.totalTeachers.body : undefined} delta={d("totalTeachers")} />
            <Stat compact label="طلاب سُجّلوا في كورس مدفوع" value={ar(shown?.totalPaidStudentsAcrossPlatform)} sub="تسجيل كورس — يشمل منح الإدارة وليس بالضرورة دفع بوابة" color="green" icon={<Wallet size={14} />} lore={explain ? KPI_LORE.totalPaidStudentsAcrossPlatform.body : undefined} delta={d("totalPaidStudentsAcrossPlatform")} />
            <Stat compact label="يشاهدون فعلاً" value={ar(shown?.totalActiveContentConsumers)} sub="فتحوا محتوى مدفوعاً > ١٠ ثوانٍ" color="violet" icon={<PlayCircle size={14} />} lore={explain ? KPI_LORE.totalActiveContentConsumers.body : undefined} delta={d("totalActiveContentConsumers")} />
          </KpiGroup>

          <KpiGroup title="الحجوزات والكورسات" icon={<Ticket size={14} />}>
            <Stat
              compact
              label="حجوزات نشطة الآن"
              value={ar(shown?.bookingsActiveNow)}
              sub={`${ar(shown?.bookingsActiveStudents)} طالب · ${egp(shown?.revenueActive)} سارية`}
              color="green"
              icon={<Activity size={14} />}
              lore={explain ? KPI_LORE.bookingsActiveNow.body : undefined}
              delta={d("bookingsActiveNow")}
            />
            <Stat
              compact
              label="إجمالي حجوزات الباقات"
              value={ar(shown?.totalRealReservations)}
              sub={`${ar(shown?.totalRealPaidReservations)} مدفوع · ${ar((shown?.totalRealReservations ?? 0) - (shown?.totalRealPaidReservations ?? 0))} مجاني`}
              color="sky"
              icon={<Ticket size={14} />}
              lore={explain ? KPI_LORE.totalRealReservations.body : undefined}
              delta={d("totalRealReservations")}
            />
            <Stat compact label="تسجيلات الكورسات المدفوعة" value={ar(shown?.totalCourseEnrollmentsCount)} sub="بدون الدروس المنفردة والتعريفية" color="gold" icon={<BookOpen size={14} />} lore={explain ? KPI_LORE.totalCourseEnrollmentsCount.body : undefined} delta={d("totalCourseEnrollmentsCount")} />
            <Stat
              compact
              label="أكواد الوصول"
              value={`${ar(shown?.totalCodesUsed)} / ${ar(shown?.totalCodesBooked)}`}
              sub="مستخدم / إجمالي"
              color="amber"
              icon={<KeyRound size={14} />}
              lore={explain ? KPI_LORE.totalCodesUsed.body : undefined}
              delta={d("totalCodesUsed")}
            />
          </KpiGroup>
        </div>
      )}

      {overview && !loading && (
        <SignupsByDay days={overview.signupsByDay ?? []} />
      )}

      {overview && !loading && (
        <Card padded>
          <div className="flex items-start justify-between gap-3 mb-3">
            <div>
              <h2 className="font-black text-sm" style={{ color: "var(--ink)", fontFamily: "var(--font-head)" }}>
                تفاصيل المدفوعات — مين دفع إيه وكام
              </h2>
              <p className="text-[11px] mt-0.5 leading-relaxed" style={{ color: "var(--ink-3)" }}>
                الباقات والكورسات متجمعين في رقم واحد فوق، والتفصيل تحت. المغطى بالباقة لا يدخل إيراد الكورس.
              </p>
            </div>
          </div>
          <PaymentsPanel teachers={overview.teachers} />
        </Card>
      )}

      {traveling && (
        <p className="text-[11px] px-1" style={{ color: tone.gold }}>
          التبويبات التالية (المعلمون، الأسعار، الذكاء، المراقبة) تعرض الحالة الحية الآن — آلة الزمن تحرّك بطاقات الأرقام بالأعلى فقط.
        </p>
      )}

      {/* ── Tabs ────────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-1.5 p-1 rounded-xl" style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}>
        {tabs.map((t) => {
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold cursor-pointer transition-all"
              style={{
                background: active ? "var(--surface)" : "transparent",
                color: active ? "var(--brand)" : "var(--ink-2)",
                boxShadow: active ? "var(--shadow-sm)" : "none",
                border: active ? "1px solid var(--border)" : "1px solid transparent",
              }}
            >
              {t.icon}
              {t.label}
              {t.badge && <Pill color={t.badgeColor ?? "slate"}>{t.badge}</Pill>}
            </button>
          );
        })}
      </div>

      {loading && !overview ? (
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
      ) : (
        <Card padded>
          <p className="text-center text-xs" style={{ color: "var(--ink-3)" }}>تعذر تحميل بيانات النظرة العامة. جرّب المزامنة مرة أخرى.</p>
        </Card>
      )}

      <PendingPaymentsPanel data={overview?.pendingPayments} onConfirmed={onRefreshOverview} />
    </div>
  );
}

/* ─── local bits ─────────────────────────────────────────────────────────── */

function hqLevel(k: OverviewKpis | null) {
  if (!k) return 1;
  const score = k.bookingsActiveNow + k.uniquePaidStudents + Math.floor(Math.max(0, k.net) / 400);
  return Math.max(1, Math.min(99, Math.floor(score / 12) + 1));
}

function rankName(level: number) {
  if (level >= 20) return "أسطورة المنصة";
  if (level >= 12) return "قائد الحجوزات";
  if (level >= 6) return "قائد ميداني";
  return "متدرّب القيادة";
}

function xpCap(net: number) {
  const abs = Math.max(1000, Math.abs(net));
  const pow = Math.pow(10, Math.ceil(Math.log10(abs)));
  return Math.max(pow / 2, abs);
}

function HeroScore({
  label,
  value,
  color,
  bar,
  lore,
  delta,
  moneyDelta = false,
}: {
  label: string;
  value: string;
  color: string;
  bar: ReactNode;
  lore?: string;
  delta: number | null;
  moneyDelta?: boolean;
}) {
  return (
    <div
      className="rounded-2xl p-3.5"
      style={{
        background: "color-mix(in srgb, var(--surface) 82%, transparent)",
        border: "1px solid var(--border)",
        backdropFilter: "blur(8px)",
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-bold" style={{ color: "var(--ink-2)" }}>{label}</span>
        {delta != null && <Delta n={delta} money={moneyDelta} />}
      </div>
      <div className="text-2xl font-black tabular-nums mt-1.5 leading-none" style={{ color, fontFamily: "var(--font-head)" }}>
        {value}
      </div>
      <div className="mt-2.5">{bar}</div>
      {lore && <p className="text-[10px] mt-2 leading-relaxed" style={{ color: "var(--ink-3)" }}>{lore}</p>}
    </div>
  );
}

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
      className="rounded-xl p-3 relative overflow-hidden"
      style={{
        background: highlight ? `color-mix(in srgb, ${color} 10%, var(--surface-2))` : "var(--surface-2)",
        border: `1px solid ${highlight ? `color-mix(in srgb, ${color} 40%, transparent)` : "var(--border)"}`,
      }}
    >
      <div className="flex items-center justify-between gap-1">
        <div className="text-[11px] font-semibold" style={{ color: "var(--ink-2)" }}>{label}</div>
        {delta != null && <Delta n={delta} money={money} />}
      </div>
      <div className="text-xl font-black tabular-nums mt-1.5 leading-none" style={{ color, fontFamily: "var(--font-head)" }}>{value}</div>
      {sub && <div className="text-[10px] mt-1.5 leading-snug" style={{ color: "var(--ink-3)" }}>{sub}</div>}
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className="w-2.5 h-2.5 rounded-sm" style={{ background: color }} />
      {label}
    </span>
  );
}

function KpiGroup({ title, icon, children }: { title: string; icon: ReactNode; children: ReactNode }) {
  return (
    <Card padded>
      <div className="flex items-center gap-1.5 mb-2.5 text-[11px] font-black" style={{ color: "var(--ink-2)" }}>
        <span style={{ color: "var(--brand)" }}>{icon}</span>
        {title}
      </div>
      <div className="grid grid-cols-2 gap-2">{children}</div>
    </Card>
  );
}
