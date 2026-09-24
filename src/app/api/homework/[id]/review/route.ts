import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { isTeacherLike, actingTeacherId, hasAssistantPermission } from "@/lib/teacher-scope";
import { prisma } from "@/lib/prisma";
import { ContentType, syncHomeworkContentProgress } from "@/lib/content-access-engine";

/**
 * POST /api/homework/[id]/review
 * Teacher manually accepts or rejects a flagged (review_requested) submission.
 * Body: { submissionId: string, verdict: "passed" | "failed", note?: string }
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session || !isTeacherLike(session.role))
    return NextResponse.json({ error: "غير مصرح — فقط المعلمون" }, { status: 403 });
  if (!hasAssistantPermission(session, "gradeHomework"))
    return NextResponse.json({ error: "المدرّس لم يمنحك صلاحية تصحيح الواجبات" }, { status: 403 });

  const { id: homeworkId } = await params;

  // Verify homework belongs to this teacher
  const hw = await prisma.homework.findUnique({
    where: { id: homeworkId },
    select: { teacherId: true, title: true },
  });

  if (!hw) return NextResponse.json({ error: "الواجب غير موجود" }, { status: 404 });
  if (hw.teacherId !== actingTeacherId(session))
    return NextResponse.json({ error: "هذا الواجب لا ينتمي إليك" }, { status: 403 });

  const body = (await req.json()) as {
    submissionId: string;
    verdict: "passed" | "failed";
    note?: string;
  };

  if (!body.submissionId || !["passed", "failed"].includes(body.verdict))
    return NextResponse.json({ error: "بيانات غير صحيحة" }, { status: 400 });

  // Verify the submission belongs to this homework
  const submissionRecord = await prisma.homeworkSubmission.findUnique({
    where: { id: body.submissionId },
    select: {
      homeworkId: true,
      fileUrl: true,
      fileName: true,
      submittedOutput: true,
    },
  });

  if (!submissionRecord) {
    return NextResponse.json({ error: "التسليم غير موجود" }, { status: 404 });
  }
  if (submissionRecord.homeworkId !== homeworkId) {
    return NextResponse.json({ error: "التسليم لا يتطابق مع الواجب المحدد" }, { status: 400 });
  }

  const snapshotJson = JSON.stringify({
    fileUrl: submissionRecord.fileUrl,
    fileName: submissionRecord.fileName,
    submittedOutput: submissionRecord.submittedOutput,
  });

  const { submission, review } = await prisma.$transaction(async (tx) => {
    // Accept keeps the next item open. Reject locks it again. A later PDF
    // re-upload returns to قيد المراجعة and unlocks until the next verdict.
    const updatedSubmission = await tx.homeworkSubmission.update({
      where: { id: body.submissionId },
      data: { status: body.verdict, allowRetake: false },
    });

    await syncHomeworkContentProgress(
      updatedSubmission.studentId,
      { type: ContentType.HOMEWORK, sourceId: homeworkId, title: hw.title },
      body.verdict,
      { score: updatedSubmission.score },
      tx
    );

    const updatedReview = await tx.homeworkReview.upsert({
      where: { submissionId: body.submissionId },
      create: {
        submissionId: body.submissionId,
        teacherId: actingTeacherId(session),
        verdict: body.verdict,
        note: body.note ?? null,
        snapshotJson,
        reviewedAt: new Date(),
      },
      update: {
        verdict: body.verdict,
        note: body.note ?? null,
        snapshotJson,
        reviewedAt: new Date(),
      },
    });

    return { submission: updatedSubmission, review: updatedReview };
  });

  return NextResponse.json({ submission, review });
}

/**
 * GET /api/homework/[id]/review
 * Returns submissions for this homework (pending + reviewed) so approved work stays visible.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session || !isTeacherLike(session.role))
    return NextResponse.json({ error: "غير مصرح" }, { status: 403 });
  if (!hasAssistantPermission(session, "gradeHomework"))
    return NextResponse.json({ error: "المدرّس لم يمنحك صلاحية تصحيح الواجبات" }, { status: 403 });

  const { id: homeworkId } = await params;

  const hw = await prisma.homework.findUnique({
    where: { id: homeworkId },
    select: {
      teacherId: true,
      title: true,
      expectedOutput: true,
      type: true,
      // Exam questions + correct answers: safe to expose here — this endpoint is
      // teacher/assistant-only and ownership-verified above.
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
          correctAnswer: true,
          order: true,
        },
      },
    },
  });

  if (!hw || hw.teacherId !== actingTeacherId(session))
    return NextResponse.json({ error: "غير مصرح" }, { status: 403 });

  const submissions = await prisma.homeworkSubmission.findMany({
    where: {
      homeworkId,
      student: { accountMode: { not: "TESTER" } },
    },
    include: {
      student: { select: { id: true, name: true, email: true } },
      review: true,
    },
    orderBy: { completedAt: "desc" },
  });

  const decorated = submissions.map((sub) => {
    let snapshot: { fileUrl?: string | null; fileName?: string | null; submittedOutput?: string | null } | null = null;
    if (sub.review?.snapshotJson) {
      try {
        snapshot = JSON.parse(sub.review.snapshotJson) as typeof snapshot;
      } catch {
        snapshot = null;
      }
    }
    const fileChanged = Boolean(
      snapshot &&
        (snapshot.fileUrl || snapshot.fileName) &&
        (sub.fileUrl !== snapshot.fileUrl || sub.fileName !== snapshot.fileName)
    );
    const outputChanged = Boolean(
      snapshot &&
        typeof snapshot.submittedOutput === "string" &&
        (sub.submittedOutput || "") !== (snapshot.submittedOutput || "")
    );
    return {
      ...sub,
      snapshot,
      contentChanged: fileChanged || outputChanged,
    };
  });

  return NextResponse.json({ hw, submissions: decorated });
}
