import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSupportSession } from "@/lib/support-auth";

/**
 * GET /api/support/content-tree
 *
 * Browse-style content selection for agents who don't know the item's name —
 * the complement to /api/support/content-search (which needs a title). Three
 * levels, each driven by the previous pick:
 *
 *   (no params)                          → courses   [{ id, title, subtitle }]
 *   ?courseId=...                        → folders   [{ id, title, subtitle }]
 *   ?courseId=...&folderId=...&type=...  → items     [{ id, title, subtitle, type, baseWatches? }]
 *
 * type is VIDEO (default) | HOMEWORK | QUIZ. Course-level homework (folderId
 * null) is listed under every folder of its course, since that is where the
 * student meets it.
 */
export async function GET(req: NextRequest) {
  const support = await getSupportSession();
  if (!support) return NextResponse.json({ error: "غير مصرح" }, { status: 401 });

  const courseId = req.nextUrl.searchParams.get("courseId")?.trim() ?? "";
  const folderId = req.nextUrl.searchParams.get("folderId")?.trim() ?? "";
  const type = (req.nextUrl.searchParams.get("type") || "VIDEO").toUpperCase();

  // Level 1: courses.
  if (!courseId) {
    const courses = await prisma.course.findMany({
      where: { isVirtual: false },
      select: {
        id: true,
        title: true,
        educationalStage: true,
        teacher: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 500,
    });
    return NextResponse.json({
      courses: courses.map((c) => ({
        id: c.id,
        title: c.title,
        subtitle: [c.teacher.name, c.educationalStage].filter(Boolean).join(" — "),
      })),
    });
  }

  // Level 2: folders of one course.
  if (!folderId) {
    const folders = await prisma.folder.findMany({
      where: { courseId },
      select: { id: true, name: true, _count: { select: { videos: true } } },
      orderBy: [{ order: "asc" }, { createdAt: "asc" }],
      take: 200,
    });
    return NextResponse.json({
      folders: folders.map((f) => ({
        id: f.id,
        title: f.name,
        subtitle: `${f._count.videos} درس`,
      })),
    });
  }

  // Level 3: items of one folder, by type.
  const like = { folderId };

  if (type === "HOMEWORK") {
    const rows = await prisma.homework.findMany({
      where: {
        isPublished: true,
        OR: [{ folderId }, { courseId, folderId: null }],
      },
      select: { id: true, title: true, dueAt: true, type: true },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    return NextResponse.json({
      results: rows.map((r) => ({
        id: r.id,
        title: r.title,
        subtitle: r.dueAt ? `آخر موعد ${r.dueAt.toISOString().slice(0, 10)}` : "",
        type: "HOMEWORK",
      })),
    });
  }

  if (type === "QUIZ") {
    const rows = await prisma.quiz.findMany({
      where: like,
      select: { id: true, title: true, _count: { select: { questions: true } } },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    return NextResponse.json({
      results: rows.map((r) => ({
        id: r.id,
        title: r.title,
        subtitle: `${r._count.questions} سؤال`,
        type: "QUIZ",
      })),
    });
  }

  const rows = await prisma.video.findMany({
    where: like,
    select: { id: true, title: true, maxWatchesPerUser: true, isFree: true },
    orderBy: [{ order: "asc" }, { createdAt: "asc" }],
    take: 200,
  });
  return NextResponse.json({
    results: rows.map((r) => ({
      id: r.id,
      title: r.title,
      subtitle: r.isFree ? "مجاني" : "",
      baseWatches: r.maxWatchesPerUser,
      type: "VIDEO",
    })),
  });
}
