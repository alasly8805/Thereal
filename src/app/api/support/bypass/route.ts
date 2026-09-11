import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSupportSession, logSupportAction } from "@/lib/support-auth";
import { ContentType, recordContentCompleted } from "@/lib/content-access-engine";

/**
 * POST /api/support/bypass
 * Body: { studentId, contentType: "QUIZ" | "HOMEWORK", sourceId, scorePercent?, reason? }
 *
 * Marks a quiz or homework as PASSED for a student without them sitting it —
 * the fix for "the teacher exempted me" / "I passed it offline" tickets.
 *
 * Unlike /api/support/unlock (which opens ONE downstream item past the gate
 * and leaves the assessment outstanding), this completes the assessment
 * itself: the student is never asked for it again and everything it was
 * blocking opens. That writes a real-looking QuizResult/HomeworkSubmission
 * row, so the score shows in the student's grades and the teacher's stats —
 * which is exactly why the score is the agent's explicit choice (default
 * 100%) and every call is audit-logged.
 *
 * A real existing grade is never LOWERED: if the student already has a
 * completed result with a higher score, the higher one stands and only the
 * completion/unlock effect is applied.
 */
export async function POST(req: NextRequest) {
  const support = await getSupportSession();
  if (!support) return NextResponse.json({ error: "غير مصرح" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as {
    studentId?: string;
    contentType?: string;
    sourceId?: string;
    scorePercent?: number;
    reason?: string;
  };

  const studentId = String(body.studentId || "").trim();
  const sourceId = String(body.sourceId || "").trim();
  const contentType = String(body.contentType || "").trim().toUpperCase();
  const reason = String(body.reason || "").trim().slice(0, 500);
  const scorePercent =
    body.scorePercent === undefined || body.scorePercent === null ? 100 : Number(body.scorePercent);

  if (!studentId || !sourceId) {
    return NextResponse.json({ error: "معرّف الطالب والمحتوى مطلوبان" }, { status: 400 });
  }
  if (contentType !== "QUIZ" && contentType !== "HOMEWORK") {
    return NextResponse.json({ error: "النوع يجب أن يكون QUIZ أو HOMEWORK" }, { status: 400 });
  }
  if (!Number.isFinite(scorePercent) || scorePercent < 0 || scorePercent > 100) {
    return NextResponse.json({ error: "الدرجة يجب أن تكون بين 0 و 100" }, { status: 400 });
  }

  const student = await prisma.user.findFirst({
    where: { id: studentId, role: "student", isDeleted: false },
    select: { id: true, name: true },
  });
  if (!student) return NextResponse.json({ error: "الطالب غير موجود" }, { status: 404 });

  try {
    if (contentType === "QUIZ") {
      const quiz = await prisma.quiz.findUnique({
        where: { id: sourceId },
        select: { id: true, title: true, _count: { select: { questions: true } } },
      });
      if (!quiz) return NextResponse.json({ error: "الاختبار غير موجود" }, { status: 404 });

      const totalQ = quiz._count.questions;
      const existing = await prisma.quizResult.findUnique({
        where: { studentId_quizId: { studentId, quizId: sourceId } },
        select: { score: true, totalQ: true, completedAt: true, startedAt: true },
      });

      // Never lower a real completed grade; bypass only raises or completes.
      const finalScore =
        existing?.completedAt != null ? Math.max(existing.score, scorePercent) : scorePercent;
      const completedAt = existing?.completedAt ?? new Date();

      await prisma.$transaction(async (tx) => {
        await tx.quizResult.upsert({
          where: { studentId_quizId: { studentId, quizId: sourceId } },
          create: {
            studentId,
            quizId: sourceId,
            score: finalScore,
            totalQ,
            startedAt: new Date(),
            completedAt,
            allowRetake: false,
          },
          update: {
            score: finalScore,
            totalQ: existing?.totalQ || totalQ,
            completedAt,
            allowRetake: false,
            // Keep the original start time if the attempt exists.
            ...(existing?.startedAt ? { startedAt: existing.startedAt } : {}),
          },
        });
        await recordContentCompleted(
          studentId,
          { type: ContentType.QUIZ, sourceId, title: quiz.title },
          { score: finalScore, completedAt },
          tx
        );
      });

      await logSupportAction({
        action: "SUPPORT_BYPASS_ASSESSMENT",
        targetType: "student",
        targetId: studentId,
        targetName: `${student.name} — ${quiz.title}`,
        metadata: {
          agent: support.agent,
          contentType,
          sourceId,
          scorePercent: finalScore,
          hadExistingResult: Boolean(existing?.completedAt),
          reason: reason || null,
        },
      });

      return NextResponse.json({ ok: true, title: quiz.title, score: finalScore, totalQ });
    }

    // ── HOMEWORK ────────────────────────────────────────────────────────────
    const homework = await prisma.homework.findUnique({
      where: { id: sourceId },
      select: {
        id: true,
        title: true,
        type: true,
        isPublished: true,
        _count: { select: { questions: true } },
      },
    });
    if (!homework) return NextResponse.json({ error: "الواجب غير موجود" }, { status: 404 });

    const existing = await prisma.homeworkSubmission.findUnique({
      where: { homeworkId_studentId: { homeworkId: sourceId, studentId } },
      select: { id: true, score: true, status: true },
    });

    // Exam-type homework carries a real percentage; other types are pass/fail.
    const isExam = homework.type === "exam" && homework._count.questions > 0;
    const finalScore =
      existing?.score != null ? Math.max(existing.score, scorePercent) : scorePercent;

    await prisma.$transaction(async (tx) => {
      await tx.homeworkSubmission.upsert({
        where: { homeworkId_studentId: { homeworkId: sourceId, studentId } },
        create: {
          homeworkId: sourceId,
          studentId,
          status: "passed",
          score: isExam ? finalScore : null,
          totalQ: isExam ? homework._count.questions : null,
        },
        update: {
          status: "passed",
          ...(isExam ? { score: finalScore, totalQ: homework._count.questions } : {}),
        },
      });
      await recordContentCompleted(
        studentId,
        { type: ContentType.HOMEWORK, sourceId, title: homework.title },
        { score: isExam ? finalScore : null },
        tx
      );
    });

    await logSupportAction({
      action: "SUPPORT_BYPASS_ASSESSMENT",
      targetType: "student",
      targetId: studentId,
      targetName: `${student.name} — ${homework.title}`,
      metadata: {
        agent: support.agent,
        contentType,
        sourceId,
        scorePercent: isExam ? finalScore : null,
        hadExistingSubmission: Boolean(existing),
        reason: reason || null,
      },
    });

    return NextResponse.json({
      ok: true,
      title: homework.title,
      score: isExam ? finalScore : null,
      totalQ: isExam ? homework._count.questions : null,
    });
  } catch (err) {
    console.error("support bypass failed:", err);
    return NextResponse.json({ error: "تعذر تنفيذ التخطّي" }, { status: 500 });
  }
}
