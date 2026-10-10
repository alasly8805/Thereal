"use client";

import { useEffect, useMemo, useState } from "react";
import { Eye, EyeOff, FlaskConical, Lock, Pencil, Plus, RefreshCw, Trash2, Video } from "lucide-react";
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
  Panel,
  SearchInput,
  Skeleton,
  Stat,
  Switch,
  fmtNum,
  readJson,
} from "@/components/admin/ui/kit";

interface VdoCipherAccount {
  id: string;
  name: string;
  apiKeyMasked: string;
  playerId: string | null;
  bandwidthLimitBytes: number;
  bandwidthUsedBytes: number;
  bandwidthReservedBytes: number;
  bandwidthSafeRemainingBytes: number;
  bandwidthLimitGb: number;
  bandwidthUsedGb: number;
  bandwidthSafeRemainingGb: number;
  bandwidthPercentUsed: number;
  expiresAt: string;
  daysRemaining: number;
  isExpired: boolean;
  isActive: boolean;
  notes: string | null;
  activeViewersCount: number;
  totalVideosCount: number;
  isEligibleForUpload: boolean;
  isEligibleForPlayback: boolean;
  createdAt: string;
  updatedAt: string;
}

interface KPIStats {
  totalAccounts: number;
  activeAccounts: number;
  expiredAccounts: number;
  totalBandwidthLimitGb: number;
  totalBandwidthUsedGb: number;
  totalSafeRemainingGb: number;
  totalActiveViewers: number;
}

type StatusFilter = "all" | "active" | "near_limit" | "expired" | "inactive";

const EMPTY_ADD = { name: "", apiKey: "", playerId: "", bandwidthLimitGb: "5", validityDays: "30", notes: "" };

