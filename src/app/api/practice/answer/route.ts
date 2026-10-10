import { NextResponse } from "next/server";
import { getStudentSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { blockSupportView } from "@/lib/support-auth";
import { burstLimited, isSafeId, readJson, tooMany } from "@/lib/essay-ai-http";
import { MAX_ESSAY_CHARS, attemptQuestionIds, letterForSlot, parsePresentation } from "@/lib/practice";

/** Autosaves one answer while the practice set is still open. */
export async function POST(req: Request) {
  try {
    const session = await getStudentSession();
    if (!session) return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
    const blocked = blockSupportView(session);
    if (blocked) return blocked;
    if (burstLimited(`practice-answer:${session.id}`, 90, 60_000)) return tooMany();

    const body = await readJson(req);
    if (!body || !isSafeId(body.setId) || !isSafeId(body.questionId)) {
      return NextResponse.json({ error: "بيانات غير صالحة" }, { status: 400 });
    }

    const attempt = await prisma.practiceAttempt.findUnique({
      where: { studentId_setId: { studentId: session.id, setId: body.setId } },
      select: { id: true, submittedAt: true, presentation: true, questionIds: true, set: { select: { questionIds: true } } },
    });
    if (!attempt) return NextResponse.json({ error: "التدريب غير موجود" }, { status: 404 });
    if (attempt.submittedAt) return NextResponse.json({ error: "تم تسليم هذا التدريب بالفعل" }, { status: 409 });
    if (!attemptQuestionIds(attempt, attempt.set).includes(body.questionId)) {
      return NextResponse.json({ error: "السؤال غير موجود" }, { status: 404 });
    }

    const q = await prisma.practiceQuestion.findUnique({ where: { id: body.questionId }, select: { questionType: true } });
    let data: { choice: string | null } | { essayAnswer: string };
    if (q?.questionType === "essay") {
      if (typeof body.text !== "string") return NextResponse.json({ error: "بيانات غير صالحة" }, { status: 400 });
      data = { essayAnswer: body.text.slice(0, MAX_ESSAY_CHARS) };
    } else {
      const letter = body.slot === null ? null : letterForSlot(parsePresentation(attempt.presentation)[body.questionId], Number(body.slot));
      if (body.slot !== null && !letter) return NextResponse.json({ error: "اختيار غير صالح" }, { status: 400 });
      data = { choice: letter };
    }

    await prisma.practiceAnswer.upsert({
      where: { attemptId_questionId: { attemptId: attempt.id, questionId: body.questionId } },
      create: { attemptId: attempt.id, questionId: body.questionId, ...data },
      update: data,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[practice] answer error:", error);
    return NextResponse.json({ error: "حدث خطأ داخلي" }, { status: 500 });
  }
}
