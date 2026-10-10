import type { ReactNode } from "react";
import {
  Activity,
  Vote,
  FolderOpen,
  AlertTriangle,
  Award,
  Bot,
  ClipboardCheck,
  Eye,
  FileText,
  Fingerprint,
  Flame,
  GraduationCap,
  KeyRound,
  Layers,
  LayoutDashboard,
  LifeBuoy,
  MessageCircle,
  MessageSquareText,
  PenLine,
  Phone,
  PlusCircle,
  Server,
  Settings,
  Shield,
  ShieldAlert,
  Sparkles,
  Trophy,
  UserCog,
  UserMinus,
  UserPlus,
  Users,
  Video,
  Wallet,
  BookOpen,
  Share2,
  Type,
  CalendarDays,
  Terminal,
} from "lucide-react";

export interface NavSection {
  id: string;
  label: string;
  /** Extra words (Arabic + English) the section search should match. */
  keywords?: string;
  badge?: string | number;
  badgeTone?: "neutral" | "brand" | "bad" | "warn" | "gold";
  icon?: ReactNode;
}

export interface NavHub {
  id: string;
  title: string;
  icon: ReactNode;
  sections: NavSection[];
}

const i = (Icon: typeof Users) => <Icon size={17} strokeWidth={1.9} aria-hidden />;

export function getSuperadminHubs(opts: { isOwner?: boolean; role: string }): NavHub[] {
  const isSuper = opts.role === "superadmin";
  return [
    {
      id: "main",
      title: "الرئيسية",
      icon: i(LayoutDashboard),
      sections: [
        { id: "overview", label: "نظرة عامة", keywords: "overview dashboard حجوزات ارباح dashboard الرئيسية", icon: i(LayoutDashboard) },
        ...(isSuper
          ? [
              {
                id: "teacher-packages",
                label: "باقات المعلمين والفرق 📊",
                keywords: "teacher packages terms bookings باقات وحجوزات المعلمين باقة شهر ترم سنة اشعار منبثق مقارنة كورس الفرق بيانيا auto enroll",
                badge: "جديد",
                badgeTone: "brand" as const,
                icon: i(Layers),
              },
              { id: "ai-copilot", label: "اسأل المساعد", keywords: "copilot ai deepseek مساعد ذكاء", badge: "AI", badgeTone: "gold" as const, icon: i(Sparkles) },
              { id: "ai-terminal", label: "أوامر AI & Claude", keywords: "ai agent claude cmd terminal اوامر كونسول تيرمينال", badge: "CMD", badgeTone: "brand" as const, icon: i(Terminal) },
            ]
          : []),
      ],
    },
    {
      id: "people",
      title: "المستخدمون",
      icon: i(Users),
      sections: [
        { id: "students", label: "المتعلمون", keywords: "students طلاب طالب ولي امر parent", icon: i(GraduationCap) },
        { id: "teachers", label: "المعلمون", keywords: "teachers مدرس مدرسين", icon: i(Users) },
        { id: "create", label: "إضافة معلم", keywords: "new teacher create انشاء حساب مدرس جديد", icon: i(UserPlus) },
        { id: "teacher-referrals", label: "إحالات المعلمين", keywords: "referrals احالة", icon: i(Share2) },
        { id: "staff-accounts", label: "المشرفون والموظفون", keywords: "staff admin موظف مشرف صلاحيات", icon: i(KeyRound) },
        { id: "testers", label: "حسابات الفحص", keywords: "qa testers تجريبي فحص", icon: i(Eye) },
        { id: "center-passes", label: "أرقام السنتر", keywords: "center id سنتر", icon: i(Fingerprint) },
        { id: "deleted-students", label: "المتعلمون المحذوفون", keywords: "deleted students restore استرجاع", icon: i(UserMinus) },
        { id: "deleted-teachers", label: "المعلمون المحذوفون", keywords: "deleted teachers restore استرجاع", icon: i(UserMinus) },
      ],
    },
    {
      id: "money",
      title: "المالية والمحتوى",
      icon: i(Wallet),
      sections: [
        { id: "wallet", label: "المحافظ والرصيد", keywords: "wallet balance محفظة رصيد شحن", icon: i(Wallet) },
        { id: "plans", label: "الخطط الدراسية", keywords: "plans خطة اكواد codes دروس", icon: i(BookOpen) },
        ...(isSuper
          ? [{ id: "terms-bookings", label: "باقات وحجوزات المعلمين والفرق 📊", keywords: "terms bookings باقات وحجوزات المعلمين باقة شهر ترم سنة اشعار منبثق مقارنة كورس الفرق بيانيا auto enroll", badge: "مُحدّث", badgeTone: "brand" as const, icon: i(Layers) }]
          : []),
      ],
    },
    {
      id: "engagement",
      title: "الامتحانات والجوائز",
      icon: i(Trophy),
      sections: [
        { id: "daily-exams", label: "امتحانات لوحة الشرف", keywords: "daily exams امتحان يومي leaderboard", icon: i(Award) },
        { id: "leaderboard-prizes", label: "جوائز لوحة الشرف", keywords: "prizes جوائز", icon: i(Trophy) },
        ...(isSuper
          ? [{ id: "polls", label: "استطلاعات الرأي", keywords: "polls survey vote استطلاع تصويت رأي", icon: i(Vote) }]
          : []),
      ],
    },
    {
      id: "monitoring",
      title: "المراقبة",
      icon: i(Activity),
      sections: [
        { id: "security-violations", label: "الرصد الأمني", keywords: "security violations مخالفات امن", badge: "مباشر", badgeTone: "bad", icon: i(ShieldAlert) },
        { id: "logs", label: "سجل النشاط", keywords: "logs activity سجلات", icon: i(Activity) },
        { id: "errors", label: "الأخطاء", keywords: "errors warnings اخطاء تحذيرات", icon: i(AlertTriangle) },
      ],
    },
    {
      id: "infra",
      title: "البنية والخدمات",
      icon: i(Server),
      sections: [
        { id: "vdocipher-accounts", label: "VdoCipher", keywords: "vdocipher video فيديو سيرفرات", icon: i(Video) },
        { id: "axinom-accounts", label: "Axinom DRM", keywords: "axinom drm تراخيص", icon: i(Shield) },
        { id: "whatsapp", label: "واتساب", keywords: "whatsapp baileys رسائل", icon: i(Phone) },
        ...(opts.isOwner ? [{ id: "instance", label: "السيرفر (المالك)", keywords: "instance server ec2 سيرفر", icon: i(Server) }] : []),
      ],
    },
    {
      id: "settings",
      title: "الإعدادات",
      icon: i(Settings),
      sections: [
        { id: "site-text", label: "نصوص الموقع", keywords: "site text نصوص", icon: i(Type) },
        { id: "advanced-settings", label: "إعدادات متقدمة", keywords: "advanced settings اعدادات", icon: i(Settings) },
        { id: "ai-studio", label: "استوديو الذكاء الاصطناعي", keywords: "ai studio gemini providers ذكاء", icon: i(Bot) },
        { id: "danger-zone", label: "منطقة الخطر", keywords: "danger bulk delete حذف جماعي", icon: i(Flame) },
      ],
    },
  ];
}

