import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getExpensesFromDb, getTeacherPercentagesFromDb } from "@/lib/money-control";

/** Superadmin/Admin: Fetch money control data (expenses, teacher percentages, calculated shares). */
export async function GET() {
  const session = await getSession();
  if (!session || !["superadmin", "admin", "staff"].includes(session.role)) {
    return NextResponse.json({ error: "غير مصرح" }, { status: 403 });
  }

  try {
    const [expenses, percentages, teachers] = await Promise.all([
      session.demoTour ? Promise.resolve([]) : getExpensesFromDb(),
      getTeacherPercentagesFromDb(),
      prisma.user.findMany({
        where: { role: "teacher", isDeleted: false, ...(session.demoTour ? { isDemo: true } : { isDemo: false }) },
        select: {
          id: true,
          name: true,
          email: true,
          teacherSubscriptions: {
            where: {
              status: "active",
              student: { accountMode: { not: "TESTER" } },
            },
            select: { amount: true },
          },
          courses: {
            where: { isPaid: true, price: { gt: 0 } },
            select: {
              id: true,
              price: true,
              accessCodes: {
                where: {
                  studentId: { not: null },
                  student: { accountMode: { not: "TESTER" } },
                },
                select: { id: true },
              },
              enrollments: {
                where: {
                  student: { accountMode: { not: "TESTER" } },
                },
                select: { amountPaid: true },
              },
            },
          },
        },
      }),
    ]);

    // Calculate revenue & shares per teacher
    const teacherFinancials = teachers.map((t) => {
      const subRevenue = t.teacherSubscriptions.reduce((sum, s) => sum + (s.amount || 0), 0);
      const courseRevenue = t.courses.reduce((cSum, c) => {
        const directRev = c.enrollments.reduce((sum, e) => sum + (e.amountPaid || 0), 0);
        const codeRev = (c.price || 0) * c.accessCodes.length;
        return cSum + (directRev > 0 ? directRev : codeRev);
      }, 0);

      const grossRevenue = subRevenue + courseRevenue;
      const platformPct = percentages.custom[t.id] !== undefined ? percentages.custom[t.id] : percentages.defaultPct;
      const platformShare = (grossRevenue * platformPct) / 100;
      const teacherShare = grossRevenue - platformShare;

      return {
        teacherId: t.id,
        teacherName: t.name,
        teacherEmail: t.email,
        grossRevenue,
        platformPercentage: platformPct,
        platformShare,
        teacherShare,
      };
    });

    const totalGrossRevenue = teacherFinancials.reduce((sum, t) => sum + t.grossRevenue, 0);
    const totalPlatformShare = teacherFinancials.reduce((sum, t) => sum + t.platformShare, 0);
    const totalTeachersShare = teacherFinancials.reduce((sum, t) => sum + t.teacherShare, 0);
    const totalExpenses = expenses.reduce((sum, e) => sum + (e.amount || 0), 0);
    const netPlatformProfit = totalPlatformShare - totalExpenses;

    return NextResponse.json({
      defaultPercentage: percentages.defaultPct,
      teacherPercentages: percentages.custom,
      expenses,
      teachers: teacherFinancials,
      summary: {
        totalGrossRevenue,
        totalPlatformShare,
        totalTeachersShare,
        totalExpenses,
        netPlatformProfit,
      },
    });
  } catch (error) {
    console.error("[money-control GET] error:", error);
    return NextResponse.json({ error: "حدث خطأ أثناء جلب بيانات الأرباح والمصروفات" }, { status: 500 });
  }
}
