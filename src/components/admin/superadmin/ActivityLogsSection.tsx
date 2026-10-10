"use client";
import { useCallback, useEffect, useState } from "react";
import { ClipboardList, RefreshCw, RotateCcw, Search } from "lucide-react";
import {
  Badge,
  Button,
  EmptyState,
  Field,
  Input,
  Notice,
  PageHeader,
  Pagination,
  Panel,
  Select,
  SkeletonRows,
  fmtDateTime,
  fmtNum,
  readJson,
  type Tone,
} from "@/components/admin/ui/kit";

interface LogEntry {
  id: string;
  adminId: string;
  adminName: string;
  action: string;
  targetType: string;
  targetId: string;
  targetName: string;
  metadata: string | null;
  createdAt: string;
}

const ACTIONS: Record<string, { label: string; tone: Tone }> = {
  SUSPEND_STUDENT: { label: "إيقاف متعلم", tone: "warn" },
  UNSUSPEND_STUDENT: { label: "إعادة تفعيل متعلم", tone: "ok" },
  SOFT_DELETE_STUDENT: { label: "أرشفة متعلم", tone: "warn" },
  RESTORE_STUDENT: { label: "استعادة متعلم", tone: "info" },
  HARD_DELETE_STUDENT: { label: "حذف نهائي لمتعلم", tone: "bad" },
  CREATE_TEACHER: { label: "إنشاء معلم", tone: "ok" },
  EDIT_TEACHER_NAME: { label: "تعديل اسم معلم", tone: "info" },
  RESET_TEACHER_PASSWORD: { label: "تغيير كلمة مرور معلم", tone: "warn" },
  DELETE_TEACHER: { label: "حذف معلم", tone: "bad" },
  HARD_DELETE_TEACHER: { label: "حذف نهائي لمعلم", tone: "bad" },
  RESTORE_TEACHER: { label: "استعادة معلم", tone: "info" },
  TOGGLE_TEACHER_PROMO_PROGRAM: { label: "تبديل إحالة معلم", tone: "neutral" },
  CREATE_STAFF_ACCOUNT: { label: "إنشاء حساب موظف", tone: "ok" },
  DELETE_STAFF_ACCOUNT: { label: "حذف حساب موظف", tone: "bad" },
  SUSPEND_STAFF_ACCOUNT: { label: "إيقاف موظف", tone: "warn" },
  UNSUSPEND_STAFF_ACCOUNT: { label: "إعادة تفعيل موظف", tone: "ok" },
  RESET_STAFF_PASSWORD: { label: "تغيير كلمة مرور موظف", tone: "warn" },
  BULK_DELETE_SCHEDULED: { label: "جدولة حذف جماعي", tone: "warn" },
  BULK_DELETE_INSTANT: { label: "حذف جماعي فوري", tone: "bad" },
  BULK_DELETE_CANCELLED: { label: "إلغاء حذف جماعي", tone: "info" },
  BULK_DELETE_EXECUTED: { label: "تنفيذ حذف جماعي", tone: "bad" },
  SUPERADMIN_MANUAL_ENROLL: { label: "تسجيل يدوي في كورس", tone: "info" },
  MANUAL_TEACHER_SUBSCRIPTION: { label: "حجز معلم يدوي", tone: "info" },
  SUPERADMIN_ACTION: { label: "طلب API للمشرف", tone: "neutral" },
};

const PAGE_SIZE = 25;

interface Filters {
  action: string;
  q: string;
  from: string;
  to: string;
  includeRouteHits: boolean;
}

const EMPTY: Filters = { action: "", q: "", from: "", to: "", includeRouteHits: false };

