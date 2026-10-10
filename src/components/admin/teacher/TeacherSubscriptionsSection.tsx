"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { IconPlus, IconUsers, IconBook } from "@/components/admin/AdminIcons";
import { StudentPhoneActions } from "@/components/admin/StudentPhoneActions";
import { useToast } from "@/components/ui/Toast";
import { phonesMatch } from "@/lib/phone-match";
import type { RosterCourse, RosterStudent, RosterStudentKind, TeacherRoster } from "@/lib/teacher-roster-types";

type Tab = "all" | "booking" | "course_purchase";

const STAGE_LABELS: Record<string, string> = {
  sec_1: "أولى بكالوريا",
  sec_2: "ثانية بكالوريا",
  sec_3: "ثالثة ثانوية",
};

const PLAN_BADGES: Record<string, { label: string; bg: string; color: string }> = {
  monthly: { label: "📅 شهري", bg: "rgba(59,130,246,0.12)", color: "#3B82F6" },
  termly: { label: "📚 ترم", bg: "rgba(245,158,11,0.12)", color: "#F59E0B" },
  yearly: { label: "🎓 سنوي", bg: "rgba(16,185,129,0.12)", color: "#10B981" },
};

const KIND_META: Record<RosterStudentKind, { label: string; color: string; bg: string }> = {
  booking: { label: "باقة حجز", color: "#38bdf8", bg: "rgba(56,189,248,0.12)" },
  course_purchase: { label: "شراء كورس", color: "#22c55e", bg: "rgba(34,197,94,0.12)" },
  grant: { label: "شراء كورس", color: "#22c55e", bg: "rgba(34,197,94,0.12)" },
};

function egp(n: number) {
  return `${Math.round(n).toLocaleString("ar-EG")} ج.م`;
}
function ar(n: number) {
  return (n || 0).toLocaleString("ar-EG");
}
function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("ar-EG", { year: "numeric", month: "2-digit", day: "2-digit" });
}
function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit", hour12: true });
}
function stageLabel(stage?: string | null) {
  if (!stage) return "—";
  return STAGE_LABELS[stage] || stage;
}

