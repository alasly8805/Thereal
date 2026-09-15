/* eslint-disable @typescript-eslint/no-explicit-any, react/no-unescaped-entities */
"use client";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { ClassicAdminShell } from "@/components/admin/ClassicAdminShell";
import { TeacherCurriculumStudio } from "@/components/admin/teacher/TeacherCurriculumStudio";
import { useToast } from "@/components/ui/Toast";
import { TeacherRequests } from "@/components/admin/TeacherRequests";
import { TeacherFeedback } from "@/components/admin/TeacherFeedback";
import { TeacherQuizResults } from "@/components/admin/TeacherQuizResults";
import { TeacherOverview } from "@/components/admin/TeacherOverview";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { TeacherPublicProfile } from "@/components/admin/TeacherPublicProfile";
import { TeacherExamDashboard } from "@/components/admin/TeacherExamDashboard";
import { EDUCATIONAL_STAGES, SUBJECTS } from "@/types";
import {
  IconPlus, IconTrash, IconFolder, IconVideo, IconFile, IconLink,
  IconClipboard, IconChevronLeft, IconSettings, IconTag, IconBook, IconUsers,
  IconKey, IconShield, IconClock, IconEye, IconDownload,
  IconEdit, IconCheck, IconClose,
} from "@/components/admin/AdminIcons";
import { HomeworkManagerSection, LiveReviewPanel } from "@/components/admin/TeacherHomeworkComponents";
import { ContentFlowManager } from "@/components/admin/ContentFlowManager";
import { extractYouTubeVideoId } from "@/lib/youtube";
import {
  TeacherJSONGuideModal,
  sampleQuizData,
  sampleHomeworkData,
  downloadJsonFile,
} from "@/components/admin/teacher/TeacherJSONGuideModal";
import {
  exportQuizToJson,
  exportHomeworkToJson,
} from "@/components/admin/teacher/TeacherCurriculumModals";

