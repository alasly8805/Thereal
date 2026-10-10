import { prisma } from "@/lib/prisma";
import { getExpensesFromDb, getTeacherPercentagesFromDb } from "@/lib/money-control";
import { cairoDateKey, cairoRange, eachCairoDay, formatCairoDayAr, shiftCairoDay } from "./dates";
import type { CopilotChart, CopilotKpi, ToolResult } from "./types";
import { listStudentGrades, proposeGradeChange, proposePointsChange } from "./actions";
import {
  inspectGit,
  inspectHealth,
  inspectListDir,
  inspectLogs,
  inspectReadFile,
  inspectSearchCode,
} from "./inspect";

const studentFilter = {
  role: "student" as const,
  isDeleted: false,
  accountMode: { not: "TESTER" as const },
};
const nestedStudent = {
  role: "student" as const,
  isVirtual: false,
  accountMode: { not: "TESTER" as const },
};
const teacherFilter = {
  role: "teacher" as const,
  isDeleted: false,
  isDemo: false,
};

function egp(n: number): string {
  return `${Math.round(n).toLocaleString("ar-EG")} ج.م`;
}
function ar(n: number): string {
  return n.toLocaleString("ar-EG");
}
function pct(n: number): string {
  return `${Math.round(n).toLocaleString("ar-EG")}٪`;
}

function emptySeries(fromKey: string, toKey: string): CopilotChart["points"] {
  return eachCairoDay(fromKey, toKey).map((x) => ({
    x: formatCairoDayAr(x),
    values: { net: 0, gross: 0, expenses: 0, signups: 0 },
  }));
}

