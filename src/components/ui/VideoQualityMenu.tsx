"use client";

import React, { useEffect, useRef, useState } from "react";

export interface VideoQualityOption {
  /** null = Auto — the original file, whatever height it happens to be. */
  height: number | null;
  label: string;
  note?: string;
  bytes?: number;
  /** False until the transcoded file exists; the option is still shown. */
  ready?: boolean;
}

/**
 * The Native (alasly / Drive) player always offers this ladder, even before
 * the /qualities probe returns. Matches RENDITION_LADDER on the server:
 * Auto + 360p / 480p / 720p.
 */
export const DEFAULT_QUALITY_OPTIONS: VideoQualityOption[] = [
  { height: null, label: "Auto", note: "تلقائي", ready: true },
  { height: 360, label: "360p", note: "أقل استهلاك للإنترنت" },
  { height: 480, label: "480p", note: "مناسب للإنترنت الضعيف" },
  { height: 720, label: "720p", note: "جودة متوسطة" },
];

export const QUALITY_STORAGE_KEY = "codeup:video-quality";

/** Reads the student's remembered choice. `undefined` = never chose one. */
export function readStoredQuality(): number | null | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    const raw = window.localStorage.getItem(QUALITY_STORAGE_KEY);
    if (raw === null) return undefined;
    if (raw === "auto" || raw === "null") return null;
    const n = Number.parseInt(raw, 10);
    return Number.isFinite(n) ? n : undefined;
  } catch {
    return undefined;
  }
}

export function storeQuality(height: number | null): void {
  try {
    window.localStorage.setItem(QUALITY_STORAGE_KEY, height === null ? "auto" : String(height));
  } catch {
    // private mode — the choice just won't survive the page
  }
}

/**
 * True when the browser reports a slow connection. Used to pick a light
 * default for a student who has never touched the quality menu, which is the
 * whole point of the feature: the ones who need it most are the least likely
 * to go looking for a settings button.
 */
export function connectionLooksSlow(): boolean {
  if (typeof navigator === "undefined") return false;
  const conn = (navigator as Navigator & {
    connection?: { effectiveType?: string; saveData?: boolean; downlink?: number };
  }).connection;
  if (!conn) return false;
  if (conn.saveData) return true;
  if (conn.effectiveType && ["slow-2g", "2g", "3g"].includes(conn.effectiveType)) return true;
  return typeof conn.downlink === "number" && conn.downlink > 0 && conn.downlink < 1.5;
}

/**
 * The tier to actually play for a wanted height: that tier when it is built,
 * otherwise the closest built one (smaller first), otherwise the wanted height or Auto.
 */
export function nearestReadyQuality(list: VideoQualityOption[], height: number | null): number | null {
  if (height === null) return null;
  const tiers = list.filter((o) => o.height !== null && o.ready !== false).map((o) => o.height as number);
  if (tiers.length === 0) return height;
  const smaller = tiers.filter((h) => h <= height).sort((a, b) => b - a);
  const larger = tiers.filter((h) => h > height).sort((a, b) => a - b);
  return smaller[0] ?? larger[0] ?? height;
}

function formatSize(bytes?: number): string | null {
  if (!bytes || bytes <= 0) return null;
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} جيجا`;
  return `${Math.round(bytes / 1e6)} ميجا`;
}

/**
 * Quality picker for the Native (alasly / Drive) player.
 *
 * Always offers Auto / 360p / 480p / 720p; tiers still being transcoded are
 * shown but disabled. Sits in the custom control bar
 * (inline) so it lines up with speed and fullscreen; the overlay variant is
 * kept for any surface that still uses native <video> chrome.
 */
export function VideoQualityMenu({
  options,
  value,
  onChange,
  variant = "overlay",
  className = "",
}: {
  options: VideoQualityOption[];
  value: number | null;
  onChange: (height: number | null) => void;
  /**
   * overlay — floating button at the top-left of the video surface.
   * inline — bare button meant to sit inside a custom control bar; the list
   * opens upward.
   */
  variant?: "overlay" | "inline";
  className?: string;
}) {
  const isOverlay = variant === "overlay";
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

  const list = options.length > 0 ? options : DEFAULT_QUALITY_OPTIONS;
  const current = list.find((o) => o.height === value) ?? list[0];

  return (
    <div
      ref={rootRef}
      className={`${isOverlay ? "absolute top-2.5 left-2.5 z-30" : "relative shrink-0"} ${className}`}
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
        aria-label="اختيار جودة الفيديو"
        title="جودة الفيديو"
        className={
          isOverlay
            ? "flex items-center gap-1.5 px-2.5 h-9 rounded-lg bg-black/60 hover:bg-black/85 text-white text-[11px] font-bold backdrop-blur-sm transition-colors cursor-pointer border border-white/10"
            : "flex items-center gap-1 text-white hover:text-sky-300 transition-colors text-[11px] font-bold cursor-pointer"
        }
      >
        <svg className={isOverlay ? "w-3.5 h-3.5 shrink-0" : "w-5 h-5 shrink-0"} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 11-4 0v-.09a1.65 1.65 0 00-1.08-1.51 1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 110-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 114 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 110 4h-.09a1.65 1.65 0 00-1.51 1z" />
        </svg>
        {isOverlay && <span>الجودة</span>}
        <span className="text-sky-300 tabular-nums" dir="ltr">{current.label}</span>
      </button>

      {open && (
        <div
          role="listbox"
          aria-label="جودة الفيديو"
          className={`absolute ${isOverlay ? "top-full mt-1.5" : "bottom-full mb-1.5"} right-0 min-w-[190px] rounded-xl bg-slate-950/95 backdrop-blur-md border border-white/10 shadow-2xl overflow-hidden py-1 z-40`}
        >
          <div className="px-3 pt-1.5 pb-1 text-[10px] font-bold text-slate-400">جودة الفيديو</div>
          {list.map((opt) => {
            const selected = opt.height === value;
            const size = formatSize(opt.bytes);
            const pending = opt.ready === false;
            const note = pending ? "قيد التجهيز" : opt.note;
            return (
              <button
                key={opt.height ?? "auto"}
                type="button"
                role="option"
                aria-selected={selected}
                onClick={(e) => {
                  e.stopPropagation();
                  onChange(opt.height);
                  setOpen(false);
                }}
                className={`w-full text-right px-3 py-2 flex items-center gap-2 transition-colors cursor-pointer ${
                  selected ? "bg-sky-500/15" : "hover:bg-white/5"
                }`}
              >
                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${selected ? "bg-sky-400" : "bg-transparent"}`} />
                <span className="flex-1 min-w-0">
                  <span className="block text-[12px] font-bold text-white leading-tight" dir="ltr">
                    {opt.label}
                  </span>
                  {(note || size) && (
                    <span className="block text-[10px] text-slate-400 leading-tight mt-0.5">
                      {[note, pending ? null : size].filter(Boolean).join(" · ")}
                    </span>
                  )}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default VideoQualityMenu;
