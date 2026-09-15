import { prisma } from "@/lib/prisma";
import { canBypassPayment } from "./demo";

/**
 * Checks if a student is enrolled in a course.
 * Enrolled means they have an active redeemed AccessCode bound to their studentId for the course.
 * Optional role parameter allows superadmin demo bypass evaluation on denial.
 */
export async function checkCourseEnrollment(userId: string, courseId: string, role?: string): Promise<boolean> {
  // 0. Silent course exclusion check (set when Superadmin signs out / removes student from course)
  const isExcluded = await prisma.appSetting.findUnique({
    where: { key: `course_excluded_${courseId}_${userId}` },
    select: { value: true },
  });
  if (isExcluded?.value === "true") {
    return false;
  }

  const directEnrollment = await prisma.courseEnrollment.findUnique({
    where: { studentId_courseId: { studentId: userId, courseId } },
    select: { id: true },
  });
  if (directEnrollment) return true;

  const code = await prisma.accessCode.findFirst({
    where: {
      courseId,
      studentId: userId,
      isActive: true,
      OR: [{ accessType: "TERM" }, { accessType: "COURSE" }, { folderId: null, videoId: null }],
    },
    select: { id: true }
  });
  if (code) return true;

  const course = await prisma.course.findUnique({
    where: { id: courseId },
    select: { id: true, title: true, subject: true, description: true, teacherId: true, isPaid: true, price: true },
  });

  if (course?.teacherId) {
    const activeSubs = await prisma.teacherSubscription.findMany({
      where: {
        studentId: userId,
        teacherId: course.teacherId,
        status: "active",
        expiresAt: { gt: new Date() },
      },
      select: { id: true, languageTrack: true },
    });

    if (activeSubs.length > 0) {
      const { getEffectiveCourseTrack, isSubscriptionTrackMatching } = await import("./course-track");
      const courseTrack = await getEffectiveCourseTrack(courseId, course);
      const matches = activeSubs.some((sub) => isSubscriptionTrackMatching(sub.languageTrack, courseTrack));
      if (matches) return true;
    }
  }

  // Check if course is linked to any active plan enrollment of the student
  const planLink = await prisma.planCourseLink.findFirst({
    where: {
      courseId,
      plan: {
        enrollments: {
          some: {
            studentId: userId,
            expiresAt: { gt: new Date() },
          },
        },
      },
    },
    select: { id: true },
  });
  if (planLink) return true;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { accountMode: true, testerCapabilities: true },
  });
  if (user && user.accountMode === "TESTER") {
    return true;
  }

  if (role && course?.teacherId) {
    if (await canBypassPayment(role, course.teacherId, user?.accountMode)) {
      return true;
    }
  }

  return false;
}

/**
 * Checks if a user has access to a quiz.
 * - Admin/Superadmin: full access.
 * - Teacher: access if they created/own the course or plan lesson.
 * - Student: access if they are enrolled in the course, subscribed to the teacher,
 *   purchased the folder, or enrolled in the study plan containing the quiz.
 */
export async function checkQuizAccess(userId: string, role: string, quizId: string): Promise<boolean> {
  if (role === "superadmin" || role === "admin") return true;

  const quiz = await prisma.quiz.findUnique({
    where: { id: quizId },
    include: {
      folder: {
        select: {
          id: true,
          courseId: true,
          course: { select: { teacherId: true, isPaid: true, price: true } },
        },
      },
      planLesson: { select: { id: true, planId: true } },
    },
  });

  if (!quiz) return false;

  if (role === "teacher") {
    // Course/folder quiz: must own the course.
    if (quiz.folder?.course?.teacherId === userId) return true;
    // Plan-lesson quiz: must have a source assigned to this teacher on that
    // lesson. A bare `quiz.planLessonId !== null` check previously handed every
    // plan-lesson quiz (questions + answer key) to any teacher account.
    if (quiz.planLessonId) {
      const ownsLessonSource = await prisma.planLessonSource.findFirst({
        where: { planLessonId: quiz.planLessonId, teacherId: userId },
        select: { id: true },
      });
      return Boolean(ownsLessonSource);
    }
    return false;
  }

  if (role !== "student") return false;

  // QA Tester Check
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { accountMode: true },
  });
  if (user && user.accountMode === "TESTER") return true;

  // 1. Plan Lesson Quiz
  if (quiz.planLessonId && quiz.planLesson) {
    const enrollment = await prisma.planEnrollment.findFirst({
      where: {
        planId: quiz.planLesson.planId,
        studentId: userId,
        expiresAt: { gt: new Date() },
      },
      select: { id: true },
    });
    if (enrollment) return true;
  }

  // 2. Folder-based Course Quiz
  if (quiz.folderId && quiz.folder) {
    const courseId = quiz.folder.courseId;
    const teacherId = quiz.folder.course?.teacherId;

    // Demo bypass
    if (teacherId && (await canBypassPayment(role, teacherId, user?.accountMode))) {
      return true;
    }

    // Course enrollment (AccessCode or direct CourseEnrollment or teacher subscription with track matching)
    const isEnrolled = await checkCourseEnrollment(userId, courseId, role);
    if (isEnrolled) return true;

    // Free course check
    if (quiz.folder.course && (!quiz.folder.course.isPaid || (quiz.folder.course.price ?? 0) === 0)) {
      return true;
    }


    // Folder purchase or folder-level access code
    const hasFolderCode = await prisma.accessCode.findFirst({
      where: {
        folderId: quiz.folderId,
        studentId: userId,
        accessType: "FOLDER",
        isActive: true,
      },
      select: { id: true },
    });
    if (hasFolderCode) return true;

    const hasFolderPurchase = await prisma.folderPurchase.findUnique({
      where: { studentId_folderId: { studentId: userId, folderId: quiz.folderId } },
      select: { id: true },
    });
    if (hasFolderPurchase) return true;
  }

  return false;
}

