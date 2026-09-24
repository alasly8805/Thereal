"use client";

import React, { useState } from "react";
import { useToast } from "@/components/ui/Toast";
import { VideoEncryptionStudioModal } from "./VideoEncryptionStudioModal";
import {
  AddQuizModal,
  AddHomeworkModal,
  AddMaterialModal,
  exportQuizToJson,
  exportHomeworkToJson,
} from "./TeacherCurriculumModals";
import { EditQuizModal } from "./EditQuizModal";
import { EditHomeworkModal } from "./EditHomeworkModal";
import {
  Folder,
  Plus,
  Trash2,
  Clock,
  ChevronUp,
  ChevronDown,
  Calendar,
  Layers,
  UploadCloud,
  HardDrive,
  HelpCircle,
  BookOpen,
  FileText,
  ExternalLink,
  Code,
  Paperclip,
  CheckCircle2,
  AlertCircle,
  Video,
  Sparkles,
  Download,
  Pencil,
} from "lucide-react";

export interface VideoItem {
  id: string;
  title: string;
  vdoCipherId?: string;
  videoProvider?: string;
  providerVideoId?: string;
  maxWatchesPerUser?: number;
  durationMinutes?: number;
  isFree?: boolean;
  publishAt?: string | null;
  order?: number;
}

export interface QuizItem {
  id: string;
  title?: string;
  timeLimitMinutes?: number;
  questions?: Array<any>;
}

export interface MaterialItem {
  id: string;
  title: string;
  type: string;
  url: string;
}

export interface HomeworkItem {
  id: string;
  title: string;
  type: string;
  description?: string | null;
  timeLimitMinutes?: number;
  questions?: Array<any>;
  _count?: { questions?: number; submissions?: number };
}

export interface FolderItem {
  id: string;
  name: string;
  order?: number;
  color?: string | null;
  publishAt?: string | null;
  price?: number | null;
  isPurchasable?: boolean;
  videos?: VideoItem[];
  quizzes?: QuizItem[];
  materials?: MaterialItem[];
  homeworks?: HomeworkItem[];
  _count?: { videos?: number; quizzes?: number; materials?: number; homeworks?: number };
}

interface Props {
  courseId: string;
  courseTitle: string;
  folders: FolderItem[];
  onRefreshFolders: () => Promise<void>;
}

// 6 Curated Executive Folder Colors
export const FOLDER_COLORS = [
  {
    id: "emerald",
    label: "زمردي ملكي",
    dotClass: "bg-emerald-600",
    badgeClass: "bg-emerald-50 text-emerald-800 border-emerald-300 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800",
    cardBorder: "border-emerald-500/40 hover:border-emerald-500",
    headerBg: "bg-emerald-50/50 dark:bg-emerald-950/30",
    iconColor: "text-emerald-600 dark:text-emerald-400",
  },
  {
    id: "blue",
    label: "أزرق محيطي",
    dotClass: "bg-blue-600",
    badgeClass: "bg-blue-50 text-blue-800 border-blue-300 dark:bg-blue-950/60 dark:text-blue-300 dark:border-blue-800",
    cardBorder: "border-blue-500/40 hover:border-blue-500",
    headerBg: "bg-blue-50/50 dark:bg-blue-950/30",
    iconColor: "text-blue-600 dark:text-blue-400",
  },
  {
    id: "amber",
    label: "كهرماني ذهبي",
    dotClass: "bg-amber-600",
    badgeClass: "bg-amber-50 text-amber-800 border-amber-300 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800",
    cardBorder: "border-amber-500/40 hover:border-amber-500",
    headerBg: "bg-amber-50/50 dark:bg-amber-950/30",
    iconColor: "text-amber-600 dark:text-amber-400",
  },
  {
    id: "rose",
    label: "ياقوتي قرمزي",
    dotClass: "bg-rose-600",
    badgeClass: "bg-rose-50 text-rose-800 border-rose-300 dark:bg-rose-950/60 dark:text-rose-300 dark:border-rose-800",
    cardBorder: "border-rose-500/40 hover:border-rose-500",
    headerBg: "bg-rose-50/50 dark:bg-rose-950/30",
    iconColor: "text-rose-600 dark:text-rose-400",
  },
  {
    id: "cyan",
    label: "تركواز بحري",
    dotClass: "bg-cyan-600",
    badgeClass: "bg-cyan-50 text-cyan-800 border-cyan-300 dark:bg-cyan-950/60 dark:text-cyan-300 dark:border-cyan-800",
    cardBorder: "border-cyan-500/40 hover:border-cyan-500",
    headerBg: "bg-cyan-50/50 dark:bg-cyan-950/30",
    iconColor: "text-cyan-600 dark:text-cyan-400",
  },
  {
    id: "slate",
    label: "أوبسيديان كلاسيكي",
    dotClass: "bg-slate-700",
    badgeClass: "bg-slate-100 text-slate-800 border-slate-300 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700",
    cardBorder: "border-slate-300 hover:border-slate-400 dark:border-slate-700 dark:hover:border-slate-600",
    headerBg: "bg-slate-50/70 dark:bg-slate-900/60",
    iconColor: "text-slate-700 dark:text-slate-300",
  },
];

export function getFolderColorDef(colorId?: string | null) {
  return FOLDER_COLORS.find((c) => c.id === colorId) || FOLDER_COLORS[1]; // default blue
}

