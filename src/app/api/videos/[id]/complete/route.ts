import { NextRequest, NextResponse } from "next/server";
import { getStudentSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { blockSupportView } from "@/lib/support-auth";
import {
  canAccessContent,
  ContentType,
  recordContentCompleted,
} from "@/lib/content-access-engine";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getStudentSession();
  // Defence in depth behind the proxy guard: never let a support agent act as
  // the student on grades, progress or money.
  const supportBlocked = blockSupportView(session);
  if (supportBlocked) return supportBlocked;
  if (!session) return NextResponse.json({ error: "غير مصرح" }, { status: 401 });

  const { id: videoId } = await params;

  const video = await prisma.video.findUnique({
    where: { id: videoId },
    select: { title: true, durationMinutes: true, isFree: true }
  });
  if (!video) return NextResponse.json({ error: "الفيديو غير موجود" }, { status: 404 });

  const access = await canAccessContent(session.id, {
    type: ContentType.VIDEO,
    sourceId: videoId,
    title: video.title,
  });
  if ("requiredItem" in access) {
    return NextResponse.json(
      {
        error: `يجب إكمال «${access.requiredItem.title}» أولًا.`,
        code: access.code,
        requiredItem: access.requiredItem,
      },
      { status: 403 }
    );
  }

  if (!video.isFree) {
    const watchSession = await prisma.videoWatchSession.findFirst({
      where: { videoId, studentId: session.id, endedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { startedAt: "desc" },
    });
    if (!watchSession) {
      return NextResponse.json({ error: "لا توجد جلسة مشاهدة نشطة لهذا الفيديو" }, { status: 403 });
    }

    const progress = await prisma.progress.findUnique({
      where: { studentId_videoId: { studentId: session.id, videoId } },
      select: { watchedSecondsTotal: true }
    });

    // Same superadmin-configurable threshold the auto-complete path uses
    // (position route) — was hardcoded to 80% and drifted out of sync.
    const { getConfigNumberClamped } = await import("@/lib/config");
    const thresholdPercent = await getConfigNumberClamped("mark_complete_threshold", 1, 100);
    const requiredSeconds = (video.durationMinutes * 60) * (thresholdPercent / 100);
    if ((progress?.watchedSecondsTotal ?? 0) < requiredSeconds) {
      return NextResponse.json(
        { error: `يجب مشاهدة ${thresholdPercent}% من الفيديو على الأقل لإكماله` },
        { status: 400 }
      );
    }
    if (watchSession) {
      const { releaseViewerBandwidth } = await import("@/lib/vdocipher-accounts");
      await releaseViewerBandwidth(watchSession.sessionToken, { completed: true }).catch(() => {});
    }
  }

  const completedAt = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.progress.upsert({
      where: { studentId_videoId: { studentId: session.id, videoId } },
      create: { studentId: session.id, videoId, watched: true, watchedAt: completedAt },
      update: { watched: true, watchedAt: completedAt },
    });
    await recordContentCompleted(
      session.id,
      { type: ContentType.VIDEO, sourceId: videoId, title: video.title },
      { completedAt },
      tx
    );
  });

  // Sync watch status to duplicate/equivalent videos across other courses
  try {
    const { syncVideoWatchToRelatedCourses } = await import("@/lib/video-sync");
    await syncVideoWatchToRelatedCourses(session.id, videoId, { completedAt });
  } catch (syncErr) {
    console.error("[video complete] sync error:", syncErr);
  }

  // Track plan lesson progress
  try {
    const { markPlanLessonsWatched } = await import("@/lib/plan-progress");
    await markPlanLessonsWatched(session.id, videoId);
  } catch (planErr) {
    console.error("[video complete] plan progress error:", planErr);
  }

  return NextResponse.json({ success: true });
}
