"use client";

function digitsOnly(phone: string): string {
  return phone.replace(/\D/g, "");
}

function isMasked(phone: string): boolean {
  return phone.includes("•") || phone.includes("*");
}

export function toWhatsAppNumber(phone: string): string | null {
  const d = digitsOnly(phone);
  if (d.length < 8) return null;
  if (d.startsWith("20")) return d;
  if (d.startsWith("0")) return `20${d.slice(1)}`;
  return d;
}

export function StudentPhoneActions({
  phone,
  compact = false,
}: {
  phone?: string | null;
  compact?: boolean;
}) {
  if (!phone) {
    return <span className="text-[11px] text-slate-400">لا يوجد رقم</span>;
  }

  if (isMasked(phone)) {
    return (
      <span className="text-xs font-mono tracking-wide text-slate-500 dark:text-slate-400" dir="ltr">
        {phone}
      </span>
    );
  }

  const tel = digitsOnly(phone);
  const wa = toWhatsAppNumber(phone);

  return (
    <div className={`flex items-center gap-2 ${compact ? "" : "flex-wrap"}`}>
      <a
        href={`tel:${tel}`}
        dir="ltr"
        className="inline-flex items-center justify-center min-h-11 px-3 rounded-xl bg-sky-500 text-white text-xs font-black shadow-sm active:scale-[0.98]"
      >
        اتصال {compact ? "" : phone}
      </a>
      {wa && (
        <a
          href={`https://wa.me/${wa}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center justify-center min-h-11 px-3 rounded-xl bg-emerald-500 text-white text-xs font-black shadow-sm active:scale-[0.98]"
        >
          واتساب
        </a>
      )}
      {compact && (
        <span className="text-[11px] font-mono text-slate-500" dir="ltr">
          {phone}
        </span>
      )}
    </div>
  );
}
