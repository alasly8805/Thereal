import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasPermission } from "@/lib/rbac";
import { getTeacherGraceDays } from "@/lib/settings";

/**
 * Lists soft-deleted teachers. Before listing it lazily PURGES any teacher whose
 * (superadmin-configurable) grace period has elapsed — permanently deleting them
 * and all their courses. This avoids needing a cron job (serverless-friendly).
 */
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session || !hasPermission(session.role, "delete_teacher")) {
    return NextResponse.json({ error: "غير مصرح" }, { status: 403 });
  }

  try {
    const graceDays = await getTeacherGraceDays();
    let purged = 0;
    // ── Lazy purge: anyone past the grace window is gone forever ──
    // Never run this from a showroom session — it would delete real teachers.
    if (!session.demoTour) {
      const cutoff = new Date(Date.now() - graceDays * 86400000);
      const expired = await prisma.user.findMany({
        where: { role: "teacher", isDeleted: true, deletedAt: { lt: cutoff } },
        select: { id: true },
      });
      if (expired.length > 0) {
        const ids = expired.map((t) => t.id);
        await prisma.course.deleteMany({ where: { teacherId: { in: ids } } });
        await prisma.user.deleteMany({ where: { id: { in: ids } } });
        purged = ids.length;
      }
    }

    const { searchParams } = new URL(req.url);
    const name = searchParams.get("name")?.trim() ?? "";
    const where = {
      role: "teacher",
      isDeleted: true,
      ...(session.demoTour ? { isDemo: true } : {}),
      ...(name ? { name: { contains: name } } : {}),
    };

    const teachers = await prisma.user.findMany({
      where,
      select: {
        id: true,
        name: true,
        email: true,
        deletedAt: true,
        createdAt: true,
        _count: { select: { courses: true } },
      },
      orderBy: { deletedAt: "desc" },
    });

    return NextResponse.json({ teachers, graceDays, purged });
  } catch (error) {
    console.error("Deleted teachers fetch error:", error);
    return NextResponse.json({ error: "تعذر جلب المعلمين المحذوفين" }, { status: 500 });
  }
}