function fileToResizedDataUrl(file: File, max = 600): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = document.createElement("img") as HTMLImageElement;
      img.onload = () => {
        const scale = Math.min(1, max / Math.max(img.width, img.height));
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) return reject(new Error("no ctx"));
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/jpeg", 0.7));
      };
      img.onerror = reject;
      img.src = reader.result as string;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function readJson<T>(res: Response): Promise<T | null> {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

interface Course {
  id: string;
  title: string;
  subject?: string;
  description?: string;
  thumbnailUrl?: string;
  educationalStage?: string;
  maxWatchCount?: number | null;
  sequentialAccess?: boolean;
  homeworkUrl?: string | null;
  folders?: Folder[];
  _count?: { accessCodes?: number };
  isPaid?: boolean;
  price?: number | null;
  discountPercent?: number | null;
  discountExpiresAt?: string | null;
  deliveryMode?: string;
}

interface Folder {
  id: string;
  name: string;
  videos?: Array<{ id: string; title: string; vdoCipherId?: string; videoProvider?: string; providerVideoId?: string; maxWatchesPerUser?: number; durationMinutes?: number; isFree?: boolean }>;
  quizzes?: Array<{ id: string; title?: string; timeLimitMinutes?: number; questions?: any[] }>;
  materials?: Array<{ id: string; title: string; type: string; url: string }>;
  homeworks?: Array<{ id: string; title: string; type: string; description?: string | null; timeLimitMinutes?: number; questions?: any[]; _count?: { questions?: number; submissions?: number } }>;
  _count?: { videos?: number; quizzes?: number; materials?: number; homeworks?: number };
}

interface AccessCode {
  id: string;
  code: string;
  courseId: string;
  isActive?: boolean;
  student?: { id: string; name: string; email?: string; phone?: string | null } | null;
}

// ─── Shared style vocabulary ──────────────────────────────────────────────────
const input =
  "w-full px-3.5 py-2.5 rounded-xl border border-[var(--border)] bg-[var(--bg)] text-[var(--ink)] text-sm placeholder:text-[var(--ink-muted)] focus:outline-none focus:border-sky-400/60 focus:shadow-[0_0_0_3px_rgba(59,130,246,0.15)] transition-all";
const label = "block text-xs font-semibold text-[var(--ink-muted)] mb-1.5";
const primaryBtn =
  "inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-white text-sm font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_4px_14px_-6px_rgba(37,99,235,0.7)]";
const ghostBtn =
  "inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-[var(--border)] text-[var(--ink-muted)] hover:text-[var(--ink)] hover:border-[var(--ink-muted)]/40 text-sm font-semibold transition-colors";
const card = "bg-[var(--surface)] rounded-2xl border border-[var(--border)]";
const cardPad = `${card} p-5 sm:p-6`;

import { ReferredStudentsSection } from "@/components/admin/teacher/ReferredStudentsSection";
import { TeacherSubscriptionsSection } from "@/components/admin/teacher/TeacherSubscriptionsSection";
import { InVideoResponsesSection } from "@/components/admin/InVideoResponsesSection";
import { TeacherAssistantsSection } from "@/components/admin/teacher/TeacherAssistantsSection";
import { StudentPhoneActions } from "@/components/admin/StudentPhoneActions";
import { StudentDossierButton } from "@/components/admin/TeacherStudentDossierModal";

const SECTION_TITLES: Record<string, string> = {
  dashboard: "لوحة التحكم",
  "my-page": "صفحتي",
  "teacher-subscriptions": "حجوزات واشتراكات الطلاب",
  "in-video-responses": "تصحيح الأسئلة المقالية",
  "quiz-results": "نتائج الاختبارات",
  "create-course": "كورس جديد",
  codes: "أكواد الوصول",
  students: "المتعلمين",
  "referred-students": "متابعة الطلاب المُحالين",
  requests: "طلبات زيادة المشاهدات",
  "grade-requests": "طلبات تعديل الدرجات",
  tickets: "تذاكر الدعم والاستفسارات",
  feedback: "ملاحظات المتعلمين",
  homework: "إدارة الواجبات",
  review: "مراجعة الإجابات",
  assistants: "المساعدون",
};

interface QuizQuestionInput {
  question: string;
  questionType?: string;
  imageUrl?: string;
  optionA: string;
  optionB: string;
  optionC?: string;
  optionD?: string;
  correctAnswer: string;
  optionsCount?: 2 | 3 | 4;
}

interface NewQuizState {
  title: string;
  folderId: string;
  timeLimitMinutes: number;
  questions: QuizQuestionInput[];
}

export default function TeacherDashboardPage() {
  const router = useRouter();
  const { success: toastSuccess, error: toastError } = useToast();
  const [activeSection, setActiveSection] = useState("dashboard");
  const [courseTab, setCourseTab] = useState<"content" | "flow" | "settings" | "pricing">("content");
  const [courses, setCourses] = useState<Course[]>([]);
  const [selectedCourse, setSelectedCourse] = useState<Course | null>(null);
  const [plans, setPlans] = useState<Array<{ id: string; title: string; price: number; educationalStage: string; _count?: { accessCodes?: number } }>>([]);
  const [selectedPlan, setSelectedPlan] = useState<any | null>(null);
  const [codeCategory, setCodeCategory] = useState<"courses" | "plans">("courses");
  const [folders, setFolders] = useState<Folder[]>([]);
  const [codes, setCodes] = useState<AccessCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [creatingCourse, setCreatingCourse] = useState(false);
  // Forms
  const [newCourse, setNewCourse] = useState({
    title: "", subject: "", description: "", thumbnailUrl: "", educationalStage: "", deliveryMode: "ONLINE",
  });
  const [newFolder, setNewFolder] = useState("");
  const [newFolderPublishAt, setNewFolderPublishAt] = useState("");
  const [newVideo, setNewVideo] = useState({ title: "", videoProvider: "alasly", providerVideoId: "", durationMinutes: 0, maxWatchesPerUser: 3, publishAt: "", folderId: "" });
  const [nativeUploading, setNativeUploading] = useState(false);
  const [nativeProgress, setNativeProgress] = useState(0);
  const [nativeStatus, setNativeStatus] = useState("");
  const [lastUploadedVideoId, setLastUploadedVideoId] = useState<string | null>(null);
  const [lastCreatedVideoInfo, setLastCreatedVideoInfo] = useState<{ id: string; providerVideoId: string; title: string } | null>(null);

  // ✏️ Inline editing for lesson/video title
  const [editingVideoId, setEditingVideoId] = useState<string | null>(null);
  const [editingVideoTitle, setEditingVideoTitle] = useState("");
  const [savingVideoTitle, setSavingVideoTitle] = useState(false);

  // 📥 Google Drive Import State & Handler
  const [gdriveUrl, setGdriveUrl] = useState("");
  const [gdriveImporting, setGdriveImporting] = useState(false);
  const [gdriveStatus, setGdriveStatus] = useState("");
  const [activeNativeTab, setActiveNativeTab] = useState<"gdrive" | "upload">("gdrive");

  // 🔐 Axinom DRM Security Gate & State
  const [drmUnlocked, setDrmUnlocked] = useState(() => {
    if (typeof window === "undefined") return false;
    return sessionStorage.getItem("gate_drm") === "1";
  });
  const [drmPasswordModal, setDrmPasswordModal] = useState(false);
  const [drmPasswordInput, setDrmPasswordInput] = useState("");
  const [drmChecking, setDrmChecking] = useState(false);
  const [drmError, setDrmError] = useState("");
  const [drmVerifiedPassword, setDrmVerifiedPassword] = useState(() => {
    if (typeof window === "undefined") return "";
    return sessionStorage.getItem("drm_verified_pass") || "";
  });
  const [activeDrmTab, setActiveDrmTab] = useState<"upload" | "gdrive" | "manual">("upload");

  const handleUnlockDrm = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!drmPasswordInput.trim()) {
      setDrmError("يرجى إدخال كلمة المرور");
      return;
    }
    setDrmChecking(true);
    setDrmError("");
    try {
      const res = await fetch("/api/teacher/drm-gate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: drmPasswordInput.trim() }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setDrmError(data.error || "كلمة مرور DRM غير صحيحة");
        return;
      }
      sessionStorage.setItem("gate_drm", "1");
      sessionStorage.setItem("drm_verified_pass", drmPasswordInput.trim());
      setDrmVerifiedPassword(drmPasswordInput.trim());
      setDrmUnlocked(true);
      setDrmPasswordModal(false);
      setDrmPasswordInput("");
      setNewVideo((prev) => ({ ...prev, videoProvider: "axinom", providerVideoId: "" }));
      notify("success", "تم إلغاء قفل خيارات Axinom Multi-DRM بنجاح! 🛡️");
    } catch {
      setDrmError("تعذر الاتصال بالخادم للتحقق من كلمة المرور");
    } finally {
      setDrmChecking(false);
    }
  };

  const handleLockDrm = () => {
    sessionStorage.removeItem("gate_drm");
    sessionStorage.removeItem("drm_verified_pass");
    setDrmUnlocked(false);
    setDrmVerifiedPassword("");
    if (newVideo.videoProvider === "axinom") {
      setNewVideo((prev) => ({ ...prev, videoProvider: "alasly", providerVideoId: "" }));
    }
    notify("success", "تم قفل خيار Axinom DRM مجدداً 🔒");
  };

  // 🔐 VdoCipher Security Gate & State
  const [vdocipherUnlocked, setVdocipherUnlocked] = useState(() => {
    if (typeof window === "undefined") return false;
    return sessionStorage.getItem("gate_vdocipher") === "1";
  });
  const [vdocipherPasswordModal, setVdocipherPasswordModal] = useState(false);
  const [vdocipherPasswordInput, setVdocipherPasswordInput] = useState("");
  const [vdocipherChecking, setVdocipherChecking] = useState(false);
  const [vdocipherError, setVdocipherError] = useState("");
  const [vdocipherVerifiedPassword, setVdocipherVerifiedPassword] = useState(() => {
    if (typeof window === "undefined") return "";
    return sessionStorage.getItem("vdocipher_verified_pass") || "";
  });

  const handleUnlockVdocipher = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!vdocipherPasswordInput.trim()) {
      setVdocipherError("يرجى إدخال كلمة مرور حماية VdoCipher");
      return;
    }
    setVdocipherChecking(true);
    setVdocipherError("");
    try {
      const res = await fetch("/api/teacher/vdocipher/gate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: vdocipherPasswordInput.trim() }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setVdocipherError(data.error || "كلمة مرور حماية VdoCipher غير صحيحة");
        return;
      }
      sessionStorage.setItem("gate_vdocipher", "1");
      sessionStorage.setItem("vdocipher_verified_pass", vdocipherPasswordInput.trim());
      setVdocipherVerifiedPassword(vdocipherPasswordInput.trim());
      setVdocipherUnlocked(true);
      setVdocipherPasswordModal(false);
      setVdocipherPasswordInput("");
      setNewVideo((prev) => ({ ...prev, videoProvider: "vdocipher", providerVideoId: "" }));
      notify("success", "تم إلغاء قفل حماية VdoCipher بنجاح! 🚀");
    } catch {
      setVdocipherError("تعذر الاتصال بالخادم للتحقق من كلمة المرور");
    } finally {
      setVdocipherChecking(false);
    }
  };

  const handleLockVdocipher = () => {
    sessionStorage.removeItem("gate_vdocipher");
    sessionStorage.removeItem("vdocipher_verified_pass");
    setVdocipherUnlocked(false);
    setVdocipherVerifiedPassword("");
    if (newVideo.videoProvider === "vdocipher") {
      setNewVideo((prev) => ({ ...prev, videoProvider: "alasly", providerVideoId: "" }));
    }
    notify("success", "تم قفل خيار VdoCipher DRM مجدداً 🔒");
  };

  // 🎬 Axinom 2-Hour Preview State & Handler
  const [drmPreviewLoading, setDrmPreviewLoading] = useState(false);
  const [drmPreviewData, setDrmPreviewData] = useState<{
    previewUrl: string;
    expiresAt: string;
    assetId: string;
  } | null>(null);

  const handleGenerateDrmPreview = async (targetAssetId?: string) => {
    const asset = (targetAssetId || newVideo.providerVideoId || "").trim();
    if (!asset) {
      notify("error", "يرجى إدخال أو رفع معرّف الفيديو أولاً لإنشاء رابط المعاينة");
      return;
    }
    setDrmPreviewLoading(true);
    try {
      const res = await fetch("/api/teacher/drm-preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assetId: asset,
          title: newVideo.title || "معاينة درس مشفر",
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "فشل إنشاء رابط المعاينة");
      }
      setDrmPreviewData({
        previewUrl: data.previewUrl,
        expiresAt: data.expiresAt,
        assetId: asset,
      });
      notify("success", "تم إنشاء رابط المعاينة المباشر بنجاح (صالح لمدة ساعتين)! 🎬");
    } catch (err: any) {
      notify("error", err.message || "تعذر إنشاء رابط المعاينة");
    } finally {
      setDrmPreviewLoading(false);
    }
  };


  const handleGoogleDriveImport = async () => {
    if (!gdriveUrl.trim()) {
      notify("error", "يرجى إدخال رابط أو معرّف فيديو Google Drive");
      return;
    }

    setGdriveImporting(true);
    setGdriveStatus("جاري الاتصال بـ Google Drive والتحقق من الصلاحيات...");

    try {
      const currentProvider = newVideo.videoProvider || "vdocipher";

      if (currentProvider === "vdocipher") {
        if (!newVideo.folderId) {
          throw new Error("يرجى اختيار المحاضرة أولاً قبل استيراد الفيديو");
        }
        setGdriveStatus("جاري استيراد الفيديو وتمريره مباشرة إلى خوادم VdoCipher...");
        const res = await fetch("/api/teacher/vdocipher/gdrive-import", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            driveUrl: gdriveUrl.trim(),
            title: newVideo.title || undefined,
            folderId: newVideo.folderId,
            durationMinutes: newVideo.durationMinutes || undefined,
          }),
        });
        const data = await res.json();
        if (!res.ok || !data.success) {
          throw new Error(data.error || "فشل استيراد الفيديو من Google Drive");
        }
        setNewVideo((prev) => ({
          ...prev,
          videoProvider: "vdocipher",
          providerVideoId: data.providerVideoId,
          title: prev.title || data.title,
          durationMinutes: prev.durationMinutes || data.durationMinutes || 0,
        }));
        setLastUploadedVideoId(data.providerVideoId);
        setGdriveUrl("");
        notify("success", data.message || "تم استيراد وحماية الفيديو في VdoCipher بنجاح! 🚀");
        return;
      }

      setGdriveStatus("جاري تنزيل الفيديو من Google Drive وحمايته بنظام Native Security...");
      const res = await fetch("/api/teacher/gdrive-import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: gdriveUrl.trim(),
          title: newVideo.title || undefined,
          durationMinutes: newVideo.durationMinutes || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "فشل استيراد الفيديو من Google Drive");
      }

      setNewVideo((prev) => ({
        ...prev,
        videoProvider: currentProvider,
        providerVideoId: data.videoId,
        title: prev.title || data.title,
        durationMinutes: prev.durationMinutes || data.durationMinutes || 0,
      }));
      setLastUploadedVideoId(data.videoId);
      setGdriveUrl("");

      if (currentProvider === "axinom") {
        setGdriveStatus("جاري تشفير الفيديو عتادياً بنظام CENC Widevine + PlayReady...");
        try {
          const currentDrmPass = drmVerifiedPassword || (typeof window !== "undefined" ? sessionStorage.getItem("drm_verified_pass") || "" : "");
          const packRes = await fetch("/api/teacher/drm-package", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ videoId: data.videoId, drmPassword: currentDrmPass }),
          });
          const packData = await packRes.json();
          if (packRes.ok && packData.success && packData.assetId) {
            const packagedId = packData.assetId;
            setNewVideo((prev) => ({ ...prev, providerVideoId: packagedId }));
            setLastUploadedVideoId(packagedId);
            handleGenerateDrmPreview(packagedId);
            notify(
              "success",
              packData.status === "ready"
                ? "تم تشفير الفيديو عتادياً بـ CENC Widevine + PlayReady بنجاح! 🔒"
                : "بدأ التشفير العتادي CENC في الخلفية 🔒 — يمكنك حفظ الدرس الآن وستُفعَّل الحماية تلقائياً عند الانتهاء."
            );
            return;
          }
        } catch (e) {
          console.warn("Axinom packaging error:", e);
        }
        handleGenerateDrmPreview(data.videoId);
      }

      notify("success", data.message || "تم استيراد وتحميل الفيديو من Google Drive وحمايته بنجاح! 🎉");
    } catch (err: any) {
      notify("error", err.message || "تعذر استيراد الفيديو من Google Drive");
    } finally {
      setGdriveImporting(false);
      setGdriveStatus("");
    }

  };

  const handleNativeFileUpload = async (file: File) => {
    if (!file) return;
    setNativeUploading(true);
    setNativeProgress(0);
    setNativeStatus("جاري تحضير رابط الرفع الموقّع...");

    try {
      if (newVideo.videoProvider === "vdocipher") {
        if (!newVideo.folderId) {
          throw new Error("يرجى اختيار المحاضرة أولاً قبل رفع الفيديو");
        }
        setNativeStatus("جاري حجز تذكرة الرفع من أفضل حساب VdoCipher...");
        const ticketRes = await fetch("/api/teacher/vdocipher/upload-ticket", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: newVideo.title || file.name.replace(/\.[^/.]+$/, ""),
            folderId: newVideo.folderId,
            durationMinutes: newVideo.durationMinutes,
            estimatedSizeBytes: file.size,
          }),
        });
        const ticketData = await ticketRes.json();
        if (!ticketRes.ok || !ticketData.success) {
          throw new Error(ticketData.error || "تعذر إنشاء تذكرة رفع VdoCipher");
        }

        setNativeStatus("جاري رفع الفيديو مباشرة إلى VdoCipher...");
        await new Promise<void>((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          const formData = new FormData();
          const payload = ticketData.clientPayload;
          for (const key of Object.keys(payload)) {
            if (key !== "uploadLink") {
              formData.append(key, payload[key]);
            }
          }
          formData.append("file", file);

          xhr.open("POST", ticketData.uploadLink, true);
          xhr.upload.onprogress = (e) => {
            if (e.lengthComputable) {
              const percent = Math.round((e.loaded / e.total) * 100);
              setNativeProgress(percent);
            }
          };

          xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) {
              resolve();
            } else {
              reject(new Error(`فشل رفع الفيديو إلى خوادم التخزين (رمز: ${xhr.status})`));
            }
          };
          xhr.onerror = () => reject(new Error("حدث انقطاع في الاتصال أثناء الرفع"));
          xhr.send(formData);
        });

        setNativeStatus("جاري معالجة وتأكيد إرفاق الفيديو...");
        await fetch("/api/teacher/vdocipher/complete-upload", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            videoId: ticketData.videoId,
            durationMinutes: newVideo.durationMinutes,
            sizeBytes: file.size,
          }),
        });

        setNewVideo((prev) => ({
          ...prev,
          providerVideoId: ticketData.providerVideoId,
          title: prev.title || file.name.replace(/\.[^/.]+$/, ""),
        }));
        setLastUploadedVideoId(ticketData.providerVideoId);
        notify("success", `تم رفع الفيديو بنجاح وحمايته بأعلى درجات الـ DRM! (معرف: ${ticketData.providerVideoId}) 🚀`);
        return;
      }

      // 1. Init upload via server route
      const initRes = await fetch("/api/teacher/native-upload", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "init",
          filename: file.name,
          contentType: file.type || "video/mp4",
          size: file.size,
        }),
      });

      const initData = await initRes.json();
      if (!initRes.ok || !initData.success) {
        throw new Error(initData.error || "تعذر بدء عملية الرفع");
      }

      const { uploadUrl, assetId, isLocal } = initData;

      // 2. Upload directly to signed URL or local server endpoint with XHR progress
      setNativeStatus("جاري رفع الملف للسيرفر...");

      if (isLocal || uploadUrl === "/api/teacher/native-upload") {
        const uploadedVideoId = await new Promise<string>((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          const formData = new FormData();
          formData.append("file", file);

          xhr.open("POST", "/api/teacher/native-upload", true);
          xhr.withCredentials = true;
          xhr.setRequestHeader("X-Filename", encodeURIComponent(file.name));

          xhr.upload.onprogress = (e) => {
            if (e.lengthComputable) {
              const percent = Math.round((e.loaded / e.total) * 100);
              setNativeProgress(percent);
            }
          };

          xhr.onload = () => {
            try {
              if (xhr.status === 413) {
                reject(new Error("حجم الفيديو كبير جداً بالنسبة لإعدادات السيرفر (Nginx Body Limit). يُرجى استخدام خيار 'استيراد من Google Drive' المباشر."));
                return;
              }
              if (xhr.status === 401 || xhr.status === 403) {
                reject(new Error("انتهت جلسة تسجيل الدخول أو غير مصرح لك بالرفع."));
                return;
              }
              const resJson = JSON.parse(xhr.responseText);
              if (xhr.status >= 200 && xhr.status < 300 && resJson.success) {
                resolve(resJson.videoId || resJson.assetId);
              } else {
                reject(new Error(resJson.error || `فشل رفع الملف (رمز الاستجابة: ${xhr.status})`));
              }
            } catch {
              reject(new Error("حدث خطأ في معالجة استجابة السيرفر"));
            }
          };

          xhr.onerror = () => {
            reject(new Error("تعذر إكمال الرفع عبر الشبكة (قد يكون حجم الملف أكبر من الحد المسموح في السيرفر). جرّب استخدام 'استيراد من Google Drive' كبديل سريع ومباشر."));
          };
          xhr.send(formData);
        });

        setNewVideo((prev) => ({
          ...prev,
          providerVideoId: uploadedVideoId,
          title: prev.title || file.name.replace(/\.[^/.]+$/, ""),
        }));
        setLastUploadedVideoId(uploadedVideoId);

        if (newVideo.videoProvider === "axinom") {
          setNativeStatus("جاري تشفير الفيديو عتادياً بنظام CENC Widevine + PlayReady...");
          try {
            const currentDrmPass = drmVerifiedPassword || (typeof window !== "undefined" ? sessionStorage.getItem("drm_verified_pass") || "" : "");
            const packRes = await fetch("/api/teacher/drm-package", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ videoId: uploadedVideoId, drmPassword: currentDrmPass }),
            });
            const packData = await packRes.json();
            if (packRes.ok && packData.success && packData.assetId) {
              const packagedId = packData.assetId;
              setNewVideo((prev) => ({ ...prev, providerVideoId: packagedId }));
              setLastUploadedVideoId(packagedId);
              handleGenerateDrmPreview(packagedId);
              notify(
                "success",
                packData.status === "ready"
                  ? "تم تشفير الفيديو عتادياً بـ CENC Widevine + PlayReady بنجاح! 🔒 (شاشة سوداء عند التصوير)"
                  : "بدأ التشفير العتادي CENC في الخلفية 🔒 — يمكنك حفظ الدرس الآن وستُفعَّل الحماية تلقائياً عند الانتهاء."
              );
              return;
            }
          } catch (e) {
            console.warn("Automated packaging fallback:", e);
          }
          handleGenerateDrmPreview(uploadedVideoId);
        }

        notify("success", `تم رفع الفيديو بنجاح! معرّف الفيديو: ${uploadedVideoId}`);
        return;

      }

      if (uploadUrl) {
        await new Promise<void>((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.open("PUT", uploadUrl, true);
          if (file.type) xhr.setRequestHeader("Content-Type", file.type);

          xhr.upload.onprogress = (e) => {
            if (e.lengthComputable) {
              const percent = Math.round((e.loaded / e.total) * 100);
              setNativeProgress(percent);
            }
          };

          xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) {
              resolve();
            } else {
              reject(new Error(`فشل رفع الملف (رمز الاستجابة: ${xhr.status})`));
            }
          };

          xhr.onerror = () => reject(new Error("حدث خطأ في شبكة الاتصال أثناء الرفع"));
          xhr.send(file);
        });
      }

      // 3. Complete upload
      setNativeStatus("جاري تأكيد ومعالجة الفيديو...");
      const completeRes = await fetch("/api/teacher/native-upload", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "complete", assetId }),
      });

      const completeData = await completeRes.json();
      if (!completeRes.ok || !completeData.success) {
        throw new Error(completeData.error || "فشل تأكيد الرفع");
      }

      const finalVideoId = completeData.videoId || assetId;
      setNewVideo((prev) => ({
        ...prev,
        providerVideoId: finalVideoId,
        title: prev.title || file.name.replace(/\.[^/.]+$/, ""),
      }));
      setLastUploadedVideoId(finalVideoId);

      if (newVideo.videoProvider === "axinom") {
        handleGenerateDrmPreview(finalVideoId);
      }

      notify("success", `تم رفع وتأكيد الفيديو بنجاح! معرّف الفيديو: ${finalVideoId}`);
    } catch (err: any) {
      notify("error", err.message || "حدث خطأ أثناء رفع الفيديو");
    } finally {
      setNativeUploading(false);
      setNativeProgress(0);
      setNativeStatus("");

    }
  };
  const [showJsonGuide, setShowJsonGuide] = useState(false);
  const [newFolderHomework, setNewFolderHomework] = useState({
    folderId: "",
    title: "",
    description: "",
    type: "exam" as "link" | "exam" | "terminal" | "upload",
    linkUrl: "",
    videoId: "",
    timeLimitMinutes: 30,
    dueAt: "",
    isPublished: true,
    expectedOutput: "",
    codeTemplate: "",
    codeLanguage: "python",
    allowedFileTypes: "pdf,py,js,zip",
    questions: [{ question: "", imageUrl: "", optionA: "", optionB: "", optionC: "", optionD: "", correctAnswer: "A", optionsCount: 4 as 2 | 3 | 4 }],
  });
  const [newQuiz, setNewQuiz] = useState<NewQuizState>({
    title: "", folderId: "",
    timeLimitMinutes: 30,
    questions: [{ question: "", questionType: "mcq", imageUrl: "", optionA: "", optionB: "", optionC: "", optionD: "", correctAnswer: "A" }],
  });
  const [newMaterial, setNewMaterial] = useState({ title: "", url: "", type: "pdf", folderId: "" });
  const [courseSettings, setCourseSettings] = useState({
    title: "", subject: "", description: "", thumbnailUrl: "", educationalStage: "", maxWatchCount: 3, sequentialAccess: true, homeworkUrl: "", deliveryMode: "ONLINE",
  });
  const [showExternalThumbUrl, setShowExternalThumbUrl] = useState(false);
  const [pricingSettings, setPricingSettings] = useState({
    isPaid: false, price: "", discountPercent: "", discountExpiresAt: "", allowDirectInstall: false,
  });
  const [savingPricing, setSavingPricing] = useState(false);

  // Bulk codes generation state
  const [bulkCount, setBulkCount] = useState(10);
  const [bulkPrefix, setBulkPrefix] = useState("");
  const [bulkGenerating, setBulkGenerating] = useState(false);

  // Video timed questions state
  const [expandedQuestions, setExpandedQuestions] = useState<Record<string, boolean>>({});
  const [videoQuestions, setVideoQuestions] = useState<Record<string, any[]>>({});
  const [loadingQuestions, setLoadingQuestions] = useState<Record<string, boolean>>({});
  const [addQuestionStates, setAddQuestionStates] = useState<Record<string, any>>({});
  const [reviewPanelState, setReviewPanelState] = useState<any>(null);
  const [homeworkManagement, setHomeworkManagement] = useState<any>(null);

  // In-app confirm dialog (replaces window.confirm)
  const [confirmState, setConfirmState] = useState<
    { title: string; message?: string; confirmLabel?: string; resolve: (v: boolean) => void } | null
  >(null);
  const askConfirm = (opts: { title: string; message?: string; confirmLabel?: string }) =>
    new Promise<boolean>((resolve) => setConfirmState({ ...opts, resolve }));

  const notify = (type: "success" | "error", text: string) => {
    if (type === "success") toastSuccess(text);
    else toastError(text);
  };

  const updateStudentAccess = async (studentId: string, action: "ban" | "unban") => {
    if (!selectedCourse) return;
    const res = await fetch("/api/admin/students", {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ studentId, courseId: selectedCourse.id, action }),
    });
    const data = await readJson<{ error?: string; message?: string }>(res);
    if (res.ok) {
      fetchCodes(selectedCourse.id);
      notify("success", data?.message || (action === "ban" ? "تم حظر المتعلم بنجاح" : "تم إلغاء حظر المتعلم"));
    } else {
      notify("error", data?.error || "تعذر تحديث حالة المتعلم");
    }
  };

  const resetDevices = async (studentId: string, studentName: string) => {
    if (!confirm(`سيُسمح للطالب «${studentName}» بتسجيل الدخول من جهاز جديد (سيُطلب من الأجهزة الحالية تسجيل الدخول مجدداً). متابعة؟`)) return;
    const res = await fetch(`/api/admin/students/${studentId}/reset-devices`, { method: "POST", credentials: "include" });
    const data = await readJson<{ error?: string; cleared?: number }>(res);
    if (res.ok) notify("success", `تم تصفير أجهزة الطالب (${data?.cleared ?? 0})`);
    else notify("error", data?.error || "تعذر تصفير الأجهزة");
  };

  const fetchCourses = useCallback(async () => {
    const res = await fetch("/api/admin/courses", { credentials: "include" });
    const data = await readJson<{ courses?: Course[]; error?: string }>(res);
    if (res.status === 403 && data?.error) {
      router.push("/adminpanel");
      return;
    }
    setCourses(data?.courses || []);
    setLoading(false);
  }, [router]);

  const fetchFolders = async (courseId: string) => {
    const res = await fetch(`/api/admin/courses/${courseId}/folders`, { credentials: "include" });
    const data = await readJson<{ folders?: Folder[] }>(res);
    setFolders(data?.folders || []);
  };

  const fetchCodes = async (targetId: string, isPlan = false) => {
    const param = isPlan ? `planId=${targetId}` : `courseId=${targetId}`;
    const res = await fetch(`/api/admin/codes?${param}`, { credentials: "include" });
    const data = await readJson<{ codes?: AccessCode[] }>(res);
    setCodes(data?.codes || []);
  };

  useEffect(() => {
    const loadCoursesAndPlans = async () => {
      try {
        const [resMe, resCourses, resPlans] = await Promise.all([
          fetch("/api/auth/me", { credentials: "include" }),
          fetch("/api/admin/courses", { credentials: "include" }),
          fetch("/api/plans"),
        ]);
        const me = await readJson<{
          user?: { role?: string };
        }>(resMe);
        const role = me?.user?.role;
        if (role === "assistant") {
          router.replace("/adminpanel/assistant");
          return;
        }
        if (role !== "teacher") {
          router.push("/adminpanel");
          return;
        }
        const dataCourses = await readJson<{ courses?: Course[]; error?: string }>(resCourses);
        if (resCourses.status === 403 && dataCourses?.error) {
          router.push("/adminpanel");
          return;
        }
        const dataPlans = await readJson<{ plans?: any[] }>(resPlans);
        setCourses(dataCourses?.courses || []);
        setPlans(dataPlans?.plans || []);
      } catch {
        setCourses([]);
        setPlans([]);
      } finally {
        setLoading(false);
      }
    };
    void loadCoursesAndPlans();
  }, [router]);

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/adminpanel");
  };

  const createCourse = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      title: newCourse.title.trim(),
      subject: newCourse.subject.trim(),
      description: newCourse.description.trim(),
      thumbnailUrl: newCourse.thumbnailUrl.trim(),
      educationalStage: newCourse.educationalStage.trim(),
      deliveryMode: newCourse.deliveryMode || "ONLINE",
    };
    if (!payload.title || !payload.subject || !payload.educationalStage) {
      notify("error", "العنوان والمادة والمرحلة مطلوبة");
      return;
    }
    setCreatingCourse(true);
    try {
      const res = await fetch("/api/admin/courses", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await readJson<{ error?: string }>(res);
      if (res.ok) {
        notify("success", "تم إنشاء الكورس بنجاح");
        setNewCourse({ title: "", subject: "", description: "", thumbnailUrl: "", educationalStage: "", deliveryMode: "ONLINE" });
        await fetchCourses();
        setActiveSection("courses");
      } else {
        notify("error", data?.error || "تعذر إنشاء الكورس");
      }
    } catch {
      notify("error", "تعذر إنشاء الكورس الآن");
    } finally {
      setCreatingCourse(false);
    }
  };

  const deleteCourse = async (courseId: string) => {
    if (!(await askConfirm({ title: "حذف الكورس", message: "سيتم حذف الكورس وكل محتواه نهائياً. لا يمكن التراجع.", confirmLabel: "حذف الكورس" }))) return;
    const res = await fetch(`/api/admin/courses/${courseId}`, { method: "DELETE", credentials: "include" });
    const data = await readJson<{ error?: string }>(res);
    if (res.ok) {
      notify("success", "تم حذف الكورس بنجاح");
      fetchCourses();
    } else {
      notify("error", data?.error || "تعذر حذف الكورس");
    }
    if (selectedCourse?.id === courseId) setSelectedCourse(null);
  };

  const createFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCourse || !newFolder.trim()) return;
    const res = await fetch(`/api/admin/courses/${selectedCourse.id}/folders`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newFolder, publishAt: newFolderPublishAt || null }),
    });
    const data = await readJson<{ error?: string }>(res);
    if (res.ok) {
      setNewFolder("");
      setNewFolderPublishAt("");
      if (selectedCourse) fetchFolders(selectedCourse.id);
      notify("success", "تم إضافة المحاضرة بنجاح");
    } else {
      notify("error", data?.error || "تعذر إضافة المحاضرة");
    }
  };

  const deleteFolder = async (folderId: string) => {
    if (!selectedCourse) return;
    if (!(await askConfirm({ title: "حذف المحاضرة", message: "سيتم حذف المحاضرة وكل محتواها (فيديوهات، اختبارات، ملحقات). لا يمكن التراجع.", confirmLabel: "حذف المحاضرة" }))) return;
    const res = await fetch(`/api/admin/courses/${selectedCourse.id}/folders`, {
      method: "DELETE",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ folderId }),
    });
    const data = await readJson<{ error?: string }>(res);
    if (res.ok) {
      fetchFolders(selectedCourse.id);
      notify("success", "تم حذف المحاضرة بنجاح");
    } else {
      notify("error", data?.error || "تعذر حذف المحاضرة");
    }
  };

  const addVideo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newVideo.folderId) return;
    const finalProviderVideoId =
      newVideo.videoProvider === "youtube"
        ? extractYouTubeVideoId(newVideo.providerVideoId) || newVideo.providerVideoId.trim()
        : newVideo.providerVideoId.trim();

    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (newVideo.videoProvider === "axinom" && drmVerifiedPassword) {
      headers["x-drm-password"] = drmVerifiedPassword;
    }

    const res = await fetch(`/api/admin/folders/${newVideo.folderId}/videos`, {
      method: "POST",
      credentials: "include",
      headers,
      body: JSON.stringify({
        title: newVideo.title,
        videoProvider: newVideo.videoProvider,
        providerVideoId: finalProviderVideoId,
        durationMinutes: newVideo.durationMinutes,
        maxWatchesPerUser: newVideo.maxWatchesPerUser,
        publishAt: newVideo.publishAt || null,
        drmPassword: drmVerifiedPassword || undefined,
      }),
    });
    const data = await readJson<{ error?: string; video?: { id: string; providerVideoId: string; title: string } }>(res);
    if (res.ok) {
      setNewVideo({ title: "", videoProvider: "vdocipher", providerVideoId: "", durationMinutes: 0, maxWatchesPerUser: 3, publishAt: "", folderId: "" });
      if (selectedCourse) fetchFolders(selectedCourse.id);
      if (data?.video?.id) {
        setLastCreatedVideoInfo({
          id: data.video.id,
          providerVideoId: data.video.providerVideoId || "",
          title: data.video.title || "",
        });
        notify("success", `تم إضافة الفيديو بنجاح! ID الداخلي: ${data.video.id}`);
      } else {
        notify("success", "تم إضافة الفيديو بنجاح");
      }
    } else {
      notify("error", data?.error || "تعذر إضافة الفيديو");
    }
  };

  const deleteVideo = async (videoId: string) => {
    if (!(await askConfirm({ title: "حذف الفيديو", message: "سيتم حذف هذا الفيديو نهائياً.", confirmLabel: "حذف الفيديو" }))) return;
    if (!selectedCourse) return;
    const res = await fetch(`/api/admin/courses/${selectedCourse.id}/videos`, {
      method: "DELETE",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ videoId }),
    });
    const data = await readJson<{ error?: string }>(res);
    if (res.ok) {
      if (selectedCourse) fetchFolders(selectedCourse.id);
      notify("success", "تم حذف الفيديو بنجاح");
    } else {
      notify("error", data?.error || "تعذر حذف الفيديو");
    }
  };

  const patchVideo = async (videoId: string, body: { maxWatchesPerUser?: number; durationMinutes?: number; isFree?: boolean; title?: string }) => {
    try {
      const res = await fetch(`/api/admin/videos/${videoId}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        notify("error", data?.error || "تعذر تحديث الدرس");
        return false;
      }
      if (selectedCourse) fetchFolders(selectedCourse.id);
      return true;
    } catch {
      notify("error", "حدث خطأ أثناء تحديث الدرس");
      return false;
    }
  };
  const updateVideoWatches = (videoId: string, val: number) => patchVideo(videoId, { maxWatchesPerUser: val });

  const handleStartEditingVideoTitle = (video: { id: string; title: string }) => {
    setEditingVideoId(video.id);
    setEditingVideoTitle(video.title);
  };

  const handleCancelEditingVideoTitle = () => {
    setEditingVideoId(null);
    setEditingVideoTitle("");
  };

  const handleSaveVideoTitle = async (videoId: string) => {
    const trimmed = editingVideoTitle.trim();
    if (!trimmed) {
      notify("error", "يرجى كتابة عنوان للدرس");
      return;
    }
    setSavingVideoTitle(true);
    const ok = await patchVideo(videoId, { title: trimmed });
    setSavingVideoTitle(false);
    if (ok) {
      notify("success", "تم تعديل اسم الدرس بنجاح ✓");
      setEditingVideoId(null);
      setEditingVideoTitle("");
    }
  };

  const downloadSampleQuizJson = () => {
    downloadJsonFile("quiz_sample.json", sampleQuizData);
  };

  const downloadSampleHomeworkJson = () => {
    downloadJsonFile("homework_sample.json", sampleHomeworkData);
  };

  const handleQuizJsonImport = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target?.result as string;
        const parsed = JSON.parse(text);
        let importedTitle = "";
        let importedTime = 30;
        let rawQuestions: any[] = [];

        if (Array.isArray(parsed)) {
          rawQuestions = parsed;
        } else if (parsed && typeof parsed === "object") {
          if (typeof parsed.title === "string") importedTitle = parsed.title;
          if (typeof parsed.timeLimitMinutes === "number") importedTime = parsed.timeLimitMinutes;
          if (Array.isArray(parsed.questions)) rawQuestions = parsed.questions;
        }

        if (!rawQuestions || rawQuestions.length === 0) {
          notify("error", "ملف الـ JSON لا يحتوي على أي أسئلة صحيحة");
          return;
        }

        const validQuestions = rawQuestions.map((q, idx) => {
          if (!q || typeof q !== "object") throw new Error(`السؤال ${idx + 1} بتنسيق غير صحيح`);
          const isEssay = q.questionType === "essay";
          const optA = isEssay ? "" : String(q.optionA || q.a || "").trim();
          const optB = isEssay ? "" : String(q.optionB || q.b || "").trim();
          const optC = isEssay ? "" : String(q.optionC || q.c || "").trim();
          const optD = isEssay ? "" : String(q.optionD || q.d || "").trim();
          const count: 2 | 3 | 4 = !optC && !optD ? 2 : !optD ? 3 : 4;
          return {
            question: String(q.question || q.title || "").trim(),
            questionType: isEssay ? "essay" : "mcq",
            optionsCount: count,
            imageUrl: typeof q.imageUrl === "string" ? q.imageUrl.trim() : "",
            optionA: optA,
            optionB: optB,
            optionC: optC,
            optionD: optD,
            correctAnswer: isEssay ? "A" : (["A", "B", "C", "D"].includes(String(q.correctAnswer).toUpperCase()) ? String(q.correctAnswer).toUpperCase() : "A"),
          };
        });

        setNewQuiz((prev) => ({
          ...prev,
          title: importedTitle || prev.title,
          timeLimitMinutes: importedTime || prev.timeLimitMinutes,
          questions: validQuestions,
        }));
        notify("success", `تم استيراد ${validQuestions.length} سؤال من ملف الـ JSON بنجاح ✅`);
      } catch (err: any) {
        notify("error", err?.message || "فشل قراءة ملف الـ JSON، تأكد من صحة التنسيق");
      }
    };
    reader.readAsText(file);
  };

  const addQuiz = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newQuiz.folderId) return;

    for (let i = 0; i < newQuiz.questions.length; i++) {
      const q = newQuiz.questions[i];
      if (!q.question.trim()) {
        notify("error", `يرجى إدخال نص السؤال رقم ${i + 1}`);
        return;
      }
      if (q.questionType !== "essay") {
        if (!q.optionA?.trim() || !q.optionB?.trim()) {
          notify("error", `السؤال رقم ${i + 1} يحتاج إلى خيارين على الأقل (أ وب)`);
          return;
        }
      }
    }

    const cleanedQuestions = newQuiz.questions.map((q) => {
      const isEssay = q.questionType === "essay";
      const count = q.optionsCount || 4;
      return {
        question: q.question.trim(),
        questionType: isEssay ? "essay" : "mcq",
        imageUrl: q.imageUrl?.trim() || undefined,
        optionA: isEssay ? "" : q.optionA.trim(),
        optionB: isEssay ? "" : q.optionB.trim(),
        optionC: isEssay || count < 3 ? "" : (q.optionC?.trim() || ""),
        optionD: isEssay || count < 4 ? "" : (q.optionD?.trim() || ""),
        correctAnswer: isEssay ? "A" : q.correctAnswer,
      };
    });

    const res = await fetch(`/api/admin/folders/${newQuiz.folderId}/quizzes`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: newQuiz.title,
        questions: cleanedQuestions,
        timeLimitMinutes: newQuiz.timeLimitMinutes,
      }),
    });
    const data = await readJson<{ error?: string }>(res);
    if (res.ok) {
      setNewQuiz({
        title: "",
        folderId: "",
        timeLimitMinutes: 30,
        questions: [{ question: "", questionType: "mcq", optionsCount: 4, optionA: "", optionB: "", optionC: "", optionD: "", correctAnswer: "A" }],
      });
      if (selectedCourse) fetchFolders(selectedCourse.id);
      notify("success", "تم إضافة الاختبار بنجاح");
    } else {
      notify("error", data?.error || "تعذر إضافة الاختبار");
    }
  };

  const handleFolderHwJsonImport = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target?.result as string;
        const parsed = JSON.parse(text);
        let importedTitle = "";
        let importedTime = 30;
        let rawQuestions: any[] = [];

        if (Array.isArray(parsed)) {
          rawQuestions = parsed;
        } else if (parsed && typeof parsed === "object") {
          if (typeof parsed.title === "string") importedTitle = parsed.title;
          if (typeof parsed.timeLimitMinutes === "number") importedTime = parsed.timeLimitMinutes;
          if (Array.isArray(parsed.questions)) rawQuestions = parsed.questions;
        }

        if (!rawQuestions || rawQuestions.length === 0) {
          notify("error", "ملف الـ JSON لا يحتوي على أي أسئلة صحيحة");
          return;
        }

        const validQuestions = rawQuestions.map((q, idx) => {
          if (!q || typeof q !== "object") throw new Error(`السؤال ${idx + 1} بتنسيق غير صحيح`);
          const optA = String(q.optionA || q.a || "").trim();
          const optB = String(q.optionB || q.b || "").trim();
          const optC = String(q.optionC || q.c || "").trim();
          const optD = String(q.optionD || q.d || "").trim();
          const count: 2 | 3 | 4 = !optC && !optD ? 2 : !optD ? 3 : 4;
          return {
            question: String(q.question || q.title || "").trim(),
            imageUrl: typeof q.imageUrl === "string" ? q.imageUrl.trim() : "",
            optionsCount: count,
            optionA: optA,
            optionB: optB,
            optionC: optC,
            optionD: optD,
            correctAnswer: (["A", "B", "C", "D"].includes(String(q.correctAnswer).toUpperCase()) ? String(q.correctAnswer).toUpperCase() : "A"),
          };
        });

        setNewFolderHomework((prev) => ({
          ...prev,
          title: importedTitle || prev.title,
          timeLimitMinutes: importedTime || prev.timeLimitMinutes,
          questions: validQuestions,
        }));
        notify("success", `تم استيراد ${validQuestions.length} سؤال من ملف الـ JSON بنجاح ✅`);
      } catch (err: any) {
        notify("error", err?.message || "فشل قراءة ملف الـ JSON، تأكد من صحة التنسيق");
      }
    };
    reader.readAsText(file);
  };

  const addHomeworkToFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFolderHomework.folderId) return;
    const payload: Record<string, unknown> = {
      title: newFolderHomework.title,
      description: newFolderHomework.description || undefined,
      type: newFolderHomework.type,
      courseId: selectedCourse?.id || undefined,
      folderId: newFolderHomework.folderId,
      videoId: newFolderHomework.videoId || undefined,
      dueAt: newFolderHomework.dueAt || undefined,
      timeLimitMinutes: newFolderHomework.timeLimitMinutes,
      isPublished: newFolderHomework.isPublished,
    };
    if (newFolderHomework.type === "link") payload.linkUrl = newFolderHomework.linkUrl;
    if (newFolderHomework.type === "terminal") {
      payload.expectedOutput = newFolderHomework.expectedOutput;
      payload.codeTemplate = newFolderHomework.codeTemplate || undefined;
      payload.codeLanguage = newFolderHomework.codeLanguage;
    }
    if (newFolderHomework.type === "upload") payload.allowedFileTypes = newFolderHomework.allowedFileTypes || undefined;
    if (newFolderHomework.type === "exam") {
      for (let i = 0; i < newFolderHomework.questions.length; i++) {
        const q = newFolderHomework.questions[i];
        if (!q.question.trim()) {
          notify("error", `يرجى كتابة نص السؤال ${i + 1}`);
          return;
        }
        if (!q.optionA?.trim() || !q.optionB?.trim()) {
          notify("error", `السؤال رقم ${i + 1} يحتاج إلى خيارين على الأقل`);
          return;
        }
      }
      payload.questions = newFolderHomework.questions.map((q) => {
        const count = (q as any).optionsCount || 4;
        return {
          question: q.question.trim(),
          imageUrl: q.imageUrl?.trim() || undefined,
          optionA: q.optionA.trim(),
          optionB: q.optionB.trim(),
          optionC: count < 3 ? "" : (q.optionC?.trim() || ""),
          optionD: count < 4 ? "" : (q.optionD?.trim() || ""),
          correctAnswer: q.correctAnswer,
        };
      });
    }

    const res = await fetch("/api/admin/homework", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await readJson<{ error?: string }>(res);
    if (res.ok) {
      setNewFolderHomework({
        folderId: "",
        title: "",
        description: "",
        type: "exam",
        linkUrl: "",
        videoId: "",
        timeLimitMinutes: 30,
        dueAt: "",
        isPublished: true,
        expectedOutput: "",
        codeTemplate: "",
        codeLanguage: "python",
        allowedFileTypes: "pdf,py,js,zip",
        questions: [{ question: "", imageUrl: "", optionA: "", optionB: "", optionC: "", optionD: "", correctAnswer: "A", optionsCount: 4 as 2 | 3 | 4 }],
      });
      if (selectedCourse) fetchFolders(selectedCourse.id);
      notify("success", "تم إضافة الواجب للمحاضرة بنجاح ✅");
    } else {
      notify("error", data?.error || "تعذر إضافة الواجب");
    }
  };

  const deleteHomeworkFromFolder = async (homeworkId: string) => {
    if (!(await askConfirm({ title: "حذف الواجب", message: "سيتم حذف هذا الواجب وجميع إجابات الطلاب المرتبطة به نهائياً.", confirmLabel: "حذف الواجب" }))) return;
    const res = await fetch("/api/admin/homework", {
      method: "DELETE",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ homeworkId }),
    });
    if (res.ok) {
      if (selectedCourse) fetchFolders(selectedCourse.id);
      notify("success", "تم حذف الواجب بنجاح");
    } else {
      notify("error", "تعذر حذف الواجب");
    }
  };

  const deleteQuiz = async (quizId: string) => {
    if (!(await askConfirm({ title: "حذف الاختبار", message: "سيتم حذف هذا الاختبار وجميع نتائج وإجابات الطلاب المرتبطة به نهائياً.", confirmLabel: "حذف الاختبار" }))) return;
    const res = await fetch(`/api/admin/teacher/exam-dashboard?quizId=${quizId}`, {
      method: "DELETE",
      credentials: "include",
    });
    const data = await readJson<{ error?: string; success?: boolean }>(res);
    if (res.ok) {
      if (selectedCourse) fetchFolders(selectedCourse.id);
      notify("success", "تم حذف الاختبار بنجاح");
    } else {
      notify("error", data?.error || "تعذر حذف الاختبار");
    }
  };

  const addMaterial = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMaterial.folderId) return;
    const res = await fetch(`/api/admin/folders/${newMaterial.folderId}/materials`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: newMaterial.title, url: newMaterial.url, type: newMaterial.type }),
    });
    const data = await readJson<{ error?: string }>(res);
    if (res.ok) {
      setNewMaterial({ title: "", url: "", type: "pdf", folderId: "" });
      if (selectedCourse) fetchFolders(selectedCourse.id);
      notify("success", "تم إضافة الملحق بنجاح");
    } else {
      notify("error", data?.error || "تعذر إضافة الملحق");
    }
  };

  const deleteMaterial = async (materialId: string) => {
    if (!(await askConfirm({ title: "حذف الملحق", message: "سيتم حذف هذا الملحق نهائياً.", confirmLabel: "حذف الملحق" }))) return;
    if (!selectedCourse) return;
    const res = await fetch(`/api/admin/courses/${selectedCourse.id}/materials`, {
      method: "DELETE",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ materialId }),
    });
    const data = await readJson<{ error?: string }>(res);
    if (res.ok) {
      if (selectedCourse) fetchFolders(selectedCourse.id);
      notify("success", "تم حذف الملحق بنجاح");
    } else {
      notify("error", data?.error || "تعذر حذف الملحق");
    }
  };

  const generateCodes = async (targetId: string, count: number, isPlan = false) => {
    const body = isPlan ? { planId: targetId, count } : { courseId: targetId, count };
    const res = await fetch("/api/admin/codes", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await readJson<{ error?: string }>(res);
    if (res.ok) {
      fetchCodes(targetId, isPlan);
      notify("success", `تم إنشاء ${count} كود بنجاح`);
    } else {
      notify("error", data?.error || "تعذر إنشاء الأكواد");
    }
  };

  const toggleCode = async (codeId: string, isActive: boolean, isPlan = false) => {
    const res = await fetch("/api/admin/codes", {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ codeId, isActive, isPlanCode: isPlan }),
    });
    const data = await readJson<{ error?: string }>(res);
    if (res.ok) {
      const targetId = isPlan ? selectedPlan?.id : selectedCourse?.id;
      if (targetId) fetchCodes(targetId, isPlan);
      notify("success", isActive ? "تم تفعيل الكود" : "تم تعطيل الكود");
    } else {
      notify("error", data?.error || "تعذر تحديث الكود");
    }
  };

  const handleBulkGenerate = async () => {
    if (!selectedCourse && !selectedPlan) return;
    const targetId = selectedPlan ? selectedPlan.id : selectedCourse!.id;
    const isPlan = !!selectedPlan;
    setBulkGenerating(true);
    try {
      const body = isPlan
        ? { planId: targetId, count: bulkCount, prefix: bulkPrefix, format: "csv" }
        : { courseId: targetId, count: bulkCount, prefix: bulkPrefix, format: "csv" };
      const response = await fetch("/api/admin/codes/bulk", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        notify("error", errData.error || "فشل توليد الأكواد");
        setBulkGenerating(false);
        return;
      }

      // Download CSV
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const contentDisposition = response.headers.get("content-disposition");
      const filenameMatch = contentDisposition?.match(/filename="?([^"]+)"?/);
      a.download = filenameMatch?.[1] || `codes-${targetId}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);

      notify("success", `تم توليد ${bulkCount} كود وتحميل الملف بنجاح`);
      fetchCodes(targetId, isPlan);
    } catch (err) {
      notify("error", "حدث خطأ أثناء الاتصال بالخادم");
    } finally {
      setBulkGenerating(false);
    }
  };

  const loadVideoQuestions = async (videoId: string) => {
    setLoadingQuestions((prev) => ({ ...prev, [videoId]: true }));
    try {
      const res = await fetch(`/api/admin/videos/${videoId}/questions`, { credentials: "include" });
      const data = await res.json();
      if (res.ok && data.questions) {
        setVideoQuestions((prev) => ({ ...prev, [videoId]: data.questions }));
      }
    } catch {
      notify("error", "تعذر تحميل أسئلة الفيديو");
    } finally {
      setLoadingQuestions((prev) => ({ ...prev, [videoId]: false }));
    }
  };

  const toggleVideoQuestions = (videoId: string) => {
    const isNowOpen = !expandedQuestions[videoId];
    setExpandedQuestions((prev) => ({ ...prev, [videoId]: isNowOpen }));
    if (isNowOpen) {
      void loadVideoQuestions(videoId);
    }
  };

  const handleDeleteQuestion = async (videoId: string, questionId: string) => {
    if (!confirm("هل أنت متأكد من حذف هذا السؤال نهائياً؟")) return;
    try {
      const res = await fetch(`/api/admin/videos/${videoId}/questions`, {
        method: "DELETE",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questionId }),
      });
      if (res.ok) {
        notify("success", "تم حذف السؤال بنجاح");
        void loadVideoQuestions(videoId);
      } else {
        const d = await res.json();
        notify("error", d.error || "تعذر حذف السؤال");
      }
    } catch {
      notify("error", "حدث خطأ أثناء حذف السؤال");
    }
  };

  const getAddQuestionState = (videoId: string) => {
    return addQuestionStates[videoId] || {
      triggerTimestamp: "",
      mode: "pause",
      questionType: "mcq",
      questionText: "",
      optionA: "",
      optionB: "",
      optionC: "",
      optionD: "",
      correctOption: "A",
      explanation: "",
      refireOnRewatch: false,
    };
  };

  const updateAddQuestionState = (videoId: string, fields: Partial<any>) => {
    setAddQuestionStates((prev) => ({
      ...prev,
      [videoId]: { ...getAddQuestionState(videoId), ...fields },
    }));
  };

  const handleAddQuestion = async (e: React.FormEvent, videoId: string) => {
    e.preventDefault();
    const state = getAddQuestionState(videoId);

    // Parse MM:SS to seconds
    let seconds = 0;
    if (state.triggerTimestamp.includes(":")) {
      const [m, s] = state.triggerTimestamp.split(":").map(Number);
      if (isNaN(m) || isNaN(s)) {
        notify("error", "توقيت غير صالح. استخدم تنسيق MM:SS");
        return;
      }
      seconds = m * 60 + s;
    } else {
      seconds = Number(state.triggerTimestamp);
      if (isNaN(seconds) || seconds < 0) {
        notify("error", "توقيت غير صالح. أدخل الثواني الإجمالية أو تنسيق MM:SS");
        return;
      }
    }

    try {
      const res = await fetch(`/api/admin/videos/${videoId}/questions`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          triggerSecond: seconds,
          mode: state.mode,
          questionType: state.questionType || "mcq",
          questionText: state.questionText,
          optionA: state.optionA,
          optionB: state.optionB,
          optionC: state.optionC,
          optionD: state.optionD,
          correctOption: state.correctOption,
          explanation: state.explanation,
          refireOnRewatch: state.refireOnRewatch,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        notify("success", "تم إضافة السؤال بنجاح");
        // Reset form
        setAddQuestionStates((prev) => {
          const next = { ...prev };
          delete next[videoId];
          return next;
        });
        void loadVideoQuestions(videoId);
      } else {
        notify("error", data.error || "تعذر إضافة السؤال");
      }
    } catch {
      notify("error", "حدث خطأ أثناء إضافة السؤال");
    }
  };

  // `section` lets each caller stay in its own tab (codes/students) instead of
  // always jumping to the course editor.
  const selectCourse = (course: Course, section: "courses" | "codes" | "students" = "courses") => {
    setSelectedCourse(course);
    setCourseTab("content");
    setCourseSettings({
      title: course.title,
      subject: course.subject || "",
      description: course.description || "",
      thumbnailUrl: course.thumbnailUrl || "",
      educationalStage: course.educationalStage || "",
      maxWatchCount: course.maxWatchCount ?? 3,
      sequentialAccess: course.sequentialAccess ?? true,
      homeworkUrl: course.homeworkUrl || "",
      deliveryMode: (course as any).deliveryMode || "ONLINE",
    });
    setPricingSettings({
      isPaid: course.isPaid ?? false,
      price: course.price != null ? String(course.price) : "",
      discountPercent: course.discountPercent != null ? String(course.discountPercent) : "",
      discountExpiresAt: course.discountExpiresAt
        ? new Date(course.discountExpiresAt).toISOString().slice(0, 16)
        : "",
      allowDirectInstall: (course as any).allowDirectInstall ?? false,
    });
    fetchFolders(course.id);
    fetchCodes(course.id);
    setActiveSection(section);
  };

  const savePricingSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCourse) return;
    setSavingPricing(true);
    const res = await fetch(`/api/admin/courses/${selectedCourse.id}/pricing`, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        isPaid: pricingSettings.isPaid,
        price: pricingSettings.price ? parseFloat(pricingSettings.price) : null,
        discountPercent: pricingSettings.discountPercent ? parseFloat(pricingSettings.discountPercent) : null,
        discountExpiresAt: pricingSettings.discountExpiresAt || null,
        allowDirectInstall: pricingSettings.allowDirectInstall,
      }),
    });
    const data = await readJson<{ error?: string }>(res);
    setSavingPricing(false);
    if (res.ok) {
      notify("success", "تم حفظ إعدادات التسعير");
      fetchCourses();
    } else {
      notify("error", data?.error || "تعذر حفظ إعدادات التسعير");
    }
  };

  const saveCourseSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCourse) return;
    const res = await fetch(`/api/admin/courses/${selectedCourse.id}`, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...courseSettings,
        homeworkUrl: courseSettings.homeworkUrl || null,
        maxWatchCount: courseSettings.maxWatchCount,
        sequentialAccess: courseSettings.sequentialAccess,
        deliveryMode: courseSettings.deliveryMode || "ONLINE",
      }),
    });
    const data = await readJson<{ course?: Course; error?: string }>(res);
    if (res.ok) {
      notify("success", "تم حفظ إعدادات الكورس");
      setSelectedCourse((current) => (current && data?.course ? { ...current, ...data.course } : current));
      fetchCourses();
    } else {
      notify("error", data?.error || "تعذر حفظ إعدادات الكورس");
    }
  };

  const headerTitle =
    activeSection === "courses"
      ? (selectedCourse ? selectedCourse.title : "الكورسات")
      : SECTION_TITLES[activeSection] ?? "لوحة التحكم";

  return (
    <ClassicAdminShell
      role="teacher"
      activeSection={activeSection}
      setActiveSection={(s) => {
        setActiveSection(s);
        if (s !== "courses") setSelectedCourse(null);
      }}
      onLogout={handleLogout}
      headerTitle={headerTitle}
      headerSubtitle="استوديو المعلم الأكاديمي — منصة Code-UP"
      onRefresh={() => {
        fetchCourses();
      }}
      refreshing={loading}
    >
      <div className="space-y-6">
        {activeSection === "courses" && selectedCourse && (
          <div className="flex items-center justify-between p-3.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs mb-4">
            <button
              onClick={() => setSelectedCourse(null)}
              aria-label="رجوع للكورسات"
              className="px-3.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <IconChevronLeft className="w-4 h-4 rtl:rotate-180" />
              <span>العودة لجميع الكورسات</span>
            </button>
            <h2 className="text-xs sm:text-sm font-black text-slate-900 dark:text-white truncate">
              {selectedCourse.title}
            </h2>
          </div>
        )}
          {/* ════════ DASHBOARD (analytics overview) ════════ */}
          {activeSection === "dashboard" && (
            <TeacherOverview
              courses={courses.map((c) => ({ id: c.id, title: c.title }))}
              onCreateCourse={() => setActiveSection("create-course")}
              onGoToMyPage={() => setActiveSection("my-page")}
              loadingCourses={loading}
            />
          )}

          {/* ════════ MY PAGE (public teacher profile) ════════ */}
          {activeSection === "my-page" && <TeacherPublicProfile />}

          {activeSection === "assistants" && <TeacherAssistantsSection />}

          {/* ════════ TEACHER SUBSCRIPTIONS ════════ */}
          {activeSection === "teacher-subscriptions" && <TeacherSubscriptionsSection />}

          {/* ════════ EXAM DASHBOARD ════════ */}
          {activeSection === "exam-dashboard" && (
            <TeacherExamDashboard
              onNavigateToEssayGrading={() => setActiveSection("in-video-responses")}
              onNavigateToResults={() => setActiveSection("quiz-results")}
              onNavigateToCreateQuiz={() => setActiveSection("courses")}
            />
          )}

          {/* ════════ IN-VIDEO RESPONSES ════════ */}
          {activeSection === "in-video-responses" && <InVideoResponsesSection />}

          {/* ════════ REFERRED STUDENTS ════════ */}
          {activeSection === "referred-students" && <ReferredStudentsSection />}

          {/* ════════ COURSES ════════ */}
          {activeSection === "courses" && (
            !selectedCourse ? (
              <div className={`${card} overflow-hidden`}>
                <div className="px-5 py-4 border-b border-[var(--border)] flex items-center justify-between gap-3">
                  <h2 className="font-bold text-[var(--ink)]">كورساتي <span className="text-[var(--ink-muted)] font-normal">({courses.length})</span></h2>
                  <button onClick={() => setActiveSection("create-course")} className={primaryBtn}>
                    <IconPlus className="w-4 h-4" /> <span className="hidden sm:inline">كورس جديد</span>
                  </button>
                </div>
                {courses.length === 0 ? (
                  <EmptyState
                    icon={<IconBook className="w-7 h-7" />}
                    title="لا توجد كورسات"
                    hint="أنشئ كورسك الأول للبدء."
                    action={<button onClick={() => setActiveSection("create-course")} className={primaryBtn}><IconPlus className="w-4 h-4" /> إنشاء كورس</button>}
                  />
                ) : (
                  <ul className="divide-y divide-[var(--border)]">
                    {courses.map((c) => (
                      <li key={c.id} className="px-5 py-4 flex items-center justify-between gap-3">
                        <button onClick={() => selectCourse(c)} className="flex items-center gap-3 min-w-0 text-right flex-1">
                          <CourseThumb course={c} />
                          <div className="min-w-0">
                            <p className="font-bold text-[var(--ink)] truncate">{c.title}</p>
                            <p className="text-xs text-[var(--ink-muted)] truncate">
                              {c.subject} · {c._count?.accessCodes || 0} طالب · {c.folders?.length || 0} محاضرة
                            </p>
                          </div>
                        </button>
                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            type="button"
                            onClick={() => window.open(`/courses/${c.id}/learn`, "_blank")}
                            title="معاينة الكورس كما يراه الطالب"
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-sky-500 bg-sky-500/10 hover:bg-sky-500/20 transition-colors"
                          >
                            <IconEye className="w-3.5 h-3.5" /> <span className="hidden sm:inline">معاينة كطالب</span>
                          </button>
                          <button
                            onClick={() => deleteCourse(c.id)}
                            aria-label="حذف الكورس"
                            className="w-9 h-9 rounded-lg flex items-center justify-center text-[var(--error)] hover:bg-[var(--error)]/10 transition-colors"
                          >
                            <IconTrash className="w-4 h-4" />
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ) : (
              <div className="space-y-5">
                {/* Tabs */}
                <div className="flex items-center gap-1 p-1 rounded-xl bg-[var(--surface)] border border-[var(--border)] w-full sm:w-fit">
                  {([
                    { id: "content", label: "المحتوى", Icon: IconFolder },
                    { id: "flow", label: "مسار وفتح المحتوى 🔒", Icon: IconShield },
                    { id: "settings", label: "الإعدادات", Icon: IconSettings },
                    { id: "pricing", label: "التسعير", Icon: IconTag },
                  ] as const).map((t) => (
                    <button
                      key={t.id}
                      onClick={() => setCourseTab(t.id)}
                      className={`flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-colors ${
                        courseTab === t.id ? "bg-sky-500 text-white" : "text-[var(--ink-muted)] hover:text-[var(--ink)]"
                      }`}
                    >
                      <t.Icon className="w-4 h-4" /> <span>{t.label}</span>
                    </button>
                  ))}
                </div>

                {/* ── CONTENT TAB (Enterprise Curriculum Studio) ── */}
                {courseTab === "content" && (
                  <TeacherCurriculumStudio
                    courseId={selectedCourse.id}
                    courseTitle={selectedCourse.title}
                    folders={folders}
                    onRefreshFolders={async () => {
                      await fetchFolders(selectedCourse.id);
                    }}
                  />
                )}

                {false && courseTab === "content" && (
                  <div className="space-y-5">
                    {/* Add folder */}
                    <div className={cardPad}>
                      <h3 className="font-bold text-[var(--ink)] mb-3 flex items-center gap-2"><IconFolder className="w-4 h-4 text-sky-500" /> إضافة محاضرة</h3>
                      <form onSubmit={createFolder} className="space-y-2">
                        <div className="flex gap-2">
                          <input value={newFolder} onChange={(e) => setNewFolder(e.target.value)} placeholder="مثال: المحاضرة الأولى" className={input} />
                          <button type="submit" disabled={!newFolder.trim()} className={`${primaryBtn} shrink-0`}>
                            <IconPlus className="w-4 h-4" /> <span className="hidden sm:inline">إضافة</span>
                          </button>
                        </div>
                        <div className="flex items-center gap-2">
                          <label className="text-[11px] text-[var(--ink-muted)] whitespace-nowrap"><IconClock className="w-3.5 h-3.5 inline -mt-0.5 me-1" />يُفتح في (اختياري):</label>
                          <input type="datetime-local" value={newFolderPublishAt} onChange={(e) => setNewFolderPublishAt(e.target.value)} className={`${input} text-xs`} dir="ltr" />
                          {newFolderPublishAt && (
                            <button type="button" onClick={() => setNewFolderPublishAt("")} className="text-[11px] text-[var(--ink-muted)] hover:text-[var(--error)] shrink-0">مسح</button>
                          )}
                        </div>
                        <p className="text-[10px] text-[var(--ink-muted)]">عند تحديد موعد، تظل المحاضرة وكل فيديوهاتها مقفلة للطلاب حتى ذلك الوقت.</p>
                      </form>
                    </div>

                    {/* Folders list */}
                    {folders.length === 0 ? (
                      <div className={cardPad}>
                        <EmptyState icon={<IconFolder className="w-7 h-7" />} title="لا توجد محاضرات" hint="أضف أول محاضرة من الحقل بالأعلى، ثم أضف إليها الفيديوهات." />
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {folders.map((f) => (
                          <div key={f.id} className={`${card} p-4 sm:p-5`}>
                            <div className="flex items-center justify-between gap-3 mb-3">
                              <div className="flex items-center gap-2.5 min-w-0">
                                <span className="w-8 h-8 rounded-lg bg-sky-500/12 text-sky-500 dark:text-sky-300 flex items-center justify-center shrink-0">
                                  <IconFolder className="w-4 h-4" />
                                </span>
                                <div className="min-w-0">
                                  <p className="font-bold text-[var(--ink)] truncate">{f.name}</p>
                                  <p className="text-[11px] text-[var(--ink-muted)]">
                                    {f.videos?.length || 0} فيديو · {f.quizzes?.length || 0} اختبار · {f.materials?.length || 0} ملحق
                                  </p>
                                </div>
                              </div>
                              <button
                                onClick={() => deleteFolder(f.id)}
                                aria-label="حذف المحاضرة"
                                className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-[var(--error)] hover:bg-[var(--error)]/10 transition-colors"
                              >
                                <IconTrash className="w-3.5 h-3.5" /> <span className="hidden sm:inline">حذف</span>
                              </button>
                            </div>

                            {(f.videos?.length || f.materials?.length) ? (
                              <div className="space-y-2">
                                {f.videos?.map((video) => {
                                  const prov = video.videoProvider || "vdocipher";
                                  const provLabel = prov === "axinom" ? "Axinom DRM" : prov === "bunny" ? "Bunny CDN" : prov === "youtube" ? "YouTube" : prov === "alasly" ? "Native" : "VdoCipher";
                                  const provColor = prov === "axinom" ? "text-cyan-400 bg-cyan-500/15" : prov === "bunny" ? "text-orange-500 bg-orange-500/12" : prov === "youtube" ? "text-red-500 bg-red-500/12" : prov === "alasly" ? "text-emerald-500 bg-emerald-500/12" : "text-sky-500 bg-sky-500/12";
                                  return (
                                    <div key={video.id} className="flex flex-col gap-2 rounded-xl border border-[var(--border)] bg-[var(--bg)] p-3">
                                      <div className="flex flex-wrap items-center gap-2">
                                        <span className="shrink-0 text-[var(--ink-muted)]"><IconVideo className="w-4 h-4" /></span>
                                        {editingVideoId === video.id ? (
                                          <div className="flex items-center gap-1.5 flex-1 min-w-[220px]">
                                            <input
                                              type="text"
                                              value={editingVideoTitle}
                                              onChange={(e) => setEditingVideoTitle(e.target.value)}
                                              onKeyDown={(e) => {
                                                if (e.key === "Enter") {
                                                  e.preventDefault();
                                                  handleSaveVideoTitle(video.id);
                                                } else if (e.key === "Escape") {
                                                  handleCancelEditingVideoTitle();
                                                }
                                              }}
                                              disabled={savingVideoTitle}
                                              placeholder="اسم الدرس..."
                                              autoFocus
                                              className="flex-1 min-w-0 bg-[var(--surface)] text-[var(--ink)] border border-sky-500 rounded-lg px-2.5 py-1 text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-sky-400"
                                            />
                                            <button
                                              type="button"
                                              onClick={() => handleSaveVideoTitle(video.id)}
                                              disabled={savingVideoTitle}
                                              className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-bold transition-all disabled:opacity-50"
                                              title="حفظ الاسم الجديد (Enter)"
                                            >
                                              <IconCheck className="w-3.5 h-3.5" />
                                              <span>حفظ</span>
                                            </button>
                                            <button
                                              type="button"
                                              onClick={handleCancelEditingVideoTitle}
                                              disabled={savingVideoTitle}
                                              className="shrink-0 inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-[var(--border)] text-[var(--ink-muted)] hover:text-[var(--ink)] text-[11px] font-bold transition-all"
                                              title="إلغاء (Escape)"
                                            >
                                              <IconClose className="w-3.5 h-3.5" />
                                              <span>إلغاء</span>
                                            </button>
                                          </div>
                                        ) : (
                                          <div className="flex items-center gap-2 flex-1 min-w-0">
                                            <p className="text-sm text-[var(--ink)] font-medium truncate min-w-0" title={video.title}>
                                              {video.title}
                                            </p>
                                            <button
                                              type="button"
                                              onClick={() => handleStartEditingVideoTitle(video)}
                                              title="تعديل اسم الدرس"
                                              className="shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-lg border border-[var(--border)] text-[var(--ink-muted)] hover:text-sky-500 hover:border-sky-500/40 hover:bg-sky-500/10 text-[11px] font-semibold transition-colors"
                                            >
                                              <IconEdit className="w-3.5 h-3.5" />
                                              <span>تعديل الاسم</span>
                                            </button>
                                          </div>
                                        )}
                                        <span className={`shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full ${provColor}`}>{provLabel}</span>
                                        {video.isFree && (
                                          <span className="shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-500">مجاني</span>
                                        )}
                                        {/* Free / demo toggle */}
                                        <button
                                          type="button"
                                          onClick={() => patchVideo(video.id, { isFree: !video.isFree })}
                                          aria-pressed={video.isFree}
                                          title="جعله مجانياً / تجريبياً — يشاهده غير المشتركين بلا حدود"
                                          className={`shrink-0 inline-flex items-center gap-1 text-[11px] font-bold px-2 py-1 rounded-lg border transition-colors ${
                                            video.isFree
                                              ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-500"
                                              : "border-[var(--border)] text-[var(--ink-muted)] hover:text-[var(--ink)]"
                                          }`}
                                        >
                                          {video.isFree ? "تجريبي ✓" : "اجعله تجريبياً"}
                                        </button>
                                        {/* Watch limit — only for paid (non-free) videos */}
                                        {!video.isFree && (
                                          <label className="shrink-0 inline-flex items-center gap-1 text-[11px] text-[var(--ink-muted)]">
                                            <IconEye className="w-3.5 h-3.5" />
                                            <select
                                              value={video.maxWatchesPerUser ?? 3}
                                              onChange={(e) => updateVideoWatches(video.id, parseInt(e.target.value))}
                                              className="bg-[var(--surface)] text-[var(--ink)] border border-[var(--border)] rounded-lg pe-1 ps-2 py-1 text-xs font-bold focus:outline-none focus:border-sky-400/60 cursor-pointer"
                                              aria-label="عدد المشاهدات"
                                            >
                                              {[1, 2, 3, 5, 10, 20].map((n) => <option key={n} value={n}>{n}×</option>)}
                                            </select>
                                          </label>
                                        )}
                                        {/* Timed Questions toggle */}
                                        <button
                                          type="button"
                                          onClick={() => toggleVideoQuestions(video.id)}
                                          className={`shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[11px] font-bold transition-all ${
                                            expandedQuestions[video.id]
                                              ? "border-sky-500/40 bg-sky-500/10 text-sky-500"
                                              : "border-[var(--border)] text-[var(--ink-muted)] hover:text-[var(--ink)]"
                                          }`}
                                        >
                                          <span>❓ أسئلة الفيديو</span>
                                          <span className="w-4 h-4 rounded-full bg-[var(--border)] text-[9px] flex items-center justify-center font-bold">
                                            {videoQuestions[video.id]?.length ?? "•"}
                                          </span>
                                        </button>
                                        <button onClick={() => deleteVideo(video.id)} aria-label="حذف الفيديو" className="shrink-0 w-7 h-7 rounded-lg flex items-center justify-center text-[var(--error)] hover:bg-[var(--error)]/10 transition-colors">
                                          <IconTrash className="w-3.5 h-3.5" />
                                        </button>
                                      </div>

                                      {/* Timed Questions Expandable Panel */}
                                      {expandedQuestions[video.id] && (
                                        <div className="mt-2 border-t border-[var(--border)] pt-3 space-y-4 bg-[var(--surface)]/30 rounded-xl p-3">
                                          <h4 className="text-xs font-bold text-[var(--ink)] flex items-center gap-2">
                                            <span>أسئلة هذا الفيديو</span>
                                            {loadingQuestions[video.id] && (
                                              <span className="w-3.5 h-3.5 border-2 border-sky-500/30 border-t-sky-500 rounded-full animate-spin" />
                                            )}
                                          </h4>

                                          {/* Questions list */}
                                          {(!videoQuestions[video.id] || videoQuestions[video.id].length === 0) ? (
                                            <p className="text-xs text-[var(--ink-muted)]">لا توجد أسئلة مضافة لهذا الفيديو بعد.</p>
                                          ) : (
                                            <div className="space-y-3">
                                              {videoQuestions[video.id].map((q) => {
                                                const timeFormatted = `${Math.floor(q.triggerSecond / 60)}:${String(q.triggerSecond % 60).padStart(2, "0")}`;
                                                const isEssayQ = q.questionType === "essay";
                                                return (
                                                  <div key={q.id} className="p-3 bg-[var(--bg)] border border-[var(--border)] rounded-xl flex flex-col gap-2 relative">
                                                    <div className="flex items-center justify-between gap-3">
                                                      <div className="flex items-center gap-2">
                                                        <span className="bg-sky-500/10 text-sky-500 text-[10px] font-bold px-2 py-0.5 rounded-lg" dir="ltr">⏱ {timeFormatted}</span>
                                                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-lg ${isEssayQ ? "bg-purple-500/10 text-purple-500" : "bg-blue-500/10 text-blue-500"}`}>
                                                          {isEssayQ ? "📝 سؤال مقالي" : "اختيار من متعدد"}
                                                        </span>
                                                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-lg ${q.mode === "pause" ? "bg-amber-500/10 text-amber-500" : "bg-teal-500/10 text-teal-500"}`}>
                                                          {q.mode === "pause" ? "إيقاف الفيديو" : "عرض بدون إيقاف"}
                                                        </span>
                                                        {q.refireOnRewatch && (
                                                          <span className="bg-purple-500/10 text-purple-500 text-[10px] font-bold px-2 py-0.5 rounded-lg">إعادة تكرار</span>
                                                        )}
                                                      </div>
                                                      <button
                                                        type="button"
                                                        onClick={() => handleDeleteQuestion(video.id, q.id)}
                                                        className="text-xs text-[var(--error)] hover:underline"
                                                      >
                                                        حذف
                                                      </button>
                                                    </div>
                                                    <p className="text-xs font-semibold text-[var(--ink)]">{q.questionText}</p>
                                                    {!isEssayQ && (
                                                      <div className="grid grid-cols-2 gap-2 text-[11px] text-[var(--ink-muted)] mt-1">
                                                        <div className={q.correctOption === "A" ? "text-emerald-500 font-bold" : ""}>أ) {q.optionA}</div>
                                                        <div className={q.correctOption === "B" ? "text-emerald-500 font-bold" : ""}>ب) {q.optionB}</div>
                                                        <div className={q.correctOption === "C" ? "text-emerald-500 font-bold" : ""}>ج) {q.optionC}</div>
                                                        <div className={q.correctOption === "D" ? "text-emerald-500 font-bold" : ""}>د) {q.optionD}</div>
                                                      </div>
                                                    )}
                                                    {q.explanation && (
                                                      <p className="text-[10px] text-amber-600 dark:text-amber-400 mt-1">الشرح: {q.explanation}</p>
                                                    )}

                                                    {/* Analytics */}
                                                    {q.analytics && q.analytics.totalResponses > 0 && (
                                                      <div className="mt-2 border-t border-[var(--border)]/60 pt-2 flex items-center gap-4 text-[10px] text-[var(--ink-muted)]">
                                                        <span>إجمالي الإجابات: <strong>{q.analytics.totalResponses}</strong></span>
                                                        {!isEssayQ && (
                                                          <span>نسبة الإجابة الصحيحة: <strong className="text-emerald-500">{q.analytics.correctPercent}%</strong></span>
                                                        )}
                                                        <span>متوسط زمن الاستجابة: <strong>+{q.analytics.avgResponseDelay}ث</strong></span>
                                                      </div>
                                                    )}
                                                  </div>
                                                );
                                              })}
                                            </div>
                                          )}

                                          {/* Add timed question form */}
                                          <form onSubmit={(e) => handleAddQuestion(e, video.id)} className="border-t border-[var(--border)] pt-3 space-y-3">
                                            <h5 className="text-[11px] font-bold text-[var(--ink)]">إضافة سؤال جديد للفيديو</h5>
                                            <div className="grid grid-cols-3 gap-2">
                                              <div>
                                                <label className={label}>نوع السؤال *</label>
                                                <select
                                                  value={getAddQuestionState(video.id).questionType || "mcq"}
                                                  onChange={(e) => updateAddQuestionState(video.id, { questionType: e.target.value })}
                                                  className={input}
                                                >
                                                  <option value="mcq">اختيار من متعدد (MCQ)</option>
                                                  <option value="essay">سؤال مقالي (تصحيح يدوي)</option>
                                                </select>
                                              </div>
                                              <div>
                                                <label className={label}>التوقيت (ثواني أو MM:SS) *</label>
                                                <input
                                                  type="text"
                                                  required
                                                  placeholder="مثال: 01:30 أو 90"
                                                  value={getAddQuestionState(video.id).triggerTimestamp}
                                                  onChange={(e) => updateAddQuestionState(video.id, { triggerTimestamp: e.target.value })}
                                                  className={input}
                                                  dir="ltr"
                                                />
                                              </div>
                                              <div>
                                                <label className={label}>طريقة العرض *</label>
                                                <select
                                                  value={getAddQuestionState(video.id).mode}
                                                  onChange={(e) => updateAddQuestionState(video.id, { mode: e.target.value })}
                                                  className={input}
                                                >
                                                  <option value="pause">إيقاف الفيديو حتى الإجابة (Pause)</option>
                                                  <option value="overlay">عرض كارت زاوية بدون إيقاف (Overlay)</option>
                                                </select>
                                              </div>
                                            </div>

                                            <div>
                                              <label className={label}>نص السؤال *</label>
                                              <input
                                                type="text"
                                                required
                                                placeholder="اكتب السؤال بوضوح للطالب..."
                                                value={getAddQuestionState(video.id).questionText}
                                                onChange={(e) => updateAddQuestionState(video.id, { questionText: e.target.value })}
                                                className={input}
                                              />
                                            </div>

                                            {getAddQuestionState(video.id).questionType !== "essay" && (
                                               <>
                                                 <div className="grid grid-cols-2 gap-2">
                                                   <div>
                                                     <label className={label}>الخيار أ *</label>
                                                     <input
                                                       type="text"
                                                       required
                                                       value={getAddQuestionState(video.id).optionA}
                                                       onChange={(e) => updateAddQuestionState(video.id, { optionA: e.target.value })}
                                                       className={input}
                                                     />
                                                   </div>
                                                   <div>
                                                     <label className={label}>الخيار ب *</label>
                                                     <input
                                                       type="text"
                                                       required
                                                       value={getAddQuestionState(video.id).optionB}
                                                       onChange={(e) => updateAddQuestionState(video.id, { optionB: e.target.value })}
                                                       className={input}
                                                     />
                                                   </div>
                                                   <div>
                                                     <label className={label}>الخيار ج *</label>
                                                     <input
                                                       type="text"
                                                       required
                                                       value={getAddQuestionState(video.id).optionC}
                                                       onChange={(e) => updateAddQuestionState(video.id, { optionC: e.target.value })}
                                                       className={input}
                                                     />
                                                   </div>
                                                   <div>
                                                     <label className={label}>الخيار د *</label>
                                                     <input
                                                       type="text"
                                                       required
                                                       value={getAddQuestionState(video.id).optionD}
                                                       onChange={(e) => updateAddQuestionState(video.id, { optionD: e.target.value })}
                                                       className={input}
                                                     />
                                                   </div>
                                                 </div>

                                                 <div className="grid grid-cols-2 gap-2">
                                                   <div>
                                                     <label className={label}>الإجابة الصحيحة *</label>
                                                     <select
                                                       value={getAddQuestionState(video.id).correctOption}
                                                       onChange={(e) => updateAddQuestionState(video.id, { correctOption: e.target.value })}
                                                       className={input}
                                                     >
                                                       <option value="A">الخيار أ</option>
                                                       <option value="B">الخيار ب</option>
                                                       <option value="C">الخيار ج</option>
                                                       <option value="D">الخيار د</option>
                                                     </select>
                                                   </div>
                                                   <div>
                                                     <label className={label}>خيار التكرار</label>
                                                     <div className="flex items-center gap-2 h-[38px]">
                                                       <input
                                                         type="checkbox"
                                                         id={`refire-${video.id}`}
                                                         checked={getAddQuestionState(video.id).refireOnRewatch}
                                                         onChange={(e) => updateAddQuestionState(video.id, { refireOnRewatch: e.target.checked })}
                                                         className="w-4 h-4 text-sky-500 rounded border-[var(--border)] focus:ring-sky-500"
                                                       />
                                                       <label htmlFor={`refire-${video.id}`} className="text-xs text-[var(--ink)] select-none">تكرار السؤال عند إعادة التشغيل</label>
                                                     </div>
                                                   </div>
                                                 </div>
                                               </>
                                             )}

                                             <div>
                                               <label className={label}>الشرح / التفسير (اختياري)</label>
                                              <input
                                                type="text"
                                                placeholder="شرح مبسط يظهر للمتعلم بعد الإجابة..."
                                                value={getAddQuestionState(video.id).explanation}
                                                onChange={(e) => updateAddQuestionState(video.id, { explanation: e.target.value })}
                                                className={input}
                                              />
                                            </div>

                                            <button
                                              type="submit"
                                              className={`${primaryBtn} w-full text-xs py-2`}
                                            >
                                              حفظ السؤال
                                            </button>
                                          </form>
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                                 {f.quizzes?.map((qz) => (
                                    <div key={qz.id} className="flex items-center gap-2 rounded-xl border border-sky-500/20 bg-sky-500/5 px-3 py-2.5">
                                      <span className="shrink-0 text-sky-500"><IconClipboard className="w-4 h-4" /></span>
                                      <p className="text-sm text-[var(--ink)] font-bold truncate flex-1 min-w-0">{qz.title || "اختبار المحاضرة"}</p>
                                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-sky-500/20 text-sky-500">اختبار</span>
                                      <button
                                        type="button"
                                        onClick={() => exportQuizToJson(qz)}
                                        aria-label="تحميل وتصدير الاختبار كملف JSON"
                                        title="تحميل وتصدير الاختبار كملف JSON"
                                        className="shrink-0 w-7 h-7 rounded-lg flex items-center justify-center text-sky-500 hover:bg-sky-500/15 transition-colors cursor-pointer"
                                      >
                                        <IconDownload className="w-3.5 h-3.5" />
                                      </button>
                                      <button onClick={() => deleteQuiz(qz.id)} aria-label="حذف الاختبار" className="shrink-0 w-7 h-7 rounded-lg flex items-center justify-center text-[var(--error)] hover:bg-[var(--error)]/10 transition-colors">
                                        <IconTrash className="w-3.5 h-3.5" />
                                      </button>
                                    </div>
                                  ))}
                                 {f.homeworks?.map((hw) => (
                                   <div key={hw.id} className="flex items-center gap-2 rounded-xl border border-amber-500/20 bg-amber-500/5 px-3 py-2.5">
                                     <span className="shrink-0 text-amber-500"><IconBook className="w-4 h-4" /></span>
                                     <div className="flex-1 min-w-0">
                                       <p className="text-sm text-[var(--ink)] font-bold truncate">{hw.title}</p>
                                       <p className="text-[10px] text-[var(--ink-muted)]">{hw.type === "exam" ? "واجب أسئلة" : hw.type === "terminal" ? "كود برمجي" : hw.type === "upload" ? "تسليم ملف" : "رابط"}</p>
                                     </div>
                                     <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-500">واجب</span>
                                     {hw.type === "exam" && (
                                       <button
                                         type="button"
                                         onClick={() => exportHomeworkToJson(hw)}
                                         aria-label="تحميل وتصدير الواجب كملف JSON"
                                         title="تحميل وتصدير الواجب كملف JSON"
                                         className="shrink-0 w-7 h-7 rounded-lg flex items-center justify-center text-amber-500 hover:bg-amber-500/15 transition-colors cursor-pointer"
                                       >
                                         <IconDownload className="w-3.5 h-3.5" />
                                       </button>
                                     )}
                                     <button onClick={() => deleteHomeworkFromFolder(hw.id)} aria-label="حذف الواجب" className="shrink-0 w-7 h-7 rounded-lg flex items-center justify-center text-[var(--error)] hover:bg-[var(--error)]/10 transition-colors">
                                       <IconTrash className="w-3.5 h-3.5" />
                                     </button>
                                   </div>
                                 ))}
                                 {f.materials?.map((m) => (
                                  <div key={m.id} className="flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2.5">
                                    <span className="shrink-0 text-[var(--ink-muted)]">{m.type === "pdf" ? <IconFile className="w-4 h-4" /> : <IconLink className="w-4 h-4" />}</span>
                                    <p className="text-sm text-[var(--ink)] font-medium truncate flex-1 min-w-0">{m.title}</p>
                                    <button onClick={() => deleteMaterial(m.id)} aria-label="حذف الملحق" className="shrink-0 w-7 h-7 rounded-lg flex items-center justify-center text-[var(--error)] hover:bg-[var(--error)]/10 transition-colors">
                                      <IconTrash className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <p className="text-xs text-[var(--ink-muted)] py-2">لا يوجد محتوى في هذه المحاضرة بعد.</p>
                            )}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Add video + material */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                      {/* Add video */}
                      <div className={cardPad}>
                        <h3 className="font-bold text-[var(--ink)] flex items-center gap-2"><IconVideo className="w-4 h-4 text-sky-500" /> إضافة فيديو</h3>
                        <p className="text-xs text-[var(--ink-muted)] mt-1 mb-4">اختر مزود الحماية ثم أدخل معرف الفيديو المناسب</p>
                        <form onSubmit={addVideo} className="space-y-3">
                          <select value={newVideo.folderId} onChange={(e) => setNewVideo({ ...newVideo, folderId: e.target.value })} className={input}>
                            <option value="">اختر المحاضرة</option>
                            {folders.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                          </select>
                          <input type="text" value={newVideo.title} onChange={(e) => setNewVideo({ ...newVideo, title: e.target.value })} placeholder="عنوان الفيديو" className={input} />

                          {/* Provider selector */}
                          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                            {([
                              {
                                value: "axinom",
                                label: "Axinom DRM",
                                badge: drmUnlocked ? "مفعّل 🛡️" : "مقيد بكلمة سر 🔒",
                                level: "أعلى حماية عتادية",
                                locked: !drmUnlocked,
                              },
                              {
                                value: "vdocipher",
                                label: "VdoCipher",
                                badge: vdocipherUnlocked ? "مفعّل 🔓" : "مقيد بكلمة سر 🔒",
                                level: "أعلى أماناً",
                                locked: !vdocipherUnlocked,
                              },
                              { value: "alasly", label: "Native", badge: "Super Native", level: "عالي", locked: false },
                              { value: "bunny", label: "Bunny CDN", badge: "حماية متوسطة", level: "متوسط", locked: false },
                              { value: "youtube", label: "YouTube", badge: "اقتصادي", level: "منخفض", locked: false },
                            ] as const).map(({ value, label: pl, badge, level, locked }) => {
                              const active = newVideo.videoProvider === value;
                              return (
                                <button
                                  key={value}
                                  type="button"
                                  onClick={() => {
                                    if (value === "axinom" && !drmUnlocked) {
                                      setDrmPasswordModal(true);
                                      return;
                                    }
                                    if (value === "vdocipher" && !vdocipherUnlocked) {
                                      setVdocipherPasswordModal(true);
                                      return;
                                    }
                                    setNewVideo({ ...newVideo, videoProvider: value, providerVideoId: "" });
                                  }}
                                  className={`flex flex-col items-center gap-1 p-2.5 rounded-xl border-2 text-xs font-bold transition-all cursor-pointer ${
                                    active
                                      ? "border-sky-500 bg-sky-500/10 text-sky-500 dark:text-sky-300 shadow-sm"
                                      : locked
                                      ? "border-amber-500/30 bg-amber-500/5 text-amber-500 dark:text-amber-400 hover:border-amber-500/60"
                                      : "border-[var(--border)] text-[var(--ink-muted)] hover:border-[var(--ink-muted)]/40"
                                  }`}
                                >
                                  {locked ? <span className="text-sm">🔒</span> : <IconShield className="w-4 h-4" />}
                                  <span className="truncate w-full text-center">{pl}</span>
                                  <span
                                    className={`text-[8.5px] px-1.5 py-0.5 rounded-full font-bold ${
                                      active
                                        ? "bg-sky-500/20 text-sky-600 dark:text-sky-300"
                                        : locked
                                        ? "bg-amber-500/20 text-amber-500 dark:text-amber-300"
                                        : "bg-[var(--border)]"
                                    }`}
                                  >
                                    {badge}
                                  </span>
                                  <span className="text-[8px] text-[var(--ink-muted)] font-normal">{level}</span>
                                </button>
                              );
                            })}
                          </div>

                          {/* Provider ID */}
                          <div>
                            <label className={label}>
                              {newVideo.videoProvider === "axinom" && "معرف فيديو Axinom Multi-DRM (أو ارفعه مباشرة من السيرفر)"}
                              {newVideo.videoProvider === "vdocipher" && "VdoCipher Video ID — أعلى حماية مشفرة (Highest DRM)"}
                              {newVideo.videoProvider === "alasly" && "معرف درس Native — حماية عالية (Super Native Security)"}
                              {newVideo.videoProvider === "bunny" && "Bunny Stream Video GUID — حماية متوسطة (Medium CDN Security)"}
                              {newVideo.videoProvider === "youtube" && "رابط الفيديو أو معرّف YouTube (يدعم youtu.be / youtube.com / المعرف المباشر)"}
                            </label>
                            <input
                              type="text"
                              value={newVideo.providerVideoId}
                              onChange={(e) => setNewVideo({ ...newVideo, providerVideoId: e.target.value.trim() })}
                              placeholder={newVideo.videoProvider === "axinom" ? "مثال: lesson_101 أو ارفعه أدناه" : newVideo.videoProvider === "vdocipher" ? "مثال: abc123def456" : newVideo.videoProvider === "bunny" ? "مثال: 12345678-abcd-…" : newVideo.videoProvider === "alasly" ? "أدخل معرف الدرس أو قم برفع الملف مباشرة أدناه" : "ضع رابط الفيديو مثل: https://youtu.be/... أو المعرّف"}
                              dir="ltr"
                              className={`${input} font-mono`}
                            />
                            {/* YouTube live URL detection & validation badge */}
                            {newVideo.videoProvider === "youtube" && newVideo.providerVideoId && (() => {
                              const ytId = extractYouTubeVideoId(newVideo.providerVideoId);
                              if (ytId) {
                                return (
                                  <div className="mt-2 p-2.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-300 flex items-center justify-between gap-2 text-xs">
                                    <div className="flex items-center gap-1.5 font-bold">
                                      <span className="text-emerald-400">✓</span>
                                      <span>تم التعرف على الفيديو بنجاح! معرّف YouTube:</span>
                                      <span className="font-mono bg-black/40 px-2 py-0.5 rounded text-white font-bold">{ytId}</span>
                                    </div>
                                    <a
                                      href={`https://www.youtube.com/watch?v=${ytId}`}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-[11px] text-sky-400 hover:text-sky-300 underline font-bold shrink-0"
                                    >
                                      معاينة ↗
                                    </a>
                                  </div>
                                );
                              }
                              if (newVideo.providerVideoId.length >= 3) {
                                return (
                                  <div className="mt-2 p-2 rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-300 text-xs flex items-center gap-1.5">
                                    <span>⚠️</span>
                                    <span>الرجاء إدخال رابط يوتيوب صالح (مثل: https://youtu.be/... أو https://youtube.com/watch?v=...) أو معرّف الفيديو (10-12 حرف).</span>
                                  </div>
                                );
                              }
                              return null;
                            })()}

                            {/* Axinom Multi-DRM Direct Upload & Packaging Box */}
                            {newVideo.videoProvider === "axinom" && drmUnlocked && (
                              <div className="mt-2.5 p-3.5 rounded-2xl border border-sky-500/40 bg-sky-500/5 space-y-3">
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-2">
                                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-sky-500/20 text-sky-400 border border-sky-500/30">
                                      🛡️ Axinom Hardware Multi-DRM
                                    </span>
                                    <span className="text-xs text-[var(--ink-muted)]">مفعّل بالرخصة المشفرة</span>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={handleLockDrm}
                                    className="text-[10px] px-2.5 py-1 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 font-bold transition-all cursor-pointer"
                                  >
                                    🔒 قفل الخيار
                                  </button>
                                </div>

                                {/* Tab selector between Direct Upload & Google Drive & Manual */}
                                <div className="flex items-center gap-1.5 p-1 rounded-xl bg-black/20 border border-white/5">
                                  <button
                                    type="button"
                                    onClick={() => setActiveDrmTab("upload")}
                                    className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1 cursor-pointer ${
                                      activeDrmTab === "upload"
                                        ? "bg-sky-500 text-white shadow-sm"
                                        : "text-[var(--ink-muted)] hover:text-[var(--ink)]"
                                    }`}
                                  >
                                    <span>📁</span>
                                    <span>رفع وتشفير من الجهاز</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setActiveDrmTab("gdrive")}
                                    className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1 cursor-pointer ${
                                      activeDrmTab === "gdrive"
                                        ? "bg-sky-500 text-white shadow-sm"
                                        : "text-[var(--ink-muted)] hover:text-[var(--ink)]"
                                    }`}
                                  >
                                    <span>📥</span>
                                    <span>استيراد من Google Drive</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setActiveDrmTab("manual")}
                                    className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1 cursor-pointer ${
                                      activeDrmTab === "manual"
                                        ? "bg-sky-500 text-white shadow-sm"
                                        : "text-[var(--ink-muted)] hover:text-[var(--ink)]"
                                    }`}
                                  >
                                    <span>⌨️</span>
                                    <span>معرّف Asset ID</span>
                                  </button>
                                </div>

                                {activeDrmTab === "upload" && (
                                  <div className="space-y-2">
                                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                                      <label className="text-xs font-bold text-[var(--ink)] flex items-center gap-1.5">
                                        <span>⚡</span> رفع ملف فيديو من جهازك ومعالجته بـ Multi-DRM:
                                      </label>
                                      <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sky-500 hover:bg-sky-400 text-white text-xs font-bold transition-all cursor-pointer shrink-0">
                                        <span>📁 اختر فيديو من جهازك</span>
                                        <input
                                          type="file"
                                          accept="video/*"
                                          disabled={nativeUploading}
                                          className="hidden"
                                          onChange={(e) => {
                                            const file = e.target.files?.[0];
                                            if (file) handleNativeFileUpload(file);
                                          }}
                                        />
                                      </label>
                                    </div>
                                    {nativeUploading && (
                                      <div className="space-y-1.5 pt-1">
                                        <div className="flex items-center justify-between text-[11px] font-bold text-sky-400">
                                          <span>{nativeStatus}</span>
                                          <span className="font-mono">{nativeProgress}%</span>
                                        </div>
                                        <div className="w-full h-2 rounded-full bg-[var(--border)] overflow-hidden">
                                          <div className="h-full bg-sky-500 transition-all duration-300" style={{ width: `${nativeProgress}%` }} />
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                )}

                                {activeDrmTab === "gdrive" && (
                                  <div className="space-y-2">
                                    <div className="flex flex-col sm:flex-row gap-2">
                                      <input
                                        type="url"
                                        dir="ltr"
                                        value={gdriveUrl}
                                        onChange={(e) => setGdriveUrl(e.target.value)}
                                        placeholder="https://drive.google.com/file/d/.../view"
                                        disabled={gdriveImporting}
                                        className={`${input} font-mono text-xs flex-1`}
                                      />
                                      <button
                                        type="button"
                                        onClick={handleGoogleDriveImport}
                                        disabled={gdriveImporting || !gdriveUrl.trim()}
                                        className="px-4 py-2 rounded-xl bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 text-white font-black text-xs shadow-md transition-all disabled:opacity-50 flex items-center justify-center gap-1.5 shrink-0 cursor-pointer"
                                      >
                                        {gdriveImporting ? "جاري الاستيراد..." : "📥 استيراد وحماية"}
                                      </button>
                                    </div>
                                  </div>
                                )}

                                {activeDrmTab === "manual" && (
                                  <div className="space-y-2">
                                    <p className="text-[11px] text-[var(--ink-muted)] m-0">
                                      أدخل معرّف الـ Asset ID في الحقل أعلاه (مثال: <code className="font-mono text-sky-300">lesson_101</code> أو <code className="font-mono text-sky-300">axinom_demo</code>) لتجربة البث المشفر عتادياً.
                                    </p>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setNewVideo((prev) => ({
                                          ...prev,
                                          providerVideoId: "axinom_demo",
                                          title: "فيديو تجربة Axinom Widevine الرسمي (1080p CENC)",
                                        }));
                                        handleGenerateDrmPreview("axinom_demo");
                                      }}
                                      className="px-3 py-1.5 rounded-lg bg-sky-500/10 hover:bg-sky-500/20 text-sky-400 border border-sky-500/30 text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
                                    >
                                      <span>🎯</span>
                                      <span>تحميل وتجربة فيديو Widevine CENC الرسمي المباشر (1080p)</span>
                                    </button>
                                  </div>
                                )}

                                {/* 2-Hour DRM Preview & Testing Box */}
                                {newVideo.providerVideoId && (
                                  <div className="p-3.5 rounded-xl border border-sky-500/30 bg-sky-500/10 space-y-2.5">
                                    <div className="flex items-center justify-between">
                                      <div className="flex items-center gap-1.5 font-bold text-xs text-sky-400">
                                        <span>🎬</span>
                                        <span>معاينة وتجربة الفيديو المشفر (صلاحية ساعتان 2 Hours):</span>
                                      </div>
                                      <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-sky-500/20 text-sky-300 font-bold">
                                        Asset: {newVideo.providerVideoId}
                                      </span>
                                    </div>
                                    <p className="text-[11px] text-[var(--ink-muted)] m-0 leading-relaxed">
                                      يمكنك معاينة تشغيل الفيديو وفك تشفيره والتأكد من جودته عبر رابط مباشر مستقل لمدة ساعتين كاملتين قبل نشره وإضافته لمجلد المحاضرة.
                                    </p>
                                    <div className="flex flex-wrap items-center gap-2 pt-1">
                                      <button
                                        type="button"
                                        disabled={drmPreviewLoading}
                                        onClick={() => handleGenerateDrmPreview(newVideo.providerVideoId)}
                                        className="px-3.5 py-1.5 rounded-lg bg-sky-500 hover:bg-sky-400 text-white text-xs font-bold transition-all shadow-sm flex items-center gap-1.5 cursor-pointer"
                                      >
                                        <span>{drmPreviewLoading ? "جاري التجهيز..." : "🚀 توليد رابط المعاينة (2 Hours)"}</span>
                                      </button>
                                      {drmPreviewData && drmPreviewData.assetId === newVideo.providerVideoId && (
                                        <>
                                          <a
                                            href={drmPreviewData.previewUrl}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="px-3.5 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-bold transition-all shadow-sm flex items-center gap-1.5"
                                          >
                                            <span>▶️ فتح مشغل المعاينة ↗</span>
                                          </a>
                                          <button
                                            type="button"
                                            onClick={() => {
                                              navigator.clipboard.writeText(drmPreviewData.previewUrl);
                                              notify("success", "تم نسخ رابط المعاينة الكامل (2 Hours) للذاكرة!");
                                            }}
                                            className="px-3.5 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
                                          >
                                            <span>📋 نسخ الرابط</span>
                                          </button>
                                        </>
                                      )}
                                    </div>
                                    {drmPreviewData && drmPreviewData.assetId === newVideo.providerVideoId && (
                                      <div className="p-2 rounded-lg bg-black/40 border border-white/5 font-mono text-[11px] text-sky-300 select-all break-all text-left" dir="ltr">
                                        {drmPreviewData.previewUrl}
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            )}

                            {/* VdoCipher Locked Security Card */}
                            {newVideo.videoProvider === "vdocipher" && !vdocipherUnlocked && (
                              <div className="mt-2.5 p-4 rounded-2xl border border-amber-500/30 bg-amber-500/5 space-y-2 text-center">
                                <div className="text-2xl">🔒🎬</div>
                                <p className="text-xs font-bold text-[var(--ink)]">حماية VdoCipher مقفلة بكلمة مرور</p>
                                <p className="text-[11px] text-[var(--ink-muted)] m-0">يجب إدخال كلمة مرور الحماية المعتمدة للمتابعة ورفع الفيديوهات إلى VdoCipher.</p>
                                <div className="pt-1">
                                  <button
                                    type="button"
                                    onClick={() => setVdocipherPasswordModal(true)}
                                    className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-white font-bold text-xs cursor-pointer shadow-sm transition-all inline-flex items-center gap-1.5"
                                  >
                                    <span>🔐</span>
                                    <span>إدخال كلمة المرور لفتح VdoCipher</span>
                                  </button>
                                </div>
                              </div>
                            )}

                            {/* SaaS Direct Upload & Google Drive Downloader (VdoCipher DRM & Native Security) */}
                            {(newVideo.videoProvider === "alasly" || (newVideo.videoProvider === "vdocipher" && vdocipherUnlocked)) && (
                              <div className="mt-2.5 p-3.5 rounded-2xl border border-sky-500/30 bg-sky-500/5 space-y-3">
                                {newVideo.videoProvider === "vdocipher" && (
                                  <div className="flex items-center justify-between pb-1 border-b border-white/5">
                                    <div className="flex items-center gap-1.5 text-xs text-emerald-400 font-bold">
                                      <span>🔓</span>
                                      <span>حماية VdoCipher مفتوحة ومفعلة للرفع</span>
                                    </div>
                                    <button
                                      type="button"
                                      onClick={handleLockVdocipher}
                                      className="text-[10px] px-2 py-0.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 font-bold transition-all cursor-pointer"
                                    >
                                      🔒 قفل الخيار
                                    </button>
                                  </div>
                                )}
                                {/* Tab selector between Direct Upload & Google Drive */}
                                <div className="flex items-center gap-2 p-1 rounded-xl bg-black/20 border border-white/5">
                                  <button
                                    type="button"
                                    onClick={() => setActiveNativeTab("gdrive")}
                                    className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                                      activeNativeTab === "gdrive"
                                        ? "bg-sky-500 text-white shadow-sm"
                                        : "text-[var(--ink-muted)] hover:text-[var(--ink)]"
                                    }`}
                                  >
                                    <span>📥</span>
                                    <span>استيراد وتنزيل من Google Drive</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setActiveNativeTab("upload")}
                                    className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                                      activeNativeTab === "upload"
                                        ? "bg-sky-500 text-white shadow-sm"
                                        : "text-[var(--ink-muted)] hover:text-[var(--ink)]"
                                    }`}
                                  >
                                    <span>📁</span>
                                    <span>رفع ملف مباشر من الجهاز</span>
                                  </button>
                                </div>

                                {/* Google Drive Tab */}
                                {activeNativeTab === "gdrive" && (
                                  <div className="space-y-2.5">
                                    <div className="flex items-center justify-between">
                                      <label className="text-xs font-bold text-[var(--ink)] flex items-center gap-1.5">
                                        <span>🔗</span> رابط فيديو Google Drive:
                                      </label>
                                      <span className="text-[10px] text-sky-400 font-bold">
                                        {newVideo.videoProvider === "vdocipher"
                                          ? "⚡ نقل سحابي ذكي إلى VdoCipher DRM"
                                          : "⚡ استيراد سحابي فوري (Zero VPS Storage - يدعم حتى 6GB)"}
                                      </span>
                                    </div>

                                    <div className="flex flex-col sm:flex-row gap-2">
                                      <input
                                        type="url"
                                        dir="ltr"
                                        value={gdriveUrl}
                                        onChange={(e) => setGdriveUrl(e.target.value)}
                                        placeholder="https://drive.google.com/file/d/1a2b3c.../view"
                                        disabled={gdriveImporting}
                                        className={`${input} font-mono text-xs flex-1`}
                                      />
                                      <button
                                        type="button"
                                        onClick={handleGoogleDriveImport}
                                        disabled={gdriveImporting || !gdriveUrl.trim()}
                                        className="px-4 py-2 rounded-xl bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 text-white font-black text-xs shadow-md transition-all disabled:opacity-50 flex items-center justify-center gap-1.5 shrink-0 cursor-pointer"
                                      >
                                        {gdriveImporting ? (
                                          <>
                                            <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                            <span>جاري الاستيراد والحماية...</span>
                                          </>
                                        ) : (
                                          <>
                                            <span>📥 استيراد وحماية الفيديو</span>
                                          </>
                                        )}
                                      </button>
                                    </div>

                                    {gdriveImporting && (
                                      <div className="p-2.5 rounded-xl bg-sky-500/10 border border-sky-500/20 text-xs text-sky-300 flex items-center gap-2">
                                        <span className="w-2 h-2 rounded-full bg-sky-400 animate-ping" />
                                        <span>{gdriveStatus}</span>
                                      </div>
                                    )}

                                    <div className="p-2.5 rounded-xl bg-black/30 border border-white/5 space-y-1.5 text-[11px] text-[var(--ink-muted)]">
                                      <div className="flex items-center justify-between flex-wrap gap-1 font-bold text-[var(--ink)]">
                                        <span>💡 تنبيه للملفات الكبيرة والخاصة (3GB / 5GB+):</span>
                                        <button
                                          type="button"
                                          onClick={() => {
                                            navigator.clipboard.writeText("code-up-drive-downloader@gen-lang-client-0511580613.iam.gserviceaccount.com");
                                            notify("success", "تم نسخ إيميل الـ Service Account للذاكرة!");
                                          }}
                                          className="text-sky-400 hover:underline text-[10px] flex items-center gap-1 cursor-pointer"
                                        >
                                          <span>📋 نسخ إيميل الـ Service Account</span>
                                        </button>
                                      </div>
                                      <p className="m-0 leading-relaxed">
                                        يتم تنزيل واستيراد الملفات الكبيرة مباشرة عبر Pipeline محمي خاص بالمعلمين. تأكد من مشاركة الفيديو في Google Drive مع الإيميل: <code className="font-mono text-sky-300 select-all px-1 bg-black/40 rounded">code-up-drive-downloader@gen-lang-client-0511580613.iam.gserviceaccount.com</code> أو جعل الرابط متاحاً لأي شخص يملك الرابط (Anyone with the link).
                                      </p>
                                    </div>
                                  </div>
                                )}

                                {/* Direct File Upload Tab */}
                                {activeNativeTab === "upload" && (
                                  <div className="space-y-2">
                                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                                      <label className="text-xs font-bold text-[var(--ink)] flex items-center gap-1.5">
                                        <span>⚡</span> {newVideo.videoProvider === "vdocipher" ? "رفع ملف فيديو مباشرة إلى VdoCipher DRM:" : "رفع ملف فيديو من جهازك إلى Native Engine:"}
                                      </label>
                                      <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sky-500 hover:bg-sky-400 text-white text-xs font-bold transition-all cursor-pointer shrink-0">
                                        <span>📁 اختر فيديو من جهازك</span>
                                        <input
                                          type="file"
                                          accept="video/*"
                                          disabled={nativeUploading}
                                          className="hidden"
                                          onChange={(e) => {
                                            const file = e.target.files?.[0];
                                            if (file) handleNativeFileUpload(file);
                                          }}
                                        />
                                      </label>
                                    </div>

                                    {nativeUploading && (
                                      <div className="space-y-1.5 pt-1">
                                        <div className="flex items-center justify-between text-[11px] font-bold text-sky-400">
                                          <span>{nativeStatus}</span>
                                          <span className="font-mono">{nativeProgress}%</span>
                                        </div>
                                        <div className="w-full h-2 rounded-full bg-[var(--border)] overflow-hidden">
                                          <div
                                            className="h-full bg-sky-500 transition-all duration-300"
                                            style={{ width: `${nativeProgress}%` }}
                                          />
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                )}

                                {/* Success Video ID banner */}
                                {lastUploadedVideoId && (
                                  <div className="mt-2.5 p-3 rounded-xl border border-emerald-500/40 bg-emerald-500/10 text-emerald-300 space-y-2">
                                    <div className="flex items-center justify-between">
                                      <span className="text-xs font-bold text-emerald-400 flex items-center gap-1">
                                        <span>🎉</span> {newVideo.videoProvider === "vdocipher" ? "تم رفع وحماية الفيديو بنجاح عبر VdoCipher DRM!" : "تم تجهيز وحماية الفيديو بنجاح عبر Native Security!"}
                                      </span>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          navigator.clipboard.writeText(lastUploadedVideoId);
                                          notify("success", "تم نسخ معرّف الفيديو (Video ID) للذاكرة!");
                                        }}
                                        className="px-2.5 py-1 text-[11px] font-bold rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white transition-all flex items-center gap-1 cursor-pointer"
                                      >
                                        <span>📋 نسخ معرّف الفيديو (Copy ID)</span>
                                      </button>
                                    </div>
                                    <div className="flex items-center justify-between gap-2 bg-black/40 px-3 py-2 rounded-lg border border-emerald-500/20 text-xs font-mono select-all">
                                      <span className="text-emerald-400 font-bold">Video ID:</span>
                                      <span className="text-white font-bold tracking-wider">{lastUploadedVideoId}</span>
                                    </div>
                                    <p className="text-[10px] text-emerald-300/80 m-0">
                                      💡 تم إدخال المعرف وتعيين الحماية تلقائياً. يمكنك الضغط على "إضافة الفيديو" بالأسفل لنشره في المحاضرة.
                                    </p>
                                  </div>
                                )}
                              </div>
                            )}

                            <p className="text-[10px] text-[var(--ink-muted)] mt-1.5">
                              {newVideo.videoProvider === "vdocipher" && "من لوحة VdoCipher ‹ Videos ‹ انسخ الـ ID (أعلى درجات الحماية ضد التحميل والتسريب)"}
                              {newVideo.videoProvider === "alasly" && "محمي بنظام Super Native Security بحماية عالية، مع علامات مائية متحركة وحماية ضد تسجيل الشاشة"}
                              {newVideo.videoProvider === "bunny" && "من Bunny Stream ‹ Library ‹ Video GUID (حماية متوسطة وسريعة)"}
                              {newVideo.videoProvider === "youtube" && "من رابط الفيديو: youtube.com/watch?v=الجزء (اقتصادي جداً للكورسات والمحاضرات المجانية)"}
                            </p>
                          </div>

                          {/* Duration */}
                          <div>
                            <label className={label}><IconClock className="w-3.5 h-3.5 inline -mt-0.5 me-1" />مدة الفيديو (دقائق) — لحساب نسبة الإنجاز</label>
                            <input type="number" min="0" step="1" value={newVideo.durationMinutes || ""} onChange={(e) => setNewVideo({ ...newVideo, durationMinutes: parseInt(e.target.value) || 0 })} placeholder="مثال: 45" className={input} dir="ltr" />
                          </div>

                          {/* Watches */}
                          <div>
                            <label className={label}><IconEye className="w-3.5 h-3.5 inline -mt-0.5 me-1" />عدد المشاهدات لكل طالب</label>
                            <div className="flex gap-1.5 flex-wrap">
                              {[1, 2, 3, 5, 10].map((n) => (
                                <button key={n} type="button" onClick={() => setNewVideo({ ...newVideo, maxWatchesPerUser: n })}
                                  className={`px-3 py-1.5 rounded-lg text-sm font-bold border-2 transition-all ${newVideo.maxWatchesPerUser === n ? "border-sky-500 bg-sky-500/10 text-sky-500 dark:text-sky-300" : "border-[var(--border)] text-[var(--ink-muted)] hover:border-[var(--ink-muted)]/40"}`}>
                                  {n}×
                                </button>
                              ))}
                              <input type="number" min="1" max="99" value={newVideo.maxWatchesPerUser} onChange={(e) => setNewVideo({ ...newVideo, maxWatchesPerUser: Math.max(1, parseInt(e.target.value) || 1) })} className={`${input} w-16 text-center`} dir="ltr" />
                            </div>
                          </div>

                          {/* Scheduled unlock */}
                          <div>
                            <label className={label}><IconClock className="w-3.5 h-3.5 inline -mt-0.5 me-1" />موعد فتح الفيديو (اختياري)</label>
                            <div className="flex items-center gap-2">
                              <input type="datetime-local" value={newVideo.publishAt} onChange={(e) => setNewVideo({ ...newVideo, publishAt: e.target.value })} className={input} dir="ltr" />
                              {newVideo.publishAt && (
                                <button type="button" onClick={() => setNewVideo({ ...newVideo, publishAt: "" })} className="text-[11px] text-[var(--ink-muted)] hover:text-[var(--error)] shrink-0">مسح</button>
                              )}
                            </div>
                            <p className="text-[10px] text-[var(--ink-muted)] mt-1">يظل الفيديو مقفلاً للطلاب حتى هذا الوقت. اتركه فارغاً ليكون متاحاً فوراً.</p>
                          </div>

                          <button type="submit" disabled={!newVideo.folderId || !newVideo.title || !newVideo.providerVideoId} className={`${primaryBtn} w-full`}>
                            <IconPlus className="w-4 h-4" /> إضافة الفيديو
                          </button>
                        </form>
                      </div>

                      {/* Add material */}
                      <div className={`${cardPad} h-fit`}>
                        <h3 className="font-bold text-[var(--ink)] mb-4 flex items-center gap-2"><IconFile className="w-4 h-4 text-sky-500" /> إضافة ملحق (PDF / رابط)</h3>
                        <form onSubmit={addMaterial} className="space-y-3">
                          <select value={newMaterial.folderId} onChange={(e) => setNewMaterial({ ...newMaterial, folderId: e.target.value })} className={input}>
                            <option value="">اختر المحاضرة</option>
                            {folders.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                          </select>
                          <select value={newMaterial.type} onChange={(e) => setNewMaterial({ ...newMaterial, type: e.target.value })} className={input}>
                            <option value="pdf">ملف PDF (رابط)</option>
                            <option value="link">رابط خارجي</option>
                          </select>
                          <input type="text" value={newMaterial.title} onChange={(e) => setNewMaterial({ ...newMaterial, title: e.target.value })} placeholder="عنوان الملحق" className={input} />
                          <input type="url" value={newMaterial.url} onChange={(e) => setNewMaterial({ ...newMaterial, url: e.target.value })} placeholder="الرابط (URL)" dir="ltr" className={`${input} font-mono`} />
                            {/* YouTube live URL detection & validation badge */}
                            {newVideo.videoProvider === "youtube" && newVideo.providerVideoId && (() => {
                              const ytId = extractYouTubeVideoId(newVideo.providerVideoId);
                              if (ytId) {
                                return (
                                  <div className="mt-2 p-2.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-300 flex items-center justify-between gap-2 text-xs">
                                    <div className="flex items-center gap-1.5 font-bold">
                                      <span className="text-emerald-400">✓</span>
                                      <span>تم التعرف على الفيديو بنجاح! معرّف YouTube:</span>
                                      <span className="font-mono bg-black/40 px-2 py-0.5 rounded text-white font-bold">{ytId}</span>
                                    </div>
                                    <a
                                      href={`https://www.youtube.com/watch?v=${ytId}`}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-[11px] text-sky-400 hover:text-sky-300 underline font-bold shrink-0"
                                    >
                                      معاينة ↗
                                    </a>
                                  </div>
                                );
                              }
                              if (newVideo.providerVideoId.length >= 3) {
                                return (
                                  <div className="mt-2 p-2 rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-300 text-xs flex items-center gap-1.5">
                                    <span>⚠️</span>
                                    <span>الرجاء إدخال رابط يوتيوب صالح (مثل: https://youtu.be/... أو https://youtube.com/watch?v=...) أو معرّف الفيديو (10-12 حرف).</span>
                                  </div>
                                );
                              }
                              return null;
                            })()}
                          <button type="submit" disabled={!newMaterial.folderId || !newMaterial.title || !newMaterial.url} className={`${primaryBtn} w-full`}>
                            <IconPlus className="w-4 h-4" /> إضافة الملحق
                          </button>
                        </form>
                      </div>
                    </div>

                    {/* Add quiz */}
                    <div className={cardPad}>
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                        <h3 className="font-bold text-[var(--ink)] flex items-center gap-2"><IconClipboard className="w-4 h-4 text-sky-500" /> إضافة اختبار</h3>
                        <div className="flex items-center gap-2 flex-wrap">
                          <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-sky-500/10 hover:bg-sky-500/20 text-sky-500 text-xs font-bold transition-all cursor-pointer">
                            <span>📥 استيراد أسئلة من JSON</span>
                            <input
                              type="file"
                              accept=".json,application/json"
                              className="hidden"
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) handleQuizJsonImport(file);
                                e.target.value = "";
                              }}
                            />
                          </label>
                          <button
                            type="button"
                            onClick={downloadSampleQuizJson}
                            className="px-3 py-1.5 rounded-xl border border-[var(--border)] hover:bg-[var(--bg)] text-[var(--ink-muted)] hover:text-[var(--ink)] text-xs font-bold transition-all"
                          >
                            📄 تحميل قالب JSON
                          </button>
                          <button
                            type="button"
                            onClick={() => setShowJsonGuide(true)}
                            className="px-3 py-1.5 rounded-xl bg-purple-500/10 hover:bg-purple-500/20 text-purple-500 text-xs font-bold transition-all"
                          >
                            ❓ دليل صياغة JSON
                          </button>
                        </div>
                      </div>
                      <form onSubmit={addQuiz} className="space-y-4">
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                          <select value={newQuiz.folderId} onChange={(e) => setNewQuiz({ ...newQuiz, folderId: e.target.value })} className={input}>
                            <option value="">اختر المحاضرة</option>
                            {folders.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                          </select>
                          <input type="text" value={newQuiz.title} onChange={(e) => setNewQuiz({ ...newQuiz, title: e.target.value })} placeholder="عنوان الاختبار" className={input} />
                          <input type="number" min={1} max={240} value={newQuiz.timeLimitMinutes} onChange={(e) => setNewQuiz({ ...newQuiz, timeLimitMinutes: Number(e.target.value) || 30 })} placeholder="المدة (دقائق)" className={input} dir="ltr" />
                        </div>

                        {newQuiz.questions.map((q, qi) => (
                          <div key={qi} className="rounded-xl border border-[var(--border)] bg-[var(--bg)] p-4 space-y-3">
                            <div className="flex items-center justify-between gap-3">
                              <p className="text-sm font-bold text-[var(--ink)]">السؤال {qi + 1}</p>
                              <select
                                value={q.questionType || "mcq"}
                                onChange={(e) => {
                                  const qs = [...newQuiz.questions];
                                  qs[qi].questionType = e.target.value;
                                  setNewQuiz({ ...newQuiz, questions: qs });
                                }}
                                className={`${input} w-48 py-1 text-xs`}
                              >
                                <option value="mcq">اختيار من متعدد (MCQ)</option>
                                <option value="essay">سؤال مقالي (تصحيح يدوي)</option>
                              </select>
                            </div>
                            <input type="text" value={q.question} onChange={(e) => { const qs = [...newQuiz.questions]; qs[qi].question = e.target.value; setNewQuiz({ ...newQuiz, questions: qs }); }} placeholder="نص السؤال" className={input} />
                            
                            {/* Question image attachment */}
                            <div className="space-y-1.5 pt-1">
                              <label className={label}>صورة توضيحية للسؤال (مسألة / رسم بياني / شكل - اختياري)</label>
                              <div className="flex gap-2">
                                <input
                                  type="text"
                                  value={q.imageUrl || ""}
                                  onChange={(e) => { const qs = [...newQuiz.questions]; qs[qi].imageUrl = e.target.value; setNewQuiz({ ...newQuiz, questions: qs }); }}
                                  placeholder="رابط الصورة https://… أو اختر صورة من الجهاز"
                                  className={`${input} font-mono text-xs flex-1`}
                                  dir="ltr"
                                />
                                <label className={`${ghostBtn} cursor-pointer text-xs shrink-0 py-1.5`}>
                                  📷 رفع صورة
                                  <input
                                    type="file"
                                    accept="image/*"
                                    className="hidden"
                                    onChange={async (e) => {
                                      const file = e.target.files?.[0];
                                      if (file) {
                                        try {
                                          const url = await fileToResizedDataUrl(file, 800);
                                          const qs = [...newQuiz.questions];
                                          qs[qi].imageUrl = url;
                                          setNewQuiz({ ...newQuiz, questions: qs });
                                        } catch {
                                          notify("error", "تعذر رفع الصورة");
                                        }
                                      }
                                    }}
                                  />
                                </label>
                              </div>
                              {q.imageUrl && (
                                <div className="mt-2 relative w-full max-w-sm rounded-xl overflow-hidden border border-[var(--border)] bg-[var(--surface)] p-1">
                                  <img src={q.imageUrl} alt="توضيح السؤال" className="w-full max-h-40 object-contain rounded-lg" />
                                  <button
                                    type="button"
                                    onClick={() => { const qs = [...newQuiz.questions]; qs[qi].imageUrl = ""; setNewQuiz({ ...newQuiz, questions: qs }); }}
                                    className="absolute top-2 left-2 bg-red-500 text-white text-[10px] px-2 py-0.5 rounded-md font-bold hover:bg-red-600 transition-colors shadow-sm"
                                  >
                                    مسح الصورة ✕
                                  </button>
                                </div>
                              )}
                            </div>

                            {q.questionType === "essay" ? (
                              <div className="p-3 bg-purple-500/10 border border-purple-500/20 rounded-lg text-xs text-purple-600 dark:text-purple-300 font-bold flex items-center gap-2">
                                <span>📝 سؤال مقالي:</span>
                                <span>يكتب الطالب إجابة نصية حرة وتظهر لك في لوحة المعلم لمراجعتها وتصحيحها ورصد الدرجات.</span>
                              </div>
                            ) : (
                              <div className="space-y-3">
                                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border)] pb-2.5">
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs font-bold text-[var(--ink-muted)]">عدد الخيارات:</span>
                                    <div className="inline-flex rounded-lg border border-[var(--border)] p-0.5 bg-[var(--bg)]">
                                      {([2, 3, 4] as const).map((cnt) => (
                                        <button
                                          key={cnt}
                                          type="button"
                                          onClick={() => {
                                            const qs = [...newQuiz.questions];
                                            qs[qi].optionsCount = cnt;
                                            if (cnt === 2 && (qs[qi].correctAnswer === "C" || qs[qi].correctAnswer === "D")) qs[qi].correctAnswer = "A";
                                            if (cnt === 3 && qs[qi].correctAnswer === "D") qs[qi].correctAnswer = "A";
                                            setNewQuiz({ ...newQuiz, questions: qs });
                                          }}
                                          className={`px-2.5 py-1 text-xs font-bold rounded-md transition-all ${
                                            (q.optionsCount || 4) === cnt
                                              ? "bg-sky-500 text-white shadow-sm"
                                              : "text-[var(--ink-muted)] hover:text-[var(--ink)]"
                                          }`}
                                        >
                                          {cnt === 2 ? "خيارين (صح/خطأ)" : cnt === 3 ? "٣ خيارات" : "٤ خيارات"}
                                        </button>
                                      ))}
                                    </div>
                                  </div>
                                  {(q.optionsCount === 2 || (!q.optionsCount && !q.optionC && !q.optionD)) && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const qs = [...newQuiz.questions];
                                        qs[qi].optionsCount = 2;
                                        qs[qi].optionA = "صح";
                                        qs[qi].optionB = "خطأ";
                                        qs[qi].correctAnswer = "A";
                                        setNewQuiz({ ...newQuiz, questions: qs });
                                      }}
                                      className="text-xs font-bold px-2 py-1 rounded-md bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20 transition-colors"
                                    >
                                      ⚡ ملء تلقائي: صح / خطأ
                                    </button>
                                  )}
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                  {(["A", "B", "C", "D"] as const)
                                    .slice(0, q.optionsCount || 4)
                                    .map((opt) => {
                                      const optKey = `option${opt}` as "optionA" | "optionB" | "optionC" | "optionD";
                                      return (
                                        <div key={opt} className="flex gap-2 items-center">
                                          <button
                                            type="button"
                                            onClick={() => { const qs = [...newQuiz.questions]; qs[qi].correctAnswer = opt; setNewQuiz({ ...newQuiz, questions: qs }); }}
                                            aria-label={`تعيين ${opt} كإجابة صحيحة`}
                                            className={`shrink-0 w-7 h-7 rounded-lg text-xs font-bold transition-colors ${q.correctAnswer === opt ? "bg-emerald-500 text-white" : "bg-[var(--border)] text-[var(--ink-muted)] hover:text-[var(--ink)]"}`}
                                          >
                                            {opt}
                                          </button>
                                          <input
                                            type="text"
                                            value={q[optKey] || ""}
                                            onChange={(e) => {
                                              const qs = [...newQuiz.questions];
                                              qs[qi][optKey] = e.target.value;
                                              setNewQuiz({ ...newQuiz, questions: qs });
                                            }}
                                            placeholder={`الخيار ${opt}`}
                                            className={input}
                                          />
                                        </div>
                                      );
                                    })}
                                </div>
                                <p className="text-[11px] text-[var(--ink-muted)]">اضغط على حرف الخيار لتحديده كإجابة صحيحة. الحالي: <span className="font-bold text-emerald-500">{q.correctAnswer}</span></p>
                              </div>
                            )}
                          </div>
                        ))}

                        <div className="flex flex-col sm:flex-row gap-3">
                          <button type="button" onClick={() => setNewQuiz({ ...newQuiz, questions: [...newQuiz.questions, { question: "", questionType: "mcq", optionsCount: 4, optionA: "", optionB: "", optionC: "", optionD: "", correctAnswer: "A" }] })} className={ghostBtn}>
                            <IconPlus className="w-4 h-4" /> سؤال جديد
                          </button>
                          <button type="submit" disabled={!newQuiz.folderId || !newQuiz.title} className={`${primaryBtn} flex-1`}>
                            إضافة الاختبار
                          </button>
                        </div>
                      </form>
                    </div>

                    {/* Add Homework to Folder card */}
                    <div className={cardPad}>
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 pb-3 border-b border-[var(--border)]">
                        <div>
                          <h3 className="font-bold text-[var(--ink)] flex items-center gap-2">
                            <IconBook className="w-4 h-4 text-amber-500" /> إضافة واجب للمحاضرة
                          </h3>
                          <p className="text-xs text-[var(--ink-muted)] mt-0.5">يمكنك ربط الواجب بمحاضرة محددة أو فيديو وإضافة أسئلة MCQ أو ملفات</p>
                        </div>
                        {newFolderHomework.type === "exam" && (
                          <div className="flex items-center gap-2 flex-wrap">
                            <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-500 text-xs font-bold transition-all cursor-pointer">
                              <span>📥 استيراد أسئلة من JSON</span>
                              <input
                                type="file"
                                accept=".json,application/json"
                                className="hidden"
                                onChange={(e) => {
                                  const file = e.target.files?.[0];
                                  if (file) handleFolderHwJsonImport(file);
                                  e.target.value = "";
                                }}
                              />
                            </label>
                            <button
                              type="button"
                              onClick={downloadSampleHomeworkJson}
                              className="px-3 py-1.5 rounded-xl border border-[var(--border)] hover:bg-[var(--bg)] text-[var(--ink-muted)] hover:text-[var(--ink)] text-xs font-bold transition-all"
                            >
                              📄 تحميل قالب JSON
                            </button>
                            <button
                              type="button"
                              onClick={() => setShowJsonGuide(true)}
                              className="px-3 py-1.5 rounded-xl bg-purple-500/10 hover:bg-purple-500/20 text-purple-500 text-xs font-bold transition-all"
                            >
                              ❓ دليل صياغة JSON
                            </button>
                          </div>
                        )}
                      </div>

                      <form onSubmit={addHomeworkToFolder} className="space-y-4">
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                          <select
                            value={newFolderHomework.folderId}
                            onChange={(e) => setNewFolderHomework({ ...newFolderHomework, folderId: e.target.value })}
                            className={input}
                          >
                            <option value="">اختر المحاضرة *</option>
                            {folders.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                          </select>
                          <input
                            type="text"
                            value={newFolderHomework.title}
                            onChange={(e) => setNewFolderHomework({ ...newFolderHomework, title: e.target.value })}
                            placeholder="عنوان الواجب *"
                            className={input}
                          />
                          <select
                            value={newFolderHomework.type}
                            onChange={(e) => setNewFolderHomework({ ...newFolderHomework, type: e.target.value as any })}
                            className={input}
                          >
                            <option value="exam">📝 اختبار أسئلة MCQ</option>
                            <option value="terminal">💻 كود برمجي / Terminal</option>
                            <option value="upload">📎 رفع وتكليف ملفات</option>
                            <option value="link">🔗 رابط خارجي</option>
                          </select>
                        </div>

                        {newFolderHomework.type === "link" && (
                          <input
                            type="url"
                            value={newFolderHomework.linkUrl}
                            onChange={(e) => setNewFolderHomework({ ...newFolderHomework, linkUrl: e.target.value })}
                            placeholder="رابط الواجب https://..."
                            className={input}
                            dir="ltr"
                          />
                        )}

                        {newFolderHomework.type === "exam" && (
                          <div className="space-y-3">
                            <div className="flex items-center justify-between">
                              <label className={label}>أسئلة الواجب ({newFolderHomework.questions.length})</label>
                              <input
                                type="number"
                                min={1}
                                max={240}
                                value={newFolderHomework.timeLimitMinutes}
                                onChange={(e) => setNewFolderHomework({ ...newFolderHomework, timeLimitMinutes: Number(e.target.value) || 30 })}
                                placeholder="الوقت المحدد (دقائق)"
                                className={`${input} w-40 text-xs`}
                                dir="ltr"
                              />
                            </div>
                            {newFolderHomework.questions.map((q, qi) => (
                              <div key={qi} className="rounded-xl border border-[var(--border)] bg-[var(--bg)] p-4 space-y-3">
                                <div className="flex items-center justify-between gap-3">
                                  <p className="text-sm font-bold text-[var(--ink)]">السؤال {qi + 1}</p>
                                </div>
                                <input
                                  type="text"
                                  value={q.question}
                                  onChange={(e) => {
                                    const qs = [...newFolderHomework.questions];
                                    qs[qi].question = e.target.value;
                                    setNewFolderHomework({ ...newFolderHomework, questions: qs });
                                  }}
                                  placeholder="نص السؤال"
                                  className={input}
                                />
                                <div className="space-y-3">
                                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border)] pb-2.5">
                                    <div className="flex items-center gap-2">
                                      <span className="text-xs font-bold text-[var(--ink-muted)]">عدد الخيارات:</span>
                                      <div className="inline-flex rounded-lg border border-[var(--border)] p-0.5 bg-[var(--bg)]">
                                        {([2, 3, 4] as const).map((cnt) => (
                                          <button
                                            key={cnt}
                                            type="button"
                                            onClick={() => {
                                              const qs = [...newFolderHomework.questions];
                                              (qs[qi] as any).optionsCount = cnt;
                                              if (cnt === 2 && (qs[qi].correctAnswer === "C" || qs[qi].correctAnswer === "D")) qs[qi].correctAnswer = "A";
                                              if (cnt === 3 && qs[qi].correctAnswer === "D") qs[qi].correctAnswer = "A";
                                              setNewFolderHomework({ ...newFolderHomework, questions: qs });
                                            }}
                                            className={`px-2.5 py-1 text-xs font-bold rounded-md transition-all ${
                                              ((q as any).optionsCount || 4) === cnt
                                                ? "bg-amber-500 text-white shadow-sm"
                                                : "text-[var(--ink-muted)] hover:text-[var(--ink)]"
                                            }`}
                                          >
                                            {cnt === 2 ? "خيارين (صح/خطأ)" : cnt === 3 ? "٣ خيارات" : "٤ خيارات"}
                                          </button>
                                        ))}
                                      </div>
                                    </div>
                                    {((q as any).optionsCount === 2 || (!(q as any).optionsCount && !q.optionC && !q.optionD)) && (
                                      <button
                                        type="button"
                                        onClick={() => {
                                          const qs = [...newFolderHomework.questions];
                                          (qs[qi] as any).optionsCount = 2;
                                          qs[qi].optionA = "صح";
                                          qs[qi].optionB = "خطأ";
                                          qs[qi].correctAnswer = "A";
                                          setNewFolderHomework({ ...newFolderHomework, questions: qs });
                                        }}
                                        className="text-xs font-bold px-2 py-1 rounded-md bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20 transition-colors"
                                      >
                                        ⚡ ملء تلقائي: صح / خطأ
                                      </button>
                                    )}
                                  </div>

                                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                    {(["A", "B", "C", "D"] as const)
                                      .slice(0, (q as any).optionsCount || 4)
                                      .map((opt) => {
                                        const optKey = `option${opt}` as "optionA" | "optionB" | "optionC" | "optionD";
                                        return (
                                          <div key={opt} className="flex gap-2 items-center">
                                            <button
                                              type="button"
                                              onClick={() => {
                                                const qs = [...newFolderHomework.questions];
                                                qs[qi].correctAnswer = opt;
                                                setNewFolderHomework({ ...newFolderHomework, questions: qs });
                                              }}
                                              className={`shrink-0 w-7 h-7 rounded-lg text-xs font-bold transition-colors ${q.correctAnswer === opt ? "bg-amber-500 text-white" : "bg-[var(--border)] text-[var(--ink-muted)] hover:text-[var(--ink)]"}`}
                                            >
                                              {opt}
                                            </button>
                                            <input
                                              type="text"
                                              value={q[optKey] || ""}
                                              onChange={(e) => {
                                                const qs = [...newFolderHomework.questions];
                                                qs[qi][optKey] = e.target.value;
                                                setNewFolderHomework({ ...newFolderHomework, questions: qs });
                                              }}
                                              placeholder={`الخيار ${opt}`}
                                              className={input}
                                            />
                                          </div>
                                        );
                                      })}
                                  </div>
                                  <p className="text-[11px] text-[var(--ink-muted)]">اضغط على حرف الخيار لتحديده كإجابة صحيحة. الحالي: <span className="font-bold text-amber-500">{q.correctAnswer}</span></p>
                                </div>
                              </div>
                            ))}
                            <button
                              type="button"
                              onClick={() => setNewFolderHomework({ ...newFolderHomework, questions: [...newFolderHomework.questions, { question: "", imageUrl: "", optionA: "", optionB: "", optionC: "", optionD: "", correctAnswer: "A", optionsCount: 4 as 2 | 3 | 4 }] })}
                              className={ghostBtn}
                            >
                              <IconPlus className="w-4 h-4" /> سؤال جديد للواجب
                            </button>
                          </div>
                        )}

                        <button type="submit" disabled={!newFolderHomework.folderId || !newFolderHomework.title} className={`${primaryBtn} w-full`}>
                          إضافة الواجب للمحاضرة
                        </button>
                      </form>
                    </div>
                  </div>
                )}

                {/* ── CONTENT FLOW TAB ── */}
                {courseTab === "flow" && (
                  <ContentFlowManager
                    courseId={selectedCourse.id}
                    courseTitle={selectedCourse.title}
                  />
                )}

                {/* ── SETTINGS TAB (Executive 2-Column Studio Overhaul) ── */}
                {courseTab === "settings" && (
                  <div className="rounded-3xl border border-slate-200/90 bg-white p-6 shadow-sm dark:border-slate-800/90 dark:bg-slate-900/90 space-y-6">
                    <div className="border-b border-slate-100 dark:border-slate-800 pb-4">
                      <h3 className="font-black text-sm text-slate-900 dark:text-white flex items-center gap-2">
                        <IconSettings className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                        <span>إعدادات وهوية الكورس الأساسية</span>
                      </h3>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                        تعديل العنوان، المادة، المرحلة التدريبية، وغلاف الكورس التعريفي.
                      </p>
                    </div>

                    <form onSubmit={saveCourseSettings} className="space-y-6">
                      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                        {/* Right Column: Core Course Details (7 Cols) */}
                        <div className="lg:col-span-7 space-y-4">
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                              <label className="block text-xs font-bold text-slate-800 dark:text-slate-200 mb-1.5">
                                عنوان الكورس <span className="text-rose-500">*</span>
                              </label>
                              <input
                                type="text"
                                value={courseSettings.title}
                                onChange={(e) => setCourseSettings({ ...courseSettings, title: e.target.value })}
                                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-xs font-medium text-slate-900 outline-none focus:border-emerald-500 focus:bg-white dark:border-slate-800 dark:bg-slate-950 dark:text-white transition-all"
                                required
                              />
                            </div>

                            <div>
                              <label className="block text-xs font-bold text-slate-800 dark:text-slate-200 mb-1.5">
                                المادة الأكاديمية
                              </label>
                              <input
                                type="text"
                                value={courseSettings.subject}
                                onChange={(e) => setCourseSettings({ ...courseSettings, subject: e.target.value })}
                                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-xs font-medium text-slate-900 outline-none focus:border-emerald-500 focus:bg-white dark:border-slate-800 dark:bg-slate-950 dark:text-white transition-all"
                              />
                            </div>
                          </div>

                          <div>
                            <label className="block text-xs font-bold text-slate-800 dark:text-slate-200 mb-1.5">
                              المرحلة الدراسية والصف <span className="text-rose-500">*</span>
                            </label>
                            <select
                              value={courseSettings.educationalStage}
                              onChange={(e) => setCourseSettings({ ...courseSettings, educationalStage: e.target.value })}
                              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-xs font-medium text-slate-900 outline-none focus:border-emerald-500 focus:bg-white dark:border-slate-800 dark:bg-slate-950 dark:text-white transition-all cursor-pointer"
                            >
                              <option value="">اختر المرحلة</option>
                              <option value="sec_1">أولى بكالوريا (الصف الأول الثانوي)</option>
                              <option value="sec_2">ثانية بكالوريا (الصف الثاني الثانوي)</option>
                              <option value="sec_3">ثالثة بكالوريا (الثانوية العامة)</option>
                            </select>
                          </div>

                          <div>
                            <label className="block text-xs font-bold text-slate-800 dark:text-slate-200 mb-1.5">
                              طبيعة الكورس ونطاق العرض <span className="text-rose-500">*</span>
                            </label>
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                              <button
                                type="button"
                                onClick={() => setCourseSettings({ ...courseSettings, deliveryMode: "ONLINE" })}
                                className={`p-2.5 rounded-xl border text-right transition-all flex flex-col gap-1 cursor-pointer ${
                                  courseSettings.deliveryMode === "ONLINE"
                                    ? "border-sky-500 bg-sky-500/15 text-sky-400 font-bold shadow-sm"
                                    : "border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 text-slate-600 dark:text-slate-400 hover:border-slate-400"
                                }`}
                              >
                                <span className="text-xs">🌐 أونلاين فقط</span>
                                <span className="text-[10px] opacity-75">منصة code-up.tech</span>
                              </button>

                              <button
                                type="button"
                                onClick={() => setCourseSettings({ ...courseSettings, deliveryMode: "CENTER" })}
                                className={`p-2.5 rounded-xl border text-right transition-all flex flex-col gap-1 cursor-pointer ${
                                  courseSettings.deliveryMode === "CENTER"
                                    ? "border-amber-500 bg-amber-500/15 text-amber-400 font-bold shadow-sm"
                                    : "border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 text-slate-600 dark:text-slate-400 hover:border-slate-400"
                                }`}
                              >
                                <span className="text-xs">🏛️ سنتر وحضوري</span>
                                <span className="text-[10px] opacity-75">منصة center.code-up.tech</span>
                              </button>

                              <button
                                type="button"
                                onClick={() => setCourseSettings({ ...courseSettings, deliveryMode: "BOTH" })}
                                className={`p-2.5 rounded-xl border text-right transition-all flex flex-col gap-1 cursor-pointer ${
                                  courseSettings.deliveryMode === "BOTH"
                                    ? "border-emerald-500 bg-emerald-500/15 text-emerald-400 font-bold shadow-sm"
                                    : "border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 text-slate-600 dark:text-slate-400 hover:border-slate-400"
                                }`}
                              >
                                <span className="text-xs">🔄 كلاهما معاً</span>
                                <span className="text-[10px] opacity-75">السنتر والأونلاين</span>
                              </button>
                            </div>
                          </div>

                          <div>
                            <label className="block text-xs font-bold text-slate-800 dark:text-slate-200 mb-1.5">
                              وصف الكورس والأهداف التعليمية
                            </label>
                            <textarea
                              rows={3}
                              value={courseSettings.description}
                              onChange={(e) => setCourseSettings({ ...courseSettings, description: e.target.value })}
                              placeholder="اكتب نبذة عن محتويات الكورس وما سيتعلمه الطالب..."
                              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-xs text-slate-900 outline-none focus:border-emerald-500 focus:bg-white dark:border-slate-800 dark:bg-slate-950 dark:text-white transition-all resize-none font-medium"
                            />
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                              <label className="block text-xs font-bold text-slate-800 dark:text-slate-200 mb-1.5">
                                المشاهدات الافتراضية لكل طالب
                              </label>
                              <input
                                type="number"
                                min={1}
                                max={99}
                                value={courseSettings.maxWatchCount}
                                onChange={(e) => setCourseSettings({ ...courseSettings, maxWatchCount: Number(e.target.value) || 3 })}
                                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-xs font-mono text-slate-900 outline-none focus:border-emerald-500 focus:bg-white dark:border-slate-800 dark:bg-slate-950 dark:text-white transition-all"
                                dir="ltr"
                              />
                            </div>

                            <div>
                              <label className="block text-xs font-bold text-slate-800 dark:text-slate-200 mb-1.5">
                                رابط صفحة الواجب المنزلي (اختياري)
                              </label>
                              <input
                                type="url"
                                value={courseSettings.homeworkUrl}
                                onChange={(e) => setCourseSettings({ ...courseSettings, homeworkUrl: e.target.value })}
                                placeholder="https://drive.google.com/..."
                                dir="ltr"
                                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-xs font-mono text-slate-900 outline-none focus:border-emerald-500 focus:bg-white dark:border-slate-800 dark:bg-slate-950 dark:text-white transition-all"
                              />
                            </div>
                          </div>
                        </div>

                        {/* Left Column: Visual Cover / Thumbnail Studio (5 Cols) */}
                        <div className="lg:col-span-5 space-y-3">
                          <label className="block text-xs font-bold text-slate-800 dark:text-slate-200">
                            غلاف الكورس التعريفي (Thumbnail Studio)
                          </label>

                          <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/40 space-y-3">
                            {/* Live 16:9 Preview Frame */}
                            <div className="relative w-full aspect-video rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900 shadow-inner flex flex-col items-center justify-center group">
                              {courseSettings.thumbnailUrl ? (
                                <>
                                  <img
                                    src={courseSettings.thumbnailUrl}
                                    alt="غلاف الكورس"
                                    className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                                  />
                                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                                    <label className="px-3 py-1.5 rounded-xl bg-white/90 hover:bg-white text-slate-900 text-xs font-bold shadow-md cursor-pointer transition-all">
                                      <span>📸 تغيير</span>
                                      <input
                                        type="file"
                                        accept="image/*"
                                        className="hidden"
                                        onChange={async (e) => {
                                          const file = e.target.files?.[0];
                                          if (file) {
                                            try {
                                              const url = await fileToResizedDataUrl(file, 800);
                                              setCourseSettings({ ...courseSettings, thumbnailUrl: url });
                                              notify("success", "تم تحديث صورة الغلاف بنجاح");
                                            } catch {
                                              notify("error", "تعذر معالجة الصورة");
                                            }
                                          }
                                        }}
                                      />
                                    </label>
                                    <button
                                      type="button"
                                      onClick={() => setCourseSettings({ ...courseSettings, thumbnailUrl: "" })}
                                      className="px-3 py-1.5 rounded-xl bg-rose-600/90 hover:bg-rose-600 text-white text-xs font-bold shadow-md cursor-pointer transition-all"
                                    >
                                      🗑️ إزالة
                                    </button>
                                  </div>
                                </>
                              ) : (
                                <label className="flex flex-col items-center justify-center p-6 text-center cursor-pointer w-full h-full hover:bg-slate-200/50 dark:hover:bg-slate-800/50 transition-colors">
                                  <span className="text-3xl mb-1">🖼️</span>
                                  <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                                    انقر لاختيار غلاف الكورس من جهازك
                                  </span>
                                  <span className="text-[10px] text-slate-400 mt-1">
                                    يدعم صيغ JPG و PNG بدقة عالية
                                  </span>
                                  <input
                                    type="file"
                                    accept="image/*"
                                    className="hidden"
                                    onChange={async (e) => {
                                      const file = e.target.files?.[0];
                                      if (file) {
                                        try {
                                          const url = await fileToResizedDataUrl(file, 800);
                                          setCourseSettings({ ...courseSettings, thumbnailUrl: url });
                                          notify("success", "تم رفع صورة الغلاف بنجاح");
                                        } catch {
                                          notify("error", "تعذر معالجة الصورة");
                                        }
                                      }
                                    }}
                                  />
                                </label>
                              )}
                            </div>

                            {/* External URL Collapsible Toggle */}
                            <div className="pt-1">
                              <button
                                type="button"
                                onClick={() => setShowExternalThumbUrl(!showExternalThumbUrl)}
                                className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 hover:underline flex items-center gap-1 cursor-pointer"
                              >
                                <span>{showExternalThumbUrl ? "▲ إخفاء حقل الرابط الخارجي" : "▼ أو إدخال رابط خارجي للصورة"}</span>
                              </button>

                              {showExternalThumbUrl && (
                                <div className="mt-2">
                                  <input
                                    type="url"
                                    placeholder="https://images.unsplash.com/..."
                                    value={courseSettings.thumbnailUrl.startsWith("data:") ? "" : courseSettings.thumbnailUrl}
                                    onChange={(e) => setCourseSettings({ ...courseSettings, thumbnailUrl: e.target.value })}
                                    dir="ltr"
                                    className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-mono text-slate-900 dark:border-slate-800 dark:bg-slate-900 dark:text-white outline-none"
                                  />
                                </div>
                              )}
                            </div>

                            <p className="text-[10px] text-slate-500 dark:text-slate-400">
                              💡 النسبة المثالية لغلاف الكورس هي <strong className="text-emerald-600 dark:text-emerald-400">16:9</strong> (1280×720 بكسل) لعرض جذاب على منصة الطالب وتطبيقات الموبايل.
                            </p>
                          </div>
                        </div>
                      </div>

                      {/* Full-Width Action Footer */}
                      <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end">
                        <button
                          type="submit"
                          className="px-8 py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-all shadow-md shadow-emerald-600/20 cursor-pointer flex items-center gap-2"
                        >
                          <span>💾</span>
                          <span>حفظ إعدادات الكورس</span>
                        </button>
                      </div>
                    </form>
                  </div>
                )}

                {/* ── PRICING TAB (Executive 2-Column Suite Overhaul) ── */}
                {courseTab === "pricing" && (
                  <div className="rounded-3xl border border-slate-200/90 bg-white p-6 shadow-sm dark:border-slate-800/90 dark:bg-slate-900/90 space-y-6">
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-4">
                      <div>
                        <h3 className="font-black text-sm text-slate-900 dark:text-white flex items-center gap-2">
                          <IconTag className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                          <span>تسعير الكورس ونظام الاشتراك</span>
                        </h3>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                          حدد ما إذا كان الكورس مجانياً أو مدفوعاً وقيمة الاشتراك والعروض الترويجية.
                        </p>
                      </div>

                      {selectedCourse?.educationalStage && (
                        <span className="px-3 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700">
                          🎓 المرحلة: {selectedCourse.educationalStage === "sec_1" ? "أولى بكالوريا" : selectedCourse.educationalStage === "sec_2" ? "ثانية بكالوريا" : selectedCourse.educationalStage}
                        </span>
                      )}
                    </div>

                    <form onSubmit={savePricingSettings} className="space-y-6">
                      {/* Full-width Segmented Pricing Mode Selector */}
                      <div>
                        <label className="block text-xs font-bold text-slate-800 dark:text-slate-200 mb-2">
                          نوع الكورس ونظام التحصيل المالي
                        </label>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-1.5 rounded-2xl bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                          <button
                            type="button"
                            onClick={() => setPricingSettings({ ...pricingSettings, isPaid: false })}
                            className={`py-3.5 px-4 rounded-xl text-xs font-bold transition-all cursor-pointer flex flex-col items-center justify-center gap-1 ${
                              !pricingSettings.isPaid
                                ? "bg-white text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 shadow-sm border border-slate-200/80 dark:border-emerald-800"
                                : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                            }`}
                          >
                            <span className="flex items-center gap-1.5 text-sm">
                              <span>🟢</span>
                              <span>كورس مجاني بالكامل</span>
                            </span>
                            <span className="text-[10px] font-normal opacity-80">
                              متاح للطلاب مجاناً بدون الحاجة لدفع اشتراك مالي
                            </span>
                          </button>

                          <button
                            type="button"
                            onClick={() => setPricingSettings({ ...pricingSettings, isPaid: true })}
                            className={`py-3.5 px-4 rounded-xl text-xs font-bold transition-all cursor-pointer flex flex-col items-center justify-center gap-1 ${
                              pricingSettings.isPaid
                                ? "bg-white text-blue-800 dark:bg-blue-950 dark:text-blue-300 shadow-sm border border-slate-200/80 dark:border-blue-800"
                                : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                            }`}
                          >
                            <span className="flex items-center gap-1.5 text-sm">
                              <span>💎</span>
                              <span>كورس مدفوع باشتراك</span>
                            </span>
                            <span className="text-[10px] font-normal opacity-80">
                              يتطلب دفع اشتراك مالي أو كود وصول مفعل للتسجيل
                            </span>
                          </button>
                        </div>
                      </div>

                      {/* 2-Column Balanced Pricing Configuration Grid */}
                      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                        {/* Right Column: Base Pricing / Access Mode (6 Cols) */}
                        <div className="lg:col-span-6 space-y-4">
                          {!pricingSettings.isPaid ? (
                            <div className="p-5 rounded-2xl border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/40 dark:bg-emerald-950/20 space-y-3">
                              <div className="flex items-center justify-between gap-4">
                                <div>
                                  <p className="text-xs font-black text-slate-900 dark:text-white flex items-center gap-1.5">
                                    <span>📲 تثبيت الكورس المباشر للطلاب</span>
                                  </p>
                                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                                    {pricingSettings.allowDirectInstall
                                      ? "مفعّل: يظهر للطالب زر تثبيت فوري بنقرة واحدة بدون طلب أي كود."
                                      : "معطّل: يحتاج الطالب إلى كود وصول للتسجيل حتى وإن كان الكورس مجانياً."}
                                  </p>
                                </div>

                                <button
                                  type="button"
                                  onClick={() => setPricingSettings({ ...pricingSettings, allowDirectInstall: !pricingSettings.allowDirectInstall })}
                                  className={`px-4 py-2 rounded-xl text-xs font-bold border transition-all cursor-pointer shrink-0 ${
                                    pricingSettings.allowDirectInstall
                                      ? "bg-emerald-600 text-white border-emerald-700 shadow-sm"
                                      : "bg-slate-200 text-slate-700 border-slate-300 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700"
                                  }`}
                                >
                                  {pricingSettings.allowDirectInstall ? "مفعّل ✓" : "معطّل"}
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div className="p-5 rounded-2xl border border-blue-200 dark:border-blue-900/60 bg-blue-50/30 dark:bg-blue-950/20 space-y-3">
                              <label className="block text-xs font-black text-slate-900 dark:text-white mb-1">
                                سعر الاشتراك الرسمي في الكورس <span className="text-rose-500">*</span>
                              </label>
                              <div className="relative">
                                <input
                                  type="number"
                                  min={0}
                                  step={0.01}
                                  value={pricingSettings.price}
                                  onChange={(e) => setPricingSettings({ ...pricingSettings, price: e.target.value })}
                                  placeholder="مثال: 150"
                                  className="w-full px-4 py-3 pl-16 rounded-xl border border-slate-200 bg-white text-sm font-mono font-black text-slate-900 outline-none focus:border-blue-500 dark:border-slate-800 dark:bg-slate-900 dark:text-white transition-all shadow-xs"
                                  dir="ltr"
                                  required
                                />
                                <span className="absolute left-4 top-3 text-xs font-bold text-slate-400">
                                  ج.م
                                </span>
                              </div>
                              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                                هذا هو السعر الأساسي الذي يدفعه الطالب عند شراء الكورس من المنصة أو بوابة الدفع.
                              </p>
                            </div>
                          )}
                        </div>

                        {/* Left Column: Limited-Time Promotions & Discounts (6 Cols) */}
                        <div className="lg:col-span-6 space-y-4">
                          <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/40 space-y-4">
                            <div>
                              <p className="text-xs font-black text-slate-900 dark:text-white flex items-center gap-1.5">
                                <span>🏷️ عروض الخصم الترويجي المؤقت (اختياري)</span>
                              </p>
                              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                                خصم تشجيعي يظهر للطلاب مع عداد تنازلي حتى موعد الانتهاء.
                              </p>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                              <div>
                                <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                                  نسبة الخصم %
                                </label>
                                <input
                                  type="number"
                                  min={0}
                                  max={100}
                                  step={1}
                                  value={pricingSettings.discountPercent}
                                  onChange={(e) => setPricingSettings({ ...pricingSettings, discountPercent: e.target.value })}
                                  placeholder="مثال: 20"
                                  className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-mono text-slate-900 dark:border-slate-800 dark:bg-slate-900 dark:text-white outline-none"
                                  dir="ltr"
                                />
                              </div>

                              <div>
                                <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                                  تاريخ ووقت انتهاء الخصم
                                </label>
                                <input
                                  type="datetime-local"
                                  value={pricingSettings.discountExpiresAt}
                                  onChange={(e) => setPricingSettings({ ...pricingSettings, discountExpiresAt: e.target.value })}
                                  className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-mono text-slate-900 dark:border-slate-800 dark:bg-slate-900 dark:text-white outline-none"
                                  dir="ltr"
                                />
                              </div>
                            </div>

                            {/* Preset Discount Pills */}
                            <div className="flex items-center gap-1.5 flex-wrap pt-1">
                              <span className="text-[10px] font-bold text-slate-400">نسب سريعة:</span>
                              {[10, 20, 30, 50].map((pct) => (
                                <button
                                  key={pct}
                                  type="button"
                                  onClick={() => setPricingSettings({ ...pricingSettings, discountPercent: String(pct) })}
                                  className="px-2.5 py-1 rounded-lg text-[10px] font-bold border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:border-emerald-500 transition-colors cursor-pointer"
                                >
                                  {pct}%
                                </button>
                              ))}
                              {pricingSettings.discountPercent && (
                                <button
                                  type="button"
                                  onClick={() => setPricingSettings({ ...pricingSettings, discountPercent: "", discountExpiresAt: "" })}
                                  className="px-2.5 py-1 rounded-lg text-[10px] font-bold text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors cursor-pointer"
                                >
                                  إلغاء الخصم
                                </button>
                              )}
                            </div>

                            {/* Dynamic Price Calculation Summary */}
                            {pricingSettings.discountPercent && pricingSettings.isPaid && pricingSettings.price && (
                              <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-xs flex items-center justify-between">
                                <span className="text-emerald-800 dark:text-emerald-300 font-bold">
                                  السعر بعد الخصم للطالب:
                                </span>
                                <span className="font-mono text-base font-black text-emerald-700 dark:text-emerald-300">
                                  {(parseFloat(pricingSettings.price) * (1 - parseFloat(pricingSettings.discountPercent) / 100)).toFixed(2)} ج.م
                                </span>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Full-Width Action Footer */}
                      <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end">
                        <button
                          type="submit"
                          disabled={savingPricing}
                          className="px-8 py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-all shadow-md shadow-emerald-600/20 cursor-pointer disabled:opacity-50 flex items-center gap-2"
                        >
                          <span>💾</span>
                          <span>{savingPricing ? "جارٍ الحفظ…" : "حفظ إعدادات التسعير"}</span>
                        </button>
                      </div>
                    </form>
                  </div>
                )}
              </div>
            )
          )}

          {/* ════════ CREATE COURSE ════════ */}
          {activeSection === "create-course" && (
            <div className="max-w-2xl">
              <div className="mb-6">
                <h2 className="text-2xl font-black text-[var(--ink)] mb-1.5">إنشاء كورس جديد</h2>
                <p className="text-sm text-[var(--ink-muted)] leading-7">املأ بيانات الكورس مرة واحدة وسيظهر مباشرة في لوحة المعلم والواجهة العامة.</p>
              </div>
              <form onSubmit={createCourse} className={`${cardPad} space-y-4`}>
                <div>
                  <label className={label}>عنوان الكورس *</label>
                  <input type="text" required value={newCourse.title} onChange={(e) => setNewCourse({ ...newCourse, title: e.target.value })} placeholder="رياضيات ثالث ثانوي" className={input} />
                </div>
                <div>
                  <label className={label}>المادة *</label>
                  <select required value={newCourse.subject} onChange={(e) => setNewCourse({ ...newCourse, subject: e.target.value })} className={input}>
                    <option value="">اختر المادة</option>
                    {SUBJECTS.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label className={label}>المرحلة التدريبية *</label>
                  <select required value={newCourse.educationalStage} onChange={(e) => setNewCourse({ ...newCourse, educationalStage: e.target.value })} className={input}>
                    <option value="">اختر المرحلة</option>
                    {EDUCATIONAL_STAGES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className={label}>طبيعة الكورس ونطاق العرض *</label>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <button
                      type="button"
                      onClick={() => setNewCourse({ ...newCourse, deliveryMode: "ONLINE" })}
                      className={`p-3 rounded-xl border text-right transition-all flex flex-col gap-1 cursor-pointer ${
                        newCourse.deliveryMode === "ONLINE"
                          ? "border-sky-500 bg-sky-500/15 text-sky-400 font-bold shadow-sm"
                          : "border-[var(--border)] bg-[var(--surface-2)] text-[var(--ink-muted)] hover:border-slate-500"
                      }`}
                    >
                      <span className="text-sm font-bold">🌐 أونلاين فقط</span>
                      <span className="text-[11px] opacity-80">يظهر على المنصة العامة code-up.tech</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setNewCourse({ ...newCourse, deliveryMode: "CENTER" })}
                      className={`p-3 rounded-xl border text-right transition-all flex flex-col gap-1 cursor-pointer ${
                        newCourse.deliveryMode === "CENTER"
                          ? "border-amber-500 bg-amber-500/15 text-amber-400 font-bold shadow-sm"
                          : "border-[var(--border)] bg-[var(--surface-2)] text-[var(--ink-muted)] hover:border-slate-500"
                      }`}
                    >
                      <span className="text-sm font-bold">🏛️ سنتر وحضوري</span>
                      <span className="text-[11px] opacity-80">يظهر على منصة center.code-up.tech</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setNewCourse({ ...newCourse, deliveryMode: "BOTH" })}
                      className={`p-3 rounded-xl border text-right transition-all flex flex-col gap-1 cursor-pointer ${
                        newCourse.deliveryMode === "BOTH"
                          ? "border-emerald-500 bg-emerald-500/15 text-emerald-400 font-bold shadow-sm"
                          : "border-[var(--border)] bg-[var(--surface-2)] text-[var(--ink-muted)] hover:border-slate-500"
                      }`}
                    >
                      <span className="text-sm font-bold">🔄 كلاهما معاً</span>
                      <span className="text-[11px] opacity-80">يظهر في السنتر والأونلاين</span>
                    </button>
                  </div>
                </div>
                <div>
                  <label className={label}>الصورة المصغرة (رابط أو رفع من الجهاز)</label>
                  <div className="flex gap-2">
                    <input type="text" value={newCourse.thumbnailUrl} onChange={(e) => setNewCourse({ ...newCourse, thumbnailUrl: e.target.value })} placeholder="https://example.com/image.jpg" dir="ltr" className={`${input} font-mono flex-1`} />
                    <label className={`${ghostBtn} cursor-pointer shrink-0`}>
                      رفع صورة
                      <input type="file" accept="image/*" className="hidden" onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          try {
                            const url = await fileToResizedDataUrl(file, 600);
                            setNewCourse({ ...newCourse, thumbnailUrl: url });
                          } catch (err) {
                            notify("error", "تعذر معالجة الصورة");
                          }
                        }
                      }} />
                    </label>
                  </div>
                  {newCourse.thumbnailUrl && newCourse.thumbnailUrl.startsWith("data:image") && (
                    <div className="mt-2 w-32 h-16 rounded overflow-hidden border border-[var(--border)]">
                      <img src={newCourse.thumbnailUrl} alt="Thumbnail preview" className="w-full h-full object-cover" />
                    </div>
                  )}
                  <p className="mt-1.5 text-[11px] text-[var(--ink-muted)]">الأبعاد المثالية: 600×300 بكسل (نسبة 2:1)</p>
                </div>
                <div>
                  <label className={label}>وصف الكورس</label>
                  <textarea rows={3} value={newCourse.description} onChange={(e) => setNewCourse({ ...newCourse, description: e.target.value })} placeholder="وصف مختصر للكورس…" className={`${input} resize-none`} />
                </div>
                <button type="submit" disabled={creatingCourse} className={`${primaryBtn} w-full py-3`}>
                  {creatingCourse ? "جارٍ إنشاء الكورس…" : "إنشاء الكورس"}
                </button>
              </form>
            </div>
          )}

          {/* ════════ CODES ════════ */}
          {activeSection === "codes" && (
            <div className="space-y-5">
              {/* Category Switcher Tab */}
              <div className="flex gap-2 p-1 rounded-xl bg-[var(--surface)] border border-[var(--border)] w-full sm:w-fit">
                <button
                  onClick={() => { setCodeCategory("courses"); setSelectedPlan(null); }}
                  className={`flex-1 sm:flex-none px-4 py-2 rounded-lg text-sm font-bold transition-all ${
                    codeCategory === "courses" ? "bg-sky-500 text-white" : "text-[var(--ink-muted)] hover:text-[var(--ink)]"
                  }`}
                >
                  📚 أكواد الكورسات
                </button>
                <button
                  onClick={() => { setCodeCategory("plans"); setSelectedCourse(null); }}
                  className={`flex-1 sm:flex-none px-4 py-2 rounded-lg text-sm font-bold transition-all ${
                    codeCategory === "plans" ? "bg-emerald-600 text-white" : "text-[var(--ink-muted)] hover:text-[var(--ink)]"
                  }`}
                >
                  🎓 أكواد الخطط والاشتراكات
                </button>
              </div>

              {/* COURSE CODES CATEGORY */}
              {codeCategory === "courses" && (
                !selectedCourse ? (
                  <CoursePicker courses={courses} onSelect={(c) => { setSelectedCourse(c); fetchCodes(c.id, false); }} hint="اختر كورساً لإدارة أكواده:" sub={(c) => `${c._count?.accessCodes || 0} كود`} />
                ) : (
                  <div className="space-y-5">
                    <div className="flex flex-wrap items-center gap-2">
                      <button onClick={() => setSelectedCourse(null)} className="text-xs font-bold text-sky-500 hover:underline me-2">← تغيير الكورس</button>
                      <h2 className="font-bold text-[var(--ink)] me-auto">{selectedCourse.title} — الأكواد</h2>
                      {[1, 5, 10].map((n) => (
                        <button key={n} onClick={() => generateCodes(selectedCourse.id, n, false)} className={ghostBtn}>
                          <IconPlus className="w-4 h-4" /> {n}
                        </button>
                      ))}
                    </div>

                    {/* Bulk generate panel */}
                    <div className={`${cardPad} space-y-4`}>
                      <h3 className="font-bold text-[var(--ink)] text-xs flex items-center gap-2">
                        <IconKey className="w-4 h-4 text-sky-500" />
                        <span>توليد أكواد بكميات كبيرة (تحميل ملف CSV)</span>
                      </h3>
                      <div className="flex flex-wrap items-end gap-3">
                        <div className="w-24 shrink-0">
                          <label className={label}>عدد الأكواد</label>
                          <input
                            type="number"
                            min={1}
                            max={200}
                            value={bulkCount}
                            onChange={(e) => setBulkCount(Math.min(200, Math.max(1, parseInt(e.target.value) || 1)))}
                            className={input}
                          />
                        </div>
                        <div className="w-36 shrink-0">
                          <label className={label}>البادئة (اختياري)</label>
                          <input
                            type="text"
                            placeholder="مثال: MATH"
                            maxLength={10}
                            value={bulkPrefix}
                            onChange={(e) => setBulkPrefix(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
                            className={input}
                            dir="ltr"
                          />
                        </div>
                        <button
                          type="button"
                          disabled={bulkGenerating}
                          onClick={handleBulkGenerate}
                          className={primaryBtn}
                        >
                          {bulkGenerating ? "جارٍ التوليد..." : "إنشاء وتحميل CSV"}
                        </button>
                      </div>
                      <p className="text-[10px] text-[var(--ink-muted)]">
                        يمكنك توليد حتى 200 كود دفعة واحدة ببادئة مخصصة. سيتم تحميل ملف يحتوي على الأكواد الناتجة مباشرة.
                      </p>
                    </div>

                    <div className={`${card} overflow-hidden`}>
                      {codes.length === 0 ? (
                        <EmptyState icon={<IconKey className="w-7 h-7" />} title="لا توجد أكواد بعد" hint="أنشئ أكواداً من الأزرار بالأعلى لتوزيعها على الطلاب." />
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm min-w-[480px]">
                            <thead>
                              <tr className="text-xs text-[var(--ink-muted)] border-b border-[var(--border)]">
                                <th className="text-start font-semibold px-4 py-3">الكود</th>
                                <th className="text-start font-semibold px-4 py-3">المتعلم</th>
                                <th className="text-start font-semibold px-4 py-3">الحالة</th>
                                <th className="text-start font-semibold px-4 py-3">إجراء</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-[var(--border)]">
                              {codes.map((c) => (
                                <tr key={c.id}>
                                  <td className="px-4 py-3 font-mono text-sky-500 dark:text-sky-300 text-xs" dir="ltr">{c.code}</td>
                                  <td className="px-4 py-3 text-[var(--ink)]">
                                    <p className="truncate max-w-[160px]">{c.student?.name || "—"}</p>
                                    {c.student?.phone && (
                                      <div className="mt-2">
                                        <StudentPhoneActions phone={c.student.phone} compact />
                                      </div>
                                    )}
                                  </td>
                                  <td className="px-4 py-3">
                                    <span className={`inline-flex items-center gap-1.5 text-xs font-semibold ${!c.student ? (c.isActive ? "text-emerald-500" : "text-[var(--ink-muted)]") : c.isActive ? "text-emerald-500" : "text-[var(--error)]"}`}>
                                      <span className={`w-1.5 h-1.5 rounded-full ${!c.student ? (c.isActive ? "bg-emerald-500" : "bg-[var(--ink-muted)]") : c.isActive ? "bg-emerald-500" : "bg-[var(--error)]"}`} />
                                      {!c.student ? (c.isActive ? "متاح" : "معطل") : c.isActive ? "مسجل" : "محظور"}
                                    </span>
                                  </td>
                                  <td className="px-4 py-3">
                                    <button onClick={() => toggleCode(c.id, !c.isActive, false)}
                                      className={`px-2.5 py-1 text-xs font-bold rounded-lg transition-colors ${c.isActive ? "text-[var(--error)] hover:bg-[var(--error)]/10" : "text-emerald-500 hover:bg-emerald-500/10"}`}>
                                      {c.isActive ? "تعطيل" : "تفعيل"}
                                    </button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  </div>
                )
              )}

              {/* PLAN CODES CATEGORY */}
              {codeCategory === "plans" && (
                !selectedPlan ? (
                  <div className={`${card} overflow-hidden p-5 space-y-4`}>
                    <h3 className="font-bold text-[var(--ink)] text-sm">اختر خطة دراسية أو اشتراكاً لإدارة أكواده:</h3>
                    {plans.length === 0 ? (
                      <EmptyState icon={<IconBook className="w-7 h-7" />} title="لا توجد خطط منشورة" hint="تواصل مع إدارة المنصة لنشر الخطط الدراسية." />
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {plans.map((p) => (
                          <button
                            key={p.id}
                            onClick={() => { setSelectedPlan(p); fetchCodes(p.id, true); }}
                            className="p-4 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] text-right transition-all hover:border-emerald-500 hover:shadow-md cursor-pointer"
                          >
                            <div className="font-bold text-sm text-[var(--ink)]">{p.title}</div>
                            <div className="text-xs text-[var(--ink-muted)] mt-1 flex justify-between">
                              <span>المرحلة: {p.educationalStage}</span>
                              <span className="font-bold text-emerald-500">{p.price} جنيه</span>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-5">
                    <div className="flex flex-wrap items-center gap-2">
                      <button onClick={() => setSelectedPlan(null)} className="text-xs font-bold text-emerald-500 hover:underline me-2">← تغيير الخطة</button>
                      <h2 className="font-bold text-[var(--ink)] me-auto">{selectedPlan.title} — أكواد الاشتراك</h2>
                      {[1, 5, 10].map((n) => (
                        <button key={n} onClick={() => generateCodes(selectedPlan.id, n, true)} className={ghostBtn}>
                          <IconPlus className="w-4 h-4" /> {n}
                        </button>
                      ))}
                    </div>

                    {/* Bulk generate panel */}
                    <div className={`${cardPad} space-y-4`}>
                      <h3 className="font-bold text-[var(--ink)] text-xs flex items-center gap-2">
                        <IconKey className="w-4 h-4 text-emerald-500" />
                        <span>توليد أكواد اشتراك بكميات كبيرة (تحميل ملف CSV)</span>
                      </h3>
                      <div className="flex flex-wrap items-end gap-3">
                        <div className="w-24 shrink-0">
                          <label className={label}>عدد الأكواد</label>
                          <input
                            type="number"
                            min={1}
                            max={200}
                            value={bulkCount}
                            onChange={(e) => setBulkCount(Math.min(200, Math.max(1, parseInt(e.target.value) || 1)))}
                            className={input}
                          />
                        </div>
                        <div className="w-36 shrink-0">
                          <label className={label}>البادئة (اختياري)</label>
                          <input
                            type="text"
                            placeholder="مثال: SUB"
                            maxLength={10}
                            value={bulkPrefix}
                            onChange={(e) => setBulkPrefix(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
                            className={input}
                            dir="ltr"
                          />
                        </div>
                        <button
                          type="button"
                          disabled={bulkGenerating}
                          onClick={handleBulkGenerate}
                          className={`${primaryBtn} bg-emerald-600 hover:bg-emerald-500`}
                        >
                          {bulkGenerating ? "جارٍ التوليد..." : "إنشاء وتحميل CSV"}
                        </button>
                      </div>
                      <p className="text-[10px] text-[var(--ink-muted)]">
                        سيتم توليد أكواد تفعيل وتنزيل ملف CSV جاهز لطباعته وتوزيعه على الطلاب مباشرة.
                      </p>
                    </div>

                    <div className={`${card} overflow-hidden`}>
                      {codes.length === 0 ? (
                        <EmptyState icon={<IconKey className="w-7 h-7" />} title="لا توجد أكواد بعد" hint="أنشئ أكواد اشتراك من الأزرار بالأعلى لتوزيعها على الطلاب." />
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm min-w-[480px]">
                            <thead>
                              <tr className="text-xs text-[var(--ink-muted)] border-b border-[var(--border)]">
                                <th className="text-start font-semibold px-4 py-3">كود الاشتراك</th>
                                <th className="text-start font-semibold px-4 py-3">المستخدم</th>
                                <th className="text-start font-semibold px-4 py-3">الحالة</th>
                                <th className="text-start font-semibold px-4 py-3">إجراء</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-[var(--border)]">
                              {codes.map((c: any) => (
                                <tr key={c.id}>
                                  <td className="px-4 py-3 font-mono text-emerald-500 text-xs font-bold" dir="ltr">{c.code}</td>
                                  <td className="px-4 py-3 text-[var(--ink)] truncate max-w-[140px]">{c.usedById ? "تم الاستخدام" : "—"}</td>
                                  <td className="px-4 py-3">
                                    <span className={`inline-flex items-center gap-1.5 text-xs font-semibold ${!c.usedById ? (c.isActive ? "text-emerald-500" : "text-[var(--ink-muted)]") : "text-amber-500"}`}>
                                      <span className={`w-1.5 h-1.5 rounded-full ${!c.usedById ? (c.isActive ? "bg-emerald-500" : "bg-[var(--ink-muted)]") : "bg-amber-500"}`} />
                                      {!c.usedById ? (c.isActive ? "متاح" : "معطل") : "مستخدَم"}
                                    </span>
                                  </td>
                                  <td className="px-4 py-3">
                                    <button onClick={() => toggleCode(c.id, !c.isActive, true)}
                                      className={`px-2.5 py-1 text-xs font-bold rounded-lg transition-colors ${c.isActive ? "text-[var(--error)] hover:bg-[var(--error)]/10" : "text-emerald-500 hover:bg-emerald-500/10"}`}>
                                      {c.isActive ? "تعطيل" : "تفعيل"}
                                    </button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  </div>
                )
              )}
            </div>
          )}

          {/* ════════ STUDENTS ════════ */}
          {activeSection === "students" && (
            !selectedCourse ? (
              <CoursePicker courses={courses} onSelect={(c) => selectCourse(c, "students")} hint="اختر كورساً لعرض طلابه:" sub={(c) => `${c._count?.accessCodes || 0} طالب مسجل`} />
            ) : (
              <div className="space-y-5">
                <h2 className="font-bold text-[var(--ink)]">{selectedCourse.title} — المتعلمين</h2>
                <div className={`${card} overflow-hidden`}>
                  {codes.filter((c) => c.student).length === 0 ? (
                    <EmptyState icon={<IconUsers className="w-7 h-7" />} title="لا يوجد طلاب مسجلون بعد" hint="سيظهر الطلاب هنا فور تفعيلهم لأكواد هذا الكورس." />
                  ) : (
                    <ul className="divide-y divide-[var(--border)]">
                      {codes.filter((c) => c.student).map((c) => (
                        <li key={c.id} className="p-4 space-y-3">
                          <div className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-3 min-w-0">
                              <div className="w-11 h-11 rounded-2xl bg-sky-500/12 text-sky-500 dark:text-sky-300 flex items-center justify-center text-sm font-black shrink-0">
                                {c.student!.name[0]}
                              </div>
                              <div className="min-w-0">
                                <p className="font-bold text-[var(--ink)] text-sm truncate">{c.student!.name}</p>
                                <p className="text-xs text-[var(--ink-muted)] truncate">{c.student!.email}</p>
                              </div>
                            </div>
                            <span className={`text-xs font-semibold px-2 py-1 rounded-full ${c.isActive ? "bg-emerald-500/12 text-emerald-500" : "bg-[var(--error)]/12 text-[var(--error)]"}`}>
                              {c.isActive ? "نشط" : "محظور"}
                            </span>
                          </div>
                          <StudentPhoneActions phone={c.student!.phone} />
                          <StudentDossierButton studentId={c.student!.id} courseId={selectedCourse.id} />
                          <div className="flex items-center gap-2">
                            <button type="button" onClick={() => resetDevices(c.student!.id, c.student!.name)}
                              title="مسح أجهزة الطالب ليتمكن من الدخول من جهاز جديد"
                              className="flex-1 min-h-11 px-2.5 text-xs font-bold rounded-xl text-sky-500 bg-sky-500/10">
                              تصفير الأجهزة
                            </button>
                            <button type="button" onClick={() => updateStudentAccess(c.student!.id, c.isActive ? "ban" : "unban")}
                              className={`flex-1 min-h-11 px-2.5 text-xs font-bold rounded-xl ${c.isActive ? "text-[var(--error)] bg-[var(--error)]/10" : "text-emerald-500 bg-emerald-500/10"}`}>
                              {c.isActive ? "حظر" : "إلغاء الحظر"}
                            </button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            )
          )}

          {activeSection === "quiz-results" && <TeacherQuizResults />}
          {activeSection === "requests" && <TeacherRequests key="requests" initialTab="views" />}
          {activeSection === "grade-requests" && <TeacherRequests key="grade-requests" initialTab="grades" />}
          {activeSection === "tickets" && <TeacherRequests key="tickets" initialTab="tickets" />}
          {activeSection === "feedback" && <TeacherFeedback />}

          {/* ════════ HOMEWORK MANAGEMENT ════════ */}
          {activeSection === "homework" && (
            <HomeworkManagerSection
              courses={courses}
              folders={folders}
              selectedCourse={selectedCourse}
              onSelectCourse={(c) => selectCourse(c, "courses")}
              notify={notify}
            />
          )}

          {/* ════════ LIVE REVIEW PANEL ════════ */}
          {activeSection === "review" && (
            <LiveReviewPanel notify={notify} />
          )}
        </div>

      <ConfirmDialog
        open={!!confirmState}
        title={confirmState?.title ?? ""}
        message={confirmState?.message}
        confirmLabel={confirmState?.confirmLabel}
        onConfirm={() => { confirmState?.resolve(true); setConfirmState(null); }}
        onCancel={() => { confirmState?.resolve(false); setConfirmState(null); }}
      />

      {showJsonGuide && <TeacherJSONGuideModal isOpen={showJsonGuide} onClose={() => setShowJsonGuide(false)} />}

      {/* ── DRM Access Gate Password Modal ── */}
      {drmPasswordModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn" dir="rtl">
          <div className="w-full max-w-md bg-[var(--surface)] border border-sky-500/30 rounded-2xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-[var(--border)] pb-3">
              <div className="flex items-center gap-2 font-black text-sm text-[var(--ink)]">
                <span className="p-2 rounded-xl bg-sky-500/10 text-sky-400">🔒</span>
                <span>فتح خيار Axinom Multi-DRM المحمي</span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setDrmPasswordModal(false);
                  setDrmError("");
                  setDrmPasswordInput("");
                }}
                className="text-[var(--ink-muted)] hover:text-[var(--ink)] text-lg cursor-pointer"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-[var(--ink-muted)] leading-relaxed">
              هذا الخيار مقيد ومحمي بكلمة مرور خاصة لمنع استهلاك حصة الـ DRM المحدودة وسيرفر المعالجة بدون إذن مسبق. أدخل كلمة المرور للمتابعة.
            </p>

            <form onSubmit={handleUnlockDrm} className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-[var(--ink)] mb-1">
                  كلمة مرور الـ DRM المقيدة (DRM_UPLOAD_PASSWORD):
                </label>
                <input
                  type="password"
                  autoFocus
                  value={drmPasswordInput}
                  onChange={(e) => {
                    setDrmPasswordInput(e.target.value);
                    if (drmError) setDrmError("");
                  }}
                  placeholder="••••••••••••"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] text-sm text-[var(--ink)] focus:border-sky-500 focus:outline-none transition-colors"
                />
              </div>

              {drmError && (
                <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs flex items-center gap-2">
                  <span>⚠️</span>
                  <span>{drmError}</span>
                </div>
              )}

              <div className="flex items-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setDrmPasswordModal(false);
                    setDrmError("");
                    setDrmPasswordInput("");
                  }}
                  className="flex-1 py-2.5 rounded-xl border border-[var(--border)] hover:bg-[var(--border)]/20 text-xs font-bold text-[var(--ink-muted)] transition-colors cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={drmChecking || !drmPasswordInput.trim()}
                  className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 text-white text-xs font-bold shadow-lg transition-all disabled:opacity-50 cursor-pointer"
                >
                  {drmChecking ? "جارٍ التحقق..." : "دخول وفك القفل"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 🔐 VdoCipher DRM Password Gate Modal */}
      {vdocipherPasswordModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" dir="rtl">
          <div className="w-full max-w-md p-6 rounded-3xl bg-[var(--card)] border border-sky-500/30 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div className="flex items-center gap-2">
                <span className="text-xl">🔒🎬</span>
                <h3 className="text-base font-black text-[var(--ink)]">
                  كلمة مرور حماية VdoCipher DRM
                </h3>
              </div>
              <button
                type="button"
                onClick={() => {
                  setVdocipherPasswordModal(false);
                  setVdocipherPasswordInput("");
                  setVdocipherError("");
                }}
                className="text-[var(--ink-muted)] hover:text-white text-lg font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-[var(--ink-muted)] leading-relaxed m-0">
              خدمة VdoCipher ذات التشفير المتقدم تتطلب إدخال كلمة مرور الحماية المعتمدة الخاصة بالمعلمين للمتابعة ورفع الفيديوهات.
              <br />
              <span className="text-sky-400 font-bold mt-1 inline-block">
                💡 إذا لم تكن تملك كلمة المرور، يرجى طلبها من إدارة المنصة.
              </span>
            </p>

            <form onSubmit={handleUnlockVdocipher} className="space-y-3.5">
              <div>
                <label className="block text-xs font-bold text-[var(--ink)] mb-1">
                  كلمة مرور حماية VdoCipher للمعلمين *
                </label>
                <input
                  type="password"
                  required
                  autoFocus
                  dir="ltr"
                  placeholder="••••••••"
                  value={vdocipherPasswordInput}
                  onChange={(e) => {
                    setVdocipherPasswordInput(e.target.value);
                    if (vdocipherError) setVdocipherError("");
                  }}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-black/30 border border-white/10 font-mono text-sm text-[var(--ink)] focus:outline-none focus:border-sky-500"
                />
              </div>

              {vdocipherError && (
                <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
                  <span>⚠️</span>
                  <span>{vdocipherError}</span>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => {
                    setVdocipherPasswordModal(false);
                    setVdocipherPasswordInput("");
                    setVdocipherError("");
                  }}
                  className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-[var(--ink-muted)] text-xs font-bold transition-all cursor-pointer"
                >
                  إلغاء
                </button>

                <button
                  type="submit"
                  disabled={vdocipherChecking || !vdocipherPasswordInput.trim()}
                  className="px-5 py-2 rounded-xl bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 text-white font-black text-xs shadow-md transition-all disabled:opacity-50 cursor-pointer flex items-center gap-1.5"
                >
                  {vdocipherChecking ? (
                    <>
                      <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      <span>جارٍ التحقق...</span>
                    </>
                  ) : (
                    <>
                      <span>🔓 فتح القفل وتفعيل VdoCipher</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </ClassicAdminShell>
  );
}

// ─── Local presentational helpers ──────────────────────────────────────────────

function CourseThumb({ course }: { course: Course }) {
  if (course.thumbnailUrl) {
    return <Image src={course.thumbnailUrl} alt={course.title} width={48} height={48} className="w-12 h-12 rounded-xl object-cover shrink-0" unoptimized />;
  }
  return (
    <div className="w-12 h-12 rounded-xl bg-sky-500/12 text-sky-500 dark:text-sky-300 flex items-center justify-center shrink-0">
      <IconBook className="w-5 h-5" />
    </div>
  );
}

function EmptyState({ icon, title, hint, action }: { icon: React.ReactNode; title: string; hint?: string; action?: React.ReactNode }) {
  return (
    <div className="py-12 px-6 text-center">
      <div className="mx-auto mb-4 w-14 h-14 rounded-2xl border border-[var(--border)] bg-[var(--bg)] text-[var(--ink-muted)] flex items-center justify-center">
        {icon}
      </div>
      <p className="font-bold text-[var(--ink)]">{title}</p>
      {hint && <p className="text-sm text-[var(--ink-muted)] mt-1.5 max-w-sm mx-auto leading-6">{hint}</p>}
      {action && <div className="mt-5 flex justify-center">{action}</div>}
    </div>
  );
}

function CoursePicker({ courses, onSelect, hint, sub }: { courses: Course[]; onSelect: (c: Course) => void; hint: string; sub: (c: Course) => string }) {
  if (courses.length === 0) {
    return (
      <div className={cardPad}>
        <EmptyState icon={<IconBook className="w-7 h-7" />} title="لا توجد كورسات" hint="أنشئ كورساً أولاً." />
      </div>
    );
  }
  return (
    <div>
      <p className="text-sm text-[var(--ink-muted)] mb-4">{hint}</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {courses.map((c) => (
          <button key={c.id} onClick={() => onSelect(c)} className={`${cardPad} text-right hover:border-sky-400/50 transition-colors`}>
            <p className="font-bold text-[var(--ink)] truncate">{c.title}</p>
            <p className="text-sm text-[var(--ink-muted)] mt-0.5">{sub(c)}</p>
          </button>
        ))}
      </div>
    </div>
  );
}
