/**
 * Teacher-defined terms and what a booking (حجز) opens.
 *
 * A term is a set of month packages: term 1 = months 1-4, term 2 = months 5-8.
 * Every teacher runs them on a different calendar, so the owner places each
 * course into a term on the superadmin "Terms & Bookings" page, sets each
 * term's end date, and switches a term "on sale" by hand. Nothing here changes
 * on its own schedule.
 *
 * A course that has not been placed yet (bookingKind null) keeps the legacy
 * rules in planCoversCoursePackage, so nothing changes for a teacher's students
 * until their courses have been placed.
 */
import { prisma } from "@/lib/prisma";
import { planCoversCoursePackage } from "@/lib/course-track";

export const BOOKING_KINDS = ["month", "term", "year", "yearly", "extra", "none"] as const;
export type BookingKind = (typeof BOOKING_KINDS)[number];

export const TERM_NUMBERS = [1, 2] as const;

export interface BookingSub {
  teacherId: string;
  planType: string;
  educationalStage?: string | null;
  termNumbers?: number[] | null;
}

export interface BookingCourse {
  title?: string | null;
  educationalStage?: string | null;
  bookingKind?: string | null;
  bookingTerm?: number | null;
}

export interface TeacherTermRow {
  teacherId: string;
  educationalStage: string;
  termNumber: number;
  endsAt: Date | null;
  onSale: boolean;
}

/** teacherId|stage|term → term row */
export type TermMap = Map<string, TeacherTermRow>;

const termKey = (teacherId: string, stage: string, term: number) => `${teacherId}|${stage}|${term}`;

export async function loadTeacherTerms(teacherIds: string[]): Promise<TermMap> {
  const map: TermMap = new Map();
  const ids = [...new Set(teacherIds.filter(Boolean))];
  if (ids.length === 0) return map;
  const rows = await prisma.teacherTerm.findMany({
    where: { teacherId: { in: ids } },
    select: { teacherId: true, educationalStage: true, termNumber: true, endsAt: true, onSale: true },
  });
  for (const r of rows) map.set(termKey(r.teacherId, r.educationalStage, r.termNumber), r);
  return map;
}

/** Terms a booking owns. Legacy term bookings (bought before terms existed) are term 1. */
export function ownedTerms(sub: BookingSub): number[] {
  const plan = (sub.planType || "").toLowerCase();
  if (plan === "yearly") return [1, 2];
  if (plan === "termly") return sub.termNumbers && sub.termNumbers.length > 0 ? sub.termNumbers : [1];
  return [];
}

export interface InferredPlacement {
  bookingKind: string;
  bookingTerm: number;
  monthNumber?: number;
}

export function inferCourseStage(title?: string | null): string | null {
  if (!title) return null;
  const t = title.toLowerCase();
  if (/أولى|اولي|الصف الأول|الصف الاول|sec_1|prep_1/i.test(t)) return "sec_1";
  if (/ثانية|تانية|الصف الثاني|الصف التاني|بكالوريا|sec_2|prep_2/i.test(t)) return "sec_2";
  if (/ثالثة|تالتة|الصف الثالث|الصف التالت|sec_3|prep_3/i.test(t)) return "sec_3";
  return null;
}

