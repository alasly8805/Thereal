import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isCenterRequest, deliveryModeFilter } from "@/lib/center-mode";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "غير مصرح" }, { status: 401 });

  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) return NextResponse.json({ courses: [], teachers: [], videos: [] });

  const isStudent = session.role === "student";
  const isSuperadmin = session.role === "superadmin";
  const isTesterUser = session.accountMode === "TESTER";
  const canSeeDemo = isSuperadmin || isTesterUser;

  const teacherFilter = canSeeDemo ? { isDeleted: false } : { isDeleted: false, isDemo: false };

  // Parallel search across courses, teachers, videos
  const [courses, teachers, videos] = await Promise.all([
    prisma.course.findMany({
      where: {
        OR: [
          { title:       { contains: q } },
          { subject:     { contains: q } },
          { description: { contains: q } },
        ],
        teacher: teacherFilter,
        // Keep centre-only courses out of online search results (and vice versa).
        deliveryMode: deliveryModeFilter(isCenterRequest(req)),
        ...(isStudent ? {
          accessCodes: { some: { studentId: session.id, isActive: true } },
        } : {}),
      },
      select: { id: true, title: true, subject: true, thumbnailUrl: true, teacher: { select: { name: true } } },
      take: 5,
    }),

    prisma.user.findMany({
      where: {
        role: "teacher",
        isDeleted: false,
        ...(canSeeDemo ? {} : { isDemo: false }),
        OR: [{ name: { contains: q } }],
        teacherProfile: { isPublished: true },
      },
      select: { id: true, name: true, teacherProfile: { select: { slug: true, photoUrl: true } } },
      take: 4,
    }),

    isStudent ? prisma.video.findMany({
      where: {
        OR: [{ title: { contains: q } }],
        folder: {
          course: {
            accessCodes: { some: { studentId: session.id, isActive: true } },
          },
        },
      },
      select: {
        id: true,
        title: true,
        folderId: true,
        folder: { select: { courseId: true, course: { select: { title: true } } } },
      },
      take: 5,
    }) : Promise.resolve([]),
  ]);

  return NextResponse.json(
    { courses, teachers, videos },
    { headers: { "Cache-Control": "private, max-age=30" } }
  );
}
