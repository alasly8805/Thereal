import { prisma } from "@/lib/prisma";
import { TeacherVisibilityService } from "@/services/teacher/TeacherVisibilityService";
import { maskPhone } from "@/lib/teacher-scope";

const REAL_STUDENT = {
  role: "student" as const,
  isVirtual: false,
  isDeleted: false,
  accountMode: { not: "TESTER" as const },
};

/** TeacherSubscription has no isPaid column — paid = active + amount > 0. */
function paidActiveSubscriptionWhere(teacherId: string) {
  return {
    some: {
      teacherId,
      status: "active",
      amount: { gt: 0 },
    },
  };
}

export type TeacherStudentRow = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  parentPhone: string | null;
  educationalStage: string | null;
  isActive: boolean;
  lastLoginAt: string | null;
  courses: Array<{ id: string; title: string }>;
};

export async function listTeacherStudents(
  teacherId: string,
  canSeePhones: boolean
): Promise<TeacherStudentRow[]> {
  const students = await prisma.user.findMany({
    where: {
      ...REAL_STUDENT,
      OR: [
        { accessCodes: { some: { isActive: true, course: { teacherId } } } },
        { courseEnrollments: { some: { course: { teacherId } } } },
      ],
      studentSubscriptions: paidActiveSubscriptionWhere(teacherId),
    },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      parentPhone: true,
      educationalStage: true,
      isActive: true,
      lastLoginAt: true,
      courseEnrollments: {
        where: { course: { teacherId, isPaid: true, price: { gt: 0 } } },
        select: { course: { select: { id: true, title: true } } },
      },
      accessCodes: {
        where: { isActive: true, course: { teacherId, isPaid: true, price: { gt: 0 } } },
        select: { course: { select: { id: true, title: true } } },
      },
    },
  });

  return students.map((s) => {
    const courses = new Map<string, { id: string; title: string }>();
    for (const row of [...s.courseEnrollments, ...s.accessCodes]) {
      if (row.course) courses.set(row.course.id, row.course);
    }
    return {
      id: s.id,
      name: s.name,
      email: s.email,
      phone: canSeePhones ? s.phone : maskPhone(s.phone),
      parentPhone: canSeePhones ? s.parentPhone : maskPhone(s.parentPhone),
      educationalStage: s.educationalStage,
      isActive: s.isActive,
      lastLoginAt: s.lastLoginAt ? s.lastLoginAt.toISOString() : null,
      courses: [...courses.values()],
    };
  });
}

async function getActiveCoursesByStudent(
  teacherId: string,
  studentIds: string[]
): Promise<Map<string, Array<{ id: string; title: string }>>> {
  const map = new Map<string, Map<string, { id: string; title: string }>>();
  if (studentIds.length === 0) return new Map();

  const [enrollments, codes] = await Promise.all([
    prisma.courseEnrollment.findMany({
      where: {
        studentId: { in: studentIds },
        fulfillmentSource: { not: "TESTER_BYPASS" },
        course: { teacherId, isPaid: true, price: { gt: 0 } },
      },
      select: { studentId: true, course: { select: { id: true, title: true } } },
    }),
    prisma.accessCode.findMany({
      where: {
        studentId: { in: studentIds },
        isActive: true,
        course: { teacherId, isPaid: true, price: { gt: 0 } },
      },
      select: { studentId: true, course: { select: { id: true, title: true } } },
    }),
  ]);

  const add = (studentId: string, course: { id: string; title: string }) => {
    if (!map.has(studentId)) map.set(studentId, new Map());
    map.get(studentId)!.set(course.id, course);
  };
  for (const row of enrollments) add(row.studentId, row.course);
  for (const row of codes) {
    if (row.studentId) add(row.studentId, row.course);
  }

  return new Map([...map.entries()].map(([id, courses]) => [id, [...courses.values()]]));
}

