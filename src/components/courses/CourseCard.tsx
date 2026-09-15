"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/Toast";
import { formatEgp, useCountdown } from "@/lib/motion";

interface CourseCardProps {
  course: {
    id: string;
    title: string;
    subject?: string;
    description?: string | null;
    thumbnailUrl?: string | null;
    educationalStage?: string;
    teacher: { id: string; name: string };
    _count?: { accessCodes: number };
    hasAccess?: boolean;
    inLibrary?: boolean;
    isPaid?: boolean;
    price?: number | null;
    discountPercent?: number | null;
    discountExpiresAt?: string | null;
    allowDirectInstall?: boolean;
    isOwnerTeacher?: boolean;
  };
  onCodeApplied: () => void;
}

const STAGE_LABELS: Record<string, string> = {
  sec_1: "أولى بكالوريا",
  sec_2: "ثانية بكالوريا",
};

const SUBJECT_COLORS: Record<string, { bg: string; text: string }> = {
  رياضيات:        { bg: "#1d4ed8", text: "#fff" },
  فيزياء:         { bg: "#7c3aed", text: "#fff" },
  كيمياء:         { bg: "#059669", text: "#fff" },
  أحياء:          { bg: "#0891b2", text: "#fff" },
  "لغة عربية":    { bg: "#b45309", text: "#fff" },
  "لغة إنجليزية": { bg: "#dc2626", text: "#fff" },
};
const DEFAULT_COLOR = { bg: "var(--brand)", text: "#fff" };

const isSafeSrc = (src: string) => /^https?:\/\//i.test(src) || (src.startsWith("/") && !src.startsWith("//"));

