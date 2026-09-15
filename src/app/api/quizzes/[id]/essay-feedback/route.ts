import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getStudentEssayFeedback } from "@/lib/essay-ai-grading";
import { burstLimited, isSafeId, tooMany } from "@/lib/essay-ai-http";

/**
 * GET — the signed-in user's OWN essay feedback for this quiz: official
 * verdict (and whether a teacher or the AI grader decided it), the AI's
 * preliminary evaluation, and any cached explanation.
 *
 * The result is resolved from (session user, quiz id); no result/answer id is
 * accepted from the client, so another student's answers are unreachable.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
  const { id: quizId } = await params;
  if (!isSafeId(quizId)) return NextResponse.json({ error: "الاختبار غير موجود" }, { status: 404 });
  // The result page polls while grading runs; cap it per worker.
  if (burstLimited(`essay-feedback:${session.id}`, 40, 60_000)) return tooMany();

  const feedback = await getStudentEssayFeedback(session.id, quizId);
  if (!feedback) return NextResponse.json({ error: "لا توجد محاولة مُسلَّمة لهذا الاختبار" }, { status: 404 });

  // Internal ids stay server-side; the client only needs its own items.
  const payload = { aiEnabled: feedback.aiEnabled, mode: feedback.mode, inProgress: feedback.inProgress, items: feedback.items };
  return NextResponse.json(payload, { headers: { "Cache-Control": "private, no-store" } });
}
