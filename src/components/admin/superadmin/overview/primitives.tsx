"use client";

import type { ReactNode } from "react";
import { CreditCard, FlaskConical, KeyRound, PenLine, Ticket, Wallet } from "lucide-react";

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

/* ─── Palette (semantic tokens from admin.css — adapt to both themes) ───── */

export const tone = {
  brand: "var(--brand)",
  gold: "var(--gold)",
  green: "var(--ok)",
  sky: "var(--info)",
  amber: "var(--warn)",
  orange: "var(--orange)",
  red: "var(--danger)",
  violet: "var(--violet)",
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
  return <div className={`adm-panel adm-panel-clip ${padded ? "adm-panel-body" : ""} ${className}`}>{children}</div>;
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
    <div className="adm-panel-head">
      <div className="flex items-start gap-3 min-w-0">
        {icon && (
          <span
            className="w-8 h-8 rounded-[10px] grid place-items-center shrink-0"
            style={{ background: "var(--brand-soft)", color: "var(--brand)" }}
            aria-hidden
          >
            {icon}
          </span>
        )}
        <div className="min-w-0">
          <h2 className="adm-h2">{title}</h2>
          {subtitle && <p className="adm-sub">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="adm-actions">{actions}</div>}
    </div>
  );
}

export function EmptyState({ icon, text }: { icon: ReactNode; text: string }) {
  return (
    <div className="adm-empty">
      <span className="adm-empty-icon" aria-hidden>{icon}</span>
      <p className="adm-empty-text">{text}</p>
    </div>
  );
}

export function SkeletonBlock({ h = 80 }: { h?: number }) {
  return <div className="adm-skel" style={{ height: h, borderRadius: 16 }} aria-hidden />;
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
  return (
    <span title={title} className={`adm-badge ${className}`} style={{ ["--t" as string]: tone[color] }}>
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
    <div className={`adm-stat ${compact ? "is-well" : ""}`} title={lore}>
      <div className="adm-stat-label">
        <span className="truncate">{label}</span>
        <span className="flex items-center gap-1.5 shrink-0">
          {delta != null && delta !== 0 && <Delta n={delta} />}
          {icon && <span style={{ color: tone[color] }} aria-hidden>{icon}</span>}
        </span>
      </div>
      <div className="adm-stat-value" style={{ color: color === "brand" ? "var(--ink)" : tone[color], fontSize: compact ? 19 : undefined }}>
        {value}
      </div>
      {sub && <div className="adm-stat-sub">{sub}</div>}
      {lore && (
        <p className="adm-stat-sub" style={{ borderTop: "1px dashed var(--border)", paddingTop: 6 }}>
          {lore}
        </p>
      )}
    </div>
  );
}

export function Delta({ n, money = false }: { n: number; money?: boolean }) {
  if (!n) return null;
  const up = n > 0;
  const label = money ? `${up ? "+" : ""}${egp(n)}` : `${up ? "+" : ""}${ar(n)}`;
  return (
    <span
      className={`adm-badge ${up ? "is-ok" : "is-bad"} adm-num`}
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
      <div className="adm-bar" style={{ height: 6 }}>
        <span style={{ width: `${pctFill}%`, background: color }} />
      </div>
      {label && <div className="adm-stat-sub">{label}</div>}
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
      <div className="adm-bar" style={{ height }} role="img" aria-label={segments.map((s) => `${s.label} ${ar(s.value)}`).join("، ")}>
        {total > 0 &&
          segments
            .filter((s) => s.value > 0)
            .map((s) => (
              <span key={s.label} title={`${s.label}: ${ar(s.value)}`} style={{ width: `${(s.value / total) * 100}%`, background: s.color }} />
            ))}
      </div>
      {legend && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2">
          {segments.map((s) => (
            <span key={s.label} className="inline-flex items-center gap-1.5 text-xs font-semibold" style={{ color: "var(--ink-2)" }}>
              <span className="w-2.5 h-2.5 rounded-sm" style={{ background: s.color }} aria-hidden />
              {s.label} <span className="adm-num" style={{ color: "var(--ink)" }}>{ar(s.value)}</span>
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
      return (
        <Pill color="green" title="دفع إلكتروني أو شراء مباشر">
          <CreditCard size={12} aria-hidden /> {source === "PURCHASE" ? "شراء مباشر" : "بوابة دفع"}
        </Pill>
      );
    case "WALLET":
      return (
        <Pill color="amber" title="خصم من رصيد المحفظة">
          <Wallet size={12} aria-hidden /> محفظة
        </Pill>
      );
    case "COVERED_BY_PACKAGE":
      return (
        <Pill color="sky" title="المقعد مغطى باشتراك الباقة — لا يُضاف لإيراد الكورس">
          <Ticket size={12} aria-hidden /> مغطى بالباقة
        </Pill>
      );
    case "ACCESS_CODE":
      return (
        <Pill color="gold" title="تفعيل بكود وصول">
          <KeyRound size={12} aria-hidden /> كود تفعيل
        </Pill>
      );
    case "ADMIN":
      return (
        <Pill color="violet" title={`تسجيل من اللوحة بواسطة ${registeredBy || "مشرف"}`}>
          <PenLine size={12} aria-hidden /> لوحة{registeredBy ? ` · ${registeredBy}` : ""}
        </Pill>
      );
    case "TESTER_BYPASS":
      return (
        <Pill color="slate" title="حساب فحص / تجريبي">
          <FlaskConical size={12} aria-hidden /> تجريبي
        </Pill>
      );
    default:
      return (
        <Pill color="violet" title={`تسجيل يدوي بواسطة ${registeredBy || "المعلم"}`}>
          <PenLine size={12} aria-hidden /> يدوي{registeredBy ? ` · ${registeredBy}` : ""}
        </Pill>
      );
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
  // "ghost" here historically meant a bordered neutral button.
  const cls = variant === "ghost" ? "" : `is-${variant}`;
  return (
    <button type={type} onClick={onClick} disabled={disabled} title={title} className={`adm-btn is-sm ${cls}`}>
      {children}
    </button>
  );
}
