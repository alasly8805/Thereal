import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkQuizAccess } from "@/lib/authorization";
import { blockSupportView } from "@/lib/support-auth";
import { serializeDraftAnswers } from "@/lib/quiz-attempt";

/** Autosave in-progress answers. Never touches a completed attempt. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  const supportBlocked = blockSupportView(session);
  if (supportBlocked) return supportBlocked;
  if (!session) return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
  if (session.role !== "student") {
    return NextResponse.json({ error: "غير مصرح" }, { status: 403 });
  }

  const { id: quizId } = await params;
  const hasAccess = await checkQuizAccess(session.id, session.role, quizId);
  if (!hasAccess) return NextResponse.json({ error: "لا يوجد صلاحية للوصول" }, { status: 403 });

  const body = await req.json().catch(() => null);
  const answers = (body?.answers ?? {}) as Record<string, string>;
  if (!answers || typeof answers !== "object" || Array.isArray(answers)) {
    return NextResponse.json({ error: "إجابات غير صالحة" }, { status: 400 });
  }

  const existing = await prisma.quizResult.findUnique({
    where: { studentId_quizId: { studentId: session.id, quizId } },
    select: { id: true, completedAt: true, startedAt: true, pausedAt: true },
  });

  if (!existing || !existing.startedAt) {
    return NextResponse.json({ error: "لم يتم بدء الاختبار" }, { status: 400 });
  }
  if (existing.pausedAt) {
    return NextResponse.json({ error: "الاختبار متوقف. ادخل مرة أخرى للمتابعة." }, { status: 409 });
  }
  if (existing.completedAt) {
    return NextResponse.json({ error: "الاختبار مكتمل ولا يمكن تعديل المسودة" }, { status: 409 });
  }

  await prisma.quizResult.update({
    where: { id: existing.id },
    data: { draftAnswers: serializeDraftAnswers(answers) },
  });

  return NextResponse.json({ saved: true, savedAt: new Date().toISOString() });
}
