"use client";

import React, { useState } from "react";
import {
  LayoutDashboard,
  Users,
  GraduationCap,
  Wallet,
  Bot,
  Settings,
  Shield,
  ShieldAlert,
  Video,
  Phone,
  Activity,
  FileText,
  Sparkles,
  ChevronDown,
  X,
  LogOut,
  Layers,
  Award,
  AlertTriangle,
  Flame,
  KeyRound,
  Eye,
  Server,
  UserPlus,
  RefreshCw,
  LifeBuoy,
  Menu,
  Search,
  UserCog,
} from "lucide-react";
import { DarkModeToggle } from "@/components/ui/DarkModeToggle";
import { AdminActionPasswordBar } from "@/components/admin/AdminActionPasswordBar";
import { MaintenanceWarningBanner } from "@/components/ui/MaintenanceWarningBanner";

export interface NavSection {
  id: string;
  label: string;
  badge?: string | number;
  badgeVariant?: "default" | "warning" | "danger" | "bronze";
  icon?: React.ReactNode;
}

export interface NavHub {
  id: string;
  title: string;
  icon: React.ReactNode;
  sections: NavSection[];
}

interface ClassicAdminShellProps {
  role: "superadmin" | "admin" | "staff" | "teacher" | "assistant";
  activeSection: string;
  setActiveSection: (id: string) => void;
  onLogout: () => void;
  isOwner?: boolean;
  headerTitle?: string;
  headerSubtitle?: string;
  onRefresh?: () => void;
  refreshing?: boolean;
  onOpenMoneyControl?: () => void;
  allowedSectionIds?: string[] | null;
  children: React.ReactNode;
}

