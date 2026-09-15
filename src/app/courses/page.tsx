"use client";
import { useState, useEffect, useCallback, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AnimatePresence, MotionConfig, motion } from "framer-motion";
import { Navbar } from "@/components/ui/Navbar";
import { Footer } from "@/components/ui/Footer";
import { SkeletonCard } from "@/components/ui/Skeleton";
import { CourseCard } from "@/components/courses/CourseCard";

interface Teacher {
  id: string;
  name: string;
  photoUrl?: string | null;
  courseCount?: number;
  slug?: string | null;
  hasPublicPage?: boolean;
}

interface Course {
  id: string;
  title: string;
  description?: string;
  subject?: string;
  educationalStage?: string;
  thumbnailUrl?: string;
  teacher: { id: string; name: string; teacherProfile?: { photoUrl?: string | null; slug?: string | null } | null };
  isPaid?: boolean;
  price?: number | null;
  discountPercent?: number | null;
  discountExpiresAt?: string | null;
  hasAccess?: boolean;
  inLibrary?: boolean;
  isOwnerTeacher?: boolean;
}

const EASE: [number, number, number, number] = [0.16, 1, 0.3, 1];

const teacherListeners = new Set<() => void>();

function subscribeToTeacher(listener: () => void) {
  teacherListeners.add(listener);
  window.addEventListener("popstate", listener);
  return () => {
    teacherListeners.delete(listener);
    window.removeEventListener("popstate", listener);
  };
}

function readTeacherParam() {
  if (typeof window === "undefined") return "";
  return new URLSearchParams(window.location.search).get("teacher") ?? "";
}

function writeTeacherParam(teacherId: string) {
  const url = new URL(window.location.href);
  if (teacherId) url.searchParams.set("teacher", teacherId);
  else url.searchParams.delete("teacher");
  window.history.replaceState(null, "", url.toString());
  teacherListeners.forEach((notify) => notify());
}