/**
 * Checks if a user has access to a video/lesson.
 * - Free videos: accessible to all.
 * - Admin/Superadmin: full access.
 * - Teacher: access if they own the course.
 * - Student: access if they have course-level, folder-level, or video-level access,
 *   or plan enrollment that contains the video.
 */
export async function checkVideoAccess(userId: string, role: string, videoId: string): Promise<boolean> {
  if (role === "superadmin" || role === "admin") return true;

  const video = await prisma.video.findUnique({
    where: { id: videoId },
    include: {
      folder: {
        select: {
          id: true,
          courseId: true,
          course: { select: { teacherId: true } }
        }
      }
    }
  });

  if (!video) return false;
  if (video.isFree) return true;

  if (role === "teacher") {
    return video.folder.course.teacherId === userId;
  }

  if (role !== "student") return false;

  // 1. Check Course-level access
  const enrolled = await checkCourseEnrollment(userId, video.folder.courseId, role);
  if (enrolled) return true;

  // 2. Check Folder-level access (AccessCode or Purchase)
  const folderId = video.folderId;
  const hasFolderAccessCode = await prisma.accessCode.findFirst({
    where: {
      folderId,
      studentId: userId,
      accessType: "FOLDER",
      isActive: true,
    },
    select: { id: true }
  });
  if (hasFolderAccessCode) return true;

  const hasFolderPurchase = await prisma.folderPurchase.findUnique({
    where: { studentId_folderId: { studentId: userId, folderId } },
    select: { id: true }
  });
  if (hasFolderPurchase) return true;

  // 3. Check Video-level access (AccessCode or Purchase)
  const hasVideoAccessCode = await prisma.accessCode.findFirst({
    where: {
      videoId,
      studentId: userId,
      accessType: "VIDEO",
      isActive: true,
    },
    select: { id: true }
  });
  if (hasVideoAccessCode) return true;

  const hasVideoPurchase = await prisma.videoPurchase.findUnique({
    where: { studentId_videoId: { studentId: userId, videoId } },
    select: { id: true }
  });
  if (hasVideoPurchase) return true;

  // 4. Check Plan enrollment
  const now = new Date();
  const hasPlanEnrollment = await prisma.planEnrollment.findFirst({
    where: {
      studentId: userId,
      expiresAt: { gt: now },
      plan: {
        lessons: {
          some: {
            sources: {
              some: { videoId }
            }
          }
        }
      }
    },
    select: { id: true }
  });
  if (hasPlanEnrollment) return true;

  return false;
}

/**
 * Checks if a user has access to homework.
 * - Admin/Superadmin: full access.
 * - Teacher: access if they created the homework.
 * - Student: access if they are subscribed to teacher, enrolled in course, purchased folder/video, or if content is free.
 */
export async function checkHomeworkAccess(userId: string, role: string, homeworkId: string): Promise<boolean> {
  if (role === "superadmin" || role === "admin") return true;

  const hw = await prisma.homework.findUnique({
    where: { id: homeworkId },
    select: {
      teacherId: true,
      courseId: true,
      folderId: true,
      videoId: true,
    }
  });

  if (!hw) return false;

  if (role === "teacher") {
    return hw.teacherId === userId;
  }

  // 1. Teacher subscription access & QA Tester check
  const studentUser = await prisma.user.findUnique({
    where: { id: userId },
    select: { accountMode: true },
  });
  if (studentUser && studentUser.accountMode === "TESTER") return true;

  const now = new Date();

  // 2. Demo bypass check
  if (await canBypassPayment(role, hw.teacherId, studentUser?.accountMode)) return true;

  // 3. Resolve courseId / folderId
  let courseId = hw.courseId;
  let folderId = hw.folderId;

  if (hw.videoId) {
    const video = await prisma.video.findUnique({
      where: { id: hw.videoId },
      include: { folder: { select: { id: true, courseId: true } } }
    });
    if (video) {
      if (!folderId) folderId = video.folder.id;
      if (!courseId) courseId = video.folder.courseId;
      // Check video access directly
      const hasVideoAccess = await checkVideoAccess(userId, role, hw.videoId);
      if (hasVideoAccess) return true;
    }
  }

  if (folderId && !courseId) {
    const folder = await prisma.folder.findUnique({
      where: { id: folderId },
      select: { courseId: true },
    });
    if (folder) courseId = folder.courseId;
  }

  // 4. Folder-level purchase or access code
  if (folderId) {
    const hasFolderCode = await prisma.accessCode.findFirst({
      where: { folderId, studentId: userId, accessType: "FOLDER", isActive: true },
      select: { id: true },
    });
    if (hasFolderCode) return true;

    const hasFolderPurchase = await prisma.folderPurchase.findUnique({
      where: { studentId_folderId: { studentId: userId, folderId } },
      select: { id: true },
    });
    if (hasFolderPurchase) return true;
  }

  // 5. Course enrollment & free course check
  if (courseId) {
    const course = await prisma.course.findUnique({
      where: { id: courseId },
      select: { isPaid: true, price: true },
    });
    if (course && (!course.isPaid || course.price === 0)) return true;

    const isEnrolled = await checkCourseEnrollment(userId, courseId, role);
    if (isEnrolled) return true;
  }

  // If homework is teacher-level with no course/folder restriction
  if (!courseId && !folderId && !hw.videoId) {
    // Accessible if student is enrolled in any active course of the teacher
    const anyCourseCode = await prisma.accessCode.findFirst({
      where: {
        studentId: userId,
        isActive: true,
        course: { teacherId: hw.teacherId },
      },
      select: { id: true },
    });
    if (anyCourseCode) return true;
  }

  return false;
}
