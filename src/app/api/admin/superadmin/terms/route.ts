import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { BOOKING_KINDS, TERM_NUMBERS, bookingCoversCourse, loadTeacherTerms } from "@/lib/teacher-terms";
import { AUTO_ENROLL_SETTING_KEY, isAutoEnrollEnabled } from "@/lib/fulfillment-settings";

/**
 * Owner-only "Terms & Bookings" control page.
 *
 * Everything here is manual: placing courses into terms, setting term end
 * dates, switching a term on sale, applying an end date to existing bookings,
 * editing a single booking, and the auto-enroll-after-payment switch. Nothing
 * runs on a schedule and no date change touches bookings unless the owner
 * presses "apply".
 */
async function requireOwner() {
  const session = await getSession();
  if (!session || session.role !== "superadmin") {
    return NextResponse.json({ error: "غير مصرح" }, { status: 403 });
  }
  return null;
}

function activeBookingsWhere(teacherId: string) {
  return {
    teacherId,
    status: "active",
    OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    student: { accountMode: { not: "TESTER" } },
  };
}

/** Term bookings bought for exactly this term (older bookings with no term recorded count as term 1). */
function termBookingWhere(teacherId: string, stage: string, term: number) {
  return {
    ...activeBookingsWhere(teacherId),
    planType: "termly",
    educationalStage: stage,
    AND: [
      {
        OR: [
          { termNumbers: { equals: [term] } },
          ...(term === 1 ? [{ termNumbers: { isEmpty: true } }] : []),
        ],
      },
    ],
  };
}

