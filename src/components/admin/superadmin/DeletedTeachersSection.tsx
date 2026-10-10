"use client";
import { useCallback, useEffect, useState } from "react";
import { Archive, RefreshCw, RotateCcw, Timer, Trash2 } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { ConfirmActionModal } from "./ConfirmActionModal";
import { hasPermission } from "@/lib/rbac";
import {
  Badge,
  Button,
  EmptyState,
  Field,
  Input,
  Notice,
  PageHeader,
  Panel,
  SkeletonRows,
  fmtDate,
  fmtNum,
  readJson,
} from "@/components/admin/ui/kit";

interface DeletedTeacher {
  id: string;
  name: string;
  email: string;
  deletedAt: string | null;
  createdAt: string;
  _count?: { courses: number };
}

type ModalAction = { type: "restore" | "hard_delete"; teacher: DeletedTeacher } | null;

function daysLeft(deletedAt: string | null, graceDays: number) {
  if (!deletedAt) return graceDays;
  const purgeAt = new Date(deletedAt).getTime() + graceDays * 86400000;
  return Math.max(0, Math.ceil((purgeAt - Date.now()) / 86400000));
}

export function DeletedTeachersSection({ userRole = "superadmin" }: { userRole?: string }) {
  const { success: toastSuccess, error: toastError } = useToast();
  const [teachers, setTeachers] = useState<DeletedTeacher[]>([]);
  const [graceDays, setGraceDays] = useState(7);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [modalAction, setModalAction] = useState<ModalAction>(null);

  const [draftDays, setDraftDays] = useState("7");
  const [bounds, setBounds] = useState({ min: 1, max: 365 });
  const [savingDays, setSavingDays] = useState(false);
  const canManage = hasPermission(userRole, "delete_teacher");

  useEffect(() => {
    fetch("/api/admin/superadmin/settings/grace-days", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { graceDays?: number; min?: number; max?: number } | null) => {
        if (!d) return;
        if (typeof d.graceDays === "number") {
          setGraceDays(d.graceDays);
          setDraftDays(String(d.graceDays));
        }
        if (typeof d.min === "number" && typeof d.max === "number") setBounds({ min: d.min, max: d.max });
      })
      .catch(() => {});
  }, []);

  const saveGraceDays = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const n = parseInt(draftDays, 10);
    if (!Number.isFinite(n) || n < bounds.min || n > bounds.max) {
      toastError(`عدد الأيام يجب أن يكون بين ${bounds.min} و ${bounds.max}`);
      return;
    }
    setSavingDays(true);
    try {
      const res = await fetch("/api/admin/superadmin/settings/grace-days", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ graceDays: n }),
      });
      const json = await readJson<{ graceDays?: number; error?: string }>(res);
      if (!res.ok) {
        toastError(json?.error ?? "تعذر حفظ الإعداد");
        return;
      }
      setGraceDays(json?.graceDays ?? n);
      setDraftDays(String(json?.graceDays ?? n));
      toastSuccess(`مهلة الحذف الآن ${json?.graceDays ?? n} يوم`);
    } catch {
      toastError("تعذر الاتصال بالخادم");
    } finally {
      setSavingDays(false);
    }
  };

  /** Loading the list also purges teachers whose grace period ended (server side). */
  const fetchDeleted = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const res = await fetch("/api/admin/superadmin/teachers/deleted", { credentials: "include" });
      const data = await readJson<{ teachers?: DeletedTeacher[]; graceDays?: number; purged?: number; error?: string }>(res);
      if (!res.ok) {
        setLoadError(data?.error || "تعذر تحميل المعلمين المحذوفين");
        return;
      }
      setTeachers(data?.teachers ?? []);
      if (typeof data?.graceDays === "number") setGraceDays(data.graceDays);
      setLoaded(true);
      if (data?.purged) toastSuccess(`حُذف ${data.purged} معلم نهائياً لانتهاء مهلة الاستعادة`);
    } catch {
      setLoadError("تعذر الاتصال بالخادم");
    } finally {
      setLoading(false);
    }
  }, [toastSuccess]);

  const handleRestore = async (password: string) => {
    if (modalAction?.type !== "restore") return;
    const { teacher } = modalAction;
    const res = await fetch(`/api/admin/superadmin/teachers/${teacher.id}/restore`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ actionPassword: password }),
    });
    const json = await readJson<{ error?: string }>(res);
    if (!res.ok) throw new Error(json?.error ?? "تعذر استعادة الحساب");
    toastSuccess(`استُعيد المعلم ${teacher.name} وكل كورساته`);
    setTeachers((prev) => prev.filter((t) => t.id !== teacher.id));
    setModalAction(null);
  };

  const handleHardDelete = async (password: string) => {
    if (modalAction?.type !== "hard_delete") return;
    const { teacher } = modalAction;
    const res = await fetch(`/api/admin/superadmin/teachers/${teacher.id}`, {
      method: "DELETE",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ actionPassword: password }),
    });
    const json = await readJson<{ error?: string }>(res);
    if (!res.ok) throw new Error(json?.error ?? "تعذر الحذف النهائي");
    toastSuccess(`حُذف المعلم ${teacher.name} نهائياً`);
    setTeachers((prev) => prev.filter((t) => t.id !== teacher.id));
    setModalAction(null);
  };

  return (
    <div dir="rtl" className="flex flex-col gap-5">
      <PageHeader
        title="المعلمون المحذوفون"
        description={`معلمون أُرشفوا من «منطقة الخطر». يُحذف المعلم وكورساته نهائياً بعد ${fmtNum(graceDays)} يوم من الأرشفة ما لم تستعده.`}
        actions={
          <Button variant={loaded ? "secondary" : "primary"} onClick={() => void fetchDeleted()} loading={loading} icon={<RefreshCw size={15} />}>
            {loaded ? "تحديث القائمة" : "عرض القائمة"}
          </Button>
        }
      />

      {canManage && (
        <Panel title="مهلة الاستعادة" icon={<Timer size={16} />} description="عدد الأيام قبل الحذف النهائي التلقائي للمعلم المؤرشف.">
          <form onSubmit={saveGraceDays} className="flex items-end gap-2">
            <Field label={`بالأيام (${bounds.min}–${bounds.max})`} htmlFor="grace-days">
              <Input
                id="grace-days"
                type="number"
                min={bounds.min}
                max={bounds.max}
                value={draftDays}
                onChange={(e) => setDraftDays(e.target.value)}
                className="w-28 text-center"
              />
            </Field>
            <Button type="submit" variant="primary" loading={savingDays} disabled={draftDays === String(graceDays)}>
              حفظ
            </Button>
          </form>
        </Panel>
      )}

      <Panel padded={false} title={loaded ? `${fmtNum(teachers.length)} معلم مؤرشف` : "القائمة"}>
        {loadError ? (
          <div className="p-4">
            <Notice tone="bad" title={loadError} action={<Button size="sm" onClick={() => void fetchDeleted()}>إعادة المحاولة</Button>} />
          </div>
        ) : !loaded ? (
          loading ? (
            <SkeletonRows rows={3} h={52} />
          ) : (
            <EmptyState
              icon={<Archive size={22} />}
              title="القائمة لم تُحمّل بعد"
              text="تحميل القائمة يحذف نهائياً أي معلم انتهت مهلة استعادته، ثم يعرض الباقين."
              action={<Button variant="primary" onClick={() => void fetchDeleted()}>عرض القائمة</Button>}
            />
          )
        ) : teachers.length === 0 ? (
          <EmptyState icon={<Archive size={22} />} title="لا يوجد معلمون مؤرشفون" />
        ) : (
          <ul className="adm-list" style={{ opacity: loading ? 0.6 : 1 }}>
            {teachers.map((t) => {
              const left = daysLeft(t.deletedAt, graceDays);
              return (
                <li key={t.id} className="adm-row">
                  <div className="flex items-center gap-3 min-w-0 flex-1 basis-60">
                    <span className="adm-avatar" style={{ background: "var(--surface-2)", color: "var(--ink-3)" }} aria-hidden>
                      {t.name?.[0] ?? "؟"}
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-bold truncate">{t.name}</p>
                      <p className="text-xs adm-muted">
                        {fmtNum(t._count?.courses ?? 0)} كورس · أُرشف {fmtDate(t.deletedAt)}
                      </p>
                    </div>
                  </div>
                  <Badge tone={left <= 2 ? "bad" : "warn"}>
                    {left > 0 ? `يُحذف خلال ${fmtNum(left)} ${left === 1 ? "يوم" : "أيام"}` : "يُحذف عند التحديث القادم"}
                  </Badge>
                  {canManage && (
                    <div className="flex gap-2">
                      <Button size="sm" variant="primary" icon={<RotateCcw size={14} />} onClick={() => setModalAction({ type: "restore", teacher: t })}>
                        استعادة
                      </Button>
                      <Button size="sm" variant="danger" icon={<Trash2 size={14} />} onClick={() => setModalAction({ type: "hard_delete", teacher: t })}>
                        حذف نهائي
                      </Button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Panel>

      {modalAction?.type === "restore" && (
        <ConfirmActionModal
          title="استعادة حساب المعلم"
          description={`سيُعاد تفعيل "‏${modalAction.teacher.name}‏" وتظهر كل كورساته مجدداً ويستطيع تسجيل الدخول.`}
          actionLabel="استعادة الحساب"
          variant="warning"
          onConfirm={handleRestore}
          onClose={() => setModalAction(null)}
        />
      )}

      {modalAction?.type === "hard_delete" && (
        <ConfirmActionModal
          title="حذف نهائي — لا يمكن التراجع"
          description={`سيُحذف "‏${modalAction.teacher.name}‏" وكل كورساته ومحتواه نهائياً ولا يمكن استرجاعه.`}
          actionLabel="حذف نهائياً"
          variant="danger"
          onConfirm={handleHardDelete}
          onClose={() => setModalAction(null)}
        />
      )}
    </div>
  );
}
