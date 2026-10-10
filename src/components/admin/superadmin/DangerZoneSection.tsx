"use client";
import { useCallback, useEffect, useState } from "react";
import { AlertOctagon, Clock, Trash2 } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { ConfirmActionModal } from "./ConfirmActionModal";
import { Badge, Button, Field, Input, Modal, Notice, PageHeader, Panel, Skeleton, fmtDateTime, fmtNum, readJson } from "@/components/admin/ui/kit";

type Scope = "all" | "students" | "teachers";

interface BulkRequest {
  id: string;
  scope: Scope;
  status: "pending" | "executed" | "cancelled";
  instant: boolean;
  requestedByName: string;
  requestedAt: string;
  executeAt: string;
  executedAt: string | null;
  affectedCount: number | null;
}

interface DangerData {
  requests: BulkRequest[];
  counts: { students: number; teachers: number; all: number };
  graceDays: number;
  purgeDays: number;
  instantConfigured: boolean;
}

const SCOPE_LABEL: Record<Scope, string> = {
  all: "كل المتعلمين والمعلمين",
  students: "المتعلمين فقط",
  teachers: "المعلمين فقط",
};

const CONFIRM_WORD = "حذف";

function fmtCountdown(target: string, nowMs: number): string {
  const diff = new Date(target).getTime() - nowMs;
  if (diff <= 0) return "جارٍ التنفيذ...";
  const d = Math.floor(diff / 86_400_000);
  const h = Math.floor((diff % 86_400_000) / 3_600_000);
  const m = Math.floor((diff % 3_600_000) / 60_000);
  const s = Math.floor((diff % 60_000) / 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return d > 0 ? `${d} يوم ${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(h)}:${pad(m)}:${pad(s)}`;
}

export function DangerZoneSection() {
  const { success: toastSuccess } = useToast();
  const [data, setData] = useState<DangerData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [now, setNow] = useState(() => Date.now());

  const [scope, setScope] = useState<Scope | null>(null);
  const [mode, setMode] = useState<"schedule" | "instant">("schedule");
  const [confirmText, setConfirmText] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");
  const [cancelTarget, setCancelTarget] = useState<BulkRequest | null>(null);

  const load = useCallback(async () => {
    setLoadError("");
    try {
      const res = await fetch("/api/admin/superadmin/bulk-deletion", { credentials: "include" });
      const json = await readJson<DangerData & { error?: string }>(res);
      if (!res.ok || !json) {
        setLoadError(json?.error ?? "تعذر جلب البيانات");
        return;
      }
      setData(json);
    } catch {
      setLoadError("تعذر الاتصال بالخادم");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const pending = data?.requests.filter((r) => r.status === "pending") ?? [];
  const history = data?.requests.filter((r) => r.status !== "pending").slice(0, 8) ?? [];
  const hasPending = pending.length > 0;

  // The countdown only needs a clock while something is scheduled.
  useEffect(() => {
    if (!hasPending) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [hasPending]);

  const openModal = (s: Scope) => {
    setScope(s);
    setMode("schedule");
    setConfirmText("");
    setPassword("");
    setFormError("");
  };

  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!scope) return;
    if (confirmText.trim() !== CONFIRM_WORD) {
      setFormError(`اكتب كلمة «${CONFIRM_WORD}» للتأكيد`);
      return;
    }
    if (!password) {
      setFormError("أدخل كلمة المرور");
      return;
    }
    setSubmitting(true);
    setFormError("");
    try {
      const res = await fetch("/api/admin/superadmin/bulk-deletion", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope, instant: mode === "instant", actionPassword: password }),
      });
      const json = await readJson<{ error?: string; instant?: boolean; affectedCount?: number }>(res);
      if (!res.ok) {
        setFormError(json?.error ?? "تعذر تنفيذ الطلب");
        return;
      }
      toastSuccess(
        json?.instant
          ? `حُذف ${fmtNum(json.affectedCount ?? 0)} حساب فوراً (قابل للاستعادة ${fmtNum(data?.purgeDays ?? 30)} يوماً)`
          : `جُدول الحذف — يُنفّذ بعد ${fmtNum(data?.graceDays ?? 7)} أيام ما لم تُلغِه`
      );
      setScope(null);
      await load();
    } catch {
      setFormError("تعذر الاتصال بالخادم");
    } finally {
      setSubmitting(false);
    }
  };

  const cancelRequest = async (pwd: string) => {
    if (!cancelTarget) return;
    const res = await fetch(`/api/admin/superadmin/bulk-deletion/${cancelTarget.id}`, {
      method: "DELETE",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ actionPassword: pwd }),
    });
    const json = await readJson<{ error?: string }>(res);
    if (!res.ok) throw new Error(json?.error ?? "تعذر إلغاء الطلب");
    toastSuccess("أُلغي طلب الحذف المجدول");
    setCancelTarget(null);
    await load();
  };

  const scopeCount = (s: Scope) => data?.counts[s] ?? 0;

  return (
    <div dir="rtl" className="flex flex-col gap-5 max-w-4xl">
      <PageHeader title="منطقة الخطر" description="حذف جماعي للحسابات. استخدمها فقط لتصفير المنصة أو لإزالة بيانات تجريبية." />

      <Notice tone="bad" title="هذه الأدوات تحذف حسابات بالجملة" icon={<AlertOctagon size={18} />}>
        المشرفون العامّون والموظفون وحسابك أنت <b>محميّون دائماً</b>. الحذف المجدول ينتظر <b>{fmtNum(data?.graceDays ?? 7)} أيام</b> ويمكن إلغاؤه.
        عند التنفيذ تنتقل الحسابات إلى المحذوفات (قابلة للاستعادة)، ثم تُحذف نهائياً بعد <b>{fmtNum(data?.purgeDays ?? 30)} يوماً</b>.
      </Notice>

      {loadError && <Notice tone="bad" title={loadError} action={<Button size="sm" onClick={() => void load()}>إعادة المحاولة</Button>} />}

      {loading ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Skeleton h={120} r={16} />
          <Skeleton h={120} r={16} />
          <Skeleton h={120} r={16} />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {(["all", "students", "teachers"] as Scope[]).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => openModal(s)}
              className="adm-panel p-5 text-start cursor-pointer transition-colors hover:border-[var(--danger)] focus-visible:shadow-[var(--adm-ring)]"
            >
              <p className="text-sm font-bold" style={{ color: "var(--danger)" }}>
                {s === "all" ? "حذف الكل" : s === "students" ? "المتعلمون فقط" : "المعلمون فقط"}
              </p>
              <p className="adm-stat-value">{fmtNum(scopeCount(s))}</p>
              <p className="adm-stat-sub">حساب نشط سيتأثر</p>
            </button>
          ))}
        </div>
      )}

      {hasPending && (
        <Panel title={`طلبات حذف مجدولة (${fmtNum(pending.length)})`} icon={<Clock size={16} />} padded={false}>
          <ul className="adm-list">
            {pending.map((r) => (
              <li key={r.id} className="adm-row">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold">{SCOPE_LABEL[r.scope]}</p>
                  <p className="text-xs adm-muted mt-0.5">
                    طلبه {r.requestedByName} · يُنفَّذ خلال{" "}
                    <b className="adm-mono" style={{ color: "var(--warn)" }}>{fmtCountdown(r.executeAt, now)}</b>
                  </p>
                </div>
                <Button size="sm" onClick={() => setCancelTarget(r)}>إلغاء الطلب</Button>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      {history.length > 0 && (
        <Panel title="آخر العمليات" padded={false}>
          <div className="adm-table-wrap">
            <table className="adm-table">
              <thead>
                <tr>
                  <th>النطاق</th>
                  <th>الحالة</th>
                  <th className="is-num">العدد</th>
                  <th>التاريخ</th>
                </tr>
              </thead>
              <tbody>
                {history.map((r) => (
                  <tr key={r.id}>
                    <td>{SCOPE_LABEL[r.scope]}</td>
                    <td>
                      {r.status === "executed" ? (
                        <Badge tone="bad">{r.instant ? "حذف فوري" : "نُفِّذ"}</Badge>
                      ) : (
                        <Badge>أُلغي</Badge>
                      )}
                    </td>
                    <td className="is-num">{r.affectedCount != null ? fmtNum(r.affectedCount) : "—"}</td>
                    <td className="adm-muted whitespace-nowrap">{fmtDateTime(r.executedAt ?? r.requestedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}

      <Modal
        open={!!scope}
        onClose={() => !submitting && setScope(null)}
        size="sm"
        title={scope ? `حذف: ${SCOPE_LABEL[scope]}` : ""}
        icon={
          <span className="w-9 h-9 rounded-[10px] grid place-items-center" style={{ background: "var(--danger-soft)", color: "var(--danger)" }}>
            <Trash2 size={18} />
          </span>
        }
        footer={
          <>
            <Button onClick={() => setScope(null)} disabled={submitting}>إلغاء</Button>
            <Button type="submit" form="danger-form" variant={mode === "instant" ? "danger-solid" : "danger"} loading={submitting}>
              {mode === "instant" ? "حذف فوري الآن" : `جدولة الحذف (${fmtNum(data?.graceDays ?? 7)} أيام)`}
            </Button>
          </>
        }
      >
        {scope && (
          <form id="danger-form" onSubmit={submit} className="flex flex-col gap-4">
            <p className="text-sm leading-relaxed" style={{ color: "var(--ink-2)" }}>
              سيتأثّر <b style={{ color: "var(--danger)" }}>{fmtNum(scopeCount(scope))}</b> حساب، وتبقى قابلة للاستعادة {fmtNum(data?.purgeDays ?? 30)} يوماً قبل الحذف النهائي.
            </p>

            <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="طريقة الحذف">
              <ModeOption
                active={mode === "schedule"}
                onClick={() => setMode("schedule")}
                title="جدولة"
                sub={`بعد ${fmtNum(data?.graceDays ?? 7)} أيام — قابل للإلغاء`}
                tone="warn"
              />
              <ModeOption
                active={mode === "instant"}
                onClick={() => setMode("instant")}
                disabled={!data?.instantConfigured}
                title="حذف فوري"
                sub={data?.instantConfigured ? "الآن — بكلمة مرور خاصة" : "غير مُفعّل على الخادم"}
                tone="bad"
              />
            </div>

            <Field label={<>اكتب «<b>{CONFIRM_WORD}</b>» للتأكيد</>} htmlFor="dz-confirm">
              <Input
                id="dz-confirm"
                data-autofocus
                value={confirmText}
                onChange={(e) => {
                  setConfirmText(e.target.value);
                  if (formError) setFormError("");
                }}
                placeholder={CONFIRM_WORD}
                autoComplete="off"
              />
            </Field>
            <Field
              label={mode === "instant" ? "كلمة مرور الحذف الفوري (BULK_DELETE_PASSWORD)" : "كلمة مرور المشرف"}
              htmlFor="dz-pass"
              error={formError || undefined}
            >
              <Input
                id="dz-pass"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (formError) setFormError("");
                }}
                placeholder="••••••••"
              />
            </Field>
          </form>
        )}
      </Modal>

      {cancelTarget && (
        <ConfirmActionModal
          title="إلغاء طلب الحذف"
          description={`سيُلغى الحذف المجدول لـ«${SCOPE_LABEL[cancelTarget.scope]}». تبقى الحسابات كما هي.`}
          actionLabel="إلغاء الطلب"
          variant="warning"
          onConfirm={cancelRequest}
          onClose={() => setCancelTarget(null)}
        />
      )}
    </div>
  );
}

function ModeOption({
  active,
  onClick,
  title,
  sub,
  tone,
  disabled,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  sub: string;
  tone: "warn" | "bad";
  disabled?: boolean;
}) {
  const c = tone === "bad" ? "var(--danger)" : "var(--warn)";
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onClick}
      disabled={disabled}
      className="rounded-xl px-3 py-2.5 text-start cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
      style={{
        border: `1px solid ${active ? c : "var(--border-strong)"}`,
        background: active ? `color-mix(in srgb, ${c} 10%, var(--surface))` : "var(--surface)",
      }}
    >
      <p className="text-sm font-bold" style={{ color: c }}>{title}</p>
      <p className="text-xs adm-muted mt-0.5">{sub}</p>
    </button>
  );
}
