import { prisma } from "./prisma";
import { quizResultPercent } from "./scoring";

function clampPercentage(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

export interface StudentContext {
  profile: {
    id: string;
    name: string;
    email: string;
    age: number | null;
    educationalStage: string | null;
    phone: string | null;
    role?: string;
  };
  courses: Array<{
    id: string;
    title: string;
    subject: string;
    teacher: string;
    isPaid?: boolean;
    price?: number;
    category?: string;
    progress: {
      videosWatched: number;
      totalVideos: number;
      percentage: number;
    };
    quizResults: Array<{
      quizId: string;
      quizTitle: string;
      score: number;
      totalQ: number;
      percentage: number;
      date: string;
    }>;
    lastAccessed: string | null;
  }>;
  overallStats: {
    totalCourses: number;
    averageScore: number;
    totalQuizzesTaken: number;
    totalVideosWatched: number;
  };
  weakAreas: Array<{
    subject: string;
    topic: string;
    reason: string;
    evidence: string;
  }>;
  aiInsights: Array<{
    type: string;
    title: string;
    description: string;
    confidence: number;
  }>;
  recentFeedback: Array<{
    type: string;
    content: string;
    course: string;
    date: string;
  }>;
  libraryProgress: Array<{
    folder: string;
    videos: string[];
    quizzes: string[];
  }>;
}

// In-memory cache for student context to eliminate repeated heavy database queries during active chat
const contextCache = new Map<string, { data: StudentContext; expiresAt: number }>();
const CONTEXT_CACHE_TTL_MS = 3 * 60 * 1000; // 3 minutes

export function invalidateStudentContextCache(studentId?: string) {
  if (studentId) {
    contextCache.delete(studentId);
  } else {
    contextCache.clear();
  }
}

export async function buildStudentContext(studentId: string, skipCache = false): Promise<StudentContext> {
  if (!skipCache) {
    const cached = contextCache.get(studentId);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.data;
    }
  }

  let student = await prisma.user.findUnique({
    where: { id: studentId },
    select: {
      id: true,
      name: true,
      email: true,
      age: true,
      educationalStage: true,
      phone: true,
      role: true,
    },
  });

  if (!student && studentId === "superadmin") {
    student = {
      id: "superadmin",
      name: "المشرف العام",
      email: "master-superadmin@code-up.tech",
      age: null,
      educationalStage: null,
      phone: null,
      role: "superadmin",
    };
  }

  if (!student) {
    throw new Error("Student not found");
  }

  // If user is superadmin or admin: give full platform courses context
  if (student.role === "superadmin" || student.role === "admin") {
    const allCourses = await prisma.course.findMany({
      take: 80,
      orderBy: { createdAt: "desc" },
      include: {
        teacher: { select: { name: true } },
        folders: { include: { videos: { select: { id: true } } } },
      },
    });

    const overrides = await prisma.appSetting.findMany({
      where: { key: { startsWith: "course_cat_" } },
    });
    const catMap = new Map(overrides.map((o) => [o.key.replace("course_cat_", ""), o.value]));

    const courseContexts = allCourses.map((c) => {
      const allVideos = c.folders.flatMap((f) => f.videos);
      return {
        id: c.id,
        title: c.title,
        subject: c.subject,
        teacher: c.teacher.name,
        isPaid: c.isPaid,
        price: c.price ?? 0,
        category: catMap.get(c.id) || "auto",
        progress: {
          videosWatched: 0,
          totalVideos: allVideos.length,
          percentage: 100,
        },
        quizResults: [],
        lastAccessed: null,
      };
    });

    const contextData: StudentContext = {
      profile: {
        id: student.id,
        name: student.name,
        email: student.email,
        age: student.age,
        educationalStage: student.educationalStage,
        phone: student.phone,
        role: student.role,
      },
      courses: courseContexts,
      overallStats: {
        totalCourses: allCourses.length,
        averageScore: 100,
        totalQuizzesTaken: 0,
        totalVideosWatched: 0,
      },
      weakAreas: [],
      aiInsights: [],
      recentFeedback: [],
      libraryProgress: [],
    };

    contextCache.set(studentId, {
      data: contextData,
      expiresAt: Date.now() + CONTEXT_CACHE_TTL_MS,
    });

    return contextData;
  }

  // Get all courses the student has access to
  const accessCodes = await prisma.accessCode.findMany({
    where: { studentId },
    include: {
      course: {
        include: {
          teacher: { select: { name: true } },
          folders: {
            include: {
              videos: true,
              quizzes: {
                include: {
                  questions: true,
                  results: {
                    where: { studentId },
                  },
                },
              },
            },
          },
          _count: {
            select: {
              folders: true,
            },
          },
        },
      },
    },
  });

  const courseContexts = await Promise.all(
    accessCodes.map(async (code) => {
      const course = code.course;
      const allVideos = course.folders.flatMap((f) => f.videos);
      const allQuizzes = course.folders.flatMap((f) => f.quizzes);

      // Get video progress
      const videoIds = allVideos.map((v) => v.id);
      const progress = await prisma.progress.findMany({
        where: {
          studentId,
          videoId: { in: videoIds },
          watched: true,
        },
      });
      const watchedCount = progress.length;

      // Get quiz results
      const quizResults = allQuizzes.map((quiz) => {
        const result = quiz.results[0];
        const percentage = result ? clampPercentage(result.score) : 0;
        return {
          quizId: quiz.id,
          quizTitle: quiz.title,
          score: percentage,
          totalQ: result?.totalQ ?? quiz.questions.length,
          percentage,
          date: result?.completedAt?.toISOString() ?? null,
        };
      });

      return {
        id: course.id,
        title: course.title,
        subject: course.subject,
        teacher: course.teacher.name,
        progress: {
          videosWatched: watchedCount,
          totalVideos: allVideos.length,
          percentage: allVideos.length > 0
            ? Math.round((watchedCount / allVideos.length) * 100)
            : 0,
        },
        quizResults,
        lastAccessed: progress.length > 0
          ? progress[progress.length - 1].watchedAt?.toISOString() ?? null
          : null,
      };
    })
  );

  // Calculate overall stats
  const allQuizResults = courseContexts.flatMap((c) => c.quizResults).filter((q) => q.date);
  const totalScore = allQuizResults.reduce((sum, q) => sum + q.percentage, 0);
  const averageScore = allQuizResults.length > 0
    ? clampPercentage(totalScore / allQuizResults.length)
    : 0;

  const watchedVideos = courseContexts.reduce(
    (sum, c) => sum + c.progress.videosWatched,
    0
  );

  // Identify weak areas
  const weakAreas: StudentContext["weakAreas"] = [];
  for (const course of courseContexts) {
    const lowScoreQuizzes = course.quizResults.filter((q) => q.percentage < 60);
    for (const quiz of lowScoreQuizzes) {
      weakAreas.push({
        subject: course.subject,
        topic: quiz.quizTitle,
        reason: `Low score: ${Math.round(quiz.percentage)}%`,
        evidence: `Quiz "${quiz.quizTitle}" - ${quiz.score}/${quiz.totalQ} correct`,
      });
    }
    // Also flag low video progress
    if (course.progress.percentage < 50 && course.progress.totalVideos > 0) {
      weakAreas.push({
        subject: course.subject,
        topic: "Course Progress",
        reason: "Low video completion",
        evidence: `Only ${course.progress.videosWatched}/${course.progress.totalVideos} videos watched`,
      });
    }
  }

  // Get AI insights
  const aiInsights = await prisma.aIStudentInsight.findMany({
    where: { studentId },
    orderBy: { createdAt: "desc" },
    take: 10,
    select: {
      type: true,
      title: true,
      description: true,
      confidence: true,
    },
  });

  // Get recent feedback
  const recentFeedback = await prisma.studentFeedback.findMany({
    where: { studentId },
    orderBy: { createdAt: "desc" },
    take: 5,
    include: { course: { select: { title: true } } },
  });

  // Build library progress
  const libraryProgress = accessCodes.map((code) => ({
    folder: code.course.title,
    videos: code.course.folders.flatMap((f) =>
      f.videos.map((v) => v.title)
    ),
    quizzes: code.course.folders.flatMap((f) =>
      f.quizzes.map((q) => q.title)
    ),
  }));

  const result: StudentContext = {
    profile: {
      id: student.id,
      name: student.name,
      email: student.email,
      age: student.age,
      educationalStage: student.educationalStage,
      phone: student.phone,
    },
    courses: courseContexts,
    overallStats: {
      totalCourses: courseContexts.length,
      averageScore,
      totalQuizzesTaken: allQuizResults.length,
      totalVideosWatched: watchedVideos,
    },
    weakAreas,
    aiInsights,
    recentFeedback: recentFeedback.map((f) => ({
      type: f.type,
      content: f.content,
      course: f.course.title,
      date: f.createdAt.toISOString(),
    })),
    libraryProgress,
  };

  contextCache.set(studentId, {
    data: result,
    expiresAt: Date.now() + CONTEXT_CACHE_TTL_MS,
  });

  return result;
}

