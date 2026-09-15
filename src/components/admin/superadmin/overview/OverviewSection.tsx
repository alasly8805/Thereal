"use client";

import { useState, type ReactNode } from "react";
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
  Tag,
  Ticket,
  TrendingDown,
  UserPlus,
  Users,
  Wallet,
} from "lucide-react";
import BookingIntelligenceSection from "@/components/admin/superadmin/BookingIntelligenceSection";
import type { OverviewData } from "./types";
import { ActionButton, Card, Pill, SkeletonBlock, Stat, ar, egp, fmtTime, pct, tone } from "./primitives";
import { TeachersTab } from "./TeachersTab";
import { PricingTab } from "./PricingTab";
import { MonitorTab } from "./MonitorTab";

type Tab = "teachers" | "pricing" | "intelligence" | "monitor";

export interface OverviewSectionProps {
  overview: OverviewData | null;
  loading: boolean;
  refreshing: boolean;
  onBrutalRefresh: () => void;
  onOpenMoneyControl: () => void;
  onAddTeacher: () => void;
  expandedTeacher: string | null;
  setExpandedTeacher: (id: string | null) => void;
  onDeleteTeacher: (t: { id: string; name: string }) => void;
  onOpenCourseStudents: (course: { id: string; title: string }, teacher: { name: string }) => void;
}

