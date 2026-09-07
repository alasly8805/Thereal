"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ClassicAdminShell } from "@/components/admin/ClassicAdminShell";
import { useToast } from "@/components/ui/Toast";
import { StudentsSection } from "@/components/admin/superadmin/StudentsSection";
import { TeachersSection } from "@/components/admin/superadmin/TeachersSection";
import { ConfirmActionModal } from "@/components/admin/superadmin/ConfirmActionModal";
import { ActivityLogsSection } from "@/components/admin/superadmin/ActivityLogsSection";
import { DeletedStudentsSection } from "@/components/admin/superadmin/DeletedStudentsSection";
import { DeletedTeachersSection } from "@/components/admin/superadmin/DeletedTeachersSection";
import { StaffAccountsSection } from "@/components/admin/superadmin/StaffAccountsSection";
import { ErrorMonitorSection } from "@/components/admin/superadmin/ErrorMonitorSection";
import { DailyExamsSection } from "@/components/admin/superadmin/DailyExamsSection";
import { LeaderboardPrizesSection } from "@/components/admin/superadmin/LeaderboardPrizesSection";
import { DangerZoneSection } from "@/components/admin/superadmin/DangerZoneSection";
import { InstanceControlSection } from "@/components/admin/superadmin/InstanceControlSection";
import { SiteTextSection } from "@/components/admin/superadmin/SiteTextSection";
import { AdvancedSettingsSection } from "@/components/admin/superadmin/AdvancedSettingsSection";
import { AccessGate } from "@/components/admin/superadmin/AccessGate";
import { WalletSection } from "@/components/admin/superadmin/WalletSection";
import { PlansSection } from "@/components/admin/superadmin/PlansSection";
import { WhatsAppSection } from "@/components/admin/WhatsAppSection";
import { SecuritySection } from "@/components/admin/SecuritySection";
import { VdoCipherSection } from "@/components/admin/superadmin/VdoCipherSection";
import { AxinomSection } from "@/components/admin/superadmin/AxinomSection";
import { IconTrash } from "@/components/admin/AdminIcons";
import dynamic from "next/dynamic";

import { UnifiedAIStudio } from "@/components/admin/superadmin/ai/UnifiedAIStudio";
const TestersSection = dynamic(
  () => import("@/components/admin/superadmin/TestersSection").then((m) => m.TestersSection),
  { ssr: false }
);



