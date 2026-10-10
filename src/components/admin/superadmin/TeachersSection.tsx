"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDown, DoorOpen, GraduationCap, KeyRound, Layers, Pencil, RefreshCw, Share2, Trash2, UserPlus } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { ResetPasswordModal } from "./ResetPasswordModal";
import { ConfirmActionModal } from "./ConfirmActionModal";
import { hasPermission } from "@/lib/rbac";
import {
  Button,
  EmptyState,
  IconButton,
  Notice,
  PageHeader,
  Panel,
  SearchInput,
  SkeletonRows,
  Switch,
  fmtDate,
  fmtNum,
  readJson,
} from "@/components/admin/ui/kit";
import { normalizeSearch } from "@/components/admin/admin-nav";

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

export function TeachersSection({
  userRole = "superadmin",
  onChanged,
}: {
  userRole?: string;
  onChanged?: () => void;
}) {
  const { success: toastSuccess, error: toastError } = useToast();
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [query, setQuery] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [resetTarget, setResetTarget] = useState<{ id: string; name: string } | null>(null);
  const [editTarget, setEditTarget] = useState<{ id: string; name: string } | null>(null);
  const [editName, setEditName] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string; courses: number } | null>(null);
  const [togglingPromo, setTogglingPromo] = useState<string | null>(null);

  const isSuper = userRole === "superadmin";
  const canEditName = hasPermission(userRole, "edit_teacher_name");
  const canResetPass = hasPermission(userRole, "reset_teacher_password");
  const canDelete = hasPermission(userRole, "delete_teacher");

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const res = await fetch(`/api/admin/teachers?_t=${Date.now()}`, { credentials: "include" });
      const data = await readJson<{ teachers?: Teacher[]; error?: string }>(res);
      if (!res.ok) {
        setLoadError(data?.error || "تعذر تحميل قائمة المعلمين");
        return;
      }
      setTeachers(data?.teachers ?? []);
    } catch {
      setLoadError("تعذر الاتصال بالخادم");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const rows = useMemo(() => {
    const q = normalizeSearch(query);
    if (!q) return teachers;
    return teachers.filter((t) => normalizeSearch(`${t.name} ${t.email}`).includes(q));
  }, [teachers, query]);

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
      const data = await readJson<{ success?: boolean; error?: string }>(res);
      if (!res.ok || !data?.success) throw new Error(data?.error || "تعذر تغيير حالة البرنامج");
      setTeachers((prev) => prev.map((item) => (item.id === t.id ? { ...item, promoProgramEnabled: newVal } : item)));
      toastSuccess(`برنامج الإحالة ${newVal ? "مفعّل" : "متوقف"} للمعلم "${t.name}"`);
    } catch (err) {
      toastError(err instanceof Error ? err.message : "تعذر الاتصال بالخادم");
    } finally {
      setTogglingPromo(null);
    }
  };

  const handleEditName = async (password: string) => {
    if (!editTarget) return;
    const name = editName.trim();
    if (!name) throw new Error("اكتب الاسم الجديد");
    const res = await fetch(`/api/admin/teachers/${editTarget.id}`, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ actionPassword: password, name }),
    });
    const json = await readJson<{ error?: string; teacher?: { id: string; name: string } }>(res);
    if (!res.ok) throw new Error(json?.error ?? "تعذر تعديل الاسم");
    setTeachers((prev) => prev.map((t) => (t.id === editTarget.id ? { ...t, name: json?.teacher?.name ?? name } : t)));
    toastSuccess("تم تعديل اسم المعلم");
    setEditTarget(null);
    onChanged?.();
  };

  const handleDelete = async (password: string) => {
    if (!deleteTarget) return;
    const res = await fetch(`/api/admin/teachers/${deleteTarget.id}`, {
      method: "DELETE",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ actionPassword: password }),
    });
    const json = await readJson<{ error?: string }>(res);
    if (!res.ok) throw new Error(json?.error ?? "تعذر حذف حساب المعلم");
    setTeachers((prev) => prev.filter((t) => t.id !== deleteTarget.id));
    toastSuccess(`حُذف حساب "${deleteTarget.name}" وكورساته نهائياً`);
    setDeleteTarget(null);
    onChanged?.();
  };

  return (
    <div dir="rtl" className="flex flex-col gap-5">
      <PageHeader
        title="المعلمون"
        description="حسابات المعلمين وكورساتهم. ادخل لوحة أي معلم، فعّل برنامج الإحالة، أو غيّر الاسم وكلمة المرور."
        actions={
          <>
            <Button onClick={() => void load()} loading={loading} icon={<RefreshCw size={15} />}>
              تحديث
            </Button>
          </>
        }
      />

      <Panel
        padded={false}
        title={loading && teachers.length === 0 ? "جارٍ التحميل" : `${fmtNum(teachers.length)} معلم`}
        actions={<SearchInput value={query} onChange={setQuery} placeholder="ابحث بالاسم أو البريد" inputSize="sm" className="w-64 max-w-full" />}
      >
        {loadError ? (
          <div className="p-4">
            <Notice tone="bad" title={loadError} action={<Button size="sm" onClick={() => void load()}>إعادة المحاولة</Button>} />
          </div>
        ) : loading && teachers.length === 0 ? (
          <SkeletonRows rows={5} h={56} />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={<GraduationCap size={22} />}
            title={teachers.length === 0 ? "لا يوجد معلمون بعد" : "لا نتائج مطابقة"}
            text={teachers.length === 0 ? "أضف أول معلم من «إضافة معلم»." : "جرّب جزءاً من الاسم أو البريد."}
          />
        ) : (
          <ul className="adm-list">
            {rows.map((t) => {
              const expanded = expandedId === t.id;
              return (
                <li key={t.id}>
                  <div className="adm-row">
                    <div className="flex items-center gap-3 min-w-0 flex-1 basis-64">
                      <span className="adm-avatar" aria-hidden>{t.name?.[0] ?? "؟"}</span>
                      <div className="min-w-0">
                        <p className="font-bold text-sm truncate">{t.name}</p>
                        <p className="text-xs adm-muted truncate">
                          <span className="adm-mono">{t.email}</span> · انضم {fmtDate(t.createdAt)}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5">
                      {isSuper && (
                        <label className="inline-flex items-center gap-2 text-xs font-semibold me-2" style={{ color: "var(--ink-2)" }}>
                          <Share2 size={14} aria-hidden />
                          الإحالة
                          <Switch
                            checked={!!t.promoProgramEnabled}
                            onChange={() => void togglePromoProgram(t)}
                            disabled={togglingPromo === t.id}
                            label={`برنامج الإحالة للمعلم ${t.name}`}
                          />
                        </label>
                      )}

                      {isSuper && (
                        <form action="/adminpanel/enter-teacher" method="post">
                          <input type="hidden" name="teacherId" value={t.id} />
                          <Button type="submit" size="sm" variant="primary" icon={<DoorOpen size={14} />} title={`دخول لوحة ${t.name}`}>
                            لوحة المعلم
                          </Button>
                        </form>
                      )}
                      {isSuper && (
                        <a
                          href={`/adminpanel/superadmin?section=teacher-packages&teacherId=${t.id}`}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold cursor-pointer transition-colors"
                          style={{ background: "rgba(16, 185, 129, 0.12)", color: "#10b981", border: "1px solid rgba(16, 185, 129, 0.25)" }}
                          title={`إدارة باقات وكورسات ${t.name} ومقارنة الفرق البياني`}
                        >
                          <Layers size={14} />
                          <span>باقات وكورسات ومقارنة 📊</span>
                        </a>
                      )}
                      {canEditName && (
                        <IconButton
                          label="تعديل الاسم"
                          size="sm"
                          onClick={() => {
                            setEditTarget({ id: t.id, name: t.name });
                            setEditName(t.name);
                          }}
                        >
                          <Pencil size={15} />
                        </IconButton>
                      )}
                      {canResetPass && (
                        <IconButton label="تغيير كلمة المرور" size="sm" onClick={() => setResetTarget({ id: t.id, name: t.name })}>
                          <KeyRound size={15} />
                        </IconButton>
                      )}
                      {canDelete && (
                        <IconButton
                          label="حذف نهائي"
                          size="sm"
                          onClick={() => setDeleteTarget({ id: t.id, name: t.name, courses: t._count.courses })}
                          style={{ color: "var(--danger)" }}
                        >
                          <Trash2 size={15} />
                        </IconButton>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setExpandedId(expanded ? null : t.id)}
                        aria-expanded={expanded}
                      >
                        {fmtNum(t._count.courses)} كورس
                        <ChevronDown size={14} style={{ transform: expanded ? "rotate(180deg)" : undefined, transition: "transform 180ms" }} aria-hidden />
                      </Button>
                    </div>
                  </div>

                  {expanded && (
                    <div className="px-4 pb-4 sm:px-[18px]">
                      {t.courses.length === 0 ? (
                        <p className="adm-hint">لا توجد كورسات لهذا المعلم.</p>
                      ) : (
                        <ul className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))" }}>
                          {t.courses.map((c) => (
                            <li key={c.id} className="adm-well px-3 py-2.5">
                              <p className="text-sm font-semibold truncate" title={c.title}>{c.title}</p>
                              <p className="text-xs adm-muted">{c.subject}</p>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Panel>

      {!loading && teachers.length > 0 && (
        <p className="adm-hint flex items-center gap-1.5">
          <UserPlus size={14} aria-hidden /> لإضافة معلم جديد استخدم «إضافة معلم» من القائمة.
        </p>
      )}

      {resetTarget && (
        <ResetPasswordModal
          teacherId={resetTarget.id}
          teacherName={resetTarget.name}
          onClose={() => setResetTarget(null)}
          onSuccess={() => setResetTarget(null)}
        />
      )}

      {editTarget && (
        <ConfirmActionModal
          title="تعديل اسم المعلم"
          description={`الاسم الحالي: ${editTarget.name}`}
          actionLabel="حفظ الاسم"
          variant="warning"
          extraField={{ label: "الاسم الجديد", placeholder: "اسم المعلم", value: editName, onChange: setEditName, type: "text" }}
          onConfirm={handleEditName}
          onClose={() => setEditTarget(null)}
        />
      )}

      {deleteTarget && (
        <ConfirmActionModal
          title="حذف المعلم نهائياً"
          description={`سيُحذف حساب "${deleteTarget.name}"${deleteTarget.courses > 0 ? ` مع كل كورساته (${fmtNum(deleteTarget.courses)} كورس)` : ""} نهائياً من قاعدة البيانات. لا يمكن التراجع، ولن يظهر في «المعلمون المحذوفون».`}
          actionLabel="حذف نهائياً"
          variant="danger"
          onConfirm={handleDelete}
          onClose={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}
