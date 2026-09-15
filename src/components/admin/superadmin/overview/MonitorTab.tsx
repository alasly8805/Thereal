"use client";

import { useMemo, useState, type ReactNode } from "react";
import { BookOpen, CreditCard, ShieldCheck, Ticket } from "lucide-react";
import type { AccessMonitorEvent } from "./types";
import { Card, CardHeader, EmptyState, Pill, ar, egp, fmtDate, fmtTime, tone } from "./primitives";

type Sev = "all" | "alerts";
type Kind = "all" | AccessMonitorEvent["kind"];

const KIND_META: Record<AccessMonitorEvent["kind"], { label: string; icon: ReactNode }> = {
  subscription: { label: "حجز باقة", icon: <Ticket size={14} /> },
  enrollment: { label: "تسجيل كورس", icon: <BookOpen size={14} /> },
  debit: { label: "حركة مالية", icon: <CreditCard size={14} /> },
};

const SEV_COLOR = { ok: tone.green, warn: tone.amber, alert: tone.red } as const;

export function MonitorTab({ events, alertCount }: { events: AccessMonitorEvent[]; alertCount: number }) {
  const [sev, setSev] = useState<Sev>("all");
  const [kind, setKind] = useState<Kind>("all");

  const counts = useMemo(() => {
    const c = { subscription: 0, enrollment: 0, debit: 0 };
    for (const e of events) c[e.kind] += 1;
    return c;
  }, [events]);

  const list = useMemo(
    () => events.filter((e) => (sev === "all" || e.severity !== "ok") && (kind === "all" || e.kind === kind)),
    [events, sev, kind]
  );

  return (
    <Card>
      <CardHeader
        icon={<ShieldCheck size={16} />}
        title="مراقبة الوصول والمدفوعات"
        subtitle="آخر الحجوزات والتسجيلات والحركات المالية. أي وصول لمحتوى مدفوع بدون دفع ولا سجل لوحة موثّق يُعلَّم تلقائياً"
        actions={
          alertCount > 0 ? (
            <Pill color="red" className="px-3 py-1.5 text-xs">⚠️ {ar(alertCount)} عنصر يحتاج مراجعة</Pill>
          ) : (
            <Pill color="green" className="px-3 py-1.5 text-xs">✓ لا توجد حالات شاذة</Pill>
          )
        }
      />

      <div className="px-4 py-2.5 flex flex-wrap items-center gap-2" style={{ borderBottom: "1px solid var(--border)", background: "var(--surface-2)" }}>
        <div className="inline-flex rounded-lg overflow-hidden" style={{ border: "1px solid var(--border)" }}>
          {([
            ["all", "الكل"],
            ["alerts", `تحتاج مراجعة (${ar(alertCount)})`],
          ] as const).map(([k, l]) => (
            <button
              key={k}
              onClick={() => setSev(k)}
              className="px-2.5 py-1.5 text-[11px] font-bold cursor-pointer"
              style={{ background: sev === k ? "var(--brand)" : "var(--surface)", color: sev === k ? "#fff" : "var(--ink-2)" }}
            >
              {l}
            </button>
          ))}
        </div>
        <div className="inline-flex rounded-lg overflow-hidden" style={{ border: "1px solid var(--border)" }}>
          {([
            ["all", "كل الأنواع"],
            ["subscription", `حجوزات (${ar(counts.subscription)})`],
            ["enrollment", `تسجيلات (${ar(counts.enrollment)})`],
            ["debit", `مالية (${ar(counts.debit)})`],
          ] as const).map(([k, l]) => (
            <button
              key={k}
              onClick={() => setKind(k)}
              className="px-2.5 py-1.5 text-[11px] font-bold cursor-pointer"
              style={{ background: kind === k ? "var(--brand)" : "var(--surface)", color: kind === k ? "#fff" : "var(--ink-2)" }}
            >
              {l}
            </button>
          ))}
        </div>
        <span className="text-[10px] mr-auto" style={{ color: "var(--ink-3)" }}>
          🟢 موثّق · 🟡 يحتاج نظرة · 🔴 شاذ
        </span>
      </div>

      {list.length === 0 ? (
        <EmptyState icon={<ShieldCheck size={28} />} text="لا توجد أحداث مطابقة" />
      ) : (
        <div className="max-h-[32rem] overflow-y-auto divide-y divide-[var(--border)]">
          {list.map((ev) => {
            const color = SEV_COLOR[ev.severity];
            return (
              <div key={`${ev.kind}-${ev.id}`} className="px-4 py-2.5 flex items-center gap-3 hover:bg-[var(--surface-2)]/40 transition-colors" style={{ borderRight: `3px solid ${color}` }}>
                <span className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ background: `color-mix(in srgb, ${color} 14%, transparent)`, color }} title={KIND_META[ev.kind].label}>
                  {KIND_META[ev.kind].icon}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-xs" style={{ color: "var(--ink)" }}>{ev.studentName}</span>
                    <span className="text-[11px] truncate" style={{ color: "var(--ink-2)" }}>{ev.target}</span>
                  </div>
                  <div className="text-[10px] mt-0.5" style={{ color: ev.severity === "ok" ? "var(--ink-3)" : color }}>{ev.reason}</div>
                </div>
                <Pill color="slate" title="مصدر الوصول">{ev.source}</Pill>
                <span className="shrink-0 text-xs font-black tabular-nums w-20 text-left" style={{ color: ev.amount > 0 ? tone.green : "var(--ink-3)" }}>
                  {egp(Math.abs(ev.amount))}
                </span>
                <span className="shrink-0 text-[10px] tabular-nums text-left w-24" style={{ color: "var(--ink-3)" }}>
                  {fmtDate(ev.createdAt)}<br />{fmtTime(ev.createdAt)}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
