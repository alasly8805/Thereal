import { NextRequest, NextResponse } from "next/server";
import { getStudentSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkVideoAccess } from "@/lib/authorization";

/**
 * Resume-playback position for a (student, video) pair. Stored on Progress so it
 * survives the 4-hour watch-session boundary — see the schema note on Progress.
 *
 * GET  → { seconds, watched } the last saved position (0 if none).
 * POST → { seconds, deltaWatchedSeconds? } upserts the position and increments
 *        cumulative watchedSecondsTotal (server-side addition only, with an
 *        anti-cheat clamp against clock tampering).
 */

const MAX_POSITION = 24 * 60 * 60; // 24h cap — guards against bogus values

// In-memory rate-limit map: studentId:videoId → last ping timestamp.
// Cleared automatically when the server restarts; intentionally transient.
const lastPingMap = new Map<string, number>();

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const studentSession = await getStudentSession();
  if (!studentSession) {
    const { getSession } = await import("@/lib/auth");
    const generalSession = await getSession();
    if (generalSession && (generalSession.role === "teacher" || generalSession.role === "admin" || generalSession.role === "superadmin")) {
      return NextResponse.json({ seconds: 0, watched: false, preview: true });
    }
    return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
  }
  const session = studentSession;

  const { id: videoId } = await params;
  const hasAccess = await checkVideoAccess(session.id, session.role, videoId);
  if (!hasAccess) {
    return NextResponse.json({ error: "غير مصرح لك بالوصول لهذا الفيديو" }, { status: 403 });
  }

  const progress = await prisma.progress.findUnique({
    where: { studentId_videoId: { studentId: session.id, videoId } },
    select: { lastPositionSeconds: true, watched: true },
  });

  return NextResponse.json({
    seconds: progress?.lastPositionSeconds ?? 0,
    watched: progress?.watched ?? false,
  });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const studentSession = await getStudentSession();
  if (!studentSession) {
    const { getSession } = await import("@/lib/auth");
    const generalSession = await getSession();
    if (generalSession && (generalSession.role === "teacher" || generalSession.role === "admin" || generalSession.role === "superadmin")) {
      return NextResponse.json({ ok: true, preview: true });
    }
    return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
  }
  const session = studentSession;

  const { id: videoId } = await params;
  const hasAccess = await checkVideoAccess(session.id, session.role, videoId);
  if (!hasAccess) {
    return NextResponse.json({ error: "غير مصرح لك بالوصول لهذا الفيديو" }, { status: 403 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    seconds?: number;
    deltaWatchedSeconds?: number;
  };

  const raw = Number(body.seconds);
  if (!Number.isFinite(raw) || raw < 0) {
    return NextResponse.json({ error: "قيمة غير صالحة" }, { status: 400 });
  }
  const seconds = Math.min(Math.round(raw), MAX_POSITION);

  // Only persist for a video that actually exists (avoids orphan rows).
  const video = await prisma.video.findUnique({
    where: { id: videoId },
    select: { id: true, title: true, durationMinutes: true },
  });
  if (!video) return NextResponse.json({ error: "الفيديو غير موجود" }, { status: 404 });

  // ── Anti-cheat clamp for deltaWatchedSeconds ─────────────────────────────
  // The client sends how many seconds of video it claims to have played since
  // its last ping. We clamp this to wall-clock time × 1.1 (10% tolerance for
  // minor timing jitter). If no previous ping exists, we accept the delta as-is
  // up to a hard max of 10s (the server-side interval).
  let safeDelta = 0;
  const rawDelta = Number(body.deltaWatchedSeconds);
  if (Number.isFinite(rawDelta) && rawDelta > 0) {
    const key = `${session.id}:${videoId}`;
    const now = Date.now();
    let lastPing = lastPingMap.get(key) ?? 0;

    // If not in local process memory (e.g. request routed to a different cluster worker),
    // check the database positionUpdatedAt timestamp for this student/video pair.
    if (lastPing === 0) {
      const prevProgress = await prisma.progress.findUnique({
        where: { studentId_videoId: { studentId: session.id, videoId } },
        select: { positionUpdatedAt: true },
      });
      if (prevProgress?.positionUpdatedAt) {
        lastPing = new Date(prevProgress.positionUpdatedAt).getTime();
      }
    }

    if (lastPing > 0) {
      const wallClockSeconds = (now - lastPing) / 1000;
      safeDelta = Math.min(rawDelta, Math.max(0, wallClockSeconds * 1.1));
    } else {
      // First ping of this session — accept up to 10s (one interval)
      safeDelta = Math.min(rawDelta, 10);
    }
    safeDelta = Math.max(0, safeDelta);
    lastPingMap.set(key, now);

    // Prune stale entries every ~1000 writes to avoid unbounded growth
    if (lastPingMap.size > 10000) {
      const cutoff = now - 3600_000; // 1h stale
      for (const [k, v] of lastPingMap) {
        if (v < cutoff) lastPingMap.delete(k);
      }
    }
  }

  // ── Upsert ───────────────────────────────────────────────────────────────
  const progressRecord = await prisma.progress.upsert({
    where: { studentId_videoId: { studentId: session.id, videoId } },
    update: {
      lastPositionSeconds: seconds,
      positionUpdatedAt: new Date(),
      lastWatchedAt: new Date(),
      ...(safeDelta > 0 ? { watchedSecondsTotal: { increment: safeDelta } } : {}),
    },
    create: {
      studentId: session.id,
      videoId,
      lastPositionSeconds: seconds,
      positionUpdatedAt: new Date(),
      lastWatchedAt: new Date(),
      watchedSecondsTotal: safeDelta,
    },
    select: {
      id: true,
      watched: true,
      watchedSecondsTotal: true,
      lastPositionSeconds: true,
    },
  });

  let isNowWatched = progressRecord.watched;
  let justCompleted = false;

  // If not yet marked watched, check if student crossed the completion threshold
  if (!progressRecord.watched) {
    const { getConfigNumberClamped } = await import("@/lib/config");
    const thresholdPercent = await getConfigNumberClamped("mark_complete_threshold", 1, 100);
    const durationSeconds = (video.durationMinutes || 0) * 60;
    const requiredSeconds = durationSeconds > 0 ? (durationSeconds * thresholdPercent) / 100 : 0;

    const reachedThreshold =
      durationSeconds > 0
        ? seconds >= requiredSeconds || (progressRecord.watchedSecondsTotal || 0) >= requiredSeconds
        : seconds >= 30;

    if (reachedThreshold) {
      const completedAt = new Date();
      await prisma.progress.update({
        where: { id: progressRecord.id },
        data: { watched: true, watchedAt: completedAt },
      });
      isNowWatched = true;
      justCompleted = true;

      // Log in content prerequisite graph
      try {
        const { ContentType, recordContentCompleted } = await import("@/lib/content-access-engine");
        await recordContentCompleted(
          session.id,
          { type: ContentType.VIDEO, sourceId: videoId, title: video.title },
          { completedAt }
        );
      } catch (err) {
        console.error("[position route] recordContentCompleted error:", err);
      }

      // Sync watched state to duplicate/equivalent videos in other courses
      try {
        const { syncVideoWatchToRelatedCourses } = await import("@/lib/video-sync");
        await syncVideoWatchToRelatedCourses(session.id, videoId, {
          completedAt,
          lastPositionSeconds: seconds,
          watchedSecondsTotal: progressRecord.watchedSecondsTotal,
        });
      } catch (syncErr) {
        console.error("[position route] syncVideoWatchToRelatedCourses error:", syncErr);
      }

      // Track plan lesson progress (parity with the manual complete route)
      try {
        const { markPlanLessonsWatched } = await import("@/lib/plan-progress");
        await markPlanLessonsWatched(session.id, videoId);
      } catch (planErr) {
        console.error("[position route] markPlanLessonsWatched error:", planErr);
      }
    }
  }

  // justCompleted tells the client THIS ping flipped the video to watched, so
  // it can unlock the next chained content immediately (re-watches of an
  // already-watched video return watched:true without it).
  return NextResponse.json({ ok: true, seconds, watched: isNowWatched, justCompleted });
}
