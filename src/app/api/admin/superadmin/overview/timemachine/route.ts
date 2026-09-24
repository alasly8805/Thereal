import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getExpensesFromDb, getTeacherPercentagesFromDb } from "@/lib/money-control";
import type { OverviewKpis } from "@/components/admin/superadmin/overview/types";

export const dynamic = "force-dynamic";

const STANDALONE_COURSE_IDS = new Set([
  "cmtqbw41d005qqwobfcrfg07c",
  "cmtr54unr00wfqwwvtbvaxy8q",
  "cmta9me5r0007qxmwnnsq1cez",
  "cmt45qxsf001oqx3e9jtlwny8",
  "cm6p4o8020003l8084z6rwe5g",
  "cmtwyq8y60001l704a2qhh2s0",
]);

function emptyKpis(at: string): OverviewKpis {
  return {
    capturedAt: at,
    totalStudents: 0,
    totalTeachers: 0,
    totalCourses: 0,
    bookingsActiveNow: 0,
    bookingsActiveStudents: 0,
    uniquePaidStudents: 0,
    bookingsAddedToday: 0,
    revenueActive: 0,
    pendingStudentCount: 0,
    pendingTransactionCount: 0,
    pendingAmount: 0,
    gross: 0,
    platformShare: 0,
    teachersShare: 0,
    expenses: 0,
    net: 0,
    expensesCount: 0,
    defaultPercentage: 25,
    customTeacherPctCount: 0,
    totalPaidStudentsAcrossPlatform: 0,
    totalActiveContentConsumers: 0,
    totalRealReservations: 0,
    totalRealPaidReservations: 0,
    totalCourseEnrollmentsCount: 0,
    totalCodesUsed: 0,
    totalCodesBooked: 0,
    totalGatewayDeposits: 0,
    totalRevenue: 0,
    teachersEarnedRevenue: 0,
    accessMonitorAlertCount: 0,
    outstandingValue: null,
    coveragePercent: null,
  };
}