export async function getTeacherReports(teacherId: string, canSeePhones: boolean) {
  const students = await listTeacherStudents(teacherId, canSeePhones);
  const ids = students.map((s) => s.id);
  const activeByStudent = await getActiveCoursesByStudent(teacherId, ids);
  const activeCourseIds = [...new Set([...activeByStudent.values()].flat().map((c) => c.id))];

  const [homeworkByCourse, videoByCourse, quizByCourse, submissions, quizResults, progress] =
    await Promise.all([
      activeCourseIds.length
        ? prisma.homework.groupBy({
            by: ["courseId"],
            where: { teacherId, isPublished: true, courseId: { in: activeCourseIds } },
            _count: { _all: true },
          })
        : Promise.resolve([]),
      activeCourseIds.length
        ? prisma.video.groupBy({
            by: ["folderId"],
            where: { folder: { courseId: { in: activeCourseIds } } },
            _count: { _all: true },
          })
        : Promise.resolve([]),
      activeCourseIds.length
        ? prisma.quiz.findMany({
            where: { folder: { courseId: { in: activeCourseIds } } },
            select: { folder: { select: { courseId: true } } },
          })
        : Promise.resolve([]),
      ids.length && activeCourseIds.length
        ? prisma.homeworkSubmission.findMany({
            where: {
              studentId: { in: ids },
              homework: { teacherId, courseId: { in: activeCourseIds } },
            },
            select: { studentId: true, homework: { select: { courseId: true } } },
          })
        : Promise.resolve([]),
      ids.length && activeCourseIds.length
        ? prisma.quizResult.findMany({
            where: {
              studentId: { in: ids },
              completedAt: { not: null },
              quiz: { folder: { courseId: { in: activeCourseIds } } },
            },
            select: {
              studentId: true,
              score: true,
              totalQ: true,
              quiz: { select: { folder: { select: { courseId: true } } } },
            },
          })
        : Promise.resolve([]),
      ids.length && activeCourseIds.length
        ? prisma.progress.findMany({
            where: {
              studentId: { in: ids },
              video: { folder: { courseId: { in: activeCourseIds } } },
            },
            select: {
              studentId: true,
              video: { select: { folder: { select: { courseId: true } } } },
            },
          })
        : Promise.resolve([]),
    ]);

  const folderCourses =
    activeCourseIds.length > 0
      ? await prisma.folder.findMany({
          where: { courseId: { in: activeCourseIds } },
          select: { id: true, courseId: true },
        })
      : [];
  const folderToCourse = new Map(folderCourses.map((f) => [f.id, f.courseId]));
  const videosPerCourse = new Map<string, number>();
  for (const row of videoByCourse) {
    const courseId = folderToCourse.get(row.folderId);
    if (!courseId) continue;
    videosPerCourse.set(courseId, (videosPerCourse.get(courseId) ?? 0) + row._count._all);
  }
  const homeworkPerCourse = new Map(
    homeworkByCourse
      .filter((r): r is typeof r & { courseId: string } => Boolean(r.courseId))
      .map((r) => [r.courseId, r._count._all])
  );
  const quizzesPerCourse = new Map<string, number>();
  for (const q of quizByCourse) {
    const courseId = q.folder?.courseId;
    if (!courseId) continue;
    quizzesPerCourse.set(courseId, (quizzesPerCourse.get(courseId) ?? 0) + 1);
  }

  const inStudentCourses = (studentId: string, courseId?: string | null) => {
    if (!courseId) return false;
    return (activeByStudent.get(studentId) || []).some((c) => c.id === courseId);
  };

  const hwByStudent = new Map<string, number>();
  for (const row of submissions) {
    if (!inStudentCourses(row.studentId, row.homework.courseId)) continue;
    hwByStudent.set(row.studentId, (hwByStudent.get(row.studentId) ?? 0) + 1);
  }
  const quizByStudent = new Map<string, { taken: number; sum: number }>();
  for (const row of quizResults) {
    if (!inStudentCourses(row.studentId, row.quiz.folder?.courseId)) continue;
    const cur = quizByStudent.get(row.studentId) || { taken: 0, sum: 0 };
    cur.taken += 1;
    cur.sum += row.totalQ > 0 ? (row.score / row.totalQ) * 100 : row.score;
    quizByStudent.set(row.studentId, cur);
  }
  const watchByStudent = new Map<string, number>();
  for (const row of progress) {
    if (!inStudentCourses(row.studentId, row.video.folder.courseId)) continue;
    watchByStudent.set(row.studentId, (watchByStudent.get(row.studentId) ?? 0) + 1);
  }

  const countFor = (studentId: string, perCourse: Map<string, number>) =>
    (activeByStudent.get(studentId) || []).reduce((sum, c) => sum + (perCourse.get(c.id) ?? 0), 0);

  const rows = students.map((s) => {
    const quiz = quizByStudent.get(s.id);
    const activeCourses = activeByStudent.get(s.id) || [];
    return {
      ...s,
      courses: activeCourses,
      noActiveCourse: activeCourses.length === 0,
      homeworkSubmitted: hwByStudent.get(s.id) ?? 0,
      homeworkTotal: countFor(s.id, homeworkPerCourse),
      quizzesTaken: quiz?.taken ?? 0,
      quizAverage: quiz ? Math.round(quiz.sum / quiz.taken) : null,
      videosWatched: watchByStudent.get(s.id) ?? 0,
      videosTotal: countFor(s.id, videosPerCourse),
    };
  });

  return {
    totals: {
      students: students.length,
      homeworks: [...homeworkPerCourse.values()].reduce((a, b) => a + b, 0),
      quizzes: [...quizzesPerCourse.values()].reduce((a, b) => a + b, 0),
      videos: [...videosPerCourse.values()].reduce((a, b) => a + b, 0),
    },
    students: rows,
  };
}

