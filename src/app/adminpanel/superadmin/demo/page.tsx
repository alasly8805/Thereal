"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { DarkModeToggle } from "@/components/ui/DarkModeToggle";
import { useToast } from "@/components/ui/Toast";
import { admConfirm, DialogHost } from "@/components/admin/ui/kit";
import "@/components/admin/ui/admin.css";

interface FeatureItem {
  id: string;
  name: string;
  nameEn: string;
  description: string;
  targetUrl: string;
  category: string;
  expectedContent: string;
}

const SHOWROOM_FEATURES: FeatureItem[] = [
  {
    id: "dashboard",
    name: "لوحة التحكم والإحصائيات",
    nameEn: "Teacher Overview & Stats",
    description: "إحصائيات فورية لعدد الطلاب والمشاهدات ومؤشرات التفاعل.",
    targetUrl: "/adminpanel/teacher?tab=dashboard",
    category: "Analytics",
    expectedContent: "بطاقات إحصائية، قائمة الطلاب النشطين، وإجمالي المشاهدات.",
  },
  {
    id: "my-page",
    name: "الصفحة التعريفية العامة للمدرس",
    nameEn: "Public Teacher Profile",
    description: "تعديل النبذة والأسعار وصورة الغلاف وروابط التواصل وباقات الاشتراك.",
    targetUrl: "/demo",
    category: "Public",
    expectedContent: "صفحة هبوط الأستاذ التجريبي مع خيارات الحجز والاشتراك وفيديوهات المعاينة.",
  },
  {
    id: "teacher-subscriptions",
    name: "اشتراكات وحجوزات الطلاب",
    nameEn: "Teacher Subscriptions",
    description: "إدارة وموافقة الاشتراكات الشهرية والترمية وحجوزات المراحل.",
    targetUrl: "/adminpanel/teacher?tab=teacher-subscriptions",
    category: "Subscriptions",
    expectedContent: "طلبات اشتراك شهري وترمي وسنوي لطلاب تجريبيين مع إمكانية الاعتماد.",
  },
  {
    id: "exam-dashboard",
    name: "لوحة إدارة وبناء الاختبارات",
    nameEn: "Exam & Quiz Dashboard",
    description: "إنشاء الاختبارات التفاعلية واليومية مع التوقيت والدرجات.",
    targetUrl: "/adminpanel/teacher?tab=exam-dashboard",
    category: "Assessments",
    expectedContent: "إعدادات الاختبارات اليومية وتحديد وقت الامتحان ونموذج الإجابة.",
  },
  {
    id: "in-video-responses",
    name: "إجابات الأسئلة التفاعلية بالفيديو",
    nameEn: "In-Video Interactive Responses",
    description: "متابعة إجابات وتفاعل الطلاب أثناء مشاهدة المحاضرات.",
    targetUrl: "/adminpanel/teacher?tab=in-video-responses",
    category: "Engagement",
    expectedContent: "قائمة استجابات الطلاب للأسئلة المدمجة داخل مشغل الفيديو.",
  },
  {
    id: "referred-students",
    name: "برنامج إحالات وتسويق المعلم",
    nameEn: "Teacher Referral Program",
    description: "متابعة الطلاب المسجلين بكود خصم المعلم والأرباح المحققة.",
    targetUrl: "/adminpanel/teacher?tab=referred-students",
    category: "Marketing",
    expectedContent: "كود المعلم، عدد الإحالات، وإجمالي العمولات المستحقة.",
  },
  {
    id: "courses",
    name: "إدارة الكورسات والمحاضرات والفيديوهات",
    nameEn: "Course & Content Management",
    description: "إضافة المحاضرات، الفيديوهات (Alasly / YouTube / Native)، الملازم، والخصومات.",
    targetUrl: "/adminpanel/teacher?tab=courses",
    category: "Content",
    expectedContent: "الكورسات الثلاثة التجريبية (مجاني، مدفوع، وخصم نشط) مع المحاضرات.",
  },
  {
    id: "create-course",
    name: "معالج إنشاء كورس جديد",
    nameEn: "Create New Course Wizard",
    description: "نموذج إضافة مادة تعليمية جديدة وتحديد المرحلة والوصف.",
    targetUrl: "/adminpanel/teacher?tab=create-course",
    category: "Content",
    expectedContent: "حقول اسم الكورس، المادة، المرحلة الدراسية، وصورة الغلاف.",
  },
  {
    id: "codes",
    name: "توليد وإدارة أكواد الوصول",
    nameEn: "Access Codes Minting",
    description: "إنشاء أكواد وصول منفردة أو جماعية للكورس أو المحاضرة أو الفيديو.",
    targetUrl: "/adminpanel/teacher?tab=codes",
    category: "Access",
    expectedContent: "أكواد وصول منشأة (DEMO-COURSE-101 و DEMO-FOLDER-202).",
  },
  {
    id: "students",
    name: "سجل وإدارة المتعلمين",
    nameEn: "Enrolled Students Roster",
    description: "عرض الطلاب المشتركين، أوقات المشاهدة، وتفاصيل الحسابات.",
    targetUrl: "/adminpanel/teacher?tab=students",
    category: "Students",
    expectedContent: "قائمة الطلاب التجريبيين (طالب تجريبي ١ إلى ٦) ونسب التقدم.",
  },
  {
    id: "quiz-results",
    name: "نتائج الاختبارات والدرجات",
    nameEn: "Quiz Results Breakdown",
    description: "تفاصيل درجات الطلاب في الاختبارات ونسبة النجاح والإجابات النموذجية.",
    targetUrl: "/adminpanel/teacher?tab=quiz-results",
    category: "Assessments",
    expectedContent: "نتيجة الطالب التجريبي الأول الحاصل على الدرجة النهائية 100%.",
  },
  {
    id: "requests",
    name: "طلبات الطلاب وتعديل الدرجات",
    nameEn: "Grade Adjustment Requests",
    description: "مراجعة والبت في طلبات إعادة التصحيح ومراسلات الطلاب.",
    targetUrl: "/adminpanel/teacher?tab=requests",
    category: "Requests",
    expectedContent: "لوحة مراجعة طلبات التظلم والاعتراضات على درجات الامتحانات.",
  },
  {
    id: "feedback",
    name: "ملاحظات وتقييمات الطلاب",
    nameEn: "Student Feedback & Notes",
    description: "قراءة رسائل الشكر والاستفسارات وملاحظات الطلاب.",
    targetUrl: "/adminpanel/teacher?tab=feedback",
    category: "Engagement",
    expectedContent: "رسائل التقييم والانطباعات المرسلة مباشرة للأستاذ.",
  },
  {
    id: "homework",
    name: "إدارة الواجبات والتكليفات",
    nameEn: "Homework Assignments Manager",
    description: "إنشاء واجبات مقالية واختيارية، تحديد مواعيد التسليم، وتصدير النماذج.",
    targetUrl: "/adminpanel/teacher?tab=homework",
    category: "Homework",
    expectedContent: "واجب الخوارزميات التطبيقي الأول مع الأسئلة المقالية.",
  },
  {
    id: "review",
    name: "لوحة التصحيح الحي والمراجعة",
    nameEn: "Live Essay Homework Grading",
    description: "تصحيح إجابات الطلاب المقالية ووضع الدرجات والتعليقات الحية.",
    targetUrl: "/adminpanel/teacher?tab=review",
    category: "Homework",
    expectedContent: "إجابة الطالب التجريبي الأول مع تعليقات المعلم والدرجة المعتمدة (95).",
  },
];

