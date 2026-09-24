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
import { OverviewSection } from "@/components/admin/superadmin/overview/OverviewSection";
import type { OverviewData } from "@/components/admin/superadmin/overview/types";
import dynamic from "next/dynamic";

import { UnifiedAIStudio } from "@/components/admin/superadmin/ai/UnifiedAIStudio";
import { SuperadminCopilot } from "@/components/admin/superadmin/SuperadminCopilot";
const TestersSection = dynamic(
  () => import("@/components/admin/superadmin/TestersSection").then((m) => m.TestersSection),
  { ssr: false }
);
const CenterPassesSection = dynamic(
  () => import("@/components/admin/superadmin/CenterPassesSection").then((m) => m.CenterPassesSection),
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

  const fetchTeachers = async () => {
    const res = await fetch(`/api/admin/teachers?_t=${Date.now()}`, { credentials: "include" });
    if (res.status === 401) {
      toastError("انتهت جلسة المشرف. سجّل الدخول من لوحة الإدارة.");
      router.replace("/adminpanel");
    }
  };

  const fetchOverview = async (silent = false) => {
    if (!silent) setOverviewLoading(true);
    try {
      const qs = new URLSearchParams({ _t: String(Date.now()) });
      if (!silent) qs.set("remember", "1");
      const res = await fetch(`/api/admin/superadmin/overview?${qs}`, { credentials: "include" });
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
    } catch {
      toastError("تعذر إتمام التحديث الشامل، حاول مجدداً.");
    } finally {
      setIsBrutalRefreshing(false);
      setOverviewLoading(false);
    }
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const section = params.get("section");
    const err = params.get("error");
    if (section) setActiveSection(section);
    if (err) toastError(err);

    const init = async () => {
      const meRes = await fetch("/api/auth/me", { credentials: "include" });
      const meData = await meRes.json() as { user?: { role?: string; isOwner?: boolean } };
      const role = meData?.user?.role;
      if (role === "admin" || role === "staff") setUserRole(role);
      setIsOwner(!!meData?.user?.isOwner);
      await Promise.all([fetchTeachers(), fetchOverview()]);
    };
    void init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      await Promise.all([fetchTeachers(), fetchOverview(true)]);
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
      await Promise.all([fetchTeachers(), fetchOverview(true)]);
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
          <OverviewSection
            overview={overview}
            loading={overviewLoading}
            refreshing={isBrutalRefreshing}
            onBrutalRefresh={handleBrutalRefresh}
            onOpenMoneyControl={() => setIsMoneyControlOpen(true)}
            onAddTeacher={() => setActiveSection("create")}
            expandedTeacher={expandedTeacher}
            setExpandedTeacher={setExpandedTeacher}
            onDeleteTeacher={(t) => setDeleteTargetTeacher(t)}
            onOpenCourseStudents={handleOpenCourseStudents}
            onRefreshOverview={() => { void fetchOverview(true); }}
            onOpenCopilot={userRole === "superadmin" ? () => setActiveSection("ai-copilot") : undefined}
          />
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

          {activeSection === "center-passes" && <CenterPassesSection />}

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

          {/* ── Superadmin HQ Copilot (DeepSeek / Gemini) — superadmin only ── */}
          {activeSection === "ai-copilot" && userRole === "superadmin" && <SuperadminCopilot />}
          {activeSection === "ai-copilot" && userRole !== "superadmin" && (
            <div className="rounded-2xl p-8 text-center" dir="rtl" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
              <p className="font-black" style={{ color: "var(--ink)" }}>هذا المساعد للمشرف العام فقط</p>
              <p className="text-sm mt-2" style={{ color: "var(--ink-2)" }}>لا يصل إليه المشرفون أو الموظفون. اطلب من المالك إن كنت تحتاج الأرقام.</p>
            </div>
          )}

          {/* ── Unified AI Studio Hub ── */}
          {(activeSection === "ai-studio" || (activeSection.startsWith("ai-") && activeSection !== "ai-copilot")) && (
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

          {activeSection === "teachers" && (
            <TeachersSection userRole={userRole} onChanged={() => void fetchOverview(true)} />
          )}

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
