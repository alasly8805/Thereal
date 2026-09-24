"use client";

import React, { useState, useEffect, useCallback, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  ShieldAlert,
  ShieldCheck,
  RefreshCw,
  WifiOff,
  Smartphone,
  Laptop,
  ArrowRight,
  CheckCircle2,
  ExternalLink,
  Lock,
} from "lucide-react";

function VpnCheckContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectUrl = searchParams.get("redirect_url") || "/dashboard";

  const [isVpn, setIsVpn] = useState<boolean | null>(true);
  const [detectedIp, setDetectedIp] = useState<string>("127.0.0.1");
  const [isChecking, setIsChecking] = useState<boolean>(false);
  const [checkCount, setCheckCount] = useState<number>(0);
  const [feedbackMessage, setFeedbackMessage] = useState<string>("");
  const [isSuccessRedirecting, setIsSuccessRedirecting] = useState<boolean>(false);

  // Perform live VPN check against our security endpoint
  const verifyConnection = useCallback(
    async (isManual: boolean = false) => {
      if (isSuccessRedirecting) return;
      if (isManual) setIsChecking(true);

      try {
        const res = await fetch("/api/security/vpn-check", {
          method: "GET",
          cache: "no-store",
          headers: { "Cache-Control": "no-cache" },
        });
        const data = await res.json();

        setDetectedIp(data.ip || "127.0.0.1");
        setCheckCount((prev) => prev + 1);

        if (!data.isVpn) {
          setIsVpn(false);
          setFeedbackMessage("تم التحقق بنجاح! الاتصال مباشر وآمن.");
          setIsSuccessRedirecting(true);

          // Smooth redirect back to student's destination
          setTimeout(() => {
            router.push(redirectUrl);
          }, 1200);
        } else {
          setIsVpn(true);
          if (isManual) {
            setFeedbackMessage(
              "لا يزال تطبيق الـ VPN أو البروكسي قيد التشغيل. يرجى إيقافه تماماً ثم المحاولة مجدداً."
            );
          }
        }
      } catch {
        if (isManual) {
          setFeedbackMessage("تعذر فحص الاتصال حالياً، يرجى المحاولة مرة أخرى.");
        }
      } finally {
        if (isManual) {
          setTimeout(() => setIsChecking(false), 400);
        }
      }
    },
    [redirectUrl, router, isSuccessRedirecting]
  );

  // Initial check on mount
  useEffect(() => {
    verifyConnection(false);
  }, [verifyConnection]);

  // Periodic background auto-probe every 4 seconds to detect when student toggles VPN off
  useEffect(() => {
    if (!isVpn || isSuccessRedirecting) return;

    const intervalId = setInterval(() => {
      verifyConnection(false);
    }, 4000);

    return () => clearInterval(intervalId);
  }, [isVpn, isSuccessRedirecting, verifyConnection]);

  return (
    <div
      dir="rtl"
      className="min-h-screen bg-[#0b0f19] text-[#e2e8f0] flex flex-col justify-between selection:bg-sky-500/30 selection:text-white font-sans relative overflow-hidden"
    >
      {/* Background Atmosphere */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-10%] right-1/2 translate-x-1/2 w-[700px] h-[400px] bg-sky-950/20 rounded-full blur-[140px]" />
        <div className="absolute bottom-[-10%] left-[-10%] w-[500px] h-[500px] bg-indigo-950/20 rounded-full blur-[160px]" />
      </div>

      {/* Top Header */}
      <header className="relative z-10 w-full max-w-5xl mx-auto px-6 py-6 flex items-center justify-between">
        <Link
          href="/"
          className="flex items-center gap-3 group focus:outline-none focus:ring-2 focus:ring-sky-500/40 rounded-xl px-2 py-1"
        >
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-sky-500 to-blue-700 flex items-center justify-center shadow-lg shadow-sky-500/20">
            <Lock className="w-5 h-5 text-white" />
          </div>
          <div className="flex flex-col">
            <span className="text-xl font-black tracking-tight text-white group-hover:text-sky-400 transition-colors">
              Code-UP
            </span>
            <span className="text-[11px] text-[#94a3b8] font-medium">منصة Code-UP التعليمية</span>
          </div>
        </Link>

        {/* Security Shield Tag */}
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#1e293b] border border-white/10 text-xs font-semibold text-sky-400">
          <span className="w-2 h-2 rounded-full bg-sky-400 animate-pulse" />
          <span>بروتوكول الأمان وفحص الاتصال</span>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="relative z-10 w-full max-w-2xl mx-auto px-6 py-6 flex-1 flex flex-col justify-center items-center text-center">
        <div className="w-full bg-[#0f172a] border border-white/10 rounded-2xl p-6 sm:p-10 shadow-2xl space-y-8">
          {/* Visual Status Radar */}
          <div className="flex justify-center">
            <div className="relative">
              {isSuccessRedirecting ? (
                <div className="w-24 h-24 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shadow-xl shadow-emerald-500/10 transition-all scale-105">
                  <CheckCircle2 className="w-12 h-12 animate-bounce" />
                </div>
              ) : (
                <div className="relative flex items-center justify-center">
                  {/* Radar Pulse Effect */}
                  <div className="absolute inset-0 w-24 h-24 rounded-2xl bg-amber-500/20 animate-ping opacity-25" />
                  <div className="relative w-24 h-24 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 shadow-xl shadow-amber-500/10">
                    <ShieldAlert className="w-12 h-12" />
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Heading and Egyptian Context Description */}
          <div className="space-y-3">
            <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight leading-snug">
              {isSuccessRedirecting
                ? "تم تعطيل الـ VPN بنجاح!"
                : "تم رصد تشغيل تطبيق VPN أو بروكسي"}
            </h1>
            <p className="text-sm sm:text-base text-[#94a3b8] leading-relaxed max-w-lg mx-auto">
              {isSuccessRedirecting
                ? "اتصالك الآن مباشر ومؤمّن بالكامل. جارٍ نقلك إلى صفحة المحتوى الدراسي تلقائياً..."
                : "لحماية أمان حسابك ومنع مشاركة الجلسات التعليمية، لا تسمح المنصة بمشاهدة الدروس أثناء تفعيل برامج الـ VPN (مثل 1.1.1.1 Cloudflare WARP أو NordVPN أو أدوات تغيير الموقع)."}
            </p>
          </div>

          {/* Step by Step Action Guide */}
          {!isSuccessRedirecting && (
            <div className="bg-[#1e293b] border border-white/5 rounded-xl p-5 text-right space-y-4">
              <h2 className="text-xs font-bold text-sky-400 uppercase tracking-wider flex items-center gap-2">
                <Smartphone className="w-4 h-4" />
                <span>خطوات سريعة للمتابعة:</span>
              </h2>

              <div className="space-y-3 text-sm text-[#e2e8f0]">
                <div className="flex items-start gap-3">
                  <span className="w-6 h-6 rounded-full bg-sky-500/10 border border-sky-500/20 text-sky-400 font-bold text-xs flex items-center justify-center shrink-0 mt-0.5">
                    1
                  </span>
                  <p className="leading-relaxed">
                    افتح تطبيق الـ VPN أو إعدادات البروكسي على هاتفك أو حاسوبك (مثل{" "}
                    <strong className="text-white">Cloudflare 1.1.1.1</strong> أو{" "}
                    <strong className="text-white">WARP</strong>).
                  </p>
                </div>

                <div className="flex items-start gap-3">
                  <span className="w-6 h-6 rounded-full bg-sky-500/10 border border-sky-500/20 text-sky-400 font-bold text-xs flex items-center justify-center shrink-0 mt-0.5">
                    2
                  </span>
                  <p className="leading-relaxed">
                    اضغط على زر <strong className="text-amber-400">إيقاف الاتصال (Disconnect / Turn Off)</strong>.
                  </p>
                </div>

                <div className="flex items-start gap-3">
                  <span className="w-6 h-6 rounded-full bg-sky-500/10 border border-sky-500/20 text-sky-400 font-bold text-xs flex items-center justify-center shrink-0 mt-0.5">
                    3
                  </span>
                  <p className="leading-relaxed">
                    اضغط على زر <strong className="text-sky-400">"فحص الاتصال والمتابعة"</strong> بالأسفل أو انتظر ثوانٍ وسيتم إدخالك تلقائياً.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Connection Details Pill */}
          <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 bg-black/30 border border-white/5 rounded-xl text-xs">
            <div className="flex items-center gap-2 text-[#94a3b8]">
              <span>عنوان IP المكتشف:</span>
              <code className="bg-[#1e293b] px-2 py-0.5 rounded text-white font-mono font-bold">
                {detectedIp}
              </code>
            </div>

            <div className="flex items-center gap-1.5">
              {isSuccessRedirecting ? (
                <span className="inline-flex items-center gap-1.5 text-emerald-400 font-bold">
                  <span className="w-2 h-2 rounded-full bg-emerald-400" />
                  اتصال نظيف ومباشر
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 text-amber-400 font-bold">
                  <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                  تطبيق VPN نشط
                </span>
              )}
            </div>
          </div>

          {/* Feedback Message */}
          {feedbackMessage && !isSuccessRedirecting && (
            <div
              role="alert"
              className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl text-xs font-semibold text-amber-300 text-center animate-fadeIn"
            >
              {feedbackMessage}
            </div>
          )}

          {/* Action CTAs */}
          <div className="space-y-3 pt-2">
            {!isSuccessRedirecting ? (
              <>
                <button
                  type="button"
                  onClick={() => verifyConnection(true)}
                  disabled={isChecking}
                  className="w-full py-3.5 px-6 bg-[#2563eb] hover:bg-[#1d4ed8] active:scale-[0.98] disabled:opacity-50 text-white font-bold text-base rounded-xl transition-all shadow-lg shadow-blue-600/20 flex items-center justify-center gap-2 cursor-pointer"
                >
                  <RefreshCw className={`w-5 h-5 ${isChecking ? "animate-spin" : ""}`} />
                  <span>{isChecking ? "جارٍ فحص الاتصال..." : "فحص الاتصال والمتابعة الآن"}</span>
                </button>

                <div className="flex items-center justify-center gap-4 text-xs text-[#94a3b8]">
                  <Link
                    href="/dashboard"
                    className="hover:text-white transition-colors py-2 px-3 rounded-lg hover:bg-white/5 flex items-center gap-1"
                  >
                    <span>العودة للرئيسية</span>
                    <ArrowRight className="w-3.5 h-3.5" style={{ transform: "scaleX(-1)" }} />
                  </Link>
                </div>
              </>
            ) : (
              <div className="w-full py-3.5 px-6 bg-emerald-600 text-white font-bold text-base rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/20">
                <CheckCircle2 className="w-5 h-5" />
                <span>جارٍ فتح المحتوى الدراسي...</span>
              </div>
            )}
          </div>
        </div>

        {/* Live Auto-Check Hint */}
        <p className="text-xs text-[#64748b] mt-6 flex items-center justify-center gap-1.5">
          <RefreshCw className="w-3 h-3 animate-spin text-sky-500/60" />
          <span>يتم فحص اتصالك تلقائياً كل بضع ثوانٍ بمجرد إغلاق الـ VPN</span>
        </p>
      </main>

      {/* Footer */}
      <footer className="relative z-10 w-full max-w-5xl mx-auto px-6 py-6 text-center text-xs text-[#64748b] border-t border-white/5">
        <p>© {new Date().getFullYear()} منصة Code-UP التعليمية — جميع الحقوق محفوظة</p>
      </footer>
    </div>
  );
}

export default function VpnCheckPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#0b0f19] flex items-center justify-center text-white">
          <div className="w-8 h-8 rounded-full border-2 border-sky-400/30 border-t-sky-400 animate-spin" />
        </div>
      }
    >
      <VpnCheckContent />
    </Suspense>
  );
}
