"use client";

import { useEffect, useRef, useState } from "react";
import { VideoWatermark } from "./VideoWatermark";
import { useFullscreen } from "./useFullscreen";
import { extractYouTubeVideoId } from "@/lib/youtube";
import { VideoSpeedMenu, usePlaybackRate } from "./VideoSpeedMenu";

/**
 * Hardened YouTube player. Native controls are OFF and a full-surface click
 * shield swallows every pointer event, so NONE of YouTube's chrome — the title,
 * logo, share, or "Watch on YouTube" link — is ever clickable. Playback is
 * driven entirely by our own controls through the IFrame API. Combined with the
 * drifting watermark and wrapper-only fullscreen, this is the strongest practical
 * deterrent for a YouTube embed.
 */

interface YTPlayer {
  playVideo(): void;
  pauseVideo(): void;
  mute(): void;
  unMute(): void;
  isMuted(): boolean;
  getCurrentTime(): number;
  getDuration(): number;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  getPlayerState(): number;
  setPlaybackRate?(rate: number): void;
  destroy(): void;
}

interface YTNamespace {
  Player: new (el: HTMLElement | string, opts: Record<string, unknown>) => YTPlayer;
  PlayerState: { ENDED: number; PLAYING: number; PAUSED: number };
}

declare global {
  interface Window {
    YT?: YTNamespace;
    onYouTubeIframeAPIReady?: () => void;
    __ytApiLoading?: boolean;
  }
}

function loadYTApi(): Promise<YTNamespace> {
  return new Promise((resolve, reject) => {
    if (window.YT?.Player) return resolve(window.YT);

    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      prev?.();
      if (window.YT?.Player) resolve(window.YT);
    };

    if (!window.__ytApiLoading) {
      window.__ytApiLoading = true;
      const s = document.createElement("script");
      s.src = "https://www.youtube.com/iframe_api";
      s.async = true;
      s.onerror = (e) => {
        console.warn("Failed to load YouTube IFrame API script", e);
        reject(new Error("Failed to load YouTube API"));
      };
      document.head.appendChild(s);
    }

    // Safety poll in case the global callback was already consumed.
    let elapsed = 0;
    const iv = setInterval(() => {
      elapsed += 200;
      if (window.YT?.Player) {
        clearInterval(iv);
        resolve(window.YT);
      } else if (elapsed > 8000) {
        clearInterval(iv);
        reject(new Error("YouTube API load timeout"));
      }
    }, 200);
  });
}

