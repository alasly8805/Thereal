"use client";
import { useState, useCallback, useRef, useEffect } from "react";
import { EDUCATIONAL_STAGES } from "@/types";
import { StudentDetailModal } from "./StudentDetailModal";
import { useToast } from "@/components/ui/Toast";
import { hasPermission } from "@/lib/rbac";

interface ParentVerificationEvent {
  id: string;
  action: string;
  phone: string | null;
  ip: string | null;
  userAgent: string | null;
  createdAt: string;
}

interface Student {
  id: string;
  name: string;
  age: number | null;
  educationalStage: string | null;
  phone: string | null;
  parentPhone: string | null;
  isActive: boolean;
  parentVerified: boolean;
  parentVerificationStatus: string;
  createdAt: string;
  parentToken?: {
    sentAt: string | null;
    lastAccessedAt: string | null;
    issueCount: number;
    parentPhoneSnapshot: string | null;
  } | null;
  parentVerificationEvents?: ParentVerificationEvent[];
}

interface SearchFilters {
  name: string;
  stage: string;
  age: string;
  phone: string;
  parentPhone: string;
  verification: "all" | "confirmed" | "pending" | "rejected";
}

interface VerificationCounts {
  confirmed: number;
  pending: number;
  rejected: number;
  unverified: number;
}

const PAGE_SIZE = 20;

const EMPTY_FILTERS: SearchFilters = {
  name: "",
  stage: "",
  age: "",
  phone: "",
  parentPhone: "",
  verification: "all",
};

function stageLabel(value: string | null) {
  if (!value) return "—";
  return EDUCATIONAL_STAGES.find((s) => s.value === value)?.label ?? value;
}

