import { NextResponse } from "next/server";
import { getStudentSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getConfigBool } from "@/lib/config";
import {
  PRACTICE_CURRICULA,
  attemptQuestionIds,
  PRACTICE_POINTS,
  cairoDay,
  cairoHour,
  parseLanguage,
  parsePresentation,
  publicQuestion,
  shuffledOrder,
  slotForLetter,
  type Presentation,
} from "@/lib/practice";
import { buildDailySet, pickForStudent } from "@/lib/practice-generate";
import { finalizeAttempt, kickPracticeGrading } from "@/lib/practice-grading";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

/** Pre-selects the track from the student's enrolled course titles; the student still confirms. */
async function suggestTrack(studentId: string): Promise<"ar" | "en" | null> {
  const rows = await prisma.courseEnrollment.findMany({ where: { studentId }, select: { course: { select: { title: true } } } }).catch(() => []);
  let en = 0;
  let ar = 0;
  for (const r of rows) {
    const t = r.course?.title ?? "";
    if (/لغات|programming|english/i.test(t)) en++;
    else if (/عربي/.test(t)) ar++;
  }
  return en > ar ? "en" : ar > en ? "ar" : null;
}

/** Today's practice set for the signed-in student, with their saved answers (and results once submitted). */
export async function GET() {
  try {
    const session = await getStudentSession();
    if (!session) return NextResponse.json({ error: "غير مصرح" }, { status: 401 });

    const user = await prisma.user.findUnique({
      where: { id: session.id },
      select: { educationalStage: true, points: true, practiceTrack: true },
    });
    const stage = user?.educationalStage ?? "";
    if (!PRACTICE_CURRICULA[stage]) return NextResponse.json({ available: false, reason: "STAGE" }, { headers: NO_STORE });
    if (!(await getConfigBool("practice_enabled"))) return NextResponse.json({ available: false, reason: "DISABLED" }, { headers: NO_STORE });

    let language = parseLanguage(user?.practiceTrack);
    if (!language) {
      return NextResponse.json({ available: true, needTrack: true, suggested: await suggestTrack(session.id) }, { headers: NO_STORE });
    }
    // One practice a day: once today's set is submitted on one track, keep showing that one
    // (its results) instead of opening the other track's set.
    const doneToday = await prisma.practiceAttempt.findFirst({
      where: { studentId: session.id, submittedAt: { not: null }, set: { day: cairoDay(), educationalStage: stage } },
      select: { set: { select: { language: true } } },
    });
    language = parseLanguage(doneToday?.set.language) ?? language;

    const where = { educationalStage: stage, language };
    let set = await prisma.practiceSet.findFirst({ where, orderBy: { day: "desc" } });
    // The 02:00 job normally publishes the set; this covers a missed run (restart, outage).
    if (set?.day !== cairoDay() && cairoHour() >= 5) {
      await buildDailySet(stage, language);
      set = await prisma.practiceSet.findFirst({ where, orderBy: { day: "desc" } });
    }
    if (!set) return NextResponse.json({ available: false, reason: "EMPTY", track: language }, { headers: NO_STORE });

    const loadQuestions = async (ids: string[]) => {
      const rows = await prisma.practiceQuestion.findMany({
        where: { id: { in: ids } },
        select: {
          id: true, questionType: true, lessonNumber: true, lessonTitle: true, question: true,
          optionA: true, optionB: true, optionC: true, optionD: true, correctAnswer: true, referenceAnswer: true,
        },
      });
      const byId = new Map(rows.map((r) => [r.id, r]));
      return ids.map((id) => byId.get(id)).filter((q): q is NonNullable<typeof q> => !!q);
    };

    let attempt = await prisma.practiceAttempt.findUnique({
      where: { studentId_setId: { studentId: session.id, setId: set.id } },
      include: { answers: true },
    });
    let picked: string[] = [];
    let questions: Awaited<ReturnType<typeof loadQuestions>> = [];
    if (!attempt && !session.supportView) {
      // The student's own questions: earlier mistakes come back, solved ones never do.
      picked = await pickForStudent(session.id, stage, language);
      if (picked.length === 0) return NextResponse.json({ available: false, reason: "EMPTY", track: language }, { headers: NO_STORE });
      questions = await loadQuestions(picked);
      const presentation: Presentation = {};
      for (const q of questions) if (q.questionType !== "essay") presentation[q.id] = shuffledOrder(q);
      try {
        await prisma.practiceAttempt.create({
          data: { studentId: session.id, setId: set.id, questionIds: JSON.stringify(picked), presentation: JSON.stringify(presentation) },
        });
      } catch {
        /* created concurrently in another tab */
      }
      attempt = await prisma.practiceAttempt.findUnique({
        where: { studentId_setId: { studentId: session.id, setId: set.id } },
        include: { answers: true },
      });
    }
    // A concurrent tab may have created the attempt with a different pick.
    const ids = attemptQuestionIds(attempt, set);
    if (ids.join() !== picked.join()) questions = await loadQuestions(ids);

    const presentation = attempt
      ? parsePresentation(attempt.presentation)
      : Object.fromEntries(questions.map((q) => [q.id, shuffledOrder(q)]));
    const answers = new Map((attempt?.answers ?? []).map((a) => [a.questionId, a]));
    const submitted = !!attempt?.submittedAt;

    if (attempt && submitted && !attempt.finalizedAt) {
      if (attempt.answers.some((a) => a.status === "PENDING")) kickPracticeGrading(attempt.id);
      else await finalizeAttempt(attempt.id);
    }

    return NextResponse.json(
      {
        available: true,
        setId: set.id,
        day: set.day,
        track: language,
        readOnly: !attempt || !!session.supportView,
        submitted,
        finalized: !!attempt?.finalizedAt,
        summary: attempt?.finalizedAt
          ? {
              mcqCorrect: attempt.mcqCorrect,
              mcqTotal: attempt.mcqTotal,
              essayCorrect: attempt.essayCorrect,
              essayTotal: attempt.essayTotal,
              pointsAwarded: attempt.pointsAwarded,
            }
          : null,
        totalPoints: user?.points ?? 0,
        rules: PRACTICE_POINTS,
        questions: questions.map((q) => {
          const order = presentation[q.id];
          const a = answers.get(q.id);
          const base = {
            ...publicQuestion(q, order),
            selected: slotForLetter(order, a?.choice),
            text: a?.essayAnswer ?? "",
          };
          if (!submitted) return base;
          let feedback: unknown = null;
          try {
            feedback = a?.feedback ? JSON.parse(a.feedback) : null;
          } catch {
            /* ignore */
          }
          return {
            ...base,
            status: a?.status ?? "GRADED",
            isCorrect: a?.isCorrect ?? false,
            verdict: a?.verdict ?? null,
            correct: q.questionType === "essay" ? null : slotForLetter(order, q.correctAnswer),
            referenceAnswer: q.questionType === "essay" ? q.referenceAnswer : null,
            feedback,
          };
        }),
      },
      { headers: NO_STORE }
    );
  } catch (error) {
    console.error("[practice] GET error:", error);
    return NextResponse.json({ error: "حدث خطأ داخلي" }, { status: 500 });
  }
}
