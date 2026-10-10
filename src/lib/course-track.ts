import { prisma } from "./prisma";
import { teacherSubscriptionCoversCourse, type LessonCourseRef } from "./standalone-lessons";

export type CourseTrack = "languages" | "arabic" | "all";

/**
 * Derives the language track of a course from its title, subject, and description (or a raw title string).
 */
export function getCourseLanguageTrack(course: {
  title?: string | null;
  subject?: string | null;
  description?: string | null;
} | string | null | undefined): CourseTrack {
  if (!course) return "all";

  let text = "";
  if (typeof course === "string") {
    text = course.toLowerCase();
  } else {
    text = `${course.title || ""} ${course.subject || ""} ${course.description || ""}`.toLowerCase();
  }

  const isLanguages = /لغات|languages?|english/i.test(text);
  const isArabic = /عربي|arabic/i.test(text);

  if (isLanguages && !isArabic) return "languages";
  if (isArabic && !isLanguages) return "arabic";

  // Curriculum markers for specific Egyptian high school courses without explicit "عربي"
  if (/تطور تكنولوجيا المعلومات|بكالوريا/i.test(text) && !isLanguages) {
    return "arabic";
  }

  return "all";
}

export async function getEffectiveCourseTracksBatch(
  courses: Array<{ id: string; title?: string | null; subject?: string | null; description?: string | null }>
): Promise<Map<string, CourseTrack>> {
  const result = new Map<string, CourseTrack>();
  if (courses.length === 0) return result;

  const keys = courses.map((c) => `course_track_${c.id}`);
  let overrides: Array<{ key: string; value: string }> = [];
  try {
    overrides = await prisma.appSetting.findMany({
      where: { key: { in: keys } },
      select: { key: true, value: true },
    });
  } catch {
    // fallback
  }

  const overrideMap = new Map<string, string>();
  for (const row of overrides) {
    overrideMap.set(row.key, row.value);
  }

  for (const c of courses) {
    const val = overrideMap.get(`course_track_${c.id}`);
    if (val === "languages" || val === "arabic" || val === "all") {
      result.set(c.id, val as CourseTrack);
    } else {
      result.set(c.id, getCourseLanguageTrack(c));
    }
  }

  return result;
}

/**
 * Returns the effective course track considering any superadmin override in AppSetting.
 */
export async function getEffectiveCourseTrack(
  courseId: string,
  course?: { title?: string | null; subject?: string | null; description?: string | null } | string | null
): Promise<CourseTrack> {
  try {
    const override = await prisma.appSetting.findUnique({
      where: { key: `course_track_${courseId}` },
      select: { value: true },
    });
    if (override?.value === "languages" || override?.value === "arabic" || override?.value === "all") {
      return override.value as CourseTrack;
    }
  } catch {
    // fallback to heuristic if DB read fails
  }

  if (course) {
    return getCourseLanguageTrack(course);
  }

  const dbCourse = await prisma.course.findUnique({
    where: { id: courseId },
    select: { title: true, subject: true, description: true },
  });

  return dbCourse ? getCourseLanguageTrack(dbCourse) : "all";
}

/**
 * Checks if a teacher subscription languageTrack matches a course's track.
 */
export function isSubscriptionTrackMatching(
  subTrack: string | null | undefined,
  courseTrack: CourseTrack
): boolean {
  if (courseTrack === "all") {
    return true;
  }

  const normalizedSubTrack = (subTrack || "arabic").toLowerCase().trim();
  const isSubLanguages = normalizedSubTrack === "languages" || normalizedSubTrack === "english";
  const isSubArabic = normalizedSubTrack === "arabic";

  if (courseTrack === "languages") {
    return isSubLanguages;
  }

  if (courseTrack === "arabic") {
    return isSubArabic;
  }

  return true;
}

type TrackedCourse = LessonCourseRef & {
  subject?: string | null;
  description?: string | null;
};

/**
 * Package products are separate. A title like "باقة الترم" is the term
 * product; "باقة الشهر" is the month product. Courses without either marker
 * stay open to any matching booking.
 */
export function coursePackageTier(
  course: { title?: string | null } | null | undefined
): "monthly" | "termly" | null {
  const title = course?.title || "";
  if (/باقة\s*الترم|كورس\s*الترم|الترم\s*(الأول|الاول|الثاني|التاني|\d+)|ترم\s*(\d+)/i.test(title)) return "termly";
  if (
    /باقة\s*الشهر|الشهر\s*(الأول|الاول|الثاني|التاني|الثالث|التالت|الرابع|الخامس|السادس|السابع|الثامن|\d+)|شهر\s*(\d+|أكتوبر|اكتوبر|نوفمبر|ديسمبر|يناير|فبراير|مارس|أبريل|ابريل|مايو)/i.test(
      title
    )
  )
    return "monthly";
  return null;
}

/**
 * Monthly booking opens the month package only.
 * Term and year bookings open both, because the term product includes the month.
 */
export function planCoversCoursePackage(
  planType: string | null | undefined,
  course: { title?: string | null } | null | undefined
): boolean {
  const tier = coursePackageTier(course);
  if (!tier) return true;
  const plan = (planType || "monthly").toLowerCase();
  if (plan === "termly" || plan === "yearly") return true;
  return tier === "monthly";
}

/**
 * A paid teacher booking opens a course only when the course is part of the
 * monthly curriculum (not a teaser or a separately sold lecture), the
 * booking's language track matches the course, and the plan type covers that
 * package. Omit planType only for a "could any plan open this" probe.
 */
export function bookingGrantsCourseAccess(
  course: TrackedCourse,
  subscriptionTrack: string | null | undefined,
  trackOverride?: string | null,
  planType?: string | null
): boolean {
  if (!teacherSubscriptionCoversCourse(course)) return false;
  // Courses placed on the teacher's "Terms & Bookings" page: reviews/workshops
  // and excluded courses are never in a booking, and a monthly booking only
  // opens month courses. (The exact term/grade check lives in teacher-terms.ts;
  // these report paths don't carry the booking's term.)
  const rawKind = (course as { bookingKind?: string | null }).bookingKind;
  if (rawKind) {
    const parts = rawKind.split(",").map((p) => p.trim().split(":")[0]);
    const isExcluded = parts.some((k) => k === "none" || k === "extra");
    if (isExcluded && !parts.some((k) => k === "month" || k === "term" || k === "year" || k === "yearly")) {
      return false;
    }
    const hasMonth = parts.includes("month");
    const hasTerm = parts.includes("term");
    const hasYear = parts.includes("year") || parts.includes("yearly");

    if (!hasMonth && !hasTerm && !hasYear) return false;

    if (planType !== undefined) {
      const plan = (planType || "monthly").toLowerCase();
      if (plan === "monthly" && !hasMonth) return false;
      if (plan === "termly" && !hasMonth && !hasTerm) return false;
      if (plan === "yearly" && !hasMonth && !hasTerm && !hasYear) return false;
    }
  } else if (planType !== undefined && !planCoversCoursePackage(planType, course)) return false;
  const track: CourseTrack =
    trackOverride === "languages" || trackOverride === "arabic" || trackOverride === "all"
      ? trackOverride
      : getCourseLanguageTrack(course);
  return isSubscriptionTrackMatching(subscriptionTrack, track);
}
