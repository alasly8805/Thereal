"use client";

import { useMemo, useState } from "react";
import { ChevronDown, DoorOpen, GraduationCap, Search, Trash2, Users } from "lucide-react";
import type { OverviewData, OverviewTeacher } from "./types";
import { Card, CardHeader, EmptyState, Pill, StackedBar, ar, egp, fmtDate, tone } from "./primitives";
import { PaymentsPanel } from "./PaymentsPanel";

type SortKey = "revenue" | "students" | "name" | "newest";

export function TeachersTab({
  overview,
  expandedTeacher,
  setExpandedTeacher,
  onDeleteTeacher,
  onOpenCourseStudents,
}: {
  overview: OverviewData;
  expandedTeacher: string | null;
  setExpandedTeacher: (id: string | null) => void;
  onDeleteTeacher: (t: { id: string; name: string }) => void;
  onOpenCourseStudents: (course: { id: string; title: string }, teacher: { name: string }) => void;
}) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("revenue");
  const defaultPct = overview.moneyControl?.defaultPercentage ?? 25;

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = overview.teachers.filter((t) => !q || `${t.name} ${t.email}`.toLowerCase().includes(q));
    const by: Record<SortKey, (a: OverviewTeacher, b: OverviewTeacher) => number> = {
      revenue: (a, b) => (b.totalRevenue || 0) - (a.totalRevenue || 0),
      students: (a, b) => (b.totalPaidStudents || 0) - (a.totalPaidStudents || 0),
      name: (a, b) => a.name.localeCompare(b.name, "ar"),
      newest: (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    };
    return [...list].sort(by[sort]);
  }, [overview.teachers, query, sort]);

  return (
    <Card>
      <CardHeader
        icon={<GraduationCap size={16} />}
        title="المعلمون — الدخل الفعلي وتوزيع الأرباح"
        subtitle={`الإيراد يُحسب مما دفعه الطلاب فعلاً. حصة المنصة الافتراضية ${ar(defaultPct)}٪ أو نسبة مخصصة لكل معلم من "التحكم في الأموال"`}
        actions={
          <>
            <div className="relative">
              <Search size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2" style={{ color: "var(--ink-3)" }} />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="ابحث عن معلم"
                className="pr-8 pl-3 py-1.5 rounded-lg text-xs outline-none w-44"
                style={{ background: "var(--surface-2)", border: "1px solid var(--border)", color: "var(--ink)" }}
              />
            </div>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as SortKey)}
              className="px-2 py-1.5 rounded-lg text-xs outline-none"
              style={{ background: "var(--surface-2)", border: "1px solid var(--border)", color: "var(--ink)" }}
            >
              <option value="revenue">الأعلى دخلاً</option>
              <option value="students">الأكثر طلاباً دافعين</option>
              <option value="newest">الأحدث</option>
              <option value="name">الاسم</option>
            </select>
          </>
        }
      />

      {rows.length === 0 ? (
        <EmptyState icon={<GraduationCap size={28} />} text={overview.teachers.length === 0 ? "لا يوجد مدرسون بعد" : "لا نتائج مطابقة"} />
      ) : (
        <div className="divide-y divide-[var(--border)]">
          {rows.map((t) => (
            <TeacherRow
              key={t.id}
              t={t}
              defaultPct={defaultPct}
              expanded={expandedTeacher === t.id}
              onToggle={() => setExpandedTeacher(expandedTeacher === t.id ? null : t.id)}
              onDelete={() => onDeleteTeacher({ id: t.id, name: t.name })}
              onOpenCourseStudents={onOpenCourseStudents}
            />
          ))}
        </div>
      )}
    </Card>
  );
}

