"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useToast } from "@/components/ui/Toast";
import { StudentPhoneActions } from "@/components/admin/StudentPhoneActions";

interface VideoViewRequest {
  id: string;
  status: string;
  reason: string | null;
  grantedViews: number;
  teacherNotes: string | null;
  reviewedAt: string | null;
  createdAt: string;
  student: { id: string; name: string; phone: string | null };
  video: {
    id: string;
    title: string;
    maxWatchesPerUser: number;
    folder: { name: string; course: { id: string; title: string } };
  };
}

interface GradeRequest {
  id: string;
  studentId: string;
  quizId: string;
  courseId: string;
  requestedBy: string;
  currentScore: number;
  requestedScore: number | null;
  reason: string;
  aiAnalysis: string | null;
  evidence: string | null;
  status: string;
  teacherNotes: string | null;
  createdAt: string;
  quiz: { title: string };
  course: { title: string };
  student: { name: string; email: string; phone: string | null };
}

interface SupportTicket {
  id: string;
  studentId: string;
  courseId: string | null;
  title: string;
  description: string;
  type: string;
  priority: string;
  status: string;
  aiHandled: boolean;
  aiResponse: string | null;
  resolution: string | null;
  createdAt: string;
  student: { name: string; phone: string | null };
  course: { title: string } | null;
}

const STATUS_LABELS: Record<string, string> = {
  pending: "قيد الانتظار",
  ai_reviewed: "راجعها AI",
  approved: "تمت الموافقة",
  rejected: "مرفوض",
  open: "مفتوحة",
  ai_handling: "AI يعالجها",
  escalated: "محول للإدارة",
  resolved: "تم الحل",
  closed: "مغلقة",
};

const PRIORITY_BADGES: Record<string, string> = {
  urgent: "bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/30",
  high: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30",
  normal: "bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30",
  low: "bg-slate-500/15 text-slate-600 dark:text-slate-400 border-slate-500/30",
};

