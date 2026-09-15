import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkVideoAccess } from "@/lib/authorization";
import { PREVIEW_COOKIE_NAME, verifyPreviewCookie } from "@/lib/preview-auth";
import fs from "fs";
import path from "path";

const UPLOAD_DIR = path.join(process.cwd(), "uploads", "videos");

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession();
    const isPreviewAuthorized = verifyPreviewCookie(req.cookies.get(PREVIEW_COOKIE_NAME)?.value);
    if (!session && !isPreviewAuthorized) {
      return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
    }

    const { id } = await params;
    // Sanitize filename to prevent directory traversal
    const safeFilename = path.basename(id);

    // ── Authorization ────────────────────────────────────────────────────────
    // The path segment is a *provider asset id*, not a Video row id, so resolve
    // the owning lesson first. When a token is provided, resolve the exact video
    // bound to this watch session to avoid ambiguity if multiple lessons share
    // the same providerVideoId (e.g. duplicate uploads or across courses).
    const token = req.nextUrl.searchParams.get("token");
    let video: { id: string; isFree: boolean } | null = null;
    let watchSession: { studentId: string; videoId: string; expiresAt: Date; endedAt: Date | null } | null = null;

    if (token) {
      watchSession = await prisma.videoWatchSession.findUnique({
        where: { sessionToken: token },
        select: { studentId: true, videoId: true, expiresAt: true, endedAt: true },
      });
      if (watchSession) {
        const candidate = await prisma.video.findUnique({
          where: { id: watchSession.videoId },
          select: { id: true, isFree: true, providerVideoId: true, vdoCipherId: true },
        });
        if (candidate && (candidate.providerVideoId === safeFilename || candidate.vdoCipherId === safeFilename)) {
          video = { id: candidate.id, isFree: candidate.isFree };
        }
      }
    }

    if (!video) {
      video = await prisma.video.findFirst({
        where: { OR: [{ providerVideoId: safeFilename }, { vdoCipherId: safeFilename }] },
        select: { id: true, isFree: true },
      });
    }

    if (video) {
      // Preview-cookie access is intentionally limited to Drive-backed previews.
      if (!session && (!isPreviewAuthorized || !safeFilename.startsWith("gdrive_"))) {
        return NextResponse.json({ error: "لا توجد صلاحية" }, { status: 403 });
      }

      const hasAccess = session ? await checkVideoAccess(session.id, session.role, video.id) : true;
      if (!hasAccess) {
        return NextResponse.json({ error: "لا يوجد صلاحية للوصول لهذا الفيديو" }, { status: 403 });
      }

      // A student must present the watch-session token they were issued.
      //
      // Enrollment alone used to be enough here, which quietly voided the whole
      // per-video watch limit: this URL is what the player loads, so a student
      // could lift it from their own network tab on the first legitimate watch
      // and replay the lesson forever without ever consuming another slot.
      // /api/videos/[id]/secure-url already required a token; this path did not.
      if (session?.role === "student" && !video.isFree) {
        if (!token) {
          return NextResponse.json(
            { error: "يجب بدء جلسة مشاهدة أولاً" },
            { status: 403 }
          );
        }
        if (!watchSession) {
          watchSession = await prisma.videoWatchSession.findUnique({
            where: { sessionToken: token },
            select: { studentId: true, videoId: true, expiresAt: true, endedAt: true },
          });
        }
        if (
          !watchSession ||
          watchSession.studentId !== session.id ||
          watchSession.videoId !== video.id ||
          watchSession.endedAt ||
          watchSession.expiresAt < new Date()
        ) {
          return NextResponse.json(
            { error: "جلسة المشاهدة غير صالحة أو منتهية" },
            { status: 403 }
          );
        }
      }
    } else {
      // Newly imported video not yet saved in a lecture folder: only allow teacher/admin staff preview
      const isStaff = !!session && (session.role === "teacher" || session.role === "admin" || session.role === "superadmin");
      if (!isStaff && !isPreviewAuthorized) {
        return NextResponse.json({ error: "الفيديو غير موجود" }, { status: 404 });
      }
    }


    let effectiveFilename = safeFilename;
    const rangeHeader = req.headers.get("range");
    const storage = await import("@/lib/video-storage");
    const renditions = await import("@/lib/video-renditions");

    // The player appends ?q=480 when the student picks a lighter quality. It is
    // only ever a request: an ungenerated (or stale bookmarked) quality falls
    // back to the original rather than 404ing them out of the lesson.
    const requestedHeight = renditions.parseQualityParam(req.nextUrl.searchParams.get("q"));
    let servingRendition = false;

    // Preferred path: hand the bytes to CloudFront (signed URL, expires with the
    // watch session) so 2 GB lectures do not flow through this box. Falls
    // through to local/S3/Drive proxying when the object is not in S3 yet.
    const cdnExpiry = (() => {
      const cap = new Date(Date.now() + 4 * 60 * 60 * 1000);
      const sess = watchSession?.expiresAt;
      return sess && sess < cap ? sess : cap;
    })();
    const redirectToCdn = async (name: string): Promise<NextResponse | null> => {
      if (!storage.cloudFrontEnabled()) return null;
      if ((await storage.videoSizeInS3(name)) === null) return null;
      const url = await storage.signedVideoUrl(name, cdnExpiry);
      return NextResponse.redirect(url, { status: 302, headers: { "Cache-Control": "no-store, private" } });
    };

    // ── Low-bandwidth rendition ───────────────────────────────────────────────
    // A rendition is a plain object sitting beside the original in both the CDN
    // and the local cache, so once one exists it is served directly — a
    // Drive-backed lesson never has to touch Drive again to answer ?q=.
    if (requestedHeight) {
      const base = safeFilename.startsWith("gdrive_") ? `${safeFilename}.mp4` : effectiveFilename;
      const rendition = await renditions.resolveRenditionName(base, requestedHeight);
      if (rendition !== base) {
        const cdn = await redirectToCdn(rendition);
        if (cdn) return cdn;
        if (fs.existsSync(path.join(UPLOAD_DIR, rendition))) {
          effectiveFilename = rendition;
          servingRendition = true;
        } else if ((await storage.videoSizeInS3(rendition)) !== null) {
          return await storage.streamVideoFromS3(rendition, rangeHeader);
        }
      }
    }

    // ── Google Drive-backed lesson ────────────────────────────────────────────
    // Serving order: CDN → local mirror → S3 copy → Drive proxy. Drive's per-file
    // download quota 403s a popular lecture within hours, so it is only used
    // until a mirror exists; the mirror download starts in the background.
    if (!servingRendition && safeFilename.startsWith("gdrive_")) {
      const fileId = safeFilename.replace(/^gdrive_/, "");
      const { streamGoogleDriveVideo, findDriveMirror, ensureDriveMirror } = await import("@/lib/google-drive");
      const mirror = findDriveMirror(fileId);
      const cdn = await redirectToCdn(mirror ? path.basename(mirror) : `${safeFilename}.mp4`);
      if (cdn) return cdn;
      if (mirror) {
        effectiveFilename = path.basename(mirror);
      } else {
        const { videoSizeInS3, streamVideoFromS3 } = storage;
        const s3Name = `${safeFilename}.mp4`;
        if ((await videoSizeInS3(s3Name)) !== null) {
          return await streamVideoFromS3(s3Name, rangeHeader);
        }
        void ensureDriveMirror(fileId);
        try {
          return await streamGoogleDriveVideo(fileId, rangeHeader);
        } catch (driveErr) {
          console.error("[videos/stream] Google Drive streaming error:", driveErr);
          return NextResponse.json(
            { error: "الفيديو غير متاح مؤقتاً من مصدر التخزين، يرجى المحاولة بعد قليل" },
            { status: 503, headers: { "Retry-After": "120" } }
          );
        }
      }
    }

    const filePath = path.join(UPLOAD_DIR, effectiveFilename);

    if (!servingRendition && !safeFilename.startsWith("gdrive_")) {
      const cdn = await redirectToCdn(effectiveFilename);
      if (cdn) return cdn;
    }

    if (!fs.existsSync(filePath)) {
      // Not on local disk: serve the durable S3 copy if we have one.
      const { videoSizeInS3, streamVideoFromS3 } = storage;
      if ((await videoSizeInS3(effectiveFilename)) !== null) {
        return await streamVideoFromS3(effectiveFilename, rangeHeader);
      }
      // Otherwise check if it's a raw Google Drive file ID
      if (/^[a-zA-Z0-9_-]{20,60}$/.test(safeFilename)) {
        const { streamGoogleDriveVideo } = await import("@/lib/google-drive");
        return await streamGoogleDriveVideo(safeFilename, rangeHeader);
      }
      return NextResponse.json({ error: "الفيديو غير موجود" }, { status: 404 });
    }

    const stat = fs.statSync(filePath);
    const fileSize = stat.size;
    const range = rangeHeader;

    // Determine content type
    let contentType = "video/mp4";
    if (effectiveFilename.endsWith(".webm")) contentType = "video/webm";
    if (effectiveFilename.endsWith(".mov")) contentType = "video/quicktime";
    if (effectiveFilename.endsWith(".mkv")) contentType = "video/x-matroska";

    if (range) {
      const parts = range.replace(/bytes=/, "").split("-");
      // A malformed or out-of-bounds Range must not produce a negative-length
      // read; clamp to the file and reject anything still nonsensical.
      const start = Number.parseInt(parts[0], 10);
      const requestedEnd = parts[1] ? Number.parseInt(parts[1], 10) : fileSize - 1;
      const end = Math.min(Number.isNaN(requestedEnd) ? fileSize - 1 : requestedEnd, fileSize - 1);

      if (Number.isNaN(start) || start < 0 || start > end) {
        return new Response(null, {
          status: 416,
          headers: { "Content-Range": `bytes */${fileSize}` },
        });
      }

      const chunksize = end - start + 1;
      const fileStream = fs.createReadStream(filePath, { start, end });

      const headers = new Headers({
        "Content-Range": `bytes ${start}-${end}/${fileSize}`,
        "Accept-Ranges": "bytes",
        "Content-Length": chunksize.toString(),
        "Content-Type": contentType,
        "Cache-Control": "no-store, private",
      });

      // Node's ReadStream is accepted by undici at runtime but isn't typed as a
      // web ReadableStream; the double cast is the impedance mismatch, not a
      // suppressed type error.
      return new Response(fileStream as unknown as ReadableStream, {
        status: 206,
        headers,
      });
    } else {
      const headers = new Headers({
        "Content-Length": fileSize.toString(),
        "Content-Type": contentType,
        "Accept-Ranges": "bytes",
        "Cache-Control": "no-store, private",
      });

      const fileStream = fs.createReadStream(filePath);
      // Node's ReadStream is accepted by undici at runtime but isn't typed as a
      // web ReadableStream; the double cast is the impedance mismatch, not a
      // suppressed type error.
      return new Response(fileStream as unknown as ReadableStream, {
        status: 200,
        headers,
      });
    }
  } catch (error) {
    // Never surface raw error text (it leaks absolute filesystem paths).
    console.error("[videos/stream] error:", error);
    return NextResponse.json({ error: "فشل عرض الفيديو" }, { status: 500 });
  }
}
