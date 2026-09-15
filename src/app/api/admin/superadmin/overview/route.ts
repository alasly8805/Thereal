import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getExpensesFromDb, getTeacherPercentagesFromDb } from "@/lib/money-control";
import { getPlanMonths } from "@/lib/subscription-terms";
import { computeBookingIntelligence } from "@/lib/booking-intelligence";

export const dynamic = "force-dynamic";

const DEFAULT_PLAN_PRICES = { monthly: 180, termly: 750, yearly: 1200 } as const;

const STAGE_LABELS: Record<string, string> = {
  sec_1: "أولى بكالوريا",
  sec_2: "ثانية بكالوريا",
  sec_3: "ثالثة ثانوي",
};

type ProfilePricingInput = {
  slug: string;
  isPublished: boolean;
  priceMonthly: number | null;
  priceTermly: number | null;
  priceYearly: number | null;
  discountMonthly: number | null;
  discountTermly: number | null;
  discountYearly: number | null;
  stagePricing: string | null;
  enableLanguagesTrack: boolean;
  priceLanguagesMonthly: number | null;
  priceLanguagesTermly: number | null;
  priceLanguagesYearly: number | null;
} | null;

/**
 * Flatten a teacher's booking price configuration into one readable object:
 * base plan prices (falling back to platform defaults), discounts, the
 * languages-track surcharge, and any per-stage overrides.
 */
function buildPlanPricing(profile: ProfilePricingInput) {
  const pick = (v: number | null | undefined, fallback: number) =>
    typeof v === "number" && v > 0 ? v : fallback;

  const base = {
    monthly: pick(profile?.priceMonthly, DEFAULT_PLAN_PRICES.monthly),
    termly: pick(profile?.priceTermly, DEFAULT_PLAN_PRICES.termly),
    yearly: pick(profile?.priceYearly, DEFAULT_PLAN_PRICES.yearly),
  };
  const discounts = {
    monthly: profile?.discountMonthly ?? 0,
    termly: profile?.discountTermly ?? 0,
    yearly: profile?.discountYearly ?? 0,
  };
  const languagesSurcharge = {
    monthly: profile?.priceLanguagesMonthly ?? 0,
    termly: profile?.priceLanguagesTermly ?? 0,
    yearly: profile?.priceLanguagesYearly ?? 0,
  };

  const stages: Array<{
    key: string;
    label: string;
    bookingEnabled: boolean;
    monthly: number;
    termly: number;
    yearly: number;
    languagesMonthly: number;
    languagesTermly: number;
    languagesYearly: number;
  }> = [];

  if (profile?.stagePricing) {
    try {
      const parsed = JSON.parse(profile.stagePricing) as Record<string, Record<string, unknown>>;
      for (const [key, cfg] of Object.entries(parsed || {})) {
        if (!cfg || typeof cfg !== "object") continue;
        const num = (v: unknown, fallback: number) => (typeof v === "number" && v > 0 ? v : fallback);
        const numOrZero = (v: unknown, fallback: number) => (typeof v === "number" ? v : fallback);
        stages.push({
          key,
          label: STAGE_LABELS[key] ?? key,
          bookingEnabled: cfg.bookingEnabled !== false,
          monthly: num(cfg.priceMonthly, base.monthly),
          termly: num(cfg.priceTermly, base.termly),
          yearly: num(cfg.priceYearly, base.yearly),
          languagesMonthly: numOrZero(cfg.priceLanguagesMonthly, languagesSurcharge.monthly),
          languagesTermly: numOrZero(cfg.priceLanguagesTermly, languagesSurcharge.termly),
          languagesYearly: numOrZero(cfg.priceLanguagesYearly, languagesSurcharge.yearly),
        });
      }
    } catch {
      /* malformed JSON → ignore stage overrides */
    }
  }

  return {
    hasProfile: Boolean(profile),
    slug: profile?.slug ?? null,
    isPublished: profile?.isPublished ?? false,
    usesDefaults: !profile || [profile.priceMonthly, profile.priceTermly, profile.priceYearly].every((v) => !v),
    base,
    discounts,
    enableLanguagesTrack: profile?.enableLanguagesTrack ?? true,
    languagesSurcharge,
    stages,
  };
}

