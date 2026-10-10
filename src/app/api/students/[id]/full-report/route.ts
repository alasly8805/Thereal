import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * Format and convert scores safely:
 * - If score is a percentage or greater than total (e.g. 95.35 on 43 totalQ),
 *   calculate realScore = Math.round((score / 100) * totalMarks)
 *   and format as: `${realScore}/${totalMarks} (${pct}%)`
 * - If score is missing / unsubmitted: returns "لم يتم الحل" (or "تم التسليم" for passed uploads)
 * - If score is direct: format as `${cleanScore}/${totalMarks} (${pct}%)`
 */
function formatGrade(rawScore: number | null | undefined, totalMarks: number, status?: string | null): string {
  if (rawScore == null) {
    if (status === "passed") return "تم التسليم (ناجح)";
    if (status === "SUBMITTED" || status === "review_requested") return "قيد المراجعة";
    return "لم يتم الحل";
  }

  const scoreNum = Number(rawScore);
  const total = Number(totalMarks) > 0 ? Number(totalMarks) : 10;

  // Percentage or score > total (e.g. 95.35 on total=43, or 100 on total=10)
  if (scoreNum > total || (scoreNum > 0 && String(rawScore).includes("."))) {
    const pct = Math.round(scoreNum);
    const realScore = Math.min(total, Math.round((scoreNum / 100) * total));
    return `${realScore}/${total} (${pct}%)`;
  }

  // 100% on total < 100 (e.g. score=100 on total=15)
  if (scoreNum === 100 && total < 100) {
    return `${total}/${total} (100%)`;
  }

  // Direct score <= total
  const cleanScore = Math.min(total, Math.round(scoreNum));
  const pct = Math.round((cleanScore / total) * 100);
  return `${cleanScore}/${total} (${pct}%)`;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "معرف الطالب مطلوب" }, { status: 400 });
    }

    // Match student by id or referralCode
    const student = await prisma.user.findFirst({
      where: {
        role: "student",
        isDeleted: false,
        OR: [
          { id },
          { referralCode: id },
          { referralCode: { equals: id, mode: "insensitive" } },
        ],
      },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        parentPhone: true,
        referralCode: true,
        points: true,
        educationalStage: true,
      },
    });

    if (!student) {
      return NextResponse.json({ error: "الطالب غير موجود" }, { status: 404 });
    }

    const studentId = student.id;

    const courseIdParam = req.nextUrl.searchParams.get("courseId");

    // 1. Identify enrolled/accessible courses for the student
    const [enrollments, accessCodes, recentProgress] = await Promise.all([
      prisma.courseEnrollment.findMany({
        where: { studentId },
        include: { course: { include: { folders: { include: { videos: true } } } } },
        orderBy: { createdAt: "desc" },
      }),
      prisma.accessCode.findMany({
        where: { studentId, isActive: true },
        include: { course: { include: { folders: { include: { videos: true } } } } },
        orderBy: { createdAt: "desc" },
      }),
      prisma.progress.findFirst({
        where: { studentId, watched: true },
        orderBy: { lastWatchedAt: "desc" },
        select: { video: { select: { folder: { select: { courseId: true } } } } },
      }),
    ]);

    // Choose student course: from query param, active watch progress, or first enrollment/code
    const activeCourseFromProgress = recentProgress?.video?.folder?.courseId;
    const studentCourseId =
      courseIdParam ||
      activeCourseFromProgress ||
      enrollments[0]?.courseId ||
      accessCodes[0]?.courseId ||
      null;

    // 2. Count total videos/folders and student watched videos in student's course
    let totalVideos = 0;
    let totalFolders = 0;
    let watched = 0;

    if (studentCourseId) {
      const [vCount, fCount, wCount] = await Promise.all([
        prisma.video.count({ where: { folder: { courseId: studentCourseId } } }),
        prisma.folder.count({ where: { courseId: studentCourseId } }),
        prisma.progress.count({
          where: {
            studentId,
            watched: true,
            video: { folder: { courseId: studentCourseId } },
          },
        }),
      ]);
      totalVideos = vCount;
      totalFolders = fCount;
      watched = wCount;
    } else if (enrollments.length > 0) {
      enrollments.forEach((en) => {
        if (en.course?.folders) {
          totalFolders += en.course.folders.length;
          en.course.folders.forEach((f) => {
            totalVideos += f.videos?.length || 0;
          });
        }
      });
      watched = await prisma.progress.count({ where: { studentId, watched: true } });
    } else {
      totalVideos = await prisma.video.count();
      totalFolders = await prisma.folder.count();
      watched = await prisma.progress.count({ where: { studentId, watched: true } });
    }

    console.log("CourseId:", studentCourseId, "Folders:", totalFolders, "Videos:", totalVideos);

    const totalLectures = totalVideos;

    const allStudentCourseIds = [
      ...new Set([
        ...enrollments.map((e) => e.courseId).filter(Boolean),
        ...accessCodes.map((a) => a.courseId).filter(Boolean),
      ]),
    ] as string[];

    // 3. Fetch course homeworks: primary course first, then fallback to all student courses if empty
    let allHomeworks = studentCourseId
      ? await prisma.homework.findMany({
          where: {
            OR: [
              { folder: { courseId: studentCourseId } },
              { courseId: studentCourseId },
            ],
            isPublished: true,
          },
          include: {
            folder: { select: { id: true, name: true, order: true } },
            questions: { select: { id: true } },
          },
          orderBy: [{ folder: { order: "asc" } }, { createdAt: "asc" }],
        })
      : [];

    if (allHomeworks.length === 0 && allStudentCourseIds.length > 0) {
      allHomeworks = await prisma.homework.findMany({
        where: {
          OR: [
            { folder: { courseId: { in: allStudentCourseIds } } },
            { courseId: { in: allStudentCourseIds } },
          ],
          isPublished: true,
        },
        include: {
          folder: { select: { id: true, name: true, order: true } },
          questions: { select: { id: true } },
        },
        orderBy: [{ folder: { order: "asc" } }, { createdAt: "asc" }],
      });
    }

    if (allHomeworks.length === 0) {
      allHomeworks = await prisma.homework.findMany({
        where: { isPublished: true },
        include: {
          folder: { select: { id: true, name: true, order: true } },
          questions: { select: { id: true } },
        },
        orderBy: [{ folder: { order: "asc" } }, { createdAt: "asc" }],
        take: 20,
      });
    }

    const [studentHwSubs, rawSubmissions] = await Promise.all([
      prisma.homeworkSubmission.findMany({
        where: { studentId },
        include: {
          homework: {
            include: {
              folder: { select: { id: true, name: true } },
              questions: { select: { id: true } },
            },
          },
        },
      }),
      prisma.quizResult.findMany({
        where: {
          studentId,
          completedAt: { not: null },
        },
        include: {
          quiz: {
            select: {
              id: true,
              title: true,
              folder: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
          },
        },
        orderBy: { completedAt: "desc" },
      }),
    ]);

    // Map homework submissions by homeworkId AND by title
    const subByHwId = new Map<string, (typeof studentHwSubs)[0]>();
    const subByTitle = new Map<string, (typeof studentHwSubs)[0]>();

    for (const s of studentHwSubs) {
      subByHwId.set(s.homeworkId, s);
      const titleKey = s.homework?.title?.trim().toLowerCase();
      if (titleKey) {
        const existing = subByTitle.get(titleKey);
        // Prefer submissions that have actual scores or passed status
        if (!existing || s.score != null || s.status === "passed" || s.fileUrl) {
          subByTitle.set(titleKey, s);
        }
      }
    }

    // Deduplicate homeworks by title to avoid duplicate rows from multiple courses
    const homeworksMap = new Map<string, any>();

    for (const h of allHomeworks) {
      const titleKey = h.title.trim().toLowerCase();
      const sub = subByHwId.get(h.id) || subByTitle.get(titleKey);
      const qCount = h.questions?.length ?? 0;
      const totalMarks = (sub?.totalQ && sub.totalQ > 0) ? sub.totalQ : (qCount > 0 ? qCount : 10);
      const gradeStr = formatGrade(sub?.score, totalMarks, sub?.status);
      const hasScoreOrPassed = Boolean(sub && (sub.score != null || sub.status === "passed" || sub.fileUrl != null));

      const existing = homeworksMap.get(titleKey);
      // Keep the one with real grade/submission over an unsubmitted one
      if (!existing || (!existing.hasScore && hasScoreOrPassed)) {
        homeworksMap.set(titleKey, {
          id: h.id,
          title: h.title,
          lectureTitle: h.folder?.name || "المحاضرة",
          grade: gradeStr,
          score: sub?.score ?? null,
          totalMarks,
          status: sub?.status || "missing",
          hasScore: hasScoreOrPassed,
          homework: {
            id: h.id,
            title: h.title,
            totalMarks,
            lecture: {
              title: h.folder?.name || "المحاضرة",
            },
          },
        });
      }
    }

    // Include any standalone submitted homeworks that were not in courseHomeworks
    for (const sub of studentHwSubs) {
      if (!sub.homework) continue;
      const titleKey = sub.homework.title.trim().toLowerCase();
      if (!homeworksMap.has(titleKey)) {
        const qCount = sub.homework.questions?.length ?? 0;
        const totalMarks = (sub.totalQ && sub.totalQ > 0) ? sub.totalQ : (qCount > 0 ? qCount : 10);
        const gradeStr = formatGrade(sub.score, totalMarks, sub.status);
        homeworksMap.set(titleKey, {
          id: sub.homework.id,
          title: sub.homework.title,
          lectureTitle: sub.homework.folder?.name || "المحاضرة",
          grade: gradeStr,
          score: sub.score ?? null,
          totalMarks,
          status: sub.status || "missing",
          hasScore: true,
          homework: {
            id: sub.homework.id,
            title: sub.homework.title,
            totalMarks,
            lecture: {
              title: sub.homework.folder?.name || "المحاضرة",
            },
          },
        });
      }
    }

    const homeworks = [...homeworksMap.values()];

    const quizMap = new Map<string, any>();
    for (const s of rawSubmissions) {
      const titleKey = s.quiz.title.trim().toLowerCase();
      const date = s.completedAt
        ? new Date(s.completedAt).toLocaleDateString("ar-EG", {
            year: "numeric",
            month: "short",
            day: "numeric",
          })
        : "—";

      const totalMarks = s.totalQ > 0 ? s.totalQ : 10;
      const gradeStr = formatGrade(s.score, totalMarks);

      // If duplicate quiz, keep the higher score
      const existing = quizMap.get(titleKey);
      if (!existing || (s.score != null && (existing.score == null || s.score > existing.score))) {
        quizMap.set(titleKey, {
          id: s.id,
          title: s.quiz.title,
          lectureTitle: s.quiz.folder?.name || "المحاضرة",
          grade: gradeStr,
          score: s.score,
          totalMarks,
          date,
          completedAt: s.completedAt ? s.completedAt.toISOString() : null,
          quiz: {
            id: s.quiz.id,
            title: s.quiz.title,
            totalMarks,
            lecture: {
              title: s.quiz.folder?.name || "المحاضرة",
            },
          },
        });
      }
    }

    const submissions = [...quizMap.values()];

    // Debug logging for shape verification
    if (homeworks.length > 0) {
      console.log("[full-report debug] Sample HW:", {
        title: homeworks[0].title,
        rawScore: homeworks[0].score,
        totalMarks: homeworks[0].totalMarks,
        formattedGrade: homeworks[0].grade,
      });
    }
    if (submissions.length > 0) {
      console.log("[full-report debug] Sample Quiz:", {
        title: submissions[0].title,
        rawScore: submissions[0].score,
        totalMarks: submissions[0].totalMarks,
        formattedGrade: submissions[0].grade,
      });
    }

    const parentCode = student.referralCode || student.id;

    return NextResponse.json({
      success: true,
      student: {
        ...student,
        code: parentCode,
        parentCode,
      },
      name: student.name,
      parentCode,
      points: student.points ?? 0,
      totalLectures,
      totalVideos,
      totalFolders,
      watched,
      completedCount: watched,
      homeworks,
      submissions,
    });
  } catch (error) {
    console.error("[students/full-report] Error:", error);
    return NextResponse.json(
      { error: "تعذر استرجاع التقرير الشامل للطالب" },
      { status: 500 }
    );
  }
}
