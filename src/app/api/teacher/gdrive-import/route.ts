import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { isTeacherLike, actingTeacherId, hasAssistantPermission } from "@/lib/teacher-scope";
import { prisma } from "@/lib/prisma";
import {
  extractGoogleDriveFileId,
  importGoogleDriveVideo,
} from "@/lib/google-drive";
import { getConfigNumber, getConfigNumberClamped } from "@/lib/config";
import { triggerPlanSyncForCourse } from "@/lib/plan-lesson-matcher";

// Concurrency tracking: Max 2 parallel downloads per teacher account
const activeDownloadsByTeacher = new Map<string, number>();

// Rate limiting: Max 20 downloads per hour per teacher account
interface RateLimitRecord {
  count: number;
  resetAt: number;
}
const rateLimitsByTeacher = new Map<string, RateLimitRecord>();

function checkTeacherRateLimit(teacherId: string, maxPerHour = 20): boolean {
  const now = Date.now();
  const record = rateLimitsByTeacher.get(teacherId);

  if (!record || record.resetAt <= now) {
    rateLimitsByTeacher.set(teacherId, { count: 1, resetAt: now + 3600000 });
    return true;
  }

  if (record.count >= maxPerHour) {
    return false;
  }

  record.count += 1;
  return true;
}

export async function POST(req: NextRequest) {
  let activeTeacherId: string | null = null;

  try {
    // ── 1. Strict Role Authorization (Teacher & Superadmin Only) ──────────────
    const session = await getSession();
    if (!session) {
      return NextResponse.json(
        { error: "يجب تسجيل الدخول أولاً للوصول إلى هذه الميزة" },
        { status: 401 }
      );
    }

    if (!isTeacherLike(session.role) && session.role !== "superadmin") {
      console.warn(
        `[Security Guard] Unauthorized gdrive-import access attempt by user ID: ${session.id}, role: ${session.role}`
      );
      return NextResponse.json(
        {
          error: "غير مصرح لك بالوصول. ميزة استيراد وتنزيل الفيديوهات مخصصة حصرياً لحسابات المعلمين وإدارة المنصة.",
        },
        { status: 403 }
      );
    }
    if (isTeacherLike(session.role) && !hasAssistantPermission(session, "editCourses")) {
      return NextResponse.json({ error: "المدرّس لم يمنحك صلاحية تعديل الكورسات" }, { status: 403 });
    }

    activeTeacherId = session.id;

    // ── 2. Rate Limiting & Concurrency Guard ──────────────────────────────────
    const currentActive = activeDownloadsByTeacher.get(activeTeacherId) || 0;
    if (currentActive >= 2) {
      return NextResponse.json(
        {
          error: "هناك عمليتا تنزيل فيديو قيد التنفيذ حالياً لهذا الحساب. يرجى الانتظار حتى اكتمال إحداهما لمنع استهلاك موارد الخادم.",
        },
        { status: 429 }
      );
    }

    if (!checkTeacherRateLimit(activeTeacherId, 20)) {
      return NextResponse.json(
        {
          error: "تم تجاوز الحد الأقصى المسموح به لعمليات التنزيل في الساعة (20 فيديو/ساعة). يرجى المحاولة لاحقاً.",
        },
        { status: 429 }
      );
    }

    // Acquire lock
    activeDownloadsByTeacher.set(activeTeacherId, currentActive + 1);

    // ── 3. Parse & Validate Payload ──────────────────────────────────────────
    const body = (await req.json().catch(() => ({}))) as {
      url?: string;
      driveUrl?: string;
      title?: string;
      folderId?: string;
      durationMinutes?: number;
    };

    const rawUrl = body.url || body.driveUrl || "";
    const fileId = extractGoogleDriveFileId(rawUrl);

    if (!fileId) {
      return NextResponse.json(
        {
          error: "رابط Google Drive غير صحيح. يرجى إدخال رابط مشاركة صالح (مثال: https://drive.google.com/file/d/.../view) أو معرّف الملف.",
        },
        { status: 400 }
      );
    }

    // ── 4. Import Google Drive Video directly into Native Security (Zero VPS Disk Space) ───
    const downloadResult = await importGoogleDriveVideo(fileId);

    const videoTitle = (body.title || downloadResult.title || "درس فيديو جديد").trim();
    const durationMinutes =
      typeof body.durationMinutes === "number" && body.durationMinutes > 0
        ? body.durationMinutes
        : downloadResult.durationMinutes || 0;

    // ── 5. Optional Auto-creation of Video in Folder ─────────────────────────
    let createdVideo: any = null;
    if (body.folderId) {
      const folderId = body.folderId;
      const folder = await prisma.folder.findFirst({
        where:
          session.role === "superadmin"
            ? { id: folderId }
            : { id: folderId, course: { teacherId: actingTeacherId(session) } },
        include: { course: { select: { id: true } } },
      });

      if (!folder) {
        return NextResponse.json(
          { error: "المحاضرة غير موجودة أو لا تملك صلاحية إضافتها" },
          { status: 404 }
        );
      }

      const count = await prisma.video.count({ where: { folderId } });
      const maxPerFolder = await getConfigNumber("max_videos_per_folder");
      if (maxPerFolder > 0 && count >= maxPerFolder) {
        return NextResponse.json(
          { error: `لا يمكن إضافة أكثر من ${maxPerFolder} فيديو في المحاضرة الواحدة` },
          { status: 400 }
        );
      }

      const maxWatchesPerUser = await getConfigNumberClamped("default_max_watches", 1, 99);

      createdVideo = await prisma.video.create({
        data: {
          title: videoTitle,
          videoProvider: "alasly",
          providerVideoId: downloadResult.videoId,
          vdoCipherId: "",
          durationMinutes,
          maxWatchesPerUser,
          folderId,
          order: count,
        },
      });

      triggerPlanSyncForCourse(folder.course.id).catch(console.error);
    }

    // Format human-readable size
    const sizeBytes = downloadResult.sizeBytes;
    const sizeFormatted =
      sizeBytes >= 1024 * 1024 * 1024
        ? `${(sizeBytes / (1024 * 1024 * 1024)).toFixed(2)} جيجابايت`
        : `${(sizeBytes / (1024 * 1024)).toFixed(1)} ميجابايت`;

    return NextResponse.json({
      success: true,
      isLocal: true,
      videoId: downloadResult.videoId,
      assetId: downloadResult.videoId,
      filename: downloadResult.filename,
      title: videoTitle,
      durationMinutes,
      sizeBytes: downloadResult.sizeBytes,
      sizeFormatted,
      videoProvider: "alasly",
      video: createdVideo,
      message: `تم استيراد وتحميل الفيديو (${sizeFormatted}) وحمايته بنظام Native Security بنجاح! 🚀`,
    });
  } catch (error: any) {
    console.error("[Google Drive Import API] Error:", error.message || error);
    return NextResponse.json(
      {
        error: error.message || "حدث خطأ أثناء استيراد الفيديو من Google Drive",
      },
      { status: 500 }
    );
  } finally {
    // Release active download lock
    if (activeTeacherId) {
      const current = activeDownloadsByTeacher.get(activeTeacherId) || 1;
      if (current <= 1) {
        activeDownloadsByTeacher.delete(activeTeacherId);
      } else {
        activeDownloadsByTeacher.set(activeTeacherId, current - 1);
      }
    }
  }
}