/** Superadmin-only: platform-wide overview stats. */
export async function GET() {
  const session = await getSession();
  if (!session || !["superadmin", "admin", "staff"].includes(session.role)) {
    return NextResponse.json({ error: "غير مصرح" }, { status: 403 });
  }

  const demoTour = session.demoTour === true;
  const studentAudience = demoTour
    ? { role: "student" as const, isDeleted: false, isDemo: true }
    : { role: "student" as const, isDeleted: false, accountMode: { not: "TESTER" as const } };
  const nestedStudent = demoTour
    ? { role: "student" as const, isDemo: true }
    : { role: "student" as const, isVirtual: false, accountMode: { not: "TESTER" as const } };
  const teacherAudience = demoTour
    ? { role: "teacher" as const, isDeleted: false, isDemo: true }
    : { role: "teacher" as const, isDeleted: false, isDemo: false };

  try {
    const [totalStudents, totalTeachers, teachers, walletDeposits, expenses, percentages, manualLogs, balanceTxs, courseExclusions] = await Promise.all([
      // Total active real students (not deleted, not QA tester)
      prisma.user.count({
        where: studentAudience,
      }),

      // Total active teachers
      prisma.user.count({ where: teacherAudience }),

      // Teachers with their courses, actual real student subscriptions, access codes, and enrollments
      prisma.user.findMany({
        where: teacherAudience,
        select: {
          id: true,
          name: true,
          email: true,
          createdAt: true,
          teacherProfile: {
            select: {
              slug: true,
              isPublished: true,
              priceMonthly: true,
              priceTermly: true,
              priceYearly: true,
              discountMonthly: true,
              discountTermly: true,
              discountYearly: true,
              stagePricing: true,
              enableLanguagesTrack: true,
              priceLanguagesMonthly: true,
              priceLanguagesTermly: true,
              priceLanguagesYearly: true,
            },
          },
          teacherSubscriptions: {
            where: {
              status: "active",
              student: nestedStudent,
            },
            select: {
              id: true,
              amount: true,
              planType: true,
              planLabel: true,
              educationalStage: true,
              languageTrack: true,
              studentName: true,
              studentPhone: true,
              paymentSource: true,
              paymentRef: true,
              createdAt: true,
              expiresAt: true,
              student: {
                select: {
                  id: true,
                  name: true,
                  phone: true,
                  email: true,
                  educationalStage: true,
                  accountMode: true,
                },
              },
            },
            orderBy: { createdAt: "desc" },
          },
          courses: {
            where: { /* all courses */ },
            select: {
              id: true,
              title: true,
              subject: true,
              isPaid: true,
              price: true,
              discountPercent: true,
              discountExpiresAt: true,
              createdAt: true,
              educationalStage: true,
              _count: {
                select: {
                  accessCodes: true,
                  enrollments: {
                    where: {
                      student: {
                        role: "student",
                        isVirtual: false,
                        accountMode: { not: "TESTER" },
                      },
                    },
                  },
                },
              },
              accessCodes: {
                where: {
                  studentId: { not: null },
                  student: nestedStudent,
                },
                select: { id: true, studentId: true, isActive: true },
              },
              enrollments: {
                where: {
                  student: nestedStudent,
                },
                select: { id: true, studentId: true, amountPaid: true },
              },
              folders: {
                select: { id: true, name: true, monthIndex: true },
              },
            },
            orderBy: { createdAt: "desc" },
          },
        },
        orderBy: { createdAt: "desc" },
      }),

      // Total completed wallet top-ups / payments through gateways (excluding testers)
      prisma.balanceTransaction.findMany({
        where: {
          amount: { gt: 0 },
          type: { in: ["credit_sha7nawy_wallet", "credit_shakeout_wallet", "credit_code", "credit_admin"] },
          user: nestedStudent,
        },
        select: { amount: true },
      }),

      // Platform Expenses
      demoTour ? Promise.resolve([]) : getExpensesFromDb(),

      // Teacher Custom Platform Percentages (default 25%)
      getTeacherPercentagesFromDb(),

      // Activity logs for manual registrations
      demoTour ? Promise.resolve([]) : prisma.activityLog.findMany({
        where: { action: "MANUAL_TEACHER_SUBSCRIPTION" },
        select: { targetId: true, adminName: true, createdAt: true },
        orderBy: { createdAt: "desc" },
      }),

      // Balance & Payment Gateway transactions
      prisma.balanceTransaction.findMany({
        where: {
          type: { in: ["credit_sha7nawy_wallet", "credit_shakeout_wallet", "credit_sha7nawy_pending", "credit_shakeout_pending", "debit_purchase"] },
          ...(demoTour ? { user: nestedStudent } : {}),
        },
        select: { userId: true, type: true, note: true, providerRef: true, createdAt: true },
        orderBy: { createdAt: "desc" },
      }),

      // Course silent exclusion records (course_excluded_<courseId>_<studentId>)
      prisma.appSetting.findMany({
        where: { key: { startsWith: "course_excluded_" } },
        select: { key: true, value: true },
      }),
    ]);

    // Set of course exclusions: "<courseId>_<studentId>"
    const excludedSet = new Set(
      (courseExclusions || [])
        .filter((e) => e.value === "true")
        .map((e) => e.key.replace("course_excluded_", ""))
    );

    // ── Live bookings (teacher subscriptions) — the headline "right now" metric ──
    const now = new Date();
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    const realStudentFilter = nestedStudent;

    const [bookingsActiveNow, bookingsAddedToday, bookingsActiveAgg] = await Promise.all([
      prisma.teacherSubscription.count({
        where: { status: "active", expiresAt: { gt: now }, student: realStudentFilter },
      }),
      prisma.teacherSubscription.count({
        where: { status: "active", createdAt: { gte: todayStart }, student: realStudentFilter },
      }),
      prisma.teacherSubscription.aggregate({
        _sum: { amount: true },
        where: { status: "active", expiresAt: { gt: now }, student: realStudentFilter },
      }),
    ]);

    // ── Access monitor: recent grants & money movements with anomaly flags ──
    const [recentEnrollments, recentSubs, recentDebits, payCodes, manualEnrollLogs] = await Promise.all([
      prisma.courseEnrollment.findMany({
        ...(demoTour ? { where: { student: nestedStudent } } : {}),
        orderBy: { createdAt: "desc" },
        take: 50,
        select: {
          id: true, createdAt: true, fulfillmentSource: true, amountPaid: true,
          student: { select: { id: true, name: true } },
          course: { select: { id: true, title: true, isPaid: true, price: true, teacherId: true, teacher: { select: { name: true } } } },
        },
      }),
      prisma.teacherSubscription.findMany({
        ...(demoTour ? { where: { student: nestedStudent } } : {}),
        orderBy: { createdAt: "desc" },
        take: 50,
        select: {
          id: true, createdAt: true, amount: true, planType: true, planLabel: true, paymentSource: true, status: true, expiresAt: true,
          student: { select: { id: true, name: true } },
          teacher: { select: { id: true, name: true } },
        },
      }),
      prisma.balanceTransaction.findMany({
        where: { type: { startsWith: "debit" } },
        orderBy: { createdAt: "desc" },
        take: 50,
        select: { id: true, createdAt: true, type: true, amount: true, note: true, user: { select: { id: true, name: true } } },
      }),
      prisma.accessCode.findMany({
        where: { code: { startsWith: "PAY-" }, isActive: true },
        select: { studentId: true, courseId: true },
      }),
      prisma.activityLog.findMany({
        where: { action: "SUPERADMIN_MANUAL_ENROLL" },
        select: { targetId: true, targetName: true, createdAt: true },
      }),
    ]);

    // studentId:teacherId pairs with an active subscription record (panel-trusted)
    const subbedPairs = new Set<string>();
    for (const t of teachers) {
      for (const s of t.teacherSubscriptions || []) {
        if (s.student?.id) subbedPairs.add(`${s.student.id}:${t.id}`);
      }
    }
    const payCodePairs = new Set(payCodes.map((p) => `${p.studentId}:${p.courseId}`));
    const manualLogSet = new Set(
      manualEnrollLogs.map((l) => `${l.targetId}:${(l.targetName || "").replace(/^تسجيل الطالب:\s*/, "").split(" في كورس:")[0].trim()}`)
    );

    type MonitorEvent = {
      kind: "subscription" | "enrollment" | "debit";
      id: string;
      studentName: string;
      target: string;
      amount: number;
      source: string;
      createdAt: string;
      severity: "ok" | "warn" | "alert";
      reason: string;
    };

    const monitorEvents: MonitorEvent[] = [];

    for (const s of recentSubs) {
      const zero = (s.amount || 0) === 0;
      monitorEvents.push({
        kind: "subscription",
        id: s.id,
        studentName: s.student?.name || "—",
        target: `${s.teacher?.name || "—"} · ${s.planLabel || s.planType}`,
        amount: s.amount || 0,
        source: s.paymentSource || "MANUAL",
        createdAt: s.createdAt.toISOString(),
        severity: zero ? "warn" : "ok",
        reason: zero ? "اشتراك بقيمة صفر — يحتاج مراجعة" : "حجز موثّق",
      });
    }

    for (const e of recentEnrollments) {
      const sId = e.student?.id || "";
      const hasPanelLog = manualLogSet.has(`${e.course.id}:${(e.student?.name || "").trim()}`);
      const hasSub = subbedPairs.has(`${sId}:${e.course.teacherId}`);
      const hasPayCode = payCodePairs.has(`${sId}:${e.course.id}`);
      const trusted = hasPanelLog || hasSub || hasPayCode || e.fulfillmentSource === "TESTER_BYPASS";
      const via = hasPanelLog ? "تسجيل لوحة المشرف (موثّق)" : hasSub ? "مغطى باشتراك المعلم" : hasPayCode ? "شراء إلكتروني (PAY)" : e.fulfillmentSource === "TESTER_BYPASS" ? "حساب فحص" : null;
      monitorEvents.push({
        kind: "enrollment",
        id: e.id,
        studentName: e.student?.name || "—",
        target: `${e.course.title} · ${e.course.teacher?.name || ""}`,
        amount: e.amountPaid || 0,
        source: e.fulfillmentSource,
        createdAt: e.createdAt.toISOString(),
        severity: trusted ? "ok" : "alert",
        reason: trusted ? (via || "موثّق") : "تسجيل بدون دفع وبدون سجل لوحة — أنومالي!",
      });
    }

    for (const d of recentDebits) {
      monitorEvents.push({
        kind: "debit",
        id: d.id,
        studentName: d.user?.name || "—",
        target: d.note || d.type,
        amount: d.amount,
        source: d.type,
        createdAt: d.createdAt.toISOString(),
        severity: "ok",
        reason: "حركة مالية",
      });
    }

    monitorEvents.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    const accessMonitor = monitorEvents.slice(0, 40);
    const accessMonitorAlertCount = monitorEvents.filter((e) => e.severity !== "ok").length;

    // Shape the data: compute per-course and per-teacher real reservations & revenue (excluding QA Testers)
    // Intelligent deduplication: If a student paid for a teacher subscription (e.g. monthly package),
    // their enrollment in that teacher's course(s) is covered by the subscription and is NOT double-counted.
    const teachersWithStats = teachers.map((t) => {
      const activeSubs = t.teacherSubscriptions || [];
      const paidSubs = activeSubs.filter((s) => (s.amount || 0) > 0);
      const freeSubs = activeSubs.filter((s) => (s.amount || 0) === 0);
      const realReservationsCount = activeSubs.length;
      const realPaidReservationsCount = paidSubs.length;
      const realFreeReservationsCount = freeSubs.length;
      const realReservationsRevenue = paidSubs.reduce((sum, s) => sum + (s.amount || 0), 0);

      // Track subscriptions per student for this teacher to prevent double counting
      // One course slot per booked month (monthly 1 / termly 4 / yearly 8).
      const studentSubsMap = new Map<string, Array<{ id: string; amount: number; planType: string; remainingSlots: number }>>();
      for (const sub of paidSubs) {
        const sId = sub.student?.id;
        if (!sId) continue;
        if (!studentSubsMap.has(sId)) studentSubsMap.set(sId, []);
        const slots = getPlanMonths(sub.planType);
        studentSubsMap.get(sId)!.push({
          id: sub.id,
          amount: sub.amount || 0,
          planType: sub.planType,
          remainingSlots: slots,
        });
      }

      // Track unique paid students across this teacher
      const uniquePaidStudentIds = new Set<string>();
      paidSubs.forEach((s) => s.student?.id && uniquePaidStudentIds.add(s.student.id));

      const courseStats = t.courses.map((c) => {
        const totalCodes = c._count?.accessCodes || c.accessCodes.length;
        const usedCodes = c.accessCodes.length;
        const availableCodes = Math.max(0, totalCodes - usedCodes);
        const directEnrollments = (c.enrollments || []).length;

        // Unique enrolled students in this course (strictly real students, excluding teachers and preview)
        const codeStudents = (c.accessCodes || []).filter((ac) => !!ac.studentId && ac.studentId !== t.id);
        const studentEnrollments = (c.enrollments || []).filter((e) => !!e.studentId && e.studentId !== t.id);

        const enrolledStudentIds = new Set<string>();
        codeStudents.forEach((ac) => ac.studentId && enrolledStudentIds.add(ac.studentId));
        studentEnrollments.forEach((e) => e.studentId && enrolledStudentIds.add(e.studentId));

        // Filter out students who were signed out / excluded by superadmin
        for (const sId of Array.from(enrolledStudentIds)) {
          if (excludedSet.has(`${c.id}_${sId}`)) {
            enrolledStudentIds.delete(sId);
          }
        }

        const totalEnrolled = enrolledStudentIds.size;

        const isCourseActuallyPaid = Boolean(c.isPaid && c.price && c.price > 0);
        let courseCalculatedRevenue = 0;
        let coursePaidStudentsCount = 0;
        let courseCoveredBySubCount = 0;

        if (isCourseActuallyPaid) {
          for (const studentId of enrolledStudentIds) {
            const subs = studentSubsMap.get(studentId);
            const availableSub = subs?.find((s) => s.remainingSlots > 0);

            if (availableSub) {
              // Covered by the student's monthly/term package: DO NOT count course price again!
              availableSub.remainingSlots -= 1;
              courseCoveredBySubCount += 1;
            } else {
              // Separate/independent course purchase beyond subscription:
              const directEnrollment = studentEnrollments.find((e) => e.studentId === studentId);
              const directAmt = directEnrollment?.amountPaid;
              const effectivePrice = (directAmt !== undefined && directAmt > 0) ? directAmt : (c.price || 0);

              courseCalculatedRevenue += effectivePrice;
              coursePaidStudentsCount += 1;
              uniquePaidStudentIds.add(studentId);
            }
          }
        }

        const paidStudents = isCourseActuallyPaid ? (coursePaidStudentsCount + courseCoveredBySubCount) : 0;
        const freeStudents = !isCourseActuallyPaid ? totalEnrolled : 0;

        return {
          id: c.id,
          title: c.title,
          subject: c.subject,
          educationalStage: c.educationalStage,
          isPaid: isCourseActuallyPaid,
          price: isCourseActuallyPaid ? (c.price ?? 0) : 0,
          discountPercent: c.discountPercent ?? null,
          createdAt: c.createdAt.toISOString(),
          totalCodes,
          usedCodes,
          availableCodes,
          directEnrollments,
          enrolledStudents: totalEnrolled,
          paidStudents,
          coursePaidStudentsCount,
          courseCoveredBySubCount,
          freeStudents,
          revenue: courseCalculatedRevenue,
        };
      });

      const totalTeacherCourses = courseStats.length;
      const totalTeacherCodes = courseStats.reduce((s, c) => s + c.totalCodes, 0);
      const totalTeacherUsedCodes = courseStats.reduce((s, c) => s + c.usedCodes, 0);
      const totalTeacherAvailableCodes = courseStats.reduce((s, c) => s + c.availableCodes, 0);
      const courseEnrolledStudents = courseStats.reduce((s, c) => s + c.enrolledStudents, 0);
      const coursesRevenue = courseStats.reduce((s, c) => s + c.revenue, 0);

      // Strictly Deduplicated Total Real Money Paid to this Teacher
      const totalTeacherRevenue = realReservationsRevenue + coursesRevenue;
      const totalPaidStudents = uniquePaidStudentIds.size;
      const totalFreeStudents = realFreeReservationsCount;

      // Platform share & Teacher share calculation (default 25% or custom)
      const platformPercentage = percentages.custom[t.id] !== undefined ? percentages.custom[t.id] : percentages.defaultPct;
      const platformShare = (totalTeacherRevenue * platformPercentage) / 100;
      const teacherShare = totalTeacherRevenue - platformShare;

      return {
        id: t.id,
        name: t.name,
        email: t.email,
        createdAt: t.createdAt,
        totalCourses: totalTeacherCourses,
        totalCodes: totalTeacherCodes,
        usedCodes: totalTeacherUsedCodes,
        availableCodes: totalTeacherAvailableCodes,
        courseEnrolledStudents,
        realReservationsCount,
        realPaidReservationsCount,
        realFreeReservationsCount,
        realReservationsRevenue,
        totalPaidStudents,
        totalFreeStudents,
        coursesRevenue,
        totalRevenue: totalTeacherRevenue,
        platformPercentage,
        platformShare,
        teacherShare,
        planPricing: buildPlanPricing(t.teacherProfile),
        subscriptions: activeSubs.map((s) => {
          const studentId = s.student?.id;
          const manualLog = manualLogs.find(
            (l) => l.targetId === studentId && Math.abs(new Date(l.createdAt).getTime() - new Date(s.createdAt).getTime()) < 180000
          ) || manualLogs.find((l) => l.targetId === studentId);

          const studentTx = balanceTxs.find(
            (t) => t.userId === studentId && (t.note?.includes(s.planType) || t.note?.includes("teacher_sub") || Math.abs(new Date(t.createdAt).getTime() - new Date(s.createdAt).getTime()) < 86400000 * 3)
          );

          const isDirectGatewayPaid = s.paymentSource === "PAYMENT_GATEWAY" || (studentTx && (studentTx.type === "credit_sha7nawy_wallet" || studentTx.type === "credit_shakeout_wallet"));
          const isWalletPaid = s.paymentSource === "WALLET" || (studentTx && studentTx.type === "debit_purchase");
          const isTesterBypass = s.paymentSource === "TESTER_BYPASS" || (s.amount === 0 && !manualLog);

          let resolvedSource = "MANUAL";
          if (isDirectGatewayPaid) resolvedSource = "PAYMENT_GATEWAY";
          else if (isWalletPaid) resolvedSource = "WALLET";
          else if (isTesterBypass) resolvedSource = "TESTER_BYPASS";
          else resolvedSource = "MANUAL";

          let gatewayRef = s.paymentRef || studentTx?.providerRef || null;
          let gatewayProvider = "";
          if (studentTx?.type?.includes("sha7nawy") || studentTx?.note?.includes("sha7nawy")) gatewayProvider = "Sha7nawy";
          else if (studentTx?.type?.includes("shakeout") || studentTx?.note?.includes("shakeout")) gatewayProvider = "Shake-Out";
          else if (studentTx?.type?.includes("fawry")) gatewayProvider = "Fawry";

          if (!gatewayRef && studentTx?.note) {
            const matchSha7nawy = studentTx.note.match(/sha7nawy_ref:(SH-[0-9]+)/);
            const matchShakeout = studentTx.note.match(/shakeout_ref:([A-Za-z0-9_\/]+)/);
            if (matchSha7nawy) gatewayRef = matchSha7nawy[1];
            else if (matchShakeout) gatewayRef = matchShakeout[1];
          }

          const registeredByName = manualLog?.adminName || t.name;

          return {
            id: s.id,
            studentName: s.studentName || s.student?.name || "طالب",
            studentPhone: s.studentPhone || s.student?.phone || "—",
            planType: s.planType,
            planLabel: s.planLabel || "اشتراك معلم",
            amount: s.amount || 0,
            isPaid: (s.amount || 0) > 0,
            educationalStage: s.educationalStage || s.student?.educationalStage || "—",
            languageTrack: s.languageTrack || "arabic",
            paymentSource: resolvedSource,
            paymentRef: gatewayRef,
            gatewayProvider: gatewayProvider || null,
            hasGatewayAttempt: Boolean(studentTx && (studentTx.type.includes("pending") || studentTx.type.includes("wallet"))),
            registeredBy: registeredByName,
            createdAt: s.createdAt.toISOString(),
          };
        }),
        courses: courseStats,
      };
    });

    // Platform-wide totals & Money Control Summary
    const totalCourses = teachersWithStats.reduce((s, t) => s + t.totalCourses, 0);
    const totalRealReservations = teachersWithStats.reduce((s, t) => s + t.realReservationsCount, 0);
    const totalRealPaidReservations = teachersWithStats.reduce((s, t) => s + t.realPaidReservationsCount, 0);
    const totalCodesBooked = teachersWithStats.reduce((s, t) => s + t.totalCodes, 0);
    const totalCodesUsed = teachersWithStats.reduce((s, t) => s + t.usedCodes, 0);

    // Standalone single lessons and teaser courses to exclude from real curriculum metrics
    const STANDALONE_COURSE_IDS = new Set([
      "cmtqbw41d005qqwobfcrfg07c", // Abdelbaset Arabic Lesson 1
      "cmtr54unr00wfqwwvtbvaxy8q", // Abdelbaset Lang Lesson 1
      "cmta9me5r0007qxmwnnsq1cez", // Youssef Lang Lesson 1
      "cmt45qxsf001oqx3e9jtlwny8", // Youssef Arabic Lesson 1
      "cm6p4o8020003l8084z6rwe5g", // Foundation course (intro)
      "cmtwyq8y60001l704a2qhh2s0", // Introduction course (intro)
    ]);

    // Strictly deduplicated unique student IDs in real paid courses (bookings EXCLUDED)
    const platformUniquePaidStudents = new Set<string>();
    const realCourseIds: string[] = [];
    let totalCourseEnrollmentsCount = 0;

    teachers.forEach((t) => {
      t.courses.forEach((c) => {
        if (c.isPaid && c.price && c.price > 0 && !STANDALONE_COURSE_IDS.has(c.id)) {
          realCourseIds.push(c.id);
          totalCourseEnrollmentsCount += (c.enrollments || []).length;
          c.enrollments.forEach((e) => {
            if (e.studentId) platformUniquePaidStudents.add(e.studentId);
          });
        }
      });
    });

    // Count students who are actively consuming real course content (watched > 10s or finished)
    const activeProgressWatchers = await prisma.progress.findMany({
      where: {
        video: { folder: { courseId: { in: realCourseIds } } },
        OR: [
          { watched: true },
          { watchedSecondsTotal: { gt: 10 } },
          { lastPositionSeconds: { gt: 10 } },
        ],
      },
      select: { studentId: true },
      distinct: ["studentId"],
    });

    const totalPaidStudentsAcrossPlatform = platformUniquePaidStudents.size;
    const totalActiveContentConsumers = activeProgressWatchers.length;
    const teachersEarnedRevenue = teachersWithStats.reduce((s, t) => s + t.totalRevenue, 0);
    const totalPlatformShare = teachersWithStats.reduce((s, t) => s + t.platformShare, 0);
    const totalTeachersShare = teachersWithStats.reduce((s, t) => s + t.teacherShare, 0);
    const totalExpenses = expenses.reduce((s, e) => s + (e.amount || 0), 0);
    const netPlatformProfit = totalPlatformShare - totalExpenses;
    const totalGatewayDeposits = walletDeposits.reduce((s, d) => s + d.amount, 0);
    const totalRevenue = Math.max(teachersEarnedRevenue, totalGatewayDeposits);

    // Flat pricing table across all teachers (rendered at the bottom of the overview)
    const coursesPricing = teachersWithStats.flatMap((t) =>
      t.courses.map((c) => ({
        id: c.id,
        title: c.title,
        subject: c.subject,
        teacherName: t.name,
        isPaid: c.isPaid,
        price: c.price,
        discountPercent: c.discountPercent,
        enrolledStudents: c.enrolledStudents,
        paidStudents: c.paidStudents,
        coursePaidStudentsCount: c.coursePaidStudentsCount,
        courseCoveredBySubCount: c.courseCoveredBySubCount,
        freeStudents: c.freeStudents,
        revenue: c.revenue,
        usedCodes: c.usedCodes,
        createdAt: c.createdAt,
      }))
    );

    // Booking intelligence: what each student paid for in months, versus how many
    // curriculum months their teacher has actually published. The difference is
    // content the platform still owes, and the money attached to it is not yet earned.
    const bookingIntelligence = computeBookingIntelligence(
      teachers.map((t) => ({
        id: t.id,
        name: t.name,
        subscriptions: (t.teacherSubscriptions || []).map((s) => ({
          id: s.id,
          studentId: s.student?.id ?? null,
          studentName: s.studentName || s.student?.name || null,
          studentPhone: s.studentPhone || s.student?.phone || null,
          educationalStage: s.educationalStage || s.student?.educationalStage || null,
          planType: s.planType,
          amount: s.amount || 0,
          createdAt: s.createdAt,
          expiresAt: s.expiresAt,
        })),
        courses: (t.courses || []).map((c) => ({
          id: c.id,
          title: c.title,
          isPaid: c.isPaid,
          price: c.price,
          folders: c.folders || [],
        })),
      })),
      now
    );

    return NextResponse.json({
      totalStudents,
      totalTeachers,
      totalCourses,
      totalRealReservations,
      totalRealPaidReservations,
      totalPaidStudentsAcrossPlatform,
      totalCourseEnrollmentsCount,
      totalActiveContentConsumers,
      bookings: {
        activeNow: bookingsActiveNow,
        addedToday: bookingsAddedToday,
        revenueActive: bookingsActiveAgg._sum.amount || 0,
        generatedAt: now.toISOString(),
      },
      bookingIntelligence,
      coursesPricing,
      accessMonitor,
      accessMonitorAlertCount,
      totalCodesBooked,
      totalCodesUsed,
      teachersEarnedRevenue,
      totalGatewayDeposits,
      totalRevenue,
      moneyControl: {
        defaultPercentage: percentages.defaultPct,
        teacherPercentages: percentages.custom,
        totalGrossRevenue: teachersEarnedRevenue,
        totalPlatformShare,
        totalTeachersShare,
        totalExpenses,
        netPlatformProfit,
        expensesCount: expenses.length,
      },
      teachers: teachersWithStats,
    });
  } catch (error) {
    console.error("[superadmin/overview] error:", error);
    return NextResponse.json({ error: "حدث خطأ داخلي" }, { status: 500 });
  }
}