export function VdoCipherSection() {
  const { success: toastSuccess, error: toastError } = useToast();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [accounts, setAccounts] = useState<VdoCipherAccount[]>([]);
  const [kpis, setKpis] = useState<KPIStats | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  const [showAddModal, setShowAddModal] = useState(false);
  const [editingAccount, setEditingAccount] = useState<VdoCipherAccount | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<VdoCipherAccount | null>(null);
  const [reconciling, setReconciling] = useState(false);
  const [addForm, setAddForm] = useState(EMPTY_ADD);
  const [editForm, setEditForm] = useState({ name: "", apiKey: "", playerId: "", bandwidthLimitGb: "5", extendDays: "", isActive: true, notes: "" });
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ ok?: boolean; message?: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [securityPassword, setSecurityPassword] = useState("");
  const [savedSecurityPassword, setSavedSecurityPassword] = useState("");
  const [savingPass, setSavingPass] = useState(false);
  const [showPass, setShowPass] = useState(false);

  const fetchAccounts = async () => {
    setLoading(true);
    setLoadError("");
    try {
      const res = await fetch("/api/admin/superadmin/vdocipher", { credentials: "include" });
      const data = await readJson<{ success?: boolean; accounts?: VdoCipherAccount[]; kpis?: KPIStats; error?: string }>(res);
      if (!res.ok || !data?.success) throw new Error(data?.error || "تعذر جلب الحسابات");
      setAccounts(data.accounts || []);
      setKpis(data.kpis || null);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "تعذر جلب الحسابات");
    } finally {
      setLoading(false);
    }
  };

  const fetchSecurityPassword = async () => {
    try {
      const res = await fetch("/api/admin/config", { credentials: "include" });
      const json = await readJson<{ groups?: Array<{ items?: Array<{ key: string; value: string }> }> }>(res);
      for (const group of json?.groups ?? []) {
        const item = group.items?.find((i) => i.key === "vdocipher_security_password");
        if (item) {
          setSecurityPassword(item.value || "");
          setSavedSecurityPassword(item.value || "");
          break;
        }
      }
    } catch {
      /* optional */
    }
  };

  useEffect(() => {
    void fetchAccounts();
    void fetchSecurityPassword();
  }, []);

  const handleSaveSecurityPassword = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setSavingPass(true);
    try {
      const res = await fetch("/api/admin/config", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: "vdocipher_security_password", value: securityPassword.trim() }),
      });
      const json = await readJson<{ error?: string }>(res);
      if (!res.ok) throw new Error(json?.error || "تعذر حفظ كلمة المرور");
      setSavedSecurityPassword(securityPassword.trim());
      toastSuccess("حُدّثت كلمة مرور حماية VdoCipher للمعلمين");
    } catch (err) {
      toastError(err instanceof Error ? err.message : "فشل الحفظ");
    } finally {
      setSavingPass(false);
    }
  };

  const handleReconcile = async () => {
    setReconciling(true);
    try {
      const res = await fetch("/api/admin/superadmin/vdocipher/reconcile", { method: "POST", credentials: "include" });
      const data = await readJson<{ success?: boolean; message?: string; error?: string }>(res);
      if (!res.ok || !data?.success) throw new Error(data?.error || "فشلت المزامنة");
      toastSuccess(data.message || "تمت المزامنة");
      await fetchAccounts();
    } catch (err) {
      toastError(err instanceof Error ? err.message : "حدث خطأ أثناء المزامنة");
    } finally {
      setReconciling(false);
    }
  };

  const handleTestApiKey = async (apiKey: string, accountId?: string) => {
    setTestingId(accountId ?? "new");
    setTestResult(null);
    try {
      const res = await fetch("/api/admin/superadmin/vdocipher/test", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey, accountId }),
      });
      const data = await readJson<{ ok?: boolean; message?: string; error?: string }>(res);
      setTestResult({ ok: data?.ok, message: data?.message || data?.error });
      if (data?.ok) toastSuccess(data.message || "الاتصال يعمل");
      else toastError(data?.error || data?.message || "فحص الاتصال غير ناجح");
    } catch {
      setTestResult({ ok: false, message: "فشل الاتصال" });
      toastError("تعذر إجراء فحص الاتصال");
    } finally {
      setTestingId(null);
    }
  };

  const handleAddAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addForm.name.trim() || !addForm.apiKey.trim()) return toastError("اكتب اسم الحساب ومفتاح الـ API");
    setSaving(true);
    try {
      const res = await fetch("/api/admin/superadmin/vdocipher", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: addForm.name.trim(),
          apiKey: addForm.apiKey.trim(),
          playerId: addForm.playerId.trim() || null,
          bandwidthLimitGb: Number(addForm.bandwidthLimitGb) || 5,
          validityDays: Number(addForm.validityDays) || 30,
          notes: addForm.notes.trim() || null,
        }),
      });
      const data = await readJson<{ success?: boolean; message?: string; error?: string }>(res);
      if (!res.ok || !data?.success) throw new Error(data?.error || "تعذر إضافة الحساب");
      toastSuccess(data.message || "أُضيف الحساب");
      setShowAddModal(false);
      setAddForm(EMPTY_ADD);
      setTestResult(null);
      void fetchAccounts();
    } catch (err) {
      toastError(err instanceof Error ? err.message : "حدث خطأ أثناء الحفظ");
    } finally {
      setSaving(false);
    }
  };

  const openEdit = (account: VdoCipherAccount) => {
    setEditingAccount(account);
    setEditForm({
      name: account.name,
      apiKey: "",
      playerId: account.playerId || "",
      bandwidthLimitGb: String(account.bandwidthLimitGb),
      extendDays: "",
      isActive: account.isActive,
      notes: account.notes || "",
    });
  };

  const handleUpdateAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingAccount) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/superadmin/vdocipher/${editingAccount.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editForm.name.trim() || undefined,
          apiKey: editForm.apiKey.trim() || undefined,
          playerId: editForm.playerId.trim() || null,
          bandwidthLimitGb: Number(editForm.bandwidthLimitGb) || undefined,
          extendDays: Number(editForm.extendDays) || undefined,
          isActive: editForm.isActive,
          notes: editForm.notes.trim() || null,
        }),
      });
      const data = await readJson<{ success?: boolean; message?: string; error?: string }>(res);
      if (!res.ok || !data?.success) throw new Error(data?.error || "تعذر تحديث الحساب");
      toastSuccess(data.message || "حُدّث الحساب");
      setEditingAccount(null);
      void fetchAccounts();
    } catch (err) {
      toastError(err instanceof Error ? err.message : "حدث خطأ أثناء التحديث");
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (account: VdoCipherAccount) => {
    setBusyId(account.id);
    try {
      const res = await fetch(`/api/admin/superadmin/vdocipher/${account.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !account.isActive }),
      });
      const data = await readJson<{ success?: boolean; error?: string }>(res);
      if (!res.ok || !data?.success) throw new Error(data?.error || "تعذر تعديل حالة الحساب");
      toastSuccess(account.isActive ? "عُطّل الحساب" : "فُعّل الحساب");
      void fetchAccounts();
    } catch (err) {
      toastError(err instanceof Error ? err.message : "تعذر تعديل حالة الحساب");
    } finally {
      setBusyId(null);
    }
  };

  const handleDeleteAccount = async () => {
    if (!deleteTarget) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/superadmin/vdocipher/${deleteTarget.id}`, { method: "DELETE", credentials: "include" });
      const data = await readJson<{ success?: boolean; message?: string; error?: string }>(res);
      if (!res.ok || !data?.success) throw new Error(data?.error || "تعذر حذف الحساب");
      toastSuccess(data.message || "حُذف الحساب");
      setDeleteTarget(null);
      void fetchAccounts();
    } catch (err) {
      toastError(err instanceof Error ? err.message : "تعذر حذف الحساب");
    } finally {
      setSaving(false);
    }
  };

  const filteredAccounts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return accounts.filter((acc) => {
      const matchSearch =
        !q ||
        acc.name.toLowerCase().includes(q) ||
        (acc.notes || "").toLowerCase().includes(q) ||
        (acc.playerId || "").toLowerCase().includes(q);
      if (!matchSearch) return false;
      if (statusFilter === "active") return acc.isActive && !acc.isExpired;
      if (statusFilter === "near_limit") return acc.bandwidthPercentUsed >= 80;
      if (statusFilter === "expired") return acc.isExpired;
      if (statusFilter === "inactive") return !acc.isActive;
      return true;
    });
  }, [accounts, searchQuery, statusFilter]);

  const counts = useMemo(
    () => ({
      active: accounts.filter((a) => a.isActive && !a.isExpired).length,
      near: accounts.filter((a) => a.bandwidthPercentUsed >= 80).length,
      expired: accounts.filter((a) => a.isExpired).length,
      inactive: accounts.filter((a) => !a.isActive).length,
    }),
    [accounts]
  );

  return (
    <div dir="rtl" className="flex flex-col gap-5">
      <PageHeader
        title="حسابات VdoCipher"
        description="مجمع حسابات الفيديو المحمي. الباندويث يُوزّع تلقائياً على الحسابات المتاحة، ويُحجز مسبقاً لكل مشاهدة حتى لا ينقطع الفيديو."
        actions={
          <>
            <Button onClick={() => void handleReconcile()} loading={reconciling} icon={<RefreshCw size={15} />}>مزامنة الحجوزات</Button>
            <Button
              variant="primary"
              icon={<Plus size={15} />}
              onClick={() => {
                setAddForm(EMPTY_ADD);
                setTestResult(null);
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
        <div className="adm-stats">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} h={96} r={12} />)}</div>
      ) : (
        <div className="adm-stats">
          <Stat label="الحسابات" value={fmtNum(kpis?.totalAccounts ?? 0)} sub={`${fmtNum(kpis?.activeAccounts ?? 0)} نشط`} />
          <Stat label="السعة الكلية" value={`${fmtNum(kpis?.totalBandwidthLimitGb ?? 0)} GB`} tone="info" />
          <Stat label="المستهلك" value={`${fmtNum(kpis?.totalBandwidthUsedGb ?? 0)} GB`} tone="warn" />
          <Stat label="المتبقي الآمن" value={`${fmtNum(kpis?.totalSafeRemainingGb ?? 0)} GB`} tone="ok" sub="متاح للحجز والمشاهدة" />
          <Stat label="يشاهدون الآن" value={fmtNum(kpis?.totalActiveViewers ?? 0)} tone="brand" sub="جلسات مشاهدة جارية" />
          <Stat label="منتهية" value={fmtNum(kpis?.expiredAccounts ?? 0)} tone={(kpis?.expiredAccounts ?? 0) > 0 ? "bad" : "neutral"} sub="تحتاج تجديد" />
        </div>
      )}

      <Panel
        title="كلمة مرور رفع الفيديو للمعلمين"
        icon={<Lock size={16} />}
        description="يطلبها النظام من المعلم قبل رفع فيديو على VdoCipher، حتى لا يُستهلك الباندويث المحدود إلا بإذن."
      >
        <form onSubmit={handleSaveSecurityPassword} className="flex flex-wrap items-end gap-2 max-w-xl">
          <Field label="كلمة المرور" htmlFor="vdo-pass" className="flex-1 min-w-[200px]">
            <div className="relative">
              <Input
                id="vdo-pass"
                type={showPass ? "text" : "password"}
                mono
                value={securityPassword}
                onChange={(e) => setSecurityPassword(e.target.value)}
                autoComplete="off"
                style={{ paddingLeft: 44 }}
              />
              <button
                type="button"
                onClick={() => setShowPass((v) => !v)}
                className="adm-btn is-ghost is-icon is-sm absolute top-1/2 -translate-y-1/2"
                style={{ left: 4 }}
                aria-label={showPass ? "إخفاء" : "إظهار"}
              >
                {showPass ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </Field>
          <Button type="submit" variant="primary" loading={savingPass} disabled={securityPassword.trim() === savedSecurityPassword}>حفظ</Button>
        </form>
      </Panel>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2" role="group" aria-label="حالة الحساب">
          <Chip pressed={statusFilter === "all"} onClick={() => setStatusFilter("all")} count={accounts.length}>الكل</Chip>
          <Chip pressed={statusFilter === "active"} onClick={() => setStatusFilter("active")} count={counts.active}>نشطة</Chip>
          <Chip pressed={statusFilter === "near_limit"} onClick={() => setStatusFilter("near_limit")} count={counts.near}>قاربت الامتلاء</Chip>
          <Chip pressed={statusFilter === "expired"} onClick={() => setStatusFilter("expired")} count={counts.expired}>منتهية</Chip>
          <Chip pressed={statusFilter === "inactive"} onClick={() => setStatusFilter("inactive")} count={counts.inactive}>معطلة</Chip>
        </div>
        <SearchInput value={searchQuery} onChange={setSearchQuery} placeholder="الاسم أو Player ID أو الملاحظات" inputSize="sm" className="w-72 max-w-full" />
      </div>

      {loading && accounts.length === 0 ? (
        <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 320px), 1fr))" }}>
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} h={220} r={16} />)}
        </div>
      ) : filteredAccounts.length === 0 ? (
        <Panel>
          <EmptyState
            icon={<Video size={22} />}
            title={accounts.length === 0 ? "لا توجد حسابات VdoCipher" : "لا حسابات مطابقة"}
            text={accounts.length === 0 ? "أضف أول حساب ليبدأ رفع وتشغيل الفيديوهات المحمية." : "غيّر الفلتر أو كلمات البحث."}
          />
        </Panel>
      ) : (
        <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 320px), 1fr))" }}>
          {filteredAccounts.map((account) => {
            const pct = Math.max(0, Math.min(100, account.bandwidthPercentUsed));
            const isFull = pct >= 95;
            const isNear = pct >= 80 && !isFull;
            const barColor = isFull ? "var(--danger)" : isNear ? "var(--warn)" : "var(--brand)";
            return (
              <article key={account.id} className="adm-panel p-4 flex flex-col gap-3" style={{ opacity: account.isActive ? 1 : 0.7 }}>
                <header className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="adm-h3 truncate">{account.name}</h3>
                    <p className="text-xs adm-muted mt-0.5">
                      <span className="adm-mono">{account.apiKeyMasked}</span>
                      {account.playerId && <> · Player <span className="adm-mono">{account.playerId}</span></>}
                    </p>
                  </div>
                  {account.isExpired ? (
                    <Badge tone="bad">منتهي</Badge>
                  ) : !account.isActive ? (
                    <Badge>معطل</Badge>
                  ) : isFull ? (
                    <Badge tone="bad">ممتلئ</Badge>
                  ) : isNear ? (
                    <Badge tone="warn">قارب الامتلاء</Badge>
                  ) : (
                    <Badge tone="ok" dot>متاح</Badge>
                  )}
                </header>

                <div>
                  <div className="flex items-center justify-between text-xs mb-1.5">
                    <span className="adm-muted">الباندويث</span>
                    <span className="adm-num font-bold">
                      {fmtNum(account.bandwidthUsedGb)} / {fmtNum(account.bandwidthLimitGb)} GB · {fmtNum(account.bandwidthPercentUsed)}٪
                    </span>
                  </div>
                  <div className="adm-bar" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={`استهلاك ${account.name}`}>
                    <span style={{ width: `${pct}%`, background: barColor }} />
                  </div>
                  <div className="flex items-center justify-between text-xs adm-muted mt-1.5">
                    <span>متبقٍ آمن <b style={{ color: "var(--ok)" }}>{fmtNum(account.bandwidthSafeRemainingGb)} GB</b></span>
                    <span>محجوز <b className="adm-num">{fmtNum(Math.round(account.bandwidthReservedBytes / (1024 * 1024)))} MB</b></span>
                  </div>
                </div>

                <dl className="adm-well grid grid-cols-2 gap-2 p-2.5 text-xs">
                  <div>
                    <dt className="adm-muted">الصلاحية</dt>
                    <dd className="font-bold" style={{ color: account.isExpired ? "var(--danger)" : undefined }}>
                      {account.isExpired ? "منتهية" : `${fmtNum(account.daysRemaining)} يوم`}
                    </dd>
                  </div>
                  <div>
                    <dt className="adm-muted">يشاهدون الآن</dt>
                    <dd className="font-bold flex items-center gap-1.5">
                      {account.activeViewersCount > 0 && <span className="adm-dot is-live" style={{ color: "var(--ok)" }} aria-hidden />}
                      {fmtNum(account.activeViewersCount)}
                    </dd>
                  </div>
                </dl>

                {account.notes && <p className="text-xs adm-muted">{account.notes}</p>}

                <footer className="flex items-center justify-between gap-1 pt-2" style={{ borderTop: "1px solid var(--border)" }}>
                  <div className="flex items-center gap-1">
                    <Button size="sm" variant="ghost" icon={<FlaskConical size={14} />} loading={testingId === account.id} disabled={testingId !== null && testingId !== account.id} onClick={() => void handleTestApiKey("", account.id)}>
                      فحص
                    </Button>
                    <IconButton label="تعديل" size="sm" onClick={() => openEdit(account)}>
                      <Pencil size={15} />
                    </IconButton>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch checked={account.isActive} onChange={() => void handleToggleActive(account)} disabled={busyId === account.id} label={`تفعيل ${account.name}`} />
                    <IconButton label="حذف" size="sm" onClick={() => setDeleteTarget(account)} style={{ color: "var(--danger)" }}>
                      <Trash2 size={15} />
                    </IconButton>
                  </div>
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
        title="إضافة حساب VdoCipher"
        size="md"
        footer={
          <>
            <Button icon={<FlaskConical size={15} />} loading={testingId === "new"} disabled={!addForm.apiKey.trim()} onClick={() => void handleTestApiKey(addForm.apiKey)}>
              فحص المفتاح
            </Button>
            <span className="flex-1" />
            <Button onClick={() => setShowAddModal(false)} disabled={saving}>إلغاء</Button>
            <Button type="submit" form="vdo-add" variant="primary" loading={saving}>حفظ الحساب</Button>
          </>
        }
      >
        <form id="vdo-add" onSubmit={handleAddAccount} className="grid gap-4 sm:grid-cols-2">
          <Field label="اسم الحساب" htmlFor="va-name" className="sm:col-span-2">
            <Input id="va-name" data-autofocus required value={addForm.name} onChange={(e) => setAddForm({ ...addForm, name: e.target.value })} placeholder="VdoCipher Account #01" />
          </Field>
          <Field label="API Secret Key" hint="يُخزّن مشفّراً (AES-256-GCM) ولا يُرسل للمتصفح أبداً" htmlFor="va-key" className="sm:col-span-2">
            <Input id="va-key" type="password" required mono autoComplete="off" value={addForm.apiKey} onChange={(e) => setAddForm({ ...addForm, apiKey: e.target.value })} />
          </Field>
          <Field label="حصة الباندويث (GB)" htmlFor="va-bw">
            <Input id="va-bw" type="number" min="1" step="0.5" required mono value={addForm.bandwidthLimitGb} onChange={(e) => setAddForm({ ...addForm, bandwidthLimitGb: e.target.value })} />
          </Field>
          <Field label="الصلاحية (أيام)" htmlFor="va-days">
            <Input id="va-days" type="number" min="1" required mono value={addForm.validityDays} onChange={(e) => setAddForm({ ...addForm, validityDays: e.target.value })} />
          </Field>
          <Field label="Player ID" hint="اختياري" htmlFor="va-player">
            <Input id="va-player" mono value={addForm.playerId} onChange={(e) => setAddForm({ ...addForm, playerId: e.target.value })} />
          </Field>
          <Field label="ملاحظات" hint="اختياري" htmlFor="va-notes">
            <Input id="va-notes" value={addForm.notes} onChange={(e) => setAddForm({ ...addForm, notes: e.target.value })} />
          </Field>
          {testResult && (
            <Notice tone={testResult.ok ? "ok" : "bad"} title={testResult.message || (testResult.ok ? "المفتاح يعمل" : "فشل الفحص")} className="sm:col-span-2" />
          )}
        </form>
      </Modal>

      {/* Edit */}
      <Modal
        open={!!editingAccount}
        onClose={() => !saving && setEditingAccount(null)}
        title="تعديل حساب VdoCipher"
        description={editingAccount?.name}
        size="md"
        footer={
          <>
            <Button onClick={() => setEditingAccount(null)} disabled={saving}>إلغاء</Button>
            <Button type="submit" form="vdo-edit" variant="primary" loading={saving}>حفظ</Button>
          </>
        }
      >
        <form id="vdo-edit" onSubmit={handleUpdateAccount} className="grid gap-4 sm:grid-cols-2">
          <Field label="اسم الحساب" htmlFor="ve-name" className="sm:col-span-2">
            <Input id="ve-name" data-autofocus required value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} />
          </Field>
          <Field label="مفتاح API جديد" hint="اتركه فارغاً للإبقاء على المفتاح الحالي" htmlFor="ve-key" className="sm:col-span-2">
            <Input id="ve-key" type="password" mono autoComplete="off" value={editForm.apiKey} onChange={(e) => setEditForm({ ...editForm, apiKey: e.target.value })} />
          </Field>
          <Field label="حصة الباندويث (GB)" htmlFor="ve-bw">
            <Input id="ve-bw" type="number" min="1" step="0.5" mono value={editForm.bandwidthLimitGb} onChange={(e) => setEditForm({ ...editForm, bandwidthLimitGb: e.target.value })} />
          </Field>
          <Field label="تمديد الصلاحية (+ أيام)" htmlFor="ve-ext">
            <Input id="ve-ext" type="number" min="0" mono value={editForm.extendDays} onChange={(e) => setEditForm({ ...editForm, extendDays: e.target.value })} placeholder="30" />
          </Field>
          <Field label="Player ID" htmlFor="ve-player">
            <Input id="ve-player" mono value={editForm.playerId} onChange={(e) => setEditForm({ ...editForm, playerId: e.target.value })} />
          </Field>
          <Field label="ملاحظات" htmlFor="ve-notes">
            <Input id="ve-notes" value={editForm.notes} onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })} />
          </Field>
          <label className="sm:col-span-2 adm-well flex items-center justify-between gap-3 px-3 py-2.5">
            <span className="text-sm font-semibold">الحساب نشط ومتاح لرفع وتعيين الفيديوهات الجديدة</span>
            <Switch checked={editForm.isActive} onChange={(v) => setEditForm({ ...editForm, isActive: v })} label="الحساب نشط" />
          </label>
        </form>
      </Modal>

      <Modal
        open={!!deleteTarget}
        onClose={() => !saving && setDeleteTarget(null)}
        size="sm"
        title="حذف الحساب؟"
        description={deleteTarget ? `سيُحذف "${deleteTarget.name}" من المجمع. الفيديوهات المرفوعة عليه قد تتوقف عن التشغيل إن لم تُنقل.` : undefined}
        footer={
          <>
            <Button onClick={() => setDeleteTarget(null)} disabled={saving}>إلغاء</Button>
            <Button variant="danger-solid" loading={saving} onClick={() => void handleDeleteAccount()}>حذف</Button>
          </>
        }
      />
    </div>
  );
}
