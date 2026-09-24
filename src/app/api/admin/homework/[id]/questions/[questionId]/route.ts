import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { isTeacherLike, actingTeacherId, hasAssistantPermission } from "@/lib/teacher-scope";
import { prisma } from "@/lib/prisma";
import { logAdminAction } from "@/lib/admin-auth";
import { parseDegree } from "@/lib/quiz-grading";
import { diffQuestionEdit } from "@/lib/quiz-regrade";
import { kickHomeworkQuestionRegrade } from "@/lib/homework-regrade";

const MAX_QUESTION_LENGTH = 500;
const MAX_OPTION_LENGTH = 200;

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/**
 * PATCH — teacher edits one exam-homework question (text, options, correct
 * answer, degree). The write is committed first; completed attempts are
 * re-graded in the background so the teacher UI is never blocked on class size.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; questionId: string }> }
) {
  const session = await getSession();
  if (session && session.role === "superadmin") {
    try {
      await logAdminAction({
        adminId: session.id,
        adminName: session.name,
        action: "SUPERADMIN_ACTION",
        targetType: "API_ROUTE",
        targetId: req.nextUrl ? req.nextUrl.pathname : req.url,
        targetName: req.method,
      });
    } catch {
      // audit trail is best-effort
    }
  }
  if (!session || (!isTeacherLike(session.role) && session.role !== "superadmin")) {
    return NextResponse.json({ error: "غير مصرح" }, { status: 403 });
  }
  if (isTeacherLike(session.role) && !hasAssistantPermission(session, "manageHomework")) {
    return NextResponse.json({ error: "المدرّس لم يمنحك صلاحية إدارة الواجبات" }, { status: 403 });
  }

  const { id: homeworkId, questionId } = await params;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

  const existing = await prisma.homeworkQuestion.findFirst({
    where: {
      id: questionId,
      homeworkId,
      ...(session.role !== "superadmin" ? { homework: { teacherId: actingTeacherId(session) } } : {}),
    },
    include: { homework: { select: { type: true } } },
  });
  if (!existing) {
    return NextResponse.json({ error: "السؤال غير موجود" }, { status: 404 });
  }
  if (existing.homework.type !== "exam") {
    return NextResponse.json({ error: "يمكن تعديل أسئلة واجبات الاختبار فقط" }, { status: 400 });
  }

  const questionText = asString(body.question !== undefined ? body.question : existing.question).trim();
  if (!questionText) {
    return NextResponse.json({ error: "نص السؤال مطلوب" }, { status: 400 });
  }
  if (questionText.length > MAX_QUESTION_LENGTH) {
    return NextResponse.json(
      { error: `نص السؤال طويل جداً (الحد الأقصى ${MAX_QUESTION_LENGTH} حرف)` },
      { status: 400 }
    );
  }

  const optionA = asString(body.optionA !== undefined ? body.optionA : existing.optionA).trim();
  const optionB = asString(body.optionB !== undefined ? body.optionB : existing.optionB).trim();
  const optionC = asString(body.optionC !== undefined ? body.optionC : existing.optionC).trim();
  const optionD = asString(body.optionD !== undefined ? body.optionD : existing.optionD).trim();

  const filled = [optionA, optionB, optionC, optionD].filter((opt) => opt.length > 0);
  if (filled.length < 2) {
    return NextResponse.json({ error: "يجب أن يحتوي السؤال على خيارين على الأقل" }, { status: 400 });
  }
  for (const opt of filled) {
    if (opt.length > MAX_OPTION_LENGTH) {
      return NextResponse.json(
        { error: `خيار طويل جداً (الحد الأقصى ${MAX_OPTION_LENGTH} حرف)` },
        { status: 400 }
      );
    }
  }

  const requestedCorrect = asString(
    body.correctAnswer !== undefined ? body.correctAnswer : existing.correctAnswer
  )
    .trim()
    .toUpperCase();
  const correctAnswer = ["A", "B", "C", "D"].includes(requestedCorrect) ? requestedCorrect : "A";
  const correctOption = { A: optionA, B: optionB, C: optionC, D: optionD }[correctAnswer];
  if (!correctOption) {
    return NextResponse.json({ error: "الإجابة الصحيحة غير موجودة ضمن الخيارات" }, { status: 400 });
  }

  const degree = parseDegree(body.degree !== undefined ? body.degree : existing.degree);
  const imageUrlRaw = body.imageUrl !== undefined ? asString(body.imageUrl).trim() : existing.imageUrl;
  const imageUrl = imageUrlRaw ? imageUrlRaw : null;

  const after = {
    question: questionText,
    questionType: "mcq",
    optionA,
    optionB,
    optionC,
    optionD,
    correctAnswer,
    degree,
  };
  const diff = diffQuestionEdit(
    {
      question: existing.question,
      questionType: "mcq",
      optionA: existing.optionA,
      optionB: existing.optionB,
      optionC: existing.optionC,
      optionD: existing.optionD,
      correctAnswer: existing.correctAnswer,
      degree: parseDegree(existing.degree),
    },
    after
  );

  const updated = await prisma.homeworkQuestion.update({
    where: { id: questionId },
    data: {
      question: questionText,
      imageUrl,
      optionA,
      optionB,
      optionC,
      optionD,
      correctAnswer,
      degree,
    },
  });

  let regrading = false;
  if (diff.needsRegrade) {
    const completedCount = await prisma.homeworkSubmission.count({
      where: { homeworkId, answers: { not: null } },
    });
    if (completedCount > 0) {
      regrading = true;
      kickHomeworkQuestionRegrade({ homeworkId, questionId });
    }
  }

  return NextResponse.json({
    question: updated,
    regrading,
  });
}
