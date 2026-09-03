"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, KeyRound, Sparkles, CheckCircle2, AlertCircle, X, ArrowRight } from "lucide-react";

export function CenterModeBanner() {
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
  const [showRedeemModal, setShowRedeemModal] = useState(false);
  const [code, setCode] = useState("");
  const [resolving, setResolving] = useState(false);
  const [resolvedData, setResolvedData] = useState<{
    valid: boolean;
    courseTitle: string;
    teacherName: string;
    scopeLabel: string;
    error?: string;
  } | null>(null);
  const [activating, setActivating] = useState(false);
  const [activationSuccess, setActivationSuccess] = useState<string | null>(null);
  const [activationError, setActivationError] = useState<string | null>(null);
  const router = useRouter();

  // Auto-resolve code preview when typing
  useEffect(() => {
    const trimmed = code.trim();
    if (trimmed.length < 4) {
      const timer = setTimeout(() => {
        setResolvedData(null);
        setActivationError(null);
      }, 0);
      return () => clearTimeout(timer);
    }

    const timer = setTimeout(async () => {
      setResolving(true);
      try {
        const res = await fetch(`/api/codes/resolve?code=${encodeURIComponent(trimmed)}`);
        const data = await res.json();
        if (res.ok && data.valid) {
          setResolvedData(data);
          setActivationError(null);
        } else {
          setResolvedData(null);
          setActivationError(data.error || "الكود غير صحيح أو مستخدم مسبقاً");
        }
      } catch {
        setResolvedData(null);
      } finally {
        setResolving(false);
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [code]);

  const handleRedeem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim() || activating) return;

    setActivating(true);
    setActivationError(null);
    setActivationSuccess(null);

    try {
      const res = await fetch("/api/codes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ code: code.trim().toUpperCase() }),
      });

      const data = await res.json();
      if (res.ok) {
        setActivationSuccess(data.message || "تم تفعيل الكورس بنجاح وإضافته إلى مكتبتك!");
        setCode("");
        setResolvedData(null);
        setTimeout(() => {
          router.push("/library");
          router.refresh();
        }, 1500);
      } else {
        setActivationError(data.error || "فشل تفعيل الكود، تأكد من صحة الكود");
      }
    } catch {
      setActivationError("حدث خطأ في الاتصال، يرجى المحاولة لاحقاً");
    } finally {
      setActivating(false);
    }
  };

  if (!isCenterMode) return null;

  return (
    <>
      {/* ── Fixed Center Student Notification Bar ── */}
      <div className="bg-gradient-to-r from-amber-600 via-amber-500 to-amber-700 text-white shadow-md border-b border-amber-400/40 relative z-30 px-3 py-2 sm:py-2.5">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-black/20 backdrop-blur flex items-center justify-center shrink-0">
              <Building2 className="w-4 h-4 text-amber-100" />
            </div>
            <div>
              <p className="text-xs sm:text-sm font-black flex items-center gap-1.5 tracking-tight">
                <span>أنت الآن في وضع طلاب السنتر</span>
                <span className="text-[10px] bg-white/20 px-2 py-0.5 rounded-full font-bold">الحصص الحضورية</span>
              </p>
              <p className="text-[11px] text-amber-100/90 hidden md:block">
                جميع الكورسات مخصصة لطلاب السنتر وتُفعّل فوراً بواسطة كود الحصة المسلّم لك دون أي دفع إلكتروني.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              setShowRedeemModal(true);
              setActivationSuccess(null);
              setActivationError(null);
            }}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-black/80 hover:bg-black text-amber-300 text-xs font-black shadow-lg transition-all cursor-pointer border border-amber-400/40 hover:scale-105 active:scale-95"
          >
            <KeyRound className="w-3.5 h-3.5" />
            <span>تفعيل كود السنتر</span>
          </button>
        </div>
      </div>

      {/* ── Instant Code Redeem Modal ── */}
      {showRedeemModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200" dir="rtl">
          <div className="bg-slate-900 border border-amber-500/40 rounded-3xl p-6 sm:p-7 max-w-md w-full shadow-2xl space-y-5 text-white relative">
            {/* Close */}
            <button
              onClick={() => setShowRedeemModal(false)}
              className="absolute top-4 left-4 w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl bg-amber-500/20 text-amber-400 flex items-center justify-center border border-amber-500/30">
                <KeyRound className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-black text-white">تفعيل كود حصة السنتر</h3>
                <p className="text-xs text-slate-400">ينزل الكورس مباشرة في مكتبتك بمجرد إدخال الكود</p>
              </div>
            </div>

            <form onSubmit={handleRedeem} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1.5">
                  اكتب كود السنتر (المسلّم لك في القاعة)
                </label>
                <div className="relative">
                  <input
                    type="text"
                    required
                    autoFocus
                    placeholder="مثال: CNTR-XXXX-XXXX"
                    value={code}
                    onChange={(e) => setCode(e.target.value.toUpperCase())}
                    className="w-full px-4 py-3 bg-slate-950 border border-slate-700 focus:border-amber-500 rounded-2xl text-center text-base font-mono font-bold tracking-widest text-amber-400 outline-none transition-all placeholder:text-slate-600 placeholder:text-xs placeholder:font-sans placeholder:tracking-normal"
                  />
                  {resolving && (
                    <div className="absolute left-3 top-3.5">
                      <div className="w-4 h-4 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
                    </div>
                  )}
                </div>
              </div>

              {/* Live Preview Card */}
              {resolvedData && (
                <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/30 space-y-1.5 text-right animate-in fade-in">
                  <div className="flex items-center gap-1.5 text-amber-400 text-xs font-bold">
                    <Sparkles className="w-4 h-4" />
                    <span>تم التعرف على تفاصيل الكود بنجاح:</span>
                  </div>
                  <p className="text-sm font-black text-white">{resolvedData.courseTitle}</p>
                  <p className="text-xs text-slate-300">
                    👨‍🏫 الأستاذ: <span className="font-bold text-amber-200">{resolvedData.teacherName}</span>
                  </p>
                  <p className="text-[11px] text-slate-400">
                    🔓 النطاق: {resolvedData.scopeLabel}
                  </p>
                </div>
              )}

              {/* Feedback messages */}
              {activationSuccess && (
                <div className="p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-bold flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>{activationSuccess}</span>
                </div>
              )}

              {activationError && (
                <div className="p-3 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs font-bold flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{activationError}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={activating || !code.trim() || !!activationSuccess}
                className="w-full py-3.5 px-4 rounded-2xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-black text-sm shadow-xl transition-all disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer active:scale-98"
              >
                {activating ? (
                  <>
                    <div className="w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                    <span>جارٍ تفعيل الكورس...</span>
                  </>
                ) : activationSuccess ? (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    <span>تم التفعيل! جارٍ التحويل للمكتبة...</span>
                  </>
                ) : (
                  <>
                    <span>تفعيل الكورس وإضافته لمكتبتي</span>
                    <ArrowRight className="w-4 h-4 rotate-180" />
                  </>
                )}
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
