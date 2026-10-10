import { NextRequest, NextResponse } from "next/server";
import path from "path";
import fs from "fs/promises";
import { prisma } from "@/lib/prisma";
import { requireTeacherContext } from "@/lib/teacher-scope-server";
import { zipStream, zipSafeName } from "@/lib/zip-store";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const UPLOADS = path.join(process.cwd(), "uploads");
const MAX_FILES = 400;

/**
 * GET /api/teacher/student-files/zip?homeworkId=… or ?studentId=…
 * One ZIP of the uploaded files, one folder per student (or per homework when
 * downloading a single student's work). One of the two filters is required so
 * a download is always bounded.
 */
export async function GET(req: NextRequest) {
  const gate = await requireTeacherContext("gradeHomework");
  if (!gate.ok) return gate.response;
  const { teacherId } = gate.ctx;

  const homeworkId = req.nextUrl.searchParams.get("homeworkId") || undefined;
  const studentId = req.nextUrl.searchParams.get("studentId") || undefined;
  if (!homeworkId && !studentId) {
    return NextResponse.json({ error: "اختار واجب أو طالب الأول" }, { status: 400 });
  }

  const rows = await prisma.homeworkSubmission.findMany({
    where: {
      fileUrl: { not: null },
      homework: { teacherId },
      student: { accountMode: { not: "TESTER" } },
      ...(homeworkId ? { homeworkId } : {}),
      ...(studentId ? { studentId } : {}),
    },
    orderBy: { completedAt: "asc" },
    take: MAX_FILES,
    select: {
      fileUrl: true,
      fileName: true,
      completedAt: true,
      student: { select: { name: true } },
      homework: { select: { title: true } },
    },
  });
  if (rows.length === 0) return NextResponse.json({ error: "لا توجد ملفات" }, { status: 404 });

  const label = zipSafeName(homeworkId ? rows[0].homework.title : rows[0].student.name, "files");
  const used = new Set<string>();
  const missing: string[] = [];
  let index = 0;

  const stream = zipStream(async () => {
    while (index < rows.length) {
      const row = rows[index++];
      const folder = zipSafeName(homeworkId ? row.student.name : row.homework.title, "student");
      const stored = row.fileUrl!.split("/").pop() || "file";
      const ext = path.extname(stored);
      let base = zipSafeName(row.fileName || stored);
      if (ext && !base.toLowerCase().endsWith(ext.toLowerCase())) base += ext;
      let name = `${folder}/${base}`;
      for (let n = 2; used.has(name); n += 1) name = `${folder}/${n}-${base}`;
      used.add(name);
      try {
        // fileUrl is always homework/<hw>/<student>/<file>; normalize and keep
        // it inside uploads/ regardless.
        const full = path.normalize(path.join(UPLOADS, row.fileUrl!));
        if (!full.startsWith(UPLOADS + path.sep)) throw new Error("outside uploads");
        const data = await fs.readFile(full);
        return { name, data, date: row.completedAt };
      } catch {
        missing.push(name);
      }
    }
    if (missing.length && index === rows.length) {
      index += 1;
      return {
        name: "ملفات-غير-موجودة-على-السيرفر.txt",
        data: Buffer.from(`الملفات دي مش موجودة على السيرفر — افتحها من اللوحة:\n${missing.join("\n")}\n`, "utf8"),
      };
    }
    return null;
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="student-files.zip"; filename*=UTF-8''${encodeURIComponent(label)}.zip`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
