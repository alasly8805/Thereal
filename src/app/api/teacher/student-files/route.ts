import { NextRequest, NextResponse } from "next/server";
import path from "path";
import fs from "fs/promises";
import { Prisma } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";
import { applyPhoneVisibility } from "@/lib/teacher-scope";
import { requireTeacherContext } from "@/lib/teacher-scope-server";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 24;
const UPLOADS = path.join(process.cwd(), "uploads");

type StatusFilter = "all" | "review" | "accepted" | "rejected";

function statusWhere(status: StatusFilter): Prisma.HomeworkSubmissionWhereInput {
  if (status === "review") return { status: { in: ["review_requested", "pending"] } };
  if (status === "accepted") return { status: "passed" };
  if (status === "rejected") return { status: "failed" };
  return {};
}

/**
 * GET /api/teacher/student-files — every file students uploaded to this
 * teacher's homework, newest first. Filters: q (student name / email /
 * phone), homeworkId, studentId, status, page.
 */
export async function GET(req: NextRequest) {
  const gate = await requireTeacherContext("gradeHomework");
  if (!gate.ok) return gate.response;
  const { teacherId, permissions } = gate.ctx;

  const sp = req.nextUrl.searchParams;
  const q = (sp.get("q") ?? "").trim().slice(0, 80);
  const homeworkId = sp.get("homeworkId") || undefined;
  const studentId = sp.get("studentId") || undefined;
  const rawStatus = sp.get("status") as StatusFilter | null;
  const status: StatusFilter = rawStatus && ["all", "review", "accepted", "rejected"].includes(rawStatus) ? rawStatus : "all";
  const page = Math.max(0, Math.min(10_000, Number(sp.get("page")) || 0));

  const base: Prisma.HomeworkSubmissionWhereInput = {
    fileUrl: { not: null },
    homework: { teacherId },
    student: { accountMode: { not: "TESTER" } },
  };
  const where: Prisma.HomeworkSubmissionWhereInput = {
    ...base,
    ...statusWhere(status),
    ...(homeworkId ? { homeworkId } : {}),
    ...(studentId ? { studentId } : {}),
    ...(q
      ? {
          student: {
            accountMode: { not: "TESTER" },
            OR: [
              { name: { contains: q, mode: "insensitive" } },
              { email: { contains: q, mode: "insensitive" } },
              { phone: { contains: q } },
            ],
          },
        }
      : {}),
  };

  try {
    const [total, rows, byStatus, students, homeworkCounts] = await Promise.all([
      prisma.homeworkSubmission.count({ where }),
      prisma.homeworkSubmission.findMany({
        where,
        orderBy: { completedAt: "desc" },
        skip: page * PAGE_SIZE,
        take: PAGE_SIZE,
        select: {
          id: true,
          homeworkId: true,
          studentId: true,
          fileUrl: true,
          fileName: true,
          status: true,
          allowRetake: true,
          completedAt: true,
          review: { select: { verdict: true, note: true, reviewedAt: true } },
          student: { select: { id: true, name: true, email: true, phone: true } },
          homework: {
            select: { title: true, folder: { select: { name: true, course: { select: { title: true } } } } },
          },
        },
      }),
      prisma.homeworkSubmission.groupBy({ by: ["status"], where: base, _count: { _all: true } }),
      prisma.homeworkSubmission.findMany({ where: base, distinct: ["studentId"], select: { studentId: true } }),
      prisma.homeworkSubmission.groupBy({ by: ["homeworkId"], where: base, _count: { _all: true } }),
    ]);

    const hwTitles = await prisma.homework.findMany({
      where: { id: { in: homeworkCounts.map((h) => h.homeworkId) } },
      select: { id: true, title: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    });
    const countByHw = new Map(homeworkCounts.map((h) => [h.homeworkId, h._count._all]));

    const statusCount = (keys: string[]) =>
      byStatus.filter((s) => keys.includes(s.status)).reduce((n, s) => n + s._count._all, 0);

    const files = await Promise.all(
      rows.map(async (r) => {
        const stored = r.fileUrl!.split("/").pop() || "";
        const ext = (path.extname(r.fileName || stored).slice(1) || path.extname(stored).slice(1)).toLowerCase();
        let size: number | null = null;
        try {
          size = (await fs.stat(path.join(UPLOADS, r.fileUrl!))).size;
        } catch {
          size = null; // S3-only copy; the file route redirects there
        }
        const qs = `studentId=${encodeURIComponent(r.studentId)}&fileName=${encodeURIComponent(stored)}`;
        const student = applyPhoneVisibility(
          { ...r.student } as Record<string, unknown>,
          permissions.viewStudentPhones,
          ["phone"]
        ) as typeof r.student;
        return {
          submissionId: r.id,
          homeworkId: r.homeworkId,
          homeworkTitle: r.homework.title,
          place: [r.homework.folder?.course?.title, r.homework.folder?.name].filter(Boolean).join(" · ") || null,
          student,
          fileName: r.fileName || stored,
          ext,
          size,
          status: r.status,
          allowRetake: r.allowRetake,
          review: r.review,
          completedAt: r.completedAt,
          previewUrl: `/api/homework/${r.homeworkId}/file?${qs}&inline=1`,
          downloadUrl: `/api/homework/${r.homeworkId}/file?${qs}`,
        };
      })
    );

    return NextResponse.json({
      stats: {
        total: statusCount(["review_requested", "pending", "passed", "failed"]),
        awaitingReview: statusCount(["review_requested", "pending"]),
        accepted: statusCount(["passed"]),
        rejected: statusCount(["failed"]),
        students: students.length,
      },
      homeworks: hwTitles.map((h) => ({ id: h.id, title: h.title, count: countByHw.get(h.id) ?? 0 })),
      files,
      page,
      pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)),
      total,
    });
  } catch (error) {
    console.error("[teacher/student-files GET]", error);
    return NextResponse.json({ error: "تعذر تحميل ملفات الطلاب" }, { status: 500 });
  }
}
