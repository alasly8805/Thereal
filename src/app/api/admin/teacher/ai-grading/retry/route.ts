import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { retryFailedGrade } from "@/lib/essay-ai-grading";
import { burstLimited, isSafeId, readJson, teacherScope, tooMany } from "@/lib/essay-ai-http";

/**
 * POST { answerId } — re-run a FAILED AI evaluation. Teacher/assistant of the
 * owning course only; students cannot trigger grading at all.
 */
export async function POST(req: NextRequest) {
  const session = await getSession();
  const scope = teacherScope(session, "viewQuizResults");
  if ("response" in scope) return scope.response;
  if (burstLimited(`essay-retry:${session!.id}`, 20, 60_000)) return tooMany();

  const body = await readJson(req);
  const answerId = body?.answerId;
  if (!isSafeId(answerId)) return NextResponse.json({ error: "answerId مطلوب" }, { status: 400 });

  const answer = await prisma.quizAnswer.findFirst({
    where: {
      id: answerId,
      questionType: "essay",
      result: { quiz: { folder: { course: scope.teacherId !== null ? { teacherId: scope.teacherId } : {} } } },
    },
    select: { id: true },
  });
  if (!answer) return NextResponse.json({ error: "الإجابة غير موجودة" }, { status: 404 });

  const ok = await retryFailedGrade(answer.id);
  if (!ok) return NextResponse.json({ error: "لا يوجد تقييم فاشل لإعادة المحاولة" }, { status: 409 });
  return NextResponse.json({ ok: true });
}
