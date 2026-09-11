import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSupportSession, logSupportAction } from "@/lib/support-auth";
import { ContentType, recordContentCompleted } from "@/lib/content-access-engine";

/**
 * POST /api/support/mark-watched
 * Body: { studentId, videoId, reason? }
 *
 * Marks a lesson as watched for a student who never actually watched it — the
 * fix for "I watched it on another device / the teacher exempted me / the
 * counter glitched" tickets where the next item stays locked.
 *
 * Writes exactly what the real completion path writes (Progress.watched +
 * the generic progress graph + duplicate-course sync + plan progress), minus
 * the anti-cheat gates: no active watch session and no 80%-watched threshold,
 * because by definition the student did not watch. No VideoWatchSession row is
 * created, so this never consumes one of the student's paid watch slots.
 */
export async function POST(req: NextRequest) {
  const support = await getSupportSession();
  if (!support) return NextResponse.json({ error: "غير مصرح" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as {
    studentId?: string;
    videoId?: string;
    reason?: string;
  };

  const studentId = String(body.studentId || "").trim();
  const videoId = String(body.videoId || "").trim();
  const reason = String(body.reason || "").trim().slice(0, 500);

  if (!studentId || !videoId) {
    return NextResponse.json({ error: "معرّف الطالب والفيديو مطلوبان" }, { status: 400 });
  }

  const [student, video] = await Promise.all([
    prisma.user.findFirst({
      where: { id: studentId, role: "student", isDeleted: false },
      select: { id: true, name: true },
    }),
    prisma.video.findUnique({ where: { id: videoId }, select: { id: true, title: true } }),
  ]);

  if (!student) return NextResponse.json({ error: "الطالب غير موجود" }, { status: 404 });
  if (!video) return NextResponse.json({ error: "الفيديو غير موجود" }, { status: 404 });

  const existing = await prisma.progress.findUnique({
    where: { studentId_videoId: { studentId, videoId } },
    select: { watched: true, watchedAt: true },
  });
  if (existing?.watched) {
    return NextResponse.json({
      ok: true,
      alreadyWatched: true,
      watchedAt: existing.watchedAt,
      message: "الدرس مسجَّل كمشاهَد لهذا الطالب بالفعل",
    });
  }

  const completedAt = new Date();
  try {
    // Same two writes as /api/videos/[id]/complete, atomically.
    await prisma.$transaction(async (tx) => {
      await tx.progress.upsert({
        where: { studentId_videoId: { studentId, videoId } },
        create: { studentId, videoId, watched: true, watchedAt: completedAt },
        update: { watched: true, watchedAt: completedAt },
      });
      await recordContentCompleted(
        studentId,
        { type: ContentType.VIDEO, sourceId: videoId, title: video.title },
        { completedAt },
        tx
      );
    });

    // Best-effort mirrors of the real completion path — a failure here must
    // not roll back the completion itself.
    try {
      const { syncVideoWatchToRelatedCourses } = await import("@/lib/video-sync");
      await syncVideoWatchToRelatedCourses(studentId, videoId, { completedAt });
    } catch (syncErr) {
      console.error("[support mark-watched] sync error:", syncErr);
    }
    try {
      const { markPlanLessonsWatched } = await import("@/lib/plan-progress");
      await markPlanLessonsWatched(studentId, videoId);
    } catch (planErr) {
      console.error("[support mark-watched] plan progress error:", planErr);
    }

    await logSupportAction({
      action: "SUPPORT_MARK_WATCHED",
      targetType: "student",
      targetId: studentId,
      targetName: `${student.name} — ${video.title}`,
      metadata: { agent: support.agent, videoId, reason: reason || null },
    });

    return NextResponse.json({ ok: true, watchedAt: completedAt });
  } catch (err) {
    console.error("support mark-watched failed:", err);
    return NextResponse.json({ error: "تعذر تسجيل المشاهدة" }, { status: 500 });
  }
}
