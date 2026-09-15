"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Script from "next/script";
import { Navbar } from "@/components/ui/Navbar";
import { Footer } from "@/components/ui/Footer";
import { useToast } from "@/components/ui/Toast";
import { CourseFeedbackForm } from "@/components/ai/CourseFeedbackForm";
import { SecurePlayer } from "@/components/ui/SecurePlayer";
import { SkeletonCard } from "@/components/ui/Skeleton";
import { clientErrorMessage } from "@/lib/client-error-message";
import { safeJsonLd } from "@/lib/jsonld";
import { KeyRound } from "lucide-react";

type CoursePreview = {
  id: string;
  slug?: string | null;
  title: string;
  subject: string;
  description?: string | null;
  thumbnailUrl?: string | null;
  educationalStage: string;
  teacher: { id: string; name: string };
  isPaid: boolean;
  price: number | null;
  discountPercent: number | null;
  discountExpiresAt: string | null;
  effectivePrice: number;
  totalVideos: number;
  totalQuizzes: number;
  folders: Array<{ id: string; name: string; videoCount: number; quizCount: number }>;
  freeVideos?: Array<{ id: string; title: string }>;
  hasAccess: boolean;
  allowDirectInstall: boolean;
  isOwnerTeacher?: boolean;
  deliveryMode?: string;
};

function buildWhatsAppUrl(phone: string, message: string) {
  const digits = phone.replace(/\D/g, "");
  const normalized = digits.startsWith("0") ? "2" + digits.slice(1) : digits;
  return `https://wa.me/${normalized}?text=${encodeURIComponent(message)}`;
}

const STAGE_LABELS: Record<string, string> = {
  sec_1: "أولى بكالوريا",
  sec_2: "ثانية بكالوريا",
};

