import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireTeacherContext } from "@/lib/teacher-scope-server";
import { maskPhone } from "@/lib/teacher-scope";
import { TeacherVisibilityService } from "@/services/teacher/TeacherVisibilityService";

function homeworkChanged(sub: {
  fileUrl: string | null;
  fileName: string | null;
  submittedOutput: string | null;
  review: { snapshotJson: string | null } | null;
}): boolean {
  if (!sub.review?.snapshotJson) return false;
  let snapshot: { fileUrl?: string | null; fileName?: string | null; submittedOutput?: string | null } | null =
    null;
  try {
    snapshot = JSON.parse(sub.review.snapshotJson) as typeof snapshot;
  } catch {
    return false;
  }
  if (!snapshot) return false;
  const fileChanged = Boolean(
    (snapshot.fileUrl || snapshot.fileName) &&
      (sub.fileUrl !== snapshot.fileUrl || sub.fileName !== snapshot.fileName)
  );
  const outputChanged = Boolean(
    typeof snapshot.submittedOutput === "string" &&
      (sub.submittedOutput || "") !== (snapshot.submittedOutput || "")
  );
  return fileChanged || outputChanged;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const gate = await requireTeacherContext("canViewStudents");
  if (!gate.ok) return gate.response;

  const { ctx } = gate;
  const { id: studentId } = await params;
  const courseId = req.nextUrl.searchParams.get("courseId");
  if (!courseId) {
    return NextResponse.json({ error: "معرف الكورس مطلوب" }, { status: 400 });
  }

  const course = await prisma.course.findFirst({
    where: { id: courseId, teacherId: ctx.teacherId },
    select: { id: true, title: true, teacherId: true },
  });
  if (!course) {
    return NextResponse.json({ error: "الكورس غير موجود" }, { status: 404 });
  }

  const enrolled = await prisma.user.findFirst({
    where: {
      id: studentId,
      role: "student",
      isVirtual: false,
      accountMode: { not: "TESTER" },
      OR: [
        { accessCodes: { some: { courseId } } },
        { courseEnrollments: { some: { courseId } } },
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
      lastLoginAt: true,
      createdAt: true,
      loginStreak: true,
    },
  });

  if (!enrolled) {
    const visible = await TeacherVisibilityService.findStudentById(ctx.teacherId, studentId);
    if (!visible) {
      return NextResponse.json({ error: "المتعلم غير موجود في نطاقك" }, { status: 404 });
    }
    return NextResponse.json({ error: "الطالب مش مسجّل في الكورس ده" }, { status: 404 });
  }

  const canSeePhones = ctx.permissions.viewStudentPhones;
  const canSeeQuiz = ctx.permissions.viewQuizResults;
  const canSeeHomework = ctx.permissions.gradeHomework || ctx.permissions.manageHomework;

  const folders = await prisma.folder.findMany({
    where: { courseId },
    orderBy: { order: "asc" },
    select: {
      id: true,
      name: true,
      order: true,
      publishAt: true,
      videos: {
        orderBy: { order: "asc" },
        select: {
          id: true,
          title: true,
          order: true,
          durationMinutes: true,
          maxWatchesPerUser: true,
          publishAt: true,
        },
      },
      quizzes: {
        orderBy: { createdAt: "asc" },
        select: { id: true, title: true, timeLimitMinutes: true },
      },
      homeworks: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          title: true,
          type: true,
          dueAt: true,
          isPublished: true,
          videoId: true,
          folderId: true,
        },
      },
    },
  });

  const courseHomeworks = await prisma.homework.findMany({
    where: {
      teacherId: ctx.teacherId,
      courseId,
      folderId: null,
    },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      title: true,
      type: true,
      dueAt: true,
      isPublished: true,
      videoId: true,
      folderId: true,
    },
  });

  const videoIds = folders.flatMap((f) => f.videos.map((v) => v.id));
  const quizIds = folders.flatMap((f) => f.quizzes.map((q) => q.id));
  const homeworkIds = [
    ...folders.flatMap((f) => f.homeworks.map((h) => h.id)),
    ...courseHomeworks.map((h) => h.id),
  ];

  const [
    progressRows,
    sessionGroups,
    quizResults,
    homeworkSubs,
    videoQuestions,
    questionResponses,
    viewRequests,
    gradeRequests,
    accessCodes,
    deviceCount,
  ] = await Promise.all([
    videoIds.length
      ? prisma.progress.findMany({
          where: { studentId, videoId: { in: videoIds } },
          select: {
            videoId: true,
            watched: true,
            watchedAt: true,
            lastPositionSeconds: true,
            watchedSecondsTotal: true,
            lastWatchedAt: true,
          },
        })
      : Promise.resolve([]),
    videoIds.length
      ? prisma.videoWatchSession.groupBy({
          by: ["videoId"],
          where: { studentId, videoId: { in: videoIds }, usedWatchSlot: true },
          _count: { _all: true },
        })
      : Promise.resolve([]),
    quizIds.length
      ? prisma.quizResult.findMany({
          where: { studentId, quizId: { in: quizIds } },
          select: {
            quizId: true,
            score: true,
            totalQ: true,
            completedAt: true,
            allowRetake: true,
            startedAt: true,
            // Essay answers awaiting teacher review — while any exist the
            // stored score is partial, not a final grade.
            answers: { where: { status: "PENDING" }, select: { id: true } },
          },
        })
      : Promise.resolve([]),
    homeworkIds.length
      ? prisma.homeworkSubmission.findMany({
          where: { studentId, homeworkId: { in: homeworkIds } },
          select: {
            id: true,
            homeworkId: true,
            score: true,
            totalQ: true,
            status: true,
            completedAt: true,
            fileName: true,
            fileUrl: true,
            submittedOutput: true,
            allowRetake: true,
            review: { select: { verdict: true, note: true, reviewedAt: true, snapshotJson: true } },
          },
        })
      : Promise.resolve([]),
    videoIds.length
      ? prisma.videoQuestion.findMany({
          where: { videoId: { in: videoIds } },
          select: { id: true, videoId: true, questionText: true, questionType: true, triggerSecond: true },
          orderBy: { triggerSecond: "asc" },
        })
      : Promise.resolve([]),
    videoIds.length
      ? prisma.videoQuestionResponse.findMany({
          where: {
            studentId,
            videoQuestion: { videoId: { in: videoIds } },
          },
          orderBy: { createdAt: "desc" },
          select: {
            videoQuestionId: true,
            isCorrect: true,
            selectedOption: true,
            essayAnswer: true,
            status: true,
            createdAt: true,
          },
        })
      : Promise.resolve([]),
    videoIds.length
      ? prisma.videoViewRequest.findMany({
          where: { studentId, videoId: { in: videoIds } },
          select: {
            videoId: true,
            status: true,
            grantedViews: true,
            createdAt: true,
            reviewedAt: true,
          },
          orderBy: { createdAt: "desc" },
        })
      : Promise.resolve([]),
    quizIds.length
      ? prisma.gradeAdjustmentRequest.findMany({
          where: { studentId, quizId: { in: quizIds } },
          select: {
            quizId: true,
            status: true,
            currentScore: true,
            requestedScore: true,
            reason: true,
            createdAt: true,
          },
          orderBy: { createdAt: "desc" },
        })
      : Promise.resolve([]),
    prisma.accessCode.findMany({
      where: { courseId, studentId },
      select: {
        code: true,
        isActive: true,
        accessType: true,
        usedAt: true,
        folder: { select: { name: true } },
        video: { select: { title: true } },
      },
      orderBy: { usedAt: "desc" },
    }),
    prisma.device.count({ where: { userId: studentId } }),
  ]);

  const progressByVideo = new Map(progressRows.map((p) => [p.videoId, p]));
  const sessionsByVideo = new Map(sessionGroups.map((g) => [g.videoId, g._count._all]));
  const quizById = new Map(quizResults.map((r) => [r.quizId, r]));
  const hwById = new Map(homeworkSubs.map((s) => [s.homeworkId, s]));
  const questionsByVideo = new Map<string, typeof videoQuestions>();
  for (const q of videoQuestions) {
    const list = questionsByVideo.get(q.videoId) || [];
    list.push(q);
    questionsByVideo.set(q.videoId, list);
  }
  const responseByQuestion = new Map<string, (typeof questionResponses)[number]>();
  for (const r of questionResponses) {
    if (!responseByQuestion.has(r.videoQuestionId)) responseByQuestion.set(r.videoQuestionId, r);
  }
  const viewsByVideo = new Map<string, typeof viewRequests>();
  for (const v of viewRequests) {
    const list = viewsByVideo.get(v.videoId) || [];
    list.push(v);
    viewsByVideo.set(v.videoId, list);
  }
  const gradesByQuiz = new Map<string, typeof gradeRequests>();
  for (const g of gradeRequests) {
    const list = gradesByQuiz.get(g.quizId) || [];
    list.push(g);
    gradesByQuiz.set(g.quizId, list);
  }

  function mapHomework(h: (typeof courseHomeworks)[number]) {
    const sub = hwById.get(h.id);
    const submitted = Boolean(sub);
    const base = {
      id: h.id,
      title: h.title,
      type: h.type,
      dueAt: h.dueAt,
      isPublished: h.isPublished,
      videoId: h.videoId,
      submitted,
    };
    if (!canSeeHomework) {
      return { ...base, status: submitted ? "submitted" : "missing" };
    }
    return {
      ...base,
      status: sub?.status ?? "missing",
      score: sub?.score ?? null,
      totalQ: sub?.totalQ ?? null,
      completedAt: sub?.completedAt ?? null,
      fileName: sub?.fileName ?? null,
      submissionId: sub?.id ?? null,
      allowRetake: sub?.allowRetake ?? false,
      reviewVerdict: sub?.review?.verdict ?? null,
      reviewNote: sub?.review?.note ?? null,
      reviewedAt: sub?.review?.reviewedAt ?? null,
      contentChanged: sub ? homeworkChanged(sub) : false,
    };
  }

  function mapQuiz(q: { id: string; title: string; timeLimitMinutes: number }) {
    const result = quizById.get(q.id);
    const taken = Boolean(result);
    const grades = canSeeQuiz ? gradesByQuiz.get(q.id) || [] : [];
    const base = {
      id: q.id,
      title: q.title,
      timeLimitMinutes: q.timeLimitMinutes,
      taken,
    };
    if (!canSeeQuiz) return base;
    return {
      ...base,
      score: result?.score ?? null,
      totalQ: result?.totalQ ?? null,
      pendingEssays: result?.answers?.length ?? 0,
      completedAt: result?.completedAt ?? null,
      allowRetake: result?.allowRetake ?? false,
      gradeRequests: grades,
    };
  }

  const folderPayload = folders.map((folder) => {
    const videos = folder.videos.map((video) => {
      const p = progressByVideo.get(video.id);
      const durationSeconds = video.durationMinutes > 0 ? video.durationMinutes * 60 : 0;
      const watchedSeconds = p?.watchedSecondsTotal ?? 0;
      const lastPos = p?.lastPositionSeconds ?? 0;
      const percent =
        durationSeconds > 0
          ? Math.min(100, Math.round((Math.max(watchedSeconds, lastPos) / durationSeconds) * 100))
          : p?.watched
            ? 100
            : lastPos > 0
              ? 1
              : 0;
      const questions = questionsByVideo.get(video.id) || [];
      const inVideo = questions.map((q) => {
        const ans = responseByQuestion.get(q.id);
        return {
          id: q.id,
          questionText: q.questionText,
          questionType: q.questionType,
          triggerSecond: q.triggerSecond,
          answered: Boolean(ans),
          isCorrect: canSeeQuiz ? (ans?.isCorrect ?? null) : null,
          status: canSeeQuiz ? (ans?.status ?? null) : null,
          answeredAt: ans?.createdAt ?? null,
        };
      });
      const videoHomeworks = folder.homeworks.filter((h) => h.videoId === video.id).map(mapHomework);
      return {
        id: video.id,
        title: video.title,
        durationMinutes: video.durationMinutes,
        maxWatchesPerUser: video.maxWatchesPerUser,
        publishAt: video.publishAt,
        opened: Boolean(p),
        watched: Boolean(p?.watched),
        watchedAt: p?.watchedAt ?? null,
        lastWatchedAt: p?.lastWatchedAt ?? null,
        lastPositionSeconds: lastPos,
        watchedSecondsTotal: watchedSeconds,
        percent,
        watchCount: sessionsByVideo.get(video.id) ?? 0,
        extraViewRequests: viewsByVideo.get(video.id) || [],
        inVideoQuestions: inVideo,
        homeworks: videoHomeworks,
      };
    });

    return {
      id: folder.id,
      name: folder.name,
      order: folder.order,
      publishAt: folder.publishAt,
      videos,
      quizzes: folder.quizzes.map(mapQuiz),
      homeworks: folder.homeworks.filter((h) => !h.videoId).map(mapHomework),
    };
  });

  let videosWatched = 0;
  let videosOpened = 0;
  let videosTotal = 0;
  let quizzesTaken = 0;
  let quizzesTotal = 0;
  let homeworkSubmitted = 0;
  let homeworkTotal = 0;
  let homeworkPassed = 0;

  for (const f of folderPayload) {
    videosTotal += f.videos.length;
    quizzesTotal += f.quizzes.length;
    homeworkTotal += f.homeworks.length;
    quizzesTaken += f.quizzes.filter((q) => q.taken).length;
    homeworkSubmitted += f.homeworks.filter((h) => h.submitted).length;
    homeworkPassed += f.homeworks.filter((h) => h.status === "passed").length;
    for (const v of f.videos) {
      if (v.opened) videosOpened += 1;
      if (v.watched) videosWatched += 1;
      homeworkTotal += v.homeworks.length;
      homeworkSubmitted += v.homeworks.filter((h) => h.submitted).length;
      homeworkPassed += v.homeworks.filter((h) => h.status === "passed").length;
    }
  }

  const looseHomeworks = courseHomeworks.map(mapHomework);
  homeworkTotal += looseHomeworks.length;
  homeworkSubmitted += looseHomeworks.filter((h) => h.submitted).length;
  homeworkPassed += looseHomeworks.filter((h) => h.status === "passed").length;

  return NextResponse.json({
    student: {
      id: enrolled.id,
      name: enrolled.name,
      email: enrolled.email,
      phone: canSeePhones ? enrolled.phone : maskPhone(enrolled.phone),
      parentPhone: canSeePhones ? enrolled.parentPhone : maskPhone(enrolled.parentPhone),
      educationalStage: enrolled.educationalStage,
      isActive: enrolled.isActive,
      lastLoginAt: enrolled.lastLoginAt,
      createdAt: enrolled.createdAt,
      loginStreak: enrolled.loginStreak,
      deviceCount,
    },
    course: { id: course.id, title: course.title },
    access: accessCodes,
    summary: {
      videosTotal,
      videosOpened,
      videosWatched,
      quizzesTotal,
      quizzesTaken,
      homeworkTotal,
      homeworkSubmitted,
      homeworkPassed,
    },
    folders: folderPayload,
    courseHomeworks: looseHomeworks,
    permissions: {
      phones: canSeePhones,
      quizzes: canSeeQuiz,
      homework: canSeeHomework,
    },
  });
}
