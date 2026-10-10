"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { Compass, Lock, UserPlus } from "lucide-react";
import { ClassicAdminShell } from "@/components/admin/ClassicAdminShell";
import { findSection, getSuperadminHubs } from "@/components/admin/admin-nav";
import { useToast } from "@/components/ui/Toast";
import { Button, EmptyState, Field, Input, PageHeader, Panel, readJson } from "@/components/admin/ui/kit";
import { StudentsSection } from "@/components/admin/superadmin/StudentsSection";
import { TeachersSection } from "@/components/admin/superadmin/TeachersSection";
import { ConfirmActionModal } from "@/components/admin/superadmin/ConfirmActionModal";
import { ActivityLogsSection } from "@/components/admin/superadmin/ActivityLogsSection";
import { DeletedStudentsSection } from "@/components/admin/superadmin/DeletedStudentsSection";
import { DeletedTeachersSection } from "@/components/admin/superadmin/DeletedTeachersSection";
import { StaffAccountsSection } from "@/components/admin/superadmin/StaffAccountsSection";
import { ErrorMonitorSection } from "@/components/admin/superadmin/ErrorMonitorSection";
import { DailyExamsSection } from "@/components/admin/superadmin/DailyExamsSection";
import { PollsSection } from "@/components/admin/superadmin/PollsSection";
import { LeaderboardPrizesSection } from "@/components/admin/superadmin/LeaderboardPrizesSection";
import { DangerZoneSection } from "@/components/admin/superadmin/DangerZoneSection";
import { InstanceControlSection } from "@/components/admin/superadmin/InstanceControlSection";
import { SiteTextSection } from "@/components/admin/superadmin/SiteTextSection";
import { AdvancedSettingsSection } from "@/components/admin/superadmin/AdvancedSettingsSection";
import { AccessGate } from "@/components/admin/superadmin/AccessGate";
import { WalletSection } from "@/components/admin/superadmin/WalletSection";
import { TermsBookingsSection } from "@/components/admin/superadmin/TermsBookingsSection";
import { PlansSection } from "@/components/admin/superadmin/PlansSection";
import { WhatsAppSection } from "@/components/admin/WhatsAppSection";
import { SecuritySection } from "@/components/admin/SecuritySection";
import { VdoCipherSection } from "@/components/admin/superadmin/VdoCipherSection";
import { AxinomSection } from "@/components/admin/superadmin/AxinomSection";
import { OverviewSection } from "@/components/admin/superadmin/overview/OverviewSection";
import type { OverviewData } from "@/components/admin/superadmin/overview/types";
import { UnifiedAIStudio } from "@/components/admin/superadmin/ai/UnifiedAIStudio";
import { SuperadminCopilot } from "@/components/admin/superadmin/SuperadminCopilot";
import { SuperadminReferredStudentsSection } from "@/components/admin/superadmin/SuperadminReferredStudentsSection";
import { MoneyControlModal } from "@/components/admin/superadmin/MoneyControlModal";
import { CourseStudentsModal } from "@/components/admin/superadmin/CourseStudentsModal";
import { AITerminalSection } from "@/components/admin/superadmin/terminal/AITerminalSection";

const TestersSection = dynamic(
  () => import("@/components/admin/superadmin/TestersSection").then((m) => m.TestersSection),
  { ssr: false }
);
const CenterPassesSection = dynamic(
  () => import("@/components/admin/superadmin/CenterPassesSection").then((m) => m.CenterPassesSection),
  { ssr: false }
);

type Role = "superadmin" | "admin" | "staff";

interface Teacher {
  id: string;
  name: string;
}

const DEFAULT_SECTION = "overview";

function sectionFromUrl() {
  if (typeof window === "undefined") return DEFAULT_SECTION;
  return new URLSearchParams(window.location.search).get("section") || DEFAULT_SECTION;
}

