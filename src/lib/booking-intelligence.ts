import { getPlanMonths, resolveContentMonth, PLAN_LABELS_AR } from "@/lib/subscription-terms";

/**
 * Booking intelligence — reconciles what a student *paid for* against what the
 * platform has actually *published* for them.
 *
 * A booking is sold in months: a monthly plan buys 1 month, a term buys 4, a
 * year buys 8 (two terms). The curriculum, however, is published one month at a
 * time. So a student who buys a full term today is owed four months of content
 * while only the first month exists. The money for the three undelivered months
 * is not earned revenue yet — it is a delivery obligation. Nothing on the
 * platform measured that gap before, which is what this module computes.
 */

export interface BookingSubscriptionInput {
  id: string;
  studentId: string | null;
  studentName?: string | null;
  studentPhone?: string | null;
  educationalStage?: string | null;
  planType: string;
  amount: number;
  createdAt: Date;
  expiresAt: Date | null;
}

export interface BookingCourseInput {
  id: string;
  title: string;
  isPaid: boolean;
  price: number | null;
  folders: Array<{ id: string; name: string; monthIndex: number | null }>;
}

export interface BookingTeacherInput {
  id: string;
  name: string | null;
  subscriptions: BookingSubscriptionInput[];
  courses: BookingCourseInput[];
}

export interface StudentBookingAnalysis {
  subscriptionId: string;
  studentId: string | null;
  studentName: string;
  studentPhone: string;
  educationalStage: string;
  teacherId: string;
  teacherName: string;
  planType: string;
  planLabel: string;
  amountPaid: number;
  /** Months the plan entitles the student to (monthly 1 / termly 4 / yearly 8). */
  monthsBooked: number;
  /** Curriculum months this teacher has actually published. */
  monthsPublished: number;
  /** Months the student has actually been given — capped by what exists. */
  monthsDelivered: number;
  /** Months paid for but not yet published. */
  monthsOutstanding: number;
  /** Share of the fee attributable to one month. */
  valuePerMonth: number;
  /** Portion of the fee the platform has actually earned. */
  deliveredValue: number;
  /** Portion still owed to the student as unpublished content. */
  outstandingValue: number;
  /** Whole months since the booking started. */
  monthsElapsed: number;
  /** Whole months of access left before expiry. */
  monthsRemaining: number;
  /** Access window actually written to the row, in months. */
  actualSpanMonths: number | null;
  /** True when the stored expiry disagrees with the canonical plan length. */
  hasSpanDrift: boolean;
  driftMonths: number;
  startedAt: string;
  expiresAt: string | null;
  isExpired: boolean;
  /** 0-100: how much of the booked curriculum the student can actually reach. */
  coveragePercent: number;
}

export interface BookingIntelligenceResult {
  generatedAt: string;
  planMonths: Record<string, number>;
  totals: {
    bookings: number;
    paidBookings: number;
    students: number;
    revenue: number;
    monthsBooked: number;
    monthsDelivered: number;
    monthsOutstanding: number;
    deliveredValue: number;
    outstandingValue: number;
    coveragePercent: number;
    driftedBookings: number;
    expiringWithin30Days: number;
  };
  byPlan: Array<{
    planType: string;
    planLabel: string;
    monthsPerBooking: number;
    bookings: number;
    revenue: number;
    monthsBooked: number;
    monthsDelivered: number;
    monthsOutstanding: number;
    deliveredValue: number;
    outstandingValue: number;
    coveragePercent: number;
  }>;
  byTeacher: Array<{
    teacherId: string;
    teacherName: string;
    monthsPublished: number;
    bookings: number;
    revenue: number;
    monthsBooked: number;
    monthsOutstanding: number;
    outstandingValue: number;
    coveragePercent: number;
  }>;
  /** Bookings whose stored expiry contradicts the canonical plan length. */
  drift: Array<{
    subscriptionId: string;
    studentName: string;
    teacherName: string;
    planType: string;
    expectedMonths: number;
    actualMonths: number | null;
    driftMonths: number;
    amountPaid: number;
  }>;
  /** Largest unmet delivery obligations first. */
  topOutstanding: StudentBookingAnalysis[];
  students: StudentBookingAnalysis[];
}

const MS_PER_MONTH = 1000 * 60 * 60 * 24 * 30.44;

