import { prisma } from "@/lib/prisma";

export const POINTS = {
  EXAM_FULL_SCORE: 50,
  COURSE_ENROLLMENT: 20,
  DAILY_LOGIN_STREAK: 5, // per day
  FIRST_TRY_BONUS: 15,
  DAILY_EXAM_QUESTION: 5, // 5 points per correct daily exam question
  DAILY_EXAM_FULL_SCORE: 10, // 10 points bonus for perfect daily exam score
  REFERRAL: 50, // 50 points per qualified referral for inviter and invited student
};

/**
 * Awards points for completing a daily exam.
 * @param userId Student ID
 * @param score Number of correct answers
 * @param totalQ Total number of questions
 */
export async function awardDailyExamPoints(userId: string, score: number, totalQ: number) {
  // Balanced points: 5 points per correct answer + 10 points bonus for perfect score
  let pointsToAward = score * POINTS.DAILY_EXAM_QUESTION;
  if (score === totalQ && totalQ > 0) {
    pointsToAward += POINTS.DAILY_EXAM_FULL_SCORE;
  }

  await prisma.user.update({
    where: { id: userId },
    data: {
      points: { increment: pointsToAward },
      pointsUpdatedAt: new Date(),
    },
  });
}

/**
 * General purpose point award function.
 */
export async function addPoints(userId: string, points: number) {
  await prisma.user.update({
    where: { id: userId },
    data: {
      points: { increment: points },
      pointsUpdatedAt: new Date(),
    },
  });
}

/**
 * Bonus points for a just-finalized quiz attempt, derived from the student's
 * attempt history so a retake can never re-earn a bonus. The attempt being
 * graded must already be recorded as the latest QuizAttempt row.
 */
export async function quizBonusPoints(
  studentId: string,
  quizId: string,
  score: number,
  passed: boolean
): Promise<number> {
  const attempts = await prisma.quizAttempt.findMany({
    where: { studentId, quizId },
    orderBy: { attemptNumber: "asc" },
    select: { score: true },
  });
  const previous = attempts.slice(0, -1);

  let points = 0;
  if (passed && previous.length === 0) points += POINTS.FIRST_TRY_BONUS;
  if (score === 100 && !previous.some((a) => a.score >= 100)) points += POINTS.EXAM_FULL_SCORE;
  return points;
}
