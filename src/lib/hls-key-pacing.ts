import { CHUNK_SECONDS } from "./hls-package";

/**
 * Paces how fast one viewer may collect a lesson's chunk keys.
 *
 * Watching needs one key per CHUNK_SECONDS of lesson (two minutes), so even at
 * 2× speed that is one key a minute; seeking costs one more. A downloader
 * extension needs every key of the lesson immediately. A token bucket sits
 * between the two: a burst for start-up and a few seeks, then a refill well
 * above any real playback speed.
 *
 *   - Re-requesting a key this viewer already got is always free (hls.js
 *     refetches after seeking back; Safari after a stall).
 *   - A refused key costs nothing, and the response says when to retry.
 *   - Refusals spread over many *different* chunks are not a person seeking;
 *     the viewer is cut off and the attempt reported as a download.
 *   - A viewer who has pulled far more lesson than wall-clock time allows is
 *     reported once even if they stayed inside the bucket.
 *
 * State is per watch session and in memory. The app runs as a single PM2
 * process; a restart resets buckets, which only ever errs towards the viewer.
 */

const BURST = 6; // 12 minutes of lesson up front: start-up + a few seeks
const REFILL_MS = 30_000; // one key per 30 s ≈ 4× real time with 2-minute chunks
const REVOKE_AFTER_DISTINCT_DENIALS = 8;
const STATE_TTL_MS = 6 * 60 * 60 * 1000;
/** Lesson pulled vs wall-clock time before a sustained-speed report. */
const SUSPICIOUS_SPEEDUP = 3;
const SUSPICIOUS_MIN_ELAPSED_MS = 10 * 60 * 1000;

interface ViewerState {
  tokens: number;
  refilledAt: number;
  startedAt: number;
  touchedAt: number;
  granted: Set<number>;
  deniedChunks: Set<number>;
  revoked: boolean;
  reportedRateLimit: boolean;
  reportedSpeed: boolean;
}

export type KeyDecision =
  | { ok: true; report?: "SUSTAINED_SPEED" }
  | { ok: false; retryAfterSec: number; report?: "KEY_RATE_LIMIT" }
  | { ok: false; revoked: true; report?: "VIDEO_DOWNLOAD" };

const viewers = new Map<string, ViewerState>();

function prune(now: number) {
  if (viewers.size < 5000) return;
  viewers.forEach((v, k) => {
    if (now - v.touchedAt > STATE_TTL_MS) viewers.delete(k);
  });
}

export function decideKey(viewerKey: string, chunk: number, now = Date.now()): KeyDecision {
  prune(now);
  let v = viewers.get(viewerKey);
  if (!v) {
    v = {
      tokens: BURST,
      refilledAt: now,
      startedAt: now,
      touchedAt: now,
      granted: new Set(),
      deniedChunks: new Set(),
      revoked: false,
      reportedRateLimit: false,
      reportedSpeed: false,
    };
    viewers.set(viewerKey, v);
  }
  v.touchedAt = now;
  if (v.revoked) return { ok: false, revoked: true };
  if (v.granted.has(chunk)) return { ok: true };

  v.tokens = Math.min(BURST, v.tokens + (now - v.refilledAt) / REFILL_MS);
  v.refilledAt = now;

  if (v.tokens >= 1) {
    v.tokens -= 1;
    v.granted.add(chunk);
    const elapsed = now - v.startedAt;
    const pulledMs = v.granted.size * CHUNK_SECONDS * 1000;
    if (
      !v.reportedSpeed &&
      elapsed >= SUSPICIOUS_MIN_ELAPSED_MS &&
      pulledMs > elapsed * SUSPICIOUS_SPEEDUP + BURST * CHUNK_SECONDS * 1000
    ) {
      v.reportedSpeed = true;
      return { ok: true, report: "SUSTAINED_SPEED" };
    }
    return { ok: true };
  }

  v.deniedChunks.add(chunk);
  if (v.deniedChunks.size >= REVOKE_AFTER_DISTINCT_DENIALS) {
    v.revoked = true;
    return { ok: false, revoked: true, report: "VIDEO_DOWNLOAD" };
  }
  const retryAfterSec = Math.ceil(((1 - v.tokens) * REFILL_MS) / 1000);
  if (!v.reportedRateLimit) {
    v.reportedRateLimit = true;
    return { ok: false, retryAfterSec, report: "KEY_RATE_LIMIT" };
  }
  return { ok: false, retryAfterSec };
}

/** Ends pacing for a viewer outright (watch session revoked elsewhere). */
export function isRevoked(viewerKey: string): boolean {
  return viewers.get(viewerKey)?.revoked === true;
}