async function teacherState(teacherId: string) {
  const { getTeacherPkgSettings } = await import("@/lib/teacher-packages");
  const { getEffectiveCourseTracksBatch } = await import("@/lib/course-track");
  const [courses, terms, bookings, pkgConfig] = await Promise.all([
    prisma.course.findMany({
      where: { teacherId, isVirtual: false },
      select: {
        id: true,
        title: true,
        educationalStage: true,
        price: true,
        isPaid: true,
        bookingKind: true,
        bookingTerm: true,
        _count: { select: { enrollments: true } },
      },
      orderBy: [{ educationalStage: "asc" }, { createdAt: "asc" }],
    }),
    prisma.teacherTerm.findMany({
      where: { teacherId },
      select: { educationalStage: true, termNumber: true, endsAt: true, onSale: true },
    }),
    prisma.teacherSubscription.findMany({
      where: { teacherId, student: { accountMode: { not: "TESTER" } } },
      select: {
        id: true,
        studentId: true,
        studentName: true,
        studentPhone: true,
        parentPhone: true,
        planType: true,
        planLabel: true,
        educationalStage: true,
        languageTrack: true,
        termNumbers: true,
        amount: true,
        paymentSource: true,
        status: true,
        expiresAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
    }),
    getTeacherPkgSettings(teacherId),
  ]);
  const trackMap = await getEffectiveCourseTracksBatch(courses);
  const coursesWithTrack = courses.map((c) => ({
    ...c,
    languageTrack: trackMap.get(c.id) || "all",
  }));
  return { courses: coursesWithTrack, terms, bookings, pkgConfig };
}

export async function GET(req: NextRequest) {
  const denied = await requireOwner();
  if (denied) return denied;

  const searchParams = new URL(req.url).searchParams;
  const teacherId = searchParams.get("teacherId");
  const autoEnroll = await isAutoEnrollEnabled();

  if (!teacherId) {
    const teachers = await prisma.user.findMany({
      where: { role: "teacher", isDeleted: false },
      select: {
        id: true,
        name: true,
        teacherProfile: { select: { displayName: true } },
        _count: { select: { teacherSubscriptions: true } },
      },
      orderBy: { name: "asc" },
    });
    return NextResponse.json({
      autoEnroll,
      teachers: teachers.map((t) => ({
        id: t.id,
        name: t.teacherProfile?.displayName || t.name,
        bookings: t._count.teacherSubscriptions,
      })),
    });
  }

  const compare = searchParams.get("compare");
  const course1 = searchParams.get("course1");
  const course2 = searchParams.get("course2");
  if (compare === "1" && course1 && course2) {
    try {
      const { compareTeacherCourses } = await import("@/lib/teacher-packages");
      const comparison = await compareTeacherCourses(teacherId, course1, course2);
      return NextResponse.json({ ok: true, comparison });
    } catch (err: any) {
      return NextResponse.json({ error: err.message || "تعذر إجراء المقارنة" }, { status: 400 });
    }
  }

  return NextResponse.json({ autoEnroll, ...(await teacherState(teacherId)) });
}

type CourseChange = {
  id: string;
  bookingKind: string | null;
  bookingTerm: number | null;
  languageTrack?: "languages" | "arabic" | "all";
};
type TermChange = { educationalStage: string; termNumber: number; endsAt: string | null; onSale: boolean };

function parseDate(v: unknown): Date | null {
  if (!v || typeof v !== "string") return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

function determineCourseTerm(bookingKind: string | null | undefined, explicitTerm: unknown): number | null {
  const num = Number(explicitTerm);
  if (num === 1 || num === 2) return num;
  if (!bookingKind) return null;
  const monthMatch = bookingKind.match(/month:(\d+)/);
  if (monthMatch) {
    const m = Number(monthMatch[1]);
    return m >= 5 ? 2 : 1;
  }
  const termMatch = bookingKind.match(/term:([12])/);
  if (termMatch) return Number(termMatch[1]);
  if (bookingKind === "month") return 1;
  if (bookingKind === "term") return num === 2 ? 2 : 1;
  return null;
}

/**
 * Saves course placements and term settings for one teacher. With
 * { preview: true } nothing is written and the response lists, per course, how
 * many students with a running booking would lose access.
 */
export async function PUT(req: NextRequest) {
  const denied = await requireOwner();
  if (denied) return denied;

  const teacherId = new URL(req.url).searchParams.get("teacherId");
  const body = await req.json().catch(() => null);
  if (!teacherId || !body) return NextResponse.json({ error: "طلب غير صالح" }, { status: 400 });

  const courseChanges: CourseChange[] = Array.isArray(body.courses) ? body.courses : [];
  const termChanges: TermChange[] = Array.isArray(body.terms) ? body.terms : [];

  for (const c of courseChanges) {
    if (typeof c?.id !== "string") return NextResponse.json({ error: "كورس غير صالح" }, { status: 400 });
    if (c.bookingKind !== null && c.bookingKind !== "") {
      const tokens = String(c.bookingKind).split(",").map((s) => s.trim()).filter(Boolean);
      const allValid = tokens.every((token) => {
        if (token === "extra" || token === "none" || token === "month" || token === "term" || token === "year" || token === "yearly") return true;
        if (token.startsWith("month:") || token.startsWith("term:")) {
          const t = Number(token.split(":")[1]);
          return t >= 1;
        }
        return false;
      });
      if (!allValid) {
        return NextResponse.json({ error: "نوع حجز غير صالح" }, { status: 400 });
      }
    }
  }
  for (const t of termChanges) {
    if (typeof t?.educationalStage !== "string" || !(TERM_NUMBERS as readonly number[]).includes(Number(t.termNumber))) {
      return NextResponse.json({ error: "بيانات الترم غير صالحة" }, { status: 400 });
    }
  }

  const owned = await prisma.course.findMany({
    where: { teacherId, id: { in: courseChanges.map((c) => c.id) } },
    select: { id: true, title: true, educationalStage: true, bookingKind: true, bookingTerm: true },
  });
  if (owned.length !== new Set(courseChanges.map((c) => c.id)).size) {
    return NextResponse.json({ error: "بعض الكورسات لا تخص هذا المعلم" }, { status: 400 });
  }

  // Track is ignored here, so this can only over-warn.
  const subs = await prisma.teacherSubscription.findMany({
    where: activeBookingsWhere(teacherId),
    select: { teacherId: true, planType: true, educationalStage: true, termNumbers: true },
  });
  const terms = await loadTeacherTerms([teacherId]);
  const losses: { courseId: string; title: string; students: number }[] = [];
  for (const course of owned) {
    const change = courseChanges.find((c) => c.id === course.id)!;
    const determinedTerm = determineCourseTerm(change.bookingKind, change.bookingTerm);
    const next = {
      ...course,
      bookingKind: change.bookingKind || null,
      bookingTerm: determinedTerm,
    };
    if (next.bookingKind === course.bookingKind && next.bookingTerm === course.bookingTerm) continue;
    const lost = subs.filter((s) => bookingCoversCourse(s, course, terms) && !bookingCoversCourse(s, next, terms)).length;
    if (lost > 0) losses.push({ courseId: course.id, title: course.title, students: lost });
  }

  if (body.preview) return NextResponse.json({ losses });

  const trackUpserts = courseChanges
    .filter((c) => c.languageTrack === "languages" || c.languageTrack === "arabic" || c.languageTrack === "all")
    .map((c) =>
      prisma.appSetting.upsert({
        where: { key: `course_track_${c.id}` },
        create: { key: `course_track_${c.id}`, value: c.languageTrack! },
        update: { value: c.languageTrack! },
      })
    );

  await prisma.$transaction([
    ...courseChanges.map((c) =>
      prisma.course.update({
        where: { id: c.id },
        data: {
          bookingKind: c.bookingKind || null,
          bookingTerm: determineCourseTerm(c.bookingKind, c.bookingTerm),
        },
      })
    ),
    ...termChanges.map((t) =>
      prisma.teacherTerm.upsert({
        where: {
          teacherId_educationalStage_termNumber: {
            teacherId,
            educationalStage: t.educationalStage,
            termNumber: Number(t.termNumber),
          },
        },
        create: {
          teacherId,
          educationalStage: t.educationalStage,
          termNumber: Number(t.termNumber),
          endsAt: parseDate(t.endsAt),
          onSale: Boolean(t.onSale),
        },
        update: { endsAt: parseDate(t.endsAt), onSale: Boolean(t.onSale) },
      })
    ),
    ...trackUpserts,
  ]);

  return NextResponse.json({ ok: true, losses, autoEnroll: await isAutoEnrollEnabled(), ...(await teacherState(teacherId)) });
}

/**
 * Manual one-off actions:
 *  - applyEndDate  { educationalStage, termNumber, preview? } — set the term's end date on its running term bookings
 *  - updateBooking { bookingId, termNumbers?, expiresAt?, status? } — edit one booking by hand
 *  - setAutoEnroll { enabled } — activate purchases automatically after an online payment, or not
 */
export async function POST(req: NextRequest) {
  const denied = await requireOwner();
  if (denied) return denied;

  const teacherId = new URL(req.url).searchParams.get("teacherId");
  const body = await req.json().catch(() => null);
  if (!body?.action) return NextResponse.json({ error: "طلب غير صالح" }, { status: 400 });

  if (body.action === "setAutoEnroll") {
    await prisma.appSetting.upsert({
      where: { key: AUTO_ENROLL_SETTING_KEY },
      create: { key: AUTO_ENROLL_SETTING_KEY, value: body.enabled ? "true" : "false" },
      update: { value: body.enabled ? "true" : "false" },
    });
    return NextResponse.json({ ok: true, autoEnroll: Boolean(body.enabled) });
  }

  if (!teacherId) return NextResponse.json({ error: "اختر المعلم" }, { status: 400 });

  if (body.action === "applyEndDate") {
    const stage = String(body.educationalStage || "");
    const term = Number(body.termNumber);
    const row = await prisma.teacherTerm.findUnique({
      where: { teacherId_educationalStage_termNumber: { teacherId, educationalStage: stage, termNumber: term } },
      select: { endsAt: true },
    });
    if (!row?.endsAt) return NextResponse.json({ error: "احفظ تاريخ نهاية الترم الأول" }, { status: 400 });

    const where = termBookingWhere(teacherId, stage, term);
    const [total, shortened] = await Promise.all([
      prisma.teacherSubscription.count({ where }),
      prisma.teacherSubscription.count({ where: { ...where, expiresAt: { gt: row.endsAt } } }),
    ]);
    if (body.preview) return NextResponse.json({ total, shortened, endsAt: row.endsAt });

    const res = await prisma.teacherSubscription.updateMany({ where, data: { expiresAt: row.endsAt } });
    return NextResponse.json({ ok: true, updated: res.count, ...(await teacherState(teacherId)) });
  }

  if (body.action === "updateBooking") {
    const booking = await prisma.teacherSubscription.findFirst({
      where: { id: String(body.bookingId || ""), teacherId },
      select: { id: true },
    });
    if (!booking) return NextResponse.json({ error: "الحجز غير موجود" }, { status: 404 });

    const data: { termNumbers?: number[]; expiresAt?: Date | null; status?: string } = {};
    if (Array.isArray(body.termNumbers)) {
      const nums = [...new Set<number>((body.termNumbers as unknown[]).map(Number))]
        .filter((n) => n >= 1)
        .sort((a, b) => a - b);
      data.termNumbers = nums;
    }
    if ("expiresAt" in body) data.expiresAt = parseDate(body.expiresAt);
    if (body.status === "active" || body.status === "cancelled") data.status = body.status;

    await prisma.teacherSubscription.update({ where: { id: booking.id }, data });
    return NextResponse.json({ ok: true, ...(await teacherState(teacherId)) });
  }

  if (body.action === "savePackageConfig") {
    const { saveTeacherPkgSettings } = await import("@/lib/teacher-packages");
    const updated = await saveTeacherPkgSettings(teacherId, {
      monthlyName: body.monthlyName,
      monthNumber: typeof body.monthNumber === "number" ? body.monthNumber : undefined,
      termlyName: body.termlyName,
      termNumber: typeof body.termNumber === "number" ? body.termNumber : undefined,
      yearlyName: body.yearlyName,
      popupEnabled: typeof body.popupEnabled === "boolean" ? body.popupEnabled : undefined,
      months: Array.isArray(body.months) ? body.months : undefined,
      enforceSequentialRenewal: typeof body.enforceSequentialRenewal === "boolean" ? body.enforceSequentialRenewal : undefined,
      englishBookingEnabled: typeof body.englishBookingEnabled === "boolean" ? body.englishBookingEnabled : undefined,
    });
    return NextResponse.json({ ok: true, pkgConfig: updated, ...(await teacherState(teacherId)) });
  }

  if (body.action === "configureNewCoursePopup") {
    const { broadcastNewCourseNotification } = await import("@/lib/teacher-packages");
    const result = await broadcastNewCourseNotification({
      teacherId,
      courseId: String(body.courseId || ""),
      customTitle: body.customTitle,
      customMessage: body.customMessage,
      targetPlan: body.targetPlan || "all",
      actionType: body.actionType || "both",
      renewalButtonText: body.renewalButtonText,
    });
    return NextResponse.json({ ok: true, ...result, ...(await teacherState(teacherId)) });
  }

  if (body.action === "togglePopup") {
    const { saveTeacherPkgSettings } = await import("@/lib/teacher-packages");
    const updated = await saveTeacherPkgSettings(teacherId, {
      popupEnabled: Boolean(body.enabled),
    });
    return NextResponse.json({ ok: true, pkgConfig: updated, ...(await teacherState(teacherId)) });
  }

  if (body.action === "autoEnrollSubscribers") {
    const { autoEnrollEligibleSubscribers } = await import("@/lib/teacher-packages");
    const result = await autoEnrollEligibleSubscribers({
      teacherId,
      courseId: String(body.courseId || ""),
      targetPlan: body.targetPlan,
    });
    return NextResponse.json({ ok: true, newlyEnrolledCount: result.newlyEnrolledCount, ...(await teacherState(teacherId)) });
  }

  if (body.action === "compareCourses") {
    const { compareTeacherCourses } = await import("@/lib/teacher-packages");
    const course1 = String(body.course1Id || "");
    const course2 = String(body.course2Id || "");
    if (!course1 || !course2) return NextResponse.json({ error: "اختر كورسين للمقارنة" }, { status: 400 });
    const comparison = await compareTeacherCourses(teacherId, course1, course2);
    return NextResponse.json({ ok: true, comparison });
  }

  return NextResponse.json({ error: "إجراء غير معروف" }, { status: 400 });
}
