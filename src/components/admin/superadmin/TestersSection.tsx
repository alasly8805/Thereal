"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Activity, CreditCard, FileText, FlaskConical, KeyRound, Pause, Pencil, Play, PlayCircle, Plus, RefreshCw, Sparkles, Trash2 } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
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
  SearchInput,
  SkeletonRows,
  Switch,
  fmtDateTime,
  fmtNum,
  readJson,
} from "@/components/admin/ui/kit";

interface TesterCapabilities {
  bypassPayment: boolean;
  unlimitedWatches: boolean;
  isolatedExams: boolean;
  aiTesterContext: boolean;
}

interface TesterAccount {
  id: string;
  name: string;
  phone: string;
  email: string;
  accountMode: string;
  capabilities: TesterCapabilities;
  notes: string | null;
  isActive: boolean;
  createdAt: string;
  stats: {
    activityLogsCount: number;
    enrolledCoursesCount: number;
    folderPurchasesCount: number;
    videoPurchasesCount: number;
    watchSessionsCount: number;
  };
}

interface ActivityLog {
  id: string;
  action: string;
  targetId: string | null;
  targetTitle: string | null;
  details: string | null;
  ipAddress: string | null;
  createdAt: string;
}

type ModalState =
  | { type: "create" }
  | { type: "edit"; tester: TesterAccount }
  | { type: "reset_password"; tester: TesterAccount }
  | { type: "activity"; tester: TesterAccount }
  | { type: "delete"; tester: TesterAccount }
  | null;

const ALL_CAPS: TesterCapabilities = { bypassPayment: true, unlimitedWatches: true, isolatedExams: true, aiTesterContext: true };

const CAPS: Array<{ key: keyof TesterCapabilities; label: string; hint: string; icon: ReactNode }> = [
  { key: "bypassPayment", label: "تجاوز الدفع", hint: "يفتح أي كورس أو باقة بدون دفع", icon: <CreditCard size={15} /> },
  { key: "unlimitedWatches", label: "مشاهدات بلا حد", hint: "لا يُحسب عليه حد المشاهدات", icon: <PlayCircle size={15} /> },
  { key: "isolatedExams", label: "عزل الامتحانات", hint: "إجاباته لا تظهر للمعلمين ولا في لوحة الشرف", icon: <FileText size={15} /> },
  { key: "aiTesterContext", label: "سياق تشخيص AI", hint: "المساعد يعرف أنه حساب فحص", icon: <Sparkles size={15} /> },
];