async function moneyForRange(from?: string | null, to?: string | null) {
  const { fromKey, toKey, start, endExclusive } = cairoRange(from, to);
  const createdInRange = { gte: start, lt: endExclusive };

  const [subs, enrollments, deposits, expenses, percentages] = await Promise.all([
    prisma.teacherSubscription.findMany({
      where: {
        createdAt: createdInRange,
        amount: { gt: 0 },
        student: nestedStudent,
        teacher: teacherFilter,
      },
      select: {
        id: true,
        teacherId: true,
        studentId: true,
        amount: true,
        planType: true,
        planLabel: true,
        createdAt: true,
        teacher: { select: { name: true } },
        student: { select: { name: true } },
      },
    }),
    prisma.courseEnrollment.findMany({
      where: {
        createdAt: createdInRange,
        amountPaid: { gt: 0 },
        student: nestedStudent,
        course: { isPaid: true, price: { gt: 0 }, teacher: teacherFilter },
      },
      select: {
        id: true,
        studentId: true,
        amountPaid: true,
        createdAt: true,
        course: { select: { id: true, title: true, teacherId: true, teacher: { select: { name: true } } } },
        student: { select: { name: true } },
      },
    }),
    prisma.balanceTransaction.findMany({
      where: {
        createdAt: createdInRange,
        amount: { gt: 0 },
        type: { in: ["credit_admin", "credit_code", "credit_shakeout_wallet", "credit_sha7nawy_wallet"] },
        user: nestedStudent,
      },
      select: { amount: true, createdAt: true, type: true },
    }),
    getExpensesFromDb(),
    getTeacherPercentagesFromDb(),
  ]);

  const coverageKeys = new Set(
    subs.map((s) => `${s.studentId}:${s.teacherId}`)
  );

  const independentEnrollments = enrollments.filter(
    (e) => !coverageKeys.has(`${e.studentId}:${e.course.teacherId}`)
  );

  type Bucket = { gross: number; platform: number; teachers: number; expenses: number; net: number; signups: number };
  const byDay = new Map<string, Bucket>();
  for (const key of eachCairoDay(fromKey, toKey)) {
    byDay.set(key, { gross: 0, platform: 0, teachers: 0, expenses: 0, net: 0, signups: 0 });
  }

  const byTeacher = new Map<
    string,
    { name: string; gross: number; platform: number; teachers: number; bookings: number; courses: number }
  >();

  const platformPctFor = (teacherId: string) =>
    percentages.custom[teacherId] !== undefined ? percentages.custom[teacherId] : percentages.defaultPct;

  const addGross = (teacherId: string, teacherName: string, amount: number, dayKey: string, kind: "booking" | "course") => {
    const p = platformPctFor(teacherId);
    const platform = (amount * p) / 100;
    const teacherShare = amount - platform;
    const day = byDay.get(dayKey);
    if (day) {
      day.gross += amount;
      day.platform += platform;
      day.teachers += teacherShare;
    }
    const row = byTeacher.get(teacherId) || {
      name: teacherName,
      gross: 0,
      platform: 0,
      teachers: 0,
      bookings: 0,
      courses: 0,
    };
    row.gross += amount;
    row.platform += platform;
    row.teachers += teacherShare;
    if (kind === "booking") row.bookings += 1;
    else row.courses += 1;
    byTeacher.set(teacherId, row);
  };

  for (const s of subs) {
    addGross(s.teacherId, s.teacher?.name || "معلم", s.amount || 0, cairoDateKey(s.createdAt), "booking");
  }
  for (const e of independentEnrollments) {
    addGross(
      e.course.teacherId,
      e.course.teacher?.name || "معلم",
      e.amountPaid || 0,
      cairoDateKey(e.createdAt),
      "course"
    );
  }

  const expensesInRange = expenses.filter((e) => {
    const t = new Date(e.createdAt).getTime();
    return t >= start.getTime() && t < endExclusive.getTime();
  });
  for (const e of expensesInRange) {
    const day = byDay.get(cairoDateKey(new Date(e.createdAt)));
    if (day) day.expenses += e.amount || 0;
  }

  for (const day of byDay.values()) {
    day.net = day.platform - day.expenses;
  }

  const gross = [...byDay.values()].reduce((s, d) => s + d.gross, 0);
  const platformShare = [...byDay.values()].reduce((s, d) => s + d.platform, 0);
  const teachersShare = [...byDay.values()].reduce((s, d) => s + d.teachers, 0);
  const expensesTotal = expensesInRange.reduce((s, e) => s + (e.amount || 0), 0);
  const net = platformShare - expensesTotal;
  const gatewayDeposits = deposits.reduce((s, d) => s + (d.amount || 0), 0);

  const payingStudentIds = new Set<string>([
    ...subs.map((s) => s.studentId),
    ...independentEnrollments.map((e) => e.studentId),
  ]);

  const points = eachCairoDay(fromKey, toKey).map((key) => {
    const d = byDay.get(key)!;
    return {
      x: formatCairoDayAr(key),
      values: {
        net: Math.round(d.net * 100) / 100,
        gross: Math.round(d.gross * 100) / 100,
        expenses: Math.round(d.expenses * 100) / 100,
      },
    };
  });

  const teacherRows = [...byTeacher.values()].sort((a, b) => b.gross - a.gross);

  return {
    fromKey,
    toKey,
    gross,
    platformShare,
    teachersShare,
    expenses: expensesTotal,
    net,
    gatewayDeposits,
    paidBookings: subs.length,
    independentCoursePurchases: independentEnrollments.length,
    uniquePayingStudents: payingStudentIds.size,
    defaultPercentage: percentages.defaultPct,
    expensesCount: expensesInRange.length,
    teacherRows,
    points,
    topPayments: [
      ...subs.slice(0, 8).map((s) => ({
        when: s.createdAt.toISOString(),
        who: s.student?.name || "طالب",
        what: `${s.teacher?.name || "معلم"} · ${s.planLabel || s.planType}`,
        amount: s.amount || 0,
      })),
      ...independentEnrollments.slice(0, 8).map((e) => ({
        when: e.createdAt.toISOString(),
        who: e.student?.name || "طالب",
        what: e.course.title,
        amount: e.amountPaid || 0,
      })),
    ]
      .sort((a, b) => b.when.localeCompare(a.when))
      .slice(0, 10),
  };
}

function moneyKpis(m: Awaited<ReturnType<typeof moneyForRange>>): CopilotKpi[] {
  return [
    { key: "net", label: "صافي ربح المنصة", value: egp(m.net), tone: m.net >= 0 ? "good" : "bad", hint: "حصة المنصة ناقص المصروفات" },
    { key: "gross", label: "إجمالي المدفوع (Gross)", value: egp(m.gross), tone: "gold", hint: "باقات + كورسات غير مغطاة بالباقة" },
    { key: "platform", label: "حصة المنصة", value: egp(m.platformShare), hint: `النسبة الافتراضية ${pct(m.defaultPercentage)}` },
    { key: "teachers", label: "مستحقات المعلمين", value: egp(m.teachersShare) },
    { key: "expenses", label: "المصروفات", value: egp(m.expenses), hint: `${ar(m.expensesCount)} بند` },
    { key: "payers", label: "طلاب دفعوا في الفترة", value: ar(m.uniquePayingStudents), tone: "good" },
  ];
}

function moneyChart(m: Awaited<ReturnType<typeof moneyForRange>>): CopilotChart {
  return {
    id: `money-${m.fromKey}-${m.toKey}`,
    type: "bar",
    title: `المال يومياً · ${formatCairoDayAr(m.fromKey)} → ${formatCairoDayAr(m.toKey)}`,
    unit: "ج.م",
    series: [
      { key: "gross", label: "Gross", color: "#c5a880" },
      { key: "net", label: "صافي المنصة", color: "#22c55e" },
      { key: "expenses", label: "مصروفات", color: "#ef4444" },
    ],
    points: m.points.length ? m.points : emptySeries(m.fromKey, m.toKey),
  };
}

