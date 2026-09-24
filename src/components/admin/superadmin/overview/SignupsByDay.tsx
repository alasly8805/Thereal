"use client";

import { useMemo } from "react";
import { CalendarDays } from "lucide-react";
import { Card, ar, tone } from "./primitives";

const CAIRO_TZ = "Africa/Cairo";

function cairoKey(d = new Date()) {
  return d.toLocaleDateString("en-CA", { timeZone: CAIRO_TZ });
}

function shiftCairoDay(key: string, days: number) {
  const [y, m, d] = key.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days, 12));
  return cairoKey(dt);
}

function formatCairoDay(key: string) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString("ar-EG", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

function weekday(key: string) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString("ar-EG", {
    weekday: "short",
    timeZone: "UTC",
  });
}

export function SignupsByDay({ days }: { days: Array<{ date: string; count: number }> }) {
  const today = cairoKey();
  const yesterday = shiftCairoDay(today, -1);

  const byDate = useMemo(() => new Map(days.map((x) => [x.date, x.count])), [days]);
  const todayCount = byDate.get(today) ?? 0;
  const yesterdayCount = byDate.get(yesterday) ?? 0;

  const last14 = useMemo(() => {
    return Array.from({ length: 14 }, (_, i) => {
      const date = shiftCairoDay(today, i - 13);
      return { date, count: byDate.get(date) ?? 0 };
    });
  }, [byDate, today]);

  const weekCount = last14.slice(-7).reduce((s, x) => s + x.count, 0);
  const max14 = Math.max(1, ...last14.map((x) => x.count));

  const table = useMemo(() => {
    let runningFromOldest = 0;
    const oldestFirst = [...days].sort((a, b) => a.date.localeCompare(b.date));
    const withCum = oldestFirst.map((row) => {
      runningFromOldest += row.count;
      return { ...row, cumulative: runningFromOldest };
    });
    return withCum.reverse();
  }, [days]);

  return (
    <Card padded>
      <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
        <div className="flex items-start gap-2">
          <span className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: "var(--brand-soft)", color: "var(--brand)" }}>
            <CalendarDays size={16} />
          </span>
          <div>
            <h2 className="font-black text-sm" style={{ color: "var(--ink)", fontFamily: "var(--font-head)" }}>
              تسجيل الطلاب يوم بيوم
            </h2>
            <p className="text-[11px] mt-0.5 leading-relaxed" style={{ color: "var(--ink-3)" }}>
              نفس فلتر «الطلاب المسجلون»: حساب حقيقي، غير محذوف، وليس فحص QA. اليوم حسب توقيت القاهرة.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5 text-[11px] font-bold tabular-nums">
          <span className="px-2 py-1 rounded-lg" style={{ background: "var(--brand-soft)", color: "var(--brand)" }}>
            اليوم {ar(todayCount)}
          </span>
          <span className="px-2 py-1 rounded-lg" style={{ background: "var(--surface-2)", color: "var(--ink-2)" }}>
            أمس {ar(yesterdayCount)}
          </span>
          <span className="px-2 py-1 rounded-lg" style={{ background: "var(--surface-2)", color: "var(--ink-2)" }}>
            آخر ٧ أيام {ar(weekCount)}
          </span>
        </div>
      </div>

      <div className="flex items-end gap-1 h-24 mb-4 px-0.5">
        {last14.map((d) => {
          const h = Math.max(d.count > 0 ? 8 : 2, Math.round((d.count / max14) * 88));
          const isToday = d.date === today;
          return (
            <div key={d.date} className="flex-1 min-w-0 flex flex-col items-center gap-1" title={`${formatCairoDay(d.date)}: ${d.count}`}>
              <span className="text-[10px] font-black tabular-nums" style={{ color: d.count > 0 ? "var(--ink)" : "var(--ink-3)" }}>
                {ar(d.count)}
              </span>
              <div
                className="w-full rounded-t-md transition-all"
                style={{
                  height: h,
                  background: isToday ? "var(--brand)" : d.count > 0 ? "color-mix(in srgb, var(--brand) 55%, var(--surface-2))" : "var(--surface-2)",
                }}
              />
              <span className="text-[9px] truncate w-full text-center" style={{ color: isToday ? "var(--brand)" : "var(--ink-3)" }}>
                {weekday(d.date)}
              </span>
            </div>
          );
        })}
      </div>

      {table.length === 0 ? (
        <p className="text-xs text-center py-4" style={{ color: "var(--ink-3)" }}>لا توجد تسجيلات بعد.</p>
      ) : (
        <div className="overflow-x-auto max-h-80 overflow-y-auto rounded-xl" style={{ border: "1px solid var(--border)" }}>
          <table className="w-full text-xs">
            <thead className="sticky top-0" style={{ background: "var(--surface-2)" }}>
              <tr className="text-[10px]" style={{ color: "var(--ink-3)" }}>
                <th className="px-3 py-2 text-right font-medium">اليوم</th>
                <th className="px-3 py-2 text-center font-medium">سجّلوا</th>
                <th className="px-3 py-2 text-center font-medium">التراكمي</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {table.map((row) => {
                const isToday = row.date === today;
                return (
                  <tr key={row.date} className="hover:bg-[var(--surface-2)]/50" style={isToday ? { background: "color-mix(in srgb, var(--brand) 8%, transparent)" } : undefined}>
                    <td className="px-3 py-2">
                      <div className="font-bold" style={{ color: "var(--ink)" }}>{formatCairoDay(row.date)}</div>
                      {isToday && <div className="text-[10px]" style={{ color: "var(--brand)" }}>اليوم</div>}
                    </td>
                    <td className="px-3 py-2 text-center font-black tabular-nums" style={{ color: row.count > 0 ? tone.green : "var(--ink-3)" }}>
                      {ar(row.count)}
                    </td>
                    <td className="px-3 py-2 text-center tabular-nums" style={{ color: "var(--ink-2)" }}>
                      {ar(row.cumulative)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
