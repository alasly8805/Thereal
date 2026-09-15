import { logAdminAction, verifyDrmPassword } from "@/lib/admin-auth";
import { isDrmAuthorized, isDrmRequestAuthorized } from "@/lib/drm-auth";
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { isTeacherLike, actingTeacherId, hasAssistantPermission } from "@/lib/teacher-scope";
import { prisma } from "@/lib/prisma";
import { cleanProviderVideoId, validateProviderId, type VideoProvider } from "@/lib/video-provider";
import { parsePublishAt } from "@/lib/publish";
import { getConfigNumber, getConfigNumberClamped } from "@/lib/config";
import { triggerPlanSyncForCourse } from "@/lib/plan-lesson-matcher";

const MAX_TITLE_LENGTH = 100;
const VALID_PROVIDERS: VideoProvider[] = ["vdocipher", "bunny", "youtube", "alasly", "axinom"];

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession();

    if (session && session.role === "superadmin") {
      try {
        await logAdminAction({
          adminId: session.id,
          adminName: session.name,
          action: "SUPERADMIN_ACTION",
          targetType: "API_ROUTE",
          targetId: req.nextUrl ? req.nextUrl.pathname : req.url,
          targetName: req.method,
        });
      } catch (e) {}
    }
    if (!session || !isTeacherLike(session.role)) {
      return NextResponse.json({ error: "غير مصرح" }, { status: 403 });
    }
    if (!hasAssistantPermission(session, "editCourses")) {
      return NextResponse.json({ error: "المدرّس لم يمنحك صلاحية تعديل الكورسات" }, { status: 403 });
    }

    const { id: folderId } = await params;
    const body = (await req.json()) as {
      title?: string;
      videoProvider?: string;
      providerVideoId?: string;
      durationMinutes?: number;
      maxWatchesPerUser?: number;
      publishAt?: string | null;
      drmPassword?: string;
      isFree?: boolean;
      // Legacy field — accepted for backwards compat, treated as vdocipher
      vdoCipherId?: string;
    };

    const durationMinutes =
      typeof body.durationMinutes === "number" && body.durationMinutes >= 0
        ? Math.floor(body.durationMinutes)
        : 0;

    // Default watch quota for new videos is superadmin-configurable (was 3).
    const maxWatchesPerUser =
      typeof body.maxWatchesPerUser === "number" && body.maxWatchesPerUser >= 1
        ? Math.floor(body.maxWatchesPerUser)
        : await getConfigNumberClamped("default_max_watches", 1, 99);

    const { title } = body;

    // Resolve provider + id (support legacy vdoCipherId field)
    const videoProvider: VideoProvider = VALID_PROVIDERS.includes(body.videoProvider as VideoProvider)
      ? (body.videoProvider as VideoProvider)
      : "vdocipher";

    // Enforce DRM authorization (Exclusive to Authorized Users or Valid Passcode)
    if (videoProvider === "axinom" || videoProvider === "vdocipher") {
      const drmPass = req.headers.get("x-drm-password") || body.drmPassword || "";
      const isAuthorized = await isDrmRequestAuthorized(session, drmPass);
      if (!isAuthorized) {
        return NextResponse.json(
          { error: "كلمة مرور حماية الـ DRM مطلوبة أو غير صحيحة" },
          { status: 403 }
        );
      }
    }

    const rawProviderId = (body.providerVideoId ?? body.vdoCipherId ?? "").trim();
    const providerVideoId = cleanProviderVideoId(videoProvider, rawProviderId);

    if (!title || typeof title !== "string" || !title.trim()) {
      return NextResponse.json({ error: "عنوان الفيديو مطلوب" }, { status: 400 });
    }
    if (title.length > MAX_TITLE_LENGTH) {
      return NextResponse.json(
        { error: `عنوان الفيديو لا يمكن أن يزيد عن ${MAX_TITLE_LENGTH} حرف` },
        { status: 400 }
      );
    }

    const idError = validateProviderId(videoProvider, rawProviderId);
    if (idError) {
      return NextResponse.json({ error: idError }, { status: 400 });
    }

    // Verify folder exists and belongs to teacher's course
    const folder = await prisma.folder.findFirst({
      where: { id: folderId, course: { teacherId: actingTeacherId(session) } },
      include: { course: { select: { id: true } } }
    });
    if (!folder) {
      return NextResponse.json({ error: "المحاضرة غير موجودة" }, { status: 404 });
    }

    // Check for duplicate title in same folder
    const existing = await prisma.video.findFirst({ where: { folderId, title: title.trim() } });
    if (existing) {
      return NextResponse.json({ error: "يوجد فيديو بنفس العنوان في هذه المحاضرة" }, { status: 400 });
    }

    const count = await prisma.video.count({ where: { folderId } });

    // Enforce the superadmin-configurable max videos per folder.
    const maxPerFolder = await getConfigNumber("max_videos_per_folder");
    if (maxPerFolder > 0 && count >= maxPerFolder) {
      return NextResponse.json(
        { error: `لا يمكن إضافة أكثر من ${maxPerFolder} فيديو في المحاضرة الواحدة` },
        { status: 400 }
      );
    }

    const publishAt = parsePublishAt(body.publishAt) ?? null;

    const video = await prisma.video.create({
      data: {
        title: title.trim(),
        videoProvider,
        providerVideoId,
        vdoCipherId: videoProvider === "vdocipher" ? providerVideoId : "",
        durationMinutes,
        maxWatchesPerUser,
        publishAt,
        isFree: body.isFree === true,
        folderId,
        order: count,
      },
    });

    // Auto-create ContentItem graph node for the new video
    await prisma.contentItem.upsert({
      where: {
        type_sourceId: {
          type: "VIDEO",
          sourceId: video.id,
        },
      },
      create: {
        type: "VIDEO",
        sourceId: video.id,
        title: video.title,
      },
      update: {
        title: video.title,
      },
    }).catch(console.error);

    // Fire and forget auto-matcher sync
    triggerPlanSyncForCourse(folder.course.id).catch(console.error);

    return NextResponse.json({ video }, { status: 201 });
  } catch (error) {
    console.error("Failed to create video:", error);
    return NextResponse.json({ error: "تعذر إضافة الفيديو" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession();

    if (session && session.role === "superadmin") {
      try {
        await logAdminAction({
          adminId: session.id,
          adminName: session.name,
          action: "SUPERADMIN_ACTION",
          targetType: "API_ROUTE",
          targetId: req.nextUrl ? req.nextUrl.pathname : req.url,
          targetName: req.method,
        });
      } catch {
        /* ignore audit failures */
      }
    }

    if (!session || (!isTeacherLike(session.role) && session.role !== "superadmin")) {
      return NextResponse.json({ error: "غير مصرح" }, { status: 403 });
    }
    if (isTeacherLike(session.role) && !hasAssistantPermission(session, "editCourses")) {
      return NextResponse.json({ error: "المدرّس لم يمنحك صلاحية تعديل الكورسات" }, { status: 403 });
    }

    const { id: folderId } = await params;
    const body = (await req.json()) as { videoId?: string; isFree?: boolean };
    const { videoId, isFree } = body;

    if (!videoId) {
      return NextResponse.json({ error: "معرف الفيديو مطلوب" }, { status: 400 });
    }
    if (typeof isFree !== "boolean") {
      return NextResponse.json({ error: "لا توجد بيانات للتحديث" }, { status: 400 });
    }

    const isSuperAdmin = session.role === "superadmin";
    const folder = await prisma.folder.findFirst({
      where: isSuperAdmin
        ? { id: folderId }
        : { id: folderId, course: { teacherId: actingTeacherId(session) } },
    });
    if (!folder) {
      return NextResponse.json({ error: "المحاضرة غير موجودة" }, { status: 404 });
    }

    const video = await prisma.video.findFirst({ where: { id: videoId, folderId } });
    if (!video) {
      return NextResponse.json({ error: "الفيديو غير موجود" }, { status: 404 });
    }

    const updated = await prisma.video.update({
      where: { id: videoId },
      data: { isFree },
      select: { id: true, title: true, isFree: true },
    });

    return NextResponse.json({ success: true, video: updated });
  } catch (error) {
    console.error("Failed to update video trial status:", error);
    return NextResponse.json({ error: "تعذر تعديل حالة الفيديو" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession();

    if (session && session.role === "superadmin") {
      try {
        await logAdminAction({
          adminId: session.id,
          adminName: session.name,
          action: "SUPERADMIN_ACTION",
          targetType: "API_ROUTE",
          targetId: req.nextUrl ? req.nextUrl.pathname : req.url,
          targetName: req.method,
        });
      } catch (e) {}
    }
    if (!session || !isTeacherLike(session.role)) {
      return NextResponse.json({ error: "غير مصرح" }, { status: 403 });
    }
    if (!hasAssistantPermission(session, "editCourses")) {
      return NextResponse.json({ error: "المدرّس لم يمنحك صلاحية تعديل الكورسات" }, { status: 403 });
    }

    const { id: folderId } = await params;
    const { videoId } = (await req.json()) as { videoId?: string };

    if (!videoId) {
      return NextResponse.json({ error: "معرف الفيديو مطلوب" }, { status: 400 });
    }

    // Verify folder exists and belongs to teacher
    const folder = await prisma.folder.findFirst({
      where: { id: folderId, course: { teacherId: actingTeacherId(session) } },
      include: { course: { select: { id: true } } }
    });
    if (!folder) {
      return NextResponse.json({ error: "المحاضرة غير موجودة" }, { status: 404 });
    }

    const video = await prisma.video.findFirst({ where: { id: videoId, folderId } });
    if (!video) {
      return NextResponse.json({ error: "الفيديو غير موجود" }, { status: 404 });
    }

    await prisma.progress.deleteMany({ where: { videoId } });
    await prisma.video.delete({ where: { id: videoId } });

    // Fire and forget auto-matcher sync
    triggerPlanSyncForCourse(folder.course.id).catch(console.error);

    return NextResponse.json({ success: true, message: "تم حذف الفيديو بنجاح" });
  } catch (error) {
    console.error("Failed to delete video:", error);
    return NextResponse.json({ error: "تعذر حذف الفيديو" }, { status: 500 });
  }
}
