/**
 * Booking (teacher subscription / حجز) must never be treated as enrollment
 * in a separately-sold lecture or a teaser lesson.
 *
 * - Teasers ("شرح الدرس الأول") are merged into the monthly curriculum and
 *   hidden from the student library.
 * - Center lectures and "المحاضرة الثانية/الثالثة…" are sold per course
 *   (code / direct enroll), not covered by the monthly booking package.
 */

export const TEASER_LESSON_IDS = new Set([
  "cmtqbw41d005qqwobfcrfg07c", // شرح الدرس الأول (Abdelbaset - Arabic)
  "cmtr54unr00wfqwwvtbvaxy8q", // شرح الدرس الأول (Abdelbaset - Languages)
  "cmta9me5r0007qxmwnnsq1cez", // First section (Youssef El-Tareq - Languages)
  "cmt45qxsf001oqx3e9jtlwny8", // اول حصة في الشهر الاول عربي (Youssef El-Tareq)
]);

export type LessonCourseRef = {
  id?: string | null;
  title?: string | null;
  deliveryMode?: string | null;
};

export function isTeaserLesson(course: LessonCourseRef | string | null | undefined): boolean {
  if (!course) return false;
  if (typeof course === "string") {
    return TEASER_LESSON_IDS.has(course);
  }
  if (course.id && TEASER_LESSON_IDS.has(course.id)) return true;
  const title = (course.title || "").toLowerCase();
  return (
    title.includes("شرح الدرس الأول") ||
    title.includes("اول حصة في الشهر") ||
    title.includes("first section")
  );
}

/** Per-lecture products that require their own enrollment / access code. */
export function isSeparatelySoldLecture(course: LessonCourseRef | null | undefined): boolean {
  if (!course) return false;
  if ((course.deliveryMode || "").toUpperCase() === "CENTER") return true;
  const title = course.title || "";
  return /المحاضرة\s*(الثانية|الثالثة|الرابعة|الخامسة)/.test(title);
}

/**
 * UNLINKED: Teacher subscriptions (حجوزات / باقات) DO NOT automatically grant access to courses.
 * Course access is strictly explicit via CourseEnrollment or AccessCode.
 */
export function teacherSubscriptionCoversCourse(_course: LessonCourseRef | null | undefined): boolean {
  return false;
}

