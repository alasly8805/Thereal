"use client";

import type { CSSProperties, ReactNode } from "react";

/* ─── Formatters ─────────────────────────────────────────────────────────── */

export const ar = (n: number | null | undefined) => (n ?? 0).toLocaleString("ar-EG");
export const egp = (n: number | null | undefined) =>
  `${(Math.round((n ?? 0) * 100) / 100).toLocaleString("ar-EG")} ج.م`;
export const pct = (n: number | null | undefined) => `${ar(Math.round(n ?? 0))}٪`;

export const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("ar-EG", { year: "numeric", month: "2-digit", day: "2-digit" });
export const fmtTime = (iso: string) =>
  new Date(iso).toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit", hour12: true });
export const fmtDateTime = (iso: string) =>
  new Date(iso).toLocaleString("ar-EG", {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });

export function toDatetimeLocalValue(iso?: string) {
  const d = iso ? new Date(iso) : new Date();
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Price after a percentage discount, or null if no discount applies. */
export const discounted = (price: number, discountPercent?: number | null) =>
  discountPercent && discountPercent > 0 ? Math.round(price * (1 - discountPercent / 100)) : null;

/* ─── Palette (semantic, works in both themes) ───────────────────────────── */

export const tone = {
  brand: "var(--brand)",
  gold: "var(--gold-2)",
  green: "#22c55e",
  sky: "#38bdf8",
  amber: "#f59e0b",
  orange: "#f97316",
  red: "#ef4444",
  violet: "#8b5cf6",
  slate: "var(--ink-3)",
} as const;

export type Tone = keyof typeof tone;

/* ─── Layout ─────────────────────────────────────────────────────────────── */

export function Card({
  children,
  className = "",
  padded = false,
}: {
  children: ReactNode;
  className?: string;
  padded?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl overflow-hidden ${padded ? "p-4" : ""} ${className}`}
      style={{ background: "var(--surface)", border: "1px solid var(--border)", boxShadow: "var(--shadow-sm)" }}
    >
      {children}
    </div>
  );
}

export function CardHeader({
  icon,
  title,
  subtitle,
  actions,
}: {
  icon?: ReactNode;
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="p-4 flex flex-wrap items-start justify-between gap-3" style={{ borderBottom: "1px solid var(--border)" }}>
      <div className="flex items-start gap-2.5 min-w-0">
        {icon && (
          <span
            className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
            style={{ background: "var(--brand-soft)", color: "var(--brand)" }}
          >
            {icon}
          </span>
        )}
        <div className="min-w-0">
          <h2 className="font-black text-sm leading-tight" style={{ color: "var(--ink)", fontFamily: "var(--font-head)" }}>
            {title}
          </h2>
          {subtitle && (
            <p className="text-[11px] mt-0.5 leading-relaxed" style={{ color: "var(--ink-3)" }}>
              {subtitle}
            </p>
          )}
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function EmptyState({ icon, text }: { icon: ReactNode; text: string }) {
  return (
    <div className="p-10 text-center text-xs flex flex-col items-center gap-2" style={{ color: "var(--ink-3)" }}>
      <span className="opacity-60">{icon}</span>
      <p>{text}</p>
    </div>
  );
}

export function SkeletonBlock({ h = 80 }: { h?: number }) {
  return <div className="rounded-xl animate-pulse" style={{ height: h, background: "var(--surface-2)" }} />;
}

/* ─── Small atoms ────────────────────────────────────────────────────────── */

export function Pill({
  children,
  color = "slate",
  title,
  className = "",
}: {
  children: ReactNode;
  color?: Tone;
  title?: string;
  className?: string;
}) {
  const c = tone[color];
  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold whitespace-nowrap ${className}`}
      style={{ background: `color-mix(in srgb, ${c} 14%, transparent)`, color: c, border: `1px solid color-mix(in srgb, ${c} 30%, transparent)` }}
    >
      {children}
    </span>
  );
}

export function Stat({
  label,
  value,
  sub,
  color = "brand",
  icon,
  compact = false,
  lore,
  delta,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  color?: Tone;
  icon?: ReactNode;
  compact?: boolean;
  lore?: string;
  delta?: number | null;
}) {
  return (
    <div
      className={`rounded-xl flex flex-col justify-between ${compact ? "p-3" : "p-3.5"}`}
      style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}
      title={lore}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold truncate" style={{ color: "var(--ink-2)" }}>{label}</span>
        <span className="flex items-center gap-1 shrink-0">
          {delta != null && delta !== 0 && <Delta n={delta} />}
          {icon && <span style={{ color: tone[color] }} className="opacity-90">{icon}</span>}
        </span>
      </div>
      <div
        className={`${compact ? "text-lg" : "text-xl"} font-black leading-none mt-2 tabular-nums`}
        style={{ color: tone[color], fontFamily: "var(--font-head)" }}
      >
        {value}
      </div>
      {sub && <div className="text-[10px] mt-1.5 font-medium leading-snug" style={{ color: "var(--ink-3)" }}>{sub}</div>}
      {lore && (
        <p className="text-[10px] mt-1.5 leading-relaxed" style={{ color: "var(--ink-3)" }}>
          {lore}
        </p>
      )}
    </div>
  );
}

