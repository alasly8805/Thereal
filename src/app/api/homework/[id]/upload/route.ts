import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkHomeworkAccess } from "@/lib/authorization";
import {
  canAccessContent,
  canPersistPdfHomeworkUpload,
  contentDeniedPayload,
  ContentType,
  HOMEWORK_REVIEW_REQUESTED_STATUS,
  syncHomeworkContentProgress,
} from "@/lib/content-access-engine";
import path from "path";
import fs from "fs/promises";

const UPLOAD_BASE = path.join(process.cwd(), "uploads", "homework");
const MAX_BYTES = 10 * 1024 * 1024;
const MAX_CHUNK_BYTES = 1.5 * 1024 * 1024;
const MAX_CHUNKS = 40;

export const maxDuration = 120;

const DANGEROUS_EXT = new Set([
  "php", "phtml", "php3", "php4", "php5", "phar",
  "sh", "bash", "exe", "bat", "cmd", "com", "cgi", "jsp", "asp", "aspx",
]);

const MIME_EXT: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "image/heif": "heic",
};

/** POST /api/homework/[id]/upload — secure file upload for homework submissions */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    return await handleUpload(req, params);
  } catch (err) {
    console.error("[homework-upload] unhandled error", err);
    return NextResponse.json(
      { error: "تعذر رفع الملف. جرّب ملف PDF أصغر من 10 ميجابايت أو صيغة jpg/png." },
      { status: 500 }
    );
  }
}

function fieldString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

function resolveExt(fileName: string, mimeType: string) {
  const base = fileName.split(/[/\\]/).pop() || fileName;
  const dot = base.lastIndexOf(".");
  const ext = dot > 0 ? base.slice(dot + 1).toLowerCase() : "";
  const extFromMime = MIME_EXT[(mimeType || "").toLowerCase()] || "";
  return ext || extFromMime;
}

/** Android/WhatsApp shares often omit a filename extension and send octet-stream. */
function sniffExt(buffer: Buffer): string {
  if (buffer.length >= 5 && buffer.subarray(0, 5).toString("latin1") === "%PDF-") return "pdf";
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "jpg";
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
  ) {
    return "png";
  }
  return "";
}

function ensureNamed(originalName: string, ext: string) {
  const lower = originalName.toLowerCase();
  if (lower.endsWith(`.${ext}`) || (ext === "jpg" && lower.endsWith(".jpeg"))) return originalName;
  const base = originalName.replace(/\.[^.]+$/, "") || "upload";
  return `${base}.${ext}`;
}

function rejectType(resolvedExt: string, allowedFileTypes: string | null) {
  if (!resolvedExt || DANGEROUS_EXT.has(resolvedExt)) {
    return NextResponse.json({ error: "نوع الملف غير مسموح. ارفع PDF أو صورة jpg/png." }, { status: 400 });
  }
  if (allowedFileTypes) {
    const allowed = allowedFileTypes.split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
    const aliases: Record<string, string[]> = { jpg: ["jpg", "jpeg"], jpeg: ["jpg", "jpeg"], heic: ["heic", "heif"] };
    const allowedSet = new Set(allowed.flatMap((e) => aliases[e] ?? [e]));
    if (!allowedSet.has(resolvedExt)) {
      return NextResponse.json(
        { error: `نوع الملف غير مسموح. الأنواع المسموحة: ${allowedFileTypes}` },
        { status: 400 }
      );
    }
  }
  return null;
}

