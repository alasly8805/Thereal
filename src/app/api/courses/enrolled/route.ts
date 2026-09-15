/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { unlockAtISO, isScheduledLocked } from "@/lib/publish";

export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "يجب تسجيل الدخول أولاً" }, { status: 401 });
    }
    // Staff accounts don't have an enrolled-courses library
    if (session.role === "staff") {
      return NextResponse.json({ success: true, enrolledCourses: [] });
    }

    const activeSubs = session.role === "student" ? await prisma.teacherSubscription.findMany({
      where: {
        studentId: session.id,
        status: "active",
        expiresAt: { gt: new Date() },
      },
      select: { teacherId: true, languageTrack: true },
    }) : [];

    // Get enrolled or owned courses with minimal data
    const rawEnrolledCourses = await prisma.course.findMany({
      where: session.role === "teacher" ? {
        OR: [
          { teacherId: session.id },
          { accessCodes: { some: { studentId: session.id } } },
        ],
      } : {
        OR: [
          { accessCodes: { some: { studentId: session.id, isActive: true } } },
          { enrollments: { some: { studentId: session.id } } },
          { teacher: { teacherSubscriptions: { some: { studentId: session.id, status: "active", expiresAt: { gt: new Date() } } } } },
          { planCourseLinks: { some: { plan: { enrollments: { some: { studentId: session.id, expiresAt: { gt: new Date() } } } } } } },
        ],
      },
      select: {
        id: true,
        title: true,
        subject: true,
        description: true,
        thumbnailUrl: true,
        educationalStage: true,
        createdAt: true,
        teacher: { select: { id: true, name: true } },
        accessCodes: {
          where: { studentId: session.id, isActive: true },
          select: { id: true },
          take: 1,
        },
        enrollments: {
          where: { studentId: session.id },
          select: { id: true },
          take: 1,
        },
        planCourseLinks: {
          where: {
            plan: {
              enrollments: {
                some: { studentId: session.id, expiresAt: { gt: new Date() } },
              },
            },
          },
          select: { id: true },
          take: 1,
        },
        folders: {
          select: {
            id: true,
            name: true,
            order: true,
            publishAt: true,
            videos: {
              select: { id: true, title: true, order: true, publishAt: true },
            },
            quizzes: {
              select: { id: true, title: true, timeLimitMinutes: true },
            },
          },
          orderBy: { order: "asc" },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const { getCourseLanguageTrack, isSubscriptionTrackMatching } = await import("@/lib/course-track");

    const STANDALONE_LESSON_IDS = new Set([
      "cmtqbw41d005qqwobfcrfg07c", // شرح الدرس الأول (Mohamed Abdelbaset - Arabic)
      "cmtr54unr00wfqwwvtbvaxy8q", // شرح الدرس الأول (Mohamed Abdelbaset - Languages)
      "cmta9me5r0007qxmwnnsq1cez", // First section programming language (Youssef El-Tareq - Languages)
      "cmt45qxsf001oqx3e9jtlwny8", // اول حصة في الشهر الاول عربي (Youssef El-Tareq - Arabic)
    ]);

    const isStandaloneLesson = (course: { id: string; title?: string | null; teacher?: { id: string } | null }) => {
      if (STANDALONE_LESSON_IDS.has(course.id)) return true;
      const title = (course.title || "").toLowerCase();
      if (title.includes("شرح الدرس الأول") || title.includes("اول حصة في الشهر") || title.includes("first section")) {
        return true;
      }
      return false;
    };

    const enrolledCourses = rawEnrolledCourses.filter((course) => {
      if (session.role === "teacher") return true;

      // Standalone single-lesson courses are merged into full monthly courses and hidden from library
      if (isStandaloneLesson(course)) return false;

      if (course.accessCodes && course.accessCodes.length > 0) return true;
      if (course.enrollments && course.enrollments.length > 0) return true;
      if (course.planCourseLinks && course.planCourseLinks.length > 0) return true;

      if (course.teacher?.id) {
        const teacherSubs = activeSubs.filter((s) => s.teacherId === course.teacher.id);
        if (teacherSubs.length > 0) {
          const courseTrack = getCourseLanguageTrack(course);
          return teacherSubs.some((s) => isSubscriptionTrackMatching(s.languageTrack, courseTrack));
        }
      }

      return false;
    });

    // Get all progress records for this student at once
    const progress = await prisma.progress.findMany({
      where: { studentId: session.id },
      select: { videoId: true, watched: true },
    });

    const progressMap = new Map(progress.map(p => [p.videoId, p.watched]));
    const now = Date.now();

    // Build response with corrected progress calculation per course
    const coursesWithProgress = enrolledCourses.map(course => {
      const folders = course.folders.map(folder => ({
        id: folder.id,
        name: folder.name,
        order: folder.order,
        videos: folder.videos.map(video => ({
          id: video.id,
          title: video.title,
          order: video.order,
          watched: progressMap.get(video.id) || false,
          unlockAt: unlockAtISO(folder.publishAt, video.publishAt),
          scheduledLocked: isScheduledLocked(folder.publishAt, video.publishAt, now),
        })),
        quizzes: folder.quizzes.map(quiz => ({
          id: quiz.id,
          title: quiz.title,
          timeLimitMinutes: (quiz as any).timeLimitMinutes,
        })),
      }));

      // Calculate totals correctly per course
      const totalVideos = folders.reduce((sum, f) => sum + f.videos.length, 0);
      const watchedVideos = folders.reduce((sum, f) => sum + f.videos.filter((v) => v.watched).length, 0);

      return {
        id: course.id,
        title: course.title,
        subject: course.subject,
        description: course.description,
        thumbnailUrl: course.thumbnailUrl,
        educationalStage: course.educationalStage,
        teacher: course.teacher,
        folders,
        totalVideos,
        watchedVideos,
      };
    });

    return NextResponse.json(
      {
        success: true,
        enrolledCourses: coursesWithProgress,
      },
      {
        headers: {
          "Cache-Control": "private, no-cache, no-store, max-age=0, must-revalidate",
        },
      }
    );
  } catch (error) {
    console.error("Error fetching enrolled courses:", error);
    return NextResponse.json(
      { error: "Failed to fetch enrolled courses" },
      { status: 500 }
    );
  }
}