export default function SuperadminPage() {
  const router = useRouter();
  const { success: toastSuccess, error: toastError } = useToast();
  const [activeSection, setActiveSectionState] = useState(DEFAULT_SECTION);
  const [userRole, setUserRole] = useState<Role>("superadmin");
  const [isOwner, setIsOwner] = useState(false);
  const [roleReady, setRoleReady] = useState(false);

  const [overview, setOverview] = useState<OverviewData | null>(null);
  const [overviewLoading, setOverviewLoading] = useState(true);
  const [overviewError, setOverviewError] = useState(false);
  const [expandedTeacher, setExpandedTeacher] = useState<string | null>(null);
  const [isMoneyControlOpen, setIsMoneyControlOpen] = useState(false);
  const [isBrutalRefreshing, setIsBrutalRefreshing] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [deleteTargetTeacher, setDeleteTargetTeacher] = useState<Teacher | null>(null);
  const [courseStudentsModal, setCourseStudentsModal] = useState({
    isOpen: false,
    courseId: "",
    courseTitle: "",
    teacherName: "",
  });

  /* ── Section ⇄ URL (refresh, back/forward and shared links all work) ── */
  const setActiveSection = useCallback((id: string) => {
    setActiveSectionState(id);
    const url = new URL(window.location.href);
    if (url.searchParams.get("section") === id) return;
    if (id === DEFAULT_SECTION) url.searchParams.delete("section");
    else url.searchParams.set("section", id);
    url.searchParams.delete("error");
    window.history.pushState({ section: id }, "", url);
  }, []);

  useEffect(() => {
    const onPop = () => setActiveSectionState(sectionFromUrl());
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const sessionExpired = useCallback(() => {
    toastError("انتهت جلسة المشرف. سجّل الدخول من جديد.");
    router.replace("/adminpanel");
  }, [router, toastError]);

  /**
   * Loads the overview board. `remember` stores a "page opened" reading for the
   * Time Machine — only the first load of the page should do that; later
   * refreshes (after edits, polls, sync) must not pollute the snapshot history.
   */
  const fetchOverview = useCallback(
    async ({ silent = false, remember = false }: { silent?: boolean; remember?: boolean } = {}) => {
      if (!silent) setOverviewLoading(true);
      try {
        const qs = new URLSearchParams({ _t: String(Date.now()) });
        if (remember) qs.set("remember", "1");
        const res = await fetch(`/api/admin/superadmin/overview?${qs}`, { credentials: "include" });
        if (res.status === 401) {
          sessionExpired();
          return;
        }
        const data = await readJson<OverviewData>(res);
        if (res.ok && data && Array.isArray(data.teachers)) {
          setOverview(data);
          setOverviewError(false);
        } else if (!silent) {
          setOverviewError(true);
        }
      } catch {
        if (!silent) setOverviewError(true);
      } finally {
        if (!silent) setOverviewLoading(false);
      }
    },
    [sessionExpired]
  );

  const silentOverview = useCallback(() => void fetchOverview({ silent: true }), [fetchOverview]);

  // Live "right now" bookings: silently re-poll every 60s while the overview is visible.
  useEffect(() => {
    if (activeSection !== "overview") return;
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") silentOverview();
    }, 60000);
    return () => clearInterval(timer);
  }, [activeSection, silentOverview]);

  const initRan = useRef(false);
  useEffect(() => {
    if (initRan.current) return;
    initRan.current = true;
    const params = new URLSearchParams(window.location.search);
    setActiveSectionState(params.get("section") || DEFAULT_SECTION);
    const err = params.get("error");
    if (err) toastError(err);

    void (async () => {
      try {
        const meRes = await fetch("/api/auth/me", { credentials: "include" });
        if (meRes.status === 401) {
          sessionExpired();
          return;
        }
        const meData = await readJson<{ user?: { role?: string; isOwner?: boolean } }>(meRes);
        const role = meData?.user?.role;
        if (role === "admin" || role === "staff") setUserRole(role);
        setIsOwner(!!meData?.user?.isOwner);
      } catch {
        /* keep defaults; API routes enforce permissions anyway */
      } finally {
        setRoleReady(true);
      }
    })();
    void fetchOverview({ remember: true });
  }, [fetchOverview, sessionExpired, toastError]);

  const handleBrutalRefresh = async () => {
    setIsBrutalRefreshing(true);
    try {
      // 1. Ask the payment gateways for anything that completed but was not reconciled yet.
      const syncRes = await fetch(`/api/admin/superadmin/sync-payments?_t=${Date.now()}`, {
        method: "POST",
        credentials: "include",
      });
      if (syncRes.status === 401) {
        sessionExpired();
        return;
      }
      const syncData = await readJson<{
        totalReconciled?: number;
        reconciled?: Array<{ studentName: string }>;
        error?: string;
      }>(syncRes);

      // 2. Reload the board and tell child sections to refetch.
      await fetchOverview({ silent: true });
      setRefreshKey((k) => k + 1);

      if (!syncRes.ok) {
        toastError(syncData?.error || "تم تحديث البيانات، لكن تعذر فحص بوابات الدفع.");
      } else if (syncData?.totalReconciled && syncData.totalReconciled > 0) {
        const names = syncData.reconciled?.map((r) => r.studentName).join("، ") || "";
        toastSuccess(`تم تأكيد ${syncData.totalReconciled} اشتراك جديد${names ? `: ${names}` : ""}`);
      } else {
        toastSuccess("تم التحديث. لا توجد مدفوعات جديدة بانتظار التأكيد.");
      }
    } catch {
      toastError("تعذر إتمام التحديث، حاول مرة أخرى.");
    } finally {
      setIsBrutalRefreshing(false);
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
    if (!res.ok) throw new Error(data?.error ?? "تعذر حذف حساب المعلم");
    toastSuccess(`تم حذف حساب المعلم "${teacherName}"`);
    setDeleteTargetTeacher(null);
    silentOverview();
  };

  const handleCourseStudentCountChanged = (courseId: string, newActiveCount: number) => {
    setOverview((prev) =>
      prev
        ? {
            ...prev,
            teachers: prev.teachers.map((t) => ({
              ...t,
              courses: t.courses.map((c) => (c.id === courseId ? { ...c, enrolledStudents: newActiveCount } : c)),
            })),
          }
        : prev
    );
  };

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
    router.push("/adminpanel");
  };

  const hubs = getSuperadminHubs({ isOwner, role: userRole });
  const known = findSection(hubs, activeSection) || activeSection.startsWith("ai-");

  const renderSection = () => {
    switch (activeSection) {
      case "overview":
        return (
          <OverviewSection
            overview={overview}
            loading={overviewLoading}
            error={overviewError}
            refreshing={isBrutalRefreshing}
            onBrutalRefresh={handleBrutalRefresh}
            onOpenMoneyControl={() => setIsMoneyControlOpen(true)}
            onAddTeacher={() => setActiveSection("create")}
            expandedTeacher={expandedTeacher}
            setExpandedTeacher={setExpandedTeacher}
            onDeleteTeacher={(t) => setDeleteTargetTeacher(t)}
            onOpenCourseStudents={(course, teacher) =>
              setCourseStudentsModal({ isOpen: true, courseId: course.id, courseTitle: course.title, teacherName: teacher.name })
            }
            onRefreshOverview={silentOverview}
            onRetry={() => void fetchOverview()}
            onOpenCopilot={userRole === "superadmin" ? () => setActiveSection("ai-copilot") : undefined}
          />
        );
      case "whatsapp":
        return <WhatsAppSection />;
      case "security-violations":
        return <SecuritySection />;
      case "plans":
        return <PlansSection userRole={userRole} />;
      case "wallet":
        return <WalletSection />;
      case "teacher-packages":
      case "terms-bookings":
        return <TermsBookingsSection />;
      case "vdocipher-accounts":
        return <VdoCipherSection />;
      case "axinom-accounts":
        return <AxinomSection />;
      case "students":
        return <StudentsSection userRole={userRole} refreshKey={refreshKey} />;
      case "deleted-students":
        return <DeletedStudentsSection userRole={userRole} />;
      case "daily-exams":
        return <DailyExamsSection />;
      case "leaderboard-prizes":
        return <LeaderboardPrizesSection />;
      case "polls":
        return <PollsSection />;
      case "logs":
        return <ActivityLogsSection />;
      case "staff-accounts":
        return <StaffAccountsSection userRole={userRole} />;
      case "testers":
        return <TestersSection />;
      case "center-passes":
        return <CenterPassesSection />;
      case "site-text":
        return <SiteTextSection />;
      case "advanced-settings":
        return <AdvancedSettingsSection />;
      case "errors":
        return <ErrorMonitorSection />;
      case "teachers":
        return <TeachersSection userRole={userRole} onChanged={silentOverview} />;
      case "teacher-referrals":
        return <SuperadminReferredStudentsSection />;
      case "deleted-teachers":
        return <DeletedTeachersSection userRole={userRole} />;
      case "create":
        return <CreateTeacherForm onCreated={silentOverview} onDone={() => setActiveSection("teachers")} />;
      case "danger-zone":
        return (
          <AccessGate id="danger-zone" title="منطقة الخطر">
            <DangerZoneSection />
          </AccessGate>
        );
      case "instance":
        if (!roleReady) return null;
        return isOwner ? (
          <AccessGate id="instance" title="لوحة السيرفر — للمالك">
            <InstanceControlSection />
          </AccessGate>
        ) : (
          <Restricted text="لوحة السيرفر متاحة لمالك المنصة فقط." />
        );
      case "ai-copilot":
        if (!roleReady) return null;
        return userRole === "superadmin" ? (
          <SuperadminCopilot />
        ) : (
          <Restricted text="المساعد للمشرف العام فقط. اطلب من المالك إن كنت تحتاج الأرقام." />
        );
      case "ai-terminal":
        if (!roleReady) return null;
        return userRole === "superadmin" ? (
          <AITerminalSection userRole={userRole} isOwner={isOwner} />
        ) : (
          <Restricted text="وحدة التحكم بالأوامر متاحة للمشرف العام فقط." />
        );
      default:
        if (activeSection.startsWith("ai-")) return <UnifiedAIStudio />;
        return null;
    }
  };

  return (
    <ClassicAdminShell
      role={userRole}
      activeSection={activeSection}
      setActiveSection={setActiveSection}
      onLogout={handleLogout}
      isOwner={isOwner}
      headerTitle="لوحة التحكم"
      headerSubtitle="Code-UP"
      onRefresh={handleBrutalRefresh}
      refreshing={isBrutalRefreshing}
      onOpenMoneyControl={() => setIsMoneyControlOpen(true)}
    >
      {known || !roleReady ? (
        renderSection()
      ) : (
        <Panel>
          <EmptyState
            icon={<Compass size={22} />}
            title="هذا القسم غير موجود"
            text="ربما تغيّر اسمه أو أنه غير متاح لصلاحياتك. استخدم البحث (Ctrl K) أو ارجع للنظرة العامة."
            action={
              <Button variant="primary" onClick={() => setActiveSection(DEFAULT_SECTION)}>
                العودة للنظرة العامة
              </Button>
            }
          />
        </Panel>
      )}

      {deleteTargetTeacher && (
        <ConfirmActionModal
          title="حذف حساب المعلم نهائياً"
          description={`سيتم حذف حساب المعلم "‏${deleteTargetTeacher.name}‏" وجميع كورساته نهائياً.`}
          actionLabel="حذف نهائياً"
          variant="danger"
          onConfirm={(password) => deleteTeacher(deleteTargetTeacher.id, deleteTargetTeacher.name, password)}
          onClose={() => setDeleteTargetTeacher(null)}
        />
      )}

      <MoneyControlModal isOpen={isMoneyControlOpen} onClose={() => setIsMoneyControlOpen(false)} onUpdated={silentOverview} />

      <CourseStudentsModal
        isOpen={courseStudentsModal.isOpen}
        courseId={courseStudentsModal.courseId}
        courseTitle={courseStudentsModal.courseTitle}
        teacherName={courseStudentsModal.teacherName}
        onClose={() => setCourseStudentsModal((prev) => ({ ...prev, isOpen: false }))}
        onStudentCountChanged={handleCourseStudentCountChanged}
      />
    </ClassicAdminShell>
  );
}

