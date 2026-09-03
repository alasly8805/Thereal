"use client";
import { useState, useEffect } from "react";
import { useToast } from "@/components/ui/Toast";
import { ResetPasswordModal } from "./ResetPasswordModal";
import { ConfirmActionModal } from "./ConfirmActionModal";
import { hasPermission } from "@/lib/rbac";
import { BananaKeySvg, AdminActionPasswordBar } from "@/components/admin/AdminActionPasswordBar";
import { KeyRound } from "lucide-react";

interface CourseItem {
  id: string;
  title: string;
  subject: string;
}

interface Teacher {
  id: string;
  name: string;
  email: string;
  createdAt: string;
  promoProgramEnabled?: boolean;
  promoCode?: string;
  _count: { courses: number };
  courses: CourseItem[];
}

export function TeachersSection({ userRole = "superadmin" }: { userRole?: string }) {
  const { success: toastSuccess, error: toastError } = useToast();
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [resetTarget, setResetTarget] = useState<{ id: string; name: string } | null>(null);
  const [editTarget, setEditTarget] = useState<{ id: string; name: string } | null>(null);
  const [editName, setEditName] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [togglingPromo, setTogglingPromo] = useState<string | null>(null);
  const [enteringTeacherId, setEnteringTeacherId] = useState<string | null>(null);
  const [pendingPromptTeacher, setPendingPromptTeacher] = useState<{ id: string; name: string } | null>(null);
  const [promptPasswordInput, setPromptPasswordInput] = useState("");

  const refreshTeachers = async () => {
    try {
      const res = await fetch(`/api/admin/teachers?_t=${Date.now()}`, { credentials: "include" });
      if (!res.ok) {
        toastError("فشل تحميل قائمة المعلمين");
        return;
      }
      const data = await res.json();
      setTeachers(data?.teachers || []);
    } catch {
      toastError("تعذر الاتصال بالخادم");
    }
  };

  useEffect(() => {
    let isMounted = true;
    const loadTeachers = async () => {
      try {
        const res = await fetch(`/api/admin/teachers?_t=${Date.now()}`, { credentials: "include" });
        if (!isMounted) return;
        if (!res.ok) {
          toastError("فشل تحميل قائمة المعلمين");
          return;
        }
        const data = await res.json();
        if (isMounted) setTeachers(data?.teachers || []);
      } catch {
        if (isMounted) toastError("تعذر الاتصال بالخادم");
      } finally {
        if (isMounted) setLoading(false);
      }
    };
    void loadTeachers();
    return () => {
      isMounted = false;
    };
  }, [toastError]);

  const executeEnterTeacherPanel = async (teacherId: string, teacherName: string, passwordToUse: string) => {
    if (!passwordToUse.trim()) {
      toastError("أدخل كلمة مرور إجراءات المشرف للمتابعة");
      return;
    }

    setEnteringTeacherId(teacherId);
    try {
      const res = await fetch("/api/admin/superadmin/impersonate", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "teacher",
          teacherId,
          actionPassword: passwordToUse,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        sessionStorage.setItem("admin_action_password", passwordToUse);
        toastSuccess(`تم تسجيل الدخول كمعلم (${teacherName}) بنجاح! جاري التوجيه...`);
        setPendingPromptTeacher(null);
        if (typeof window !== "undefined") {
          window.location.assign(data.redirectUrl || "/adminpanel/teacher");
        }
      } else {
        toastError(data.error || "تعذر الدخول إلى لوحة المعلم");
        if (data.error?.includes("كلمة مرور")) {
          sessionStorage.removeItem("admin_action_password");
        }
        setEnteringTeacherId(null);
      }
    } catch {
      toastError("حدث خطأ أثناء الاتصال بالخادم");
      setEnteringTeacherId(null);
    }
  };

  const handleEnterTeacherPanel = async (teacherId: string, teacherName: string) => {
    const savedPassword = typeof window !== "undefined" ? sessionStorage.getItem("admin_action_password") || "" : "";
    if (savedPassword) {
      if (!window.confirm(`هل تريد الدخول إلى لوحة تحكم المعلم "${teacherName}" الآن؟`)) {
        return;
      }
      await executeEnterTeacherPanel(teacherId, teacherName, savedPassword);
    } else {
      setPendingPromptTeacher({ id: teacherId, name: teacherName });
      setPromptPasswordInput("");
    }
  };

  const togglePromoProgram = async (t: Teacher) => {
    setTogglingPromo(t.id);
    const newVal = !t.promoProgramEnabled;
    try {
      const res = await fetch(`/api/admin/superadmin/teachers/${t.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ promoProgramEnabled: newVal }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setTeachers((prev) =>
          prev.map((item) => (item.id === t.id ? { ...item, promoProgramEnabled: newVal } : item))
        );
        toastSuccess(`تم ${newVal ? "تفعيل" : "تعطيل"} برنامج الإحالة للمعلم "${t.name}"`);
      } else {
        toastError(data.error || "تعذر تغيير حالة البرنامج");
      }
    } catch {
      toastError("تعذر الاتصال بالخادم");
    } finally {
      setTogglingPromo(null);
    }
  };

  const handleEditName = async (password: string) => {
    if (!editTarget) return;
    const res = await fetch(`/api/admin/teachers/${editTarget.id}`, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ actionPassword: password, name: editName }),
    });
    const json = (await res.json()) as { error?: string; teacher?: { id: string; name: string } };
    if (!res.ok) throw new Error(json.error ?? "تعذر تعديل الاسم");
    setTeachers((prev) =>
      prev.map((t) => (t.id === editTarget.id ? { ...t, name: json.teacher?.name ?? editName } : t))
    );
    toastSuccess(`تم تعديل اسم المعلم بنجاح`);
    setEditTarget(null);
  };

  const handleDelete = async (password: string) => {
    if (!deleteTarget) return;
    const res = await fetch(`/api/admin/teachers/${deleteTarget.id}`, {
      method: "DELETE",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ actionPassword: password }),
    });
    const json = (await res.json()) as { error?: string };
    if (!res.ok) throw new Error(json.error ?? "تعذر حذف حساب المعلم");
    setTeachers((prev) => prev.filter((t) => t.id !== deleteTarget.id));
    toastSuccess(`تم حذف حساب المعلم بنجاح`);
    setDeleteTarget(null);
  };

  if (loading) {
    return (
      <div className="p-16 text-center text-slate-500" dir="rtl">
        <div className="w-6 h-6 border-2 border-slate-400 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
        <span className="text-xs font-bold">جارٍ تحميل قائمة المعلمين...</span>
      </div>
    );
  }

  return (
    <div dir="rtl" className="space-y-5">
      {/* Top Banner with Custom Banana Key Password Manager */}
      <div className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-sm dark:border-slate-800/90 dark:bg-slate-900/90 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <BananaKeySvg className="w-8 h-8 shrink-0" />
          <div>
            <h3 className="text-xs font-black text-slate-900 dark:text-white">مفتاح إجراءات المشرف للأمان</h3>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              أدخل كلمة مرور المشرف مرة واحدة لدخول لوحات تحكم المعلمين وتعديل الحسابات دون تكرار.
            </p>
          </div>
        </div>
        <AdminActionPasswordBar />
      </div>

      {/* Teachers List Card */}
      <div className="bg-white dark:bg-slate-900/90 rounded-2xl border border-slate-200/90 dark:border-slate-800/90 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/70 dark:bg-slate-950/40">
          <h3 className="text-slate-900 dark:text-white font-black text-sm">
            المعلمون المسجلون ({teachers.length})
          </h3>
          <button
            type="button"
            onClick={() => void refreshTeachers()}
            className="text-xs font-bold text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer"
          >
            ↻ تحديث
          </button>
        </div>

        {teachers.length === 0 ? (
          <div className="p-12 text-center text-slate-500">
            <div className="text-4xl mb-2">👨‍🏫</div>
            <p className="font-bold text-sm text-slate-700 dark:text-slate-300">لا يوجد مدرسون حالياً</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-200 dark:divide-slate-800">
            {teachers.map((t) => (
              <div key={t.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors">
                {/* Teacher row */}
                <div className="p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 bg-slate-900 dark:bg-slate-800 text-white rounded-xl flex items-center justify-center font-bold text-sm shrink-0 border border-slate-700">
                      {t.name[0]}
                    </div>
                    <div className="min-w-0">
                      <p className="font-bold text-slate-900 dark:text-white truncate text-sm">{t.name}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 truncate font-mono">{t.email}</p>
                      <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">
                        {t._count.courses} كورس · انضم {new Date(t.createdAt).toLocaleDateString("ar-EG")}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    {/* Enter Teacher Panel Button */}
                    <button
                      type="button"
                      onClick={() => handleEnterTeacherPanel(t.id, t.name)}
                      disabled={enteringTeacherId === t.id}
                      className="px-3.5 py-1.5 text-xs bg-sky-50 hover:bg-sky-100 text-sky-800 border border-sky-300 dark:bg-sky-950/40 dark:hover:bg-sky-900/50 dark:text-sky-300 dark:border-sky-800/60 rounded-xl transition-all font-bold flex items-center gap-1.5 cursor-pointer shadow-sm disabled:opacity-50"
                      title={`دخول لوحة تحكم المعلم (${t.name})`}
                    >
                      <span>{enteringTeacherId === t.id ? "⏳" : "🚪"}</span>
                      <span>{enteringTeacherId === t.id ? "جارٍ الدخول..." : "لوحة المعلم"}</span>
                    </button>

                    {userRole === "superadmin" && (
                      <button
                        type="button"
                        onClick={() => togglePromoProgram(t)}
                        disabled={togglingPromo === t.id}
                        className={`px-3 py-1.5 text-xs rounded-xl transition-all border font-bold flex items-center gap-1 cursor-pointer ${
                          t.promoProgramEnabled
                            ? "bg-emerald-50 text-emerald-800 border-emerald-300 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800/60"
                            : "bg-slate-100 text-slate-600 border-slate-300 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700"
                        }`}
                      >
                        <span>{t.promoProgramEnabled ? "✅ مفعّل" : "❌ معطّل"}</span>
                        <span>الإحالة</span>
                      </button>
                    )}

                    {hasPermission(userRole as "superadmin" | "admin" | "staff", "edit_teacher_name") && (
                      <button
                        type="button"
                        onClick={() => {
                          setEditTarget({ id: t.id, name: t.name });
                          setEditName(t.name);
                        }}
                        className="px-3 py-1.5 text-xs bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-200 dark:border-slate-700 rounded-xl transition-all font-medium cursor-pointer"
                      >
                        تعديل الاسم
                      </button>
                    )}

                    {hasPermission(userRole as "superadmin" | "admin" | "staff", "reset_teacher_password") && (
                      <button
                        type="button"
                        onClick={() => setResetTarget({ id: t.id, name: t.name })}
                        className="px-3 py-1.5 text-xs bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 dark:bg-amber-950/40 dark:hover:bg-amber-900/50 dark:text-amber-300 dark:border-amber-800/50 rounded-xl transition-all font-medium cursor-pointer"
                      >
                        كلمة المرور
                      </button>
                    )}

                    {hasPermission(userRole as "superadmin" | "admin" | "staff", "delete_teacher") && (
                      <button
                        type="button"
                        onClick={() => setDeleteTarget({ id: t.id, name: t.name })}
                        className="px-3 py-1.5 text-xs bg-rose-50 hover:bg-rose-100 text-rose-800 border border-rose-300 dark:bg-rose-950/40 dark:hover:bg-rose-900/50 dark:text-rose-300 dark:border-rose-800/50 rounded-xl transition-all font-medium cursor-pointer"
                      >
                        حذف
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => setExpandedId(expandedId === t.id ? null : t.id)}
                      className="px-3 py-1.5 text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-300 dark:border-slate-700 rounded-xl transition-all font-medium cursor-pointer"
                    >
                      {expandedId === t.id ? "إخفاء الكورسات" : `الكورسات (${t._count.courses})`}
                    </button>
                  </div>
                </div>

                {/* Expanded courses */}
                {expandedId === t.id && (
                  <div className="px-6 pb-4 pt-1 bg-slate-50/50 dark:bg-slate-950/30">
                    {t.courses.length === 0 ? (
                      <p className="text-xs text-slate-500 py-2">لا توجد كورسات لهذا المعلم</p>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                        {t.courses.map((c) => (
                          <div
                            key={c.id}
                            className="bg-white dark:bg-slate-900 p-3 rounded-xl border border-slate-200 dark:border-slate-800 text-xs shadow-xs"
                          >
                            <p className="font-bold text-slate-900 dark:text-white truncate">{c.title}</p>
                            <p className="text-slate-500 text-[11px] mt-0.5">{c.subject}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Direct Impersonate Password Prompt Modal with Banana Key SVG */}
      {pendingPromptTeacher && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-200">
          <div
            dir="rtl"
            className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl p-6 space-y-4"
          >
            <div className="flex items-center gap-3 border-b border-slate-100 dark:border-slate-800 pb-3">
              <BananaKeySvg className="w-10 h-10 shrink-0 text-amber-500" />
              <div>
                <h4 className="font-black text-sm text-slate-900 dark:text-white">
                  الدخول إلى لوحة المعلم: {pendingPromptTeacher.name}
                </h4>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  أدخل كلمة مرور المشرف للتحقق وتفعيل الجلسة فوراً.
                </p>
              </div>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                void executeEnterTeacherPanel(pendingPromptTeacher.id, pendingPromptTeacher.name, promptPasswordInput);
              }}
              className="space-y-4"
            >
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                  كلمة مرور إجراءات المشرف
                </label>
                <input
                  type="password"
                  value={promptPasswordInput}
                  onChange={(e) => setPromptPasswordInput(e.target.value)}
                  placeholder="••••••••"
                  autoFocus
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm font-mono text-slate-900 outline-none focus:border-slate-400 focus:bg-white dark:border-slate-800 dark:bg-slate-950 dark:text-white transition-all"
                />
              </div>

              <div className="flex items-center gap-2 pt-2">
                <button
                  type="submit"
                  disabled={enteringTeacherId === pendingPromptTeacher.id}
                  className="flex-1 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white dark:bg-emerald-700 dark:hover:bg-emerald-600 text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-sm disabled:opacity-50"
                >
                  <KeyRound className="w-3.5 h-3.5" />
                  <span>{enteringTeacherId === pendingPromptTeacher.id ? "جارٍ التحقق والدخول..." : "تأكيد ودخول لوحة المعلم"}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setPendingPromptTeacher(null)}
                  className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-300 text-xs font-bold transition-all cursor-pointer"
                >
                  إلغاء
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modals */}
      {resetTarget && (
        <ResetPasswordModal
          teacherId={resetTarget.id}
          teacherName={resetTarget.name}
          onClose={() => setResetTarget(null)}
          onSuccess={() => {
            setResetTarget(null);
            refreshTeachers();
          }}
        />
      )}

      {editTarget && (
        <ConfirmActionModal
          title={`تعديل اسم المعلم: ${editTarget.name}`}
          description="أدخل الاسم الجديد وكلمة مرور المشرف لتأكيد التعديل."
          actionLabel="تعديل الاسم"
          variant="warning"
          extraField={{
            label: "الاسم الجديد",
            placeholder: "أدخل اسم المعلم...",
            value: editName,
            onChange: setEditName,
            type: "text",
          }}
          onConfirm={handleEditName}
          onClose={() => setEditTarget(null)}
        />
      )}

      {deleteTarget && (
        <ConfirmActionModal
          title={`حذف حساب المعلم: ${deleteTarget.name}`}
          description={`هل أنت متأكد من حذف حساب "${deleteTarget.name}"؟ سيتم نقل الحساب إلى سلة المحذوفات.`}
          actionLabel="تأكيد الحذف"
          variant="danger"
          onConfirm={handleDelete}
          onClose={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}
