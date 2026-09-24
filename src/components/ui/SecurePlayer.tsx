"use client";

import React, { useState, useRef, useEffect } from "react";
import { VideoWatermark } from "./VideoWatermark";
import { YouTubeSecurePlayer } from "./YouTubeSecurePlayer";
import { DrmPlayer } from "./DrmPlayer";
import { useApplyPlaybackRate, usePlaybackRate } from "./VideoSpeedMenu";
import { VideoControlBar } from "./VideoControlBar";
import { useFullscreen } from "./useFullscreen";
import { extractYouTubeVideoId } from "@/lib/youtube";
import {
  type VideoQualityOption,
  DEFAULT_QUALITY_OPTIONS,
  readStoredQuality,
  storeQuality,
  connectionLooksSlow,
} from "./VideoQualityMenu";

function extractDriveFileId(url: string): string | null {
  if (!url) return null;
  if (url.includes("gdrive_")) {
    const parts = url.split("gdrive_")[1];
    return parts?.split("?")[0]?.split("/")[0] || null;
  }
  const match = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/) || url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  return match?.[1] || null;
}

interface VdoPlayerInstance {
  video?: HTMLVideoElement;
  seek?: (seconds: number) => void;
  pause?: () => void;
  play?: () => void;
}

declare global {
  interface Window {
    VdoPlayer?: new (options: { iframe: HTMLIFrameElement }) => VdoPlayerInstance;
  }
}

interface CommonEmbedProps {
  embedUrl: string;
  title: string;
  watermark: string;
  startSeconds?: number;
  onEnded?: () => void;
  onProgress?: (seconds: number) => void;
  onPause?: () => void;
  onPlay?: () => void;
  paused?: boolean;
}

/**
 * VdoCipher & Bunny Iframe Secure Embed.
 * Handles SDK / postMessage synchronization and iframe lifecycle without hook order issues.
 */
