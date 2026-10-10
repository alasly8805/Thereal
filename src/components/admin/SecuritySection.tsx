"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, Camera, Eraser, RefreshCw, ShieldAlert, ShieldCheck, Trash2, UserX, Wrench } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import {
  Badge,
  Button,
  EmptyState,
  IconButton,
  Modal,
  Notice,
  PageHeader,
  Panel,
  SearchInput,
  Select,
  SkeletonRows,
  Stat,
  fmtDateTime,
  fmtNum,
  readJson,
  type Tone,
} from "@/components/admin/ui/kit";

interface ViolationItem {
  id: string;
  createdAt: string | Date;
  type: string;
  details?: string;
  videoId?: string;
  student?: { id?: string; name?: string; phone?: string; parentPhone?: string };
}

interface SecurityStats {
  totalCount?: number;
  total?: number;
  todayCount?: number;
  today?: number;
  devToolsCount?: number;
  screenshotCount?: number;
  vpnCount?: number;
}

const TYPES: Record<string, { label: string; tone: Tone }> = {
  DEVTOOLS: { label: "أدوات المطور", tone: "bad" },
  SCREENSHOT: { label: "تصوير الشاشة", tone: "warn" },
  VPN_DETECTED: { label: "VPN / بروكسي", tone: "info" },
  TAB_SWITCH: { label: "مغادرة تبويب الفيديو", tone: "neutral" },
  CONTEXT_MENU: { label: "كليك يمين / فحص", tone: "warn" },
  // Raised by the server's encrypted-video key endpoint, not the browser.
  VIDEO_DOWNLOAD: { label: "محاولة تحميل الفيديو", tone: "bad" },
  KEY_RATE_LIMIT: { label: "طلب مفاتيح الفيديو بسرعة", tone: "warn" },
  SUSTAINED_SPEED: { label: "تسريع مفرط وغير معتاد", tone: "warn" },
  WATERMARK_TAMPER: { label: "العبث بالعلامة المائية", tone: "bad" },
};

type Pending =
  | { kind: "delete"; v: ViolationItem }
  | { kind: "purge" }
  | { kind: "clear" }
  | { kind: "ban"; studentId: string; name: string }
  | null;

const REFRESH_MS = 30000;

