 "use client";

import React, { useState, useEffect, useCallback, useMemo, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import {
  ShieldCheck,
  ShieldAlert,
  Lock,
  Eye,
  Key,
  Layers,
  Cpu,
  MonitorCheck,
  Check,
  RefreshCw,
  ExternalLink,
  Upload,
  UploadCloud,
  FileVideo,
  CheckCircle,
  Download,
  Link as LinkIcon,
} from "lucide-react";
import { SecurePlayer } from "@/components/ui/SecurePlayer";
import { VideoWatermark } from "@/components/ui/VideoWatermark";
import { SAME_ORIGIN_LICENSE_SERVERS } from "@/lib/axinom-config";

// ── EME Capability Probes ───────────────────────────────────────────────────
interface Probe {
  label: string;
  keySystem: string;
  videoRobustness: string;
  audioRobustness: string;
  hardware: boolean;
  note: string;
}

const PROBES: Probe[] = [
  {
    label: "Widevine L1 (Hardware Protected)",
    keySystem: "com.widevine.alpha",
    videoRobustness: "HW_SECURE_ALL",
    audioRobustness: "HW_SECURE_CRYPTO",
    hardware: true,
    note: "مدعوم على هواتف Android ومعظم منصات التلفزيون والأجهزة المحمولة المعتمدة. يعتم الشاشة عند التسجيل.",
  },
  {
    label: "Widevine L3 (Software Protected)",
    keySystem: "com.widevine.alpha",
    videoRobustness: "SW_SECURE_DECODE",
    audioRobustness: "SW_SECURE_CRYPTO",
    hardware: false,
    note: "المتصفحات المكتبية الافتراضية (Chrome, Brave, Firefox على Windows). محمي بالتشفير والعلامة المائية الجنائية.",
  },
  {
    label: "PlayReady SL3000 (Hardware .3000 KeySystem)",
    keySystem: "com.microsoft.playready.recommendation.3000",
    videoRobustness: "3000",
    audioRobustness: "3000",
    hardware: true,
    note: "متصفح Microsoft Edge على أنظمة Windows المزودة ببطاقات شاشة ومعالجات داعمة لمسار العرض المحمي.",
  },
  {
    label: "PlayReady SL3000 (Hardware Recommendation + Robustness)",
    keySystem: "com.microsoft.playready.recommendation",
    videoRobustness: "3000",
    audioRobustness: "3000",
    hardware: true,
    note: "الصيغة القياسية الشائعة في إصدارات Edge الحديثة لتفعيل فك التشفير العتادي وتعتيم التسجيلات.",
  },
  {
    label: "PlayReady SL2000 (Software Level)",
    keySystem: "com.microsoft.playready",
    videoRobustness: "2000",
    audioRobustness: "2000",
    hardware: false,
    note: "مستوى برمجيات PlayReady في بيئات سطح المكتب دون مسار وسائط محمي.",
  },
  {
    label: "Apple FairPlay Streaming",
    keySystem: "com.apple.fps.1_0",
    videoRobustness: "",
    audioRobustness: "",
    hardware: true,
    note: "متصفح Safari على أجهزة Apple macOS و iOS / iPadOS. محمي عتادياً بالكامل.",
  },
];

async function probeKeySystem(entry: Probe): Promise<boolean> {
  if (typeof navigator === "undefined" || !navigator.requestMediaKeySystemAccess) return false;
  try {
    await navigator.requestMediaKeySystemAccess(entry.keySystem, [
      {
        initDataTypes: ["cenc", "sinf", "skd"],
        videoCapabilities: [
          {
            contentType: 'video/mp4; codecs="avc1.42E01E"',
            ...(entry.videoRobustness ? { robustness: entry.videoRobustness } : {}),
          },
        ],
        audioCapabilities: [
          {
            contentType: 'audio/mp4; codecs="mp4a.40.2"',
            ...(entry.audioRobustness ? { robustness: entry.audioRobustness } : {}),
          },
        ],
      },
    ]);
    return true;
  } catch {
    return false;
  }
}

// ── Official Axinom Multi-DRM Test Vectors ──────────────────────────────────
const AXINOM_DEMO_TOKEN =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ2ZXJzaW9uIjoxLCJjb21fa2V5X2lkIjoiYjMzNjRlYjUtNTFmNi00YWUzLThjOTgtMzNjZWQ1ZTMxYzc4IiwibWVzc2FnZSI6eyJ0eXBlIjoiZW50aXRsZW1lbnRfbWVzc2FnZSIsInZlcnNpb24iOjIsImxpY2Vuc2UiOnsiYWxsb3dfcGVyc2lzdGVuY2UiOnRydWV9LCJjb250ZW50X2tleXNfc291cmNlIjp7ImlubGluZSI6W3siaWQiOiI5ZWI0MDUwZC1lNDRiLTQ4MDItOTMyZS0yN2Q3NTA4M2UyNjYiLCJlbmNyeXB0ZWRfa2V5IjoibEszT2pITFlXMjRjcjJrdFI3NGZudz09IiwidXNhZ2VfcG9saWN5IjoiUG9saWN5IEEifV19LCJjb250ZW50X2tleV91c2FnZV9wb2xpY2llcyI6W3sibmFtZSI6IlBvbGljeSBBIiwicGxheXJlYWR5Ijp7Im1pbl9kZXZpY2Vfc2VjdXJpdHlfbGV2ZWwiOjE1MCwicGxheV9lbmFibGVycyI6WyI3ODY2MjdEOC1DMkE2LTQ0QkUtOEY4OC0wOEFFMjU1QjAxQTciXX19XX19.W2FbPDSDaq-LeeLfOnbpTMa-zCmXh8RLChEVDYvdcVw";

function PreviewDashboardContent() {
  const searchParams = useSearchParams();
  const urlAssetId = searchParams.get("assetId") || "";
  const urlToken = searchParams.get("token") || "";
  const urlTitle = searchParams.get("title") || "";
  const urlProvider = searchParams.get("provider") || "";

  // ── Auth Gate State (Checks preview/staff auth on mount) ─────────────────
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [passwordInput, setPasswordInput] = useState("");
  const [authError, setAuthError] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(false);

  // ── Navigation & Provider Tabs ─────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<"axinom" | "vdocipher" | "capabilities" | "watermark">(
    urlProvider === "vdocipher" ? "vdocipher" : "axinom"
  );
  const [axinomMode, setAxinomMode] = useState<"encrypted" | "clear" | "custom">(
    urlAssetId && urlAssetId !== "axinom_demo" && urlAssetId !== "axinom_clear"
      ? "custom"
      : urlAssetId === "axinom_clear"
      ? "clear"
      : "encrypted"
  );

  // ── Custom Axinom Asset State ──────────────────────────────────────────────
  const [customAssetId, setCustomAssetId] = useState(urlAssetId || "axinom_demo");
  const [customToken, setCustomToken] = useState(urlToken || "");
  const [customTitle, setCustomTitle] = useState(urlTitle || "معاينة درس مشفر (CTO / Teacher)");
  const [isGeneratingToken, setIsGeneratingToken] = useState(false);

  // ── VdoCipher Asset & OTP State ────────────────────────────────────────────
  const [vdoAssetId, setVdoAssetId] = useState(urlProvider === "vdocipher" ? urlAssetId : "");
  const [vdoEmbedUrl, setVdoEmbedUrl] = useState("");
  const [vdoOtpData, setVdoOtpData] = useState<{ otp: string; playbackInfo: string; expiresInSeconds: number } | null>(null);
  const [vdoOtpExpiry, setVdoOtpExpiry] = useState<number | null>(null);
  const [vdoTimeLeft, setVdoTimeLeft] = useState<number>(0);
  const [isGeneratingVdoOtp, setIsGeneratingVdoOtp] = useState(false);
  const [vdoError, setVdoError] = useState<string | null>(null);

  // ── VdoCipher Upload & Google Drive Import State ───────────────────────────
  const [vdoUploadMode, setVdoUploadMode] = useState<"file" | "gdrive">("file");
  const [isUploadingVdo, setIsUploadingVdo] = useState(false);
  const [vdoUploadProgress, setVdoUploadProgress] = useState(0);
  const [vdoUploadStatus, setVdoUploadStatus] = useState("");
  const [vdoUploadSuccess, setVdoUploadSuccess] = useState<string | null>(null);

  const [gdriveUrl, setGdriveUrl] = useState("");
  const [isImportingGdrive, setIsImportingGdrive] = useState(false);
  const [gdriveStatus, setGdriveStatus] = useState("");

  // ── EME Capabilities Probe State ───────────────────────────────────────────
  const [probeResults, setProbeResults] = useState<Record<string, "checking" | "yes" | "no">>({});
  const [isSecureContext, setIsSecureContext] = useState<boolean | null>(null);
  const [probingRunning, setProbingRunning] = useState(false);

  // ── Watermark Lab Customization ────────────────────────────────────────────
  const [testWatermarkLabel, setTestWatermarkLabel] = useState(
    "Code-UP • Student: 01012345678 • Session: #9401"
  );
  const [customGridOpacity, setCustomGridOpacity] = useState(0.06);

  // ── VdoCipher OTP Countdown Timer ───────────────────────────────────────────
  useEffect(() => {
    if (!vdoOtpExpiry) {
      setVdoTimeLeft(0);
      return;
    }
    const updateCountdown = () => {
      const remaining = Math.max(0, Math.floor((vdoOtpExpiry - Date.now()) / 1000));
      setVdoTimeLeft(remaining);
      if (remaining <= 0) {
        setVdoOtpExpiry(null);
      }
    };
    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, [vdoOtpExpiry]);

  // ── Check Auth status on mount ─────────────────────────────────────────────
  useEffect(() => {
    fetch("/api/preview/auth", { method: "GET", credentials: "include" })
      .then((res) => res.json())
      .then((data) => {
        setIsAuthenticated(!!data?.authorized);
      })
      .catch(() => {
        setIsAuthenticated(false);
      });
  }, []);

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthLoading(true);
    setAuthError(null);

    try {
      const res = await fetch("/api/preview/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ password: passwordInput }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setIsAuthenticated(true);
        if (typeof window !== "undefined") {
          localStorage.setItem("codeup_preview_unlocked", "true");
        }
      } else {
        setAuthError(data.error || "كلمة المرور غير صحيحة");
      }
    } catch {
      setAuthError("تعذر الاتصال بخادم التحقق");
    } finally {
      setAuthLoading(false);
    }
  };

  // ── Run Hardware Capabilities Probe ────────────────────────────────────────
  const runProbe = useCallback(async () => {
    if (typeof window === "undefined") return;
    setIsSecureContext(window.isSecureContext);
    setProbingRunning(true);
    setProbeResults(Object.fromEntries(PROBES.map((p) => [p.label, "checking"])));

    for (const entry of PROBES) {
      const ok = await probeKeySystem(entry);
      setProbeResults((prev) => ({ ...prev, [entry.label]: ok ? "yes" : "no" }));
    }
    setProbingRunning(false);
  }, []);

  useEffect(() => {
    if (isAuthenticated) {
      runProbe();
    }
  }, [isAuthenticated, runProbe]);

  // ── Auto-generate Token for Custom Axinom Asset ───────────────────────────
  const generatePreviewToken = useCallback(async (assetIdToSign: string) => {
    if (!assetIdToSign || assetIdToSign === "axinom_demo" || assetIdToSign === "axinom_clear") return;
    setIsGeneratingToken(true);
    try {
      const res = await fetch("/api/teacher/drm-preview", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assetId: assetIdToSign, title: customTitle, provider: "axinom" }),
      });
      const data = await res.json();
      if (res.ok && data.success && data.drm?.token) {
        setCustomToken(data.drm.token);
      }
    } catch (e) {
      console.warn("Token generation notice:", e);
    } finally {
      setIsGeneratingToken(false);
    }
  }, [customTitle]);

  // ── Generate Dynamic OTP for VdoCipher Asset ──────────────────────────────
  const generateVdoCipherOtp = useCallback(async (videoIdToSign: string) => {
    const trimmedId = videoIdToSign.trim();
    if (!trimmedId) {
      setVdoError("يرجى إدخال معرّف فيديو VdoCipher (Video ID) أو رفع فيديو جديد");
      return;
    }
    setIsGeneratingVdoOtp(true);
    setVdoError(null);
    try {
      const res = await fetch("/api/teacher/drm-preview", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assetId: trimmedId,
          provider: "vdocipher",
          watermarkText: testWatermarkLabel,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success && data.embedUrl) {
        setVdoEmbedUrl(data.embedUrl);
        setVdoOtpData({
          otp: data.otp,
          playbackInfo: data.playbackInfo,
          expiresInSeconds: data.expiresInSeconds || 120,
        });
        setVdoOtpExpiry(Date.now() + (data.expiresInSeconds || 120) * 1000);
      } else {
        setVdoError(data.error || "تعذر توليد رمز تشغيل VdoCipher");
      }
    } catch (e: any) {
      setVdoError(e.message || "حدث خطأ أثناء الاتصال بالخادم");
    } finally {
      setIsGeneratingVdoOtp(false);
    }
  }, [testWatermarkLabel]);

  // ── Direct File Upload to VdoCipher (S3 Direct Upload with Live Progress) ───
  // Upload through our same-origin proxy so the browser never talks directly
  // to VdoCipher's S3 endpoint (which is blocked by CORS on many deployments).
  const handleVdoDirectUpload = async (file: File) => {
    if (!file) return;
    setIsUploadingVdo(true);
    setVdoUploadProgress(0);
    setVdoError(null);
    setVdoUploadSuccess(null);
    setVdoUploadStatus("جارٍ رفع الفيديو إلى الخادم الآمن...");

    try {
      const formData = new FormData();
      formData.append("file", file, file.name);
      formData.append("title", file.name.replace(/\.[^/.]+$/, "") || "معاينة درس مشفر");

      const result = await new Promise<{ providerVideoId?: string; videoId?: string }>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("POST", "/api/teacher/vdocipher/server-upload", true);
        xhr.withCredentials = true;
        xhr.timeout = 30 * 60 * 1000;
        xhr.upload.onprogress = (event) => {
          if (!event.lengthComputable) return;
          const percent = Math.round((event.loaded / event.total) * 100);
          setVdoUploadProgress(percent);
          setVdoUploadStatus(`جارٍ رفع الفيديو (${percent}%)...`);
        };
        xhr.onload = () => {
          let data: { providerVideoId?: string; videoId?: string; error?: string } = {};
          try { data = JSON.parse(xhr.responseText || "{}"); } catch { /* handled below */ }
          if (xhr.status >= 200 && xhr.status < 300 && (data.providerVideoId || data.videoId)) {
            resolve(data);
          } else {
            reject(new Error(data.error || `فشل رفع الفيديو (رمز: ${xhr.status})`));
          }
        };
        xhr.onerror = () => reject(new Error("انقطع الاتصال أثناء الرفع"));
        xhr.ontimeout = () => reject(new Error("انتهت مهلة الرفع"));
        xhr.send(formData);
      });

      const finalVideoId = result.providerVideoId || result.videoId;
      if (!finalVideoId) throw new Error("لم يُعد الخادم معرّف الفيديو");
      setVdoUploadProgress(100);
      setVdoAssetId(finalVideoId);
      setVdoUploadSuccess(`تم رفع الفيديو بنجاح! معرّف الفيديو: ${finalVideoId}`);
      setVdoUploadStatus("تم الرفع! جارٍ تفعيل المشغل...");
      await generateVdoCipherOtp(finalVideoId);
    } catch (err: any) {
      setVdoError(err.message || "حدث خطأ أثناء رفع الفيديو");
    } finally {
      setIsUploadingVdo(false);
    }
  };

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const handleVdoDirectUploadLegacy = async (file: File) => {
    if (!file) return;
    setIsUploadingVdo(true);
    setVdoUploadProgress(0);
    setVdoError(null);
    setVdoUploadSuccess(null);
    setVdoUploadStatus("جاري حجز تذكرة الرفع من خوادم VdoCipher...");

    try {
      // 1. Request upload ticket from the platform API
      const ticketRes = await fetch("/api/teacher/vdocipher/upload-ticket", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: file.name.replace(/\.[^/.]+$/, "") || "معاينة درس مشفر",
          estimatedSizeBytes: file.size,
        }),
      });

      const ticketData = await ticketRes.json().catch(() => ({}));
      if (!ticketRes.ok || !ticketData.success) {
        throw new Error(ticketData.error || `تعذر حجز تذكرة الرفع من VdoCipher (رمز: ${ticketRes.status})`);
      }

      const { uploadLink, clientPayload, providerVideoId, videoId } = ticketData;
      const finalVideoId = providerVideoId || videoId;

      if (!uploadLink || !clientPayload) {
        throw new Error("بيانات تذكرة الرفع غير مكتملة من VdoCipher API");
      }

      // 2. Direct S3 Upload (Browser to VdoCipher AWS S3)
      setVdoUploadStatus("جاري رفع الفيديو مباشرة إلى سحابة VdoCipher المشفرة...");
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        const formData = new FormData();

        // Append all policy and signature fields first
        for (const key of Object.keys(clientPayload)) {
          if (key !== "uploadLink") {
            formData.append(key, clientPayload[key]);
          }
        }
        // Append the video file last as required by S3 POST policy
        formData.append("file", file);

        xhr.open("POST", uploadLink, true);
        // Note: do NOT set withCredentials on AWS S3 cross-origin endpoint

        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) {
            const percent = Math.round((e.loaded / e.total) * 100);
            setVdoUploadProgress(percent);
            if (percent >= 100) {
              setVdoUploadStatus("اكتمل الرفع! جاري بدء تشفير البث وتوليد رمز OTP...");
            } else {
              setVdoUploadStatus(`جاري رفع الفيديو إلى VdoCipher (${percent}%)...`);
            }
          }
        };

        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve();
          } else {
            const s3Err = xhr.responseText ? xhr.responseText.slice(0, 250) : "";
            reject(new Error(`رفض خادم التخزين S3 استلام الملف (رمز: ${xhr.status})${s3Err ? " - " + s3Err : ""}`));
          }
        };

        xhr.onerror = () => reject(new Error("حدث انقطاع في الاتصال أثناء الرفع إلى سحابة S3"));
        xhr.ontimeout = () => reject(new Error("انتهت مهلة الرفع، يرجى المحاولة مجدداً"));
        xhr.timeout = 1800000; // 30 minutes for large videos

        xhr.send(formData);
      });

      setVdoAssetId(finalVideoId);
      setVdoUploadSuccess(`تم رفع الفيديو بنجاح إلى VdoCipher! معرّف الفيديو: ${finalVideoId}`);
      setVdoUploadStatus("تم الرفع بنجاح! جاري تفعيل المشغل المشفر...");

      // 3. Immediately generate OTP and load player
      await generateVdoCipherOtp(finalVideoId);
    } catch (err: any) {
      setVdoError(err.message || "حدث خطأ أثناء رفع الفيديو");
    } finally {
      setIsUploadingVdo(false);
    }
  };

  // ── Import from Google Drive into VdoCipher ───────────────────────────────
  const handleGdriveImport = async () => {
    const trimmedUrl = gdriveUrl.trim();
    if (!trimmedUrl) {
      setVdoError("يرجى إدخال رابط مشاركة Google Drive صالح أو معرّف الملف");
      return;
    }
    setIsImportingGdrive(true);
    setVdoError(null);
    setVdoUploadSuccess(null);
    setGdriveStatus("جاري الاتصال بـ Google Drive وتنزيل الفيديو...");

    try {
      const res = await fetch("/api/teacher/vdocipher/gdrive-import", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          driveUrl: trimmedUrl,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        throw new Error(data.error || `فشل استيراد الفيديو من Google Drive (رمز: ${res.status})`);
      }

      const importedVideoId = data.providerVideoId || data.videoId;
      setVdoAssetId(importedVideoId);
      setVdoUploadSuccess(
        `تم استيراد الفيديو بنجاح من Google Drive (${data.sizeFormatted || ""})! معرّف الفيديو: ${importedVideoId}`
      );
      setGdriveUrl("");

      // 3. Automatically generate OTP and start playback
      await generateVdoCipherOtp(importedVideoId);
    } catch (err: any) {
      const errorMsg = err.message || "حدث خطأ أثناء استيراد الفيديو من Google Drive";
      if (errorMsg.includes("403")) {
        setVdoError("خوادم VdoCipher رفضت تذكرة الرفع (403 Forbidden). تأكد من صحة مفتاح الـ API Secret أو سريان اشتراك VdoCipher في لوحة التحكم العامة (Superadmin)، أو استخدم زر 'التشغيل المباشر الفوري' أدناه.");
      } else {
        setVdoError(errorMsg);
      }
    } finally {
      setIsImportingGdrive(false);
      setGdriveStatus("");
    }
  };

  // ── Instant Direct Google Drive Stream (Native High-Security Player) ───────
  const handleDirectDrivePlay = () => {
    const trimmedUrl = gdriveUrl.trim();
    if (!trimmedUrl) {
      setVdoError("يرجى إدخال رابط مشاركة Google Drive صالح أو معرّف الملف");
      return;
    }
    const match = trimmedUrl.match(/\/file\/d\/([a-zA-Z0-9_-]+)/) || trimmedUrl.match(/[?&]id=([a-zA-Z0-9_-]+)/);
    const fileId = match?.[1] || (trimmedUrl.length >= 20 && !trimmedUrl.includes("/") ? trimmedUrl : null);
    if (!fileId) {
      setVdoError("تعذر استخراج معرّف الملف من رابط Google Drive");
      return;
    }
    const streamUrl = `/api/videos/stream/gdrive_${fileId}`;
    setVdoEmbedUrl(streamUrl);
    setVdoAssetId(`gdrive_${fileId}`);
    setVdoUploadSuccess(`تم تفعيل البث المباشر المحمي لملف Google Drive! (معرف: ${fileId}) 🚀`);
    setVdoError(null);
  };

  // ── Active Player Configuration ────────────────────────────────────────────
  const currentManifestUrl = useMemo(() => {
    if (activeTab !== "axinom") return "";
    if (axinomMode === "clear") {
      return "https://media.axprod.net/TestVectors/v7-Clear/Manifest_1080p.mpd";
    }
    if (axinomMode === "encrypted") {
      return "https://media.axprod.net/TestVectors/v7-MultiDRM-SingleKey/Manifest_1080p.mpd";
    }
    // Custom Asset
    if (customAssetId.startsWith("http://") || customAssetId.startsWith("https://")) {
      return customAssetId;
    }
    return `/api/videos/drm/${encodeURIComponent(customAssetId)}/manifest.mpd`;
  }, [activeTab, axinomMode, customAssetId]);

  const currentDrmConfig = useMemo(() => {
    if (activeTab !== "axinom") return undefined;
    if (axinomMode === "clear") return undefined;

    if (axinomMode === "encrypted") {
      return {
        token: AXINOM_DEMO_TOKEN,
        licenseServers: {
          widevine: SAME_ORIGIN_LICENSE_SERVERS.widevine,
          playready: SAME_ORIGIN_LICENSE_SERVERS.playready,
          fairplay: SAME_ORIGIN_LICENSE_SERVERS.fairplay,
        },
      };
    }

    // Custom asset configuration
    return {
      token: customToken,
      licenseServers: {
        widevine: SAME_ORIGIN_LICENSE_SERVERS.widevine,
        playready: SAME_ORIGIN_LICENSE_SERVERS.playready,
        fairplay: SAME_ORIGIN_LICENSE_SERVERS.fairplay,
      },
    };
  }, [activeTab, axinomMode, customToken]);

  const hardwareSupportedCount = Object.entries(probeResults).filter(
    ([label, status]) => status === "yes" && PROBES.find((p) => p.label === label)?.hardware
  ).length;

  // ── Password Gate Modal ───────────────────────────────────────────────────
  if (isAuthenticated === false) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-4" dir="rtl">
        <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-8 shadow-2xl space-y-6">
          <div className="flex flex-col items-center text-center space-y-3">
            <div className="w-16 h-16 rounded-2xl bg-sky-500/10 border border-sky-500/30 flex items-center justify-center text-sky-400">
              <Lock className="w-8 h-8" />
            </div>
            <div>
              <span className="text-[11px] font-mono font-bold uppercase tracking-widest text-sky-400 bg-sky-500/10 px-2.5 py-1 rounded-full border border-sky-500/20">
                Code-UP Security Portal
              </span>
              <h1 className="text-xl font-black text-white mt-2">بوابة معاينة واختبار أنظمة الحماية DRM</h1>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              هذه الصفحة مخصصة لمدير التكنولوجيا (CTO) وإدارة المنصة والمعلمين لاختبار وفحص مسارات فك التشفير العتادية ومقاومة التسجيل.
            </p>
          </div>

          <form onSubmit={handlePasswordSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-300 block">
                كلمة المرور الأمنية (CTO Access Key):
              </label>
              <input
                type="password"
                value={passwordInput}
                onChange={(e) => setPasswordInput(e.target.value)}
                placeholder="أدخل كلمة المرور..."
                autoFocus
                className="w-full px-4 py-3 bg-slate-950 border border-slate-700 rounded-xl text-white font-mono text-sm focus:outline-none focus:border-sky-500 transition-colors text-left"
                dir="ltr"
              />
            </div>

            {authError && (
              <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-400 text-xs font-semibold flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 shrink-0" />
                <span>{authError}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={authLoading}
              className="w-full py-3 bg-sky-500 hover:bg-sky-400 text-white font-bold text-sm rounded-xl transition-all shadow-lg shadow-sky-500/20 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {authLoading ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  <Key className="w-4 h-4" />
                  <span>دخول لوحة المعاينة الأمنية</span>
                </>
              )}
            </button>
          </form>

          <div className="pt-4 border-t border-slate-800 text-center">
            <p className="text-[11px] text-slate-500">
              Code-UP Security Engine • Axinom Multi-DRM & VdoCipher Verification
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (isAuthenticated === null) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <RefreshCw className="w-8 h-8 text-sky-400 animate-spin" />
          <p className="text-xs text-slate-400 font-mono">Verifying Security Session...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 selection:bg-sky-500 selection:text-white flex flex-col" dir="rtl">
      {/* ── Top Security Header ── */}
      <header className="border-b border-slate-800 bg-slate-900/90 backdrop-blur-md sticky top-0 z-40 px-4 py-3">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-sky-500/10 border border-sky-500/30 flex items-center justify-center text-sky-400">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-black text-white">Code-UP CTO DRM Testing Suite</span>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                  {hardwareSupportedCount > 0 ? "Hardware DRM Capable" : "Software DRM Verified"}
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                منصة فحص واختبار حماية البث المشفر وتعتيم الشاشة والعلامات المائية
              </p>
            </div>
          </div>

          {/* Tab Navigation */}
          <div className="flex items-center gap-1.5 bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs font-bold">
            <button
              onClick={() => setActiveTab("axinom")}
              className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 cursor-pointer ${
                activeTab === "axinom"
                  ? "bg-sky-600 text-white shadow-md shadow-sky-600/30"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              <Key className="w-3.5 h-3.5" />
              <span>Axinom Multi-DRM</span>
            </button>

            <button
              onClick={() => setActiveTab("vdocipher")}
              className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 cursor-pointer ${
                activeTab === "vdocipher"
                  ? "bg-sky-600 text-white shadow-md shadow-sky-600/30"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              <Eye className="w-3.5 h-3.5" />
              <span>VdoCipher DRM</span>
            </button>

            <button
              onClick={() => setActiveTab("capabilities")}
              className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 cursor-pointer ${
                activeTab === "capabilities"
                  ? "bg-sky-600 text-white shadow-md shadow-sky-600/30"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              <Cpu className="w-3.5 h-3.5" />
              <span>فحص قدرات الجهاز (EME)</span>
            </button>

            <button
              onClick={() => setActiveTab("watermark")}
              className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 cursor-pointer ${
                activeTab === "watermark"
                  ? "bg-sky-600 text-white shadow-md shadow-sky-600/30"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>معمل العلامة المائية الجنائية</span>
            </button>
          </div>
        </div>
      </header>

      {/* ── Main Testing Console ── */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 space-y-6">
        {/* ── TAB 1: Axinom Multi-DRM Test Stage ── */}
        {activeTab === "axinom" && (
          <div className="space-y-6">
            {/* Control Bar: Encrypted Test vs Clear Control vs Custom Asset */}
            <div className="flex flex-wrap items-center justify-between gap-3 p-4 bg-slate-900 border border-slate-800 rounded-2xl">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-300">نمط الاختبار:</span>
                <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs">
                  <button
                    onClick={() => setAxinomMode("encrypted")}
                    className={`px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
                      axinomMode === "encrypted"
                        ? "bg-sky-500 text-white"
                        : "text-slate-400 hover:text-white"
                    }`}
                  >
                    🛡️ مشفر Multi-DRM (1080p CENC)
                  </button>
                  <button
                    onClick={() => setAxinomMode("clear")}
                    className={`px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
                      axinomMode === "clear"
                        ? "bg-amber-500 text-white"
                        : "text-slate-400 hover:text-white"
                    }`}
                  >
                    ⚡ غير مشفر Clear DASH (للتحقق من برنامج التسجيل)
                  </button>
                  <button
                    onClick={() => setAxinomMode("custom")}
                    className={`px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
                      axinomMode === "custom"
                        ? "bg-purple-600 text-white"
                        : "text-slate-400 hover:text-white"
                    }`}
                  >
                    🎯 معرّف درس مخصص (Custom Asset)
                  </button>
                </div>
              </div>

              {axinomMode === "custom" && (
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={customAssetId}
                    onChange={(e) => setCustomAssetId(e.target.value)}
                    placeholder="أدخل Asset ID..."
                    className="px-3 py-1.5 bg-slate-950 border border-slate-700 rounded-xl text-xs font-mono text-white text-left focus:outline-none focus:border-sky-500"
                    dir="ltr"
                  />
                  <button
                    onClick={() => generatePreviewToken(customAssetId)}
                    disabled={isGeneratingToken}
                    className="px-3 py-1.5 bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold rounded-xl transition-all cursor-pointer flex items-center gap-1"
                  >
                    {isGeneratingToken ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : "توليد توكن (2h)"}
                  </button>
                </div>
              )}
            </div>

            {/* Video Player Cinema Box */}
            <div className="relative rounded-2xl overflow-hidden border border-slate-800 bg-black shadow-2xl aspect-video w-full max-h-[72vh]">
              <SecurePlayer
                embedUrl={currentManifestUrl}
                provider="axinom"
                drm={currentDrmConfig}
                title={
                  axinomMode === "clear"
                    ? "Clear DASH Control Stream (Unencrypted Test)"
                    : axinomMode === "encrypted"
                    ? "Axinom Multi-DRM Hardware Test Vector"
                    : customTitle
                }
                watermark={testWatermarkLabel}
              />
            </div>

            {/* Technical Verification Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl space-y-2">
                <div className="flex items-center justify-between text-xs font-bold">
                  <span className="text-slate-400">حالة التشفير و CDM</span>
                  <span className={axinomMode === "clear" ? "text-amber-400" : "text-emerald-400"}>
                    {axinomMode === "clear" ? "Unencrypted Stream" : "Hardware & Software CENC"}
                  </span>
                </div>
                <p className="text-xs text-slate-300 font-mono break-all">
                  {axinomMode === "clear"
                    ? "Stream: Clear DASH (Manifest_1080p.mpd)"
                    : "License: Widevine L1/L3 • PlayReady SL3000/2000"}
                </p>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  {axinomMode === "clear"
                    ? "هذا الفيديو غير مشفر عن عمد لإثبات أن برامج تصوير الشاشة تعمل على جهازك بصورة طبيعية."
                    : "تعتيم الشاشة عند التسجيل (Black Frame) يعتمد على توفر مسار عتادي Direct Composition في جهازك ومتصفحك (Edge مع PlayReady SL3000 أو هواتف Android مع Widevine L1)."}
                </p>
              </div>

              <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl space-y-2">
                <div className="flex items-center justify-between text-xs font-bold">
                  <span className="text-slate-400">طبقة العرض والكومبوزيتور</span>
                  <span className="text-sky-400">Overlay-Plane Safe</span>
                </div>
                <p className="text-xs text-slate-300 font-mono">
                  No opacity/filter on video surface
                </p>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  تمت مراجعة المشغل هندسياً لضمان عدم تطبيق أي فلاتر أو خصائص دمج على عنصر الفيديو لتمكين كارت الشاشة من عزله عن ذاكرة التسجيل.
                </p>
              </div>

              <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl space-y-2">
                <div className="flex items-center justify-between text-xs font-bold">
                  <span className="text-slate-400">العلامة المائية الآمنة</span>
                  <span className="text-purple-400">Low-Opacity Dynamic Watermark</span>
                </div>
                <p className="text-xs text-slate-300 font-mono">
                  Drifting 14% opacity badge
                </p>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  تتحرك بسلاسة عبر مساحة الفيديو بشفافية منخفضة وغير مشتتة لانتباه الطالب، مع توثيق هوية المشاهد في كل تسجيل.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* ── TAB 2: VdoCipher DRM Test Stage ── */}
        {activeTab === "vdocipher" && (
          <div className="space-y-6">
            <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl flex flex-wrap items-center justify-between gap-4">
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Eye className="w-4 h-4 text-sky-400" />
                  <span>VdoCipher Enterprise DRM Integration</span>
                </h3>
                <p className="text-xs text-slate-400 mt-1">
                  مشغل VdoCipher المزود بحماية Multi-Account، وتوليد OTP ديناميكي مدته 120 ثانية، ومسار تشغيل معزول.
                </p>
              </div>
              <a
                href="https://www.vdocipher.com/blog/screen-capture-block-video/"
                target="_blank"
                rel="noreferrer"
                className="text-xs text-sky-400 hover:text-sky-300 font-bold flex items-center gap-1"
              >
                <span>توثيق VdoCipher الرسمي حول منع التسجيل</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>

            {/* Video Ingestion & Upload Hub (File Upload & Google Drive) */}
            <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl space-y-4">
              {/* Ingestion Mode Switcher */}
              <div className="flex flex-wrap items-center justify-between gap-3 pb-2 border-b border-slate-800">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-sky-500/10 border border-sky-500/30 flex items-center justify-center text-sky-400">
                    <UploadCloud className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-white">إضافة فيديو جديد إلى VdoCipher المشفر</h4>
                    <p className="text-[11px] text-slate-400">
                      ارفع ملف من جهازك أو استورد مباشرة من Google Drive ليتم تشفيره بـ DRM فورياً.
                    </p>
                  </div>
                </div>

                <div className="flex items-center bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs font-bold">
                  <button
                    onClick={() => setVdoUploadMode("file")}
                    className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 cursor-pointer ${
                      vdoUploadMode === "file" ? "bg-sky-500 text-white shadow-sm" : "text-slate-400 hover:text-white"
                    }`}
                  >
                    <Upload className="w-3.5 h-3.5" />
                    <span>رفع ملف من الجهاز</span>
                  </button>
                  <button
                    onClick={() => setVdoUploadMode("gdrive")}
                    className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 cursor-pointer ${
                      vdoUploadMode === "gdrive" ? "bg-sky-500 text-white shadow-sm" : "text-slate-400 hover:text-white"
                    }`}
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>استيراد من Google Drive 🚀</span>
                  </button>
                </div>
              </div>

              {/* Mode 1: Direct File Upload */}
              {vdoUploadMode === "file" && (
                <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                  <p className="text-xs text-slate-300">
                    يدعم ملفات الفيديو بصيغ: <code className="text-sky-400 font-mono">MP4, MOV, WebM, MKV</code> مباشرة إلى سحابة التخزين.
                  </p>
                  <label
                    className={`px-4 py-2 bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-500 hover:to-indigo-500 text-white text-xs font-bold rounded-xl transition-all shadow-md shadow-sky-600/20 flex items-center gap-2 cursor-pointer ${
                      isUploadingVdo || isImportingGdrive ? "opacity-50 pointer-events-none" : ""
                    }`}
                  >
                    <Upload className="w-3.5 h-3.5" />
                    <span>{isUploadingVdo ? "جاري الرفع..." : "اختر ملف فيديو للرفع 📤"}</span>
                    <input
                      type="file"
                      accept="video/mp4,video/quicktime,video/webm,video/x-matroska"
                      className="hidden"
                      disabled={isUploadingVdo || isImportingGdrive}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleVdoDirectUpload(file);
                        e.target.value = "";
                      }}
                    />
                  </label>
                </div>
              )}

              {/* Mode 2: Google Drive Import & Direct Stream */}
              {vdoUploadMode === "gdrive" && (
                <div className="space-y-3 pt-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="relative flex-1 min-w-[280px]">
                      <input
                        type="url"
                        value={gdriveUrl}
                        onChange={(e) => setGdriveUrl(e.target.value)}
                        placeholder="https://drive.google.com/file/d/1u1StNX.../view?usp=sharing"
                        className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-xs font-mono text-white text-left focus:outline-none focus:border-sky-500"
                        dir="ltr"
                        disabled={isImportingGdrive}
                      />
                    </div>

                    <button
                      onClick={handleDirectDrivePlay}
                      disabled={isImportingGdrive || !gdriveUrl.trim()}
                      className="px-4 py-2.5 bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-500 hover:to-indigo-500 text-white text-xs font-bold rounded-xl transition-all shadow-md shadow-sky-600/20 flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                    >
                      <span>▶ تشغيل مباشر فوري (Native)</span>
                    </button>

                    <button
                      onClick={handleGdriveImport}
                      disabled={isImportingGdrive || !gdriveUrl.trim()}
                      className="px-4 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-bold rounded-xl transition-all shadow-md shadow-emerald-600/20 flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                    >
                      {isImportingGdrive ? (
                        <>
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          <span>جاري الاستيراد...</span>
                        </>
                      ) : (
                        <>
                          <Download className="w-3.5 h-3.5" />
                          <span>📥 استيراد وتشفير في VdoCipher</span>
                        </>
                      )}
                    </button>
                  </div>
                  <p className="text-[11px] text-slate-400">
                    * يمكنك اختيار <strong className="text-sky-400">"تشغيل مباشر فوري"</strong> للمشاهدة فورياً عبر مشغل المنصة المحمي بالعلامة المائية، أو <strong className="text-emerald-400">"استيراد وتشفير في VdoCipher"</strong> لإرساله إلى خوادم VdoCipher.
                  </p>
                </div>
              )}

              {/* Uploading File Progress Bar */}
              {isUploadingVdo && (
                <div className="p-3.5 bg-slate-950/80 border border-sky-500/30 rounded-xl space-y-2">
                  <div className="flex items-center justify-between text-xs font-bold">
                    <span className="text-sky-400 flex items-center gap-1.5">
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>{vdoUploadStatus}</span>
                    </span>
                    <span className="text-white font-mono">{vdoUploadProgress}%</span>
                  </div>
                  <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-sky-500 to-indigo-500 transition-all duration-300 rounded-full"
                      style={{ width: `${vdoUploadProgress}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Importing GDrive Status Bar */}
              {isImportingGdrive && (
                <div className="p-3.5 bg-slate-950/80 border border-emerald-500/30 rounded-xl space-y-2">
                  <div className="flex items-center justify-between text-xs font-bold">
                    <span className="text-emerald-400 flex items-center gap-1.5">
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>{gdriveStatus}</span>
                    </span>
                    <span className="text-emerald-300 font-mono text-[11px]">Server Stream</span>
                  </div>
                  <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-emerald-500 to-teal-500 animate-pulse rounded-full w-full" />
                  </div>
                </div>
              )}

              {/* Success Alert */}
              {vdoUploadSuccess && !isUploadingVdo && !isImportingGdrive && (
                <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-300 text-xs font-semibold flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>{vdoUploadSuccess}</span>
                </div>
              )}
            </div>

            {/* VdoCipher Dynamic OTP Interactive Control Bar */}
            <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2 flex-1 min-w-[280px]">
                <span className="text-xs font-bold text-slate-300 shrink-0">معرّف الفيديو (Video ID):</span>
                <input
                  type="text"
                  value={vdoAssetId}
                  onChange={(e) => {
                    setVdoAssetId(e.target.value);
                    if (vdoError) setVdoError(null);
                  }}
                  placeholder="أدخل معرّف VdoCipher Video ID أو ارفع فيديو من الزر أعلاه..."
                  className="flex-1 px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs font-mono text-white text-left focus:outline-none focus:border-sky-500"
                  dir="ltr"
                />
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => generateVdoCipherOtp(vdoAssetId)}
                  disabled={isGeneratingVdoOtp || isUploadingVdo}
                  className="px-4 py-2 bg-sky-500 hover:bg-sky-400 text-white text-xs font-bold rounded-xl transition-all shadow-md shadow-sky-500/20 flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  {isGeneratingVdoOtp ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>جاري طلب OTP...</span>
                    </>
                  ) : vdoEmbedUrl && vdoTimeLeft > 0 ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5" />
                      <span>🔄 تجديد OTP ({vdoTimeLeft}s)</span>
                    </>
                  ) : (
                    <>
                      <Key className="w-3.5 h-3.5" />
                      <span>⚡ توليد OTP وتفعيل المشغل</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Error Banner if generation fails */}
            {vdoError && (
              <div className="p-4 bg-rose-500/10 border border-rose-500/30 rounded-2xl text-rose-300 text-xs font-medium flex items-center gap-3">
                <ShieldAlert className="w-5 h-5 shrink-0 text-rose-400" />
                <div className="flex-1">
                  <div className="font-bold text-white mb-0.5">تعذر تشغيل فيديو VdoCipher</div>
                  <p>{vdoError}</p>
                </div>
              </div>
            )}

            {/* Player Cinema Container or Standby Stage */}
            <div className="relative rounded-2xl overflow-hidden border border-slate-800 bg-black shadow-2xl aspect-video w-full max-h-[72vh] flex items-center justify-center">
              {vdoEmbedUrl ? (
                <SecurePlayer
                  embedUrl={vdoEmbedUrl}
                  provider="vdocipher"
                  title="VdoCipher Security Embed"
                  watermark={testWatermarkLabel}
                />
              ) : (
                <div className="p-8 text-center max-w-lg space-y-4">
                  <div className="w-16 h-16 rounded-2xl bg-sky-500/10 border border-sky-500/30 mx-auto flex items-center justify-center text-sky-400">
                    <Eye className="w-8 h-8" />
                  </div>
                  <div>
                    <h4 className="text-base font-bold text-white">مشغل VdoCipher المشفر جاهز للاختبار</h4>
                    <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">
                      تتطلب حماية VdoCipher وجود فيديو مرفوع وتوليد رمز OTP ديناميكي مشفر مدته 120 ثانية عبر الـ API لكل جلسة مشاهدة.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
                    <label className={`px-5 py-2.5 bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-500 hover:to-indigo-500 text-white text-xs font-bold rounded-xl transition-all shadow-lg shadow-sky-600/20 inline-flex items-center gap-2 cursor-pointer ${isUploadingVdo ? "opacity-50 pointer-events-none" : ""}`}>
                      <Upload className="w-4 h-4" />
                      <span>{isUploadingVdo ? "جاري الرفع..." : "اختر فيديو لرفعه وتشفيره فوراً 📤"}</span>
                      <input
                        type="file"
                        accept="video/mp4,video/quicktime,video/webm,video/x-matroska"
                        className="hidden"
                        disabled={isUploadingVdo}
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handleVdoDirectUpload(file);
                          e.target.value = "";
                        }}
                      />
                    </label>

                    <button
                      onClick={() => generateVdoCipherOtp(vdoAssetId)}
                      disabled={isGeneratingVdoOtp || isUploadingVdo || !vdoAssetId.trim()}
                      className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold rounded-xl border border-slate-700 transition-all inline-flex items-center gap-2 cursor-pointer disabled:opacity-50"
                    >
                      {isGeneratingVdoOtp ? (
                        <RefreshCw className="w-4 h-4 animate-spin" />
                      ) : (
                        <Key className="w-4 h-4" />
                      )}
                      <span>توليد OTP من معرّف يدوي</span>
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl space-y-2">
                <h4 className="text-xs font-bold text-sky-400">حقائق توثيق VdoCipher الرسمية:</h4>
                <ul className="text-xs text-slate-300 space-y-1.5 list-disc list-inside leading-relaxed">
                  <li>على أنظمة Windows: نسبة منع التسجيل في متصفح Chrome و Firefox تتراوح بين 70-80% لأن هذه المتصفحات تستخدم Widevine L3 البرمجي.</li>
                  <li>المسار المكتبي المؤكد لمنع التسجيل وتعتيم الإطارات (Black Frame) على Windows هو متصفح Microsoft Edge مع PlayReady SL3000.</li>
                  <li>على أجهزة Apple (Mac / iPhone / iPad): متصفح Safari يمنع التسجيل بنسبة 100% بفضل FairPlay العتادي.</li>
                </ul>
              </div>

              <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl space-y-2">
                <h4 className="text-xs font-bold text-emerald-400">حماية الكود داخل منصة Code-UP:</h4>
                <p className="text-xs text-slate-300 leading-relaxed">
                  تم تعديل مشغل المنصة ليعزل عناصر الـ Iframe عن أي تأثيرات CSS خارجية (كالشفافية والظلال الدائرية)، مما يتيح لكارت الشاشة تفعيل مسار Overlay Plane المحمي تلقائياً عند توفره في جهاز الطالب.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* ── TAB 3: EME Capabilities Live Diagnostic Probe ── */}
        {activeTab === "capabilities" && (
          <div className="space-y-6">
            <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl flex flex-wrap items-center justify-between gap-4">
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Cpu className="w-4 h-4 text-sky-400" />
                  <span>فحص مسارات التشفير العتادي والبرمجي (Hardware EME Probe)</span>
                </h3>
                <p className="text-xs text-slate-400 mt-1">
                  يقوم هذا الفحص باختبار المتصفح وبطاقة الشاشة مباشرة لتحديد مستويات الحماية الفعلية المتاحة على هذا الجهاز.
                </p>
              </div>
              <button
                onClick={runProbe}
                disabled={probingRunning}
                className="px-4 py-2 bg-sky-500 hover:bg-sky-400 text-white text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${probingRunning ? "animate-spin" : ""}`} />
                <span>إعادة الفحص المباشر</span>
              </button>
            </div>

            {isSecureContext === false && (
              <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-2xl text-amber-300 text-xs font-semibold">
                ⚠️ المتصفح لا يعمل في بيئة آمنة (HTTPS / localhost). واجهات فك التشفير EME تتطلب اتصالاً آمناً لتعمل.
              </div>
            )}

            <div className="overflow-x-auto rounded-2xl border border-slate-800 bg-slate-900">
              <table className="w-full text-xs">
                <thead className="bg-slate-950/80 text-right border-b border-slate-800">
                  <tr>
                    <th className="p-3.5 font-bold text-slate-300">نظام فك التشفير (Key System)</th>
                    <th className="p-3.5 font-bold text-slate-300">المستوى الأمني</th>
                    <th className="p-3.5 font-bold text-slate-300">الدعم على هذا الجهاز</th>
                    <th className="p-3.5 font-bold text-slate-300">التأثير على تصوير الشاشة</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-mono">
                  {PROBES.map((probe) => {
                    const status = probeResults[probe.label] || "checking";
                    return (
                      <tr key={probe.label} className="hover:bg-slate-800/30 transition-colors">
                        <td className="p-3.5">
                          <div className="font-bold text-white font-sans">{probe.label}</div>
                          <div className="text-[10px] text-slate-500 font-mono">{probe.keySystem}</div>
                        </td>
                        <td className="p-3.5 font-sans">
                          {probe.hardware ? (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                              عتادي (Hardware)
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-700/50 text-slate-300 border border-slate-600">
                              برمجي (Software)
                            </span>
                          )}
                        </td>
                        <td className="p-3.5">
                          {status === "checking" ? (
                            <span className="text-slate-400 animate-pulse font-sans">جارٍ الفحص...</span>
                          ) : status === "yes" ? (
                            <span className="text-emerald-400 font-bold flex items-center gap-1 font-sans">
                              <Check className="w-4 h-4" />
                              <span>مدعوم (Yes)</span>
                            </span>
                          ) : (
                            <span className="text-slate-500 font-sans">غير متاح (No)</span>
                          )}
                        </td>
                        <td className="p-3.5 font-sans text-slate-300 text-[11px] leading-relaxed max-w-sm">
                          {probe.note}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── TAB 4: Forensic Watermark Lab ── */}
        {activeTab === "watermark" && (
          <div className="space-y-6">
            <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl space-y-4">
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Layers className="w-4 h-4 text-purple-400" />
                  <span>معمل اختبار العلامة المائية الجنائية وتحدي القص (Anti-Crop Lab)</span>
                </h3>
                <p className="text-xs text-slate-400 mt-1">
                  العلامة المائية هي خط الدفاع الحاسم عندما يتعذر التعتيم العتادي. تم تصميمها لتكون غير ملحوظة للعين أثناء الشرح، مع صمود كامل أمام القص أو إعادة الضغط.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-slate-800">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-300">نص العلامة المائية للتجربة:</label>
                  <input
                    type="text"
                    value={testWatermarkLabel}
                    onChange={(e) => setTestWatermarkLabel(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs font-mono text-white text-left focus:outline-none focus:border-sky-500"
                    dir="ltr"
                  />
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs font-semibold text-slate-300">
                    <span>شفافية العلامة المائية (Watermark Opacity):</span>
                    <span className="font-mono text-sky-400">{Math.round(customGridOpacity * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min={0.05}
                    max={0.50}
                    step={0.01}
                    value={customGridOpacity}
                    onChange={(e) => setCustomGridOpacity(Number(e.target.value))}
                    className="w-full accent-sky-500 cursor-pointer"
                  />
                </div>
              </div>
            </div>

            {/* Live Interactive Watermark Stage */}
            <div className="relative rounded-2xl overflow-hidden border border-slate-800 bg-slate-950 aspect-video w-full max-h-[65vh] flex items-center justify-center p-6 text-center">
              <div className="absolute inset-0 bg-gradient-to-tr from-slate-950 via-slate-900 to-slate-950" />

              {/* Watermark Sibling Layer */}
              <VideoWatermark label={testWatermarkLabel} opacity={customGridOpacity} />

              <div className="relative z-10 max-w-md space-y-3 pointer-events-none select-none">
                <div className="w-12 h-12 rounded-2xl bg-purple-500/10 border border-purple-500/30 flex items-center justify-center text-purple-400 mx-auto">
                  <MonitorCheck className="w-6 h-6" />
                </div>
                <h4 className="text-sm font-bold text-white">منطقة محاكاة الفيديو الحي</h4>
                <p className="text-xs text-slate-400 leading-relaxed">
                  تتحرك العلامة المائية الشفافة بسلاسة كل عدة ثوانٍ عبر زوايا الشاشة، مما يضمن الحماية وتوثيق هوية المسجل دون تشتيت تركيز الطالب أثناء مشاهدة الدرس.
                </p>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default function PreviewPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center">
          <RefreshCw className="w-8 h-8 text-sky-400 animate-spin" />
        </div>
      }
    >
      <PreviewDashboardContent />
    </Suspense>
  );
}
