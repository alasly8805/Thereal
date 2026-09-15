import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSupportSession, logSupportAction } from "@/lib/support-auth";
import { getGrantedViews } from "@/lib/watch-allowance";

/**
 * Ceiling on one grant. Deliberately generous compared with the teacher queue's
 * limit of 20, because support handles the cases a teacher already refused or
 * never saw — but still bounded, so a mistyped "500" cannot silently turn a
 * paid lesson into an unlimited one.
 */
const MAX_GRANT = 50;

/**
 * POST /api/support/views
 * Body: { studentId, videoId, extraViews, reason? }
 *
 * Grants extra views WITHOUT the student having to ask first. It writes the
 * same pre-approved VideoViewRequest row the teacher queue writes, which is why
 * it needs no change to playback: getWatchAllowance() already sums approved
 * grants for the student/video pair.
 *
 * Grants stack rather than replace. Support running this twice gives the
 * student both grants — which is the intent, since each ticket is a separate
 * decision.
 */
export async function POST(req: NextRequest) {
  const support = await getSupportSession();
  if (!support) return NextResponse.json({ error: "غير مصرح" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as {
    studentId?: string;
    videoId?: string;
    extraViews?: number;
    reason?: string;
  };

  const studentId = String(body.studentId || "").trim();
  const videoId = String(body.videoId || "").trim();
  const extraViews = Number(body.extraViews);
  const reason = String(body.reason || "").trim().slice(0, 500);

  if (!studentId || !videoId) {
    return NextResponse.json({ error: "معرّف الطالب والفيديو مطلوبان" }, { status: 400 });
  }
  if (!Number.isInteger(extraViews) || extraViews < 1 || extraViews > MAX_GRANT) {
    return NextResponse.json(
      { error: `عدد المشاهدات الإضافية يجب أن يكون رقمًا صحيحًا بين 1 و ${MAX_GRANT}` },
      { status: 400 }
    );
  }

  const [student, video] = await Promise.all([
    prisma.user.findFirst({
      where: { id: studentId, role: "student", isDeleted: false },
      select: { id: true, name: true, phone: true },
    }),
    prisma.video.findUnique({
      where: { id: videoId },
      select: { id: true, title: true, maxWatchesPerUser: true },
    }),
  ]);

  if (!student) return NextResponse.json({ error: "الطالب غير موجود" }, { status: 404 });
  if (!video) return NextResponse.json({ error: "الفيديو غير موجود" }, { status: 404 });

  try {
    // A pending row from the student blocks a second insert (partial unique
    // index on status='pending'), so resolve it in the same breath: the student
    // asked, and support is answering yes.
    const pending = await prisma.videoViewRequest.findFirst({
      where: { studentId, videoId, status: "pending" },
      select: { id: true },
    });

    if (pending) {
      await prisma.videoViewRequest.update({
        where: { id: pending.id },
        data: {
          status: "approved",
          grantedViews: extraViews,
          teacherNotes: reason || "مُنحت من لوحة الدعم الفني",
          reviewedAt: new Date(),
        },
      });
    } else {
      await prisma.videoViewRequest.create({
        data: {
          studentId,
          videoId,
          status: "approved",
          grantedViews: extraViews,
          reason: reason || "منحة مباشرة من الدعم الفني (بدون طلب من الطالب)",
          teacherNotes: "مُنحت من لوحة الدعم الفني",
          reviewedAt: new Date(),
        },
      });
    }

    const [totalGranted, used] = await Promise.all([
      getGrantedViews(prisma, studentId, videoId),
      prisma.videoWatchSession.count({ where: { studentId, videoId, usedWatchSlot: true } }),
    ]);

    await logSupportAction({
      action: "SUPPORT_GRANT_EXTRA_VIEWS",
      targetType: "student",
      targetId: studentId,
      targetName: `${student.name} — ${video.title}`,
      metadata: {
        agent: support.agent,
        videoId,
        extraViews,
        resolvedPendingRequest: Boolean(pending),
        reason: reason || null,
        totalGrantedAfter: totalGranted,
      },
    });

    const allowance = video.maxWatchesPerUser + totalGranted;
    return NextResponse.json({
      ok: true,
      grantedViews: extraViews,
      totalGranted,
      allowance,
      used,
      remaining: Math.max(0, allowance - used),
    });
  } catch (err) {
    console.error("support grant views failed:", err);
    return NextResponse.json({ error: "تعذر منح المشاهدات" }, { status: 500 });
  }
}
