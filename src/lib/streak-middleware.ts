import { prisma } from "@/lib/prisma";
import { notifyStreakMilestone } from "@/lib/notifications";

/**
 * Cairo-timezone day boundary utilities for streak calculation.
 * Egyptian users — using UTC would break streaks at 2 AM Cairo time (UTC+2/+3).
 */

function cairoDayStart(d: Date): Date {
  const cairoDate = d.toLocaleDateString("en-CA", { timeZone: "Africa/Cairo" });
  const [year, month, day] = cairoDate.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function cairoDayDiff(a: Date, b: Date): number {
  const dayA = cairoDayStart(a).getTime();
  const dayB = cairoDayStart(b).getTime();
  return Math.round((dayA - dayB) / 86_400_000);
}

const DAILY_LOGIN_STREAK_POINTS = 5;
const STREAK_FREEZE_AWARD_AT    = [7, 14, 30]; // earn a freeze token at these milestones
const STREAK_MILESTONES         = [7, 14, 30, 60, 100];

export async function checkAndUpdateStreak(userId: string): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { loginStreak: true, lastLoginDate: true, role: true, streakFreezes: true },
  });

  if (!user || user.role !== "student") return;

  const now         = new Date();
  const todayCairo  = cairoDayStart(now);

  if (user.lastLoginDate) {
    const dayDiff = cairoDayDiff(now, user.lastLoginDate);

    if (dayDiff <= 0) return; // already counted today

    let newStreak: number;
    let pointsToAward: number;
    let freezesUsed = 0;

    if (dayDiff === 1) {
      // Consecutive day — streak continues
      newStreak     = user.loginStreak + 1;
      pointsToAward = newStreak * DAILY_LOGIN_STREAK_POINTS;
    } else if (dayDiff === 2 && user.streakFreezes > 0) {
      // Missed exactly one day but has a freeze token — save the streak
      newStreak     = user.loginStreak + 1;
      pointsToAward = newStreak * DAILY_LOGIN_STREAK_POINTS;
      freezesUsed   = 1;
    } else {
      // Gap ≥ 2 days (or gap == 2 with no freeze) — streak resets
      newStreak     = 1;
      pointsToAward = DAILY_LOGIN_STREAK_POINTS;
    }

    // Award a freeze token when hitting a milestone (only once per milestone)
    const earnedFreeze = STREAK_FREEZE_AWARD_AT.includes(newStreak) ? 1 : 0;

    // Conditional on the lastLoginDate we read, so concurrent requests (several
    // /api/auth/me calls on one page load, or login + /me) award the day once.
    const { count } = await prisma.user.updateMany({
      where: { id: userId, lastLoginDate: user.lastLoginDate },
      data: {
        points:        { increment: pointsToAward },
        loginStreak:   newStreak,
        lastLoginDate: todayCairo,
        lastLoginAt:   now,
        pointsUpdatedAt: now,
        streakFreezes: { increment: earnedFreeze - freezesUsed },
      },
    });

    // Fire milestone notifications (fire-and-forget)
    if (count > 0 && STREAK_MILESTONES.includes(newStreak)) {
      void notifyStreakMilestone(userId, newStreak);
    }
  } else {
    // First ever login
    await prisma.user.updateMany({
      where: { id: userId, lastLoginDate: null },
      data: {
        points:          { increment: DAILY_LOGIN_STREAK_POINTS },
        loginStreak:     1,
        lastLoginDate:   todayCairo,
        lastLoginAt:     now,
        pointsUpdatedAt: now,
      },
    });
  }
}