function IframeSecureEmbed({
  embedUrl,
  title,
  provider,
  startSeconds = 0,
  onProgress,
  onPause,
  onPlay,
  paused = false,
}: CommonEmbedProps & { provider?: string }) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const vdoPlayerRef = useRef<VdoPlayerInstance | null>(null);
  const [playerError, setPlayerError] = useState<{ kind: "drm" | "playback"; message: string } | null>(null);

  // Resume playback for Bunny & VdoCipher
  useEffect(() => {
    if (provider === "bunny") {
      const handleMessage = (e: MessageEvent) => {
        try {
          const data = typeof e.data === "string" ? JSON.parse(e.data) : e.data;
          if (data?.event === "ready" && startSeconds > 0) {
            iframeRef.current?.contentWindow?.postMessage(
              JSON.stringify({ method: "seek", value: startSeconds }),
              "*"
            );
          }
          if (data?.event === "timeupdate" && typeof data.time === "number") {
            onProgress?.(data.time);
          }
          if (data?.event === "pause") {
            onPause?.();
          }
          if (data?.event === "play" || data?.event === "playing") {
            onPlay?.();
          }
        } catch {
          // ignore parse errors
        }
      };
      window.addEventListener("message", handleMessage);
      return () => window.removeEventListener("message", handleMessage);
    }

    if (provider === "vdocipher") {
      const script = document.createElement("script");
      script.src = "https://player.vdocipher.com/v2/api.js";
      script.async = true;
      document.body.appendChild(script);

      script.onload = () => {
        if (iframeRef.current && window.VdoPlayer) {
          const player = new window.VdoPlayer({ iframe: iframeRef.current });
          vdoPlayerRef.current = player;

          player.video?.addEventListener("loadedmetadata", () => {
            if (startSeconds > 0) {
              if (typeof player.seek === "function") {
                player.seek(startSeconds);
              } else if (player.video) {
                player.video.currentTime = startSeconds;
              }
            }
          });

          player.video?.addEventListener("timeupdate", () => {
            if (player.video?.currentTime) {
              onProgress?.(player.video.currentTime);
            }
          });

          player.video?.addEventListener("pause", () => {
            onPause?.();
          });

          player.video?.addEventListener("error", () => {
            setPlayerError({
              kind: "playback",
              message: "تعذر تشغيل الفيديو. تحقّق من الاتصال ثم أعد المحاولة.",
            });
          });
        }
      };

      const handleVdoWindowMessage = (e: MessageEvent) => {
        try {
          const data = typeof e.data === "string" ? JSON.parse(e.data) : e.data;
          if (
            data?.event === "error" ||
            data?.type === "error" ||
            (typeof data?.code === "number" && [6001, 6002, 6003, 6006, 6007, 6012, 6013, 6014].includes(data.code)) ||
            data?.msg === "device_not_supported" ||
            (typeof data?.message === "string" && /drm|widevine|not supported|license/i.test(data.message))
          ) {
            console.warn("[SecurePlayer] VdoCipher DRM error detected:", data);
            setPlayerError({
              kind: "drm",
              message: "استخدم جهاز اخر او تابلت الوزاره لان جهازك غير مدعوم",
            });
          }
        } catch {}
      };
      window.addEventListener("message", handleVdoWindowMessage);

      return () => {
        window.removeEventListener("message", handleVdoWindowMessage);
        if (document.body.contains(script)) {
          document.body.removeChild(script);
        }
        vdoPlayerRef.current = null;
      };
    }
  }, [provider, startSeconds, onProgress, onPause, onPlay]);

  // Handle paused prop changes
  useEffect(() => {
    if (provider === "bunny" && iframeRef.current) {
      const method = paused ? "pause" : "play";
      iframeRef.current.contentWindow?.postMessage(JSON.stringify({ method }), "*");
    } else if (provider === "vdocipher" && vdoPlayerRef.current) {
      try {
        if (paused) {
          if (typeof vdoPlayerRef.current.pause === "function") {
            vdoPlayerRef.current.pause();
          } else {
            vdoPlayerRef.current.video?.pause();
          }
        } else {
          if (typeof vdoPlayerRef.current.play === "function") {
            vdoPlayerRef.current.play();
          } else {
            vdoPlayerRef.current.video?.play();
          }
        }
      } catch (e) {
        console.error("Failed to play/pause VdoCipher player:", e);
      }
    }
  }, [paused, provider]);

  return (
    <div className="absolute inset-0 w-full h-full">
      <iframe
        ref={iframeRef}
        src={embedUrl}
        title={title}
        className="absolute inset-0 w-full h-full"
        allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture"
        referrerPolicy="strict-origin"
        style={{ border: "none" }}
        draggable={false}
      />
      {playerError && (
        <div className="absolute inset-0 bg-slate-950/95 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center z-50 dir-rtl animate-in fade-in duration-300">
          <div className={`w-16 h-16 rounded-2xl flex items-center justify-center mb-4 shadow-lg text-3xl ${
            playerError.kind === "drm"
              ? "bg-amber-500/10 border border-amber-500/30 text-amber-400 shadow-amber-500/10"
              : "bg-rose-500/10 border border-rose-500/30 text-rose-400 shadow-rose-500/10"
          }`}>
            {playerError.kind === "drm" ? "📱" : "⚠️"}
          </div>
          <h3 className="text-lg font-black text-white mb-2">
            {playerError.kind === "drm" ? "تنبيه توافق الجهاز (DRM)" : "تعذر تشغيل الفيديو"}
          </h3>
          <div className={`border rounded-2xl p-4 max-w-md w-full mb-5 shadow-inner text-center ${
            playerError.kind === "drm"
              ? "bg-amber-500/10 border-amber-500/25"
              : "bg-slate-800/60 border-slate-700"
          }`}>
            <p className={`text-sm md:text-base font-black leading-relaxed ${
              playerError.kind === "drm" ? "text-amber-300" : "text-slate-200"
            }`}>
              {playerError.message}
            </p>
            {playerError.kind === "drm" && (
              <p className="text-xs text-slate-300 mt-2.5 leading-relaxed">
                هذا الدرس محمي بتشفير DRM. إذا لم يعمل على هذا الجهاز جرّب متصفحاً حديثاً أو جهازاً آخر.
              </p>
            )}
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setPlayerError(null)}
              className="px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold rounded-xl transition-all cursor-pointer border border-slate-700"
            >
              إعادة المحاولة
            </button>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="px-5 py-2.5 bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold rounded-xl shadow-lg transition-all cursor-pointer"
            >
              تحديث الصفحة
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Direct Video Player (MP4 / WebM / local streaming endpoint).
 *
 * Native (alasly) lectures are a single file, not an adaptive ladder, so a
 * 1080p recording is a ~5 Mbit/s stream with nothing to fall back to when the
 * connection cannot carry it. When smaller renditions have been generated the
 * quality menu appears and re-requests the same lesson with ?q=<height>; the
 * position is carried across the switch so it feels like changing quality
 * rather than restarting the lesson.
 */
function DirectVideoEmbed({
  embedUrl,
  onPlay,
  onPause,
  onEnded,
  onProgress,
  onError,
  isFullscreen,
  onToggleFullscreen,
}: {
  embedUrl: string;
  onPlay?: () => void;
  onPause?: () => void;
  onEnded?: () => void;
  onProgress?: (seconds: number) => void;
  onError?: () => void;
  isFullscreen?: boolean;
  onToggleFullscreen?: () => void;
}) {
  const [playbackError, setPlaybackError] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  // Playback speed — remembered per browser; re-applied after a quality swap
  // because changing `src` resets the element's playbackRate to 1.
  const [playbackRate, setPlaybackRate] = usePlaybackRate();
  useApplyPlaybackRate(videoRef, playbackRate);
  // Native Drive / alasly always shows Auto · 360p · 480p · 720p. The /qualities
  // probe fills in file sizes once renditions exist; the button must not wait.
  const isNativeStream = embedUrl.startsWith("/api/videos/stream/");
  const [qualities, setQualities] = useState<VideoQualityOption[]>(
    isNativeStream ? DEFAULT_QUALITY_OPTIONS : []
  );
  const [quality, setQuality] = useState<number | null>(() => {
    if (!embedUrl.startsWith("/api/videos/stream/")) return null;
    const stored = readStoredQuality();
    return stored === undefined ? null : stored;
  });
  // Position + play state to restore on the other side of a quality switch.
  const resumeRef = useRef<{ time: number; playing: boolean } | null>(null);

  const streamPath = isNativeStream ? embedUrl.split("?")[0] : "";

  useEffect(() => {
    if (!streamPath) {
      setQualities([]);
      return;
    }
    setQualities(DEFAULT_QUALITY_OPTIONS);
    let cancelled = false;
    fetch(`${streamPath}/qualities`, { credentials: "same-origin" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { qualities?: VideoQualityOption[] } | null) => {
        if (cancelled) return;
        const list =
          data?.qualities && data.qualities.length >= 2 ? data.qualities : DEFAULT_QUALITY_OPTIONS;
        setQualities(list);

        const stored = readStoredQuality();
        if (stored !== undefined && list.some((o) => o.height === stored)) {
          setQuality(stored);
          return;
        }
        // Nobody who is struggling with the connection goes hunting for a
        // settings button, so start them low when the browser says the link is
        // weak. They can always raise it, and the choice is then remembered.
        if (stored === undefined && connectionLooksSlow()) {
          const lightest = list
            .filter((o) => o.height !== null)
            .sort((a, b) => (a.height as number) - (b.height as number))[0];
          if (lightest) {
            const v = videoRef.current;
            resumeRef.current = v ? { time: v.currentTime, playing: !v.paused } : null;
            setQuality(lightest.height);
          }
        }
      })
      .catch(() => {
        // A player that cannot list qualities still offers the default ladder.
      });
    return () => {
      cancelled = true;
    };
  }, [streamPath]);

  const src =
    quality === null ? embedUrl : `${embedUrl}${embedUrl.includes("?") ? "&" : "?"}q=${quality}`;

  const changeQuality = (height: number | null) => {
    const v = videoRef.current;
    resumeRef.current = v ? { time: v.currentTime, playing: !v.paused } : null;
    storeQuality(height);
    setPlaybackError(false);
    setQuality(height);
  };

  const handleVideoError = () => {
    onError?.();
    setPlaybackError(true);
  };

  const handleLoadedMetadata = () => {
    const resume = resumeRef.current;
    if (!resume) return;
    resumeRef.current = null;
    const v = videoRef.current;
    if (!v) return;
    try {
      if (resume.time > 0) v.currentTime = resume.time;
      if (resume.playing) void v.play();
    } catch {
      // seeking can fail while the new source is still opening; playback just
      // starts from the beginning rather than breaking
    }
  };

  if (playbackError) {
    return (
      <div className="absolute inset-0 bg-slate-950/95 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center z-50 dir-rtl animate-in fade-in duration-300">
        <div className="w-16 h-16 rounded-2xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-400 mb-4 shadow-lg shadow-rose-500/10 text-3xl">
          ⚠️
        </div>
        <h3 className="text-lg font-black text-white mb-2">تعذر تشغيل الفيديو</h3>
        <div className="bg-slate-800/60 border border-slate-700 rounded-2xl p-4 max-w-md w-full mb-5 shadow-inner text-center">
          <p className="text-sm text-slate-200 leading-relaxed">
            فشل تحميل المشغل. تحقّق من الاتصال ثم أعد المحاولة. هذه الحماية ليست نظام DRM.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setPlaybackError(false)}
            className="px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold rounded-xl transition-all cursor-pointer border border-slate-700"
          >
            إعادة المحاولة
          </button>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="px-5 py-2.5 bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold rounded-xl shadow-lg transition-all cursor-pointer"
          >
            تحديث الصفحة
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Native chrome is off: VideoControlBar owns play/seek/mute/quality/speed/fullscreen. */}
      <video
        ref={videoRef}
        src={src}
        controlsList="nodownload noplaybackrate"
        disablePictureInPicture
        playsInline
        className="absolute inset-0 w-full h-full object-contain cursor-pointer"
        onClick={(e) => {
          const v = e.currentTarget;
          if (v.paused || v.ended) void v.play().catch(() => {});
          else v.pause();
        }}
        onPlay={() => onPlay?.()}
        onPause={() => onPause?.()}
        onEnded={() => onEnded?.()}
        onError={handleVideoError}
        onLoadedMetadata={handleLoadedMetadata}
        onTimeUpdate={(e) => onProgress?.((e.target as HTMLVideoElement).currentTime)}
      />
      <VideoControlBar
        videoRef={videoRef}
        playbackRate={playbackRate}
        onPlaybackRateChange={setPlaybackRate}
        qualities={qualities}
        quality={quality}
        onQualityChange={isNativeStream ? changeQuality : undefined}
        isFullscreen={isFullscreen}
        onToggleFullscreen={onToggleFullscreen}
      />
    </>
  );
}

export interface SecurePlayerProps {
  embedUrl: string;
  title: string;
  watermark: string;
  provider?: string;
  drm?: {
    token?: string;
    licenseServers?: {
      widevine?: string;
      playready?: string;
      fairplay?: string;
      fairplayCertUrl?: string;
    };
    clearKeys?: Record<string, string>;
  } | null;
  onEnded?: () => void;
  startSeconds?: number;
  onProgress?: (seconds: number) => void;
  onPause?: () => void;
  onPlay?: () => void;
  onDrmDetected?: (drm: import("./DrmPlayer").DeviceDrmInfo) => void;
  className?: string;
  paused?: boolean;
  noNativeSecurity?: boolean;
  children?: React.ReactNode;
}

/**
 * SecurePlayer — Top-level dispatcher for all protected video streams.
 * Handles fullscreen wrapper, anti-screenshot security events, and forensic watermarking.
 */
export function SecurePlayer({
  embedUrl,
  title,
  watermark,
  provider,
  drm,
  onEnded,
  startSeconds = 0,
  onProgress,
  onPause,
  onPlay,
  onDrmDetected,
  className = "",
  paused = false,
  noNativeSecurity = false,
  children,
}: SecurePlayerProps) {
  const driveFileId = extractDriveFileId(embedUrl);
  const [useDriveDirect, setUseDriveDirect] = useState(noNativeSecurity);
  const [isBlackoutActive, setIsBlackoutActive] = useState(false);
  const { ref: wrapRef, isFs, cssFs, toggle: toggleFs } = useFullscreen<HTMLDivElement>();

  // Visibility and security guards
  useEffect(() => {
    if (noNativeSecurity || useDriveDirect) return;

    let blackoutTimer: NodeJS.Timeout | null = null;
    const triggerBlackout = (durationMs = 5000) => {
      setIsBlackoutActive(true);
      if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
        navigator.clipboard.writeText("").catch(() => {});
      }
      if (blackoutTimer) clearTimeout(blackoutTimer);
      blackoutTimer = setTimeout(() => {
        if (document.hasFocus()) {
          setIsBlackoutActive(false);
        }
      }, durationMs);
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      const k = e.key;
      const lowerK = k.toLowerCase();
      const isPrtScn = k === "PrintScreen" || e.code === "PrintScreen" || e.keyCode === 44;
      const isMeta =
        e.metaKey ||
        (typeof e.getModifierState === "function" &&
          (e.getModifierState("Meta") || e.getModifierState("OS")));

      // Physical KeyS or Arabic "س"
      const isKeyS = lowerK === "s" || lowerK === "س" || e.code === "KeyS" || e.keyCode === 83;
      // Physical KeyG or Arabic "ل"
      const isKeyG = lowerK === "g" || lowerK === "ل" || e.code === "KeyG" || e.keyCode === 71;
      // Physical KeyR or Arabic "ق"
      const isKeyR = lowerK === "r" || lowerK === "ق" || e.code === "KeyR" || e.keyCode === 82;

      const isWinSnipping = isMeta && e.shiftKey && isKeyS;
      const isWinGameBar = isMeta && (isKeyG || (e.altKey && isKeyR));
      const isMacScreenshot = isMeta && e.shiftKey && ["3", "4", "5", "#", "$", "%"].includes(k);
      const isBrowserScreenshot = (e.ctrlKey || isMeta) && e.shiftKey && isKeyS;
      const isDevTools =
        k === "F12" ||
        ((e.ctrlKey || isMeta) && e.shiftKey && (lowerK === "i" || lowerK === "j" || lowerK === "c" || lowerK === "ه" || lowerK === "ـ" || lowerK === "ؤ")) ||
        ((e.ctrlKey || isMeta) && (lowerK === "u" || lowerK === "ع"));

      if (isPrtScn || isWinSnipping || isWinGameBar || isMacScreenshot || isBrowserScreenshot || isDevTools) {
        if (isPrtScn || isWinSnipping || isMacScreenshot || isBrowserScreenshot) {
          e.preventDefault();
          triggerBlackout(5000);
        }
        if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
          navigator.clipboard.writeText("").catch(() => {});
        }
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      const k = e.key;
      const lowerK = k.toLowerCase();
      const isKeyS = lowerK === "s" || lowerK === "س" || e.code === "KeyS" || e.keyCode === 83;
      const isPrtScn = k === "PrintScreen" || e.code === "PrintScreen" || e.keyCode === 44;
      if (isPrtScn || isKeyS) {
        if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
          navigator.clipboard.writeText("").catch(() => {});
        }
      }
    };

    const isTouch =
      typeof navigator !== "undefined" &&
      (navigator.maxTouchPoints > 0 || /Android|iPhone|iPad/i.test(navigator.userAgent));

    const handleBlur = () => {
      if (isTouch) return;
      triggerBlackout(5000);
    };

    const handleFocus = () => {
      if (blackoutTimer) clearTimeout(blackoutTimer);
      setTimeout(() => {
        if (document.hasFocus()) {
          setIsBlackoutActive(false);
        }
      }, 350);
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        setIsBlackoutActive(true);
      } else {
        handleFocus();
      }
    };

    window.addEventListener("keydown", handleKeyDown, true);
    window.addEventListener("keyup", handleKeyUp, true);
    window.addEventListener("blur", handleBlur);
    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      if (blackoutTimer) clearTimeout(blackoutTimer);
      window.removeEventListener("keydown", handleKeyDown, true);
      window.removeEventListener("keyup", handleKeyUp, true);
      window.removeEventListener("blur", handleBlur);
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [noNativeSecurity, useDriveDirect]);

  // 1. YouTube Hardened Embed
  if (provider === "youtube") {
    const id = extractYouTubeVideoId(embedUrl) || embedUrl.match(/\/embed\/([^?/]+)/)?.[1] || "";
    if (id) {
      return (
        <YouTubeSecurePlayer
          videoId={id}
          title={title}
          watermark={watermark}
          onEnded={onEnded}
          startSeconds={startSeconds}
          onProgress={onProgress}
          onPause={onPause}
          onPlay={onPlay}
          paused={paused}
        >
          {children}
        </YouTubeSecurePlayer>
      );
    }
  }

  const isDirectVideo =
    embedUrl.startsWith("/api/") ||
    embedUrl.includes(".mp4") ||
    embedUrl.includes(".webm") ||
    embedUrl.includes(".mov");

  // These two surfaces render our own control bar (with fullscreen inside it).
  const hasOwnControlBar = provider === "axinom" || (!(driveFileId && useDriveDirect) && isDirectVideo);

  return (
    <div
      ref={wrapRef}
      className={`relative bg-black w-full select-none ${className}`}
      style={
        cssFs
          ? { position: "fixed", inset: 0, width: "100vw", height: "100dvh", zIndex: 2147483647 }
          : isFs
          ? { height: "100%" }
          : { paddingTop: "56.25%" }
      }
      onContextMenu={(e) => e.preventDefault()}
    >
      {/* ── Video / Iframe Surface ── */}
      {provider === "axinom" ? (
        <div className="absolute inset-0 w-full h-full">
          <DrmPlayer
            manifestUrl={embedUrl}
            drmToken={drm?.token}
            licenseServers={drm?.licenseServers}
            clearKeys={drm?.clearKeys}
            initialPosition={startSeconds}
            title={title}
            onTimeUpdate={onProgress}
            onEnded={onEnded}
            onPause={onPause}
            onPlay={onPlay}
            onDrmDetected={onDrmDetected}
            paused={paused}
            isFullscreen={isFs}
            onToggleFullscreen={toggleFs}
          />
        </div>
      ) : driveFileId && useDriveDirect ? (
        <iframe
          src={`https://drive.google.com/file/d/${driveFileId}/preview`}
          title={title}
          className="absolute inset-0 w-full h-full border-0"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
          referrerPolicy="no-referrer-when-downgrade"
        />
      ) : isDirectVideo ? (
        <DirectVideoEmbed
          embedUrl={embedUrl}
          onPlay={onPlay}
          onPause={onPause}
          onEnded={onEnded}
          onProgress={onProgress}
          isFullscreen={isFs}
          onToggleFullscreen={toggleFs}
        />
      ) : (
        <IframeSecureEmbed
          embedUrl={embedUrl}
          title={title}
          provider={provider}
          startSeconds={startSeconds}
          onProgress={onProgress}
          onPause={onPause}
          onPlay={onPlay}
          paused={paused}
          watermark={watermark}
        />
      )}

      {/* ── Active Anti-Screenshot / Blur Blackout Barrier (Sibling overlay) ── */}
      {isBlackoutActive && (
        <div className="absolute inset-0 z-50 bg-black flex flex-col items-center justify-center gap-3 select-none pointer-events-auto">
          <div className="w-12 h-12 rounded-full bg-red-500/10 border border-red-500/30 flex items-center justify-center text-red-400 animate-pulse text-xl">
            🛡️
          </div>
          <p className="text-sm font-bold text-white tracking-wide">تم تعتيم الشاشة لحماية المحتوى</p>
          <p className="text-xs text-slate-400 font-mono">Screen Capture Protected</p>
        </div>
      )}

      {/* ── Unified Forensic Watermark ── */}
      <VideoWatermark label={watermark} />

      {/* Interactive overlays & modals */}
      {children}

      {/* ── Fullscreen Toggle Button — iframe providers only; the HTML5 players
           (axinom / direct) carry it inside their own VideoControlBar. ── */}
      {!hasOwnControlBar && (
      <button
        type="button"
        onClick={toggleFs}
        aria-label={isFs ? "إنهاء ملء الشاشة" : "ملء الشاشة"}
        className="absolute bottom-2.5 right-2.5 z-20 w-10 h-10 rounded-lg bg-black/55 hover:bg-black/80 text-white flex items-center justify-center backdrop-blur-sm transition-colors cursor-pointer"
      >
        {isFs ? (
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M8 3v3a2 2 0 01-2 2H3M21 8h-3a2 2 0 01-2-2V3M3 16h3a2 2 0 012 2v3M16 21v-3a2 2 0 012-2h3" />
          </svg>
        ) : (
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M8 3H5a2 2 0 00-2 2v3M21 8V5a2 2 0 00-2-2h-3M3 16v3a2 2 0 002 2h3M16 21h3a2 2 0 002-2v-3" />
          </svg>
        )}
      </button>
      )}
    </div>
  );
}

export default SecurePlayer;