export function SecuritySection() {
  const { success: toastSuccess, error: toastError } = useToast();
  const [loading, setLoading] = useState(true);
  const [violations, setViolations] = useState<ViolationItem[]>([]);
  const [stats, setStats] = useState<SecurityStats | null>(null);
  const [filterType, setFilterType] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending>(null);
  const [busy, setBusy] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const seq = useRef(0);

  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  const fetchViolations = useCallback(
    async (silent = false) => {
      const id = ++seq.current;
      if (!silent) setLoading(true);
      try {
        const params = new URLSearchParams();
        if (filterType) params.set("type", filterType);
        if (search) params.set("search", search);
        const res = await fetch(`/api/admin/security-violations?${params.toString()}`, { credentials: "include" });
        const json = await readJson<{ success?: boolean; violations?: ViolationItem[]; stats?: SecurityStats; error?: string }>(res);
        if (id !== seq.current) return;
        if (json?.success) {
          setViolations(json.violations || []);
          setStats(json.stats || null);
          setError(null);
          setLastUpdated(new Date());
        } else if (!silent) {
          setError(json?.error || "تعذر تحميل سجل المخالفات");
        }
      } catch {
        if (id === seq.current && !silent) setError("تعذر الاتصال بالخادم");
      } finally {
        if (id === seq.current) setLoading(false);
      }
    },
    [filterType, search]
  );

  useEffect(() => {
    void fetchViolations();
    const t = setInterval(() => {
      if (document.visibilityState === "visible") void fetchViolations(true);
    }, REFRESH_MS);
    return () => clearInterval(t);
  }, [fetchViolations]);

  const runPending = async () => {
    const p = pending;
    if (!p) return;
    setBusy(true);
    try {
      if (p.kind === "delete") {
        const res = await fetch(`/api/admin/security-violations?id=${encodeURIComponent(p.v.id)}`, { method: "DELETE", credentials: "include" });
        const data = await readJson<{ success?: boolean; error?: string }>(res);
        if (!data?.success) throw new Error(data?.error || "تعذر الحذف");
        setViolations((prev) => prev.filter((x) => x.id !== p.v.id));
        toastSuccess("حُذف السجل");
      } else if (p.kind === "purge") {
        const res = await fetch("/api/admin/security-violations?action=purge-false-positives", { method: "DELETE", credentials: "include" });
        const data = await readJson<{ success?: boolean; message?: string; error?: string }>(res);
        if (!data?.success) throw new Error(data?.error || "تعذر التنظيف");
        toastSuccess(data.message || "نُظّفت الإنذارات الكاذبة");
        void fetchViolations(true);
      } else if (p.kind === "clear") {
        const res = await fetch("/api/admin/security-violations?action=clear-all", { method: "DELETE", credentials: "include" });
        const data = await readJson<{ success?: boolean; error?: string }>(res);
        if (!data?.success) throw new Error(data?.error || "تعذر مسح السجل");
        setViolations([]);
        toastSuccess("أُفرغ سجل المخالفات");
        void fetchViolations(true);
      } else if (p.kind === "ban") {
        const res = await fetch("/api/admin/security-violations", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ studentId: p.studentId, action: "ban" }),
        });
        const data = await readJson<{ success?: boolean; message?: string; error?: string }>(res);
        if (!data?.success) throw new Error(data?.error || "تعذر حظر الحساب");
        toastSuccess(data.message || `حُظر ${p.name}`);
      }
      setPending(null);
    } catch (e) {
      toastError(e instanceof Error ? e.message : "تعذر تنفيذ الإجراء");
    } finally {
      setBusy(false);
    }
  };

  const pendingMeta = (() => {
    if (!pending) return null;
    switch (pending.kind) {
      case "delete":
        return { title: "حذف هذا السجل؟", text: `${TYPES[pending.v.type]?.label ?? pending.v.type} — ${pending.v.student?.name ?? "طالب غير مسجل"}`, action: "حذف" };
      case "purge":
        return { title: "تنظيف الإنذارات الكاذبة؟", text: "ستُحذف السجلات الناتجة عن مقاسات الشاشات (DevTools) وفقدان التركيز المؤقت على الموبايل والتابلت.", action: "تنظيف" };
      case "clear":
        return { title: "مسح كل سجل المخالفات؟", text: "ستُحذف كل السجلات نهائياً ولا يمكن استرجاعها.", action: "مسح الكل" };
      case "ban":
        return { title: `حظر حساب ${pending.name}؟`, text: "لن يستطيع الطالب الدخول حتى يُرفع الحظر من ملفه.", action: "حظر" };
    }
  })();

  return (
    <div dir="rtl" className="flex flex-col gap-5">
      <PageHeader
        title="الرصد الأمني"
        description="محاولات فتح أدوات المطور، تصوير الشاشة، استخدام VPN، ومغادرة الفيديو أثناء المشاهدة."
        meta={lastUpdated && <Badge tone="ok" live>يتحدث كل ٣٠ ثانية · آخر تحديث {lastUpdated.toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit" })}</Badge>}
        actions={
          <>
            <Button onClick={() => void fetchViolations()} loading={loading} icon={<RefreshCw size={15} />}>تحديث</Button>
            <Button variant="ghost" onClick={() => setPending({ kind: "purge" })} icon={<Eraser size={15} />} title="حذف الإنذارات الكاذبة من الموبايل والتابلت">
              تنظيف الإنذارات الكاذبة
            </Button>
            <Button variant="danger" onClick={() => setPending({ kind: "clear" })} icon={<Trash2 size={15} />}>مسح الكل</Button>
          </>
        }
      />

      <div className="adm-stats">
        <Stat label="إجمالي المخالفات" value={fmtNum(stats?.totalCount ?? stats?.total ?? 0)} icon={<ShieldAlert size={16} />} sub="السجل التراكمي" />
        <Stat label="اليوم" value={fmtNum(stats?.todayCount ?? stats?.today ?? 0)} tone="warn" icon={<AlertTriangle size={16} />} sub="آخر ٢٤ ساعة" />
        <Stat label="أدوات المطور" value={fmtNum(stats?.devToolsCount ?? 0)} tone="bad" icon={<Wrench size={16} />} />
        <Stat label="تصوير الشاشة" value={fmtNum(stats?.screenshotCount ?? 0)} tone="info" icon={<Camera size={16} />} />
      </div>

      <Panel
        padded={false}
        title={`${fmtNum(violations.length)} سجل`}
        actions={
          <>
            <Select inputSize="sm" value={filterType} onChange={(e) => setFilterType(e.target.value)} aria-label="نوع المخالفة" className="w-48">
              <option value="">كل الأنواع</option>
              {Object.entries(TYPES).map(([k, t]) => (
                <option key={k} value={k}>{t.label}</option>
              ))}
            </Select>
            <SearchInput value={searchInput} onChange={setSearchInput} placeholder="اسم الطالب أو الهاتف" inputSize="sm" className="w-60 max-w-full" />
          </>
        }
      >
        {error ? (
          <div className="p-4"><Notice tone="bad" title={error} action={<Button size="sm" onClick={() => void fetchViolations()}>إعادة المحاولة</Button>} /></div>
        ) : loading && violations.length === 0 ? (
          <SkeletonRows rows={6} />
        ) : violations.length === 0 ? (
          <EmptyState icon={<ShieldCheck size={22} />} title="لا توجد مخالفات" text={search || filterType ? "لا شيء يطابق البحث أو الفلتر." : "لم تُسجّل أي محاولات حتى الآن."} />
        ) : (
          <div className="adm-table-wrap" style={{ opacity: loading ? 0.6 : 1 }}>
            <table className="adm-table" style={{ minWidth: 860 }}>
              <thead>
                <tr>
                  <th>الوقت</th>
                  <th>الطالب</th>
                  <th>الهاتف</th>
                  <th>ولي الأمر</th>
                  <th>النوع</th>
                  <th>التفاصيل</th>
                  <th className="is-actions" />
                </tr>
              </thead>
              <tbody>
                {violations.map((v) => {
                  const t = TYPES[v.type];
                  return (
                    <tr key={v.id}>
                      <td className="whitespace-nowrap adm-muted text-[13px]">{fmtDateTime(v.createdAt)}</td>
                      <td className="font-semibold">{v.student?.name || <span className="adm-muted">غير مسجل</span>}</td>
                      <td><span className="adm-mono">{v.student?.phone || "—"}</span></td>
                      <td><span className="adm-mono">{v.student?.parentPhone || "—"}</span></td>
                      <td><Badge tone={t?.tone ?? "neutral"}>{t?.label ?? v.type}</Badge></td>
                      <td style={{ maxWidth: 260 }}>
                        <span className="adm-mono block truncate text-xs adm-muted" title={v.details || ""}>{v.details || "—"}</span>
                      </td>
                      <td className="is-actions">
                        <div className="inline-flex gap-1">
                          {v.student?.id && (
                            <IconButton label="حظر حساب الطالب" size="sm" onClick={() => setPending({ kind: "ban", studentId: v.student!.id!, name: v.student?.name || "الطالب" })}>
                              <UserX size={15} />
                            </IconButton>
                          )}
                          <IconButton label="حذف السجل" size="sm" onClick={() => setPending({ kind: "delete", v })} style={{ color: "var(--danger)" }}>
                            <Trash2 size={15} />
                          </IconButton>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Modal
        open={!!pending}
        onClose={() => !busy && setPending(null)}
        size="sm"
        title={pendingMeta?.title ?? ""}
        description={pendingMeta?.text}
        footer={
          <>
            <Button onClick={() => setPending(null)} disabled={busy}>إلغاء</Button>
            <Button variant={pending?.kind === "purge" ? "primary" : "danger-solid"} loading={busy} onClick={() => void runPending()}>
              {pendingMeta?.action}
            </Button>
          </>
        }
      />
    </div>
  );
}