export default function SuperadminDemoChecklistPage() {
  const { success: toastSuccess, error: toastError } = useToast();
  const [status, setStatus] = useState<{ seeded: boolean; demoTeacher?: any; demoStudentsCount?: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  const fetchStatus = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/admin/superadmin/demo");
      const data = await res.json();
      if (res.ok) setStatus(data);
    } catch {
      toastError("تعذر فحص حالة المعرض التجريبي");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
  }, []);

  const handleSeed = async () => {
    try {
      setActionLoading(true);
      const res = await fetch("/api/admin/superadmin/demo", { method: "POST" });
      const data = await res.json();
      if (res.ok && data.success) {
        toastSuccess("تمت تهيئة وزرع بيانات المعرض التجريبي بنجاح!");
        fetchStatus();
      } else {
        toastError(data.error || "فشل زرع البيانات التجريبية");
      }
    } catch {
      toastError("حدث خطأ أثناء الاتصال بالخادم");
    } finally {
      setActionLoading(false);
    }
  };

  const handleRemove = async () => {
    if (!(await admConfirm({ title: "حذف كل بيانات المعلم التجريبي؟", confirmLabel: "حذف", danger: true }))) return;
    try {
      setActionLoading(true);
      const res = await fetch("/api/admin/superadmin/demo", { method: "DELETE" });
      const data = await res.json();
      if (res.ok && data.success) {
        toastSuccess("تم تفريغ وحذف بيانات المعرض التجريبي بالكامل!");
        fetchStatus();
      } else {
        toastError(data.error || "فشل حذف البيانات");
      }
    } catch {
      toastError("حدث خطأ أثناء الاتصال بالخادم");
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div dir="rtl" className="adm min-h-screen p-4 sm:p-8">
      <DialogHost />
      <div className="max-w-6xl mx-auto space-y-8">
        
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[var(--border)] pb-6">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <span className="px-2.5 py-1 rounded-full bg-amber-500/15 text-[var(--warn)] text-xs font-black">
                SUPERADMIN SHOWROOM
              </span>
              <h1 className="text-2xl sm:text-3xl font-black">معرض المزايا الشامل (Demo Showroom)</h1>
            </div>
            <p className="text-sm text-[var(--ink-muted)]">
              بيئة استعراض واختبار حية داخل الإنتاج لجميع مزايا وإمكانيات المعلم بدون الحاجة لأي دفع مالي.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <DarkModeToggle />
            <Link
              href="/adminpanel/superadmin"
              className="px-4 py-2 rounded-xl text-xs font-bold bg-[var(--surface)] border border-[var(--border)] hover:bg-[var(--surface-2)] transition-colors"
            >
              ← العودة للإدارة العامة
            </Link>
          </div>
        </div>

        {/* Action Controls & Status Bar */}
        <div className="p-6 rounded-2xl bg-[var(--surface)] border border-[var(--border)] shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="font-bold text-sm">حالة المعرض التجريبي:</span>
              {loading ? (
                <span className="text-xs text-[var(--ink-muted)]">جاري الفحص...</span>
              ) : status?.seeded ? (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black bg-emerald-500/15 text-[var(--ok)]">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  مفعل وجاهز للاستعراض
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black bg-rose-500/15 text-[var(--danger)]">
                  غير مزروع حالياً
                </span>
              )}
            </div>
            <p className="text-xs text-[var(--ink-muted)]">
              حساب الدخول: <code className="bg-[var(--surface-2)] px-2 py-0.5 rounded font-mono font-bold text-[var(--warn)]">test</code> | كلمة المرور: <code className="bg-[var(--surface-2)] px-2 py-0.5 rounded font-mono font-bold text-[var(--warn)]">Admin123</code> | عدد الطلاب التجريبيين: <span className="font-bold">{status?.demoStudentsCount ?? 0}</span>
            </p>
          </div>

          <div className="flex items-center gap-3 w-full md:w-auto">
            <button
              onClick={handleSeed}
              disabled={actionLoading}
              className="flex-1 md:flex-none px-5 py-2.5 rounded-xl text-xs font-black bg-amber-500 hover:bg-amber-400 text-white transition-all shadow-md active:scale-95 disabled:opacity-50"
            >
              {actionLoading ? "جاري المعالجة..." : "⚡ تهيئة / إعادة زرع البيانات"}
            </button>
            <button
              onClick={handleRemove}
              disabled={actionLoading || !status?.seeded}
              className="flex-1 md:flex-none px-4 py-2.5 rounded-xl text-xs font-bold text-[var(--danger)] bg-rose-500/10 hover:bg-rose-500/20 border border-[color-mix(in_srgb,var(--danger)_32%,transparent)] transition-all active:scale-95 disabled:opacity-40"
            >
              حذف وتفريغ البيانات
            </button>
          </div>
        </div>

        {/* Feature Checklist Table */}
        <div className="space-y-4">
          <h2 className="text-lg font-black flex items-center gap-2">
            <span>📋 قائمة المزايا المستعرضة (15 ميزة مكتملة)</span>
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {SHOWROOM_FEATURES.map((item, idx) => (
              <div
                key={item.id}
                className="p-5 rounded-2xl bg-[var(--surface)] border border-[var(--border)] hover:border-[color-mix(in_srgb,var(--warn)_32%,transparent)] transition-all flex flex-col justify-between shadow-sm group hover:shadow-md"
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-mono px-2 py-0.5 rounded bg-[var(--surface-2)] text-[var(--ink-muted)]">
                      #{idx + 1} {item.category}
                    </span>
                    <span className="text-xs font-bold text-[var(--warn)] uppercase tracking-wider">
                      {item.nameEn}
                    </span>
                  </div>

                  <div>
                    <h3 className="font-black text-base text-[var(--ink)] mb-1 group-hover:text-[var(--warn)] transition-colors">
                      {item.name}
                    </h3>
                    <p className="text-xs text-[var(--ink-muted)] leading-relaxed">
                      {item.description}
                    </p>
                  </div>

                  <div className="p-3 rounded-xl bg-[var(--surface-2)] text-xs border border-[var(--border)]">
                    <span className="font-bold text-[var(--warn)] block mb-1">
                      المحتوى المتوقع رؤيته:
                    </span>
                    <span className="text-[var(--ink-muted)]">{item.expectedContent}</span>
                  </div>
                </div>

                <div className="mt-5 pt-3 border-t border-[var(--border)] flex items-center justify-between">
                  <Link
                    href={item.targetUrl}
                    target="_blank"
                    className="inline-flex items-center gap-1.5 text-xs font-bold text-[var(--warn)] hover:underline"
                  >
                    فتح الميزة مباشرة في نافذة جديدة ↗
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}
