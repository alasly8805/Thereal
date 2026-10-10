import { ContentType } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";
import { canAccessContent } from "@/lib/content-access-engine";
import { quizActiveElapsedMs, quizRemainingMs } from "@/lib/quiz-attempt";

type AttemptRow = {
  id: string;
  score: number;
  totalQ: number;
  allowRetake: boolean;
  startedAt: Date | null;
  pausedAt: Date | null;
  elapsedMs: number;
  completedAt: Date | null;
};

/** Freeze the clock. A second pause does not add the same segment twice. */
export async function pauseQuizAttempt(resultId: string, limitMinutes: number): Promise<boolean> {
  const row = await prisma.quizResult.findUnique({
    where: { id: resultId },
    select: { id: true, startedAt: true, pausedAt: true, elapsedMs: true, completedAt: true },
  });
  if (!row || row.completedAt || row.pausedAt || !row.startedAt) return false;

  const limitMs = Math.max(1, limitMinutes || 30) * 60 * 1000;
  const bank = Math.min(
    limitMs,
    quizActiveElapsedMs({
      startedAt: row.startedAt,
      pausedAt: null,
      elapsedMs: row.elapsedMs,
    })
  );
  const updated = await prisma.quizResult.updateMany({
    where: { id: row.id, pausedAt: null, completedAt: null },
    data: { pausedAt: new Date(), elapsedMs: bank },
  });
  return updated.count === 1;
}

export async function buildQuizLobby(input: {
  studentId: string;
  quiz: {
    id: string;
    title: string;
    timeLimitMinutes: number;
    enableAutoClose: boolean;
    closeAt: Date | null;
    retakeCooldownHours: number;
    folder?: { courseId: string; course: { title: string; subject: string } | null } | null;
  };
  attempt: AttemptRow | null;
  supportReopen: boolean;
  windowClosed: boolean;
  timeLimitEnforced: boolean;
}) {
  const limitMinutes = input.quiz.timeLimitMinutes || 30;
  const timeLimitEnforced = input.timeLimitEnforced;
  const activeMs = input.attempt
    ? quizActiveElapsedMs({
        startedAt: input.attempt.startedAt,
        pausedAt: input.attempt.pausedAt,
        elapsedMs: input.attempt.elapsedMs,
      })
    : 0;
  const remainingMs = quizRemainingMs(limitMinutes, activeMs);
  const remainingSeconds = Math.floor(remainingMs / 1000);

  const extension = await prisma.contentExtension.findFirst({
    where: {
      revokedAt: null,
      extendedUntil: { gte: new Date() },
      OR: [{ studentId: null }, { studentId: input.studentId }],
      content: { sourceId: input.quiz.id, type: { in: [ContentType.QUIZ, ContentType.EXAM] } },
    },
    orderBy: { extendedUntil: "desc" },
    select: { extendedUntil: true },
  });

  const access = await canAccessContent(input.studentId, {
    type: ContentType.QUIZ,
    sourceId: input.quiz.id,
    title: input.quiz.title,
  });
  const teacherEnded = !access.allowed && access.code === "CONTENT_CLOSED";

  const archived = await prisma.quizAttempt.findMany({
    where: { studentId: input.studentId, quizId: input.quiz.id },
    orderBy: { attemptNumber: "asc" },
    select: {
      attemptNumber: true,
      score: true,
      totalQ: true,
      startedAt: true,
      completedAt: true,
    },
  });

  const tries: Array<{
    attemptNumber: number;
    score: number | null;
    totalQ: number | null;
    startedAt: Date | null;
    completedAt: Date | null;
    status: "submitted" | "paused" | "in_progress";
  }> = archived.map((row) => ({
    attemptNumber: row.attemptNumber,
    score: row.score,
    totalQ: row.totalQ,
    startedAt: row.startedAt,
    completedAt: row.completedAt,
    status: "submitted" as const,
  }));

  if (tries.length === 0 && input.attempt?.completedAt) {
    tries.push({
      attemptNumber: 1,
      score: input.attempt.score,
      totalQ: input.attempt.totalQ,
      startedAt: input.attempt.startedAt,
      completedAt: input.attempt.completedAt,
      status: "submitted",
    });
  }

  const live = input.attempt;
  if (live && !live.completedAt && live.startedAt) {
    tries.push({
      attemptNumber: tries.length + 1,
      score: null,
      totalQ: null,
      startedAt: live.startedAt,
      completedAt: null,
      status: live.pausedAt ? "paused" : "in_progress",
    });
  }

  const personalTimeOver =
    !!live?.startedAt && !live.completedAt && timeLimitEnforced && remainingMs <= 0;
  const finished = !!live?.completedAt;
  const canEnter = !teacherEnded && !finished && !personalTimeOver;
  const canReview = finished;

  return {
    phase: "lobby" as const,
    canEnter,
    canReview,
    personalTimeOver,
    teacherEnded: teacherEnded || input.windowClosed,
    supportReopen: input.supportReopen,
    allowRetake: (!!live?.allowRetake || input.supportReopen) && !input.windowClosed && finished,
    timeLimitEnforced,
    remainingSeconds: finished ? 0 : remainingSeconds,
    teacherEnd: {
      enableAutoClose: input.quiz.enableAutoClose,
      closeAt: input.quiz.closeAt,
      extendedUntil: extension?.extendedUntil ?? null,
    },
    quiz: {
      id: input.quiz.id,
      title: input.quiz.title,
      timeLimitMinutes: limitMinutes,
      courseId: input.quiz.folder?.courseId ?? "plan",
      course: input.quiz.folder?.course ?? null,
    },
    tries,
  };
}
