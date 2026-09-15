import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { isTeacherLike, actingTeacherId } from "@/lib/teacher-scope";
import { prisma } from "@/lib/prisma";

/**
 * Teacher analytics overview. Scoped to the signed-in teacher's courses.
 * Query: ?period=7d|30d|90d|all  (default 30d)
 *
 * Returns KPIs with period-over-period deltas, daily views/enrollments series,
 * top & low-engagement videos, per-course breakdown, a quiz-score distribution,
 * and a prioritized "issues" feed (open tickets, unresolved feedback, recent
 * client errors, and data-health warnings like missing thumbnails / 0-view videos).
 */

type PeriodKey = "7d" | "30d" | "90d" | "all";
const DAYS: Record<PeriodKey, number | null> = { "7d": 7, "30d": 30, "90d": 90, all: null };

function dayKey(d: Date) {
  return d.toISOString().slice(0, 10);
}

function delta(cur: number, prev: number) {
  if (prev <= 0) return cur > 0 ? 100 : 0;
  return Math.round(((cur - prev) / prev) * 100);
}
// ── 24-Hour Cache for Teacher Content Health Audit ───────────────────────────
type HealthAuditItem = { kind: string; severity: "high" | "med" | "low"; title: string; detail: string; at: string | null };
interface HealthAuditCacheEntry {
  timestamp: number;
  healthIssues: HealthAuditItem[];
}
const teacherHealthAuditCache = new Map<string, HealthAuditCacheEntry>();
const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

