import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkHomeworkAccess } from "@/lib/authorization";
import path from "path";
import fs from "fs/promises";

const UPLOAD_BASE = path.join(process.cwd(), "uploads", "homework");

export const maxDuration = 120;

/** POST /api/homework/[id]/upload — secure file upload for homework submissions */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
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

  // Enforce access control check (verify student is enrolled in the homework's course)
  const hasAccess = await checkHomeworkAccess(session.id, session.role, homeworkId);
  if (!hasAccess) {
    return NextResponse.json({ error: "غير مصرح لك بالوصول لهذا الواجب" }, { status: 403 });
  }

  const hw = await prisma.homework.findUnique({
    where: { id: homeworkId },
    select: { id: true, type: true, isPublished: true, allowedFileTypes: true },
  });

  if (!hw || !hw.isPublished || hw.type !== "upload")
    return NextResponse.json({ error: "الواجب غير متاح لرفع الملفات" }, { status: 404 });

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "بيانات غير صحيحة" }, { status: 400 });
  }

  const file = formData.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "لم يتم إرفاق ملف" }, { status: 400 });

  // Validate file extension
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  // Reject server-executable types outright, even with no per-homework allow-list.
  // (Stored outside the webroot and only served as an authenticated attachment,
  // so this is defence-in-depth, not the primary control.)
  const DANGEROUS_EXT = new Set([
    "php", "phtml", "php3", "php4", "php5", "phar",
    "sh", "bash", "exe", "bat", "cmd", "com", "cgi", "jsp", "asp", "aspx",
  ]);
  if (!ext || DANGEROUS_EXT.has(ext)) {
    return NextResponse.json({ error: "نوع الملف غير مسموح" }, { status: 400 });
  }
  if (hw.allowedFileTypes) {
    const allowed = hw.allowedFileTypes.split(",").map((e) => e.trim().toLowerCase());
    if (!allowed.includes(ext)) {
      return NextResponse.json(
        { error: `نوع الملف غير مسموح. الأنواع المسموحة: ${hw.allowedFileTypes}` },
        { status: 400 }
      );
    }
  }

  // Validate file size (10 MB max)
  if (file.size > 10 * 1024 * 1024) {
    return NextResponse.json({ error: "حجم الملف يجب ألا يتجاوز 10 ميجابايت" }, { status: 400 });
  }

  // Save to isolated directory (NOT inside public/ — no HTTP serving)
  const dir = path.join(UPLOAD_BASE, homeworkId, session.id);
  
  // Clean up existing files in the directory to prevent orphaned files
  try {
    const files = await fs.readdir(dir);
    for (const f of files) {
      await fs.unlink(path.join(dir, f));
    }
  } catch (e) {
    // Directory might not exist yet, ignore
  }

  await fs.mkdir(dir, { recursive: true });

  const safeFileName = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
  const filePath = path.join(dir, safeFileName);
  const buffer = Buffer.from(await file.arrayBuffer());
  await fs.writeFile(filePath, buffer);

  // Storage optimization: Upload to S3
  const fileRef = `homework/${homeworkId}/${session.id}/${safeFileName}`;
  try {
    const { uploadToS3 } = await import("@/lib/s3");
    await uploadToS3({
      key: fileRef,
      body: buffer,
      contentType: file.type || "application/octet-stream",
    });
  } catch (s3Err) {
    console.warn("[S3 Homework Upload Notice]:", s3Err);
  }

  // Return a reference path (NOT a public URL — accessed via /api/homework/[id]/file)
  const existing = await prisma.homeworkSubmission.findUnique({
    where: { homeworkId_studentId: { homeworkId, studentId: session.id } },
    select: { id: true, status: true, allowRetake: true },
  });

  // A locked attempt (passed/failed/in-review) cannot be overwritten by a
  // raw upload. The teacher/assistant must reopen it first.
  if (
    existing &&
    existing.status !== "pending" &&
    !existing.allowRetake
  ) {
    return NextResponse.json(
      { error: "تم تسليم الواجب من قبل. انتظر مراجعة المعلم أو إعادة فتح المحاولة.", alreadySubmitted: true },
      { status: 409 }
    );
  }

  if (existing) {
    await prisma.homeworkSubmission.update({
      where: { id: existing.id },
      data: {
        fileUrl: fileRef,
        fileName: file.name,
        status: "pending",
        completedAt: new Date(),
      },
    });
  }

  return NextResponse.json({
    fileUrl: fileRef,
    fileName: file.name,
    replaced: Boolean(existing),
  });
}
