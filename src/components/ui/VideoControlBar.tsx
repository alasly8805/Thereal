"use client";

import React, { useEffect, useState } from "react";
import { VideoQualityMenu, type VideoQualityOption } from "./VideoQualityMenu";
import { VideoSpeedMenu, type PlaybackRate } from "./VideoSpeedMenu";

/**
 * Custom control bar for the HTML5 <video> players (Shaka/DRM and the native
 * alasly stream). Mirrors the YouTubeSecurePlayer bar so every provider has
 * the same controls in the same place: play, time, seek, mute, quality,
 * speed, fullscreen — nothing floating over the picture.
 *
 * The <video> must be rendered without the `controls` attribute; this bar
 * drives it directly through the ref.
 */

function fmt(s: number): string {
  if (!Number.isFinite(s) || s < 0) s = 0;
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  const h = Math.floor(m / 60);
  const mm = h > 0 ? String(m % 60).padStart(2, "0") : String(m);
  return `${h > 0 ? `${h}:` : ""}${mm}:${String(sec).padStart(2, "0")}`;
}

export interface VideoControlBarProps {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  playbackRate: PlaybackRate;
  onPlaybackRateChange: (rate: PlaybackRate) => void;
  qualities?: VideoQualityOption[];
  quality?: number | null;
  onQualityChange?: (height: number | null) => void;
  isFullscreen?: boolean;
  onToggleFullscreen?: () => void;
  className?: string;
}

export function VideoControlBar({
  videoRef,
  playbackRate,
  onPlaybackRateChange,
  qualities = [],
  quality = null,
  onQualityChange,
  isFullscreen = false,
  onToggleFullscreen,
  className = "",
}: VideoControlBarProps) {
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [cur, setCur] = useState(0);
  const [dur, setDur] = useState(0);

  // Mirror the element's state. Subscribed in an effect so the bar also picks
  // up changes made elsewhere (keyboard, Shaka seeking after a stream swap).
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const sync = () => {
      setPlaying(!v.paused && !v.ended);
      setMuted(v.muted || v.volume === 0);
      setCur(v.currentTime || 0);
      setDur(Number.isFinite(v.duration) ? v.duration : 0);
    };
    sync();
    const events = ["play", "pause", "ended", "timeupdate", "durationchange", "loadedmetadata", "volumechange", "seeking", "seeked"];
    events.forEach((e) => v.addEventListener(e, sync));
    return () => events.forEach((e) => v.removeEventListener(e, sync));
  }, [videoRef]);

  const togglePlay = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused || v.ended) void v.play().catch(() => {});
    else v.pause();
  };

  const toggleMute = () => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = !v.muted;
    if (!v.muted && v.volume === 0) v.volume = 1;
  };

  const seek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = videoRef.current;
    if (!v || !dur) return;
    const t = (Number(e.target.value) / 100) * dur;
    v.currentTime = t;
    setCur(t);
  };

  const pct = dur > 0 ? Math.min(100, (cur / dur) * 100) : 0;

  return (
    <div
      className={`absolute inset-x-0 bottom-0 z-20 px-3 py-2.5 bg-gradient-to-t from-black/80 via-black/40 to-transparent flex items-center gap-3 ${className}`}
      onClick={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        onClick={togglePlay}
        aria-label={playing ? "إيقاف مؤقت" : "تشغيل"}
        className="shrink-0 text-white hover:text-sky-300 transition-colors"
      >
        {playing ? (
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <path d="M6 5h4v14H6zM14 5h4v14h-4z" />
          </svg>
        ) : (
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <path d="M8 5v14l11-7z" />
          </svg>
        )}
      </button>

      <span className="shrink-0 text-[11px] font-mono text-white/85 tabular-nums" dir="ltr">
        {fmt(cur)}
      </span>

      <input
        type="range"
        min={0}
        max={100}
        step={0.1}
        value={pct}
        onChange={seek}
        aria-label="شريط التقدم"
        className="flex-1 h-1 accent-sky-400 cursor-pointer min-w-[40px]"
        dir="ltr"
      />

      <span className="shrink-0 text-[11px] font-mono text-white/85 tabular-nums" dir="ltr">
        {fmt(dur)}
      </span>

      <button
        type="button"
        onClick={toggleMute}
        aria-label={muted ? "تشغيل الصوت" : "كتم الصوت"}
        className="shrink-0 text-white hover:text-sky-300 transition-colors"
      >
        {muted ? (
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M11 5L6 9H2v6h4l5 4zM23 9l-6 6M17 9l6 6" />
          </svg>
        ) : (
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M11 5L6 9H2v6h4l5 4zM15.5 8.5a5 5 0 010 7M19 5a9 9 0 010 14" />
          </svg>
        )}
      </button>

      {onQualityChange && qualities.length >= 2 && (
        <VideoQualityMenu variant="inline" options={qualities} value={quality} onChange={onQualityChange} />
      )}

      <VideoSpeedMenu variant="inline" value={playbackRate} onChange={onPlaybackRateChange} />

      {onToggleFullscreen && (
        <button
          type="button"
          onClick={onToggleFullscreen}
          aria-label={isFullscreen ? "إنهاء ملء الشاشة" : "ملء الشاشة"}
          className="shrink-0 text-white hover:text-sky-300 transition-colors"
        >
          {isFullscreen ? (
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M8 3v3a2 2 0 01-2 2H3M21 8h-3a2 2 0 01-2-2V3M3 16h3a2 2 0 012 2v3M16 21v-3a2 2 0 012-2h3" />
            </svg>
          ) : (
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M8 3H5a2 2 0 00-2 2v3M21 8V5a2 2 0 00-2-2h-3M3 16v3a2 2 0 002 2h3M16 21h3a2 2 0 002-2v-3" />
            </svg>
          )}
        </button>
      )}
    </div>
  );
}

export default VideoControlBar;
