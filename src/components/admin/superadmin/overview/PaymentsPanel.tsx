"use client";

import { useMemo, useState, type ReactNode } from "react";
import { Search } from "lucide-react";
import type { OverviewCoursePayment, OverviewSubscription, OverviewTeacher } from "./types";
import { PaymentSourcePill, Pill, ar, egp, fmtDate, fmtTime, tone } from "./primitives";
import { cairoKey, formatCairoDay, shiftCairoDay, weekday } from "./SignupsByDay";

type Filter = "paid" | "all";

function matchesQuery(
  q: string,
  ...parts: Array<string | null | undefined>
) {
  if (!q) return true;
  return parts.some((p) => (p || "").toLowerCase().includes(q));
}

function StudentCell({ name, phone }: { name: string; phone: string }) {
  return (
    <td className="px-3 py-2">
      <div className="font-bold" style={{ color: "var(--ink)" }}>{name}</div>
      <div className="font-mono text-xs" style={{ color: "var(--ink-3)" }} dir="ltr">{phone}</div>
    </td>
  );
}

function AmountCell({ amount, covered }: { amount: number; covered?: boolean }) {
  return (
    <td className="px-3 py-2 text-center whitespace-nowrap">
      {covered ? (
        <span className="text-xs" style={{ color: "var(--ink-3)" }}>مغطى بالباقة</span>
      ) : amount > 0 ? (
        <span className="font-black tabular-nums" style={{ color: tone.green }}>{egp(amount)}</span>
      ) : (
        <span className="text-xs" style={{ color: "var(--ink-3)" }}>مجاني</span>
      )}
    </td>
  );
}

function DateCell({ iso }: { iso: string }) {
  return (
    <td className="px-3 py-2 text-center text-xs whitespace-nowrap tabular-nums" style={{ color: "var(--ink-2)" }}>
      {fmtDate(iso)}<br /><span style={{ color: "var(--ink-3)" }}>{fmtTime(iso)}</span>
    </td>
  );
}

function TableShell({
  children,
  empty,
}: {
  children: ReactNode;
  empty?: string;
}) {
  if (empty) {
    return <p className="p-4 text-xs text-center" style={{ color: "var(--ink-3)" }}>{empty}</p>;
  }
  return <div className="overflow-x-auto max-h-80 overflow-y-auto">{children}</div>;
}

function Toolbar({
  query,
  onQuery,
  filter,
  onFilter,
  paidLabel,
}: {
  query: string;
  onQuery: (v: string) => void;
  filter: Filter;
  onFilter: (v: Filter) => void;
  paidLabel: string;
}) {
  return (
    <div className="px-3 py-2 flex flex-wrap items-center gap-2" style={{ borderBottom: "1px solid var(--border)" }}>
      <div className="relative flex-1 min-w-[140px]">
        <Search size={12} className="absolute right-2 top-1/2 -translate-y-1/2" style={{ color: "var(--ink-3)" }} />
        <input
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          placeholder="ابحث باسم الطالب أو الهاتف"
          className="w-full pr-7 pl-2 py-1 rounded-lg text-xs outline-none"
          style={{ background: "var(--surface-2)", border: "1px solid var(--border)", color: "var(--ink)" }}
        />
      </div>
      <div className="flex gap-1">
        <button
          type="button"
          onClick={() => onFilter("paid")}
          className="px-2 py-1 rounded-md text-xs font-bold cursor-pointer"
          style={{
            background: filter === "paid" ? "var(--brand-soft)" : "transparent",
            color: filter === "paid" ? "var(--brand)" : "var(--ink-3)",
          }}
        >
          {paidLabel}
        </button>
        <button
          type="button"
          onClick={() => onFilter("all")}
          className="px-2 py-1 rounded-md text-xs font-bold cursor-pointer"
          style={{
            background: filter === "all" ? "var(--brand-soft)" : "transparent",
            color: filter === "all" ? "var(--brand)" : "var(--ink-3)",
          }}
        >
          الكل
        </button>
      </div>
    </div>
  );
}