function wholeMonthsBetween(from: Date, to: Date): number {
  return Math.max(0, Math.floor((to.getTime() - from.getTime()) / MS_PER_MONTH));
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Counts the distinct curriculum months a teacher has published.
 *
 * Only paid courses count: the free "كورس تأسيسي" / "Introduction" courses are
 * teasers, not a month of the paid curriculum a booking entitles a student to.
 * A teacher with no paid course has published nothing, hence 0.
 */
export function countPublishedMonths(courses: BookingCourseInput[]): number {
  const months = new Set<number>();
  for (const course of courses) {
    const isRealPaidCourse = course.isPaid && (course.price ?? 0) > 0;
    if (!isRealPaidCourse) continue;
    if (course.folders.length === 0) continue;

    for (const folder of course.folders) {
      months.add(
        resolveContentMonth({
          folderMonthIndex: folder.monthIndex,
          courseTitle: course.title,
          folderName: folder.name,
        })
      );
    }
  }
  return months.size;
}

/** Reconciles one booking against what its teacher has published. */
export function analyseBooking(
  sub: BookingSubscriptionInput,
  teacher: { id: string; name: string | null },
  monthsPublished: number,
  now: Date
): StudentBookingAnalysis {
  const monthsBooked = getPlanMonths(sub.planType);
  const monthsDelivered = Math.min(monthsBooked, monthsPublished);
  const monthsOutstanding = Math.max(0, monthsBooked - monthsDelivered);

  const amountPaid = sub.amount || 0;
  const valuePerMonth = monthsBooked > 0 ? amountPaid / monthsBooked : 0;
  const deliveredValue = valuePerMonth * monthsDelivered;
  const outstandingValue = Math.max(0, amountPaid - deliveredValue);

  const actualSpanMonths = sub.expiresAt
    ? round2((sub.expiresAt.getTime() - sub.createdAt.getTime()) / MS_PER_MONTH)
    : null;

  // Stored spans are whole calendar months, so allow half a month of slack
  // before calling a row drifted (a 30-day month reads as 0.99).
  const driftMonths = actualSpanMonths === null ? 0 : round2(actualSpanMonths - monthsBooked);
  const hasSpanDrift = actualSpanMonths !== null && Math.abs(driftMonths) > 0.5;

  return {
    subscriptionId: sub.id,
    studentId: sub.studentId,
    studentName: sub.studentName || "طالب",
    studentPhone: sub.studentPhone || "—",
    educationalStage: sub.educationalStage || "—",
    teacherId: teacher.id,
    teacherName: teacher.name || "معلم",
    planType: sub.planType,
    planLabel: PLAN_LABELS_AR[sub.planType] || sub.planType,
    amountPaid: round2(amountPaid),
    monthsBooked,
    monthsPublished,
    monthsDelivered,
    monthsOutstanding,
    valuePerMonth: round2(valuePerMonth),
    deliveredValue: round2(deliveredValue),
    outstandingValue: round2(outstandingValue),
    monthsElapsed: wholeMonthsBetween(sub.createdAt, now),
    monthsRemaining: sub.expiresAt ? wholeMonthsBetween(now, sub.expiresAt) : 0,
    actualSpanMonths,
    hasSpanDrift,
    driftMonths,
    startedAt: sub.createdAt.toISOString(),
    expiresAt: sub.expiresAt ? sub.expiresAt.toISOString() : null,
    isExpired: sub.expiresAt ? sub.expiresAt.getTime() < now.getTime() : false,
    coveragePercent: monthsBooked > 0 ? Math.round((monthsDelivered / monthsBooked) * 100) : 0,
  };
}

/** Runs the full reconciliation across every teacher and their active bookings. */
export function computeBookingIntelligence(
  teachers: BookingTeacherInput[],
  now: Date = new Date()
): BookingIntelligenceResult {
  const students: StudentBookingAnalysis[] = [];
  const byTeacher: BookingIntelligenceResult["byTeacher"] = [];

  for (const teacher of teachers) {
    const monthsPublished = countPublishedMonths(teacher.courses);
    const analyses = teacher.subscriptions.map((sub) =>
      analyseBooking(sub, { id: teacher.id, name: teacher.name }, monthsPublished, now)
    );
    students.push(...analyses);

    if (analyses.length === 0) continue;

    const monthsBooked = analyses.reduce((s, a) => s + a.monthsBooked, 0);
    const monthsDelivered = analyses.reduce((s, a) => s + a.monthsDelivered, 0);

    byTeacher.push({
      teacherId: teacher.id,
      teacherName: teacher.name || "معلم",
      monthsPublished,
      bookings: analyses.length,
      revenue: round2(analyses.reduce((s, a) => s + a.amountPaid, 0)),
      monthsBooked,
      monthsOutstanding: analyses.reduce((s, a) => s + a.monthsOutstanding, 0),
      outstandingValue: round2(analyses.reduce((s, a) => s + a.outstandingValue, 0)),
      coveragePercent: monthsBooked > 0 ? Math.round((monthsDelivered / monthsBooked) * 100) : 0,
    });
  }

  const planBuckets = new Map<string, StudentBookingAnalysis[]>();
  for (const a of students) {
    if (!planBuckets.has(a.planType)) planBuckets.set(a.planType, []);
    planBuckets.get(a.planType)!.push(a);
  }

  const byPlan = Array.from(planBuckets.entries())
    .map(([planType, group]) => {
      const monthsBooked = group.reduce((s, a) => s + a.monthsBooked, 0);
      const monthsDelivered = group.reduce((s, a) => s + a.monthsDelivered, 0);
      return {
        planType,
        planLabel: PLAN_LABELS_AR[planType] || planType,
        monthsPerBooking: getPlanMonths(planType),
        bookings: group.length,
        revenue: round2(group.reduce((s, a) => s + a.amountPaid, 0)),
        monthsBooked,
        monthsDelivered,
        monthsOutstanding: group.reduce((s, a) => s + a.monthsOutstanding, 0),
        deliveredValue: round2(group.reduce((s, a) => s + a.deliveredValue, 0)),
        outstandingValue: round2(group.reduce((s, a) => s + a.outstandingValue, 0)),
        coveragePercent: monthsBooked > 0 ? Math.round((monthsDelivered / monthsBooked) * 100) : 0,
      };
    })
    .sort((a, b) => b.outstandingValue - a.outstandingValue);

  const totalMonthsBooked = students.reduce((s, a) => s + a.monthsBooked, 0);
  const totalMonthsDelivered = students.reduce((s, a) => s + a.monthsDelivered, 0);
  const uniqueStudents = new Set(students.map((a) => a.studentId).filter(Boolean));
  const thirtyDaysOut = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  return {
    generatedAt: now.toISOString(),
    planMonths: { monthly: getPlanMonths("monthly"), termly: getPlanMonths("termly"), yearly: getPlanMonths("yearly") },
    totals: {
      bookings: students.length,
      paidBookings: students.filter((a) => a.amountPaid > 0).length,
      students: uniqueStudents.size,
      revenue: round2(students.reduce((s, a) => s + a.amountPaid, 0)),
      monthsBooked: totalMonthsBooked,
      monthsDelivered: totalMonthsDelivered,
      monthsOutstanding: students.reduce((s, a) => s + a.monthsOutstanding, 0),
      deliveredValue: round2(students.reduce((s, a) => s + a.deliveredValue, 0)),
      outstandingValue: round2(students.reduce((s, a) => s + a.outstandingValue, 0)),
      coveragePercent: totalMonthsBooked > 0 ? Math.round((totalMonthsDelivered / totalMonthsBooked) * 100) : 0,
      driftedBookings: students.filter((a) => a.hasSpanDrift).length,
      expiringWithin30Days: students.filter(
        (a) => a.expiresAt && !a.isExpired && new Date(a.expiresAt) <= thirtyDaysOut
      ).length,
    },
    byPlan,
    byTeacher: byTeacher.sort((a, b) => b.outstandingValue - a.outstandingValue),
    drift: students
      .filter((a) => a.hasSpanDrift)
      .sort((a, b) => Math.abs(b.driftMonths) - Math.abs(a.driftMonths))
      .map((a) => ({
        subscriptionId: a.subscriptionId,
        studentName: a.studentName,
        teacherName: a.teacherName,
        planType: a.planType,
        expectedMonths: a.monthsBooked,
        actualMonths: a.actualSpanMonths,
        driftMonths: a.driftMonths,
        amountPaid: a.amountPaid,
      })),
    topOutstanding: [...students].sort((a, b) => b.outstandingValue - a.outstandingValue).slice(0, 20),
    students: students.sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()),
  };
}
