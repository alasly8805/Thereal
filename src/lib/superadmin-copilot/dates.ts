const CAIRO_TZ = "Africa/Cairo";

export function cairoDateKey(d: Date = new Date()): string {
  return d.toLocaleDateString("en-CA", { timeZone: CAIRO_TZ });
}

export function shiftCairoDay(key: string, days: number): string {
  const [y, m, d] = key.split("-").map(Number);
  return cairoDateKey(new Date(Date.UTC(y, m - 1, d + days, 12)));
}

/** Midnight Cairo for YYYY-MM-DD, as a UTC Date. Exclusive-end friendly. */
export function cairoDayStart(key: string): Date {
  const utc = new Date(`${key}T00:00:00.000Z`);
  const cairoWall = new Date(utc.toLocaleString("en-US", { timeZone: CAIRO_TZ }));
  const offset = utc.getTime() - cairoWall.getTime();
  return new Date(utc.getTime() + offset);
}

export function cairoRange(from?: string | null, to?: string | null): {
  fromKey: string;
  toKey: string;
  start: Date;
  endExclusive: Date;
} {
  const today = cairoDateKey();
  const fromKey = normalizeDayKey(from) || shiftCairoDay(today, -13);
  const toKey = normalizeDayKey(to) || today;
  const startKey = fromKey <= toKey ? fromKey : toKey;
  const endKey = fromKey <= toKey ? toKey : fromKey;
  return {
    fromKey: startKey,
    toKey: endKey,
    start: cairoDayStart(startKey),
    endExclusive: cairoDayStart(shiftCairoDay(endKey, 1)),
  };
}

export function eachCairoDay(fromKey: string, toKey: string): string[] {
  const days: string[] = [];
  let cursor = fromKey;
  let guard = 0;
  while (cursor <= toKey && guard < 400) {
    days.push(cursor);
    cursor = shiftCairoDay(cursor, 1);
    guard += 1;
  }
  return days;
}

export function formatCairoDayAr(key: string): string {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString("ar-EG", {
    weekday: "short",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

function normalizeDayKey(raw?: string | null): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  const iso = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (iso) {
    const y = Number(iso[1]);
    const m = String(Number(iso[2])).padStart(2, "0");
    const d = String(Number(iso[3])).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  const dmy = trimmed.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
  if (dmy) {
    const day = String(Number(dmy[1])).padStart(2, "0");
    const month = String(Number(dmy[2])).padStart(2, "0");
    let year = Number(dmy[3]);
    if (year < 100) year += 2000;
    return `${year}-${month}-${day}`;
  }
  return null;
}
