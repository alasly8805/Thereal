"use client";

import { useMemo, useState } from "react";
import { BookOpen, Search, Tag, Ticket, Users } from "lucide-react";
import type { OverviewTeacher, TeacherCourse } from "./types";
import { Card, CardHeader, EmptyState, Pill, StackedBar, Stat, ar, egp, discounted, tone } from "./primitives";

const PLAN_ORDER = ["monthly", "termly", "yearly"] as const;
const PLAN_LABEL: Record<(typeof PLAN_ORDER)[number], string> = {
  monthly: "شهري",
  termly: "ترم",
  yearly: "سنوي",
};

type Filter = "all" | "paid" | "free";

export function PricingTab({
  teachers,
  onOpenCourseStudents,
}: {
  teachers: OverviewTeacher[];
  onOpenCourseStudents?: (course: { id: string; title: string }, teacher: { name: string }) => void;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [teacherFilter, setTeacherFilter] = useState<string>("all");

  /* ── Summary numbers ─────────────────────────────────────────────────── */
  const summary = useMemo(() => {
    const all = teachers.flatMap((t) => t.courses.map((c) => ({ ...c, teacherName: t.name })));
    const paid = all.filter((c) => c.isPaid && c.price > 0);
    const prices = paid.map((c) => c.price);
    const coursesRevenue = all.reduce((s, c) => s + (c.revenue || 0), 0);
    const bookingsRevenue = teachers.reduce((s, t) => s + (t.realReservationsRevenue || 0), 0);
    const paidBookings = teachers.reduce((s, t) => s + (t.realPaidReservationsCount || 0), 0);
    return {
      total: all.length,
      paid: paid.length,
      free: all.length - paid.length,
      discounted: paid.filter((c) => (c.discountPercent ?? 0) > 0).length,
      min: prices.length ? Math.min(...prices) : 0,
      max: prices.length ? Math.max(...prices) : 0,
      avg: prices.length ? Math.round(prices.reduce((a, b) => a + b, 0) / prices.length) : 0,
      coursesRevenue,
      bookingsRevenue,
      paidBookings,
      avgBooking: paidBookings ? Math.round(bookingsRevenue / paidBookings) : 0,
    };
  }, [teachers]);

  /* ── Filtered course rows grouped by teacher ─────────────────────────── */
  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    return teachers
      .filter((t) => teacherFilter === "all" || t.id === teacherFilter)
      .map((t) => ({
        teacher: t,
        courses: t.courses.filter((c) => {
          if (filter === "paid" && !(c.isPaid && c.price > 0)) return false;
          if (filter === "free" && c.isPaid && c.price > 0) return false;
          if (q && !`${c.title} ${c.subject} ${t.name}`.toLowerCase().includes(q)) return false;
          return true;
        }),
      }))
      .filter((g) => g.courses.length > 0);
  }, [teachers, query, filter, teacherFilter]);

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-2.5">
        <Stat compact label="الكورسات" value={ar(summary.total)} sub={`${ar(summary.paid)} مدفوع · ${ar(summary.free)} مجاني`} color="brand" icon={<BookOpen size={14} />} />
        <Stat compact label="نطاق أسعار الكورسات" value={summary.paid ? `${ar(summary.min)}–${ar(summary.max)}` : "—"} sub={summary.paid ? `متوسط ${egp(summary.avg)}` : "لا توجد كورسات مدفوعة"} color="gold" icon={<Tag size={14} />} />
        <Stat compact label="كورسات عليها خصم" value={ar(summary.discounted)} sub="خصم نسبة مئوية نشط" color="amber" icon={<Tag size={14} />} />
        <Stat compact label="إيراد الكورسات" value={egp(summary.coursesRevenue)} sub="شراء مباشر فقط — بدون تكرار" color="green" icon={<BookOpen size={14} />} />
        <Stat compact label="إيراد باقات الحجز" value={egp(summary.bookingsRevenue)} sub={`${ar(summary.paidBookings)} حجز مدفوع`} color="sky" icon={<Ticket size={14} />} />
        <Stat compact label="متوسط قيمة الحجز" value={egp(summary.avgBooking)} sub="إيراد الحجوزات ÷ عددها" color="violet" icon={<Ticket size={14} />} />
      </div>

      {/* Plan prices per teacher */}
      <Card>
        <CardHeader
          icon={<Ticket size={16} />}
          title="أسعار باقات الحجز (احجز الآن) لكل معلم"
          subtitle="السعر المعلن للطالب لكل باقة، الخصم إن وُجد، زيادة مسار اللغات، وأي أسعار خاصة بمرحلة معينة — مع عدد الحجوزات الفعلية لكل باقة"
        />
        {teachers.length === 0 ? (
          <EmptyState icon={<Ticket size={28} />} text="لا يوجد معلمون بعد" />
        ) : (
          <div className="p-3 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {teachers.map((t) => (
              <TeacherPlanCard key={t.id} teacher={t} />
            ))}
          </div>
        )}
      </Card>

      {/* Course prices */}
      <Card>
        <CardHeader
          icon={<BookOpen size={16} />}
          title="أسعار الكورسات والمحصّل منها"
          subtitle="لكل كورس: السعر، السعر بعد الخصم، توزيع الطلاب (دفع مباشر / مشمول بباقة حجز / مجاني)، والإيراد المحسوب"
          actions={
            <>
              <div className="relative">
                <Search size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2" style={{ color: "var(--ink-3)" }} />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="ابحث باسم الكورس أو المادة أو المعلم"
                  className="pr-8 pl-3 py-1.5 rounded-lg text-xs outline-none w-56"
                  style={{ background: "var(--surface-2)", border: "1px solid var(--border)", color: "var(--ink)" }}
                />
              </div>
              <select
                value={teacherFilter}
                onChange={(e) => setTeacherFilter(e.target.value)}
                className="px-2 py-1.5 rounded-lg text-xs outline-none"
                style={{ background: "var(--surface-2)", border: "1px solid var(--border)", color: "var(--ink)" }}
              >
                <option value="all">كل المعلمين</option>
                {teachers.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
              <div className="inline-flex rounded-lg overflow-hidden" style={{ border: "1px solid var(--border)" }}>
                {(["all", "paid", "free"] as Filter[]).map((f) => (
                  <button
                    key={f}
                    onClick={() => setFilter(f)}
                    className="px-2.5 py-1.5 text-xs font-bold cursor-pointer transition-colors"
                    style={{
                      background: filter === f ? "var(--brand)" : "var(--surface-2)",
                      color: filter === f ? "var(--on-brand)" : "var(--ink-2)",
                    }}
                  >
                    {f === "all" ? "الكل" : f === "paid" ? "مدفوع" : "مجاني"}
                  </button>
                ))}
              </div>
            </>
          }
        />

        {groups.length === 0 ? (
          <EmptyState icon={<BookOpen size={28} />} text="لا توجد كورسات مطابقة" />
        ) : (
          <div className="divide-y divide-[var(--border)]">
            {groups.map(({ teacher, courses }) => {
              const groupRevenue = courses.reduce((s, c) => s + (c.revenue || 0), 0);
              return (
                <div key={teacher.id}>
                  <div className="px-4 py-2 flex items-center justify-between gap-2" style={{ background: "var(--surface-2)" }}>
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="w-6 h-6 rounded-md text-[var(--on-brand)] text-xs font-black flex items-center justify-center shrink-0" style={{ background: "var(--brand)" }}>
                        {teacher.name[0]}
                      </span>
                      <span className="text-xs font-black truncate" style={{ color: "var(--ink)" }}>{teacher.name}</span>
                      <span className="text-xs" style={{ color: "var(--ink-3)" }}>{ar(courses.length)} كورس</span>
                    </div>
                    <span className="text-xs font-bold tabular-nums" style={{ color: tone.green }}>{egp(groupRevenue)}</span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-xs" style={{ color: "var(--ink-3)" }}>
                          <th className="px-4 py-1.5 text-right font-medium">الكورس</th>
                          <th className="px-3 py-1.5 text-center font-medium">السعر</th>
                          <th className="px-3 py-1.5 text-right font-medium min-w-[220px]">الطلاب — من أين جاء الدفع</th>
                          <th className="px-3 py-1.5 text-center font-medium">أكواد</th>
                          <th className="px-3 py-1.5 text-center font-medium">الإيراد</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[var(--border)]">
                        {courses.map((c) => (
                          <CourseRow key={c.id} course={c} teacher={teacher} onOpenStudents={onOpenCourseStudents} />
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}

/* ─── Teacher plan card ──────────────────────────────────────────────────── */

function TeacherPlanCard({ teacher: t }: { teacher: OverviewTeacher }) {
  const p = t.planPricing;
  const bookingsByPlan = useMemo(() => {
    const m: Record<string, { count: number; revenue: number }> = {};
    for (const s of t.subscriptions || []) {
      const k = s.planType;
      if (!m[k]) m[k] = { count: 0, revenue: 0 };
      m[k].count += 1;
      m[k].revenue += s.amount || 0;
    }
    return m;
  }, [t.subscriptions]);

  return (
    <div className="rounded-xl p-3.5 flex flex-col gap-3" style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-sm font-black truncate" style={{ color: "var(--ink)" }}>{t.name}</div>
          <div className="flex flex-wrap gap-1 mt-1">
            {p?.isPublished ? <Pill color="green">صفحة منشورة</Pill> : <Pill color="slate">صفحة غير منشورة</Pill>}
            {p?.usesDefaults && <Pill color="amber" title="لم يضبط المعلم أسعاره — تُستخدم أسعار المنصة الافتراضية">أسعار افتراضية</Pill>}
            {p && !p.enableLanguagesTrack && <Pill color="slate">مسار اللغات مغلق</Pill>}
          </div>
        </div>
        <div className="text-left shrink-0">
          <div className="text-xs" style={{ color: "var(--ink-3)" }}>حصة المنصة</div>
          <div className="text-sm font-black tabular-nums" style={{ color: tone.sky }}>{ar(t.platformPercentage ?? 25)}٪</div>
        </div>
      </div>

      {/* Plan grid */}
      <div className="grid grid-cols-3 gap-2">
        {PLAN_ORDER.map((k) => {
          const base = p?.base[k] ?? 0;
          const disc = p?.discounts[k] ?? 0;
          const after = discounted(base, disc);
          const lang = p?.languagesSurcharge[k] ?? 0;
          const b = bookingsByPlan[k];
          return (
            <div key={k} className="rounded-lg p-2.5 flex flex-col gap-1" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
              <div className="text-xs font-bold" style={{ color: "var(--ink-3)" }}>{PLAN_LABEL[k]}</div>
              <div className="flex items-baseline gap-1.5 flex-wrap">
                <span className="text-base font-black tabular-nums leading-none" style={{ color: tone.gold, fontFamily: "var(--font-head)" }}>
                  {ar(after ?? base)}
                </span>
                <span className="text-xs" style={{ color: "var(--ink-3)" }}>ج.م</span>
                {after !== null && (
                  <span className="text-xs line-through tabular-nums" style={{ color: "var(--ink-3)" }}>{ar(base)}</span>
                )}
              </div>
              {disc > 0 && <Pill color="amber" className="self-start">خصم {ar(disc)}٪</Pill>}
              {p?.enableLanguagesTrack && lang > 0 && (
                <div className="text-xs" style={{ color: "var(--ink-2)" }}>لغات: +{ar(lang)}</div>
              )}
              <div className="text-xs mt-auto pt-1 tabular-nums" style={{ color: b?.count ? tone.green : "var(--ink-3)" }}>
                {b?.count ? `${ar(b.count)} حجز · ${egp(b.revenue)}` : "لا حجوزات"}
              </div>
            </div>
          );
        })}
      </div>

      {/* Stage overrides */}
      {p && p.stages.length > 0 && (
        <div className="rounded-lg overflow-hidden" style={{ border: "1px solid var(--border)" }}>
          <div className="px-2.5 py-1.5 text-xs font-bold" style={{ background: "var(--surface)", color: "var(--ink-2)" }}>
            أسعار خاصة بالمرحلة
          </div>
          <table className="w-full text-xs">
            <tbody className="divide-y divide-[var(--border)]">
              {p.stages.map((s) => (
                <tr key={s.key}>
                  <td className="px-2.5 py-1.5 font-bold" style={{ color: "var(--ink)" }}>
                    {s.label}
                    {!s.bookingEnabled && <Pill color="red" className="mr-1.5">الحجز مغلق</Pill>}
                  </td>
                  <td className="px-2 py-1.5 text-center tabular-nums" style={{ color: "var(--ink-2)" }}>{ar(s.monthly)}</td>
                  <td className="px-2 py-1.5 text-center tabular-nums" style={{ color: "var(--ink-2)" }}>{ar(s.termly)}</td>
                  <td className="px-2 py-1.5 text-center tabular-nums" style={{ color: "var(--ink-2)" }}>{ar(s.yearly)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ─── Course row ─────────────────────────────────────────────────────────── */

function CourseRow({
  course: c,
  teacher,
  onOpenStudents,
}: {
  course: TeacherCourse;
  teacher: OverviewTeacher;
  onOpenStudents?: (course: { id: string; title: string }, teacher: { name: string }) => void;
}) {
  const isPaid = c.isPaid && c.price > 0;
  const after = isPaid ? discounted(c.price, c.discountPercent) : null;
  const direct = c.coursePaidStudentsCount ?? 0;
  const covered = c.courseCoveredBySubCount ?? 0;
  const free = isPaid ? Math.max(0, c.enrolledStudents - direct - covered) : c.enrolledStudents;

  return (
    <tr className="hover:bg-[var(--surface-2)]/50 transition-colors">
      <td className="px-4 py-2.5 max-w-[260px]">
        <div className="font-bold truncate" style={{ color: "var(--ink)" }} title={c.title}>{c.title}</div>
        <div className="text-xs mt-0.5 flex items-center gap-1.5" style={{ color: "var(--ink-3)" }}>
          <span>{c.subject}</span>
          {isPaid ? <Pill color="gold">مدفوع</Pill> : <Pill color="slate">مجاني</Pill>}
        </div>
      </td>
      <td className="px-3 py-2.5 text-center whitespace-nowrap">
        {isPaid ? (
          <div className="flex flex-col items-center">
            <span className="font-black tabular-nums" style={{ color: tone.gold }}>{egp(after ?? c.price)}</span>
            {after !== null && (
              <span className="text-xs" style={{ color: "var(--ink-3)" }}>
                <span className="line-through">{ar(c.price)}</span> · خصم {ar(c.discountPercent ?? 0)}٪
              </span>
            )}
          </div>
        ) : (
          <span className="text-xs" style={{ color: "var(--ink-3)" }}>—</span>
        )}
      </td>
      <td className="px-3 py-2.5">
        <button
          type="button"
          onClick={() => onOpenStudents?.(c, teacher)}
          className="w-full text-right cursor-pointer group"
          title="عرض وإدارة طلاب الكورس"
        >
          <div className="flex items-center justify-between mb-1">
            <span className="inline-flex items-center gap-1 text-xs font-black tabular-nums" style={{ color: "var(--ink)" }}>
              <Users size={11} /> {ar(c.enrolledStudents)} طالب
            </span>
            <span className="text-xs underline opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: tone.brand }}>إدارة</span>
          </div>
          <StackedBar
            height={6}
            segments={[
              { label: "دفع مباشر", value: direct, color: tone.green },
              { label: "مشمول بحجز", value: covered, color: tone.sky },
              { label: "مجاني", value: free, color: "var(--ink-3)" },
            ]}
          />
        </button>
      </td>
      <td className="px-3 py-2.5 text-center text-xs tabular-nums whitespace-nowrap" style={{ color: "var(--ink-2)" }} title="أكواد مستخدمة / إجمالي الأكواد">
        {ar(c.usedCodes ?? 0)} / {ar(c.totalCodes ?? 0)}
      </td>
      <td className="px-3 py-2.5 text-center whitespace-nowrap">
        {c.revenue > 0 ? (
          <span className="font-black tabular-nums" style={{ color: tone.green }}>{egp(c.revenue)}</span>
        ) : (
          <span className="text-xs" style={{ color: "var(--ink-3)" }}>—</span>
        )}
      </td>
    </tr>
  );
}
