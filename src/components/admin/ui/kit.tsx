"use client";

/**
 * Admin UI kit — thin React wrappers over the `adm-*` classes in admin.css.
 * Every superadmin section composes these so buttons, fields, panels and
 * dialogs look and behave the same everywhere (including focus + disabled
 * states and both themes).
 */

import {
  forwardRef,
  useEffect,
  useId,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import { AlertTriangle, CheckCircle2, Info, Loader2, Search, X, XCircle } from "lucide-react";

const cx = (...parts: Array<string | false | null | undefined>) => parts.filter(Boolean).join(" ");

export type Tone = "neutral" | "brand" | "ok" | "warn" | "bad" | "info" | "gold";

/* ─── Formatters (Arabic-Egypt) ──────────────────────────────────────────── */

export const fmtNum = (n: number | null | undefined) => (n ?? 0).toLocaleString("ar-EG");
export const fmtMoney = (n: number | null | undefined) =>
  `${(Math.round((n ?? 0) * 100) / 100).toLocaleString("ar-EG")} ج.م`;
export const fmtDate = (v: string | number | Date | null | undefined) => {
  if (!v) return "—";
  const d = new Date(v);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleDateString("ar-EG", { year: "numeric", month: "short", day: "numeric" });
};
export const fmtDateTime = (v: string | number | Date | null | undefined) => {
  if (!v) return "—";
  const d = new Date(v);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleString("ar-EG", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
};

/** Egyptian mobile → wa.me link (handles 01…, 201…, +201…, spaces). */
export function waLink(phone: string) {
  const digits = phone.replace(/\D/g, "");
  const intl = digits.startsWith("20") ? digits : digits.startsWith("0") ? `2${digits}` : digits;
  return `https://wa.me/${intl}`;
}

/** Parse a fetch Response as JSON without throwing on empty / HTML bodies. */
export async function readJson<T>(res: Response): Promise<T | null> {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

/* ─── Page structure ─────────────────────────────────────────────────────── */

export function PageHeader({
  title,
  description,
  actions,
  meta,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  meta?: ReactNode;
}) {
  return (
    <header className="adm-page-head">
      <div className="min-w-0">
        <h1 className="adm-h1">{title}</h1>
        {description && <p className="adm-lede">{description}</p>}
        {meta && <div className="mt-2 flex flex-wrap items-center gap-2">{meta}</div>}
      </div>
      {actions && <div className="adm-actions">{actions}</div>}
    </header>
  );
}

export function Panel({
  title,
  description,
  actions,
  icon,
  children,
  footer,
  padded = true,
  tight = false,
  clip = true,
  bareHead = false,
  className,
  id,
}: {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  icon?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  padded?: boolean;
  tight?: boolean;
  clip?: boolean;
  bareHead?: boolean;
  className?: string;
  id?: string;
}) {
  return (
    <section id={id} className={cx("adm-panel", clip && "adm-panel-clip", className)}>
      {(title || actions) && (
        <div className={cx("adm-panel-head", bareHead && "is-bare")}>
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
              {title && <h2 className="adm-h2">{title}</h2>}
              {description && <p className="adm-sub">{description}</p>}
            </div>
          </div>
          {actions && <div className="adm-actions">{actions}</div>}
        </div>
      )}
      {children != null && (padded ? <div className={cx("adm-panel-body", tight && "is-tight")}>{children}</div> : children)}
      {footer && <div className="adm-panel-foot">{footer}</div>}
    </section>
  );
}

/* ─── Buttons ────────────────────────────────────────────────────────────── */

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "danger-solid" | "gold";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: "sm" | "md" | "lg";
  loading?: boolean;
  icon?: ReactNode;
  block?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "secondary", size = "md", loading = false, icon, block, className, children, disabled, type = "button", ...rest },
  ref
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cx(
        "adm-btn",
        variant !== "secondary" && `is-${variant}`,
        size !== "md" && `is-${size}`,
        block && "is-block",
        className
      )}
      {...rest}
    >
      {loading ? <Loader2 size={size === "sm" ? 14 : 16} className="adm-spin" aria-hidden /> : icon}
      {children}
    </button>
  );
});

export function IconButton({
  label,
  children,
  variant = "ghost",
  size = "md",
  className,
  ...rest
}: Omit<ButtonProps, "icon"> & { label: string }) {
  return (
    <Button
      variant={variant}
      size={size}
      aria-label={label}
      title={label}
      className={cx("is-icon", className)}
      {...rest}
    >
      {children}
    </Button>
  );
}

/* ─── Form controls ──────────────────────────────────────────────────────── */

