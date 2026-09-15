"use client";

import React, { useEffect, useState, useMemo } from "react";
import {
  X,
  Search,
  RefreshCw,
  UserCheck,
  UserX,
  Phone,
  Mail,
  Calendar,
  Eye,
  ShieldAlert,
  AlertTriangle,
  Copy,
  Check,
  LogOut,
  ExternalLink,
} from "lucide-react";

interface EnrollmentSource {
  type: "DIRECT_ENROLLMENT" | "ACCESS_CODE" | "TEACHER_SUBSCRIPTION";
  label: string;
  code?: string;
  amount?: number;
  date: string;
}

interface EnrolledStudent {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  parentPhone: string | null;
  educationalStage: string | null;
  lastActive: string | null;
  firstEnrolledAt: string;
  watchCount: number;
  isExcluded: boolean;
  sources: EnrollmentSource[];
}

interface CourseStudentsModalProps {
  courseId: string;
  courseTitle: string;
  teacherName: string;
  isOpen: boolean;
  onClose: () => void;
  onStudentCountChanged?: (courseId: string, newActiveCount: number) => void;
}

export function CourseStudentsModal({
  courseId,
  courseTitle,
  teacherName,
  isOpen,
  onClose,
  onStudentCountChanged,
}: CourseStudentsModalProps) {
  const [loading, setLoading] = useState(true);
  const [students, setStudents] = useState<EnrolledStudent[]>([]);
  const [activeCount, setActiveCount] = useState(0);
  const [excludedCount, setExcludedCount] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "active" | "excluded">("all");

  // Sign out confirmation modal state
  const [targetStudent, setTargetStudent] = useState<EnrolledStudent | null>(null);
  const [revokeSession, setRevokeSession] = useState(true);
  const [actionSubmitting, setActionSubmitting] = useState(false);
  const [toastMessage, setToastMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const fetchStudents = async () => {
    if (!courseId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/superadmin/courses/${courseId}/students`, {
        credentials: "include",
      });
      const data = await res.json();
      if (res.ok && data.students) {
        setStudents(data.students);
        setActiveCount(data.activeCount ?? data.students.filter((s: EnrolledStudent) => !s.isExcluded).length);
        setExcludedCount(data.excludedCount ?? data.students.filter((s: EnrolledStudent) => s.isExcluded).length);
      } else {
        setToastMessage({ type: "error", text: data.error || "تعذر جلب قائمة الطلاب" });
      }
    } catch (err) {
      setToastMessage({ type: "error", text: "حدث خطأ أثناء الاتصال بالخادم" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && courseId) {
      fetchStudents();
      setSearchQuery("");
      setFilter("all");
      setTargetStudent(null);
      setToastMessage(null);
    }
  }, [isOpen, courseId]);

  // Copy phone handler
  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Execute silent sign out / unenroll
  const handleConfirmSignOut = async () => {
    if (!targetStudent) return;
    setActionSubmitting(true);
    setToastMessage(null);
    try {
      const res = await fetch(`/api/admin/superadmin/courses/${courseId}/students`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          studentId: targetStudent.id,
          revokeSession,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setToastMessage({ type: "success", text: data.message });
        // Update local student status
        setStudents((prev) =>
          prev.map((s) => (s.id === targetStudent.id ? { ...s, isExcluded: true } : s))
        );
        setActiveCount((prev) => {
          const next = Math.max(0, prev - 1);
          if (onStudentCountChanged) onStudentCountChanged(courseId, next);
          return next;
        });
        setExcludedCount((prev) => prev + 1);
        setTargetStudent(null);
      } else {
        setToastMessage({ type: "error", text: data.error || "فشل إخراج الطالب من الكورس" });
      }
    } catch (err) {
      setToastMessage({ type: "error", text: "فشل الاتصال بالخادم أثناء تنفيذ الإجراء" });
    } finally {
      setActionSubmitting(false);
    }
  };

  // Restore student access handler
  const handleRestoreStudent = async (student: EnrolledStudent) => {
    setActionSubmitting(true);
    setToastMessage(null);
    try {
      const res = await fetch(`/api/admin/superadmin/courses/${courseId}/students`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          studentId: student.id,
          action: "restore",
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setToastMessage({ type: "success", text: data.message });
        setStudents((prev) =>
          prev.map((s) => (s.id === student.id ? { ...s, isExcluded: false } : s))
        );
        setActiveCount((prev) => {
          const next = prev + 1;
          if (onStudentCountChanged) onStudentCountChanged(courseId, next);
          return next;
        });
        setExcludedCount((prev) => Math.max(0, prev - 1));
      } else {
        setToastMessage({ type: "error", text: data.error || "تعذر إعادة إتاحة الكورس" });
      }
    } catch (err) {
      setToastMessage({ type: "error", text: "فشل الاتصال بالخادم" });
    } finally {
      setActionSubmitting(false);
    }
  };

  // Filter & Search Logic
  const filteredStudents = useMemo(() => {
    let list = students;
    if (filter === "active") list = list.filter((s) => !s.isExcluded);
    if (filter === "excluded") list = list.filter((s) => s.isExcluded);

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          s.email.toLowerCase().includes(q) ||
          (s.phone && s.phone.includes(q)) ||
          (s.parentPhone && s.parentPhone.includes(q)) ||
          (s.educationalStage && s.educationalStage.toLowerCase().includes(q)) ||
          s.sources.some((src) => src.label.toLowerCase().includes(q) || (src.code && src.code.toLowerCase().includes(q)))
      );
    }
    return list;
  }, [students, filter, searchQuery]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200"
      dir="rtl"
    >
      <div
        className="relative w-full max-w-5xl max-h-[92vh] flex flex-col rounded-2xl shadow-2xl overflow-hidden border border-slate-700/60"
        style={{ background: "var(--surface, #111827)", color: "var(--ink, #f8fafc)" }}
      >
        {/* Modal Header */}
        <div className="p-4 sm:p-5 border-b border-slate-700/60 flex flex-wrap items-center justify-between gap-3 bg-slate-900/70 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/20 text-indigo-400 flex items-center justify-center text-xl font-bold border border-indigo-500/30">
              👥
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-black text-base sm:text-lg text-white font-head">
                  الطلاب المسجلون في الكورس
                </h3>
                <span className="px-2 py-0.5 rounded-full text-xs font-black bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                  {activeCount} نشط
                </span>
                {excludedCount > 0 && (
                  <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30">
                    {excludedCount} تم إخراجهم
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-300 mt-0.5 flex flex-wrap items-center gap-x-2">
                <span className="text-amber-300 font-bold">«{courseTitle}»</span>
                <span>·</span>
                <span className="text-sky-300">المعلم: {teacherName}</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={fetchStudents}
              disabled={loading}
              className="p-2 rounded-xl text-slate-300 hover:text-white bg-slate-800/60 hover:bg-slate-700/80 border border-slate-700/60 transition-all cursor-pointer disabled:opacity-50"
              title="تحديث قائمة الطلاب"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin text-indigo-400" : ""}`} />
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-xl text-slate-400 hover:text-white bg-slate-800/60 hover:bg-rose-500/20 hover:text-rose-300 border border-slate-700/60 transition-all cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Informative Security & Stealth Badge */}
        <div className="px-4 py-2 bg-gradient-to-r from-emerald-950/40 via-sky-950/30 to-indigo-950/40 border-b border-slate-800/80 flex flex-wrap items-center justify-between text-[11px] text-slate-300 gap-2 shrink-0">
          <div className="flex items-center gap-1.5 text-emerald-400 font-medium">
            <ShieldAlert className="w-3.5 h-3.5 shrink-0" />
            <span>
              نظام الفلترة الدقيق: تم استبعاد المشرف العام (Superadmin)، معاينة المعلم (Teacher Preview)، والحسابات التجريبية تلقائياً من العد والإحصاءات.
            </span>
          </div>
          <span className="text-slate-400 text-[10px]">
            الإخراج صامت 100% ولا يرسل أي تنبيه أو إشعار للمعلم
          </span>
        </div>

        {/* Toast Alert */}
        {toastMessage && (
          <div
            className={`px-4 py-2.5 text-xs font-bold flex items-center justify-between transition-all border-b ${
              toastMessage.type === "success"
                ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30"
                : "bg-rose-500/15 text-rose-300 border-rose-500/30"
            }`}
          >
            <div className="flex items-center gap-2">
              <span>{toastMessage.type === "success" ? "✅" : "⚠️"}</span>
              <span>{toastMessage.text}</span>
            </div>
            <button
              onClick={() => setToastMessage(null)}
              className="text-xs hover:underline cursor-pointer opacity-70 hover:opacity-100"
            >
              إغلاق
            </button>
          </div>
        )}

        {/* Filter Bar & Search */}
        <div className="p-3 sm:p-4 bg-slate-900/40 border-b border-slate-800/60 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="relative flex-1 min-w-[240px] max-w-md">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="ابحث باسم الطالب، الهاتف، البريد، أو كود التفعيل..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-3 pr-9 py-2 rounded-xl text-xs bg-slate-800/80 border border-slate-700/80 text-white placeholder-slate-400 focus:outline-none focus:border-indigo-500 transition-colors"
            />
          </div>

          <div className="flex items-center gap-1.5 p-1 bg-slate-800/60 rounded-xl border border-slate-700/60">
            <button
              onClick={() => setFilter("all")}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                filter === "all"
                  ? "bg-indigo-600 text-white shadow"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              الكل ({students.length})
            </button>
            <button
              onClick={() => setFilter("active")}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                filter === "active"
                  ? "bg-emerald-600 text-white shadow"
                  : "text-slate-400 hover:text-emerald-400"
              }`}
            >
              النشطون ({activeCount})
            </button>
            {excludedCount > 0 && (
              <button
                onClick={() => setFilter("excluded")}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  filter === "excluded"
                    ? "bg-rose-600 text-white shadow"
                    : "text-slate-400 hover:text-rose-400"
                }`}
              >
                المستبعدون ({excludedCount})
              </button>
            )}
          </div>
        </div>

        {/* Students Table Area */}
        <div className="flex-1 overflow-y-auto overflow-x-auto min-h-[300px]">
          {loading ? (
            <div className="flex flex-col items-center justify-center p-12 text-slate-400">
              <div className="text-4xl mb-3 animate-pulse">⏳</div>
              <p className="text-sm font-bold">جارٍ جلب وتحليل بيانات الطلاب المسجلين...</p>
            </div>
          ) : filteredStudents.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-12 text-slate-400 text-center">
              <div className="text-4xl mb-3">🔍</div>
              <p className="text-sm font-bold text-slate-300">
                {searchQuery ? "لا يوجد طلاب يطابقون كلمة البحث" : "لا يوجد طلاب مسجلون في هذا الكورس حالياً"}
              </p>
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="mt-2 text-xs text-indigo-400 hover:underline cursor-pointer"
                >
                  مسح كلمة البحث
                </button>
              )}
            </div>
          ) : (
            <table className="w-full text-xs text-right border-collapse">
              <thead className="sticky top-0 bg-slate-900 border-b border-slate-800 text-slate-300 text-[11px] font-bold z-10">
                <tr>
                  <th className="p-3 text-center w-10">#</th>
                  <th className="p-3">الطالب</th>
                  <th className="p-3">رقم الهاتف</th>
                  <th className="p-3">مصدر التسجيل والحجز</th>
                  <th className="p-3 text-center">جلسات المشاهدة</th>
                  <th className="p-3 text-center">الحالة</th>
                  <th className="p-3 text-center">إجراء المشرف</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {filteredStudents.map((s, idx) => {
                  const whatsappUrl = s.phone
                    ? `https://wa.me/${s.phone.replace(/[^0-9]/g, "")}`
                    : null;

                  return (
                    <tr
                      key={s.id}
                      className={`hover:bg-slate-800/40 transition-colors ${
                        s.isExcluded ? "bg-rose-950/10 opacity-75" : ""
                      }`}
                    >
                      <td className="p-3 text-center text-slate-500 font-mono text-[11px]">
                        {idx + 1}
                      </td>

                      {/* Student Info */}
                      <td className="p-3">
                        <div className="flex items-center gap-2.5">
                          <div
                            className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-white text-xs shrink-0 ${
                              s.isExcluded ? "bg-rose-700" : "bg-gradient-to-br from-indigo-500 to-purple-600"
                            }`}
                          >
                            {s.name[0] || "ط"}
                          </div>
                          <div>
                            <div className="font-bold text-white flex items-center gap-1.5">
                              <span>{s.name}</span>
                              {s.educationalStage && (
                                <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-800 text-slate-300 font-normal">
                                  {s.educationalStage === "sec_1"
                                    ? "أولى بكالوريا"
                                    : s.educationalStage === "sec_2"
                                    ? "ثانية بكالوريا"
                                    : s.educationalStage}
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-slate-400 font-mono flex items-center gap-1 mt-0.5">
                              <Mail className="w-3 h-3 text-slate-500 shrink-0" />
                              <span className="truncate max-w-[180px]">{s.email}</span>
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Phone & Contacts */}
                      <td className="p-3">
                        {s.phone ? (
                          <div className="flex flex-col gap-0.5">
                            <div className="flex items-center gap-1 text-[11px] font-mono text-slate-200">
                              <Phone className="w-3 h-3 text-emerald-400 shrink-0" />
                              <span>{s.phone}</span>
                              <button
                                onClick={() => handleCopy(s.phone!, `p_${s.id}`)}
                                className="p-0.5 hover:text-indigo-400 transition-colors cursor-pointer"
                                title="نسخ الرقم"
                              >
                                {copiedId === `p_${s.id}` ? (
                                  <Check className="w-3 h-3 text-emerald-400" />
                                ) : (
                                  <Copy className="w-3 h-3 text-slate-500" />
                                )}
                              </button>
                              {whatsappUrl && (
                                <a
                                  href={whatsappUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-emerald-400 hover:text-emerald-300 text-[10px] font-bold underline mr-1 flex items-center"
                                  title="فتح واتساب"
                                >
                                  <span>واتساب</span>
                                  <ExternalLink className="w-2.5 h-2.5 mr-0.5" />
                                </a>
                              )}
                            </div>
                            {s.parentPhone && (
                              <div className="text-[10px] text-slate-400 font-mono">
                                ولي الأمر: {s.parentPhone}
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-500 text-[11px]">— غير مسجل</span>
                        )}
                      </td>

                      {/* Registration Source */}
                      <td className="p-3">
                        <div className="flex flex-col gap-1 max-w-[220px]">
                          {s.sources.map((src, i) => (
                            <span
                              key={i}
                              className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-md font-medium bg-slate-800/80 text-slate-200 border border-slate-700/60"
                            >
                              <span>{src.type === "ACCESS_CODE" ? "🎟️" : src.type === "TEACHER_SUBSCRIPTION" ? "📦" : "💳"}</span>
                              <span className="truncate">{src.label}</span>
                            </span>
                          ))}
                          <span className="text-[10px] text-slate-500 flex items-center gap-1 mt-0.5">
                            <Calendar className="w-3 h-3 shrink-0" />
                            <span>
                              {new Date(s.firstEnrolledAt).toLocaleDateString("ar-EG", {
                                year: "numeric",
                                month: "short",
                                day: "numeric",
                              })}
                            </span>
                          </span>
                        </div>
                      </td>

                      {/* Watch Count */}
                      <td className="p-3 text-center">
                        <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-sky-500/10 text-sky-300 border border-sky-500/20">
                          <Eye className="w-3 h-3 text-sky-400" />
                          <span>{s.watchCount} مشاهدة</span>
                        </div>
                      </td>

                      {/* Status */}
                      <td className="p-3 text-center">
                        {s.isExcluded ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-black bg-rose-500/15 text-rose-300 border border-rose-500/30">
                            <UserX className="w-3 h-3" />
                            <span>تم إخراجه من الكورس</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                            <UserCheck className="w-3 h-3" />
                            <span>نشط داخل الكورس</span>
                          </span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="p-3 text-center">
                        {s.isExcluded ? (
                          <button
                            onClick={() => handleRestoreStudent(s)}
                            disabled={actionSubmitting}
                            className="px-3 py-1.5 rounded-xl text-xs font-bold text-emerald-300 bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 transition-all cursor-pointer flex items-center gap-1.5 mx-auto disabled:opacity-50"
                            title="إلغاء الاستبعاد وإعادة إتاحة الكورس للطالب"
                          >
                            <RefreshCw className="w-3 h-3" />
                            <span>إعادة الإتاحة</span>
                          </button>
                        ) : (
                          <button
                            onClick={() => setTargetStudent(s)}
                            disabled={actionSubmitting}
                            className="px-3 py-1.5 rounded-xl text-xs font-black text-rose-300 bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 hover:border-rose-500/60 shadow-sm transition-all cursor-pointer flex items-center gap-1.5 mx-auto disabled:opacity-50 hover:scale-105"
                            title="إخراج الطالب من الكورس صامتاً بدون إشعار المعلم"
                          >
                            <LogOut className="w-3.5 h-3.5 text-rose-400" />
                            <span>إخراج الطالب (Sign Out)</span>
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-3 sm:p-4 bg-slate-900 border-t border-slate-800 flex flex-wrap items-center justify-between text-xs text-slate-400 shrink-0 gap-2">
          <div>
            إجمالي الطلاب في هذا الكورس: <strong className="text-white">{activeCount}</strong> طالب نشط
            {excludedCount > 0 && <span> (و {excludedCount} طالب تم إخراجهم)</span>}
          </div>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-700 text-white transition-colors cursor-pointer"
          >
            إغلاق النافذة
          </button>
        </div>
      </div>

      {/* ── Confirmation Dialog for Silent Sign Out ── */}
      {targetStudent && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in zoom-in-95 duration-150">
          <div className="w-full max-w-md p-5 rounded-2xl bg-slate-900 border border-rose-500/40 shadow-2xl space-y-4 text-right">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-rose-500/20 text-rose-400 flex items-center justify-center text-2xl border border-rose-500/30 shrink-0">
                🚪
              </div>
              <div>
                <h4 className="font-black text-base text-white">
                  تأكيد إخراج الطالب من الكورس صامتاً
                </h4>
                <p className="text-xs text-slate-400 mt-0.5">
                  العملية ستتم بدون أي إشعار أو تنبيه للمعلم نهائياً
                </p>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-rose-950/30 border border-rose-500/20 text-xs text-slate-200 space-y-2">
              <div className="flex items-center justify-between font-bold">
                <span className="text-slate-400">الطالب المستهدف:</span>
                <span className="text-white">{targetStudent.name}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400">الكورس:</span>
                <span className="text-amber-300 font-bold truncate max-w-[200px]">
                  {courseTitle}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400">المعلم:</span>
                <span className="text-sky-300">{teacherName}</span>
              </div>
            </div>

            {/* Warning notice */}
            <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-200 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <div className="text-[11px] leading-relaxed">
                سيتم حذف تسجيل الطالب وإلغاء صلاحية كوده فوراً، وإنهاء أي جلسات مشاهدة جارية له في هذا الكورس حالياً. المعلم لن يلاحظ شيئاً ولن يصله أي إيميل أو إشعار.
              </div>
            </div>

            {/* Checkbox for Session Revocation */}
            <label className="flex items-start gap-2.5 p-3 rounded-xl bg-slate-800/60 border border-slate-700/60 cursor-pointer hover:bg-slate-800 transition-colors">
              <input
                type="checkbox"
                checked={revokeSession}
                onChange={(e) => setRevokeSession(e.target.checked)}
                className="mt-0.5 w-4 h-4 rounded text-rose-600 focus:ring-rose-500 bg-slate-700 border-slate-600 cursor-pointer"
              />
              <div className="text-xs text-slate-300 select-none">
                <span className="font-bold text-white block">
                  تسجيل خروج الطالب من جهازه وحسابه بالكامل (Force Session Logout)
                </span>
                <span className="text-[11px] text-slate-400 block mt-0.5">
                  إبطال رمز الجلسة والتوكن فوراً لإخراج الطالب من المتصفح والتطبيق على كافة أجهزته.
                </span>
              </div>
            </label>

            {/* Actions */}
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setTargetStudent(null)}
                disabled={actionSubmitting}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 transition-colors cursor-pointer"
              >
                إلغاء التراجع
              </button>
              <button
                type="button"
                onClick={handleConfirmSignOut}
                disabled={actionSubmitting}
                className="px-4 py-2 rounded-xl text-xs font-black text-white bg-gradient-to-r from-rose-600 to-red-700 hover:from-rose-500 hover:to-red-600 shadow-lg shadow-rose-900/30 transition-all cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
              >
                {actionSubmitting ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>جارٍ التنفيذ الصامت...</span>
                  </>
                ) : (
                  <>
                    <LogOut className="w-3.5 h-3.5" />
                    <span>تأكيد إخراج الطالب صامتاً</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