export function TeacherRequests({
  initialTab = "views",
}: {
  initialTab?: "views" | "grades" | "tickets";
}) {
  const { success, error } = useToast();
  const [tab, setTab] = useState<"views" | "grades" | "tickets">(initialTab);
  const [prevInitialTab, setPrevInitialTab] = useState(initialTab);

  if (prevInitialTab !== initialTab) {
    setPrevInitialTab(initialTab);
    setTab(initialTab);
  }

  // Data states
  const [viewRequests, setViewRequests] = useState<VideoViewRequest[]>([]);
  const [gradeRequests, setGradeRequests] = useState<GradeRequest[]>([]);
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [loading, setLoading] = useState(true);

  // Filter & Search states
  const [viewFilter, setViewFilter] = useState<"pending" | "approved" | "rejected" | "all">("pending");
  const [gradeFilter, setGradeFilter] = useState<"all" | "pending" | "ai_reviewed" | "approved" | "rejected">("pending");
  const [ticketFilter, setTicketFilter] = useState<"all" | "open" | "escalated" | "resolved" | "closed">("open");
  const [searchQuery, setSearchQuery] = useState("");

  // Modal states
  const [selectedViewReq, setSelectedViewReq] = useState<VideoViewRequest | null>(null);
  const [selectedGradeReq, setSelectedGradeReq] = useState<GradeRequest | null>(null);
  const [selectedTicket, setSelectedTicket] = useState<SupportTicket | null>(null);

  // Form action states
  const [actionNotes, setActionNotes] = useState("");
  const [actionGrantedViews, setActionGrantedViews] = useState<number>(2);
  const [actionScore, setActionScore] = useState("");
  const [resolution, setResolution] = useState("");
  const [actionLoading, setActionLoading] = useState(false);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [vRes, gRes, tRes] = await Promise.all([
        fetch("/api/admin/view-requests?status=all").catch(() => null),
        fetch("/api/grade-requests").catch(() => null),
        fetch("/api/tickets").catch(() => null),
      ]);

      if (vRes?.ok) {
        const vData = await vRes.json();
        setViewRequests(vData.requests || []);
      }
      if (gRes?.ok) {
        const gData = await gRes.json();
        setGradeRequests(gData.requests || []);
      }
      if (tRes?.ok) {
        const tData = await tRes.json();
        setTickets(tData.tickets || []);
      }
    } catch (err) {
      console.error("Error loading teacher requests data:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    const fetchInitial = async () => {
      try {
        const [vRes, gRes, tRes] = await Promise.all([
          fetch("/api/admin/view-requests?status=all").catch(() => null),
          fetch("/api/grade-requests").catch(() => null),
          fetch("/api/tickets").catch(() => null),
        ]);

        if (!active) return;
        if (vRes?.ok) {
          const vData = await vRes.json();
          if (active) setViewRequests(vData.requests || []);
        }
        if (gRes?.ok) {
          const gData = await gRes.json();
          if (active) setGradeRequests(gData.requests || []);
        }
        if (tRes?.ok) {
          const tData = await tRes.json();
          if (active) setTickets(tData.tickets || []);
        }
      } catch (err) {
        console.error("Initial load error:", err);
      } finally {
        if (active) setLoading(false);
      }
    };

    void fetchInitial();
    return () => {
      active = false;
    };
  }, []);

  // Actions
  const handleViewAction = async (id: string, action: "approve" | "reject") => {
    setActionLoading(true);
    try {
      const res = await fetch("/api/admin/view-requests", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestId: id,
          action,
          grantedViews: action === "approve" ? actionGrantedViews : undefined,
          teacherNotes: actionNotes,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        error(data.error || "فشلت العملية");
        return;
      }
      success(action === "approve" ? `تمت الموافقة ومنح ${data.grantedViews} مشاهدة إضافية` : "تم رفض الطلب");
      setSelectedViewReq(null);
      setActionNotes("");
      setActionGrantedViews(2);
      loadAll();
    } catch {
      error("حدث خطأ أثناء حفظ القرار");
    } finally {
      setActionLoading(false);
    }
  };

  const handleGradeAction = async (id: string, action: "approve" | "reject") => {
    setActionLoading(true);
    try {
      const res = await fetch(`/api/grade-requests/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          teacherNotes: actionNotes,
          newScore: action === "approve" && actionScore ? parseFloat(actionScore) : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        error(data.error || "فشل تحديث الدرجة");
        return;
      }
      success(data.message || (action === "approve" ? "تم قبول وتعديل الدرجة" : "تم رفض طلب تعديل الدرجة"));
      setSelectedGradeReq(null);
      setActionScore("");
      setActionNotes("");
      loadAll();
    } catch {
      error("حدث خطأ في معالجة طلب الدرجة");
    } finally {
      setActionLoading(false);
    }
  };

  const handleTicketResolve = async (id: string, status: string) => {
    setActionLoading(true);
    try {
      const res = await fetch(`/api/tickets/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, resolution }),
      });
      const data = await res.json();
      if (!res.ok) {
        error(data.error || "فشل تحديث التذكرة");
        return;
      }
      success(data.message || (status === "resolved" ? "تم حل التذكرة بنجاح" : "تم تصعيد التذكرة للإدارة"));
      setSelectedTicket(null);
      setResolution("");
      loadAll();
    } catch {
      error("حدث خطأ أثناء حفظ التذكرة");
    } finally {
      setActionLoading(false);
    }
  };

  // Counts
  const pendingViewsCount = useMemo(() => viewRequests.filter((r) => r.status === "pending").length, [viewRequests]);
  const pendingGradesCount = useMemo(() => gradeRequests.filter((r) => r.status === "pending" || r.status === "ai_reviewed").length, [gradeRequests]);
  const openTicketsCount = useMemo(() => tickets.filter((t) => t.status === "open" || t.status === "escalated" || t.status === "ai_handling").length, [tickets]);

  // Filtered views
  const filteredViewRequests = useMemo(() => {
    return viewRequests.filter((r) => {
      if (viewFilter !== "all" && r.status !== viewFilter) return false;
      if (!searchQuery.trim()) return true;
      const q = searchQuery.trim().toLowerCase();
      return (
        r.student?.name?.toLowerCase().includes(q) ||
        r.student?.phone?.includes(q) ||
        r.video?.title?.toLowerCase().includes(q) ||
        r.video?.folder?.course?.title?.toLowerCase().includes(q) ||
        r.video?.folder?.name?.toLowerCase().includes(q) ||
        r.reason?.toLowerCase().includes(q)
      );
    });
  }, [viewRequests, viewFilter, searchQuery]);

  // Filtered grades
  const filteredGradeRequests = useMemo(() => {
    return gradeRequests.filter((r) => {
      if (gradeFilter === "pending") {
        if (r.status !== "pending" && r.status !== "ai_reviewed") return false;
      } else if (gradeFilter !== "all" && r.status !== gradeFilter) {
        return false;
      }
      if (!searchQuery.trim()) return true;
      const q = searchQuery.trim().toLowerCase();
      return (
        r.student?.name?.toLowerCase().includes(q) ||
        r.student?.phone?.includes(q) ||
        r.quiz?.title?.toLowerCase().includes(q) ||
        r.course?.title?.toLowerCase().includes(q) ||
        r.reason?.toLowerCase().includes(q)
      );
    });
  }, [gradeRequests, gradeFilter, searchQuery]);

  // Filtered tickets
  const filteredTickets = useMemo(() => {
    return tickets.filter((t) => {
      if (ticketFilter === "open") {
        if (t.status !== "open" && t.status !== "ai_handling") return false;
      } else if (ticketFilter !== "all" && t.status !== ticketFilter) {
        return false;
      }
      if (!searchQuery.trim()) return true;
      const q = searchQuery.trim().toLowerCase();
      return (
        t.student?.name?.toLowerCase().includes(q) ||
        t.student?.phone?.includes(q) ||
        t.title?.toLowerCase().includes(q) ||
        t.description?.toLowerCase().includes(q) ||
        t.course?.title?.toLowerCase().includes(q)
      );
    });
  }, [tickets, ticketFilter, searchQuery]);

  return (
    <div className="space-y-6" dir="rtl">
      {/* ── CENTRAL HUB NAVIGATION SWITCHER ── */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-2 rounded-3xl bg-slate-100 dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800/90 shadow-sm">
        <div className="flex flex-wrap gap-2">
          {/* Tab 1: View Requests */}
          <button
            type="button"
            onClick={() => {
              setTab("views");
              setSearchQuery("");
            }}
            className={`px-5 py-2.5 rounded-2xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
              tab === "views"
                ? "bg-emerald-600 text-white shadow-md shadow-emerald-600/20"
                : "text-slate-600 dark:text-slate-400 hover:bg-white/60 dark:hover:bg-slate-800"
            }`}
          >
            <span>👁️ طلبات زيادة المشاهدات</span>
            {pendingViewsCount > 0 && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-white text-emerald-700">
                {pendingViewsCount}
              </span>
            )}
          </button>

          {/* Tab 2: Grade Requests */}
          <button
            type="button"
            onClick={() => {
              setTab("grades");
              setSearchQuery("");
            }}
            className={`px-5 py-2.5 rounded-2xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
              tab === "grades"
                ? "bg-blue-600 text-white shadow-md shadow-blue-600/20"
                : "text-slate-600 dark:text-slate-400 hover:bg-white/60 dark:hover:bg-slate-800"
            }`}
          >
            <span>🎯 طلبات تعديل الدرجات</span>
            {pendingGradesCount > 0 && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-white text-blue-700">
                {pendingGradesCount}
              </span>
            )}
          </button>

          {/* Tab 3: Support Tickets */}
          <button
            type="button"
            onClick={() => {
              setTab("tickets");
              setSearchQuery("");
            }}
            className={`px-5 py-2.5 rounded-2xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
              tab === "tickets"
                ? "bg-amber-600 text-white shadow-md shadow-amber-600/20"
                : "text-slate-600 dark:text-slate-400 hover:bg-white/60 dark:hover:bg-slate-800"
            }`}
          >
            <span>🎫 تذاكر الدعم والاستفسارات</span>
            {openTicketsCount > 0 && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-white text-amber-700">
                {openTicketsCount}
              </span>
            )}
          </button>
        </div>

        {/* Live Refresh Button */}
        <button
          type="button"
          onClick={() => void loadAll()}
          disabled={loading}
          className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white hover:bg-slate-50 dark:bg-slate-800 dark:hover:bg-slate-700 text-xs font-bold text-slate-700 dark:text-slate-300 transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50 shrink-0 shadow-xs"
        >
          <span className={loading ? "animate-spin" : ""}>🔄</span>
          <span>تحديث</span>
        </button>
      </div>

      {/* ══════════════════════════════════════════════════════════ */}
      {/* ── TAB 1: WATCH EXTENSION REQUESTS (طلبات زيادة المشاهدات) ── */}
      {/* ══════════════════════════════════════════════════════════ */}
      {tab === "views" && (
        <div className="space-y-6">
          {/* Header & KPI Statistics */}
          <div className="rounded-3xl border border-slate-200/90 bg-white p-6 shadow-sm dark:border-slate-800/90 dark:bg-slate-900/90 space-y-5">
            <div className="border-b border-slate-100 dark:border-slate-800 pb-4">
              <h3 className="font-black text-base text-slate-900 dark:text-white flex items-center gap-2">
                <span>��️</span>
                <span>طلبات تمديد وزيادة المشاهدات للدروس</span>
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                مراجعة طلبات الطلاب الذين استنفدوا مرات المشاهدة للدروس والمحاضرات مع إمكانية منحهم مشاهدات إضافية فورية.
              </p>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-950/50 border border-slate-200/80 dark:border-slate-800/80 flex items-center justify-between">
                <span className="text-xs font-bold text-slate-600 dark:text-slate-400">إجمالي الطلبات</span>
                <span className="font-mono text-base font-black text-slate-900 dark:text-white">{viewRequests.length}</span>
              </div>
              <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-between">
                <span className="text-xs font-bold text-amber-700 dark:text-amber-400">قيد الانتظار</span>
                <span className="font-mono text-base font-black text-amber-600 dark:text-amber-400">{pendingViewsCount}</span>
              </div>
              <div className="p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-between">
                <span className="text-xs font-bold text-emerald-700 dark:text-emerald-400">المقبولة</span>
                <span className="font-mono text-base font-black text-emerald-600 dark:text-emerald-400">
                  {viewRequests.filter((r) => r.status === "approved").length}
                </span>
              </div>
              <div className="p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-between">
                <span className="text-xs font-bold text-rose-700 dark:text-rose-400">المرفوضة</span>
                <span className="font-mono text-base font-black text-rose-600 dark:text-rose-400">
                  {viewRequests.filter((r) => r.status === "rejected").length}
                </span>
              </div>
            </div>
          </div>

          {/* Filter Chips & Search */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-white dark:bg-slate-900/90 p-3 rounded-2xl border border-slate-200/90 dark:border-slate-800/90 shadow-sm">
            <div className="flex gap-1.5 flex-wrap items-center">
              <button
                type="button"
                onClick={() => setViewFilter("pending")}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                  viewFilter === "pending"
                    ? "bg-amber-500 text-white shadow-sm shadow-amber-500/20"
                    : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                }`}
              >
                <span>⏳ قيد الانتظار</span>
                <span className="px-1.5 py-0.2 rounded-md bg-black/20 text-[10px] font-mono">{pendingViewsCount}</span>
              </button>
              <button
                type="button"
                onClick={() => setViewFilter("approved")}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                  viewFilter === "approved"
                    ? "bg-emerald-600 text-white shadow-sm shadow-emerald-600/20"
                    : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                }`}
              >
                <span>✓ المقبولة</span>
              </button>
              <button
                type="button"
                onClick={() => setViewFilter("rejected")}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                  viewFilter === "rejected"
                    ? "bg-rose-600 text-white shadow-sm shadow-rose-600/20"
                    : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                }`}
              >
                <span>✗ المرفوضة</span>
              </button>
              <button
                type="button"
                onClick={() => setViewFilter("all")}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                  viewFilter === "all"
                    ? "bg-slate-900 text-white dark:bg-slate-700 shadow-sm"
                    : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                }`}
              >
                <span>الكل</span>
                <span className="px-1.5 py-0.2 rounded-md bg-black/20 text-[10px] font-mono">{viewRequests.length}</span>
              </button>
            </div>

            <div className="relative min-w-[240px]">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="بحث بالطالب، الهاتف، أو الدرس..."
                className="w-full px-3.5 py-1.5 pl-8 rounded-xl border border-slate-200 bg-slate-50 text-xs font-medium text-slate-900 outline-none focus:border-emerald-500 focus:bg-white dark:border-slate-800 dark:bg-slate-950 dark:text-white transition-all"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute left-2.5 top-1.5 text-xs text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  ✕
                </button>
              )}
            </div>
          </div>

          {/* Feed */}
          {loading ? (
            <div className="text-center py-20 text-slate-500 dark:text-slate-400 flex flex-col items-center gap-3">
              <div className="w-9 h-9 border-3 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin" />
              <span className="text-xs font-bold">جارٍ تحميل طلبات المشاهدات...</span>
            </div>
          ) : filteredViewRequests.length === 0 ? (
            <div className="rounded-3xl border border-slate-200/90 bg-white p-16 text-center text-slate-500 dark:text-slate-400 dark:border-slate-800/90 dark:bg-slate-900/90 space-y-2">
              <div className="text-4xl">👁️</div>
              <p className="font-bold text-sm text-slate-800 dark:text-slate-200">
                {searchQuery ? "لم يتم العثور على طلبات مطابقة للبحث" : "لا توجد طلبات زيادة مشاهدات في هذا القسم"}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredViewRequests.map((r) => (
                <div
                  key={r.id}
                  className="rounded-3xl border border-slate-200/90 bg-white p-5 space-y-4 hover:border-emerald-500/50 transition-all shadow-sm dark:border-slate-800/90 dark:bg-slate-900/90"
                >
                  <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-slate-900 dark:text-white text-sm">{r.student.name}</span>
                        {r.student.phone && <StudentPhoneActions phone={r.student.phone} compact />}
                        <span
                          className={`px-2.5 py-0.5 text-[11px] rounded-full font-bold border ${
                            r.status === "approved"
                              ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30"
                              : r.status === "rejected"
                              ? "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30"
                              : "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30"
                          }`}
                        >
                          {STATUS_LABELS[r.status] || r.status}
                        </span>
                      </div>

                      <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1.5 flex-wrap">
                        <span>الكورس:</span>
                        <strong className="text-slate-800 dark:text-slate-200">{r.video.folder.course.title}</strong>
                        <span>• المحاضرة:</span>
                        <strong className="text-slate-700 dark:text-slate-300">{r.video.folder.name}</strong>
                        <span>• الدرس:</span>
                        <strong className="text-emerald-600 dark:text-emerald-400">{r.video.title}</strong>
                        <span>(الحد الأساسي: {r.video.maxWatchesPerUser} مشاهدات)</span>
                      </p>
                    </div>

                    <div className="text-left text-xs text-slate-400 shrink-0">
                      <p>{new Date(r.createdAt).toLocaleString("ar-EG")}</p>
                      {r.status === "approved" && (
                        <p className="text-emerald-500 font-bold mt-0.5 font-mono">
                          +{r.grantedViews} مشاهدة ممنوحة
                        </p>
                      )}
                    </div>
                  </div>

                  {r.reason && (
                    <div className="bg-slate-50 dark:bg-slate-950/60 rounded-2xl p-3.5 border border-slate-200/80 dark:border-slate-800/80 text-xs">
                      <span className="font-bold text-slate-600 dark:text-slate-400 ml-1">سبب طلب الطالب:</span>
                      <span className="text-slate-800 dark:text-slate-200 leading-relaxed">{r.reason}</span>
                    </div>
                  )}

                  {r.teacherNotes && (
                    <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-2xl p-3.5 text-xs">
                      <span className="font-bold text-emerald-700 dark:text-emerald-400 ml-1">رد / ملاحظة المعلم:</span>
                      <span className="text-slate-800 dark:text-slate-200 leading-relaxed">{r.teacherNotes}</span>
                    </div>
                  )}

                  {r.status === "pending" && (
                    <div className="flex items-center gap-2.5 pt-1">
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedViewReq(r);
                          setActionGrantedViews(2);
                          setActionNotes("");
                        }}
                        className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl transition-all shadow-sm cursor-pointer flex items-center gap-1.5"
                      >
                        <span>👁️</span>
                        <span>مراجعة ومنح مشاهدات</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleViewAction(r.id, "reject")}
                        disabled={actionLoading}
                        className="px-4 py-2 border border-rose-500/30 hover:bg-rose-500/10 text-rose-600 dark:text-rose-400 text-xs font-bold rounded-xl transition-colors cursor-pointer"
                      >
                        رفض الطلب
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════ */}
      {/* ── TAB 2: GRADE ALTERATION REQUESTS (طلبات تعديل الدرجات) ── */}
      {/* ══════════════════════════════════════════════════════════ */}
      {tab === "grades" && (
        <div className="space-y-6">
          {/* Header & KPI Statistics */}
          <div className="rounded-3xl border border-slate-200/90 bg-white p-6 shadow-sm dark:border-slate-800/90 dark:bg-slate-900/90 space-y-5">
            <div className="border-b border-slate-100 dark:border-slate-800 pb-4">
              <h3 className="font-black text-base text-slate-900 dark:text-white flex items-center gap-2">
                <span>🎯</span>
                <span>طلبات ومراجعات تعديل درجات الاختبارات</span>
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                مراجعة طلبات التظلم أو إعادة تقييم درجات الاختبارات المرفوعة من الطلاب أو الموصى بها من المرشد الذكي.
              </p>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-950/50 border border-slate-200/80 dark:border-slate-800/80 flex items-center justify-between">
                <span className="text-xs font-bold text-slate-600 dark:text-slate-400">إجمالي الطلبات</span>
                <span className="font-mono text-base font-black text-slate-900 dark:text-white">{gradeRequests.length}</span>
              </div>
              <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-between">
                <span className="text-xs font-bold text-amber-700 dark:text-amber-400">قيد المراجعة</span>
                <span className="font-mono text-base font-black text-amber-600 dark:text-amber-400">{pendingGradesCount}</span>
              </div>
              <div className="p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-between">
                <span className="text-xs font-bold text-emerald-700 dark:text-emerald-400">المقبولة</span>
                <span className="font-mono text-base font-black text-emerald-600 dark:text-emerald-400">
                  {gradeRequests.filter((r) => r.status === "approved").length}
                </span>
              </div>
              <div className="p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-between">
                <span className="text-xs font-bold text-rose-700 dark:text-rose-400">المرفوضة</span>
                <span className="font-mono text-base font-black text-rose-600 dark:text-rose-400">
                  {gradeRequests.filter((r) => r.status === "rejected").length}
                </span>
              </div>
            </div>
          </div>

          {/* Filter Chips & Search */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-white dark:bg-slate-900/90 p-3 rounded-2xl border border-slate-200/90 dark:border-slate-800/90 shadow-sm">
            <div className="flex gap-1.5 flex-wrap items-center">
              <button
                type="button"
                onClick={() => setGradeFilter("pending")}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                  gradeFilter === "pending"
                    ? "bg-amber-500 text-white shadow-sm shadow-amber-500/20"
                    : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                }`}
              >
                <span>⏳ قيد الانتظار</span>
                <span className="px-1.5 py-0.2 rounded-md bg-black/20 text-[10px] font-mono">{pendingGradesCount}</span>
              </button>
              <button
                type="button"
                onClick={() => setGradeFilter("ai_reviewed")}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                  gradeFilter === "ai_reviewed"
                    ? "bg-purple-600 text-white shadow-sm"
                    : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                }`}
              >
                <span>🤖 راجعها AI</span>
              </button>
              <button
                type="button"
                onClick={() => setGradeFilter("approved")}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                  gradeFilter === "approved"
                    ? "bg-emerald-600 text-white shadow-sm"
                    : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                }`}
              >
                <span>✓ المقبولة</span>
              </button>
              <button
                type="button"
                onClick={() => setGradeFilter("rejected")}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                  gradeFilter === "rejected"
                    ? "bg-rose-600 text-white shadow-sm"
                    : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                }`}
              >
                <span>✗ المرفوضة</span>
              </button>
              <button
                type="button"
                onClick={() => setGradeFilter("all")}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                  gradeFilter === "all"
                    ? "bg-slate-900 text-white dark:bg-slate-700 shadow-sm"
                    : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                }`}
              >
                <span>الكل</span>
                <span className="px-1.5 py-0.2 rounded-md bg-black/20 text-[10px] font-mono">{gradeRequests.length}</span>
              </button>
            </div>

            <div className="relative min-w-[240px]">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="بحث بالطالب، الاختبار، أو الكورس..."
                className="w-full px-3.5 py-1.5 pl-8 rounded-xl border border-slate-200 bg-slate-50 text-xs font-medium text-slate-900 outline-none focus:border-blue-500 focus:bg-white dark:border-slate-800 dark:bg-slate-950 dark:text-white transition-all"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute left-2.5 top-1.5 text-xs text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  ✕
                </button>
              )}
            </div>
          </div>

          {/* Feed */}
          {loading ? (
            <div className="text-center py-20 text-slate-500 dark:text-slate-400 flex flex-col items-center gap-3">
              <div className="w-9 h-9 border-3 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
              <span className="text-xs font-bold">جارٍ تحميل طلبات تعديل الدرجات...</span>
            </div>
          ) : filteredGradeRequests.length === 0 ? (
            <div className="rounded-3xl border border-slate-200/90 bg-white p-16 text-center text-slate-500 dark:text-slate-400 dark:border-slate-800/90 dark:bg-slate-900/90 space-y-2">
              <div className="text-4xl">🎯</div>
              <p className="font-bold text-sm text-slate-800 dark:text-slate-200">
                {searchQuery ? "لم يتم العثور على طلبات مطابقة للبحث" : "لا توجد طلبات تعديل درجات في هذا القسم"}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredGradeRequests.map((r) => (
                <div
                  key={r.id}
                  className="rounded-3xl border border-slate-200/90 bg-white p-5 space-y-4 hover:border-blue-500/50 transition-all shadow-sm dark:border-slate-800/90 dark:bg-slate-900/90"
                >
                  <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-slate-900 dark:text-white text-sm">{r.student.name}</span>
                        {r.requestedBy === "ai" && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-500/15 text-purple-600 dark:text-purple-400 border border-purple-500/30 flex items-center gap-1">
                            <span>🤖</span>
                            <span>توصية المرشد الذكي</span>
                          </span>
                        )}
                        <span
                          className={`px-2.5 py-0.5 text-[11px] rounded-full font-bold border ${
                            r.status === "approved"
                              ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30"
                              : r.status === "rejected"
                              ? "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30"
                              : "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30"
                          }`}
                        >
                          {STATUS_LABELS[r.status] || r.status}
                        </span>
                      </div>

                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        الكورس: <strong className="text-slate-800 dark:text-slate-200">{r.course.title}</strong> • الاختبار: <strong className="text-blue-600 dark:text-blue-400">{r.quiz.title}</strong>
                      </p>
                    </div>

                    <div className="flex items-center gap-3 bg-slate-50 dark:bg-slate-950 p-2 px-3 rounded-2xl border border-slate-200/80 dark:border-slate-800">
                      <div className="text-center">
                        <span className="block text-[10px] text-slate-400">الدرجة الحالية</span>
                        <span className="font-mono text-sm font-bold text-slate-700 dark:text-slate-300">{r.currentScore}</span>
                      </div>
                      {r.requestedScore !== null && (
                        <>
                          <span className="text-slate-400">←</span>
                          <div className="text-center">
                            <span className="block text-[10px] text-emerald-500">المطلوبة</span>
                            <span className="font-mono text-sm font-black text-emerald-600 dark:text-emerald-400">{r.requestedScore}</span>
                          </div>
                        </>
                      )}
                    </div>
                  </div>

                  {r.reason && (
                    <div className="bg-slate-50 dark:bg-slate-950/60 rounded-2xl p-3.5 border border-slate-200/80 dark:border-slate-800/80 text-xs">
                      <span className="font-bold text-slate-600 dark:text-slate-400 ml-1">مبرر الطالب:</span>
                      <span className="text-slate-800 dark:text-slate-200 leading-relaxed">{r.reason}</span>
                    </div>
                  )}

                  {r.aiAnalysis && (
                    <div className="bg-purple-500/10 border border-purple-500/20 rounded-2xl p-3.5 text-xs text-purple-900 dark:text-purple-200 leading-relaxed">
                      <span className="font-bold text-purple-700 dark:text-purple-300 ml-1">🤖 تحليل الذكاء الاصطناعي:</span>
                      <span>{r.aiAnalysis}</span>
                    </div>
                  )}

                  {r.teacherNotes && (
                    <div className="bg-blue-500/10 border border-blue-500/20 rounded-2xl p-3.5 text-xs">
                      <span className="font-bold text-blue-700 dark:text-blue-400 ml-1">ملاحظات المعلم:</span>
                      <span className="text-slate-800 dark:text-slate-200 leading-relaxed">{r.teacherNotes}</span>
                    </div>
                  )}

                  {(r.status === "pending" || r.status === "ai_reviewed") && (
                    <div className="flex items-center gap-2.5 pt-1">
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedGradeReq(r);
                          setActionScore(String(r.requestedScore ?? r.currentScore));
                          setActionNotes("");
                        }}
                        className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-xl transition-all shadow-sm cursor-pointer flex items-center gap-1.5"
                      >
                        <span>✓</span>
                        <span>مراجعة وتعديل الدرجة</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleGradeAction(r.id, "reject")}
                        disabled={actionLoading}
                        className="px-4 py-2 border border-rose-500/30 hover:bg-rose-500/10 text-rose-600 dark:text-rose-400 text-xs font-bold rounded-xl transition-colors cursor-pointer"
                      >
                        رفض التعديل
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════ */}
      {/* ── TAB 3: SUPPORT TICKETS (تذاكر الدعم والاستفسارات) ── */}
      {/* ══════════════════════════════════════════════════════════ */}
      {tab === "tickets" && (
        <div className="space-y-6">
          {/* Header & KPI Statistics */}
          <div className="rounded-3xl border border-slate-200/90 bg-white p-6 shadow-sm dark:border-slate-800/90 dark:bg-slate-900/90 space-y-5">
            <div className="border-b border-slate-100 dark:border-slate-800 pb-4">
              <h3 className="font-black text-base text-slate-900 dark:text-white flex items-center gap-2">
                <span>🎫</span>
                <span>تذاكر الدعم والاستفسارات الموجهة للمعلم</span>
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                متابعة استفسارات الطلاب الأكاديمية والتقنية والرد عليها أو تصعيدها لإدارة المنصة.
              </p>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-950/50 border border-slate-200/80 dark:border-slate-800/80 flex items-center justify-between">
                <span className="text-xs font-bold text-slate-600 dark:text-slate-400">إجمالي التذاكر</span>
                <span className="font-mono text-base font-black text-slate-900 dark:text-white">{tickets.length}</span>
              </div>
              <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-between">
                <span className="text-xs font-bold text-amber-700 dark:text-amber-400">التذاكر المفتوحة</span>
                <span className="font-mono text-base font-black text-amber-600 dark:text-amber-400">{openTicketsCount}</span>
              </div>
              <div className="p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-between">
                <span className="text-xs font-bold text-emerald-700 dark:text-emerald-400">المحلولة</span>
                <span className="font-mono text-base font-black text-emerald-600 dark:text-emerald-400">
                  {tickets.filter((t) => t.status === "resolved").length}
                </span>
              </div>
              <div className="p-3.5 rounded-2xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-between">
                <span className="text-xs font-bold text-orange-700 dark:text-orange-400">المصعدة للإدارة</span>
                <span className="font-mono text-base font-black text-orange-600 dark:text-orange-400">
                  {tickets.filter((t) => t.status === "escalated").length}
                </span>
              </div>
            </div>
          </div>

          {/* Filter Chips & Search */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-white dark:bg-slate-900/90 p-3 rounded-2xl border border-slate-200/90 dark:border-slate-800/90 shadow-sm">
            <div className="flex gap-1.5 flex-wrap items-center">
              <button
                type="button"
                onClick={() => setTicketFilter("open")}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                  ticketFilter === "open"
                    ? "bg-amber-500 text-white shadow-sm shadow-amber-500/20"
                    : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                }`}
              >
                <span>📩 المفتوحة</span>
                <span className="px-1.5 py-0.2 rounded-md bg-black/20 text-[10px] font-mono">{openTicketsCount}</span>
              </button>
              <button
                type="button"
                onClick={() => setTicketFilter("escalated")}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                  ticketFilter === "escalated"
                    ? "bg-orange-600 text-white shadow-sm"
                    : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                }`}
              >
                <span>↑ المصعدة</span>
              </button>
              <button
                type="button"
                onClick={() => setTicketFilter("resolved")}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                  ticketFilter === "resolved"
                    ? "bg-emerald-600 text-white shadow-sm"
                    : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                }`}
              >
                <span>✓ المحلولة</span>
              </button>
              <button
                type="button"
                onClick={() => setTicketFilter("all")}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                  ticketFilter === "all"
                    ? "bg-slate-900 text-white dark:bg-slate-700 shadow-sm"
                    : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                }`}
              >
                <span>الكل</span>
                <span className="px-1.5 py-0.2 rounded-md bg-black/20 text-[10px] font-mono">{tickets.length}</span>
              </button>
            </div>

            <div className="relative min-w-[240px]">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="بحث بالطالب، عنوان التذكرة، أو الوصف..."
                className="w-full px-3.5 py-1.5 pl-8 rounded-xl border border-slate-200 bg-slate-50 text-xs font-medium text-slate-900 outline-none focus:border-amber-500 focus:bg-white dark:border-slate-800 dark:bg-slate-950 dark:text-white transition-all"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute left-2.5 top-1.5 text-xs text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  ✕
                </button>
              )}
            </div>
          </div>

          {/* Feed */}
          {loading ? (
            <div className="text-center py-20 text-slate-500 dark:text-slate-400 flex flex-col items-center gap-3">
              <div className="w-9 h-9 border-3 border-amber-500/30 border-t-amber-500 rounded-full animate-spin" />
              <span className="text-xs font-bold">جارٍ تحميل تذاكر الدعم...</span>
            </div>
          ) : filteredTickets.length === 0 ? (
            <div className="rounded-3xl border border-slate-200/90 bg-white p-16 text-center text-slate-500 dark:text-slate-400 dark:border-slate-800/90 dark:bg-slate-900/90 space-y-2">
              <div className="text-4xl">🎫</div>
              <p className="font-bold text-sm text-slate-800 dark:text-slate-200">
                {searchQuery ? "لم يتم العثور على تذاكر مطابقة للبحث" : "لا توجد تذاكر دعم في هذا القسم"}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredTickets.map((t) => (
                <div
                  key={t.id}
                  className="rounded-3xl border border-slate-200/90 bg-white p-5 space-y-4 hover:border-amber-500/50 transition-all shadow-sm dark:border-slate-800/90 dark:bg-slate-900/90"
                >
                  <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-slate-900 dark:text-white text-sm">{t.title}</span>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${PRIORITY_BADGES[t.priority] || PRIORITY_BADGES.normal}`}>
                          {t.priority === "urgent" ? "🔥 عاجل" : t.priority === "high" ? "⚡ أولوية مرتفعة" : t.priority === "low" ? "منخفض" : "عادي"}
                        </span>
                        <span
                          className={`px-2.5 py-0.5 text-[11px] rounded-full font-bold border ${
                            t.status === "resolved"
                              ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30"
                              : t.status === "escalated"
                              ? "bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/30"
                              : "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30"
                          }`}
                        >
                          {STATUS_LABELS[t.status] || t.status}
                        </span>
                      </div>

                      <div className="space-y-2">
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          الطالب: <strong className="text-slate-800 dark:text-slate-200">{t.student.name}</strong>
                          {t.course && <span> • الكورس: <strong className="text-amber-600 dark:text-amber-400">{t.course.title}</strong></span>}
                        </p>
                        {t.student.phone && <StudentPhoneActions phone={t.student.phone} />}
                      </div>
                    </div>

                    <div className="text-left text-xs text-slate-400 shrink-0">
                      <p>{new Date(t.createdAt).toLocaleString("ar-EG")}</p>
                    </div>
                  </div>

                  <div className="bg-slate-50 dark:bg-slate-950/60 rounded-2xl p-3.5 border border-slate-200/80 dark:border-slate-800/80 text-xs">
                    <span className="font-bold text-slate-600 dark:text-slate-400 ml-1">تفاصيل الاستفسار:</span>
                    <span className="text-slate-800 dark:text-slate-200 leading-relaxed">{t.description}</span>
                  </div>

                  {t.aiResponse && (
                    <div className="bg-purple-500/10 border border-purple-500/20 rounded-2xl p-3.5 text-xs text-purple-900 dark:text-purple-200 leading-relaxed">
                      <span className="font-bold text-purple-700 dark:text-purple-300 ml-1">🤖 رد الذكاء الاصطناعي الأولي:</span>
                      <span>{t.aiResponse}</span>
                    </div>
                  )}

                  {t.resolution && (
                    <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-2xl p-3.5 text-xs">
                      <span className="font-bold text-emerald-700 dark:text-emerald-400 ml-1">الحل المعتمد من المعلم:</span>
                      <span className="text-slate-800 dark:text-slate-200 leading-relaxed">{t.resolution}</span>
                    </div>
                  )}

                  {t.status !== "resolved" && t.status !== "closed" && (
                    <div className="flex items-center gap-2.5 pt-1">
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedTicket(t);
                          setResolution(t.resolution || "");
                        }}
                        className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold rounded-xl transition-all shadow-sm cursor-pointer flex items-center gap-1.5"
                      >
                        <span>💬</span>
                        <span>الرد وحل التذكرة</span>
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── MODAL: GRANT WATCHES (المشاهدات) ── */}
      {selectedViewReq && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fadeIn">
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 max-w-md w-full p-6 space-y-5 shadow-2xl">
            <div className="border-b border-slate-100 dark:border-slate-800 pb-3">
              <h3 className="text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
                <span>👁️</span>
                <span>منح مشاهدات إضافية للطالب</span>
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                الطالب: <strong className="text-slate-800 dark:text-slate-200">{selectedViewReq.student.name}</strong> • الدرس: {selectedViewReq.video.title}
              </p>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-2">
                عدد المشاهدات الإضافية المطلوب منحها:
              </label>
              <div className="flex gap-2">
                {[1, 2, 3, 5].map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setActionGrantedViews(v)}
                    className={`flex-1 py-2 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                      actionGrantedViews === v
                        ? "bg-emerald-600 text-white border-emerald-700 shadow-sm"
                        : "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700"
                    }`}
                  >
                    +{v}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                ملاحظة للطالب (اختياري):
              </label>
              <input
                type="text"
                value={actionNotes}
                onChange={(e) => setActionNotes(e.target.value)}
                placeholder="مثال: تم منحك محاولتين إضافيتين بناءً على طلبك"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-xs text-slate-900 dark:border-slate-800 dark:bg-slate-950 dark:text-white outline-none focus:border-emerald-500"
              />
            </div>

            <div className="flex gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => handleViewAction(selectedViewReq.id, "approve")}
                disabled={actionLoading}
                className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition-all shadow-sm cursor-pointer disabled:opacity-50"
              >
                {actionLoading ? "جارٍ الحفظ..." : "✓ موافقة ومنح المشاهدات"}
              </button>
              <button
                type="button"
                onClick={() => handleViewAction(selectedViewReq.id, "reject")}
                disabled={actionLoading}
                className="px-4 py-2.5 border border-rose-500/30 hover:bg-rose-500/10 text-rose-600 dark:text-rose-400 rounded-xl text-xs font-bold transition-colors cursor-pointer"
              >
                رفض
              </button>
              <button
                type="button"
                onClick={() => setSelectedViewReq(null)}
                className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-bold transition-colors cursor-pointer"
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: REVIEW GRADE (الدرجات) ── */}
      {selectedGradeReq && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fadeIn">
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 max-w-md w-full p-6 space-y-5 shadow-2xl">
            <div className="border-b border-slate-100 dark:border-slate-800 pb-3">
              <h3 className="text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
                <span>🎯</span>
                <span>مراجعة طلب تعديل درجة الطالب</span>
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                الطالب: <strong className="text-slate-800 dark:text-slate-200">{selectedGradeReq.student.name}</strong> • الاختبار: {selectedGradeReq.quiz.title}
              </p>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                الدرجة الجديدة المعتمدة للطالب:
              </label>
              <input
                type="number"
                step="0.5"
                value={actionScore}
                onChange={(e) => setActionScore(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-xs font-mono font-bold text-slate-900 dark:border-slate-800 dark:bg-slate-950 dark:text-white outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                ملاحظة للطالب (تظهر في نتيجته):
              </label>
              <textarea
                rows={3}
                value={actionNotes}
                onChange={(e) => setActionNotes(e.target.value)}
                placeholder="اكتب توضيحاً للطالب لسبب قبول أو تعديل الدرجة..."
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-xs text-slate-900 dark:border-slate-800 dark:bg-slate-950 dark:text-white outline-none focus:border-blue-500 resize-none font-medium"
              />
            </div>

            <div className="flex gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => handleGradeAction(selectedGradeReq.id, "approve")}
                disabled={actionLoading}
                className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold transition-all shadow-sm cursor-pointer disabled:opacity-50"
              >
                {actionLoading ? "جارٍ الحفظ..." : "✓ اعتماد وتعديل"}
              </button>
              <button
                type="button"
                onClick={() => handleGradeAction(selectedGradeReq.id, "reject")}
                disabled={actionLoading}
                className="px-4 py-2.5 border border-rose-500/30 hover:bg-rose-500/10 text-rose-600 dark:text-rose-400 rounded-xl text-xs font-bold transition-colors cursor-pointer"
              >
                رفض
              </button>
              <button
                type="button"
                onClick={() => setSelectedGradeReq(null)}
                className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-bold transition-colors cursor-pointer"
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: RESOLVE TICKET (تذاكر الدعم) ── */}
      {selectedTicket && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fadeIn">
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 max-w-md w-full p-6 space-y-5 shadow-2xl">
            <div className="border-b border-slate-100 dark:border-slate-800 pb-3">
              <h3 className="text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
                <span>💬</span>
                <span>الرد وحل تذكرة الطالب</span>
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                العنوان: <strong className="text-slate-800 dark:text-slate-200">{selectedTicket.title}</strong>
              </p>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                الرد أو الحل الموجه للطالب:
              </label>
              <textarea
                rows={4}
                value={resolution}
                onChange={(e) => setResolution(e.target.value)}
                placeholder="اكتب الحل أو الإجابة على استفسار الطالب هنا..."
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-xs text-slate-900 dark:border-slate-800 dark:bg-slate-950 dark:text-white outline-none focus:border-amber-500 resize-none font-medium"
              />
            </div>

            <div className="flex gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => handleTicketResolve(selectedTicket.id, "resolved")}
                disabled={actionLoading}
                className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition-all shadow-sm cursor-pointer disabled:opacity-50"
              >
                {actionLoading ? "جارٍ الحفظ..." : "✓ تم الحل وإرسال الرد"}
              </button>
              <button
                type="button"
                onClick={() => handleTicketResolve(selectedTicket.id, "escalated")}
                disabled={actionLoading}
                className="px-4 py-2.5 bg-orange-600 hover:bg-orange-500 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer"
              >
                ↑ تصعيد للإدارة
              </button>
              <button
                type="button"
                onClick={() => setSelectedTicket(null)}
                className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-bold transition-colors cursor-pointer"
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
