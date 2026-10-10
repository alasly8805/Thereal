"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Download, Eye, EyeOff, Pencil, Plus, RefreshCw, RotateCcw, Shield, Star, Trash2 } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import {
  Badge,
  Button,
  Chip,
  EmptyState,
  Field,
  IconButton,
  Input,
  Modal,
  Notice,
  PageHeader,
  SearchInput,
  Skeleton,
  Stat,
  Switch,
  fmtDate,
  fmtNum,
  readJson,
  Panel,
} from "@/components/admin/ui/kit";

interface AxinomAccount {
  id: string;
  name: string;
  tenantId: string;
  communicationKeyId: string;
  communicationKeyMasked: string;
  keySeedId: string | null;
  widevineLicenseUrl: string;
  playreadyLicenseUrl: string;
  fairplayLicenseUrl: string;
  fairplayCertUrl: string | null;
  licenseLimit: number;
  licensesUsed: number;
  licensesRemaining: number;
  percentUsed: number;
  expiresAt: string;
  daysRemaining: number;
  isExpired: boolean;
  isActive: boolean;
  isPrimary: boolean;
  priority: number;
  notes: string | null;
  status: "primary" | "standby" | "exhausted" | "expired" | "inactive";
  isEligible: boolean;
  totalEventsCount: number;
  createdAt: string;
  updatedAt: string;
}

interface KPIStats {
  totalAccounts: number;
  activeAccounts: number;
  standbyAccounts: number;
  exhaustedAccounts: number;
  expiredAccounts: number;
  totalLicenseLimit: number;
  totalLicensesUsed: number;
  totalLicensesRemaining: number;
  overallPercentUsed: number;
}

type StatusFilter = "all" | "primary" | "standby" | "exhausted" | "expired" | "inactive";

const EMPTY_ADD = {
  name: "",
  tenantId: "",
  communicationKeyId: "",
  communicationKey: "",
  keySeedId: "",
  licenseLimit: "10000",
  validityDays: "365",
  priority: "1",
  isPrimary: true,
  notes: "",
};

type Confirm = { kind: "reset" | "delete"; account: AxinomAccount } | null;