export function Field({
  label,
  hint,
  error,
  children,
  htmlFor,
  className,
}: {
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  children: ReactNode;
  htmlFor?: string;
  className?: string;
}) {
  return (
    <div className={cx("adm-field", className)}>
      {label && (
        <label className="adm-label" htmlFor={htmlFor}>
          {label}
        </label>
      )}
      {children}
      {error ? <p className="adm-error-text">{error}</p> : hint ? <p className="adm-hint">{hint}</p> : null}
    </div>
  );
}

type InputSize = { inputSize?: "sm" | "md"; mono?: boolean };

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & InputSize>(function Input(
  { className, inputSize = "md", mono, ...rest },
  ref
) {
  return <input ref={ref} className={cx("adm-input", inputSize === "sm" && "is-sm", mono && "is-mono", className)} {...rest} />;
});

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement> & InputSize>(function Select(
  { className, inputSize = "md", children, ...rest },
  ref
) {
  return (
    <select ref={ref} className={cx("adm-input", inputSize === "sm" && "is-sm", className)} {...rest}>
      {children}
    </select>
  );
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement> & InputSize>(
  function Textarea({ className, mono, ...rest }, ref) {
    const { inputSize, ...props } = rest;
    return <textarea ref={ref} className={cx("adm-input", inputSize === "sm" && "is-sm", mono && "is-mono", className)} {...props} />;
  }
);

export function SearchInput({
  value,
  onChange,
  placeholder = "بحث",
  className,
  inputSize = "md",
  autoFocus,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
  inputSize?: "sm" | "md";
  autoFocus?: boolean;
  label?: string;
}) {
  return (
    <div className={cx("adm-search", className)}>
      <Search size={15} aria-hidden />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={label ?? placeholder}
        autoFocus={autoFocus}
        className={cx("adm-input", inputSize === "sm" && "is-sm")}
      />
    </div>
  );
}

export function Switch({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="adm-switch"
    />
  );
}

/* ─── Tabs / chips ───────────────────────────────────────────────────────── */

export function Tabs<T extends string>({
  items,
  value,
  onChange,
  label,
  className,
}: {
  items: Array<{ id: T; label: ReactNode; icon?: ReactNode; badge?: ReactNode }>;
  value: T;
  onChange: (id: T) => void;
  label: string;
  className?: string;
}) {
  return (
    <div role="tablist" aria-label={label} className={cx("adm-tabs", className)}>
      {items.map((t) => (
        <button
          key={t.id}
          type="button"
          role="tab"
          aria-selected={value === t.id}
          onClick={() => onChange(t.id)}
          className="adm-tab"
        >
          {t.icon}
          {t.label}
          {t.badge}
        </button>
      ))}
    </div>
  );
}

export function Chip({
  pressed,
  onClick,
  children,
  count,
}: {
  pressed: boolean;
  onClick: () => void;
  children: ReactNode;
  count?: number;
}) {
  return (
    <button type="button" aria-pressed={pressed} onClick={onClick} className="adm-chip">
      {children}
      {count != null && <span className="adm-count">{fmtNum(count)}</span>}
    </button>
  );
}

/* ─── Badges, notices, stats ─────────────────────────────────────────────── */

export function Badge({
  tone = "neutral",
  children,
  dot,
  live,
  title,
  className,
}: {
  tone?: Tone;
  children: ReactNode;
  dot?: boolean;
  live?: boolean;
  title?: string;
  className?: string;
}) {
  return (
    <span className={cx("adm-badge", `is-${tone}`, className)} title={title}>
      {(dot || live) && <span className={cx("adm-dot", live && "is-live")} aria-hidden />}
      {children}
    </span>
  );
}

const NOTICE_ICON: Record<Exclude<Tone, "brand" | "gold">, ReactNode> = {
  neutral: <Info size={18} />,
  info: <Info size={18} />,
  ok: <CheckCircle2 size={18} />,
  warn: <AlertTriangle size={18} />,
  bad: <XCircle size={18} />,
};

export function Notice({
  tone = "info",
  title,
  children,
  action,
  icon,
  className,
}: {
  tone?: "neutral" | "info" | "ok" | "warn" | "bad";
  title?: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cx("adm-notice", tone !== "info" && `is-${tone}`, className)} role={tone === "bad" ? "alert" : undefined}>
      {icon ?? NOTICE_ICON[tone]}
      <div className="flex-1 min-w-0">
        {title && <strong className="block font-bold">{title}</strong>}
        {children && <div className={title ? "mt-0.5" : undefined} style={{ color: "var(--ink-2)" }}>{children}</div>}
      </div>
      {action && <div className="shrink-0 self-center">{action}</div>}
    </div>
  );
}

const TONE_VAR: Record<Tone, string> = {
  neutral: "var(--ink)",
  brand: "var(--brand)",
  ok: "var(--ok)",
  warn: "var(--warn)",
  bad: "var(--danger)",
  info: "var(--info)",
  gold: "var(--gold)",
};

export function toneColor(t: Tone) {
  return TONE_VAR[t];
}

export function Stat({
  label,
  value,
  sub,
  tone = "neutral",
  icon,
  well,
  title,
}: {
  label: ReactNode;
  value: ReactNode;
  sub?: ReactNode;
  tone?: Tone;
  icon?: ReactNode;
  well?: boolean;
  title?: string;
}) {
  return (
    <div className={cx("adm-stat", well && "is-well")} title={title}>
      <div className="adm-stat-label">
        <span className="truncate">{label}</span>
        {icon && <span style={{ color: TONE_VAR[tone === "neutral" ? "brand" : tone] }} aria-hidden>{icon}</span>}
      </div>
      <div className="adm-stat-value" style={{ color: TONE_VAR[tone] }}>{value}</div>
      {sub && <div className="adm-stat-sub">{sub}</div>}
    </div>
  );
}

/* ─── Empty / loading ────────────────────────────────────────────────────── */

export function EmptyState({
  icon,
  title,
  text,
  action,
}: {
  icon?: ReactNode;
  title: ReactNode;
  text?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="adm-empty">
      {icon && <span className="adm-empty-icon" aria-hidden>{icon}</span>}
      <p className="adm-empty-title">{title}</p>
      {text && <p className="adm-empty-text">{text}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

export function Skeleton({ h = 16, w = "100%", className, r }: { h?: number; w?: number | string; className?: string; r?: number }) {
  return <div className={cx("adm-skel", className)} style={{ height: h, width: w, borderRadius: r }} aria-hidden />;
}

export function SkeletonRows({ rows = 5, h = 44 }: { rows?: number; h?: number }) {
  return (
    <div className="flex flex-col gap-2 p-4" aria-busy="true" aria-label="جارٍ التحميل">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} h={h} />
      ))}
    </div>
  );
}

