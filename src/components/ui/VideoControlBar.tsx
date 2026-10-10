"use client";

import React, { useEffect, useState } from "react";
import { VideoQualityMenu, type VideoQualityOption } from "./VideoQualityMenu";
import { VideoSpeedMenu, type PlaybackRate } from "./VideoSpeedMenu";
import {
  BufferingIndicator,
  SeekBar,
  SeekFlash,
  SKIP_SECONDS,
  SkipButton,
  isTypingTarget,
  useFlash,
  useIdleControls,
} from "./player-shared";

/**
 * Custom control bar for the HTML5 <video> players (Shaka/DRM and the native
 * alasly stream). Mirrors the YouTubeSecurePlayer bar so every provider has
 * the same controls in the same place: play, ±10s, time, seek, mute, quality,
 * speed, fullscreen.
 *
 * The <video> must be rendered without the `controls` attribute; this bar
 * drives it directly through the ref. It also owns the buffering indicator,
 * the keyboard shortcuts and hiding itself while the lesson plays.
 */

function fmt(s: number): string {
  if (!Number.isFinite(s) || s < 0) s = 0;
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  const h = Math.floor(m / 60);
  const mm = h > 0 ? String(m % 60).padStart(2, "0") : String(m);
  return `${h > 0 ? `${h}:` : ""}${mm}:${String(sec).padStart(2, "0")}`;
}