const fmt = (s: number) => {
  if (!isFinite(s) || s < 0) s = 0;
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${String(sec).padStart(2, "0")}`;
};

export function YouTubeSecurePlayer({
  videoId,
  title,
  watermark,
  onEnded,
  startSeconds = 0,
  onProgress,
  onTimeUpdate,
  onPause,
  onPlay,
  paused = false,
  children,
}: {
  videoId: string;
  title: string;
  watermark: string;
  onEnded?: () => void;
  /** Resume position in seconds — seeked once on ready. */
  startSeconds?: number;
  /** Reports the current position (throttled to ~5s) for saving. */
  onProgress?: (seconds: number) => void;
  /** High-frequency time updates (~333ms) for watched-ranges tracking. */
  onTimeUpdate?: (seconds: number) => void;
  /** Fired when playback pauses. */
  onPause?: () => void;
  /** Fired when playback resumes. */
  onPlay?: () => void;
  paused?: boolean;
  children?: React.ReactNode;
}) {
  const cleanVideoId = extractYouTubeVideoId(videoId) || videoId.trim();

  const { ref: wrapRef, isFs, cssFs, toggle: toggleFs } = useFullscreen<HTMLDivElement>();
  const containerRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YTPlayer | null>(null);

  const onEndedRef = useRef(onEnded);
  onEndedRef.current = onEnded;
  const onProgressRef = useRef(onProgress);
  onProgressRef.current = onProgress;
  const onTimeUpdateRef = useRef(onTimeUpdate);
  onTimeUpdateRef.current = onTimeUpdate;
  const onPauseRef = useRef(onPause);
  onPauseRef.current = onPause;
  const onPlayRef = useRef(onPlay);
  onPlayRef.current = onPlay;
  const startRef = useRef(startSeconds);
  startRef.current = startSeconds;
  const seekedRef = useRef(false);

  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [cur, setCur] = useState(0);
  const [dur, setDur] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [useFallbackIframe, setUseFallbackIframe] = useState(false);

  // Playback speed — remembered per browser. Pushed to the IFrame API once the
  // player is ready and again whenever the student changes it.
  const [playbackRate, setPlaybackRate] = usePlaybackRate();
  useEffect(() => {
    if (!ready) return;
    try {
      playerRef.current?.setPlaybackRate?.(playbackRate);
    } catch {
      /* the API can reject rates a given video doesn't offer; keep going */
    }
  }, [ready, playbackRate]);

  // Play/pause programmatic control
  useEffect(() => {
    const p = playerRef.current;
    if (!p || !ready) return;
    try {
      if (paused) {
        p.pauseVideo();
      } else {
        p.playVideo();
      }
    } catch (e) {
      console.error("Failed to play/pause YouTube player:", e);
    }
  }, [paused, ready]);

  useEffect(() => {
    let disposed = false;
    let poll: ReturnType<typeof setInterval> | undefined;
    let timeoutTimer: ReturnType<typeof setTimeout> | undefined;

    setReady(false);
    setErrorMessage(null);
    seekedRef.current = false;

    if (!cleanVideoId) {
      setErrorMessage("معرف فيديو YouTube غير صالح");
      return;
    }

    // Dynamic slot pattern: create child element inside containerRef so destruction doesn't break DOM tree
    const container = containerRef.current;
    if (!container) return;

    // Clear any previous child slots
    container.innerHTML = "";
    const slot = document.createElement("div");
    slot.style.width = "100%";
    slot.style.height = "100%";
    container.appendChild(slot);

    // Timeout fallback: if YouTube API doesn't ready in 6s, switch to fallback iframe
    timeoutTimer = setTimeout(() => {
      if (!disposed && !playerRef.current && !ready) {
        console.warn("YouTube API init timed out, enabling fallback iframe mode");
        setUseFallbackIframe(true);
        setReady(true);
      }
    }, 6000);

    loadYTApi()
      .then((YT) => {
        if (disposed || !containerRef.current) return;

        try {
          playerRef.current = new YT.Player(slot, {
            videoId: cleanVideoId,
            host: "https://www.youtube-nocookie.com",
            playerVars: {
              controls: 0,
              modestbranding: 1,
              rel: 0,
              iv_load_policy: 3,
              disablekb: 1,
              fs: 0,
              playsinline: 1,
              autoplay: 1,
              enablejsapi: 1,
              origin: typeof window !== "undefined" ? window.location.origin : undefined,
            },
            events: {
              onReady: () => {
                if (disposed) return;
                if (timeoutTimer) clearTimeout(timeoutTimer);
                setReady(true);
                const d = playerRef.current?.getDuration() ?? 0;
                setDur(d);
                setMuted(playerRef.current?.isMuted() ?? false);

                // Resume once: only if the saved position is meaningfully into the video
                const start = startRef.current;
                if (!seekedRef.current && start > 3 && (!d || start < d - 5)) {
                  seekedRef.current = true;
                  try {
                    playerRef.current?.seekTo(start, true);
                    setCur(start);
                  } catch {
                    /* noop */
                  }
                }
                try {
                  playerRef.current?.playVideo();
                } catch {
                  /* autoplay may still be blocked; the click shield starts it */
                }
              },
              onStateChange: (e: { data: number }) => {
                const YTns = window.YT;
                if (!YTns) return;
                if (e.data === YTns.PlayerState.PLAYING) {
                  setPlaying(true);
                  onPlayRef.current?.();
                } else if (e.data === YTns.PlayerState.PAUSED) {
                  setPlaying(false);
                  onPauseRef.current?.();
                } else if (e.data === YTns.PlayerState.ENDED) {
                  setPlaying(false);
                  onEndedRef.current?.();
                }
              },
              onError: (e: { data: number }) => {
                console.error("YouTube Player Error:", e.data);
                let msg = "حدث خطأ أثناء تحميل الفيديو من YouTube";
                if (e.data === 2) {
                  msg = "معرف الفيديو غير صالح (تأكد من صحة الرابط)";
                } else if (e.data === 5) {
                  msg = "خطأ في مشغل الفيديو HTML5";
                } else if (e.data === 100) {
                  msg = "الفيديو غير موجود أو تم حذفه من YouTube";
                } else if (e.data === 101 || e.data === 150) {
                  msg = "صاحب الفيديو لا يسمح بتضمينه خارج YouTube. يرجى تفعيل التضمين (Allow Embedding) من إعدادات الفيديو في استوديو يوتيوب.";
                }
                setErrorMessage(msg);
                setReady(true);
              },
            },
          });
        } catch (err) {
          console.error("Failed to construct YT.Player:", err);
          setUseFallbackIframe(true);
          setReady(true);
        }
      })
      .catch((err) => {
        console.warn("YouTube API load rejected, switching to fallback iframe:", err);
        if (!disposed) {
          setUseFallbackIframe(true);
          setReady(true);
        }
      });

    poll = setInterval(() => {
      const p = playerRef.current;
      if (p && typeof p.getCurrentTime === "function") {
        try {
          const t = p.getCurrentTime() || 0;
          setCur(t);
          const d = p.getDuration() || 0;
          if (d) setDur(d);
          if (onTimeUpdateRef.current && t > 0) {
            onTimeUpdateRef.current(t);
          }
          if (onProgressRef.current && t > 0) {
            onProgressRef.current(t);
          }
        } catch {
          // ignore transient poll error
        }
      }
    }, 333);

    return () => {
      disposed = true;
      if (timeoutTimer) clearTimeout(timeoutTimer);
      if (poll) clearInterval(poll);
      try {
        const t = playerRef.current?.getCurrentTime?.() ?? 0;
        if (onProgressRef.current && t > 0) onProgressRef.current(Math.floor(t));
      } catch {
        /* noop */
      }
      try {
        playerRef.current?.destroy();
      } catch {
        /* noop */
      }
      playerRef.current = null;
      if (containerRef.current) {
        containerRef.current.innerHTML = "";
      }
    };
  }, [cleanVideoId]);

  const togglePlay = () => {
    const p = playerRef.current;
    if (!p) return;
    if (playing) p.pauseVideo();
    else p.playVideo();
  };

  const toggleMute = () => {
    const p = playerRef.current;
    if (!p) return;
    if (p.isMuted()) {
      p.unMute();
      setMuted(false);
    } else {
      p.mute();
      setMuted(true);
    }
  };

  const seek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const p = playerRef.current;
    if (!p || !dur) return;
    const t = (Number(e.target.value) / 100) * dur;
    p.seekTo(t, true);
    setCur(t);
  };

  const [seekBadge, setSeekBadge] = useState<string | null>(null);

  // Keyboard controls for seeking (+5s/-5s), play/pause, fullscreen, mute
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable)
      ) {
        return;
      }

      const p = playerRef.current;
      if (!p) return;

      const key = e.key;
      const lowerKey = key.toLowerCase();

      if (key === "ArrowRight" || lowerKey === "l") {
        e.preventDefault();
        const d = p.getDuration?.() || 0;
        const c = p.getCurrentTime?.() || 0;
        const n = Math.min(d > 0 ? d : c + 5, c + 5);
        p.seekTo(n, true);
        setCur(n);
        setSeekBadge("⏩ +5ث");
        clearTimeout(timer);
        timer = setTimeout(() => setSeekBadge(null), 800);
      } else if (key === "ArrowLeft" || lowerKey === "j") {
        e.preventDefault();
        const c = p.getCurrentTime?.() || 0;
        const n = Math.max(0, c - 5);
        p.seekTo(n, true);
        setCur(n);
        setSeekBadge("⏪ -5ث");
        clearTimeout(timer);
        timer = setTimeout(() => setSeekBadge(null), 800);
      } else if (key === " " || lowerKey === "k") {
        e.preventDefault();
        if (playerRef.current) {
          try {
            const isP = playerRef.current.getPlayerState?.() === 1;
            if (isP) playerRef.current.pauseVideo();
            else playerRef.current.playVideo();
          } catch {
            /* noop */
          }
        }
      } else if (lowerKey === "f") {
        e.preventDefault();
        toggleFs();
      } else if (lowerKey === "m") {
        e.preventDefault();
        if (playerRef.current) {
          try {
            if (playerRef.current.isMuted()) {
              playerRef.current.unMute();
              setMuted(false);
            } else {
              playerRef.current.mute();
              setMuted(true);
            }
          } catch {
            /* noop */
          }
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [toggleFs]);

  const [isBlackoutActive, setIsBlackoutActive] = useState(false);

  // PC Anti-Screenshot & Clipboard Security Guard
  useEffect(() => {
    let blackoutTimer: NodeJS.Timeout | null = null;
    const triggerBlackout = (durationMs = 1500) => {
      setIsBlackoutActive(true);
      if (blackoutTimer) clearTimeout(blackoutTimer);
      blackoutTimer = setTimeout(() => {
        if (document.hasFocus() && !document.hidden) {
          setIsBlackoutActive(false);
        }
      }, durationMs);
    };

    const handleKeySecurity = (e: KeyboardEvent) => {
      const k = e.key;
      const lowerK = k.toLowerCase();

      const isPrtScn = k === "PrintScreen" || e.code === "PrintScreen";
      const isMeta =
        e.metaKey ||
        (typeof e.getModifierState === "function" &&
          (e.getModifierState("Meta") || e.getModifierState("OS")));
      const isWinSnipping = isMeta && e.shiftKey && lowerK === "s";
      const isWinGameBar = isMeta && lowerK === "g";
      const isMacScreenshot = isMeta && e.shiftKey && ["3", "4", "5", "#", "$", "%"].includes(k);
      const isBrowserScreenshot = e.ctrlKey && e.shiftKey && lowerK === "s";
      const isDevTools =
        k === "F12" ||
        (e.ctrlKey && e.shiftKey && (lowerK === "i" || lowerK === "j" || lowerK === "c")) ||
        (e.ctrlKey && lowerK === "u");

      if (
        isPrtScn ||
        isWinSnipping ||
        isWinGameBar ||
        isMacScreenshot ||
        isBrowserScreenshot ||
        isDevTools
      ) {
        triggerBlackout(2000);
        if (isPrtScn || isWinSnipping || isMacScreenshot) {
          e.preventDefault();
          e.stopPropagation();
        }

        if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
          navigator.clipboard.writeText("").catch(() => {});
        }
      }
    };

    const handleKeyUpSecurity = (e: KeyboardEvent) => {
      if (e.key === "PrintScreen" || e.code === "PrintScreen") {
        triggerBlackout(2000);
        if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
          navigator.clipboard.writeText("").catch(() => {});
        }
      }
    };

    const handleBlur = () => {
      requestAnimationFrame(() => {
        const active = document.activeElement;
        if (active instanceof HTMLIFrameElement && wrapRef.current?.contains(active)) return;
        if (document.visibilityState === "visible" && active instanceof HTMLIFrameElement) return;
        setIsBlackoutActive(true);
      });
    };

    const handleFocus = () => {
      setIsBlackoutActive(false);
    };

    const handleVisibilityChange = () => {
      setIsBlackoutActive(document.hidden);
    };

    window.addEventListener("keydown", handleKeySecurity, true);
    window.addEventListener("keyup", handleKeyUpSecurity, true);
    window.addEventListener("blur", handleBlur);
    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      if (blackoutTimer) clearTimeout(blackoutTimer);
      window.removeEventListener("keydown", handleKeySecurity, true);
      window.removeEventListener("keyup", handleKeyUpSecurity, true);
      window.removeEventListener("blur", handleBlur);
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  const pct = dur ? Math.min(100, (cur / dur) * 100) : 0;

  return (
    <div
      ref={wrapRef}
      className="relative bg-black w-full select-none overflow-hidden"
      style={
        cssFs
          ? { position: "fixed", inset: 0, width: "100vw", height: "100dvh", zIndex: 2147483647 }
          : isFs
          ? { height: "100%" }
          : { paddingTop: "56.25%" }
      }
      onContextMenu={(e) => e.preventDefault()}
    >
      {/* Error Card Overlay if YouTube returns an error */}
      {errorMessage && (
        <div className="absolute inset-0 z-40 bg-slate-950 flex flex-col items-center justify-center p-6 text-center text-white">
          <div className="w-14 h-14 rounded-2xl bg-amber-500/20 text-amber-400 flex items-center justify-center mb-4 text-2xl">
            ⚠️
          </div>
          <h3 className="text-base font-bold mb-2 text-white">تعذر تشغيل فيديو YouTube</h3>
          <p className="text-xs text-slate-300 max-w-md mb-5 leading-relaxed">{errorMessage}</p>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => {
                setErrorMessage(null);
                setReady(false);
                setUseFallbackIframe(true);
              }}
              className="px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-xl text-xs font-bold transition-all shadow-md"
            >
              🔄 تجربة المشغل البديل
            </button>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-xl text-xs font-bold transition-all"
            >
              إعادة تحميل الصفحة
            </button>
          </div>
        </div>
      )}

      {/* The Container for dynamic YT iframe mount or fallback */}
      <div
        className="absolute inset-0 w-full h-full transition-all duration-75"
        style={{
          filter: isBlackoutActive ? "brightness(0)" : "none",
          opacity: isBlackoutActive ? 0 : 1,
        }}
      >
        {useFallbackIframe ? (
          <iframe
            src={`https://www.youtube-nocookie.com/embed/${cleanVideoId}?enablejsapi=1&playsinline=1&rel=0&modestbranding=1`}
            title={title}
            className="w-full h-full border-0"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            referrerPolicy="strict-origin-when-cross-origin"
          />
        ) : (
          <div ref={containerRef} className="w-full h-full" />
        )}
      </div>

      {/* ── Active Anti-Screenshot / Blur Blackout Barrier ── */}
      {isBlackoutActive && (
        <div
          className="absolute inset-0 z-50 bg-black flex flex-col items-center justify-center gap-3 select-none pointer-events-auto cursor-pointer"
          onClick={() => setIsBlackoutActive(false)}
          role="button"
          tabIndex={0}
        >
          <div className="w-12 h-12 rounded-full bg-red-500/10 border border-red-500/30 flex items-center justify-center text-red-400 animate-pulse text-xl">
            🛡️
          </div>
          <p className="text-sm font-bold text-white tracking-wide">تم تعتيم الشاشة لحماية المحتوى</p>
          <p className="text-xs text-slate-400 font-mono">Screen Capture Protected</p>
          <p className="text-sky-400 text-xs font-bold">اضغط هنا للمتابعة</p>
        </div>
      )}

      {/* Full-surface click shield: swallows every click so no YouTube chrome is
          reachable; tapping toggles play/pause through our API instead. (Inactive when in fallback iframe mode) */}
      {!useFallbackIframe && !errorMessage && (
        <button
          type="button"
          onClick={togglePlay}
          aria-label={playing ? "إيقاف مؤقت" : "تشغيل"}
          className="absolute inset-0 z-10 w-full h-full cursor-pointer bg-transparent"
        />
      )}

      {/* Center play affordance when paused */}
      {!useFallbackIframe && ready && !playing && !errorMessage && (
        <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none">
          <span className="w-16 h-16 rounded-full bg-black/55 backdrop-blur-sm flex items-center justify-center">
            <svg
              className="w-7 h-7 text-white"
              viewBox="0 0 24 24"
              fill="currentColor"
              aria-hidden
            >
              <path d="M8 5v14l11-7z" />
            </svg>
          </span>
        </div>
      )}

      {/* Forensic watermark — child of the fullscreen element */}
      <VideoWatermark label={watermark} />

      {/* Seek badge overlay */}
      {seekBadge && (
        <div className="absolute inset-0 z-25 flex items-center justify-center pointer-events-none">
          <span
            className="px-4 py-2 rounded-2xl bg-black/80 backdrop-blur-md text-white font-bold text-sm shadow-2xl animate-fade-in border border-white/10"
            dir="ltr"
          >
            {seekBadge}
          </span>
        </div>
      )}

      {/* Interactive modals & overlays */}
      {children}

      {/* Loading shimmer */}
      {!ready && !errorMessage && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-black gap-3">
          <div className="w-9 h-9 rounded-full border-2 border-sky-400/20 border-t-sky-400 animate-spin" />
          <span className="text-xs text-slate-400">جارٍ تحميل المشغل...</span>
        </div>
      )}

      {/* Custom control bar (above the shield) - hidden when fallback iframe is used to let native controls take over */}
      {!useFallbackIframe && !errorMessage && (
        <div className="absolute inset-x-0 bottom-0 z-20 px-3 py-2.5 bg-gradient-to-t from-black/80 via-black/40 to-transparent flex items-center gap-3">
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
            className="flex-1 h-1 accent-sky-400 cursor-pointer"
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
              <svg
                className="w-5 h-5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <path d="M11 5L6 9H2v6h4l5 4zM23 9l-6 6M17 9l6 6" />
              </svg>
            ) : (
              <svg
                className="w-5 h-5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <path d="M11 5L6 9H2v6h4l5 4zM15.5 8.5a5 5 0 010 7M19 5a9 9 0 010 14" />
              </svg>
            )}
          </button>

          <VideoSpeedMenu variant="inline" value={playbackRate} onChange={setPlaybackRate} />

          <button
            type="button"
            onClick={toggleFs}
            aria-label={isFs ? "إنهاء ملء الشاشة" : "ملء الشاشة"}
            className="shrink-0 text-white hover:text-sky-300 transition-colors"
            title={title}
          >
            {isFs ? (
              <svg
                className="w-5 h-5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <path d="M8 3v3a2 2 0 01-2 2H3M21 8h-3a2 2 0 01-2-2V3M3 16h3a2 2 0 012 2v3M16 21v-3a2 2 0 012-2h3" />
              </svg>
            ) : (
              <svg
                className="w-5 h-5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <path d="M8 3H5a2 2 0 00-2 2v3M21 8V5a2 2 0 00-2-2h-3M3 16v3a2 2 0 002 2h3M16 21h3a2 2 0 002-2v-3" />
              </svg>
            )}
          </button>
        </div>
      )}
    </div>
  );
}