export interface TeacherContext {
  profile: {
    id: string;
    name: string;
    email: string;
  };
  courses: Array<{
    id: string;
    title: string;
    subject: string;
    totalStudents: number;
    averageScore: number;
  }>;
  pendingRequests: {
    gradeAdjustments: number;
    supportTickets: number;
    feedbackItems: number;
  };
}

export async function buildTeacherContext(teacherId: string): Promise<TeacherContext> {
  const teacher = await prisma.user.findUnique({
    where: { id: teacherId },
    select: {
      id: true,
      name: true,
      email: true,
    },
  });

  if (!teacher) {
    throw new Error("Teacher not found");
  }

  const courses = await prisma.course.findMany({
    where: { teacherId },
    include: {
      _count: {
        select: { accessCodes: true },
      },
      folders: {
        include: {
          quizzes: {
            include: {
              results: true,
            },
          },
        },
      },
    },
  });

  const courseContexts = courses.map((course) => {
    const allResults = course.folders.flatMap((f: typeof course.folders[number]) =>
      f.quizzes.flatMap((q) => q.results)
    );
    // QuizResult.score is already a percentage — see src/lib/scoring.ts. The
    // previous division by totalQ fed the AI averages of several hundred
    // percent, so any reasoning it did about performance was built on nonsense.
    const avgScore =
      allResults.length > 0
        ? allResults.reduce((sum, r) => sum + quizResultPercent(r), 0) / allResults.length
        : 0;

    return {
      id: course.id,
      title: course.title,
      subject: course.subject,
      totalStudents: course._count.accessCodes,
      averageScore: Math.round(avgScore),
    };
  });

  // Count pending requests
  const [gradeAdjustments, supportTickets, feedbackItems] = await Promise.all([
    prisma.gradeAdjustmentRequest.count({
      where: {
        courseId: { in: courses.map((c) => c.id) },
        status: { in: ["pending", "ai_reviewed"] },
      },
    }),
    prisma.supportTicket.count({
      where: {
        courseId: { in: courses.map((c) => c.id) },
        status: { in: ["open", "ai_handling", "escalated"] },
      },
    }),
    prisma.studentFeedback.count({
      where: {
        courseId: { in: courses.map((c) => c.id) },
        isResolved: false,
      },
    }),
  ]);

  return {
    profile: {
      id: teacher.id,
      name: teacher.name,
      email: teacher.email,
    },
    courses: courseContexts,
    pendingRequests: {
      gradeAdjustments,
      supportTickets,
      feedbackItems,
    },
  };
}
