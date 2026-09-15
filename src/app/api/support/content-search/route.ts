import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSupportSession } from "@/lib/support-auth";

/**
 * GET /api/support/content-search?q=...&type=VIDEO|HOMEWORK|QUIZ|COURSE
 *
 * Lets the agent name the lesson or homework from the student's words ("درس
 * الـ loops") instead of needing an id. Powers both the extra-views form and
 * the unlock form. COURSE additionally matches on the teacher's name, since
 * tickets phrase courses as "كورس مستر محمد".
 */
export async function GET(req: NextRequest) {
  const support = await getSupportSession();
  if (!support) return NextResponse.json({ error: "غير مصرح" }, { status: 401 });

  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  const type = (req.nextUrl.searchParams.get("type") || "VIDEO").toUpperCase();
  if (q.length < 2) return NextResponse.json({ results: [] });

  const like = { contains: q, mode: "insensitive" as const };

  if (type === "COURSE") {
    const rows = await prisma.course.findMany({
      where: { OR: [{ title: like }, { teacher: { name: like } }] },
      select: {
        id: true,
        title: true,
        isPaid: true,
        price: true,
        teacher: { select: { name: true } },
        _count: { select: { folders: true } },
      },
      take: 25,
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({
      results: rows.map((r) => ({
        id: r.id,
        title: r.title,
        subtitle: [r.teacher?.name, r.isPaid ? `${r.price} ج` : "مجاني"].filter(Boolean).join(" — "),
        type: "COURSE",
      })),
    });
  }

  if (type === "HOMEWORK") {
    const rows = await prisma.homework.findMany({
      where: { title: like },
      select: { id: true, title: true, dueAt: true, folder: { select: { name: true } } },
      take: 25,
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({
      results: rows.map((r) => ({
        id: r.id,
        title: r.title,
        subtitle: r.folder?.name ?? (r.dueAt ? `آخر موعد ${r.dueAt.toISOString().slice(0, 10)}` : ""),
        type: "HOMEWORK",
      })),
    });
  }

  if (type === "QUIZ") {
    const rows = await prisma.quiz.findMany({
      where: { title: like },
      select: {
        id: true,
        title: true,
        folder: { select: { name: true, course: { select: { title: true } } } },
      },
      take: 25,
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({
      results: rows.map((r) => ({
        id: r.id,
        title: r.title,
        subtitle: [r.folder?.course?.title, r.folder?.name].filter(Boolean).join(" — "),
        type: "QUIZ",
      })),
    });
  }

  const rows = await prisma.video.findMany({
    where: { title: like },
    select: {
      id: true,
      title: true,
      maxWatchesPerUser: true,
      folder: { select: { name: true, course: { select: { title: true } } } },
    },
    take: 25,
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({
    results: rows.map((r) => ({
      id: r.id,
      title: r.title,
      subtitle: [r.folder?.course?.title, r.folder?.name].filter(Boolean).join(" — "),
      baseWatches: r.maxWatchesPerUser,
      type: "VIDEO",
    })),
  });
}
