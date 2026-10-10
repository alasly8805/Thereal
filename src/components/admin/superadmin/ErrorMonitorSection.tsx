"use client";
import { useCallback, useEffect, useState } from "react";
import { ChevronDown, Copy, RefreshCw, ShieldCheck, Trash2 } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import {
  Badge,
  Button,
  Chip,
  EmptyState,
  Modal,
  Notice,
  PageHeader,
  Pagination,
  Panel,
  SkeletonRows,
  fmtDateTime,
  fmtNum,
  readJson,
  type Tone,
} from "@/components/admin/ui/kit";

interface ClientError {
  id: string;
  type: string;
  message: string;
  stack: string | null;
  url: string | null;
  userAgent: string | null;
  userId: string | null;
  userRole: string | null;
  createdAt: string;
}

const TYPE_META: Record<string, { label: string; tone: Tone }> = {
  error: { label: "خطأ", tone: "bad" },
  warning: { label: "تحذير", tone: "warn" },
  unhandled_promise: { label: "Promise غير معالج", tone: "warn" },
  api_error: { label: "خطأ API", tone: "info" },
};

const TYPE_FILTERS = [
  { value: "", label: "الكل" },
  { value: "error", label: "أخطاء" },
  { value: "warning", label: "تحذيرات" },
  { value: "unhandled_promise", label: "Promise" },
  { value: "api_error", label: "API" },
];

const PAGE_SIZE = 50;