export function inferCoursePlacement(title?: string | null): InferredPlacement | null {
  if (!title) return null;
  const clean = title.trim();

  // 1. Separately sold / center / teaser / excluded
  if (/شرح\s*الدرس\s*الأول|first\s*section|اول\s*حصة\s*في\s*الشهر/i.test(clean)) {
    return { bookingKind: "none", bookingTerm: 1 };
  }
  if (
    /المحاضرة\s*(الثانية|الثالثة|الرابعة|الخامسة|الأولى|الاولى|\d+)|سنتر|مركز/i.test(clean) &&
    !/الشهر\s*(الأول|الاول|الثاني|التاني|\d+)/i.test(clean)
  ) {
    return { bookingKind: "none", bookingTerm: 1 };
  }
  if (/ورشة|مراجعة\s*نهائية|خارج\s*الحجوزات/i.test(clean)) {
    return { bookingKind: "extra", bookingTerm: 1 };
  }

  // 2. Yearly
  if (/سنوي|السنة\s*كاملة|السنه\s*كامله|باقة\s*السنة/i.test(clean)) {
    return { bookingKind: "year", bookingTerm: 1 };
  }

  // 3. Months 1-8 (Terms: 1..4 -> Term 1, 5..8 -> Term 2)
  if (/الشهر\s*(الثامن|8|٨)|شهر\s*(8|٨|ثمانية|مايو)/i.test(clean)) {
    return { bookingKind: "month:8", bookingTerm: 2, monthNumber: 8 };
  }
  if (/الشهر\s*(السابع|7|٧)|شهر\s*(7|٧|سبعة|أبريل|ابريل)/i.test(clean)) {
    return { bookingKind: "month:7", bookingTerm: 2, monthNumber: 7 };
  }
  if (/الشهر\s*(السادس|6|٦)|شهر\s*(6|٦|ستة|مارس)/i.test(clean)) {
    return { bookingKind: "month:6", bookingTerm: 2, monthNumber: 6 };
  }
  if (/الشهر\s*(الخامس|5|٥)|شهر\s*(5|٥|خمسة|فبراير)/i.test(clean)) {
    return { bookingKind: "month:5", bookingTerm: 2, monthNumber: 5 };
  }
  if (/الشهر\s*(الرابع|4|٤)|شهر\s*(4|٤|أربعة|اربعة|يناير)/i.test(clean)) {
    return { bookingKind: "month:4", bookingTerm: 1, monthNumber: 4 };
  }
  if (/الشهر\s*(الثالث|التالت|3|٣)|شهر\s*(3|٣|ثلاثة|ديسمبر)/i.test(clean)) {
    return { bookingKind: "month:3", bookingTerm: 1, monthNumber: 3 };
  }
  if (/الشهر\s*(الثاني|التاني|2|٢)|شهر\s*(2|٢|اثنين|إثنين|نوفمبر)/i.test(clean)) {
    return { bookingKind: "month:2", bookingTerm: 1, monthNumber: 2 };
  }
  if (/الشهر\s*(الأول|الاول|1|١)|شهر\s*(1|١|واحد|أكتوبر|اكتوبر)/i.test(clean)) {
    return { bookingKind: "month:1", bookingTerm: 1, monthNumber: 1 };
  }

  // 4. Terms 1-2
  if (/الترم\s*(الثاني|التاني|2|٢)|ترم\s*(2|٢)/i.test(clean)) {
    return { bookingKind: "term:2", bookingTerm: 2 };
  }
  if (/الترم\s*(الأول|الاول|1|١)|ترم\s*(1|١)|باقة\s*الترم|كورس\s*الترم/i.test(clean)) {
    return { bookingKind: "term:1", bookingTerm: 1 };
  }

  return null;
}

export function stageMatches(sub: BookingSub, course: BookingCourse): boolean {
  const subStage = sub.educationalStage;
  if (!subStage || subStage === "الكل") return true;
  const courseStage = course.educationalStage || inferCourseStage(course.title);
  if (!courseStage || courseStage === "الكل") return true;
  return subStage === courseStage;
}

export interface ParsedPlacement {
  kind: string;
  term: number;
}

export function parseCoursePlacements(course: BookingCourse): ParsedPlacement[] {
  let raw = course.bookingKind;
  if (!raw) {
    const inferred = inferCoursePlacement(course.title);
    if (inferred) {
      raw = inferred.bookingKind;
    }
  }
  if (!raw) return [];
  const parts = raw.split(",").map((p) => p.trim()).filter(Boolean);
  return parts.map((part) => {
    if (part.includes(":")) {
      const [k, t] = part.split(":");
      return { kind: k, term: Number(t) || 1 };
    }
    return { kind: part, term: course.bookingTerm ?? 1 };
  });
}

/**
 * Does this booking open this course? Track and teaser/lecture checks stay with
 * the callers; this decides the package/term part. Supports multiple placements
 * (e.g. month:1,term:1).
 */
