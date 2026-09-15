"use client";

import { useEffect, useRef } from "react";

/**
 * Playback health detector for the student's lesson player.
 *
 * Two faults students report cannot be seen from the server, because both are
 * conditions of the browser tab rather than of the stream:
 *
 *  - "two voices, one slower than the other" — more than one media element is
 *    audible at the same time, at different positions. A <video> that is
 *    removed from the DOM, or merely hidden with CSS, keeps playing its audio,
 *    so an orphaned element talks over the live one from wherever it had got
 *    to. The gap between their positions is the echo the student hears.
 *  - "the player lags" — the tab spends a large share of wall time rebuffering.
 *
 * This measures both and reports them, so the fix can be aimed at whichever
 * actually fires in the field instead of at a guess.
 */

const SAMPLE_MS = 2000;
/** One report per kind per window; a broken tab would otherwise report forever. */
const REPORT_COOLDOWN_MS = 60_000;
/** Fraction of wall time spent rebuffering before playback counts as "lagging". */
const STALL_RATIO = 0.25;

interface Connectionish {
  effectiveType?: string;
  downlink?: number;
}

function connectionInfo(): { effectiveType?: string; downlinkMbps?: number } {
  if (typeof navigator === "undefined") return {};
  const conn = (navigator as Navigator & { connection?: Connectionish }).connection;
  if (!conn) return {};
  return { effectiveType: conn.effectiveType, downlinkMbps: conn.downlink };
}

/** Elements actually making sound right now. Muted or silent ones cannot echo. */
function audibleMedia(): HTMLMediaElement[] {
  if (typeof document === "undefined") return [];
  const all = Array.from(document.querySelectorAll<HTMLMediaElement>("video, audio"));
  return all.filter((m) => !m.paused && !m.ended && !m.muted && m.volume > 0 && m.readyState >= 2);
}

export interface DiagnosticReport {
  kind: "DOUBLE_AUDIO" | "STALL";
  playingCount: number;
  timeDeltaMs?: number;
  stalledMs?: number;
  effectiveType?: string;
  downlinkMbps?: number;
  detail?: string;
}

export function usePlaybackDiagnostics(videoId: string | undefined, enabled = true) {
  const lastReportRef = useRef<Record<string, number>>({});
  const stalledMsRef = useRef(0);
  const stallStartedRef = useRef<number | null>(null);
  const windowStartRef = useRef(Date.now());

  useEffect(() => {
    if (!enabled || !videoId || typeof window === "undefined") return;

    const report = (r: DiagnosticReport) => {
      const now = Date.now();
      const last = lastReportRef.current[r.kind] || 0;
      if (now - last < REPORT_COOLDOWN_MS) return;
      lastReportRef.current[r.kind] = now;

      // console first: this is the signal a support agent can read over the
      // phone with a student before any of it reaches the database.
      console.warn(`[playback-diagnostics] ${r.kind}`, r);

      fetch(`/api/videos/${videoId}/diagnostics`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(r),
        keepalive: true,
      }).catch(() => {
        // diagnostics must never break playback
      });
    };

    // ── Rebuffer accounting ────────────────────────────────────────────────
    const onWaiting = () => {
      if (stallStartedRef.current === null) stallStartedRef.current = Date.now();
    };
    const onResume = () => {
      if (stallStartedRef.current !== null) {
        stalledMsRef.current += Date.now() - stallStartedRef.current;
        stallStartedRef.current = null;
      }
    };
    document.addEventListener("waiting", onWaiting, true);
    document.addEventListener("playing", onResume, true);
    document.addEventListener("canplay", onResume, true);

    const timer = window.setInterval(() => {
      const media = audibleMedia();
      const conn = connectionInfo();

      // ── Fault 1: more than one voice ─────────────────────────────────────
      if (media.length > 1) {
        const times = media.map((m) => m.currentTime);
        const deltaMs = Math.round((Math.max(...times) - Math.min(...times)) * 1000);
        report({
          kind: "DOUBLE_AUDIO",
          playingCount: media.length,
          timeDeltaMs: deltaMs,
          ...conn,
          detail: JSON.stringify(
            media.map((m) => ({
              tag: m.tagName,
              t: Number(m.currentTime.toFixed(2)),
              inDom: m.isConnected,
              visible: m.isConnected && !!(m as HTMLElement).offsetParent,
              src: (m.currentSrc || m.src || "").slice(-90),
            }))
          ).slice(0, 1500),
        });
      }

      // ── Fault 2: lagging ─────────────────────────────────────────────────
      const elapsed = Date.now() - windowStartRef.current;
      const stalledNow =
        stalledMsRef.current + (stallStartedRef.current ? Date.now() - stallStartedRef.current : 0);
      if (elapsed >= 60_000) {
        if (media.length > 0 && stalledNow / elapsed >= STALL_RATIO) {
          report({
            kind: "STALL",
            playingCount: media.length,
            stalledMs: Math.round(stalledNow),
            ...conn,
            detail: `stalled ${Math.round(stalledNow / 1000)}s of ${Math.round(elapsed / 1000)}s`,
          });
        }
        windowStartRef.current = Date.now();
        stalledMsRef.current = 0;
      }
    }, SAMPLE_MS);

    return () => {
      window.clearInterval(timer);
      document.removeEventListener("waiting", onWaiting, true);
      document.removeEventListener("playing", onResume, true);
      document.removeEventListener("canplay", onResume, true);
    };
  }, [videoId, enabled]);
}
