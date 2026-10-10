import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { isTeacherLike, actingTeacherId, hasAssistantPermission } from "@/lib/teacher-scope";
import { prisma } from "@/lib/prisma";
import { checkHomeworkAccess } from "@/lib/authorization";
import path from "path";
import fs from "fs/promises";
import { existsSync } from "fs";

const UPLOAD_BASE = path.join(process.cwd(), "uploads", "homework");

const CONTENT_TYPES: Record<string, string> = {
  ".pdf": "application/pdf",
  ".zip": "application/zip",
  ".py": "text/x-python",
  ".js": "application/javascript",
  ".txt": "text/plain",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".heic": "image/heic",
};

/**
 * Types the browser may render in place (`?inline=1`, the teacher's preview).
 * Everything else, SVG and HTML included, is always a download, so a student
 * file can never run script on this origin.
 */
const INLINE_SAFE = new Set(["application/pdf", "image/png", "image/jpeg", "image/gif", "image/webp"]);

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "غير مصرح" }, { status: 401 });

  const { id: homeworkId } = await params;
  const { searchParams } = new URL(req.url);
  const fileName = searchParams.get("fileName");
  const studentId = searchParams.get("studentId");
  const wantInline = searchParams.get("inline") === "1";

  if (!fileName || !studentId) {
    return NextResponse.json({ error: "بيانات غير كاملة" }, { status: 400 });
  }

  // Sanitize inputs to prevent path traversal
  const cleanFileName = path.basename(fileName);
  const cleanStudentId = path.basename(studentId);

  // Authorize
  if (session.role === "student") {
    if (session.id !== cleanStudentId) {
      return NextResponse.json({ error: "غير مصرح لك بالوصول لملف طالب آخر" }, { status: 403 });
    }
    const hasAccess = await checkHomeworkAccess(session.id, session.role, homeworkId);
    if (!hasAccess) {
      return NextResponse.json({ error: "غير مصرح لك بالوصول لهذا الواجب" }, { status: 403 });
    }
  } else if (isTeacherLike(session.role)) {
    if (!hasAssistantPermission(session, "gradeHomework") && !hasAssistantPermission(session, "manageHomework")) {
      return NextResponse.json({ error: "المدرّس لم يمنحك صلاحية الواجبات" }, { status: 403 });
    }
    const hw = await prisma.homework.findUnique({
      where: { id: homeworkId },
      select: { teacherId: true }
    });
    if (!hw || hw.teacherId !== actingTeacherId(session)) {
      return NextResponse.json({ error: "غير مصرح لك بالوصول لواجب كورس آخر" }, { status: 403 });
    }
  } else if (session.role !== "admin" && session.role !== "superadmin") {
    return NextResponse.json({ error: "غير مصرح" }, { status: 403 });
  }

  const filePath = path.join(UPLOAD_BASE, homeworkId, cleanStudentId, cleanFileName);

  if (!existsSync(filePath)) {
    // Check if file exists in S3
    try {
      const { getPresignedDownloadUrl } = await import("@/lib/s3");
      const s3Key = `homework/${homeworkId}/${cleanStudentId}/${cleanFileName}`;
      const presignedUrl = await getPresignedDownloadUrl(s3Key, 300);
      return NextResponse.redirect(presignedUrl);
    } catch {
      return NextResponse.json({ error: "الملف غير موجود" }, { status: 404 });
    }
  }

  try {
    const buffer = await fs.readFile(filePath);
    
    const ext = path.extname(cleanFileName).toLowerCase();
    const contentType = CONTENT_TYPES[ext] ?? "application/octet-stream";
    const inline = wantInline && INLINE_SAFE.has(contentType);

    // Strip anything that could break out of the quoted filename param (quotes,
    // control chars, CR/LF) before putting it in the response header.
    const headerName = cleanFileName.replace(/[^\w.\- ]+/g, "_");

    return new Response(buffer, {
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${headerName}"; filename*=UTF-8''${encodeURIComponent(cleanFileName)}`,
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, no-store",
      },
    });
  } catch (err) {
    console.error("Error reading homework file:", err);
    return NextResponse.json({ error: "حدث خطأ أثناء تحميل الملف" }, { status: 500 });
  }
}
