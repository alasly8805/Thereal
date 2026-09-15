import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { checkQuizAccess } from "@/lib/authorization";
import { blockSupportView } from "@/lib/support-auth";
import { explainEssayResult } from "@/lib/essay-ai-grading";
import { burstLimited, isSafeId, readJson, tooMany } from "@/lib/essay-ai-http";

const MESSAGES: Record<string, [number, string]> = {
  NOT_FOUND: [404, "لم نجد إجابتك المقالية لهذا السؤال"],
  AI_DISABLED: [403, "الشرح بالذكاء الاصطناعي غير مفعّل لهذا الكورس"],
  NO_CRITERIA: [422, "لم يضع المعلم معايير تصحيح لهذا السؤال، لذلك لا يمكن شرح الدرجة آلياً بدقة. اسأل المعلم مباشرة."],
  NOT_GRADED_YET: [409, "إجابتك لم تُقيَّم بعد — انتظر التقييم ثم اطلب الشرح"],
  RATE_LIMITED: [429, "وصلت للحد اليومي لطلبات الشرح، حاول غداً"],
  IN_PROGRESS: [409, "جارٍ تجهيز الشرح، انتظر لحظات"],
  FAILED: [502, "تعذر تجهيز الشرح الآن، حاول لاحقاً"],
};

/** POST { questionId } — "why did I get this grade?" for the caller's own answer. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  const blocked = blockSupportView(session);
  if (blocked) return blocked;
  if (!session) return NextResponse.json({ error: "غير مصرح" }, { status: 401 });

  const { id: quizId } = await params;
  const body = await readJson(req);
  const questionId = body?.questionId;
  if (!isSafeId(quizId) || !isSafeId(questionId)) return NextResponse.json({ error: "بيانات غير صالحة" }, { status: 400 });
  if (burstLimited(`essay-explain:${session.id}`, 6, 60_000)) return tooMany();

  // Spending AI credit requires current access to the quiz (active subscription).
  if (!(await checkQuizAccess(session.id, session.role, quizId))) {
    return NextResponse.json({ error: "لا يوجد صلاحية للوصول" }, { status: 403 });
  }

  const outcome = await explainEssayResult(session.id, quizId, questionId);
  if ("explanation" in outcome) return NextResponse.json({ explanation: outcome.explanation, cached: outcome.cached });
  const [status, error] = MESSAGES[outcome.code] ?? [500, "حدث خطأ"];
  return NextResponse.json({ error, code: outcome.code }, { status });
}
