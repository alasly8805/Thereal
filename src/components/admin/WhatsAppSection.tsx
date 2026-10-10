"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useToast } from "@/components/ui/Toast";
import { Badge, Button, Modal, PageHeader, Tabs } from "@/components/admin/ui/kit";

type WaTab = "providers" | "logs" | "templates" | "settings";

export function WhatsAppSection() {
  const { success: toastSuccess, error: toastError } = useToast();
  const [activeTab, setActiveTab] = useState<WaTab>("providers");
  const [confirmAction, setConfirmAction] = useState<"logout" | "fallback-logout" | null>(null);
  // The config form is filled from the server once (and after each save) — the
  // 5s status poll must never overwrite what the admin is typing.
  const formHydrated = useRef(false);
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  // Filter & Search states (search is debounced before it reaches the poll)
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [filterProvider, setFilterProvider] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterType, setFilterType] = useState("");

  // Config Form State
  const [deliveryMode, setDeliveryMode] = useState<string>("baileys_primary");
  const [baileysTemplate, setBaileysTemplate] = useState<string>("");
  const [autoSendParent, setAutoSendParent] = useState<boolean>(true);
  const [requireParentVerif, setRequireParentVerif] = useState<boolean>(false);
  const [savingConfig, setSavingConfig] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Test Message Form State
  const [testPhone, setTestPhone] = useState("");
  const [testContent, setTestContent] = useState("تجربة إرسال رسالة من منصة Code-UP عبر الواتساب 🚀");
  const [testType, setTestType] = useState("CUSTOM");
  const [testSending, setTestSending] = useState(false);
  const [testResult, setTestResult] = useState<any>(null);

  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  const fetchStatus = useCallback(async ({ hydrateForm = false }: { hydrateForm?: boolean } = {}) => {
    try {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (filterProvider) params.set("provider", filterProvider);
      if (filterStatus) params.set("status", filterStatus);
      if (filterType) params.set("messageType", filterType);

      const res = await fetch(`/api/admin/whatsapp?${params.toString()}`, { credentials: "include" });
      const json = await res.json();
      if (json.success) {
        setData(json);
        if (hydrateForm || !formHydrated.current) {
          formHydrated.current = true;
          setDeliveryMode(json.activeDeliveryMode || "baileys_primary");
          setBaileysTemplate(json.baileysOtpTemplate || "");
          setAutoSendParent(json.autoSendParentPortal ?? true);
          setRequireParentVerif(json.requireParentVerification ?? false);
        }
        setError(null);
      } else {
        setError(json.error || "فشل تحميل بيانات مركز الواتساب");
      }
    } catch (err: any) {
      setError(err?.message || "خطأ في الاتصال بالشبكة");
    } finally {
      setLoading(false);
    }
  }, [search, filterProvider, filterStatus, filterType]);

  useEffect(() => {
    void fetchStatus();
    const interval = setInterval(() => {
      if (document.visibilityState === "visible") void fetchStatus();
    }, 5000);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  const handleSaveConfig = async (override?: any) => {
    setSavingConfig(true);
    setSaveSuccess(false);
    try {
      const res = await fetch("/api/admin/whatsapp", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update-config",
          deliveryMode: override?.deliveryMode ?? deliveryMode,
          baileysOtpTemplate: override?.baileysOtpTemplate ?? baileysTemplate,
          autoSendParentPortal: override?.autoSendParentPortal ?? autoSendParent,
          requireParentVerification: override?.requireParentVerification ?? requireParentVerif,
        }),
      });
      const json = await res.json();
      if (json.success) {
        setSaveSuccess(true);
        toastSuccess("حُفظت إعدادات الواتساب");
        setTimeout(() => setSaveSuccess(false), 3000);
        void fetchStatus({ hydrateForm: true });
      } else {
        toastError(json.error || "فشل حفظ الإعدادات");
        void fetchStatus({ hydrateForm: true });
      }
    } catch {
      toastError("خطأ أثناء الاتصال بالخادم");
    } finally {
      setSavingConfig(false);
    }
  };

  const handleTestSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!testPhone || !testContent) return;
    setTestSending(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/admin/whatsapp", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "test-send",
          phone: testPhone,
          content: testContent,
          messageType: testType,
        }),
      });
      const json = await res.json();
      setTestResult(json);
      fetchStatus();
    } catch (err: any) {
      setTestResult({ success: false, error: err?.message || "خطأ في الإرسال" });
    } finally {
      setTestSending(false);
    }
  };

  const handleAction = async (action: "reconnect" | "logout" | "fallback-reconnect" | "fallback-logout", confirmed = false) => {
    if ((action === "logout" || action === "fallback-logout") && !confirmed) {
      setConfirmAction(action);
      return;
    }
    try {
      const res = await fetch("/api/admin/whatsapp", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const json = await res.json();
      if (action === "logout" || action === "fallback-logout") {
        if (res.ok) toastSuccess(json.message || "سُجّل الخروج من الجلسة");
        else toastError(json.error || json.message || "تعذر تسجيل الخروج");
      } else if (!res.ok) {
        toastError(json.error || json.message || "تعذر تنفيذ الإجراء");
      }
      // Reconnect: the QR appears on its own — poll a few times to pick it up quickly.
      void fetchStatus();
      setTimeout(() => void fetchStatus(), 2000);
      setTimeout(() => void fetchStatus(), 4000);
    } catch {
      toastError("حدث خطأ أثناء الاتصال");
    }
  };

  const handleExportCSV = () => {
    window.open(`/api/admin/whatsapp?export=csv`, "_blank");
  };

  const handlePrintPDF = () => {
    window.print();
  };

  if (loading && !data) {
    return (
      <div className="p-8 text-center text-[var(--ink-2)]">
        <div className="inline-block animate-spin w-8 h-8 border-4 border-[color-mix(in_srgb,var(--ok)_32%,transparent)] border-t-transparent rounded-full mb-3"></div>
        <p className="text-sm">جاري تحميل مركز إدارة الواتساب المتقدم...</p>
      </div>
    );
  }

  const baileys = data?.providers?.baileys;
  const fallbackBaileys = data?.fallbackBaileys;
  const meta = data?.providers?.officialApi;
  const daily = data?.dailyUsage;
  const logs = data?.logs || [];
  const configLogs = data?.configLogs || [];

  // Official Meta API Quota Calculations
  const metaTotalToday = daily?.officialApi?.totalCount || 0;
  const metaLimit = 1000;
  const metaPercent = Math.min(100, Math.round((metaTotalToday / metaLimit) * 100));
  let progressColor = "bg-emerald-500";
  if (metaPercent >= 90) progressColor = "bg-rose-500";
  else if (metaPercent >= 70) progressColor = "bg-amber-500";

  return (
    <div className="flex flex-col gap-5 text-right" dir="rtl">
      <PageHeader
        title="واتساب"
        description="الرقم الأساسي والاحتياطي (Baileys) وواجهة Meta الرسمية، مع التحويل التلقائي عند الأعطال، وسجل الرسائل، وقوالب كود التحقق، وروابط ولي الأمر."
        meta={
          <>
            <Badge tone={baileys?.connected ? "ok" : "bad"} dot>{baileys?.connected ? "الأساسي متصل" : "الأساسي غير متصل"}</Badge>
            {fallbackBaileys?.connected && <Badge tone="info" dot>الاحتياطي متصل</Badge>}
          </>
        }
      />
      <Tabs<WaTab>
        label="أقسام الواتساب"
        value={activeTab}
        onChange={setActiveTab}
        items={[
          { id: "providers", label: "المزودات والإستراتيجية" },
          { id: "logs", label: "السجلات", badge: <Badge>{logs.length.toLocaleString("ar-EG")}</Badge> },
          { id: "templates", label: "القوالب وكود التحقق" },
          { id: "settings", label: "ولي الأمر والاختبار" },
        ]}
      />

      {error && (
        <div className="p-4 rounded-xl bg-rose-500/10 border border-[color-mix(in_srgb,var(--danger)_32%,transparent)] text-[var(--danger)] text-sm font-bold">
          ⚠️ {error}
        </div>
      )}

      {/* TAB 1: PROVIDERS & DELIVERY STRATEGY */}
      {activeTab === "providers" && (
        <div className="space-y-6">
          {/* Providers Status Grid - 3 Column Layout */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {/* Provider 1: Primary Baileys Card */}
            <div className="bg-[var(--surface-2)] rounded-2xl p-5 border border-[var(--border)] space-y-4 flex flex-col justify-between">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-10 h-10 rounded-xl bg-emerald-500/15 border border-[color-mix(in_srgb,var(--ok)_32%,transparent)] flex items-center justify-center text-xl">
                      🟢
                    </div>
                    <div>
                      <h3 className="font-bold text-[var(--ink)] text-base">الرقم الأساسي (Baileys)</h3>
                      <p className="text-xs text-[var(--ink-2)]">محرك الإرسال المباشر الرئيسي</p>
                    </div>
                  </div>
                  <span className={`text-xs px-3 py-1 rounded-full font-bold border flex items-center gap-1.5 ${
                    baileys?.connected
                      ? "bg-emerald-500/15 border-[color-mix(in_srgb,var(--ok)_32%,transparent)] text-[var(--ok)]"
                      : "bg-rose-500/15 border-[color-mix(in_srgb,var(--danger)_32%,transparent)] text-[var(--danger)]"
                  }`}>
                    <span>{baileys?.connected ? "🟢 متصل" : "🔴 غير متصل"}</span>
                  </span>
                </div>

                {/* Baileys Health Metrics */}
                <div className="grid grid-cols-2 gap-2 pt-1">
                  <div className="bg-[var(--surface-2)] p-2.5 rounded-xl border border-[var(--border)]">
                    <p className="text-xs text-[var(--ink-2)]">إجمالي اليوم</p>
                    <p className="text-base font-bold text-[var(--ink)] mt-0.5">{daily?.baileys?.totalCount || 0}</p>
                  </div>
                  <div className="bg-[var(--surface-2)] p-2.5 rounded-xl border border-[var(--border)]">
                    <p className="text-xs text-[var(--ink-2)]">تم التسليم</p>
                    <p className="text-base font-bold text-[var(--ok)] mt-0.5">{daily?.baileys?.deliveredCount || 0}</p>
                  </div>
                  <div className="bg-[var(--surface-2)] p-2.5 rounded-xl border border-[var(--border)]">
                    <p className="text-xs text-[var(--ink-2)]">أكواد OTP</p>
                    <p className="text-base font-bold text-[var(--info)] mt-0.5">{daily?.baileys?.otpCount || 0}</p>
                  </div>
                  <div className="bg-[var(--surface-2)] p-2.5 rounded-xl border border-[var(--border)]">
                    <p className="text-xs text-[var(--ink-2)]">فشل الإرسال</p>
                    <p className="text-base font-bold text-[var(--danger)] mt-0.5">{daily?.baileys?.failedCount || 0}</p>
                  </div>
                </div>

                {/* Telemetry */}
                <div className="bg-[var(--surface-2)] p-3 rounded-xl border border-[var(--border)] text-xs space-y-1.5">
                  <div className="flex items-center justify-between text-[var(--ink-2)]">
                    <span>⏱️ سرعة الاستجابة:</span>
                    <span className="font-mono text-[var(--ok)] font-bold">{baileys?.health?.avgResponseLatencyMs || 120}ms</span>
                  </div>
                  <div className="flex items-center justify-between text-[var(--ink-2)]">
                    <span>📦 طابور الانتظار:</span>
                    <span className="font-mono text-[var(--info)] font-bold">{baileys?.health?.queueDepth || 0} رسالة</span>
                  </div>
                </div>

                {/* QR Code Area */}
                {!baileys?.connected && (
                  <div className="bg-[var(--surface-2)] p-3.5 rounded-xl border border-[var(--border)] space-y-2.5">
                    {baileys?.state === "PAIRING" && baileys?.qrCodeDataUrl ? (
                      <>
                        <div className="flex items-center gap-1.5 text-xs font-bold text-[var(--ok)]">
                          <span className="relative flex h-2 w-2">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                          </span>
                          📱 QR الأساسي جاهز — امسح الآن
                        </div>
                        <div className="flex justify-center">
                          <div className="bg-[var(--surface)] p-2 rounded-xl shadow-lg shadow-emerald-500/10">
                            <img
                              src={baileys.qrCodeDataUrl}
                              alt="WhatsApp Primary QR Code"
                              className="w-40 h-40"
                            />
                          </div>
                        </div>
                        <p className="text-xs text-[var(--ink-2)] text-center">
                          الأجهزة المرتبطة → ربط جهاز → امسح الكود
                        </p>
                      </>
                    ) : baileys?.state === "CONNECTING" ? (
                      <div className="flex items-center justify-center gap-2 py-4">
                        <div className="w-5 h-5 border-2 border-[color-mix(in_srgb,var(--info)_32%,transparent)] border-t-transparent rounded-full animate-spin" />
                        <span className="text-xs font-bold text-[var(--info)]">⏳ جاري الاتصال...</span>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center gap-2 py-3 text-center">
                        <div className="w-10 h-10 rounded-full bg-rose-500/15 border border-[color-mix(in_srgb,var(--danger)_32%,transparent)] flex items-center justify-center text-lg">
                          📵
                        </div>
                        <p className="text-xs font-bold text-[var(--danger)]">غير متصل — اضغط لتوليد QR</p>
                      </div>
                    )}
                  </div>
                )}

                {/* Connected User Info */}
                {baileys?.connected && baileys?.user && (
                  <div className="bg-emerald-500/10 p-2.5 rounded-xl border border-[color-mix(in_srgb,var(--ok)_32%,transparent)] flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-full bg-emerald-500/20 flex items-center justify-center text-base">✅</div>
                    <div className="overflow-hidden">
                      <p className="text-xs font-bold text-[var(--ok)]">متصل (الأساسي)</p>
                      <p className="text-xs text-[var(--ink-2)] font-mono dir-ltr truncate">
                        {baileys.user.phone || baileys.user.name || baileys.user.jid}
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2 pt-2 border-t border-[var(--border)]">
                <button
                  onClick={() => handleAction("reconnect")}
                  className="flex-1 py-2 rounded-xl bg-sky-500/15 hover:bg-sky-500/25 text-[var(--info)] text-xs font-bold border border-[color-mix(in_srgb,var(--info)_32%,transparent)] transition-all cursor-pointer flex items-center justify-center gap-1"
                >
                  🔄 {baileys?.connected ? "إعادة الاتصال" : "توليد QR جديد"}
                </button>
                <button
                  onClick={() => handleAction("logout")}
                  className="px-3.5 py-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-[var(--danger)] text-xs font-bold border border-[color-mix(in_srgb,var(--danger)_32%,transparent)] transition-all cursor-pointer"
                >
                  🚪 خروج
                </button>
              </div>
            </div>

            {/* Provider 2: Optional Fallback Baileys Card */}
            <div className="bg-[var(--surface-2)] rounded-2xl p-5 border border-[var(--border)] space-y-4 flex flex-col justify-between">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-10 h-10 rounded-xl bg-sky-500/15 border border-[color-mix(in_srgb,var(--info)_32%,transparent)] flex items-center justify-center text-xl">
                      🔁
                    </div>
                    <div>
                      <h3 className="font-bold text-[var(--ink)] text-base">الرقم الاحتياطي (اختياري)</h3>
                      <p className="text-xs text-[var(--ink-2)]">بديل تلقائي عند انقطاع الأساسي</p>
                    </div>
                  </div>
                  <span className={`text-xs px-2.5 py-1 rounded-full font-bold border flex items-center gap-1.5 ${
                    fallbackBaileys?.connected
                      ? "bg-sky-500/15 border-[color-mix(in_srgb,var(--info)_32%,transparent)] text-[var(--info)]"
                      : fallbackBaileys?.state === "PAIRING"
                      ? "bg-amber-500/15 border-[color-mix(in_srgb,var(--warn)_32%,transparent)] text-[var(--warn)]"
                      : "bg-[var(--surface)] border-[var(--border)] text-[var(--ink-2)]"
                  }`}>
                    <span>{fallbackBaileys?.connected ? "🟢 متصل (احتياطي)" : fallbackBaileys?.state === "PAIRING" ? "📱 جاهز للمسح" : "⚪ غير مربوط"}</span>
                  </span>
                </div>

                {/* Fallback Explanatory Info */}
                <div className="bg-sky-500/5 p-3 rounded-xl border border-[color-mix(in_srgb,var(--info)_32%,transparent)] text-xs space-y-1.5 text-[var(--ink-2)]">
                  <p className="text-xs leading-relaxed text-[var(--info)]">
                    💡 يمكنك إضافة رقم واتساب ثانٍ ليعمل كـ Fallback تلقائي. إذا انقطع الرقم الأساسي، يتم الإرسال فوراً من هذا الرقم بدون توقف الخدمة.
                  </p>
                </div>

                {/* QR Code Area for Fallback */}
                {!fallbackBaileys?.connected && (
                  <div className="bg-[var(--surface-2)] p-3.5 rounded-xl border border-[var(--border)] space-y-2.5">
                    {fallbackBaileys?.state === "PAIRING" && fallbackBaileys?.qrCodeDataUrl ? (
                      <>
                        <div className="flex items-center gap-1.5 text-xs font-bold text-[var(--info)]">
                          <span className="relative flex h-2 w-2">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-sky-400 opacity-75" />
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-[var(--brand)]" />
                          </span>
                          📱 QR الرقم الاحتياطي جاهز — امسح الآن
                        </div>
                        <div className="flex justify-center">
                          <div className="bg-[var(--surface)] p-2 rounded-xl shadow-lg shadow-sky-500/10">
                            <img
                              src={fallbackBaileys.qrCodeDataUrl}
                              alt="WhatsApp Fallback QR Code"
                              className="w-40 h-40"
                            />
                          </div>
                        </div>
                        <p className="text-xs text-[var(--ink-2)] text-center">
                          امسح الكود من هاتفك الثاني لربط الرقم الاحتياطي
                        </p>
                      </>
                    ) : fallbackBaileys?.state === "CONNECTING" ? (
                      <div className="flex items-center justify-center gap-2 py-4">
                        <div className="w-5 h-5 border-2 border-[color-mix(in_srgb,var(--info)_32%,transparent)] border-t-transparent rounded-full animate-spin" />
                        <span className="text-xs font-bold text-[var(--info)]">⏳ جاري الاتصال بالرقم الاحتياطي...</span>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center gap-2 py-3 text-center">
                        <div className="w-10 h-10 rounded-full bg-sky-500/10 border border-[color-mix(in_srgb,var(--info)_32%,transparent)] flex items-center justify-center text-lg">
                          ➕
                        </div>
                        <p className="text-xs font-bold text-[var(--ink-2)]">الرقم الاحتياطي غير مفعّل</p>
                        <p className="text-xs text-[var(--ink-2)]">اضغط الزر أدناه لتوليد QR وربط رقم ثانٍ في أي وقت</p>
                      </div>
                    )}
                  </div>
                )}

                {/* Connected User Info for Fallback */}
                {fallbackBaileys?.connected && fallbackBaileys?.user && (
                  <div className="bg-sky-500/10 p-2.5 rounded-xl border border-[color-mix(in_srgb,var(--info)_32%,transparent)] flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-full bg-sky-500/20 flex items-center justify-center text-base">🔁</div>
                    <div className="overflow-hidden">
                      <p className="text-xs font-bold text-[var(--info)]">متصل (الرقم الاحتياطي)</p>
                      <p className="text-xs text-[var(--ink-2)] font-mono dir-ltr truncate">
                        {fallbackBaileys.user.phone || fallbackBaileys.user.name || fallbackBaileys.user.jid}
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* Action Buttons for Fallback */}
              <div className="flex items-center gap-2 pt-2 border-t border-[var(--border)]">
                <button
                  onClick={() => handleAction("fallback-reconnect")}
                  className="flex-1 py-2 rounded-xl bg-sky-500/15 hover:bg-sky-500/25 text-[var(--info)] text-xs font-bold border border-[color-mix(in_srgb,var(--info)_32%,transparent)] transition-all cursor-pointer flex items-center justify-center gap-1"
                >
                  🔄 {fallbackBaileys?.connected ? "إعادة اتصال الاحتياطي" : "ربط رقم احتياطي (QR)"}
                </button>
                {fallbackBaileys?.connected && (
                  <button
                    onClick={() => handleAction("fallback-logout")}
                    className="px-3.5 py-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-[var(--danger)] text-xs font-bold border border-[color-mix(in_srgb,var(--danger)_32%,transparent)] transition-all cursor-pointer"
                  >
                    🚪 إلغاء
                  </button>
                )}
              </div>
            </div>

            {/* Provider 3: Official Meta API Card */}
            <div className="bg-[var(--surface-2)] rounded-2xl p-5 border border-[var(--border)] space-y-4 flex flex-col justify-between">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-10 h-10 rounded-xl bg-sky-500/15 border border-[color-mix(in_srgb,var(--info)_32%,transparent)] flex items-center justify-center text-xl">
                      🌐
                    </div>
                    <div>
                      <h3 className="font-bold text-[var(--ink)] text-base">Meta Business API</h3>
                      <p className="text-xs text-[var(--ink-2)]">واجهة ميتا الرسمية لأكواد الـ OTP</p>
                    </div>
                  </div>
                  <span className={`text-xs px-2.5 py-1 rounded-full font-bold border flex items-center gap-1.5 ${
                    meta?.connected
                      ? "bg-sky-500/15 border-[color-mix(in_srgb,var(--info)_32%,transparent)] text-[var(--info)]"
                      : "bg-amber-500/15 border-[color-mix(in_srgb,var(--warn)_32%,transparent)] text-[var(--warn)]"
                  }`}>
                    <span>{meta?.connected ? "🟢 مفعل" : "🟡 اختياري (.env)"}</span>
                  </span>
                </div>

                {/* Daily Quota Progress Bar */}
                <div className="bg-[var(--surface-2)] p-3.5 rounded-xl border border-[var(--border)] space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-[var(--ink-2)]">📊 استهلاك الكوتا اليومية</span>
                    <span className="font-mono font-bold text-[var(--info)]">{metaTotalToday} / {metaLimit}</span>
                  </div>
                  <div className="w-full h-2.5 rounded-full bg-[var(--surface)] overflow-hidden">
                    <div
                      className={`h-full transition-all duration-500 ${progressColor}`}
                      style={{ width: `${metaPercent}%` }}
                    />
                  </div>
                  <div className="flex items-center justify-between text-xs text-[var(--ink-2)]">
                    <span>المتبقي: {metaLimit - metaTotalToday}</span>
                    <span className="dir-ltr">{metaPercent}% used</span>
                  </div>
                </div>

                {/* Official Meta Message Categories Breakdown */}
                <div className="grid grid-cols-3 gap-2">
                  <div className="bg-[var(--surface-2)] p-2 rounded-xl border border-[var(--border)] text-center">
                    <p className="text-xs text-[var(--ink-2)]">OTP Auth</p>
                    <p className="text-sm font-bold text-[var(--info)] mt-0.5">{daily?.officialApi?.authCount || 0}</p>
                  </div>
                  <div className="bg-[var(--surface-2)] p-2 rounded-xl border border-[var(--border)] text-center">
                    <p className="text-xs text-[var(--ink-2)]">Utility</p>
                    <p className="text-sm font-bold text-[var(--ok)] mt-0.5">{daily?.officialApi?.utilityCount || 0}</p>
                  </div>
                  <div className="bg-[var(--surface-2)] p-2 rounded-xl border border-[var(--border)] text-center">
                    <p className="text-xs text-[var(--ink-2)]">Marketing</p>
                    <p className="text-sm font-bold text-[var(--info)] mt-0.5">{daily?.officialApi?.marketingCount || 0}</p>
                  </div>
                </div>

                <div className="text-xs text-[var(--ink-2)] bg-[var(--surface-2)] p-2.5 rounded-lg border border-[var(--border)]">
                  🔒 مفاتيح Meta API في ملف <code className="text-[var(--warn)] font-mono">.env</code> (مخصصة لقوالب الـ OTP الرسمية).
                </div>
              </div>
            </div>
          </div>

          {/* Delivery Strategy Configuration Card */}
          <div className="bg-[var(--surface-2)] rounded-2xl p-5 border border-[var(--border)] space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-bold text-[var(--ink)] text-base flex items-center gap-2">
                  <span>⚡ إستراتيجية الإرسال والتحويل التلقائي (Delivery Strategy & Automatic Failover)</span>
                </h3>
                <p className="text-xs text-[var(--ink-2)] mt-0.5">
                  اختر المزود الأساسي وطريقة التحويل عند الانقطاع أو تجاوز الحدود اليومية.
                </p>
              </div>
              {saveSuccess && (
                <span className="text-xs font-bold text-[var(--ok)] bg-emerald-500/10 px-3 py-1 rounded-full border border-[color-mix(in_srgb,var(--ok)_32%,transparent)]">
                  ✓ تم حفظ الإستراتيجية وتسجيل السجل!
                </span>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {[
                {
                  id: "baileys_primary",
                  title: "⚡ Baileys الأساسي (مع Meta للتحويل)",
                  desc: "يتم استخدام Baileys أولاً للسرعة مجاناً، وتحويل الرسالة تلقائياً لـ Meta API في حال فشل الإرسال.",
                },
                {
                  id: "official_primary",
                  title: "🛡️ Meta API الأساسي (مع Baileys للتحويل)",
                  desc: "يتم استخدام واجهة ميتا الرسمية أولاً لضمان التسليم، والتحويل إلى Baileys عند استهلاك الكوتا.",
                },
                {
                  id: "baileys_only",
                  title: "📱 Baileys فقط",
                  desc: "اعتماد كلي على محرك Baileys المباشر بدون استخدام واجهة ميتا.",
                },
                {
                  id: "official_only",
                  title: "🌐 Official Meta API فقط",
                  desc: "اعتماد كلي على واجهة ميتا الرسمية فقط بدون استخدام Baileys.",
                },
              ].map((opt) => (
                <button
                  type="button"
                  role="radio"
                  aria-checked={deliveryMode === opt.id}
                  disabled={savingConfig}
                  key={opt.id}
                  onClick={() => {
                    setDeliveryMode(opt.id);
                    handleSaveConfig({ deliveryMode: opt.id });
                  }}
                  className={`p-4 rounded-xl border cursor-pointer transition-all text-start disabled:opacity-60 focus-visible:shadow-[var(--adm-ring)] ${
                    deliveryMode === opt.id
                      ? "border-[var(--brand)] bg-[var(--brand-soft)] text-[var(--ink)]"
                      : "border-[var(--border)] bg-[var(--surface)] text-[var(--ink-2)] hover:border-[var(--border-strong)]"
                  }`}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <span
                      aria-hidden
                      className="w-4 h-4 rounded-full shrink-0"
                      style={{ border: `2px solid ${deliveryMode === opt.id ? "var(--brand)" : "var(--border-strong)"}`, boxShadow: deliveryMode === opt.id ? "inset 0 0 0 3px var(--surface-2), inset 0 0 0 8px var(--brand)" : undefined }}
                    />
                    <span className="font-bold text-xs">{opt.title}</span>
                  </div>
                  <p className="text-xs text-[var(--ink-2)] leading-relaxed">{opt.desc}</p>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: LIVE ACTIVITY & AUDIT LOGS */}
      {activeTab === "logs" && (
        <div className="space-y-6">
          <div className="bg-[var(--surface-2)] rounded-2xl p-5 border border-[var(--border)] space-y-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div>
                <h3 className="font-bold text-[var(--ink)] text-base">📋 سجلات إرسال الرسائل الحية (Audit Logs)</h3>
                <p className="text-xs text-[var(--ink-2)] mt-0.5">تتبع كامل لجميع الرسائل الصادرة والنتائج وأسباب الفشل.</p>
              </div>

              {/* Export Buttons */}
              <div className="flex items-center gap-2">
                <button
                  onClick={handleExportCSV}
                  className="px-3 py-2 rounded-xl bg-[var(--surface)] hover:bg-[var(--adm-press)] text-[var(--ink)] text-xs font-bold border border-[var(--border)] transition-all cursor-pointer flex items-center gap-1.5"
                >
                  📥 تصدير ملف CSV
                </button>
                <button
                  onClick={handlePrintPDF}
                  className="px-3 py-2 rounded-xl bg-sky-500/20 hover:bg-sky-500/30 text-[var(--info)] text-xs font-bold border border-[color-mix(in_srgb,var(--info)_32%,transparent)] transition-all cursor-pointer flex items-center gap-1.5"
                >
                  🖨️ طباعة / PDF
                </button>
              </div>
            </div>

            {/* Search and Filters */}
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 pt-2">
              <input
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="بحث برقم الهاتف أو المحتوى..."
                className="bg-[var(--surface-2)] border border-[var(--border)] text-[var(--ink)] px-3.5 py-2 rounded-xl text-xs focus:border-[var(--brand)] outline-none"
              />
              <select
                value={filterProvider}
                onChange={(e) => setFilterProvider(e.target.value)}
                className="bg-[var(--surface-2)] border border-[var(--border)] text-[var(--ink)] px-3.5 py-2 rounded-xl text-xs focus:border-[var(--brand)] outline-none"
              >
                <option value="">جميع المزودات</option>
                <option value="BAILEYS">Baileys Engine</option>
                <option value="OFFICIAL_API">Official Meta API</option>
              </select>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="bg-[var(--surface-2)] border border-[var(--border)] text-[var(--ink)] px-3.5 py-2 rounded-xl text-xs focus:border-[var(--brand)] outline-none"
              >
                <option value="">جميع الحالات</option>
                <option value="DELIVERED">تم التسليم (DELIVERED)</option>
                <option value="FAILED">فشل (FAILED)</option>
                <option value="PENDING">في الانتظار (PENDING)</option>
              </select>
              <select
                value={filterType}
                onChange={(e) => setFilterType(e.target.value)}
                className="bg-[var(--surface-2)] border border-[var(--border)] text-[var(--ink)] px-3.5 py-2 rounded-xl text-xs focus:border-[var(--brand)] outline-none"
              >
                <option value="">جميع أنواع الرسائل</option>
                <option value="OTP">أكواد OTP</option>
                <option value="PARENT_LINK">رابط ولي الأمر</option>
                <option value="NOTIFICATION">إشعارات</option>
                <option value="CUSTOM">رسائل مخصصة</option>
              </select>
            </div>

            {/* Logs Table */}
            <div className="overflow-x-auto border border-[var(--border)] rounded-xl">
              <table className="w-full text-right text-xs">
                <thead className="bg-[var(--surface-2)] text-[var(--ink-2)] border-b border-[var(--border)]">
                  <tr>
                    <th className="p-3">الوقت</th>
                    <th className="p-3">المستلم</th>
                    <th className="p-3">المزود</th>
                    <th className="p-3">نوع الرسالة</th>
                    <th className="p-3">الحالة</th>
                    <th className="p-3">زمن الاستجابة</th>
                    <th className="p-3">المحتوى / الخطأ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)] text-[var(--ink-2)]">
                  {logs.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="p-6 text-center text-[var(--ink-3)]">
                        لا توجد سجلات مطابقة للبحث
                      </td>
                    </tr>
                  ) : (
                    logs.map((log: any) => (
                      <tr key={log.id} className="hover:bg-[var(--adm-hover)] transition-colors">
                        <td className="p-3 whitespace-nowrap text-[var(--ink-2)] font-mono dir-ltr">
                          {new Date(log.createdAt).toLocaleTimeString("ar-EG")}
                        </td>
                        <td className="p-3 font-mono font-bold text-[var(--ink)] dir-ltr">{log.recipient}</td>
                        <td className="p-3">
                          <span className={`px-2 py-0.5 rounded text-xs font-bold ${log.provider === "BAILEYS" ? "bg-emerald-500/15 text-[var(--ok)]" : "bg-sky-500/15 text-[var(--info)]"}`}>
                            {log.provider}
                          </span>
                        </td>
                        <td className="p-3">
                          <span className="px-2 py-0.5 rounded bg-[var(--surface)] text-[var(--ink-2)] text-xs">
                            {log.messageType}
                          </span>
                        </td>
                        <td className="p-3">
                          <span className={`px-2 py-0.5 rounded text-xs font-bold ${log.status === "DELIVERED" ? "bg-emerald-500/20 text-[var(--ok)]" : "bg-rose-500/20 text-[var(--danger)]"}`}>
                            {log.status}
                          </span>
                        </td>
                        <td className="p-3 font-mono text-[var(--ink-2)]">{log.deliveryTimeMs || 0}ms</td>
                        <td className="p-3 max-w-xs truncate text-[var(--ink-2)]">
                          {log.errorMessage ? (
                            <span className="text-[var(--danger)] font-bold">{log.errorMessage}</span>
                          ) : (
                            log.content
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Configuration Change Audit Logs */}
          <div className="bg-[var(--surface-2)] rounded-2xl p-5 border border-[var(--border)] space-y-3">
            <h3 className="font-bold text-[var(--ink)] text-base">🛡️ سجل تعديلات إعدادات الواتساب (Configuration Audit Log)</h3>
            <div className="space-y-2">
              {configLogs.length === 0 ? (
                <p className="text-xs text-[var(--ink-3)]">لا توجد تغييرات مسجلة مؤخراً.</p>
              ) : (
                configLogs.map((cl: any) => (
                  <div key={cl.id} className="p-3 rounded-xl bg-[var(--surface-2)] border border-[var(--border)] text-xs flex items-center justify-between">
                    <div>
                      <span className="font-bold text-[var(--ok)]">{cl.adminName}</span> قامت بتعديل الإعداد <code className="text-[var(--info)] font-mono">{cl.settingKey}</code>
                      {cl.oldValue && <span className="text-[var(--ink-2)]"> من ({cl.oldValue})</span>} إلى <span className="text-[var(--ink)] font-bold">({cl.newValue})</span>
                    </div>
                    <span className="text-xs text-[var(--ink-3)] font-mono dir-ltr">{new Date(cl.createdAt).toLocaleString("ar-EG")}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: TEMPLATES & OTP EDITOR */}
      {activeTab === "templates" && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Baileys OTP Template Editor */}
            <div className="bg-[var(--surface-2)] rounded-2xl p-5 border border-[var(--border)] space-y-4">
              <div>
                <h3 className="font-bold text-[var(--ink)] text-base">📝 محرر قالب كود التحقق (Baileys OTP Template Editor)</h3>
                <p className="text-xs text-[var(--ink-2)] mt-0.5">قم بتعديل صيغة الرسالة التي تصل للطلاب عند طلب كود التحقق.</p>
              </div>

              {/* Variables Quick Insert Chips */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-[var(--ink-2)]">انقر لإضافة المتغيرات المتاحة:</label>
                <div className="flex flex-wrap gap-2">
                  {["{{studentName}}", "{{otp}}", "{{minutes}}", "{{expirationTime}}", "{{school}}", "{{platform}}", "{{supportNumber}}"].map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setBaileysTemplate((prev) => prev + " " + v)}
                      className="px-2.5 py-1 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-[var(--ok)] border border-[color-mix(in_srgb,var(--ok)_32%,transparent)] text-xs font-mono transition-all cursor-pointer"
                    >
                      + {v}
                    </button>
                  ))}
                </div>
              </div>

              <textarea
                rows={7}
                value={baileysTemplate}
                onChange={(e) => setBaileysTemplate(e.target.value)}
                className="w-full bg-[var(--surface-2)] border border-[var(--border)] text-[var(--ink)] p-3 rounded-xl text-xs font-mono outline-none focus:border-[var(--brand)] leading-relaxed"
                placeholder="أدخل قالب الرسالة هنا..."
              />

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => handleSaveConfig()}
                  disabled={savingConfig}
                  className="px-5 py-2.5 rounded-xl bg-[var(--brand)] hover:bg-[var(--brand-strong)] text-[var(--on-brand)] text-xs font-bold transition-all cursor-pointer shadow-md"
                >
                  {savingConfig ? "جاري الحفظ..." : "💾 حفظ القالب"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const def = `🔐 Code-UP\n\nمرحباً {{studentName}}\n\nرمز التحقق الخاص بك هو:\n\n{{otp}}\n\nهذا الرمز صالح لمدة {{minutes}} دقائق.\n\nيرجى عدم مشاركة هذا الرمز مع أي شخص.\n\nشكراً لاستخدام منصة Code-UP.`;
                    setBaileysTemplate(def);
                  }}
                  className="px-4 py-2.5 rounded-xl bg-[var(--surface)] hover:bg-[var(--adm-press)] text-[var(--ink-2)] text-xs font-bold border border-[var(--border)] transition-all cursor-pointer"
                >
                  ↺ استعادة الافتراضي
                </button>
              </div>
            </div>

            {/* Live Mobile WhatsApp Message Preview */}
            <div className="bg-[var(--surface-2)] rounded-2xl p-5 border border-[var(--border)] space-y-4">
              <div>
                <h3 className="font-bold text-[var(--ink)] text-base">📱 معاينة حية لشاشة واتساب الطالب (Live Preview)</h3>
                <p className="text-xs text-[var(--ink-2)] mt-0.5">هكذا ستظهر الرسالة للطالب مباشرة على هاتف الموبايل.</p>
              </div>

              {/* Chat Bubble Card */}
              <div className="p-4 rounded-2xl bg-[#0b141a] border border-[var(--border)] space-y-2 min-h-[220px]">
                <div className="bg-[#202c33] text-[var(--ink)] p-3.5 rounded-2xl rounded-tr-none text-xs leading-relaxed max-w-[85%] whitespace-pre-wrap shadow-md font-sans">
                  {baileysTemplate
                    .replace(/{{studentName}}/g, "أحمد محمد")
                    .replace(/{{otp}}/g, "583921")
                    .replace(/{{minutes}}/g, "5")
                    .replace(/{{school}}/g, "Code-UP") || "القالب فارغ"}
                  <div className="text-xs text-[var(--ink-2)] text-left mt-2 dir-ltr">10:42 PM ✓✓</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: PARENT LINK SETTINGS & TEST SEND */}
      {activeTab === "settings" && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Parent Link Settings */}
            <div className="bg-[var(--surface-2)] rounded-2xl p-5 border border-[var(--border)] space-y-4">
              <div>
                <h3 className="font-bold text-[var(--ink)] text-base">👨‍👩‍👧‍👦 إعدادات رابط ولي الأمر والتحقق</h3>
                <p className="text-xs text-[var(--ink-2)] mt-0.5">التحكم في الإرسال التلقائي واشتراط التحقق لولي الأمر.</p>
              </div>

              <div className="space-y-4">
                {/* Toggle 1: Auto-send Parent Portal */}
                <div className="p-4 rounded-xl bg-[var(--surface-2)] border border-[var(--border)] flex items-center justify-between gap-3">
                  <div>
                    <p className="font-bold text-xs text-[var(--ink)]">إرسال رابط بوابة ولي الأمر تلقائياً</p>
                    <p className="text-xs text-[var(--ink-2)] mt-0.5">
                      عند إنشاء حساب طالب جديد وإدخال رقم ولي الأمر، يتم توليد وإرسال رابط البوابة لمرة واحدة تلقائياً.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const val = !autoSendParent;
                      setAutoSendParent(val);
                      handleSaveConfig({ autoSendParentPortal: val });
                    }}
                    className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${autoSendParent ? "bg-emerald-500" : "bg-[var(--surface-2)]"}`}
                  >
                    <span className={`absolute top-1 w-4 h-4 rounded-full bg-[var(--surface)] transition-all ${autoSendParent ? "left-1" : "left-6"}`} />
                  </button>
                </div>

                {/* Toggle 2: Require Parent Verification */}
                <div className="p-4 rounded-xl bg-[var(--surface-2)] border border-[var(--border)] flex items-center justify-between gap-3">
                  <div>
                    <p className="font-bold text-xs text-[var(--ink)]">اشتراط تأكيد ولي الأمر عبر OTP</p>
                    <p className="text-xs text-[var(--ink-2)] mt-0.5">
                      يبقى حساب الطالب معلقاً (Pending) حتى يقوم ولي الأمر بتأكيد حسابه عبر كود OTP يرسل لواتساب ولي الأمر.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const val = !requireParentVerif;
                      setRequireParentVerif(val);
                      handleSaveConfig({ requireParentVerification: val });
                    }}
                    className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${requireParentVerif ? "bg-emerald-500" : "bg-[var(--surface-2)]"}`}
                  >
                    <span className={`absolute top-1 w-4 h-4 rounded-full bg-[var(--surface)] transition-all ${requireParentVerif ? "left-1" : "left-6"}`} />
                  </button>
                </div>
              </div>
            </div>

            {/* Test Message Generator */}
            <div className="bg-[var(--surface-2)] rounded-2xl p-5 border border-[var(--border)] space-y-4">
              <div>
                <h3 className="font-bold text-[var(--ink)] text-base">🚀 إرسال رسالة اختبار مخصصة (Test Send)</h3>
                <p className="text-xs text-[var(--ink-2)] mt-0.5">اختبار فوري لأداء المحرك وزمن الاستجابة لمسار الإرسال.</p>
              </div>

              <form onSubmit={handleTestSend} className="space-y-3">
                <div>
                  <label className="block text-xs font-bold text-[var(--ink-2)] mb-1">رقم الهاتف (E.164)</label>
                  <input
                    type="text"
                    value={testPhone}
                    onChange={(e) => setTestPhone(e.target.value)}
                    placeholder="01012345678"
                    className="w-full bg-[var(--surface-2)] border border-[var(--border)] text-[var(--ink)] px-3.5 py-2 rounded-xl text-xs outline-none focus:border-[var(--brand)] font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-[var(--ink-2)] mb-1">نوع الرسالة الاختبارية</label>
                  <select
                    value={testType}
                    onChange={(e) => setTestType(e.target.value)}
                    className="w-full bg-[var(--surface-2)] border border-[var(--border)] text-[var(--ink)] px-3.5 py-2 rounded-xl text-xs outline-none focus:border-[var(--brand)]"
                  >
                    <option value="CUSTOM">رسالة مخصصة (Custom Text)</option>
                    <option value="OTP">رمز كود تحقق (OTP)</option>
                    <option value="PARENT_LINK">رابط بوابة ولي الأمر (Parent Link)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-[var(--ink-2)] mb-1">محتوى الرسالة</label>
                  <textarea
                    rows={3}
                    value={testContent}
                    onChange={(e) => setTestContent(e.target.value)}
                    className="w-full bg-[var(--surface-2)] border border-[var(--border)] text-[var(--ink)] p-3 rounded-xl text-xs outline-none focus:border-[var(--brand)]"
                  />
                </div>

                <button
                  type="submit"
                  disabled={testSending}
                  className="w-full py-2.5 rounded-xl bg-[var(--brand)] hover:bg-[var(--brand-strong)] text-[var(--on-brand)] font-bold text-xs transition-all cursor-pointer shadow-md"
                >
                  {testSending ? "جاري الإرسال الاختبار..." : "🚀 إرسال الآن واختبار المحرك"}
                </button>
              </form>

              {testResult && (
                <div className={`p-3.5 rounded-xl border text-xs font-mono space-y-1 ${testResult.success ? "bg-emerald-500/10 border-[color-mix(in_srgb,var(--ok)_32%,transparent)] text-[var(--ok)]" : "bg-rose-500/10 border-[color-mix(in_srgb,var(--danger)_32%,transparent)] text-[var(--danger)]"}`}>
                  <p className="font-bold">{testResult.success ? "✓ تم الإرسال بنجاح!" : "❌ فشل الإرسال"}</p>
                  {testResult.result && (
                    <>
                      <p>المزود المستخدم: {testResult.result.provider}</p>
                      <p>زمن الاستجابة: {testResult.result.deliveryTimeMs}ms</p>
                      {testResult.result.messageId && <p>Message ID: {testResult.result.messageId}</p>}
                    </>
                  )}
                  {testResult.error && <p>الخطأ: {testResult.error}</p>}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      <Modal
        open={!!confirmAction}
        onClose={() => setConfirmAction(null)}
        size="sm"
        title={confirmAction === "fallback-logout" ? "فصل الرقم الاحتياطي؟" : "تسجيل خروج الرقم الأساسي؟"}
        description="ستُمسح جلسة Baileys وتحتاج لمسح رمز QR من جديد لإعادة الربط."
        footer={
          <>
            <Button onClick={() => setConfirmAction(null)}>إلغاء</Button>
            <Button
              variant="danger-solid"
              onClick={() => {
                const a = confirmAction;
                setConfirmAction(null);
                if (a) void handleAction(a, true);
              }}
            >
              تسجيل الخروج
            </Button>
          </>
        }
      />
    </div>
  );
}
