import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { isTeacherLike, actingTeacherId } from "@/lib/teacher-scope";
import { prisma } from "@/lib/prisma";
import { checkHomeworkAccess } from "@/lib/authorization";
import path from "path";
import fs from "fs/promises";
import { existsSync } from "fs";

const UPLOAD_BASE = path.join(process.cwd(), "uploads", "homework");

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
    
    // Simple extension to content-type map
    const ext = path.extname(cleanFileName).toLowerCase();
    let contentType = "application/octet-stream";
    if (ext === ".pdf") contentType = "application/pdf";
    else if (ext === ".zip") contentType = "application/zip";
    else if (ext === ".py") contentType = "text/x-python";
    else if (ext === ".js") contentType = "application/javascript";
    else if (ext === ".txt") contentType = "text/plain";
    else if ([".png", ".jpg", ".jpeg", ".gif"].includes(ext)) {
      contentType = `image/${ext.replace(".", "")}`;
    }

    // Strip anything that could break out of the quoted filename param (quotes,
    // control chars, CR/LF) before putting it in the response header.
    const headerName = cleanFileName.replace(/[^\w.\- ]+/g, "_");

    return new Response(buffer, {
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `attachment; filename="${headerName}"; filename*=UTF-8''${encodeURIComponent(cleanFileName)}`,
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (err) {
    console.error("Error reading homework file:", err);
    return NextResponse.json({ error: "حدث خطأ أثناء تحميل الملف" }, { status: 500 });
  }
}
