"use client";

import { useState, useEffect, useCallback } from "react";
import { IconTrash } from "@/components/admin/AdminIcons";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useToast } from "@/components/ui/Toast";

function toDatetimeLocal(value: string | null | undefined): string {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

type ExamItem = {
  id: string;
  title: string;
  timeLimitMinutes: number;
  closeAt: string | null;
  enableAutoClose: boolean;
  createdAt: string;
  courseId: string;
  courseTitle: string;
  folderId: string;
  folderName: string;
  totalQuestions: number;
  mcqCount: number;
  essayCount: number;
  imagesCount: number;
  totalAttempts: number;
  avgScore: number;
  passedCount: number;
  pendingEssayCount: number;
};

type DashboardStats = {
  totalExams: number;
  totalAttempts: number;
  overallAvgScore: number;
  totalPendingEssays: number;
};

interface TeacherExamDashboardProps {
  onNavigateToEssayGrading?: () => void;
  onNavigateToResults?: (quizId?: string) => void;
  onNavigateToCreateQuiz?: () => void;
}

export function TeacherExamDashboard({
  onNavigateToEssayGrading,
  onNavigateToResults,
  onNavigateToCreateQuiz,
}: TeacherExamDashboardProps) {
  const { success: toastSuccess, error: toastError } = useToast();
  const [stats, setStats] = useState<DashboardStats>({
    totalExams: 0,
    totalAttempts: 0,
    overallAvgScore: 0,
    totalPendingEssays: 0,
  });
  const [exams, setExams] = useState<ExamItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCourseId, setSelectedCourseId] = useState<string>("all");
  const [deleteExamId, setDeleteExamId] = useState<string | null>(null);
  const [isActionLoading, setIsActionLoading] = useState(false);
  const [closeDrafts, setCloseDrafts] = useState<Record<string, { enableAutoClose: boolean; closeAt: string }>>({});

  const fetchDashboardData = useCallback(async () => {
    setLoading(true);
    try {
      const url =
        selectedCourseId && selectedCourseId !== "all"
          ? `/api/admin/teacher/exam-dashboard?courseId=${selectedCourseId}`
          : "/api/admin/teacher/exam-dashboard";

      const res = await fetch(url, { credentials: "include" });
      const data = await res.json();
      if (res.ok) {
        setStats(data.stats);
        setExams(data.exams || []);
      }
    } catch {
      toastError("تعذر تحميل لوحة الاختبارات");
    } finally {
      setLoading(false);
    }
  }, [selectedCourseId, toastError]);

  useEffect(() => {
    void fetchDashboardData();
  }, [fetchDashboardData]);

  const handleDeleteExam = async () => {
    if (!deleteExamId) return;
    setIsActionLoading(true);
    try {
      const res = await fetch(`/api/admin/teacher/exam-dashboard?quizId=${deleteExamId}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (res.ok) {
        toastSuccess("تم حذف الاختبار بنجاح");
        void fetchDashboardData();
      } else {
        const d = await res.json();
        toastError(d.error || "تعذر حذف الاختبار");
      }
    } catch {
      toastError("حدث خطأ أثناء حذف الاختبار");
    } finally {
      setIsActionLoading(false);
      setDeleteExamId(null);
    }
  };

  const handleSaveClose = async (exam: ExamItem) => {
    const draft = closeDrafts[exam.id] ?? {
      enableAutoClose: exam.enableAutoClose,
      closeAt: toDatetimeLocal(exam.closeAt),
    };
    setIsActionLoading(true);
    try {
      const res = await fetch("/api/admin/teacher/exam-dashboard", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          quizId: exam.id,
          enableAutoClose: draft.enableAutoClose,
          closeAt: draft.enableAutoClose ? draft.closeAt : null,
        }),
      });
      const d = await res.json();
      if (res.ok) {
        toastSuccess("تم حفظ وقت الإغلاق");
        void fetchDashboardData();
      } else {
        toastError(d.error || "تعذر حفظ وقت الإغلاق");
      }
    } catch {
      toastError("حدث خطأ أثناء حفظ وقت الإغلاق");
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleAllowRetakes = async (quizId: string) => {
    setIsActionLoading(true);
    try {
      const res = await fetch("/api/admin/teacher/exam-dashboard", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quizId, action: "allow_all_retakes" }),
      });
      const d = await res.json();
      if (res.ok) {
        toastSuccess(`تم السماح بالإعادة لـ ${d.updatedCount} طالب — المحاولة القديمة تبقى ظاهرة حتى يضغط الطالب «بدء محاولة جديدة»`);
        void fetchDashboardData();
      } else {
        toastError(d.error || "تعذر تفعيل إعادة الاختبار");
      }
    } catch {
      toastError("فشل تفعيل الإعادة");
    } finally {
      setIsActionLoading(false);
    }
  };

  // Extract list of unique courses for dropdown filter
  const coursesList = Array.from(
    new Map(exams.map((e) => [e.courseId, e.courseTitle])).entries()
  );

  const filteredExams = exams.filter((e) => {
    const matchesSearch =
      e.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      e.folderName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      e.courseTitle.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesSearch;
  });

  return (
    <div className="space-y-6">
      {/* ── HEADER BANNER ── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-[var(--surface)] p-6 rounded-2xl border border-[var(--border)] shadow-xs">
        <div>
          <h2 className="text-xl font-black text-[var(--ink)] flex items-center gap-2">
            <span>📊 لوحة إدارة ومتابعة الاختبارات</span>
          </h2>
          <p className="text-xs text-[var(--ink-muted)] mt-1">
            إحصائيات شاملة لإجابات الطلاب، تصحيح الأسئلة المقالية، ومتابعة نواتج التعلم عبر جميع كورساتك.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {onNavigateToEssayGrading && (
            <button
              onClick={onNavigateToEssayGrading}
              className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold transition-all shadow-sm flex items-center gap-1.5"
            >
              <span>📝 تصحيح المقالي</span>
              {stats.totalPendingEssays > 0 && (
                <span className="bg-amber-400 text-slate-950 px-2 py-0.5 rounded-full text-[10px] font-black">
                  {stats.totalPendingEssays}
                </span>
              )}
            </button>
          )}

          {onNavigateToCreateQuiz && (
            <button
              onClick={onNavigateToCreateQuiz}
              className="px-4 py-2 rounded-xl bg-sky-500 hover:bg-sky-400 text-white text-xs font-bold transition-all shadow-sm flex items-center gap-1.5"
            >
              <span>➕ إنشاء اختبار جديد</span>
            </button>
          )}
        </div>
      </div>

      {/* ── STATS CARDS ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-[var(--surface)] p-5 rounded-2xl border border-[var(--border)] space-y-1">
          <p className="text-xs font-bold text-[var(--ink-muted)]">إجمالي الاختبارات</p>
          <p className="text-2xl font-black text-sky-500">{stats.totalExams}</p>
          <p className="text-[10px] text-[var(--ink-muted)]">اختبار مفعل في كافة المحاضرات</p>
        </div>

        <div className="bg-[var(--surface)] p-5 rounded-2xl border border-[var(--border)] space-y-1">
          <p className="text-xs font-bold text-[var(--ink-muted)]">محاولات الطلاب</p>
          <p className="text-2xl font-black text-indigo-500">{stats.totalAttempts}</p>
          <p className="text-[10px] text-[var(--ink-muted)]">إجمالي تسليمات الطلاب للاختبارات</p>
        </div>

        <div className="bg-[var(--surface)] p-5 rounded-2xl border border-[var(--border)] space-y-1">
          <p className="text-xs font-bold text-[var(--ink-muted)]">متوسط درجات الطلاب</p>
          <p className="text-2xl font-black text-emerald-500">{stats.overallAvgScore}%</p>
          <p className="text-[10px] text-[var(--ink-muted)]">مستوى الأداء العام للطلاب</p>
        </div>

        <div className="bg-[var(--surface)] p-5 rounded-2xl border border-[var(--border)] space-y-1">
          <p className="text-xs font-bold text-[var(--ink-muted)]">مقالي قيد التصحيح</p>
          <p className="text-2xl font-black text-amber-500">{stats.totalPendingEssays}</p>
          <p className="text-[10px] text-[var(--ink-muted)]">إجابات بانتظار تصحيح المعلم</p>
        </div>
      </div>

      {/* ── FILTERS & SEARCH BAR ── */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-[var(--surface)] p-4 rounded-2xl border border-[var(--border)]">
        <div className="flex-1 min-w-[240px]">
          <input
            type="text"
            placeholder="ابحث باسم الاختبار، المحاضرة، أو الكورس..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-[var(--bg)] border border-[var(--border)] text-[var(--ink)] px-4 py-2 rounded-xl text-xs focus:outline-none focus:border-sky-500"
          />
        </div>

        {coursesList.length > 0 && (
          <div className="shrink-0">
            <select
              value={selectedCourseId}
              onChange={(e) => setSelectedCourseId(e.target.value)}
              className="bg-[var(--bg)] border border-[var(--border)] text-[var(--ink)] px-3 py-2 rounded-xl text-xs font-bold focus:outline-none focus:border-sky-500"
            >
              <option value="all">جميع الكورسات ({coursesList.length})</option>
              {coursesList.map(([id, title]) => (
                <option key={id} value={id}>
                  {title}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* ── EXAMS LIST ── */}
      {loading ? (
        <div className="p-12 text-center text-sm text-[var(--ink-muted)]">
          <span className="inline-block w-6 h-6 border-2 border-sky-500/30 border-t-sky-500 rounded-full animate-spin me-2 align-middle" />
          جارٍ تحميل جدول الاختبارات الإحصائي...
        </div>
      ) : filteredExams.length === 0 ? (
        <div className="bg-[var(--surface)] p-12 rounded-2xl border border-[var(--border)] text-center text-[var(--ink-muted)] space-y-2">
          <p className="text-3xl">📋</p>
          <p className="font-bold text-[var(--ink)]">لا توجد اختبارات مضافة</p>
          <p className="text-xs">قم بإضافة اختبارات داخل محاضرات الكورس لتبدأ متابعة نتائج الطلاب هنا.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredExams.map((exam) => {
            const passRate =
              exam.totalAttempts > 0
                ? Math.round((exam.passedCount / exam.totalAttempts) * 100)
                : 0;

            return (
              <div
                key={exam.id}
                className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-5 space-y-4 transition-all hover:border-sky-500/30"
              >
                {/* Header */}
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)]/60 pb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-sky-500/10 text-sky-500 flex items-center justify-center font-black text-sm shrink-0">
                      📋
                    </div>
                    <div>
                      <h3 className="font-bold text-sm text-[var(--ink)]">{exam.title}</h3>
                      <p className="text-xs text-[var(--ink-muted)]">
                        {exam.courseTitle} · محاضرة ({exam.folderName})
                      </p>
                    </div>
                  </div>

                  {/* Question badges */}
                  <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-bold">
                    <span className="bg-sky-500/10 text-sky-500 px-2.5 py-1 rounded-lg">
                      {exam.totalQuestions} سؤال
                    </span>
                    {exam.mcqCount > 0 && (
                      <span className="bg-blue-500/10 text-blue-500 px-2.5 py-1 rounded-lg">
                        {exam.mcqCount} MCQ
                      </span>
                    )}
                    {exam.essayCount > 0 && (
                      <span className="bg-purple-500/10 text-purple-500 px-2.5 py-1 rounded-lg">
                        {exam.essayCount} مقالي
                      </span>
                    )}
                    {exam.imagesCount > 0 && (
                      <span className="bg-emerald-500/10 text-emerald-500 px-2.5 py-1 rounded-lg">
                        🖼️ {exam.imagesCount} صور
                      </span>
                    )}
                    <span className="bg-[var(--bg)] border border-[var(--border)] px-2.5 py-1 rounded-lg text-[var(--ink-muted)]">
                      ⏱ {exam.timeLimitMinutes} دقيقة
                    </span>
                  </div>
                </div>

                {/* Performance Metrics */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-[var(--bg)] p-3.5 rounded-xl border border-[var(--border)] text-xs">
                  <div>
                    <span className="text-[var(--ink-muted)] block text-[10px]">عدد المحاولات:</span>
                    <strong className="text-[var(--ink)]">{exam.totalAttempts} طالب</strong>
                  </div>

                  <div>
                    <span className="text-[var(--ink-muted)] block text-[10px]">متوسط الدرجة:</span>
                    <strong className="text-emerald-500">{exam.avgScore}%</strong>
                  </div>

                  <div>
                    <span className="text-[var(--ink-muted)] block text-[10px]">نسبة النجاح (≥50%):</span>
                    <strong className="text-sky-500">{passRate}% ({exam.passedCount} طالب)</strong>
                  </div>

                  <div>
                    <span className="text-[var(--ink-muted)] block text-[10px]">إجابات مقالية معلقة:</span>
                    <strong className={exam.pendingEssayCount > 0 ? "text-amber-500 font-bold" : "text-[var(--ink-muted)]"}>
                      {exam.pendingEssayCount} إجابة
                    </strong>
                  </div>
                </div>

                {/* Action Controls */}
                <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    {onNavigateToResults && (
                      <button
                        onClick={() => onNavigateToResults(exam.id)}
                        className="px-3.5 py-1.5 rounded-xl bg-sky-500/10 hover:bg-sky-500/20 text-sky-500 text-xs font-bold transition-all flex items-center gap-1"
                      >
                        <span>📊 نتائج الطلاب</span>
                      </button>
                    )}

                    {exam.pendingEssayCount > 0 && onNavigateToEssayGrading && (
                      <button
                        onClick={onNavigateToEssayGrading}
                        className="px-3.5 py-1.5 rounded-xl bg-purple-500/15 hover:bg-purple-500/25 text-purple-600 dark:text-purple-300 text-xs font-bold transition-all flex items-center gap-1"
                      >
                        <span>📝 تصحيح الإجابات المعلقة ({exam.pendingEssayCount})</span>
                      </button>
                    )}

                    <button
                      onClick={() => handleAllowRetakes(exam.id)}
                      disabled={isActionLoading || exam.totalAttempts === 0}
                      className="px-3 py-1.5 rounded-xl border border-[var(--border)] hover:bg-[var(--bg)] text-[var(--ink-muted)] hover:text-[var(--ink)] text-xs font-bold transition-all disabled:opacity-40"
                    >
                      <span>🔄 السماح بالإعادة للكل</span>
                    </button>
                  </div>

                  <button
                    onClick={() => setDeleteExamId(exam.id)}
                    disabled={isActionLoading}
                    className="px-3 py-1.5 rounded-xl text-[var(--error)] hover:bg-[var(--error)]/10 text-xs font-bold transition-all flex items-center gap-1"
                  >
                    <IconTrash className="w-3.5 h-3.5" />
                    <span>حذف الاختبار</span>
                  </button>
                </div>

                <div className="rounded-xl border border-rose-400/30 bg-rose-500/5 p-3 space-y-2">
                  <label className="flex items-center gap-2 text-xs font-bold text-[var(--ink)]">
                    <input
                      type="checkbox"
                      checked={(closeDrafts[exam.id]?.enableAutoClose ?? exam.enableAutoClose) === true}
                      onChange={(e) =>
                        setCloseDrafts((prev) => ({
                          ...prev,
                          [exam.id]: {
                            enableAutoClose: e.target.checked,
                            closeAt: prev[exam.id]?.closeAt ?? toDatetimeLocal(exam.closeAt),
                          },
                        }))
                      }
                      className="w-4 h-4 rounded"
                    />
                    إغلاق تلقائي بعد الوقت المحدد
                  </label>
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      type="datetime-local"
                      value={closeDrafts[exam.id]?.closeAt ?? toDatetimeLocal(exam.closeAt)}
                      disabled={!(closeDrafts[exam.id]?.enableAutoClose ?? exam.enableAutoClose)}
                      onChange={(e) =>
                        setCloseDrafts((prev) => ({
                          ...prev,
                          [exam.id]: {
                            enableAutoClose: prev[exam.id]?.enableAutoClose ?? exam.enableAutoClose,
                            closeAt: e.target.value,
                          },
                        }))
                      }
                      className="bg-[var(--bg)] border border-[var(--border)] text-[var(--ink)] px-3 py-1.5 rounded-xl text-xs font-mono"
                      dir="ltr"
                    />
                    <button
                      type="button"
                      onClick={() => handleSaveClose(exam)}
                      disabled={isActionLoading}
                      className="px-3 py-1.5 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 text-rose-600 dark:text-rose-300 text-xs font-bold"
                    >
                      حفظ وقت الإغلاق
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteExamId && (
        <ConfirmDialog
          open={Boolean(deleteExamId)}
          title="حذف الاختبار"
          message="هل أنت تأكد من حذف هذا الاختبار نهائياً؟ سيتم حذف جميع أسئلة ونتائج الطلاب المرتبطة به ولا يمكن الاستعادة."
          confirmLabel="حذف نهائي"
          cancelLabel="إلغاء"
          danger
          onConfirm={handleDeleteExam}
          onCancel={() => setDeleteExamId(null)}
        />
      )}
    </div>
  );
}
