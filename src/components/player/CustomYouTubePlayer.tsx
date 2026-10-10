"use client";

import React, { useEffect, useRef, useState } from "react";
import { useFullscreen } from "../ui/useFullscreen";
import { VideoWatermark } from "../ui/VideoWatermark";
import { VideoQuestionModal } from "./VideoQuestionModal";
import { VideoQuestionOverlay } from "./VideoQuestionOverlay";
import { extractYouTubeVideoId } from "@/lib/youtube";

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
  destroy(): void;
}

interface YTNamespace {
  Player: new (el: HTMLElement | string, opts: Record<string, unknown>) => YTPlayer;
  PlayerState: { ENDED: number; PLAYING: number; PAUSED: number };
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
      s.onerror = (e) => reject(new Error("Failed to load YouTube API"));
      document.head.appendChild(s);
    }
    let elapsed = 0;
    const iv = setInterval(() => {
      elapsed += 200;
      if (window.YT?.Player) {
        clearInterval(iv);
        resolve(window.YT);
      } else if (elapsed > 8000) {
        clearInterval(iv);
        reject(new Error("YouTube API timeout"));
      }
    }, 200);
  });
}

const formatTime = (s: number) => {
  if (!isFinite(s) || s < 0) s = 0;
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${String(sec).padStart(2, "0")}`;
};

export function CustomYouTubePlayer({
  videoId,
  title,
  watermark,
  startSeconds = 0,
  onProgress,
  paused = false,
  onEnded,
  onPauseChange,
  questions = [],
  answeredQuestionIds = new Set(),
  onQuestionAnswered,
}: {
  videoId: string;
  title: string;
  watermark: string;
  startSeconds?: number;
  onProgress?: (seconds: number) => void;
  paused?: boolean;
  onEnded?: () => void;
  onPauseChange?: (paused: boolean) => void;
  questions?: any[];
  answeredQuestionIds?: Set<string>;
  onQuestionAnswered: (questionId: string) => void;
}) {
  const cleanVideoId = extractYouTubeVideoId(videoId) || videoId.trim();

  const { ref: wrapRef, isFs, cssFs, toggle: toggleFs } = useFullscreen<HTMLDivElement>();
  const containerRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YTPlayer | null>(null);

  const [ready, setReady] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [currentSecond, setCurrentSecond] = useState(startSeconds);
  const [duration, setDuration] = useState(0);

  // Timed Questions state
  const [firedQuestionIds, setFiredQuestionIds] = useState<Set<string>>(new Set());
  const [activeQuestion, setActiveQuestion] = useState<any | null>(null);
  const [activeOverlayQuestion, setActiveOverlayQuestion] = useState<any | null>(null);

  const lastReportTimeRef = useRef(0);
  const startSecondsRef = useRef(startSeconds);
  const seekedRef = useRef(false);

  // 1. Initialize Player
  useEffect(() => {
    let disposed = false;
    const container = containerRef.current;
    if (!container || !cleanVideoId) return;

    container.innerHTML = "";
    const slot = document.createElement("div");
    slot.style.width = "100%";
    slot.style.height = "100%";
    container.appendChild(slot);

    loadYTApi().then((YT) => {
      if (disposed || !containerRef.current) return;
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
          autoplay: 0,
          enablejsapi: 1,
          origin: typeof window !== "undefined" ? window.location.origin : undefined,
        },
        events: {
          onReady: () => {
            if (disposed) return;
            setReady(true);
            const d = playerRef.current?.getDuration() ?? 0;
            setDuration(d);
            setMuted(playerRef.current?.isMuted() ?? false);

            // Seek to start position once loaded
            const start = startSecondsRef.current;
            if (!seekedRef.current && start > 0 && (!d || start < d - 5)) {
              seekedRef.current = true;
              try {
                playerRef.current?.seekTo(start, true);
                setCurrentSecond(start);
              } catch { /* noop */ }
            }
          },
          onStateChange: (e: { data: number }) => {
            const YTns = window.YT;
            if (!YTns) return;
            if (e.data === YTns.PlayerState.PLAYING) {
              setIsPlaying(true);
            } else if (e.data === YTns.PlayerState.PAUSED) {
              setIsPlaying(false);
            } else if (e.data === YTns.PlayerState.ENDED) {
              setIsPlaying(false);
              onEnded?.();
            }
          },
          onError: () => {
            setReady(true);
          }
        },
      });
    }).catch(() => {
      if (!disposed) setReady(true);
    });

    return () => {
      disposed = true;
      try {
        playerRef.current?.destroy();
      } catch { /* noop */ }
      playerRef.current = null;
      if (containerRef.current) {
        containerRef.current.innerHTML = "";
      }
    };
  }, [cleanVideoId]);

  // 2. Playback state syncing from parent props (such as session quotas / completions)
  useEffect(() => {
    const p = playerRef.current;
    if (!p || !ready) return;
    try {
      if (paused) {
        p.pauseVideo();
        setIsPlaying(false);
      } else if (!activeQuestion) {
        p.playVideo();
        setIsPlaying(true);
      }
    } catch (e) {
      console.error("Failed to sync play state:", e);
    }
  }, [paused, ready, activeQuestion]);

  // 3. Local timer logic (advances currentSecond by 1s every second while playing)
  useEffect(() => {
    if (!isPlaying || activeQuestion) return;

    const interval = setInterval(() => {
      setCurrentSecond((s) => {
        const next = s + 1;
        // Cap timer to duration if loaded
        if (duration > 0 && next >= duration) {
          clearInterval(interval);
          return duration;
        }
        return next;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [isPlaying, activeQuestion, duration]);

  // 4. Report position changes directly to usePositionSaver
  useEffect(() => {
    if (currentSecond > 0) {
      onProgress?.(currentSecond);
    }
  }, [currentSecond, onProgress]);

  // 5. Question Triggers check
  useEffect(() => {
    // Look for a question matching the currentSecond timestamp
    const pending = questions.find((q) => {
      const isAnswered = answeredQuestionIds.has(q.id);
      if (isAnswered && !q.refireOnRewatch) return false;
      const qTime = q.triggerSecond ?? q.timestamp ?? 0;
      return !firedQuestionIds.has(q.id) && qTime === currentSecond;
    });

    if (pending) {
      setFiredQuestionIds((prev) => new Set([...prev, pending.id]));
      if (pending.mode === "pause" || pending.isRequired !== false) {
        try {
          playerRef.current?.pauseVideo();
        } catch { /* noop */ }
        setIsPlaying(false);
        setActiveQuestion(pending);
        onPauseChange?.(true); // Notify parent (pauses watch session countdown)
      } else {
        setActiveOverlayQuestion(pending);
      }
    }
  }, [currentSecond, questions, answeredQuestionIds, firedQuestionIds, onPauseChange]);

  // 6. Seek backwards resets fired question list for refireOnRewatch triggers
  const handleSeekReset = (seconds: number) => {
    setFiredQuestionIds((prev) => {
      const next = new Set(prev);
      questions.forEach((q) => {
        const qTime = q.triggerSecond ?? q.timestamp ?? 0;
        if (q.refireOnRewatch && qTime > seconds) {
          next.delete(q.id);
        }
      });
      return next;
    });
  };

  const handlePlayToggle = () => {
    if (activeQuestion) return;
    const p = playerRef.current;
    if (!p || !ready) return;
    if (isPlaying) {
      p.pauseVideo();
      setIsPlaying(false);
    } else {
      p.playVideo();
      setIsPlaying(true);
    }
  };

  const handleMuteToggle = () => {
    const p = playerRef.current;
    if (!p || !ready) return;
    if (p.isMuted()) {
      p.unMute();
      setMuted(false);
    } else {
      p.mute();
      setMuted(true);
    }
  };

  const handleScrubberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const p = playerRef.current;
    if (!p || !ready || !duration) return;
    const pct = Number(e.target.value);
    const targetSec = Math.round((pct / 100) * duration);
    
    // Seek protection: find any unanswered question before or at target
    const unanswered = questions.find((q) => {
      const qTime = q.triggerSecond ?? q.timestamp ?? 0;
      return targetSec > qTime + 1 && !answeredQuestionIds.has(q.id) && q.isRequired !== false;
    });

    if (unanswered) {
      const unTime = unanswered.triggerSecond ?? unanswered.timestamp ?? 0;
      p.seekTo(unTime, true);
      try {
        p.pauseVideo();
      } catch { /* noop */ }
      setIsPlaying(false);
      setActiveQuestion(unanswered);
      setCurrentSecond(unTime);
      onPauseChange?.(true);
      return;
    }

    // Jump instantly to seek point locally and update YT player
    p.seekTo(targetSec, true);
    handleSeekReset(targetSec);
    setCurrentSecond(targetSec);
  };

  const handleModalAnswered = (_res: { isCorrect: boolean; attempts: number }) => {
    if (activeQuestion) {
      onQuestionAnswered(activeQuestion.id);
    }
    setActiveQuestion(null);
    onPauseChange?.(false); // Resume countdown
    
    // Resume video playback
    const p = playerRef.current;
    if (p && ready) {
      p.playVideo();
      setIsPlaying(true);
    }
  };

  const handleOverlayAnswered = (_res: { isCorrect: boolean; attempts: number }) => {
    if (activeOverlayQuestion) {
      onQuestionAnswered(activeOverlayQuestion.id);
    }
    setActiveOverlayQuestion(null);
  };

  const handleOverlayDismiss = () => {
    setActiveOverlayQuestion(null);
  };

  const pct = duration ? Math.min(100, (currentSecond / duration) * 100) : 0;

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
      {/* 16:9 YouTube video viewport */}
      <div className="absolute inset-0 w-full h-full">
        <div ref={containerRef} className="w-full h-full" />
      </div>

      {/* Surface click shield: play/pause trigger */}
      <button
        type="button"
        onClick={handlePlayToggle}
        disabled={!!activeQuestion}
        aria-label={isPlaying ? "إيقاف مؤقت" : "تشغيل"}
        className="absolute inset-0 z-10 w-full h-full cursor-pointer bg-transparent"
      />

      {/* Floating Watermark */}
      <VideoWatermark label={watermark} />

      {/* Loader */}
      {!ready && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-black">
          <div className="w-9 h-9 rounded-full border-2 border-white/20 border-t-white/80 animate-spin" />
        </div>
      )}

      {/* Play hint overlay */}
      {ready && !isPlaying && !activeQuestion && (
        <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none">
          <span className="w-16 h-16 rounded-full bg-black/55 backdrop-blur-sm flex items-center justify-center">
            <svg className="w-7 h-7 text-white" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              <path d="M8 5v14l11-7z" />
            </svg>
          </span>
        </div>
      )}

      {/* ── Interventions ── */}
      {activeQuestion && (
        <VideoQuestionModal
          question={activeQuestion}
          videoId={videoId}
          currentSecond={currentSecond}
          onAnswered={handleModalAnswered}
        />
      )}

      {activeOverlayQuestion && (
        <VideoQuestionOverlay
          question={activeOverlayQuestion}
          videoId={videoId}
          currentSecond={currentSecond}
          onAnswered={handleOverlayAnswered}
          onDismiss={handleOverlayDismiss}
        />
      )}

      {/* Custom Control panel */}
      <div className="absolute inset-x-0 bottom-0 z-25 px-4 py-3 bg-gradient-to-t from-black/90 via-black/50 to-transparent flex items-center gap-3">
        <button
          type="button"
          onClick={handlePlayToggle}
          disabled={!!activeQuestion}
          aria-label={isPlaying ? "إيقاف مؤقت" : "تشغيل"}
          className="shrink-0 text-white hover:text-sky-300 transition-colors disabled:opacity-30"
        >
          {isPlaying ? (
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
          {formatTime(currentSecond)}
        </span>

        <input
          type="range"
          min={0}
          max={100}
          step={0.1}
          value={pct}
          onChange={handleScrubberChange}
          disabled={!!activeQuestion}
          aria-label="شريط التقدم"
          className="flex-1 h-1 accent-sky-400 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
          dir="ltr"
        />

        <span className="shrink-0 text-[11px] font-mono text-white/85 tabular-nums" dir="ltr">
          {formatTime(duration)}
        </span>

        <button
          type="button"
          onClick={handleMuteToggle}
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

        <button
          type="button"
          onClick={toggleFs}
          aria-label={isFs ? "إنهاء ملء الشاشة" : "ملء الشاشة"}
          className="shrink-0 text-white hover:text-sky-300 transition-colors"
        >
          {isFs ? (
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M8 3v3a2 2 0 01-2 2H3M21 8h-3a2 2 0 01-2-2V3M3 16h3a2 2 0 012 2v3M16 21v-3a2 2 0 012-2h3" />
            </svg>
          ) : (
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M8 3H5a2 2 0 00-2 2v3M21 8V5a2 2 0 00-2-2h-3M3 16v3a2 2 0 002 2h3M16 21h3a2 2 0 002-2v-3" />
            </svg>
          )}
        </button>
      </div>
    </div>
  );
}