function paymentLabel(source?: string | null) {
  switch (source) {
    case "PAYMENT_GATEWAY":
      return { text: "بوابة دفع", cls: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" };
    case "WALLET":
      return { text: "محفظة", cls: "bg-purple-500/15 text-purple-300 border-purple-500/30" };
    case "SUPPORT":
    case "ADMIN":
      return { text: "بوابة دفع", cls: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" };
    case "TESTER_BYPASS":
      return { text: "تجريبي", cls: "bg-slate-500/15 text-slate-300 border-slate-500/30" };
    default:
      return { text: "يدوي", cls: "bg-amber-500/15 text-amber-300 border-amber-500/30" };
  }
}

function StatCard({
  label,
  value,
  sub,
  color,
}: {
  label: string;
  value: string;
  sub?: string;
  color: string;
}) {
  return (
    <div className="p-4 rounded-2xl border border-[var(--border)] bg-[var(--surface)]">
      <span className="text-[10px] font-bold text-[var(--ink-muted)] block">{label}</span>
      <span className="text-xl font-black tabular-nums mt-1 block" style={{ color }}>
        {value}
      </span>
      {sub && <span className="text-[10px] text-[var(--ink-muted)] mt-1 block leading-5">{sub}</span>}
    </div>
  );
}

export function TeacherSubscriptionsSection() {
  const { success: toastSuccess, error: toastError } = useToast();
  const [roster, setRoster] = useState<TeacherRoster | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState("");
  const [planFilter, setPlanFilter] = useState("");
  const [trackFilter, setTrackFilter] = useState("");
  const [tab, setTab] = useState<Tab>("all");

  const [addModalOpen, setAddModalOpen] = useState(false);
  const [studentInput, setStudentInput] = useState("");
  const [selectedCourseId, setSelectedCourseId] = useState("");
  const [selectedPlanType, setSelectedPlanType] = useState("monthly");
  const [selectedMonthNumber, setSelectedMonthNumber] = useState(1);
  const [selectedLanguageTrack, setSelectedLanguageTrack] = useState("arabic");
  const [adding, setAdding] = useState(false);

  const loadRoster = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/teacher/roster", { credentials: "include" });
      const data = await res.json();
      if (!res.ok) {
        toastError(data.error || "تعذر جلب طلابك");
        return;
      }
      setRoster(data);
    } catch {
      toastError("حدث خطأ أثناء تحميل البيانات");
    } finally {
      setLoading(false);
    }
  }, [toastError]);

  useEffect(() => {
    void loadRoster();
  }, [loadRoster]);

  const handleAddStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!studentInput.trim()) {
      toastError("بريد أو هاتف الطالب مطلوب");
      return;
    }
    setAdding(true);
    try {
      const res = await fetch("/api/teacher/subscriptions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studentEmailOrPhone: studentInput.trim(),
          courseId: selectedCourseId || undefined,
          planType: selectedPlanType,
          languageTrack: selectedLanguageTrack,
          monthNumber: selectedPlanType === "monthly" ? selectedMonthNumber : undefined,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        toastSuccess(selectedCourseId ? "تم تسجيل الطالب في الكورس بنجاح" : "تم إضافة الطالب بنجاح");
        setAddModalOpen(false);
        setStudentInput("");
        setSelectedCourseId("");
        void loadRoster();
      } else {
        toastError(data.error || "تعذر إضافة الطالب");
      }
    } catch {
      toastError("حدث خطأ في الشبكة");
    } finally {
      setAdding(false);
    }
  };

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (roster?.students || []).filter((s) => {
      if (tab !== "all" && s.kind !== tab) return false;
      if (stageFilter && s.educationalStage !== stageFilter) return false;
      if (planFilter && s.planType !== planFilter) return false;
      if (trackFilter === "arabic" && s.languageTrack && s.languageTrack !== "arabic") return false;
      if (trackFilter === "languages" && s.languageTrack !== "languages" && s.languageTrack !== "english") return false;
      if (!q) return true;
      return [s.name, s.email, s.phone, s.parentPhone, s.planLabel, ...(s.courses.map((c) => c.title))]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q) || phonesMatch(String(v), q));
    });
  }, [roster, search, stageFilter, planFilter, trackFilter, tab]);

  const stats = roster?.stats;
  const paidCourses = (roster?.courses || []).filter((c) => c.isPaid);

  return (
    <div className="space-y-6">
      <div className="bg-[var(--surface)] p-6 rounded-2xl border border-[var(--border)] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-black text-[var(--ink)] flex items-center gap-2">
            <IconUsers className="w-6 h-6 text-sky-500" />
            طلابك والأرقام
          </h2>
          <p className="text-xs text-[var(--ink-muted)] mt-1 leading-6 max-w-xl">
            كل طالب دفع باقة أو اشترى كورس. الأرقام هنا الحجوزات + مشتريات الكورس.
          </p>
        </div>
        <button
          onClick={() => setAddModalOpen(true)}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-white text-sm font-bold transition-all shadow-md cursor-pointer shrink-0"
        >
          <IconPlus className="w-4 h-4" />
          إضافة حجز باقة
        </button>
      </div>

      {loading && !roster ? (
        <div className="p-12 text-center text-xs text-[var(--ink-muted)]">جاري تحميل طلابك وأرقامك...</div>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
            <StatCard
              label="إجمالي الطلاب"
              value={`${ar(stats?.totalStudents || 0)} طالب`}
              sub="باقة + كورس"
              color="#38bdf8"
            />
            <StatCard
              label="إجمالي المحصّل"
              value={egp(stats?.totalRevenue || 0)}
              sub={`${egp(stats?.bookingRevenue || 0)} باقات + ${egp(stats?.courseRevenue || 0)} كورسات`}
              color="#22c55e"
            />
            <StatCard
              label="حجوزات باقة"
              value={ar(stats?.bookingStudents || 0)}
              sub={egp(stats?.bookingRevenue || 0)}
              color="#0ea5e9"
            />
            <StatCard
              label="مشترو كورس فقط"
              value={ar(stats?.courseOnlyStudents || 0)}
              sub="دفعوا الكورس من غير باقة"
              color="#10b981"
            />
            <StatCard
              label="حصص مجانية"
              value={ar(stats?.freeCourseStudents || 0)}
              sub="مش داخلين في الفلوس"
              color="#94a3b8"
            />
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <StatCard label="مسار عربي" value={ar(stats?.arabic || 0)} color="#38bdf8" />
            <StatCard label="مسار لغات" value={ar(stats?.languages || 0)} color="#818cf8" />
            <StatCard label="شهري" value={ar(stats?.monthly || 0)} color="#3b82f6" />
            <StatCard label="ترم" value={ar(stats?.termly || 0)} color="#f59e0b" />
            <StatCard label="سنوي" value={ar(stats?.yearly || 0)} color="#10b981" />
          </div>

          {paidCourses.length > 0 && (
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] overflow-hidden">
              <div className="px-4 py-3 flex items-center gap-2 border-b border-[var(--border)]">
                <IconBook className="w-4 h-4 text-amber-400" />
                <h3 className="text-sm font-black text-[var(--ink)]">كورساتك المدفوعة</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-right">
                  <thead className="bg-[var(--bg)] text-[var(--ink-muted)]">
                    <tr>
                      <th className="p-3 font-bold">الكورس</th>
                      <th className="p-3 font-bold text-center">السعر</th>
                      <th className="p-3 font-bold text-center">طلاب</th>
                      <th className="p-3 font-bold text-center">مغطى بالباقة</th>
                      <th className="p-3 font-bold text-center">إيراد الكورس</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border)]">
                    {paidCourses.map((c: RosterCourse) => (
                      <tr key={c.id}>
                        <td className="p-3 font-bold text-[var(--ink)]">{c.title}</td>
                        <td className="p-3 text-center tabular-nums">{egp(c.price)}</td>
                        <td className="p-3 text-center tabular-nums font-black text-sky-400">{ar(c.enrolled)}</td>
                        <td className="p-3 text-center tabular-nums">{ar(c.coveredCount)}</td>
                        <td className="p-3 text-center tabular-nums font-black text-emerald-400">
                          {c.revenue > 0 ? egp(c.revenue) : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            {(
              [
                ["all", `الكل (${ar(stats?.totalStudents || 0)})`],
                ["booking", `حجوزات (${ar(stats?.bookingStudents || 0)})`],
                ["course_purchase", `كورس فقط (${ar(stats?.courseOnlyStudents || 0)})`],
              ] as Array<[Tab, string]>
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
                className="px-3 py-1.5 rounded-lg text-[11px] font-bold cursor-pointer border"
                style={{
                  background: tab === id ? "var(--brand-soft)" : "var(--surface)",
                  color: tab === id ? "var(--brand)" : "var(--ink-3)",
                  borderColor: tab === id ? "transparent" : "var(--border)",
                }}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="بحث بالاسم أو الهاتف أو الكورس..."
              className="w-full px-4 py-2.5 rounded-xl border border-[var(--border)] bg-[var(--surface)] text-[var(--ink)] text-xs focus:outline-none focus:border-sky-400"
            />
            <select
              value={stageFilter}
              onChange={(e) => setStageFilter(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl border border-[var(--border)] bg-[var(--surface)] text-[var(--ink)] text-xs focus:outline-none focus:border-sky-400"
            >
              <option value="">جميع المراحل</option>
              <option value="sec_1">أولى بكالوريا</option>
              <option value="sec_2">ثانية بكالوريا</option>
              <option value="sec_3">ثالثة ثانوية</option>
            </select>
            <select
              value={planFilter}
              onChange={(e) => setPlanFilter(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl border border-[var(--border)] bg-[var(--surface)] text-[var(--ink)] text-xs focus:outline-none focus:border-sky-400"
            >
              <option value="">كل الباقات</option>
              <option value="monthly">شهري</option>
              <option value="termly">ترم</option>
              <option value="yearly">سنوي</option>
            </select>
            <select
              value={trackFilter}
              onChange={(e) => setTrackFilter(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl border border-[var(--border)] bg-[var(--surface)] text-[var(--ink)] text-xs focus:outline-none focus:border-sky-400"
            >
              <option value="">كل المسارات</option>
              <option value="arabic">عربي</option>
              <option value="languages">لغات</option>
            </select>
          </div>

          <div className="bg-[var(--surface)] rounded-2xl border border-[var(--border)] overflow-hidden">
            {visible.length === 0 ? (
              <div className="p-12 text-center text-xs text-[var(--ink-muted)]">
                لا يوجد طلاب يطابقون البحث. لو الصفحة فاضية بالكامل، لسه مفيش حجوزات ولا مشتريات كورس.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-right text-xs">
                  <thead className="bg-[var(--bg)] border-b border-[var(--border)] text-[var(--ink-muted)] font-bold">
                    <tr>
                      <th className="p-4">الطالب</th>
                      <th className="p-4">النوع</th>
                      <th className="p-4">اشترى إيه</th>
                      <th className="p-4 text-center">المبلغ</th>
                      <th className="p-4">الكورسات</th>
                      <th className="p-4">التواصل</th>
                      <th className="p-4 text-center">التاريخ</th>
                      <th className="p-4 text-center">إجراءات</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border)]">
                    {visible.map((s) => {
                      const kind = KIND_META[s.kind];
                      const badge = s.planType ? PLAN_BADGES[s.planType] : null;
                      const pay = paymentLabel(s.paymentSource);
                      const isLang = s.languageTrack === "languages" || s.languageTrack === "english";
                      return (
                        <tr key={s.id} className="hover:bg-[var(--bg)]/50">
                          <td className="p-4">
                            <div className="font-bold text-[var(--ink)]">{s.name}</div>
                            <div className="text-[10px] text-[var(--ink-muted)]">{stageLabel(s.educationalStage)}</div>
                            {s.email && <div className="text-[10px] font-mono text-[var(--ink-muted)]">{s.email}</div>}
                          </td>
                          <td className="p-4">
                            <span
                              className="inline-flex px-2 py-1 rounded-md text-[10px] font-black"
                              style={{ color: kind.color, background: kind.bg }}
                            >
                              {kind.label}
                            </span>
                          </td>
                          <td className="p-4">
                            {badge ? (
                              <div>
                                <span
                                  className="inline-flex px-2 py-1 rounded-full text-[10px] font-bold"
                                  style={{ background: badge.bg, color: badge.color }}
                                >
                                  {badge.label} {isLang ? "لغات" : "عربي"}
                                </span>
                                <div className={`mt-1 text-[10px] font-bold px-2 py-0.5 rounded border inline-flex ${pay.cls}`}>
                                  {pay.text}
                                </div>
                              </div>
                            ) : (
                              <div className={`inline-flex px-2 py-0.5 rounded border text-[10px] font-bold ${pay.cls}`}>
                                {pay.text}
                              </div>
                            )}
                          </td>
                          <td className="p-4 text-center">
                            <div className="font-black tabular-nums text-emerald-400">{egp(s.totalAmount)}</div>
                            {s.bookingAmount > 0 && s.courseAmount > 0 && (
                              <div className="text-[10px] text-[var(--ink-muted)]">
                                باقة {egp(s.bookingAmount)} + كورس {egp(s.courseAmount)}
                              </div>
                            )}
                            {s.totalAmount === 0 && s.kind === "booking" && (
                              <div className="text-[10px] text-[var(--ink-muted)]">بدون مبلغ</div>
                            )}
                          </td>
                          <td className="p-4">
                            {s.courses.length === 0 ? (
                              <span className="text-[var(--ink-muted)]">لسه ما دخلش كورس</span>
                            ) : (
                              <div className="space-y-1">
                                {s.courses.map((c) => (
                                  <div key={`${s.id}-${c.id}`} className="text-[10px]">
                                    <span className="font-bold text-[var(--ink)]">{c.title}</span>
                                    <span className="text-[var(--ink-muted)]">
                                      {" "}
                                      · {c.covered ? "مغطى بالباقة" : c.amount > 0 ? egp(c.amount) : "شراء كورس"}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </td>
                          <td className="p-4">
                            <StudentPhoneActions phone={s.phone} compact />
                            {s.parentPhone && (
                              <div className="text-[10px] text-[var(--ink-muted)] mt-1" dir="ltr">
                                ولي الأمر: {s.parentPhone}
                              </div>
                            )}
                          </td>
                          <td className="p-4 text-center whitespace-nowrap">
                            <div className="font-bold">{fmtDate(s.createdAt)}</div>
                            <div className="text-[10px] text-sky-400">{fmtTime(s.createdAt)}</div>
                          </td>
                          <td className="p-4 text-center">
                            {s.subscriptionId || s.kind === "booking" ? (
                              <button
                                type="button"
                                onClick={async () => {
                                  const studentName = s.name || "الطالب";
                                  if (!confirm(`هل أنت متأكد من حذف حجز الطالب ${studentName}؟ سيتم حذف الحجز فقط وليس الطالب نفسه.`)) return;
                                  try {
                                    const targetId = s.subscriptionId || s.id;
                                    const res = await fetch(`/api/teacher/subscriptions/${targetId}`, { method: 'DELETE' });
                                    const data = await res.json();
                                    if (data.success) {
                                      toastSuccess("تم حذف الحجز بنجاح");
                                      setRoster((prev) =>
                                        prev
                                          ? {
                                              ...prev,
                                              students: prev.students.filter((p) => p.id !== s.id && p.subscriptionId !== targetId),
                                            }
                                          : prev
                                      );
                                      void loadRoster();
                                    } else {
                                      toastError(data.error || "فشل حذف الحجز");
                                    }
                                  } catch {
                                    toastError("خطأ في الاتصال بالشبكة أثناء الحذف");
                                  }
                                }}
                                className="bg-red-600 hover:bg-red-700 text-white px-3 py-1 rounded-md text-sm ml-2 cursor-pointer transition-colors shadow-sm inline-flex items-center gap-1 font-semibold"
                                title="حذف الحجز فقط"
                              >
                                حذف الحجز 🗑️
                              </button>
                            ) : (
                              <span className="text-[10px] text-[var(--ink-muted)]">بدون حجز</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {addModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[var(--surface)] w-full max-w-md rounded-2xl border border-[var(--border)] p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="font-black text-base text-[var(--ink)]">إضافة طالب إلى باقة يدوياً</h3>
              <button
                type="button"
                onClick={() => setAddModalOpen(false)}
                className="text-[var(--ink-muted)] hover:text-[var(--ink)] text-sm"
              >
                ✕
              </button>
            </div>
            <form onSubmit={handleAddStudent} className="space-y-4">
              <div>
                <label className="block text-xs font-bold mb-1 text-[var(--ink-muted)]">بريد الطالب أو رقم الهاتف:</label>
                <input
                  type="text"
                  value={studentInput}
                  onChange={(e) => setStudentInput(e.target.value)}
                  placeholder="مثال: student@email.com أو 01012345678"
                  className="w-full p-3 rounded-xl border border-[var(--border)] bg-[var(--bg)] text-xs text-[var(--ink)] focus:outline-none focus:border-sky-400"
                />
              </div>
              <div>
                <label className="block text-xs font-bold mb-1 text-emerald-400">الكورس المطلوب تسجيل الطالب فيه يدوياً ومباشرة:</label>
                <select
                  value={selectedCourseId}
                  onChange={(e) => setSelectedCourseId(e.target.value)}
                  className="w-full p-3 rounded-xl border border-emerald-500/40 bg-[var(--bg)] text-xs text-[var(--ink)] focus:outline-none focus:border-emerald-400 font-semibold"
                >
                  <option value="">-- اختر الكورس للتسجيل المباشر (موصى به) --</option>
                  {roster?.courses?.map((c) => (
                    <option key={c.id} value={c.id}>
                      📖 {c.title}
                    </option>
                  ))}
                </select>
                <p className="text-[10px] text-[var(--ink-muted)] mt-1">
                  التسجيل المباشر يضمن دخول الطالب في هذا الكورس المحدد فقط دون فتح أي كورسات أخرى تلقائياً.
                </p>
              </div>
              <div>
                <label className="block text-xs font-bold mb-1 text-[var(--ink-muted)]">مسار الدراسة:</label>
                <select
                  value={selectedLanguageTrack}
                  onChange={(e) => setSelectedLanguageTrack(e.target.value)}
                  className="w-full p-3 rounded-xl border border-[var(--border)] bg-[var(--bg)] text-xs text-[var(--ink)] focus:outline-none focus:border-sky-400"
                >
                  <option value="arabic">🇪🇬 المسار العربي</option>
                  <option value="languages">🇬🇧 مسار اللغات / إنجليزي</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold mb-1 text-[var(--ink-muted)]">نوع الباقة (لأغراض المتابعة والرسوم):</label>
                <select
                  value={selectedPlanType}
                  onChange={(e) => setSelectedPlanType(e.target.value)}
                  className="w-full p-3 rounded-xl border border-[var(--border)] bg-[var(--bg)] text-xs text-[var(--ink)] focus:outline-none focus:border-sky-400"
                >
                  <option value="monthly">📅 اشتراك شهري</option>
                  <option value="termly">📚 اشتراك ترم كامل</option>
                  <option value="yearly">🎓 اشتراك سنوي</option>
                </select>
              </div>
              {selectedPlanType === "monthly" && (
                <div>
                  <label className="block text-xs font-bold mb-1 text-[var(--ink-muted)]">رقم الشهر:</label>
                  <select
                    value={selectedMonthNumber}
                    onChange={(e) => setSelectedMonthNumber(Number(e.target.value))}
                    className="w-full p-3 rounded-xl border border-[var(--border)] bg-[var(--bg)] text-xs text-[var(--ink)] focus:outline-none focus:border-sky-400"
                  >
                    <option value={1}>الشهر الأول (1)</option>
                    <option value={2}>الشهر الثاني (2)</option>
                    <option value={3}>الشهر الثالث (3)</option>
                    <option value={4}>الشهر الرابع (4)</option>
                    <option value={5}>الشهر الخامس (5)</option>
                    <option value={6}>الشهر السادس (6)</option>
                    <option value={7}>الشهر السابع (7)</option>
                    <option value={8}>الشهر الثامن (8)</option>
                  </select>
                </div>
              )}
              <div className="flex gap-2 pt-2">
                <button
                  type="submit"
                  disabled={adding}
                  className="flex-1 py-3 rounded-xl bg-sky-500 text-white font-bold text-xs hover:bg-sky-400 transition-all disabled:opacity-50"
                >
                  {adding ? "جارٍ الإضافة..." : "حفظ وإضافة الطالب"}
                </button>
                <button
                  type="button"
                  onClick={() => setAddModalOpen(false)}
                  className="px-4 py-3 rounded-xl border border-[var(--border)] text-xs font-semibold text-[var(--ink-muted)] hover:bg-[var(--bg)]"
                >
                  إلغاء
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
