import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { isTeacherLike, actingTeacherId, hasAssistantPermission } from "@/lib/teacher-scope";
import { prisma } from "@/lib/prisma";
import { ContentType, syncHomeworkContentProgress } from "@/lib/content-access-engine";
import { resetHomeworkExamView } from "@/lib/homework-exam-view";

/**
 * POST /api/homework/[id]/retry
 * Teacher/assistant toggles a second attempt on a locked submission.
 * Body: { submissionId: string, allowRetake: boolean }
 *
 * Rejecting a homework closes the next item and the re-upload.
 * This toggle is the only way a teacher or assistant reopens that attempt.
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

  const hw = await prisma.homework.findUnique({
    where: { id: homeworkId },
    select: { teacherId: true, title: true },
  });

  if (!hw) return NextResponse.json({ error: "الواجب غير موجود" }, { status: 404 });
  if (hw.teacherId !== actingTeacherId(session))
    return NextResponse.json({ error: "هذا الواجب لا ينتمي إليك" }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as {
    submissionId?: string;
    allowRetake?: boolean;
  };

  if (!body.submissionId || typeof body.allowRetake !== "boolean")
    return NextResponse.json({ error: "بيانات غير صحيحة" }, { status: 400 });

  const submissionRecord = await prisma.homeworkSubmission.findUnique({
    where: { id: body.submissionId },
    select: {
      id: true,
      homeworkId: true,
      studentId: true,
      status: true,
      score: true,
      student: { select: { accountMode: true } },
    },
  });

  if (!submissionRecord)
    return NextResponse.json({ error: "التسليم غير موجود" }, { status: 404 });
  if (submissionRecord.homeworkId !== homeworkId)
    return NextResponse.json({ error: "التسليم لا يتطابق مع الواجب المحدد" }, { status: 400 });
  if (submissionRecord.student.accountMode === "TESTER")
    return NextResponse.json({ error: "التسليم غير موجود" }, { status: 404 });

  if (submissionRecord.status !== "passed" && submissionRecord.status !== "failed") {
    return NextResponse.json(
      { error: "إعادة المحاولة متاحة بعد القبول أو الرفض فقط" },
      { status: 400 }
    );
  }

  const submission = await prisma.$transaction(async (tx) => {
    const updated = await tx.homeworkSubmission.update({
      where: { id: body.submissionId },
      data: { allowRetake: body.allowRetake },
    });
    // The student has seen the old order, often with the key. A retake gets a
    // fresh draw and shuffle when they next open it.
    if (body.allowRetake) await resetHomeworkExamView(updated.studentId, homeworkId, tx);
    await syncHomeworkContentProgress(
      updated.studentId,
      { type: ContentType.HOMEWORK, sourceId: homeworkId, title: hw.title },
      updated.status,
      { score: updated.score, allowRetake: body.allowRetake },
      tx
    );
    return updated;
  });

  return NextResponse.json({
    submission,
    message: body.allowRetake
      ? "تم السماح بإعادة المحاولة — الطالب يقدر يرفع نسخة جديدة"
      : "تم إلغاء إعادة المحاولة",
  });
}