/* ─── Pagination ─────────────────────────────────────────────────────────── */

export function Pagination({
  page,
  pageCount,
  total,
  onPage,
  disabled,
  unit = "عنصر",
}: {
  page: number; // zero based
  pageCount: number;
  total?: number;
  onPage: (p: number) => void;
  disabled?: boolean;
  unit?: string;
}) {
  if (pageCount <= 1) return null;
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 w-full">
      <span className="text-[13px]" style={{ color: "var(--ink-3)" }}>
        صفحة {fmtNum(page + 1)} من {fmtNum(pageCount)}
        {total != null && <> · {fmtNum(total)} {unit}</>}
      </span>
      <div className="flex gap-2">
        <Button size="sm" onClick={() => onPage(page - 1)} disabled={disabled || page <= 0}>
          السابق
        </Button>
        <Button size="sm" onClick={() => onPage(page + 1)} disabled={disabled || page >= pageCount - 1}>
          التالي
        </Button>
      </div>
    </div>
  );
}

/* ─── Modal ──────────────────────────────────────────────────────────────── */

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

let openModals = 0;

/**
 * Accessible dialog: Escape closes, Tab is trapped, body scroll is locked,
 * focus returns to the opener. Becomes a bottom sheet on phones.
 */
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = "md",
  dismissible = true,
  icon,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
  dismissible?: boolean;
  icon?: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descId = useId();
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement as HTMLElement | null;
    openModals += 1;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const node = ref.current;
    const first = node?.querySelector<HTMLElement>("[data-autofocus]") ?? node?.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? node)?.focus({ preventScroll: true });

    const onKey = (e: KeyboardEvent) => {
      if (!node) return;
      if (e.key === "Escape" && dismissible) {
        e.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (e.key !== "Tab") return;
      const items = Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.offsetParent !== null);
      if (items.length === 0) {
        e.preventDefault();
        return;
      }
      const firstEl = items[0];
      const lastEl = items[items.length - 1];
      if (e.shiftKey && document.activeElement === firstEl) {
        e.preventDefault();
        lastEl.focus();
      } else if (!e.shiftKey && document.activeElement === lastEl) {
        e.preventDefault();
        firstEl.focus();
      }
    };
    node?.addEventListener("keydown", onKey);
    return () => {
      node?.removeEventListener("keydown", onKey);
      openModals -= 1;
      if (openModals <= 0) document.body.style.overflow = prevOverflow;
      opener?.focus?.({ preventScroll: true });
    };
  }, [open, dismissible]);

  if (!open) return null;

  return (
    <>
      <div className="adm-overlay" onClick={dismissible ? onClose : undefined} aria-hidden />
      <div className="adm-modal-wrap" onClick={(e) => e.target === e.currentTarget && dismissible && onClose()}>
        <div
          ref={ref}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          aria-describedby={description ? descId : undefined}
          tabIndex={-1}
          className={cx("adm-modal", `is-${size}`)}
          dir="rtl"
        >
          <div className="adm-modal-head">
            <div className="flex items-start gap-3 min-w-0">
              {icon && <span className="mt-0.5 shrink-0" aria-hidden>{icon}</span>}
              <div className="min-w-0">
                <h2 id={titleId} className="adm-h2">{title}</h2>
                {description && <p id={descId} className="adm-sub">{description}</p>}
              </div>
            </div>
            {dismissible && (
              <IconButton label="إغلاق" size="sm" onClick={onClose}>
                <X size={16} />
              </IconButton>
            )}
          </div>
          {children != null && <div className="adm-modal-body">{children}</div>}
          {footer && <div className="adm-modal-foot">{footer}</div>}
        </div>
      </div>
    </>
  );
}