export function TeacherCurriculumStudio({
  courseId,
  courseTitle,
  folders,
  onRefreshFolders,
}: Props) {
  const { success: toastSuccess, error: toastError } = useToast();

  // Create Folder State
  const [newFolderName, setNewFolderName] = useState("");
  const [newFolderColor, setNewFolderColor] = useState("blue");
  const [showCreateColorPicker, setShowCreateColorPicker] = useState(false);
  const [newFolderPublishAt, setNewFolderPublishAt] = useState("");
  const [creatingFolder, setCreatingFolder] = useState(false);

  // Active Modals
  const [activeVideoModal, setActiveVideoModal] = useState<{
    folderId: string;
    folderName: string;
    initialMode?: "upload" | "gdrive" | "manual" | "youtube";
  } | null>(null);

  const [activeQuizModal, setActiveQuizModal] = useState<{
    folderId: string;
    folderName: string;
  } | null>(null);

  const [activeEditQuiz, setActiveEditQuiz] = useState<{
    id: string;
    title: string;
    questions: Array<any>;
  } | null>(null);

  const [activeEditHomework, setActiveEditHomework] = useState<{
    id: string;
    title: string;
    questions: Array<any>;
  } | null>(null);

  const [activeHomeworkModal, setActiveHomeworkModal] = useState<{
    folderId: string;
    folderName: string;
  } | null>(null);

  const [activeMaterialModal, setActiveMaterialModal] = useState<{
    folderId: string;
    folderName: string;
  } | null>(null);

  // Color picker open per folder
  const [activeColorPickerFolderId, setActiveColorPickerFolderId] = useState<string | null>(null);

  // Expanded folders state
  const [expandedFolderIds, setExpandedFolderIds] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    folders.forEach((f) => {
      init[f.id] = true;
    });
    return init;
  });

  const toggleFolderExpand = (folderId: string) => {
    setExpandedFolderIds((prev) => ({ ...prev, [folderId]: !prev[folderId] }));
  };

  // In-Video Questions State
  const [expandedVideoQuestions, setExpandedVideoQuestions] = useState<Record<string, boolean>>({});
  const [videoQuestions, setVideoQuestions] = useState<Record<string, any[]>>({});
  const [loadingQuestions, setLoadingQuestions] = useState<Record<string, boolean>>({});
  const [addQuestionStates, setAddQuestionStates] = useState<Record<string, any>>({});
  const [submittingQuestion, setSubmittingQuestion] = useState<Record<string, boolean>>({});
  const [togglingFreeVideoId, setTogglingFreeVideoId] = useState<string | null>(null);

  // ── Handlers ──

  // Create New Folder
  const handleCreateFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFolderName.trim()) {
      toastError("يرجى إدخال اسم المحاضرة أو الوحدة");
      return;
    }

    setCreatingFolder(true);
    try {
      const res = await fetch(`/api/admin/courses/${courseId}/folders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newFolderName.trim(),
          color: newFolderColor,
          publishAt: newFolderPublishAt || null,
        }),
      });

      const data = await res.json();
      if (res.ok && data.folder) {
        toastSuccess(`تم إنشاء المحاضرة "${newFolderName}" بنجاح!`);
        setNewFolderName("");
        setNewFolderPublishAt("");
        await onRefreshFolders();
      } else {
        toastError(data.error || "تعذر إنشاء المحاضرة");
      }
    } catch {
      toastError("حدث خطأ أثناء الاتصال بالخادم");
    } finally {
      setCreatingFolder(false);
    }
  };

  // Update Folder Color
  const handleUpdateFolderColor = async (folderId: string, newColor: string) => {
    try {
      const res = await fetch(`/api/admin/courses/${courseId}/folders`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folderId, color: newColor }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        toastSuccess("تم تحديث لون المحاضرة بنجاح!");
        setActiveColorPickerFolderId(null);
        await onRefreshFolders();
      } else {
        toastError(data.error || "تعذر تحديث لون المحاضرة");
      }
    } catch {
      toastError("حدث خطأ أثناء الاتصال بالخادم");
    }
  };

  // Delete Folder
  const handleDeleteFolder = async (folderId: string, folderName: string) => {
    if (!window.confirm(`هل أنت متأكد من حذف المحاضرة "${folderName}" وجميع محتوياتها نهائياً؟`)) {
      return;
    }

    try {
      const res = await fetch(`/api/admin/courses/${courseId}/folders`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folderId }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        toastSuccess("تم حذف المحاضرة بنجاح");
        await onRefreshFolders();
      } else {
        toastError(data.error || "تعذر حذف المحاضرة");
      }
    } catch {
      toastError("حدث خطأ أثناء الاتصال بالخادم");
    }
  };

  // Delete Video
  const handleDeleteVideo = async (folderId: string, videoId: string, videoTitle: string) => {
    if (!window.confirm(`هل أنت متأكد من حذف الدرس "${videoTitle}"؟`)) {
      return;
    }

    try {
      const res = await fetch(`/api/admin/folders/${folderId}/videos`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videoId }),
      });

      const data = await res.json();
      if (res.ok && !data.error) {
        toastSuccess("تم حذف الفيديو بنجاح");
        await onRefreshFolders();
      } else {
        toastError(data.error || "تعذر حذف الفيديو");
      }
    } catch {
      toastError("حدث خطأ أثناء الاتصال بالخادم");
    }
  };

  const handleToggleVideoFree = async (videoId: string, currentFree: boolean) => {
    if (togglingFreeVideoId) return;
    setTogglingFreeVideoId(videoId);
    try {
      const res = await fetch(`/api/admin/videos/${videoId}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isFree: !currentFree }),
      });

      const raw = await res.text();
      let data: { error?: string } = {};
      if (raw) {
        try {
          data = JSON.parse(raw) as { error?: string };
        } catch {
          toastError("تعذر تعديل حالة الفيديو");
          return;
        }
      }

      if (res.ok && !data.error) {
        toastSuccess(!currentFree ? "تم جعل الدرس تجريبياً مجانياً للطلاب" : "تم إلغاء التجريبي وجعله مدفوعاً");
        await onRefreshFolders();
      } else {
        toastError(data.error || "تعذر تعديل حالة الفيديو");
      }
    } catch {
      toastError("تعذر الاتصال بالخادم");
    } finally {
      setTogglingFreeVideoId(null);
    }
  };

  // Delete Quiz
  const handleDeleteQuiz = async (quizId: string, title?: string) => {
    if (!window.confirm(`هل أنت متأكد من حذف الاختبار "${title || "اختبار المحاضرة"}" وإجابات الطلاب المرتبطة به؟`)) {
      return;
    }

    try {
      const res = await fetch(`/api/admin/teacher/exam-dashboard?quizId=${quizId}`, {
        method: "DELETE",
        credentials: "include",
      });
      const data = await res.json();
      if (res.ok && !data.error) {
        toastSuccess("تم حذف الاختبار بنجاح");
        await onRefreshFolders();
      } else {
        toastError(data.error || "تعذر حذف الاختبار");
      }
    } catch {
      toastError("حدث خطأ أثناء حذف الاختبار");
    }
  };

  // Delete Homework
  const handleDeleteHomework = async (homeworkId: string, title: string) => {
    if (!window.confirm(`هل أنت متأكد من حذف الواجب "${title}" وتسليمات الطلاب المرتبطة به؟`)) {
      return;
    }

    try {
      const res = await fetch("/api/admin/homework", {
        method: "DELETE",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ homeworkId }),
      });
      if (res.ok) {
        toastSuccess("تم حذف الواجب بنجاح");
        await onRefreshFolders();
      } else {
        toastError("تعذر حذف الواجب");
      }
    } catch {
      toastError("حدث خطأ أثناء حذف الواجب");
    }
  };

  // Delete Material
  const handleDeleteMaterial = async (materialId: string, title: string) => {
    if (!window.confirm(`هل أنت متأكد من حذف الملحق "${title}"؟`)) {
      return;
    }

    try {
      const res = await fetch(`/api/admin/courses/${courseId}/materials`, {
        method: "DELETE",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ materialId }),
      });
      if (res.ok) {
        toastSuccess("تم حذف الملحق بنجاح");
        await onRefreshFolders();
      } else {
        toastError("تعذر حذف الملحق");
      }
    } catch {
      toastError("حدث خطأ أثناء حذف الملحق");
    }
  };

  // ── In-Video Questions Handlers ──

  const loadVideoQuestions = async (videoId: string) => {
    setLoadingQuestions((prev) => ({ ...prev, [videoId]: true }));
    try {
      const res = await fetch(`/api/admin/videos/${videoId}/questions`, {
        credentials: "include",
      });
      const data = await res.json();
      if (res.ok && data.questions) {
        setVideoQuestions((prev) => ({ ...prev, [videoId]: data.questions }));
      }
    } catch {
      /* ignore */
    } finally {
      setLoadingQuestions((prev) => ({ ...prev, [videoId]: false }));
    }
  };

  const toggleVideoQuestions = (videoId: string) => {
    const isNowOpen = !expandedVideoQuestions[videoId];
    setExpandedVideoQuestions((prev) => ({ ...prev, [videoId]: isNowOpen }));
    if (isNowOpen && !videoQuestions[videoId]) {
      void loadVideoQuestions(videoId);
    }
  };

  const getAddQuestionState = (videoId: string) => {
    return (
      addQuestionStates[videoId] || {
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
      }
    );
  };

  const updateAddQuestionState = (videoId: string, fields: Partial<any>) => {
    setAddQuestionStates((prev) => ({
      ...prev,
      [videoId]: { ...getAddQuestionState(videoId), ...fields },
    }));
  };

  const handleAddTimedQuestion = async (e: React.FormEvent, videoId: string) => {
    e.preventDefault();
    const state = getAddQuestionState(videoId);

    // Parse MM:SS to seconds
    let seconds = 0;
    if (state.triggerTimestamp.includes(":")) {
      const [m, s] = state.triggerTimestamp.split(":").map(Number);
      if (isNaN(m) || isNaN(s)) {
        toastError("توقيت غير صالح. استخدم تنسيق MM:SS مثل 01:30");
        return;
      }
      seconds = m * 60 + s;
    } else {
      seconds = Number(state.triggerTimestamp);
      if (isNaN(seconds) || seconds < 0) {
        toastError("توقيت غير صالح. أدخل الثواني الإجمالية أو MM:SS");
        return;
      }
    }

    setSubmittingQuestion((prev) => ({ ...prev, [videoId]: true }));
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
          refireOnRewatch: Boolean(state.refireOnRewatch),
        }),
      });

      const data = await res.json();
      if (res.ok) {
        toastSuccess("تم إضافة السؤال للفيديو بنجاح ✅");
        updateAddQuestionState(videoId, {
          triggerTimestamp: "",
          questionText: "",
          optionA: "",
          optionB: "",
          optionC: "",
          optionD: "",
          explanation: "",
        });
        await loadVideoQuestions(videoId);
      } else {
        toastError(data.error || "تعذر إضافة السؤال");
      }
    } catch {
      toastError("حدث خطأ أثناء الاتصال بالخادم");
    } finally {
      setSubmittingQuestion((prev) => ({ ...prev, [videoId]: false }));
    }
  };

  const handleDeleteTimedQuestion = async (videoId: string, questionId: string) => {
    if (!window.confirm("هل أنت متأكد من حذف هذا السؤال التفاعلي؟")) return;

    try {
      const res = await fetch(`/api/admin/videos/${videoId}/questions`, {
        method: "DELETE",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questionId }),
      });

      if (res.ok) {
        toastSuccess("تم حذف السؤال بنجاح");
        await loadVideoQuestions(videoId);
      } else {
        const d = await res.json();
        toastError(d.error || "تعذر حذف السؤال");
      }
    } catch {
      toastError("حدث خطأ أثناء حذف السؤال");
    }
  };

  return (
    <div dir="rtl" className="space-y-6">
      {/* ── Top Header Banner ── */}
      <div className="rounded-3xl border border-slate-200/90 bg-white p-5 sm:p-6 shadow-xs dark:border-slate-800/90 dark:bg-slate-900/90 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className="p-1.5 rounded-xl bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
              <Layers className="w-4 h-4" />
            </span>
            <h2 className="text-base font-black text-slate-900 dark:text-white">
              استوديو هيكلة المحاضرات والدروس
            </h2>
            <span className="text-xs font-mono font-bold bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 px-2.5 py-0.5 rounded-lg border border-slate-200 dark:border-slate-700">
              {courseTitle}
            </span>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            شجرة المنهج المتكاملة: أضف فيديوهات، اختبارات تفاعلية، واجبات، وملحقات PDF لكل محاضرة مع واجهة سريعة ومتجاوبة تماماً مع الهاتف.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <div className="px-3 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-950/50 border border-slate-200 dark:border-slate-800 text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-2">
            <span>إجمالي المحاضرات:</span>
            <span className="font-mono text-emerald-600 dark:text-emerald-400 font-black">{folders.length}</span>
          </div>
        </div>
      </div>

      {/* ── Create New Lecture Folder Form ── */}
      <div className="rounded-3xl border border-slate-200/90 bg-white p-4 sm:p-5 shadow-xs dark:border-slate-800/90 dark:bg-slate-900/90 space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3 flex-wrap gap-2">
          <div className="flex items-center gap-2 font-black text-xs text-slate-900 dark:text-white">
            <Folder className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            <span>إضافة محاضرة / وحدة جديدة</span>
          </div>
          <span className="text-[11px] text-slate-400 dark:text-slate-500">اختر لون وتوقيت الفتح</span>
        </div>

        <form onSubmit={handleCreateFolder} className="space-y-3">
          <div className="flex flex-col sm:flex-row gap-2.5">
            <input
              type="text"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              placeholder="مثال: المحاضرة الأولى - مفاهيم التأسيس الشامل"
              className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-xs font-medium text-slate-900 outline-none focus:border-emerald-500 focus:bg-white dark:border-slate-800 dark:bg-slate-950 dark:text-white transition-all"
            />

            <button
              type="submit"
              disabled={creatingFolder || !newFolderName.trim()}
              className="px-5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white dark:bg-emerald-700 dark:hover:bg-emerald-600 text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-xs disabled:opacity-50 shrink-0 min-h-[44px]"
            >
              <Plus className="w-4 h-4" />
              <span>{creatingFolder ? "جارٍ الإضافة..." : "إضافة المحاضرة"}</span>
            </button>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-1 text-[11px] text-slate-500 dark:text-slate-400">
            <div className="flex flex-wrap items-center gap-2">
              <Calendar className="w-3.5 h-3.5 text-slate-400" />
              <span>موعد الفتح المجدول (اختياري):</span>
              <input
                type="datetime-local"
                value={newFolderPublishAt}
                onChange={(e) => setNewFolderPublishAt(e.target.value)}
                dir="ltr"
                className="px-3 py-1.5 rounded-lg border border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-950 text-[11px] font-mono outline-none"
              />
              {newFolderPublishAt && (
                <button
                  type="button"
                  onClick={() => setNewFolderPublishAt("")}
                  className="text-rose-500 hover:underline font-bold text-[10px] cursor-pointer"
                >
                  مسح الموعد
                </button>
              )}
            </div>

            {/* Optional Folder Color Picker */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowCreateColorPicker(!showCreateColorPicker)}
                className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 hover:bg-slate-100 dark:bg-slate-950 dark:hover:bg-slate-800 text-[11px] font-bold text-slate-700 dark:text-slate-300 flex items-center gap-2 transition-all cursor-pointer shadow-xs"
              >
                <span className={`w-2.5 h-2.5 rounded-full ${getFolderColorDef(newFolderColor).dotClass}`} />
                <span>تخصيص لون (اختياري)</span>
              </button>

              {showCreateColorPicker && (
                <div className="absolute left-0 bottom-full mb-1.5 p-2 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl z-20 flex items-center gap-1.5 animate-in fade-in">
                  {FOLDER_COLORS.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => {
                        setNewFolderColor(c.id);
                        setShowCreateColorPicker(false);
                      }}
                      title={c.label}
                      className={`w-6 h-6 rounded-full transition-all cursor-pointer ${c.dotClass} ${
                        newFolderColor === c.id ? "ring-2 ring-slate-900 dark:ring-white scale-110 shadow-xs" : "opacity-60 hover:opacity-100"
                      }`}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        </form>
      </div>

      {/* ── Curriculum Hierarchy Tree ── */}
      {folders.length === 0 ? (
        <div className="p-12 sm:p-16 text-center rounded-3xl border border-slate-200/90 bg-white dark:border-slate-800 dark:bg-slate-900/90 text-slate-500">
          <div className="text-4xl mb-2">📁</div>
          <h3 className="font-bold text-sm text-slate-800 dark:text-slate-200">لا توجد محاضرات في هذا الكورس بعد</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            أضف أول محاضرة من النموذج أعلاه، ثم ابدأ بإضافة الفيديوهات، الاختبارات، والواجبات.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {folders.map((folder, folderIndex) => {
            const colorDef = getFolderColorDef(folder.color);
            const isExpanded = expandedFolderIds[folder.id] ?? true;
            const videoCount = folder.videos?.length || 0;
            const quizCount = folder.quizzes?.length || 0;
            const hwCount = folder.homeworks?.length || 0;
            const matCount = folder.materials?.length || 0;
            const totalItems = videoCount + quizCount + hwCount + matCount;

            return (
              <div
                key={folder.id}
                className={`rounded-3xl border-2 bg-white dark:bg-slate-900 shadow-xs transition-all overflow-hidden ${colorDef.cardBorder}`}
              >
                {/* ── Folder Header ── */}
                <div
                  className={`p-4 sm:p-5 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-3 border-b border-slate-200/80 dark:border-slate-800/80 transition-colors ${colorDef.headerBg}`}
                >
                  {/* Folder Title & Badges */}
                  <div className="flex items-center gap-3 min-w-0 w-full lg:w-auto">
                    <button
                      type="button"
                      onClick={() => toggleFolderExpand(folder.id)}
                      className="p-2.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-xs cursor-pointer hover:scale-105 transition-all shrink-0"
                    >
                      <Folder className={`w-5 h-5 ${colorDef.iconColor}`} />
                    </button>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[10px] font-black font-mono px-2 py-0.5 rounded-md bg-white/80 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                          وحدة #{String(folderIndex + 1).padStart(2, "0")}
                        </span>
                        <h3 className="font-black text-sm text-slate-900 dark:text-white truncate">
                          {folder.name}
                        </h3>
                        <span className={`text-[9px] font-black px-2 py-0.5 rounded-full border ${colorDef.badgeClass}`}>
                          {colorDef.label}
                        </span>
                      </div>

                      <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 flex flex-wrap items-center gap-2">
                        <span className="font-semibold">{videoCount} فيديو</span>
                        <span>·</span>
                        <span className="font-semibold text-sky-600 dark:text-sky-400">{quizCount} اختبار</span>
                        <span>·</span>
                        <span className="font-semibold text-amber-600 dark:text-amber-400">{hwCount} واجب</span>
                        <span>·</span>
                        <span className="font-semibold text-purple-600 dark:text-purple-400">{matCount} ملحق</span>
                        {folder.publishAt && (
                          <>
                            <span>·</span>
                            <span className="text-amber-600 dark:text-amber-400 font-bold flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              <span>يُفتح: {new Date(folder.publishAt).toLocaleDateString("ar-EG")}</span>
                            </span>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Expand/Collapse on Mobile */}
                    <button
                      type="button"
                      onClick={() => toggleFolderExpand(folder.id)}
                      className="p-2 rounded-xl text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 lg:hidden cursor-pointer shrink-0"
                      aria-label="طي أو توسيع المحاضرة"
                    >
                      {isExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                    </button>
                  </div>

                  {/* Folder Actions Bar (Responsive Grid on Mobile) */}
                  <div className="flex flex-wrap items-center gap-1.5 w-full lg:w-auto shrink-0 justify-start lg:justify-end pt-2 lg:pt-0 border-t lg:border-t-0 border-slate-200/60 dark:border-slate-800/60">
                    {/* Add Video Button */}
                    <button
                      type="button"
                      onClick={() =>
                        setActiveVideoModal({
                          folderId: folder.id,
                          folderName: folder.name,
                          initialMode: "upload",
                        })
                      }
                      className="px-3 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white dark:bg-emerald-700 dark:hover:bg-emerald-600 text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-xs min-h-[40px]"
                      title="إضافة درس فيديو مشفر"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>+ فيديو</span>
                    </button>

                    {/* Add Quiz Button */}
                    <button
                      type="button"
                      onClick={() =>
                        setActiveQuizModal({
                          folderId: folder.id,
                          folderName: folder.name,
                        })
                      }
                      className="px-3 py-2 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-xs min-h-[40px]"
                      title="إضافة اختبار جديد لهذه المحاضرة"
                    >
                      <HelpCircle className="w-3.5 h-3.5" />
                      <span>+ اختبار</span>
                    </button>

                    {/* Add Homework Button */}
                    <button
                      type="button"
                      onClick={() =>
                        setActiveHomeworkModal({
                          folderId: folder.id,
                          folderName: folder.name,
                        })
                      }
                      className="px-3 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-xs min-h-[40px]"
                      title="إضافة واجب لهذه المحاضرة"
                    >
                      <BookOpen className="w-3.5 h-3.5" />
                      <span>+ واجب</span>
                    </button>

                    {/* Add Material Button */}
                    <button
                      type="button"
                      onClick={() =>
                        setActiveMaterialModal({
                          folderId: folder.id,
                          folderName: folder.name,
                        })
                      }
                      className="px-3 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-xs min-h-[40px]"
                      title="إضافة ملحق أو ملف PDF لهذه المحاضرة"
                    >
                      <FileText className="w-3.5 h-3.5" />
                      <span>+ ملحق</span>
                    </button>

                    {/* Color Swatch Picker */}
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() =>
                          setActiveColorPickerFolderId(
                            activeColorPickerFolderId === folder.id ? null : folder.id
                          )
                        }
                        className="p-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1.5 hover:bg-slate-50 dark:hover:bg-slate-700 transition-all cursor-pointer shadow-xs min-h-[40px]"
                        title="تخصيص لون المحاضرة"
                      >
                        <span className={`w-3.5 h-3.5 rounded-full ${colorDef.dotClass}`} />
                      </button>

                      {activeColorPickerFolderId === folder.id && (
                        <div className="absolute left-0 top-full mt-1.5 p-2 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-xl z-30 flex items-center gap-1.5 animate-in fade-in duration-150">
                          {FOLDER_COLORS.map((c) => (
                            <button
                              key={c.id}
                              type="button"
                              onClick={() => void handleUpdateFolderColor(folder.id, c.id)}
                              title={c.label}
                              className={`w-6 h-6 rounded-full transition-all cursor-pointer ${c.dotClass} ${
                                folder.color === c.id
                                  ? "ring-2 ring-slate-900 dark:ring-white scale-110"
                                  : "opacity-60 hover:opacity-100"
                              }`}
                            />
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Delete Folder */}
                    <button
                      type="button"
                      onClick={() => void handleDeleteFolder(folder.id, folder.name)}
                      className="p-2 rounded-xl text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/40 border border-transparent hover:border-rose-200 dark:hover:border-rose-900/50 transition-all cursor-pointer min-h-[40px]"
                      title="حذف المحاضرة"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>

                    {/* Desktop Expand/Collapse */}
                    <button
                      type="button"
                      onClick={() => toggleFolderExpand(folder.id)}
                      className="p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer hidden lg:flex items-center justify-center min-h-[40px]"
                      title={isExpanded ? "طي المحتوى" : "عرض المحتوى"}
                    >
                      {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {/* ── Folder Content: Complete Curriculum Tree ── */}
                {isExpanded && (
                  <div className="p-4 sm:p-5 space-y-6 bg-slate-50/40 dark:bg-slate-950/20">
                    {totalItems === 0 ? (
                      <div className="p-8 text-center border border-dashed border-slate-300 dark:border-slate-800 rounded-2xl space-y-3">
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          هذه المحاضرة فارغة حالياً. ابدأ بإضافة محتواها الأول:
                        </p>
                        <div className="flex items-center justify-center gap-2 flex-wrap pt-1">
                          <button
                            type="button"
                            onClick={() =>
                              setActiveVideoModal({
                                folderId: folder.id,
                                folderName: folder.name,
                                initialMode: "upload",
                              })
                            }
                            className="px-3.5 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-xs"
                          >
                            <UploadCloud className="w-3.5 h-3.5" />
                            <span>رفع فيديو</span>
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              setActiveQuizModal({
                                folderId: folder.id,
                                folderName: folder.name,
                              })
                            }
                            className="px-3.5 py-2 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-xs"
                          >
                            <HelpCircle className="w-3.5 h-3.5" />
                            <span>إضافة اختبار</span>
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              setActiveHomeworkModal({
                                folderId: folder.id,
                                folderName: folder.name,
                              })
                            }
                            className="px-3.5 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-xs"
                          >
                            <BookOpen className="w-3.5 h-3.5" />
                            <span>إضافة واجب</span>
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              setActiveMaterialModal({
                                folderId: folder.id,
                                folderName: folder.name,
                              })
                            }
                            className="px-3.5 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-xs"
                          >
                            <FileText className="w-3.5 h-3.5" />
                            <span>إضافة PDF / ملحق</span>
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-6">
                        {/* 1. VIDEOS SECTION */}
                        {videoCount > 0 && (
                          <div className="space-y-2.5">
                            <div className="flex items-center justify-between">
                              <h4 className="text-xs font-black text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                                <Video className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                                <span>الدروس المشفرة والفيديوهات ({videoCount})</span>
                              </h4>
                            </div>

                            <div className="space-y-2">
                              {folder.videos?.map((video, vIndex) => {
                                const prov = video.videoProvider || "alasly";
                                const provLabel =
                                  prov === "axinom"
                                    ? "Axinom Multi-DRM"
                                    : prov === "vdocipher"
                                    ? "VdoCipher DRM"
                                    : prov === "youtube"
                                    ? "YouTube"
                                    : "Native Engine";

                                const provBadgeColor =
                                  prov === "axinom"
                                    ? "bg-cyan-50 text-cyan-800 border-cyan-300 dark:bg-cyan-950/50 dark:text-cyan-300"
                                    : prov === "vdocipher"
                                    ? "bg-purple-50 text-purple-800 border-purple-300 dark:bg-purple-950/50 dark:text-purple-300"
                                    : prov === "youtube"
                                    ? "bg-red-50 text-red-800 border-red-300 dark:bg-red-950/50 dark:text-red-300"
                                    : "bg-emerald-50 text-emerald-800 border-emerald-300 dark:bg-emerald-950/50 dark:text-emerald-300";

                                const isQuestionsOpen = expandedVideoQuestions[video.id] ?? false;
                                const questionsList = videoQuestions[video.id] || [];

                                return (
                                  <div
                                    key={video.id}
                                    className="rounded-2xl border border-slate-200/90 dark:border-slate-800/90 bg-white dark:bg-slate-900 overflow-hidden shadow-xs hover:shadow-sm transition-all"
                                  >
                                    <div className="p-3 sm:p-3.5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5">
                                      {/* Lesson Number & Title */}
                                      <div className="flex items-center gap-3 min-w-0 flex-1">
                                        <span className="w-8 h-8 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-mono font-black text-xs flex items-center justify-center shrink-0 border border-slate-200 dark:border-slate-700">
                                          #{String(vIndex + 1).padStart(2, "0")}
                                        </span>

                                        <div className="min-w-0 flex-1">
                                          <div className="flex items-center gap-2 flex-wrap">
                                            <p className="font-bold text-xs sm:text-sm text-slate-900 dark:text-white truncate">
                                              {video.title}
                                            </p>
                                            {video.isFree && (
                                              <span className="text-[9px] font-black px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-300 dark:bg-emerald-950/60 dark:text-emerald-300">
                                                تجريبي مجاني
                                              </span>
                                            )}
                                          </div>

                                          <div className="flex flex-wrap items-center gap-2 mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                                            <span className={`text-[9px] font-black px-2 py-0.5 rounded-full border ${provBadgeColor}`}>
                                              {provLabel}
                                            </span>
                                            <span>·</span>
                                            <span>⏱️ {video.durationMinutes || 0} دقيقة</span>
                                            <span>·</span>
                                            <span>👁️ {video.maxWatchesPerUser || 3} مشاهدات</span>
                                          </div>
                                        </div>
                                      </div>

                                      {/* Lesson Controls */}
                                      <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-auto flex-wrap">
                                        {/* Free Demo Toggle */}
                                        <button
                                          type="button"
                                          onClick={() => void handleToggleVideoFree(video.id, Boolean(video.isFree))}
                                          disabled={togglingFreeVideoId === video.id}
                                          aria-pressed={Boolean(video.isFree)}
                                          className={`px-2.5 py-1 rounded-xl text-[10.5px] font-bold border transition-all cursor-pointer disabled:opacity-60 disabled:cursor-wait ${
                                            video.isFree
                                              ? "bg-emerald-50 text-emerald-800 border-emerald-300 dark:bg-emerald-950/50 dark:text-emerald-300"
                                              : "bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400"
                                          }`}
                                          title="تبديل الدرس بين مجاني ومدفوع"
                                        >
                                          {togglingFreeVideoId === video.id
                                            ? "جارٍ الحفظ…"
                                            : video.isFree
                                              ? "تجريبي ✓"
                                              : "اجعله تجريبياً"}
                                        </button>

                                        {/* Timed Questions Toggle Button */}
                                        <button
                                          type="button"
                                          onClick={() => toggleVideoQuestions(video.id)}
                                          className={`px-2.5 py-1 rounded-xl text-[10.5px] font-bold border transition-all flex items-center gap-1 cursor-pointer ${
                                            isQuestionsOpen
                                              ? "bg-sky-50 text-sky-800 border-sky-300 dark:bg-sky-950/60 dark:text-sky-300 dark:border-sky-800"
                                              : "bg-slate-50 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700 hover:bg-slate-100"
                                          }`}
                                          title="إدارة الأسئلة التفاعلية أثناء الفيديو"
                                        >
                                          <HelpCircle className="w-3 h-3 text-sky-500" />
                                          <span>أسئلة الفيديو</span>
                                          <span className="px-1 py-0.2 rounded-md bg-white dark:bg-slate-900 text-[9px] font-mono font-bold">
                                            {questionsList.length || "•"}
                                          </span>
                                        </button>

                                        {/* Delete Video */}
                                        <button
                                          type="button"
                                          onClick={() => void handleDeleteVideo(folder.id, video.id, video.title)}
                                          className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors cursor-pointer"
                                          title="حذف هذا الفيديو"
                                        >
                                          <Trash2 className="w-3.5 h-3.5" />
                                        </button>
                                      </div>
                                    </div>

                                    {/* In-Video Timed Questions Subpanel */}
                                    {isQuestionsOpen && (
                                      <div className="p-4 bg-slate-50/80 dark:bg-slate-950/60 border-t border-slate-200 dark:border-slate-800 space-y-4">
                                        <div className="flex items-center justify-between border-b border-slate-200/80 dark:border-slate-800/80 pb-2">
                                          <div className="flex items-center gap-2">
                                            <span className="font-bold text-xs text-slate-900 dark:text-white">
                                              الأسئلة التفاعلية المجدولة داخل هذا الدرس
                                            </span>
                                            {loadingQuestions[video.id] && (
                                              <span className="w-3.5 h-3.5 border-2 border-sky-500/30 border-t-sky-500 rounded-full animate-spin" />
                                            )}
                                          </div>
                                          <span className="text-[10px] text-slate-500">
                                            تظهر للطالب عند توقيت محدد أثناء المشاهدة
                                          </span>
                                        </div>

                                        {/* Questions List */}
                                        {questionsList.length === 0 ? (
                                          <p className="text-xs text-slate-500 dark:text-slate-400 py-1">
                                            لا توجد أسئلة تفاعلية مضافة لهذا الفيديو بعد. أضف سؤالاً من النموذج أدناه.
                                          </p>
                                        ) : (
                                          <div className="space-y-2.5">
                                            {questionsList.map((q: any) => {
                                              const timeFormatted = `${Math.floor(q.triggerSecond / 60)}:${String(
                                                q.triggerSecond % 60
                                              ).padStart(2, "0")}`;
                                              const isEssayQ = q.questionType === "essay";

                                              return (
                                                <div
                                                  key={q.id}
                                                  className="p-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl space-y-2"
                                                >
                                                  <div className="flex items-center justify-between gap-2 flex-wrap">
                                                    <div className="flex items-center gap-1.5 flex-wrap">
                                                      <span className="bg-sky-50 text-sky-800 dark:bg-sky-950/60 dark:text-sky-300 text-[10px] font-mono font-bold px-2 py-0.5 rounded-lg border border-sky-200 dark:border-sky-800" dir="ltr">
                                                        ⏱ {timeFormatted}
                                                      </span>
                                                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                                                        {isEssayQ ? "📝 مقالي" : "اختيار من متعدد"}
                                                      </span>
                                                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-lg ${
                                                        q.mode === "pause"
                                                          ? "bg-amber-50 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300"
                                                          : "bg-teal-50 text-teal-800 dark:bg-teal-950/60 dark:text-teal-300"
                                                      }`}>
                                                        {q.mode === "pause" ? "إيقاف الفيديو" : "عرض بدون إيقاف"}
                                                      </span>
                                                    </div>
                                                    <button
                                                      type="button"
                                                      onClick={() => handleDeleteTimedQuestion(video.id, q.id)}
                                                      className="text-rose-500 hover:underline text-xs cursor-pointer font-bold"
                                                    >
                                                      حذف
                                                    </button>
                                                  </div>

                                                  <p className="text-xs font-bold text-slate-900 dark:text-white">
                                                    {q.questionText}
                                                  </p>

                                                  {!isEssayQ && (
                                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-[11px] text-slate-600 dark:text-slate-400">
                                                      <div className={q.correctOption === "A" ? "text-emerald-600 font-bold" : ""}>أ) {q.optionA}</div>
                                                      <div className={q.correctOption === "B" ? "text-emerald-600 font-bold" : ""}>ب) {q.optionB}</div>
                                                      <div className={q.correctOption === "C" ? "text-emerald-600 font-bold" : ""}>ج) {q.optionC}</div>
                                                      <div className={q.correctOption === "D" ? "text-emerald-600 font-bold" : ""}>د) {q.optionD}</div>
                                                    </div>
                                                  )}

                                                  {q.explanation && (
                                                    <p className="text-[10px] text-amber-600 dark:text-amber-400">
                                                      الشرح: {q.explanation}
                                                    </p>
                                                  )}

                                                  {q.analytics && q.analytics.totalResponses > 0 && (
                                                    <div className="border-t border-slate-100 dark:border-slate-800 pt-1.5 flex items-center gap-3 text-[10px] text-slate-500">
                                                      <span>الإجابات: <strong>{q.analytics.totalResponses}</strong></span>
                                                      {!isEssayQ && (
                                                        <span>نسبة النجاح: <strong className="text-emerald-600">{q.analytics.correctPercent}%</strong></span>
                                                      )}
                                                      <span>متوسط الزمن: <strong>+{q.analytics.avgResponseDelay}ث</strong></span>
                                                    </div>
                                                  )}
                                                </div>
                                              );
                                            })}
                                          </div>
                                        )}

                                        {/* Add Timed Question Form */}
                                        <form
                                          onSubmit={(e) => handleAddTimedQuestion(e, video.id)}
                                          className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-3"
                                        >
                                          <h5 className="text-xs font-bold text-slate-900 dark:text-white">
                                            + إضافة سؤال تفاعلي جديد في هذا التوقيت
                                          </h5>

                                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                                            <div>
                                              <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 block mb-1">
                                                نوع السؤال
                                              </label>
                                              <select
                                                value={getAddQuestionState(video.id).questionType || "mcq"}
                                                onChange={(e) => updateAddQuestionState(video.id, { questionType: e.target.value })}
                                                className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-950 text-xs"
                                              >
                                                <option value="mcq">اختيار من متعدد (MCQ)</option>
                                                <option value="essay">سؤال مقالي</option>
                                              </select>
                                            </div>

                                            <div>
                                              <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 block mb-1">
                                                التوقيت (ثواني أو MM:SS) *
                                              </label>
                                              <input
                                                type="text"
                                                required
                                                placeholder="مثال: 01:30 أو 90"
                                                dir="ltr"
                                                value={getAddQuestionState(video.id).triggerTimestamp}
                                                onChange={(e) => updateAddQuestionState(video.id, { triggerTimestamp: e.target.value })}
                                                className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-950 text-xs font-mono"
                                              />
                                            </div>

                                            <div>
                                              <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 block mb-1">
                                                طريقة العرض
                                              </label>
                                              <select
                                                value={getAddQuestionState(video.id).mode}
                                                onChange={(e) => updateAddQuestionState(video.id, { mode: e.target.value })}
                                                className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-950 text-xs"
                                              >
                                                <option value="pause">إيقاف الفيديو حتى الإجابة</option>
                                                <option value="overlay">عرض كارت زاوية بدون إيقاف</option>
                                              </select>
                                            </div>
                                          </div>

                                          <div>
                                            <input
                                              type="text"
                                              required
                                              placeholder="اكتب السؤال بوضوح للطالب..."
                                              value={getAddQuestionState(video.id).questionText}
                                              onChange={(e) => updateAddQuestionState(video.id, { questionText: e.target.value })}
                                              className="w-full px-3 py-1.5 rounded-lg border border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-950 text-xs"
                                            />
                                          </div>

                                          {getAddQuestionState(video.id).questionType !== "essay" && (
                                            <>
                                              <div className="grid grid-cols-2 gap-2">
                                                <input
                                                  type="text"
                                                  required
                                                  placeholder="أ) الخيار الأول"
                                                  value={getAddQuestionState(video.id).optionA}
                                                  onChange={(e) => updateAddQuestionState(video.id, { optionA: e.target.value })}
                                                  className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-950 text-xs"
                                                />
                                                <input
                                                  type="text"
                                                  required
                                                  placeholder="ب) الخيار الثاني"
                                                  value={getAddQuestionState(video.id).optionB}
                                                  onChange={(e) => updateAddQuestionState(video.id, { optionB: e.target.value })}
                                                  className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-950 text-xs"
                                                />
                                                <input
                                                  type="text"
                                                  required
                                                  placeholder="ج) الخيار الثالث"
                                                  value={getAddQuestionState(video.id).optionC}
                                                  onChange={(e) => updateAddQuestionState(video.id, { optionC: e.target.value })}
                                                  className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-950 text-xs"
                                                />
                                                <input
                                                  type="text"
                                                  required
                                                  placeholder="د) الخيار الرابع"
                                                  value={getAddQuestionState(video.id).optionD}
                                                  onChange={(e) => updateAddQuestionState(video.id, { optionD: e.target.value })}
                                                  className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-950 text-xs"
                                                />
                                              </div>

                                              <div className="flex items-center gap-3">
                                                <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                                                  الإجابة الصحيحة:
                                                </label>
                                                <select
                                                  value={getAddQuestionState(video.id).correctOption}
                                                  onChange={(e) => updateAddQuestionState(video.id, { correctOption: e.target.value })}
                                                  className="px-2.5 py-1 rounded-lg border border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-950 text-xs font-bold"
                                                >
                                                  <option value="A">الخيار أ</option>
                                                  <option value="B">الخيار ب</option>
                                                  <option value="C">الخيار ج</option>
                                                  <option value="D">الخيار د</option>
                                                </select>
                                              </div>
                                            </>
                                          )}

                                          <div>
                                            <input
                                              type="text"
                                              placeholder="الشرح أو التفسير بعد الإجابة (اختياري)..."
                                              value={getAddQuestionState(video.id).explanation}
                                              onChange={(e) => updateAddQuestionState(video.id, { explanation: e.target.value })}
                                              className="w-full px-3 py-1.5 rounded-lg border border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-950 text-xs"
                                            />
                                          </div>

                                          <button
                                            type="submit"
                                            disabled={submittingQuestion[video.id]}
                                            className="px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-xs font-bold transition-colors cursor-pointer disabled:opacity-50"
                                          >
                                            {submittingQuestion[video.id] ? "جارٍ الحفظ..." : "حفظ السؤال التفاعلي"}
                                          </button>
                                        </form>
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        {/* 2. QUIZZES SECTION */}
                        {quizCount > 0 && (
                          <div className="space-y-2.5">
                            <h4 className="text-xs font-black text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                              <HelpCircle className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400" />
                              <span>الاختبارات والامتحانات ({quizCount})</span>
                            </h4>

                            <div className="space-y-2">
                              {folder.quizzes?.map((quiz) => (
                                <div
                                  key={quiz.id}
                                  className="p-3 sm:p-3.5 rounded-2xl border border-sky-200/90 dark:border-sky-900/50 bg-sky-50/40 dark:bg-sky-950/20 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5"
                                >
                                  <div className="flex items-center gap-3 min-w-0 flex-1">
                                    <span className="p-2 rounded-xl bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/20 shrink-0">
                                      <HelpCircle className="w-4 h-4" />
                                    </span>
                                    <div className="min-w-0 flex-1">
                                      <div className="flex items-center gap-2">
                                        <p className="font-bold text-xs sm:text-sm text-slate-900 dark:text-white truncate">
                                          {quiz.title || "اختبار المحاضرة"}
                                        </p>
                                        <span className="text-[9px] font-black px-2 py-0.5 rounded-full bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300 border border-sky-200 dark:border-sky-800">
                                          اختبار
                                        </span>
                                      </div>
                                      <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                                        {quiz.questions?.length ?? 0} أسئلة
                                      </p>
                                    </div>
                                  </div>

                                  <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setActiveEditQuiz({
                                          id: quiz.id,
                                          title: quiz.title || "اختبار المحاضرة",
                                          questions: quiz.questions || [],
                                        })
                                      }
                                      className="p-1.5 rounded-lg text-slate-400 hover:text-sky-600 dark:hover:text-sky-400 hover:bg-sky-50 dark:hover:bg-sky-950/40 transition-colors cursor-pointer"
                                      title="تعديل أسئلة الاختبار"
                                    >
                                      <Pencil className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => exportQuizToJson(quiz)}
                                      className="p-1.5 rounded-lg text-slate-400 hover:text-sky-600 dark:hover:text-sky-400 hover:bg-sky-50 dark:hover:bg-sky-950/40 transition-colors cursor-pointer"
                                      title="تحميل وتصدير الاختبار كملف JSON"
                                    >
                                      <Download className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => void handleDeleteQuiz(quiz.id, quiz.title)}
                                      className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors cursor-pointer"
                                      title="حذف هذا الاختبار"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* 3. HOMEWORKS SECTION */}
                        {hwCount > 0 && (
                          <div className="space-y-2.5">
                            <h4 className="text-xs font-black text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                              <BookOpen className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                              <span>الواجبات والتطبيقات ({hwCount})</span>
                            </h4>

                            <div className="space-y-2">
                              {folder.homeworks?.map((hw) => {
                                const typeLabel =
                                  hw.type === "exam"
                                    ? "📝 اختبار MCQ"
                                    : hw.type === "terminal"
                                    ? "💻 كود برمجي"
                                    : hw.type === "upload"
                                    ? "📎 تسليم ملف"
                                    : "🔗 رابط خارجي";

                                return (
                                  <div
                                    key={hw.id}
                                    className="p-3 sm:p-3.5 rounded-2xl border border-amber-200/90 dark:border-amber-900/50 bg-amber-50/40 dark:bg-amber-950/20 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5"
                                  >
                                    <div className="flex items-center gap-3 min-w-0 flex-1">
                                      <span className="p-2 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 shrink-0">
                                        <BookOpen className="w-4 h-4" />
                                      </span>
                                      <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-2">
                                          <p className="font-bold text-xs sm:text-sm text-slate-900 dark:text-white truncate">
                                            {hw.title}
                                          </p>
                                          <span className="text-[9px] font-black px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                                            واجب
                                          </span>
                                        </div>
                                        <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                                          <span>{typeLabel}</span>
                                          {hw._count?.submissions !== undefined && (
                                            <>
                                              <span> · </span>
                                              <span>{hw._count.submissions} تسليم</span>
                                            </>
                                          )}
                                        </p>
                                      </div>
                                    </div>

                                    <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
                                      {hw.type === "exam" && (
                                        <button
                                          type="button"
                                          onClick={() =>
                                            setActiveEditHomework({
                                              id: hw.id,
                                              title: hw.title || "واجب المحاضرة",
                                              questions: hw.questions || [],
                                            })
                                          }
                                          className="p-1.5 rounded-lg text-slate-400 hover:text-amber-600 dark:hover:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/40 transition-colors cursor-pointer"
                                          title="تعديل أسئلة الواجب"
                                        >
                                          <Pencil className="w-3.5 h-3.5" />
                                        </button>
                                      )}
                                      {hw.type === "exam" && (
                                        <button
                                          type="button"
                                          onClick={() => exportHomeworkToJson(hw)}
                                          className="p-1.5 rounded-lg text-slate-400 hover:text-amber-600 dark:hover:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/40 transition-colors cursor-pointer"
                                          title="تحميل وتصدير الواجب كملف JSON"
                                        >
                                          <Download className="w-3.5 h-3.5" />
                                        </button>
                                      )}
                                      <button
                                        type="button"
                                        onClick={() => void handleDeleteHomework(hw.id, hw.title)}
                                        className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors cursor-pointer"
                                        title="حذف هذا الواجب"
                                      >
                                        <Trash2 className="w-3.5 h-3.5" />
                                      </button>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        {/* 4. MATERIALS SECTION */}
                        {matCount > 0 && (
                          <div className="space-y-2.5">
                            <h4 className="text-xs font-black text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                              <FileText className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
                              <span>الملحقات والملفات ({matCount})</span>
                            </h4>

                            <div className="space-y-2">
                              {folder.materials?.map((mat) => (
                                <div
                                  key={mat.id}
                                  className="p-3 sm:p-3.5 rounded-2xl border border-purple-200/90 dark:border-purple-900/50 bg-purple-50/40 dark:bg-purple-950/20 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5"
                                >
                                  <div className="flex items-center gap-3 min-w-0 flex-1">
                                    <span className="p-2 rounded-xl bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20 shrink-0">
                                      {mat.type === "pdf" ? <FileText className="w-4 h-4" /> : <ExternalLink className="w-4 h-4" />}
                                    </span>
                                    <div className="min-w-0 flex-1">
                                      <div className="flex items-center gap-2">
                                        <p className="font-bold text-xs sm:text-sm text-slate-900 dark:text-white truncate">
                                          {mat.title}
                                        </p>
                                        <span className="text-[9px] font-black px-2 py-0.5 rounded-full bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300 border border-purple-200 dark:border-purple-800 uppercase">
                                          {mat.type}
                                        </span>
                                      </div>
                                    </div>
                                  </div>

                                  <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
                                    <a
                                      href={mat.url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="px-3 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-[11px] font-bold transition-all flex items-center gap-1 shadow-xs"
                                    >
                                      <span>فتح الملف</span>
                                      <ExternalLink className="w-3 h-3" />
                                    </a>
                                    <button
                                      type="button"
                                      onClick={() => void handleDeleteMaterial(mat.id, mat.title)}
                                      className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors cursor-pointer"
                                      title="حذف هذا الملحق"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── Active Video Encryption Studio Modal ── */}
      {activeVideoModal && (
        <VideoEncryptionStudioModal
          folderId={activeVideoModal.folderId}
          folderName={activeVideoModal.folderName}
          initialMode={activeVideoModal.initialMode}
          isOpen={Boolean(activeVideoModal)}
          onClose={() => setActiveVideoModal(null)}
          onVideoCreated={async () => {
            await onRefreshFolders();
          }}
        />
      )}

      {activeEditQuiz && (
        <EditQuizModal
          isOpen={Boolean(activeEditQuiz)}
          quizId={activeEditQuiz.id}
          quizTitle={activeEditQuiz.title}
          questions={activeEditQuiz.questions}
          onClose={() => setActiveEditQuiz(null)}
          onSuccess={async () => {
            await onRefreshFolders();
          }}
        />
      )}

      {activeEditHomework && (
        <EditHomeworkModal
          isOpen={Boolean(activeEditHomework)}
          homeworkId={activeEditHomework.id}
          homeworkTitle={activeEditHomework.title}
          questions={activeEditHomework.questions}
          onClose={() => setActiveEditHomework(null)}
          onSuccess={async () => {
            await onRefreshFolders();
          }}
        />
      )}

      {/* ── Active Add Quiz Modal ── */}
      {activeQuizModal && (
        <AddQuizModal
          isOpen={Boolean(activeQuizModal)}
          folderId={activeQuizModal.folderId}
          folderName={activeQuizModal.folderName}
          onClose={() => setActiveQuizModal(null)}
          onSuccess={async () => {
            await onRefreshFolders();
          }}
        />
      )}

      {/* ── Active Add Homework Modal ── */}
      {activeHomeworkModal && (
        <AddHomeworkModal
          isOpen={Boolean(activeHomeworkModal)}
          folderId={activeHomeworkModal.folderId}
          folderName={activeHomeworkModal.folderName}
          courseId={courseId}
          onClose={() => setActiveHomeworkModal(null)}
          onSuccess={async () => {
            await onRefreshFolders();
          }}
        />
      )}

      {/* ── Active Add Material Modal ── */}
      {activeMaterialModal && (
        <AddMaterialModal
          isOpen={Boolean(activeMaterialModal)}
          folderId={activeMaterialModal.folderId}
          folderName={activeMaterialModal.folderName}
          onClose={() => setActiveMaterialModal(null)}
          onSuccess={async () => {
            await onRefreshFolders();
          }}
        />
      )}
    </div>
  );
}
