import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { verifyAuthoritativePrice } from "@/lib/price-verifier";
import { getCourseLanguageTrack, isSubscriptionTrackMatching } from "@/lib/course-track";
import { teacherSubscriptionCoversCourse } from "@/lib/standalone-lessons";
import { bookingCoversCourse, loadTeacherTerms, ownsActiveTerm, termForSale } from "@/lib/teacher-terms";
import { isAutoEnrollEnabled } from "@/lib/fulfillment-settings";

/**
 * "Choose your course" (/choose-course): what a student can enroll in with a
 * teacher, for THEIR grade — each booking (monthly / term / year) with its real
 * price and the exact courses it opens, plus courses sold on their own
 * (reviews, workshops, and courses not part of bookings). The student picks and
 * pays from their wallet; nothing is enrolled automatically.
 */
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "سجّل دخولك الأول" }, { status: 401 });

  const params = new URL(req.url).searchParams;
  const user = await prisma.user.findUnique({
    where: { id: session.id },
    select: { balance: true, educationalStage: true },
  });
  const grade = user?.educationalStage || null;

  const teachers = await prisma.user.findMany({
    where: {
      role: "teacher",
      isActive: true,
      isDeleted: false,
      courses: { some: { isVirtual: false, ...(grade ? { educationalStage: grade } : {}) } },
    },
    select: { id: true, name: true, teacherProfile: { select: { displayName: true } } },
    orderBy: { name: "asc" },
  });
  const teacherList = teachers.map((t) => ({ id: t.id, name: t.teacherProfile?.displayName || t.name }));

  const base = {
    balance: user?.balance ?? 0,
    grade,
    autoEnroll: await isAutoEnrollEnabled(),
    teachers: teacherList,
  };

  const teacherId = params.get("teacherId");
  if (!teacherId || !teacherList.some((t) => t.id === teacherId)) return NextResponse.json(base);

  const existing = await prisma.teacherSubscription.findMany({
    where: { studentId: session.id, teacherId },
    select: { planType: true, status: true, expiresAt: true, termNumbers: true, languageTrack: true, educationalStage: true },
  });
  const trackParam = params.get("track");
  const track =
    trackParam === "languages" || trackParam === "arabic"
      ? trackParam
      : existing.find((s) => s.languageTrack)?.languageTrack === "languages"
      ? "languages"
      : "arabic";

  const courses = await prisma.course.findMany({
    where: { teacherId, isVirtual: false, ...(grade ? { educationalStage: grade } : {}) },
    select: {
      id: true,
      title: true,
      subject: true,
      description: true,
      educationalStage: true,
      price: true,
      isPaid: true,
      deliveryMode: true,
      bookingKind: true,
      bookingTerm: true,
      enrollments: { where: { studentId: session.id }, select: { id: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  const terms = await loadTeacherTerms([teacherId]);
  const saleTerm = await termForSale(teacherId, grade);
  const now = new Date();
  const running = (plan: string) =>
    existing.find((s) => s.planType === plan && s.status === "active" && (!s.expiresAt || s.expiresAt > now)) ?? null;

  const { getEffectiveCourseTracksBatch } = await import("@/lib/course-track");
  const courseTracksMap = await getEffectiveCourseTracksBatch(courses);

  const opensFor = (planType: string, termNumbers: number[]) =>
    courses
      .filter(
        (c) =>
          teacherSubscriptionCoversCourse(c) &&
          isSubscriptionTrackMatching(track, courseTracksMap.get(c.id) || "all") &&
          bookingCoversCourse({ teacherId, planType, educationalStage: grade, termNumbers }, c, terms, now)
      )
      .map((c) => c.title);

  const { getTeacherPkgSettings, getStudentMonthProgress } = await import("@/lib/teacher-packages");
  const pkgConfig = await getTeacherPkgSettings(teacherId);

  const isEnglishTrack = track === "languages";
  const englishBookingAllowed = pkgConfig.englishBookingEnabled !== false;

  const monthlySub = existing.find((s) => s.planType === "monthly");
  const isMonthlyActive = monthlySub && monthlySub.status === "active" && (!monthlySub.expiresAt || monthlySub.expiresAt > now);
  let studentMonths = (monthlySub?.termNumbers || []).filter((n) => typeof n === "number" && n > 0);
  if (studentMonths.length === 0 && isMonthlyActive) {
    studentMonths = [1];
  }
  const monthProgress = getStudentMonthProgress(
    studentMonths,
    pkgConfig.months || [],
    pkgConfig.enforceSequentialRenewal !== false
  );

  const nextMonth = (!isEnglishTrack || englishBookingAllowed) ? monthProgress.nextEligibleMonth : null;
  const isRenewal = monthProgress.highestOwnedMonth > 0;
  const activeMonthNumber = nextMonth ? nextMonth.number : (pkgConfig.monthNumber || 1);
  const monthlyLabel = nextMonth
    ? (isRenewal ? `تجديد: ${nextMonth.name}` : nextMonth.name)
    : (pkgConfig.monthlyName || "حجز شهري");

  const termlyLabel =
    pkgConfig.termlyName ||
    (saleTerm?.termNumber === 2 ? "حجز الترم الثاني" : saleTerm?.termNumber === 1 ? "حجز الترم الأول" : "حجز ترم");
  const yearlyLabel = pkgConfig.yearlyName || "حجز سنة كاملة (من غير المراجعات والورش)";

  const plans: Array<{ planType: string; label: string; termNumber?: number | null; isRenewal?: boolean }> = [
    {
      planType: "monthly",
      label: monthlyLabel,
      termNumber: activeMonthNumber,
      isRenewal,
    },
    {
      planType: "termly",
      label: termlyLabel,
      termNumber: saleTerm ? saleTerm.termNumber : (pkgConfig.termNumber || 1),
    },
    { planType: "yearly", label: yearlyLabel },
  ];

  const bookings = await Promise.all(
    plans.map(async (p) => {
      const price = await verifyAuthoritativePrice({ amount: 999999, teacherId, planType: p.planType, grade, languageTrack: track, studentId: session.id });
      const sub = running(p.planType);
      let unavailable: string | null = null;
      if (isEnglishTrack && !englishBookingAllowed) {
        unavailable = "حجز مسار اللغات (English) غير متاح حالياً عند هذا المعلم";
      } else if (!price.valid || !price.expectedPrice) {
        unavailable = "غير متاح عند المعلم";
      } else if (p.planType === "monthly" && !nextMonth && isRenewal) {
        unavailable = "لا يوجد شهر تالٍ متاح للتجديد حالياً";
      } else if (p.planType === "monthly" && !nextMonth && !isRenewal) {
        unavailable = "الحجز الشهري غير متاح حالياً";
      } else if (p.planType === "termly" && saleTerm && saleTerm.termNumber === null) {
        unavailable = "الترم مش متاح للحجز دلوقتي";
      } else if (p.planType === "termly" && saleTerm?.termNumber && ownsActiveTerm(sub, saleTerm.termNumber, now)) {
        unavailable = "أنت مشترك فيه بالفعل";
      }
      return {
        planType: p.planType,
        label: p.label,
        price: price.expectedPrice ?? null,
        opens: opensFor(p.planType, p.termNumber ? [p.termNumber] : []),
        runningUntil: sub?.expiresAt ?? null,
        monthNumber: p.planType === "monthly" ? activeMonthNumber : undefined,
        isRenewal: p.isRenewal,
        unavailable,
      };
    })
  );

  const monthlyProgression = {
    ownedMonths: monthProgress.ownedMonths,
    highestOwnedMonth: monthProgress.highestOwnedMonth,
    nextEligibleMonth: nextMonth
      ? {
          number: nextMonth.number,
          name: nextMonth.name,
          opens: opensFor("monthly", [nextMonth.number]),
        }
      : null,
    enforceSequential: pkgConfig.enforceSequentialRenewal !== false,
    allMonths: monthProgress.monthsStatus.map((m) => {
      const isEnglishLocked = isEnglishTrack && !englishBookingAllowed;
      return {
        ...m,
        isEligible: isEnglishLocked ? false : m.isEligible,
        isLocked: isEnglishLocked ? true : m.isLocked,
        lockReason: isEnglishLocked ? "حجز مسار اللغات غير متاح حالياً عند هذا المعلم" : m.lockReason,
        opens: opensFor("monthly", [m.number]),
      };
    }),
  };

  // Courses sold on their own: reviews/workshops, or anything bookings never open.
  const standalone = courses
    .filter((c) => c.isPaid && (c.bookingKind === "extra" || c.bookingKind === "none" || !teacherSubscriptionCoversCourse(c)))
    .map((c) => ({ id: c.id, title: c.title, price: c.price ?? 0, owned: c.enrollments.length > 0 }));

  return NextResponse.json({
    ...base,
    teacherId,
    track,
    englishBookingEnabled: englishBookingAllowed,
    bookings,
    monthlyProgression,
    standalone,
  });
}