async function getMoneySummary(args: { from?: string; to?: string }): Promise<ToolResult> {
  const m = await moneyForRange(args.from, args.to);
  return {
    ok: true,
    summary: `من ${m.fromKey} إلى ${m.toKey}: Gross ${Math.round(m.gross)}، حصة المنصة ${Math.round(m.platformShare)}، مصروفات ${Math.round(m.expenses)}، الصافي ${Math.round(m.net)} ج.م. طلاب دافعون ${m.uniquePayingStudents}، حجوزات ${m.paidBookings}.`,
    data: {
      from: m.fromKey,
      to: m.toKey,
      timezone: "Africa/Cairo",
      gross: Math.round(m.gross * 100) / 100,
      platformShare: Math.round(m.platformShare * 100) / 100,
      teachersShare: Math.round(m.teachersShare * 100) / 100,
      expenses: Math.round(m.expenses * 100) / 100,
      net: Math.round(m.net * 100) / 100,
      gatewayDeposits: Math.round(m.gatewayDeposits * 100) / 100,
      paidBookings: m.paidBookings,
      independentCoursePurchases: m.independentCoursePurchases,
      uniquePayingStudents: m.uniquePayingStudents,
      topTeachers: m.teacherRows.slice(0, 8).map((t) => ({
        name: t.name,
        gross: Math.round(t.gross),
        platform: Math.round(t.platform),
        teacherShare: Math.round(t.teachers),
      })),
      recent: m.topPayments,
    },
    charts: [moneyChart(m)],
    kpis: moneyKpis(m),
    tables: [
      {
        id: "teachers-in-range",
        title: "المعلمون في الفترة",
        columns: ["المعلم", "Gross", "حصة المنصة", "حصة المعلم", "حجوزات", "كورسات"],
        rows: m.teacherRows.slice(0, 12).map((t) => [
          t.name,
          egp(t.gross),
          egp(t.platform),
          egp(t.teachers),
          ar(t.bookings),
          ar(t.courses),
        ]),
      },
    ],
    links: [
      { section: "overview", label: "نظرة عامة" },
      { section: "wallet", label: "المحفظة" },
    ],
  };
}

async function comparePeriods(args: { from?: string; to?: string }): Promise<ToolResult> {
  const current = cairoRange(args.from, args.to);
  const days = eachCairoDay(current.fromKey, current.toKey).length;
  const prevTo = shiftCairoDay(current.fromKey, -1);
  const prevFrom = shiftCairoDay(prevTo, -(days - 1));
  const [a, b] = await Promise.all([
    moneyForRange(current.fromKey, current.toKey),
    moneyForRange(prevFrom, prevTo),
  ]);
  const delta = (x: number, y: number) => x - y;
  return {
    ok: true,
    summary: `الفترة ${a.fromKey}→${a.toKey} صافي ${Math.round(a.net)} مقابل ${Math.round(b.net)} في ${b.fromKey}→${b.toKey} (فرق ${Math.round(a.net - b.net)}). Gross ${Math.round(a.gross)} مقابل ${Math.round(b.gross)}.`,
    data: {
      current: { from: a.fromKey, to: a.toKey, net: a.net, gross: a.gross, uniquePayingStudents: a.uniquePayingStudents },
      previous: { from: b.fromKey, to: b.toKey, net: b.net, gross: b.gross, uniquePayingStudents: b.uniquePayingStudents },
      delta: {
        net: delta(a.net, b.net),
        gross: delta(a.gross, b.gross),
        payers: delta(a.uniquePayingStudents, b.uniquePayingStudents),
      },
    },
    charts: [
      {
        id: "compare-net",
        type: "bar",
        title: "مقارنة الصافي",
        unit: "ج.م",
        series: [
          { key: "current", label: `${a.fromKey} → ${a.toKey}`, color: "#22c55e" },
          { key: "previous", label: `${b.fromKey} → ${b.toKey}`, color: "#94a3b8" },
        ],
        points: [
          { x: "الصافي", values: { current: Math.round(a.net), previous: Math.round(b.net) } },
          { x: "Gross", values: { current: Math.round(a.gross), previous: Math.round(b.gross) } },
          { x: "حصة المنصة", values: { current: Math.round(a.platformShare), previous: Math.round(b.platformShare) } },
        ],
      },
    ],
    kpis: [
      { key: "net-now", label: "صافي الفترة", value: egp(a.net), tone: a.net >= b.net ? "good" : "warn" },
      { key: "net-prev", label: "صافي الفترة السابقة", value: egp(b.net) },
      {
        key: "net-delta",
        label: "الفرق",
        value: `${delta(a.net, b.net) >= 0 ? "+" : ""}${egp(delta(a.net, b.net))}`,
        tone: delta(a.net, b.net) >= 0 ? "good" : "bad",
      },
    ],
  };
}

