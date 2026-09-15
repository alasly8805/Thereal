import { NextResponse } from "next/server";
import { getStudentSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * Real gamification stats for the signed-in student: points + login streak from
 * the User row, watched/quiz/course counts, last-28-day activity, and a computed
 * achievements list. Replaces the library's client-side guesses.
 */
const EMPTY_STATS = {
  points: 0, streak: 0, watchedVideos: 0, quizzesPassed: 0,
  coursesCount: 0, hours: 0, weekActive: Array(7).fill(false),
  activity: Array(28).fill(0), achievements: [], achievementsUnlocked: 0, weaknesses: [],
};

export async function GET() {
  try {
  const { getSession } = await import("@/lib/auth");
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
  // Non-students (admin, teacher, staff) have no gamification data
  if (session.role !== "student") {
    return NextResponse.json(EMPTY_STATS, {
      headers: { "Cache-Control": "private, max-age=300" },
    });
  }
  const studentId = session.id;

  const user = await prisma.user.findUnique({
    where: { id: studentId },
    select: { name: true, points: true, loginStreak: true, lastLoginDate: true, parentVerified: true, parentVerificationStatus: true, parentPhone: true },
  });

  const [watchedRows, quizResults, enrollments, sessions] = await Promise.all([
    prisma.progress.findMany({
      where: { studentId, watched: true },
      select: { video: { select: { durationMinutes: true } } },
    }),
    prisma.quizResult.findMany({
      // Results with essay answers still PENDING have no final grade; counting
      // them would read as a 0% failure. See lib/quiz-grading.
      where: { studentId, completedAt: { not: null }, answers: { none: { status: "PENDING" } } },
      select: {
        score: true,
        quiz: {
          select: {
            folder: { select: { course: { select: { id: true, title: true, subject: true } } } },
          },
        },
      },
    }),
    prisma.accessCode.findMany({ where: { studentId, isActive: true }, select: { courseId: true } }),
    prisma.videoWatchSession.findMany({
      where: { studentId, startedAt: { gte: new Date(Date.now() - 28 * 86400000) } },
      select: { startedAt: true },
    }),
  ]);

  const watchedVideos = watchedRows.length;
  const minutes = watchedRows.reduce((a, r) => a + (r.video?.durationMinutes ?? 0), 0);
  const hours = Math.round((minutes / 60) * 10) / 10;
  const quizzesPassed = quizResults.filter((q) => q.score >= 50).length;
  const quizzesFull = quizResults.filter((q) => q.score >= 100).length;

  // Weakness view: average quiz score per subject, surfacing the subjects that
  // most need review. Pure aggregation over the student's own quiz results; the
  // link points to the course (within the subject) where they scored lowest.
  type CourseAgg = { id: string; title: string; sum: number; n: number };
  type SubjectAgg = { subject: string; sum: number; n: number; courses: Map<string, CourseAgg> };
  const subjectMap = new Map<string, SubjectAgg>();
  for (const q of quizResults) {
    const course = q.quiz?.folder?.course;
    if (!course) continue;
    const subject = course.subject?.trim() || "عام";
    let agg = subjectMap.get(subject);
    if (!agg) { agg = { subject, sum: 0, n: 0, courses: new Map() }; subjectMap.set(subject, agg); }
    agg.sum += q.score;
    agg.n += 1;
    let c = agg.courses.get(course.id);
    if (!c) { c = { id: course.id, title: course.title, sum: 0, n: 0 }; agg.courses.set(course.id, c); }
    c.sum += q.score;
    c.n += 1;
  }
  const weaknesses = [...subjectMap.values()]
    .map((a) => {
      const avgScore = Math.round(a.sum / a.n);
      const course = [...a.courses.values()].sort((x, y) => x.sum / x.n - y.sum / y.n)[0];
      return { subject: a.subject, avgScore, quizCount: a.n, course: { id: course.id, title: course.title } };
    })
    .filter((w) => w.avgScore < 75) // only surface subjects that genuinely need work
    .sort((a, b) => a.avgScore - b.avgScore)
    .slice(0, 3);
  const coursesCount = new Set(enrollments.map((e) => e.courseId)).size;
  const points = user?.points ?? 0;

  // Effective streak: only counts if the last login was today or yesterday.
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  let streak = 0;
  if (user?.lastLoginDate) {
    const last = new Date(user.lastLoginDate);
    const lastDay = new Date(last.getFullYear(), last.getMonth(), last.getDate()).getTime();
    if (lastDay === today || lastDay === today - 86400000) streak = user.loginStreak;
  }

  // Last-28-day activity counts (for the heatmap), oldest → newest.
  const activity = Array.from({ length: 28 }, () => 0);
  for (const s of sessions) {
    const d = new Date(s.startedAt);
    const day = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    const idx = 27 - Math.floor((today - day) / 86400000);
    if (idx >= 0 && idx < 28) activity[idx]++;
  }
  // Streak run (consecutive login days ending at lastLoginDate).
  let streakStart = Infinity;
  let lastDay = -Infinity;
  if (streak > 0 && user?.lastLoginDate) {
    const last = new Date(user.lastLoginDate);
    lastDay = new Date(last.getFullYear(), last.getMonth(), last.getDate()).getTime();
    streakStart = lastDay - (streak - 1) * 86400000;
  }

  // Days the student "entered" (logged in) also count as light activity, so the
  // grid isn't empty for someone who shows up daily but hasn't watched yet.
  for (let i = 0; i < 28; i++) {
    const day = today - (27 - i) * 86400000;
    if (day >= streakStart && day <= lastDay) activity[i] = Math.max(activity[i], 1);
  }

  // Which of the last 7 days the streak covers (oldest → today), so the card's
  // dots match the 🔥 number.
  const last7 = Array.from({ length: 7 }, (_, i) => today - (6 - i) * 86400000);
  const weekActive = last7.map((d) => d >= streakStart && d <= lastDay);

  const achievements = [
    { id: "first-steps", title: "بداية الرحلة", description: "اشترك في أول كورس", icon: "rocket", unlocked: coursesCount >= 1 },
    { id: "fast-learner", title: "متعلم سريع", description: "أكمل 5 دروس", icon: "bolt", unlocked: watchedVideos >= 5 },
    { id: "streak-7", title: "مواظب", description: "7 أيام متتالية", icon: "flame", unlocked: streak >= 7 },
    { id: "quiz-star", title: "نجم الاختبارات", description: "درجة كاملة في اختبار", icon: "star", unlocked: quizzesFull >= 1 },
    { id: "dedicated", title: "مثابر", description: "أكمل 10 دروس", icon: "medal", unlocked: watchedVideos >= 10 },
    { id: "expert", title: "خبير", description: "أكمل 20 درساً", icon: "trophy", unlocked: watchedVideos >= 20 },
  ];

  return NextResponse.json(
    {
      points,
      streak,
      watchedVideos,
      quizzesPassed,
      coursesCount,
      hours,
      weekActive,
      activity,
      achievements,
      achievementsUnlocked: achievements.filter((a) => a.unlocked).length,
      weaknesses,
      parentVerified: user?.parentVerified ?? false,
      parentVerificationStatus: user?.parentVerificationStatus ?? "PENDING",
      parentPhone: user?.parentPhone ?? null,
    },
    {
      headers: {
        // Cache stats for 5 minutes in the browser. The 4 parallel DB queries in
        // this route are now shared across all callers (library page, StreakFlame,
        // notification panel) via a single browser cache entry.
        "Cache-Control": "private, max-age=300, stale-while-revalidate=600",
      },
    }
  );
} catch (error) {
    console.error("[student/stats] error:", error);
    return NextResponse.json(
      { error: "حدث خطأ داخلي" },
      { status: 500 }
    );
  }
}
