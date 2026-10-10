import { prisma } from "@/lib/prisma";
import { bookingGrantsCourseAccess, getEffectiveCourseTrack } from "@/lib/course-track";

/** A course the teacher roster can open through a paid booking, not only a code. */
export type CourseSeat = {
  id: string;
  teacherId: string;
  title?: string | null;
  subject?: string | null;
  description?: string | null;
  deliveryMode?: string | null;
  isPaid?: boolean | null;
  price?: number | null;
};

const REAL_STUDENT = {
  role: "student" as const,
  isVirtual: false,
  isDeleted: false,
  accountMode: { not: "TESTER" as const },
};

function courseIsPaidSeat(course: CourseSeat): boolean {
  return Boolean(course.isPaid && course.price && course.price > 0);
}

export class TeacherVisibilityService {
  /**
   * Standard student filter ensuring testers are completely omitted.
   */
  static getStudentWhereClause(extraWhere: Record<string, unknown> = {}) {
    return {
      ...extraWhere,
      accountMode: { not: "TESTER" },
    };
  }

  /**
   * Prisma where clause for students enrolled in a specific course (excluding testers).
   */
  static getEnrolledStudentsWhere(courseId: string, extraWhere: Record<string, unknown> = {}) {
    return {
      ...extraWhere,
      role: "student",
      isVirtual: false,
      accountMode: { not: "TESTER" },
      OR: [
        {
          accessCodes: {
            some: {
              courseId,
              isActive: true,
            },
          },
        },
        {
          courseEnrollments: {
            some: {
              courseId,
            },
          },
        },
      ],
    };
  }

  /**
   * Safe student lookup for a teacher.
   * If the student is a TESTER or non-student, this method strictly returns `null` (404 Not Found).
   */
  static async findStudentById(teacherId: string, studentId: string) {
    const student = await prisma.user.findFirst({
      where: {
        id: studentId,
        role: "student",
        isVirtual: false,
        accountMode: { not: "TESTER" },
        OR: [
          {
            accessCodes: {
              some: {
                course: { teacherId },
                isActive: true,
              },
            },
          },
          {
            courseEnrollments: {
              some: {
                course: { teacherId },
              },
            },
          },
          {
            studentSubscriptions: {
              some: {
                teacherId,
                status: "active",
              },
            },
          },
        ],
      },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        parentPhone: true,
        educationalStage: true,
        isActive: true,
        createdAt: true,
      },
    });

    return student;
  }

  /**
   * Students a superadmin removed from this course still have a booking,
   * but the teacher roster does not list them.
   */
  static async excludedStudentIds(courseId: string): Promise<Set<string>> {
    const prefix = `course_excluded_${courseId}_`;
    const exclusions = await prisma.appSetting.findMany({
      where: { key: { startsWith: prefix } },
      select: { key: true, value: true },
    });
    return new Set(
      exclusions.filter((row) => row.value === "true").map((row) => row.key.slice(prefix.length))
    );
  }

  /**
   * True when an active paid booking opens this course for the student.
   * Same rule as the teacher course list: paid course, matching language
   * track, not expired, and not excluded.
   */
  static async bookingOpensCourse(course: CourseSeat, studentId: string): Promise<boolean> {
    if (!studentId || studentId === course.teacherId || !courseIsPaidSeat(course)) return false;
    const track = await getEffectiveCourseTrack(course.id, course);
    const [subs, excluded] = await Promise.all([
      prisma.teacherSubscription.findMany({
        where: {
          studentId,
          teacherId: course.teacherId,
          status: "active",
          amount: { gt: 0 },
          OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
          student: REAL_STUDENT,
        },
        select: { languageTrack: true, planType: true },
      }),
      this.excludedStudentIds(course.id),
    ]);
    if (excluded.has(studentId) || subs.length === 0) return false;
    return subs.some((sub) => bookingGrantsCourseAccess(course, sub.languageTrack, track, sub.planType));
  }

  /**
   * Every real student whose active paid booking opens this course.
   * Students who also have a code or enrollment are included; callers dedupe.
   */
  static async listBookingStudentIds(course: CourseSeat): Promise<string[]> {
    if (!courseIsPaidSeat(course)) return [];
    const track = await getEffectiveCourseTrack(course.id, course);
    const [subs, excluded] = await Promise.all([
      prisma.teacherSubscription.findMany({
        where: {
          teacherId: course.teacherId,
          status: "active",
          amount: { gt: 0 },
          OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
          studentId: { not: course.teacherId },
          student: REAL_STUDENT,
        },
        select: { studentId: true, languageTrack: true, planType: true },
      }),
      this.excludedStudentIds(course.id),
    ]);
    const ids = new Set<string>();
    for (const sub of subs) {
      if (excluded.has(sub.studentId)) continue;
      if (bookingGrantsCourseAccess(course, sub.languageTrack, track, sub.planType)) ids.add(sub.studentId);
    }
    return [...ids];
  }

  /**
   * Counts real enrolled students in a course, excluding testers.
   */
  static async countCourseStudents(courseId: string): Promise<number> {
    const students = await prisma.user.findMany({
      where: this.getEnrolledStudentsWhere(courseId),
      select: { id: true },
    });
    return students.length;
  }

  /**
   * Returns a Prisma where clause for QuizResults scoped to teacher courses and excluding testers.
   */
  static filterQuizResultsWhere(courseIds: string[], extraWhere: Record<string, unknown> = {}) {
    return {
      ...extraWhere,
      student: { accountMode: { not: "TESTER" } },
      quiz: {
        folder: {
          courseId: { in: courseIds },
        },
      },
    };
  }

  /**
   * Returns a Prisma where clause for HomeworkSubmissions scoped to a teacher and excluding testers.
   */
  static filterHomeworkSubmissionsWhere(teacherId: string, extraWhere: Record<string, unknown> = {}) {
    return {
      ...extraWhere,
      student: { accountMode: { not: "TESTER" } },
      homework: {
        teacherId,
      },
    };
  }

  /**
   * Returns a Prisma where clause for TeacherSubscriptions excluding testers.
   */
  static filterTeacherSubscriptionsWhere(teacherId: string, extraWhere: Record<string, unknown> = {}) {
    return {
      ...extraWhere,
      teacherId,
      student: { accountMode: { not: "TESTER" } },
    };
  }
}
