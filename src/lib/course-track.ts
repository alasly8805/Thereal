import { prisma } from "./prisma";

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