async function readJson<T>(res: Response): Promise<T | null> {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

import { SuperadminReferredStudentsSection } from "@/components/admin/superadmin/SuperadminReferredStudentsSection";
import { MoneyControlModal } from "@/components/admin/superadmin/MoneyControlModal";
import { CourseStudentsModal } from "@/components/admin/superadmin/CourseStudentsModal";

interface TeacherCourse {
  id: string;
  title: string;
  subject: string;
  educationalStage: string;
  isPaid: boolean;
  price: number;
  totalCodes?: number;
  usedCodes?: number;
  availableCodes?: number;
  directEnrollments?: number;
  enrolledStudents: number;
  paidStudents?: number;
  freeStudents?: number;
  revenue: number;
}

interface OverviewSubscription {
  id: string;
  studentName: string;
  studentPhone: string;
  planType: string;
  planLabel: string;
  amount: number;
  isPaid?: boolean;
  educationalStage: string;
  languageTrack: string;
  paymentSource?: string;
  paymentRef?: string | null;
  gatewayProvider?: string | null;
  hasGatewayAttempt?: boolean;
  registeredBy?: string;
  createdAt: string;
}

interface OverviewTeacher {
  id: string;
  name: string;
  email: string;
  createdAt: string;
  totalCourses: number;
  totalCodes?: number;
  usedCodes?: number;
  availableCodes?: number;
  totalStudents?: number;
  courseEnrolledStudents?: number;
  realReservationsCount: number;
  realPaidReservationsCount?: number;
  realFreeReservationsCount?: number;
  realReservationsRevenue: number;
  totalPaidStudents?: number;
  totalFreeStudents?: number;
  coursesRevenue?: number;
  totalRevenue: number;
  platformPercentage?: number;
  platformShare?: number;
  teacherShare?: number;
  subscriptions: OverviewSubscription[];
  courses: TeacherCourse[];
}

interface CoursePricingRow {
  id: string;
  title: string;
  subject: string;
  teacherName: string;
  isPaid: boolean;
  price: number;
  discountPercent: number | null;
  enrolledStudents: number;
  paidStudents: number;
  coursePaidStudentsCount: number;
  courseCoveredBySubCount: number;
  freeStudents: number;
  revenue: number;
  usedCodes: number;
  createdAt: string;
}

interface AccessMonitorEvent {
  kind: "subscription" | "enrollment" | "debit";
  id: string;
  studentName: string;
  target: string;
  amount: number;
  source: string;
  createdAt: string;
  severity: "ok" | "warn" | "alert";
  reason: string;
}

interface OverviewData {
  totalStudents: number;
  totalTeachers: number;
  totalCourses: number;
  totalRealReservations?: number;
  totalRealPaidReservations?: number;
  totalPaidStudentsAcrossPlatform?: number;
  totalCourseEnrollmentsCount?: number;
  totalActiveContentConsumers?: number;
  totalCodesBooked?: number;
  totalCodesUsed?: number;
  teachersEarnedRevenue?: number;
  totalGatewayDeposits?: number;
  totalRevenue: number;
  bookings?: {
    activeNow: number;
    addedToday: number;
    revenueActive: number;
    generatedAt: string;
  };
  coursesPricing?: CoursePricingRow[];
  accessMonitor?: AccessMonitorEvent[];
  accessMonitorAlertCount?: number;
  moneyControl?: {
    defaultPercentage: number;
    teacherPercentages: Record<string, number>;
    totalGrossRevenue: number;
    totalPlatformShare: number;
    totalTeachersShare: number;
    totalExpenses: number;
    netPlatformProfit: number;
    expensesCount: number;
  };
  teachers: OverviewTeacher[];
}

interface Teacher {
  id: string;
  name: string;
  email?: string;
  _count?: { courses?: number };
  courses?: { id: string; title: string; subject: string }[];
  createdAt?: string | Date;
}


export default function SuperadminPage() {
  const router = useRouter();
  const { success: toastSuccess, error: toastError } = useToast();
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newTeacher, setNewTeacher] = useState({ name: "", password: "" });
  const [activeSection, setActiveSection] = useState("overview");
  const [deleteTargetTeacher, setDeleteTargetTeacher] = useState<Teacher | null>(null);
  const [userRole, setUserRole] = useState<"superadmin" | "admin" | "staff">("superadmin");
  const [isOwner, setIsOwner] = useState(false);
  const [overview, setOverview] = useState<OverviewData | null>(null);
  const [overviewLoading, setOverviewLoading] = useState(true);
  const [expandedTeacher, setExpandedTeacher] = useState<string | null>(null);
  const [isMoneyControlOpen, setIsMoneyControlOpen] = useState(false);
  const [isBrutalRefreshing, setIsBrutalRefreshing] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [enteringTeacherId, setEnteringTeacherId] = useState<string | null>(null);
  const [courseStudentsModal, setCourseStudentsModal] = useState<{
    isOpen: boolean;
    courseId: string;
    courseTitle: string;
    teacherName: string;
  }>({
    isOpen: false,
    courseId: "",
    courseTitle: "",
    teacherName: "",
  });

  const handleOpenCourseStudents = (course: { id: string; title: string }, teacher: { name: string }) => {
    setCourseStudentsModal({
      isOpen: true,
      courseId: course.id,
      courseTitle: course.title,
      teacherName: teacher.name,
    });
  };

  const handleCourseStudentCountChanged = (courseId: string, newActiveCount: number) => {
    setOverview((prev) => {
      if (!prev) return prev;
      const updatedTeachers = prev.teachers.map((teacher) => ({
        ...teacher,
        courses: teacher.courses.map((course) =>
          course.id === courseId ? { ...course, enrolledStudents: newActiveCount } : course
        ),
      }));
      return { ...prev, teachers: updatedTeachers };
    });
  };

  const handleEnterTeacherPanel = async (teacherId: string, teacherName: string) => {
    if (!window.confirm(`هل تريد الدخول إلى لوحة تحكم المعلم "${teacherName}" الآن؟`)) {
      return;
    }
    setEnteringTeacherId(teacherId);
    try {
      const res = await fetch("/api/admin/superadmin/impersonate", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "teacher",
          teacherId,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        toastSuccess(`تم تسجيل الدخول كمعلم (${teacherName}) بنجاح! جاري التوجيه...`);
        if (typeof window !== "undefined") {
          window.location.assign(data.redirectUrl || "/adminpanel/teacher");
        }
      } else {
        toastError(data?.error || "تعذر الدخول إلى لوحة المعلم");
        setEnteringTeacherId(null);
      }
    } catch {
      toastError("حدث خطأ أثناء الاتصال بالخادم");
      setEnteringTeacherId(null);
    }
  };

  const fetchTeachers = async () => {
    const res = await fetch(`/api/admin/teachers?_t=${Date.now()}`, { credentials: "include" });
    if (res.status === 401) {
      toastError("انتهت جلسة المشرف. سجّل الدخول من لوحة الإدارة.");
      setLoading(false);
      router.replace("/adminpanel");
      return;
    }
    const data = await readJson<{ teachers?: Teacher[]; error?: string }>(res);
    setTeachers(data?.teachers || []);
    setLoading(false);
  };

  const fetchOverview = async (silent = false) => {
    if (!silent) setOverviewLoading(true);
    try {
      const res = await fetch(`/api/admin/superadmin/overview?_t=${Date.now()}`, { credentials: "include" });
      const data = await readJson<OverviewData>(res);
      if (data) setOverview(data);
    } catch {
      /* non-critical */
    } finally {
      if (!silent) setOverviewLoading(false);
    }
  };

  // Live "right now" bookings: silently re-poll the overview every 60s while visible
  useEffect(() => {
    if (activeSection !== "overview") return;
    const timer = setInterval(() => { void fetchOverview(true); }, 60000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSection]);

  const handleBrutalRefresh = async () => {
    setIsBrutalRefreshing(true);
    setOverviewLoading(true);
    try {
      // 1. Force real-time live sync with payment gateways (Shake-Out / Fawry / Mobile Wallets)
      const syncRes = await fetch(`/api/admin/superadmin/sync-payments?_t=${Date.now()}`, {
        method: "POST",
        credentials: "include",
      });
      const syncData = await readJson<{
        success?: boolean;
        totalChecked?: number;
        totalReconciled?: number;
        reconciled?: Array<{ studentName: string; amount: number; itemName?: string; provider: string }>;
        message?: string;
      }>(syncRes);

      // 2. Re-fetch fresh overview, teachers, and current section data
      await Promise.all([
        fetchOverview(),
        fetchTeachers(),
      ]);

      // 3. Trigger refresh on child components (StudentsSection, etc.)
      setRefreshKey((prev) => prev + 1);

      if (syncData?.totalReconciled && syncData.totalReconciled > 0) {
        const names = syncData.reconciled?.map((r) => r.studentName).join("، ") || "";
        toastSuccess(`⚡ تحديث شامل فوري: تم تأكيد ${syncData.totalReconciled} اشتراك جديد بنجاح! (${names})`);
      } else {
        toastSuccess(`⚡ تم التحديث الشامل: جميع البيانات متزامنة مع بوابات الدفع وقاعدة البيانات.`);
      }
    } catch (err) {
      toastError("تعذر إتمام التحديث الشامل، حاول مجدداً.");
    } finally {
      setIsBrutalRefreshing(false);
      setOverviewLoading(false);
    }
  };

  useEffect(() => {
    const init = async () => {
      const meRes = await fetch("/api/auth/me", { credentials: "include" });
      const meData = await meRes.json() as { user?: { role?: string; isOwner?: boolean } };
      const role = meData?.user?.role;
      if (role === "admin" || role === "staff") setUserRole(role);
      setIsOwner(!!meData?.user?.isOwner);
      await Promise.all([fetchTeachers(), fetchOverview()]);
    };
    void init();
  }, []);

  const createTeacher = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    const res = await fetch("/api/admin/teachers", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newTeacher),
    });
    const data = await readJson<{ error?: string }>(res);
    setCreating(false);
    if (res.ok) {
      toastSuccess(`تم إنشاء حساب المعلم "${newTeacher.name}" بنجاح`);
      setNewTeacher({ name: "", password: "" });
      fetchTeachers();
    } else {
      toastError(data?.error || "تعذر إنشاء حساب المعلم");
    }
  };

  const deleteTeacher = async (teacherId: string, teacherName: string, actionPassword: string) => {
    const res = await fetch(`/api/admin/teachers/${teacherId}`, {
      method: "DELETE",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ actionPassword }),
    });
    const data = await readJson<{ error?: string }>(res);
    if (res.ok) {
      toastSuccess(`تم حذف حساب المعلم "${teacherName}" بنجاح`);
      setDeleteTargetTeacher(null);
      fetchTeachers();
    } else {
      throw new Error(data?.error ?? "تعذر حذف حساب المعلم");
    }
  };

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/adminpanel");
  };

  return (
    <ClassicAdminShell
      role={userRole}
      activeSection={activeSection}
      setActiveSection={setActiveSection}
      onLogout={handleLogout}
      isOwner={isOwner}
      headerTitle="لوحة التحكم التنفيذية"
      headerSubtitle="المشرف العام — منصة Code-UP"
      onRefresh={handleBrutalRefresh}
      refreshing={isBrutalRefreshing}
      onOpenMoneyControl={() => setIsMoneyControlOpen(true)}
    >
      <div className="space-y-6">
        {activeSection === "overview" && (
          <div dir="rtl" className="space-y-6">
              {/* KPI Cards (Including Money Control & Platform Profit) */}
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
                {[
                  {
                    label: "إجمالي الطلاب",
                    value: overviewLoading ? "…" : (overview?.totalStudents ?? 0).toLocaleString("ar-EG"),
                    icon: "🎓",
                    accent: "var(--brand)",
                  },
                  {
                    label: "المعلمون",
                    value: overviewLoading ? "…" : (overview?.totalTeachers ?? 0).toLocaleString("ar-EG"),
                    icon: "👨‍🏫",
                    accent: "var(--brand)",
                  },
                  {
                    label: "الحجوزات النشطة الآن",
                    value: overviewLoading
                      ? "…"
                      : `${(overview?.bookings?.activeNow ?? 0).toLocaleString("ar-EG")} حجز`,
                    sublabel: overviewLoading
                      ? ""
                      : `+${(overview?.bookings?.addedToday ?? 0).toLocaleString("ar-EG")} اليوم · ${(overview?.bookings?.revenueActive ?? 0).toLocaleString("ar-EG")} ج.م نشط`,
                    icon: "🎟️",
                    accent: "var(--brand)",
                  },
                  {
                    label: "إجمالي دخل المعلمين (Gross)",
                    value: overviewLoading ? "…" : `${(overview?.moneyControl?.totalGrossRevenue ?? overview?.totalRevenue ?? 0).toLocaleString("ar-EG")} ج.م`,
                    sublabel: overviewLoading
                      ? ""
                      : `مستبعد الكورسات المجانية`,
                    icon: "💰",
                    accent: "var(--gold-2)",
                  },
                  {
                    label: "صافي أرباح المنصة (Net)",
                    value: overviewLoading
                      ? "…"
                      : `${(overview?.moneyControl?.netPlatformProfit ?? ((overview?.totalRevenue ?? 0) * 0.25)).toLocaleString("ar-EG")} ج.م`,
                    sublabel: overviewLoading
                      ? ""
                      : `حصة المنصة (${(overview?.moneyControl?.totalPlatformShare ?? 0).toLocaleString("ar-EG")}) − المصروفات`,
                    icon: "💎",
                    accent: "var(--brand)",
                  },
                ].map((card) => (
                  <div
                    key={card.label}
                    className="rounded-2xl p-4 flex flex-col justify-between"
                    style={{ background: "var(--surface)", border: "1px solid var(--border)", boxShadow: "var(--shadow-sm)" }}
                  >
                    <div>
                      <div className="text-2xl mb-1.5">{card.icon}</div>
                      <div className="text-2xl font-black leading-none" style={{ color: card.accent, fontFamily: "var(--font-head)" }}>{card.value}</div>
                      {card.sublabel && (
                        <div className="text-[11px] font-semibold mt-1 truncate" style={{ color: "var(--brand)" }}>
                          {card.sublabel}
                        </div>
                      )}
                    </div>
                    <div className="text-xs mt-1.5 font-medium" style={{ color: "var(--ink-2)" }}>{card.label}</div>
                  </div>
                ))}
              </div>

              {/* Teachers + Courses & Reservations Table */}
              <div className="rounded-2xl overflow-hidden" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
                <div className="p-4 flex flex-wrap items-center justify-between gap-3" style={{ borderBottom: "1px solid var(--border)" }}>
                  <div>
                    <h2 className="font-black text-base" style={{ color: "var(--ink)", fontFamily: "var(--font-head)" }}>
                      المعلمون وحساب المدفوع الفعلي وتوزيع الأرباح
                    </h2>
                    <p className="text-xs mt-0.5" style={{ color: "var(--ink-3)" }}>
                      حساب الإيرادات بناءً على ما دفعه الطلاب فعلياً، وحصة المنصة (افتراضي 25% أو مخصص لكل معلم)، وصافي مستحقات المعلم
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      onClick={handleBrutalRefresh}
                      disabled={isBrutalRefreshing}
                      className="px-3.5 py-2 text-white text-xs font-black rounded-xl transition-all hover:opacity-95 hover:scale-[1.02] cursor-pointer border border-emerald-500/40 flex items-center gap-1.5 shadow-sm disabled:opacity-60"
                      style={{ background: "linear-gradient(135deg, #059669 0%, #0284c7 100%)" }}
                      title="فحص فوري لبوابات الدفع (Shake-Out / Fawry) ومزامنة أحدث الاشتراكات والأرباح وقاعدة البيانات"
                    >
                      <span className={`text-sm inline-block ${isBrutalRefreshing ? "animate-spin" : ""}`}>⚡</span>
                      <span>{isBrutalRefreshing ? "جارٍ الفحص والمزامنة..." : "تحديث شامل وبوابات الدفع (Brutal Refresh)"}</span>
                    </button>
                    <button
                      onClick={() => setIsMoneyControlOpen(true)}
                      className="px-4 py-2 text-white text-xs font-black rounded-xl transition-all hover:opacity-95 hover:scale-[1.02] cursor-pointer border border-amber-500/40 flex items-center gap-1.5 shadow-sm"
                      style={{ background: "linear-gradient(135deg, #d97706 0%, #b45309 100%)" }}
                      title="التحكم في نسب الأرباح وتسجيل المصروفات"
                    >
                      <span className="text-base">⚙️</span>
                      <span>التحكم في الأموال ونسب الأرباح (Control Money)</span>
                    </button>
                    <button
                      onClick={() => setActiveSection("create")}
                      className="px-4 py-2 text-white text-xs font-bold rounded-xl transition-opacity hover:opacity-90 cursor-pointer border-none"
                      style={{ background: "var(--brand)" }}
                    >
                      + إضافة مدرس
                    </button>
                  </div>
                </div>

                {overviewLoading ? (
                  <div className="p-10 text-center" style={{ color: "var(--ink-3)" }}>
                    <div className="text-3xl mb-2 animate-pulse">⏳</div>
                    جارٍ التحميل...
                  </div>
                ) : !overview || overview.teachers.length === 0 ? (
                  <div className="p-10 text-center" style={{ color: "var(--ink-3)" }}>
                    <div className="text-4xl mb-2">👨‍🏫</div>
                    <p>لا يوجد مدرسون بعد</p>
                  </div>
                ) : (
                  <div style={{ borderTop: "0" }}>
                    {overview.teachers.map((t) => {
                      const isExpanded = expandedTeacher === t.id;
                      const teacherRevenue = t.totalRevenue ?? 0;
                      const realPaidSubs = t.realPaidReservationsCount ?? (t.subscriptions ? t.subscriptions.filter(s => (s.amount || 0) > 0).length : 0);
                      const realResRevenue = t.realReservationsRevenue ?? (t.subscriptions ? t.subscriptions.reduce((s, sub) => s + (sub.amount || 0), 0) : 0);
                      const paidStudents = t.totalPaidStudents ?? realPaidSubs;
                      const freeStudents = t.totalFreeStudents ?? 0;
                      const courseStudents = t.courseEnrolledStudents ?? t.courses.reduce((s, c) => s + c.enrolledStudents, 0);

                      const platformPct = t.platformPercentage ?? (overview.moneyControl?.defaultPercentage ?? 25);
                      const platformShare = t.platformShare ?? ((teacherRevenue * platformPct) / 100);
                      const teacherShare = t.teacherShare ?? (teacherRevenue - platformShare);

                      return (
                        <div key={t.id} style={{ borderTop: "1px solid var(--border)" }}>
                          {/* Teacher row */}
                          <button
                            onClick={() => setExpandedTeacher(isExpanded ? null : t.id)}
                            className="w-full p-4 flex items-center gap-3 text-right transition-colors cursor-pointer border-none"
                            style={{ background: "transparent" }}
                            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--surface-2)"; }}
                            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
                          >
                            <div
                              className="w-10 h-10 text-white rounded-xl flex items-center justify-center font-bold text-lg shrink-0"
                              style={{ background: "var(--brand)" }}
                            >
                              {t.name[0]}
                            </div>
                            <div className="flex-1 min-w-0 text-right">
                              <p className="font-semibold truncate" style={{ color: "var(--ink)" }}>{t.name}</p>
                              <div className="text-xs mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5" style={{ color: "var(--ink-3)" }}>
                                <span className="font-bold text-emerald-400">
                                  💳 {paidStudents} طالب دفعوا ({teacherRevenue.toLocaleString("ar-EG")} ج.م)
                                </span>
                                <span>·</span>
                                <span className="font-bold text-sky-400">
                                  🏛️ حصة المنصة: {platformShare.toLocaleString("ar-EG")} ج.م ({platformPct}%)
                                </span>
                                <span>·</span>
                                <span className="text-amber-300 font-semibold">
                                  👨‍🏫 مستحقات المعلم: {teacherShare.toLocaleString("ar-EG")} ج.م
                                </span>
                                <span>·</span>
                                <span className="text-slate-400">
                                  📚 {t.totalCourses} كورس ({courseStudents} طالب)
                                </span>
                                {freeStudents > 0 && (
                                  <>
                                    <span>·</span>
                                    <span className="text-slate-400 font-medium text-[11px]">
                                      🆓 {freeStudents} مسجل مجاناً
                                    </span>
                                  </>
                                )}
                              </div>
                            </div>
                            <div className="hidden sm:flex flex-col items-end gap-1 shrink-0">
                              <span className="text-sm font-black text-emerald-400">
                                {teacherRevenue.toLocaleString("ar-EG")} ج.م
                              </span>
                              <span className="text-[11px]" style={{ color: "var(--ink-3)" }}>
                                إجمالي الدخل
                              </span>
                            </div>
                            <div className="shrink-0 flex items-center gap-2">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleEnterTeacherPanel(t.id, t.name);
                                }}
                                disabled={enteringTeacherId === t.id}
                                className="px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer border border-sky-500/30 bg-sky-500/10 hover:bg-sky-500/20 text-sky-400 hover:text-sky-300 shadow-sm"
                                title={`دخول لوحة تحكم المعلم (${t.name})`}
                              >
                                <span>{enteringTeacherId === t.id ? "⏳" : "🚪"}</span>
                                <span className="hidden sm:inline">{enteringTeacherId === t.id ? "جارٍ الدخول..." : "لوحة المعلم"}</span>
                              </button>
                              <button
                                onClick={(e) => { e.stopPropagation(); setDeleteTargetTeacher({ id: t.id, name: t.name }); }}
                                className="w-8 h-8 flex items-center justify-center rounded-lg transition-colors cursor-pointer border-none bg-transparent"
                                style={{ color: "var(--danger)" }}
                                aria-label={`حذف ${t.name}`}
                              >
                                <IconTrash className="w-4 h-4" />
                              </button>
                              <span
                                className={`transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`}
                                style={{ color: "var(--ink-3)" }}
                              >
                                ▾
                              </span>
                            </div>
                          </button>


                          {/* Expanded Sections (Reservations + Courses) */}
                          {isExpanded && (
                            <div className="p-4 space-y-4" style={{ background: "var(--bg)", borderTop: "1px solid var(--border)" }}>
                              {/* Quick Enter Banner for Teacher */}
                              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-3.5 rounded-xl bg-sky-500/10 border border-sky-500/20">
                                <div className="flex items-center gap-2.5">
                                  <span className="text-xl">👨‍🏫</span>
                                  <div>
                                    <h4 className="text-xs font-bold text-[var(--ink)]">لوحة تحكم المعلم: {t.name}</h4>
                                    <p className="text-[11px] text-[var(--ink-muted)] mt-0.5">الدخول كالمعلم لإدارة الكورسات، الفيديوهات، باقات الحجز، وأكواد الاشتراكات.</p>
                                  </div>
                                </div>
                                <button
                                  onClick={() => handleEnterTeacherPanel(t.id, t.name)}
                                  disabled={enteringTeacherId === t.id}
                                  className="w-full sm:w-auto px-4 py-2 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-sky-500 to-indigo-600 hover:from-sky-400 hover:to-indigo-500 shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer shrink-0"
                                >
                                  <span>{enteringTeacherId === t.id ? "⏳" : "🚪"}</span>
                                  <span>{enteringTeacherId === t.id ? "جارٍ الدخول..." : "دخول لوحة المعلم الآن ←"}</span>
                                </button>
                              </div>

                              {/* 1. Real TeacherPanel Subscriptions */}
                              <div className="rounded-xl overflow-hidden border border-[var(--border)]" style={{ background: "var(--surface)" }}>
                                <div className="p-3 bg-[var(--surface-2)] border-b border-[var(--border)] flex items-center justify-between">
                                  <div className="flex items-center gap-2">
                                    <span className="text-base">🎟️</span>
                                    <h3 className="font-bold text-xs" style={{ color: "var(--ink)" }}>
                                      حجوزات واشتراكات الطلاب في باقات المعلم (ما دفعه كل طالب)
                                    </h3>
                                  </div>
                                  <span className="text-xs font-bold text-emerald-400">
                                    {realPaidSubs} طالب دفعوا · {realResRevenue.toLocaleString("ar-EG")} ج.م
                                  </span>
                                </div>

                                {!t.subscriptions || t.subscriptions.length === 0 ? (
                                  <p className="p-4 text-xs text-center" style={{ color: "var(--ink-3)" }}>
                                    لا توجد حجوزات باقات مسجلة لهذا المعلم بعد في قسم الحجوزات.
                                  </p>
                                ) : (
                                  <div className="overflow-x-auto max-h-60 overflow-y-auto">
                                    <table className="w-full text-xs">
                                      <thead className="bg-[var(--bg)] border-b border-[var(--border)] text-[var(--ink-3)] font-medium">
                                        <tr>
                                          <th className="px-3 py-2 text-right">الطالب</th>
                                          <th className="px-3 py-2 text-right">رقم الهاتف</th>
                                          <th className="px-3 py-2 text-center">الباقة / الحجز</th>
                                          <th className="px-3 py-2 text-center">المرحلة والمسار</th>
                                          <th className="px-3 py-2 text-center">طريقة وتوثيق الحجز</th>
                                          <th className="px-3 py-2 text-center">المبلغ المدفوع</th>
                                          <th className="px-3 py-2 text-center">وقت وتاريخ الحجز</th>
                                        </tr>
                                      </thead>
                                      <tbody className="divide-y divide-[var(--border)]">
                                        {t.subscriptions.map((sub) => {
                                          const isGateway = sub.paymentSource === "PAYMENT_GATEWAY";
                                          const isWallet = sub.paymentSource === "WALLET";
                                          const isTester = sub.paymentSource === "TESTER_BYPASS" || (sub.amount === 0 && sub.paymentSource !== "MANUAL");

                                          return (
                                            <tr key={sub.id} className="hover:bg-[var(--surface-2)]/50 transition-colors">
                                              <td className="px-3 py-2 font-bold" style={{ color: "var(--ink)" }}>
                                                {sub.studentName}
                                              </td>
                                              <td className="px-3 py-2 font-mono text-[11px]" style={{ color: "var(--ink-2)" }}>
                                                {sub.studentPhone}
                                              </td>
                                              <td className="px-3 py-2 text-center">
                                                <span className="inline-flex px-2 py-0.5 rounded-md text-[11px] font-bold bg-sky-500/10 text-sky-400">
                                                  {sub.planLabel}
                                                </span>
                                              </td>
                                              <td className="px-3 py-2 text-center text-[11px]" style={{ color: "var(--ink-2)" }}>
                                                <span>{sub.educationalStage}</span>
                                                <span className="mx-1">·</span>
                                                <span>{sub.languageTrack === "languages" ? "لغات" : "عربي"}</span>
                                              </td>
                                              <td className="px-3 py-2 text-center">
                                                {isGateway ? (
                                                  <div className="flex flex-col items-center gap-1">
                                                    <span
                                                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-black bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                                                      title={sub.paymentRef ? `بوابة دفع إلكترونية - الرقم المرجعي: ${sub.paymentRef}` : "بوابة دفع إلكترونية (Payment Gateway Log)"}
                                                    >
                                                      <span>💳</span>
                                                      <span>بوابة دفع (Payment Gateway)</span>
                                                    </span>
                                                    {sub.paymentRef && (
                                                      <span className="text-[10px] font-mono text-emerald-300/90 bg-emerald-950/50 px-1.5 py-0.5 rounded border border-emerald-500/20">
                                                        {sub.gatewayProvider ? `${sub.gatewayProvider}: ` : ""}{sub.paymentRef}
                                                      </span>
                                                    )}
                                                  </div>
                                                ) : isWallet ? (
                                                  <span
                                                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-black bg-amber-500/15 text-amber-300 border border-amber-500/30"
                                                    title="خصم مباشر من رصيد المحفظة"
                                                  >
                                                    <span>👛</span>
                                                    <span>رصيد المحفظة (Wallet)</span>
                                                  </span>
                                                ) : isTester ? (
                                                  <span
                                                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-black bg-slate-500/15 text-slate-300 border border-slate-500/30"
                                                    title="حساب فحص تجريبي أو مجاني"
                                                  >
                                                    <span>🧪</span>
                                                    <span>تجريبي (QA Bypass)</span>
                                                  </span>
                                                ) : (
                                                   <div className="flex flex-col items-center gap-1">
                                                     <span
                                                       className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg text-[10px] font-black bg-amber-500/15 text-amber-300 border border-amber-500/30"
                                                       title={`تسجيل يدوي بواسطة ${sub.registeredBy || "المعلم"}`}
                                                     >
                                                       <span>✍️</span>
                                                       <span>يدوي ({sub.registeredBy || "المعلم"})</span>
                                                     </span>
                                                     {sub.paymentRef && (
                                                       <span
                                                         className="text-[9px] font-mono text-amber-200/80 bg-amber-950/40 px-1.5 py-0.5 rounded border border-amber-500/20 flex items-center gap-0.5"
                                                         title={`محاولة فاتورة مسجلة عبر ${sub.gatewayProvider || "بوابة الدفع"}: ${sub.paymentRef}`}
                                                       >
                                                         <span>🔗</span>
                                                         <span>{sub.gatewayProvider ? `${sub.gatewayProvider}: ` : ""}{sub.paymentRef}</span>
                                                       </span>
                                                     )}
                                                   </div>
                                                 )}
                                              </td>
                                              <td className="px-3 py-2 text-center">
                                                {sub.amount > 0 ? (
                                                  <span className="font-bold text-emerald-400">
                                                    {sub.amount.toLocaleString("ar-EG")} ج.م (مدفوع)
                                                  </span>
                                                ) : (
                                                  <span className="text-slate-400 text-[11px]">
                                                    مجاني (0 ج.م)
                                                  </span>
                                                )}
                                              </td>
                                              <td className="px-3 py-2 text-center text-[11px] font-mono whitespace-nowrap">
                                                <div className="text-[var(--ink)] font-bold">
                                                  {new Date(sub.createdAt).toLocaleDateString("ar-EG", {
                                                    year: "numeric",
                                                    month: "2-digit",
                                                    day: "2-digit",
                                                  })}
                                                </div>
                                                <div className="text-[10px] text-sky-400 font-semibold mt-0.5">
                                                  ⏰ {new Date(sub.createdAt).toLocaleTimeString("ar-EG", {
                                                    hour: "2-digit",
                                                    minute: "2-digit",
                                                    hour12: true,
                                                  })}
                                                </div>
                                              </td>
                                            </tr>
                                          );
                                        })}
                                      </tbody>
                                    </table>
                                  </div>
                                )}
                              </div>

                              {/* 2. Teacher Courses */}
                              <div className="rounded-xl overflow-hidden border border-[var(--border)]" style={{ background: "var(--surface)" }}>
                                <div className="p-3 bg-[var(--surface-2)] border-b border-[var(--border)] flex items-center justify-between">
                                  <div className="flex items-center gap-2">
                                    <span className="text-base">📚</span>
                                    <h3 className="font-bold text-xs" style={{ color: "var(--ink)" }}>
                                      كورسات المعلم (المدفوع فقط يُحسب في الإيراد)
                                    </h3>
                                  </div>
                                  <span className="text-xs font-bold" style={{ color: "var(--gold-2)" }}>
                                    {t.courses.length} كورس
                                  </span>
                                </div>

                                {t.courses.length === 0 ? (
                                  <p className="p-4 text-xs text-center" style={{ color: "var(--ink-3)" }}>لا توجد كورسات بعد</p>
                                ) : (
                                  <div className="overflow-x-auto">
                                    <table className="w-full text-xs">
                                      <thead>
                                        <tr className="text-[11px]" style={{ borderBottom: "1px solid var(--border)", color: "var(--ink-3)" }}>
                                          <th className="px-3 py-2 text-right font-medium">الكورس</th>
                                          <th className="px-3 py-2 text-right font-medium">المادة</th>
                                          <th className="px-3 py-2 text-center font-medium">نوع الكورس</th>
                                          <th className="px-3 py-2 text-center font-medium">الطلاب المسجلون</th>
                                          <th className="px-3 py-2 text-center font-medium">السعر</th>
                                          <th className="px-3 py-2 text-center font-medium">الإيراد المحسوب</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {t.courses.map((c) => (
                                          <tr
                                            key={c.id}
                                            className="transition-colors"
                                            style={{ borderTop: "1px solid var(--border)" }}
                                            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--surface-2)"; }}
                                            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
                                          >
                                            <td className="px-3 py-2.5 font-medium max-w-[200px] truncate" style={{ color: "var(--ink)" }}>
                                              {c.title}
                                            </td>
                                            <td className="px-3 py-2.5 text-[11px]" style={{ color: "var(--ink-2)" }}>
                                              {c.subject}
                                            </td>
                                            <td className="px-3 py-2.5 text-center">
                                              {c.isPaid ? (
                                                <span className="inline-flex px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/10 text-amber-400">
                                                  مدفوع
                                                </span>
                                              ) : (
                                                <span className="inline-flex px-2 py-0.5 rounded text-[10px] font-medium bg-slate-500/10 text-slate-400">
                                                  مجاني
                                                </span>
                                              )}
                                            </td>
                                            <td className="px-3 py-2.5 text-center">
                                              <button
                                                type="button"
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  handleOpenCourseStudents(c, t);
                                                }}
                                                className="inline-flex items-center justify-center gap-1.5 rounded-full px-3 py-1 text-xs font-black transition-all hover:scale-105 cursor-pointer shadow-sm border border-indigo-500/30 hover:border-indigo-500/60"
                                                style={{ background: "linear-gradient(135deg, rgba(99, 102, 241, 0.18), rgba(168, 85, 247, 0.18))", color: "#c7d2fe" }}
                                                title="عرض جميع طلاب هذا الكورس وإمكانية إخراج الطالب صامتاً دون إشعار المعلم"
                                              >
                                                <span>👥</span>
                                                <span>{c.enrolledStudents} طالب</span>
                                                <span className="text-[10px] text-indigo-300 underline font-normal mr-0.5">عرض وإدارة</span>
                                              </button>
                                            </td>
                                            <td className="px-3 py-2.5 text-center">
                                              {c.isPaid ? (
                                                <span className="font-semibold" style={{ color: "var(--gold-2)" }}>
                                                  {c.price.toLocaleString("ar-EG")} ج.م
                                                </span>
                                              ) : (
                                                <span className="text-[11px] text-slate-400">0 ج.م (مجاني)</span>
                                              )}
                                            </td>
                                            <td className="px-3 py-2.5 text-center">
                                              {c.revenue > 0 ? (
                                                <span className="font-bold text-emerald-400">
                                                  {c.revenue.toLocaleString("ar-EG")} ج.م
                                                </span>
                                              ) : (
                                                <span className="text-[11px] text-slate-400">— (تم تجاهله)</span>
                                              )}
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
                    })}
                  </div>
                )}
              </div>

              {/* ── Courses Pricing & Collected Amounts (all courses) ── */}
              <div className="rounded-2xl overflow-hidden" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
                <div className="p-4 flex flex-wrap items-center justify-between gap-2" style={{ borderBottom: "1px solid var(--border)" }}>
                  <div>
                    <h2 className="font-black text-base" style={{ color: "var(--ink)", fontFamily: "var(--font-head)" }}>
                      💵 أسعار الكورسات والمبالغ المحصلة
                    </h2>
                    <p className="text-xs mt-0.5" style={{ color: "var(--ink-3)" }}>
                      كل الكورسات — السعر، الخصم، عدد الطلاب، والإيراد المحسوب (الحجوزات المشمولة بالاشتراك لا تُحسب مرتين)
                    </p>
                  </div>
                  <span className="text-xs font-bold" style={{ color: "var(--gold-2)" }}>
                    {overview?.coursesPricing?.length ?? 0} كورس · إجمالي الإيراد:{" "}
                    {(overview?.coursesPricing ?? []).reduce((s, c) => s + (c.revenue || 0), 0).toLocaleString("ar-EG")} ج.م
                  </span>
                </div>
                <div className="overflow-x-auto max-h-[28rem] overflow-y-auto">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0" style={{ background: "var(--surface-2)" }}>
                      <tr className="text-[11px]" style={{ borderBottom: "1px solid var(--border)", color: "var(--ink-3)" }}>
                        <th className="px-3 py-2 text-right font-medium">الكورس</th>
                        <th className="px-3 py-2 text-right font-medium">المعلم</th>
                        <th className="px-3 py-2 text-center font-medium">النوع</th>
                        <th className="px-3 py-2 text-center font-medium">السعر</th>
                        <th className="px-3 py-2 text-center font-medium">الخصم</th>
                        <th className="px-3 py-2 text-center font-medium">الطلاب</th>
                        <th className="px-3 py-2 text-center font-medium">دفع مباشر</th>
                        <th className="px-3 py-2 text-center font-medium">مشمول بحجز</th>
                        <th className="px-3 py-2 text-center font-medium">الإيراد المحسوب</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--border)]">
                      {(overview?.coursesPricing ?? []).map((c) => (
                        <tr key={c.id} className="hover:bg-[var(--surface-2)]/50 transition-colors">
                          <td className="px-3 py-2.5 font-bold max-w-[220px] truncate" style={{ color: "var(--ink)" }} title={c.title}>
                            {c.title}
                          </td>
                          <td className="px-3 py-2.5 text-[11px]" style={{ color: "var(--ink-2)" }}>{c.teacherName}</td>
                          <td className="px-3 py-2.5 text-center">
                            {c.isPaid ? (
                              <span className="inline-flex px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/10 text-amber-400">مدفوع</span>
                            ) : (
                              <span className="inline-flex px-2 py-0.5 rounded text-[10px] font-medium bg-slate-500/10 text-slate-400">مجاني</span>
                            )}
                          </td>
                          <td className="px-3 py-2.5 text-center font-semibold" style={{ color: "var(--gold-2)" }}>
                            {c.isPaid ? `${c.price.toLocaleString("ar-EG")} ج.م` : "—"}
                          </td>
                          <td className="px-3 py-2.5 text-center text-[11px]" style={{ color: c.discountPercent ? "#f59e0b" : "var(--ink-3)" }}>
                            {c.discountPercent ? `${c.discountPercent.toLocaleString("ar-EG")}%` : "—"}
                          </td>
                          <td className="px-3 py-2.5 text-center font-bold" style={{ color: "var(--ink)" }}>
                            {c.enrolledStudents.toLocaleString("ar-EG")}
                          </td>
                          <td className="px-3 py-2.5 text-center text-emerald-400 font-bold">
                            {c.isPaid ? c.coursePaidStudentsCount.toLocaleString("ar-EG") : "—"}
                          </td>
                          <td className="px-3 py-2.5 text-center text-sky-400 font-bold">
                            {c.isPaid ? c.courseCoveredBySubCount.toLocaleString("ar-EG") : "—"}
                          </td>
                          <td className="px-3 py-2.5 text-center">
                            {c.revenue > 0 ? (
                              <span className="font-bold text-emerald-400">{c.revenue.toLocaleString("ar-EG")} ج.م</span>
                            ) : (
                              <span className="text-[11px] text-slate-400">—</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* ── Access & Payment Monitor (anomaly detection log) ── */}
              <div className="rounded-2xl overflow-hidden" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
                <div className="p-4 flex flex-wrap items-center justify-between gap-2" style={{ borderBottom: "1px solid var(--border)" }}>
                  <div>
                    <h2 className="font-black text-base" style={{ color: "var(--ink)", fontFamily: "var(--font-head)" }}>
                      🛡️ سجل مراقبة الوصول والمدفوعات
                    </h2>
                    <p className="text-xs mt-0.5" style={{ color: "var(--ink-3)" }}>
                      أحدث الحجوزات والتسجيلات والحركات المالية — يُعلَّم تلقائياً أي وصول بدون دفع أو سجل لوحة موثّق
                    </p>
                  </div>
                  {(overview?.accessMonitorAlertCount ?? 0) > 0 ? (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-black bg-red-500/15 text-red-400 border border-red-500/30">
                      ⚠️ {(overview?.accessMonitorAlertCount ?? 0).toLocaleString("ar-EG")} عنصر يحتاج مراجعة
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-black bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                      ✓ لا توجد أنومالي
                    </span>
                  )}
                </div>
                <div className="max-h-[28rem] overflow-y-auto divide-y divide-[var(--border)]">
                  {(overview?.accessMonitor ?? []).map((ev) => (
                    <div key={`${ev.kind}-${ev.id}`} className="px-4 py-2.5 flex items-center gap-3 hover:bg-[var(--surface-2)]/40 transition-colors">
                      <span className="text-base shrink-0" title={ev.severity === "ok" ? "موثّق" : "يحتاج مراجعة"}>
                        {ev.severity === "ok" ? "🟢" : ev.severity === "warn" ? "🟡" : "🔴"}
                      </span>
                      <span className="text-base shrink-0" title={ev.kind === "subscription" ? "حجز باقة" : ev.kind === "enrollment" ? "تسجيل كورس" : "حركة مالية"}>
                        {ev.kind === "subscription" ? "🎟️" : ev.kind === "enrollment" ? "📗" : "💳"}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-xs" style={{ color: "var(--ink)" }}>{ev.studentName}</span>
                          <span className="text-[11px] truncate" style={{ color: "var(--ink-2)" }}>{ev.target}</span>
                        </div>
                        <div className="text-[10px] mt-0.5" style={{ color: ev.severity === "ok" ? "var(--ink-3)" : ev.severity === "warn" ? "#f59e0b" : "#f87171" }}>
                          {ev.reason}
                        </div>
                      </div>
                      <span className="shrink-0 inline-flex px-2 py-0.5 rounded text-[10px] font-bold bg-slate-500/10 text-slate-400" title="مصدر الوصول">
                        {ev.source}
                      </span>
                      <span className={`shrink-0 text-xs font-black ${ev.amount > 0 ? "text-emerald-400" : "text-slate-400"}`}>
                        {ev.amount !== 0 ? `${Math.abs(ev.amount).toLocaleString("ar-EG")} ج.م` : "0 ج.م"}
                      </span>
                      <span className="shrink-0 text-[10px] font-mono text-left" style={{ color: "var(--ink-3)" }}>
                        {new Date(ev.createdAt).toLocaleDateString("ar-EG", { month: "2-digit", day: "2-digit" })}
                        {" "}
                        {new Date(ev.createdAt).toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit", hour12: true })}
                      </span>
                    </div>
                  ))}
                  {(overview?.accessMonitor ?? []).length === 0 && !overviewLoading && (
                    <p className="p-6 text-center text-xs" style={{ color: "var(--ink-3)" }}>لا توجد أحداث بعد</p>
                  )}
                </div>
              </div>
            </div>
          )}


          {activeSection === "whatsapp" && <WhatsAppSection />}

          {activeSection === "security-violations" && <SecuritySection />}

          {activeSection === "plans" && <PlansSection userRole={userRole} />}

          {activeSection === "wallet" && <WalletSection />}

          {activeSection === "vdocipher-accounts" && <VdoCipherSection />}

          {activeSection === "axinom-accounts" && <AxinomSection />}

          {activeSection === "students" && <StudentsSection userRole={userRole} refreshKey={refreshKey} />}

          {activeSection === "deleted-students" && <DeletedStudentsSection userRole={userRole} />}

          {activeSection === "daily-exams" && <DailyExamsSection />}

          {activeSection === "leaderboard-prizes" && <LeaderboardPrizesSection />}

          {activeSection === "logs" && <ActivityLogsSection />}

          {activeSection === "staff-accounts" && <StaffAccountsSection userRole={userRole} />}

          {activeSection === "testers" && <TestersSection />}

          {activeSection === "site-text" && <SiteTextSection />}

          {activeSection === "advanced-settings" && <AdvancedSettingsSection />}

          {activeSection === "errors" && <ErrorMonitorSection />}

          {activeSection === "danger-zone" && (
            <AccessGate id="danger-zone" title="منطقة الخطر">
              <DangerZoneSection />
            </AccessGate>
          )}

          {activeSection === "instance" && isOwner && (
            <AccessGate id="instance" title="Instance — لوحة المالك">
              <InstanceControlSection />
            </AccessGate>
          )}

          {/* ── Unified AI Studio Hub ── */}
          {(activeSection === "ai-studio" || activeSection.startsWith("ai-")) && (
            <UnifiedAIStudio />
          )}

          {deleteTargetTeacher && (
            <ConfirmActionModal
              title="حذف حساب المعلم نهائياً"
              description={`تحذير: سيتم حذف حساب المعلم "‏${deleteTargetTeacher.name}‏" وجميع كورساته نهائياً.`}
              actionLabel="حذف نهائياً"
              variant="danger"
              onConfirm={(password) =>
                deleteTeacher(deleteTargetTeacher.id, deleteTargetTeacher.name, password)
              }
              onClose={() => setDeleteTargetTeacher(null)}
            />
          )}

          {activeSection === "teachers" && <TeachersSection userRole={userRole} />}

          {activeSection === "teacher-referrals" && <SuperadminReferredStudentsSection />}

          {activeSection === "deleted-teachers" && <DeletedTeachersSection userRole={userRole} />}

          {activeSection === "create" && (
            <div className="max-w-md">
              <h2
                className="text-xl font-black mb-6"
                style={{ color: "var(--ink)", fontFamily: "var(--font-head)" }}
              >
                إنشاء حساب مدرس جديد
              </h2>
              <form
                onSubmit={createTeacher}
                className="rounded-2xl p-6 space-y-4"
                style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
              >
                <div>
                  <label className="block text-sm font-semibold mb-1" style={{ color: "var(--ink-2)" }}>اسم المعلم</label>
                  <input
                    type="text"
                    required
                    value={newTeacher.name}
                    onChange={(e) => setNewTeacher({ ...newTeacher, name: e.target.value })}
                    className="w-full px-4 py-3 rounded-xl outline-none"
                    style={{ border: "1px solid var(--border)", background: "var(--surface-2)", color: "var(--ink)", fontFamily: "var(--font-body)" }}
                    placeholder="أ. محمد إبراهيم"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold mb-1" style={{ color: "var(--ink-2)" }}>كلمة المرور</label>
                  <input
                    type="password"
                    required
                    minLength={6}
                    value={newTeacher.password}
                    onChange={(e) => setNewTeacher({ ...newTeacher, password: e.target.value })}
                    className="w-full px-4 py-3 rounded-xl outline-none"
                    style={{ border: "1px solid var(--border)", background: "var(--surface-2)", color: "var(--ink)", fontFamily: "var(--font-body)" }}
                    placeholder="••••••••"
                  />
                </div>
                <button
                  type="submit"
                  disabled={creating}
                  className="w-full py-3 text-white font-bold rounded-xl transition-opacity hover:opacity-90 disabled:opacity-60 cursor-pointer border-none"
                  style={{ background: "var(--brand)", boxShadow: "0 6px 18px -6px var(--brand-shadow)", fontFamily: "var(--font-head)", fontSize: 16 }}
                >
                  {creating ? "جارٍ الإنشاء..." : "إنشاء الحساب"}
                </button>
              </form>
            </div>
          )}

        {/* Money Control & Expenses Manager Modal */}
        <MoneyControlModal
          isOpen={isMoneyControlOpen}
          onClose={() => setIsMoneyControlOpen(false)}
          onUpdated={fetchOverview}
        />

        {/* Course Enrolled Students Manager & Silent Sign Out Modal */}
        <CourseStudentsModal
          isOpen={courseStudentsModal.isOpen}
          courseId={courseStudentsModal.courseId}
          courseTitle={courseStudentsModal.courseTitle}
          teacherName={courseStudentsModal.teacherName}
          onClose={() => setCourseStudentsModal((prev) => ({ ...prev, isOpen: false }))}
          onStudentCountChanged={handleCourseStudentCountChanged}
        />
      </div>
    </ClassicAdminShell>
  );
}