function describeMeta(raw: string | null) {
  if (!raw) return null;
  try {
    const meta = JSON.parse(raw) as Record<string, unknown>;
    const parts = Object.entries(meta)
      .filter(([, v]) => v !== null && v !== undefined && v !== "")
      .map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : String(v)}`);
    return parts.length ? parts.join(" · ") : null;
  } catch {
    return raw;
  }
}

export function ActivityLogsSection() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [page, setPage] = useState(0);
  const [draft, setDraft] = useState<Filters>(EMPTY);
  const [applied, setApplied] = useState<Filters>(EMPTY);

  const fetchLogs = useCallback(async (f: Filters, pageOffset: number) => {
    setLoading(true);
    setLoadError("");
    const params = new URLSearchParams();
    if (f.action) params.set("action", f.action);
    if (f.q.trim()) params.set("q", f.q.trim());
    if (f.from) params.set("from", f.from);
    if (f.to) params.set("to", f.to);
    if (f.includeRouteHits) params.set("includeRouteHits", "1");
    params.set("limit", String(PAGE_SIZE));
    params.set("offset", String(pageOffset * PAGE_SIZE));
    try {
      const res = await fetch(`/api/admin/superadmin/logs?${params.toString()}`, { credentials: "include" });
      const data = await readJson<{ logs?: LogEntry[]; total?: number; error?: string }>(res);
      if (!res.ok) {
        setLoadError(data?.error || "تعذر تحميل السجلات");
        return;
      }
      setLogs(data?.logs ?? []);
      setTotal(data?.total ?? 0);
    } catch {
      setLoadError("تعذر الاتصال بالخادم");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchLogs(EMPTY, 0);
  }, [fetchLogs]);

  const apply = (f: Filters) => {
    setApplied(f);
    setPage(0);
    void fetchLogs(f, 0);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    apply(draft);
  };

  const reset = () => {
    setDraft(EMPTY);
    apply(EMPTY);
  };

  const totalPages = Math.ceil(total / PAGE_SIZE);
  const filtered = JSON.stringify(applied) !== JSON.stringify(EMPTY);

  return (
    <div dir="rtl" className="flex flex-col gap-5">
      <PageHeader
        title="سجل النشاط"
        description="كل إجراء حساس نفّذه المشرفون والموظفون: الحذف والاستعادة وتغيير كلمات المرور والتسجيل اليدوي."
        actions={
          <Button onClick={() => void fetchLogs(applied, page)} loading={loading} icon={<RefreshCw size={15} />}>
            تحديث
          </Button>
        }
      />

      <Panel>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 180px), 1fr))" }}>
            <Field label="بحث بالاسم" htmlFor="log-q">
              <Input id="log-q" value={draft.q} onChange={(e) => setDraft({ ...draft, q: e.target.value })} placeholder="اسم المشرف أو الهدف" />
            </Field>
            <Field label="نوع الإجراء" htmlFor="log-action">
              <Select id="log-action" value={draft.action} onChange={(e) => setDraft({ ...draft, action: e.target.value })}>
                <option value="">كل الإجراءات</option>
                {Object.entries(ACTIONS).map(([key, meta]) => (
                  <option key={key} value={key}>
                    {meta.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="من تاريخ" htmlFor="log-from">
              <Input id="log-from" type="date" value={draft.from} max={draft.to || undefined} onChange={(e) => setDraft({ ...draft, from: e.target.value })} />
            </Field>
            <Field label="إلى تاريخ" htmlFor="log-to">
              <Input id="log-to" type="date" value={draft.to} min={draft.from || undefined} onChange={(e) => setDraft({ ...draft, to: e.target.value })} />
            </Field>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" variant="primary" icon={<Search size={15} />} loading={loading}>
              عرض السجلات
            </Button>
            {filtered && (
              <Button variant="ghost" onClick={reset} icon={<RotateCcw size={14} />}>
                مسح الفلاتر
              </Button>
            )}
            <label className="adm-check ms-auto">
              <input
                type="checkbox"
                checked={draft.includeRouteHits}
                onChange={(e) => setDraft({ ...draft, includeRouteHits: e.target.checked })}
              />
              إظهار طلبات الـ API العامة
            </label>
          </div>
        </form>
      </Panel>

      <Panel
        padded={false}
        title={loading && logs.length === 0 ? "جارٍ التحميل" : `${fmtNum(total)} سجل`}
        footer={
          totalPages > 1 ? (
            <Pagination page={page} pageCount={totalPages} total={total} unit="سجل" disabled={loading} onPage={(p) => { setPage(p); void fetchLogs(applied, p); }} />
          ) : undefined
        }
      >
        {loadError ? (
          <div className="p-4">
            <Notice tone="bad" title={loadError} action={<Button size="sm" onClick={() => void fetchLogs(applied, page)}>إعادة المحاولة</Button>} />
          </div>
        ) : loading && logs.length === 0 ? (
          <SkeletonRows rows={6} />
        ) : logs.length === 0 ? (
          <EmptyState
            icon={<ClipboardList size={22} />}
            title={filtered ? "لا توجد سجلات تطابق الفلتر" : "لا توجد سجلات بعد"}
            text={filtered ? "وسّع نطاق التاريخ أو امسح الفلاتر." : "ستظهر هنا الإجراءات الحساسة فور تنفيذها."}
          />
        ) : (
          <div className="adm-table-wrap" style={{ opacity: loading ? 0.6 : 1 }}>
            <table className="adm-table" style={{ minWidth: 760 }}>
              <thead>
                <tr>
                  <th>الوقت</th>
                  <th>المشرف</th>
                  <th>الإجراء</th>
                  <th>الهدف</th>
                  <th>تفاصيل</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => {
                  const meta = ACTIONS[log.action];
                  const details = describeMeta(log.metadata);
                  return (
                    <tr key={log.id}>
                      <td className="whitespace-nowrap adm-muted text-[13px]">{fmtDateTime(log.createdAt)}</td>
                      <td className="font-semibold">{log.adminName}</td>
                      <td>
                        <Badge tone={meta?.tone ?? "neutral"}>{meta?.label ?? log.action}</Badge>
                      </td>
                      <td>
                        <p className="font-semibold">{log.targetName || "—"}</p>
                        <p className="text-xs adm-muted">{log.targetType}</p>
                      </td>
                      <td className="text-xs adm-muted" style={{ maxWidth: 320 }}>
                        {details ? (
                          <span className="line-clamp-2" title={details}>
                            {details}
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}
