import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { checkQuizAccess } from "@/lib/authorization";
import { blockSupportView } from "@/lib/support-auth";
import { getStrongAnswerInsight } from "@/lib/essay-ai-grading";
import { burstLimited, isSafeId, readJson, tooMany } from "@/lib/essay-ai-http";

const MESSAGES: Record<string, [number, string]> = {
  NOT_FOUND: [404, "هذه الميزة متاحة بعد تسليم إجابتك على السؤال"],
  RETAKE_OPEN: [409, "متاحة بعد انتهاء محاولتك الحالية"],
  AI_DISABLED: [403, "هذه الميزة غير مفعّلة لهذا الكورس"],
  NO_CRITERIA: [422, "لم يضع المعلم معايير تصحيح لهذا السؤال بعد"],
  IN_PROGRESS: [409, "جارٍ تجهيز المثال، حاول بعد دقيقة"],
  FAILED: [502, "تعذر تجهيز المثال الآن، حاول لاحقاً"],
};

/**
 * POST { questionId } — "how do students get full marks?". Returns an
 * AI-written example built from the TEACHER's criteria (never from another
 * student's answer) plus, only for a large enough cohort, a rounded share of
 * students who earned full marks. No classmate data of any kind is returned.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  const blocked = blockSupportView(session);
  if (blocked) return blocked;
  if (!session) return NextResponse.json({ error: "غير مصرح" }, { status: 401 });

  const { id: quizId } = await params;
  const body = await readJson(req);
  const questionId = body?.questionId;
  if (!isSafeId(quizId) || !isSafeId(questionId)) return NextResponse.json({ error: "بيانات غير صالحة" }, { status: 400 });
  if (burstLimited(`essay-strong:${session.id}`, 10, 60_000)) return tooMany();

  if (!(await checkQuizAccess(session.id, session.role, quizId))) {
    return NextResponse.json({ error: "لا يوجد صلاحية للوصول" }, { status: 403 });
  }

  const outcome = await getStrongAnswerInsight(session.id, quizId, questionId);
  if ("exemplar" in outcome) {
    return NextResponse.json({ exemplar: outcome.exemplar, fullMarkSharePercent: outcome.fullMarkSharePercent });
  }
  const [status, error] = MESSAGES[outcome.code] ?? [500, "حدث خطأ"];
  return NextResponse.json({ error, code: outcome.code }, { status });
}