async function persistHomeworkFile(opts: {
  homeworkId: string;
  studentId: string;
  originalName: string;
  buffer: Buffer;
  contentType: string;
}) {
  const dir = path.join(UPLOAD_BASE, opts.homeworkId, opts.studentId);
  try {
    const files = await fs.readdir(dir);
    for (const f of files) {
      if (f.startsWith(".chunks")) continue;
      await fs.unlink(path.join(dir, f)).catch(() => {});
    }
  } catch {
    // Directory might not exist yet
  }

  await fs.mkdir(dir, { recursive: true });

  const safeFileName = `${Date.now()}-${opts.originalName.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
  const filePath = path.join(dir, safeFileName);
  await fs.writeFile(filePath, opts.buffer);

  const fileRef = `homework/${opts.homeworkId}/${opts.studentId}/${safeFileName}`;
  try {
    const { uploadToS3 } = await import("@/lib/s3");
    await uploadToS3({
      key: fileRef,
      body: opts.buffer,
      contentType: opts.contentType || "application/octet-stream",
    });
  } catch (s3Err) {
    console.warn("[S3 Homework Upload Notice]:", s3Err);
  }

  const hw = await prisma.homework.findUnique({
    where: { id: opts.homeworkId },
    select: { title: true },
  });

  // Global rule: every stored PDF is قيد المراجعة immediately, including a
  // replacement after teacher reject or a retried upload. Progress is
  // COMPLETED so the next item unlocks even if the follow-up /submit never
  // arrives.
  const completedAt = new Date();
  const submissionData = {
    fileUrl: fileRef,
    fileName: opts.originalName,
    status: HOMEWORK_REVIEW_REQUESTED_STATUS,
    allowRetake: false,
    completedAt,
  };

  await prisma.$transaction(async (tx) => {
    await tx.homeworkSubmission.upsert({
      where: {
        homeworkId_studentId: {
          homeworkId: opts.homeworkId,
          studentId: opts.studentId,
        },
      },
      create: {
        homeworkId: opts.homeworkId,
        studentId: opts.studentId,
        ...submissionData,
      },
      update: submissionData,
    });

    await syncHomeworkContentProgress(
      opts.studentId,
      { type: ContentType.HOMEWORK, sourceId: opts.homeworkId, title: hw?.title },
      HOMEWORK_REVIEW_REQUESTED_STATUS,
      { hasUploadedFile: true, completedAt },
      tx
    );
  });

  return { fileUrl: fileRef, fileName: opts.originalName };
}

async function handleUpload(
  req: NextRequest,
  params: Promise<{ id: string }>
) {
  const session = await getSession();
  // This route is excluded from the proxy matcher (body buffering corrupts
  // FormData), so the global support-view read-only guard never sees it —
  // the check has to live here.
  if (session?.supportView) {
    return NextResponse.json(
      { error: "جلسة دعم فني للاطّلاع فقط — لا يمكن رفع ملف نيابةً عن الطالب.", code: "SUPPORT_VIEW_READONLY" },
      { status: 403 }
    );
  }
  if (!session || session.role !== "student")
    return NextResponse.json({ error: "غير مصرح" }, { status: 403 });

  const { id: homeworkId } = await params;

  const hasAccess = await checkHomeworkAccess(session.id, session.role, homeworkId);
  if (!hasAccess) {
    return NextResponse.json({ error: "غير مصرح لك بالوصول لهذا الواجب" }, { status: 403 });
  }

  const hw = await prisma.homework.findUnique({
    where: { id: homeworkId },
    select: { id: true, title: true, type: true, isPublished: true, allowedFileTypes: true },
  });

  if (!hw || !hw.isPublished || hw.type !== "upload")
    return NextResponse.json({ error: "الواجب غير متاح لرفع الملفات" }, { status: 404 });

  const chainAccess = await canAccessContent(session.id, {
    type: ContentType.HOMEWORK,
    sourceId: homeworkId,
    title: hw.title,
  });
  const denied = contentDeniedPayload(chainAccess);
  if (denied) return NextResponse.json(denied.body, { status: denied.status });

  const existing = await prisma.homeworkSubmission.findUnique({
    where: { homeworkId_studentId: { homeworkId, studentId: session.id } },
    select: { id: true, status: true, allowRetake: true },
  });

  if (
    existing &&
    !canPersistPdfHomeworkUpload(hw.type, existing.status, existing.allowRetake)
  ) {
    return NextResponse.json(
      { error: "تم تسليم الواجب من قبل. انتظر مراجعة المعلم أو إعادة فتح المحاولة.", alreadySubmitted: true },
      { status: 409 }
    );
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch (err) {
    console.warn("[homework-upload] formData parse failed", {
      homeworkId,
      studentId: session.id,
      contentType: req.headers.get("content-type"),
      contentLength: req.headers.get("content-length"),
      err: err instanceof Error ? err.message : err,
    });
    return NextResponse.json(
      { error: "تعذر قراءة الملف. ارفع الملف كـ PDF أو صورة (jpg/png) أصغر من 10 ميجابايت، أو أعد المحاولة على شبكة أفضل." },
      { status: 400 }
    );
  }

  const file = formData.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "لم يتم إرفاق ملف" }, { status: 400 });

  const uploadId = fieldString(formData, "uploadId").trim();
  let originalName = fieldString(formData, "originalName").trim() || file.name || "upload.bin";
  let declaredType = fieldString(formData, "fileType") || file.type || "";
  let resolvedExt = resolveExt(originalName, declaredType);

  if (!uploadId) {
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: "حجم الملف يجب ألا يتجاوز 10 ميجابايت" }, { status: 400 });
    }
    const buffer = Buffer.from(await file.arrayBuffer());
    if (!resolvedExt) {
      resolvedExt = sniffExt(buffer);
      if (resolvedExt) {
        originalName = ensureNamed(originalName, resolvedExt);
        if (!declaredType && resolvedExt === "pdf") declaredType = "application/pdf";
      }
    }
    const typeError = rejectType(resolvedExt, hw.allowedFileTypes);
    if (typeError) return typeError;
    const saved = await persistHomeworkFile({
      homeworkId,
      studentId: session.id,
      originalName,
      buffer,
      contentType: declaredType,
    });
    return NextResponse.json(saved);
  }

  if (!/^[a-zA-Z0-9-]{8,80}$/.test(uploadId)) {
    return NextResponse.json({ error: "معرّف الرفع غير صالح" }, { status: 400 });
  }

  const chunkIndex = Number.parseInt(fieldString(formData, "chunkIndex"), 10);
  const chunkTotal = Number.parseInt(fieldString(formData, "chunkTotal"), 10);
  const declaredSize = Number.parseInt(fieldString(formData, "fileSize"), 10);

  if (
    !Number.isInteger(chunkIndex) ||
    !Number.isInteger(chunkTotal) ||
    chunkIndex < 0 ||
    chunkTotal < 1 ||
    chunkTotal > MAX_CHUNKS ||
    chunkIndex >= chunkTotal
  ) {
    return NextResponse.json({ error: "بيانات أجزاء الملف غير صالحة" }, { status: 400 });
  }

  if (!Number.isFinite(declaredSize) || declaredSize < 1 || declaredSize > MAX_BYTES) {
    return NextResponse.json({ error: "حجم الملف يجب ألا يتجاوز 10 ميجابايت" }, { status: 400 });
  }

  if (file.size > MAX_CHUNK_BYTES) {
    return NextResponse.json({ error: "جزء الملف أكبر من المسموح. أعد المحاولة." }, { status: 400 });
  }

  const chunkDir = path.join(UPLOAD_BASE, homeworkId, session.id, ".chunks", uploadId);
  await fs.mkdir(chunkDir, { recursive: true });
  const chunkPath = path.join(chunkDir, String(chunkIndex));
  const buffer = Buffer.from(await file.arrayBuffer());
  if (chunkIndex === 0 && !resolvedExt) {
    resolvedExt = sniffExt(buffer);
    if (resolvedExt) {
      originalName = ensureNamed(originalName, resolvedExt);
      if (!declaredType && resolvedExt === "pdf") declaredType = "application/pdf";
    }
  }
  if (chunkIndex === 0 || resolvedExt) {
    const typeError = rejectType(resolvedExt, hw.allowedFileTypes);
    if (typeError) return typeError;
  }
  await fs.writeFile(chunkPath, buffer);

  const names = await fs.readdir(chunkDir);
  const received = names.filter((name) => /^\d+$/.test(name)).length;
  if (received < chunkTotal) {
    return NextResponse.json({ received, chunkTotal, complete: false });
  }

  const parts: Buffer[] = [];
  let total = 0;
  for (let i = 0; i < chunkTotal; i += 1) {
    const part = await fs.readFile(path.join(chunkDir, String(i)));
    total += part.length;
    if (total > MAX_BYTES) {
      await fs.rm(chunkDir, { recursive: true, force: true });
      return NextResponse.json({ error: "حجم الملف يجب ألا يتجاوز 10 ميجابايت" }, { status: 400 });
    }
    parts.push(part);
  }

  if (total !== declaredSize) {
    return NextResponse.json(
      { error: "الملف غير مكتمل. أعد رفعه." },
      { status: 400 }
    );
  }

  const assembled = Buffer.concat(parts);
  const saved = await persistHomeworkFile({
    homeworkId,
    studentId: session.id,
    originalName,
    buffer: assembled,
    contentType: declaredType,
  });
  await fs.rm(chunkDir, { recursive: true, force: true });
  return NextResponse.json(saved);
}