function BookingsTable({
  rows,
  showTeacher,
}: {
  rows: Array<OverviewSubscription & { teacherName?: string }>;
  showTeacher: boolean;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("paid");
  const q = query.trim().toLowerCase();
  const visible = useMemo(() => {
    return rows.filter((s) => {
      if (filter === "paid" && !(s.amount > 0)) return false;
      return matchesQuery(q, s.studentName, s.studentPhone, s.planLabel, s.teacherName, s.educationalStage);
    });
  }, [rows, q, filter]);

  const paidCount = rows.filter((s) => s.amount > 0).length;

  return (
    <>
      <Toolbar
        query={query}
        onQuery={setQuery}
        filter={filter}
        onFilter={setFilter}
        paidLabel={`مدفوع (${ar(paidCount)})`}
      />
      <TableShell empty={visible.length === 0 ? (rows.length === 0 ? "لا توجد حجوزات باقات بعد." : "لا نتائج مطابقة") : undefined}>
        <table className="w-full text-xs">
          <thead className="sticky top-0" style={{ background: "var(--surface-2)" }}>
            <tr className="text-xs" style={{ color: "var(--ink-3)" }}>
              <th className="px-3 py-2 text-right font-medium">الطالب</th>
              {showTeacher && <th className="px-3 py-2 text-center font-medium">المعلم</th>}
              <th className="px-3 py-2 text-center font-medium">اشترى إيه</th>
              <th className="px-3 py-2 text-center font-medium">طريقة الدفع</th>
              <th className="px-3 py-2 text-center font-medium">كم دفع</th>
              <th className="px-3 py-2 text-center font-medium">التاريخ</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]">
            {visible.map((s) => (
              <tr key={s.id} className="hover:bg-[var(--surface-2)]/50">
                <StudentCell name={s.studentName} phone={s.studentPhone} />
                {showTeacher && (
                  <td className="px-3 py-2 text-center text-xs" style={{ color: "var(--ink-2)" }}>{s.teacherName}</td>
                )}
                <td className="px-3 py-2 text-center">
                  <div className="flex flex-col items-center gap-1">
                    <Pill color="brand">{s.planLabel}</Pill>
                    <span className="text-xs" style={{ color: "var(--ink-3)" }}>
                      {s.educationalStage} · {s.languageTrack === "languages" ? "لغات" : "عربي"}
                    </span>
                  </div>
                </td>
                <td className="px-3 py-2 text-center">
                  <div className="flex flex-col items-center gap-1">
                    <PaymentSourcePill source={s.paymentSource} registeredBy={s.registeredBy} />
                    {s.paymentRef && (
                      <span className="text-xs font-mono px-1.5 py-0.5 rounded" dir="ltr" style={{ background: "var(--surface-2)", color: "var(--ink-2)" }} title="الرقم المرجعي">
                        {s.gatewayProvider ? `${s.gatewayProvider}: ` : ""}{s.paymentRef}
                      </span>
                    )}
                  </div>
                </td>
                <AmountCell amount={s.amount} />
                <DateCell iso={s.createdAt} />
              </tr>
            ))}
          </tbody>
        </table>
      </TableShell>
    </>
  );
}

