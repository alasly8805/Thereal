"use client";

import { useState } from "react";

export interface BookingStudentRow {
  subscriptionId: string;
  studentName: string;
  studentPhone: string;
  educationalStage: string;
  teacherName: string;
  planType: string;
  planLabel: string;
  amountPaid: number;
  monthsBooked: number;
  monthsPublished: number;
  monthsDelivered: number;
  monthsOutstanding: number;
  valuePerMonth: number;
  deliveredValue: number;
  outstandingValue: number;
  monthsElapsed: number;
  monthsRemaining: number;
  actualSpanMonths: number | null;
  hasSpanDrift: boolean;
  driftMonths: number;
  startedAt: string;
  expiresAt: string | null;
  isExpired: boolean;
  coveragePercent: number;
}

export interface BookingIntelligenceData {
  generatedAt: string;
  planMonths: Record<string, number>;
  totals: {
    bookings: number;
    paidBookings: number;
    students: number;
    revenue: number;
    monthsBooked: number;
    monthsDelivered: number;
    monthsOutstanding: number;
    deliveredValue: number;
    outstandingValue: number;
    coveragePercent: number;
    driftedBookings: number;
    expiringWithin30Days: number;
  };
  byPlan: Array<{
    planType: string;
    planLabel: string;
    monthsPerBooking: number;
    bookings: number;
    revenue: number;
    monthsBooked: number;
    monthsDelivered: number;
    monthsOutstanding: number;
    deliveredValue: number;
    outstandingValue: number;
    coveragePercent: number;
  }>;
  byTeacher: Array<{
    teacherId: string;
    teacherName: string;
    monthsPublished: number;
    bookings: number;
    revenue: number;
    monthsBooked: number;
    monthsOutstanding: number;
    outstandingValue: number;
    coveragePercent: number;
  }>;
  drift: Array<{
    subscriptionId: string;
    studentName: string;
    teacherName: string;
    planType: string;
    expectedMonths: number;
    actualMonths: number | null;
    driftMonths: number;
    amountPaid: number;
  }>;
  topOutstanding: BookingStudentRow[];
  students: BookingStudentRow[];
}

const ar = (n: number) => (n ?? 0).toLocaleString("ar-EG");
const egp = (n: number) => `${(Math.round((n ?? 0) * 100) / 100).toLocaleString("ar-EG")} ج.م`;

/** Green when the student can reach everything they paid for, red when most of it does not exist yet. */
function coverageColor(percent: number): string {
  if (percent >= 100) return "var(--ok)";
  if (percent >= 60) return "var(--warn)";
  if (percent >= 30) return "var(--orange)";
  return "var(--danger)";
}