async function getPlatformKpis(): Promise<ToolResult> {
  const now = new Date();
  const today = cairoRange(cairoDateKey(), cairoDateKey());
  const [students, teachers, courses, activeBookings, paidBookingsAll, pending, money, expenses, percentages] =
    await Promise.all([
      prisma.user.count({ where: studentFilter }),
      prisma.user.count({ where: teacherFilter }),
      prisma.course.count({ where: { teacher: teacherFilter } }),
      prisma.teacherSubscription.count({
        where: { status: "active", expiresAt: { gt: now }, student: nestedStudent },
      }),
      prisma.teacherSubscription.count({
        where: { amount: { gt: 0 }, student: nestedStudent },
      }),
      prisma.balanceTransaction.count({
        where: { type: { in: ["credit_shakeout_pending", "credit_sha7nawy_pending"] } },
      }),
      moneyForRange(undefined, undefined),
      getExpensesFromDb(),
      getTeacherPercentagesFromDb(),
    ]);

  const todayMoney = await moneyForRange(today.fromKey, today.toKey);
  const allTimeExpenses = expenses.reduce((s, e) => s + (e.amount || 0), 0);

  return {
    ok: true,
    summary: `الآن: ${students} طالب، ${teachers} معلم، ${courses} كورس، ${activeBookings} حجز ساري. صافي اليوم ${Math.round(todayMoney.net)} ج.م. فواتير معلّقة ${pending}.`,
    data: {
      totalStudents: students,
      totalTeachers: teachers,
      totalCourses: courses,
      activeBookings,
      paidBookingsAllTime: paidBookingsAll,
      pendingInvoices: pending,
      defaultPlatformPct: percentages.defaultPct,
      allTimeExpenses,
      last14Days: {
        from: money.fromKey,
        to: money.toKey,
        net: money.net,
        gross: money.gross,
      },
      today: { net: todayMoney.net, gross: todayMoney.gross, payers: todayMoney.uniquePayingStudents },
    },
    kpis: [
      { key: "students", label: "الطلاب المسجلون", value: ar(students), tone: "good" },
      { key: "teachers", label: "المعلمون", value: ar(teachers) },
      { key: "bookings", label: "حجوزات سارية", value: ar(activeBookings), tone: "good" },
      { key: "today-net", label: "صافي اليوم", value: egp(todayMoney.net), tone: todayMoney.net >= 0 ? "gold" : "bad" },
      { key: "range-net", label: "صافي آخر ١٤ يوم", value: egp(money.net) },
      { key: "pending", label: "فواتير معلّقة", value: ar(pending), tone: pending > 0 ? "warn" : "good" },
    ],
    charts: [moneyChart(money)],
    links: [
      { section: "overview", label: "نظرة عامة" },
      { section: "ai-copilot", label: "المساعد" },
    ],
  };
}

function digitsOnly(s: string): string {
  return s.replace(/\D/g, "");
}