export function CourseCard({ course, onCodeApplied }: CourseCardProps) {
  const router  = useRouter();
  const { success: toastSuccess, error: toastError } = useToast();
  const [code,      setCode]      = useState("");
  const [applying,  setApplying]  = useState(false);
  const [installing, setInstalling] = useState(false);
  const [installed,  setInstalled]  = useState(false);
  const [purchasing, setPurchasing] = useState(false);
  const [payMode,    setPayMode]    = useState<"code" | "balance">("code");

  const hasAccessOrInLibrary = Boolean(course.hasAccess || course.inLibrary);
  const countdown      = useCountdown(course.discountExpiresAt ?? null);
  const hasDiscount    = (course.discountPercent ?? 0) > 0;
  const discountActive = hasDiscount && !(countdown?.expired ?? false);
  const effectivelyFree = !course.isPaid || (discountActive && course.discountPercent === 100);
  const finalPrice =
    course.price != null && discountActive
      ? Math.round(course.price * (1 - (course.discountPercent ?? 0) / 100))
      : course.price;

  const thumbnail    = course.thumbnailUrl && isSafeSrc(course.thumbnailUrl) ? course.thumbnailUrl : null;
  const stageLabel   = STAGE_LABELS[course.educationalStage ?? ""] || course.educationalStage || "";
  const subjectColor = SUBJECT_COLORS[course.subject ?? ""] ?? DEFAULT_COLOR;
  const tagText      = [course.subject, stageLabel].filter(Boolean).join(" · ");

  const installCourse = async () => {
    if (installing) return;
    setInstalling(true);
    try {
      const res = await fetch(`/api/courses/${course.id}/enroll`, { method: "POST", credentials: "include" });
      const data: { message?: string; error?: string } = await res.json().catch(() => ({}));
      if (res.ok) {
        setInstalled(true);
        toastSuccess(data.message || `تم تثبيت «${course.title}» في مكتبتك! 📲`);
        onCodeApplied();
        setTimeout(() => router.push("/library"), 800);
      } else if (res.status === 401) {
        router.push("/login");
      } else {
        toastError(data.error || "تعذر تثبيت الكورس");
      }
    } catch {
      toastError("تعذر الاتصال بالخادم");
    } finally {
      setInstalling(false);
    }
  };

  const purchaseCourse = async () => {
    if (purchasing) return;
    setPurchasing(true);
    try {
      const res = await fetch(`/api/courses/${course.id}/purchase`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ promoCode: code.trim() || undefined }),
      });
      const data: { message?: string; courseTitle?: string; charged?: number; error?: string } = await res.json().catch(() => ({}));
      if (res.ok) {
        toastSuccess(data.message || `تم شراء «${course.title}» بنجاح!`);
        onCodeApplied();
        router.push("/library");
      } else {
        toastError(data.error || "تعذر إتمام الشراء");
      }
    } catch {
      toastError("تعذر الاتصال بالخادم");
    } finally {
      setPurchasing(false);
    }
  };

  const applyCode = async () => {
    const normalized = code.trim().toUpperCase();
    if (!normalized || applying) return;
    setApplying(true);
    try {
      const res  = await fetch("/api/codes", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: normalized }),
      });
      const data: { message?: string; courseTitle?: string; error?: string } = await res.json().catch(() => ({}));
      if (res.ok) {
        toastSuccess(data.message || `تم إضافة «${data.courseTitle || course.title}» إلى مكتبتك!`);
        setCode("");
        onCodeApplied();
        router.push("/library");
      } else if (res.status === 401) {
        toastError("يجب تسجيل الدخول أولاً");
      } else {
        toastError(data.error || "كود غير صحيح");
      }
    } catch {
      toastError("تعذر الاتصال بالخادم");
    } finally {
      setApplying(false);
    }
  };

  return (
    <article
      className="group flex flex-col h-full overflow-hidden rounded-[20px] transition-all duration-300 hover:-translate-y-1"
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        boxShadow: "var(--shadow-sm)",
      }}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.boxShadow = "var(--shadow-lg)"; }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.boxShadow = "var(--shadow-sm)"; }}
    >
      {/* ── Thumbnail ── */}
      <div className="relative overflow-hidden" style={{ aspectRatio: "16/9" }}>
        {thumbnail ? (
          <img
            src={thumbnail}
            alt={course.title}
            loading="lazy"
            decoding="async"
            referrerPolicy="no-referrer"
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div
            className="w-full h-full flex items-center justify-center"
            style={{ background: `linear-gradient(135deg, ${subjectColor.bg}, ${subjectColor.bg}99)` }}
          >
            <svg className="w-16 h-16 text-white/30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
            </svg>
          </div>
        )}

        {/* Enrolled / In Library ribbon */}
        {hasAccessOrInLibrary && (
          <div
            className="absolute top-3 right-0 flex items-center gap-1.5 font-bold text-xs text-white z-10"
            style={{
              padding: "6px 14px 6px 10px",
              background: course.isOwnerTeacher
                ? "linear-gradient(135deg, #0284c7, #0369a1)"
                : "linear-gradient(135deg, #059669, #10b981)",
              borderRadius: "0 0 0 12px",
              boxShadow: "-3px 3px 12px rgba(5,150,105,.4)",
            }}
          >
            {course.isOwnerTeacher ? (
              <>👁️ معاينة كطالب</>
            ) : (
              <>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5"/></svg>
                في مكتبتك (لديك صلاحية)
              </>
            )}
          </div>
        )}

        {/* Free / Discount badge */}
        {!hasAccessOrInLibrary && (
          <div className="absolute top-3 left-3 flex flex-col gap-1.5">
            {effectivelyFree && (
              <span className="text-xs font-bold text-white px-2.5 py-1 rounded-full" style={{ background: "#10b981" }}>مجاني</span>
            )}
            {discountActive && !effectivelyFree && (
              <span className="text-xs font-bold text-white px-2.5 py-1 rounded-full" style={{ background: "#ec4899" }}>
                خصم {(course.discountPercent ?? 0)}٪
              </span>
            )}
          </div>
        )}

        {/* Countdown bar */}
        {!hasAccessOrInLibrary && discountActive && countdown && !countdown.expired && (
          <div className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-1.5 py-2 text-xs font-bold text-amber-300"
            style={{ background: "linear-gradient(to top, rgba(0,0,0,.75), transparent)" }}>
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
            ينتهي العرض خلال {countdown.label}
          </div>
        )}
      </div>

      {/* ── Body ── */}
      <div className="flex flex-1 flex-col p-5 gap-3">

        {/* Subject + Grade tag */}
        {tagText && (
          <span
            className="self-start text-xs font-bold rounded-full px-3 py-1.5 leading-tight"
            style={{ background: subjectColor.bg + "18", color: subjectColor.bg, border: `1px solid ${subjectColor.bg}30`, wordBreak: "break-word" }}
          >
            {tagText}
          </span>
        )}

        {/* Title */}
        <h2
          className="font-black leading-snug line-clamp-2 transition-colors"
          style={{ fontSize: 17, color: "var(--ink)", fontFamily: "var(--font-head)" }}
        >
          {course.title}
        </h2>

        {/* Description */}
        {course.description && (
          <p className="text-sm line-clamp-2 leading-relaxed" style={{ color: "var(--ink-2)" }}>
            {course.description}
          </p>
        )}

        {/* Teacher + Price / Status row */}
        <div className="flex items-center justify-between gap-2 mt-auto pt-1">
          <div className="flex items-center gap-2">
            {hasAccessOrInLibrary ? (
              <span
                className="inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full"
                style={{
                  background: course.isOwnerTeacher ? "rgba(2,132,199,0.12)" : "rgba(16,185,129,0.12)",
                  color: course.isOwnerTeacher ? "#0284c7" : "#059669",
                  border: `1px solid ${course.isOwnerTeacher ? "rgba(2,132,199,0.25)" : "rgba(16,185,129,0.25)"}`,
                }}
              >
                {course.isOwnerTeacher ? (
                  <>👁️ صانع الكورس</>
                ) : (
                  <>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5"/></svg>
                    متاح بمكتبتك
                  </>
                )}
              </span>
            ) : course.isPaid && !effectivelyFree && finalPrice != null ? (
              <div className="flex items-baseline gap-1.5" dir="rtl">
                <span className="font-black text-lg" style={{ color: "var(--gold-2)", fontFamily: "var(--font-head)" }}>{formatEgp(finalPrice)}</span>
                {discountActive && course.price != null && (
                  <span className="text-xs line-through" style={{ color: "var(--ink-3)" }}>{formatEgp(course.price)}</span>
                )}
              </div>
            ) : effectivelyFree ? (
              <span className="text-sm font-bold" style={{ color: "#10b981" }}>مجاني</span>
            ) : null}
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <span
              className="flex items-center justify-center w-7 h-7 rounded-full text-white text-xs font-black"
              style={{ background: "var(--brand)" }}
            >
              {course.teacher.name.trim().charAt(0)}
            </span>
            <span className="text-sm font-medium" style={{ color: "var(--ink-2)" }}>أ/ {course.teacher.name}</span>
          </div>
        </div>

        {/* ── CTAs ── */}
        <div className="flex flex-col gap-2 pt-1" style={{ borderTop: "1px solid var(--border)", marginTop: 4 }}>
          {hasAccessOrInLibrary ? (
            <>
              <button
                onClick={() => router.push(`/courses/${course.id}/learn`)}
                className="w-full py-2.5 rounded-xl font-bold text-sm text-white transition-all active:scale-[0.98] hover:opacity-90 flex items-center justify-center gap-2"
                style={{
                  background: course.isOwnerTeacher
                    ? "linear-gradient(135deg,#0284c7,#0369a1)"
                    : "linear-gradient(135deg,#10b981,#059669)",
                  boxShadow: course.isOwnerTeacher
                    ? "0 4px 14px -4px rgba(2,132,199,.4)"
                    : "0 4px 14px -4px rgba(16,185,129,.4)",
                }}
              >
                {course.isOwnerTeacher ? (
                  "👁️ معاينة الكورس ←"
                ) : (
                  <>
                    <span>الدخول للكورس ومتابعة التعلم</span>
                    <span>←</span>
                  </>
                )}
              </button>
              <button
                onClick={() => router.push(`/courses/${course.id}`)}
                className="w-full py-2 rounded-xl text-sm font-semibold transition-colors"
                style={{ background: "var(--surface-2)", color: "var(--ink-2)", border: "1px solid var(--border)" }}
              >
                تفاصيل الكورس
              </button>
            </>
          ) : effectivelyFree ? (
            <button
              onClick={installCourse}
              disabled={installing || installed}
              className="w-full py-2.5 rounded-xl font-bold text-sm text-white flex items-center justify-center gap-2 transition-all active:scale-[0.98] disabled:opacity-70"
              style={{
                background: installed
                  ? "linear-gradient(135deg,#10b981,#059669)"
                  : "linear-gradient(135deg,var(--brand),var(--brand-strong))",
                boxShadow: "0 4px 14px -4px var(--brand-shadow)",
              }}
            >
              {installed ? (
                <><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5"/></svg>تم التسجيل!</>
              ) : installing ? (
                <><div className="w-3.5 h-3.5 border-2 border-white/50 border-t-white rounded-full animate-spin" />جارٍ التثبيت...</>
              ) : (
                <><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>سجّل الآن — مجاناً</>
              )}
            </button>
          ) : (
            /* Paid course — balance purchase OR code input */
            <div className="space-y-2">
              <button
                onClick={() => router.push(`/courses/${course.id}`)}
                className="w-full py-2.5 rounded-xl font-bold text-sm text-white transition-all hover:opacity-90 active:scale-[0.98]"
                style={{ background: "linear-gradient(135deg,var(--brand),var(--brand-strong))", boxShadow: "0 4px 14px -4px var(--brand-shadow)" }}
              >
                عرض تفاصيل الكورس
              </button>

              {/* Pay mode toggle */}
              <div className="flex gap-1 p-1 rounded-[10px]" style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}>
                <button onClick={() => setPayMode("balance")}
                  className="flex-1 rounded-[8px] text-xs font-bold cursor-pointer border-none transition-colors"
                  style={{ padding: "7px 6px", background: payMode === "balance" ? "var(--gold-2)" : "transparent", color: payMode === "balance" ? "#fff" : "var(--ink-3)" }}>
                  💰 شراء بالرصيد
                </button>
                <button onClick={() => setPayMode("code")}
                  className="flex-1 rounded-[8px] text-xs font-bold cursor-pointer border-none transition-colors"
                  style={{ padding: "7px 6px", background: payMode === "code" ? "var(--brand)" : "transparent", color: payMode === "code" ? "#fff" : "var(--ink-3)" }}>
                  🔑 كود الوصول
                </button>
              </div>

              {payMode === "balance" ? (
                <button onClick={purchaseCourse} disabled={purchasing}
                  className="w-full rounded-xl py-2.5 text-sm font-bold text-white flex items-center justify-center gap-2 transition-all active:scale-[0.98] disabled:opacity-60 hover:opacity-90"
                  style={{ background: "linear-gradient(135deg,var(--gold-2),#9a6a1c)", boxShadow: "0 4px 14px -6px rgba(200,146,47,.5)" }}>
                  {purchasing ? (
                    <><div className="w-3.5 h-3.5 border-2 border-white/50 border-t-white rounded-full animate-spin" />جارٍ الشراء...</>
                  ) : (
                    <>{finalPrice != null ? `شراء بـ ${finalPrice} جنيه من رصيدك` : "شراء بالرصيد"}</>
                  )}
                </button>
              ) : (
                /* code input — stacks vertically on mobile */
                <div className="flex flex-col gap-2">
                  <input type="text" value={code}
                    onChange={e => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, ""))}
                    onKeyDown={e => e.key === "Enter" && applyCode()}
                    placeholder="أدخل كود الوصول" maxLength={16} dir="ltr"
                    className="w-full rounded-xl px-3 py-3 text-center font-mono text-sm tracking-widest focus:outline-none transition-colors"
                    style={{ border: "1px solid var(--border)", background: "var(--surface-2)", color: "var(--ink)", minHeight: 44 }} />
                  <button onClick={applyCode} disabled={applying || !code.trim()}
                    className="w-full py-3 rounded-xl text-sm font-bold text-white transition-all disabled:opacity-50"
                    style={{ background: "var(--brand)", minHeight: 44 }}>
                    {applying ? "جارٍ التفعيل..." : "تفعيل الكود"}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </article>
  );
}