function Restricted({ text }: { text: string }) {
  return (
    <Panel>
      <EmptyState icon={<Lock size={22} />} title="غير متاح لحسابك" text={text} />
    </Panel>
  );
}

function CreateTeacherForm({ onCreated, onDone }: { onCreated: () => void; onDone: () => void }) {
  const { success: toastSuccess } = useToast();
  const [form, setForm] = useState({ name: "", password: "" });
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [created, setCreated] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setCreating(true);
    try {
      const res = await fetch("/api/admin/teachers", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: form.name.trim(), password: form.password }),
      });
      const data = await readJson<{ error?: string }>(res);
      if (!res.ok) {
        setError(data?.error || "تعذر إنشاء حساب المعلم");
        return;
      }
      toastSuccess(`تم إنشاء حساب المعلم "${form.name.trim()}"`);
      setCreated(form.name.trim());
      setForm({ name: "", password: "" });
      onCreated();
    } catch {
      setError("تعذر الاتصال بالخادم");
    } finally {
      setCreating(false);
    }
  };

  return (
    <>
      <PageHeader title="إضافة معلم" description="أنشئ حساباً لمعلم جديد. يدخل المعلم باسمه وكلمة المرور من صفحة دخول لوحة الإدارة." />
      <div className="max-w-xl">
        <Panel
          title="بيانات الحساب"
          icon={<UserPlus size={16} />}
          footer={
            <>
              <span className="adm-hint">كلمة المرور ٦ أحرف على الأقل. يمكن تغييرها لاحقاً من قسم المعلمين.</span>
              <Button variant="primary" type="submit" form="adm-create-teacher" loading={creating}>
                {creating ? "جارٍ الإنشاء" : "إنشاء الحساب"}
              </Button>
            </>
          }
        >
          <form id="adm-create-teacher" onSubmit={submit} className="flex flex-col gap-4">
            {created && (
              <div className="adm-notice is-ok">
                <span>
                  تم إنشاء حساب <b>{created}</b>.{" "}
                  <button type="button" onClick={onDone} className="font-bold underline cursor-pointer" style={{ color: "var(--brand)" }}>
                    عرض المعلمين
                  </button>
                </span>
              </div>
            )}
            <Field label="اسم المعلم" htmlFor="new-teacher-name">
              <Input
                id="new-teacher-name"
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="أ. محمد إبراهيم"
                autoComplete="off"
              />
            </Field>
            <Field label="كلمة المرور" htmlFor="new-teacher-pass" error={error || undefined}>
              <Input
                id="new-teacher-pass"
                type="password"
                required
                minLength={6}
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                placeholder="••••••••"
                autoComplete="new-password"
                aria-invalid={error ? true : undefined}
              />
            </Field>
          </form>
        </Panel>
      </div>
    </>
  );
}
