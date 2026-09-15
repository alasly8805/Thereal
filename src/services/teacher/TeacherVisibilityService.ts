import { prisma } from "@/lib/prisma";

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