export function bookingCoversCourse(
  sub: BookingSub,
  course: BookingCourse,
  terms: TermMap,
  now: Date = new Date()
): boolean {
  // 1. Stage matches MUST be checked first always!
  if (!stageMatches(sub, course)) return false;

  const placements = parseCoursePlacements(course);
  if (placements.length === 0) {
    return planCoversCoursePackage(sub.planType, course);
  }

  const plan = (sub.planType || "monthly").toLowerCase();
  const subTerms = ownedTerms(sub);

  return placements.some(({ kind: pKind, term: pTerm }) => {
    if (pKind !== "month" && pKind !== "term" && pKind !== "year" && pKind !== "yearly") return false;

    if (plan === "monthly") {
      if (pKind === "month") {
        const monthsOwned = sub.termNumbers && sub.termNumbers.length > 0 ? sub.termNumbers : [1];
        if (pTerm) {
          return monthsOwned.includes(pTerm);
        }
        return true;
      }
      return false;
    }

    if (plan === "yearly") {
      return true;
    }

    // For termly plan:
    // Months 1-4 belong to Term 1, Months 5-8 belong to Term 2
    let term: number;
    if (pKind === "month") {
      term = pTerm >= 5 ? 2 : 1;
    } else if (pKind === "term") {
      term = pTerm === 2 ? 2 : 1;
    } else {
      return false;
    }

    if (!subTerms.includes(term)) return false;

    if (plan === "termly" && course.educationalStage) {
      const row = terms.get(termKey(sub.teacherId, course.educationalStage, term));
      if (row?.endsAt && row.endsAt <= now) return false;
    }
    return true;
  });
}

/**
 * Which term a new term booking buys: the one the owner marked "on sale"
 * (term 2 wins if both are). Returns
 *  - null when no terms are set up for this teacher+grade (legacy behaviour),
 *  - { termNumber: null } when terms are set up but none is on sale (block the sale).
 */
export async function termForSale(
  teacherId: string,
  stage: string | null | undefined,
  db: { teacherTerm: typeof prisma.teacherTerm } = prisma
): Promise<{ termNumber: number | null; endsAt: Date | null } | null> {
  if (!stage) return null;
  const rows = await db.teacherTerm.findMany({
    where: { teacherId, educationalStage: stage },
    select: { termNumber: true, endsAt: true, onSale: true },
  });
  if (rows.length === 0) return null;
  const onSale = rows.filter((r) => r.onSale).sort((a, b) => b.termNumber - a.termNumber)[0];
  return onSale ? { termNumber: onSale.termNumber, endsAt: onSale.endsAt } : { termNumber: null, endsAt: null };
}

/** End of a year booking: the teacher's term-2 end date when set. */
export async function yearEndFor(
  teacherId: string,
  stage: string | null | undefined,
  db: { teacherTerm: typeof prisma.teacherTerm } = prisma
): Promise<Date | null> {
  if (!stage) return null;
  const t2 = await db.teacherTerm.findUnique({
    where: { teacherId_educationalStage_termNumber: { teacherId, educationalStage: stage, termNumber: 2 } },
    select: { endsAt: true },
  });
  return t2?.endsAt ?? null;
}

interface ExistingBooking {
  status: string;
  expiresAt: Date | null;
  termNumbers?: number[] | null;
}

function activeOwnedTerms(existing: ExistingBooking | null | undefined, now: Date): number[] {
  if (!existing || existing.status !== "active") return [];
  if (existing.expiresAt && existing.expiresAt <= now) return [];
  return existing.termNumbers && existing.termNumbers.length > 0 ? existing.termNumbers : [1];
}

/** True when a still-running term booking already covers this term. */
export function ownsActiveTerm(existing: ExistingBooking | null | undefined, termNumber: number, now: Date = new Date()): boolean {
  return activeOwnedTerms(existing, now).includes(termNumber);
}

/**
 * Terms and end date for a new term/year booking when the teacher has set up
 * terms. Both fields are null when the legacy duration rules should apply.
 * Buying term 2 keeps term 1 if it is still running; the booking then ends at
 * the later of the two end dates.
 */
export function applyTeacherTerms(
  existing: ExistingBooking | null | undefined,
  saleTerm: { termNumber: number | null; endsAt: Date | null } | null,
  yearEnd: Date | null,
  now: Date = new Date()
): { termNumbers: number[] | null; expiresAt: Date | null } {
  if (yearEnd) return { termNumbers: null, expiresAt: yearEnd > now ? yearEnd : null };
  if (!saleTerm || saleTerm.termNumber === null) return { termNumbers: null, expiresAt: null };

  const termNumbers = [...new Set([...activeOwnedTerms(existing, now), saleTerm.termNumber])].sort();
  let expiresAt: Date | null = saleTerm.endsAt && saleTerm.endsAt > now ? saleTerm.endsAt : null;
  if (expiresAt && existing?.status === "active" && existing.expiresAt && existing.expiresAt > expiresAt) {
    expiresAt = existing.expiresAt;
  }
  return { termNumbers, expiresAt };
}