export function ErrorMonitorSection() {
  const { success: toastSuccess, error: toastError } = useToast();
  const [errors, setErrors] = useState<ClientError[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [page, setPage] = useState(0);
  const [typeFilter, setTypeFilter] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [clearing, setClearing] = useState(false);

  const fetchErrors = useCallback(async (type: string, pageOffset: number) => {
    setLoading(true);
    setLoadError("");
    const params = new URLSearchParams();
    if (type) params.set("type", type);
    params.set("limit", String(PAGE_SIZE));
    params.set("offset", String(pageOffset * PAGE_SIZE));
    try {
      const res = await fetch(`/api/admin/superadmin/errors?${params}`, { credentials: "include" });
      const data = await readJson<{ errors?: ClientError[]; total?: number; error?: string }>(res);
      if (!res.ok) {
        setLoadError(data?.error || "تعذر تحميل السجلات");
        return;
      }
      setErrors(data?.errors ?? []);
      setTotal(data?.total ?? 0);
    } catch {
      setLoadError("تعذر الاتصال بالخادم");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchErrors(typeFilter, page);
  }, [fetchErrors, typeFilter, page]);

  const handleClearAll = async () => {
    setClearing(true);
    try {
      const res = await fetch("/api/admin/superadmin/errors", { method: "DELETE", credentials: "include" });
      const data = await readJson<{ cleared?: number; error?: string }>(res);
      if (!res.ok) throw new Error(data?.error ?? "تعذر المسح");
      toastSuccess(`تم مسح ${fmtNum(data?.cleared ?? 0)} سجل`);
      setErrors([]);
      setTotal(0);
      setPage(0);
      setConfirmClear(false);
    } catch (e) {
      toastError(e instanceof Error ? e.message : "تعذر المسح");
    } finally {
      setClearing(false);
    }
  };

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toastSuccess("نُسخ إلى الحافظة");
    } catch {
      toastError("تعذر النسخ");
    }
  };

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div dir="rtl" className="flex flex-col gap-5">
      <PageHeader
        title="الأخطاء"
        description="أخطاء المتصفح والـ API التي واجهها المستخدمون. افتح أي سجل لرؤية الـ Stack والصفحة والجهاز."
        actions={
          <>
            <Button onClick={() => void fetchErrors(typeFilter, page)} loading={loading} icon={<RefreshCw size={15} />}>
              تحديث
            </Button>
            {total > 0 && (
              <Button variant="danger" onClick={() => setConfirmClear(true)} icon={<Trash2 size={15} />}>
                مسح الكل
              </Button>
            )}
          </>
        }
      />

      <div className="flex flex-wrap gap-2" role="group" aria-label="نوع السجل">
        {TYPE_FILTERS.map((f) => (
          <Chip
            key={f.value}
            pressed={typeFilter === f.value}
            onClick={() => {
              setTypeFilter(f.value);
              setPage(0);
            }}
          >
            {f.label}
          </Chip>
        ))}
      </div>

      <Panel
        padded={false}
        title={loading && errors.length === 0 ? "جارٍ التحميل" : `${fmtNum(total)} سجل`}
        footer={
          totalPages > 1 ? (
            <Pagination page={page} pageCount={totalPages} total={total} unit="سجل" onPage={setPage} disabled={loading} />
          ) : undefined
        }
      >
        {loadError ? (
          <div className="p-4">
            <Notice tone="bad" title={loadError} action={<Button size="sm" onClick={() => void fetchErrors(typeFilter, page)}>إعادة المحاولة</Button>} />
          </div>
        ) : loading && errors.length === 0 ? (
          <SkeletonRows rows={6} h={60} />
        ) : errors.length === 0 ? (
          <EmptyState icon={<ShieldCheck size={22} />} title="لا توجد أخطاء مسجّلة" text="كل شيء يعمل. أي خطأ جديد يواجهه مستخدم سيظهر هنا." />
        ) : (
          <ul className="adm-list" style={{ opacity: loading ? 0.6 : 1 }}>
            {errors.map((err) => {
              const meta = TYPE_META[err.type] ?? TYPE_META.error;
              const isExpanded = expandedId === err.id;
              return (
                <li key={err.id}>
                  <button
                    type="button"
                    onClick={() => setExpandedId(isExpanded ? null : err.id)}
                    aria-expanded={isExpanded}
                    className="adm-row w-full text-start cursor-pointer hover:bg-[var(--adm-hover)]"
                    style={{ alignItems: "flex-start" }}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-1.5">
                        <Badge tone={meta.tone} dot>{meta.label}</Badge>
                        {err.userRole && <Badge>{err.userRole}</Badge>}
                        <span className="text-xs adm-muted">{fmtDateTime(err.createdAt)}</span>
                      </div>
                      <p className="adm-mono text-[13px] leading-relaxed break-all text-start" style={{ direction: "ltr" }}>
                        {err.message}
                      </p>
                      {err.url && <p className="text-xs adm-muted mt-1 truncate" style={{ direction: "ltr", textAlign: "right" }}>{err.url}</p>}
                    </div>
                    <ChevronDown
                      size={16}
                      className="shrink-0 mt-1"
                      style={{ color: "var(--ink-3)", transform: isExpanded ? "rotate(180deg)" : undefined, transition: "transform 180ms" }}
                      aria-hidden
                    />
                  </button>

                  {isExpanded && (
                    <div className="px-4 pb-4 sm:px-[18px] flex flex-col gap-3">
                      {err.stack && (
                        <div>
                          <div className="flex items-center justify-between mb-1.5">
                            <span className="adm-label">Stack trace</span>
                            <Button size="sm" variant="ghost" icon={<Copy size={13} />} onClick={() => void copy(`${err.message}\n\n${err.stack}`)}>
                              نسخ
                            </Button>
                          </div>
                          <pre className="adm-code">{err.stack}</pre>
                        </div>
                      )}
                      <dl className="adm-kv text-xs">
                        {err.userId && (
                          <>
                            <dt>المستخدم</dt>
                            <dd className="adm-mono">{err.userId}</dd>
                          </>
                        )}
                        {err.userAgent && (
                          <>
                            <dt>الجهاز</dt>
                            <dd className="adm-mono" style={{ fontWeight: 400 }}>{err.userAgent}</dd>
                          </>
                        )}
                      </dl>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Panel>

      <Modal
        open={confirmClear}
        onClose={() => !clearing && setConfirmClear(false)}
        size="sm"
        title="مسح كل السجلات؟"
        description={`سيُحذف ${fmtNum(total)} سجل نهائياً. لا يمكن التراجع.`}
        footer={
          <>
            <Button onClick={() => setConfirmClear(false)} disabled={clearing}>إلغاء</Button>
            <Button variant="danger-solid" onClick={() => void handleClearAll()} loading={clearing}>مسح الكل</Button>
          </>
        }
      />
    </div>
  );
}
