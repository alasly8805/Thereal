import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { canBypassPayment } from "@/lib/demo";
import { isCenterRequest, deliveryModeFilter } from "@/lib/center-mode";

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

    const isCenterMode = isCenterRequest(req);

    const where: Record<string, unknown> = {
      teacher: teacherId ? (canSeeDemo ? { isDeleted: false } : { isDeleted: false, isDemo: false }) : { isDeleted: false, isDemo: false },
      deliveryMode: deliveryModeFilter(isCenterMode),
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
        courses: courses.map((course) => ({ ...withLessons(course), hasAccess: false, inLibrary: false })),
        teachers: formattedTeachers,
      });
      response.headers.set("Cache-Control", "public, max-age=60, s-maxage=300, stale-while-revalidate=600");
      return response;
    }

    const courseIds = courses.map((course) => course.id);
    const teacherIds = Array.from(new Set(courses.map((course) => course.teacherId).filter(Boolean)));

    // Batch-query all forms of course ownership / library access in parallel
    const [accessCodes, directEnrollments, teacherSubs, activePlanLinks] = await Promise.all([
      prisma.accessCode.findMany({
        where: {
          studentId: session.id,
          isActive: true,
          courseId: { in: courseIds },
          OR: [{ accessType: "TERM" }, { accessType: "COURSE" }, { folderId: null, videoId: null }],
        },
        select: { courseId: true },
      }),
      prisma.courseEnrollment.findMany({
        where: {
          studentId: session.id,
          courseId: { in: courseIds },
        },
        select: { courseId: true },
      }),
      prisma.teacherSubscription.findMany({
        where: {
          studentId: session.id,
          status: "active",
          expiresAt: { gt: new Date() },
          teacherId: { in: teacherIds },
        },
        select: { teacherId: true, languageTrack: true },
      }),
      prisma.planCourseLink.findMany({
        where: {
          courseId: { in: courseIds },
          plan: {
            enrollments: {
              some: {
                studentId: session.id,
                expiresAt: { gt: new Date() },
              },
            },
          },
        },
        select: { courseId: true },
      }),
    ]);

    const { getCourseLanguageTrack, isSubscriptionTrackMatching } = await import("@/lib/course-track");

    const accessCodeSet = new Set(accessCodes.map((code) => code.courseId));
    const directEnrollSet = new Set(directEnrollments.map((e) => e.courseId));
    const planCourseSet = new Set(activePlanLinks.map((l) => l.courseId));

    const coursesWithAccess = await Promise.all(
      courses.map(async (course) => {
        const isOwnerTeacher = session.role === "teacher" && course.teacherId === session.id;
        const isAdminPreview = session.role === "admin" || session.role === "superadmin";
        const isDemoBypass = await canBypassPayment(session.role, course.teacherId, session.accountMode);

        const isStandaloneLesson =
          course.id === "cmtqbw41d005qqwobfcrfg07c" ||
          course.id === "cmtr54unr00wfqwwvtbvaxy8q" ||
          course.id === "cmta9me5r0007qxmwnnsq1cez" ||
          course.id === "cmt45qxsf001oqx3e9jtlwny8" ||
          (course.title || "").toLowerCase().includes("شرح الدرس الأول") ||
          (course.title || "").toLowerCase().includes("اول حصة في الشهر") ||
          (course.title || "").toLowerCase().includes("first section");

        const matchesTeacherSub = !isStandaloneLesson && course.teacherId
          ? teacherSubs.some(
              (s) =>
                s.teacherId === course.teacherId &&
                isSubscriptionTrackMatching(s.languageTrack, getCourseLanguageTrack(course))
            )
          : false;

        const inLibrary =
          accessCodeSet.has(course.id) ||
          directEnrollSet.has(course.id) ||
          planCourseSet.has(course.id) ||
          matchesTeacherSub;

        const hasAccess = inLibrary || isOwnerTeacher || isAdminPreview || isDemoBypass || isTesterUser;

        return {
          ...withLessons(course),
          hasAccess,
          inLibrary,
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
