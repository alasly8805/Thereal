"use client";
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { ProfileGuard } from "@/components/auth/ProfileGuard";
import { Navbar } from "@/components/ui/Navbar";
import { Footer } from "@/components/ui/Footer";
import { SkeletonCard } from "@/components/ui/Skeleton";
import { staggerContainerVariants, staggerItemVariants } from "@/lib/animations";
import { useToast } from "@/components/ui/Toast";

interface Course {
  id: string;
  title: string;
  subject: string;
  description?: string;
  thumbnailUrl?: string;
  teacher: { id: string; name: string };
  folders: Array<{
    id: string;
    name: string;
    videos: Array<{ id: string; title: string; watched: boolean }>;
    quizzes: Array<{ id: string; title: string }>;
  }>;
  totalVideos: number;
  watchedVideos: number;
}

interface Achievement {
  id: string;
  title: string;
  description: string;
  icon: string;
  unlocked: boolean;
}
interface Weakness {
  subject: string;
  avgScore: number;
  quizCount: number;
  course: { id: string; title: string };
}
interface StudentStats {
  points: number;
  streak: number;
  watchedVideos: number;
  quizzesPassed: number;
  coursesCount: number;
  hours: number;
  weekActive: boolean[];
  activity: number[];
  achievements: Achievement[];
  achievementsUnlocked: number;
  weaknesses: Weakness[];
}

const ACH_ICON: Record<string, React.ReactElement> = {
  rocket: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6} d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 00-2.91-.09zM12 15l-3-3a22 22 0 014-7l3-3 3 3-3 3a22 22 0 01-7 4z" />,
  bolt: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6} d="M13 2L3 14h7l-1 8 10-12h-7l1-8z" />,
  flame: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6} d="M12 2s4 4 4 8a4 4 0 11-8 0c0-1 .5-2 1-3 0 0-3 2-3 6a6 6 0 0012 0c0-5-6-11-6-11z" />,
  star: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6} d="M12 2l3 6.5 7 .9-5 4.8 1.3 7L12 17.8 5.7 21.2 7 14.2 2 9.4l7-.9L12 2z" />,
  medal: <><circle cx="12" cy="15" r="6" strokeWidth={1.6} /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6} d="M9 9L6 2M15 9l3-7M12 13l1 2 2 .3-1.5 1.4.4 2-1.9-1-1.9 1 .4-2L9 15.3 11 15z" /></>,
  trophy: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6} d="M8 21h8M12 17v4M7 4h10v4a5 5 0 01-10 0V4zM7 6H4v1a3 3 0 003 3M17 6h3v1a3 3 0 01-3 3" />,
};

