import { NextRequest, NextResponse } from "next/server";
import { authorizeNativeStream, isStudentViewer } from "@/lib/native-stream-auth";
import fs from "fs";
import path from "path";

const UPLOAD_DIR = path.join(process.cwd(), "uploads", "videos");

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    // Sanitize filename to prevent directory traversal
    const safeFilename = path.basename(id);

    const access = await authorizeNativeStream(req, safeFilename);
    if (access instanceof NextResponse) return access;
    const { watchSession } = access;

    // Once a lesson has its AES-128 HLS package, students only get that: a
    // plain MP4 beside it would make the encryption pointless.
    if (isStudentViewer(access)) {
      const { hlsReady } = await import("@/lib/hls-package");
      if (await hlsReady(safeFilename)) {
        return NextResponse.json({ error: "هذا الدرس يُعرض بالمشغل المشفّر فقط", hls: true }, { status: 403 });
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
