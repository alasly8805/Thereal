"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Pieces shared by every lesson player (native/Shaka <video> and YouTube), so
 * a student gets the same controls in the same place whatever the provider.
 */

export const SKIP_SECONDS = 10;

/**
 * Controls fade while the lesson plays and nobody touches the player, so they
 * stop covering the bottom of the board. Any pointer move, touch or key brings
 * them back; they never hide while paused.
 */
export function useIdleControls(root: HTMLElement | null, playing: boolean, delayMs = 2800) {
  const [active, setActive] = useState(true);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const wake = useCallback(() => {
    setActive(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setActive(false), delayMs);
  }, [delayMs]);

  useEffect(() => {
    if (!root) return;
    const events = ["pointermove", "pointerdown", "touchstart", "keydown", "focusin"] as const;
    events.forEach((e) => root.addEventListener(e, wake, { passive: true }));
    return () => events.forEach((e) => root.removeEventListener(e, wake));
  }, [root, wake]);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  return !playing || active;
}

/** True when a key press belongs to a text field, not to the player. */
export function isTypingTarget(target: EventTarget | null) {
  const el = target as HTMLElement | null;
  if (!el) return false;
  return el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable;
}

export function SkipButton({ direction, onClick }: { direction: "back" | "forward"; onClick: () => void }) {
  const back = direction === "back";
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={back ? `رجوع ${SKIP_SECONDS} ثواني` : `تقديم ${SKIP_SECONDS} ثواني`}
      title={back ? `رجوع ${SKIP_SECONDS} ثواني (J)` : `تقديم ${SKIP_SECONDS} ثواني (L)`}
      className="vp-btn shrink-0 relative"
    >
      <svg className="w-[22px] h-[22px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        {back ? (
          <path d="M4 12a8 8 0 1 0 2.34-5.66M4 4v4h4" />
        ) : (
          <path d="M20 12a8 8 0 1 1-2.34-5.66M20 4v4h-4" />
        )}
      </svg>
      <span className="absolute inset-0 grid place-items-center text-[8px] font-black pt-[1px]" aria-hidden dir="ltr">
        {SKIP_SECONDS}
      </span>
    </button>
  );
}

/** Shown only while the stream is stalled, so a weak connection reads as "loading", not "broken". */
export function BufferingIndicator({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <div className="absolute inset-0 z-[15] grid place-items-center pointer-events-none" role="status" aria-live="polite">
      <div className="flex flex-col items-center gap-2">
        <span className="vp-spinner" aria-hidden />
        <span className="text-[11px] font-bold text-white/85 bg-black/50 rounded-full px-2.5 py-0.5">جارٍ التحميل…</span>
      </div>
    </div>
  );
}

/** Brief "+10 / −10" confirmation in the middle of the picture. */
export function SeekFlash({ text }: { text: string | null }) {
  if (!text) return null;
  return (
    <div className="absolute inset-0 z-[25] flex items-center justify-center pointer-events-none">
      <span className="px-4 py-2 rounded-2xl bg-black/75 text-white font-bold text-sm" dir="ltr">
        {text}
      </span>
    </div>
  );
}

/** Seek bar with played + loaded segments and a finger-sized hit area. */
export function SeekBar({
  playedPct,
  bufferedPct,
  onSeekPct,
}: {
  playedPct: number;
  bufferedPct: number;
  onSeekPct: (pct: number) => void;
}) {
  const p = Math.max(0, Math.min(100, playedPct));
  const b = Math.max(p, Math.min(100, bufferedPct));
  return (
    <input
      type="range"
      min={0}
      max={100}
      step={0.1}
      value={p}
      onChange={(e) => onSeekPct(Number(e.target.value))}
      aria-label="شريط التقدم"
      className="vp-range flex-1 min-w-[40px]"
      style={{ ["--p" as string]: `${p}%`, ["--b" as string]: `${b}%` }}
      dir="ltr"
    />
  );
}

/** Short-lived text flash; returns [text, show(text)]. */
export function useFlash(ms = 700): [string | null, (text: string) => void] {
  const [text, setText] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const show = useCallback(
    (next: string) => {
      setText(next);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setText(null), ms);
    },
    [ms]
  );
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);
  return [text, show];
}
