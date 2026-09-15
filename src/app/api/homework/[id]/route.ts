import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkHomeworkAccess } from "@/lib/authorization";
import { canAccessContent, ContentType } from "@/lib/content-access-engine";

/** GET /api/homework/[id] — student fetches homework details (answers hidden) */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "غير مصرح" }, { status: 401 });

  const { id: homeworkId } = await params;

  const homework = await prisma.homework.findUnique({
    where: { id: homeworkId },
    include: {
      teacher: {
        select: {
          id: true,
          name: true,
          teacherProfile: { select: { slug: true } },
        },
      },
      folder: {
        select: {
          id: true,
          name: true,
          courseId: true,
          course: { select: { id: true, title: true, subject: true } },
        },
      },
      video: { select: { id: true, title: true } },
      questions: {
        orderBy: { order: "asc" },
        select: {
          id: true,
          question: true,
          imageUrl: true,
          optionA: true,
          optionB: true,
          optionC: true,
          optionD: true,
          order: true,
          // Fetched for everyone, but stripped below for students who have
          // not submitted yet — otherwise the review UI can never show which
          // answers were wrong after the attempt is locked.
          correctAnswer: true,
        },
      },
    },
  });

  if (!homework) return NextResponse.json({ error: "الواجب غير موجود" }, { status: 404 });

  // Access check: ensures student is enrolled or teacher owns the course
  const hasAccess = await checkHomeworkAccess(session.id, session.role, homeworkId);
  if (!hasAccess) {
    return NextResponse.json({ error: "غير مصرح لك بالوصول لهذا الواجب" }, { status: 403 });
  }

  // Student: only published
  if (session.role === "student" && !homework.isPublished)
    return NextResponse.json({ error: "الواجب غير منشور" }, { status: 403 });

  if (session.role === "student") {
    const access = await canAccessContent(session.id, {
      type: ContentType.HOMEWORK,
      sourceId: homeworkId,
      title: homework.title,
    });
    if ("requiredItem" in access) {
      return NextResponse.json(
        {
          error: `يجب إكمال «${access.requiredItem.title}» أولًا.`,
          code: access.code,
          requiredItem: access.requiredItem,
        },
        { status: 403 }
      );
    }
  }

  // Fetch student submission if any
  const mySubmission = session.role === "student"
    ? await prisma.homeworkSubmission.findUnique({
        where: { homeworkId_studentId: { homeworkId, studentId: session.id } },
        include: { review: { select: { verdict: true, note: true, reviewedAt: true } } },
      })
    : null;

  // Reveal correct answers only when grading can no longer change: staff
  // always see them; a student sees them only after their graded attempt is
  // locked. A reopened attempt must hide answers again.
  const revealAnswers =
    session.role !== "student" || (!!mySubmission && !mySubmission.allowRetake);

  // Strip sensitive fields for students
  const safe = {
    ...homework,
    questions: revealAnswers
      ? homework.questions
      : homework.questions.map(({ correctAnswer: _ca, ...q }) => q),
    expectedOutput: session.role === "student" ? null : homework.expectedOutput,
    mySubmission,
  };

  return NextResponse.json({ homework: safe });
}