function TeacherRow({
  t,
  defaultPct,
  expanded,
  onToggle,
  onDelete,
  onOpenCourseStudents,
}: {
  t: OverviewTeacher;
  defaultPct: number;
  expanded: boolean;
  onToggle: () => void;
  onDelete: () => void;
  onOpenCourseStudents: (course: { id: string; title: string }, teacher: { name: string }) => void;
}) {
  const revenue = t.totalRevenue ?? 0;
  const pctVal = t.platformPercentage ?? defaultPct;
  const platformShare = t.platformShare ?? (revenue * pctVal) / 100;
  const teacherShare = t.teacherShare ?? revenue - platformShare;
  const paidSubs = t.realPaidReservationsCount ?? t.subscriptions.filter((s) => s.amount > 0).length;
  const freeSubs = t.realFreeReservationsCount ?? t.subscriptions.length - paidSubs;
  const subsRevenue = t.realReservationsRevenue ?? 0;
  const coursesRevenue = t.coursesRevenue ?? 0;
  const courseStudents = t.courseEnrolledStudents ?? t.courses.reduce((s, c) => s + c.enrolledStudents, 0);
  const paidStudents = t.totalPaidStudents ?? paidSubs;

  return (
    <div>
      {/* Collapsed row */}
      <div
        role="button"
        tabIndex={0}
        onClick={onToggle}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onToggle();
          }
        }}
        className="w-full px-4 py-3 grid gap-3 items-center cursor-pointer transition-colors hover:bg-[var(--surface-2)]/60 grid-cols-1 sm:grid-cols-[minmax(180px,1.4fr)_minmax(160px,2fr)_auto]"
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl text-white flex items-center justify-center font-black text-base shrink-0" style={{ background: "var(--brand)" }}>
            {t.name[0]}
          </div>
          <div className="min-w-0">
            <div className="font-bold truncate text-sm" style={{ color: "var(--ink)" }}>{t.name}</div>
            <div className="text-[10px] truncate flex items-center gap-1.5" style={{ color: "var(--ink-3)" }}>
              <span>{ar(t.totalCourses)} كورس</span>·<span>{ar(courseStudents)} طالب في الكورسات</span>·
              <span style={{ color: tone.green }}>{ar(paidStudents)} دفعوا</span>
              {freeSubs > 0 && <>·<span>{ar(freeSubs)} مجاناً</span></>}
            </div>
          </div>
        </div>

        <div className="min-w-0">
          <div className="flex items-center justify-between text-[11px] mb-1">
            <span className="font-black tabular-nums" style={{ color: tone.green }}>{egp(revenue)} <span className="font-medium" style={{ color: "var(--ink-3)" }}>إجمالي</span></span>
            <span className="tabular-nums" style={{ color: "var(--ink-3)" }}>
              منصة <b style={{ color: tone.sky }}>{egp(platformShare)}</b> ({ar(pctVal)}٪) · معلم <b style={{ color: tone.gold }}>{egp(teacherShare)}</b>
            </span>
          </div>
          <StackedBar
            legend={false}
            height={6}
            segments={[
              { label: "حصة المنصة", value: platformShare, color: tone.sky },
              { label: "مستحقات المعلم", value: teacherShare, color: tone.gold },
            ]}
          />
        </div>

        <div className="flex items-center gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
          <form action="/adminpanel/enter-teacher" method="post">
            <input type="hidden" name="teacherId" value={t.id} />
            <button
              type="submit"
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-bold cursor-pointer transition-colors"
              style={{ background: "var(--brand-soft)", color: "var(--brand)", border: "1px solid transparent" }}
              title={`دخول لوحة تحكم المعلم (${t.name})`}
            >
              <DoorOpen size={13} />
              <span className="hidden md:inline">لوحة المعلم</span>
            </button>
          </form>
          <button
            onClick={onDelete}
            className="w-8 h-8 flex items-center justify-center rounded-lg cursor-pointer transition-colors hover:bg-[var(--danger-soft)]"
            style={{ color: "var(--danger)" }}
            aria-label={`حذف ${t.name}`}
          >
            <Trash2 size={14} />
          </button>
          <button
            onClick={onToggle}
            className="w-8 h-8 flex items-center justify-center rounded-lg cursor-pointer"
            style={{ color: "var(--ink-3)" }}
            aria-label={expanded ? "طي" : "توسيع"}
          >
            <ChevronDown size={16} className={`transition-transform ${expanded ? "rotate-180" : ""}`} />
          </button>
        </div>
      </div>

      {/* Expanded */}
      {expanded && (
        <div className="px-4 pb-4 space-y-3" style={{ background: "var(--bg)", borderTop: "1px solid var(--border)" }}>
          {/* Mini facts */}
          <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-2 pt-3 text-[11px]">
            {[
              { l: "إيراد الحجوزات", v: egp(subsRevenue), c: tone.sky },
              { l: "إيراد الكورسات", v: egp(coursesRevenue), c: tone.green },
              { l: "حجوزات مدفوعة", v: ar(paidSubs), c: tone.green },
              { l: "حجوزات مجانية", v: ar(freeSubs), c: "var(--ink-2)" },
              { l: "أكواد مستخدمة / كل الأكواد", v: `${ar(t.usedCodes ?? 0)} / ${ar(t.totalCodes ?? 0)}`, c: "var(--ink-2)" },
              { l: "انضم في", v: fmtDate(t.createdAt), c: "var(--ink-2)" },
            ].map((f) => (
              <div key={f.l} className="rounded-lg px-2.5 py-2" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
                <div style={{ color: "var(--ink-3)" }} className="text-[10px]">{f.l}</div>
                <div className="font-black tabular-nums mt-0.5" style={{ color: f.c }}>{f.v}</div>
              </div>
            ))}
          </div>

          <PaymentsPanel teacher={t} />

          {/* Courses — manage enrollments */}
          <div className="rounded-xl overflow-hidden" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
            <div className="px-3 py-2 flex items-center justify-between" style={{ background: "var(--surface-2)", borderBottom: "1px solid var(--border)" }}>
              <h3 className="text-xs font-bold" style={{ color: "var(--ink)" }}>إدارة الكورسات — فتح قائمة الطلاب</h3>
              <span className="text-[11px] font-bold tabular-nums" style={{ color: tone.gold }}>{ar(t.courses.length)} كورس · {egp(coursesRevenue)}</span>
            </div>
            {t.courses.length === 0 ? (
              <p className="p-4 text-xs text-center" style={{ color: "var(--ink-3)" }}>لا توجد كورسات بعد</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead style={{ background: "var(--surface-2)" }}>
                    <tr className="text-[10px]" style={{ color: "var(--ink-3)" }}>
                      <th className="px-3 py-2 text-right font-medium">الكورس</th>
                      <th className="px-3 py-2 text-center font-medium">النوع</th>
                      <th className="px-3 py-2 text-center font-medium">الطلاب</th>
                      <th className="px-3 py-2 text-center font-medium">السعر</th>
                      <th className="px-3 py-2 text-center font-medium">الإيراد</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border)]">
                    {t.courses.map((c) => (
                      <tr key={c.id} className="hover:bg-[var(--surface-2)]/50">
                        <td className="px-3 py-2 max-w-[240px]">
                          <div className="font-bold truncate" style={{ color: "var(--ink)" }} title={c.title}>{c.title}</div>
                          <div className="text-[10px]" style={{ color: "var(--ink-3)" }}>{c.subject}</div>
                        </td>
                        <td className="px-3 py-2 text-center">{c.isPaid ? <Pill color="gold">مدفوع</Pill> : <Pill color="slate">مجاني</Pill>}</td>
                        <td className="px-3 py-2 text-center">
                          <button
                            type="button"
                            onClick={() => onOpenCourseStudents(c, t)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-black cursor-pointer transition-transform hover:scale-105"
                            style={{ background: "var(--brand-soft)", color: "var(--brand)" }}
                            title="عرض وإدارة طلاب الكورس"
                          >
                            <Users size={11} /> {ar(c.enrolledStudents)}
                          </button>
                        </td>
                        <td className="px-3 py-2 text-center tabular-nums font-bold" style={{ color: c.isPaid ? tone.gold : "var(--ink-3)" }}>
                          {c.isPaid ? egp(c.price) : "—"}
                        </td>
                        <td className="px-3 py-2 text-center tabular-nums font-black" style={{ color: c.revenue > 0 ? tone.green : "var(--ink-3)" }}>
                          {c.revenue > 0 ? egp(c.revenue) : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
