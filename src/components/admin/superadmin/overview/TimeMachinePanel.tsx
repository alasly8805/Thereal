"use client";

import { useEffect, useMemo, useState } from "react";
import { Clock, History, Pin, RotateCcw, Timer, Waypoints } from "lucide-react";
import type { OverviewKpis, OverviewSnapshot } from "./types";
import { ActionButton, Card, SkeletonBlock, ar, fmtDateTime, toDatetimeLocalValue, tone } from "./primitives";

const SNAP_CLOSE_MS = 10 * 60 * 1000;

export type TimeView =
  | { mode: "live" }
  | { mode: "snapshot"; snapshot: OverviewSnapshot }
  | { mode: "reconstructed"; at: string; kpis: OverviewKpis; caveats: string[] };

export function TimeMachinePanel({
  liveKpis,
  view,
  onChange,
}: {
  liveKpis: OverviewKpis | null;
  view: TimeView;
  onChange: (view: TimeView) => void;
}) {
  const [snapshots, setSnapshots] = useState<OverviewSnapshot[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [picking, setPicking] = useState(toDatetimeLocalValue());
  const [travelBusy, setTravelBusy] = useState(false);
  const [pinBusy, setPinBusy] = useState(false);
  const [error, setError] = useState("");

  const loadList = async (signal?: AbortSignal) => {
    try {
      const res = await fetch(`/api/admin/superadmin/overview/snapshots?_t=${Date.now()}`, {
        credentials: "include",
        signal,
      });
      const data = (await res.json()) as { snapshots?: OverviewSnapshot[] };
      setSnapshots(data.snapshots ?? []);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
    } finally {
      if (!signal?.aborted) setLoadingList(false);
    }
  };

  useEffect(() => {
    const ctrl = new AbortController();
    const timer = window.setTimeout(() => {
      void loadList(ctrl.signal);
    }, liveKpis ? 700 : 0);
    return () => {
      window.clearTimeout(timer);
      ctrl.abort();
    };
    // Load after the live board snapshot is persisted so this visit appears in the strip.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveKpis?.capturedAt]);

  const closestSnap = useMemo(() => {
    const t = new Date(picking).getTime();
    if (!Number.isFinite(t) || snapshots.length === 0) return null;
    let best: OverviewSnapshot | null = null;
    let bestDist = Infinity;
    for (const s of snapshots) {
      const d = Math.abs(new Date(s.capturedAt).getTime() - t);
      if (d < bestDist) {
        best = s;
        bestDist = d;
      }
    }
    return best && bestDist <= SNAP_CLOSE_MS ? best : null;
  }, [picking, snapshots]);

  const travel = async () => {
    setError("");
    const at = new Date(picking);
    if (Number.isNaN(at.getTime())) {
      setError("اختر تاريخاً ووقتاً صحيحين");
      return;
    }
    if (closestSnap) {
      onChange({ mode: "snapshot", snapshot: closestSnap });
      return;
    }
    setTravelBusy(true);
    try {
      const res = await fetch(
        `/api/admin/superadmin/overview/timemachine?at=${encodeURIComponent(at.toISOString())}`,
        { credentials: "include" }
      );
      const data = (await res.json()) as { kpis?: OverviewKpis; caveats?: string[]; error?: string; at?: string };
      if (!res.ok || !data.kpis) throw new Error(data.error || "تعذر السفر لهذا الوقت");
      onChange({
        mode: "reconstructed",
        at: data.at || at.toISOString(),
        kpis: data.kpis,
        caveats: data.caveats ?? [],
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذر السفر لهذا الوقت");
    } finally {
      setTravelBusy(false);
    }
  };

  const pinNow = async () => {
    if (!liveKpis) return;
    setPinBusy(true);
    setError("");
    try {
      const res = await fetch("/api/admin/superadmin/overview/snapshots", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source: "pin", kpis: liveKpis }),
      });
      const data = (await res.json()) as { snapshot?: OverviewSnapshot; error?: string };
      if (!res.ok || !data.snapshot) throw new Error(data.error || "تعذر تثبيت هذه اللحظة");
      setSnapshots((prev) => [data.snapshot!, ...prev.filter((s) => s.id !== data.snapshot!.id)]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذر تثبيت هذه اللحظة");
    } finally {
      setPinBusy(false);
    }
  };

  return (
    <Card padded>
      <div className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-2.5">
            <span
              className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
              style={{ background: "var(--gold-soft)", color: "var(--gold)", border: "1px solid color-mix(in srgb, var(--gold) 35%, transparent)" }}
            >
              <Timer size={18} />
            </span>
            <div>
              <h2 className="font-black text-sm" style={{ color: "var(--ink)", fontFamily: "var(--font-head)" }}>
                آلة الزمن
              </h2>
              <p className="text-xs mt-0.5 leading-relaxed max-w-2xl" style={{ color: "var(--ink-3)" }}>
                كل مرة تفتح هذه الصفحة تُحفظ قراءة حقيقية للأرقام. اختر لحظة من الشريط، أو حدد تاريخاً — إن وُجدت قراءة محفوظة خلال ١٠ دقائق نعرضها كما كانت، وإلا نُعيد بناء الأرقام من السجلات.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {view.mode !== "live" && (
              <ActionButton variant="primary" onClick={() => onChange({ mode: "live" })}>
                <RotateCcw size={13} /> العودة للآن
              </ActionButton>
            )}
            <ActionButton variant="gold" onClick={() => void pinNow()} disabled={pinBusy || !liveKpis} title="احفظ أرقام هذه اللحظة يدوياً">
              <Pin size={13} /> {pinBusy ? "جارٍ التثبيت..." : "ثبّت هذه اللحظة"}
            </ActionButton>
          </div>
        </div>

        <div className="flex flex-wrap items-end gap-2">
          <label className="text-xs font-bold" style={{ color: "var(--ink-2)" }}>
            سافر إلى
            <input
              type="datetime-local"
              value={picking}
              max={toDatetimeLocalValue()}
              onChange={(e) => setPicking(e.target.value)}
              className="adm-input is-sm block mt-1"
            />
          </label>
          <ActionButton variant="primary" onClick={() => void travel()} disabled={travelBusy}>
            <History size={13} />
            {travelBusy ? "جارٍ السفر..." : closestSnap ? "افتح القراءة المحفوظة" : "أظهر أرقام ذلك الوقت"}
          </ActionButton>
          {closestSnap && (
            <span className="text-xs font-semibold" style={{ color: tone.gold }}>
              توجد قراءة محفوظة عند فتح اللوحة: {fmtDateTime(closestSnap.capturedAt)}
            </span>
          )}
        </div>

        {error && (
          <div className="adm-notice is-bad" role="alert">{error}</div>
        )}

        <div>
          <div className="flex items-center gap-1.5 mb-1.5 text-xs font-black" style={{ color: "var(--ink-2)" }}>
            <Clock size={12} /> لحظات فُتحت فيها هذه الصفحة
          </div>
          {loadingList ? (
            <SkeletonBlock h={44} />
          ) : snapshots.length === 0 ? (
            <p className="text-xs" style={{ color: "var(--ink-3)" }}>
              لم تُحفظ قراءات بعد. هذه الزيارة ستُحفظ تلقائياً — حدّث الصفحة بعد ثوانٍ لتظهر هنا.
            </p>
          ) : (
            <div className="flex gap-1.5 overflow-x-auto pb-1" style={{ scrollbarWidth: "thin" }}>
              {snapshots.map((s) => {
                const active = view.mode === "snapshot" && view.snapshot.id === s.id;
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => onChange({ mode: "snapshot", snapshot: s })}
                    className="shrink-0 rounded-xl px-3 py-2 text-right cursor-pointer"
                    style={{
                      background: active ? "var(--gold-soft)" : "var(--surface)",
                      border: `1px solid ${active ? "color-mix(in srgb, var(--gold) 50%, transparent)" : "var(--border)"}`,
                      color: "var(--ink)",
                    }}
                    title={`حجوزات نشطة ${ar(s.kpis.bookingsActiveNow)} · صافي ${ar(Math.round(s.kpis.net))}`}
                  >
                    <div className="text-xs font-black leading-tight" style={{ fontFamily: "var(--font-head)" }}>
                      {fmtDateTime(s.capturedAt)}
                    </div>
                    <div className="text-xs mt-0.5 flex items-center gap-1" style={{ color: "var(--ink-3)" }}>
                      {s.source === "pin" ? "مثبّت يدوياً" : "فُتحت اللوحة"}
                      <span className="tabular-nums" style={{ color: tone.green }}>
                        {ar(s.kpis.bookingsActiveNow)} حجز
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {view.mode === "snapshot" && (
          <TravelBanner
            tone="gold"
            title={`أنت تشاهد أرقام اللوحة كما فُتحت في ${fmtDateTime(view.snapshot.capturedAt)}`}
            body="هذه قراءة حقيقية محفوظة — نفس الأرقام التي ظهرت على الشاشة في تلك اللحظة، وليست تقديراً."
          />
        )}
        {view.mode === "reconstructed" && (
          <TravelBanner
            tone="sky"
            title={`أرقام مُعادة البناء حتى ${fmtDateTime(view.at)}`}
            body={view.caveats.join(" ")}
            icon={<Waypoints size={14} />}
          />
        )}
      </div>
    </Card>
  );
}

function TravelBanner({
  title,
  body,
  tone: kind,
  icon,
}: {
  title: string;
  body: string;
  tone: "gold" | "sky";
  icon?: React.ReactNode;
}) {
  const color = kind === "gold" ? "var(--gold)" : tone.sky;
  return (
    <div
      className="rounded-xl px-3 py-2.5 text-xs leading-relaxed"
      style={{
        background: `color-mix(in srgb, ${color} 12%, var(--surface-2))`,
        border: `1px solid color-mix(in srgb, ${color} 35%, transparent)`,
        color: "var(--ink-2)",
      }}
    >
      <div className="font-black mb-0.5 inline-flex items-center gap-1.5" style={{ color }}>
        {icon}
        {title}
      </div>
      <p>{body}</p>
    </div>
  );
}