export default function CoursesPage() {
  const router = useRouter();
  const [courses, setCourses] = useState<Course[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [user, setUser] = useState<{ name: string; role: string; accountMode?: string } | null>(null);

  const selectedTeacherId = useSyncExternalStore(subscribeToTeacher, readTeacherParam, () => "");

  useEffect(() => {
    fetch("/api/auth/me")
      .then(async (r) => {
        const raw = await r.text();
        return raw ? JSON.parse(raw) : {};
      })
      .then((d) => setUser(d.user ? { name: d.user.name, role: d.user.role, accountMode: d.user.accountMode } : null))
      .catch(() => setUser(null));
  }, []);

  const fetchCourses = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/courses");
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data.error || "تعذر الاتصال بالخادم. حاول مرة أخرى.");
      }

      const allCourses: Course[] = data.courses || [];
      const apiTeachers: Teacher[] = data.teachers || [];
      setCourses(allCourses);

      // Extract & merge all teachers (both from API list of registered teachers and courses)
      const teacherMap = new Map<string, Teacher>();

      for (const t of apiTeachers) {
        if (t.slug === "demo" || t.name === "test" || t.name?.includes("المدرس التجريبي")) continue;
        teacherMap.set(t.id, {
          id: t.id,
          name: t.name,
          photoUrl: t.photoUrl || null,
          courseCount: t.courseCount || 0,
          slug: t.slug || null,
          hasPublicPage: t.hasPublicPage || false,
        });
      }

      for (const c of allCourses) {
        if (c.teacher?.id) {
          const tSlug = c.teacher.teacherProfile?.slug;
          const tName = c.teacher.name;
          if (tSlug === "demo" || tName === "test" || tName?.includes("المدرس التجريبي")) continue;

          const existing = teacherMap.get(c.teacher.id);
          const photoUrl = c.teacher.teacherProfile?.photoUrl || null;
          if (existing) {
            if (!existing.photoUrl && photoUrl) existing.photoUrl = photoUrl;
          } else {
            teacherMap.set(c.teacher.id, {
              id: c.teacher.id,
              name: c.teacher.name,
              photoUrl: photoUrl,
              courseCount: 1,
            });
          }
        }
      }

      setTeachers(Array.from(teacherMap.values()));
    } catch (err) {
      console.error("Fetch courses error:", err);
      setCourses([]);
      setTeachers([]);
      setError(err instanceof Error ? err.message : "حدث خطأ أثناء تحميل البيانات");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCourses();
  }, [fetchCourses]);

  const selectedTeacher = teachers.find((t) => t.id === selectedTeacherId);
  const filteredCourses = selectedTeacherId
    ? courses.filter((c) => c.teacher?.id === selectedTeacherId)
    : [];

  return (
    <MotionConfig reducedMotion="user">
      <div className="flex flex-col min-h-screen" style={{ background: "var(--bg)" }} dir="rtl">
        <Navbar user={user} />
        <main className="flex-1 max-w-4xl mx-auto w-full px-4 sm:px-6 py-8 md:py-12">

          {/* ── Page Header ── */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, ease: EASE }}
            className="mb-8"
          >
            {selectedTeacherId && (
              <button
                onClick={() => writeTeacherParam("")}
                className="mb-4 inline-flex items-center gap-2 text-sm font-bold border-none bg-transparent cursor-pointer transition-colors"
                style={{ color: "#14B8A6" }}
              >
                ← اختر مدرس آخر
              </button>
            )}

            <h1
              className="text-3xl md:text-4xl font-black tracking-tight mb-2"
              style={{ color: "var(--ink)", fontFamily: "var(--font-head)" }}
            >
              {selectedTeacherId ? `كورسات ${selectedTeacher?.name || "المدرس"}` : "الكورسات"}
            </h1>
            <p className="text-base font-medium" style={{ color: "var(--ink-2)" }}>
              {selectedTeacherId
                ? `جميع الكورسات والشروحات المتاحة للمدرس`
                : "اختر مدرسك وابدأ المذاكرة خلال دقيقة واحدة."}
            </p>
          </motion.div>

          {/* ── Error State ── */}
          {error && (
            <div
              className="mb-6 flex flex-col sm:flex-row items-center justify-between gap-3 rounded-2xl px-5 py-4 text-sm"
              style={{ border: "1px solid var(--danger)", background: "var(--danger-soft)", color: "var(--danger)" }}
            >
              <span>{error}</span>
              <button
                onClick={fetchCourses}
                className="shrink-0 rounded-lg px-4 py-2 text-xs font-bold text-white border-none cursor-pointer hover:opacity-90"
                style={{ background: "var(--danger)" }}
              >
                إعادة المحاولة
              </button>
            </div>
          )}

          {/* ── Loading Skeletons ── */}
          {loading ? (
            <div className="space-y-4 max-w-3xl">
              {Array.from({ length: 5 }).map((_, i) => (
                <div
                  key={i}
                  className="h-20 rounded-[20px] animate-pulse"
                  style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
                />
              ))}
            </div>
          ) : selectedTeacherId ? (
            /* ── Selected Teacher's Course View ── */
            filteredCourses.length > 0 ? (
              <motion.div
                layout
                className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6"
              >
                <AnimatePresence mode="popLayout" initial={false}>
                  {filteredCourses.map((course, i) => (
                    <motion.div
                      key={course.id}
                      layout
                      initial={{ opacity: 0, y: 16, scale: 0.97 }}
                      animate={{
                        opacity: 1,
                        y: 0,
                        scale: 1,
                        transition: { duration: 0.32, ease: EASE, delay: Math.min(i * 0.035, 0.32) },
                      }}
                      exit={{ opacity: 0, scale: 0.96, transition: { duration: 0.16 } }}
                      className="h-full"
                    >
                      <CourseCard course={course} onCodeApplied={fetchCourses} />
                    </motion.div>
                  ))}
                </AnimatePresence>
              </motion.div>
            ) : (
              <div className="text-center py-16">
                <p className="text-lg font-bold" style={{ color: "var(--ink)" }}>
                  لا توجد كورسات متاحة لهذا المدرس حالياً
                </p>
                <button
                  onClick={() => writeTeacherParam("")}
                  className="mt-4 px-6 py-2.5 rounded-xl text-sm font-bold text-white border-none cursor-pointer"
                  style={{ background: "#14B8A6" }}
                >
                  العودة لقائمة المدرسين
                </button>
              </div>
            )
          ) : (
            /* ── Minimal Teacher Selection Cards List (Matching Prompt & Screenshot) ── */
            <motion.div
              layout
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, ease: EASE }}
              className="space-y-3.5 max-w-3xl"
            >
              {/* ── Superadmin & QA Pinned DEMO Teacher Showroom Card ── */}
              {(user?.role === "superadmin" || user?.accountMode === "TESTER") && (
                <Link href="/demo" className="no-underline block mb-4">
                  <motion.div
                    whileHover={{ scale: 1.01, boxShadow: "0 0 24px rgba(245,158,11,0.35)" }}
                    whileTap={{ scale: 0.99 }}
                    className="group relative flex items-center justify-between h-[84px] px-5 rounded-[22px] transition-all duration-200 cursor-pointer select-none"
                    style={{
                      background: "linear-gradient(135deg, rgba(254,243,199,0.15) 0%, rgba(253,230,138,0.08) 100%)",
                      border: "2px dashed #f59e0b",
                      boxShadow: "0 4px 16px rgba(245,158,11,0.15)",
                    }}
                  >
                    <div className="flex items-center gap-4">
                      <div className="relative w-14 h-14 rounded-full overflow-hidden shrink-0 border-2 border-amber-400 bg-amber-500/20 flex items-center justify-center font-black text-2xl text-amber-500">
                        ⭐
                      </div>
                      <div className="flex flex-col">
                        <div className="flex items-center gap-2">
                          <span className="font-black text-lg text-amber-500 tracking-tight">
                            المدرس التجريبي (DEMO Showroom)
                          </span>
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-500 text-white uppercase tracking-wider">
                            DEMO
                          </span>
                        </div>
                        <span className="text-xs text-[var(--ink-muted)]">
                          معاينة كامل مزايا المنصة للمشرفين وفاحصي الجودة (QA) — بدون دفع وبصلاحيات مطلقة
                        </span>
                      </div>
                    </div>
                    <span className="text-sm font-bold text-amber-500 group-hover:translate-x-[-4px] transition-transform">
                      فتح المعاينة ←
                    </span>
                  </motion.div>
                </Link>
              )}

              {teachers.length > 0 ? (
                teachers.map((teacher, i) => {
                  const targetHref = teacher.hasPublicPage && teacher.slug ? `/${teacher.slug}` : `/courses?teacher=${teacher.id}`;
                  const isPublic = teacher.hasPublicPage && teacher.slug;

                  const cardContent = (
                    <motion.div
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.3, delay: i * 0.04 }}
                      onClick={(e) => {
                        if (!isPublic) {
                          e.preventDefault();
                          writeTeacherParam(teacher.id);
                        }
                      }}
                      onMouseEnter={() => {
                        if (isPublic) {
                          router.prefetch(`/${teacher.slug}`);
                        }
                      }}
                      className="group relative flex items-center justify-between h-[76px] px-5 rounded-[20px] transition-all duration-200 cursor-pointer select-none"
                      style={{
                        background: "var(--surface)",
                        border: "1px solid var(--border)",
                        boxShadow: "var(--shadow-sm)",
                      }}
                      whileHover={{
                        scale: 1.01,
                        borderColor: "rgba(56,189,248,0.8)",
                        boxShadow: "0 0 20px rgba(56,189,248,0.3)",
                      }}
                      whileTap={{ scale: 0.99 }}
                    >
                      {/* Right side in RTL: Avatar Photo + Name */}
                      <div className="flex items-center gap-4">
                        {/* Circular Teacher Photo (56-60px) */}
                        <div className="relative w-14 h-14 rounded-full overflow-hidden shrink-0 border border-white/10" style={{ background: "rgba(255,255,255,0.05)" }}>
                          {teacher.photoUrl ? (
                            <img
                              src={teacher.photoUrl}
                              alt={teacher.name}
                              className="w-full h-full object-cover"
                              loading="eager"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center font-black text-xl text-white" style={{ background: "linear-gradient(135deg, #10B981, #14B8A6)" }}>
                              {teacher.name.trim().charAt(0)}
                            </div>
                          )}
                        </div>

                        {/* Teacher Name Only */}
                        <span className="font-bold text-lg text-[var(--ink)] tracking-tight">
                          {teacher.name}
                        </span>
                      </div>

                      {/* Left side: subtle arrow indicator on hover */}
                      <div className="text-slate-400 group-hover:text-sky-400 transition-colors">
                        <svg className="w-5 h-5 transform rotate-180" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                        </svg>
                      </div>
                    </motion.div>
                  );

                  return isPublic ? (
                    <Link key={teacher.id} href={targetHref} prefetch={true} className="block no-underline">
                      {cardContent}
                    </Link>
                  ) : (
                    <div key={teacher.id} className="block">
                      {cardContent}
                    </div>
                  );
                })
              ) : (
                <div className="text-center py-16">
                  <p className="text-lg font-bold" style={{ color: "var(--ink)" }}>
                    لا يوجد مدرسون متاحون حالياً
                  </p>
                </div>
              )}
            </motion.div>
          )}
        </main>
        <Footer />
      </div>
    </MotionConfig>
  );
}
