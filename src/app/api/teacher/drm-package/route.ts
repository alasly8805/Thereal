import { NextRequest, NextResponse } from "next/server";
import path from "path";
import { getSession } from "@/lib/auth";
import { isTeacherLike, actingTeacherId } from "@/lib/teacher-scope";
import { prisma } from "@/lib/prisma";
import { isDrmRequestAuthorized } from "@/lib/drm-auth";
import { extractGoogleDriveFileId } from "@/lib/google-drive";
import { getDrmJobState, sanitizeAssetId, startDrmPackagingJob } from "@/lib/drm-packaging";

export const dynamic = "force-dynamic";

function isStaff(role: string) {
  return role === "teacher" || role === "superadmin" || role === "admin";
}

/**
 * POST /api/teacher/drm-package
 * Starts a background CENC (Widevine + PlayReady) packaging job and returns
 * immediately with the asset id. Poll GET ?assetId= for progress.
 */
export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session || !isStaff(session.role)) {
      return NextResponse.json({ error: "غير مصرح لك بالوصول" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const drmPassword = String(req.headers.get("x-drm-password") || body.drmPassword || body.password || "").trim();
    if (!(await isDrmRequestAuthorized(session, drmPassword))) {
      return NextResponse.json({ error: "كلمة مرور حماية DRM غير صحيحة أو مطلوبة للتشفير" }, { status: 403 });
    }

    const rawVideoId = String(body.videoId || body.assetId || body.url || "").trim();
    if (!rawVideoId) {
      return NextResponse.json({ error: "معرّف الفيديو (videoId) مطلوب للتشفير" }, { status: 400 });
    }

    // Already-packaged asset → nothing to do.
    const existing = getDrmJobState(rawVideoId);
    if (existing && existing.status === "ready") {
      return NextResponse.json({
        success: true,
        status: "ready",
        assetId: existing.assetId,
        manifestUrl: existing.manifestUrl,
        message: "هذا الفيديو مشفر بالفعل.",
      });
    }

    let gdriveFileId: string | null = null;
    if (rawVideoId.startsWith("gdrive_")) {
      gdriveFileId = rawVideoId.replace(/^gdrive_/, "");
    } else if (body.gdriveUrl) {
      gdriveFileId = extractGoogleDriveFileId(body.gdriveUrl);
    } else {
      gdriveFileId = extractGoogleDriveFileId(rawVideoId);
    }

    if (isTeacherLike(session.role)) {
      const ownerId = session.id.replace(/[^a-zA-Z0-9_-]/g, "_");
      const ownsPendingUpload =
        path.basename(rawVideoId) === rawVideoId && rawVideoId.startsWith(`local_${ownerId}_`);

      if (!ownsPendingUpload && !gdriveFileId) {
        const ownedVideo = await prisma.video.findFirst({
          where: {
            OR: [{ id: rawVideoId }, { providerVideoId: rawVideoId }, { vdoCipherId: rawVideoId }],
            folder: { course: { teacherId: actingTeacherId(session) } },
          },
          select: { id: true },
        });
        if (!ownedVideo) {
          return NextResponse.json({ error: "You can only package videos that belong to your account" }, { status: 403 });
        }
      }
    }

    const state = await startDrmPackagingJob({
      rawVideoId,
      gdriveFileId,
      assetId: body.assetId ? sanitizeAssetId(String(body.assetId)) : undefined,
      dbVideoId: body.dbVideoId ? String(body.dbVideoId) : null,
      requestedBy: session.id,
    });

    return NextResponse.json(
      {
        success: true,
        status: state.status,
        assetId: state.assetId,
        manifestUrl: state.manifestUrl,
        statusUrl: `/api/teacher/drm-package?assetId=${encodeURIComponent(state.assetId)}`,
        message:
          state.status === "ready"
            ? "تم تشفير الفيديو بنظام CENC Widevine + PlayReady بنجاح!"
            : "بدأ التشفير في الخلفية. يمكنك حفظ الدرس الآن وستُفعَّل الحماية تلقائياً عند الانتهاء.",
      },
      { status: state.status === "ready" ? 200 : 202 }
    );
  } catch (error: unknown) {
    console.error("[drm-package] error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "حدث خطأ أثناء بدء تشفير الفيديو" },
      { status: 500 }
    );
  }
}

/** GET /api/teacher/drm-package?assetId=… — packaging job status */
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session || !isStaff(session.role)) {
    return NextResponse.json({ error: "غير مصرح لك بالوصول" }, { status: 401 });
  }

  const assetId = (req.nextUrl.searchParams.get("assetId") || "").trim();
  if (!assetId || !/^[a-zA-Z0-9_.-]+$/.test(assetId)) {
    return NextResponse.json({ error: "معرّف الأصل (assetId) مطلوب" }, { status: 400 });
  }

  const state = getDrmJobState(assetId);
  if (!state) {
    return NextResponse.json({ error: "لا توجد عملية تشفير بهذا المعرّف" }, { status: 404 });
  }

  const { requestedBy: _requestedBy, ...publicState } = state;
  return NextResponse.json({ success: true, ...publicState });
}