function CoursesTable({
  rows,
  showTeacher,
}: {
  rows: Array<OverviewCoursePayment & { teacherName?: string }>;
  showTeacher: boolean;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("paid");
  const q = query.trim().toLowerCase();
  const visible = useMemo(() => {
    return rows.filter((p) => {
      if (filter === "paid" && (p.coveredBySubscription || p.amount <= 0)) return false;
      return matchesQuery(q, p.studentName, p.studentPhone, p.courseTitle, p.teacherName);
    });
  }, [rows, q, filter]);

  const paidCount = rows.filter((p) => !p.coveredBySubscription && p.amount > 0).length;

  return (
    <>
      <Toolbar
        query={query}
        onQuery={setQuery}
        filter={filter}
        onFilter={setFilter}
        paidLabel={`مدفوع (${ar(paidCount)})`}
      />
      <TableShell empty={visible.length === 0 ? (rows.length === 0 ? "لا توجد مشتريات كورسات بعد." : "لا نتائج مطابقة — جرّب «الكل» لعرض المغطى بالباقة") : undefined}>
        <table className="w-full text-xs">
          <thead className="sticky top-0" style={{ background: "var(--surface-2)" }}>
            <tr className="text-xs" style={{ color: "var(--ink-3)" }}>
              <th className="px-3 py-2 text-right font-medium">الطالب</th>
              {showTeacher && <th className="px-3 py-2 text-center font-medium">المعلم</th>}
              <th className="px-3 py-2 text-center font-medium">اشترى إيه</th>
              <th className="px-3 py-2 text-center font-medium">الحالة</th>
              <th className="px-3 py-2 text-center font-medium">كم دفع</th>
              <th className="px-3 py-2 text-center font-medium">التاريخ</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]">
            {visible.map((p) => (
              <tr key={p.id} className="hover:bg-[var(--surface-2)]/50">
                <StudentCell name={p.studentName} phone={p.studentPhone} />
                {showTeacher && (
                  <td className="px-3 py-2 text-center text-xs" style={{ color: "var(--ink-2)" }}>{p.teacherName}</td>
                )}
                <td className="px-3 py-2 text-center max-w-[180px]">
                  <div className="font-bold truncate" style={{ color: "var(--ink)" }} title={p.courseTitle}>{p.courseTitle}</div>
                </td>
                <td className="px-3 py-2 text-center">
                  <PaymentSourcePill source={p.source} />
                </td>
                <AmountCell amount={p.amount} covered={p.coveredBySubscription} />
                <DateCell iso={p.createdAt} />
              </tr>
            ))}
          </tbody>
        </table>
      </TableShell>
    </>
  );
}