export async function GET(req: NextRequest) {
  try {
  const session = await getSession();
  if (!session || !isTeacherLike(session.role)) {
    return NextResponse.json({ error: "غير مصرح" }, { status: 403 });
  }
  const teacherId = session.id;

  const periodParam = (req.nextUrl.searchParams.get("period") || "30d") as PeriodKey;
  const days = DAYS[periodParam] ?? 30;
  const now = new Date();
  const periodStart = days ? new Date(now.getTime() - days * 86400000) : new Date(0);
  const prevStart = days ? new Date(periodStart.getTime() - days * 86400000) : new Date(0);

  // Optional single-course filter (manual filter in the UI)
  const courseFilter = req.nextUrl.searchParams.get("courseId") || undefined;

  // ── Teacher's courses + videos ──────────────────────────────────────────────
  const courses = await prisma.course.findMany({
    where: { teacherId, ...(courseFilter ? { id: courseFilter } : {}) },
    select: {
      id: true, title: true, thumbnailUrl: true,
      folders: {
        select: {
          id: true, name: true, publishAt: true,
          videos: { select: { id: true, title: true, durationMinutes: true, publishAt: true } },
        },
      },
    },
  });

  const courseIds = courses.map((c) => c.id);
  const videoMeta = new Map<string, { title: string; course: string }>();
  const courseOfVideo = new Map<string, string>();
  for (const c of courses) {
    for (const f of c.folders) {
      const fTime = f.publishAt ? new Date(f.publishAt).getTime() : 0;
      for (const v of f.videos) {
        const vTime = v.publishAt ? new Date(v.publishAt).getTime() : 0;
        if (Math.max(fTime, vTime) <= now.getTime()) {
          videoMeta.set(v.id, { title: v.title, course: c.title });
          courseOfVideo.set(v.id, c.id);
        }
      }
    }
  }
  const videoIds = [...videoMeta.keys()];

  if (courseIds.length === 0) {
    return NextResponse.json({
      teacherName: session.name,
      period: periodParam,
      empty: true,
      kpis: null,
      series: [],
      topVideos: [],
      lowVideos: [],
      courseBreakdown: [],
      quizBuckets: [],
      issues: [],
    });
  }

  // ── Pull rows we need to bucket in JS (portable across DBs) ──────────────────
  const [watchRows, prevWatchCount, enrollRows, prevEnrollCount, completions, prevCompletions,
         quizRows, tickets, feedbacks, totalStudentsRows] = await Promise.all([
    prisma.videoWatchSession.findMany({
      where: {
        videoId: { in: videoIds },
        startedAt: { gte: periodStart },
        student: { accountMode: { not: "TESTER" } },
      },
      select: { videoId: true, startedAt: true },
    }),
    prisma.videoWatchSession.count({
      where: {
        videoId: { in: videoIds },
        startedAt: { gte: prevStart, lt: periodStart },
        student: { accountMode: { not: "TESTER" } },
      },
    }),
    prisma.accessCode.findMany({
      where: {
        courseId: { in: courseIds },
        studentId: { not: null },
        student: { accountMode: { not: "TESTER" } },
      },
      select: { usedAt: true, createdAt: true, studentId: true },
    }),
    prisma.accessCode.count({
      where: {
        courseId: { in: courseIds },
        studentId: { not: null },
        student: { accountMode: { not: "TESTER" } },
        usedAt: { gte: prevStart, lt: periodStart },
      },
    }),
    prisma.progress.count({
      where: {
        videoId: { in: videoIds },
        watched: true,
        watchedAt: { gte: periodStart },
        student: { accountMode: { not: "TESTER" } },
      },
    }),
    prisma.progress.count({
      where: {
        videoId: { in: videoIds },
        watched: true,
        watchedAt: { gte: prevStart, lt: periodStart },
        student: { accountMode: { not: "TESTER" } },
      },
    }),
    prisma.quizResult.findMany({
      where: {
        quiz: { folder: { courseId: { in: courseIds } } },
        completedAt: { gte: periodStart },
        student: { accountMode: { not: "TESTER" } },
      },
      select: { score: true, totalQ: true },
    }),
    prisma.supportTicket.findMany({
      where: {
        courseId: { in: courseIds },
        status: { not: "closed" },
        student: { accountMode: { not: "TESTER" } },
      },
      select: { id: true, title: true, type: true, priority: true, status: true, createdAt: true },
      orderBy: { createdAt: "desc" }, take: 6,
    }),
    prisma.studentFeedback.findMany({
      where: {
        teacherId,
        isResolved: false,
        student: { accountMode: { not: "TESTER" } },
      },
      select: { id: true, type: true, content: true, rating: true, createdAt: true },
      orderBy: { createdAt: "desc" }, take: 6,
    }),
    prisma.accessCode.findMany({
      where: {
        courseId: { in: courseIds },
        studentId: { not: null },
        student: { accountMode: { not: "TESTER" } },
      },
      select: { studentId: true },
    }),
  ]);

  // ── KPIs ──────────────────────────────────────────────────────────────────
  const viewsCur = watchRows.length;
  const enrollEventAt = (r: { usedAt: Date | null; createdAt: Date }) => r.usedAt ?? r.createdAt;
  const enrollCur = enrollRows.filter((r) => enrollEventAt(r) >= periodStart).length;
  const totalStudents = new Set(totalStudentsRows.map((r) => r.studentId)).size;

  // QuizResult.score is already a 0–100 percentage (correct/totalQ*100).
  const avgScore = quizRows.length
    ? Math.round(quizRows.reduce((a, q) => a + q.score, 0) / quizRows.length)
    : 0;
  // previous-period avg quiz score
  const prevQuiz = await prisma.quizResult.findMany({
    where: { quiz: { folder: { courseId: { in: courseIds } } }, completedAt: { gte: prevStart, lt: periodStart } },
    select: { score: true, totalQ: true },
  });
  const prevAvgScore = prevQuiz.length
    ? Math.round(prevQuiz.reduce((a, q) => a + q.score, 0) / prevQuiz.length)
    : 0;

  const kpis = {
    students: { value: totalStudents, deltaPct: delta(enrollCur, prevEnrollCount), newThisPeriod: enrollCur },
    views: { value: viewsCur, deltaPct: delta(viewsCur, prevWatchCount) },
    completions: { value: completions, deltaPct: delta(completions, prevCompletions) },
    avgQuizScore: { value: avgScore, deltaPct: delta(avgScore, prevAvgScore) },
  };

  // ── Daily series (views + enrollments) ──────────────────────────────────────
  const seriesDays = days ?? 30;
  const buckets = new Map<string, { date: string; views: number; enrollments: number }>();
  for (let i = seriesDays - 1; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 86400000);
    buckets.set(dayKey(d), { date: dayKey(d), views: 0, enrollments: 0 });
  }
  for (const w of watchRows) {
    const b = buckets.get(dayKey(w.startedAt));
    if (b) b.views++;
  }
  for (const e of enrollRows) {
    const at = enrollEventAt(e);
    if (at >= periodStart) {
      const b = buckets.get(dayKey(at));
      if (b) b.enrollments++;
    }
  }
  const series = [...buckets.values()];

  // ── Video engagement (views per video, in period) ────────────────────────────
  const viewsByVideo = new Map<string, number>();
  for (const id of videoIds) viewsByVideo.set(id, 0);
  for (const w of watchRows) viewsByVideo.set(w.videoId, (viewsByVideo.get(w.videoId) ?? 0) + 1);

  const videoStats = [...viewsByVideo.entries()].map(([id, views]) => ({
    id,
    title: videoMeta.get(id)?.title ?? "—",
    course: videoMeta.get(id)?.course ?? "",
    views,
  }));
  const topVideos = [...videoStats].sort((a, b) => b.views - a.views).slice(0, 5);
  const lowVideos = [...videoStats].sort((a, b) => a.views - b.views).slice(0, 5);

  // ── Per-course breakdown ─────────────────────────────────────────────────────
  const viewsByCourse = new Map<string, number>();
  for (const w of watchRows) {
    const cid = courseOfVideo.get(w.videoId);
    if (cid) viewsByCourse.set(cid, (viewsByCourse.get(cid) ?? 0) + 1);
  }
  const studentsByCourse = await prisma.accessCode.groupBy({
    by: ["courseId"],
    where: {
      courseId: { in: courseIds },
      studentId: { not: null },
      student: { accountMode: { not: "TESTER" } },
    },
    _count: { studentId: true },
  });
  const studentCountMap = new Map(studentsByCourse.map((s) => [s.courseId, s._count.studentId]));
  const courseBreakdown = courses.map((c) => ({
    id: c.id,
    title: c.title,
    students: studentCountMap.get(c.id) ?? 0,
    views: viewsByCourse.get(c.id) ?? 0,
  })).sort((a, b) => b.views - a.views);

  // ── Quiz score distribution ──────────────────────────────────────────────────
  const bucketsDef = [
    { label: "0–49٪", min: 0, max: 50 },
    { label: "50–69٪", min: 50, max: 70 },
    { label: "70–84٪", min: 70, max: 85 },
    { label: "85–100٪", min: 85, max: 101 },
  ];
  const quizBuckets = bucketsDef.map((b) => ({
    label: b.label,
    count: quizRows.filter((q) => q.score >= b.min && q.score < b.max).length,
  }));

  // ── 24-Hour Course & Content Health Audit Cycle ─────────────────────────────
  type Issue = { kind: string; severity: "high" | "med" | "low"; title: string; detail: string; at: string | null };
  const issues: Issue[] = [];

  for (const t of tickets) {
    issues.push({
      kind: "ticket",
      severity: t.priority === "high" || t.priority === "urgent" ? "high" : "med",
      title: "تذكرة دعم من متعلم",
      detail: t.title,
      at: t.createdAt.toISOString(),
    });
  }
  for (const f of feedbacks) {
    issues.push({
      kind: "feedback",
      severity: (f.rating ?? 5) <= 2 ? "high" : "low",
      title: f.type === "complaint" ? "شكوى من متعلم" : "ملاحظة من متعلم",
      detail: f.content.slice(0, 120),
      at: f.createdAt.toISOString(),
    });
  }
  // Surfacing grading queue (Gap 30)
  const teacherLessonIds = (await prisma.planLessonSource.findMany({
    where: { teacherId: actingTeacherId(session) },
    select: { planLessonId: true }
  })).map(s => s.planLessonId);

  const pendingGradingCount = await prisma.planProjectSubmission.count({
    where: {
      status: "pending",
      planLessonId: { in: teacherLessonIds }
    }
  });
  if (pendingGradingCount > 0) {
    issues.push({
      kind: "grading",
      severity: "high",
      title: "مشاريع معلقة بانتظار التقييم",
      detail: `توجد عدد ${pendingGradingCount} مشروع معلق يتطلب مراجعتك وتقييمك.`,
      at: null,
    });
  }

  // ── 24-Hour Health Audit Verification ──
  const recheckAudit = req.nextUrl.searchParams.get("recheckAudit") === "true";
  const cachedAudit = teacherHealthAuditCache.get(session.id);
  const nowMs = Date.now();

  let healthIssues: Issue[] = [];
  let auditTimestamp = nowMs;

  if (cachedAudit && !recheckAudit && nowMs - cachedAudit.timestamp < TWENTY_FOUR_HOURS_MS) {
    // 24-hour cycle: Reuse cached health audit
    healthIssues = cachedAudit.healthIssues;
    auditTimestamp = cachedAudit.timestamp;
  } else {
    // Perform fresh 24-hour health audit
    const newHealthIssues: Issue[] = [];
    for (const c of courses) {
      // Check valid thumbnail (accepts http, https, base64 data:image, and relative paths)
      const hasValidThumb =
        Boolean(c.thumbnailUrl) &&
        (c.thumbnailUrl.startsWith("http://") ||
         c.thumbnailUrl.startsWith("https://") ||
         c.thumbnailUrl.startsWith("data:image/") ||
         c.thumbnailUrl.startsWith("/"));
      if (!hasValidThumb) {
        newHealthIssues.push({ kind: "health", severity: "med", title: "صورة الكورس مفقودة أو غير صالحة", detail: c.title, at: null });
      }
      const allVideos = c.folders.flatMap((f) => f.videos);
      const noDuration = allVideos.filter((v) => !v.durationMinutes).length;
      if (allVideos.length > 0 && noDuration > 0) {
        newHealthIssues.push({ kind: "health", severity: "low", title: "فيديوهات بدون مدة محددة (لا يظهر تقدّم الطالب)", detail: `${c.title} — ${noDuration} فيديو`, at: null });
      }
      const emptyFolders = c.folders.filter((f) => f.videos.length === 0).length;
      if (emptyFolders > 0) {
        newHealthIssues.push({ kind: "health", severity: "low", title: "محاضرات فارغة بدون محتوى", detail: `${c.title} — ${emptyFolders} محاضرة`, at: null });
      }
    }
    const zeroViewVideos = videoStats.filter((v) => v.views === 0).length;
    if (zeroViewVideos > 0 && videoIds.length > 0) {
      newHealthIssues.push({
        kind: "health", severity: "low",
        title: "فيديوهات لم يشاهدها أحد في هذه الفترة",
        detail: `${zeroViewVideos} من ${videoIds.length} فيديو`, at: null,
      });
    }

    teacherHealthAuditCache.set(session.id, {
      timestamp: nowMs,
      healthIssues: newHealthIssues,
    });
    healthIssues = newHealthIssues;
    auditTimestamp = nowMs;
  }

  issues.push(...healthIssues);

  const sevRank = { high: 0, med: 1, low: 2 };
  issues.sort((a, b) => sevRank[a.severity] - sevRank[b.severity]);

  return NextResponse.json({
    teacherName: session.name,
    period: periodParam,
    empty: false,
    kpis,
    series,
    topVideos,
    lowVideos,
    courseBreakdown,
    quizBuckets,
    issues: issues.slice(0, 12),
    lastAuditAt: new Date(auditTimestamp).toISOString(),
    nextAuditAt: new Date(auditTimestamp + TWENTY_FOUR_HOURS_MS).toISOString(),
    totals: { courses: courseIds.length, videos: videoIds.length },
  });
} catch (error) {
    console.error("[admin/analytics] error:", error);
    return NextResponse.json(
      { error: "حدث خطأ داخلي" },
      { status: 500 }
    );
  }
}