/* ─── Key/value list ─────────────────────────────────────────────────────── */

export function KeyValues({ items }: { items: Array<{ k: ReactNode; v: ReactNode }> }) {
  return (
    <dl className="adm-kv">
      {items.map((it, i) => (
        <div key={i} className="contents">
          <dt>{it.k}</dt>
          <dd>{it.v}</dd>
        </div>
      ))}
    </dl>
  );
}

/* ─── Imperative confirm / prompt (replaces window.confirm / window.prompt) ── */

type DialogRequest = {
  id: number;
  kind: "confirm" | "prompt";
  title: string;
  text?: string;
  confirmLabel?: string;
  danger?: boolean;
  inputLabel?: string;
  inputType?: "text" | "password";
  resolve: (v: boolean | string | null) => void;
};

let dialogSeq = 0;
const dialogListeners = new Set<(r: DialogRequest) => void>();

function requestDialog(r: Omit<DialogRequest, "id" | "resolve">): Promise<boolean | string | null> {
  return new Promise((resolve) => {
    if (dialogListeners.size === 0) {
      // No host mounted (outside the admin shell) — fall back to the browser dialog.
      if (r.kind === "prompt") resolve(window.prompt(r.text ?? r.title));
      else resolve(window.confirm(r.text ? `${r.title}\n\n${r.text}` : r.title));
      return;
    }
    const req: DialogRequest = { ...r, id: ++dialogSeq, resolve };
    dialogListeners.forEach((l) => l(req));
  });
}

/** `if (!(await admConfirm({ title, text, danger: true }))) return;` */
export function admConfirm(opts: { title: string; text?: string; confirmLabel?: string; danger?: boolean }) {
  return requestDialog({ kind: "confirm", ...opts }) as Promise<boolean>;
}

/** Resolves to the entered string, or null when cancelled. */
export function admPrompt(opts: { title: string; text?: string; inputLabel?: string; inputType?: "text" | "password"; confirmLabel?: string }) {
  return requestDialog({ kind: "prompt", ...opts }) as Promise<string | null>;
}

/** Mount once (the admin shell does) to render admConfirm / admPrompt requests. */
export function DialogHost() {
  const [queue, setQueue] = useState<DialogRequest[]>([]);
  const [value, setValue] = useState("");

  useEffect(() => {
    const onReq = (r: DialogRequest) => setQueue((q) => [...q, r]);
    dialogListeners.add(onReq);
    return () => {
      dialogListeners.delete(onReq);
    };
  }, []);

  const current = queue[0];
  const finish = (v: boolean | string | null) => {
    current?.resolve(v);
    setValue("");
    setQueue((q) => q.slice(1));
  };

  if (!current) return null;
  const isPrompt = current.kind === "prompt";
  return (
    <Modal
      open
      onClose={() => finish(isPrompt ? null : false)}
      size="sm"
      title={current.title}
      description={current.text}
      footer={
        <>
          <Button onClick={() => finish(isPrompt ? null : false)}>إلغاء</Button>
          <Button
            variant={current.danger ? "danger-solid" : "primary"}
            data-autofocus={!isPrompt || undefined}
            disabled={isPrompt && !value}
            onClick={() => finish(isPrompt ? value : true)}
          >
            {current.confirmLabel ?? (isPrompt ? "متابعة" : "تأكيد")}
          </Button>
        </>
      }
    >
      {isPrompt ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (value) finish(value);
          }}
        >
          <Field label={current.inputLabel} htmlFor={`adm-prompt-${current.id}`}>
            <Input
              id={`adm-prompt-${current.id}`}
              data-autofocus
              type={current.inputType ?? "text"}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              autoComplete="off"
            />
          </Field>
        </form>
      ) : null}
    </Modal>
  );
}
