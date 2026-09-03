import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { canBypassPayment } from "@/lib/demo";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const stage = searchParams.get("stage");
    const subject = searchParams.get("subject");
    const teacherId = searchParams.get("teacher");
    const search = searchParams.get("search");

    const session = await getSession();
    const isSuperadmin = session?.role === "superadmin";
    const isTesterUser = session?.accountMode === "TESTER";
    const canSeeDemo = isSuperadmin || isTesterUser;

    const host = req.headers.get("host") || "";
    const isCenterMode =
      req.headers.get("x-center-mode") === "1" ||
      host.startsWith("center.") ||
      searchParams.get("mode") === "center" ||
      req.cookies.get("center_mode")?.value === "1";

    const where: Record<string, unknown> = {
      teacher: teacherId ? (canSeeDemo ? { isDeleted: false } : { isDeleted: false, isDemo: false }) : { isDeleted: false, isDemo: false },
      deliveryMode: isCenterMode
        ? { in: ["CENTER", "BOTH"] }
        : { in: ["ONLINE", "BOTH"] },
    };
    if (stage) where.educationalStage = stage;
    if (subject) where.subject = subject;
    if (teacherId) where.teacherId = teacherId;
    if (search) {
      where.OR = [
        { title: { contains: search, mode: "insensitive" } },
        { subject: { contains: search, mode: "insensitive" } },
        { description: { contains: search, mode: "insensitive" } },
      ];
    }

    // Regular teachers list should NEVER include the demo teacher (it has its own dedicated pinned Showroom card)
    const teacherWhere: Record<string, unknown> = {
      role: "teacher",
      isDeleted: false,
      isDemo: false,
    };

    const [courses, allTeachers] = await Promise.all([
      prisma.course.findMany({
        where,
        include: {
          teacher: {
            select: {
              id: true,
              name: true,
              teacherProfile: { select: { photoUrl: true, displayName: true, slug: true, isPublished: true } },
            },
          },
          _count: { select: { accessCodes: true } },
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.user.findMany({
        where: teacherWhere,
        select: {
          id: true,
          name: true,
          teacherProfile: { select: { photoUrl: true, displayName: true, slug: true, isPublished: true } },
          _count: { select: { courses: true } },
        },
        orderBy: { createdAt: "desc" },
      }),
    ]);

    // Center hub cards advertise the number of recorded sessions per course.
    // `_count` can't traverse Course → Folder → Video, so resolve it with one
    // extra grouped read — and only in center mode, to keep the public list lean.
    const lessonsByCourse = new Map<string, number>();
    if (isCenterMode && courses.length > 0) {
      const folderRows = await prisma.folder.findMany({
        where: { courseId: { in: courses.map((course) => course.id) } },
        select: { courseId: true, _count: { select: { videos: true } } },
      });
      for (const row of folderRows) {
        lessonsByCourse.set(row.courseId, (lessonsByCourse.get(row.courseId) || 0) + row._count.videos);
      }
    }
    const withLessons = <T extends { id: string }>(course: T) => ({
      ...course,
      lessonsCount: lessonsByCourse.get(course.id) || 0,
    });

    const formattedTeachers = allTeachers.map((t) => ({
      id: t.id,
      name: t.teacherProfile?.displayName || t.name,
      photoUrl: t.teacherProfile?.photoUrl || null,
      courseCount: t._count?.courses || 0,
      slug: t.teacherProfile?.slug || null,
      hasPublicPage: !!(t.teacherProfile?.isPublished && t.teacherProfile?.slug),
    }));

    if (!session) {
      const response = NextResponse.json({
        courses: courses.map((course) => ({ ...withLessons(course), hasAccess: false })),
        teachers: formattedTeachers,
      });
      response.headers.set("Cache-Control", "public, max-age=60, s-maxage=300, stale-while-revalidate=600");
      return response;
    }

    const accessCodes = await prisma.accessCode.findMany({
      where: {
        studentId: session.id,
        courseId: { in: courses.map((course) => course.id) },
      },
      select: { courseId: true },
    });

    const accessMap = new Set(accessCodes.map((code) => code.courseId));
    const coursesWithAccess = await Promise.all(
      courses.map(async (course) => {
        const isOwnerTeacher = session.role === "teacher" && course.teacherId === session.id;
        const isAdminPreview = session.role === "admin";
        const isDemoBypass = await canBypassPayment(session.role, course.teacherId, session.accountMode);
        const hasAccess = accessMap.has(course.id) || isOwnerTeacher || isAdminPreview || isDemoBypass || isTesterUser;
        return {
          ...withLessons(course),
          hasAccess,
          isOwnerTeacher,
        };
      })
    );

    const response = NextResponse.json({ courses: coursesWithAccess, teachers: formattedTeachers });
    response.headers.set("Cache-Control", "private, no-cache, no-store, max-age=0, must-revalidate");
    return response;
  } catch (error) {
    console.error("Courses API error:", error);
    return NextResponse.json({ error: "حدث خطأ أثناء تحميل الكورسات" }, { status: 500 });
  }
}
