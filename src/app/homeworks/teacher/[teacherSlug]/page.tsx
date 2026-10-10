import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { TeacherHomeworkHubClient, type HomeworkItem } from "./TeacherHomeworkHubClient";
import { presentStudentView } from "@/lib/attempt-presentation";
import { ensureHomeworkExamView, homeworkPresentationOptions } from "@/lib/homework-exam-view";

interface Props {
  params: Promise<{ teacherSlug: string }>;
}

/**
 * Server-rendered Homework Hub for a specific teacher.
 * URL: /homeworks/teacher/[teacherSlug]
 * (or homework.code-up.tech/[teacherSlug] after proxy rewrite)
 *
 * Access control: only show homeworks for content the student has purchased.
 */
export default async function TeacherHomeworkHubPage({ params }: Props) {
  const { teacherSlug } = await params;

  // ── Identify teacher ──────────────────────────────────────────────────────
  const teacherProfile = await prisma.teacherProfile.findUnique({
    where: { slug: teacherSlug },
    include: { teacher: { select: { id: true, name: true } } },
  });

  if (!teacherProfile) {
    return (
      <div className="min-h-screen bg-[#0d1117] flex items-center justify-center" dir="rtl">
        <div className="text-center space-y-3">
          <p className="text-5xl">😕</p>
          <p className="text-white text-xl font-bold">المعلم غير موجود</p>
          <p className="text-slate-400 text-sm">تحقق من الرابط وحاول مرة أخرى</p>
        </div>
      </div>
    );
  }

  const teacherId = teacherProfile.teacherId;
  const teacherName = teacherProfile.teacher.name;

  // ── Identify student from session cookie ─────────────────────────────────
  // We do a lightweight session check (same pattern as getSession but server-side)
  let studentId: string | null = null;
  let studentRole: string | null = null;
  let isTesterOrAdmin = false;
  try {
    const { getSession } = await import("@/lib/auth");
    const session = await getSession();
    if (session) {
      studentId = session.id;
      studentRole = session.role;
      isTesterOrAdmin = session.accountMode === "TESTER" || session.role === "superadmin";
    }
  } catch { /* not logged in */ }

  // ── Fetch published homeworks by this teacher ─────────────────────────────
  const rawHomeworks = await prisma.homework.findMany({
    where: { teacherId, isPublished: true },
    include: {
      questions: {
        orderBy: { order: "asc" },
        select: {
          id: true, question: true, imageUrl: true,
          optionA: true, optionB: true, optionC: true, optionD: true,
          order: true,
          // NOTE: correctAnswer intentionally excluded for students
        },
      },
      video: {
        include: {
          folder: {
            include: {
              course: { select: { id: true, title: true } },
            },
          },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  // ── Access control: determine which homeworks the student can see ──────────
  let accessibleHomeworkIds: Set<string> = new Set();

  if (!studentId) {
    // Not logged in — show no homeworks
    accessibleHomeworkIds = new Set();
  } else if (isTesterOrAdmin) {
    // QA Testers & Superadmins have full access to all published homeworks
    accessibleHomeworkIds = new Set(rawHomeworks.map((h) => h.id));
  } else {
    // Get all course-level access codes the student has used
    const studentCodes = await prisma.accessCode.findMany({
      where: { studentId, isActive: true },
      select: { courseId: true, folderId: true, videoId: true, accessType: true },
    });

    const termCourseIds = new Set(
      studentCodes
        .filter(c => c.accessType === "TERM" || !c.accessType || (!c.folderId && !c.videoId))
        .map(c => c.courseId)
    );
    const folderAccessIds = new Set(
      studentCodes.filter(c => c.accessType === "FOLDER" && c.folderId).map(c => c.folderId!)
    );
    const videoAccessIds = new Set(
      studentCodes.filter(c => c.accessType === "VIDEO" && c.videoId).map(c => c.videoId!)
    );

    // Also check active TeacherSubscription, FolderPurchase, VideoPurchase, and Free Courses
    const now = new Date();
    const [teacherSub, folderPurchases, videoPurchases, freeCourses] = await Promise.all([
      prisma.teacherSubscription.findFirst({
        where: { studentId, teacherId, status: "active", expiresAt: { gt: now } },
        select: { id: true },
      }),
      prisma.folderPurchase.findMany({ where: { studentId }, select: { folderId: true } }),
      prisma.videoPurchase.findMany({ where: { studentId }, select: { videoId: true } }),
      prisma.course.findMany({ where: { teacherId, isPaid: false }, select: { id: true } }),
    ]);
    folderPurchases.forEach(fp => folderAccessIds.add(fp.folderId));
    videoPurchases.forEach(vp => videoAccessIds.add(vp.videoId));

    const isSubscribed = !!teacherSub;
    const freeCourseIds = new Set(freeCourses.map(c => c.id));

    for (const hw of rawHomeworks) {
      // If student is subscribed to teacher, they have full access to all published homeworks
      if (isSubscribed) {
        accessibleHomeworkIds.add(hw.id);
        continue;
      }

      // Free course check
      if (hw.courseId && freeCourseIds.has(hw.courseId)) {
        accessibleHomeworkIds.add(hw.id);
        continue;
      }
      if (hw.video?.folder?.courseId && freeCourseIds.has(hw.video.folder.courseId)) {
        accessibleHomeworkIds.add(hw.id);
        continue;
      }

      // Folder-level check
      if (hw.folderId && folderAccessIds.has(hw.folderId)) {
        accessibleHomeworkIds.add(hw.id);
        continue;
      }

      if (!hw.video) {
        // Course-level homework: accessible if student has TERM access to the course
        // or if homework has no courseId restriction
        if (!hw.courseId) { accessibleHomeworkIds.add(hw.id); continue; }
        if (termCourseIds.has(hw.courseId)) { accessibleHomeworkIds.add(hw.id); continue; }
      } else {
        const video = hw.video;
        const folderId = video.folderId;
        const courseId = video.folder?.courseId;

        if (courseId && termCourseIds.has(courseId)) { accessibleHomeworkIds.add(hw.id); continue; }
        if (folderId && folderAccessIds.has(folderId)) { accessibleHomeworkIds.add(hw.id); continue; }
        if (videoAccessIds.has(video.id)) { accessibleHomeworkIds.add(hw.id); continue; }
      }
    }
  }

  // ── Fetch student's existing submissions ──────────────────────────────────
  const submissions = studentId
    ? await prisma.homeworkSubmission.findMany({
        where: {
          studentId,
          homeworkId: { in: Array.from(accessibleHomeworkIds) },
        },
        include: { review: { select: { verdict: true, note: true, reviewedAt: true } } },
      })
    : [];

  const subMap = new Map(submissions.map(s => [s.homeworkId, s]));

  // ── Build serializable homework list ──────────────────────────────────────
  const visibleHomeworks = rawHomeworks.filter(hw => accessibleHomeworkIds.has(hw.id));
  const homeworks: HomeworkItem[] = [];
  for (const hw of visibleHomeworks) {
      const sub = subMap.get(hw.id) as any;
      let questions = hw.questions as HomeworkItem["questions"] | undefined;
      if (hw.type === "exam") {
        if (studentRole === "student" && studentId && (!sub || sub.allowRetake)) {
          const presentation = await ensureHomeworkExamView(
            studentId,
            hw.id,
            hw.questions,
            !!sub?.allowRetake,
            homeworkPresentationOptions(hw)
          );
          questions = presentStudentView(hw.questions, presentation) as HomeworkItem["questions"];
        }
      } else {
        questions = undefined;
      }
      homeworks.push({
        id:              hw.id,
        title:           hw.title,
        description:     hw.description,
        type:            hw.type as HomeworkItem["type"],
        linkUrl:         hw.linkUrl,
        codeTemplate:    hw.codeTemplate,
        codeLanguage:    hw.codeLanguage,
        allowedFileTypes:hw.allowedFileTypes,
        dueAt:           hw.dueAt?.toISOString() ?? null,
        timeLimitMinutes:hw.timeLimitMinutes,
        isPublished:     hw.isPublished,
        courseTitle:     hw.video?.folder?.course?.title ?? undefined,
        lessonTitle:     hw.video?.title ?? undefined,
        questions,
        mySubmission:    sub
          ? {
              id:             sub.id,
              status:         sub.status,
              score:          sub.score,
              totalQ:         sub.totalQ,
              submittedOutput:sub.submittedOutput,
              fileUrl:        sub.fileUrl,
              fileName:       sub.fileName,
              allowRetake:    sub.allowRetake,
              completedAt:    sub.completedAt ? new Date(sub.completedAt).toISOString() : null,
              review:         sub.review
                ? {
                    verdict: sub.review.verdict,
                    note: sub.review.note,
                    reviewedAt: sub.review.reviewedAt ? new Date(sub.review.reviewedAt).toISOString() : null,
                  }
                : null,
            }
          : null,
      });
  }

  return (
    <>
      {!studentId && (
        <div className="bg-amber-600 text-white text-center text-sm py-2 px-4 font-bold">
          ⚠️ سجّل دخول أولاً لرؤية واجباتك ومتابعة تسليماتك
        </div>
      )}
      <TeacherHomeworkHubClient teacherName={teacherName} homeworks={homeworks} />
    </>
  );
}

export async function generateMetadata({ params }: Props) {
  const { teacherSlug } = await params;
  const profile = await prisma.teacherProfile.findUnique({
    where: { slug: teacherSlug },
    include: { teacher: { select: { name: true } } },
  });
  const name = profile?.teacher?.name ?? teacherSlug;
  return {
    title: `واجبات ${name} | Code-UP`,
    description: `صفحة الواجبات المنزلية للمعلم ${name} على منصة Code-UP`,
  };
}