export function StudentsSection({ userRole = "superadmin", refreshKey }: { userRole?: string; refreshKey?: number }) {
  const { success: toastSuccess, error: toastError } = useToast();
  const canManageDevices = hasPermission(userRole, "suspend_student");
  const [maxDevices, setMaxDevices] = useState<number | null>(null);
  const [deviceBounds, setDeviceBounds] = useState({ min: 1, max: 10 });
  const [draftMaxDevices, setDraftMaxDevices] = useState("");
  const [savingDevices, setSavingDevices] = useState(false);

  const [filters, setFilters] = useState<SearchFilters>(EMPTY_FILTERS);
  const [students, setStudents] = useState<Student[]>([]);
  const [total, setTotal] = useState(0);
  const [counts, setCounts] = useState<VerificationCounts>({ confirmed: 0, pending: 0, rejected: 0, unverified: 0 });
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  
  // Modals state for history and editing
  const [historyStudent, setHistoryStudent] = useState<Student | null>(null);
  const [editPhoneStudent, setEditPhoneStudent] = useState<Student | null>(null);
  const [newParentPhone, setNewParentPhone] = useState("");
  const [actionLoading, setActionLoading] = useState(false);

  const lastSearch = useRef<{ filters: SearchFilters; page: number }>({ filters: EMPTY_FILTERS, page: 0 });

  const search = useCallback(async (f: SearchFilters, pageOffset: number) => {
    setLoading(true);
    const params = new URLSearchParams();
    if (f.name) params.set("name", f.name);
    if (f.stage) params.set("stage", f.stage);
    if (f.age) params.set("age", f.age);
    if (f.phone) params.set("phone", f.phone);
    if (f.parentPhone) params.set("parentPhone", f.parentPhone);
    if (f.verification !== "all") params.set("verification", f.verification);
    params.set("limit", String(PAGE_SIZE));
    params.set("offset", String(pageOffset * PAGE_SIZE));

    try {
      const res = await fetch(`/api/admin/superadmin/students?${params.toString()}`, {
        credentials: "include",
      });
      const data = (await res.json()) as { students?: Student[]; total?: number; counts?: VerificationCounts };
      if (res.ok) {
        setStudents(data.students ?? []);
        setTotal(data.total ?? 0);
        if (data.counts) setCounts(data.counts);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(0);
    lastSearch.current = { filters, page: 0 };
    void search(filters, 0);
  };

  const handleVerificationFilterChange = (verification: SearchFilters["verification"]) => {
    const updated = { ...filters, verification };
    setFilters(updated);
    setPage(0);
    lastSearch.current = { filters: updated, page: 0 };
    void search(updated, 0);
  };

  const handlePageChange = (newPage: number) => {
    setPage(newPage);
    lastSearch.current = { ...lastSearch.current, page: newPage };
    void search(lastSearch.current.filters, newPage);
  };

  const handleStudentModified = () => {
    setSelectedId(null);
    void search(lastSearch.current.filters, lastSearch.current.page);
  };

  const handleReset = () => {
    setFilters(EMPTY_FILTERS);
    setPage(0);
    void search(EMPTY_FILTERS, 0);
  };

  useEffect(() => {
    if (refreshKey && refreshKey > 0) {
      void search(lastSearch.current.filters, lastSearch.current.page);
    }
  }, [refreshKey, search]);

  // Re-issue parent link for student
  const handleResendLink = async (student: Student) => {
    const phone = student.parentPhone;
    if (!phone) {
      toastError("لا يوجد رقم ولي أمر مسجّل لهذا الطالب.");
      return;
    }
    setActionLoading(true);
    try {
      const res = await fetch("/api/student/parent-phone", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ parentPhone: phone, studentId: student.id, allowSamePhone: true }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "تعذر إعادة إرسال الرابط");
      toastSuccess(json.message || "تمت إعادة إرسال الرابط عبر الواتساب بنجاح");
      void search(lastSearch.current.filters, lastSearch.current.page);
    } catch (err: any) {
      toastError(err?.message || "تعذر إعادة إرسال الرابط");
    } finally {
      setActionLoading(false);
    }
  };

  // Update parent phone and send link
  const handleSaveParentPhone = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editPhoneStudent || !newParentPhone.trim()) return;
    setActionLoading(true);
    try {
      const res = await fetch("/api/student/parent-phone", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ parentPhone: newParentPhone.trim(), studentId: editPhoneStudent.id }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "تعذر تحديث الرقم وإرسال الرابط");
      toastSuccess(json.message || "تم تحديث الرقم وإرسال الرابط بنجاح");
      setEditPhoneStudent(null);
      setNewParentPhone("");
    } catch (err: any) {
      toastError(err?.message || "تعذر تحديث الرقم وإرسال الرابط");
    } finally {
      setActionLoading(false);
    }
  };

  const handleResetParentLimits = async (student: Student) => {
    setActionLoading(true);
    try {
      const res = await fetch("/api/student/parent-phone", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ studentId: student.id, resetCount: true }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "تعذر تصفير العداد");
      toastSuccess(json.message || "تم تصفير عداد المحاولات وفك الحظر بنجاح");
      void search(lastSearch.current.filters, lastSearch.current.page);
    } catch (err: any) {
      toastError(err?.message || "تعذر تصفير العداد");
    } finally {
      setActionLoading(false);
    }
  };

  useEffect(() => {
    if (!canManageDevices) return;
    fetch("/api/admin/superadmin/settings/max-devices", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { maxDevices?: number; min?: number; max?: number } | null) => {
        if (!d || typeof d.maxDevices !== "number") return;
        setMaxDevices(d.maxDevices);
        setDraftMaxDevices(String(d.maxDevices));
        setDeviceBounds({ min: d.min ?? 1, max: d.max ?? 10 });
      })
      .catch(() => {});
  }, [canManageDevices]);

  const handleSaveMaxDevices = async () => {
    const n = Number(draftMaxDevices);
    if (!Number.isFinite(n) || n < deviceBounds.min || n > deviceBounds.max) {
      toastError(`عدد الأجهزة يجب أن يكون بين ${deviceBounds.min} و ${deviceBounds.max}`);
      return;
    }
    setSavingDevices(true);
    try {
      const res = await fetch("/api/admin/superadmin/settings/max-devices", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ maxDevices: n }),
      });
      const json = (await res.json()) as { maxDevices?: number; error?: string };
      if (!res.ok) throw new Error(json.error ?? "تعذر حفظ الحد");
      setMaxDevices(json.maxDevices ?? n);
      setDraftMaxDevices(String(json.maxDevices ?? n));
      toastSuccess(`تم ضبط الحد الأقصى للأجهزة على ${json.maxDevices ?? n}`);
    } catch (err) {
      toastError(err instanceof Error ? err.message : "تعذر حفظ الحد");
    } finally {
      setSavingDevices(false);
    }
  };

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div dir="rtl">
      {/* Device limit setting */}
      {canManageDevices && maxDevices !== null && (
        <div className="bg-gray-800 rounded-2xl border border-gray-700 p-5 mb-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h3 className="text-white font-bold text-sm">الحد الأقصى لأجهزة المتعلم</h3>
              <p className="text-xs text-gray-500 mt-0.5">
                عدد الأجهزة التي يمكن للمتعلم تسجيل الدخول منها. عند الوصول للحد، يُمنع الدخول من جهاز جديد حتى يُصفّر المعلم أجهزته.
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <input
                type="number"
                min={deviceBounds.min}
                max={deviceBounds.max}
                value={draftMaxDevices}
                onChange={(e) => setDraftMaxDevices(e.target.value)}
                className="w-20 px-3 py-2 rounded-lg bg-gray-900 border border-gray-600 text-white text-sm text-center focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              <button
                onClick={handleSaveMaxDevices}
                disabled={savingDevices || draftMaxDevices === String(maxDevices)}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
              >
                {savingDevices ? "جارٍ الحفظ..." : "حفظ"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Parent Verification Summary Line */}
      {counts.unverified > 0 && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4 mb-6 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="text-xl">⚠️</span>
            <div>
              <p className="text-sm font-bold text-amber-300">
                {counts.unverified} طالب من غير ولي أمر مؤكد
              </p>
              <p className="text-xs text-amber-400/80 mt-0.5">
                {counts.pending} في الانتظار · {counts.rejected} مرفوض
              </p>
            </div>
          </div>
          <button
            onClick={() => handleVerificationFilterChange("rejected")}
            className="px-3.5 py-1.5 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 text-xs font-bold transition-colors"
          >
            عرض المرفوضين
          </button>
        </div>
      )}

      {/* Search Form */}
      <form
        onSubmit={handleSubmit}
        className="bg-gray-800 rounded-2xl border border-gray-700 p-5 mb-6"
      >
        <h3 className="text-white font-bold text-sm mb-4">بحث عن طالب</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-4">
          <div>
            <label className="block text-xs text-gray-400 mb-1">الاسم</label>
            <input
              type="text"
              value={filters.name}
              onChange={(e) => setFilters({ ...filters, name: e.target.value })}
              placeholder="اسم المتعلم"
              className="w-full px-3 py-2 rounded-lg bg-gray-900 border border-gray-600 text-white text-sm placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">الصف التدريبي</label>
            <select
              value={filters.stage}
              onChange={(e) => setFilters({ ...filters, stage: e.target.value })}
              className="w-full px-3 py-2 rounded-lg bg-gray-900 border border-gray-600 text-white text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="">كل الصفوف</option>
              {EDUCATIONAL_STAGES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">السن</label>
            <input
              type="number"
              value={filters.age}
              onChange={(e) => setFilters({ ...filters, age: e.target.value })}
              placeholder="مثال: 14"
              min={6}
              max={25}
              className="w-full px-3 py-2 rounded-lg bg-gray-900 border border-gray-600 text-white text-sm placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">رقم المتعلم</label>
            <input
              type="text"
              value={filters.phone}
              onChange={(e) => setFilters({ ...filters, phone: e.target.value })}
              placeholder="01XXXXXXXXX"
              className="w-full px-3 py-2 rounded-lg bg-gray-900 border border-gray-600 text-white text-sm placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">رقم ولي الأمر</label>
            <input
              type="text"
              value={filters.parentPhone}
              onChange={(e) => setFilters({ ...filters, parentPhone: e.target.value })}
              placeholder="01XXXXXXXXX"
              className="w-full px-3 py-2 rounded-lg bg-gray-900 border border-gray-600 text-white text-sm placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
        </div>

        {/* Verification Filter Chips */}
        <div className="mb-4">
          <label className="block text-xs text-gray-400 mb-2 font-bold">تصفية التوثيق لولي الأمر:</label>
          <div className="flex flex-wrap gap-2">
            {[
              { id: "all", label: `الكل (${total})` },
              { id: "confirmed", label: `🟢 مؤكد (${counts.confirmed})` },
              { id: "pending", label: `🟡 في الانتظار (${counts.pending})` },
              { id: "rejected", label: `🔴 مرفوض (${counts.rejected})` },
            ].map((chip) => (
              <button
                key={chip.id}
                type="button"
                onClick={() => handleVerificationFilterChange(chip.id as any)}
                className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition-all ${
                  filters.verification === chip.id
                    ? "bg-blue-600 text-white shadow-md"
                    : "bg-gray-900 text-gray-400 border border-gray-700 hover:border-gray-500"
                }`}
              >
                {chip.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="submit"
            disabled={loading}
            className="px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-sm font-medium rounded-lg transition-colors cursor-pointer"
          >
            {loading ? "جارٍ البحث..." : "بحث"}
          </button>
          <button
            type="button"
            onClick={handleReset}
            className="px-5 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 text-sm font-medium rounded-lg transition-colors cursor-pointer"
          >
            عرض الكل
          </button>
          <button
            type="button"
            onClick={() => search(lastSearch.current.filters, lastSearch.current.page)}
            disabled={loading}
            className="px-3.5 py-2 bg-gray-700/80 hover:bg-gray-600/80 text-gray-200 text-sm font-medium rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
            title="تحديث القائمة"
          >
            <span className={loading ? "animate-spin" : ""}>🔄</span>
            <span>تحديث</span>
          </button>
        </div>
      </form>

      {/* Results Table */}
      <div className="bg-gray-800 rounded-2xl border border-gray-700 overflow-hidden">
        <div className="p-4 border-b border-gray-700 flex items-center justify-between">
          <h3 className="text-white font-bold text-sm">
            {loading ? "جارٍ التحميل..." : `${total} طالب`}
          </h3>
        </div>

        {!loading && students.length === 0 ? (
          <div className="p-10 text-center text-gray-500">
            <div className="text-4xl mb-2">🔍</div>
            <p>لا توجد نتائج</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[720px]">
                <thead>
                  <tr className="border-b border-gray-700 text-gray-400">
                    <th className="text-right px-4 py-3 font-medium">الاسم</th>
                    <th className="text-right px-4 py-3 font-medium">الصف</th>
                    <th className="text-right px-4 py-3 font-medium">رقم الهاتف</th>
                    <th className="text-right px-4 py-3 font-medium">ولي الأمر</th>
                    <th className="text-right px-4 py-3 font-medium">توثيق ولي الأمر</th>
                    <th className="text-right px-4 py-3 font-medium">الحالة</th>
                    <th className="px-4 py-3">إجراءات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-700">
                  {students.map((s) => {
                    const isRejected = s.parentVerificationStatus === "REJECTED";
                    const isConfirmed = s.parentVerificationStatus === "CONFIRMED" || s.parentVerified;
                    const issueCount = s.parentToken?.issueCount ?? 0;

                    return (
                      <tr
                        key={s.id}
                        className={`transition-colors ${
                          isRejected
                            ? "bg-red-950/20 border-s-4 border-red-500 hover:bg-red-950/30"
                            : "hover:bg-gray-700/40"
                        }`}
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
<div className="w-8 h-8 bg-green-700 rounded-lg flex items-center justify-center text-white font-bold text-xs shrink-0">
                              {s.name[0]}
                            </div>
                            <div className="min-w-0">
                              <p className="text-white font-medium truncate">{s.name}</p>
                              {issueCount >= 3 && (
                                <span
                                  title="الطالب غيّر رقم ولي الأمر ٣ مرات أو أكثر"
                                  className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20"
                                >
                                  ⚠️ غيّر الرقم {issueCount} مرات
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleResetParentLimits(s);
                                    }}
                                    disabled={actionLoading}
                                    title="تصفير عداد المحاولات وفك الحظر عاجلاً"
                                    className="ms-1 px-1.5 py-0.5 bg-amber-500/30 hover:bg-amber-500/50 text-white rounded text-[9px] font-bold transition-colors"
                                  >
                                    🔄 تصفير
                                  </button>
                                </span>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-gray-300">
                          {stageLabel(s.educationalStage)}
                        </td>
                        <td className="px-4 py-3 text-gray-300 font-mono text-xs">
                          {s.phone ?? "—"}
                        </td>
                        <td className="px-4 py-3 text-gray-300 font-mono text-xs">
                          {s.parentPhone ?? "—"}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`text-xs px-2.5 py-1 rounded-full border font-bold ${
                              isConfirmed
                                ? "bg-green-500/10 text-green-400 border-green-500/30"
                                : isRejected
                                ? "bg-red-500/10 text-red-400 border-red-500/30"
                                : "bg-amber-500/10 text-amber-400 border-amber-500/30"
                            }`}
                          >
                            {isConfirmed ? "🟢 مؤكد" : isRejected ? "🔴 مرفوض" : "🟡 في الانتظار"}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`text-xs px-2 py-1 rounded-full border ${
                              s.isActive
                                ? "bg-green-500/10 text-green-400 border-green-500/30"
                                : "bg-red-500/10 text-red-400 border-red-500/30"
                            }`}
                          >
                            {s.isActive ? "نشط" : "موقوف"}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5">
                            <button
                              onClick={() => setSelectedId(s.id)}
                              className="px-2.5 py-1 bg-blue-600/20 hover:bg-blue-600/40 text-blue-400 text-xs font-medium rounded-lg border border-blue-600/30 transition-colors"
                            >
                              الملف
                            </button>
                            <button
                              onClick={() => handleResendLink(s)}
                              disabled={actionLoading || !s.parentPhone}
                              title="إعادة إرسال رابط متابعة ولي الأمر عبر الواتساب"
                              className="px-2.5 py-1 bg-emerald-600/20 hover:bg-emerald-600/40 disabled:opacity-40 text-emerald-400 text-xs font-medium rounded-lg border border-emerald-600/30 transition-colors"
                            >
                              إرسال
                            </button>
                            <button
                              onClick={() => {
                                setEditPhoneStudent(s);
                                setNewParentPhone(s.parentPhone || "");
                              }}
                              title="تعديل رقم ولي الأمر"
                              className="px-2.5 py-1 bg-gray-700 hover:bg-gray-600 text-gray-300 text-xs font-medium rounded-lg transition-colors"
                            >
                              تعديل
                            </button>
                            <button
                              onClick={() => setHistoryStudent(s)}
                              title="عرض سجل المحاولات"
                              className="px-2.5 py-1 bg-purple-600/20 hover:bg-purple-600/40 text-purple-400 text-xs font-medium rounded-lg border border-purple-600/30 transition-colors"
                            >
                              السجل
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="p-4 border-t border-gray-700 flex items-center justify-between">
                <span className="text-xs text-gray-400">
                  صفحة {page + 1} من {totalPages} · إجمالي {total} طالب
                </span>
                <div className="flex gap-2">
                  <button
                    onClick={() => handlePageChange(page - 1)}
                    disabled={page === 0 || loading}
                    className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 disabled:opacity-40 text-white text-xs rounded-lg transition-colors"
                  >
                    السابق
                  </button>
                  <button
                    onClick={() => handlePageChange(page + 1)}
                    disabled={page >= totalPages - 1 || loading}
                    className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 disabled:opacity-40 text-white text-xs rounded-lg transition-colors"
                  >
                    التالي
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Student Detail Modal */}
      {selectedId && (
        <StudentDetailModal
          studentId={selectedId}
          userRole={userRole}
          onClose={() => setSelectedId(null)}
          onStudentModified={handleStudentModified}
        />
      )}

      {/* Attempt History Modal */}
      {historyStudent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" dir="rtl">
          <div className="bg-gray-800 border border-gray-700 rounded-2xl p-6 max-w-lg w-full shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-gray-700 pb-3">
              <h3 className="text-white font-bold text-base">
                سجل محاولات توثيق ولي الأمر ({historyStudent.name})
              </h3>
              <button
                onClick={() => setHistoryStudent(null)}
                className="text-gray-400 hover:text-white text-lg font-bold"
              >
                ✕
              </button>
            </div>

            <div className="space-y-2 max-h-80 overflow-y-auto">
              {!historyStudent.parentVerificationEvents || historyStudent.parentVerificationEvents.length === 0 ? (
                <p className="text-gray-400 text-xs text-center py-6">لا توجد محاولات مسجلة بعد</p>
              ) : (
                historyStudent.parentVerificationEvents.map((ev) => (
                  <div key={ev.id} className="p-3 bg-gray-900 border border-gray-700 rounded-xl text-xs space-y-1">
                    <div className="flex items-center justify-between font-bold">
                      <span
                        className={
                          ev.action === "CONFIRMED"
                            ? "text-green-400"
                            : ev.action === "REJECTED"
                            ? "text-red-400"
                            : "text-blue-400"
                        }
                      >
                        {ev.action === "CONFIRMED"
                          ? "✅ تأكيد ولي الأمر (مؤكد)"
                          : ev.action === "REJECTED"
                          ? "❌ رفض ولي الأمر (مرفوض)"
                          : ev.action === "REISSUED"
                          ? "🔄 إعادة إرسال رابط"
                          : ev.action === "OPENED"
                          ? "👁️ فتح الرابط"
                          : ev.action}
                      </span>
                      <span className="text-gray-500 font-mono text-[10px]">
                        {new Date(ev.createdAt).toLocaleString("ar-EG")}
                      </span>
                    </div>
                    {ev.phone && <p className="text-gray-400 font-mono">الرقم: {ev.phone}</p>}
                    {ev.ip && <p className="text-gray-500 font-mono">IP: {ev.ip}</p>}
                  </div>
                ))
              )}
            </div>

            <button
              onClick={() => setHistoryStudent(null)}
              className="w-full py-2 bg-gray-700 hover:bg-gray-600 text-white font-bold text-xs rounded-xl transition-colors"
            >
              إغلاق
            </button>
          </div>
        </div>
      )}

      {/* Edit Parent Phone Modal */}
      {editPhoneStudent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" dir="rtl">
          <form onSubmit={handleSaveParentPhone} className="bg-gray-800 border border-gray-700 rounded-2xl p-6 max-w-sm w-full shadow-2xl space-y-4">
            <h3 className="text-white font-bold text-base">تعديل رقم ولي الأمر</h3>
            <p className="text-xs text-gray-400 leading-relaxed">
              تعديل رقم ولي الأمر للطالب ({editPhoneStudent.name}). سيتم إرسال رابط متابعة جديد عبر الواتساب فوراً.
            </p>
            <div>
              <label className="block text-xs text-gray-300 font-bold mb-1">رقم الهاتف الجديد</label>
              <input
                type="text"
                required
                value={newParentPhone}
                onChange={(e) => setNewParentPhone(e.target.value)}
                placeholder="01XXXXXXXXX"
                className="w-full px-3 py-2 rounded-lg bg-gray-900 border border-gray-600 text-white font-mono text-sm placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={actionLoading}
                className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold text-xs rounded-xl transition-colors"
              >
                {actionLoading ? "جارٍ إرسال الرابط..." : "حفظ وإرسال الرابط"}
              </button>
              <button
                type="button"
                onClick={() => setEditPhoneStudent(null)}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 font-bold text-xs rounded-xl transition-colors"
              >
                إلغاء
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