async function searchStudents(args: { query: string; limit?: number }): Promise<ToolResult> {
  const q = (args.query || "").trim();
  if (q.length < 2) {
    return { ok: false, summary: "اكتب حرفين على الأقل للبحث عن طالب.", data: { students: [] } };
  }
  const limit = Math.min(Math.max(args.limit || 15, 1), 25);
  const phone = digitsOnly(q);
  const students = await prisma.user.findMany({
    where: {
      ...studentFilter,
      OR: [
        { name: { contains: q, mode: "insensitive" } },
        { email: { contains: q, mode: "insensitive" } },
        ...(phone.length >= 4 ? [{ phone: { contains: phone } }, { parentPhone: { contains: phone } }] : []),
      ],
    },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      parentPhone: true,
      educationalStage: true,
      balance: true,
      points: true,
      createdAt: true,
      lastLoginAt: true,
      isActive: true,
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  return {
    ok: true,
    summary: students.length
      ? `وُجد ${students.length} طالب مطابق لـ «${q}».`
      : `لا يوجد طالب مطابق لـ «${q}».`,
    data: {
      query: q,
      students: students.map((s) => ({
        id: s.id,
        name: s.name,
        phone: s.phone,
        parentPhone: s.parentPhone,
        email: s.email,
        stage: s.educationalStage,
        balance: s.balance,
        points: s.points,
        createdAt: s.createdAt.toISOString(),
        lastLoginAt: s.lastLoginAt?.toISOString() || null,
        isActive: s.isActive,
      })),
    },
    tables: students.length
      ? [
          {
            id: "students",
            title: `نتائج البحث (${students.length})`,
            columns: ["الاسم", "الهاتف", "المرحلة", "النقاط", "الرصيد", "التسجيل"],
            rows: students.map((s) => [
              s.name,
              s.phone || "—",
              s.educationalStage || "—",
              String(s.points),
              egp(s.balance || 0),
              cairoDateKey(s.createdAt),
            ]),
          },
        ]
      : [],
    links: [{ section: "students", label: "قائمة المتعلمين" }],
  };
}

async function getStudentDetail(args: { query: string }): Promise<ToolResult> {
  const q = (args.query || "").trim();
  if (!q) return { ok: false, summary: "حدد الطالب.", data: null };
  const phone = digitsOnly(q);
  const student = await prisma.user.findFirst({
    where: {
      role: "student",
      OR: [
        { id: q },
        { name: { equals: q, mode: "insensitive" } },
        { email: { equals: q, mode: "insensitive" } },
        ...(phone.length >= 8 ? [{ phone: { contains: phone } }] : []),
        { name: { contains: q, mode: "insensitive" } },
      ],
    },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      parentPhone: true,
      educationalStage: true,
      balance: true,
      points: true,
      createdAt: true,
      lastLoginAt: true,
      isActive: true,
      isDeleted: true,
      accountMode: true,
      studentSubscriptions: {
        select: {
          planLabel: true,
          planType: true,
          amount: true,
          status: true,
          createdAt: true,
          expiresAt: true,
          teacher: { select: { name: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 12,
      },
      courseEnrollments: {
        select: {
          amountPaid: true,
          fulfillmentSource: true,
          createdAt: true,
          course: { select: { title: true, price: true, teacher: { select: { name: true } } } },
        },
        orderBy: { createdAt: "desc" },
        take: 12,
      },
    },
  });

  if (!student) {
    return { ok: false, summary: `لا يوجد طالب مطابق لـ «${q}».`, data: null };
  }

  const booked = student.studentSubscriptions.reduce((s, x) => s + (x.amount || 0), 0);
  const coursesPaid = student.courseEnrollments.reduce((s, x) => s + (x.amountPaid || 0), 0);

  return {
    ok: true,
    summary: `${student.name}: ${student.points} نقطة، رصيد ${Math.round(student.balance || 0)} ج.م، ${student.studentSubscriptions.length} حجز معلم، ${student.courseEnrollments.length} كورس. هاتف ${student.phone || "غير مسجّل"}.`,
    data: {
      id: student.id,
      name: student.name,
      phone: student.phone,
      parentPhone: student.parentPhone,
      email: student.email,
      stage: student.educationalStage,
      balance: student.balance,
      points: student.points,
      isActive: student.isActive,
      isDeleted: student.isDeleted,
      accountMode: student.accountMode,
      createdAt: student.createdAt.toISOString(),
      lastLoginAt: student.lastLoginAt?.toISOString() || null,
      bookings: student.studentSubscriptions.map((s) => ({
        teacher: s.teacher?.name,
        plan: s.planLabel || s.planType,
        amount: s.amount,
        status: s.status,
        createdAt: s.createdAt.toISOString(),
        expiresAt: s.expiresAt?.toISOString() || null,
      })),
      courses: student.courseEnrollments.map((e) => ({
        title: e.course.title,
        teacher: e.course.teacher?.name,
        amountPaid: e.amountPaid,
        source: e.fulfillmentSource,
        createdAt: e.createdAt.toISOString(),
      })),
    },
    kpis: [
      { key: "points", label: "نقاط لوحة الشرف", value: String(student.points), tone: "gold" },
      { key: "balance", label: "رصيد المحفظة", value: egp(student.balance || 0), tone: "gold" },
      { key: "booked", label: "مدفوع حجوزات", value: egp(booked) },
      { key: "courses", label: "مدفوع كورسات", value: egp(coursesPaid) },
    ],
    tables: [
      {
        id: "st-bookings",
        title: "حجوزات المعلمين",
        columns: ["المعلم", "الخطة", "المبلغ", "الحالة", "ينتهي"],
        rows: student.studentSubscriptions.map((s) => [
          s.teacher?.name || "—",
          s.planLabel || s.planType,
          egp(s.amount || 0),
          s.status,
          s.expiresAt ? cairoDateKey(s.expiresAt) : "—",
        ]),
      },
    ],
    links: [{ section: "students", label: "المتعلمون" }],
  };
}

async function getPrices(args: { teacherName?: string }): Promise<ToolResult> {
  const name = args.teacherName?.trim();
  const teachers = await prisma.user.findMany({
    where: {
      ...teacherFilter,
      ...(name ? { name: { contains: name, mode: "insensitive" } } : {}),
    },
    select: {
      name: true,
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
        },
      },
      courses: {
        where: { isPaid: true, price: { gt: 0 } },
        select: {
          title: true,
          subject: true,
          price: true,
          discountPercent: true,
          educationalStage: true,
          _count: { select: { enrollments: true } },
        },
        take: 40,
      },
    },
    take: 30,
  });

  const planRows = teachers.map((t) => {
    const p = t.teacherProfile;
    return [
      t.name,
      p?.slug || "—",
      egp(p?.priceMonthly ?? 180),
      egp(p?.priceTermly ?? 750),
      egp(p?.priceYearly ?? 1200),
      p?.isPublished ? "منشور" : "مخفي",
    ];
  });

  const courseRows = teachers.flatMap((t) =>
    t.courses.map((c) => {
      const disc = c.discountPercent && c.discountPercent > 0 ? Math.round((c.price || 0) * (1 - c.discountPercent / 100)) : null;
      return [
        t.name,
        c.title,
        c.subject,
        egp(c.price || 0),
        disc != null ? `${egp(disc)} (−${c.discountPercent}٪)` : "—",
        ar(c._count.enrollments),
      ];
    })
  );

  return {
    ok: true,
    summary: `${teachers.length} معلم، ${courseRows.length} كورس مدفوع. أسعار الباقات الافتراضية 180 / 750 / 1200 إن لم يُضبط خلاف ذلك.`,
    data: {
      teachers: teachers.map((t) => ({
        name: t.name,
        plans: {
          monthly: t.teacherProfile?.priceMonthly ?? 180,
          termly: t.teacherProfile?.priceTermly ?? 750,
          yearly: t.teacherProfile?.priceYearly ?? 1200,
        },
        courses: t.courses.map((c) => ({
          title: c.title,
          price: c.price,
          discountPercent: c.discountPercent,
          enrollments: c._count.enrollments,
        })),
      })),
    },
    tables: [
      {
        id: "plans",
        title: "أسعار باقات الحجز",
        columns: ["المعلم", "الصفحة", "شهري", "ترم", "سنوي", "الحالة"],
        rows: planRows,
      },
      {
        id: "courses",
        title: "أسعار الكورسات المدفوعة",
        columns: ["المعلم", "الكورس", "المادة", "السعر", "بعد الخصم", "مسجّلون"],
        rows: courseRows.slice(0, 40),
      },
    ],
    links: [{ section: "overview", label: "تبويب الأسعار" }],
  };
}

async function getTeachersFinance(args: { limit?: number }): Promise<ToolResult> {
  const limit = Math.min(Math.max(args.limit || 15, 1), 30);
  const m = await moneyForRange(undefined, undefined);
  const rows = m.teacherRows.slice(0, limit);
  return {
    ok: true,
    summary: rows.length
      ? `أعلى معلم إيراداً في آخر ١٤ يوم: ${rows[0].name} بـ ${Math.round(rows[0].gross)} ج.م.`
      : "لا إيراد معلمين في آخر ١٤ يوم.",
    data: { from: m.fromKey, to: m.toKey, teachers: rows },
    charts: [
      {
        id: "teacher-gross",
        type: "bar",
        title: `إيراد المعلمين · ${m.fromKey} → ${m.toKey}`,
        unit: "ج.م",
        series: [{ key: "gross", label: "Gross", color: "#c5a880" }],
        points: rows.slice(0, 10).map((t) => ({ x: t.name, values: { gross: Math.round(t.gross) } })),
      },
    ],
    tables: [
      {
        id: "tf",
        title: "ترتيب المعلمين",
        columns: ["المعلم", "Gross", "المنصة", "المعلم", "حجوزات"],
        rows: rows.map((t) => [t.name, egp(t.gross), egp(t.platform), egp(t.teachers), ar(t.bookings)]),
      },
    ],
    links: [{ section: "teachers", label: "المعلمون" }],
  };
}

async function getSignups(args: { from?: string; to?: string }): Promise<ToolResult> {
  const { fromKey, toKey, start, endExclusive } = cairoRange(args.from, args.to);
  const rows = await prisma.user.findMany({
    where: { ...studentFilter, createdAt: { gte: start, lt: endExclusive } },
    select: { createdAt: true },
  });
  const map = new Map<string, number>();
  for (const key of eachCairoDay(fromKey, toKey)) map.set(key, 0);
  for (const r of rows) {
    const key = cairoDateKey(r.createdAt);
    map.set(key, (map.get(key) || 0) + 1);
  }
  const points = eachCairoDay(fromKey, toKey).map((key) => ({
    x: formatCairoDayAr(key),
    values: { signups: map.get(key) || 0 },
  }));
  const total = rows.length;
  return {
    ok: true,
    summary: `${total} طالب سجّلوا من ${fromKey} إلى ${toKey}.`,
    data: { from: fromKey, to: toKey, total, days: points },
    kpis: [{ key: "signups", label: "تسجيلات الفترة", value: ar(total), tone: "good" }],
    charts: [
      {
        id: "signups",
        type: "bar",
        title: `تسجيل الطلاب · ${formatCairoDayAr(fromKey)} → ${formatCairoDayAr(toKey)}`,
        series: [{ key: "signups", label: "طلاب جدد", color: "var(--brand)" }],
        points,
      },
    ],
    links: [{ section: "students", label: "المتعلمون" }],
  };
}

async function getAlerts(): Promise<ToolResult> {
  const now = new Date();
  const pending = await prisma.balanceTransaction.findMany({
    where: { type: { in: ["credit_shakeout_pending", "credit_sha7nawy_pending"] } },
    select: {
      id: true,
      amount: true,
      type: true,
      note: true,
      createdAt: true,
      user: { select: { name: true, phone: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 25,
  });
  const zeroSubs = await prisma.teacherSubscription.findMany({
    where: { amount: 0, createdAt: { gte: new Date(now.getTime() - 14 * 86400000) }, student: nestedStudent },
    select: {
      id: true,
      planLabel: true,
      createdAt: true,
      student: { select: { name: true } },
      teacher: { select: { name: true } },
    },
    take: 15,
    orderBy: { createdAt: "desc" },
  });
  const pendingAmount = pending.reduce((s, p) => s + (p.amount || 0), 0);
  return {
    ok: true,
    summary: `${pending.length} فاتورة معلّقة بقيمة ${Math.round(pendingAmount)} ج.م، و${zeroSubs.length} حجز صفري خلال ١٤ يوم.`,
    data: {
      pending: pending.map((p) => ({
        id: p.id,
        student: p.user?.name,
        phone: p.user?.phone,
        amount: p.amount,
        provider: p.type.includes("sha7nawy") ? "sha7nawy" : "shakeout",
        createdAt: p.createdAt.toISOString(),
      })),
      zeroBookings: zeroSubs.map((s) => ({
        student: s.student?.name,
        teacher: s.teacher?.name,
        plan: s.planLabel,
        createdAt: s.createdAt.toISOString(),
      })),
    },
    kpis: [
      { key: "pending-n", label: "فواتير معلّقة", value: ar(pending.length), tone: pending.length ? "warn" : "good" },
      { key: "pending-egp", label: "مبلغ معلّق", value: egp(pendingAmount), tone: pendingAmount ? "warn" : "good" },
      { key: "zero", label: "حجوزات صفرية (١٤ يوم)", value: ar(zeroSubs.length), tone: zeroSubs.length ? "warn" : "good" },
    ],
    tables: [
      {
        id: "pending",
        title: "عالقون في الدفع",
        columns: ["الطالب", "الهاتف", "المبلغ", "البوابة"],
        rows: pending.slice(0, 12).map((p) => [
          p.user?.name || "—",
          p.user?.phone || "—",
          egp(p.amount || 0),
          p.type.includes("sha7nawy") ? "شحناوي" : "Shake-Out",
        ]),
      },
    ],
    links: [{ section: "overview", label: "المراقبة والمدفوعات المعلقة" }],
  };
}

async function searchPlatform(args: { query: string }): Promise<ToolResult> {
  const q = (args.query || "").trim();
  if (q.length < 2) return { ok: false, summary: "اكتب حرفين على الأقل.", data: null };
  const phone = digitsOnly(q);
  const [students, teachers, courses] = await Promise.all([
    prisma.user.findMany({
      where: {
        ...studentFilter,
        OR: [
          { name: { contains: q, mode: "insensitive" } },
          ...(phone.length >= 4 ? [{ phone: { contains: phone } }] : []),
        ],
      },
      select: { name: true, phone: true, educationalStage: true, balance: true },
      take: 8,
    }),
    prisma.user.findMany({
      where: { ...teacherFilter, name: { contains: q, mode: "insensitive" } },
      select: { name: true, email: true, _count: { select: { courses: true } } },
      take: 5,
    }),
    prisma.course.findMany({
      where: {
        teacher: teacherFilter,
        OR: [{ title: { contains: q, mode: "insensitive" } }, { subject: { contains: q, mode: "insensitive" } }],
      },
      select: { title: true, subject: true, price: true, isPaid: true, teacher: { select: { name: true } } },
      take: 8,
    }),
  ]);
  return {
    ok: true,
    summary: `بحث «${q}»: ${students.length} طالب، ${teachers.length} معلم، ${courses.length} كورس.`,
    data: { students, teachers, courses },
    tables: [
      {
        id: "mix",
        title: "نتائج البحث في المنصة",
        columns: ["النوع", "الاسم", "تفاصيل"],
        rows: [
          ...students.map((s) => ["طالب", s.name, `${s.phone || "—"} · ${egp(s.balance || 0)}`]),
          ...teachers.map((t) => ["معلم", t.name, `${t._count.courses} كورس`]),
          ...courses.map((c) => ["كورس", c.title, `${c.teacher.name} · ${c.isPaid ? egp(c.price || 0) : "مجاني"}`]),
        ],
      },
    ],
  };
}

export const TOOL_LABELS: Record<string, string> = {
  get_money_summary: "يجلب الصافي والمال",
  compare_periods: "يقارن الفترات",
  get_platform_kpis: "يلتقط مؤشرات المقر",
  search_students: "يبحث عن الطلاب",
  get_student_detail: "يفتح ملف طالب",
  get_prices: "يجلب الأسعار",
  get_teachers_finance: "يرتب المعلمين مالياً",
  get_signups: "يعدّ التسجيلات",
  get_alerts: "يفحص المعلّق والتنبيهات",
  search_platform: "يبحث في المنصة",
  list_student_grades: "يجلب درجات الطالب",
  propose_points_change: "يجهّز تعديل النقاط (بانتظار التأكيد)",
  propose_grade_change: "يجهّز تعديل الدرجة (بانتظار التأكيد)",
  read_file: "يقرأ ملفاً (قراءة فقط)",
  list_dir: "يعرض مجلداً (قراءة فقط)",
  search_code: "يبحث في الكود (قراءة فقط)",
  read_logs: "يقرأ السجلات (قراءة فقط)",
  inspect_health: "يفحص صحة السيرفر (قراءة فقط)",
  inspect_git: "يعرض git (قراءة فقط)",
};

const ACTION_NAMES = new Set([
  "write_file",
  "run_command",
  "shell",
  "exec",
  "restart",
  "deploy",
  "pm2_restart",
  "str_replace",
  "apply_patch",
  "delete_file",
  "git_commit",
  "git_push",
]);

export async function executeCopilotTool(name: string, rawArgs: string): Promise<ToolResult> {
  if (ACTION_NAMES.has(name) || /write|restart|deploy|delete|exec|shell|patch|commit|push|chmod|chown/i.test(name)) {
    return {
      ok: false,
      summary: "مرفوض: هذا المساعد قراءة فقط ولا ينفّذ أي إجراء.",
      data: { refused: true, tool: name },
    };
  }
  let args: Record<string, unknown> = {};
  try {
    args = rawArgs ? (JSON.parse(rawArgs) as Record<string, unknown>) : {};
  } catch {
    args = {};
  }
  switch (name) {
    case "get_money_summary":
      return getMoneySummary({ from: str(args.from), to: str(args.to) });
    case "compare_periods":
      return comparePeriods({ from: str(args.from), to: str(args.to) });
    case "get_platform_kpis":
      return getPlatformKpis();
    case "search_students":
      return searchStudents({ query: str(args.query) || "", limit: num(args.limit) });
    case "get_student_detail":
      return getStudentDetail({ query: str(args.query) || "" });
    case "get_prices":
      return getPrices({ teacherName: str(args.teacherName) });
    case "get_teachers_finance":
      return getTeachersFinance({ limit: num(args.limit) });
    case "get_signups":
      return getSignups({ from: str(args.from), to: str(args.to) });
    case "get_alerts":
      return getAlerts();
    case "search_platform":
      return searchPlatform({ query: str(args.query) || "" });
    case "list_student_grades":
      return listStudentGrades({ query: str(args.query) });
    case "propose_points_change":
      return proposePointsChange(args);
    case "propose_grade_change":
      return proposeGradeChange(args);
    case "read_file":
      return inspectReadFile({ path: str(args.path), offset: num(args.offset) });
    case "list_dir":
      return inspectListDir({ path: str(args.path) });
    case "search_code":
      return inspectSearchCode({ query: str(args.query), glob: str(args.glob) });
    case "read_logs":
      return inspectLogs({ which: str(args.which), lines: num(args.lines) });
    case "inspect_health":
      return inspectHealth();
    case "inspect_git":
      return inspectGit();
    default:
      return { ok: false, summary: `أداة غير معروفة: ${name}`, data: null };
  }
}

function str(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}
function num(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

