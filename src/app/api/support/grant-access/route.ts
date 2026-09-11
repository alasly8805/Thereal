import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ContentType } from "@/generated/prisma";
import { getSupportSession, logSupportAction } from "@/lib/support-auth";
import { getWatchAllowance } from "@/lib/watch-allowance";

/** Same ceiling as /api/support/views. */
const MAX_GRANT = 50;

/**
 * POST /api/support/grant-access
 * Body: { studentId, videoId, extraViews?, reason? }
 *
 * Opens ONE video for ONE student completely — the fix for "add this lesson to
 * my account" tickets. Three independent gates stand between a student and
 * playback, and this opens all three in one action:
 *
 *   1. Ownership  — a zero-price VideoPurchase row, so checkVideoAccess()
 *      passes without touching enrollment, codes or money.
 *   2. Prerequisite graph — a ContentAccessOverride, so a closed homework or
 *      unwatched earlier lesson can't block this video.
 *   3. Watch quota — an approved VideoViewRequest (only when extraViews ≥ 1),
 *      so the student has fresh views on top of the base allowance.
 *
 * Every row is per-student and per-video, and each is individually revocable
 * (purchase row deleted, override revoked, grant rejected), so a mistake can
 * be undone without touching anyone else.
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
  const reason = String(body.reason || "").trim().slice(0, 500);
  const extraViews = body.extraViews === undefined || body.extraViews === null ? 0 : Number(body.extraViews);

  if (!studentId || !videoId) {
    return NextResponse.json({ error: "معرّف الطالب والفيديو مطلوبان" }, { status: 400 });
  }
  if (!Number.isInteger(extraViews) || extraViews < 0 || extraViews > MAX_GRANT) {
    return NextResponse.json(
      { error: `عدد المشاهدات الإضافية يجب أن يكون رقمًا صحيحًا بين 0 و ${MAX_GRANT}` },
      { status: 400 }
    );
  }

  const [student, video] = await Promise.all([
    prisma.user.findFirst({
      where: { id: studentId, role: "student", isDeleted: false },
      select: { id: true, name: true },
    }),
    prisma.video.findUnique({
      where: { id: videoId },
      select: { id: true, title: true, maxWatchesPerUser: true },
    }),
  ]);

  if (!student) return NextResponse.json({ error: "الطالب غير موجود" }, { status: 404 });
  if (!video) return NextResponse.json({ error: "الفيديو غير موجود" }, { status: 404 });

  try {
    // 1. Ownership: zero-price purchase row. Upsert so re-running is idempotent
    // and a real paid row is never overwritten (price stays whatever it was).
    await prisma.videoPurchase.upsert({
      where: { studentId_videoId: { studentId, videoId } },
      create: { studentId, videoId, price: 0 },
      update: {},
    });

    // 2. Prerequisite gate: same override shape /api/support/unlock writes,
    // including reviving a previously revoked row.
    await prisma.contentAccessOverride.upsert({
      where: {
        studentId_contentType_sourceId: {
          studentId,
          contentType: ContentType.VIDEO,
          sourceId: videoId,
        },
      },
      create: {
        studentId,
        contentType: ContentType.VIDEO,
        sourceId: videoId,
        reason: reason || "وصول كامل من الدعم الفني",
        grantedById: "support-panel",
        grantedByName: `دعم فني (${support.agent})`,
      },
      update: {
        reason: reason || "وصول كامل من الدعم الفني",
        grantedByName: `دعم فني (${support.agent})`,
        revokedAt: null,
        revokedByName: null,
      },
    });

    // 3. Watch quota (optional): identical to /api/support/views — resolve a
    // pending student request in the same breath if one exists.
    if (extraViews >= 1) {
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
    }

    const allowance = await getWatchAllowance(prisma, studentId, videoId, video.maxWatchesPerUser);
    const used = await prisma.videoWatchSession.count({
      where: { studentId, videoId, usedWatchSlot: true },
    });

    await logSupportAction({
      action: "SUPPORT_GRANT_VIDEO_ACCESS",
      targetType: "student",
      targetId: studentId,
      targetName: `${student.name} — ${video.title}`,
      metadata: {
        agent: support.agent,
        videoId,
        extraViews,
        reason: reason || null,
      },
    });

    return NextResponse.json({
      ok: true,
      allowance,
      used,
      remaining: Math.max(0, allowance - used),
    });
  } catch (err) {
    console.error("support grant-access failed:", err);
    return NextResponse.json({ error: "تعذر فتح الدرس" }, { status: 500 });
  }
}

/**
 * DELETE /api/support/grant-access?studentId=...&videoId=...
 * Takes the ownership row back (and revokes the override). View grants are
 * left alone — the student may already have spent them.
 */
export async function DELETE(req: NextRequest) {
  const support = await getSupportSession();
  if (!support) return NextResponse.json({ error: "غير مصرح" }, { status: 401 });

  const studentId = req.nextUrl.searchParams.get("studentId")?.trim() ?? "";
  const videoId = req.nextUrl.searchParams.get("videoId")?.trim() ?? "";
  if (!studentId || !videoId) {
    return NextResponse.json({ error: "معرّف الطالب والفيديو مطلوبان" }, { status: 400 });
  }

  await prisma.videoPurchase.deleteMany({ where: { studentId, videoId } });
  await prisma.contentAccessOverride.updateMany({
    where: { studentId, contentType: ContentType.VIDEO, sourceId: videoId, revokedAt: null },
    data: { revokedAt: new Date(), revokedByName: `دعم فني (${support.agent})` },
  });

  await logSupportAction({
    action: "SUPPORT_REVOKE_VIDEO_ACCESS",
    targetType: "student",
    targetId: studentId,
    targetName: videoId,
    metadata: { agent: support.agent, videoId },
  });

  return NextResponse.json({ ok: true });
}