export function OverviewSection({
  overview,
  loading,
  refreshing,
  onBrutalRefresh,
  onOpenMoneyControl,
  onAddTeacher,
  expandedTeacher,
  setExpandedTeacher,
  onDeleteTeacher,
  onOpenCourseStudents,
}: OverviewSectionProps) {
  const [tab, setTab] = useState<Tab>("teachers");

  const mc = overview?.moneyControl;
  const gross = mc?.totalGrossRevenue ?? overview?.totalRevenue ?? 0;
  const platformShare = mc?.totalPlatformShare ?? 0;
  const teachersShare = mc?.totalTeachersShare ?? Math.max(0, gross - platformShare);
  const expenses = mc?.totalExpenses ?? 0;
  const net = mc?.netPlatformProfit ?? platformShare - expenses;
  const bi = overview?.bookingIntelligence;
  const alertCount = overview?.accessMonitorAlertCount ?? 0;

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
      badge: alertCount > 0 ? `${ar(alertCount)} تنبيه` : "سليم",
      badgeColor: alertCount > 0 ? "red" : "slate",
    },
  ];

  return (
    <div dir="rtl" className="space-y-4">
      {/* ── Toolbar ─────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-[11px]" style={{ color: "var(--ink-3)" }}>
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-60" style={{ background: tone.green }} />
            <span className="relative inline-flex rounded-full h-2 w-2" style={{ background: tone.green }} />
          </span>
          <Clock size={12} />
          <span>
            {overview?.bookings?.generatedAt ? `آخر تحديث ${fmtTime(overview.bookings.generatedAt)}` : "جارٍ التحميل"} · يتحدث تلقائياً كل دقيقة
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ActionButton onClick={onBrutalRefresh} disabled={refreshing} variant="primary" title="فحص فوري لبوابات الدفع ومزامنة الاشتراكات والأرباح">
            <RefreshCw size={13} className={refreshing ? "animate-spin" : ""} />
            {refreshing ? "جارٍ المزامنة..." : "مزامنة بوابات الدفع"}
          </ActionButton>
          <ActionButton onClick={onOpenMoneyControl} variant="gold" title="نسب الأرباح والمصروفات">
            <Settings2 size={13} /> التحكم في الأموال
          </ActionButton>
          <ActionButton onClick={onAddTeacher} variant="ghost">
            <UserPlus size={13} /> إضافة مدرس
          </ActionButton>
        </div>
      </div>

      {/* ── Money flow ──────────────────────────────────────────────────── */}
      {loading && !overview ? (
        <SkeletonBlock h={150} />
      ) : (
        <Card padded>
          <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
            <div className="flex items-center gap-2">
              <span className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "var(--gold-soft)", color: "var(--gold)" }}>
                <Landmark size={16} />
              </span>
              <div>
                <h2 className="font-black text-sm" style={{ color: "var(--ink)", fontFamily: "var(--font-head)" }}>أين تذهب الأموال</h2>
                <p className="text-[11px]" style={{ color: "var(--ink-3)" }}>
                  ما دفعه الطلاب فعلاً (بدون الكورسات المجانية وبدون تكرار) → حصة المعلمين وحصة المنصة → بعد خصم المصروفات = صافي الربح
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <Pill color="slate">نسبة المنصة الافتراضية {ar(mc?.defaultPercentage ?? 25)}٪</Pill>
              {Object.keys(mc?.teacherPercentages ?? {}).length > 0 && (
                <Pill color="sky">{ar(Object.keys(mc!.teacherPercentages).length)} معلم بنسبة مخصصة</Pill>
              )}
              <Pill color="slate">{ar(mc?.expensesCount ?? 0)} بند مصروفات</Pill>
            </div>
          </div>

          {/* Flow row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
            <FlowStep label="إجمالي المدفوع (Gross)" value={egp(gross)} color={tone.gold} sub="من الطلاب لكل المعلمين" />
            <FlowStep label="مستحقات المعلمين" value={egp(teachersShare)} color={tone.amber} sub={gross ? `${pct((teachersShare / gross) * 100)} من الإجمالي` : "—"} />
            <FlowStep label="حصة المنصة" value={egp(platformShare)} color={tone.sky} sub={gross ? `${pct((platformShare / gross) * 100)} من الإجمالي` : "—"} />
            <FlowStep
              label="صافي ربح المنصة (Net)"
              value={egp(net)}
              color={net >= 0 ? tone.green : tone.red}
              sub={<span className="inline-flex items-center gap-1"><TrendingDown size={10} /> بعد مصروفات {egp(expenses)}</span>}
              highlight
            />
          </div>

          {/* Proportional bar */}
          <div className="mt-3">
            <div className="w-full h-3 rounded-full overflow-hidden flex" style={{ background: "var(--surface-2)" }}>
              {gross > 0 && (
                <>
                  <div style={{ width: `${(teachersShare / gross) * 100}%`, background: tone.amber }} title={`مستحقات المعلمين ${egp(teachersShare)}`} />
                  <div style={{ width: `${(Math.max(0, net) / gross) * 100}%`, background: tone.green }} title={`صافي المنصة ${egp(net)}`} />
                  <div style={{ width: `${(Math.min(expenses, platformShare) / gross) * 100}%`, background: tone.red }} title={`مصروفات ${egp(expenses)}`} />
                </>
              )}
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1.5 text-[10px] font-semibold" style={{ color: "var(--ink-2)" }}>
              <Legend color={tone.amber} label="مستحقات المعلمين" />
              <Legend color={tone.green} label="صافي المنصة" />
              <Legend color={tone.red} label="المصروفات" />
              <span className="mr-auto tabular-nums" style={{ color: "var(--ink-3)" }}>
                إيداعات بوابات الدفع: <b style={{ color: "var(--ink)" }}>{egp(overview?.totalGatewayDeposits ?? 0)}</b>
                {bi && (
                  <>
                    {" "}· أموال مقابل محتوى لم يُنشر بعد: <b style={{ color: tone.orange }}>{egp(bi.totals.outstandingValue)}</b>
                  </>
                )}
              </span>
            </div>
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
          <KpiGroup title="الأشخاص" icon={<Users size={14} />}>
            <Stat compact label="الطلاب المسجلون" value={ar(overview?.totalStudents)} sub="حسابات حقيقية نشطة" color="brand" icon={<Users size={14} />} />
            <Stat compact label="المعلمون" value={ar(overview?.totalTeachers)} sub={`${ar(overview?.totalCourses)} كورس منشور`} color="brand" icon={<GraduationCap size={14} />} />
            <Stat compact label="طلاب دفعوا لكورس" value={ar(overview?.totalPaidStudentsAcrossPlatform)} sub="فريد عبر المنصة" color="green" icon={<Wallet size={14} />} />
            <Stat compact label="يشاهدون فعلاً" value={ar(overview?.totalActiveContentConsumers)} sub="فتحوا محتوى مدفوعاً > ١٠ ثوانٍ" color="violet" icon={<PlayCircle size={14} />} />
          </KpiGroup>

          <KpiGroup title="الحجوزات والكورسات" icon={<Ticket size={14} />}>
            <Stat
              compact
              label="حجوزات نشطة الآن"
              value={ar(overview?.bookings?.activeNow)}
              sub={`+${ar(overview?.bookings?.addedToday)} اليوم · ${egp(overview?.bookings?.revenueActive)} قيمة نشطة`}
              color="green"
              icon={<Activity size={14} />}
            />
            <Stat
              compact
              label="إجمالي حجوزات الباقات"
              value={ar(overview?.totalRealReservations)}
              sub={`${ar(overview?.totalRealPaidReservations)} مدفوع · ${ar((overview?.totalRealReservations ?? 0) - (overview?.totalRealPaidReservations ?? 0))} مجاني`}
              color="sky"
              icon={<Ticket size={14} />}
            />
            <Stat compact label="تسجيلات الكورسات المدفوعة" value={ar(overview?.totalCourseEnrollmentsCount)} sub="بدون الدروس المنفردة والتعريفية" color="gold" icon={<BookOpen size={14} />} />
            <Stat
              compact
              label="أكواد الوصول"
              value={`${ar(overview?.totalCodesUsed)} / ${ar(overview?.totalCodesBooked)}`}
              sub="مستخدم / إجمالي"
              color="amber"
              icon={<KeyRound size={14} />}
            />
          </KpiGroup>
        </div>
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
          {tab === "monitor" && <MonitorTab events={overview.accessMonitor ?? []} alertCount={alertCount} />}
        </>
      ) : (
        <Card padded>
          <p className="text-center text-xs" style={{ color: "var(--ink-3)" }}>تعذر تحميل بيانات النظرة العامة. جرّب المزامنة مرة أخرى.</p>
        </Card>
      )}
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
}: {
  label: string;
  value: string;
  sub?: ReactNode;
  color: string;
  highlight?: boolean;
}) {
  return (
    <div
      className="rounded-xl p-3 relative overflow-hidden"
      style={{
        background: highlight ? `color-mix(in srgb, ${color} 10%, var(--surface-2))` : "var(--surface-2)",
        border: `1px solid ${highlight ? `color-mix(in srgb, ${color} 40%, transparent)` : "var(--border)"}`,
      }}
    >
      <div className="text-[11px] font-semibold" style={{ color: "var(--ink-2)" }}>{label}</div>
      <div className="text-xl font-black tabular-nums mt-1.5 leading-none" style={{ color, fontFamily: "var(--font-head)" }}>{value}</div>
      {sub && <div className="text-[10px] mt-1.5" style={{ color: "var(--ink-3)" }}>{sub}</div>}
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
