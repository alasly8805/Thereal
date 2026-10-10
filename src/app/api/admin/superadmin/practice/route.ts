import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { buildAllDailySets, generatePracticeQuestions, type GenerateReport } from "@/lib/practice-generate";

/**
 * Superadmin-only view of the daily-practice bank (sizes per lesson, today's
 * set) and a manual "generate now" trigger. Teachers have no route to this data.
 */

let lastRun: { startedAt: string; finishedAt?: string; reports?: GenerateReport[]; error?: string } | null = null;

async function superadmin() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
  if (session.role !== "superadmin" || session.supportView) return NextResponse.json({ error: "غير مصرح" }, { status: 403 });
  return null;
}

export async function GET() {
  const denied = await superadmin();
  if (denied) return denied;

  const [byLesson, rejected, sets, attempts] = await Promise.all([
    prisma.practiceQuestion.groupBy({
      by: ["educationalStage", "language", "lessonNumber", "lessonTitle", "questionType"],
      where: { isActive: true },
      _count: true,
      orderBy: { lessonNumber: "asc" },
    }),
    prisma.practiceQuestion.groupBy({ by: ["educationalStage", "rejectReason"], where: { isActive: false }, _count: true }),
    prisma.practiceSet.findMany({ orderBy: { day: "desc" }, take: 7, select: { educationalStage: true, language: true, day: true, questionIds: true, _count: { select: { attempts: true } } } }),
    prisma.practiceAttempt.count({ where: { finalizedAt: { not: null } } }),
  ]);

  return NextResponse.json({
    bank: byLesson.map((r) => ({ stage: r.educationalStage, language: r.language, lesson: r.lessonNumber, title: r.lessonTitle, type: r.questionType, count: r._count })),
    rejected: rejected.map((r) => ({ stage: r.educationalStage, reason: r.rejectReason, count: r._count })),
    recentSets: sets.map((s) => ({ stage: s.educationalStage, language: s.language, day: s.day, questions: (JSON.parse(s.questionIds) as string[]).length, students: s._count.attempts })),
    finishedAttempts: attempts,
    lastRun,
  });
}

/** Starts a generation run in the background (it can take several minutes). Body: { maxBatches?: number } */
export async function POST(req: Request) {
  const denied = await superadmin();
  if (denied) return denied;
  if (lastRun && !lastRun.finishedAt) return NextResponse.json({ error: "عملية توليد تعمل بالفعل", lastRun }, { status: 409 });

  const body = (await req.json().catch(() => ({}))) as { maxBatches?: unknown };
  const n = Number(body.maxBatches);
  const maxBatches = Number.isInteger(n) && n > 0 ? Math.min(n, 200) : undefined;

  const run: NonNullable<typeof lastRun> = { startedAt: new Date().toISOString() };
  lastRun = run;
  (async () => {
    try {
      run.reports = await generatePracticeQuestions({ maxBatches });
      await buildAllDailySets();
    } catch (err) {
      run.error = err instanceof Error ? err.message.slice(0, 200) : "UNKNOWN";
    } finally {
      run.finishedAt = new Date().toISOString();
    }
  })();
  return NextResponse.json({ ok: true, started: run.startedAt }, { status: 202 });
}