export function TestersSection() {
  const { success: toastSuccess, error: toastError } = useToast();
  const [testers, setTesters] = useState<TesterAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [modal, setModal] = useState<ModalState>(null);
  const [actionError, setActionError] = useState("");
  const [busy, setBusy] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const [createForm, setCreateForm] = useState({ name: "مختبر المنصة", phone: "", password: "", notes: "", capabilities: ALL_CAPS });
  const [editForm, setEditForm] = useState({ name: "", notes: "", capabilities: ALL_CAPS });
  const [newPassword, setNewPassword] = useState("");
  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([]);
  const [activityLoading, setActivityLoading] = useState(false);

  const fetchTesters = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const res = await fetch("/api/admin/superadmin/testers", { credentials: "include" });
      const data = await readJson<{ testers?: TesterAccount[]; error?: string }>(res);
      if (!res.ok) {
        setLoadError(data?.error || "تعذر تحميل حسابات الفحص");
        return;
      }
      setTesters(data?.testers || []);
    } catch {
      setLoadError("تعذر الاتصال بالخادم");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchTesters();
  }, [fetchTesters]);

  const open = (m: ModalState) => {
    setActionError("");
    setModal(m);
  };
  const closeModal = () => {
    if (busy) return;
    setModal(null);
    setActionError("");
    setNewPassword("");
  };

  const openCreateModal = () => {
    setCreateForm({ name: "مختبر المنصة", phone: "", password: "", notes: "", capabilities: ALL_CAPS });
    open({ type: "create" });
  };

  const openEditModal = (tester: TesterAccount) => {
    setEditForm({ name: tester.name, notes: tester.notes || "", capabilities: { ...tester.capabilities } });
    open({ type: "edit", tester });
  };

  const openActivityModal = async (tester: TesterAccount) => {
    setActivityLogs([]); // never show the previous tester's history while loading
    open({ type: "activity", tester });
    setActivityLoading(true);
    try {
      const res = await fetch(`/api/admin/superadmin/testers/${tester.id}/activity`, { credentials: "include" });
      const data = await readJson<{ logs?: ActivityLog[] }>(res);
      if (res.ok) setActivityLogs(data?.logs || []);
    } finally {
      setActivityLoading(false);
    }
  };

  /** Shared request runner for the modal forms. */
  const submit = async (url: string, method: string, body: unknown, fallback: string, okMsg: string) => {
    setBusy(true);
    setActionError("");
    try {
      const res = await fetch(url, {
        method,
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const data = await readJson<{ error?: string }>(res);
      if (!res.ok) {
        setActionError(data?.error || fallback);
        return;
      }
      toastSuccess(okMsg);
      setModal(null);
      setNewPassword("");
      void fetchTesters();
    } catch {
      setActionError("تعذر الاتصال بالخادم");
    } finally {
      setBusy(false);
    }
  };

  const handleToggleActive = async (tester: TesterAccount) => {
    setTogglingId(tester.id);
    try {
      const res = await fetch(`/api/admin/superadmin/testers/${tester.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !tester.isActive }),
      });
      const data = await readJson<{ error?: string }>(res);
      if (!res.ok) throw new Error(data?.error || "تعذر تغيير حالة الحساب");
      setTesters((prev) => prev.map((t) => (t.id === tester.id ? { ...t, isActive: !t.isActive } : t)));
      toastSuccess(tester.isActive ? `أُوقف ${tester.name}` : `فُعّل ${tester.name}`);
    } catch (e) {
      toastError(e instanceof Error ? e.message : "تعذر الاتصال بالخادم");
    } finally {
      setTogglingId(null);
    }
  };

  const filteredTesters = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return testers;
    return testers.filter(
      (t) =>
        (t.name || "").toLowerCase().includes(q) ||
        (t.phone || "").includes(q) ||
        (t.notes || "").toLowerCase().includes(q)
    );
  }, [testers, searchQuery]);

  return (
    <div dir="rtl" className="flex flex-col gap-5">
      <PageHeader
        title="حسابات الفحص"
        description="حسابات QA لاختبار الكورسات والدفع والمشاهدات، معزولة تماماً: لا يراها المعلمون ولا تدخل في الأرقام المالية."
        actions={
          <>
            <Button onClick={() => void fetchTesters()} loading={loading} icon={<RefreshCw size={15} />}>تحديث</Button>
            <Button variant="primary" onClick={openCreateModal} icon={<Plus size={15} />}>حساب فحص جديد</Button>
          </>
        }
      />

      <Panel
        padded={false}
        title={loading && testers.length === 0 ? "جارٍ التحميل" : `${fmtNum(testers.length)} حساب`}
        actions={<SearchInput value={searchQuery} onChange={setSearchQuery} placeholder="الاسم أو الهاتف أو الملاحظات" inputSize="sm" className="w-64 max-w-full" />}
      >
        {loadError ? (
          <div className="p-4">
            <Notice tone="bad" title={loadError} action={<Button size="sm" onClick={() => void fetchTesters()}>إعادة المحاولة</Button>} />
          </div>
        ) : loading && testers.length === 0 ? (
          <SkeletonRows rows={3} h={72} />
        ) : filteredTesters.length === 0 ? (
          <EmptyState
            icon={<FlaskConical size={22} />}
            title={searchQuery ? "لا نتائج مطابقة" : "لا توجد حسابات فحص"}
            text={searchQuery ? "جرّب كلمات أخرى." : "أنشئ حساباً لاختبار المنصة كطالب بدون التأثير على البيانات الحقيقية."}
            action={!searchQuery ? <Button variant="primary" onClick={openCreateModal}>إنشاء أول حساب</Button> : undefined}
          />
        ) : (
          <ul className="adm-list">
            {filteredTesters.map((tester) => (
              <li key={tester.id} className="adm-row" style={{ alignItems: "flex-start" }}>
                <span className="adm-avatar" style={{ background: "var(--surface-2)", color: "var(--ink-2)" }} aria-hidden>
                  <FlaskConical size={16} />
                </span>
                <div className="min-w-0 flex-1 basis-72">
                  <p className="text-sm font-bold flex flex-wrap items-center gap-2">
                    {tester.name}
                    <span className="adm-mono adm-muted font-normal">{tester.phone}</span>
                    <Badge tone={tester.isActive ? "ok" : "bad"} dot>{tester.isActive ? "نشط" : "موقوف"}</Badge>
                  </p>
                  {tester.notes && <p className="text-xs adm-muted mt-1">{tester.notes}</p>}
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {CAPS.filter((c) => tester.capabilities[c.key]).map((c) => (
                      <Badge key={c.key} tone="neutral">
                        {c.icon}
                        {c.label}
                      </Badge>
                    ))}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <Button size="sm" variant="ghost" icon={<Activity size={14} />} onClick={() => void openActivityModal(tester)}>
                    {fmtNum(tester.stats.activityLogsCount)} حدث
                  </Button>
                  <IconButton label="تعديل الصلاحيات" size="sm" onClick={() => openEditModal(tester)}>
                    <Pencil size={15} />
                  </IconButton>
                  <IconButton
                    label="تغيير كلمة المرور"
                    size="sm"
                    onClick={() => {
                      setNewPassword("");
                      open({ type: "reset_password", tester });
                    }}
                  >
                    <KeyRound size={15} />
                  </IconButton>
                  <IconButton
                    label={tester.isActive ? "إيقاف الحساب" : "تفعيل الحساب"}
                    size="sm"
                    loading={togglingId === tester.id}
                    onClick={() => void handleToggleActive(tester)}
                  >
                    {tester.isActive ? <Pause size={15} /> : <Play size={15} />}
                  </IconButton>
                  <IconButton label="حذف الحساب" size="sm" onClick={() => open({ type: "delete", tester })} style={{ color: "var(--danger)" }}>
                    <Trash2 size={15} />
                  </IconButton>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      {/* Create */}
      <Modal
        open={modal?.type === "create"}
        onClose={closeModal}
        title="حساب فحص جديد"
        size="md"
        footer={
          <>
            <Button onClick={closeModal} disabled={busy}>إلغاء</Button>
            <Button type="submit" form="tester-create" variant="primary" loading={busy}>إنشاء الحساب</Button>
          </>
        }
      >
        <form
          id="tester-create"
          onSubmit={(e) => {
            e.preventDefault();
            void submit("/api/admin/superadmin/testers", "POST", createForm, "تعذر إنشاء حساب الفحص", `أُنشئ حساب ${createForm.name}`);
          }}
          className="grid gap-4 sm:grid-cols-2"
        >
          {actionError && <Notice tone="bad" title={actionError} className="sm:col-span-2" />}
          <Field label="اسم الحساب" htmlFor="tf-name" className="sm:col-span-2">
            <Input id="tf-name" data-autofocus required value={createForm.name} onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })} />
          </Field>
          <Field label="رقم هاتف الدخول" hint="يجب ألا يكون مستخدماً لطالب موجود" htmlFor="tf-phone">
            <Input id="tf-phone" type="tel" required mono value={createForm.phone} onChange={(e) => setCreateForm({ ...createForm, phone: e.target.value })} placeholder="01012345678" />
          </Field>
          <Field label="كلمة المرور" hint="٦ أحرف على الأقل" htmlFor="tf-pass">
            <Input id="tf-pass" type="password" required minLength={6} autoComplete="new-password" value={createForm.password} onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })} />
          </Field>
          <Field label="ملاحظات" hint="اختياري" htmlFor="tf-notes" className="sm:col-span-2">
            <Input id="tf-notes" value={createForm.notes} onChange={(e) => setCreateForm({ ...createForm, notes: e.target.value })} placeholder="مثال: لفحص بوابات الدفع" />
          </Field>
          <div className="sm:col-span-2">
            <CapabilityEditor value={createForm.capabilities} onChange={(capabilities) => setCreateForm({ ...createForm, capabilities })} />
          </div>
        </form>
      </Modal>

      {/* Edit */}
      <Modal
        open={modal?.type === "edit"}
        onClose={closeModal}
        title="تعديل حساب الفحص"
        description={modal?.type === "edit" ? modal.tester.phone : undefined}
        size="md"
        footer={
          <>
            <Button onClick={closeModal} disabled={busy}>إلغاء</Button>
            <Button type="submit" form="tester-edit" variant="primary" loading={busy}>حفظ</Button>
          </>
        }
      >
        {modal?.type === "edit" && (
          <form
            id="tester-edit"
            onSubmit={(e) => {
              e.preventDefault();
              void submit(`/api/admin/superadmin/testers/${modal.tester.id}`, "PATCH", editForm, "تعذر تحديث الحساب", "حُفظت التعديلات");
            }}
            className="flex flex-col gap-4"
          >
            {actionError && <Notice tone="bad" title={actionError} />}
            <Field label="اسم الحساب" htmlFor="te-name">
              <Input id="te-name" data-autofocus required value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} />
            </Field>
            <Field label="ملاحظات" htmlFor="te-notes">
              <Input id="te-notes" value={editForm.notes} onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })} />
            </Field>
            <CapabilityEditor value={editForm.capabilities} onChange={(capabilities) => setEditForm({ ...editForm, capabilities })} />
          </form>
        )}
      </Modal>

      {/* Reset password */}
      <Modal
        open={modal?.type === "reset_password"}
        onClose={closeModal}
        title="تغيير كلمة المرور"
        description={modal?.type === "reset_password" ? `${modal.tester.name} · ${modal.tester.phone}` : undefined}
        size="sm"
        footer={
          <>
            <Button onClick={closeModal} disabled={busy}>إلغاء</Button>
            <Button type="submit" form="tester-pass" variant="primary" loading={busy}>حفظ</Button>
          </>
        }
      >
        {modal?.type === "reset_password" && (
          <form
            id="tester-pass"
            onSubmit={(e) => {
              e.preventDefault();
              void submit(`/api/admin/superadmin/testers/${modal.tester.id}`, "PATCH", { password: newPassword }, "تعذر تغيير كلمة المرور", "تم تغيير كلمة المرور");
            }}
            className="flex flex-col gap-4"
          >
            {actionError && <Notice tone="bad" title={actionError} />}
            <Field label="كلمة المرور الجديدة" hint="٦ أحرف على الأقل" htmlFor="tp-new">
              <Input id="tp-new" data-autofocus type="password" required minLength={6} autoComplete="new-password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
            </Field>
          </form>
        )}
      </Modal>

      {/* Activity */}
      <Modal
        open={modal?.type === "activity"}
        onClose={closeModal}
        title="سجل نشاط حساب الفحص"
        description={modal?.type === "activity" ? `${modal.tester.name} · ${modal.tester.phone}` : undefined}
        size="lg"
        footer={<Button onClick={closeModal}>إغلاق</Button>}
      >
        {activityLoading ? (
          <SkeletonRows rows={4} h={56} />
        ) : activityLogs.length === 0 ? (
          <EmptyState icon={<Activity size={20} />} title="لا توجد نشاطات مسجلة بعد" />
        ) : (
          <ul className="flex flex-col gap-2">
            {activityLogs.map((log) => (
              <li key={log.id} className="adm-well p-3 flex flex-col gap-1.5 text-[13px]">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Badge tone="info"><span className="adm-mono">{log.action}</span></Badge>
                  <span className="text-xs adm-muted">{fmtDateTime(log.createdAt)}</span>
                </div>
                {log.targetTitle && (
                  <p>
                    الهدف: <b>{log.targetTitle}</b>
                  </p>
                )}
                {log.details && <pre className="adm-code" style={{ maxHeight: 160 }}>{log.details}</pre>}
                {log.ipAddress && <p className="text-xs adm-muted">IP: <span className="adm-mono">{log.ipAddress}</span></p>}
              </li>
            ))}
          </ul>
        )}
      </Modal>

      {/* Delete */}
      <Modal
        open={modal?.type === "delete"}
        onClose={closeModal}
        size="sm"
        title="حذف حساب الفحص؟"
        description={modal?.type === "delete" ? `${modal.tester.name} (${modal.tester.phone}) — لن يستطيع الدخول بعد الحذف.` : undefined}
        footer={
          <>
            <Button onClick={closeModal} disabled={busy}>إلغاء</Button>
            <Button
              variant="danger-solid"
              loading={busy}
              onClick={() =>
                modal?.type === "delete" &&
                void submit(`/api/admin/superadmin/testers/${modal.tester.id}`, "DELETE", undefined, "تعذر حذف الحساب", `حُذف ${modal.tester.name}`)
              }
            >
              حذف
            </Button>
          </>
        }
      >
        {actionError && <Notice tone="bad" title={actionError} />}
      </Modal>
    </div>
  );
}

function CapabilityEditor({ value, onChange }: { value: TesterCapabilities; onChange: (v: TesterCapabilities) => void }) {
  return (
    <fieldset className="adm-well adm-list">
      <legend className="adm-label mb-2">الصلاحيات</legend>
      {CAPS.map((c) => (
        <div key={c.key} className="flex items-center justify-between gap-3 px-3 py-2.5">
          <span className="flex items-start gap-2.5 min-w-0">
            <span className="mt-0.5" style={{ color: "var(--brand)" }} aria-hidden>{c.icon}</span>
            <span>
              <span className="text-sm font-semibold block">{c.label}</span>
              <span className="text-xs adm-muted">{c.hint}</span>
            </span>
          </span>
          <Switch checked={value[c.key]} onChange={(v) => onChange({ ...value, [c.key]: v })} label={c.label} />
        </div>
      ))}
    </fieldset>
  );
}
