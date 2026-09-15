"use client";

import React, { useEffect, useRef, useState } from "react";

/**
 * Playback-speed picker shared by every player surface (Shaka/DRM, native
 * <video>, YouTube IFrame API). The chosen speed is remembered per browser so
 * a student who watches at 1.5x keeps that across lessons and providers.
 */

export const PLAYBACK_RATES = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2] as const;
export type PlaybackRate = (typeof PLAYBACK_RATES)[number];

export const SPEED_STORAGE_KEY = "codeup:video-speed";

export function isPlaybackRate(n: number): n is PlaybackRate {
  return (PLAYBACK_RATES as readonly number[]).includes(n);
}

/** Reads the remembered speed; falls back to 1x. */
export function readStoredPlaybackRate(): PlaybackRate {
  if (typeof window === "undefined") return 1;
  try {
    const raw = window.localStorage.getItem(SPEED_STORAGE_KEY);
    if (raw === null) return 1;
    const n = Number.parseFloat(raw);
    return isPlaybackRate(n) ? n : 1;
  } catch {
    return 1;
  }
}

export function storePlaybackRate(rate: PlaybackRate): void {
  try {
    window.localStorage.setItem(SPEED_STORAGE_KEY, String(rate));
  } catch {
    // private mode — the choice just won't survive the page
  }
}

export function formatRate(rate: number): string {
  return `${Number.isInteger(rate) ? rate : rate.toFixed(2).replace(/0$/, "")}x`;
}

/**
 * State + persistence for the current speed. The player surfaces only mount
 * on the client (after the watch session loads), so the stored value can be
 * read in the lazy initializer; on the server it falls back to 1x.
 */
export function usePlaybackRate(): [PlaybackRate, (rate: PlaybackRate) => void] {
  const [rate, setRateState] = useState<PlaybackRate>(() => readStoredPlaybackRate());
  const setRate = (next: PlaybackRate) => {
    setRateState(next);
    storePlaybackRate(next);
  };
  return [rate, setRate];
}

/**
 * Keeps an HTML5 <video> element at the chosen speed. Re-applied on
 * `loadedmetadata` / `playing` because Shaka and source swaps (quality
 * changes) reset `playbackRate` to 1 when a new stream is attached.
 */
export function useApplyPlaybackRate(
  videoRef: React.RefObject<HTMLVideoElement | null>,
  rate: PlaybackRate
): void {
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const apply = () => {
      if (video.playbackRate !== rate) video.playbackRate = rate;
    };
    apply();
    video.addEventListener("loadedmetadata", apply);
    video.addEventListener("playing", apply);
    return () => {
      video.removeEventListener("loadedmetadata", apply);
      video.removeEventListener("playing", apply);
    };
  }, [videoRef, rate]);
}

function SpeedIcon({ className = "w-3.5 h-3.5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 14l4-6" />
      <path d="M4.93 19a10 10 0 1114.14 0" />
      <circle cx="12" cy="14" r="1.5" />
    </svg>
  );
}

export function VideoSpeedMenu({
  value,
  onChange,
  variant = "overlay",
  className = "",
}: {
  value: PlaybackRate;
  onChange: (rate: PlaybackRate) => void;
  /**
   * overlay — self-positioned button floating over the video surface
   * (top-right, under the session badge, clear of the native control bar
   * and the quality menu on the left).
   * inline — bare button meant to sit inside a custom control bar.
   */
  variant?: "overlay" | "inline";
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDocPointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onDocPointerDown, true);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("pointerdown", onDocPointerDown, true);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [open]);

  const isOverlay = variant === "overlay";

  return (
    <div
      ref={rootRef}
      className={`${isOverlay ? "absolute top-14 right-2.5 z-30" : "relative shrink-0"} ${className}`}
      dir="rtl"
    >
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="سرعة التشغيل"
        title="سرعة التشغيل"
        className={
          isOverlay
            ? "flex items-center gap-1.5 px-2.5 h-10 rounded-lg bg-black/55 hover:bg-black/80 text-white text-[11px] font-bold backdrop-blur-sm transition-colors cursor-pointer border border-white/10"
            : "flex items-center gap-1 text-white hover:text-sky-300 transition-colors text-[11px] font-bold"
        }
      >
        <SpeedIcon className={isOverlay ? "w-3.5 h-3.5 shrink-0" : "w-5 h-5 shrink-0"} />
        <span className={`tabular-nums ${value !== 1 ? "text-sky-300" : ""}`} dir="ltr">
          {formatRate(value)}
        </span>
      </button>

      {open && (
        <div
          role="listbox"
          aria-label="سرعة التشغيل"
          className={`absolute ${isOverlay ? "top-full mt-1.5" : "bottom-full mb-1.5"} right-0 min-w-[150px] rounded-xl bg-slate-950/95 backdrop-blur-md border border-white/10 shadow-2xl overflow-hidden py-1 z-40`}
        >
          <div className="px-3 pt-1.5 pb-1 text-[10px] font-bold text-slate-400">سرعة التشغيل</div>
          {PLAYBACK_RATES.map((rate) => {
            const selected = rate === value;
            return (
              <button
                key={rate}
                type="button"
                role="option"
                aria-selected={selected}
                onClick={(e) => {
                  e.stopPropagation();
                  onChange(rate);
                  setOpen(false);
                }}
                className={`w-full text-right px-3 py-1.5 flex items-center gap-2 transition-colors cursor-pointer ${
                  selected ? "bg-sky-500/15" : "hover:bg-white/5"
                }`}
              >
                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${selected ? "bg-sky-400" : "bg-transparent"}`} />
                <span className="flex-1 text-[12px] font-bold text-white tabular-nums" dir="ltr">
                  {formatRate(rate)}
                </span>
                {rate === 1 && <span className="text-[10px] text-slate-400">عادي</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default VideoSpeedMenu;