function CoverageBar({ percent }: { percent: number }) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 rounded-full overflow-hidden min-w-[60px]" style={{ background: "var(--surface-2)" }}>
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${Math.min(100, Math.max(0, percent))}%`, background: coverageColor(percent) }}
        />
      </div>
      <span className="text-xs font-bold tabular-nums" style={{ color: coverageColor(percent) }}>
        {ar(percent)}٪
      </span>
    </div>
  );
}

/**
 * Reconciliation of what students paid for against what has actually been published.
 * A booking is sold in months (شهر = 1، ترم = 4، سنة = 8) while the curriculum ships
 * one month at a time, so the months a student has bought but cannot yet open are a
 * delivery obligation — and the money behind them is not earned revenue.
 */
export default function BookingIntelligenceSection({
  data,
  loading,
}: {
  data?: BookingIntelligenceData | null;
  loading?: boolean;
}) {
  const [tab, setTab] = useState<"plans" | "teachers" | "students" | "drift">("plans");

  if (loading) {
    return (
      <div className="rounded-2xl p-6 text-center text-xs" style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--ink-3)" }}>
        جارٍ حساب ذكاء الحجوزات…
      </div>
    );
  }

  if (!data || data.totals.bookings === 0) {
    return (
      <div className="rounded-2xl p-6 text-center text-xs" style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--ink-3)" }}>
        لا توجد حجوزات نشطة لتحليلها بعد.
      </div>
    );
  }

  const t = data.totals;
  const pm = data.planMonths;

  const cards = [
    {
      icon: "📅",
      label: "شهور محجوزة (مدفوعة)",
      value: `${ar(t.monthsBooked)} شهر`,
      sub: `${ar(t.bookings)} حجز · ${ar(t.students)} طالب`,
      color: "var(--brand)",
    },
    {
      icon: "✅",
      label: "شهور تم تسليمها فعلياً",
      value: `${ar(t.monthsDelivered)} شهر`,
      sub: `إيراد مُستحق: ${egp(t.deliveredValue)}`,
      color: "var(--ok)",
    },
    {
      icon: "⏳",
      label: "شهور لم تُنشر بعد",
      value: `${ar(t.monthsOutstanding)} شهر`,
      sub: `التزام محتوى على المنصة`,
      color: "var(--orange)",
    },
    {
      icon: "🧾",
      label: "أموال مقابل محتوى غير منشور",
      value: egp(t.outstandingValue),
      sub: `من إجمالي ${egp(t.revenue)} محصلة`,
      color: "var(--danger)",
    },
    {
      icon: "📊",
      label: "نسبة التغطية",
      value: `${ar(t.coveragePercent)}٪`,
      sub: `${ar(t.driftedBookings)} حجز بمدة غير مطابقة`,
      color: coverageColor(t.coveragePercent),
    },
  ];

  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
      <div className="p-4" style={{ borderBottom: "1px solid var(--border)" }}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-black text-base" style={{ color: "var(--ink)", fontFamily: "var(--font-head)" }}>
              🧠 ذكاء الحجوزات — المدفوع مقابل المُسلَّم
            </h2>
            <p className="text-xs mt-1 leading-relaxed" style={{ color: "var(--ink-3)" }}>
              يحسب لكل طالب عدد الشهور التي دفع مقابلها فعلياً، مقابل عدد شهور المنهج المنشورة له.
              الفرق بينهما هو محتوى ما زال مستحقاً للطالب — والمبلغ المقابل له ليس إيراداً مكتسباً بعد.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-1.5 text-xs font-bold">
            <span className="px-2 py-1 rounded" style={{ background: "var(--surface-2)", color: "var(--ink-2)" }}>
              شهر = {ar(pm.monthly)}
            </span>
            <span className="px-2 py-1 rounded" style={{ background: "var(--surface-2)", color: "var(--ink-2)" }}>
              ترم = {ar(pm.termly)} شهور
            </span>
            <span className="px-2 py-1 rounded" style={{ background: "var(--surface-2)", color: "var(--ink-2)" }}>
              سنة = {ar(pm.yearly)} شهور
            </span>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2.5 mt-4">
          {cards.map((c) => (
            <div key={c.label} className="rounded-xl p-3" style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}>
              <div className="text-lg mb-1">{c.icon}</div>
              <div className="text-lg font-black leading-none tabular-nums" style={{ color: c.color, fontFamily: "var(--font-head)" }}>
                {c.value}
              </div>
              <div className="text-xs mt-1 font-semibold truncate" title={c.sub} style={{ color: "var(--ink-3)" }}>
                {c.sub}
              </div>
              <div className="text-xs mt-1 font-medium" style={{ color: "var(--ink-2)" }}>
                {c.label}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-3">
          <div className="flex items-center justify-between text-xs mb-1.5 font-semibold" style={{ color: "var(--ink-3)" }}>
            <span>
              تغطية المنهج: {ar(t.monthsDelivered)} من {ar(t.monthsBooked)} شهر مدفوع
            </span>
            <span>
              متبقٍ {ar(t.monthsOutstanding)} شهر · {ar(t.expiringWithin30Days)} حجز ينتهي خلال ٣٠ يوم
            </span>
          </div>
          <CoverageBar percent={t.coveragePercent} />
        </div>
      </div>

      <div className="flex flex-wrap gap-1 px-4 pt-3" style={{ borderBottom: "1px solid var(--border)" }}>
        {([
          ["plans", `حسب الباقة (${ar(data.byPlan.length)})`],
          ["teachers", `حسب المعلم (${ar(data.byTeacher.length)})`],
          ["students", `أكبر التزام لكل طالب (${ar(data.topOutstanding.length)})`],
          ["drift", `مدد غير مطابقة (${ar(data.drift.length)})`],
        ] as const).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className="px-3 py-2 text-xs font-bold rounded-t-lg transition-colors"
            style={{
              color: tab === key ? "var(--brand)" : "var(--ink-3)",
              borderBottom: tab === key ? "2px solid var(--brand)" : "2px solid transparent",
              background: tab === key ? "var(--surface-2)" : "transparent",
            }}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="overflow-x-auto max-h-[26rem] overflow-y-auto">
        {tab === "plans" && (
          <table className="w-full text-xs">
            <thead className="sticky top-0 z-10" style={{ background: "var(--surface-2)" }}>
              <tr className="text-xs" style={{ borderBottom: "1px solid var(--border)", color: "var(--ink-3)" }}>
                <th className="px-3 py-2 text-right font-medium">الباقة</th>
                <th className="px-3 py-2 text-center font-medium">شهور/حجز</th>
                <th className="px-3 py-2 text-center font-medium">الحجوزات</th>
                <th className="px-3 py-2 text-center font-medium">المحصل</th>
                <th className="px-3 py-2 text-center font-medium">شهور محجوزة</th>
                <th className="px-3 py-2 text-center font-medium">مُسلَّم</th>
                <th className="px-3 py-2 text-center font-medium">غير منشور</th>
                <th className="px-3 py-2 text-center font-medium">إيراد مُستحق</th>
                <th className="px-3 py-2 text-center font-medium">مبلغ غير مكتسب</th>
                <th className="px-3 py-2 text-center font-medium min-w-[120px]">التغطية</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {data.byPlan.map((p) => (
                <tr key={p.planType} className="hover:bg-[var(--surface-2)]/50 transition-colors">
                  <td className="px-3 py-2.5 font-bold" style={{ color: "var(--ink)" }}>{p.planLabel}</td>
                  <td className="px-3 py-2.5 text-center tabular-nums" style={{ color: "var(--ink-2)" }}>{ar(p.monthsPerBooking)}</td>
                  <td className="px-3 py-2.5 text-center tabular-nums" style={{ color: "var(--ink-2)" }}>{ar(p.bookings)}</td>
                  <td className="px-3 py-2.5 text-center tabular-nums font-bold" style={{ color: "var(--gold-2)" }}>{egp(p.revenue)}</td>
                  <td className="px-3 py-2.5 text-center tabular-nums" style={{ color: "var(--ink-2)" }}>{ar(p.monthsBooked)}</td>
                  <td className="px-3 py-2.5 text-center tabular-nums font-bold" style={{ color: "var(--ok)" }}>{ar(p.monthsDelivered)}</td>
                  <td className="px-3 py-2.5 text-center tabular-nums font-bold" style={{ color: "var(--orange)" }}>{ar(p.monthsOutstanding)}</td>
                  <td className="px-3 py-2.5 text-center tabular-nums" style={{ color: "var(--ok)" }}>{egp(p.deliveredValue)}</td>
                  <td className="px-3 py-2.5 text-center tabular-nums font-bold" style={{ color: "var(--danger)" }}>{egp(p.outstandingValue)}</td>
                  <td className="px-3 py-2.5"><CoverageBar percent={p.coveragePercent} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {tab === "teachers" && (
          <table className="w-full text-xs">
            <thead className="sticky top-0 z-10" style={{ background: "var(--surface-2)" }}>
              <tr className="text-xs" style={{ borderBottom: "1px solid var(--border)", color: "var(--ink-3)" }}>
                <th className="px-3 py-2 text-right font-medium">المعلم</th>
                <th className="px-3 py-2 text-center font-medium">شهور منشورة</th>
                <th className="px-3 py-2 text-center font-medium">الحجوزات</th>
                <th className="px-3 py-2 text-center font-medium">المحصل</th>
                <th className="px-3 py-2 text-center font-medium">شهور محجوزة</th>
                <th className="px-3 py-2 text-center font-medium">غير منشور</th>
                <th className="px-3 py-2 text-center font-medium">مبلغ غير مكتسب</th>
                <th className="px-3 py-2 text-center font-medium min-w-[120px]">التغطية</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {data.byTeacher.map((tr) => (
                <tr key={tr.teacherId} className="hover:bg-[var(--surface-2)]/50 transition-colors">
                  <td className="px-3 py-2.5 font-bold" style={{ color: "var(--ink)" }}>{tr.teacherName}</td>
                  <td className="px-3 py-2.5 text-center">
                    <span
                      className="inline-flex px-2 py-0.5 rounded text-xs font-bold"
                      style={{
                        background: tr.monthsPublished === 0 ? "rgba(239,68,68,.12)" : "rgba(99,102,241,.12)",
                        color: tr.monthsPublished === 0 ? "var(--danger)" : "var(--brand)",
                      }}
                    >
                      {ar(tr.monthsPublished)} شهر
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-center tabular-nums" style={{ color: "var(--ink-2)" }}>{ar(tr.bookings)}</td>
                  <td className="px-3 py-2.5 text-center tabular-nums font-bold" style={{ color: "var(--gold-2)" }}>{egp(tr.revenue)}</td>
                  <td className="px-3 py-2.5 text-center tabular-nums" style={{ color: "var(--ink-2)" }}>{ar(tr.monthsBooked)}</td>
                  <td className="px-3 py-2.5 text-center tabular-nums font-bold" style={{ color: "var(--orange)" }}>{ar(tr.monthsOutstanding)}</td>
                  <td className="px-3 py-2.5 text-center tabular-nums font-bold" style={{ color: "var(--danger)" }}>{egp(tr.outstandingValue)}</td>
                  <td className="px-3 py-2.5"><CoverageBar percent={tr.coveragePercent} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {tab === "students" && (
          <table className="w-full text-xs">
            <thead className="sticky top-0 z-10" style={{ background: "var(--surface-2)" }}>
              <tr className="text-xs" style={{ borderBottom: "1px solid var(--border)", color: "var(--ink-3)" }}>
                <th className="px-3 py-2 text-right font-medium">الطالب</th>
                <th className="px-3 py-2 text-right font-medium">المعلم</th>
                <th className="px-3 py-2 text-center font-medium">الباقة</th>
                <th className="px-3 py-2 text-center font-medium">دفع</th>
                <th className="px-3 py-2 text-center font-medium">حجز / سُلِّم</th>
                <th className="px-3 py-2 text-center font-medium">قيمة الشهر</th>
                <th className="px-3 py-2 text-center font-medium">مُستحق</th>
                <th className="px-3 py-2 text-center font-medium">غير مكتسب</th>
                <th className="px-3 py-2 text-center font-medium">ينتهي في</th>
                <th className="px-3 py-2 text-center font-medium min-w-[110px]">التغطية</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {data.topOutstanding.map((s) => (
                <tr key={s.subscriptionId} className="hover:bg-[var(--surface-2)]/50 transition-colors">
                  <td className="px-3 py-2.5 font-bold max-w-[180px] truncate" style={{ color: "var(--ink)" }} title={`${s.studentName} · ${s.studentPhone}`}>
                    {s.studentName}
                  </td>
                  <td className="px-3 py-2.5 text-xs max-w-[130px] truncate" style={{ color: "var(--ink-2)" }}>{s.teacherName}</td>
                  <td className="px-3 py-2.5 text-center">
                    <span className="inline-flex px-2 py-0.5 rounded text-xs font-bold" style={{ background: "rgba(99,102,241,.12)", color: "var(--brand)" }}>
                      {s.planLabel}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-center tabular-nums font-bold" style={{ color: "var(--gold-2)" }}>{egp(s.amountPaid)}</td>
                  <td className="px-3 py-2.5 text-center tabular-nums font-bold" style={{ color: "var(--ink-2)" }}>
                    {ar(s.monthsBooked)} / <span style={{ color: "var(--ok)" }}>{ar(s.monthsDelivered)}</span>
                  </td>
                  <td className="px-3 py-2.5 text-center tabular-nums" style={{ color: "var(--ink-3)" }}>{egp(s.valuePerMonth)}</td>
                  <td className="px-3 py-2.5 text-center tabular-nums" style={{ color: "var(--ok)" }}>{egp(s.deliveredValue)}</td>
                  <td className="px-3 py-2.5 text-center tabular-nums font-bold" style={{ color: "var(--danger)" }}>{egp(s.outstandingValue)}</td>
                  <td className="px-3 py-2.5 text-center text-xs" style={{ color: s.isExpired ? "var(--danger)" : "var(--ink-3)" }}>
                    {s.expiresAt ? new Date(s.expiresAt).toLocaleDateString("ar-EG", { year: "numeric", month: "short", day: "numeric" }) : "—"}
                  </td>
                  <td className="px-3 py-2.5"><CoverageBar percent={s.coveragePercent} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {tab === "drift" && (
          <div>
            <div className="px-4 py-2.5 text-xs leading-relaxed" style={{ background: "rgba(249,115,22,.07)", color: "var(--ink-2)" }}>
              حجوزات مدة صلاحيتها المخزّنة لا تطابق طول الباقة المعتمد. نشأت قبل توحيد حساب الشهور،
              وتظهر هنا للمراجعة فقط — لم يتم تعديل أي صف تلقائياً.
            </div>
            <table className="w-full text-xs">
              <thead className="sticky top-0 z-10" style={{ background: "var(--surface-2)" }}>
                <tr className="text-xs" style={{ borderBottom: "1px solid var(--border)", color: "var(--ink-3)" }}>
                  <th className="px-3 py-2 text-right font-medium">الطالب</th>
                  <th className="px-3 py-2 text-right font-medium">المعلم</th>
                  <th className="px-3 py-2 text-center font-medium">الباقة</th>
                  <th className="px-3 py-2 text-center font-medium">دفع</th>
                  <th className="px-3 py-2 text-center font-medium">المفترض</th>
                  <th className="px-3 py-2 text-center font-medium">الفعلي</th>
                  <th className="px-3 py-2 text-center font-medium">الفرق</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {data.drift.map((d) => (
                  <tr key={d.subscriptionId} className="hover:bg-[var(--surface-2)]/50 transition-colors">
                    <td className="px-3 py-2.5 font-bold max-w-[190px] truncate" style={{ color: "var(--ink)" }} title={d.studentName}>{d.studentName}</td>
                    <td className="px-3 py-2.5 text-xs max-w-[140px] truncate" style={{ color: "var(--ink-2)" }}>{d.teacherName}</td>
                    <td className="px-3 py-2.5 text-center text-xs" style={{ color: "var(--ink-2)" }}>{d.planType}</td>
                    <td className="px-3 py-2.5 text-center tabular-nums" style={{ color: "var(--gold-2)" }}>{egp(d.amountPaid)}</td>
                    <td className="px-3 py-2.5 text-center tabular-nums" style={{ color: "var(--ink-2)" }}>{ar(d.expectedMonths)} شهر</td>
                    <td className="px-3 py-2.5 text-center tabular-nums" style={{ color: "var(--ink-2)" }}>
                      {d.actualMonths === null ? "—" : `${d.actualMonths.toLocaleString("ar-EG")} شهر`}
                    </td>
                    <td className="px-3 py-2.5 text-center tabular-nums font-bold" style={{ color: d.driftMonths > 0 ? "var(--warn)" : "var(--danger)" }}>
                      {d.driftMonths > 0 ? "+" : ""}
                      {d.driftMonths.toLocaleString("ar-EG")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