export async function getTeacherStudentReport(
  teacherId: string,
  studentId: string,
  canSeePhones: boolean
) {
  const visible = await TeacherVisibilityService.findStudentById(teacherId, studentId);
  if (!visible) return null;

  const paidSub = await prisma.teacherSubscription.findFirst({
    where: { teacherId, studentId, status: "active", amount: { gt: 0 } },
    select: { id: true },
  });
  if (!paidSub) return null;

  const student = await prisma.user.findFirst({
    where: { id: studentId, ...REAL_STUDENT },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      parentPhone: true,
      educationalStage: true,
      isActive: true,
      lastLoginAt: true,
      createdAt: true,
      loginStreak: true,
    },
  });
  if (!student) return null;

  const activeCourses =
    (await getActiveCoursesByStudent(teacherId, [studentId])).get(studentId) || [];
  const activeCourseIds = activeCourses.map((c) => c.id);
  const noActiveCourse = activeCourseIds.length === 0;

  const emptyReport = {
    student: {
      id: student.id,
      name: student.name,
      email: student.email,
      phone: canSeePhones ? student.phone : maskPhone(student.phone),
      parentPhone: canSeePhones ? student.parentPhone : maskPhone(student.parentPhone),
      educationalStage: student.educationalStage,
      isActive: student.isActive,
      lastLoginAt: student.lastLoginAt ? student.lastLoginAt.toISOString() : null,
      createdAt: student.createdAt.toISOString(),
      loginStreak: student.loginStreak,
    },
    courses: [] as Array<{ id: string; title: string }>,
    activeCourses: [] as Array<{ id: string; title: string }>,
    noActiveCourse: true,
    message: "لا يوجد كورس مفعل",
    summary: {
      courses: 0,
      homeworkTotal: 0,
      homeworkSubmitted: 0,
      quizzesTaken: 0,
      quizAverage: null as number | null,
      videosOpened: 0,
      videosWatched: 0,
    },
    homework: [] as Array<{
      id: string;
      title: string;
      type: string;
      dueAt: string | null;
      submitted: boolean;
      status: string;
      score: number | null;
      totalQ: number | null;
      completedAt: string | null;
      fileName: string | null;
    }>,
    grades: [] as Array<{
      quizId: string;
      title: string;
      courseTitle: string | null;
      score: number;
      totalQ: number;
      percent: number;
      completedAt: string | null;
    }>,
    attendance: [] as Array<{
      videoId: string;
      title: string;
      folder: string;
      courseTitle: string;
      watched: boolean;
      percent: number;
      lastWatchedAt: string | null;
    }>,
  };

  if (noActiveCourse) {
    return emptyReport;
  }

  const [homeworks, homeworkSubs, quizResults, progressRows] = await Promise.all([
    prisma.homework.findMany({
      where: { teacherId, isPublished: true, courseId: { in: activeCourseIds } },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        title: true,
        type: true,
        dueAt: true,
        courseId: true,
      },
    }),
    prisma.homeworkSubmission.findMany({
      where: { studentId, homework: { teacherId, courseId: { in: activeCourseIds } } },
      select: {
        homeworkId: true,
        score: true,
        totalQ: true,
        status: true,
        completedAt: true,
        fileName: true,
      },
    }),
    prisma.quizResult.findMany({
      where: {
        studentId,
        completedAt: { not: null },
        quiz: { folder: { courseId: { in: activeCourseIds } } },
      },
      orderBy: { completedAt: "desc" },
      select: {
        score: true,
        totalQ: true,
        completedAt: true,
        quiz: { select: { id: true, title: true, folder: { select: { course: { select: { title: true } } } } } },
      },
    }),
    prisma.progress.findMany({
      where: { studentId, video: { folder: { courseId: { in: activeCourseIds } } } },
      select: {
        watched: true,
        watchedAt: true,
        lastWatchedAt: true,
        watchedSecondsTotal: true,
        lastPositionSeconds: true,
        video: {
          select: {
            id: true,
            title: true,
            durationMinutes: true,
            folder: { select: { name: true, course: { select: { title: true } } } },
          },
        },
      },
      orderBy: { lastWatchedAt: "desc" },
    }),
  ]);

  const subByHw = new Map(homeworkSubs.map((s) => [s.homeworkId, s]));
  const homework = homeworks.map((h) => {
    const sub = subByHw.get(h.id);
    return {
      id: h.id,
      title: h.title,
      type: h.type,
      dueAt: h.dueAt ? h.dueAt.toISOString() : null,
      submitted: Boolean(sub),
      status: sub?.status ?? "missing",
      score: sub?.score ?? null,
      totalQ: sub?.totalQ ?? null,
      completedAt: sub?.completedAt ? sub.completedAt.toISOString() : null,
      fileName: sub?.fileName ?? null,
    };
  });

  const grades = quizResults.map((r) => ({
    quizId: r.quiz.id,
    title: r.quiz.title,
    courseTitle: r.quiz.folder?.course?.title ?? null,
    score: r.score,
    totalQ: r.totalQ,
    percent: r.totalQ > 0 ? Math.round((r.score / r.totalQ) * 100) : Math.round(r.score),
    completedAt: r.completedAt ? r.completedAt.toISOString() : null,
  }));

  const attendance = progressRows.map((p) => {
    const durationSeconds = p.video.durationMinutes > 0 ? p.video.durationMinutes * 60 : 0;
    const percent =
      durationSeconds > 0
        ? Math.min(100, Math.round((Math.max(p.watchedSecondsTotal, p.lastPositionSeconds) / durationSeconds) * 100))
        : p.watched
          ? 100
          : 0;
    return {
      videoId: p.video.id,
      title: p.video.title,
      folder: p.video.folder.name,
      courseTitle: p.video.folder.course.title,
      watched: p.watched,
      percent,
      lastWatchedAt: p.lastWatchedAt ? p.lastWatchedAt.toISOString() : null,
    };
  });

  const homeworkSubmitted = homework.filter((h) => h.submitted).length;
  const videosWatched = attendance.filter((a) => a.watched || a.percent >= 80).length;

  return {
    student: {
      id: student.id,
      name: student.name,
      email: student.email,
      phone: canSeePhones ? student.phone : maskPhone(student.phone),
      parentPhone: canSeePhones ? student.parentPhone : maskPhone(student.parentPhone),
      educationalStage: student.educationalStage,
      isActive: student.isActive,
      lastLoginAt: student.lastLoginAt ? student.lastLoginAt.toISOString() : null,
      createdAt: student.createdAt.toISOString(),
      loginStreak: student.loginStreak,
    },
    courses: activeCourses,
    activeCourses,
    noActiveCourse: false,
    message: null,
    summary: {
      courses: activeCourses.length,
      homeworkTotal: homework.length,
      homeworkSubmitted,
      quizzesTaken: grades.length,
      quizAverage: grades.length
        ? Math.round(grades.reduce((sum, g) => sum + g.percent, 0) / grades.length)
        : null,
      videosOpened: attendance.length,
      videosWatched,
    },
    homework,
    grades,
    attendance,
  };
}
