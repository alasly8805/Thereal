"use client";

import { useEffect, useState, useMemo, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { SecurePlayer } from "@/components/ui/SecurePlayer";
import { VideoGuard } from "@/components/ui/VideoGuard";
import type { DeviceDrmInfo } from "@/components/ui/DrmPlayer";
import { AXINOM_CONFIG, SAME_ORIGIN_LICENSE_SERVERS } from "@/lib/axinom-config";

function DrmPreviewContent() {
  const searchParams = useSearchParams();

  const assetId = searchParams.get("assetId") || "";
  const token = searchParams.get("token") || "";
  const title = searchParams.get("title") || "معاينة درس مشفر";
  const exp = searchParams.get("exp") || "";

  const [copied, setCopied] = useState(false);
  const [timeLeft, setTimeLeft] = useState<string>("02:00:00");
  const [isExpired, setIsExpired] = useState(false);
  const [fullUrl, setFullUrl] = useState<string>("");
  const [detectedDrm, setDetectedDrm] = useState<DeviceDrmInfo | null>(null);

  const isAxinomDemo =
    assetId === "axinom_demo" ||
    assetId === "axinom_test" ||
    assetId === "axinom_test_singlekey" ||
    assetId === "axinom_widevine_test";

  const isClearDemo = assetId === "axinom_clear" || assetId === "clear_demo";

  const AXINOM_DEMO_TOKEN =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ2ZXJzaW9uIjoxLCJjb21fa2V5X2lkIjoiYjMzNjRlYjUtNTFmNi00YWUzLThjOTgtMzNjZWQ1ZTMxYzc4IiwibWVzc2FnZSI6eyJ0eXBlIjoiZW50aXRsZW1lbnRfbWVzc2FnZSIsInZlcnNpb24iOjIsImxpY2Vuc2UiOnsiYWxsb3dfcGVyc2lzdGVuY2UiOnRydWV9LCJjb250ZW50X2tleXNfc291cmNlIjp7ImlubGluZSI6W3siaWQiOiI5ZWI0MDUwZC1lNDRiLTQ4MDItOTMyZS0yN2Q3NTA4M2UyNjYiLCJlbmNyeXB0ZWRfa2V5IjoibEszT2pITFlXMjRjcjJrdFI3NGZudz09IiwidXNhZ2VfcG9saWN5IjoiUG9saWN5IEEifV19LCJjb250ZW50X2tleV91c2FnZV9wb2xpY2llcyI6W3sibmFtZSI6IlBvbGljeSBBIiwicGxheXJlYWR5Ijp7Im1pbl9kZXZpY2Vfc2VjdXJpdHlfbGV2ZWwiOjE1MCwicGxheV9lbmFibGVycyI6WyI3ODY2MjdEOC1DMkE2LTQ0QkUtOEY4OC0wOEFFMjU1QjAxQTciXX19XX19.W2FbPDSDaq-LeeLfOnbpTMa-zCmXh8RLChEVDYvdcVw";

  const [activeToken, setActiveToken] = useState(token || (isAxinomDemo ? AXINOM_DEMO_TOKEN : ""));
  const [activeManifestUrl, setActiveManifestUrl] = useState(
    isClearDemo
      ? "https://media.axprod.net/TestVectors/v7-Clear/Manifest_1080p.mpd"
      : isAxinomDemo
      ? "https://media.axprod.net/TestVectors/v7-MultiDRM-SingleKey/Manifest_1080p.mpd"
      : ""
  );
  const [activeLicenseServers, setActiveLicenseServers] = useState<{
    widevine?: string;
    playready?: string;
    fairplay?: string;
  } | null>(
    isAxinomDemo
      ? {
          widevine: SAME_ORIGIN_LICENSE_SERVERS.widevine,
          playready: SAME_ORIGIN_LICENSE_SERVERS.playready,
          fairplay: SAME_ORIGIN_LICENSE_SERVERS.fairplay,
        }
      : null
  );
  const [tokenLoading, setTokenLoading] = useState(!token && !isAxinomDemo && !isClearDemo);

  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    if (assetId) url.searchParams.set("assetId", assetId);
    if (title) url.searchParams.set("title", title);
    const tok = activeToken || token;
    if (tok) url.searchParams.set("token", tok);
    if (exp) url.searchParams.set("exp", exp);
    setFullUrl(url.toString());
  }, [assetId, title, token, activeToken, exp]);

  useEffect(() => {
    if (isClearDemo) {
      setActiveToken("");
      setActiveManifestUrl("https://media.axprod.net/TestVectors/v7-Clear/Manifest_1080p.mpd");
      setActiveLicenseServers(null);
      setTokenLoading(false);
      setAuthError(null);
      return;
    }

    if (isAxinomDemo) {
      setActiveToken(token || AXINOM_DEMO_TOKEN);
      setActiveManifestUrl("https://media.axprod.net/TestVectors/v7-MultiDRM-SingleKey/Manifest_1080p.mpd");
      setActiveLicenseServers({
        widevine: SAME_ORIGIN_LICENSE_SERVERS.widevine,
        playready: SAME_ORIGIN_LICENSE_SERVERS.playready,
        fairplay: SAME_ORIGIN_LICENSE_SERVERS.fairplay,
      });
      setTokenLoading(false);
      setAuthError(null);
      return;
    }

    if (token) {
      setActiveToken(token);
      setActiveLicenseServers({
        widevine: SAME_ORIGIN_LICENSE_SERVERS.widevine,
        playready: SAME_ORIGIN_LICENSE_SERVERS.playready,
        fairplay: SAME_ORIGIN_LICENSE_SERVERS.fairplay,
      });
      setTokenLoading(false);
      setAuthError(null);
      return;
    }

    if (!assetId) {
      setTokenLoading(false);
      return;
    }

    let isMounted = true;
    setTokenLoading(true);
    setAuthError(null);
    fetch("/api/teacher/drm-preview", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assetId, title }),
    })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          if (res.status === 401 || res.status === 403) {
            throw new Error("تحتاج لتسجيل الدخول بحساب المعلم أو المشرف لعرض هذه المعاينة، أو استخدام الرابط الكامل المزوّد بالتوكن.");
          }
          throw new Error(data.error || "تعذر إنشاء جلسة ترخيص DRM");
        }
        return data;
      })
      .then((data) => {
        if (!isMounted) return;
        if (data.success && data.drm) {
          if (data.drm.token) setActiveToken(data.drm.token);
          if (data.drm.licenseServers) setActiveLicenseServers(data.drm.licenseServers);
          if (data.manifestUrl) setActiveManifestUrl(data.manifestUrl);
          if (typeof data.previewUrl === "string" && data.previewUrl) {
            setFullUrl(data.previewUrl);
            try {
              const parsed = new URL(data.previewUrl, window.location.origin);
              window.history.replaceState({}, "", parsed.pathname + parsed.search);
            } catch {
              // keep current address if the server URL cannot be parsed
            }
          }
        } else if (data.error) {
          setAuthError(data.error);
        }
      })
      .catch((e: any) => {
        if (!isMounted) return;
        setAuthError(e.message || "حدث خطأ أثناء تحميل بيانات الترخيص");
      })
      .finally(() => {
        if (isMounted) setTokenLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [assetId, token, title, isAxinomDemo, isClearDemo]);

  // Expiration countdown
  useEffect(() => {
    let targetTime = 0;
    if (exp) {
      if (/^\d+$/.test(exp)) {
        const num = Number(exp);
        targetTime = num > 1e11 ? num : num * 1000;
      } else {
        const parsed = new Date(decodeURIComponent(exp)).getTime();
        if (!isNaN(parsed) && parsed > 0) {
          targetTime = parsed;
        }
      }
    }
    // Fallback: 2 hours from now if exp is missing or invalid
    if (!targetTime || isNaN(targetTime) || targetTime <= Date.now() - 60000) {
      targetTime = Date.now() + 2 * 60 * 60 * 1000;
    }

    const updateTimer = () => {
      const now = Date.now();
      const diff = targetTime - now;

      if (diff <= 0) {
        setTimeLeft("انتهت صلاحية الجلسة");
        setIsExpired(true);
        return;
      }

      setIsExpired(false);
      const hours = Math.floor(diff / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);

      setTimeLeft(
        `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
      );
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [exp]);

  const isDirectStream = assetId.startsWith("gdrive_") || assetId.startsWith("local_");

  const embedUrl = useMemo(() => {
    if (!assetId) return "";
    if (isClearDemo) {
      return "https://media.axprod.net/TestVectors/v7-Clear/Manifest_1080p.mpd";
    }
    if (isAxinomDemo) {
      return "https://media.axprod.net/TestVectors/v7-MultiDRM-SingleKey/Manifest_1080p.mpd";
    }
    if (activeManifestUrl) return activeManifestUrl;
    if (isDirectStream) {
      return `/api/videos/stream/${encodeURIComponent(assetId)}`;
    }
    return `/api/videos/drm/${encodeURIComponent(assetId)}/manifest.mpd`;
  }, [assetId, isDirectStream, activeManifestUrl, isAxinomDemo, isClearDemo]);

  const drmConfig = useMemo(() => {
    if (isClearDemo) return undefined;

    if (isAxinomDemo) {
      return {
        token: activeToken || AXINOM_DEMO_TOKEN,
        licenseServers: {
          widevine: SAME_ORIGIN_LICENSE_SERVERS.widevine,
          playready: SAME_ORIGIN_LICENSE_SERVERS.playready,
          fairplay: SAME_ORIGIN_LICENSE_SERVERS.fairplay,
        },
      };
    }

    const finalToken = activeToken || token;
    if (!finalToken && !isDirectStream) return undefined;

    const servers =
      activeLicenseServers ||
      {
        widevine: SAME_ORIGIN_LICENSE_SERVERS.widevine,
        playready: SAME_ORIGIN_LICENSE_SERVERS.playready,
        fairplay: SAME_ORIGIN_LICENSE_SERVERS.fairplay,
      };

    return {
      token: finalToken,
      licenseServers: servers,
    };
  }, [activeToken, token, activeLicenseServers, isAxinomDemo, isClearDemo, isDirectStream]);


  const handleCopyUrl = () => {
    if (fullUrl) {
      navigator.clipboard.writeText(fullUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    }
  };

  if (!assetId) {
    return (
      <div className="min-h-screen bg-[#0b0f19] text-white flex items-center justify-center p-4" dir="rtl">
        <div className="max-w-md w-full p-8 rounded-2xl bg-[#131b2e] border border-white/10 text-center space-y-4 shadow-2xl">
          <span className="text-4xl">⚠️</span>
          <h2 className="text-lg font-black text-white">رابط المعاينة غير مكتمل</h2>
          <p className="text-xs text-gray-400 leading-relaxed">
            لم يتم تحديد معرّف الفيديو المطلوب للمعاينة. يرجى الرجوع للوحة التحكم وبدء المعاينة مجدداً.
          </p>
          <Link
            href="/adminpanel/teacher"
            className="inline-block px-5 py-2.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-white text-xs font-bold transition-all shadow-lg shadow-sky-500/20"
          >
            العودة للوحة المعلم ↗
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#070b14] text-white flex flex-col selection:bg-sky-500 selection:text-white" dir="rtl">
      {/* Header */}
      <header className="border-b border-white/10 bg-[#0d1424]/90 backdrop-blur-md sticky top-0 z-40 px-4 py-3">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Link
              href="/adminpanel/teacher"
              className="px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white text-xs font-bold border border-white/10 transition-all flex items-center gap-1.5"
            >
              <span>←</span>
              <span>لوحة المعلم</span>
            </Link>
            <Link
              href="/preview"
              className="px-3 py-1.5 rounded-xl bg-purple-600/20 hover:bg-purple-600/30 text-purple-300 text-xs font-bold border border-purple-500/30 transition-all flex items-center gap-1.5"
            >
              <span>🛡️ بوابة فحص CTO</span>
            </Link>
            <div className="h-4 w-px bg-white/10 hidden sm:block" />
            <div>
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-0.5 rounded text-xs font-black bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                  TOPTEIR
                </span>
                <span className="text-xs text-gray-400 font-mono hidden md:inline">Asset: {assetId}</span>
              </div>
              <h1 className="text-sm sm:text-base font-black text-white truncate max-w-md sm:max-w-xl">{title}</h1>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Quick Test Switcher for Brave / Chrome */}
            {(isAxinomDemo || isClearDemo) && (
              <div className="flex items-center gap-1 bg-white/5 p-1 rounded-xl border border-white/10">
                <Link
                  href="/preview/drm?assetId=axinom_demo&title=Axinom+Widevine+Test"
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all ${
                    isAxinomDemo
                      ? "bg-sky-500 text-white shadow-sm"
                      : "text-gray-400 hover:text-white"
                  }`}
                >
                  🛡️ Widevine DRM
                </Link>
                <Link
                  href="/preview/drm?assetId=axinom_clear&title=Shaka+Clear+DASH+Test"
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all ${
                    isClearDemo
                      ? "bg-sky-500 text-white shadow-sm"
                      : "text-gray-400 hover:text-white"
                  }`}
                >
                  ⚡ Shaka Clear (Brave Friendly)
                </Link>
              </div>
            )}

            {/* Live Expiration Badge */}
            <div className={`px-3 py-1.5 rounded-xl border text-xs font-bold flex items-center gap-2 ${
              isExpired
                ? "bg-rose-500/10 border-rose-500/30 text-rose-400"
                : "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
            }`}>
              <span className="animate-pulse">{isExpired ? "🔴" : "🟢"}</span>
              <span className="text-[11px] text-gray-400">صلاحية المعاينة:</span>
              <span className="font-mono font-bold tracking-wider">{timeLeft}</span>
            </div>

            {/* Copy Full URL button */}
            <button
              type="button"
              onClick={handleCopyUrl}
              className="px-3 py-1.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-white text-xs font-bold transition-all shadow-md flex items-center gap-1.5 cursor-pointer"
            >
              <span>{copied ? "✓ تم النسخ!" : "📋 نسخ رابط المعاينة (2h)"}</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Preview Cinema Player Stage */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 space-y-6">
        <div className="relative rounded-2xl overflow-hidden border border-white/10 bg-black shadow-2xl aspect-video w-full max-h-[75vh]">
          {authError && !activeToken ? (
            <div className="w-full h-full flex flex-col items-center justify-center p-6 text-center space-y-3 bg-black/95">
              <span className="text-4xl">🔒</span>
              <h3 className="text-base font-bold text-white">تسجيل الدخول بحساب المعلم مطلوب</h3>
              <p className="text-xs text-gray-400 max-w-md leading-relaxed">{authError}</p>
              <div className="flex items-center gap-3 pt-2">
                <Link
                  href={`/login?redirect=${encodeURIComponent(fullUrl || `/preview/drm?assetId=${assetId}`)}`}
                  className="px-5 py-2 rounded-xl bg-sky-500 hover:bg-sky-400 text-white text-xs font-bold transition-all shadow-md"
                >
                  تسجيل الدخول للمنصة ↗
                </Link>
                <Link
                  href="/adminpanel/teacher"
                  className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-gray-300 text-xs font-bold transition-all"
                >
                  لوحة تحكم المعلم
                </Link>
              </div>
            </div>
          ) : isExpired ? (
            <div className="w-full h-full flex flex-col items-center justify-center p-6 text-center space-y-3 bg-black/90">
              <span className="text-4xl">⏳</span>
              <h3 className="text-base font-bold text-white">انتهت فترة المعاينة المحددة (ساعتان)</h3>
              <p className="text-xs text-gray-400 max-w-md">
                لقد انتهت صلاحية توكن المعاينة الأمني. يمكنك توليد رابط معاينة جديد في أي وقت من لوحة تحكم المعلم.
              </p>
              <Link
                href="/adminpanel/teacher"
                className="px-4 py-2 rounded-xl bg-sky-500 hover:bg-sky-400 text-white text-xs font-bold transition-all"
              >
                العودة للوحة التحكم
              </Link>
            </div>
          ) : tokenLoading && !isDirectStream ? (
            <div className="w-full h-full flex flex-col items-center justify-center space-y-3 bg-black">
              <div className="w-10 h-10 rounded-full border-4 border-sky-500/20 border-t-sky-500 animate-spin" />
            </div>
          ) : (
            <VideoGuard
              studentName="معاينة المعلم (Teacher Preview)"
              studentPhone="01012345678"
              videoId={assetId}
            >
              <SecurePlayer
                embedUrl={embedUrl}
                provider={isDirectStream ? "alasly" : "axinom"}
                drm={drmConfig}
                title={title}
                watermark="معاينة المعلم • 01012345678"
                onDrmDetected={setDetectedDrm}
              />
            </VideoGuard>
          )}
        </div>

        {/* Video Diagnostics & Health Monitor Panel */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-4 rounded-2xl bg-[#0f172a] border border-white/5 space-y-1.5">
            <div className="flex items-center justify-between text-xs text-gray-400 font-bold">
              <span>الحماية</span>
              <span className="text-emerald-400 font-bold">TOPTEIR</span>
            </div>
            <p className="text-sm font-mono text-gray-200 font-bold">
              {detectedDrm ? detectedDrm.name : "TOPTEIR CENC + Widevine"}
            </p>
            <p className="text-[10px] text-gray-500 leading-relaxed">
              التشفير كامل. Brave على الكمبيوتر يشغّل جودة SD المحمية؛ الأجهزة العتادية تشغّل HD.
            </p>
          </div>


          <div className="p-4 rounded-2xl bg-[#0f172a] border border-white/5 space-y-1.5">
            <div className="flex items-center justify-between text-xs text-gray-400 font-bold">
              <span>خادم الرخص والتوكن</span>
              <span className="text-emerald-400">Active (2h Token)</span>
            </div>
            <p className="text-xs font-mono text-gray-300 truncate">
              Kid: {isAxinomDemo ? "b3364eb5-51f6-4ae3-8c98-33ced5e31c78" : AXINOM_CONFIG.communicationKeyId}
            </p>
            <p className="text-[10px] text-gray-500">توكن ترخيص آمن صالح لمدة ساعتين كاملتين للتجربة.</p>
          </div>

          <div className="p-4 rounded-2xl bg-[#0f172a] border border-white/5 space-y-1.5">
            <div className="flex items-center justify-between text-xs text-gray-400 font-bold">
              <span>جاهزية الاعتماد</span>
              <span className="text-blue-400">Ready to Publish</span>
            </div>
            <p className="text-xs text-gray-300">يمكنك الآن إضافته لمحاضرات الكورس بأمان.</p>
            <Link
              href="/adminpanel/teacher"
              className="text-[11px] text-sky-400 hover:text-sky-300 font-bold inline-flex items-center gap-1"
            >
              <span>الذهاب لربطه بالمحاضرة</span>
              <span>←</span>
            </Link>
          </div>
        </div>

        {/* Full URL Box for external device testing */}
        <div className="p-4 rounded-2xl bg-[#0f172a] border border-white/5 space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold text-gray-300 flex items-center gap-1.5">
              <span>🔗</span> رابط المعاينة المستقل (Brave / Chrome / الهاتف — ساعتان، الحماية كما هي):
            </label>
            <button
              type="button"
              onClick={handleCopyUrl}
              className="text-[11px] text-sky-400 hover:text-sky-300 font-bold cursor-pointer"
            >
              {copied ? "✓ تم النسخ بنجاح" : "📋 نسخ الرابط"}
            </button>
          </div>
          <div className="bg-black/50 border border-white/10 rounded-xl p-2.5 font-mono text-xs text-sky-300 break-all select-all text-left" dir="ltr">
            {fullUrl || "جاري توليد الرابط..."}
          </div>
        </div>
      </main>
    </div>
  );
}

export default function DrmPreviewPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#070b14] text-white flex items-center justify-center">جاري تحميل مشغل المعاينة...</div>}>
      <DrmPreviewContent />
    </Suspense>
  );
}
