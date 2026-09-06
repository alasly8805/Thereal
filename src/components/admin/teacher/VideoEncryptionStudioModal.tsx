"use client";

import React, { useState, useRef, useEffect } from "react";
import { useToast } from "@/components/ui/Toast";
import { extractYouTubeVideoId } from "@/lib/youtube";
import {
  Video,
  ShieldCheck,
  KeyRound,
  Plus,
  X,
  CheckCircle2,
  ExternalLink,
  ShieldAlert,
  Sparkles,
  UploadCloud,
  HardDrive,
  FileVideo,
  Loader2,
  RefreshCw,
} from "lucide-react";

export type VideoProviderType = "alasly" | "youtube" | "vdocipher" | "axinom";
export type VideoSourceMode = "upload" | "gdrive" | "youtube" | "manual";

interface Props {
  folderId: string;
  folderName: string;
  initialMode?: "upload" | "gdrive" | "manual" | "youtube";
  isOpen: boolean;
  onClose: () => void;
  onVideoCreated: () => void;
}

export const AUTHORIZED_DRM_TEACHER_ID = "cms96imqx0003qxhnvmkhhr59";

export function VideoEncryptionStudioModal({
  folderId,
  folderName,
  initialMode = "upload",
  isOpen,
  onClose,
  onVideoCreated,
}: Props) {
  const { success: toastSuccess, error: toastError } = useToast();

  const [sourceMode, setSourceMode] = useState<VideoSourceMode>(() => {
    if (initialMode === "gdrive") return "gdrive";
    if (initialMode === "youtube") return "youtube";
    if (initialMode === "manual") return "manual";
    return "upload";
  });

  const [provider, setProvider] = useState<VideoProviderType>(() => {
    if (initialMode === "youtube") return "youtube";
    return "alasly";
  });

  const [title, setTitle] = useState("");
  const [providerVideoId, setProviderVideoId] = useState("");
  const [durationMinutes, setDurationMinutes] = useState<number>(45);
  const [maxWatchesPerUser, setMaxWatchesPerUser] = useState<number>(3);
  const [publishAt, setPublishAt] = useState("");
  const [isFree, setIsFree] = useState(false);

  // ── Protection Unlock States (Controlled by Password or inherently authorized user) ──
  const [vdocipherUnlocked, setVdocipherUnlocked] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return sessionStorage.getItem("vdocipher_unlocked") === "true";
  });

  const [drmUnlocked, setDrmUnlocked] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return sessionStorage.getItem("drm_unlocked") === "true";
  });

  const [drmPasscode, setDrmPasscode] = useState<string>(() => {
    if (typeof window === "undefined") return "";
    return sessionStorage.getItem("drm_passcode") || "";
  });

  // "إضافة حماية" password unlock modal state
  const [showAddSecurityModal, setShowAddSecurityModal] = useState(false);
  const [securityInputCode, setSecurityInputCode] = useState("");
  const [checkingCode, setCheckingCode] = useState(false);

  // ── File Upload State ──
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [uploadSuccessInfo, setUploadSuccessInfo] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // ── Google Drive Import State ──
  const [gdriveUrl, setGdriveUrl] = useState("");
  const [gdriveImporting, setGdriveImporting] = useState(false);
  const [gdriveSuccessInfo, setGdriveSuccessInfo] = useState<{
    sizeFormatted: string;
    durationMinutes?: number;
    filename?: string;
  } | null>(null);

  const [submitting, setSubmitting] = useState(false);

  // Verify User Session: if superadmin/owner or authorized teacher, unlock DRM automatically
  useEffect(() => {
    fetch("/api/auth/me", { credentials: "include" })
      .then((res) => res.json())
      .then((data) => {
        if (data?.user) {
          const user = data.user;
          const cleanName = (user.name || "").replace(/\s+/g, "").toLowerCase();
          const allowed =
            user.role === "superadmin" ||
            user.role === "admin" ||
            user.isOwner === true ||
            user.id === AUTHORIZED_DRM_TEACHER_ID ||
            cleanName.includes("عبدالباسط") ||
            cleanName.includes("عبدالاسط") ||
            cleanName.includes("abdelbaset");

          if (allowed) {
            setVdocipherUnlocked(true);
            setDrmUnlocked(true);
          }
        }
      })
      .catch(() => {});
  }, []);

  // Sync initialMode on modal open
  useEffect(() => {
    if (isOpen) {
      if (initialMode === "gdrive") {
        setSourceMode("gdrive");
        if (provider === "youtube") setProvider("alasly");
      } else if (initialMode === "youtube") {
        setSourceMode("youtube");
        setProvider("youtube");
      } else if (initialMode === "manual") {
        setSourceMode("manual");
      } else {
        setSourceMode("upload");
        if (provider === "youtube") setProvider("alasly");
      }
    }
  }, [isOpen, initialMode]);

  if (!isOpen) return null;

  // ── Unlock Security Handlers (Password-Gated) ──────────────────────────────
  const handleVerifyExtraSecurity = async (e: React.FormEvent) => {
    e.preventDefault();
    const code = securityInputCode.trim();
    if (!code) {
      toastError("يرجى إدخال كلمة سر الحماية");
      return;
    }

    setCheckingCode(true);
    let unlockedAny = false;

    // Test VdoCipher Gate
    try {
      const resVdo = await fetch("/api/teacher/vdocipher/gate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: code }),
      });
      const dataVdo = await resVdo.json();
      if (resVdo.ok && (dataVdo.success || dataVdo.ok)) {
        setVdocipherUnlocked(true);
        sessionStorage.setItem("vdocipher_unlocked", "true");
        setProvider("vdocipher");
        unlockedAny = true;
        toastSuccess("تم فك قفل وتفعيل نظام حماية VdoCipher DRM بنجاح! 🔓");
      }
    } catch {
      /* ignore */
    }

    // Test Axinom DRM Gate
    try {
      const resDrm = await fetch("/api/teacher/drm-gate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: code }),
      });
      const dataDrm = await resDrm.json();
      if (resDrm.ok && (dataDrm.success || dataDrm.ok)) {
        setDrmUnlocked(true);
        sessionStorage.setItem("drm_unlocked", "true");
        if (!unlockedAny) setProvider("axinom");
        unlockedAny = true;
        toastSuccess("تم فك قفل وتفعيل نظام حماية Axinom Multi-DRM بنجاح! 🔓");
      }
    } catch {
      /* ignore */
    }

    setCheckingCode(false);

    if (unlockedAny) {
      setDrmPasscode(code);
      sessionStorage.setItem("drm_passcode", code);
      setShowAddSecurityModal(false);
      setSecurityInputCode("");
    } else {
      toastError("كلمة سر الحماية غير صحيحة، يرجى التأكد من الرمز والمحاولة ثانية.");
    }
  };

  // ── Handle Direct File Upload ──────────────────────────────────────────────
  const handleDirectFileUpload = () => {
    if (!selectedFile) {
      toastError("يرجى اختيار ملف فيديو أولاً");
      return;
    }

    setUploading(true);
    setUploadProgress(0);
    setUploadSuccessInfo(null);

    const xhr = new XMLHttpRequest();
    const formData = new FormData();
    formData.append("file", selectedFile);

    const endpoint =
      provider === "vdocipher"
        ? "/api/teacher/vdocipher/server-upload"
        : "/api/teacher/native-upload";

    if (provider === "vdocipher") {
      formData.append("title", title.trim() || selectedFile.name.replace(/\.[^/.]+$/, ""));
      if (drmPasscode) formData.append("drmPassword", drmPasscode);
    }

    xhr.open("POST", endpoint, true);
    xhr.withCredentials = true;
    if (drmPasscode) {
      xhr.setRequestHeader("x-drm-password", drmPasscode);
    }
    if (provider !== "vdocipher") {
      xhr.setRequestHeader("X-Filename", encodeURIComponent(selectedFile.name));
    }

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        const percent = Math.round((e.loaded / e.total) * 100);
        setUploadProgress(percent);
      }
    };

    xhr.onload = async () => {
      try {
        if (xhr.status >= 200 && xhr.status < 300) {
          const res = JSON.parse(xhr.responseText);
          if (res.success) {
            let finalVideoId = res.videoId || res.assetId || res.providerVideoId;

            if (provider === "axinom") {
              try {
                const packRes = await fetch("/api/teacher/drm-package", {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    ...(drmPasscode ? { "x-drm-password": drmPasscode } : {}),
                  },
                  body: JSON.stringify({ videoId: finalVideoId, drmPassword: drmPasscode }),
                });
                const packData = await packRes.json();
                if (packRes.ok && packData.success && packData.assetId) {
                  finalVideoId = packData.assetId;
                }
              } catch (e) {
                console.warn("Axinom DRM packaging error:", e);
              }
            }

            setProviderVideoId(finalVideoId);
            setUploadSuccessInfo(finalVideoId);

            if (!title.trim()) {
              setTitle(selectedFile.name.replace(/\.[^/.]+$/, ""));
            }

            toastSuccess("تم رفع الفيديو ومعالجته بنجاح!");
          } else {
            toastError(res.error || "فشل رفع الفيديو إلى السيرفر");
          }
        } else if (xhr.status === 413) {
          toastError("حجم الملف كبير جداً. يُفضل استخدام خيار 'استيراد Google Drive'.");
        } else {
          toastError(`فشل رفع الفيديو (رمز الاستجابة: ${xhr.status})`);
        }
      } catch {
        toastError("حدث خطأ أثناء قراءة استجابة السيرفر");
      } finally {
        setUploading(false);
      }
    };

    xhr.onerror = () => {
      toastError("تعذر إكمال الرفع عبر الشبكة. تحقق من اتصالك أو جرب الاستيراد من Google Drive.");
      setUploading(false);
    };

    xhr.send(formData);
  };

  // ── Handle Google Drive Import ─────────────────────────────────────────────
  const handleGoogleDriveImport = async () => {
    const trimmedUrl = gdriveUrl.trim();
    if (!trimmedUrl) {
      toastError("يرجى إدخال رابط أو معرّف فيديو Google Drive");
      return;
    }

    setGdriveImporting(true);
    setGdriveSuccessInfo(null);

    const endpoint =
      provider === "vdocipher"
        ? "/api/teacher/vdocipher/gdrive-import"
        : "/api/teacher/gdrive-import";

    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(drmPasscode ? { "x-drm-password": drmPasscode } : {}),
        },
        body: JSON.stringify({
          url: trimmedUrl,
          title: title.trim() || undefined,
          drmPassword: drmPasscode || undefined,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        let finalVideoId = data.videoId || data.providerVideoId;

        if (provider === "axinom") {
          try {
            const packRes = await fetch("/api/teacher/drm-package", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                ...(drmPasscode ? { "x-drm-password": drmPasscode } : {}),
              },
              body: JSON.stringify({ videoId: finalVideoId, drmPassword: drmPasscode }),
            });
            const packData = await packRes.json();
            if (packRes.ok && packData.success && packData.assetId) {
              finalVideoId = packData.assetId;
            } else {
              toastError(packData.error || "تعذر إتمام التشفير العتادي Shaka Packager");
            }
          } catch (e) {
            console.warn("Axinom DRM packaging error:", e);
            toastError("حدث خطأ أثناء التشفير العتادي Shaka DRM");
          }
        }

        setProviderVideoId(finalVideoId);
        setGdriveSuccessInfo({
          sizeFormatted: data.sizeFormatted || "مكتمل",
          durationMinutes: data.durationMinutes,
          filename: data.filename || data.title,
        });

        if (!title.trim() && data.title) {
          setTitle(data.title);
        }
        if (data.durationMinutes && data.durationMinutes > 0) {
          setDurationMinutes(data.durationMinutes);
        }

        toastSuccess(data.message || "تم استيراد الفيديو بنجاح من Google Drive!");
      } else {
        toastError(data.error || "فشل استيراد الفيديو من Google Drive");
      }
    } catch {
      toastError("حدث خطأ في الاتصال أثناء استيراد الفيديو من Google Drive");
    } finally {
      setGdriveImporting(false);
    }
  };

  // ── Create Video in Database ───────────────────────────────────────────────
  const handleCreateVideo = async (keepOpen = false) => {
    if (!title.trim()) {
      toastError("يرجى كتابة عنوان الدرس أولاً");
      return;
    }
    if (!providerVideoId.trim() && provider !== "alasly") {
      toastError("يرجى إدخال رابط أو معرّف الفيديو أو إتمام الرفع أولاً");
      return;
    }

    setSubmitting(true);

    let effectiveVideoId = providerVideoId.trim();

    // If teacher selected Axinom DRM but the ID is still an unencrypted Google Drive reference, package it before saving
    if (provider === "axinom" && (effectiveVideoId.startsWith("gdrive_") || effectiveVideoId.includes("drive.google.com"))) {
      try {
        const packRes = await fetch("/api/teacher/drm-package", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(drmPasscode ? { "x-drm-password": drmPasscode } : {}),
          },
          body: JSON.stringify({ videoId: effectiveVideoId, drmPassword: drmPasscode }),
        });
        const packData = await packRes.json();
        if (packRes.ok && packData.success && packData.assetId) {
          effectiveVideoId = packData.assetId;
          setProviderVideoId(effectiveVideoId);
        } else {
          toastError(packData.error || "تعذر تشفير الفيديو بنظام Axinom Multi-DRM عتادياً");
          setSubmitting(false);
          return;
        }
      } catch (packErr) {
        toastError("حدث خطأ أثناء تشفير الفيديو بنظام Axinom Multi-DRM");
        setSubmitting(false);
        return;
      }
    }

    const effectiveProvider = provider;

    try {
      const res = await fetch(`/api/admin/folders/${folderId}/videos`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(drmPasscode ? { "x-drm-password": drmPasscode } : {}),
        },
        body: JSON.stringify({
          title: title.trim(),
          videoProvider: effectiveProvider,
          providerVideoId: effectiveVideoId,
          durationMinutes: Number(durationMinutes) || 0,
          maxWatchesPerUser: Number(maxWatchesPerUser) || 3,
          publishAt: publishAt || null,
          isFree,
          drmPassword: drmPasscode || undefined,
        }),
      });

      const data = await res.json();
      if (res.ok && !data.error) {
        toastSuccess(
          keepOpen
            ? `تمت إضافة الدرس "${title}" بنجاح! جاهز لإضافة الدرس التالي...`
            : `تمت إضافة الدرس بنجاح!`
        );
        onVideoCreated();

        if (keepOpen) {
          setTitle("");
          setProviderVideoId("");
          setSelectedFile(null);
          setUploadSuccessInfo(null);
          setGdriveUrl("");
          setGdriveSuccessInfo(null);
          setIsFree(false);
        } else {
          onClose();
        }
      } else {
        toastError(data.error || "تعذر إضافة الفيديو");
      }
    } catch {
      toastError("حدث خطأ أثناء حفظ الفيديو");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200 overflow-y-auto">
      <div
        dir="rtl"
        className="relative w-full max-w-xl my-8 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden"
      >
        {/* Modal Header */}
        <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/80 dark:bg-slate-950/60">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-600 text-white flex items-center justify-center shadow-md">
              <Video className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="text-sm font-black text-slate-900 dark:text-white flex items-center gap-2">
                <span>إضافة فيديو إلى المحاضرة</span>
                <span className="text-[10.5px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300">
                  {folderName}
                </span>
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                حدد طريقة رفع الفيديو ونوع الحماية والتشفير المناسب لدرسك.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-500 hover:text-slate-800 dark:hover:text-white flex items-center justify-center transition-all cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 sm:p-6 space-y-5 max-h-[75vh] overflow-y-auto">
          {/* ── 1. طرق الرفع (Upload & Source Methods) ── */}
          <div className="space-y-2">
            <label className="block text-xs font-black text-slate-900 dark:text-white">
              1. طريقة رفع / إضافة الفيديو:
            </label>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {/* Option 1: Direct File Upload */}
              <button
                type="button"
                onClick={() => {
                  setSourceMode("upload");
                  if (provider === "youtube") setProvider("alasly");
                }}
                className={`p-3 rounded-2xl border text-center transition-all cursor-pointer flex flex-col items-center justify-center gap-1.5 ${
                  sourceMode === "upload"
                    ? "border-emerald-600 bg-emerald-50 dark:border-emerald-500 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 ring-2 ring-emerald-500/20 shadow-xs font-black"
                    : "border-slate-200 hover:border-emerald-300 bg-slate-50/70 dark:border-slate-800 dark:bg-slate-950/30 text-slate-700 dark:text-slate-300 font-bold"
                }`}
              >
                <UploadCloud className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                <span className="text-xs">رفع من جهازي</span>
                <span className="text-[9px] px-1.5 py-0.2 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-300 font-medium">
                  ملف مباشر
                </span>
              </button>

              {/* Option 2: Google Drive Import */}
              <button
                type="button"
                onClick={() => {
                  setSourceMode("gdrive");
                  if (provider === "youtube") setProvider("alasly");
                }}
                className={`p-3 rounded-2xl border text-center transition-all cursor-pointer flex flex-col items-center justify-center gap-1.5 ${
                  sourceMode === "gdrive"
                    ? "border-blue-600 bg-blue-50 dark:border-blue-500 dark:bg-blue-950/40 text-blue-800 dark:text-blue-300 ring-2 ring-blue-500/20 shadow-xs font-black"
                    : "border-slate-200 hover:border-blue-300 bg-slate-50/70 dark:border-slate-800 dark:bg-slate-950/30 text-slate-700 dark:text-slate-300 font-bold"
                }`}
              >
                <HardDrive className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                <span className="text-xs">Google Drive</span>
                <span className="text-[9px] px-1.5 py-0.2 rounded-full bg-blue-100 text-blue-800 dark:bg-blue-900/60 dark:text-blue-300 font-medium">
                  استيراد سحابي
                </span>
              </button>

              {/* Option 3: YouTube */}
              <button
                type="button"
                onClick={() => {
                  setSourceMode("youtube");
                  setProvider("youtube");
                }}
                className={`p-3 rounded-2xl border text-center transition-all cursor-pointer flex flex-col items-center justify-center gap-1.5 ${
                  sourceMode === "youtube"
                    ? "border-red-600 bg-red-50 dark:border-red-500 dark:bg-red-950/40 text-red-800 dark:text-red-300 ring-2 ring-red-500/20 shadow-xs font-black"
                    : "border-slate-200 hover:border-red-300 bg-slate-50/70 dark:border-slate-800 dark:bg-slate-950/30 text-slate-700 dark:text-slate-300 font-bold"
                }`}
              >
                <Video className="w-5 h-5 text-red-600 dark:text-red-400" />
                <span className="text-xs">يوتيوب YouTube</span>
                <span className="text-[9px] px-1.5 py-0.2 rounded-full bg-red-100 text-red-800 dark:bg-red-900/60 dark:text-red-300 font-medium">
                  رابط مباشر
                </span>
              </button>

              {/* Option 4: Manual Video ID */}
              <button
                type="button"
                onClick={() => setSourceMode("manual")}
                className={`p-3 rounded-2xl border text-center transition-all cursor-pointer flex flex-col items-center justify-center gap-1.5 ${
                  sourceMode === "manual"
                    ? "border-purple-600 bg-purple-50 dark:border-purple-500 dark:bg-purple-950/40 text-purple-800 dark:text-purple-300 ring-2 ring-purple-500/20 shadow-xs font-black"
                    : "border-slate-200 hover:border-purple-300 bg-slate-50/70 dark:border-slate-800 dark:bg-slate-950/30 text-slate-700 dark:text-slate-300 font-bold"
                }`}
              >
                <Sparkles className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                <span className="text-xs">معرّف يدوي</span>
                <span className="text-[9px] px-1.5 py-0.2 rounded-full bg-purple-100 text-purple-800 dark:bg-purple-900/60 dark:text-purple-300 font-medium">
                  Provider ID
                </span>
              </button>
            </div>
          </div>

          {/* ── 2. خيارات الحماية والتشفير (Protection & Encryption Engines) ── */}
          <div className="space-y-2 pt-1 border-t border-slate-100 dark:border-slate-800/60">
            <div className="flex items-center justify-between">
              <label className="text-xs font-black text-slate-900 dark:text-white flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                <span>2. نوع الحماية والتشفير المطبّق:</span>
              </label>

              {/* زرار إضافة حماية بكلمة سر */}
              <button
                type="button"
                onClick={() => setShowAddSecurityModal(true)}
                className="text-[11px] font-bold text-amber-800 dark:text-amber-300 hover:text-amber-900 bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/60 dark:hover:bg-amber-900/60 border border-amber-300 dark:border-amber-800 px-2.5 py-1 rounded-xl transition-all flex items-center gap-1 cursor-pointer shadow-xs"
                title="إدخال كلمة سر الحماية لإتاحة حمايات إضافية متقدمة (DRM)"
              >
                <Plus className="w-3.5 h-3.5 text-amber-800 dark:text-amber-300" />
                <span>إضافة حماية (DRM)</span>
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {/* Option 1: Native (الأصلي) - متاح للجميع */}
              <button
                type="button"
                onClick={() => {
                  setProvider("alasly");
                  if (sourceMode === "youtube") setSourceMode("upload");
                }}
                className={`p-3 rounded-2xl border text-right transition-all cursor-pointer flex flex-col justify-between ${
                  provider === "alasly"
                    ? "border-emerald-600 bg-emerald-50/70 dark:border-emerald-500 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-200 ring-2 ring-emerald-500/20 shadow-xs"
                    : "border-slate-200 hover:border-slate-300 bg-slate-50/50 dark:border-slate-800 dark:bg-slate-950/20 text-slate-700 dark:text-slate-300"
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-black flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4 text-emerald-600" />
                    <span>المشغل الأصلي (Native)</span>
                  </span>
                  <span className="text-[9.5px] px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-300 font-bold">
                    متاح تلقائياً ✓
                  </span>
                </div>
                <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-tight">
                  حماية المنصة مع علامة مائية ديناميكية وتشفير سحابي ضد التحميل.
                </p>
              </button>

              {/* Option 2: YouTube (يوتيوب) - متاح للجميع */}
              <button
                type="button"
                onClick={() => {
                  setProvider("youtube");
                  setSourceMode("youtube");
                }}
                className={`p-3 rounded-2xl border text-right transition-all cursor-pointer flex flex-col justify-between ${
                  provider === "youtube"
                    ? "border-red-600 bg-red-50/70 dark:border-red-500 dark:bg-red-950/40 text-red-900 dark:text-red-200 ring-2 ring-red-500/20 shadow-xs"
                    : "border-slate-200 hover:border-slate-300 bg-slate-50/50 dark:border-slate-800 dark:bg-slate-950/20 text-slate-700 dark:text-slate-300"
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-black flex items-center gap-1.5">
                    <Video className="w-4 h-4 text-red-600" />
                    <span>يوتيوب (YouTube)</span>
                  </span>
                  <span className="text-[9.5px] px-1.5 py-0.5 rounded-full bg-red-100 text-red-800 dark:bg-red-900/60 dark:text-red-300 font-bold">
                    متاح تلقائياً ✓
                  </span>
                </div>
                <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-tight">
                  مشغل يوتيوب السريع مع طبقة حماية المنصة وحساب عدد المشاهدات.
                </p>
              </button>

              {/* Option 3: VdoCipher DRM (إذا تم إدخال كلمة سر الحماية) */}
              {vdocipherUnlocked && (
                <button
                  type="button"
                  onClick={() => {
                    setProvider("vdocipher");
                    if (sourceMode === "youtube") setSourceMode("upload");
                  }}
                  className={`p-3 rounded-2xl border text-right transition-all cursor-pointer flex flex-col justify-between ${
                    provider === "vdocipher"
                      ? "border-amber-600 bg-amber-50/80 dark:border-amber-500 dark:bg-amber-950/40 text-amber-950 dark:text-amber-200 ring-2 ring-amber-500/20 shadow-xs"
                      : "border-slate-200 hover:border-amber-300 bg-slate-50/50 dark:border-slate-800 dark:bg-slate-950/20 text-slate-700 dark:text-slate-300"
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-black flex items-center gap-1.5 text-amber-900 dark:text-amber-300">
                      <Sparkles className="w-4 h-4 text-amber-600" />
                      <span>VdoCipher Hollywood DRM</span>
                    </span>
                    <span className="text-[9.5px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-300 font-bold">
                      مفتوح بكلمة السر 🔓
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-tight">
                    تشفير هوليوود عالي الأمان مع حجب كلي لبرامج تصوير الشاشة وتنزيل الفيديو.
                  </p>
                </button>
              )}

              {/* Option 4: Axinom Multi-DRM (إذا تم إدخال كلمة سر الحماية) */}
              {drmUnlocked && (
                <button
                  type="button"
                  onClick={() => {
                    setProvider("axinom");
                    if (sourceMode === "youtube") setSourceMode("upload");
                  }}
                  className={`p-3 rounded-2xl border text-right transition-all cursor-pointer flex flex-col justify-between ${
                    provider === "axinom"
                      ? "border-cyan-600 bg-cyan-50/80 dark:border-cyan-500 dark:bg-cyan-950/40 text-cyan-950 dark:text-cyan-200 ring-2 ring-cyan-500/20 shadow-xs"
                      : "border-slate-200 hover:border-cyan-300 bg-slate-50/50 dark:border-slate-800 dark:bg-slate-950/20 text-slate-700 dark:text-slate-300"
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-black flex items-center gap-1.5 text-cyan-900 dark:text-cyan-300">
                      <ShieldAlert className="w-4 h-4 text-cyan-600" />
                      <span>Axinom Multi-DRM</span>
                    </span>
                    <span className="text-[9.5px] px-1.5 py-0.5 rounded-full bg-cyan-100 text-cyan-800 dark:bg-cyan-900/60 dark:text-cyan-300 font-bold">
                      مفتوح بكلمة السر 🔓
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-tight">
                    تشفير عتادي CENC مع رخص Widevine & FairPlay للأجهزة اللوحية والذكية.
                  </p>
                </button>
              )}
            </div>
          </div>

          {/* ── 3. نافذة إدخال كلمة سر الحماية (Unlock Protection Modal) ── */}
          {showAddSecurityModal && (
            <div className="p-4 rounded-2xl border-2 border-amber-400/80 bg-amber-50/90 dark:bg-slate-900 dark:border-amber-500/80 shadow-lg space-y-3 animate-in fade-in zoom-in-95 duration-150">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-amber-500 text-white flex items-center justify-center shadow-xs">
                    <KeyRound className="w-4 h-4 text-white" />
                  </div>
                  <div>
                    <h4 className="text-xs font-black text-slate-900 dark:text-white">
                      تفعيل حماية إضافية (فك قفل DRM)
                    </h4>
                    <p className="text-[10.5px] text-slate-600 dark:text-slate-300">
                      أدخل كلمة سر الحماية لإتاحة محركات التشفير المتقدمة (VdoCipher أو Axinom DRM).
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setShowAddSecurityModal(false);
                    setSecurityInputCode("");
                  }}
                  className="w-6 h-6 rounded-full bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 text-slate-600 dark:text-slate-300 flex items-center justify-center cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              <form onSubmit={handleVerifyExtraSecurity} className="space-y-3">
                <div>
                  <input
                    type="password"
                    value={securityInputCode}
                    onChange={(e) => setSecurityInputCode(e.target.value)}
                    placeholder="أدخل كلمة سر الحماية هنا..."
                    dir="ltr"
                    autoFocus
                    className="w-full px-3.5 py-2 rounded-xl border border-amber-300 dark:border-amber-700 bg-white dark:bg-slate-800 text-xs font-mono text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-amber-500/30"
                  />
                </div>

                <div className="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setShowAddSecurityModal(false);
                      setSecurityInputCode("");
                    }}
                    className="px-3 py-1.5 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 cursor-pointer"
                  >
                    إلغاء
                  </button>
                  <button
                    type="submit"
                    disabled={checkingCode || !securityInputCode.trim()}
                    className="px-4 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50 shadow-xs"
                  >
                    {checkingCode ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>جاري التحقق...</span>
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>تأكيد وفك القفل 🔓</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* ── 4. ACTIVE SOURCE ACTION AREA ── */}

          {/* Mode A: Direct Device Upload */}
          {sourceMode === "upload" && (
            <div className="p-4 rounded-2xl border-2 border-emerald-500/30 bg-emerald-50/30 dark:bg-emerald-950/20 space-y-3">
              <input
                ref={fileInputRef}
                type="file"
                accept="video/mp4,video/quicktime,video/x-matroska,video/webm,video/avi"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    setSelectedFile(file);
                    setUploadSuccessInfo(null);
                    if (!title.trim()) {
                      setTitle(file.name.replace(/\.[^/.]+$/, ""));
                    }
                  }
                }}
                className="hidden"
              />

              {/* Upload Dropzone */}
              <div
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-2xl p-4 text-center cursor-pointer transition-all flex flex-col items-center justify-center gap-2 ${
                  selectedFile
                    ? "border-emerald-500 bg-white dark:bg-slate-900"
                    : "border-emerald-300 dark:border-emerald-800 hover:border-emerald-500 bg-white/80 dark:bg-slate-900/80"
                }`}
              >
                <div className="w-11 h-11 rounded-2xl bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-400 flex items-center justify-center">
                  <FileVideo className="w-6 h-6" />
                </div>
                <div>
                  <p className="text-xs font-bold text-slate-800 dark:text-slate-200">
                    {selectedFile
                      ? selectedFile.name
                      : "اضغط هنا لاختيار ملف الفيديو من جهازك (.mp4, .mov, .mkv)"}
                  </p>
                  <p className="text-[10.5px] text-slate-500 dark:text-slate-400 mt-0.5">
                    {selectedFile
                      ? `الحجم: ${(selectedFile.size / (1024 * 1024)).toFixed(1)} ميجابايت`
                      : "يدعم جميع صيغ الفيديو حتى 2 جيجابايت مع الحماية المحددة أعلاه"}
                  </p>
                </div>
              </div>

              {/* Upload Button */}
              {selectedFile && !uploadSuccessInfo && (
                <div className="space-y-2">
                  <button
                    type="button"
                    onClick={handleDirectFileUpload}
                    disabled={uploading}
                    className="w-full py-2.5 px-4 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 shadow-md"
                  >
                    {uploading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>جاري رفع الفيديو للسيرفر ({uploadProgress}%)...</span>
                      </>
                    ) : (
                      <>
                        <UploadCloud className="w-4 h-4" />
                        <span>بدء رفع ومعالجة الفيديو 🚀</span>
                      </>
                    )}
                  </button>

                  {uploading && (
                    <div className="space-y-1">
                      <div className="w-full h-2.5 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-emerald-600 dark:bg-emerald-500 transition-all duration-300"
                          style={{ width: `${uploadProgress}%` }}
                        />
                      </div>
                      <p className="text-[10px] text-center text-slate-500 font-mono">
                        {uploadProgress}% مكتمل
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* Upload Success Card */}
              {uploadSuccessInfo && (
                <div className="p-3 rounded-xl border border-emerald-300 dark:border-emerald-800 bg-white dark:bg-slate-900 text-emerald-800 dark:text-emerald-300 flex items-center justify-between gap-2 text-xs">
                  <span className="font-bold flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                    <span>تم رفع وتجهيز الفيديو بنجاح بنظام حماية ({provider})!</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedFile(null);
                      setUploadSuccessInfo(null);
                      setProviderVideoId("");
                      fileInputRef.current?.click();
                    }}
                    className="text-[11px] text-slate-500 hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    <RefreshCw className="w-3 h-3" />
                    <span>تغيير الملف</span>
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Mode B: Google Drive Import */}
          {sourceMode === "gdrive" && (
            <div className="p-4 rounded-2xl border-2 border-blue-500/30 bg-blue-50/30 dark:bg-blue-950/20 space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-800 dark:text-slate-200 mb-1">
                  رابط فيديو Google Drive
                </label>
                <input
                  type="url"
                  value={gdriveUrl}
                  onChange={(e) => setGdriveUrl(e.target.value)}
                  placeholder="https://drive.google.com/file/d/.../view أو معرف الملف"
                  dir="ltr"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white text-xs font-mono text-slate-900 outline-none focus:border-blue-500 dark:border-slate-800 dark:bg-slate-900 dark:text-white transition-all shadow-xs"
                />
              </div>

              <div className="text-[10.5px] text-slate-500 dark:text-slate-400 leading-relaxed bg-white/70 dark:bg-slate-900/70 p-2.5 rounded-xl border border-blue-100 dark:border-blue-950">
                <p className="font-bold text-blue-900 dark:text-blue-300">
                  💡 نصيحة لمشاركة الرابط:
                </p>
                <p>
                  اجعل ملف Google Drive متاحاً لمن يملك الرابط (Anyone with the link)، أو شاركه مع حساب الخدمة:
                </p>
                <span className="block font-mono text-[9.5px] text-slate-700 dark:text-slate-300 select-all mt-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-md">
                  code-up-drive-downloader@gen-lang-client-0511580613.iam.gserviceaccount.com
                </span>
              </div>

              <button
                type="button"
                onClick={handleGoogleDriveImport}
                disabled={gdriveImporting || !gdriveUrl.trim()}
                className="w-full py-2.5 px-4 rounded-xl bg-blue-700 hover:bg-blue-800 text-white text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 shadow-md"
              >
                {gdriveImporting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>جاري تنزيل وتشفير الفيديو سحابياً...</span>
                  </>
                ) : (
                  <>
                    <HardDrive className="w-4 h-4" />
                    <span>بدء الاستيراد من Google Drive 🚀</span>
                  </>
                )}
              </button>

              {/* Google Drive Success Card */}
              {gdriveSuccessInfo && (
                <div className="p-3 rounded-xl border border-blue-300 dark:border-blue-800 bg-white dark:bg-slate-900 text-blue-900 dark:text-blue-200 text-xs space-y-1">
                  <div className="flex items-center gap-1.5 font-bold">
                    <CheckCircle2 className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                    <span>تم استيراد الفيديو بنجاح من Google Drive وحمايته بنظام ({provider})!</span>
                  </div>
                  <p className="text-[11px] text-blue-700 dark:text-blue-300">
                    الحجم: {gdriveSuccessInfo.sizeFormatted}
                    {gdriveSuccessInfo.durationMinutes ? ` | المدة: ${gdriveSuccessInfo.durationMinutes} دقيقة` : ""}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Mode C: YouTube */}
          {sourceMode === "youtube" && (
            <div className="p-4 rounded-2xl border-2 border-red-500/30 bg-red-50/30 dark:bg-red-950/20 space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-800 dark:text-slate-200 mb-1">
                  رابط فيديو YouTube أو معرّف الفيديو
                </label>
                <input
                  type="text"
                  value={providerVideoId}
                  onChange={(e) => setProviderVideoId(e.target.value.trim())}
                  placeholder="https://www.youtube.com/watch?v=... أو https://youtu.be/..."
                  dir="ltr"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white text-xs font-mono text-slate-900 outline-none focus:border-red-500 dark:border-slate-800 dark:bg-slate-900 dark:text-white transition-all shadow-xs"
                />
              </div>

              {providerVideoId && (() => {
                const ytId = extractYouTubeVideoId(providerVideoId);
                if (ytId) {
                  return (
                    <div className="p-2.5 rounded-xl border border-red-300 bg-white dark:border-red-800 dark:bg-slate-900 text-red-800 dark:text-red-300 flex items-center justify-between gap-2 text-xs">
                      <span className="font-bold flex items-center gap-1.5">
                        <CheckCircle2 className="w-4 h-4 text-red-600 dark:text-red-400" />
                        <span>معرف يوتيوب صالح: <code className="font-mono">{ytId}</code></span>
                      </span>
                      <a
                        href={`https://www.youtube.com/watch?v=${ytId}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[11px] font-bold text-red-600 dark:text-red-400 hover:underline flex items-center gap-1"
                      >
                        <span>معاينة</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                  );
                }
                return null;
              })()}
            </div>
          )}

          {/* Mode D: Manual Provider Video ID */}
          {sourceMode === "manual" && (
            <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/20 space-y-2">
              <label className="block text-xs font-bold text-slate-800 dark:text-slate-200">
                معرف الفيديو المباشر (Provider Video ID)
              </label>
              <input
                type="text"
                value={providerVideoId}
                onChange={(e) => setProviderVideoId(e.target.value.trim())}
                placeholder="معرف الفيديو الداخلي أو اسم الملف أو Asset ID"
                dir="ltr"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white text-xs font-mono text-slate-900 outline-none focus:border-purple-500 dark:border-slate-800 dark:bg-slate-900 dark:text-white transition-all shadow-xs"
              />
            </div>
          )}

          {/* ── 5. LESSON TITLE (Always Visible) ── */}
          <div>
            <label className="block text-xs font-bold text-slate-800 dark:text-slate-200 mb-1">
              عنوان الدرس <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="مثال: مقدمة تأسيسية - الجزء الأول"
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-xs text-slate-900 outline-none focus:border-emerald-500 focus:bg-white dark:border-slate-800 dark:bg-slate-950 dark:text-white transition-all font-medium shadow-xs"
            />
          </div>

          {/* ── 6. DURATION & WATCHES ── */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            <div>
              <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                مدة الدرس (بالدقائق)
              </label>
              <input
                type="number"
                min="0"
                value={durationMinutes}
                onChange={(e) =>
                  setDurationMinutes(Math.max(0, parseInt(e.target.value, 10) || 0))
                }
                className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-xs font-mono text-slate-900 dark:border-slate-800 dark:bg-slate-950 dark:text-white outline-none"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                مرات المشاهدة لكل طالب
              </label>
              <input
                type="number"
                min="1"
                max="99"
                value={maxWatchesPerUser}
                onChange={(e) =>
                  setMaxWatchesPerUser(Math.max(1, parseInt(e.target.value, 10) || 1))
                }
                className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-xs font-mono text-slate-900 dark:border-slate-800 dark:bg-slate-950 dark:text-white outline-none"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                فتح مجدول (اختياري)
              </label>
              <input
                type="datetime-local"
                value={publishAt}
                onChange={(e) => setPublishAt(e.target.value)}
                dir="ltr"
                className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-[11px] font-mono text-slate-900 dark:border-slate-800 dark:bg-slate-950 dark:text-white outline-none"
              />
            </div>
          </div>

          {/* ── 7. FREE PREVIEW TOGGLE ── */}
          <div className="flex items-center justify-between p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/30">
            <div>
              <p className="text-xs font-bold text-slate-900 dark:text-white">
                درس تجريبي مجاني (Free Preview)
              </p>
              <p className="text-[10.5px] text-slate-500 dark:text-slate-400">
                متاح لجميع الطلاب لتجربة الشرح بدون اشتراك
              </p>
            </div>

            <button
              type="button"
              onClick={() => setIsFree(!isFree)}
              className={`px-3 py-1 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                isFree
                  ? "bg-emerald-50 text-emerald-800 border-emerald-300 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800"
                  : "bg-slate-100 text-slate-600 border-slate-300 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700"
              }`}
            >
              {isFree ? "✅ مجاني" : "❌ مدفوع"}
            </button>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-4 sm:p-5 border-t border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-950/60 flex items-center justify-between gap-2.5">
          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-2 rounded-xl bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-bold transition-all cursor-pointer"
          >
            إلغاء
          </button>

          <div className="flex items-center gap-2">
            {/* The "Add One" Button */}
            <button
              type="button"
              onClick={() => void handleCreateVideo(true)}
              disabled={submitting || uploading || gdriveImporting}
              className="px-4 py-2 rounded-xl bg-emerald-800 hover:bg-emerald-900 text-white dark:bg-emerald-700 dark:hover:bg-emerald-600 text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-xs disabled:opacity-50"
              title="إضافة هذا الدرس وإبقاء النموذج لإضافة التالي"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>أضف واحداً (Add One)</span>
            </button>

            {/* Save and Close */}
            <button
              type="button"
              onClick={() => void handleCreateVideo(false)}
              disabled={submitting || uploading || gdriveImporting}
              className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white dark:bg-slate-800 dark:hover:bg-slate-700 text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-xs disabled:opacity-50"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>حفظ وإنهاء</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