function PaidByDay({ rows }: { rows: Array<{ createdAt: string; amount: number }> }) {
  const today = cairoKey();
  const byDate = useMemo(() => {
    const m = new Map<string, { count: number; amount: number }>();
    for (const r of rows) {
      const key = cairoKey(new Date(r.createdAt));
      const cur = m.get(key) ?? { count: 0, amount: 0 };
      cur.count += 1;
      cur.amount += r.amount;
      m.set(key, cur);
    }
    return m;
  }, [rows]);

  const last14 = Array.from({ length: 14 }, (_, i) => {
    const date = shiftCairoDay(today, i - 13);
    return { date, ...(byDate.get(date) ?? { count: 0, amount: 0 }) };
  });
  const todayRow = last14[13];
  const yesterdayRow = last14[12];
  const weekCount = last14.slice(-7).reduce((s, x) => s + x.count, 0);
  const max14 = Math.max(1, ...last14.map((x) => x.count));

  return (
    <div className="mt-3 pt-3" style={{ borderTop: "1px solid var(--border)" }}>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
        <span className="text-xs font-bold" style={{ color: "var(--ink-3)" }}>
          اشتركوا بالدفع يوم بيوم (توقيت القاهرة)
        </span>
        <div className="flex flex-wrap gap-1.5 text-xs font-bold tabular-nums">
          <span className="px-2 py-1 rounded-lg" style={{ background: "var(--brand-soft)", color: "var(--brand)" }}>
            اليوم {ar(todayRow.count)} · {egp(todayRow.amount)}
          </span>
          <span className="px-2 py-1 rounded-lg" style={{ background: "var(--surface-2)", color: "var(--ink-2)" }}>
            أمس {ar(yesterdayRow.count)}
          </span>
          <span className="px-2 py-1 rounded-lg" style={{ background: "var(--surface-2)", color: "var(--ink-2)" }}>
            آخر ٧ أيام {ar(weekCount)}
          </span>
        </div>
      </div>
      <div className="flex items-end gap-1 h-20 px-0.5">
        {last14.map((d) => {
          const h = Math.max(d.count > 0 ? 6 : 2, Math.round((d.count / max14) * 48));
          const isToday = d.date === today;
          return (
            <div
              key={d.date}
              className="flex-1 min-w-0 flex flex-col items-center gap-1"
              title={`${formatCairoDay(d.date)}: ${d.count} مدفوع · ${d.amount} ج.م`}
            >
              <span className="text-xs font-black tabular-nums" style={{ color: d.count > 0 ? "var(--ink)" : "var(--ink-3)" }}>
                {ar(d.count)}
              </span>
              <div
                className="w-full rounded-t-md"
                style={{
                  height: h,
                  background: isToday ? tone.green : d.count > 0 ? `color-mix(in srgb, ${tone.green} 55%, var(--surface-2))` : "var(--surface-2)",
                }}
              />
              <span className="text-xs truncate w-full text-center" style={{ color: isToday ? tone.green : "var(--ink-3)" }}>
                {weekday(d.date)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function PaymentsPanel({
  teachers,
  teacher,
}: {
  teachers?: OverviewTeacher[];
  teacher?: OverviewTeacher;
}) {
  const showTeacher = !teacher;
  const list = teacher ? [teacher] : teachers || [];

  const bookings = list.flatMap((t) =>
    (t.subscriptions || []).map((s) => ({ ...s, teacherName: t.name }))
  );
  const coursePays = list.flatMap((t) =>
    (t.coursePayments || []).map((p) => ({ ...p, teacherName: t.name }))
  );

  const paidBookings = bookings.filter((s) => s.amount > 0);
  const bookingsRevenue = paidBookings.reduce((s, x) => s + x.amount, 0);
  const paidCourseRows = coursePays.filter((p) => !p.coveredBySubscription && p.amount > 0);
  const coursesRevenue = teacher
    ? teacher.coursesRevenue ?? paidCourseRows.reduce((s, x) => s + x.amount, 0)
    : list.reduce((s, t) => s + (t.coursesRevenue || 0), 0);
  const courseCount = teacher
    ? teacher.courses.length
    : list.reduce((s, t) => s + t.courses.filter((c) => c.isPaid).length, 0);
  const coveredCount = coursePays.filter((p) => p.coveredBySubscription).length;
  const paidCount = paidBookings.length + paidCourseRows.length;
  const totalRevenue = bookingsRevenue + coursesRevenue;

  return (
    <div className="space-y-3">
      <div
        className="rounded-xl px-4 py-3"
        style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
      >
        <div className="text-xs font-bold" style={{ color: "var(--ink-3)" }}>
          إجمالي المدفوع — الباقات + الكورسات
        </div>
        <div className="text-lg font-black tabular-nums mt-0.5" style={{ color: tone.green }}>
          {ar(paidCount)} مدفوع · {egp(totalRevenue)}
        </div>
        <div className="text-xs mt-0.5 tabular-nums" style={{ color: "var(--ink-3)" }}>
          {ar(paidBookings.length)} باقة · {egp(bookingsRevenue)}
          {"  +  "}
          {ar(paidCourseRows.length)} كورس · {egp(coursesRevenue)}
          {courseCount > 0 ? ` · ${ar(courseCount)} كورس مدفوع` : ""}
        </div>
        <PaidByDay rows={[...paidBookings, ...paidCourseRows]} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
        <div className="rounded-xl overflow-hidden" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
          <div className="px-3 py-2 flex items-center justify-between gap-2" style={{ background: "var(--surface-2)", borderBottom: "1px solid var(--border)" }}>
            <h3 className="text-xs font-bold" style={{ color: "var(--ink)" }}>🎟️ حجوزات الباقات — ما دفعه كل طالب</h3>
            <span className="text-xs font-bold tabular-nums shrink-0" style={{ color: tone.green }}>
              {ar(paidBookings.length)} مدفوع · {egp(bookingsRevenue)}
            </span>
          </div>
          <BookingsTable rows={bookings} showTeacher={showTeacher} />
        </div>

        <div className="rounded-xl overflow-hidden" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
          <div className="px-3 py-2 flex items-center justify-between gap-2" style={{ background: "var(--surface-2)", borderBottom: "1px solid var(--border)" }}>
            <div className="min-w-0">
              <h3 className="text-xs font-bold" style={{ color: "var(--ink)" }}>📚 الكورسات — المدفوع فقط يدخل في الإيراد</h3>
              {coveredCount > 0 && (
                <p className="text-xs mt-0.5" style={{ color: "var(--ink-3)" }}>
                  {ar(coveredCount)} مقعد مغطى بالباقة (لا يُضاف للـ {egp(coursesRevenue)})
                </p>
              )}
            </div>
            <span className="text-xs font-bold tabular-nums shrink-0" style={{ color: tone.gold }}>
              {ar(paidCourseRows.length)} طالب دفع · {ar(courseCount)} كورس · {egp(coursesRevenue)}
            </span>
          </div>
          <CoursesTable rows={coursePays} showTeacher={showTeacher} />
        </div>
      </div>
    </div>
  );
}
