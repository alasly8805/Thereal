"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useToast } from "@/components/ui/Toast";
import {
  IconVideo,
  IconClipboard,
  IconFile,
  IconFolder,
} from "@/components/admin/AdminIcons";
import {
  Unlock,
  GitFork,
  Sliders,
  CheckCircle2,
  RefreshCw,
  Save,
  ArrowDown,
  ArrowUp,
  Lock,
  Layers,
} from "lucide-react";

interface ContentItem {
  id: string;
  type: "VIDEO" | "HOMEWORK" | "QUIZ" | "EXAM" | "SOLUTION_VIDEO" | "PDF";
  sourceId: string;
  title: string;
  folderId?: string;
  folderName?: string;
}

interface FolderInfo {
  id: string;
  name: string;
  order: number;
}

interface PrerequisiteEdge {
  id?: string;
  targetContentId: string;
  prerequisiteContentId: string;
  prerequisiteTitle?: string;
  prerequisiteType?: string;
  requiredStatus?: string;
  minScore?: number | null;
}

interface ContentFlowManagerProps {
  courseId: string;
  courseTitle?: string;
}

export function ContentFlowManager({ courseId }: ContentFlowManagerProps) {
  const { success: toastSuccess, error: toastError } = useToast();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const [folders, setFolders] = useState<FolderInfo[]>([]);
  const [items, setItems] = useState<ContentItem[]>([]);
  const [prerequisites, setPrerequisites] = useState<PrerequisiteEdge[]>([]);
  const [flowMode, setFlowMode] = useState<"free" | "per_folder" | "course" | "custom">("per_folder");

  const loadData = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/courses/${courseId}/prerequisites`);
      if (res.ok) {
        const data = await res.json();
        if (data.items && data.items.length > 0) {
          setItems(data.items);
          setFolders(data.folders || []);
          setPrerequisites(data.prerequisites || []);

          if (["free", "per_folder", "course", "custom"].includes(data.contentFlowMode)) {
            setFlowMode(data.contentFlowMode);
          } else if (!data.sequentialAccess && (!data.prerequisites || data.prerequisites.length === 0)) {
            setFlowMode("free");
          } else {
            setFlowMode("per_folder");
          }
          setLoading(false);
          return;
        }
      }

      // If empty, auto-sync from course folders
      const syncRes = await fetch(`/api/admin/courses/${courseId}/prerequisites/sync`, {
        method: "POST",
      });
      if (syncRes.ok) {
        const syncData = await syncRes.json();
        setItems(syncData.items || []);
        setPrerequisites(syncData.prerequisites || []);
      }
    } catch (err) {
      console.error("Error loading flow data:", err);
      toastError("تعذر تحميل مسار المحتوى");
    } finally {
      setLoading(false);
    }
  }, [courseId, toastError]);

  useEffect(() => {
    let ignore = false;
    fetch(`/api/admin/courses/${courseId}/prerequisites`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (ignore || !data) return;
        if (data.items && data.items.length > 0) {
          setItems(data.items);
          setFolders(data.folders || []);
          setPrerequisites(data.prerequisites || []);
          if (["free", "per_folder", "course", "custom"].includes(data.contentFlowMode)) {
            setFlowMode(data.contentFlowMode);
          } else if (!data.sequentialAccess && (!data.prerequisites || data.prerequisites.length === 0)) {
            setFlowMode("free");
          } else {
            setFlowMode("per_folder");
          }
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!ignore) setLoading(false);
      });
    return () => {
      ignore = true;
    };
  }, [courseId]);

  // Group items by folderId
  const itemsByFolder = useMemo(() => {
    const grouped: Record<string, { name: string; items: ContentItem[] }> = {};

    folders.forEach((f) => {
      grouped[f.id] = { name: f.name, items: [] };
    });

    items.forEach((item) => {
      const fid = item.folderId || "unassigned";
      if (!grouped[fid]) {
        grouped[fid] = { name: item.folderName || "عناصر عامة", items: [] };
      }
      grouped[fid].items.push(item);
    });

    return grouped;
  }, [folders, items]);

  const handleSync = async () => {
    setSyncing(true);
    try {
      const res = await fetch(`/api/admin/courses/${courseId}/prerequisites/sync`, {
        method: "POST",
      });
      if (res.ok) {
        const data = await res.json();
        setItems(data.items || []);
        setPrerequisites(data.prerequisites || []);
        toastSuccess("تمت مزامنة محتوى الكورس وتحديث الشجرة بنجاح! 🔄");
        await loadData();
      } else {
        toastError("تعذر مزامنة المحتوى");
      }
    } catch {
      toastError("حدث خطأ أثناء المزامنة");
    } finally {
      setSyncing(false);
    }
  };

  const handleDisableAllLocks = () => {
    setFlowMode("free");
    setPrerequisites([]);
    toastSuccess("تم ضبط الكورس كـ «مشاهدة حرة» بالكامل! 🔓");
  };

  const handleAutoChainPerFolder = () => {
    const newPrereqs: PrerequisiteEdge[] = [];
    Object.values(itemsByFolder).forEach((folder) => {
      for (let i = 1; i < folder.items.length; i++) {
        const prev = folder.items[i - 1];
        const curr = folder.items[i];
        newPrereqs.push({
          targetContentId: curr.id,
          prerequisiteContentId: prev.id,
          prerequisiteTitle: prev.title,
          prerequisiteType: prev.type,
          requiredStatus: "COMPLETED",
        });
      }
    });
    setPrerequisites(newPrereqs);
    setFlowMode("per_folder");
    toastSuccess("تم تطبيق التتابع التلقائي داخل كل مجلد! ⚡");
  };

  const handleAutoChainFolder = (folderId: string) => {
    const folderItems = itemsByFolder[folderId]?.items || [];
    if (folderItems.length <= 1) return;

    const folderItemIds = new Set(folderItems.map((i) => i.id));
    const filtered = prerequisites.filter((p) => !folderItemIds.has(p.targetContentId));

    for (let i = 1; i < folderItems.length; i++) {
      const prev = folderItems[i - 1];
      const curr = folderItems[i];
      filtered.push({
        targetContentId: curr.id,
        prerequisiteContentId: prev.id,
        prerequisiteTitle: prev.title,
        prerequisiteType: prev.type,
        requiredStatus: "COMPLETED",
      });
    }

    setPrerequisites(filtered);
    toastSuccess(`تم تطبيق التتابع للمحاضرة (${itemsByFolder[folderId]?.name})`);
  };

  const handleClearFolderLocks = (folderId: string) => {
    const folderItems = itemsByFolder[folderId]?.items || [];
    const folderItemIds = new Set(folderItems.map((i) => i.id));
    const filtered = prerequisites.filter((p) => !folderItemIds.has(p.targetContentId));
    setPrerequisites(filtered);
    toastSuccess(`تم فك أقفال المحاضرة (${itemsByFolder[folderId]?.name})`);
  };

  const moveItemUpInFolder = (folderId: string, idx: number) => {
    if (idx <= 0) return;
    const folderItems = [...(itemsByFolder[folderId]?.items || [])];
    const temp = folderItems[idx];
    folderItems[idx] = folderItems[idx - 1];
    folderItems[idx - 1] = temp;

    const remainingItems = items.filter((i) => (i.folderId || "unassigned") !== folderId);
    setItems([...remainingItems, ...folderItems]);
  };

  const moveItemDownInFolder = (folderId: string, idx: number) => {
    const folderItems = [...(itemsByFolder[folderId]?.items || [])];
    if (idx >= folderItems.length - 1) return;
    const temp = folderItems[idx];
    folderItems[idx] = folderItems[idx + 1];
    folderItems[idx + 1] = temp;

    const remainingItems = items.filter((i) => (i.folderId || "unassigned") !== folderId);
    setItems([...remainingItems, ...folderItems]);
  };

  const setPrerequisiteForItem = (targetId: string, prerequisiteId: string) => {
    const filtered = prerequisites.filter((p) => p.targetContentId !== targetId);
    if (prerequisiteId && prerequisiteId !== "NONE") {
      const prereqItem = items.find((i) => i.id === prerequisiteId);
      filtered.push({
        targetContentId: targetId,
        prerequisiteContentId: prerequisiteId,
        prerequisiteTitle: prereqItem?.title,
        prerequisiteType: prereqItem?.type,
        requiredStatus: "COMPLETED",
      });
    }
    setPrerequisites(filtered);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const contentOrders: Record<string, string[]> = {};
      Object.entries(itemsByFolder).forEach(([folderId, folderData]) => {
        if (folderId === "unassigned") return;
        contentOrders[folderId] = folderData.items.map((item) => item.id);
      });

      const bodyData: Record<string, unknown> = {
        mode: flowMode,
        sequentialAccess: flowMode !== "free",
        contentOrders,
      };

      if (flowMode === "free") {
        bodyData.mode = "free";
      } else if (flowMode === "per_folder") {
        const folderChains: Record<string, string[]> = {};
        Object.entries(itemsByFolder).forEach(([fid, fData]) => {
          folderChains[fid] = fData.items.map((i) => i.id);
        });
        bodyData.folderChains = folderChains;
      } else if (flowMode === "course") {
        bodyData.orderedItemIds = items.map((i) => i.id);
      } else {
        bodyData.customEdges = prerequisites;
      }

      const res = await fetch(`/api/admin/courses/${courseId}/prerequisites`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(bodyData),
      });

      const data = await res.json();
      if (res.ok) {
        toastSuccess(data.message || "تم حفظ إعدادات مسار المحتوى بنجاح! 💾");
        if (data.prerequisites) {
          setPrerequisites(data.prerequisites);
        }
      } else {
        toastError(data.error || "تعذر حفظ التغييرات");
      }
    } catch {
      toastError("حدث خطأ أثناء حفظ المسار");
    } finally {
      setSaving(false);
    }
  };

  const getTypeBadge = (type: string) => {
    switch (type) {
      case "VIDEO":
      case "SOLUTION_VIDEO":
        return {
          icon: <IconVideo className="w-3.5 h-3.5" />,
          label: type === "SOLUTION_VIDEO" ? "فيديو حل" : "فيديو شرح",
          color: "text-blue-600 bg-blue-50 dark:bg-blue-950/50 border-blue-200 dark:border-blue-800",
        };
      case "HOMEWORK":
        return {
          icon: <IconClipboard className="w-3.5 h-3.5" />,
          label: "واجب",
          color: "text-amber-600 bg-amber-50 dark:bg-amber-950/50 border-amber-200 dark:border-amber-800",
        };
      case "QUIZ":
      case "EXAM":
        return {
          icon: <IconFile className="w-3.5 h-3.5" />,
          label: type === "EXAM" ? "امتحان شامل" : "اختبار سريع",
          color: "text-rose-600 bg-rose-50 dark:bg-rose-950/50 border-rose-200 dark:border-rose-800",
        };
      default:
        return {
          icon: <IconFile className="w-3.5 h-3.5" />,
          label: "ملف / ملحق",
          color: "text-slate-600 bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700",
        };
    }
  };

  if (loading) {
    return (
      <div className="rounded-3xl border border-slate-200/90 bg-white p-12 text-center dark:border-slate-800/90 dark:bg-slate-900/90">
        <div className="w-8 h-8 mx-auto mb-3 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-xs font-bold text-slate-600 dark:text-slate-400">جارٍ قراءة خريطة المحتوى...</p>
      </div>
    );
  }

  const folderEntries = Object.entries(itemsByFolder);

  return (
    <div className="space-y-6 text-right" dir="rtl">
      {/* ── Top Header & Actions ── */}
      <div className="rounded-3xl border border-slate-200/90 bg-white p-6 shadow-sm dark:border-slate-800/90 dark:bg-slate-900/90 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-4">
          <div>
            <h2 className="text-sm font-black text-slate-900 dark:text-white flex items-center gap-2">
              <Layers className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              <span>مسار وفتح المحتوى وشروط التتابع</span>
              <span className="text-[10px] px-2.5 py-0.5 rounded-full font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                {items.length} عنصر · {folderEntries.length} محاضرة
              </span>
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              حدد أسلوب فتح المحتوى للطلاب بنقرة واحدة عبر البطاقات البصرية أدناه.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleSync}
              disabled={syncing}
              className="px-3 py-2 text-xs font-bold rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 dark:border-slate-800 dark:bg-slate-950 dark:hover:bg-slate-800 dark:text-slate-300 transition-all flex items-center gap-1.5 cursor-pointer shadow-xs disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${syncing ? "animate-spin" : ""}`} />
              <span>{syncing ? "جارٍ المزامنة..." : "مزامنة المحتوى"}</span>
            </button>

            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="px-5 py-2 text-xs font-black rounded-xl bg-slate-900 hover:bg-slate-800 text-white dark:bg-emerald-700 dark:hover:bg-emerald-600 transition-all flex items-center gap-1.5 cursor-pointer shadow-sm disabled:opacity-50"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{saving ? "جارٍ الحفظ..." : "حفظ التغييرات"}</span>
            </button>
          </div>
        </div>

        {/* ── Visual 3-Card Selection (اعتمد على التصاميم بدون نصوص معقدة) ── */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
          {/* Card 1: Free Open Access */}
          <div
            onClick={handleDisableAllLocks}
            className={`p-4 rounded-2xl border-2 transition-all cursor-pointer flex flex-col justify-between gap-3 ${
              flowMode === "free"
                ? "border-emerald-600 bg-emerald-50/50 dark:border-emerald-500 dark:bg-emerald-950/30 shadow-xs ring-1 ring-emerald-500/30"
                : "border-slate-200 bg-slate-50/70 hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-950/40 dark:hover:bg-slate-800/40"
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center text-emerald-600 shadow-xs">
                  <Unlock className="w-4 h-4" />
                </div>
                <h4 className="text-xs font-black text-slate-900 dark:text-white">
                  وصول حر ومباشر (Free)
                </h4>
              </div>

              {flowMode === "free" && (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
              )}
            </div>

            {/* Visual Mini Flow */}
            <div className="p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center justify-center gap-2 text-[11px] font-bold">
              <span className="px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                درس 1 🔓
              </span>
              <span className="text-slate-400">·</span>
              <span className="px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                درس 2 🔓
              </span>
              <span className="text-slate-400">·</span>
              <span className="px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                اختبار 🔓
              </span>
            </div>

            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              بدون أقفال — يختار الطالب أي درس بحرية كاملة.
            </p>
          </div>

          {/* Card 2: Sequential Per Folder */}
          <div
            onClick={handleAutoChainPerFolder}
            className={`p-4 rounded-2xl border-2 transition-all cursor-pointer flex flex-col justify-between gap-3 ${
              flowMode === "per_folder"
                ? "border-blue-600 bg-blue-50/50 dark:border-blue-500 dark:bg-blue-950/30 shadow-xs ring-1 ring-blue-500/30"
                : "border-slate-200 bg-slate-50/70 hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-950/40 dark:hover:bg-slate-800/40"
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center text-blue-600 shadow-xs">
                  <GitFork className="w-4 h-4" />
                </div>
                <h4 className="text-xs font-black text-slate-900 dark:text-white">
                  تتابع منظم داخل المحاضرة
                </h4>
              </div>

              {flowMode === "per_folder" && (
                <CheckCircle2 className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
              )}
            </div>

            {/* Visual Mini Flow */}
            <div className="p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center justify-center gap-1 text-[11px] font-bold">
              <span className="px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                درس 1 ✅
              </span>
              <span className="text-slate-400">➔</span>
              <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                درس 2 🔒
              </span>
              <span className="text-slate-400">➔</span>
              <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                اختبار 🔒
              </span>
            </div>

            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              يُفتح كل درس بعد إتمام الطالب للدرس الذي يسبقه مباشرة.
            </p>
          </div>

          {/* Card 3: Custom Rules (No Purple, clean Amber/Gold) */}
          <div
            onClick={() => setFlowMode("custom")}
            className={`p-4 rounded-2xl border-2 transition-all cursor-pointer flex flex-col justify-between gap-3 ${
              flowMode === "custom"
                ? "border-amber-600 bg-amber-50/50 dark:border-amber-500 dark:bg-amber-950/30 shadow-xs ring-1 ring-amber-500/30"
                : "border-slate-200 bg-slate-50/70 hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-950/40 dark:hover:bg-slate-800/40"
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center text-amber-600 shadow-xs">
                  <Sliders className="w-4 h-4" />
                </div>
                <h4 className="text-xs font-black text-slate-900 dark:text-white">
                  شروط وقواعد مخصصة (Custom)
                </h4>
              </div>

              {flowMode === "custom" && (
                <CheckCircle2 className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
              )}
            </div>

            {/* Visual Mini Flow */}
            <div className="p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center justify-center gap-1.5 text-[11px] font-bold">
              <span className="px-2.5 py-0.5 rounded-md bg-amber-50 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                ⚙️ تخصيص شرط كل عنصر
              </span>
            </div>

            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              تحديد متطلب مخصص لكل عنصر على حدة حسب رغبتك.
            </p>
          </div>
        </div>
      </div>

      {/* ── Content Folders Tree ── */}
      {folderEntries.length === 0 ? (
        <div className="rounded-3xl border border-slate-200/90 bg-white p-12 text-center dark:border-slate-800/90 dark:bg-slate-900/90 space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-400 flex items-center justify-center mx-auto text-xl">
            📁
          </div>
          <h3 className="text-xs font-bold text-slate-800 dark:text-slate-200">
            لا توجد محاضرات في هذا الكورس بعد
          </h3>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
            أضف محاضرات وفيديوهات أولاً من «استوديو الكورسات»، ثم عد هنا لترتيب شروط الفتح.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {folderEntries.map(([folderId, folderData]) => {
            return (
              <div
                key={folderId}
                className="rounded-3xl border border-slate-200/90 bg-white p-5 shadow-sm dark:border-slate-800/90 dark:bg-slate-900/90 space-y-3.5"
              >
                {/* Folder Header */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-3 border-b border-slate-100 dark:border-slate-800">
                  <div className="flex items-center gap-2">
                    <span className="w-7 h-7 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 flex items-center justify-center font-bold">
                      <IconFolder className="w-3.5 h-3.5" />
                    </span>
                    <div>
                      <h3 className="text-xs font-black text-slate-900 dark:text-white">
                        {folderData.name}
                      </h3>
                      <p className="text-[10.5px] text-slate-500 dark:text-slate-400">
                        {folderData.items.length} عنصر
                      </p>
                    </div>
                  </div>

                  {flowMode !== "free" && (
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleAutoChainFolder(folderId)}
                        className="px-2.5 py-1 text-[11px] font-bold rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition-all cursor-pointer"
                      >
                        ⚡ تتابع تلقائي
                      </button>
                      <button
                        type="button"
                        onClick={() => handleClearFolderLocks(folderId)}
                        className="px-2.5 py-1 text-[11px] font-bold rounded-xl text-slate-500 hover:text-rose-500 dark:hover:text-rose-400 transition-all cursor-pointer"
                      >
                        🔓 فتح حر
                      </button>
                    </div>
                  )}
                </div>

                {/* Items Inside Folder */}
                {folderData.items.length === 0 ? (
                  <p className="text-xs text-slate-400 py-3 text-center">
                    لا يوجد محتوى في هذه المحاضرة.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {folderData.items.map((item, itemIdx) => {
                      const typeInfo = getTypeBadge(item.type);
                      const isFirstInFolder = itemIdx === 0;
                      const isLastInFolder = itemIdx === folderData.items.length - 1;

                      const currentPrereq =
                        flowMode === "free"
                          ? null
                          : flowMode === "per_folder"
                          ? !isFirstInFolder
                            ? folderData.items[itemIdx - 1]
                            : null
                          : items.find(
                              (i) =>
                                i.id ===
                                prerequisites.find(
                                  (p) => p.targetContentId === item.id
                                )?.prerequisiteContentId
                            );

                      return (
                        <div
                          key={item.id}
                          className="bg-slate-50/70 dark:bg-slate-950/40 border border-slate-200/80 dark:border-slate-800/80 rounded-2xl p-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 transition-all"
                        >
                          {/* Item Identity */}
                          <div className="flex items-center gap-2 min-w-0 flex-1">
                            <span className="w-5 h-5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center text-[10px] font-bold text-slate-500 shrink-0">
                              {itemIdx + 1}
                            </span>

                            <div
                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10.5px] font-bold border shrink-0 ${typeInfo.color}`}
                            >
                              {typeInfo.icon}
                              <span>{typeInfo.label}</span>
                            </div>

                            <p className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate">
                              {item.title}
                            </p>
                          </div>

                          {/* Item Prerequisite Status & Controls */}
                          <div className="flex items-center gap-2 shrink-0">
                            {flowMode === "free" ? (
                              <span className="text-[10.5px] font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/50 px-2.5 py-0.5 rounded-lg border border-emerald-200 dark:border-emerald-800">
                                🔓 حر ومباشر
                              </span>
                            ) : flowMode === "per_folder" ? (
                              <div>
                                {isFirstInFolder ? (
                                  <span className="text-[10.5px] font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/50 px-2.5 py-0.5 rounded-lg border border-emerald-200 dark:border-emerald-800">
                                    🔓 بداية المحاضرة
                                  </span>
                                ) : (
                                  <span className="text-[10.5px] font-bold text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 px-2.5 py-0.5 rounded-lg border border-slate-200 dark:border-slate-700 flex items-center gap-1">
                                    <Lock className="w-3 h-3 text-slate-400" />
                                    <span>يتطلب إنهاء السابق</span>
                                  </span>
                                )}
                              </div>
                            ) : (
                              <div className="flex items-center gap-1.5">
                                <span className="text-[10.5px] text-slate-400">يتطلب:</span>
                                <select
                                  value={currentPrereq?.id || "NONE"}
                                  onChange={(e) =>
                                    setPrerequisiteForItem(item.id, e.target.value)
                                  }
                                  className="text-[11px] font-bold bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-white rounded-lg px-2 py-1 outline-none"
                                >
                                  <option value="NONE">🔓 مفتوح</option>
                                  {items
                                    .filter((other) => other.id !== item.id)
                                    .map((other) => (
                                      <option key={other.id} value={other.id}>
                                        🔒 {other.title.slice(0, 20)} ({other.folderName})
                                      </option>
                                    ))}
                                </select>
                              </div>
                            )}

                            {/* Up / Down within this folder */}
                            <div className="flex items-center gap-0.5 bg-white dark:bg-slate-900 p-0.5 rounded-lg border border-slate-200 dark:border-slate-800">
                              <button
                                type="button"
                                onClick={() => moveItemUpInFolder(folderId, itemIdx)}
                                disabled={isFirstInFolder}
                                title="تحريك لأعلى"
                                className="p-1 rounded text-slate-500 hover:text-slate-900 dark:hover:text-white disabled:opacity-30 cursor-pointer"
                              >
                                <ArrowUp className="w-3 h-3" />
                              </button>
                              <button
                                type="button"
                                onClick={() => moveItemDownInFolder(folderId, itemIdx)}
                                disabled={isLastInFolder}
                                title="تحريك لأسفل"
                                className="p-1 rounded text-slate-500 hover:text-slate-900 dark:hover:text-white disabled:opacity-30 cursor-pointer"
                              >
                                <ArrowDown className="w-3 h-3" />
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
