"use client";

import { useState, useEffect } from "react";
import { useToast } from "@/components/ui/Toast";
import { admConfirm, admPrompt } from "@/components/admin/ui/kit";

export function PlanLessonsTab({ planId }: { planId: string }) {
  const { success, error: toastError } = useToast();
  const [lessons, setLessons] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [newLesson, setNewLesson] = useState({
    title: "",
    gatesNextLesson: true,
    requiresQuiz: false,
    requiresHomework: false,
    hasProject: false,
  });
  const [submitting, setSubmitting] = useState(false);

  const fetchLessons = () => {
    setLoading(true);
    fetch(`/api/admin/superadmin/plans/${planId}/lessons`)
      .then(r => r.json())
      .then(data => {
        if (data.lessons) setLessons(data.lessons);
      })
      .catch(() => toastError("تعذر جلب الدروس"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchLessons();
  }, [planId]);

  const handleAddLesson = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newLesson.title.trim()) {
      toastError("عنوان الدرس مطلوب");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/admin/superadmin/plans/${planId}/lessons`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newLesson),
      });
      const data = await res.json();
      if (res.ok) {
        success(`تم إضافة الدرس "${newLesson.title}" بنجاح`);
        setNewLesson({ title: "", gatesNextLesson: true, requiresQuiz: false, requiresHomework: false, hasProject: false });
        setShowAddModal(false);
        fetchLessons();
      } else {
        toastError(data.error || "فشل إضافة الدرس");
      }
    } catch {
      toastError("حدث خطأ أثناء إضافة الدرس");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteLesson = async (lesson: any) => {
    const hasProgress = lesson._count?.progress > 0;
    const confirmed = await admConfirm({
      title: `حذف الدرس "${lesson.title}"؟`,
      text: hasProgress ? "يوجد تقدم مسجل لطلاب في هذا الدرس، وسيتطلب الحذف كلمة مرور الحماية." : undefined,
      confirmLabel: "حذف الدرس",
      danger: true,
    });
    if (!confirmed) return;

    setDeletingId(lesson.id);
    try {
      const res = await fetch(`/api/admin/superadmin/plans/${planId}/lessons/${lesson.id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (res.ok) {
        success("تم حذف الدرس بنجاح");
        fetchLessons();
      } else if (data.code === "PASSWORD_REQUIRED") {
        const pw = await admPrompt({ title: "كلمة مرور الحماية", text: "هذا الدرس فيه تقدم طلاب. أدخل كلمة مرور الحماية لتأكيد الحذف.", inputLabel: "كلمة المرور", inputType: "password", confirmLabel: "حذف الدرس" });
        if (!pw) return;
        const res2 = await fetch(`/api/admin/superadmin/plans/${planId}/lessons/${lesson.id}`, {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ actionPassword: pw }),
        });
        const data2 = await res2.json();
        if (res2.ok) {
          success("تم حذف الدرس بنجاح");
          fetchLessons();
        } else {
          toastError(data2.error || "فشل الحذف");
        }
      } else {
        toastError(data.error || "فشل حذف الدرس");
      }
    } catch {
      toastError("حدث خطأ أثناء الحذف");
    } finally {
      setDeletingId(null);
    }
  };

  if (loading) return <div className="text-center py-10 text-[var(--ink-2)]">جاري التحميل...</div>;

  return (
    <div className="space-y-4" dir="rtl">
      <div className="flex justify-between items-center mb-4">
        <h3 className="font-bold text-lg text-[var(--ink)]">الدروس ({lessons.length})</h3>
        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-1.5 bg-[var(--brand)] hover:bg-[var(--brand-strong)] text-[var(--on-brand)] px-4 py-2 rounded-xl text-sm font-bold border-none cursor-pointer transition-colors"
        >
          <span className="text-lg leading-none">+</span>
          إضافة درس جديد
        </button>
      </div>

      {lessons.length === 0 ? (
        <div className="text-center py-16 rounded-xl border border-dashed" style={{ borderColor: "var(--border)", color: "var(--ink-3)" }}>
          <div className="text-4xl mb-3">📚</div>
          <div className="font-bold mb-1">لا توجد دروس بعد</div>
          <div className="text-sm">ابدأ بإضافة أول درس لهذه الخطة الدراسية</div>
        </div>
      ) : (
        <ol className="space-y-3">
          {lessons.map((lesson, idx) => (
            <li
              key={lesson.id}
              className="p-4 rounded-xl flex justify-between items-start gap-4"
              style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}
            >
              <div className="flex gap-4 flex-1 min-w-0">
                <span className="w-8 h-8 rounded-full bg-[var(--info-soft)] text-[var(--info)] font-black text-sm flex items-center justify-center flex-shrink-0 mt-0.5">
                  {idx + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-[var(--ink)] mb-1">{lesson.title}</div>
                  <div className="flex flex-wrap gap-1.5 text-xs">
                    {lesson.gatesNextLesson && (
                      <span className="bg-[var(--surface-2)] text-[var(--ink-2)] px-2 py-0.5 rounded-full font-semibold">
                        يقفل الدرس التالي
                      </span>
                    )}
                    {lesson.requiresQuiz && (
                      <span className="bg-[var(--warn-soft)] text-[var(--warn)] px-2 py-0.5 rounded-full font-semibold">اختبار مطلوب</span>
                    )}
                    {lesson.requiresHomework && (
                      <span className="bg-[var(--info-soft)] text-[var(--info)] px-2 py-0.5 rounded-full font-semibold">واجب مطلوب</span>
                    )}
                    {lesson.hasProject && (
                      <span className="bg-[color-mix(in_srgb,var(--violet)_12%,transparent)] text-[var(--violet)] px-2 py-0.5 rounded-full font-semibold">مشروع AI</span>
                    )}
                  </div>
                  {/* Sources preview */}
                  {lesson.sources && lesson.sources.length > 0 && (
                    <div className="mt-2 text-xs text-[var(--ink-3)]">
                      <span className="font-semibold">المصادر: </span>
                      {lesson.sources.map((s: any) => (
                        <span
                          key={s.id}
                          className={`inline-block mr-2 px-1.5 py-0.5 rounded ${s.isDefault ? "bg-[var(--ok-soft)] text-[var(--ok)] font-bold" : "bg-[var(--surface-2)] text-[var(--ink-3)]"}`}
                        >
                          {s.video?.title || "فيديو"}{s.isDefault ? " ✓" : ""}
                        </span>
                      ))}
                    </div>
                  )}
                  {lesson.quizzes && lesson.quizzes.length > 0 && (
                    <div className="mt-1 text-xs text-[var(--ink-3)]">
                      <span className="font-semibold">الاختبارات: </span>
                      {lesson.quizzes.map((q: any) => (
                        <span key={q.id} className="inline-block mr-2 bg-[var(--warn-soft)] text-[var(--warn)] px-1.5 py-0.5 rounded">
                          {q.title}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <button
                onClick={() => handleDeleteLesson(lesson)}
                disabled={deletingId === lesson.id}
                className="text-[var(--danger)] hover:text-[var(--danger)] bg-transparent border-none cursor-pointer font-bold text-xs px-2 py-1 rounded transition-colors disabled:opacity-50 flex-shrink-0"
              >
                {deletingId === lesson.id ? "جاري..." : "حذف"}
              </button>
            </li>
          ))}
        </ol>
      )}

      {/* Add Lesson Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="w-full max-w-md bg-[var(--surface)] border border-[var(--border)] rounded-2xl shadow-2xl overflow-hidden">
            <div className="p-5 border-b border-[var(--border)] flex justify-between items-center">
              <h3 className="text-base font-black text-[var(--ink)]">إضافة درس جديد</h3>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-[var(--ink-2)] hover:text-[var(--ink-2)] bg-transparent border-none cursor-pointer text-xl font-bold leading-none"
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleAddLesson} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-bold mb-1 text-[var(--ink)]">عنوان الدرس</label>
                <input
                  type="text"
                  value={newLesson.title}
                  onChange={e => setNewLesson({ ...newLesson, title: e.target.value })}
                  placeholder="مثال: الدرس الأول — المقدمة"
                  className="w-full p-2 border rounded bg-[var(--surface-2)] text-[var(--ink)] text-sm"
                  style={{ borderColor: "var(--border)" }}
                  required
                  autoFocus
                />
              </div>

              <div className="space-y-2 pt-1">
                <p className="text-xs font-bold text-[var(--ink-2)] uppercase tracking-wide">خيارات بوابات التقدم</p>

                <label className="flex items-center gap-2 text-sm font-semibold text-[var(--ink)] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={newLesson.gatesNextLesson}
                    onChange={e => setNewLesson({ ...newLesson, gatesNextLesson: e.target.checked })}
                    className="w-4 h-4"
                  />
                  يجب إكماله قبل الانتقال للدرس التالي (بوابة)
                </label>

                <label className="flex items-center gap-2 text-sm font-semibold text-[var(--ink)] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={newLesson.requiresQuiz}
                    onChange={e => setNewLesson({ ...newLesson, requiresQuiz: e.target.checked })}
                    className="w-4 h-4"
                  />
                  يتطلب اجتياز اختبار (Quiz)
                </label>

                <label className="flex items-center gap-2 text-sm font-semibold text-[var(--ink)] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={newLesson.requiresHomework}
                    onChange={e => setNewLesson({ ...newLesson, requiresHomework: e.target.checked })}
                    className="w-4 h-4"
                  />
                  يتطلب تسليم واجب (Homework)
                </label>

                <label className="flex items-center gap-2 text-sm font-semibold text-[var(--ink)] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={newLesson.hasProject}
                    onChange={e => setNewLesson({ ...newLesson, hasProject: e.target.checked })}
                    className="w-4 h-4"
                  />
                  يحتوي على مشروع AI للتقييم
                </label>
              </div>

              <div className="flex gap-3 pt-3 border-t border-[var(--border)]">
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 py-2 bg-[var(--brand)] hover:bg-[var(--brand-strong)] text-[var(--on-brand)] font-bold rounded-xl text-sm border-none cursor-pointer disabled:opacity-50 transition-colors"
                >
                  {submitting ? "جاري الإضافة..." : "إضافة الدرس"}
                </button>
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="flex-1 py-2 bg-[var(--surface-2)] hover:bg-[var(--adm-hover)] text-[var(--ink-2)] font-bold rounded-xl text-sm border-none cursor-pointer"
                >
                  إلغاء
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
