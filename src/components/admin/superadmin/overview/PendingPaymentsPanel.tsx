"use client";

import { useMemo, useState } from "react";
import { CheckCircle2, ChevronDown, Hourglass, Phone, Wallet } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import type { OverviewData } from "./types";
import { ActionButton, Card, EmptyState, Pill, ar, egp, fmtDate, fmtTime, tone } from "./primitives";

type PendingStudent = NonNullable<OverviewData["pendingPayments"]>["students"][number];
type PendingTx = PendingStudent["transactions"][number];

export function PendingPaymentsPanel({
  data,
  onConfirmed,
}: {
  data: OverviewData["pendingPayments"] | undefined;
  onConfirmed: () => void;
}) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<{ student: PendingStudent; tx: PendingTx } | null>(null);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState(false);
  const { success: toastSuccess } = useToast();

  const students = data?.students ?? [];
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return students;
    return students.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        (s.phone || "").includes(q) ||
        s.transactions.some((t) => t.itemLabel.toLowerCase().includes(q))
    );
  }, [students, query]);

  const confirmPaid = async (txId: string) => {
    setBusyId(txId);
    setError("");
    try {
      const res = await fetch("/api/admin/superadmin/pending-payments", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transactionId: txId }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
      if (!res.ok) throw new Error(body.error || "تعذر تأكيد الدفعة");
      toastSuccess(body.message || "تم اعتبار الدفعة مكتملة");
      setConfirming(null);
      onConfirmed();
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذر تأكيد الدفعة");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Card>
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className="w-full p-4 flex flex-wrap items-start justify-between gap-3 text-right cursor-pointer"
        style={{ borderBottom: expanded ? "1px solid var(--border)" : "none" }}
      >
        <div className="flex items-start gap-2.5 min-w-0">
          <span
            className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
            style={{ background: "var(--brand-soft)", color: "var(--brand)" }}
          >
            <Hourglass size={16} />
          </span>
          <div className="min-w-0">
            <h2 className="font-black text-sm leading-tight" style={{ color: "var(--ink)", fontFamily: "var(--font-head)" }}>
              بدأوا الدفع ولم يكتمل
            </h2>
            {expanded ? (
              <p className="text-xs mt-0.5 leading-relaxed" style={{ color: "var(--ink-3)" }}>
                فواتير معلّقة لمن ليس لديهم حجز ساري ولا كورس مدفوع. من لديه حاجز أو كورس مدفوع لا يظهر هنا. «اعتباره مدفوعاً» يفعّل الاشتراك/الكورس بنفس مسار نجاح البوابة
              </p>
            ) : (
              <p className="text-xs mt-0.5" style={{ color: "var(--ink-3)" }}>
                اضغط للفتح · مجموع معلّق {egp(data?.amountPending)}
              </p>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Pill color={students.length ? "amber" : "green"}>
            {students.length ? `${ar(data?.studentCount)} طالب · ${ar(data?.transactionCount)} فاتورة` : "لا يوجد عالق"}
          </Pill>
          <ChevronDown
            size={16}
            className={`transition-transform ${expanded ? "rotate-180" : ""}`}
            style={{ color: "var(--ink-3)" }}
          />
        </div>
      </button>

      {expanded && (
        <>
          <div className="px-4 py-2.5 flex flex-wrap items-center gap-2" style={{ borderBottom: "1px solid var(--border)", background: "var(--surface-2)" }}>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="بحث بالاسم أو الهاتف"
              aria-label="بحث في العالقين بالدفع"
              className="adm-input is-sm flex-1 min-w-[180px]"
            />
            <span className="text-xs font-semibold tabular-nums" style={{ color: "var(--ink-3)" }}>
              مجموع الفواتير المعلّقة {egp(data?.amountPending)}
            </span>
          </div>

          {error && (
            <div className="mx-4 mt-3 adm-notice is-bad" role="alert">{error}</div>
          )}

          {filtered.length === 0 ? (
            <EmptyState icon={<Wallet size={28} />} text={students.length === 0 ? "لا يوجد طلاب عالقين في الدفع الآن" : "لا نتائج مطابقة"} />
          ) : (
            <div className="divide-y" style={{ borderColor: "var(--border)" }}>
              {filtered.map((student) => (
                <div key={student.studentId} className="px-4 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                    <div>
                      <div className="font-black text-sm" style={{ color: "var(--ink)" }}>{student.name}</div>
                      {student.phone && (
                        <div className="text-xs mt-0.5 inline-flex items-center gap-1" style={{ color: "var(--ink-3)" }}>
                          <Phone size={11} /> {student.phone}
                        </div>
                      )}
                    </div>
                    <Pill color="amber">{ar(student.transactions.length)} محاولة</Pill>
                  </div>
                  <div className="space-y-1.5">
                    {student.transactions.map((tx) => (
                      <div
                        key={tx.id}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-xl px-3 py-2"
                        style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}
                      >
                        <div className="min-w-0">
                          <div className="text-xs font-bold" style={{ color: "var(--ink)" }}>
                            {tx.itemLabel} · {egp(tx.amount)}
                          </div>
                          <div className="text-xs mt-0.5" style={{ color: "var(--ink-3)" }}>
                            {tx.provider === "sha7nawy" ? "محفظة (شحناوي)" : "Shake-Out / فوري"} · {fmtDate(tx.createdAt)} {fmtTime(tx.createdAt)}
                          </div>
                        </div>
                        {confirming?.tx.id === tx.id ? (
                          <div className="flex items-center gap-1.5">
                            <ActionButton
                              variant="primary"
                              disabled={busyId === tx.id}
                              onClick={() => void confirmPaid(tx.id)}
                              title="تفعيل كأنه دفع فعلاً"
                            >
                              <CheckCircle2 size={13} />
                              {busyId === tx.id ? "جارٍ التفعيل..." : "تأكيد التفعيل"}
                            </ActionButton>
                            <ActionButton variant="ghost" disabled={busyId === tx.id} onClick={() => setConfirming(null)}>
                              إلغاء
                            </ActionButton>
                          </div>
                        ) : (
                          <ActionButton
                            variant="gold"
                            disabled={busyId !== null}
                            onClick={() => {
                              setError("");
                              setConfirming({ student, tx });
                            }}
                            title="أخرج الطالب من حالة الانتظار واعتبره دفع"
                          >
                            اعتباره مدفوعاً
                          </ActionButton>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </Card>
  );
}
