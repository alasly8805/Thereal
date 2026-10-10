import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkHomeworkAccess } from "@/lib/authorization";
import { canAccessContent, contentDeniedPayload, ContentType, hasActiveSupportReopen } from "@/lib/content-access-engine";
import {
  answersToDisplay,
  parsePresentation,
  presentStudentView,
} from "@/lib/attempt-presentation";
import { ensureHomeworkExamView, homeworkPresentationOptions } from "@/lib/homework-exam-view";

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

  // A student who already submitted keeps their grade after the window closes.
  // Students with no submission still get "انتهى وقت الامتحان".
  let solvedAfterClose = false;
  let supportReopen = false;
  if (session.role === "student") {
    const prior = await prisma.homeworkSubmission.findUnique({
      where: { homeworkId_studentId: { homeworkId, studentId: session.id } },
      select: { completedAt: true, score: true },
    });
    const solved = !!prior && (prior.completedAt != null || prior.score != null);
    const access = await canAccessContent(session.id, {
      type: ContentType.HOMEWORK,
      sourceId: homeworkId,
      title: homework.title,
    });
    supportReopen = await hasActiveSupportReopen(session.id, homeworkId, [
      ContentType.HOMEWORK,
      ContentType.EXAM,
    ]);
    const closedBySchedule = !access.allowed && access.code === "CONTENT_CLOSED";
    const windowClosed = closedBySchedule && !supportReopen;
    solvedAfterClose = solved && windowClosed;
    // Support reopen opens the exam this student already has. A finished
    // attempt with no reopen still stays readable after the window closes.
    if (!(supportReopen && closedBySchedule) && !solvedAfterClose) {
      const denied = contentDeniedPayload(access);
      if (denied) return NextResponse.json(denied.body, { status: denied.status });
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
  const submissionForStudent =
    mySubmission && solvedAfterClose
      ? { ...mySubmission, allowRetake: false }
      : mySubmission && supportReopen
        ? { ...mySubmission, allowRetake: true }
        : mySubmission;

  // `attemptLocked`: grading can no longer change. Staff always see the key;
  // a student sees it only on a locked attempt, and only when the teacher
  // allows it (revealAnswers off stops a finished student passing it on).
  // A reopened attempt must hide answers again.
  const attemptLocked =
    session.role !== "student" || (!!submissionForStudent && !submissionForStudent.allowRetake);
  const revealAnswers = session.role !== "student" || (attemptLocked && homework.revealAnswers);

  let questions = homework.questions;
  let submissionOut = submissionForStudent;
  if (session.role === "student" && homework.type === "exam") {
    const saved = parsePresentation(mySubmission?.presentation);
    // Freeze the order from the first open. Rebuilding on every load used to
    // put a new shuffle under letters the student had already picked.
    const presentation = attemptLocked
      ? saved
      : await ensureHomeworkExamView(
          session.id,
          homeworkId,
          homework.questions,
          !!mySubmission?.allowRetake,
          homeworkPresentationOptions(homework)
        );
    questions = presentStudentView(homework.questions, presentation);
    if (attemptLocked && saved && submissionOut?.answers) {
      submissionOut = { ...submissionOut, answers: answersToDisplay(submissionOut.answers, saved) };
    }
  }

  // Strip sensitive fields for students. The bank size and the per-student
  // draw are staff-only details.
  const safe = {
    ...homework,
    questions: revealAnswers
      ? questions
      : questions.map(({ correctAnswer: _ca, ...q }) => q),
    mySubmission: submissionOut,
    expectedOutput: session.role === "student" ? null : homework.expectedOutput,
    questionsPerStudent: session.role === "student" ? null : homework.questionsPerStudent,
    answersHidden: session.role === "student" && attemptLocked && !homework.revealAnswers,
  };

  return NextResponse.json({ homework: safe });
}