function useCountdown(expiresAt: string | null) {
  const [remaining, setRemaining] = useState<string | null>(null);
  useEffect(() => {
    if (!expiresAt) return;
    const tick = () => {
      const diff = new Date(expiresAt).getTime() - Date.now();
      if (diff <= 0) { setRemaining(null); return; }
      const d = Math.floor(diff / 86400000);
      const h = Math.floor((diff % 86400000) / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      if (d > 0) setRemaining(`${d} يوم ${h} ساعة`);
      else if (h > 0) setRemaining(`${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`);
      else setRemaining(`${m}:${String(s).padStart(2, "0")}`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [expiresAt]);
  return expiresAt ? remaining : null;
}

export default function CourseProductPage() {
  const router = useRouter();
  const { success: toastSuccess, error: toastError } = useToast();
  const params = useParams<{ id: string }>();
  const courseId = params.id;

  const [course, setCourse] = useState<CoursePreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState("");
  const [user, setUser] = useState<{ name: string; role: string; phone?: string | null; parentPhone?: string | null } | null>(null);
  const [userLoading, setUserLoading] = useState(true);
  const [code, setCode] = useState("");
  const [applying, setApplying] = useState(false);
  const [enrolling, setEnrolling] = useState(false);
  const [purchasing, setPurchasing] = useState(false);
  const [payMode, setPayMode] = useState<"balance" | "wallet" | "fawry" | "whatsapp" | "code">("wallet");
  const [walletPhone, setWalletPhone] = useState("");
  const [selectedWalletMethod, setSelectedWalletMethod] = useState<"vf_cash" | "et_cash" | "fawry">("vf_cash");
  const [walletLoading, setWalletLoading] = useState(false);
  const [walletMsg, setWalletMsg] = useState("");
  const [walletModal, setWalletModal] = useState<{ reference: string; instructions: string; methodLabel: string; amount: number } | null>(null);
  const [openFolders, setOpenFolders] = useState<Record<string, boolean>>({});
  // Free/demo inline player
  const [demo, setDemo] = useState<{
    title: string;
    embedUrl: string;
    provider?: string;
    drm?: {
      token: string;
      licenseServers: { widevine: string; playready: string; fairplay: string; fairplayCertUrl?: string };
      clearKeys?: Record<string, string>;
    } | null;
  } | null>(null);
  const [demoLoading, setDemoLoading] = useState<string | null>(null);
  const [isCenterMode] = useState(() => {
    if (typeof window === "undefined") return false;
    const host = window.location.hostname;
    return (
      host.startsWith("center.") ||
      host.includes("center.code-up.tech") ||
      window.location.search.includes("center=1") ||
      document.cookie.includes("center_mode=1")
    );
  });

  const countdown = useCountdown(course?.discountExpiresAt ?? null);

  useEffect(() => {
    fetch("/api/auth/me")
      .then(async (r) => { const raw = await r.text(); return raw ? JSON.parse(raw) : {}; })
      .then((d) => setUser(d.user ? { name: d.user.name, role: d.user.role, phone: d.user.phone ?? null, parentPhone: d.user.parentPhone ?? null } : null))
      .catch(() => setUser(null))
      .finally(() => setUserLoading(false));
  }, []);

  const playDemo = async (video: { id: string; title: string }) => {
    setDemoLoading(video.id);
    try {
      const res = await fetch(`/api/videos/${video.id}/watch`, { method: "POST", credentials: "include" });
      const data = await res.json();
      if (res.ok && data.embedUrl) {
        setDemo({ title: video.title, embedUrl: data.embedUrl, provider: data.provider, drm: data.drm || null });
      } else {
        toastError(clientErrorMessage(res.status, data));
      }
    } catch {
      toastError("تعذر تشغيل المحاضرة التجريبية");
    } finally {
      setDemoLoading(null);
    }
  };

  const loadPreview = async () => {
    if (!courseId) return;
    setLoading(true);
    setFetchError("");
    try {
      const res = await fetch(`/api/courses/${courseId}/preview`);
      if (res.ok) {
        const data = await res.json();
        setCourse(data.course);
        const init: Record<string, boolean> = {};
        (data.course.folders as CoursePreview["folders"]).forEach((f, i) => { init[f.id] = i === 0; });
        setOpenFolders(init);
      } else if (res.status === 404) {
        setCourse(null);
      } else {
        setFetchError("حدث خطأ أثناء تحميل الكورس، حاول مرة أخرى");
      }
    } catch {
      setFetchError("تعذر الاتصال بالخادم، تحقق من الإنترنت وحاول مرة أخرى");
    }
    setLoading(false);
  };

  useEffect(() => {
    if (courseId) {
      const doLoad = async () => {
        setLoading(true);
        setFetchError("");
        try {
          const res = await fetch(`/api/courses/${courseId}/preview`);
          if (res.ok) {
            const data = await res.json();
            setCourse(data.course);
            const init: Record<string, boolean> = {};
            (data.course.folders as CoursePreview["folders"]).forEach((f, i) => { init[f.id] = i === 0; });
            setOpenFolders(init);
          } else if (res.status === 404) {
            setCourse(null);
          } else {
            setFetchError("حدث خطأ أثناء تحميل الكورس، حاول مرة أخرى");
          }
        } catch {
          setFetchError("تعذر الاتصال بالخادم، تحقق من الإنترنت وحاول مرة أخرى");
        }
        setLoading(false);
      };
      doLoad();
    }
  }, [courseId]);

  const enroll = async () => {
    if (!user) { router.push(`/login?redirect_url=/courses/${courseId}`); return; }
    setEnrolling(true);
    try {
      const res = await fetch(`/api/courses/${course?.id ?? courseId}/enroll`, { method: "POST", credentials: "include" });
      const raw = await res.text();
      const data = raw ? JSON.parse(raw) : {};
      if (res.ok) {
        toastSuccess(data.message || "تم التسجيل بنجاح!");
        router.push("/library");
      } else if (res.status === 401) {
        router.push(`/login?redirect_url=/courses/${courseId}`);
      } else {
        toastError(clientErrorMessage(res.status, data));
      }
    } catch {
      toastError("حدث خطأ أثناء التسجيل، حاول مرة أخرى");
    }
    setEnrolling(false);
  };

  const purchaseCourse = async () => {
    if (!user) { router.push(`/login?redirect_url=/courses/${courseId}`); return; }
    setPurchasing(true);
    const res = await fetch(`/api/courses/${courseId}/purchase`, { method: "POST", credentials: "include" });
    const data = await res.json().catch(() => ({}));
    setPurchasing(false);
    if (res.ok) {
      toastSuccess(data.message || "تم الشراء بنجاح!");
      router.push("/library");
    } else if (data.code === "INSUFFICIENT_FUNDS") {
      // Redirect to the payment wizard with the effective price prefilled
      const price = data.effectivePrice ?? 0;
      const ctx = encodeURIComponent(`شراء كورس ${courseId} — ${price} جنيه`);
      router.push(
        `/payment?amount=${price}&courseId=${courseId}&courseTitle=${encodeURIComponent(course?.title || "")}&return=${encodeURIComponent(`/courses/${courseId}`)}&context=${ctx}`
      );
    } else {
      toastError(clientErrorMessage(res.status, data));
    }
  };

  const applyCode = async () => {
    if (!code.trim()) return;
    if (!user) { router.push("/login"); return; }
    setApplying(true);
    const res = await fetch("/api/codes", {
      method: "POST", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: code.trim().toUpperCase() }),
    });
    const data = await res.json();
    setApplying(false);
    if (res.ok) {
      toastSuccess(data.message || "تم تفعيل الكود بنجاح! جارٍ الدخول...");
      router.push("/library");
    } else if (res.status === 401) {
      router.push("/login");
    } else {
      toastError(clientErrorMessage(res.status, data));
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col min-h-screen bg-gray-50 dark:bg-gray-950" dir="rtl">
        <Navbar user={user} />
        <main className="flex-1 px-4 py-8 sm:px-6 lg:px-8">
          <div className="mx-auto grid max-w-6xl grid-cols-1 gap-6 lg:grid-cols-3">
            <div className="skeleton h-64 rounded-3xl lg:col-span-2" />
            <SkeletonCard />
            <div className="skeleton h-40 rounded-3xl lg:col-span-3" />
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  if (fetchError) {
    return (
      <div className="flex flex-col min-h-screen bg-gray-50 dark:bg-gray-950" dir="rtl">
        <Navbar user={user} />
        <main className="flex-1 flex items-center justify-center">
          <div className="text-center space-y-4">
            <p className="text-2xl font-bold text-gray-900 dark:text-white">⚠️</p>
            <p className="text-base text-gray-700 dark:text-gray-300">{fetchError}</p>
            <div className="flex gap-3 justify-center">
              <button onClick={loadPreview} className="px-5 py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 font-medium">إعادة المحاولة</button>
              <button onClick={() => router.push("/courses")} className="px-5 py-2.5 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 font-medium">العودة للكورسات</button>
            </div>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  if (!course) {
    return (
      <div className="flex flex-col min-h-screen bg-gray-50 dark:bg-gray-950" dir="rtl">
        <Navbar user={user} />
        <main className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <p className="text-2xl font-bold text-gray-900 dark:text-white mb-3">الكورس غير موجود</p>
            <button onClick={() => router.push("/courses")} className="px-5 py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700">العودة للكورسات</button>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  const hasDiscount = course.discountPercent != null && course.discountPercent > 0;
  const subjectColors: Record<string, string> = {
    رياضيات: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
    فيزياء: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
    كيمياء: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
    أحياء: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
    "لغة عربية": "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
    "لغة إنجليزية": "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
  };
  const subjectClass = subjectColors[course.subject] || "bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300";

  return (
    <div className="flex flex-col min-h-screen bg-gray-50 dark:bg-gray-950" dir="rtl">
      {course && (
        <Script
          id="course-schema"
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: safeJsonLd({
              "@context": "https://schema.org",
              "@type": "Course",
              "name": course.title,
              "description": course.description || `كورس ${course.subject} للمرحلة ${STAGE_LABELS[course.educationalStage] || course.educationalStage}`,
              "provider": {
                "@type": "Organization",
                "name": "منصة Code-UP الكورسات",
                "url": "https://code-up.tech"
              },
              "educationalLevel": STAGE_LABELS[course.educationalStage] || course.educationalStage,
              "inLanguage": "ar",
              "offers": course.isPaid && course.price ? {
                "@type": "Offer",
                "price": course.effectivePrice,
                "priceCurrency": "EGP",
                "availability": "https://schema.org/InStock"
              } : {
                "@type": "Offer",
                "price": "0",
                "priceCurrency": "EGP"
              },
              "hasCourseInstance": {
                "@type": "CourseInstance",
                "courseMode": "online",
                "instructor": {
                  "@type": "Person",
                  "name": course.teacher.name
                }
              }
            })
          }}
        />
      )}
      <Navbar user={user} />

      {/* Hero */}
      <div className="relative bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white overflow-hidden">
        {course.thumbnailUrl && (
          <img src={course.thumbnailUrl} alt={`صورة خلفية لكورس ${course.title}`} className="absolute inset-0 w-full h-full object-cover opacity-20" />
        )}
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14 md:py-20">
          <div className="max-w-2xl">
            <div className="flex flex-wrap gap-2 mb-4">
              <span className={`text-xs px-3 py-1 rounded-full font-medium ${subjectClass}`}>{course.subject}</span>
              <span className="text-xs px-3 py-1 rounded-full bg-white/10 border border-white/15">{STAGE_LABELS[course.educationalStage] || course.educationalStage}</span>
              {course.hasAccess ? (
                <span className="text-xs px-3 py-1 rounded-full bg-emerald-500/25 border border-emerald-400/50 text-emerald-300 font-bold flex items-center gap-1">
                  ✓ في مكتبتك (لديك صلاحية)
                </span>
              ) : !course.isPaid ? (
                <span className="text-xs px-3 py-1 rounded-full bg-emerald-500/20 border border-emerald-400/30 text-emerald-300 font-bold">مجاني</span>
              ) : null}
            </div>
            <h1 className="text-3xl md:text-4xl font-black leading-tight mb-4">{course.title}</h1>
            {course.description && <p className="text-white/80 text-base leading-relaxed mb-6">{course.description}</p>}
            <div className="flex flex-wrap gap-4 text-sm text-white/70">
              <span>👨‍🏫 {course.teacher.name}</span>
              <span>🎬 {course.totalVideos} محاضرة</span>
              <span>📝 {course.totalQuizzes} اختبار</span>
              <span>📁 {course.folders.length} وحدة</span>
            </div>
          </div>
        </div>
      </div>

      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-10">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

          {/* Left: content overview */}
          <div className="lg:col-span-2 space-y-6">
            {/* Free / demo videos — watchable without enrollment */}
            {course.freeVideos && course.freeVideos.length > 0 && !course.hasAccess && (
              <div className="bg-white dark:bg-gray-800 rounded-2xl border border-emerald-500/30 shadow-sm overflow-hidden">
                <div className="px-6 py-5 border-b border-gray-100 dark:border-gray-700 flex items-center gap-2">
                  <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-emerald-500/15 text-emerald-500">
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M8 5v14l11-7z" /></svg>
                  </span>
                  <div>
                    <h2 className="text-lg font-bold text-gray-900 dark:text-white">شاهد مجاناً</h2>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">محاضرات تجريبية متاحة قبل الاشتراك</p>
                  </div>
                </div>
                <ul className="divide-y divide-gray-100 dark:divide-gray-700">
                  {course.freeVideos.map((v) => (
                    <li key={v.id} className="px-6 py-4 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="inline-flex items-center justify-center w-9 h-9 rounded-full bg-emerald-500/12 text-emerald-500 shrink-0">
                          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M8 5v14l11-7z" /></svg>
                        </span>
                        <p className="font-medium text-gray-900 dark:text-white truncate">{v.title}</p>
                        <span className="shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-500">مجاناً</span>
                      </div>
                      <button
                        onClick={() => playDemo(v)}
                        disabled={demoLoading === v.id}
                        className="shrink-0 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-white text-sm font-bold transition-colors disabled:opacity-60"
                      >
                        {demoLoading === v.id ? "جارٍ التحميل…" : "تشغيل"}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm overflow-hidden">
              <div className="px-6 py-5 border-b border-gray-100 dark:border-gray-700">
                <h2 className="text-lg font-bold text-gray-900 dark:text-white">محتوى الكورس</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{course.folders.length} وحدة · {course.totalVideos} محاضرة · {course.totalQuizzes} اختبار</p>
              </div>
              <ul className="divide-y divide-gray-100 dark:divide-gray-700">
                {course.folders.map((folder) => (
                  <li key={folder.id}>
                    <button
                      onClick={() => setOpenFolders((prev) => ({ ...prev, [folder.id]: !prev[folder.id] }))}
                      className="w-full flex items-center justify-between px-6 py-4 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors text-right"
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-lg">📁</span>
                        <div>
                          <p className="font-semibold text-gray-900 dark:text-white text-sm">{folder.name}</p>
                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{folder.videoCount} محاضرة · {folder.quizCount} اختبار</p>
                        </div>
                      </div>
                      <span className="text-gray-400 text-xs">{openFolders[folder.id] ? "▴" : "▾"}</span>
                    </button>
                    {openFolders[folder.id] && (
                      <div className="px-6 pb-3 space-y-1.5 bg-gray-50/50 dark:bg-gray-900/30">
                        {Array.from({ length: folder.videoCount }).map((_, i) => (
                          <div key={i} className="flex items-center gap-2 py-1.5 text-sm text-gray-600 dark:text-gray-400">
                            <span className="text-gray-300 dark:text-gray-600">🔒</span>
                            <span>محاضرة {i + 1}</span>
                          </div>
                        ))}
                        {Array.from({ length: folder.quizCount }).map((_, i) => (
                          <div key={`q${i}`} className="flex items-center gap-2 py-1.5 text-sm text-gray-600 dark:text-gray-400">
                            <span className="text-gray-300 dark:text-gray-600">🔒</span>
                            <span>اختبار {i + 1}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Right: pricing card */}
          <div className="lg:sticky lg:top-24 h-fit">
            <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-lg overflow-hidden">
              {course.thumbnailUrl && (
                <img src={course.thumbnailUrl} alt={course.title} className="w-full h-44 object-cover" />
              )}
              <div className="p-6 space-y-5">

                {/* Price display / In-Library status */}
                {course.hasAccess ? (
                  <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/25 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-emerald-500/20 text-emerald-500 flex items-center justify-center shrink-0">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5"/></svg>
                    </div>
                    <div>
                      <p className="font-black text-emerald-600 dark:text-emerald-400 text-base">في مكتبتك (لديك صلاحية)</p>
                      <p className="text-xs text-gray-600 dark:text-gray-300">أنت مشترك بالفعل ولديك صلاحية كاملة للوصول إلى كل محتويات هذا الكورس.</p>
                    </div>
                  </div>
                ) : isCenterMode || course.deliveryMode === "CENTER" ? (
                  <div className="flex items-center gap-2">
                    <span className="text-xl font-black text-amber-500 dark:text-amber-400">🏛️ حصة سنتر حضوري</span>
                    <span className="text-xs bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300 px-2.5 py-0.5 rounded-full font-bold">تفعيل بالكود فقط</span>
                  </div>
                ) : !course.isPaid ? (
                  <div className="flex items-center gap-2">
                    <span className="text-3xl font-black text-emerald-600 dark:text-emerald-400">مجاني</span>
                    <span className="text-xs bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 px-2 py-0.5 rounded-full font-medium">بالكامل</span>
                  </div>
                ) : hasDiscount ? (
                  <div className="space-y-1">
                    <div className="flex items-end gap-3">
                      <span className="text-3xl font-black text-gray-900 dark:text-white">{course.effectivePrice} جنيه</span>
                      <span className="text-lg text-gray-400 line-through mb-0.5">{course.price} جنيه</span>
                      <span className="text-xs bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 px-2 py-0.5 rounded-full font-bold mb-0.5">-{course.discountPercent}%</span>
                    </div>
                    {countdown && (
                      <div className="flex items-center gap-1.5 text-xs text-orange-600 dark:text-orange-400 font-medium bg-orange-50 dark:bg-orange-900/20 rounded-lg px-3 py-2">
                        <span>⏳</span>
                        <span>ينتهي العرض خلال: <span className="font-mono font-bold">{countdown}</span></span>
                      </div>
                    )}
                  </div>
                ) : (
                  <div>
                    <span className="text-3xl font-black text-gray-900 dark:text-white">{course.price} جنيه</span>
                  </div>
                )}

                {/* CTA */}
                {course.hasAccess ? (
                  <div className="space-y-2">
                    <button
                      onClick={() => router.push(`/courses/${course.id}/learn`)}
                      className={`w-full py-3.5 rounded-xl text-white font-bold text-base transition-all shadow-md flex items-center justify-center gap-2 ${
                        course.isOwnerTeacher
                          ? "bg-sky-600 hover:bg-sky-500 shadow-sky-600/20"
                          : "bg-emerald-600 hover:bg-emerald-700 shadow-emerald-600/20"
                      }`}
                    >
                      {course.isOwnerTeacher ? "👁️ معاينة الكورس كمعلّم ←" : "الدخول ومتابعة التعلم (في مكتبتك) ←"}
                    </button>
                    {user?.role === "student" && !course.isOwnerTeacher && (
                      <button
                        onClick={() => router.push(`/courses/${course.id}/progress`)}
                        className="w-full py-2.5 rounded-xl text-sm font-bold border border-emerald-500/40 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/10 transition-colors"
                      >
                        📊 متابعة تقدمي مع {course.teacher.name}
                      </button>
                    )}
                    {course.isOwnerTeacher && (
                      <p className="text-xs text-center text-sky-500 font-bold bg-sky-500/10 py-1.5 px-2 rounded-lg">
                        أنت أستاذ هذا الكورس — يمكنك معاينته ودخوله مباشرة مجاناً دون الحاجة للدفع.
                      </p>
                    )}
                  </div>
                ) : isCenterMode || course.deliveryMode === "CENTER" ? (
                  /* Center Mode — exclusively unlock via Access Code, no prices or payment gateways */
                  <div className="p-4 sm:p-5 rounded-2xl bg-amber-500/10 border border-amber-500/30 space-y-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center border border-amber-500/30">
                        <KeyRound className="w-5 h-5" />
                      </div>
                      <div>
                        <h4 className="text-sm font-black text-amber-300">تفعيل الحصة بكود السنتر</h4>
                        <p className="text-[11px] text-slate-400">ينزل الكورس مباشرة في مكتبتك بمجرد إدخال الكود</p>
                      </div>
                    </div>

                    <div className="space-y-2.5">
                      <input
                        type="text"
                        value={code}
                        onChange={(e) => setCode(e.target.value.toUpperCase())}
                        onKeyDown={(e) => e.key === "Enter" && applyCode()}
                        placeholder="أدخل كود السنتر (المسلّم لك في القاعة)"
                        className="w-full px-4 py-3 rounded-xl border border-amber-500/40 bg-slate-900 text-center font-mono text-base font-bold tracking-widest text-amber-300 outline-none focus:border-amber-400 transition-all placeholder:text-slate-500 placeholder:text-xs placeholder:font-sans placeholder:tracking-normal"
                        dir="ltr"
                      />

                      <button
                        onClick={applyCode}
                        disabled={applying || !code.trim()}
                        className="w-full py-3 rounded-xl text-slate-950 font-black text-sm transition-all disabled:opacity-50 cursor-pointer shadow-lg bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 flex items-center justify-center gap-2"
                      >
                        {applying ? (
                          <>
                            <div className="w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                            <span>جارٍ التفعيل...</span>
                          </>
                        ) : (
                          <span>تفعيل الكورس وإضافته لمكتبتي فوراً 🚀</span>
                        )}
                      </button>

                      {!user && (
                        <p className="text-[11px] text-center text-slate-400">
                          يلزم <button onClick={() => router.push(`/login?redirect_url=/courses/${courseId}`)} className="text-amber-400 font-bold underline">تسجيل الدخول</button> أولاً لحفظ الكورس في حسابك
                        </p>
                      )}
                    </div>
                  </div>
                ) : (!course.isPaid || course.effectivePrice === 0) ? (
                  /* Free course — always direct install, no code needed */
                  <div className="space-y-3">
                    <button
                      onClick={enroll}
                      disabled={enrolling || userLoading}
                      className="w-full py-3 rounded-xl text-white font-bold text-base transition-all disabled:opacity-60 flex items-center justify-center gap-2.5 shadow-lg active:scale-[0.98]"
                      style={{
                        background: "linear-gradient(135deg, var(--brand), var(--brand-strong))",
                        boxShadow: "0 8px 24px -8px var(--brand-shadow)",
                      }}>
                      {enrolling ? "جارٍ الاشتراك..." : "اشترك مجاناً الآن"}
                    </button>
                    {!userLoading && !user && (
                      <p className="text-xs text-center text-gray-500 dark:text-gray-400">
                        يلزم <button onClick={() => router.push(`/login?redirect_url=/courses/${courseId}`)} className="underline" style={{ color: "var(--brand)" }}>تسجيل الدخول</button> أولاً
                      </p>
                    )}
                    <p className="text-xs text-center" style={{ color: "var(--ink-3)" }}>
                      مجاني تماماً — يُضاف لمكتبتك فوراً
                    </p>
                  </div>
                ) : (
                  /* Paid course — wallet / fawry / balance / whatsapp / code choices */
                  <div className="space-y-3">
                    {/* Pay mode toggle */}
                    <div className="grid grid-cols-5 gap-1 p-1 rounded-xl" style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}>
                      <button onClick={() => { setPayMode("wallet"); setSelectedWalletMethod("vf_cash"); }}
                        className="rounded-lg text-xs font-bold border-none cursor-pointer transition-colors py-2"
                        style={{ background: payMode === "wallet" ? "var(--brand)" : "transparent", color: payMode === "wallet" ? "#fff" : "var(--ink-3)" }}>
                        📱 محفظة
                      </button>
                      <button onClick={() => { setPayMode("fawry"); setSelectedWalletMethod("fawry"); }}
                        className="rounded-lg text-xs font-bold border-none cursor-pointer transition-colors py-2"
                        style={{ background: payMode === "fawry" ? "#FFCC00" : "transparent", color: payMode === "fawry" ? "#000" : "var(--ink-3)" }}>
                        🏪 فوري
                      </button>
                      <button onClick={() => setPayMode("balance")}
                        className="rounded-lg text-xs font-bold border-none cursor-pointer transition-colors py-2"
                        style={{ background: payMode === "balance" ? "var(--gold-2)" : "transparent", color: payMode === "balance" ? "#fff" : "var(--ink-3)" }}>
                        💰 رصيدي
                      </button>
                      <button onClick={() => setPayMode("whatsapp")}
                        className="rounded-lg text-xs font-bold border-none cursor-pointer transition-colors py-2"
                        style={{ background: payMode === "whatsapp" ? "#25D366" : "transparent", color: payMode === "whatsapp" ? "#fff" : "var(--ink-3)" }}>
                        💬 واتسآب
                      </button>
                      <button onClick={() => setPayMode("code")}
                        className="rounded-lg text-xs font-bold border-none cursor-pointer transition-colors py-2"
                        style={{ background: payMode === "code" ? "var(--ink-2)" : "transparent", color: payMode === "code" ? "#fff" : "var(--ink-3)" }}>
                        🔑 كود
                      </button>
                    </div>

                    {/* Mode 1 & 2: Mobile Wallet / Fawry via Sha7nawy & Shake-Out */}
                    {(payMode === "wallet" || payMode === "fawry") && (
                      <div className="p-3.5 rounded-xl space-y-3" style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}>
                        {payMode === "wallet" && (
                          <div>
                            <label className="block text-xs font-bold mb-1.5" style={{ color: "var(--ink-2)" }}>اختر طريقة الدفع المباشر:</label>
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                              {[
                                { id: "vf_cash", label: "فودافون كاش", color: "#E60000" },
                              ].map(m => (
                                <button key={m.id} type="button" onClick={() => setSelectedWalletMethod(m.id as "vf_cash")}
                                  className="py-2 px-1 rounded-lg text-xs font-bold border cursor-pointer transition-all text-center flex items-center justify-center gap-1"
                                  style={{
                                    borderColor: selectedWalletMethod === m.id ? m.color : "var(--border)",
                                    background: selectedWalletMethod === m.id ? `${m.color}15` : "var(--surface)",
                                    color: selectedWalletMethod === m.id ? m.color : "var(--ink-2)",
                                  }}>
                                  {m.label}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Fee Breakdown */}
                        <div className="p-3 rounded-xl text-xs space-y-1" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
                          <div className="flex justify-between" style={{ color: "var(--ink-2)" }}>
                            <span>سعر الكورس الأصلي:</span>
                            <span className="font-bold">{course.effectivePrice} جنيه</span>
                          </div>
                          <div className="flex justify-between" style={{ color: "var(--ink-3)" }}>
                            <span>رسوم المعاملة والخدمة (2%):</span>
                            <span className="font-bold">{Math.round(course.effectivePrice * 0.02 * 100) / 100} جنيه</span>
                          </div>
                          <div className="flex justify-between pt-1 border-t border-[var(--border)]" style={{ color: "var(--brand)" }}>
                            <span className="font-black">الإجمالي المطلوب خصمه:</span>
                            <span className="font-black text-sm">{Math.round((course.effectivePrice * 1.02) * 100) / 100} جنيه</span>
                          </div>
                        </div>

                        {(() => {
                          const isWallet = selectedWalletMethod === "vf_cash" || selectedWalletMethod === "et_cash";
                          const isFawry = selectedWalletMethod === "fawry";
                          const totalAmount = Math.round((course.effectivePrice * (isFawry ? 1.025 : 1.02)) * 100) / 100;

                          return (
                            <>
                              {isWallet && (
                                <div>
                                  <label className="block text-xs font-bold mb-1" style={{ color: "var(--ink-2)" }}>رقم المحفظة (11 رقماً):</label>
                                  <input type="tel" value={walletPhone} onChange={e => setWalletPhone(e.target.value)}
                                    placeholder="01xxxxxxxxx" dir="ltr"
                                    className="w-full p-2 rounded-lg text-center font-mono text-sm border focus:outline-none"
                                    style={{ border: "1px solid var(--border)", background: "var(--surface)", color: "var(--ink)" }} />
                                </div>
                              )}

                              {isFawry && (
                                <div className="p-3 rounded-xl text-xs text-amber-600 dark:text-amber-300 bg-amber-500/10 border border-amber-500/20 text-center leading-relaxed font-bold">
                                  🏪 خيار فوري كشك: سيتم إصدار كود مرجعي (Fawry Code) لدفعه كاش في أي منفذ فوري أو سوبرماركت دون الحاجة لرقم محفظة.
                                </div>
                              )}

                              <button onClick={async () => {
                                if (!user) { router.push(`/login?redirect_url=/courses/${courseId}`); return; }
                                if (isWallet && !walletPhone.trim()) { setWalletMsg("❌ رقم المحفظة مطلوب"); return; }
                                setWalletLoading(true); setWalletMsg("");
                                try {
                                  const res = await fetch("/api/payments/sha7nawy/create", {
                                    method: "POST", credentials: "include",
                                    headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify({
                                      number: isWallet ? walletPhone.trim() : "",
                                      amount: course.effectivePrice,
                                      method: selectedWalletMethod,
                                      courseId: course.id,
                                      courseTitle: course.title,
                                    }),
                                  });
                                  const d = await res.json().catch(() => ({}));
                                  setWalletLoading(false);
                                  if (res.ok && d.success) {
                                    if (d.data?.payment_page_url || d.data?.url) {
                                      window.location.href = d.data.payment_page_url || d.data.url;
                                      return;
                                    }
                                    setWalletModal({
                                      reference: d.reference || "SH-PENDING",
                                      instructions: d.instructions,
                                      methodLabel: d.methodLabel,
                                      amount: course.effectivePrice,
                                    });
                                  } else {
                                    setWalletMsg(`❌ ${d.error || "تعذر بدء عملية الدفع"}`);
                                  }
                                } catch {
                                  setWalletLoading(false);
                                  setWalletMsg("❌ حدث خطأ أثناء الاتصال ببوابة الدفع");
                                }
                              }} disabled={walletLoading || userLoading}
                                className="w-full py-2.5 rounded-xl text-white font-bold text-sm cursor-pointer border-none transition-all disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90 shadow-md"
                                style={{ background: "linear-gradient(135deg, var(--brand), var(--brand-strong))" }}>
                                {walletLoading
                                  ? "جارٍ إعداد العملية..."
                                  : isWallet
                                  ? `خصم ${totalAmount} جنيه من المحفظة 📱`
                                  : isFawry
                                  ? `إصدار كود الدفع كاش بقيمة ${totalAmount} جنيه 🏪`
                                  : `الانتقال للبوابة البنكية للدفع (${totalAmount} جنيه) 💳`}
                              </button>
                            </>
                          );
                        })()}
                        {walletMsg && <p className="text-xs font-semibold text-center" style={{ color: walletMsg.startsWith("❌") ? "var(--danger)" : "var(--brand)" }}>{walletMsg}</p>}
                      </div>
                    )}

                    {/* Mode 2: Balance Purchase */}
                    {payMode === "balance" && (
                      <>
                        <button onClick={purchaseCourse} disabled={purchasing || userLoading}
                          className="w-full py-3 rounded-xl text-white font-bold text-base flex items-center justify-center gap-2 transition-all disabled:opacity-60 hover:opacity-90"
                          style={{ background: "linear-gradient(135deg,var(--gold-2),#9a6a1c)", boxShadow: "0 8px 24px -8px rgba(200,146,47,.5)" }}>
                          {purchasing ? (
                            <><div className="w-4 h-4 border-2 border-white/50 border-t-white rounded-full animate-spin" />جارٍ الشراء...</>
                          ) : (
                            `شراء بـ ${course.effectivePrice} جنيه من رصيدك`
                          )}
                        </button>
                        {!user && <p className="text-xs text-center" style={{ color: "var(--ink-3)" }}><button onClick={() => router.push(`/login?redirect_url=/courses/${courseId}`)} className="underline" style={{ color: "var(--brand)" }}>سجّل الدخول</button> أولاً</p>}
                        <p className="text-xs text-center" style={{ color: "var(--ink-3)" }}>يمكنك إضافة رصيد من قسم &quot;رصيدي&quot; في حسابك</p>
                      </>
                    )}

                    {/* Mode 3: WhatsApp Assistance */}
                    {payMode === "whatsapp" && (
                      <div className="space-y-2 text-center">
                        <p className="text-xs text-gray-500 font-medium">تواصل معنا لشراء الكورس عبر InstaPay، التحويل البنكي، أو الكاش:</p>
                        <a href={buildWhatsAppUrl(
                            process.env.NEXT_PUBLIC_PAYMENT_ACCESS_PASSWORD || "+201118802621",
                            [
                              `مرحباً، أريد الاشتراك في كورس "${course.title}"`,
                              `المعلم: ${course.teacher.name}`,
                              `السعر: ${course.effectivePrice} جنيه`,
                              `اسم الطالب: ${user?.name || "غير مسجل"}`,
                              user?.phone ? `رقم الطالب: ${user.phone}` : null,
                              user?.parentPhone ? `رقم ولي الأمر: ${user.parentPhone}` : null,
                            ].filter(Boolean).join("\n"),
                          )} target="_blank" rel="noopener noreferrer"
                          className="flex items-center justify-center gap-2 w-full py-3 rounded-xl text-white font-bold text-sm transition-colors hover:opacity-90 no-underline"
                          style={{ background: "#25D366" }}>
                          💬 تواصل للشراء عبر واتسآب
                        </a>
                      </div>
                    )}

                    {/* Mode 4: Access Code */}
                    {payMode === "code" && (
                      <div className="space-y-2">
                        <p className="text-xs font-medium text-center" style={{ color: "var(--ink-2)" }}>أدخل كود الوصول المكون من 16 حرفاً:</p>
                        <div className="flex gap-2">
                          <input type="text" value={code} onChange={e => setCode(e.target.value.toUpperCase())}
                            onKeyDown={e => e.key === "Enter" && applyCode()} placeholder="كود الوصول" maxLength={16} dir="ltr"
                            className="flex-1 rounded-xl px-3 py-2.5 text-center font-mono text-sm tracking-widest focus:outline-none transition-colors"
                            style={{ border: "1px solid var(--border)", background: "var(--surface-2)", color: "var(--ink)" }} />
                          <button onClick={applyCode} disabled={applying || !code.trim()}
                            className="rounded-xl px-4 py-2.5 text-white font-bold text-sm disabled:opacity-50 transition-colors"
                            style={{ background: "var(--brand)" }}>
                            {applying ? "..." : "تفعيل"}
                          </button>
                        </div>
                        {!user && <p className="text-xs text-center" style={{ color: "var(--ink-3)" }}><button onClick={() => router.push("/login")} className="underline" style={{ color: "var(--brand)" }}>سجّل الدخول</button> أولاً</p>}
                      </div>
                    )}
                  </div>
                )}

                {/* Sha7nawy Instruction Modal */}
                {walletModal && (
                  <div className="fixed inset-0 z-[var(--z-modal)] flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,.6)" }} onClick={() => setWalletModal(null)}>
                    <div className="w-full max-w-md rounded-2xl p-6 text-center space-y-4 shadow-2xl" style={{ background: "var(--surface)", border: "1px solid var(--border)" }} onClick={e => e.stopPropagation()}>
                      <div className="text-4xl">📲</div>
                      <h3 className="text-lg font-bold" style={{ color: "var(--ink)" }}>تم إرسال طلب الخصم بنجاح!</h3>
                      <p className="text-xs text-gray-500 font-mono">رقم المرجع: {walletModal.reference}</p>
                      
                      <div className="p-4 rounded-xl space-y-2 text-right text-sm" style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}>
                        <p className="font-bold text-center" style={{ color: "var(--brand)" }}>تعليمات إتمام العملية:</p>
                        <p className="text-xs leading-relaxed" style={{ color: "var(--ink-2)" }}>{walletModal.instructions}</p>
                      </div>

                      <div className="pt-2 space-y-2">
                        <button onClick={async () => {
                          setWalletLoading(true);
                          try {
                            const res = await fetch("/api/payments/sha7nawy/confirm", {
                              method: "POST", credentials: "include",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ ref_code: walletModal.reference }),
                            });
                            const d = await res.json().catch(() => ({}));
                            setWalletLoading(false);
                            if (res.ok && d.success) {
                              setWalletModal(null);
                              toastSuccess("تم تأكيد السحب وشحن حسابك بنجاح!");
                            } else {
                              setWalletMsg(`⚠️ ${d.error || "العملية معلقة بانتظار موافقة العميل من المحفظة"}`);
                            }
                          } catch {
                            setWalletLoading(false);
                            setWalletMsg("❌ تعذر الاتصال بسيرفر التأكيد");
                          }
                        }} disabled={walletLoading}
                          className="w-full py-3 rounded-xl text-white font-bold text-sm cursor-pointer border-none transition-all hover:opacity-90 shadow-md"
                          style={{ background: "linear-gradient(135deg, var(--brand), var(--brand-strong))" }}>
                          {walletLoading ? "جارٍ التحقق والتأكيد..." : "تأكيد واستعلام حالة الدفع 🔄"}
                        </button>

                        <button onClick={() => setWalletModal(null)}
                          className="w-full py-2.5 rounded-xl text-xs font-bold border cursor-pointer transition-colors"
                          style={{ background: "var(--surface-2)", border: "1px solid var(--border)", color: "var(--ink-2)" }}>
                          إغلاق النافذة
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                <div className="pt-3 border-t border-gray-100 dark:border-gray-700 space-y-2 text-sm text-gray-600 dark:text-gray-400">
                  <p>✅ وصول كامل لجميع المحاضرات والاختبارات</p>
                  <p>✅ تتبع تقدمك في الكورس</p>
                  <p>✅ اختبارات مع نتائج فورية</p>
                </div>

                {/* Feedback Section for enrolled students */}
                {course.hasAccess && user?.role === "student" && (
                  <div className="mt-6 pt-6 border-t border-gray-100 dark:border-gray-700">
                    <CourseFeedbackForm
                      courseId={course.id}
                      courseTitle={course.title}
                      teacherName={course.teacher.name}
                    />
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </main>
      <Footer />

      {/* Free/demo inline player */}
      {demo && (
        <div
          className="fixed inset-0 z-[var(--z-modal)] flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-label={demo.title}
        >
          <div className="absolute inset-0 bg-black/70" onClick={() => setDemo(null)} aria-hidden />
          <div className="relative w-full max-w-3xl bg-[var(--surface)] rounded-2xl overflow-hidden shadow-2xl">
            <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-[var(--border)]">
              <p className="font-bold text-[var(--ink)] truncate flex items-center gap-2">
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-500">مجاناً</span>
                {demo.title}
              </p>
              <button
                onClick={() => setDemo(null)}
                aria-label="إغلاق"
                className="w-8 h-8 rounded-lg flex items-center justify-center text-[var(--ink-muted)] hover:text-[var(--ink)] hover:bg-[var(--border)] transition-colors shrink-0"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M18 6L6 18M6 6l12 12" /></svg>
              </button>
            </div>
            <SecurePlayer
              embedUrl={demo.embedUrl}
              title={demo.title}
              watermark={user?.phone || user?.name || ""}
              provider={demo.provider}
              drm={demo.drm || undefined}
            />
          </div>
        </div>
      )}
    </div>
  );
}
