"use client";
import { useCallback, useEffect, useState } from "react";
import { KeyRound, Lock, Pause, Play, Plus, Trash2, UserCog } from "lucide-react";
import { hasPermission } from "@/lib/rbac";
import { useToast } from "@/components/ui/Toast";
import { ConfirmActionModal } from "./ConfirmActionModal";
import {
  Badge,
  Button,
  EmptyState,
  Field,
  IconButton,
  Input,
  Modal,
  Notice,
  PageHeader,
  Panel,
  Select,
  SkeletonRows,
  fmtDate,
  fmtNum,
  readJson,
} from "@/components/admin/ui/kit";

interface StaffAccount {
  id: string;
  name: string;
  email: string;
  role: "admin" | "staff";
  isActive: boolean;
  createdAt: string;
}

const ROLE_LABELS: Record<string, string> = { admin: "مشرف", staff: "موظف" };
const EMPTY_FORM = { name: "", email: "", password: "", role: "staff", actionPassword: "" };

function storedActionPassword() {
  try {
    return sessionStorage.getItem("admin_action_password") || "";
  } catch {
    return "";
  }
}

export function StaffAccountsSection({ userRole = "superadmin" }: { userRole?: string }) {
  const { success: toastSuccess } = useToast();
  const canManage = hasPermission(userRole, "manage_staff_accounts");
  const canView = hasPermission(userRole, "view_staff_accounts");
  const [accounts, setAccounts] = useState<StaffAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [resetTarget, setResetTarget] = useState<StaffAccount | null>(null);
  const [resetForm, setResetForm] = useState({ newPassword: "", actionPassword: "" });
  const [suspendTarget, setSuspendTarget] = useState<StaffAccount | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<StaffAccount | null>(null);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState("");

  const fetchAccounts = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const res = await fetch("/api/admin/superadmin/staff-accounts", { credentials: "include" });
      const data = await readJson<{ accounts?: StaffAccount[]; error?: string }>(res);
      if (!res.ok) {
        setLoadError(data?.error ?? "تعذر تحميل الحسابات");
        return;
      }
      setAccounts(data?.accounts ?? []);
    } catch {
      setLoadError("تعذر الاتصال بالخادم");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (canView) void fetchAccounts();
    else setLoading(false);
  }, [canView, fetchAccounts]);

  const openCreate = () => {
    setForm({ ...EMPTY_FORM, actionPassword: storedActionPassword() });
    setFormError("");
    setCreateOpen(true);
  };

  const openReset = (acc: StaffAccount) => {
    setResetForm({ newPassword: "", actionPassword: storedActionPassword() });
    setFormError("");
    setResetTarget(acc);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setFormError("");
    try {
      const res = await fetch("/api/admin/superadmin/staff-accounts", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await readJson<{ error?: string }>(res);
      if (!res.ok) {
        setFormError(data?.error ?? "تعذر إنشاء الحساب");
        return;
      }
      toastSuccess(`أُنشئ حساب ${form.name}`);
      setCreateOpen(false);
      void fetchAccounts();
    } catch {
      setFormError("تعذر الاتصال بالخادم");
    } finally {
      setBusy(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetTarget) return;
    setBusy(true);
    setFormError("");
    try {
      const res = await fetch(`/api/admin/superadmin/staff-accounts/${resetTarget.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reset_password", ...resetForm }),
      });
      const data = await readJson<{ error?: string }>(res);
      if (!res.ok) {
        setFormError(data?.error ?? "تعذر تغيير كلمة المرور");
        return;
      }
      toastSuccess(`تم تغيير كلمة مرور ${resetTarget.name}`);
      setResetTarget(null);
    } catch {
      setFormError("تعذر الاتصال بالخادم");
    } finally {
      setBusy(false);
    }
  };

  // ConfirmActionModal shows thrown errors inline and stays open.
  const handleToggleActive = async (actionPassword: string) => {
    if (!suspendTarget) return;
    const res = await fetch(`/api/admin/superadmin/staff-accounts/${suspendTarget.id}`, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "toggle_active", actionPassword }),
    });
    const data = await readJson<{ error?: string }>(res);
    if (!res.ok) throw new Error(data?.error ?? "تعذر تغيير حالة الحساب");
    toastSuccess(suspendTarget.isActive ? `أُوقف حساب ${suspendTarget.name}` : `أُعيد تفعيل حساب ${suspendTarget.name}`);
    setSuspendTarget(null);
    void fetchAccounts();
  };

  const handleDelete = async (actionPassword: string) => {
    if (!deleteTarget) return;
    const res = await fetch(`/api/admin/superadmin/staff-accounts/${deleteTarget.id}`, {
      method: "DELETE",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ actionPassword }),
    });
    const data = await readJson<{ error?: string }>(res);
    if (!res.ok) throw new Error(data?.error ?? "تعذر حذف الحساب");
    toastSuccess(`حُذف حساب ${deleteTarget.name}`);
    setDeleteTarget(null);
    void fetchAccounts();
  };

  if (!canView) {
    return (
      <div dir="rtl" className="flex flex-col gap-5">
        <PageHeader title="المشرفون والموظفون" />
        <Panel>
          <EmptyState icon={<Lock size={22} />} title="غير متاح لحسابك" text="عرض حسابات المشرفين متاح للمشرف العام والمشرفين فقط." />
        </Panel>
      </div>
    );
  }

  return (
    <div dir="rtl" className="flex flex-col gap-5">
      <PageHeader
        title="المشرفون والموظفون"
        description="حسابات الدخول للوحة الإدارة. المشرف يدير المتعلمين والمعلمين، والموظف يطّلع فقط."
        actions={
          canManage && (
            <Button variant="primary" onClick={openCreate} icon={<Plus size={15} />}>
              إضافة حساب
            </Button>
          )
        }
      />

      <Panel padded={false} title={loading && accounts.length === 0 ? "جارٍ التحميل" : `${fmtNum(accounts.length)} حساب`}>
        {loadError ? (
          <div className="p-4">
            <Notice tone="bad" title={loadError} action={<Button size="sm" onClick={() => void fetchAccounts()}>إعادة المحاولة</Button>} />
          </div>
        ) : loading && accounts.length === 0 ? (
          <SkeletonRows rows={3} h={52} />
        ) : accounts.length === 0 ? (
          <EmptyState
            icon={<UserCog size={22} />}
            title="لا توجد حسابات بعد"
            text="أضف مشرفاً أو موظفاً ليساعدك في إدارة المنصة."
            action={canManage ? <Button variant="primary" onClick={openCreate}>إضافة أول حساب</Button> : undefined}
          />
        ) : (
          <ul className="adm-list">
            {accounts.map((acc) => (
              <li key={acc.id} className="adm-row">
                <div className="flex items-center gap-3 min-w-0 flex-1 basis-60">
                  <span className="adm-avatar" aria-hidden>{acc.name?.[0] ?? "؟"}</span>
                  <div className="min-w-0">
                    <p className="text-sm font-bold flex flex-wrap items-center gap-2">
                      <span className="truncate">{acc.name}</span>
                      <Badge tone={acc.role === "admin" ? "brand" : "neutral"}>{ROLE_LABELS[acc.role] ?? acc.role}</Badge>
                      {!acc.isActive && <Badge tone="bad">موقوف</Badge>}
                    </p>
                    <p className="text-xs adm-muted truncate">
                      <span className="adm-mono">{acc.email}</span> · أُنشئ {fmtDate(acc.createdAt)}
                    </p>
                  </div>
                </div>
                {canManage && (
                  <div className="flex items-center gap-1">
                    <IconButton label="تغيير كلمة المرور" size="sm" onClick={() => openReset(acc)}>
                      <KeyRound size={15} />
                    </IconButton>
                    <IconButton label={acc.isActive ? "إيقاف الحساب" : "تفعيل الحساب"} size="sm" onClick={() => setSuspendTarget(acc)}>
                      {acc.isActive ? <Pause size={15} /> : <Play size={15} />}
                    </IconButton>
                    <IconButton label="حذف الحساب" size="sm" onClick={() => setDeleteTarget(acc)} style={{ color: "var(--danger)" }}>
                      <Trash2 size={15} />
                    </IconButton>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Modal
        open={createOpen}
        onClose={() => !busy && setCreateOpen(false)}
        title="إضافة حساب"
        size="md"
        footer={
          <>
            <Button onClick={() => setCreateOpen(false)} disabled={busy}>إلغاء</Button>
            <Button type="submit" form="staff-create" variant="primary" loading={busy}>إنشاء الحساب</Button>
          </>
        }
      >
        <form id="staff-create" onSubmit={handleCreate} className="grid gap-4 sm:grid-cols-2">
          {formError && <Notice tone="bad" title={formError} className="sm:col-span-2" />}
          <Field label="الاسم الكامل" htmlFor="sf-name" className="sm:col-span-2">
            <Input id="sf-name" data-autofocus required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="أحمد محمد" />
          </Field>
          <Field label="البريد الإلكتروني" htmlFor="sf-email" className="sm:col-span-2">
            <Input id="sf-email" required type="email" mono value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="ahmed@example.com" />
          </Field>
          <Field label="كلمة المرور" hint="٦ أحرف على الأقل" htmlFor="sf-pass">
            <Input id="sf-pass" required type="password" minLength={6} autoComplete="new-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
          </Field>
          <Field label="الدور" htmlFor="sf-role">
            <Select id="sf-role" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
              <option value="staff">موظف — اطلاع فقط</option>
              <option value="admin">مشرف — إدارة</option>
            </Select>
          </Field>
          <Field label="كلمة مرور الإجراء" htmlFor="sf-action" className="sm:col-span-2">
            <Input id="sf-action" required type="password" autoComplete="current-password" value={form.actionPassword} onChange={(e) => setForm({ ...form, actionPassword: e.target.value })} />
          </Field>
        </form>
      </Modal>

      <Modal
        open={!!resetTarget}
        onClose={() => !busy && setResetTarget(null)}
        title="تغيير كلمة المرور"
        description={resetTarget?.name}
        size="sm"
        footer={
          <>
            <Button onClick={() => setResetTarget(null)} disabled={busy}>إلغاء</Button>
            <Button type="submit" form="staff-reset" variant="primary" loading={busy}>حفظ</Button>
          </>
        }
      >
        <form id="staff-reset" onSubmit={handleResetPassword} className="flex flex-col gap-4">
          {formError && <Notice tone="bad" title={formError} />}
          <Field label="كلمة المرور الجديدة" hint="٦ أحرف على الأقل" htmlFor="sr-new">
            <Input id="sr-new" data-autofocus required type="password" minLength={6} autoComplete="new-password" value={resetForm.newPassword} onChange={(e) => setResetForm({ ...resetForm, newPassword: e.target.value })} />
          </Field>
          <Field label="كلمة مرور الإجراء" htmlFor="sr-action">
            <Input id="sr-action" required type="password" autoComplete="current-password" value={resetForm.actionPassword} onChange={(e) => setResetForm({ ...resetForm, actionPassword: e.target.value })} />
          </Field>
        </form>
      </Modal>

      {suspendTarget && (
        <ConfirmActionModal
          title={suspendTarget.isActive ? "إيقاف الحساب" : "تفعيل الحساب"}
          description={
            suspendTarget.isActive
              ? `سيُمنع "${suspendTarget.name}" من تسجيل الدخول للوحة حتى تعيد تفعيله.`
              : `سيستطيع "${suspendTarget.name}" تسجيل الدخول مجدداً.`
          }
          actionLabel={suspendTarget.isActive ? "إيقاف" : "تفعيل"}
          variant="warning"
          onConfirm={handleToggleActive}
          onClose={() => setSuspendTarget(null)}
        />
      )}

      {deleteTarget && (
        <ConfirmActionModal
          title="حذف الحساب"
          description={`سيُحذف حساب "${deleteTarget.name}" (${deleteTarget.email}) ولن يستطيع الدخول للوحة.`}
          actionLabel="حذف الحساب"
          variant="danger"
          onConfirm={handleDelete}
          onClose={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}
