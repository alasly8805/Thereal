import { NextRequest, NextResponse } from "next/server";
import { getSession, getStudentSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { resolveEmbedUrl } from "@/lib/video-provider";
import { isScheduledLocked, unlockAtISO } from "@/lib/publish";
import { getWatchAllowance } from "@/lib/watch-allowance";
import { canAccessContent, ContentType } from "@/lib/content-access-engine";
import { checkVideoAccess } from "@/lib/authorization";
import { isVpnOrProxy, logVpnViolation } from "@/lib/vpn-guard";

// Verify an existing watch session (used when loading the watch page on refresh)

/**
 * Binds a locally-served playback URL to the student's watch session.
 *
 * /api/videos/stream/... now refuses a student without a valid token, so the
 * URL handed to the player has to carry it. Only same-origin API paths are
 * touched — a provider embed (VdoCipher, Bunny, YouTube) must never receive our
 * session token.
 */
function withWatchToken(embedUrl: string, token: string): string {
  if (!embedUrl || !token) return embedUrl;
  if (!embedUrl.startsWith("/api/videos/stream/")) return embedUrl;
  return `${embedUrl}${embedUrl.includes("?") ? "&" : "?"}token=${encodeURIComponent(token)}`;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "غير مصرح" }, { status: 401 });

  const { id: videoId } = await params;
  const { searchParams } = new URL(req.url);
  const sessionToken = searchParams.get("token");

  if (!sessionToken) {
    return NextResponse.json({ error: "token مطلوب" }, { status: 400 });
  }

  if (sessionToken === "preview" || sessionToken === "free") {
    const video = await prisma.video.findUnique({
      where: { id: videoId },
      include: {
        folder: {
          select: {
            publishAt: true,
            course: { select: { id: true, title: true, teacherId: true } },
          },
        },
      },
    });
    if (!video) return NextResponse.json({ error: "الفيديو غير موجود" }, { status: 404 });
    const isOwner = session.role === "teacher" && video.folder.course.teacherId === session.id;
    if (!video.isFree && session.role !== "admin" && session.role !== "superadmin" && !isOwner) {
      return NextResponse.json({ error: "غير مصرح" }, { status: 403 });
    }
    const profile = await prisma.teacherProfile.findUnique({
      where: { teacherId: video.folder.course.teacherId },
      select: { slug: true },
    });
    const domain = req.headers.get("x-forwarded-host") || req.headers.get("host") || undefined;
    const studentIdentifier = session.phone || session.name || session.id;
    const embedResult = await resolveEmbedUrl(video, { userId: studentIdentifier, domain });
    return NextResponse.json({
      videoId,
      sessionToken,
      sessionId: "preview",
      isExpired: false,
      startedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(),
      remainingWatches: 999,
      totalWatches: 999,
      usedWatches: 0,
      teacherSlug: profile?.slug ?? "",
      studentPlan: "course",
      embedUrl: embedResult.embedUrl,
      provider: embedResult.provider,
      drm: embedResult.drm || null,
      resumeSeconds: 0,
      watermark: session.phone || session.name || "",
      studentName: session.name || "",
      studentPhone: session.phone || "",
      video: {
        id: video.id,
        title: video.title,
        courseId: video.folder.course.id,
        courseTitle: video.folder.course.title,
        videoProvider: video.videoProvider,
      },
    });
  }

  const watchSession = await prisma.videoWatchSession.findUnique({
    where: { sessionToken },
    include: {
      video: {
        include: {
          folder: {
            select: {
              publishAt: true,
              course: { select: { id: true, title: true, teacherId: true } },
            },
          },
        },
      },
    },
  });

  if (!watchSession) {
    return NextResponse.json({ error: "الجلسة غير موجودة" }, { status: 404 });
  }
  if (watchSession.studentId !== session.id) {
    return NextResponse.json({ error: "غير مصرح بهذه الجلسة" }, { status: 403 });
  }
  if (watchSession.videoId !== videoId) {
    return NextResponse.json({ error: "الفيديو لا يتطابق مع الجلسة" }, { status: 400 });
  }

  const now = new Date();
  const isExpired = watchSession.expiresAt < now || !!watchSession.endedAt;

  // Per-video watch quota
  const usedWatchCount = await prisma.videoWatchSession.count({
    where: { studentId: session.id, videoId, usedWatchSlot: true },
  });

  const video = watchSession.video;
  const course = video.folder.course;
  const total = await getWatchAllowance(prisma, session.id, videoId, video.maxWatchesPerUser);

  const profile = await prisma.teacherProfile.findUnique({
    where: { teacherId: course.teacherId },
    select: { slug: true },
  });
  const teacherSlug = profile?.slug ?? "";

  let studentPlan = "course";
  const planEnrollmentForVideo = await prisma.planEnrollment.findFirst({
    where: {
      studentId: session.id,
      expiresAt: { gt: now },
      plan: {
        lessons: {
          some: {
            sources: {
              some: {
                videoId
              }
            }
          }
        }
      }
    },
    select: { id: true }
  });

  if (planEnrollmentForVideo) {
    studentPlan = "plan";
  } else {
    const hasVideoAccess = await prisma.accessCode.findFirst({
      where: { studentId: session.id, videoId, isActive: true, accessType: "VIDEO" },
    }) || await prisma.videoPurchase.findUnique({
      where: { studentId_videoId: { studentId: session.id, videoId } },
    });

    if (hasVideoAccess) {
      studentPlan = "lesson";
    } else {
      const folderId = video.folderId;
      const hasFolderAccess = await prisma.accessCode.findFirst({
        where: { studentId: session.id, folderId, isActive: true, accessType: "FOLDER" },
      }) || await prisma.folderPurchase.findUnique({
        where: { studentId_folderId: { studentId: session.id, folderId } },
      });

      if (hasFolderAccess) {
        studentPlan = "folder";
      }
    }
  }

  const isTesterUser = session?.accountMode === "TESTER";
  const domain = req.headers.get("x-forwarded-host") || req.headers.get("host") || undefined;
  const studentIdentifier = session.phone || session.name || session.id;
  const embedResult = await resolveEmbedUrl(video, { userId: studentIdentifier, domain });
  const progress = await prisma.progress.findUnique({
    where: { studentId_videoId: { studentId: session.id, videoId } },
    select: { lastPositionSeconds: true },
  });

  return NextResponse.json({
    videoId,
    sessionToken,
    sessionId: watchSession.id,
    isExpired,
    startedAt: watchSession.startedAt.toISOString(),
    expiresAt: watchSession.expiresAt.toISOString(),
    unlimited: isTesterUser,
    remainingWatches: isTesterUser ? null : Math.max(0, total - usedWatchCount),
    totalWatches: isTesterUser ? null : total,
    usedWatches: usedWatchCount,
    teacherSlug,
    studentPlan,
    embedUrl: withWatchToken(embedResult.embedUrl, sessionToken),
    provider: embedResult.provider,
    drm: embedResult.drm || null,
    resumeSeconds: progress?.lastPositionSeconds ?? 0,
    watermark: session.phone || session.name || "",
    studentName: session.name || "",
    studentPhone: session.phone || "",
    video: {
      id: video.id,
      title: video.title,
      courseId: course.id,
      courseTitle: course.title,
      videoProvider: video.videoProvider,
    },
  });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  // Session may be null for anonymous viewers of a free/demo video. Use the
  // role-agnostic session so admins/superadmins can preview too.
  const session = await getSession();

  // Watch-session length is superadmin-configurable (was 4h); ≥0.25h so a bad
  // value can't create instantly-expired sessions.
  const WATCH_DURATION_HOURS = 90 / 3600;

  const { id: videoId } = await params;
  const heartbeatBody = (await req.json().catch(() => ({}))) as { token?: string; heartbeat?: boolean };
  if (heartbeatBody.heartbeat && heartbeatBody.token) {
    if (!session) return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
    const now = new Date();
    const renewedUntil = new Date(now.getTime() + 90_000);
    const renewed = await prisma.$transaction(async (tx: any) => {
      const claim = await tx.videoWatchSession.updateMany({
        where: { sessionToken: heartbeatBody.token, studentId: session.id, videoId, endedAt: null, expiresAt: { gt: now } },
        data: { expiresAt: renewedUntil },
      });
      return claim.count;
    });
    if (!renewed) return NextResponse.json({ error: "جلسة المشاهدة منتهية" }, { status: 401 });
    return NextResponse.json({ ok: true, expiresAt: renewedUntil.toISOString() });
  }
  const ipAddress = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;

  const video = await prisma.video.findUnique({
    where: { id: videoId },
    include: {
      folder: {
        select: {
          courseId: true,
          publishAt: true,
          course: { select: { id: true, title: true, teacherId: true } },
        },
      },
    },
  });

  if (!video) {
    return NextResponse.json({ error: "الفيديو غير موجود" }, { status: 404 });
  }

  const course = video.folder.course;
  const now = new Date();

  // ── Scheduled unlock: a not-yet-published video can't start a session ──────
  if (isScheduledLocked(video.folder.publishAt, video.publishAt, now.getTime())) {
    return NextResponse.json(
      {
        error: "هذه المحاضرة لم تُفتح بعد. ستتاح في موعدها المحدد.",
        code: "SCHEDULED",
        unlockAt: unlockAtISO(video.folder.publishAt, video.publishAt),
      },
      { status: 403 }
    );
  }

  // The generic dependency graph is authoritative for student content access.
  // Staff previews remain governed by the ownership checks below.
  if (session && session.role === "student") {
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
  }

  // ── FREE / DEMO video: bypass enrollment + quota, no session row consumed ──
  if (video.isFree) {
    const domain = req.headers.get("x-forwarded-host") || req.headers.get("host") || undefined;
    const studentIdentifier = session ? (session.phone || session.name || session.id) : undefined;
    const embedResult = await resolveEmbedUrl(video, { userId: studentIdentifier, domain });
    const expiresAt = new Date(now.getTime() + 90_000);
    return NextResponse.json({
      sessionToken: "free",
      expiresAt: expiresAt.toISOString(),
      watchDurationHours: WATCH_DURATION_HOURS,
      remainingWatches: null,
      totalWatches: null,
      usedWatches: 0,
      embedUrl: embedResult.embedUrl,
      provider: embedResult.provider,
      drm: embedResult.drm || null,
      resumeSeconds: 0,
      watermark: session ? (session.phone || session.name || "") : "",
      video: {
        id: video.id,
        title: video.title,
        courseId: course.id,
        courseTitle: course.title,
        videoProvider: video.videoProvider,
      },
      free: true,
    });
  }

  // ── PAID video from here on — requires a logged-in student ──
  if (!session) {
    return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
  }

  // Owner Teacher / Admin / Superadmin: preview playback — no enrollment, no quota, no slot used.
  const isOwnerTeacher = session.role === "teacher" && video.folder.course.teacherId === session.id;
  if (session.role === "admin" || session.role === "superadmin" || isOwnerTeacher) {
    const domain = req.headers.get("x-forwarded-host") || req.headers.get("host") || undefined;
    const studentIdentifier = session.phone || session.name || session.id;
    const embedResult = await resolveEmbedUrl(video, { userId: studentIdentifier, domain });
    const expiresAt = new Date(now.getTime() + 90_000);
    return NextResponse.json({
      sessionToken: "preview",
      expiresAt: expiresAt.toISOString(),
      watchDurationHours: WATCH_DURATION_HOURS,
      remainingWatches: null,
      totalWatches: null,
      usedWatches: 0,
      embedUrl: embedResult.embedUrl,
      provider: embedResult.provider,
      drm: embedResult.drm || null,
      resumeSeconds: 0,
      watermark: session.phone || session.name || "",
      studentName: session.name || "",
      studentPhone: session.phone || "",
      video: {
        id: video.id,
        title: video.title,
        courseId: course.id,
        courseTitle: course.title,
        videoProvider: video.videoProvider,
      },
      preview: true,
    });
  }

  // Other Teachers/staff have no place in the student watch flow.
  if (session.role === "teacher" || session.role === "staff") {
    return NextResponse.json(
      { error: "صفحة مشاهدة الكورس مخصّصة للطلاب فقط.", code: "ROLE_NOT_ALLOWED" },
      { status: 403 }
    );
  }

  // Device lock: a device-bound token whose device was reset/removed can't play.
  // (Legacy tokens issued before the feature have no deviceId — allowed.)
  if (session.deviceId) {
    const device = await prisma.device.findUnique({
      where: { userId_deviceId: { userId: session.id, deviceId: session.deviceId } },
    });
    if (!device) {
      return NextResponse.json(
        { error: "تم إلغاء تفعيل هذا الجهاز. يرجى تسجيل الدخول من جديد.", code: "DEVICE_REVOKED" },
        { status: 403 }
      );
    }
  }

  // VPN & Proxy Detection Guard
  const vpnCheck = isVpnOrProxy(req.headers);
  if (vpnCheck.isVpn) {
    await logVpnViolation({
      studentId: session.id,
      videoId,
      type: "VPN_DETECTED",
      details: vpnCheck.reason,
      ip: vpnCheck.ip,
      userAgent: req.headers.get("user-agent"),
    });

    return NextResponse.json(
      {
        error: "تم رصد استخدام تطبيق VPN أو البروكسي (مثل Cloudflare WARP / NordVPN). يرجى إغلاق تطبيق الـ VPN لفتح المحتوى المحمي.",
        code: "VPN_DETECTED",
        vpnDetected: true,
      },
      { status: 403 }
    );
  }

  // Dual Active Session Lock: End active sessions on other videos for same student
  await prisma.videoWatchSession.updateMany({
    where: {
      studentId: session.id,
      videoId: { not: videoId },
      endedAt: null,
      expiresAt: { gt: now },
    },
    data: { endedAt: now },
  });

  // Verify access via centralized checkVideoAccess
  const hasAccess = await checkVideoAccess(session.id, session.role, videoId);
  if (!hasAccess) {
    return NextResponse.json({ error: "لا يوجد صلاحية للوصول لهذا الكورس" }, { status: 403 });
  }

  // Reuse an existing active session for this student + video
  const activeSession = await prisma.videoWatchSession.findFirst({
    where: { studentId: session.id, videoId, endedAt: null, expiresAt: { gt: now } },
    orderBy: { startedAt: "desc" },
  });

  if (activeSession) {
    const activeUsedWatchCount = await prisma.videoWatchSession.count({
      where: { studentId: session.id, videoId, usedWatchSlot: true },
    });
    const activeAllowance = await getWatchAllowance(
      prisma,
      session.id,
      videoId,
      video.maxWatchesPerUser
    );

    const domain = req.headers.get("x-forwarded-host") || req.headers.get("host") || undefined;
    const studentIdentifier = session.phone || session.name || session.id;

    let activeVdoSelection: any = null;
    if ((video.videoProvider || "vdocipher") === "vdocipher") {
      const activeRes = await prisma.vdoCipherReservation.findFirst({
        where: { sessionToken: activeSession.sessionToken, status: "active" },
        include: { account: true },
      });
      if (activeRes) {
        try {
          const { decryptVdoCipherSecret } = await import("@/lib/vdocipher-accounts");
          activeVdoSelection = {
            apiKey: decryptVdoCipherSecret(activeRes.account.apiKeyEnc),
            playerId: activeRes.account.playerId,
          };
        } catch {}
      }
    }

    const embedResult = await resolveEmbedUrl(video, {
      userId: studentIdentifier,
      domain,
      apiKey: activeVdoSelection?.apiKey,
      playerId: activeVdoSelection?.playerId,
      watermarkText: session.phone || session.name || "",
    });

    const profile = await prisma.teacherProfile.findUnique({
      where: { teacherId: course.teacherId },
      select: { slug: true },
    });
    const teacherSlug = profile?.slug ?? "";

    let studentPlan = "course";
    const isPlanStudent = await prisma.planEnrollment.findFirst({
      where: {
        studentId: session.id,
        expiresAt: { gt: now },
        plan: {
          lessons: {
            some: {
              sources: {
                some: {
                  videoId
                }
              }
            }
          }
        }
      },
      select: { id: true }
    });

    if (isPlanStudent) {
      studentPlan = "plan";
    } else {
      const hasVideoAccess = await prisma.accessCode.findFirst({
        where: { studentId: session.id, videoId, isActive: true, accessType: "VIDEO" },
      }) || await prisma.videoPurchase.findUnique({
        where: { studentId_videoId: { studentId: session.id, videoId } },
      });

      if (hasVideoAccess) {
        studentPlan = "lesson";
      } else {
        const folderId = video.folderId;
        const hasFolderAccess = await prisma.accessCode.findFirst({
          where: { studentId: session.id, folderId, isActive: true, accessType: "FOLDER" },
        }) || await prisma.folderPurchase.findUnique({
          where: { studentId_folderId: { studentId: session.id, folderId } },
        });

        if (hasFolderAccess) {
          studentPlan = "folder";
        }
      }
    }

    const progress = await prisma.progress.findUnique({
      where: { studentId_videoId: { studentId: session.id, videoId } },
      select: { lastPositionSeconds: true },
    });

    return NextResponse.json({
      sessionToken: activeSession.sessionToken,
      sessionId: activeSession.id,
      expiresAt: activeSession.expiresAt.toISOString(),
      watchDurationHours: WATCH_DURATION_HOURS,
      remainingWatches: Math.max(0, activeAllowance - activeUsedWatchCount),
      totalWatches: activeAllowance,
      usedWatches: activeUsedWatchCount,
      embedUrl: withWatchToken(embedResult.embedUrl, activeSession.sessionToken),
      provider: embedResult.provider,
      drm: embedResult.drm || null,
      resumeSeconds: progress?.lastPositionSeconds ?? 0,
      watermark: session.phone || session.name || "",
      studentName: session.name || "",
      studentPhone: session.phone || "",
      video: {
        id: video.id,
        title: video.title,
        courseId: course.id,
        courseTitle: course.title,
        videoProvider: video.videoProvider,
      },
      reused: true,
      teacherSlug,
      studentPlan,
    });
  }
  
  const planEnrollment = await prisma.planEnrollment.findFirst({
    where: {
      studentId: session.id,
      expiresAt: { gt: now },
      plan: {
        lessons: {
          some: {
            sources: {
              some: {
                videoId: video.id
              }
            }
          }
        }
      }
    },
    select: { id: true }
  });
  const hasPlanAccess = !!planEnrollment;

  const sessionToken = crypto.randomUUID();
  const expiresAt = new Date(now.getTime() + WATCH_DURATION_HOURS * 60 * 60 * 1000);
  const userAgent = req.headers.get("user-agent") ?? null;

  // ── Atomic quota check + slot consumption ──────────────────────────────────
  // The per-video watch limit is the guardrail protecting paid content. Reading
  // the count and creating the session in separate statements lets two tabs both
  // grab the last slot. Doing it in one transaction closes that: Serializable
  // isolation (Postgres/prod) aborts the conflicting tx; SQLite (local) serializes
  // writers, so the race can't occur there either.
  const isTesterUser = session.accountMode === "TESTER";
  const QUOTA_EXCEEDED = "QUOTA_EXCEEDED";
  const isPg = (process.env.DATABASE_URL ?? "").startsWith("postgres");
  try {
    const { used, ws, vdoAccountSelection } = await prisma.$transaction(
      async (tx: any) => {
        const usedCount = await tx.videoWatchSession.count({
          where: { studentId: session.id, videoId, usedWatchSlot: true },
        });
        // Read grants inside the transaction too: outside it, a request approved
        // between the read and the insert would not be honoured.
        const allowance = await getWatchAllowance(tx, session.id, videoId, video.maxWatchesPerUser);
        if (!isTesterUser && usedCount >= allowance) throw new Error(QUOTA_EXCEEDED);
        await tx.videoWatchSession.updateMany({
          where: { studentId: session.id, videoId, endedAt: null, expiresAt: { lt: now } },
          data: { endedAt: now },
        });
        const created = await tx.videoWatchSession.create({
          data: { sessionToken, videoId, studentId: session.id, expiresAt, usedWatchSlot: true, ipAddress, userAgent },
        });
        const isVdo = (video.videoProvider || "vdocipher") === "vdocipher";
        let vdoAccountSelection: any = null;
        if (isVdo) {
          const { reserveViewerBandwidth } = await import("@/lib/vdocipher-accounts");
          vdoAccountSelection = await reserveViewerBandwidth(tx, {
            videoId: video.id,
            studentId: session.id,
            sessionToken,
            durationMinutes: video.durationMinutes,
            rawVdoCipherId: video.providerVideoId || video.vdoCipherId,
          });
        }
        return { used: usedCount, ws: created, vdoAccountSelection };
      },
      isPg ? { isolationLevel: "Serializable" } : undefined
    );

    if (isTesterUser) {
      const { logTesterActivity } = await import("@/lib/tester");
      await logTesterActivity({
        testerId: session.id,
        action: "VIDEO_WATCH",
        targetId: video.id,
        targetTitle: video.title,
        ipAddress,
      }).catch(() => {});
    }

    const profile = await prisma.teacherProfile.findUnique({
      where: { teacherId: course.teacherId },
      select: { slug: true },
    });
    const teacherSlug = profile?.slug ?? "";

    let studentPlan = "course";
    if (hasPlanAccess) {
      studentPlan = "plan";
    } else {
      const hasVideoAccess = await prisma.accessCode.findFirst({
        where: { studentId: session.id, videoId, isActive: true, accessType: "VIDEO" },
      }) || await prisma.videoPurchase.findUnique({
        where: { studentId_videoId: { studentId: session.id, videoId } },
      });

      if (hasVideoAccess) {
        studentPlan = "lesson";
      } else {
        const folderId = video.folderId;
        const hasFolderAccess = await prisma.accessCode.findFirst({
          where: { studentId: session.id, folderId, isActive: true, accessType: "FOLDER" },
        }) || await prisma.folderPurchase.findUnique({
          where: { studentId_folderId: { studentId: session.id, folderId } },
        });

        if (hasFolderAccess) {
          studentPlan = "folder";
        }
      }
    }

    const domain = req.headers.get("x-forwarded-host") || req.headers.get("host") || undefined;
    const studentIdentifier = session.phone || session.name || session.id;
    const embedResult = await resolveEmbedUrl(video, {
      userId: studentIdentifier,
      domain,
      apiKey: vdoAccountSelection?.apiKey,
      playerId: vdoAccountSelection?.playerId,
      watermarkText: session.phone || session.name || "",
    });
    const progress = await prisma.progress.findUnique({
      where: { studentId_videoId: { studentId: session.id, videoId } },
      select: { lastPositionSeconds: true },
    });

    return NextResponse.json({
      sessionToken,
      sessionId: ws.id,
      expiresAt: expiresAt.toISOString(),
      watchDurationHours: WATCH_DURATION_HOURS,
      unlimited: isTesterUser,
      remainingWatches: isTesterUser ? null : video.maxWatchesPerUser - used - 1,
      totalWatches: isTesterUser ? null : video.maxWatchesPerUser,
      usedWatches: used + 1,
      embedUrl: withWatchToken(embedResult.embedUrl, sessionToken),
      provider: embedResult.provider,
      drm: embedResult.drm || null,
      resumeSeconds: progress?.lastPositionSeconds ?? 0,
      watermark: session.phone || session.name || "",
      studentName: session.name || "",
      studentPhone: session.phone || "",
      video: {
        id: video.id,
        title: video.title,
        courseId: course.id,
        courseTitle: course.title,
        videoProvider: video.videoProvider,
      },
      teacherSlug,
      studentPlan,
    });
  } catch (e) {
    if (e instanceof Error && e.message === QUOTA_EXCEEDED) {
      return NextResponse.json(
        {
          error: `لقد استنفدت جميع محاولات المشاهدة لهذا الفيديو (${video.maxWatchesPerUser} مشاهدة)`,
          code: "NO_WATCHES_REMAINING",
        },
        { status: 403 }
      );
    }
    // Write conflict (a concurrent tab won the slot) → ask to retry.
    if ((e as { code?: string }).code === "P2034") {
      return NextResponse.json(
        { error: "حدث تزامن في الطلب، حاول مرة أخرى", code: "CONCURRENT_RETRY" },
        { status: 409 }
      );
    }
    console.error("Watch-session transaction error:", e);
    return NextResponse.json({ error: "تعذر بدء جلسة المشاهدة" }, { status: 500 });
  }
}
