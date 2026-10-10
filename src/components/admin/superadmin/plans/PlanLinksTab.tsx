"use client";

import { useState, useEffect } from "react";
import { useToast } from "@/components/ui/Toast";
import { admConfirm } from "@/components/admin/ui/kit";

export function PlanLinksTab({ planId }: { planId: string }) {
  const { success, error: toastError } = useToast();
  const [links, setLinks] = useState<any[]>([]);
  const [courses, setCourses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Form State
  const [formData, setFormData] = useState({
    courseId: "",
    folderId: "",
    startIndex: "",
    endIndex: ""
  });

  const fetchData = async () => {
    setLoading(true);
    try {
      const [linksRes, coursesRes] = await Promise.all([
        fetch(`/api/admin/superadmin/plans/${planId}/course-links`),
        fetch("/api/admin/superadmin/courses")
      ]);

      const linksData = await linksRes.json();
      const coursesData = await coursesRes.json();

      if (linksRes.ok) setLinks(linksData.links || []);
      if (coursesRes.ok) setCourses(coursesData.courses || []);
    } catch (err) {
      toastError("تعذر جلب البيانات");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [planId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.courseId) {
      toastError("يرجى اختيار الدورة");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`/api/admin/superadmin/plans/${planId}/course-links`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          courseId: formData.courseId,
          folderId: formData.folderId.trim() || null,
          startIndex: formData.startIndex !== "" ? Number(formData.startIndex) : null,
          endIndex: formData.endIndex !== "" ? Number(formData.endIndex) : null,
        })
      });

      const data = await res.json();
      if (res.ok) {
        success("تم ربط الدورة بنجاح وجاري مزامنة الفيديوهات");
        setFormData({ courseId: "", folderId: "", startIndex: "", endIndex: "" });
        fetchData();
      } else {
        toastError(data.error || "فشل ربط الدورة");
      }
    } catch {
      toastError("حدث خطأ أثناء ربط الدورة");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (linkId: string) => {
    if (!(await admConfirm({ title: "حذف ارتباط الكورس؟", text: "تبقى الفيديوهات الحالية، لكن الفيديوهات الجديدة في الكورس لن تُضاف للخطة.", confirmLabel: "حذف الارتباط", danger: true }))) {
      return;
    }

    try {
      const res = await fetch(`/api/admin/superadmin/plans/${planId}/course-links/${linkId}`, {
        method: "DELETE"
      });
      if (res.ok) {
        success("تم حذف الارتباط بنجاح");
        fetchData();
      } else {
        const data = await res.json().catch(() => ({}));
        toastError(data.error || "فشل الحذف");
      }
    } catch {
      toastError("حدث خطأ أثناء الحذف");
    }
  };

  if (loading) return <div className="text-center py-10">جاري التحميل...</div>;

  return (
    <div className="space-y-6" dir="rtl">
      {/* Link Form */}
      <form onSubmit={handleSubmit} className="p-5 border rounded-2xl bg-[var(--surface-2)] space-y-4" style={{ borderColor: "var(--border)" }}>
        <h4 className="font-bold text-base text-[var(--ink)]">ربط دورة جديدة بالخطة</h4>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-bold mb-1 text-[var(--ink)]">الدورة الدراسية</label>
            <select
              value={formData.courseId}
              onChange={e => setFormData({ ...formData, courseId: e.target.value })}
              className="w-full p-2 border rounded bg-[var(--surface)] text-[var(--ink)] text-sm"
              style={{ borderColor: "var(--border)" }}
              required
            >
              <option value="">-- اختر الدورة --</option>
              {courses.map(c => (
                <option key={c.id} value={c.id}>
                  {c.title} ({c.teacher?.name || "معلم غير معروف"})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold mb-1 text-[var(--ink)]">معرف المجلد (اختياري - للمزامنة من مجلد محدد)</label>
            <input
              type="text"
              placeholder="مثال: clq12345..."
              value={formData.folderId}
              onChange={e => setFormData({ ...formData, folderId: e.target.value })}
              className="w-full p-2 border rounded bg-[var(--surface)] text-[var(--ink)] text-sm"
              style={{ borderColor: "var(--border)" }}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-bold mb-1 text-[var(--ink)]">فهرس البداية (اختياري)</label>
            <input
              type="number"
              min="0"
              placeholder="مثال: 0"
              value={formData.startIndex}
              onChange={e => setFormData({ ...formData, startIndex: e.target.value })}
              className="w-full p-2 border rounded bg-[var(--surface)] text-[var(--ink)] text-sm"
              style={{ borderColor: "var(--border)" }}
            />
          </div>

          <div>
            <label className="block text-xs font-bold mb-1 text-[var(--ink)]">فهرس النهاية (اختياري)</label>
            <input
              type="number"
              min="0"
              placeholder="مثال: 5"
              value={formData.endIndex}
              onChange={e => setFormData({ ...formData, endIndex: e.target.value })}
              className="w-full p-2 border rounded bg-[var(--surface)] text-[var(--ink)] text-sm"
              style={{ borderColor: "var(--border)" }}
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="px-5 py-2 bg-[var(--brand)] hover:bg-[var(--brand-strong)] text-[var(--on-brand)] font-bold rounded-xl text-sm border-none cursor-pointer disabled:opacity-50"
        >
          {submitting ? "جاري الحفظ والربط..." : "ربط الدورة الآن"}
        </button>
      </form>

      {/* Linked Courses List */}
      <div className="space-y-4">
        <h4 className="font-bold text-base text-[var(--ink)]">الدورات المرتبطة حالياً ({links.length})</h4>
        
        {links.length === 0 ? (
          <div className="text-center py-10 text-[var(--ink-3)] bg-[var(--surface-2)] rounded-xl border border-dashed" style={{ borderColor: "var(--border)" }}>
            لا توجد دورات مرتبطة بهذه الخطة بعد.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-right text-sm border-collapse">
              <thead>
                <tr className="border-b" style={{ borderColor: "var(--border)" }}>
                  <th className="pb-3 pt-2 font-bold text-[var(--ink)]">الدورة</th>
                  <th className="pb-3 pt-2 font-bold text-[var(--ink)]">المعلم</th>
                  <th className="pb-3 pt-2 font-bold text-[var(--ink)]">التصفية / التقسيم</th>
                  <th className="pb-3 pt-2 font-bold text-[var(--ink)]">الإجراءات</th>
                </tr>
              </thead>
              <tbody>
                {links.map(link => (
                  <tr key={link.id} className="border-b hover:bg-[var(--adm-hover)]" style={{ borderColor: "var(--border)" }}>
                    <td className="py-3 font-semibold text-[var(--ink)]">{link.course?.title}</td>
                    <td className="py-3 text-[var(--ink-2)]">{link.course?.teacher?.name || "—"}</td>
                    <td className="py-3 text-[var(--ink-2)] text-xs">
                      {link.folderId ? `مجلد: ${link.folderId}` : "كل المجلدات"}
                      {link.startIndex !== null || link.endIndex !== null ? (
                        <span className="mr-2 bg-[var(--surface-2)] px-1.5 py-0.5 rounded text-xs">
                          الفهارس: [{link.startIndex ?? 0} إلى {link.endIndex ?? "نهاية"}]
                        </span>
                      ) : null}
                    </td>
                    <td className="py-3">
                      <button
                        onClick={() => handleDelete(link.id)}
                        className="text-[var(--danger)] hover:text-[var(--danger)] bg-transparent border-none cursor-pointer font-bold text-xs"
                      >
                        حذف الارتباط
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
  );
}
