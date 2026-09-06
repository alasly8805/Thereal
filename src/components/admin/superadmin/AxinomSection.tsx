"use client";

import { useState, useEffect, useMemo } from "react";
import { useToast } from "@/components/ui/Toast";

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

export function AxinomSection() {
  const { success: toastSuccess, error: toastError } = useToast();
  const notify = (type: "success" | "error" | "info", text: string) => {
    if (type === "success") toastSuccess(text);
    else toastError(text);
  };

  const [loading, setLoading] = useState(true);
  const [accounts, setAccounts] = useState<AxinomAccount[]>([]);
  const [kpis, setKpis] = useState<KPIStats | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "primary" | "standby" | "exhausted" | "expired" | "inactive">("all");

  // Modals
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingAccount, setEditingAccount] = useState<AxinomAccount | null>(null);

  // Form State for Add
  const [addForm, setAddForm] = useState({
    name: "",
    tenantId: "",
    communicationKeyId: "",
    communicationKey: "",
    keySeedId: "",
    licenseLimit: 10000,
    validityDays: 365,
    priority: 1,
    isPrimary: true,
    notes: "",
  });
  const [showAddKey, setShowAddKey] = useState(false);
  const [testingKey, setTestingKey] = useState(false);
  const [testResult, setTestResult] = useState<{ ok?: boolean; message?: string } | null>(null);
  const [savingAccount, setSavingAccount] = useState(false);

  // Edit Form State
  const [editForm, setEditForm] = useState({
    name: "",
    tenantId: "",
    communicationKeyId: "",
    communicationKey: "",
    keySeedId: "",
    licenseLimit: 10000,
    licensesUsed: 0,
    extendDays: 0,
    priority: 1,
    isPrimary: false,
    isActive: true,
    notes: "",
  });
  const [showEditKey, setShowEditKey] = useState(false);

  const fetchAccounts = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/admin/superadmin/axinom");
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "تعذر جلب بيانات الحسابات");
      }
      setAccounts(data.accounts || []);
      setKpis(data.kpis || null);
    } catch (err: any) {
      notify("error", err.message || "حدث خطأ أثناء تحميل الحسابات");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAccounts();
  }, []);

  // Test Account Credentials
  const handleTestCredentials = async (params: {
    tenantId?: string;
    communicationKeyId?: string;
    communicationKey?: string;
    accountId?: string;
  }) => {
    try {
      setTestingKey(true);
      setTestResult(null);
      const res = await fetch("/api/admin/superadmin/axinom/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(params),
      });
      const data = await res.json();
      setTestResult({ ok: data.ok, message: data.message });
      if (data.ok) {
        notify("success", data.message);
      } else {
        notify("error", data.message || "فحص الاتصال والمفتاح غير ناجح");
      }
    } catch (err: any) {
      setTestResult({ ok: false, message: err.message || "فشل الفحص" });
      notify("error", err.message || "تعذر إجراء الفحص");
    } finally {
      setTestingKey(false);
    }
  };

  // Submit Add Account
  const handleAddAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addForm.name.trim() || !addForm.tenantId.trim() || !addForm.communicationKeyId.trim() || !addForm.communicationKey.trim()) {
      notify("error", "يرجى ملء جميع الحقول المطلوبة (الاسم، Tenant ID، Key ID، والمفتاح السري)");
      return;
    }

    try {
      setSavingAccount(true);
      const res = await fetch("/api/admin/superadmin/axinom", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "تعذر إضافة الحساب");
      }

      notify("success", data.message || "تم إضافة حساب Axinom بنجاح! 🎉");
      setShowAddModal(false);
      setAddForm({
        name: "",
        tenantId: "",
        communicationKeyId: "",
        communicationKey: "",
        keySeedId: "",
        licenseLimit: 10000,
        validityDays: 365,
        priority: 1,
        isPrimary: false,
        notes: "",
      });
      setTestResult(null);
      fetchAccounts();
    } catch (err: any) {
      notify("error", err.message || "حدث خطأ أثناء حفظ الحساب");
    } finally {
      setSavingAccount(false);
    }
  };

  // Submit Edit Account
  const handleUpdateAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingAccount) return;

    try {
      setSavingAccount(true);
      const res = await fetch(`/api/admin/superadmin/axinom/${editingAccount.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editForm.name.trim() || undefined,
          tenantId: editForm.tenantId.trim() || undefined,
          communicationKeyId: editForm.communicationKeyId.trim() || undefined,
          communicationKey: editForm.communicationKey.trim() || undefined,
          keySeedId: editForm.keySeedId.trim() || null,
          licenseLimit: Number(editForm.licenseLimit) || undefined,
          licensesUsed: Number(editForm.licensesUsed),
          extendDays: Number(editForm.extendDays) || undefined,
          priority: Number(editForm.priority) || undefined,
          isPrimary: editForm.isPrimary,
          isActive: editForm.isActive,
          notes: editForm.notes.trim() || null,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "تعذر تحديث الحساب");
      }

      notify("success", data.message || "تم تحديث الحساب بنجاح");
      setEditingAccount(null);
      fetchAccounts();
    } catch (err: any) {
      notify("error", err.message || "حدث خطأ أثناء التحديث");
    } finally {
      setSavingAccount(false);
    }
  };

  // Set Account as Primary
  const handleSetPrimary = async (account: AxinomAccount) => {
    try {
      const res = await fetch(`/api/admin/superadmin/axinom/${account.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isPrimary: true }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "تعذر تعيين الحساب كأساسي");
      notify("success", `تم تعيين "${account.name}" كحساب أساسي للـ DRM بنجاح! ⭐`);
      fetchAccounts();
    } catch (err: any) {
      notify("error", err.message);
    }
  };

  // Toggle Account Active
  const handleToggleActive = async (account: AxinomAccount) => {
    try {
      const res = await fetch(`/api/admin/superadmin/axinom/${account.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !account.isActive }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "تعذر تعديل حالة الحساب");
      notify("success", `تم ${account.isActive ? "تعطيل" : "تفعيل"} الحساب بنجاح`);
      fetchAccounts();
    } catch (err: any) {
      notify("error", err.message);
    }
  };

  // Reset Used Counter
  const handleResetCounter = async (account: AxinomAccount) => {
    if (!confirm(`هل أنت متأكد من تصفير عداد الشهادات المستهلكة للحساب "${account.name}"؟`)) return;
    try {
      const res = await fetch(`/api/admin/superadmin/axinom/${account.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resetUsed: true }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "تعذر تصفير العداد");
      notify("success", `تم تصفير عداد الشهادات المستهلكة للحساب "${account.name}" بنجاح! 🔄`);
      fetchAccounts();
    } catch (err: any) {
      notify("error", err.message);
    }
  };

  // Delete Account
  const handleDeleteAccount = async (account: AxinomAccount) => {
    if (!confirm(`هل أنت متأكد من حذف حساب Axinom "${account.name}"؟\nسيتم حذف سجل التراخيص المرتبط بهذا الحساب.`)) return;
    try {
      const res = await fetch(`/api/admin/superadmin/axinom/${account.id}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "تعذر حذف الحساب");
      notify("success", data.message || "تم حذف الحساب بنجاح");
      fetchAccounts();
    } catch (err: any) {
      notify("error", err.message);
    }
  };

  // Open Edit Modal
  const openEditModal = (account: AxinomAccount) => {
    setEditingAccount(account);
    setEditForm({
      name: account.name,
      tenantId: account.tenantId,
      communicationKeyId: account.communicationKeyId,
      communicationKey: "",
      keySeedId: account.keySeedId || "",
      licenseLimit: account.licenseLimit,
      licensesUsed: account.licensesUsed,
      extendDays: 0,
      priority: account.priority,
      isPrimary: account.isPrimary,
      isActive: account.isActive,
      notes: account.notes || "",
    });
    setShowEditKey(false);
  };

  // Filtered Accounts
  const filteredAccounts = useMemo(() => {
    return accounts.filter((acc) => {
      const matchesSearch =
        acc.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        acc.tenantId.toLowerCase().includes(searchQuery.toLowerCase()) ||
        acc.communicationKeyId.toLowerCase().includes(searchQuery.toLowerCase());

      if (!matchesSearch) return false;

      if (statusFilter === "primary") return acc.isPrimary && acc.isEligible;
      if (statusFilter === "standby") return !acc.isPrimary && acc.isEligible;
      if (statusFilter === "exhausted") return acc.status === "exhausted";
      if (statusFilter === "expired") return acc.status === "expired";
      if (statusFilter === "inactive") return !acc.isActive;

      return true;
    });
  }, [accounts, searchQuery, statusFilter]);

  return (
    <div className="space-y-6 text-slate-100 font-sans" dir="rtl">
      {/* ── Top Header & Hero ── */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-indigo-950/80 via-slate-900 to-slate-950 border border-indigo-500/20 p-6 shadow-2xl backdrop-blur-xl">
        <div className="absolute -right-20 -top-20 w-80 h-80 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 relative z-10">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                الأمان العتادي الأقوى عالمياً
              </span>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                دعم النقل التلقائي (Seamless Failover)
              </span>
            </div>
            <h1 className="text-2xl md:text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white via-indigo-100 to-indigo-300">
              حسابات وتراخيص Axinom Multi-DRM
            </h1>
            <p className="text-sm text-slate-400 mt-1 max-w-2xl">
              إدارة مجموعة حسابات Axinom، وتتبع استهلاك شهادات التراخيص (Widevine & PlayReady) بدقة، مع النقل التلقائي الفوري لجميع الفيديوهات القديمة والجديدة عند انتهاء الرصيد.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={fetchAccounts}
              disabled={loading}
              className="px-4 py-2.5 rounded-xl text-sm font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition flex items-center gap-2 disabled:opacity-50"
            >
              <svg className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              تحديث
            </button>

            <button
              onClick={() => {
                setTestResult(null);
                setShowAddModal(true);
              }}
              className="px-5 py-2.5 rounded-xl text-sm font-semibold bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 text-white shadow-lg shadow-indigo-600/30 transition flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              إضافة حساب Axinom جديد
            </button>
          </div>
        </div>

        {/* ── KPI Cards Bar ── */}
        {kpis && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mt-6 pt-6 border-t border-indigo-500/10">
            <div className="bg-slate-900/60 rounded-xl p-3.5 border border-slate-800">
              <div className="text-xs text-slate-400 mb-1">إجمالي الحسابات</div>
              <div className="text-2xl font-bold text-white">{kpis.totalAccounts}</div>
              <div className="text-[11px] text-emerald-400 mt-0.5">{kpis.activeAccounts} حساب فعّال</div>
            </div>

            <div className="bg-slate-900/60 rounded-xl p-3.5 border border-slate-800">
              <div className="text-xs text-slate-400 mb-1">حسابات الاحتياط (Standby)</div>
              <div className="text-2xl font-bold text-indigo-400">{kpis.standbyAccounts}</div>
              <div className="text-[11px] text-slate-400 mt-0.5">جاهزة للتبديل الفوري</div>
            </div>

            <div className="bg-slate-900/60 rounded-xl p-3.5 border border-slate-800">
              <div className="text-xs text-slate-400 mb-1">إجمالي رصيد الشهادات</div>
              <div className="text-2xl font-bold text-slate-100">{kpis.totalLicenseLimit.toLocaleString()}</div>
              <div className="text-[11px] text-slate-400 mt-0.5">سعة التراخيص الكلية</div>
            </div>

            <div className="bg-slate-900/60 rounded-xl p-3.5 border border-slate-800">
              <div className="text-xs text-slate-400 mb-1">الشهادات المستهلكة</div>
              <div className="text-2xl font-bold text-amber-400">{kpis.totalLicensesUsed.toLocaleString()}</div>
              <div className="text-[11px] text-slate-400 mt-0.5">تم إصدارها للطلاب</div>
            </div>

            <div className="bg-slate-900/60 rounded-xl p-3.5 border border-slate-800">
              <div className="text-xs text-slate-400 mb-1">الشهادات المتبقية</div>
              <div className="text-2xl font-bold text-emerald-400">{kpis.totalLicensesRemaining.toLocaleString()}</div>
              <div className="text-[11px] text-slate-400 mt-0.5">رصيد آمن ومتاح</div>
            </div>

            <div className="bg-slate-900/60 rounded-xl p-3.5 border border-slate-800">
              <div className="text-xs text-slate-400 mb-1">نسبة الاستهلاك الكلية</div>
              <div className="text-2xl font-bold text-purple-400">{kpis.overallPercentUsed}%</div>
              <div className="w-full bg-slate-800 h-1.5 rounded-full mt-1.5 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    kpis.overallPercentUsed > 85 ? "bg-rose-500" : kpis.overallPercentUsed > 60 ? "bg-amber-500" : "bg-emerald-500"
                  }`}
                  style={{ width: `${kpis.overallPercentUsed}%` }}
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Search & Filter Controls ── */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-slate-900/60 p-4 rounded-xl border border-slate-800">
        <div className="relative flex-1 max-w-md">
          <input
            type="text"
            placeholder="بحث بالاسم أو Tenant ID..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-slate-800/80 border border-slate-700 rounded-xl px-4 py-2 pr-10 text-sm text-slate-100 placeholder-slate-400 focus:outline-none focus:border-indigo-500"
          />
          <svg className="w-4 h-4 text-slate-400 absolute right-3.5 top-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
          {(
            [
              { id: "all", label: "الكل" },
              { id: "primary", label: "الأساسي ⭐" },
              { id: "standby", label: "احتياطي 🛡️" },
              { id: "exhausted", label: "مكتمل ⚠️" },
              { id: "expired", label: "منتهي ⌛" },
              { id: "inactive", label: "معطل 🚫" },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              onClick={() => setStatusFilter(tab.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition whitespace-nowrap ${
                statusFilter === tab.id
                  ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/30"
                  : "bg-slate-800 text-slate-300 hover:bg-slate-700"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Accounts Cards Grid ── */}
      {loading ? (
        <div className="py-20 flex flex-col items-center justify-center text-slate-400">
          <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mb-3" />
          <p className="text-sm">جاري تحميل بيانات حسابات Axinom DRM...</p>
        </div>
      ) : filteredAccounts.length === 0 ? (
        <div className="py-16 text-center bg-slate-900/40 rounded-2xl border border-slate-800 p-8">
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-indigo-500/10 flex items-center justify-center text-indigo-400">
            <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-slate-200">لا توجد حسابات مطابقة</h3>
          <p className="text-sm text-slate-400 mt-1 max-w-md mx-auto">
            {searchQuery
              ? "لم يتم العثور على أي حساب يطابق معايير البحث الحالية."
              : "لم يتم إضافة أي حسابات Axinom بعد. أضف حسابك الأول لتفعيل حماية DRM المتعددة."}
          </p>
          {!searchQuery && (
            <button
              onClick={() => setShowAddModal(true)}
              className="mt-4 px-4 py-2 rounded-xl text-sm font-semibold bg-indigo-600 hover:bg-indigo-500 text-white transition inline-flex items-center gap-2"
            >
              + إضافة حساب جديد الآن
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {filteredAccounts.map((account) => {
            const isExhausted = account.status === "exhausted";
            const isExpired = account.status === "expired";
            const isNearLimit = account.percentUsed >= 85 && !isExhausted;

            return (
              <div
                key={account.id}
                className={`relative rounded-2xl p-5 border transition-all duration-200 flex flex-col justify-between ${
                  account.isPrimary
                    ? "bg-gradient-to-br from-indigo-950/40 via-slate-900 to-slate-950 border-indigo-500/40 shadow-xl shadow-indigo-950/30"
                    : isExhausted
                    ? "bg-slate-900/60 border-rose-500/30"
                    : !account.isActive
                    ? "bg-slate-900/40 border-slate-800 opacity-75"
                    : "bg-slate-900/80 border-slate-800 hover:border-slate-700"
                }`}
              >
                <div>
                  {/* Card Header: Title & Badges */}
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-bold text-base text-slate-100">{account.name}</h3>
                        {account.isPrimary && (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                            الأساسي ⭐
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-slate-400 mt-0.5 font-mono">
                        Tenant: {account.tenantId}
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5">
                      {account.isPrimary ? (
                        <span className="px-2 py-1 rounded-lg text-xs font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                          نشط حالياً
                        </span>
                      ) : account.status === "standby" ? (
                        <span className="px-2 py-1 rounded-lg text-xs font-semibold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                          احتياطي (أولوية {account.priority})
                        </span>
                      ) : isExhausted ? (
                        <span className="px-2 py-1 rounded-lg text-xs font-semibold bg-rose-500/20 text-rose-300 border border-rose-500/30">
                          مكتمل الاستهلاك ⚠️
                        </span>
                      ) : isExpired ? (
                        <span className="px-2 py-1 rounded-lg text-xs font-semibold bg-red-500/20 text-red-300 border border-red-500/30">
                          منتهي الصلاحية ⌛
                        </span>
                      ) : (
                        <span className="px-2 py-1 rounded-lg text-xs font-semibold bg-slate-800 text-slate-400 border border-slate-700">
                          معطل
                        </span>
                      )}
                    </div>
                  </div>

                  {/* License Quota Progress Bar */}
                  <div className="bg-slate-950/60 rounded-xl p-3.5 border border-slate-800/80 mb-3.5">
                    <div className="flex justify-between items-center text-xs mb-1.5">
                      <span className="text-slate-400">استهلاك شهادات التراخيص:</span>
                      <span className="font-semibold text-slate-200">
                        {account.licensesUsed.toLocaleString()} / {account.licenseLimit.toLocaleString()} ({account.percentUsed}%)
                      </span>
                    </div>

                    <div className="w-full bg-slate-800 h-2.5 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${
                          account.percentUsed >= 95
                            ? "bg-rose-500"
                            : account.percentUsed >= 75
                            ? "bg-amber-500"
                            : "bg-emerald-500"
                        }`}
                        style={{ width: `${Math.min(100, account.percentUsed)}%` }}
                      />
                    </div>

                    <div className="flex justify-between items-center text-[11px] mt-2 text-slate-400">
                      <span>المتبقي: <strong className="text-emerald-400">{account.licensesRemaining.toLocaleString()} شهادة</strong></span>
                      <span>إجمالي الطلبات: <strong className="text-indigo-300">{account.totalEventsCount.toLocaleString()}</strong></span>
                    </div>
                  </div>

                  {/* Metadata & Validity */}
                  <div className="space-y-1.5 text-xs text-slate-400 mb-4 bg-slate-950/30 p-3 rounded-xl border border-slate-800/50">
                    <div className="flex justify-between">
                      <span>صلاحية الحساب:</span>
                      <span className={account.daysRemaining <= 7 ? "text-rose-400 font-semibold" : "text-slate-300"}>
                        {account.isExpired ? "منتهي" : `${account.daysRemaining} يوماً متبقية`}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>تاريخ الانتهاء:</span>
                      <span className="text-slate-300 font-mono text-[11px]">
                        {new Date(account.expiresAt).toLocaleDateString("ar-EG")}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>مفتاح التواصل:</span>
                      <span className="text-slate-300 font-mono text-[11px]">{account.communicationKeyMasked}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>معرّف المفتاح (Key ID):</span>
                      <span className="text-slate-400 font-mono text-[10px] truncate max-w-[170px]" title={account.communicationKeyId}>
                        {account.communicationKeyId}
                      </span>
                    </div>
                    {account.notes && (
                      <div className="pt-1.5 border-t border-slate-800 text-[11px] text-slate-300 italic">
                        "{account.notes}"
                      </div>
                    )}
                  </div>
                </div>

                {/* Card Action Buttons */}
                <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    {!account.isPrimary && account.isEligible && (
                      <button
                        onClick={() => handleSetPrimary(account)}
                        title="تعيين هذا الحساب كحساب أساسي للـ DRM"
                        className="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-indigo-600/20 hover:bg-indigo-600 text-indigo-300 hover:text-white border border-indigo-500/30 transition"
                      >
                        ⭐ جعله الأساسي
                      </button>
                    )}

                    <button
                      onClick={() => handleTestCredentials({ accountId: account.id })}
                      disabled={testingKey}
                      title="فحص صحة المفتاح والتشفير"
                      className="p-1.5 rounded-lg text-xs text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 transition"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </button>

                    <button
                      onClick={() => handleResetCounter(account)}
                      title="تصفير عداد الشهادات المستهلكة (Reset)"
                      className="p-1.5 rounded-lg text-xs text-amber-400 hover:text-amber-300 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/20 transition"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                    </button>

                    <button
                      onClick={() => openEditModal(account)}
                      title="تعديل بيانات الحساب"
                      className="p-1.5 rounded-lg text-xs text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 transition"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                    </button>

                    <button
                      onClick={() => handleDeleteAccount(account)}
                      title="حذف الحساب"
                      className="p-1.5 rounded-lg text-xs text-rose-400 hover:text-rose-300 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 transition"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>

                  <button
                    onClick={() => handleToggleActive(account)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-medium transition ${
                      account.isActive
                        ? "bg-slate-800 hover:bg-slate-700 text-slate-300"
                        : "bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30"
                    }`}
                  >
                    {account.isActive ? "تعطيل" : "تفعيل"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Add Account Modal ── */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-xl p-6 shadow-2xl relative my-8">
            <div className="flex items-center justify-between pb-4 mb-4 border-b border-slate-800">
              <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2">
                <span>🛡️ إضافة حساب Axinom Multi-DRM جديد</span>
              </h2>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleAddAccount} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    اسم الحساب / المعرف <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="مثال: Axinom Account 01"
                    value={addForm.name}
                    onChange={(e) => setAddForm({ ...addForm, name: e.target.value })}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Tenant ID <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="مثال: a85ddc8b-8c74-4fe3-806d-1f2f87df5745"
                    value={addForm.tenantId}
                    onChange={(e) => setAddForm({ ...addForm, tenantId: e.target.value })}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-slate-100 placeholder-slate-500 font-mono focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Communication Key ID (GUID) <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="مثال: c7f03846-00ba-4af6-9fa4-b4ac0141be68"
                  value={addForm.communicationKeyId}
                  onChange={(e) => setAddForm({ ...addForm, communicationKeyId: e.target.value })}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-slate-100 placeholder-slate-500 font-mono focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <div className="flex justify-between items-center mb-1.5">
                  <label className="block text-xs font-semibold text-slate-300">
                    Communication Key (المفتاح السري المشفر) <span className="text-rose-400">*</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowAddKey(!showAddKey)}
                    className="text-[11px] text-indigo-400 hover:text-indigo-300"
                  >
                    {showAddKey ? "إخفاء" : "إظهار المفتاح"}
                  </button>
                </div>
                <input
                  type={showAddKey ? "text" : "password"}
                  required
                  placeholder="مفتاح 64 حرف Hex أو Base64 (يتم تشفيره بـ AES-256 تلقائياً)"
                  value={addForm.communicationKey}
                  onChange={(e) => setAddForm({ ...addForm, communicationKey: e.target.value })}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-slate-100 placeholder-slate-500 font-mono focus:outline-none focus:border-indigo-500"
                />
                <p className="text-[11px] text-slate-400 mt-1">
                  🔒 المفتاح لن يُعرض بصيغة نصية للواجهة أبداً وسيتم تشفيره بنظام AES-256-GCM فور الحفظ.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    حد التراخيص / الشهادات
                  </label>
                  <input
                    type="number"
                    min="100"
                    max="1000000"
                    value={addForm.licenseLimit}
                    onChange={(e) => setAddForm({ ...addForm, licenseLimit: parseInt(e.target.value) || 10000 })}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-slate-100 focus:outline-none focus:border-indigo-500"
                  />
                  <span className="text-[10px] text-slate-400">افتراضياً: 10,000 شهادة</span>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    فترة الصلاحية (بالأيام)
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="1825"
                    value={addForm.validityDays}
                    onChange={(e) => setAddForm({ ...addForm, validityDays: parseInt(e.target.value) || 365 })}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-slate-100 focus:outline-none focus:border-indigo-500"
                  />
                  <span className="text-[10px] text-slate-400">افتراضياً: 365 يوماً</span>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    الأولوية (Priority)
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="99"
                    value={addForm.priority}
                    onChange={(e) => setAddForm({ ...addForm, priority: parseInt(e.target.value) || 1 })}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-slate-100 focus:outline-none focus:border-indigo-500"
                  />
                  <span className="text-[10px] text-slate-400">1 = الأعلى أولوية</span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Key Seed ID (اختياري)
                </label>
                <input
                  type="text"
                  placeholder="معرف اشتقاق المفاتيح في حال تم استخدامه"
                  value={addForm.keySeedId}
                  onChange={(e) => setAddForm({ ...addForm, keySeedId: e.target.value })}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-slate-100 placeholder-slate-500 font-mono focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="isPrimaryCheck"
                  checked={addForm.isPrimary}
                  onChange={(e) => setAddForm({ ...addForm, isPrimary: e.target.checked })}
                  className="rounded border-slate-700 text-indigo-600 focus:ring-indigo-500 w-4 h-4 bg-slate-800"
                />
                <label htmlFor="isPrimaryCheck" className="text-xs text-slate-200 select-none cursor-pointer">
                  تعيين هذا الحساب كحساب أساسي نشط فوراً (Primary Account)
                </label>
              </div>

              {testResult && (
                <div
                  className={`p-3 rounded-xl text-xs flex items-center gap-2 ${
                    testResult.ok
                      ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                      : "bg-rose-500/20 text-rose-300 border border-rose-500/30"
                  }`}
                >
                  <span>{testResult.ok ? "✅" : "⚠️"}</span>
                  <span>{testResult.message}</span>
                </div>
              )}

              <div className="pt-4 border-t border-slate-800 flex items-center justify-between gap-3">
                <button
                  type="button"
                  disabled={testingKey || !addForm.communicationKey || !addForm.tenantId || !addForm.communicationKeyId}
                  onClick={() =>
                    handleTestCredentials({
                      tenantId: addForm.tenantId,
                      communicationKeyId: addForm.communicationKeyId,
                      communicationKey: addForm.communicationKey,
                    })
                  }
                  className="px-4 py-2 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-indigo-300 border border-indigo-500/30 transition disabled:opacity-50 flex items-center gap-1.5"
                >
                  <svg className={`w-3.5 h-3.5 ${testingKey ? "animate-spin" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  فحص المفتاح قبل الحفظ
                </button>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowAddModal(false)}
                    className="px-4 py-2 rounded-xl text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
                  >
                    إلغاء
                  </button>
                  <button
                    type="submit"
                    disabled={savingAccount}
                    className="px-5 py-2 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white transition disabled:opacity-50"
                  >
                    {savingAccount ? "جاري الحفظ..." : "حفظ الحساب"}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Edit Account Modal ── */}
      {editingAccount && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-xl p-6 shadow-2xl relative my-8">
            <div className="flex items-center justify-between pb-4 mb-4 border-b border-slate-800">
              <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2">
                <span>تعديل حساب: {editingAccount.name}</span>
              </h2>
              <button
                onClick={() => setEditingAccount(null)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleUpdateAccount} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">اسم الحساب</label>
                  <input
                    type="text"
                    value={editForm.name}
                    onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-slate-100 focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">Tenant ID</label>
                  <input
                    type="text"
                    value={editForm.tenantId}
                    onChange={(e) => setEditForm({ ...editForm, tenantId: e.target.value })}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-slate-100 font-mono focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">Communication Key ID</label>
                <input
                  type="text"
                  value={editForm.communicationKeyId}
                  onChange={(e) => setEditForm({ ...editForm, communicationKeyId: e.target.value })}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-slate-100 font-mono focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <div className="flex justify-between items-center mb-1.5">
                  <label className="block text-xs font-semibold text-slate-300">
                    تغيير Communication Key (اتركه فارغاً للإبقاء على المفتاح الحالي)
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowEditKey(!showEditKey)}
                    className="text-[11px] text-indigo-400 hover:text-indigo-300"
                  >
                    {showEditKey ? "إخفاء" : "إظهار"}
                  </button>
                </div>
                <input
                  type={showEditKey ? "text" : "password"}
                  placeholder="اتركه فارغاً إذا كنت لا تريد تغييره"
                  value={editForm.communicationKey}
                  onChange={(e) => setEditForm({ ...editForm, communicationKey: e.target.value })}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-slate-100 font-mono focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">حد الشهادات الكلي</label>
                  <input
                    type="number"
                    min="1"
                    value={editForm.licenseLimit}
                    onChange={(e) => setEditForm({ ...editForm, licenseLimit: parseInt(e.target.value) || 10000 })}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-slate-100 focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">الشهادات المستهلكة</label>
                  <input
                    type="number"
                    min="0"
                    value={editForm.licensesUsed}
                    onChange={(e) => setEditForm({ ...editForm, licensesUsed: parseInt(e.target.value) || 0 })}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-slate-100 focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">تمديد الصلاحية (أيام إضافية)</label>
                  <input
                    type="number"
                    min="0"
                    placeholder="0"
                    value={editForm.extendDays}
                    onChange={(e) => setEditForm({ ...editForm, extendDays: parseInt(e.target.value) || 0 })}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-slate-100 focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div className="flex items-center gap-6 pt-2">
                <label className="flex items-center gap-2 text-xs text-slate-200 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editForm.isPrimary}
                    onChange={(e) => setEditForm({ ...editForm, isPrimary: e.target.checked })}
                    className="rounded border-slate-700 text-indigo-600 focus:ring-indigo-500 w-4 h-4 bg-slate-800"
                  />
                  حساب أساسي نشط (Primary)
                </label>

                <label className="flex items-center gap-2 text-xs text-slate-200 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editForm.isActive}
                    onChange={(e) => setEditForm({ ...editForm, isActive: e.target.checked })}
                    className="rounded border-slate-700 text-indigo-600 focus:ring-indigo-500 w-4 h-4 bg-slate-800"
                  />
                  حالة الحساب مفعّل
                </label>
              </div>

              <div className="pt-4 border-t border-slate-800 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setEditingAccount(null)}
                  className="px-4 py-2 rounded-xl text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={savingAccount}
                  className="px-5 py-2 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white transition disabled:opacity-50"
                >
                  {savingAccount ? "جاري الحفظ..." : "حفظ التعديلات"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
