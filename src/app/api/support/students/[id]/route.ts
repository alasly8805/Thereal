import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSupportSession } from "@/lib/support-auth";
import { ContentType } from "@/generated/prisma";

/**
 * GET /api/support/students/[id]
 *
 * Everything the agent needs to answer the two questions that actually arrive
 * on a ticket: "my views ran out" and "it says the homework ended and I can't
 * open the next lesson".
 *
 * Videos are ranked exhausted-first so the lesson the student is complaining
 * about is at the top of the list rather than buried in their history.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const support = await getSupportSession();
  if (!support) return NextResponse.json({ error: "غير مصرح" }, { status: 401 });

  const { id: studentId } = await params;

  const student = await prisma.user.findFirst({
    where: { id: studentId, role: "student", isDeleted: false },
    select: {
      id: true,
      name: true,
      phone: true,
      parentPhone: true,
      email: true,
      isActive: true,
      balance: true,
      educationalStage: true,
      lastLoginAt: true,
      createdAt: true,
      accountMode: true,
      failedLoginAttempts: true,
      lockedUntil: true,
      isVerified: true,
    },
  });

  if (!student) return NextResponse.json({ error: "الطالب غير موجود" }, { status: 404 });

  // Videos this student has actually consumed watches on.
  const usage = await prisma.videoWatchSession.groupBy({
    by: ["videoId"],
    where: { studentId, usedWatchSlot: true },
    _count: { videoId: true },
  });
  const videoIds = usage.map((u) => u.videoId);
  const usedByVideo = new Map<string, number>(
    usage.map((u) => [u.videoId, u._count.videoId] as const)
  );

  const [videos, grants, overrides, submissions] = await Promise.all([
    videoIds.length
      ? prisma.video.findMany({
          where: { id: { in: videoIds } },
          select: {
            id: true,
            title: true,
            maxWatchesPerUser: true,
            folder: {
              select: { name: true, course: { select: { id: true, title: true } } },
            },
          },
        })
      : [],
    videoIds.length
      ? prisma.videoViewRequest.groupBy({
          by: ["videoId"],
          where: { studentId, videoId: { in: videoIds }, status: "approved" },
          _sum: { grantedViews: true },
        })
      : [],
    prisma.contentAccessOverride.findMany({
      where: { studentId, revokedAt: null },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    // Open homework the student has not submitted — the usual cause of a
    // "homework ended, next lesson won't open" complaint.
    prisma.homeworkSubmission.findMany({
      where: { studentId },
      select: { homeworkId: true, status: true, score: true },
    }),
  ]);

  const grantedByVideo = new Map<string, number>(
    grants.map((g) => [g.videoId, g._sum.grantedViews ?? 0] as const)
  );

  const videoRows = videos
    .map((v) => {
      const used = usedByVideo.get(v.id) ?? 0;
      const granted = grantedByVideo.get(v.id) ?? 0;
      const allowance = v.maxWatchesPerUser + granted;
      return {
        id: v.id,
        title: v.title,
        folderName: v.folder?.name ?? "",
        courseId: v.folder?.course?.id ?? "",
        courseTitle: v.folder?.course?.title ?? "",
        baseWatches: v.maxWatchesPerUser,
        grantedViews: granted,
        allowance,
        used,
        remaining: Math.max(0, allowance - used),
        exhausted: used >= allowance,
      };
    })
    .sort((a, b) => Number(b.exhausted) - Number(a.exhausted) || a.remaining - b.remaining);

  const submittedHomeworkIds = new Set(submissions.map((s) => s.homeworkId));

  // Homework attached to courses this student has watched from, so the agent
  // sees the specific item that is blocking them.
  const courseIds = [...new Set(videoRows.map((v) => v.courseId).filter(Boolean))];
  const homework = courseIds.length
    ? await prisma.homework.findMany({
        where: {
          isPublished: true,
          OR: [{ courseId: { in: courseIds } }, { folder: { courseId: { in: courseIds } } }],
        },
        select: { id: true, title: true, dueAt: true, videoId: true, courseId: true },
        orderBy: { createdAt: "desc" },
        take: 60,
      })
    : [];

  const homeworkRows = homework.map((h) => ({
    id: h.id,
    title: h.title,
    dueAt: h.dueAt,
    videoId: h.videoId,
    submitted: submittedHomeworkIds.has(h.id),
    overdue: h.dueAt ? new Date() > h.dueAt : false,
  }));

  // ── Account context: what the student owns, where they're signed in, and
  // what has already been done to this account ─────────────────────────────
  const [enrollments, termCodes, devices, wallet, activity, videoPurchases, folderPurchases, quizResults, homeworkSubs] = await Promise.all([
    prisma.courseEnrollment.findMany({
      where: { studentId },
      select: {
        id: true,
        fulfillmentSource: true,
        amountPaid: true,
        createdAt: true,
        course: { select: { id: true, title: true, teacher: { select: { name: true } } } },
      },
      orderBy: { createdAt: "desc" },
      take: 30,
    }),
    prisma.accessCode.findMany({
      where: {
        studentId,
        isActive: true,
        OR: [{ accessType: "TERM" }, { accessType: "COURSE" }, { folderId: null, videoId: null }],
      },
      select: {
        id: true,
        code: true,
        createdAt: true,
        course: { select: { id: true, title: true, teacher: { select: { name: true } } } },
      },
      orderBy: { createdAt: "desc" },
      take: 30,
    }),
    prisma.device.findMany({
      where: { userId: studentId },
      select: { id: true, label: true, userAgent: true, lastSeenAt: true },
      orderBy: { lastSeenAt: "desc" },
      take: 10,
    }),
    prisma.balanceTransaction.findMany({
      where: { userId: studentId },
      select: { id: true, type: true, amount: true, note: true, createdAt: true },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
    prisma.activityLog.findMany({
      where: { targetId: studentId },
      select: { id: true, adminName: true, action: true, targetName: true, createdAt: true },
      orderBy: { createdAt: "desc" },
      take: 15,
    }),
    // "I paid — where is my stuff?" tickets: every item-level purchase with
    // what it cost, so the agent can reconcile against the wallet history.
    prisma.videoPurchase.findMany({
      where: { studentId },
      select: {
        id: true,
        price: true,
        createdAt: true,
        video: { select: { title: true, folder: { select: { name: true, course: { select: { title: true } } } } } },
      },
      orderBy: { createdAt: "desc" },
      take: 30,
    }),
    prisma.folderPurchase.findMany({
      where: { studentId },
      select: {
        id: true,
        price: true,
        createdAt: true,
        folder: { select: { name: true, course: { select: { title: true } } } },
      },
      orderBy: { createdAt: "desc" },
      take: 30,
    }),
    // "What did I score?" tickets: completed quiz attempts and homework
    // submissions, newest first. In-progress quiz rows (completedAt null) are
    // excluded — they are not grades yet.
    prisma.quizResult.findMany({
      where: { studentId, completedAt: { not: null } },
      select: {
        id: true,
        score: true,
        totalQ: true,
        completedAt: true,
        quiz: { select: { title: true } },
      },
      orderBy: { completedAt: "desc" },
      take: 20,
    }),
    prisma.homeworkSubmission.findMany({
      where: { studentId },
      select: {
        id: true,
        status: true,
        score: true,
        totalQ: true,
        completedAt: true,
        homework: { select: { title: true } },
      },
      orderBy: { completedAt: "desc" },
      take: 20,
    }),
  ]);

  // Merge the two enrollment shapes, keyed by course so a course granted via
  // both rows shows once.
  const courseMap = new Map<string, {
    courseId: string;
    title: string;
    teacherName: string;
    source: string;
    since: Date;
    supportGranted: boolean;
  }>();
  for (const e of enrollments) {
    courseMap.set(e.course.id, {
      courseId: e.course.id,
      title: e.course.title,
      teacherName: e.course.teacher?.name ?? "",
      source: e.fulfillmentSource,
      since: e.createdAt,
      supportGranted: e.fulfillmentSource === "SUPPORT" && e.amountPaid === 0,
    });
  }
  for (const c of termCodes) {
    if (!courseMap.has(c.course.id)) {
      courseMap.set(c.course.id, {
        courseId: c.course.id,
        title: c.course.title,
        teacherName: c.course.teacher?.name ?? "",
        source: c.code.startsWith("SUP-") ? "SUPPORT" : c.code.startsWith("PAY-") ? "PURCHASE" : "CODE",
        since: c.createdAt,
        supportGranted: c.code.startsWith("SUP-"),
      });
    }
  }
  const courses = [...courseMap.values()].sort((a, b) => +b.since - +a.since);

  const purchases = [
    ...videoPurchases.map((p) => ({
      id: `v:${p.id}`,
      kind: "video" as const,
      title: p.video.title,
      context: [p.video.folder?.course?.title, p.video.folder?.name].filter(Boolean).join(" — "),
      price: p.price,
      createdAt: p.createdAt,
    })),
    ...folderPurchases.map((p) => ({
      id: `f:${p.id}`,
      kind: "folder" as const,
      title: p.folder.name,
      context: p.folder.course?.title ?? "",
      price: p.price,
      createdAt: p.createdAt,
    })),
  ]
    .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))
    .slice(0, 30);

  const grades = [
    ...quizResults.map((r) => ({
      id: `q:${r.id}`,
      kind: "quiz" as const,
      title: r.quiz.title,
      status: "completed" as const,
      score: r.score,
      totalQ: r.totalQ,
      at: r.completedAt,
    })),
    ...homeworkSubs.map((s) => ({
      id: `h:${s.id}`,
      kind: "homework" as const,
      title: s.homework.title,
      status: s.status,
      score: s.score,
      totalQ: s.totalQ,
      at: s.completedAt,
    })),
  ]
    .sort((a, b) => +new Date(b.at ?? 0) - +new Date(a.at ?? 0))
    .slice(0, 30);

  return NextResponse.json({
    student,
    videos: videoRows,
    homework: homeworkRows,
    overrides: overrides.map((o) => ({
      id: o.id,
      contentType: o.contentType,
      sourceId: o.sourceId,
      reason: o.reason,
      grantedByName: o.grantedByName,
      expiresAt: o.expiresAt,
      createdAt: o.createdAt,
    })),
    courses,
    devices: devices.map((d) => ({
      id: d.id,
      label: d.label,
      userAgent: d.userAgent,
      lastSeenAt: d.lastSeenAt,
    })),
    wallet: wallet.map((w) => ({
      id: w.id,
      type: w.type,
      amount: w.amount,
      note: w.note,
      createdAt: w.createdAt,
    })),
    activity: activity.map((a) => ({
      id: a.id,
      adminName: a.adminName,
      action: a.action,
      targetName: a.targetName,
      createdAt: a.createdAt,
    })),
    purchases,
    grades,
    contentTypes: Object.values(ContentType),
  });
}