export function getTeacherHubs(): NavHub[] {
  return [
    {
      id: "academic",
      title: "الرئيسية",
      icon: i(LayoutDashboard),
      sections: [
        { id: "dashboard", label: "لوحة الأداء", keywords: "dashboard analytics تحليلات", icon: i(LayoutDashboard) },
        { id: "teacher-subscriptions", label: "طلابك والأرقام", keywords: "subscriptions اشتراكات", icon: i(Wallet) },
        { id: "my-page", label: "صفحتك العامة", keywords: "profile public page ملف", icon: i(Eye) },
        { id: "assistants", label: "المساعدون", keywords: "assistants مساعد", icon: i(UserCog) },
      ],
    },
    {
      id: "curriculum",
      title: "الكورسات",
      icon: i(Video),
      sections: [
        { id: "courses", label: "الكورسات والمحاضرات", keywords: "courses lectures videos كورس محاضرة", icon: i(Layers) },
        { id: "terms-bookings", label: "التيرمات والحجوزات", keywords: "terms bookings تيرم حجوزات شهور", icon: i(CalendarDays) },
        { id: "create-course", label: "كورس جديد", keywords: "new course create انشاء", icon: i(PlusCircle) },
      ],
    },
    {
      id: "assessment",
      title: "التقييم",
      icon: i(ClipboardCheck),
      sections: [
        { id: "multi-model-exams", label: "الامتحانات (نماذج متعددة)", keywords: "exams models نماذج امتحانات اسئلة مقالي", icon: i(FileText) },
        { id: "homework", label: "الواجبات", keywords: "homework واجب ملفات", icon: i(FileText) },
        { id: "review", label: "التصحيح المباشر", keywords: "review grading تصحيح", badge: "مباشر", badgeTone: "warn", icon: i(PenLine) },
        { id: "student-files", label: "ملفات الطلاب", keywords: "files pdf uploads ملفات رفع تسليمات", icon: i(FolderOpen) },
        { id: "quiz-results", label: "نتائج الاختبارات", keywords: "quiz results اختبار نتائج", icon: i(Award) },
        { id: "in-video-responses", label: "الأسئلة المقالية", keywords: "essay in video مقالي", icon: i(MessageSquareText) },
        { id: "grade-requests", label: "طلبات تعديل الدرجات", keywords: "grade requests درجات", icon: i(Award) },
      ],
    },
    {
      id: "students",
      title: "الطلاب",
      icon: i(Users),
      sections: [
        { id: "students", label: "قائمة الطلاب", keywords: "students phones طلاب ارقام", icon: i(Phone) },
        { id: "codes", label: "أكواد الوصول", keywords: "codes access اكواد", icon: i(KeyRound) },
        { id: "referred-students", label: "الإحالات", keywords: "referrals احالة", icon: i(Share2) },
        { id: "requests", label: "طلبات زيادة المشاهدات", keywords: "requests views مشاهدات", icon: i(Eye) },
        { id: "tickets", label: "تذاكر الدعم", keywords: "support tickets دعم", icon: i(LifeBuoy) },
        { id: "feedback", label: "ملاحظات الطلاب", keywords: "feedback تقييمات", icon: i(MessageCircle) },
      ],
    },
  ];
}

export function findSection(hubs: NavHub[], id: string): { hub: NavHub; section: NavSection } | null {
  for (const hub of hubs) {
    const section = hub.sections.find((s) => s.id === id);
    if (section) return { hub, section };
  }
  return null;
}

/** Arabic-aware normaliser for the section search (alef/yaa/taa-marbuta forms, diacritics). */
export function normalizeSearch(s: string) {
  return s
    .toLowerCase()
    .replace(/[ً-ْـ]/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .trim();
}