export function Delta({ n, money = false }: { n: number; money?: boolean }) {
  if (!n) return null;
  const up = n > 0;
  const label = money
    ? `${up ? "+" : ""}${egp(n)}`
    : `${up ? "+" : ""}${ar(n)}`;
  return (
    <span
      className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-black tabular-nums"
      style={{
        background: up ? "color-mix(in srgb, #22c55e 16%, transparent)" : "color-mix(in srgb, #ef4444 16%, transparent)",
        color: up ? tone.green : tone.red,
      }}
      title={up ? "زاد منذ تلك اللحظة حتى الآن" : "نقص منذ تلك اللحظة حتى الآن"}
    >
      {label}
    </span>
  );
}

export function XpBar({
  value,
  max,
  color,
  label,
}: {
  value: number;
  max: number;
  color: string;
  label?: string;
}) {
  const pctFill = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  return (
    <div className="w-full">
      <div className="w-full h-2.5 rounded-full overflow-hidden" style={{ background: "color-mix(in srgb, var(--ink) 10%, transparent)" }}>
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${pctFill}%`, background: color, boxShadow: `0 0 12px ${color}` }}
        />
      </div>
      {label && (
        <div className="text-[10px] mt-1 font-semibold" style={{ color: "var(--ink-3)" }}>{label}</div>
      )}
    </div>
  );
}

/**
 * Horizontal proportional bar. Segments with 0 value are skipped; the legend
 * always renders so the reader learns the color coding even when a part is empty.
 */
export function StackedBar({
  segments,
  height = 8,
  legend = true,
}: {
  segments: Array<{ label: string; value: number; color: string }>;
  height?: number;
  legend?: boolean;
}) {
  const total = segments.reduce((s, x) => s + Math.max(0, x.value), 0);
  return (
    <div className="w-full">
      <div className="w-full rounded-full overflow-hidden flex" style={{ height, background: "var(--surface-2)" }}>
        {total > 0 &&
          segments
            .filter((s) => s.value > 0)
            .map((s) => (
              <div
                key={s.label}
                title={`${s.label}: ${ar(s.value)}`}
                style={{ width: `${(s.value / total) * 100}%`, background: s.color }}
                className="h-full transition-all"
              />
            ))}
      </div>
      {legend && (
        <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1.5">
          {segments.map((s) => (
            <span key={s.label} className="inline-flex items-center gap-1 text-[10px] font-semibold" style={{ color: "var(--ink-2)" }}>
              <span className="w-2 h-2 rounded-sm" style={{ background: s.color }} />
              {s.label} <span className="tabular-nums" style={{ color: "var(--ink)" }}>{ar(s.value)}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export function PaymentSourcePill({ source, registeredBy }: { source?: string; registeredBy?: string }) {
  switch (source) {
    case "PAYMENT_GATEWAY":
    case "PURCHASE":
      return <Pill color="green" title="دفع إلكتروني أو شراء مباشر">💳 {source === "PURCHASE" ? "شراء مباشر" : "بوابة دفع"}</Pill>;
    case "WALLET":
      return <Pill color="amber" title="خصم من رصيد المحفظة">👛 محفظة</Pill>;
    case "COVERED_BY_PACKAGE":
      return <Pill color="sky" title="المقعد مغطى باشتراك الباقة — لا يُضاف لإيراد الكورس">🎟️ مغطى بالباقة</Pill>;
    case "ACCESS_CODE":
      return <Pill color="gold" title="تفعيل بكود وصول">🔑 كود تفعيل</Pill>;
    case "ADMIN":
      return <Pill color="violet" title={`تسجيل من اللوحة بواسطة ${registeredBy || "مشرف"}`}>✍️ لوحة{registeredBy ? ` · ${registeredBy}` : ""}</Pill>;
    case "TESTER_BYPASS":
      return <Pill color="slate" title="حساب فحص / تجريبي">🧪 تجريبي</Pill>;
    default:
      return <Pill color="violet" title={`تسجيل يدوي بواسطة ${registeredBy || "المعلم"}`}>✍️ يدوي{registeredBy ? ` · ${registeredBy}` : ""}</Pill>;
  }
}

export function ActionButton({
  children,
  onClick,
  variant = "ghost",
  disabled,
  title,
  type = "button",
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: "primary" | "gold" | "ghost" | "danger";
  disabled?: boolean;
  title?: string;
  type?: "button" | "submit";
}) {
  const styles: Record<string, CSSProperties> = {
    primary: { background: "var(--brand)", color: "#fff", border: "1px solid transparent" },
    gold: { background: "var(--gold)", color: "#fff", border: "1px solid transparent" },
    ghost: { background: "var(--surface-2)", color: "var(--ink)", border: "1px solid var(--border)" },
    danger: { background: "var(--danger-soft)", color: "var(--danger)", border: "1px solid transparent" },
  };
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all hover:opacity-90 disabled:opacity-50 cursor-pointer whitespace-nowrap"
      style={styles[variant]}
    >
      {children}
    </button>
  );
}
