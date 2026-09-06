"use client";

import React, { useState } from "react";
import { useToast } from "@/components/ui/Toast";
import { VideoEncryptionStudioModal } from "./VideoEncryptionStudioModal";
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
  questions?: Array<unknown>;
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

  // Active Video Encryption Modal Target
  const [activeVideoModal, setActiveVideoModal] = useState<{
    folderId: string;
    folderName: string;
    initialMode?: "upload" | "gdrive" | "manual" | "youtube";
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

  // Create New Folder with Custom Color
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
        toastSuccess(`تم إنشاء المحاضرة "${newFolderName}" بلونها المخصص بنجاح!`);
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
        body: JSON.stringify({
          folderId,
          color: newColor,
        }),
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
    if (!window.confirm(`هل أنت متأكد من حذف المحاضرة "${folderName}" وجميع فيديوهاتها واختباراتها؟`)) {
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

  // Toggle Video Free Preview
  const handleToggleVideoFree = async (folderId: string, videoId: string, currentFree: boolean) => {
    try {
      const res = await fetch(`/api/admin/folders/${folderId}/videos`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          videoId,
          isFree: !currentFree,
        }),
      });

      const data = await res.json();
      if (res.ok && !data.error) {
        toastSuccess(!currentFree ? "تم جعل الدرس تجريبياً مجانياً للطلاب" : "تم إلغاء التجريبي وجعله مدفوعاً");
        await onRefreshFolders();
      } else {
        toastError(data.error || "تعذر تعديل حالة الفيديو");
      }
    } catch {
      toastError("تعذر الاتصال بالخادم");
    }
  };

  return (
    <div dir="rtl" className="space-y-6">
      {/* ── Top Header Banner & Visual Hierarchy Summary ── */}
      <div className="rounded-3xl border border-slate-200/90 bg-white p-6 shadow-sm dark:border-slate-800/90 dark:bg-slate-900/90 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
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
            شجرة بصرية توضح ترتيب الوحدات والدروس كما تظهر تماماً للطالب مع إمكانية تخصيص الألوان ومستويات التشفير.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="px-3 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-950/50 border border-slate-200 dark:border-slate-800 text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-2">
            <span>إجمالي المحاضرات:</span>
            <span className="font-mono text-emerald-600 dark:text-emerald-400 font-black">{folders.length}</span>
          </div>
        </div>
      </div>

      {/* ── Create New Folder with Color Picker ── */}
      <div className="rounded-3xl border border-slate-200/90 bg-white p-5 shadow-sm dark:border-slate-800/90 dark:bg-slate-900/90 space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
          <div className="flex items-center gap-2 font-black text-xs text-slate-900 dark:text-white">
            <Folder className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            <span>إضافة محاضرة / وحدة جديدة (New Lecture Folder)</span>
          </div>
          <span className="text-[11px] text-slate-400 dark:text-slate-500">اختر لون المحاضرة المميز</span>
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
              className="px-5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white dark:bg-emerald-700 dark:hover:bg-emerald-600 text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-sm disabled:opacity-50 shrink-0"
            >
              <Plus className="w-4 h-4" />
              <span>{creatingFolder ? "جارٍ الإضافة..." : "إضافة المحاضرة"}</span>
            </button>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-1 text-[11px] text-slate-500 dark:text-slate-400">
            <div className="flex items-center gap-2">
              <Calendar className="w-3.5 h-3.5 text-slate-400" />
              <span>موعد الفتح المجدول (اختياري):</span>
              <input
                type="datetime-local"
                value={newFolderPublishAt}
                onChange={(e) => setNewFolderPublishAt(e.target.value)}
                dir="ltr"
                className="px-3 py-1 rounded-lg border border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-950 text-[11px] font-mono outline-none"
              />
              {newFolderPublishAt && (
                <button
                  type="button"
                  onClick={() => setNewFolderPublishAt("")}
                  className="text-rose-500 hover:underline font-bold text-[10px]"
                >
                  مسح الموعد
                </button>
              )}
            </div>

            {/* Optional Folder Color Picker (ده خيار مش اجباري) */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowCreateColorPicker(!showCreateColorPicker)}
                className="px-3 py-1 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 hover:bg-slate-100 dark:bg-slate-950 dark:hover:bg-slate-800 text-[11px] font-bold text-slate-700 dark:text-slate-300 flex items-center gap-2 transition-all cursor-pointer shadow-xs"
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

      {/* ── Visual Curriculum Hierarchy Tree ── */}
      {folders.length === 0 ? (
        <div className="p-16 text-center rounded-3xl border border-slate-200/90 bg-white dark:border-slate-800 dark:bg-slate-900/90 text-slate-500">
          <div className="text-4xl mb-2">📁</div>
          <h3 className="font-bold text-sm text-slate-800 dark:text-slate-200">لا توجد محاضرات في هذا الكورس بعد</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            أضف أول محاضرة من النموذج أعلاه، ثم أضف إليها الدروس المشفرة والاختبارات.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {folders.map((folder, folderIndex) => {
            const colorDef = getFolderColorDef(folder.color);
            const isExpanded = expandedFolderIds[folder.id] ?? true;
            const videoCount = folder.videos?.length || 0;
            const quizCount = folder.quizzes?.length || 0;
            const materialCount = folder.materials?.length || 0;

            return (
              <div
                key={folder.id}
                className={`rounded-3xl border-2 bg-white dark:bg-slate-900 shadow-sm transition-all overflow-hidden ${colorDef.cardBorder}`}
              >
                {/* Folder Header */}
                <div
                  className={`p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-slate-200/80 dark:border-slate-800/80 transition-colors ${colorDef.headerBg}`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <button
                      type="button"
                      onClick={() => toggleFolderExpand(folder.id)}
                      className="p-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-xs cursor-pointer hover:scale-105 transition-all"
                    >
                      <Folder className={`w-5 h-5 ${colorDef.iconColor}`} />
                    </button>

                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
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

                      <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 flex items-center gap-2">
                        <span>{videoCount} درس فيديو</span>
                        <span>·</span>
                        <span>{quizCount} اختبار</span>
                        <span>·</span>
                        <span>{materialCount} ملحق</span>
                        {folder.publishAt && (
                          <>
                            <span>·</span>
                            <span className="text-amber-600 dark:text-amber-400 font-bold flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              <span>يُفتح: {new Date(folder.publishAt).toLocaleDateString("ar-EG")}</span>
                            </span>
                          </>
                        )}
                      </p>
                    </div>
                  </div>

                  {/* Folder Actions & Color Customizer */}
                  <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
                    {/* Color Swatch Picker Dropdown */}
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() =>
                          setActiveColorPickerFolderId(
                            activeColorPickerFolderId === folder.id ? null : folder.id
                          )
                        }
                        className="px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1.5 hover:bg-slate-50 dark:hover:bg-slate-700 transition-all cursor-pointer shadow-xs"
                        title="تخصيص لون المحاضرة"
                      >
                        <span className={`w-3 h-3 rounded-full ${colorDef.dotClass}`} />
                        <span className="hidden md:inline">تخصيص اللون</span>
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

                    {/* Direct Upload Button */}
                    <button
                      type="button"
                      onClick={() =>
                        setActiveVideoModal({
                          folderId: folder.id,
                          folderName: folder.name,
                          initialMode: "upload",
                        })
                      }
                      className="px-3 py-1.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-xs"
                      title="رفع فيديو مباشر من جهازك لهذه المحاضرة"
                    >
                      <UploadCloud className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">رفع من الجهاز</span>
                    </button>

                    {/* Direct Google Drive Button */}
                    <button
                      type="button"
                      onClick={() =>
                        setActiveVideoModal({
                          folderId: folder.id,
                          folderName: folder.name,
                          initialMode: "gdrive",
                        })
                      }
                      className="px-3 py-1.5 rounded-xl bg-blue-700 hover:bg-blue-800 text-white text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-xs"
                      title="استيراد فيديو من Google Drive لهذه المحاضرة"
                    >
                      <HardDrive className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">Google Drive</span>
                    </button>

                    {/* The Full Hero Button: "Add Video" */}
                    <button
                      type="button"
                      onClick={() =>
                        setActiveVideoModal({
                          folderId: folder.id,
                          folderName: folder.name,
                          initialMode: "upload",
                        })
                      }
                      className="px-3.5 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white dark:bg-slate-800 dark:hover:bg-slate-700 text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-sm"
                      title="إضافة فيديو مشفر جديد في هذه المحاضرة"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>إضافة فيديو</span>
                    </button>

                    {/* Delete Folder */}
                    <button
                      type="button"
                      onClick={() => void handleDeleteFolder(folder.id, folder.name)}
                      className="p-2 rounded-xl text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/40 border border-transparent hover:border-rose-200 dark:hover:border-rose-900/50 transition-all cursor-pointer"
                      title="حذف المحاضرة"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>

                    {/* Collapse Toggle */}
                    <button
                      type="button"
                      onClick={() => toggleFolderExpand(folder.id)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                    >
                      {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {/* Folder Content: Lessons Hierarchy Tree */}
                {isExpanded && (
                  <div className="p-4 sm:p-5 space-y-3 bg-slate-50/40 dark:bg-slate-950/20">
                    {videoCount === 0 ? (
                      <div className="p-6 text-center border border-dashed border-slate-300 dark:border-slate-800 rounded-2xl space-y-3">
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          لا توجد دروس فيديو في هذه المحاضرة بعد.
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
                            className="px-3.5 py-1.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-xs"
                          >
                            <UploadCloud className="w-3.5 h-3.5" />
                            <span>رفع فيديو من الجهاز</span>
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              setActiveVideoModal({
                                folderId: folder.id,
                                folderName: folder.name,
                                initialMode: "gdrive",
                              })
                            }
                            className="px-3.5 py-1.5 rounded-xl bg-blue-700 hover:bg-blue-800 text-white text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-xs"
                          >
                            <HardDrive className="w-3.5 h-3.5" />
                            <span>استيراد من Google Drive</span>
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              setActiveVideoModal({
                                folderId: folder.id,
                                folderName: folder.name,
                                initialMode: "youtube",
                              })
                            }
                            className="px-3.5 py-1.5 rounded-xl bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-bold transition-all cursor-pointer"
                          >
                            <span>يوتيوب / خيارات أخرى</span>
                          </button>
                        </div>
                      </div>
                    ) : (
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

                          return (
                            <div
                              key={video.id}
                              className="p-3 sm:p-3.5 rounded-2xl border border-slate-200/90 dark:border-slate-800/90 bg-white dark:bg-slate-900 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5 hover:shadow-xs transition-all"
                            >
                              {/* Lesson Number & Title */}
                              <div className="flex items-center gap-3 min-w-0 flex-1">
                                <span className="w-8 h-8 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-mono font-black text-xs flex items-center justify-center shrink-0 border border-slate-200 dark:border-slate-700">
                                  #{String(vIndex + 1).padStart(2, "0")}
                                </span>

                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-2">
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
                                    <span>👁️ {video.maxWatchesPerUser || 3} مشاهدات كحد أقصى</span>
                                  </div>
                                </div>
                              </div>

                              {/* Lesson Quick Controls */}
                              <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-auto">
                                {/* Free Demo Toggle */}
                                <button
                                  type="button"
                                  onClick={() => void handleToggleVideoFree(folder.id, video.id, Boolean(video.isFree))}
                                  className={`px-2.5 py-1 rounded-xl text-[10.5px] font-bold border transition-all cursor-pointer ${
                                    video.isFree
                                      ? "bg-emerald-50 text-emerald-800 border-emerald-300 dark:bg-emerald-950/50 dark:text-emerald-300"
                                      : "bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400"
                                  }`}
                                  title="تبديل الدرس بين مجاني ومدفوع"
                                >
                                  {video.isFree ? "تجريبي ✓" : "اجعله تجريبياً"}
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
                          );
                        })}
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
    </div>
  );
}