/** End of the buffered range that contains the playhead. */
function bufferedEnd(v: HTMLVideoElement): number {
  const t = v.currentTime;
  for (let i = 0; i < v.buffered.length; i += 1) {
    if (v.buffered.start(i) <= t + 0.5 && v.buffered.end(i) >= t) return v.buffered.end(i);
  }
  return t;
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
  hideControls?: boolean;
  maxAllowedSecond?: number | null;
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
  hideControls = false,
  maxAllowedSecond = null,
}: VideoControlBarProps) {
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [cur, setCur] = useState(0);
  const [dur, setDur] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [stalled, setStalled] = useState(false);
  const [root, setRoot] = useState<HTMLElement | null>(null);
  const [flash, showFlash] = useFlash();

  // Mirror the element's state. Subscribed in an effect so the bar also picks
  // up changes made elsewhere (keyboard, Shaka seeking after a stream swap).
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    setRoot(v.parentElement);
    const sync = () => {
      setPlaying(!v.paused && !v.ended);
      setMuted(v.muted || v.volume === 0);
      setCur(v.currentTime || 0);
      setDur(Number.isFinite(v.duration) ? v.duration : 0);
      setBuffered(bufferedEnd(v));
    };
    const waiting = () => setStalled(true);
    const flowing = () => setStalled(false);
    sync();
    const events = ["play", "pause", "ended", "timeupdate", "durationchange", "loadedmetadata", "volumechange", "seeking", "seeked", "progress"];
    events.forEach((e) => v.addEventListener(e, sync));
    v.addEventListener("waiting", waiting);
    ["playing", "canplay", "pause", "ended", "error"].forEach((e) => v.addEventListener(e, flowing));
    return () => {
      events.forEach((e) => v.removeEventListener(e, sync));
      v.removeEventListener("waiting", waiting);
      ["playing", "canplay", "pause", "ended", "error"].forEach((e) => v.removeEventListener(e, flowing));
    };
  }, [videoRef]);

  const visible = useIdleControls(root, playing);

  // Hide the pointer with the controls so it does not sit on the board.
  useEffect(() => {
    if (!root) return;
    root.classList.toggle("vp-hide-cursor", !visible);
    return () => root.classList.remove("vp-hide-cursor");
  }, [root, visible]);

  const togglePlay = () => {
    if (hideControls) return;
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

  const skip = (seconds: number) => {
    if (hideControls) return;
    const v = videoRef.current;
    if (!v) return;
    const end = Number.isFinite(v.duration) ? v.duration : v.currentTime + seconds;
    let t = Math.max(0, Math.min(end, v.currentTime + seconds));
    if (typeof maxAllowedSecond === "number" && t > maxAllowedSecond + 1) {
      t = maxAllowedSecond;
      v.currentTime = t;
      v.pause();
      setCur(t);
      return;
    }
    v.currentTime = t;
    setCur(t);
    showFlash(seconds > 0 ? `+${seconds}` : `−${Math.abs(seconds)}`);
  };

  const seekPct = (pct: number) => {
    if (hideControls) return;
    const v = videoRef.current;
    if (!v || !dur) return;
    let t = (pct / 100) * dur;
    if (typeof maxAllowedSecond === "number" && t > maxAllowedSecond + 1) {
      t = maxAllowedSecond;
      v.currentTime = t;
      v.pause();
      setCur(t);
      return;
    }
    v.currentTime = t;
    setCur(t);
  };

  // Keyboard: physical keys (e.code) so the Arabic layout works the same.
  // Space/K play, J/L ±10s, arrows ±5s, M mute, F fullscreen.
  useEffect(() => {
    if (hideControls) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || isTypingTarget(e.target)) return;
      const v = videoRef.current;
      if (!v || !v.isConnected) return;
      switch (e.code) {
        case "Space":
        case "KeyK":
          e.preventDefault();
          if (v.paused || v.ended) void v.play().catch(() => {});
          else v.pause();
          break;
        case "KeyJ":
          e.preventDefault();
          skip(-SKIP_SECONDS);
          break;
        case "KeyL":
          e.preventDefault();
          skip(SKIP_SECONDS);
          break;
        case "ArrowLeft":
          e.preventDefault();
          skip(-5);
          break;
        case "ArrowRight":
          e.preventDefault();
          skip(5);
          break;
        case "KeyM":
          e.preventDefault();
          v.muted = !v.muted;
          break;
        case "KeyF":
          if (onToggleFullscreen) {
            e.preventDefault();
            onToggleFullscreen();
          }
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // skip reads the ref at call time; re-binding on every render is not needed
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoRef, onToggleFullscreen, hideControls]);

  if (hideControls) return null;

  const pct = dur > 0 ? Math.min(100, (cur / dur) * 100) : 0;
  const bufPct = dur > 0 ? Math.min(100, (buffered / dur) * 100) : 0;

  return (
    <>
      <BufferingIndicator show={stalled && playing} />
      <SeekFlash text={flash} />
      <div
        className={`vp-bar ${visible ? "" : "is-hidden"} absolute inset-x-0 bottom-0 z-20 px-2 sm:px-3 pt-6 pb-1.5 bg-gradient-to-t from-black/85 via-black/45 to-transparent flex items-center gap-1 sm:gap-2 ${className}`}
        onClick={(e) => e.stopPropagation()}
        dir="ltr"
      >
        <button type="button" onClick={togglePlay} aria-label={playing ? "إيقاف مؤقت" : "تشغيل"} title="تشغيل / إيقاف (مسافة)" className="vp-btn shrink-0">
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

        <SkipButton direction="back" onClick={() => skip(-SKIP_SECONDS)} />
        <SkipButton direction="forward" onClick={() => skip(SKIP_SECONDS)} />

        <span className="shrink-0 text-[11px] font-mono text-white/90 tabular-nums px-1">
          {fmt(cur)}
          <span className="hidden sm:inline text-white/60"> / {fmt(dur)}</span>
        </span>

        <SeekBar playedPct={pct} bufferedPct={bufPct} onSeekPct={seekPct} />

        <button type="button" onClick={toggleMute} aria-label={muted ? "تشغيل الصوت" : "كتم الصوت"} title="الصوت (M)" className="vp-btn shrink-0">
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

        {onQualityChange && (
          <VideoQualityMenu variant="inline" options={qualities} value={quality} onChange={onQualityChange} />
        )}

        <VideoSpeedMenu variant="inline" value={playbackRate} onChange={onPlaybackRateChange} />

        {onToggleFullscreen && (
          <button
            type="button"
            onClick={onToggleFullscreen}
            aria-label={isFullscreen ? "إنهاء ملء الشاشة" : "ملء الشاشة"}
            title="ملء الشاشة (F)"
            className="vp-btn shrink-0"
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
    </>
  );
}

export default VideoControlBar;
