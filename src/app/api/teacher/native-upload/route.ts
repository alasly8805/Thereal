import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { isTeacherLike, actingTeacherId, hasAssistantPermission } from "@/lib/teacher-scope";
import { initAlaslyUpload, completeAlaslyUpload } from "@/lib/alasly";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { Readable } from "stream";
import { pipeline } from "stream/promises";

const UPLOAD_DIR = path.join(process.cwd(), "uploads", "videos");

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session || (!isTeacherLike(session.role) && session.role !== "admin" && session.role !== "superadmin")) {
      return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
    }
    if (isTeacherLike(session.role) && !hasAssistantPermission(session, "editCourses")) {
      return NextResponse.json({ error: "المدرّس لم يمنحك صلاحية تعديل الكورسات" }, { status: 403 });
    }

    const contentType = req.headers.get("content-type") || "";

    const ALLOWED_VIDEO_EXTS = new Set([".mp4", ".mov", ".mkv", ".webm", ".avi"]);
    const MAX_UPLOAD_SIZE = 2 * 1024 * 1024 * 1024; // 2 GB

    // A. Direct Binary Stream Upload (fastest, lowest memory, smooth progress)
    if (contentType.includes("application/octet-stream") || contentType.startsWith("video/") || contentType.includes("multipart/form-data")) {
      const contentLength = Number(req.headers.get("content-length"));
      if (contentLength && contentLength > MAX_UPLOAD_SIZE) {
        return NextResponse.json({ error: "حجم الملف يتجاوز الحد الأقصى المسموح (2 جيجابايت)" }, { status: 413 });
      }

      if (!fs.existsSync(UPLOAD_DIR)) {
        fs.mkdirSync(UPLOAD_DIR, { recursive: true });
      }

      let originalName = req.headers.get("x-filename") || "video.mp4";
      try {
        originalName = decodeURIComponent(originalName);
      } catch {
        // use fallback if not URI encoded
      }

      const ext = (path.extname(originalName) || ".mp4").toLowerCase();
      if (!ALLOWED_VIDEO_EXTS.has(ext)) {
        return NextResponse.json(
          { error: "نوع امتداد الملف غير مسموح. يرجى رفع ملف فيديو صالح (.mp4, .mov, .mkv, .webm)" },
          { status: 400 }
        );
      }

      const randomId = crypto.randomBytes(8).toString("hex");
      const ownerId = session.id.replace(/[^a-zA-Z0-9_-]/g, "_");
      const filename = `local_${ownerId}_${Date.now()}_${randomId}${ext}`;
      const filePath = path.join(UPLOAD_DIR, filename);

      if (contentType.includes("multipart/form-data")) {
        const formData = await req.formData();
        const file = formData.get("file") as File | null;
        if (!file) {
          return NextResponse.json({ error: "لم يتم اختيار أي ملف للرفع" }, { status: 400 });
        }
        if (file.size > MAX_UPLOAD_SIZE) {
          return NextResponse.json({ error: "حجم الملف يتجاوز الحد الأقصى المسموح (2 جيجابايت)" }, { status: 413 });
        }
        const fileExt = (path.extname(file.name) || ext).toLowerCase();
        if (!ALLOWED_VIDEO_EXTS.has(fileExt)) {
          return NextResponse.json(
            { error: "نوع امتداد الملف غير مسموح. يرجى رفع ملف فيديو صالح (.mp4, .mov, .mkv, .webm)" },
            { status: 400 }
          );
        }
        // Stream multipart file to disk without full memory buffering
        const nodeStream = Readable.fromWeb(file.stream() as Parameters<typeof Readable.fromWeb>[0]);
        const writeStream = fs.createWriteStream(filePath);
        await pipeline(nodeStream, writeStream);
      } else {
        // Stream directly from req.body to disk with byte monitoring
        if (!req.body) {
          return NextResponse.json({ error: "محتوى الملف فارغ" }, { status: 400 });
        }
        const nodeStream = Readable.fromWeb(req.body as Parameters<typeof Readable.fromWeb>[0]);
        const writeStream = fs.createWriteStream(filePath);
        let bytesWritten = 0;
        nodeStream.on("data", (chunk: Buffer) => {
          bytesWritten += chunk.length;
          if (bytesWritten > MAX_UPLOAD_SIZE) {
            writeStream.destroy();
            try { if (fs.existsSync(filePath)) fs.unlinkSync(filePath); } catch {}
          }
        });
        await pipeline(nodeStream, writeStream);
      }

      // Durable copy in S3; local disk is only a cache from here on. The
      // 360p/480p/720p copies are queued off the back of it so every lesson
      // gets them without anyone having to remember to ask.
      const { uploadVideoToS3 } = await import("@/lib/video-storage");
      void uploadVideoToS3(filePath, filename).then(async () => {
        const { enqueueRenditions } = await import("@/lib/rendition-queue");
        enqueueRenditions(filename);
      });

      return NextResponse.json({
        success: true,
        isLocal: true,
        videoId: filename,
        assetId: filename,
        status: "ready",
      });
    }

    // B. JSON payload (init / complete)
    const body = await req.json();
    const action = body.action || "init";

    if (action === "init") {
      const title = body.title || body.filename || "درس جديد";
      const external_ref = body.external_ref || body.lesson_id || `lesson_${Date.now()}`;
      const playback_kind = body.playback_kind || "mp4";
      const filename = body.filename || "video.mp4";
      const fileContentType = body.contentType || "video/mp4";
      const size = Number(body.size) || 0;

      try {
        const result = await initAlaslyUpload({
          title,
          external_ref,
          playback_kind,
          filename,
          contentType: fileContentType,
          size,
        });
        return NextResponse.json({ success: true, isLocal: false, ...result });
      } catch (err: unknown) {
        const errMsg = (err as Error)?.message || "";
        console.warn("[Native Upload] Cloud SaaS init failed, using local server upload fallback:", errMsg);
        return NextResponse.json({
          success: true,
          isLocal: true,
          uploadUrl: "/api/teacher/native-upload",
          assetId: "local_upload",
        });
      }
    }

    if (action === "complete") {
      const assetId = body.assetId || body.asset_id;
      if (!assetId) {
        return NextResponse.json({ error: "assetId مطلوب لإتمام الرفع" }, { status: 400 });
      }

      if (assetId.startsWith("local_")) {
        return NextResponse.json({ success: true, isLocal: true, videoId: assetId, assetId, status: "ready" });
      }

      const duration = typeof body.duration === "number" ? body.duration : undefined;
      const size_bytes =
        typeof body.size_bytes === "number"
          ? body.size_bytes
          : typeof body.size === "number"
          ? body.size
          : undefined;

      try {
        const result = await completeAlaslyUpload({
          assetId,
          duration,
          size_bytes,
        });
        return NextResponse.json({ success: true, isLocal: false, ...result });
      } catch {
        return NextResponse.json({ success: true, isLocal: true, videoId: assetId, assetId, status: "ready" });
      }
    }

    return NextResponse.json({ error: "إجراء غير معروف" }, { status: 400 });
  } catch (error: unknown) {
    console.error("[native-upload] Error:", error);
    return NextResponse.json({ error: "حدث خطأ أثناء معالجة رفع الفيديو" }, { status: 500 });
  }
}