export default function LibraryPage() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [plans, setPlans] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<{ name: string; role: string } | null>(null);
  const [stats, setStats] = useState<StudentStats | null>(null);
  const [showResetPointsModal, setShowResetPointsModal] = useState(false);
  const [resettingPoints, setResettingPoints] = useState(false);
  const { success: toastSuccess, error: toastError } = useToast();

  const handleResetPoints = async () => {
    setResettingPoints(true);
    try {
      const res = await fetch("/api/student/reset-points", {
        method: "POST",
        credentials: "include",
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setStats((prev) => (prev ? { ...prev, points: 0 } : null));
        toastSuccess("تم تصفير نقاطك بنجاح");
        setShowResetPointsModal(false);
        // Background sync
        fetch("/api/student/stats", { credentials: "include" })
          .then((r) => (r.ok ? r.json() : null))
          .then((d: StudentStats | null) => {
            if (d) setStats(d);
          })
          .catch(() => {});
      } else {
        toastError(data.error || "تعذر تصفير النقاط");
      }
    } catch {
      toastError("حدث خطأ أثناء الاتصال بالخادم");
    } finally {
      setResettingPoints(false);
    }
  };

  const loadLibrary = useCallback(() => {
    // All three requests in parallel — /api/auth/me and /api/student/stats are
    // both privately cached (15s and 5min respectively) so repeat visits are fast.
    setLoading(true);
    void Promise.all([
      fetch("/api/auth/me", { credentials: "include" })
        .then(r => r.ok ? r.json() : null)
        .then((d: { user?: { name: string; role: string } | null } | null) => {
          if (d?.user) setUser(d.user);
        })
        .catch(() => {}),

      fetch("/api/student/stats", { credentials: "include" })
        .then(r => r.ok ? r.json() : null)
        .then((d: StudentStats | null) => { if (d) setStats(d); })
        .catch(() => {}),

      fetch("/api/courses/enrolled", { credentials: "include" })
        .then(r => r.ok ? r.json() : null)
        .then((d: { success?: boolean; enrolledCourses?: Course[] } | null) => {
          setCourses(d?.success ? (d.enrolledCourses ?? []) : []);
        })
        .catch(() => setCourses([])),

      fetch("/api/student/plans", { credentials: "include" })
        .then(r => r.ok ? r.json() : null)
        .then(d => setPlans(d?.enrolledPlans ?? []))
        .catch(() => setPlans([]))
    ]).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    sessionStorage.removeItem("library-refresh");
    loadLibrary();
  }, [loadLibrary]);

  const totalVideos = courses.reduce(
    (acc: number, c: Course) =>
      acc +
      (c.folders?.reduce((a: number, f) => a + f.videos.length, 0) || 0),
    0
  );
  const watchedVideos = courses.reduce(
    (acc: number, c: Course) =>
      acc +
      (c.folders?.reduce(
        (a: number, f) => a + f.videos.filter((v) => v.watched).length,
        0
      ) || 0),
    0
  );
  const totalQuizzes = courses.reduce(
    (acc: number, c: Course) =>
      acc +
      (c.folders?.reduce((a: number, f) => a + f.quizzes.length, 0) || 0),
    0
  );

  // Prefer real server stats; fall back to client-derived values until loaded.
  const realPoints = stats?.points ?? 0;
  const realHours = stats?.hours ?? Math.round(watchedVideos * 0.5);
  const realAchievements = stats?.achievementsUnlocked ?? 0;
  const streak = stats?.streak ?? 0;
  const achievements = stats?.achievements ?? [];
  const weaknesses = stats?.weaknesses ?? [];

  // Real last-28-day activity counts → 0–4 intensity buckets for the heatmap.
  const activitySquares = (stats?.activity ?? Array.from({ length: 28 }, () => 0)).map((c) =>
    c >= 4 ? 4 : c
  );

  return (
    <ProfileGuard>
    <div className="flex flex-col min-h-screen" style={{ background: "var(--bg)", color: "var(--ink)" }} dir="rtl">
      <Navbar user={user} />
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8">
        
        {/* ── Header Greeting ── */}
        <motion.div
          className="mb-8"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          <h1 className="text-3xl md:text-4xl font-black mb-2 flex items-center gap-3" style={{ fontFamily: "var(--font-head)" }}>
            مرحباً،{" "}
            <span
              style={{
                backgroundImage: "linear-gradient(to left, #14B8A6, #10B981)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
              }}
            >
              {user?.name ? user.name.split(' ')[0] : 'طالب'}
            </span>{" "}
            👋
          </h1>
          <p className="text-base font-medium" style={{ color: "var(--ink-2)" }}>واصل رحلتك التعليمية اليوم!</p>
        </motion.div>

        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            {Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)}
          </div>
        ) : (
          <>
            {/* ── Top Stats Row ── */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 mb-8">
              <StatCard
                icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" /></svg>}
                iconBg="rgba(16,185,129,0.12)" iconColor="#10B981" iconGlow="rgba(16,185,129,0.2)"
                value={courses.length + plans.length}
                label="مسارات نشطة"
                badge={courses.length > 0 ? "نشط" : undefined}
                badgeBg="var(--brand-soft)" badgeColor="var(--brand)"
              />
              <StatCard
                icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" /></svg>}
                iconBg="rgba(245,158,11,0.12)" iconColor="#F59E0B" iconGlow="rgba(245,158,11,0.2)"
                value={realAchievements}
                label="إنجازات"
                badge={realAchievements > 0 ? `+${realAchievements}` : undefined}
                badgeBg="rgba(245,158,11,0.12)" badgeColor="#F59E0B"
              />
              <StatCard
                icon={<svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2l3 6.5 7 .6-5.3 4.6L18.3 21 12 17.3 5.7 21l1.6-7.3L2 9.1l7-.6L12 2z" /></svg>}
                iconBg="var(--gold-soft)" iconColor="var(--gold-2)" iconGlow="rgba(200,146,47,0.15)"
                value={realPoints.toLocaleString()}
                label="نقطة"
                badge={streak > 0 ? `🔥 ${streak} أيام` : undefined}
                badgeBg="var(--gold-soft)" badgeColor="var(--gold-2)"
              />
              <StatCard
                icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></svg>}
                iconBg="rgba(16,185,129,0.12)" iconColor="#10B981" iconGlow="rgba(16,185,129,0.2)"
                value={realHours}
                label="ساعات تعلّم"
              />
            </div>

            {/* ── Main Content Grid ── */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              
              {/* ── Right Column (Wide — 8 cols) ── */}
              <div className="lg:col-span-8 flex flex-col gap-6">

                {/* Focus areas — subjects that need review */}
                {weaknesses.length > 0 && (
                  <DashCard title="نقاط تحتاج إلى تقوية" emoji="🎯">
                    <p className="text-sm mb-5" style={{ color: "var(--ink-2)" }}>
                      أقل المواد في درجات اختباراتك — راجعها لرفع مستواك.
                    </p>
                    <div className="space-y-4">
                      {weaknesses.map((w) => {
                        const low = w.avgScore < 50;
                        return (
                          <div key={w.subject} className="flex items-center gap-4">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-baseline justify-between gap-2 mb-1.5">
                                <span className="font-bold" style={{ color: "var(--ink)" }}>{w.subject}</span>
                                <span className="font-black text-sm shrink-0" style={{ color: low ? "var(--danger)" : "#F59E0B" }}>
                                  {w.avgScore}%
                                </span>
                              </div>
                              <div className="h-2 rounded-full overflow-hidden" style={{ background: "var(--border)" }}>
                                <div
                                  className="h-full rounded-full transition-all duration-700"
                                  style={{ width: `${Math.max(w.avgScore, 4)}%`, background: low ? "var(--danger)" : "#F59E0B" }}
                                />
                              </div>
                              <p className="text-xs mt-1 truncate" style={{ color: "var(--ink-3)" }}>
                                {w.course.title} · {w.quizCount} {w.quizCount === 1 ? "اختبار" : "اختبارات"}
                              </p>
                            </div>
                            <Link
                              href={`/courses/${w.course.id}/learn`}
                              className="shrink-0 px-4 py-2 rounded-xl font-bold text-xs no-underline transition-colors"
                              style={{ background: "var(--brand-soft)", color: "var(--brand)", border: "1px solid var(--brand)" }}
                            >
                              راجع الآن
                            </Link>
                          </div>
                        );
                      })}
                    </div>
                  </DashCard>
                )}

                {/* Continue Learning */}
                <DashCard title="واصل التعلم" titleLink={{ href: "/courses", label: "عرض الكل" }}>
                  {courses.length === 0 && plans.length === 0 ? (
                    <div className="text-center py-12">
                      <div className="text-5xl mb-4">📭</div>
                      <h4 className="text-lg font-bold mb-2" style={{ color: "var(--ink)" }}>مكتبتك فارغة</h4>
                      <p className="text-sm mb-5" style={{ color: "var(--ink-2)" }}>لم تنضم إلى أي كورس أو خطة بعد.</p>
                      <div className="flex gap-3 justify-center">
                        <Link href="/courses" className="px-6 py-3 font-bold text-sm rounded-xl text-white no-underline transition-all hover:opacity-90"
                          style={{ background: "linear-gradient(135deg, #10B981, #14B8A6)", boxShadow: "0 4px 14px -4px rgba(16,185,129,0.4)" }}>
                          تصفح الكورسات الآن
                        </Link>
                        <Link href="/plans" className="px-6 py-3 font-bold text-sm rounded-xl no-underline transition-colors"
                          style={{ background: "var(--surface-2)", color: "var(--ink-2)", border: "1px solid var(--border)" }}>
                          تصفح الخطط
                        </Link>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-6">
                      {plans.map(p => (
                        <div key={p.id} className="group relative">
                          <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 mb-3">
                            <div>
                              <div className="flex items-center gap-2 mb-1">
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded" style={{ background: "var(--brand-soft)", color: "var(--brand)" }}>خطة دراسية</span>
                                <h4 className="font-bold text-lg" style={{ color: "var(--ink)" }}>{p.title}</h4>
                              </div>
                              <p className="text-sm" style={{ color: "var(--ink-2)" }}>{p.educationalStage}</p>
                            </div>
                            <Link href={`/plans/${p.id}/learn`} className="shrink-0 px-5 py-2 rounded-xl font-bold text-sm flex items-center gap-2 no-underline transition-colors"
                              style={{ background: "var(--brand-soft)", color: "var(--brand)", border: "1px solid var(--brand)" }}>
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                              متابعة
                            </Link>
                          </div>
                          <div className="flex items-center gap-4 text-sm font-medium mb-1">
                            <span className="w-12" style={{ color: "var(--ink)" }}>{p.progressPercent}%</span>
                            <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: "var(--border)" }}>
                              <div className="h-full rounded-full transition-all duration-1000"
                                style={{ width: `${p.progressPercent}%`, background: "linear-gradient(to left, #10B981, #14B8A6)" }} />
                            </div>
                          </div>
                          <div className="text-xs text-left flex items-center justify-end gap-1" style={{ color: "var(--ink-3)" }}>
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                            {p.completedLessons} من {p.totalLessons} درس مكتمل
                          </div>
                          <div className="absolute -bottom-3 left-0 right-0 h-px group-last:hidden" style={{ background: "var(--border)" }} />
                        </div>
                      ))}
                      {courses.map((course: Course) => {
                        const tVideos = course.folders?.reduce((a, f) => a + f.videos.length, 0) || 1;
                        const wVideos = course.folders?.reduce((a, f) => a + f.videos.filter(v => v.watched).length, 0) || 0;
                        const progress = Math.round((wVideos / Math.max(tVideos, 1)) * 100);
                        return (
                          <div key={course.id} className="group relative">
                            <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 mb-3">
                              <div>
                                <h4 className="font-bold text-lg" style={{ color: "var(--ink)" }}>{course.title}</h4>
                                <p className="text-sm" style={{ color: "var(--ink-2)" }}>{course.subject}</p>
                              </div>
                              <div className="flex shrink-0 items-center gap-2">
                              <Link href={`/courses/${course.id}/progress`} className="shrink-0 px-4 py-2 rounded-xl font-bold text-sm no-underline transition-colors"
                                style={{ color: "var(--ink-2)", border: "1px solid var(--border)" }}>
                                📊 تقدمي
                              </Link>
                              <Link href={`/courses/${course.id}/learn`} className="shrink-0 px-5 py-2 rounded-xl font-bold text-sm flex items-center gap-2 no-underline transition-colors"
                                style={{ background: "var(--brand-soft)", color: "var(--brand)", border: "1px solid var(--brand)" }}>
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                متابعة
                              </Link>
                              </div>
                            </div>
                            <div className="flex items-center gap-4 text-sm font-medium mb-1">
                              <span className="w-12" style={{ color: "var(--ink)" }}>{progress}%</span>
                              <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: "var(--border)" }}>
                                <div className="h-full rounded-full transition-all duration-1000"
                                  style={{ width: `${progress}%`, background: "linear-gradient(to left, #10B981, #14B8A6)" }} />
                              </div>
                            </div>
                            <div className="text-xs text-left flex items-center justify-end gap-1" style={{ color: "var(--ink-3)" }}>
                              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                              {wVideos} من {tVideos} درس مكتمل
                            </div>
                            <div className="absolute -bottom-3 left-0 right-0 h-px group-last:hidden" style={{ background: "var(--border)" }} />
                          </div>
                        );
                      })}
                    </div>
                  )}
                </DashCard>

                {/* ── Activity Heatmap ── */}
                <DashCard title="نشاطك التعليمي">
                  <div className="min-w-[600px]">
                    <div className="grid grid-cols-7 gap-2">
                      {activitySquares.map((intensity, i) => {
                        const colors = [
                          "var(--border)",
                          "rgba(16,185,129,0.2)",
                          "rgba(16,185,129,0.4)",
                          "rgba(16,185,129,0.65)",
                          "#10B981",
                        ];
                        return (
                          <div
                            key={i}
                            className="aspect-square rounded-xl transition-colors"
                            style={{ background: colors[intensity] }}
                            title={`مستوى النشاط: ${intensity}`}
                          />
                        );
                      })}
                    </div>
                    <div className="flex justify-between items-center mt-4 text-xs font-medium px-2" style={{ color: "var(--ink-3)" }}>
                      <div className="flex items-center gap-2">
                        أقل
                        <div className="flex gap-1">
                          <div className="w-3 h-3 rounded-sm" style={{ background: "var(--border)" }} />
                          <div className="w-3 h-3 rounded-sm" style={{ background: "rgba(16,185,129,0.2)" }} />
                          <div className="w-3 h-3 rounded-sm" style={{ background: "rgba(16,185,129,0.65)" }} />
                          <div className="w-3 h-3 rounded-sm" style={{ background: "#10B981" }} />
                        </div>
                        أكثر
                      </div>
                      <div>آخر 4 أسابيع</div>
                    </div>
                  </div>
                </DashCard>
              </div>

              {/* ── Left Column (Narrow — 4 cols) ── */}
              <div className="lg:col-span-4 flex flex-col gap-6">

                {/* ── AI Study Guide Card ── */}
                <div
                  className="relative rounded-2xl p-6 overflow-hidden flex flex-col justify-between min-h-[220px]"
                  style={{
                    background: "linear-gradient(to bottom right, rgba(20,184,166,0.15), rgba(15,23,42,0.9))",
                    border: "1px solid rgba(20,184,166,0.3)",
                    boxShadow: "0 8px 32px -8px rgba(16,185,129,0.2)",
                  }}
                >
                  <div className="absolute inset-0 opacity-10 pointer-events-none" style={{ backgroundImage: "linear-gradient(rgba(255,255,255,.06) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.06) 1px,transparent 1px)", backgroundSize: "24px 24px" }} />
                  <div className="relative z-10">
                    <div className="flex items-center gap-4 mb-4">
                      <div className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0"
                        style={{ background: "rgba(16,185,129,0.15)", border: "1px solid rgba(16,185,129,0.3)", boxShadow: "0 0 20px rgba(16,185,129,0.15)" }}>
                        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="#10B981" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 8V4H8M4 12a8 8 0 0 1 8-8 8 8 0 0 1 8 8 8 8 0 0 1-8 8c-2 0-3.5-.5-5-2" /><circle cx="12" cy="12" r="2" />
                        </svg>
                      </div>
                      <div>
                        <h3 className="text-lg font-black mb-0.5" style={{ color: "var(--ink)", fontFamily: "var(--font-head)" }}>المرشد الدراسي الذكي</h3>
                        <p className="text-xs font-medium" style={{ color: "var(--ink-2)" }}>اسأل عن أي مفهوم أو مسألة صعبة</p>
                      </div>
                    </div>
                  </div>
                  <Link href="/ai-study"
                    className="relative z-10 w-full py-3.5 rounded-2xl font-black flex items-center justify-center gap-2 no-underline transition-all hover:opacity-90 text-sm"
                    style={{ background: "linear-gradient(135deg, #10B981, #14B8A6)", color: "#fff", boxShadow: "0 4px 14px -4px rgba(16,185,129,0.4)" }}>
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" /></svg>
                    ابدأ محادثة جديدة 💬
                  </Link>
                </div>

                {/* ── Daily Streak ── */}
                <DashCard title="سلسلة المواظبة" subtitle="سجّل دخولك يومياً">
                  <div className="flex items-center gap-4">
                    <div className={`relative w-20 h-20 shrink-0 rounded-2xl flex flex-col items-center justify-center ${streak > 0 ? "" : ""}`}
                      style={{
                        background: streak > 0 ? "linear-gradient(to bottom right, #F59E0B, #EF4444)" : "var(--surface-2)",
                        border: streak > 0 ? "none" : "1px solid var(--border)",
                        boxShadow: streak > 0 ? "0 8px 24px -8px rgba(245,158,11,0.4)" : "none",
                      }}>
                      <span className="text-2xl">{streak > 0 ? "🔥" : ""}</span>
                      {streak === 0 && <svg className="w-7 h-7" fill="currentColor" viewBox="0 0 24 24" style={{ color: "var(--ink-3)" }}><path d="M12 2s4 4 4 8a4 4 0 11-8 0c0-1 .5-2 1-3 0 0-3 2-3 6a6 6 0 0012 0c0-5-6-11-6-11z" /></svg>}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-baseline gap-1.5">
                        <span className="text-3xl font-black" style={{ color: streak > 0 ? "#F59E0B" : "var(--ink-3)" }}>{streak}</span>
                        <span className="text-sm font-bold" style={{ color: "var(--ink-2)" }}>{streak === 1 ? "يوم متتالي" : "أيام متتالية"}</span>
                      </div>
                      <p className="text-xs mt-1" style={{ color: "var(--ink-3)" }}>
                        {streak === 0 ? "ابدأ سلسلتك اليوم! 🔥" : streak >= 7 ? "مواظبة رائعة! استمر 💪" : "واصل الدخول يومياً للحفاظ على سلسلتك"}
                      </p>
                    </div>
                  </div>
                  {/* Last 7 days (oldest → today), with real weekday initials */}
                  <div className="flex items-center justify-between gap-1.5 mt-5">
                    {Array.from({ length: 7 }).map((_, i) => {
                      const dayLetters = ["ح", "ن", "ث", "ر", "خ", "ج", "س"]; // Sun..Sat
                      const date = new Date(Date.now() - (6 - i) * 86400000);
                      const isToday = i === 6;
                      const active = stats?.weekActive?.[i] ?? false;
                      return (
                        <div key={i} className="flex flex-col items-center gap-1.5 flex-1">
                          <div
                            className="w-full aspect-square rounded-lg flex items-center justify-center transition-all"
                            style={{
                              background: active ? "linear-gradient(135deg, #F59E0B, #EF4444)" : "var(--surface-2)",
                              border: active ? "none" : `1px solid ${isToday ? "rgba(245,158,11,0.4)" : "var(--border)"}`,
                              color: active ? "#fff" : "var(--ink-3)",
                              boxShadow: active ? "0 2px 8px rgba(245,158,11,0.3)" : "none",
                            }}
                          >
                            {active ? (
                              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                            ) : <span className="text-[10px]">{dayLetters[date.getDay()]}</span>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </DashCard>

                {/* ── Achievements ── */}
                <DashCard title="الإنجازات" headerRight={<span className="text-sm font-bold" style={{ color: "var(--brand)" }}>{realAchievements} / {achievements.length || 6}</span>}>
                  <div className="grid grid-cols-3 gap-3">
                    {achievements.map((a) => {
                      const colors: Record<string, string> = {
                        "first-steps": "from-emerald-400 to-teal-600",
                        "fast-learner": "from-cyan-400 to-blue-600",
                        "streak-7": "from-orange-400 to-red-500",
                        "quiz-star": "from-amber-400 to-yellow-500",
                        "dedicated": "from-fuchsia-500 to-purple-600",
                        "expert": "from-purple-500 to-indigo-600",
                      };
                      return (
                        <div
                          key={a.id}
                          title={`${a.title} — ${a.description}`}
                          className={`aspect-square rounded-2xl relative flex flex-col items-center justify-center gap-1.5 p-1.5 transition-all ${a.unlocked ? `bg-gradient-to-br ${colors[a.id] ?? "from-emerald-500 to-teal-600"} shadow-md` : "opacity-60 grayscale"}`}
                          style={a.unlocked ? {} : { background: "var(--surface-2)", border: "1px solid var(--border)" }}
                        >
                          {a.unlocked && (
                            <div className="absolute top-1.5 right-1.5 w-3.5 h-3.5 bg-white/25 rounded-full flex items-center justify-center"><div className="w-1.5 h-1.5 bg-white rounded-full" /></div>
                          )}
                          <svg className={`w-7 h-7 ${a.unlocked ? "text-white" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" style={a.unlocked ? {} : { color: "var(--ink-3)" }}>{ACH_ICON[a.icon]}</svg>
                          <span className={`text-[9px] font-bold text-center leading-tight ${a.unlocked ? "text-white" : ""}`} style={a.unlocked ? {} : { color: "var(--ink-3)" }}>{a.title}</span>
                        </div>
                      );
                    })}
                  </div>
                </DashCard>

                {/* ── Weekly Goal Ring ── */}
                <DashCard title="هدف الأسبوع">
                  <div className="flex flex-col items-center">
                    <div className="relative w-32 h-32 mb-4">
                      <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                        <circle cx="50" cy="50" r="45" fill="none" stroke="var(--border)" strokeWidth="10" />
                        <circle cx="50" cy="50" r="45" fill="none" stroke="#10B981" strokeWidth="10"
                          strokeDasharray="283" strokeDashoffset={283 - (283 * Math.min(realHours / Math.max(realHours + 5, 10), 1))} strokeLinecap="round" />
                      </svg>
                      <div className="absolute inset-0 flex flex-col items-center justify-center">
                        <span className="text-3xl font-black" style={{ color: "var(--ink)" }}>{Math.round(Math.min(realHours / Math.max(realHours + 5, 10), 1) * 100)}%</span>
                        <span className="text-xs" style={{ color: "var(--ink-3)" }}>مكتمل</span>
                      </div>
                    </div>
                    <p className="text-sm font-bold mt-2" style={{ color: "var(--ink)" }}>{realHours} من {Math.max(realHours + 5, 10)} ساعة مكتملة</p>
                    <p className="text-xs mt-1" style={{ color: "var(--ink-3)" }}>أنت تبلي بلاءً حسناً!</p>
                  </div>
                </DashCard>
              </div>
            </div>

            {/* ── Bottom Utility / Points Management Bar ── */}
            <div className="mt-10 pt-6 border-t border-[var(--border)] flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-2 text-xs text-[var(--ink-3)]">
                <span>💡</span>
                <span>تُحتسب نقاطك من التفاعل اليومي وحل الاختبارات وإنجاز الدروس والخطط.</span>
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setShowResetPointsModal(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-500/25 bg-red-500/5 hover:bg-red-500/10 text-red-500 hover:border-red-500/40 text-xs font-semibold transition-all cursor-pointer shadow-sm"
                  title="تصفير نقاطك بالكامل"
                >
                  <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                  <span>تصفير نقاطي</span>
                </button>
              </div>
            </div>
          </>
        )}

        {/* ── Confirmation Modal for Resetting Points ── */}
        {showResetPointsModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <div
              className="relative w-full max-w-md rounded-2xl p-6 shadow-2xl border transition-all"
              style={{ background: "var(--surface)", borderColor: "var(--border)" }}
              dir="rtl"
            >
              <div className="flex items-start gap-4 mb-4">
                <div className="w-11 h-11 rounded-2xl bg-red-500/15 text-red-500 flex items-center justify-center shrink-0 border border-red-500/30 text-xl font-bold">
                  ⚠️
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="text-lg font-bold text-[var(--ink)] mb-1" style={{ fontFamily: "var(--font-head)" }}>
                    هل أنت متأكد من تصفير نقاطك؟
                  </h3>
                  <p className="text-xs text-[var(--ink-2)] leading-relaxed">
                    سيتم حذف رصيد نقاطك الحالي بالكامل وإعادته إلى <strong className="text-red-400">0 نقطة</strong>.
                  </p>
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-red-500/10 border border-red-500/20 text-xs leading-relaxed text-red-400 mb-6">
                <div className="flex items-center justify-between mb-1.5 font-bold">
                  <span>النقاط الحالية:</span>
                  <span className="text-sm text-red-300">{realPoints.toLocaleString()} نقطة</span>
                </div>
                <p className="text-[11px] text-red-300/90 leading-normal">
                  تنبيه: سيؤدي التصفير إلى إعادة حساب ترتيبك في لوحة الشرف والمتصدرين فوراً. هذا الإجراء نهائي ولا يمكن التراجع عنه.
                </p>
              </div>

              <div className="flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setShowResetPointsModal(false)}
                  disabled={resettingPoints}
                  className="px-4 py-2 rounded-xl text-xs font-bold transition-colors cursor-pointer"
                  style={{ background: "var(--surface-2)", color: "var(--ink-2)", border: "1px solid var(--border)" }}
                >
                  إلغاء
                </button>

                <button
                  type="button"
                  onClick={handleResetPoints}
                  disabled={resettingPoints}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-white transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
                  style={{ background: "linear-gradient(135deg, #EF4444, #DC2626)", boxShadow: "0 4px 14px -4px rgba(239,68,68,0.4)" }}
                >
                  {resettingPoints ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>جارٍ التصفير...</span>
                    </>
                  ) : (
                    <>
                      <span>نعم، تصفير النقاط الآن</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
      <Footer />
    </div>
    </ProfileGuard>
  );
}

/* ── Reusable Stat Card ── */
function StatCard({
  icon, iconBg, iconColor, iconGlow, value, label, badge, badgeBg, badgeColor,
}: {
  icon: React.ReactNode; iconBg: string; iconColor: string; iconGlow: string;
  value: string | number; label: string;
  badge?: string; badgeBg?: string; badgeColor?: string;
}) {
  return (
    <div
      className="rounded-2xl p-4 md:p-5 flex flex-col justify-between relative overflow-hidden transition-all duration-200"
      style={{ background: "var(--surface)", border: "1px solid var(--border)", boxShadow: "var(--shadow-sm)" }}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.boxShadow = "var(--shadow)"; }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.boxShadow = "var(--shadow-sm)"; }}
    >
      <div className="flex items-center justify-between">
        <div className="w-9 h-9 rounded-xl flex items-center justify-center"
          style={{ background: iconBg, color: iconColor, boxShadow: `0 0 16px ${iconGlow}` }}>
          {icon}
        </div>
        {badge && (
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-lg" style={{ background: badgeBg, color: badgeColor }}>{badge}</span>
        )}
      </div>
      <div className="font-black text-2xl md:text-3xl mt-3" style={{ color: "var(--ink)", fontFamily: "var(--font-head)" }}>{value}</div>
      <div className="text-xs mt-1 font-medium" style={{ color: "var(--ink-3)" }}>{label}</div>
    </div>
  );
}

/* ── Reusable Dashboard Card ── */
function DashCard({
  title, subtitle, emoji, titleLink, headerRight, children,
}: {
  title: string; subtitle?: string; emoji?: string;
  titleLink?: { href: string; label: string };
  headerRight?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl p-6 overflow-x-auto" style={{ background: "var(--surface)", border: "1px solid var(--border)", boxShadow: "var(--shadow-sm)" }}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <h3 className="text-xl font-bold" style={{ color: "var(--ink)" }}>{title}</h3>
          {emoji && <span className="text-xl" aria-hidden>{emoji}</span>}
        </div>
        {titleLink && (
          <Link href={titleLink.href} className="text-sm font-medium no-underline transition-colors" style={{ color: "var(--brand)" }}>{titleLink.label}</Link>
        )}
        {subtitle && <span className="text-xs" style={{ color: "var(--ink-3)" }}>{subtitle}</span>}
        {headerRight}
      </div>
      {children}
    </div>
  );
}