/**
 * Reconstruct headline KPIs as they would have looked at `at`.
 * Cancellations after that moment are treated as still active then.
 * Pending invoices and booking-intelligence coverage cannot be rebuilt
 * accurately, so they stay empty with an explicit caveat.
 */
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session || !["superadmin", "admin", "staff"].includes(session.role)) {
    return NextResponse.json({ error: "غير مصرح" }, { status: 403 });
  }

  const raw = req.nextUrl.searchParams.get("at");
  const at = raw ? new Date(raw) : new Date();
  if (Number.isNaN(at.getTime())) {
    return NextResponse.json({ error: "وقت غير صالح" }, { status: 400 });
  }
  if (at.getTime() > Date.now() + 60_000) {
    return NextResponse.json({ error: "لا يمكن السفر إلى المستقبل" }, { status: 400 });
  }

  const demoTour = session.demoTour === true;
  const nestedStudent = demoTour
    ? { role: "student" as const, isDemo: true }
    : { role: "student" as const, isVirtual: false, accountMode: { not: "TESTER" as const } };
  const studentAtTime = demoTour
    ? { role: "student" as const, isDemo: true, createdAt: { lte: at }, OR: [{ isDeleted: false }, { deletedAt: { gt: at } }] }
    : {
        role: "student" as const,
        accountMode: { not: "TESTER" as const },
        createdAt: { lte: at },
        OR: [{ isDeleted: false }, { deletedAt: { gt: at } }],
      };
  const teacherAtTime = demoTour
    ? { role: "teacher" as const, isDemo: true, createdAt: { lte: at }, OR: [{ isDeleted: false }, { deletedAt: { gt: at } }] }
    : {
        role: "teacher" as const,
        isDemo: false,
        createdAt: { lte: at },
        OR: [{ isDeleted: false }, { deletedAt: { gt: at } }],
      };

  const dayStart = new Date(at);
  dayStart.setHours(0, 0, 0, 0);

  const activeAtTime = {
    createdAt: { lte: at },
    expiresAt: { gt: at },
    student: nestedStudent,
    OR: [{ status: "active" }, { status: { not: "active" }, updatedAt: { gt: at } }],
  };

  try {
    const [
      totalStudents,
      totalTeachers,
      totalCourses,
      bookingsActiveNow,
      bookingsAddedToday,
      bookingsActiveAgg,
      activeStudentRows,
      uniquePaidRows,
      allSubsAtTime,
      paidSubsAtTime,
      enrollments,
      codes,
      usedCodes,
      walletDeposits,
      expenses,
      percentages,
      paidCourseEnrollments,
    ] = await Promise.all([
      prisma.user.count({ where: studentAtTime }),
      prisma.user.count({ where: teacherAtTime }),
      prisma.course.count({
        where: { createdAt: { lte: at }, teacher: teacherAtTime },
      }),
      prisma.teacherSubscription.count({ where: activeAtTime }),
      prisma.teacherSubscription.count({
        where: {
          createdAt: { gte: dayStart, lte: at },
          student: nestedStudent,
        },
      }),
      prisma.teacherSubscription.aggregate({
        _sum: { amount: true },
        where: activeAtTime,
      }),
      prisma.teacherSubscription.findMany({
        where: activeAtTime,
        distinct: ["studentId"],
        select: { studentId: true },
      }),
      prisma.teacherSubscription.findMany({
        where: { amount: { gt: 0 }, createdAt: { lte: at }, student: nestedStudent },
        distinct: ["studentId"],
        select: { studentId: true },
      }),
      prisma.teacherSubscription.count({
        where: { createdAt: { lte: at }, student: nestedStudent },
      }),
      prisma.teacherSubscription.aggregate({
        _sum: { amount: true },
        _count: true,
        where: { amount: { gt: 0 }, createdAt: { lte: at }, student: nestedStudent },
      }),
      prisma.courseEnrollment.count({
        where: {
          createdAt: { lte: at },
          student: nestedStudent,
          course: { isPaid: true, price: { gt: 0 }, id: { notIn: [...STANDALONE_COURSE_IDS] } },
        },
      }),
      prisma.accessCode.count({
        where: { createdAt: { lte: at }, course: { teacher: teacherAtTime } },
      }),
      prisma.accessCode.count({
        where: {
          createdAt: { lte: at },
          studentId: { not: null },
          OR: [{ usedAt: null }, { usedAt: { lte: at } }],
          course: { teacher: teacherAtTime },
          student: nestedStudent,
        },
      }),
      prisma.balanceTransaction.aggregate({
        _sum: { amount: true },
        where: {
          amount: { gt: 0 },
          createdAt: { lte: at },
          type: { in: ["credit_sha7nawy_wallet", "credit_shakeout_wallet", "credit_code", "credit_admin"] },
          user: nestedStudent,
        },
      }),
      demoTour ? Promise.resolve([]) : getExpensesFromDb(),
      getTeacherPercentagesFromDb(),
      prisma.courseEnrollment.findMany({
        where: {
          createdAt: { lte: at },
          student: nestedStudent,
          course: { isPaid: true, price: { gt: 0 }, id: { notIn: [...STANDALONE_COURSE_IDS] } },
        },
        select: { studentId: true, amountPaid: true },
      }),
    ]);

    const paidCourseStudentIds = new Set(paidCourseEnrollments.map((e) => e.studentId));
    const courseExtraRevenue = paidCourseEnrollments.reduce((s, e) => s + (e.amountPaid || 0), 0);

    const realCourseIds = await prisma.course.findMany({
      where: {
        createdAt: { lte: at },
        isPaid: true,
        price: { gt: 0 },
        id: { notIn: [...STANDALONE_COURSE_IDS] },
        teacher: teacherAtTime,
      },
      select: { id: true },
    });

    const activeWatchers = await prisma.progress.findMany({
      where: {
        lastWatchedAt: { lte: at },
        video: { folder: { courseId: { in: realCourseIds.map((c) => c.id) } } },
        OR: [
          { watched: true },
          { watchedSecondsTotal: { gt: 10 } },
          { lastPositionSeconds: { gt: 10 } },
        ],
      },
      distinct: ["studentId"],
      select: { studentId: true },
    });

    const expensesAtTime = expenses.filter((e) => !e.createdAt || new Date(e.createdAt).getTime() <= at.getTime());
    const totalExpenses = expensesAtTime.reduce((s, e) => s + (e.amount || 0), 0);
    const bookingRevenue = paidSubsAtTime._sum.amount || 0;
    const teachersEarnedRevenue = bookingRevenue + courseExtraRevenue;
    const defaultPct = percentages.defaultPct;
    const platformShare = (teachersEarnedRevenue * defaultPct) / 100;
    const teachersShare = teachersEarnedRevenue - platformShare;
    const net = platformShare - totalExpenses;
    const totalGatewayDeposits = walletDeposits._sum.amount || 0;
    const capturedAt = at.toISOString();

    const kpis: OverviewKpis = {
      ...emptyKpis(capturedAt),
      capturedAt,
      totalStudents,
      totalTeachers,
      totalCourses,
      bookingsActiveNow,
      bookingsActiveStudents: activeStudentRows.length,
      uniquePaidStudents: uniquePaidRows.length,
      bookingsAddedToday,
      revenueActive: bookingsActiveAgg._sum.amount || 0,
      gross: teachersEarnedRevenue,
      platformShare,
      teachersShare,
      expenses: totalExpenses,
      net,
      expensesCount: expensesAtTime.length,
      defaultPercentage: defaultPct,
      customTeacherPctCount: Object.keys(percentages.custom || {}).length,
      totalPaidStudentsAcrossPlatform: paidCourseStudentIds.size,
      totalActiveContentConsumers: activeWatchers.length,
      totalRealReservations: allSubsAtTime,
      totalRealPaidReservations: paidSubsAtTime._count || 0,
      totalCourseEnrollmentsCount: enrollments,
      totalCodesUsed: usedCodes,
      totalCodesBooked: codes,
      totalGatewayDeposits,
      totalRevenue: Math.max(teachersEarnedRevenue, totalGatewayDeposits),
      teachersEarnedRevenue,
    };

    return NextResponse.json({
      mode: "reconstructed" as const,
      at: capturedAt,
      kpis,
      caveats: [
        "هذه قراءة مُعادة البناء من السجلات حتى اللحظة التي اخترتها — ليست لقطة محفوظة من فتح اللوحة.",
        "حصة المنصة هنا تستخدم النسبة الافتراضية على مجموع الباقات + مدفوعات الكورسات، بدون إزالة التكرار الذكية الموجودة في القراءة الحية.",
        "الفواتير المعلّقة وذكاء الحجوزات (تغطية المحتوى) لا يمكن إعادتهما بدقة بعد أن تتغير الحالة، لذلك تُترك فارغة.",
        "إذا أُلغي حجز بعد هذه اللحظة يُحسب هنا كأنه كان سارياً وقتها. إذا حُذف طالب بعد هذه اللحظة يُحسب ضمن الطلاب آنذاك.",
      ],
    });
  } catch (error) {
    console.error("[superadmin/overview/timemachine] error:", error);
    return NextResponse.json({ error: "تعذر إعادة بناء الأرقام لهذا الوقت" }, { status: 500 });
  }
}