export function AxinomSection() {
  const { success: toastSuccess, error: toastError } = useToast();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [accounts, setAccounts] = useState<AxinomAccount[]>([]);
  const [kpis, setKpis] = useState<KPIStats | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  const [showAddModal, setShowAddModal] = useState(false);
  const [editingAccount, setEditingAccount] = useState<AxinomAccount | null>(null);
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [importingEnv, setImportingEnv] = useState(false);
  const [addForm, setAddForm] = useState(EMPTY_ADD);
  const [editForm, setEditForm] = useState({
    name: "",
    tenantId: "",
    communicationKeyId: "",
    communicationKey: "",
    keySeedId: "",
    licenseLimit: "10000",
    licensesUsed: "0",
    extendDays: "",
    priority: "1",
    isPrimary: false,
    isActive: true,
    notes: "",
  });
  const [showKey, setShowKey] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ ok?: boolean; message?: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const fetchAccounts = async () => {
    setLoading(true);
    setLoadError("");
    try {
      const res = await fetch("/api/admin/superadmin/axinom", { credentials: "include" });
      const data = await readJson<{ success?: boolean; accounts?: AxinomAccount[]; kpis?: KPIStats; error?: string }>(res);
      if (!res.ok || !data?.success) throw new Error(data?.error || "تعذر جلب الحسابات");
      setAccounts(data.accounts || []);
      setKpis(data.kpis || null);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "تعذر جلب الحسابات");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchAccounts();
  }, []);

  const request = async (url: string, init: RequestInit, fallback: string) => {
    const res = await fetch(url, { credentials: "include", headers: { "Content-Type": "application/json" }, ...init });
    const data = await readJson<{ success?: boolean; ok?: boolean; message?: string; error?: string }>(res);
    if (!res.ok || !(data?.success ?? data?.ok)) throw new Error(data?.error || data?.message || fallback);
    return data;
  };

  const handleTestCredentials = async (params: { tenantId?: string; communicationKeyId?: string; communicationKey?: string; accountId?: string }) => {
    setTestingId(params.accountId ?? "new");
    setTestResult(null);
    try {
      const res = await fetch("/api/admin/superadmin/axinom/test", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(params),
      });
      const data = await readJson<{ ok?: boolean; message?: string }>(res);
      setTestResult({ ok: data?.ok, message: data?.message });
      if (data?.ok) toastSuccess(data.message || "المفتاح يعمل");
      else toastError(data?.message || "فحص المفتاح غير ناجح");
    } catch {
      setTestResult({ ok: false, message: "فشل الفحص" });
      toastError("تعذر إجراء الفحص");
    } finally {
      setTestingId(null);
    }
  };

  const handleImportEnv = async () => {
    setImportingEnv(true);
    try {
      const data = await request("/api/admin/superadmin/axinom/import-env", { method: "POST" }, "تعذر الاستيراد من .env");
      toastSuccess(data?.message || "استُورد حساب .env");
      void fetchAccounts();
    } catch (err) {
      toastError(err instanceof Error ? err.message : "تعذر الاستيراد");
    } finally {
      setImportingEnv(false);
    }
  };

  const handleAddAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addForm.name.trim() || !addForm.tenantId.trim() || !addForm.communicationKeyId.trim() || !addForm.communicationKey.trim()) {
      return toastError("املأ الاسم وTenant ID وKey ID والمفتاح السري");
    }
    setSaving(true);
    try {
      const data = await request(
        "/api/admin/superadmin/axinom",
        {
          method: "POST",
          body: JSON.stringify({
            name: addForm.name.trim(),
            tenantId: addForm.tenantId.trim(),
            communicationKeyId: addForm.communicationKeyId.trim(),
            communicationKey: addForm.communicationKey.trim(),
            keySeedId: addForm.keySeedId.trim() || undefined,
            licenseLimit: Number(addForm.licenseLimit) || 10000,
            validityDays: Number(addForm.validityDays) || 365,
            priority: Number(addForm.priority) || 1,
            isPrimary: addForm.isPrimary,
            notes: addForm.notes.trim() || undefined,
          }),
        },
        "تعذر إضافة الحساب"
      );
      toastSuccess(data?.message || "أُضيف الحساب");
      setShowAddModal(false);
      setAddForm(EMPTY_ADD);
      setTestResult(null);
      void fetchAccounts();
    } catch (err) {
      toastError(err instanceof Error ? err.message : "تعذر إضافة الحساب");
    } finally {
      setSaving(false);
    }
  };

  const openEditModal = (account: AxinomAccount) => {
    setEditingAccount(account);
    setShowKey(false);
    setEditForm({
      name: account.name,
      tenantId: account.tenantId,
      communicationKeyId: account.communicationKeyId,
      communicationKey: "",
      keySeedId: account.keySeedId || "",
      licenseLimit: String(account.licenseLimit),
      licensesUsed: String(account.licensesUsed),
      extendDays: "",
      priority: String(account.priority),
      isPrimary: account.isPrimary,
      isActive: account.isActive,
      notes: account.notes || "",
    });
  };

  const handleUpdateAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingAccount) return;
    setSaving(true);
    try {
      const data = await request(
        `/api/admin/superadmin/axinom/${editingAccount.id}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            name: editForm.name.trim() || undefined,
            tenantId: editForm.tenantId.trim() || undefined,
            communicationKeyId: editForm.communicationKeyId.trim() || undefined,
            communicationKey: editForm.communicationKey.trim() || undefined,
            keySeedId: editForm.keySeedId.trim() || null,
            licenseLimit: Number(editForm.licenseLimit) || undefined,
            licensesUsed: Number(editForm.licensesUsed) || 0,
            extendDays: Number(editForm.extendDays) || undefined,
            priority: Number(editForm.priority) || undefined,
            isPrimary: editForm.isPrimary,
            isActive: editForm.isActive,
            notes: editForm.notes.trim() || null,
          }),
        },
        "تعذر تحديث الحساب"
      );
      toastSuccess(data?.message || "حُدّث الحساب");
      setEditingAccount(null);
      void fetchAccounts();
    } catch (err) {
      toastError(err instanceof Error ? err.message : "تعذر تحديث الحساب");
    } finally {
      setSaving(false);
    }
  };

  const patchAccount = async (account: AxinomAccount, body: Record<string, unknown>, okMsg: string, fallback: string) => {
    setBusyId(account.id);
    try {
      await request(`/api/admin/superadmin/axinom/${account.id}`, { method: "PATCH", body: JSON.stringify(body) }, fallback);
      toastSuccess(okMsg);
      void fetchAccounts();
    } catch (err) {
      toastError(err instanceof Error ? err.message : fallback);
    } finally {
      setBusyId(null);
    }
  };

  const runConfirm = async () => {
    if (!confirm) return;
    setSaving(true);
    try {
      if (confirm.kind === "reset") {
        await request(`/api/admin/superadmin/axinom/${confirm.account.id}`, { method: "PATCH", body: JSON.stringify({ resetUsed: true }) }, "تعذر تصفير العداد");
        toastSuccess(`صُفّر عداد "${confirm.account.name}"`);
      } else {
        const data = await request(`/api/admin/superadmin/axinom/${confirm.account.id}`, { method: "DELETE" }, "تعذر حذف الحساب");
        toastSuccess(data?.message || "حُذف الحساب");
      }
      setConfirm(null);
      void fetchAccounts();
    } catch (err) {
      toastError(err instanceof Error ? err.message : "تعذر تنفيذ الإجراء");
    } finally {
      setSaving(false);
    }
  };

  const filteredAccounts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return accounts.filter((acc) => {
      const matches = !q || acc.name.toLowerCase().includes(q) || acc.tenantId.toLowerCase().includes(q) || acc.communicationKeyId.toLowerCase().includes(q);
      if (!matches) return false;
      if (statusFilter === "primary") return acc.isPrimary && acc.isEligible;
      if (statusFilter === "standby") return !acc.isPrimary && acc.isEligible;
      if (statusFilter === "exhausted") return acc.status === "exhausted";
      if (statusFilter === "expired") return acc.status === "expired";
      if (statusFilter === "inactive") return !acc.isActive;
      return true;
    });
  }, [accounts, searchQuery, statusFilter]);

  const statusBadge = (a: AxinomAccount) => {
    if (a.isPrimary && a.isEligible) return <Badge tone="brand" dot>الأساسي الآن</Badge>;
    if (a.status === "standby") return <Badge tone="info">احتياطي · أولوية {fmtNum(a.priority)}</Badge>;
    if (a.status === "exhausted") return <Badge tone="bad">نفد الرصيد</Badge>;
    if (a.status === "expired") return <Badge tone="bad">منتهي</Badge>;
    return <Badge>معطل</Badge>;
  };

  return (
    <div dir="rtl" className="flex flex-col gap-5">
      <PageHeader
        title="Axinom DRM"
        description="حسابات تراخيص Widevine و PlayReady. عند نفاد رصيد الحساب الأساسي أو انتهائه، تنتقل كل الفيديوهات تلقائياً للحساب الاحتياطي التالي."
        actions={
          <>
            <Button onClick={() => void fetchAccounts()} loading={loading} icon={<RefreshCw size={15} />}>تحديث</Button>
            <Button onClick={() => void handleImportEnv()} loading={importingEnv} icon={<Download size={15} />} title="استيراد أو مزامنة الحساب الموجود في .env">
              استيراد من .env
            </Button>
            <Button
              variant="primary"
              icon={<Plus size={15} />}
              onClick={() => {
                setAddForm(EMPTY_ADD);
                setTestResult(null);
                setShowKey(false);
                setShowAddModal(true);
              }}
            >
              إضافة حساب
            </Button>
          </>
        }
      />

      {loadError && <Notice tone="bad" title={loadError} action={<Button size="sm" onClick={() => void fetchAccounts()}>إعادة المحاولة</Button>} />}

      {loading && !kpis ? (
        <div className="adm-stats">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} h={96} r={12} />)}</div>
      ) : kpis ? (
        <div className="adm-stats">
          <Stat label="الحسابات" value={fmtNum(kpis.totalAccounts)} sub={`${fmtNum(kpis.activeAccounts)} فعّال · ${fmtNum(kpis.standbyAccounts)} احتياطي`} />
          <Stat label="السعة الكلية" value={fmtNum(kpis.totalLicenseLimit)} sub="شهادة" />
          <Stat label="المستهلك" value={fmtNum(kpis.totalLicensesUsed)} tone="warn" sub="شهادة أُصدرت للطلاب" />
          <Stat label="المتبقي" value={fmtNum(kpis.totalLicensesRemaining)} tone="ok" sub="رصيد آمن" />
          <Stat
            label="نسبة الاستهلاك"
            value={`${fmtNum(kpis.overallPercentUsed)}٪`}
            tone={kpis.overallPercentUsed > 85 ? "bad" : kpis.overallPercentUsed > 60 ? "warn" : "neutral"}
            sub={
              <span className="adm-bar block mt-1" style={{ height: 5 }}>
                <span style={{ display: "block", width: `${Math.min(100, kpis.overallPercentUsed)}%`, background: kpis.overallPercentUsed > 85 ? "var(--danger)" : kpis.overallPercentUsed > 60 ? "var(--warn)" : "var(--brand)" }} />
              </span>
            }
          />
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2" role="group" aria-label="حالة الحساب">
          {(
            [
              ["all", "الكل"],
              ["primary", "الأساسي"],
              ["standby", "احتياطي"],
              ["exhausted", "نفد الرصيد"],
              ["expired", "منتهي"],
              ["inactive", "معطل"],
            ] as Array<[StatusFilter, string]>
          ).map(([id, label]) => (
            <Chip key={id} pressed={statusFilter === id} onClick={() => setStatusFilter(id)}>
              {label}
            </Chip>
          ))}
        </div>
        <SearchInput value={searchQuery} onChange={setSearchQuery} placeholder="الاسم أو Tenant ID" inputSize="sm" className="w-64 max-w-full" />
      </div>

      {loading && accounts.length === 0 ? (
        <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 340px), 1fr))" }}>
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} h={260} r={16} />)}
        </div>
      ) : filteredAccounts.length === 0 ? (
        <Panel>
          <EmptyState
            icon={<Shield size={22} />}
            title={searchQuery || statusFilter !== "all" ? "لا حسابات مطابقة" : "لا توجد حسابات Axinom بعد"}
            text={searchQuery || statusFilter !== "all" ? undefined : "أضف حسابك الأول أو استورده من .env لتفعيل حماية DRM."}
            action={!searchQuery && statusFilter === "all" ? <Button variant="primary" onClick={() => setShowAddModal(true)}>إضافة حساب</Button> : undefined}
          />
        </Panel>
      ) : (
        <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 340px), 1fr))" }}>
          {filteredAccounts.map((account) => {
            const pct = Math.min(100, Math.max(0, account.percentUsed));
            const barColor = pct >= 95 ? "var(--danger)" : pct >= 75 ? "var(--warn)" : "var(--brand)";
            return (
              <article
                key={account.id}
                className="adm-panel p-4 flex flex-col gap-3"
                style={{
                  borderColor: account.isPrimary && account.isEligible ? "var(--brand)" : account.status === "exhausted" ? "color-mix(in srgb, var(--danger) 40%, var(--border))" : undefined,
                  opacity: account.isActive ? 1 : 0.7,
                }}
              >
                <header className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="adm-h3 truncate flex items-center gap-1.5">
                      {account.isPrimary && <Star size={14} style={{ color: "var(--brand)" }} aria-label="أساسي" />}
                      {account.name}
                    </h3>
                    <p className="text-xs adm-muted mt-0.5">Tenant <span className="adm-mono">{account.tenantId}</span></p>
                  </div>
                  {statusBadge(account)}
                </header>

                <div>
                  <div className="flex items-center justify-between text-xs mb-1.5">
                    <span className="adm-muted">الشهادات</span>
                    <span className="adm-num font-bold">{fmtNum(account.licensesUsed)} / {fmtNum(account.licenseLimit)} · {fmtNum(account.percentUsed)}٪</span>
                  </div>
                  <div className="adm-bar" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={`استهلاك ${account.name}`}>
                    <span style={{ width: `${pct}%`, background: barColor }} />
                  </div>
                  <div className="flex items-center justify-between text-xs adm-muted mt-1.5">
                    <span>متبقٍ <b style={{ color: "var(--ok)" }}>{fmtNum(account.licensesRemaining)}</b></span>
                    <span>طلبات <b className="adm-num">{fmtNum(account.totalEventsCount)}</b></span>
                  </div>
                </div>

                <dl className="adm-well grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 p-3 text-xs">
                  <dt className="adm-muted">الصلاحية</dt>
                  <dd className="font-semibold" style={{ color: account.isExpired || account.daysRemaining <= 7 ? "var(--danger)" : undefined }}>
                    {account.isExpired ? "منتهي" : `${fmtNum(account.daysRemaining)} يوم`} · {fmtDate(account.expiresAt)}
                  </dd>
                  <dt className="adm-muted">المفتاح</dt>
                  <dd className="adm-mono truncate">{account.communicationKeyMasked}</dd>
                  <dt className="adm-muted">Key ID</dt>
                  <dd className="adm-mono truncate" title={account.communicationKeyId}>{account.communicationKeyId}</dd>
                </dl>

                {account.notes && <p className="text-xs adm-muted">{account.notes}</p>}

                <footer className="flex items-center justify-between gap-1 pt-2" style={{ borderTop: "1px solid var(--border)" }}>
                  <div className="flex items-center gap-1">
                    {!account.isPrimary && account.isEligible && (
                      <Button size="sm" variant="ghost" icon={<Star size={14} />} loading={busyId === account.id} onClick={() => void patchAccount(account, { isPrimary: true }, `"${account.name}" هو الأساسي الآن`, "تعذر تعيين الحساب كأساسي")}>
                        اجعله الأساسي
                      </Button>
                    )}
                    <IconButton label="فحص المفتاح" size="sm" loading={testingId === account.id} disabled={testingId !== null && testingId !== account.id} onClick={() => void handleTestCredentials({ accountId: account.id })}>
                      <CheckCircle2 size={15} />
                    </IconButton>
                    <IconButton label="تصفير عداد الشهادات" size="sm" onClick={() => setConfirm({ kind: "reset", account })}>
                      <RotateCcw size={15} />
                    </IconButton>
                    <IconButton label="تعديل" size="sm" onClick={() => openEditModal(account)}>
                      <Pencil size={15} />
                    </IconButton>
                    <IconButton label="حذف" size="sm" onClick={() => setConfirm({ kind: "delete", account })} style={{ color: "var(--danger)" }}>
                      <Trash2 size={15} />
                    </IconButton>
                  </div>
                  <Switch
                    checked={account.isActive}
                    onChange={() => void patchAccount(account, { isActive: !account.isActive }, account.isActive ? "عُطّل الحساب" : "فُعّل الحساب", "تعذر تعديل حالة الحساب")}
                    disabled={busyId === account.id}
                    label={`تفعيل ${account.name}`}
                  />
                </footer>
              </article>
            );
          })}
        </div>
      )}

      {/* Add */}
      <Modal
        open={showAddModal}
        onClose={() => !saving && setShowAddModal(false)}
        title="إضافة حساب Axinom"
        size="lg"
        footer={
          <>
            <Button
              icon={<CheckCircle2 size={15} />}
              loading={testingId === "new"}
              disabled={!addForm.communicationKey || !addForm.tenantId || !addForm.communicationKeyId}
              onClick={() => void handleTestCredentials({ tenantId: addForm.tenantId, communicationKeyId: addForm.communicationKeyId, communicationKey: addForm.communicationKey })}
            >
              فحص المفتاح
            </Button>
            <span className="flex-1" />
            <Button onClick={() => setShowAddModal(false)} disabled={saving}>إلغاء</Button>
            <Button type="submit" form="axn-add" variant="primary" loading={saving}>حفظ الحساب</Button>
          </>
        }
      >
        <form id="axn-add" onSubmit={handleAddAccount} className="grid gap-4 sm:grid-cols-2">
          <Field label="اسم الحساب" htmlFor="ax-name">
            <Input id="ax-name" data-autofocus required value={addForm.name} onChange={(e) => setAddForm({ ...addForm, name: e.target.value })} placeholder="Axinom Account 01" />
          </Field>
          <Field label="Tenant ID" htmlFor="ax-tenant">
            <Input id="ax-tenant" required mono value={addForm.tenantId} onChange={(e) => setAddForm({ ...addForm, tenantId: e.target.value })} />
          </Field>
          <Field label="Communication Key ID" htmlFor="ax-kid" className="sm:col-span-2">
            <Input id="ax-kid" required mono value={addForm.communicationKeyId} onChange={(e) => setAddForm({ ...addForm, communicationKeyId: e.target.value })} />
          </Field>
          <Field label="Communication Key" hint="يُخزّن مشفّراً (AES-256-GCM) ولا يُعرض للواجهة أبداً" htmlFor="ax-key" className="sm:col-span-2">
            <SecretInput id="ax-key" required value={addForm.communicationKey} onChange={(v) => setAddForm({ ...addForm, communicationKey: v })} show={showKey} onToggle={() => setShowKey((s) => !s)} />
          </Field>
          <Field label="حد الشهادات" htmlFor="ax-limit">
            <Input id="ax-limit" type="number" min="100" max="1000000" mono value={addForm.licenseLimit} onChange={(e) => setAddForm({ ...addForm, licenseLimit: e.target.value })} />
          </Field>
          <Field label="الصلاحية (أيام)" htmlFor="ax-days">
            <Input id="ax-days" type="number" min="1" max="1825" mono value={addForm.validityDays} onChange={(e) => setAddForm({ ...addForm, validityDays: e.target.value })} />
          </Field>
          <Field label="الأولوية" hint="١ = الأعلى" htmlFor="ax-pri">
            <Input id="ax-pri" type="number" min="1" max="99" mono value={addForm.priority} onChange={(e) => setAddForm({ ...addForm, priority: e.target.value })} />
          </Field>
          <Field label="Key Seed ID" hint="اختياري" htmlFor="ax-seed">
            <Input id="ax-seed" mono value={addForm.keySeedId} onChange={(e) => setAddForm({ ...addForm, keySeedId: e.target.value })} />
          </Field>
          <Field label="ملاحظات" hint="اختياري" htmlFor="ax-notes" className="sm:col-span-2">
            <Input id="ax-notes" value={addForm.notes} onChange={(e) => setAddForm({ ...addForm, notes: e.target.value })} />
          </Field>
          <label className="sm:col-span-2 adm-well flex items-center justify-between gap-3 px-3 py-2.5">
            <span className="text-sm font-semibold">اجعله الحساب الأساسي فوراً</span>
            <Switch checked={addForm.isPrimary} onChange={(v) => setAddForm({ ...addForm, isPrimary: v })} label="حساب أساسي" />
          </label>
          {testResult && <Notice tone={testResult.ok ? "ok" : "bad"} title={testResult.message || (testResult.ok ? "المفتاح يعمل" : "فشل الفحص")} className="sm:col-span-2" />}
        </form>
      </Modal>

      {/* Edit */}
      <Modal
        open={!!editingAccount}
        onClose={() => !saving && setEditingAccount(null)}
        title="تعديل حساب Axinom"
        description={editingAccount?.name}
        size="lg"
        footer={
          <>
            <Button onClick={() => setEditingAccount(null)} disabled={saving}>إلغاء</Button>
            <Button type="submit" form="axn-edit" variant="primary" loading={saving}>حفظ</Button>
          </>
        }
      >
        <form id="axn-edit" onSubmit={handleUpdateAccount} className="grid gap-4 sm:grid-cols-2">
          <Field label="اسم الحساب" htmlFor="axe-name">
            <Input id="axe-name" data-autofocus value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} />
          </Field>
          <Field label="Tenant ID" htmlFor="axe-tenant">
            <Input id="axe-tenant" mono value={editForm.tenantId} onChange={(e) => setEditForm({ ...editForm, tenantId: e.target.value })} />
          </Field>
          <Field label="Communication Key ID" htmlFor="axe-kid" className="sm:col-span-2">
            <Input id="axe-kid" mono value={editForm.communicationKeyId} onChange={(e) => setEditForm({ ...editForm, communicationKeyId: e.target.value })} />
          </Field>
          <Field label="Communication Key جديد" hint="اتركه فارغاً للإبقاء على المفتاح الحالي" htmlFor="axe-key" className="sm:col-span-2">
            <SecretInput id="axe-key" value={editForm.communicationKey} onChange={(v) => setEditForm({ ...editForm, communicationKey: v })} show={showKey} onToggle={() => setShowKey((s) => !s)} />
          </Field>
          <Field label="حد الشهادات" htmlFor="axe-limit">
            <Input id="axe-limit" type="number" min="1" mono value={editForm.licenseLimit} onChange={(e) => setEditForm({ ...editForm, licenseLimit: e.target.value })} />
          </Field>
          <Field label="الشهادات المستهلكة" htmlFor="axe-used">
            <Input id="axe-used" type="number" min="0" mono value={editForm.licensesUsed} onChange={(e) => setEditForm({ ...editForm, licensesUsed: e.target.value })} />
          </Field>
          <Field label="تمديد الصلاحية (+ أيام)" htmlFor="axe-ext">
            <Input id="axe-ext" type="number" min="0" mono value={editForm.extendDays} onChange={(e) => setEditForm({ ...editForm, extendDays: e.target.value })} placeholder="0" />
          </Field>
          <Field label="الأولوية" hint="١ = الأعلى" htmlFor="axe-pri">
            <Input id="axe-pri" type="number" min="1" max="99" mono value={editForm.priority} onChange={(e) => setEditForm({ ...editForm, priority: e.target.value })} />
          </Field>
          <Field label="Key Seed ID" htmlFor="axe-seed">
            <Input id="axe-seed" mono value={editForm.keySeedId} onChange={(e) => setEditForm({ ...editForm, keySeedId: e.target.value })} />
          </Field>
          <Field label="ملاحظات" htmlFor="axe-notes">
            <Input id="axe-notes" value={editForm.notes} onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })} />
          </Field>
          <div className="sm:col-span-2 adm-well adm-list">
            <label className="flex items-center justify-between gap-3 px-3 py-2.5">
              <span className="text-sm font-semibold">الحساب الأساسي</span>
              <Switch checked={editForm.isPrimary} onChange={(v) => setEditForm({ ...editForm, isPrimary: v })} label="الحساب الأساسي" />
            </label>
            <label className="flex items-center justify-between gap-3 px-3 py-2.5">
              <span className="text-sm font-semibold">الحساب مفعّل</span>
              <Switch checked={editForm.isActive} onChange={(v) => setEditForm({ ...editForm, isActive: v })} label="الحساب مفعّل" />
            </label>
          </div>
        </form>
      </Modal>

      <Modal
        open={!!confirm}
        onClose={() => !saving && setConfirm(null)}
        size="sm"
        title={confirm?.kind === "delete" ? "حذف حساب Axinom؟" : "تصفير عداد الشهادات؟"}
        description={
          confirm
            ? confirm.kind === "delete"
              ? `سيُحذف "${confirm.account.name}" وسجل التراخيص المرتبط به.`
              : `سيعود عداد الشهادات المستهلكة لـ "${confirm.account.name}" إلى صفر.`
            : undefined
        }
        footer={
          <>
            <Button onClick={() => setConfirm(null)} disabled={saving}>إلغاء</Button>
            <Button variant={confirm?.kind === "delete" ? "danger-solid" : "primary"} loading={saving} onClick={() => void runConfirm()}>
              {confirm?.kind === "delete" ? "حذف" : "تصفير"}
            </Button>
          </>
        }
      />
    </div>
  );
}

function SecretInput({
  id,
  value,
  onChange,
  show,
  onToggle,
  required,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  show: boolean;
  onToggle: () => void;
  required?: boolean;
}) {
  return (
    <div className="relative">
      <Input id={id} type={show ? "text" : "password"} required={required} mono autoComplete="off" value={value} onChange={(e) => onChange(e.target.value)} style={{ paddingLeft: 44 }} />
      <button type="button" onClick={onToggle} className="adm-btn is-ghost is-icon is-sm absolute top-1/2 -translate-y-1/2" style={{ left: 4 }} aria-label={show ? "إخفاء المفتاح" : "إظهار المفتاح"}>
        {show ? <EyeOff size={15} /> : <Eye size={15} />}
      </button>
    </div>
  );
}
