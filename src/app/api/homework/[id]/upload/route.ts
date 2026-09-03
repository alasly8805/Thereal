import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkHomeworkAccess } from "@/lib/authorization";
import path from "path";
import fs from "fs/promises";

const UPLOAD_BASE = path.join(process.cwd(), "uploads", "homework");

/** POST /api/homework/[id]/upload — secure file upload for homework submissions */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
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

  // Return a reference path (NOT a public URL — accessed via /api/homework/[id]/file)
  const fileRef = `homework/${homeworkId}/${session.id}/${safeFileName}`;

  return NextResponse.json({
    fileUrl: fileRef,
    fileName: file.name,
  });
}