export function ClassicAdminShell({
  role,
  activeSection,
  setActiveSection,
  onLogout,
  isOwner,
  headerTitle = "لوحة التحكم التنفيذية",
  headerSubtitle = "المشرف العام — منصة Code-UP",
  onRefresh,
  refreshing,
  onOpenMoneyControl,
  allowedSectionIds,
  children,
}: ClassicAdminShellProps) {
  // Mobile bottom sheet state
  const [mobileActiveHub, setMobileActiveHub] = useState<string | null>(null);
  const [isMobileAllMenuOpen, setIsMobileAllMenuOpen] = useState(false);
  const [mobileSearchQuery, setMobileSearchQuery] = useState("");

  // Desktop accordion open state for hubs
  const [openHubs, setOpenHubs] = useState<Record<string, boolean>>({
    main: true,
    users: true,
    finance: true,
    ai: true,
    operations: false,
  });

  const toggleHub = (hubId: string) => {
    setOpenHubs((prev) => ({ ...prev, [hubId]: !prev[hubId] }));
  };

  // Define Category Hubs for SuperAdmin
  const superadminHubs: NavHub[] = [
    {
      id: "main",
      title: "المركز الرئيسي والرقابة",
      icon: <LayoutDashboard className="w-4 h-4" />,
      sections: [
        { id: "overview", label: "نظرة عامة والتقارير", icon: <LayoutDashboard className="w-3.5 h-3.5" /> },
        { id: "security-violations", label: "الرصد الأمني والمخالفات", badge: "Live", badgeVariant: "danger", icon: <ShieldAlert className="w-3.5 h-3.5" /> },
        { id: "logs", label: "سجلات النشاط والأحداث", icon: <Activity className="w-3.5 h-3.5" /> },
        { id: "errors", label: "مراقبة الأخطاء والتحذيرات", icon: <AlertTriangle className="w-3.5 h-3.5" /> },
      ],
    },
    {
      id: "users",
      title: "المتعلمون والمعلمون",
      icon: <Users className="w-4 h-4" />,
      sections: [
        { id: "students", label: "إدارة المتعلمين", icon: <GraduationCap className="w-3.5 h-3.5" /> },
        { id: "deleted-students", label: "المتعلمون المرشحون", icon: <Users className="w-3.5 h-3.5" /> },
        { id: "teachers", label: "إدارة المعلمين", icon: <Users className="w-3.5 h-3.5" /> },
        { id: "create", label: "إنشاء حساب معلم جديد", icon: <UserPlus className="w-3.5 h-3.5" /> },
        { id: "teacher-referrals", label: "برامج إحالة المعلمين", icon: <Layers className="w-3.5 h-3.5" /> },
        { id: "deleted-teachers", label: "المعلمون المحذوفون", icon: <Users className="w-3.5 h-3.5" /> },
      ],
    },
    {
      id: "finance",
      title: "المالية والاشتراكات",
      icon: <Wallet className="w-4 h-4" />,
      sections: [
        { id: "wallet", label: "إدارة الرصيد والمحافظ", icon: <Wallet className="w-3.5 h-3.5" /> },
        { id: "plans", label: "الخطط الدراسية", icon: <FileText className="w-3.5 h-3.5" /> },
        { id: "vdocipher-accounts", label: "باقات وسيرفرات VdoCipher", icon: <Video className="w-3.5 h-3.5" /> },
        { id: "axinom-accounts", label: "باقات وتراخيص Axinom DRM", icon: <Shield className="w-3.5 h-3.5" /> },
      ],
    },
    {
      id: "ai",
      title: "استوديو الذكاء الاصطناعي",
      icon: <Bot className="w-4 h-4" />,
      sections: [
        { id: "ai-studio", label: "مركز الذكاء الاصطناعي الموحد", badge: "AI Studio", badgeVariant: "bronze", icon: <Sparkles className="w-3.5 h-3.5" /> },
      ],
    },
    {
      id: "operations",
      title: "إدارة المنصة والإعدادات",
      icon: <Settings className="w-4 h-4" />,
      sections: [
        { id: "staff-accounts", label: "المشرفون والموظفون", icon: <KeyRound className="w-3.5 h-3.5" /> },
        { id: "testers", label: "حسابات الفحص (QA Testers)", icon: <Eye className="w-3.5 h-3.5" /> },
        { id: "whatsapp", label: "خدمة WhatsApp (Baileys)", icon: <Phone className="w-3.5 h-3.5" /> },
        { id: "daily-exams", label: "امتحانات لوحة الشرف", icon: <Award className="w-3.5 h-3.5" /> },
        { id: "leaderboard-prizes", label: "جوائز لوحة الشرف", icon: <Award className="w-3.5 h-3.5" /> },
        { id: "site-text", label: "نصوص الموقع", icon: <FileText className="w-3.5 h-3.5" /> },
        { id: "advanced-settings", label: "الإعدادات المتقدمة", icon: <Settings className="w-3.5 h-3.5" /> },
        { id: "danger-zone", label: "منطقة الخطر — حذف جماعي", icon: <Flame className="w-3.5 h-3.5" /> },
        ...(isOwner ? [{ id: "instance", label: "Instance — لوحة المالك", icon: <Server className="w-3.5 h-3.5" /> }] : []),
      ],
    },
  ];

  // Define Category Hubs for Teacher (Enterprise Studio Architecture)
  const teacherHubs: NavHub[] = [
    {
      id: "academic",
      title: "المركز الأكاديمي والتحليلات",
      icon: <LayoutDashboard className="w-4 h-4" />,
      sections: [
        { id: "dashboard", label: "مؤشرات الأداء والتحليلات", icon: <LayoutDashboard className="w-3.5 h-3.5" /> },
        { id: "my-page", label: "الملف التعريفي العام للمعلم", icon: <Eye className="w-3.5 h-3.5" /> },
        { id: "assistants", label: "المساعدون", icon: <UserCog className="w-3.5 h-3.5" /> },
      ],
    },
    {
      id: "curriculum",
      title: "استوديو الكورسات والمحاضرات",
      icon: <Video className="w-4 h-4" />,
      sections: [
        { id: "courses", label: "إدارة الكورسات والمحاضرات", badge: "Studio", badgeVariant: "bronze", icon: <Layers className="w-3.5 h-3.5" /> },
        { id: "create-course", label: "إنشاء كورس ومسار جديد", icon: <UserPlus className="w-3.5 h-3.5" /> },
      ],
    },
    {
      id: "assessment",
      title: "التقييم والأنشطة الأكاديمية",
      icon: <Award className="w-4 h-4" />,
      sections: [
        { id: "homework", label: "إدارة الواجبات والملفات", icon: <FileText className="w-3.5 h-3.5" /> },
        { id: "review", label: "مركز تصحيح الإجابات المباشر", badge: "Live", badgeVariant: "warning", icon: <Activity className="w-3.5 h-3.5" /> },
        { id: "quiz-results", label: "سجل ونتائج الاختبارات", icon: <Award className="w-3.5 h-3.5" /> },
        { id: "in-video-responses", label: "تصحيح الأسئلة المقالية (اختبارات وفيديو)", icon: <Activity className="w-3.5 h-3.5" /> },
        { id: "grade-requests", label: "طلبات تعديل الدرجات", icon: <Award className="w-3.5 h-3.5" /> },
      ],
    },
    {
      id: "students",
      title: "الطلاب والاشتراكات والوصول",
      icon: <Users className="w-4 h-4" />,
      sections: [
        { id: "teacher-subscriptions", label: "حجوزات واشتراكات الطلاب", icon: <Wallet className="w-3.5 h-3.5" /> },
        { id: "students", label: "قائمة الطلاب وأرقامهم", icon: <Phone className="w-3.5 h-3.5" /> },
        { id: "codes", label: "توليد أكواد الوصول الذكية", icon: <KeyRound className="w-3.5 h-3.5" /> },
        { id: "referred-students", label: "الطلاب المُحالون والإحالات", icon: <Users className="w-3.5 h-3.5" /> },
        { id: "requests", label: "طلبات زيادة المشاهدات", icon: <Eye className="w-3.5 h-3.5" /> },
        { id: "tickets", label: "تذاكر الدعم والاستفسارات", icon: <LifeBuoy className="w-3.5 h-3.5" /> },
        { id: "feedback", label: "ملاحظات وتقييمات الطلاب", icon: <FileText className="w-3.5 h-3.5" /> },
      ],
    },
  ];

  const baseHubs = role === "teacher" || role === "assistant" ? teacherHubs : superadminHubs;
  const hubs = allowedSectionIds
    ? baseHubs
        .map((hub) => ({
          ...hub,
          sections: hub.sections.filter((s) => allowedSectionIds.includes(s.id)),
        }))
        .filter((hub) => hub.sections.length > 0)
    : role === "assistant"
      ? baseHubs
          .map((hub) => ({
            ...hub,
            sections: hub.sections.filter((s) => s.id !== "assistants" && s.id !== "my-page"),
          }))
          .filter((hub) => hub.sections.length > 0)
      : baseHubs;

  // Mobile Bottom Navigation Anchors
  const teacherAnchors = [
    { hubId: "academic", label: "الرئيسية", directId: "dashboard", icon: <LayoutDashboard className="w-5 h-5" /> },
    { hubId: "curriculum", label: "الكورسات", directId: "courses", icon: <Video className="w-5 h-5" /> },
    { hubId: "assessment", label: "التقييم", icon: <Award className="w-5 h-5" /> },
    { hubId: "students", label: "الطلاب", icon: <Users className="w-5 h-5" /> },
    { hubId: "all_menu", label: "كل الخيارات", isMenu: true, icon: <Menu className="w-5 h-5" /> },
  ].filter((anchor) => anchor.isMenu || hubs.some((h) => h.id === anchor.hubId));

  const mobileAnchors = role === "teacher" || role === "assistant" ? teacherAnchors : [
    { hubId: "main", label: "الرئيسية", icon: <LayoutDashboard className="w-5 h-5" /> },
    { hubId: "users", label: "المستخدمين", icon: <Users className="w-5 h-5" /> },
    { hubId: "finance", label: "المالية", icon: <Wallet className="w-5 h-5" /> },
    { hubId: "ai", label: "الذكاء", directId: "ai-studio", icon: <Bot className="w-5 h-5" /> },
    { hubId: "all_menu", label: "كل الخيارات", isMenu: true, icon: <Menu className="w-5 h-5" /> },
  ];

  const handleMobileAnchorClick = (anchor: { hubId: string; directId?: string; isMenu?: boolean }) => {
    if (anchor.isMenu) {
      setIsMobileAllMenuOpen(true);
      setMobileActiveHub(null);
      return;
    }
    if (anchor.directId) {
      setActiveSection(anchor.directId);
      setMobileActiveHub(null);
    } else {
      setMobileActiveHub(anchor.hubId);
    }
  };

  // 50% / 50% chance: Native Dark Green ("emerald") or Native Blue ("blue")
  const [accentTheme] = useState<"emerald" | "blue">(() => {
    if (typeof window === "undefined") return "emerald";
    try {
      const stored = localStorage.getItem("admin_accent_mode");
      if (stored === "emerald" || stored === "blue") return stored;
      const chosen: "emerald" | "blue" = Math.random() < 0.5 ? "emerald" : "blue";
      localStorage.setItem("admin_accent_mode", chosen);
      return chosen;
    } catch {
      return "emerald";
    }
  });

  const selectedMobileHub = hubs.find((h) => h.id === mobileActiveHub);

  return (
    <div
      dir="rtl"
      className={`min-h-screen bg-[#f8fafc] text-slate-900 dark:bg-slate-950 dark:text-slate-100 flex flex-col font-sans transition-colors duration-200 ${
        accentTheme === "emerald"
          ? "selection:bg-emerald-500/20 selection:text-emerald-900 dark:selection:text-emerald-300"
          : "selection:bg-blue-500/20 selection:text-blue-900 dark:selection:text-blue-300"
      }`}
    >
      {/* ── Top Executive Header (Clean White / Pure Dark) ── */}
      <header className="sticky top-0 z-40 bg-white text-slate-900 border-b border-slate-200 shadow-sm dark:bg-slate-900 dark:text-white dark:border-slate-800 px-4 sm:px-8 py-3.5">
        <div className="flex items-center justify-between gap-4 w-full max-w-[1720px] mx-auto">
          {/* Brand & Identity */}
          <div className="flex items-center gap-2.5 sm:gap-3.5">
            {/* Mobile Hamburger Menu Toggle */}
            <button
              type="button"
              onClick={() => setIsMobileAllMenuOpen(true)}
              aria-label="قائمة الخيارات والأقسام"
              title="فتح القائمة الكاملة"
              className="lg:hidden w-10 h-10 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 border border-slate-300 dark:border-slate-700 flex items-center justify-center transition-all cursor-pointer shadow-sm ml-1"
            >
              <Menu className="w-5 h-5" />
            </button>

            <div
              className={`w-10 h-10 rounded-xl border flex items-center justify-center shadow-md transition-colors ${
                accentTheme === "emerald"
                  ? "bg-emerald-950 text-emerald-400 border-emerald-800 dark:bg-emerald-950 dark:border-emerald-700"
                  : "bg-slate-900 text-blue-400 border-blue-900 dark:bg-blue-950 dark:border-blue-700"
              }`}
            >
              <span className="font-black text-lg font-serif">C</span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base sm:text-lg font-black text-slate-900 dark:text-white tracking-wide">
                  {headerTitle}
                </h1>
                <span
                  className={`hidden sm:inline-flex px-2.5 py-0.5 rounded-md text-xs font-bold border transition-colors ${
                    accentTheme === "emerald"
                      ? "bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-800/60"
                      : "bg-blue-50 text-blue-800 border-blue-200 dark:bg-blue-950/50 dark:text-blue-300 dark:border-blue-800/60"
                  }`}
                >
                  {role === "superadmin"
                    ? "المشرف العام"
                    : role === "teacher"
                      ? "لوحة المعلم"
                      : role === "assistant"
                        ? "مساعد المعلم"
                        : role}
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 hidden sm:block">
                {headerSubtitle}
              </p>
            </div>
          </div>

          {/* Header Quick Actions */}
          <div className="flex items-center gap-2.5">
            {/* Custom Banana Security Key Action Password Button (Only for SuperAdmin) */}
            {role === "superadmin" && <AdminActionPasswordBar />}

            {onOpenMoneyControl && (
              <button
                onClick={onOpenMoneyControl}
                className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-200 dark:border-slate-700 text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-sm"
              >
                <span>💰</span>
                <span className="hidden sm:inline">المصروفات والأرباح</span>
              </button>
            )}

            {onRefresh && (
              <button
                onClick={onRefresh}
                disabled={refreshing}
                title="تحديث البيانات"
                className="w-9 h-9 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-300 dark:border-slate-700 flex items-center justify-center transition-all disabled:opacity-50 cursor-pointer shadow-sm"
              >
                <RefreshCw
                  className={`w-4 h-4 ${
                    refreshing
                      ? accentTheme === "emerald"
                        ? "animate-spin text-emerald-600 dark:text-emerald-400"
                        : "animate-spin text-blue-600 dark:text-blue-400"
                      : ""
                  }`}
                />
              </button>
            )}

            <DarkModeToggle />

            <button
              onClick={onLogout}
              title="تسجيل الخروج"
              className="w-9 h-9 rounded-xl bg-slate-100 hover:bg-rose-50 text-slate-600 hover:text-rose-600 border border-slate-300 dark:bg-slate-800 dark:hover:bg-rose-950/40 dark:text-slate-400 dark:hover:text-rose-400 dark:border-slate-700 flex items-center justify-center transition-all cursor-pointer shadow-sm"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>
      <MaintenanceWarningBanner />

      {/* ── Main Layout (Sidebar + Content) ── */}
      <div className="flex-1 flex w-full max-w-[1720px] mx-auto pb-24 sm:pb-8">
        {/* Desktop Classic Sidebar */}
        <aside className="hidden lg:block w-80 shrink-0 p-5 border-l border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50 shadow-sm">
          <div className="sticky top-20 space-y-4">
            <div className="px-2 py-1 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider">
              <span>أقسام لوحة التحكم</span>
              <span className="text-xs text-slate-600 dark:text-amber-300 font-mono font-bold">5 Hubs</span>
            </div>

            <div className="space-y-2">
              {hubs.map((hub) => {
                const isOpen = openHubs[hub.id] ?? false;
                const hasActiveSection = hub.sections.some((s) => s.id === activeSection);

                return (
                  <div
                    key={hub.id}
                    className="rounded-xl border border-slate-200/90 dark:border-slate-800/70 bg-white dark:bg-slate-900/40 overflow-hidden shadow-sm dark:shadow-none transition-all"
                  >
                    {/* Hub Accordion Header */}
                    <button
                      type="button"
                      onClick={() => toggleHub(hub.id)}
                      className={`w-full px-3.5 py-2.5 flex items-center justify-between text-xs font-bold transition-all cursor-pointer ${
                        hasActiveSection
                          ? "bg-slate-100 text-slate-950 dark:bg-slate-800/60 dark:text-[#c5a880]"
                          : "text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/30"
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <span className={hasActiveSection ? "text-slate-900 dark:text-[#c5a880]" : "text-slate-500"}>
                          {hub.icon}
                        </span>
                        <span>{hub.title}</span>
                      </div>
                      <ChevronDown
                        className={`w-3.5 h-3.5 text-slate-400 dark:text-slate-500 transition-transform duration-200 ${
                          isOpen ? "rotate-180 text-slate-700 dark:text-slate-300" : ""
                        }`}
                      />
                    </button>

                    {/* Hub Child Sections */}
                    {isOpen && (
                      <div className="p-1.5 space-y-0.5 bg-slate-50/70 dark:bg-slate-950/40 border-t border-slate-200/80 dark:border-slate-800/40">
                        {hub.sections.map((section) => {
                          const isActive = activeSection === section.id;

                          return (
                            <button
                              key={section.id}
                              type="button"
                              onClick={() => setActiveSection(section.id)}
                              className={`w-full px-3 py-2 rounded-lg text-xs font-medium flex items-center justify-between transition-all cursor-pointer ${
                                isActive
                                  ? accentTheme === "emerald"
                                    ? "bg-emerald-800 text-white font-bold shadow-sm dark:bg-emerald-950/70 dark:text-emerald-300 dark:border dark:border-emerald-800/70"
                                    : "bg-blue-800 text-white font-bold shadow-sm dark:bg-blue-950/70 dark:text-blue-300 dark:border dark:border-blue-800/70"
                                  : "text-slate-700 hover:bg-slate-200/60 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800/50 dark:hover:text-white"
                              }`}
                            >
                              <div className="flex items-center gap-2">
                                <span className={isActive ? "text-white dark:text-[#c5a880]" : "text-slate-500"}>
                                  {section.icon}
                                </span>
                                <span>{section.label}</span>
                              </div>

                              {section.badge && (
                                <span
                                  className={`px-1.5 py-0.2 rounded text-[9px] font-bold ${
                                    section.badgeVariant === "danger"
                                      ? "bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/30"
                                      : section.badgeVariant === "bronze"
                                      ? "bg-slate-200 text-slate-800 dark:bg-[#c5a880]/20 dark:text-[#c5a880] dark:border dark:border-[#c5a880]/30"
                                      : "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300"
                                  }`}
                                >
                                  {section.badge}
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </aside>

        {/* ── Main Dynamic Content Area ── */}
        <main className="classic-admin-surface flex-1 min-w-0 p-4 sm:p-6 lg:p-8 space-y-6">
          {children}
        </main>
      </div>

      {/* ── Mobile Bottom Choices Dock (Anchored at Bottom of Screen) ── */}
      <nav className="fixed bottom-0 inset-x-0 z-50 bg-white/95 text-slate-700 dark:bg-[#090d15]/95 dark:text-slate-400 backdrop-blur-xl border-t border-slate-200 dark:border-slate-800/90 py-1.5 px-3 flex items-center justify-around lg:hidden shadow-xl dark:shadow-2xl dark:shadow-black">
        {mobileAnchors.map((anchor) => {
          const hub = hubs.find((h) => h.id === anchor.hubId);
          const isSelected =
            (anchor.directId && activeSection === anchor.directId) ||
            hub?.sections.some((s) => s.id === activeSection);
          const isOpenSheet = mobileActiveHub === anchor.hubId;

          return (
            <button
              key={anchor.hubId}
              type="button"
              onClick={() => handleMobileAnchorClick(anchor)}
              className={`flex flex-col items-center justify-center py-1 px-2.5 rounded-xl transition-all cursor-pointer relative ${
                isOpenSheet || isSelected
                  ? "text-slate-950 dark:text-[#c5a880] font-bold"
                  : "text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
              }`}
            >
              <div
                className={`p-1.5 rounded-xl transition-all ${
                  isSelected || isOpenSheet
                    ? "bg-slate-100 border border-slate-300 dark:bg-[#c5a880]/15 dark:border-[#c5a880]/30 shadow-sm"
                    : ""
                }`}
              >
                {anchor.icon}
              </div>
              <span className="text-[10px] mt-0.5 tracking-tight font-medium">
                {anchor.label}
              </span>
              {isSelected && !isOpenSheet && (
                <span className="w-1.5 h-1.5 rounded-full bg-slate-900 dark:bg-[#c5a880] absolute bottom-0"></span>
              )}
            </button>
          );
        })}
      </nav>

      {/* ── Mobile Bottom Choices Sheet / Drawer ── */}
      {selectedMobileHub && (
        <div className="fixed inset-0 z-50 lg:hidden flex flex-col justify-end bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div
            className="fixed inset-0"
            onClick={() => setMobileActiveHub(null)}
          />

          <div className="relative bg-white dark:bg-[#0c101a] border-t border-slate-300 dark:border-slate-700/80 rounded-t-3xl p-5 space-y-4 max-h-[75vh] overflow-y-auto shadow-2xl animate-in slide-in-from-bottom duration-250">
            {/* Drawer Drag Bar & Close */}
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <span className="text-slate-900 dark:text-[#c5a880]">{selectedMobileHub.icon}</span>
                <h3 className="text-sm font-black text-slate-900 dark:text-white">
                  {selectedMobileHub.title}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setMobileActiveHub(null)}
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 dark:bg-slate-800/80 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 flex items-center justify-center cursor-pointer shadow-sm"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Direct Choice Buttons (No Searching Required) */}
            <div className="grid grid-cols-1 gap-2 pt-1">
              {selectedMobileHub.sections.map((section) => {
                const isActive = activeSection === section.id;

                return (
                  <button
                    key={section.id}
                    type="button"
                    onClick={() => {
                      setActiveSection(section.id);
                      setMobileActiveHub(null);
                    }}
                    className={`w-full p-3.5 rounded-2xl flex items-center justify-between text-right text-xs font-bold transition-all cursor-pointer ${
                      isActive
                        ? accentTheme === "emerald"
                          ? "bg-emerald-800 text-white shadow-sm dark:bg-emerald-950/80 dark:text-emerald-300 dark:border dark:border-emerald-800/60"
                          : "bg-blue-800 text-white shadow-sm dark:bg-blue-950/80 dark:text-blue-300 dark:border dark:border-blue-800/60"
                        : "bg-slate-50 hover:bg-slate-100 text-slate-800 border border-slate-200 dark:bg-slate-900/80 dark:hover:bg-slate-800/80 dark:text-slate-200 dark:border-slate-800/80"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`p-2 rounded-xl ${
                          isActive
                            ? "bg-white/20 text-white"
                            : "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-400"
                        }`}
                      >
                        {section.icon}
                      </div>
                      <div>
                        <p className="text-xs font-bold">{section.label}</p>
                      </div>
                    </div>

                    {section.badge && (
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          section.badgeVariant === "danger"
                            ? "bg-rose-500/20 text-rose-600 dark:text-rose-400 border border-rose-500/30"
                            : section.badgeVariant === "bronze"
                            ? "bg-slate-200 text-slate-800 dark:bg-[#c5a880]/20 dark:text-[#c5a880] dark:border dark:border-[#c5a880]/30"
                            : "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300"
                        }`}
                      >
                        {section.badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ── Comprehensive All Sections Mobile Drawer ── */}
      {isMobileAllMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex flex-col justify-end bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div
            className="fixed inset-0"
            onClick={() => {
              setIsMobileAllMenuOpen(false);
              setMobileSearchQuery("");
            }}
          />

          <div className="relative bg-white dark:bg-[#0c101a] border-t border-slate-300 dark:border-slate-700/80 rounded-t-3xl p-5 space-y-4 max-h-[85vh] overflow-y-auto shadow-2xl animate-in slide-in-from-bottom duration-250">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-sky-500/10 text-sky-500 flex items-center justify-center">
                  <Menu className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-slate-900 dark:text-white">
                    قائمة أقسام لوحة التحكم
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    اختر أي قسم للانتقال إليه مباشرة
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsMobileAllMenuOpen(false);
                  setMobileSearchQuery("");
                }}
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 dark:bg-slate-800/80 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 flex items-center justify-center cursor-pointer shadow-sm"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Quick Search */}
            <div className="relative">
              <input
                type="text"
                placeholder="ابحث عن قسم (مثال: واجبات، كورسات، درجات، أكواد)..."
                value={mobileSearchQuery}
                onChange={(e) => setMobileSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2.5 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-sky-500"
              />
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3 pointer-events-none" />
            </div>

            {/* Hubs & Sections Grid */}
            <div className="space-y-4 pt-1">
              {hubs.map((hub) => {
                const filteredSections = hub.sections.filter((s) =>
                  !mobileSearchQuery.trim() ||
                  s.label.toLowerCase().includes(mobileSearchQuery.toLowerCase()) ||
                  hub.title.toLowerCase().includes(mobileSearchQuery.toLowerCase())
                );

                if (filteredSections.length === 0) return null;

                return (
                  <div key={hub.id} className="space-y-2">
                    <div className="flex items-center gap-2 px-1 text-xs font-bold text-slate-500 dark:text-slate-400">
                      <span className="text-slate-700 dark:text-[#c5a880]">{hub.icon}</span>
                      <span>{hub.title}</span>
                    </div>

                    <div className="grid grid-cols-1 gap-1.5">
                      {filteredSections.map((section) => {
                        const isActive = activeSection === section.id;
                        return (
                          <button
                            key={section.id}
                            type="button"
                            onClick={() => {
                              setActiveSection(section.id);
                              setIsMobileAllMenuOpen(false);
                              setMobileSearchQuery("");
                            }}
                            className={`w-full p-3 rounded-xl flex items-center justify-between text-right text-xs font-bold transition-all cursor-pointer ${
                              isActive
                                ? accentTheme === "emerald"
                                  ? "bg-emerald-800 text-white shadow-sm dark:bg-emerald-950/80 dark:text-emerald-300 dark:border dark:border-emerald-800/60"
                                  : "bg-blue-800 text-white shadow-sm dark:bg-blue-950/80 dark:text-blue-300 dark:border dark:border-blue-800/60"
                                : "bg-slate-50 hover:bg-slate-100 text-slate-800 border border-slate-200 dark:bg-slate-900/80 dark:hover:bg-slate-800/80 dark:text-slate-200 dark:border-slate-800/80"
                            }`}
                          >
                            <div className="flex items-center gap-2.5">
                              <div
                                className={`p-1.5 rounded-lg ${
                                  isActive
                                    ? "bg-white/20 text-white"
                                    : "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-400"
                                }`}
                              >
                                {section.icon}
                              </div>
                              <span>{section.label}</span>
                            </div>

                            {section.badge && (
                              <span
                                className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                  section.badgeVariant === "danger"
                                    ? "bg-rose-500/20 text-rose-600 dark:text-rose-400 border border-rose-500/30"
                                    : section.badgeVariant === "bronze"
                                    ? "bg-slate-200 text-slate-800 dark:bg-[#c5a880]/20 dark:text-[#c5a880] dark:border dark:border-[#c5a880]/30"
                                    : "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300"
                                }`}
                              >
                                {section.badge}
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
