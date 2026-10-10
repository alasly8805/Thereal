"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { BookOpen, Sparkles, X, ArrowLeft, GraduationCap } from "lucide-react";

interface PopupData {
  id: string;
  courseId: string;
  courseTitle: string;
  teacherId: string;
  teacherName: string;
  customTitle?: string;
  message?: string;
  targetStage?: string | null;
  actionType?: "course" | "renewal" | "both";
  renewalButtonText?: string;
  hasAccess?: boolean;
  createdAt: string;
}

const DISMISS_PREFIX = "new_course_popup_dismissed_";

function isFocusPage(pathname: string) {
  return (
    pathname.includes("/learn") ||
    pathname.includes("/watch") ||
    pathname.startsWith("/quizzes") ||
    pathname.startsWith("/homework") ||
    pathname.startsWith("/leaderboard/daily-exam")
  );
}

export function NewCoursePopup() {
  const pathname = usePathname() ?? "";
  const router = useRouter();
  const [popup, setPopup] = useState<PopupData | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/student/new-course-popup", {
        credentials: "include",
        cache: "no-store",
      });
      if (!res.ok) return;
      const data = (await res.json()) as { popup: PopupData | null };
      if (data?.popup) {
        const isDismissed =
          typeof window !== "undefined" &&
          localStorage.getItem(`${DISMISS_PREFIX}${data.popup.id}`);
        if (!isDismissed) {
          setPopup(data.popup);
          setIsOpen(true);
        }
      }
    } catch {
      /* offline or network error — ignore */
    }
  }, []);

  useEffect(() => {
    void load();
    // Poll every 3 minutes so open tabs receive updates
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, 180000);
    return () => clearInterval(timer);
  }, [load]);

  const dismiss = () => {
    if (popup && typeof window !== "undefined") {
      localStorage.setItem(`${DISMISS_PREFIX}${popup.id}`, "1");
    }
    setIsOpen(false);
  };

  const goToCourse = () => {
    if (!popup) return;
    dismiss();
    router.push(`/courses/${popup.courseId}`);
  };

  const goToRenewal = () => {
    if (!popup) return;
    dismiss();
    router.push(`/choose-course?teacherId=${popup.teacherId}`);
  };

  if (!isOpen || !popup || isFocusPage(pathname)) {
    return null;
  }

  const isRenewalAction = popup.actionType === "renewal" || popup.actionType === "both" || !popup.hasAccess;

  return (
    <div
      role="dialog"
      aria-modal="true"
      dir="rtl"
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300"
    >
      <div
        className="relative w-full max-w-lg rounded-3xl border border-[var(--border)] bg-[var(--surface)] text-[var(--ink)] shadow-2xl overflow-hidden scale-100 animate-in zoom-in-95 duration-200"
        style={{
          boxShadow: "0 25px 60px -15px rgba(0, 0, 0, 0.4), 0 0 40px rgba(16, 185, 129, 0.2)",
        }}
      >
        {/* Top gradient decorative header */}
        <div className="relative h-28 bg-gradient-to-r from-emerald-600 via-teal-600 to-indigo-600 p-6 flex items-start justify-between text-white overflow-hidden">
          {/* Subtle decorative circles */}
          <div className="absolute -top-8 -left-8 w-32 h-32 rounded-full bg-white/10 blur-xl pointer-events-none" />
          <div className="absolute top-10 right-10 w-24 h-24 rounded-full bg-emerald-400/20 blur-lg pointer-events-none" />

          <div className="relative z-10 flex items-center gap-3">
            <span className="w-12 h-12 rounded-2xl bg-white/20 backdrop-blur-md border border-white/30 flex items-center justify-center text-white shadow-inner">
              <Sparkles size={24} className="animate-pulse" />
            </span>
            <div>
              <span className="inline-block text-[11px] font-bold px-2 py-0.5 rounded-full bg-white/25 text-white tracking-wide">
                {isRenewalAction ? "تجديد الاشتراك متاح ⚡" : "إشعار كورس جديد 🎉"}
              </span>
              <h3 className="text-base font-extrabold mt-0.5 leading-snug">
                {popup.teacherName ? `أستاذ ${popup.teacherName}` : "مدرسك أضاف كورساً جديداً"}
              </h3>
            </div>
          </div>

          <button
            type="button"
            onClick={dismiss}
            aria-label="إغلاق"
            className="relative z-10 p-1.5 rounded-xl bg-black/20 hover:bg-black/40 text-white/90 hover:text-white transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content body */}
        <div className="p-6 space-y-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="p-1 rounded-lg bg-emerald-500/10 text-emerald-500">
                <BookOpen size={16} />
              </span>
              <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">
                {isRenewalAction ? "كورس جديد متاح مع تجديد الاشتراك" : "كورس متاح الآن في حسابك تلقائياً"}
              </span>
            </div>
            <h2 className="text-xl font-black text-[var(--ink)] leading-snug">
              {popup.customTitle || popup.courseTitle}
            </h2>
          </div>

          <p className="text-sm text-[var(--ink-2)] leading-relaxed bg-[var(--surface-2)] p-4 rounded-2xl border border-[var(--border)]">
            {popup.message ||
              `أضاف المدرس كورس "${popup.courseTitle}". يمكنك التجديد الآن لمتابعة المحاضرات والواجبات فوراً!` }
          </p>

          <div className="flex flex-col sm:flex-row items-center gap-2.5 pt-2">
            {isRenewalAction && (
              <button
                type="button"
                onClick={goToRenewal}
                className="w-full sm:flex-1 h-12 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-black text-sm flex items-center justify-center gap-2 shadow-lg shadow-amber-500/25 transition-all transform active:scale-95"
              >
                <Sparkles size={16} />
                <span>{popup.renewalButtonText || "تجديد الاشتراك الآن ⚡"}</span>
              </button>
            )}

            {popup.actionType !== "renewal" && (
              <button
                type="button"
                onClick={goToCourse}
                className={`w-full ${
                  isRenewalAction
                    ? "sm:w-auto px-4 border border-[var(--border)] bg-[var(--surface-2)] text-[var(--ink)] hover:bg-[var(--surface)]"
                    : "sm:flex-1 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white shadow-lg shadow-emerald-600/25"
                } h-12 rounded-xl font-black text-sm flex items-center justify-center gap-2 transition-all transform active:scale-95`}
              >
                <span>{popup.hasAccess ? "ابدأ دراسة الكورس الآن" : "معاينة تفاصيل الكورس"}</span>
                <ArrowLeft size={16} />
              </button>
            )}

            <button
              type="button"
              onClick={dismiss}
              className="w-full sm:w-auto px-4 h-12 rounded-xl border border-[var(--border)] hover:bg-[var(--surface-2)] text-[var(--ink-2)] font-bold text-sm transition-colors"
            >
              لاحقاً
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
