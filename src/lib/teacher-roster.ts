import { prisma } from "@/lib/prisma";
import { getPlanMonths } from "@/lib/subscription-terms";
import type { RosterCourse, RosterStudent, TeacherRoster } from "@/lib/teacher-roster-types";

export type { RosterCourse, RosterStudent, RosterStudentKind, TeacherRoster } from "@/lib/teacher-roster-types";
export { STAGE_LABELS } from "@/lib/teacher-roster-types";

const REAL_STUDENT = {
  role: "student" as const,
  isVirtual: false,
  isDeleted: false,
  accountMode: { not: "TESTER" as const },
};

function inferTrack(title: string, fallback: string | null): string {
  const t = title.toLowerCase();
  if (t.includes("لغات") || t.includes("programming") || t.includes("english")) return "languages";
  return fallback || "arabic";
}

function inferCourseSource(params: {
  fulfillmentSource?: string | null;
  accessCode?: string | null;
}): string {
  const src = (params.fulfillmentSource || "").toUpperCase();
  if (src === "PURCHASE") return "PAYMENT_GATEWAY";
  if (src === "SUPPORT") return "SUPPORT";
  if (src === "ADMIN") return "ADMIN";
  if (src === "TESTER_BYPASS") return "TESTER_BYPASS";
  const code = params.accessCode || "";
  if (code.startsWith("PAY-")) return "PAYMENT_GATEWAY";
  if (code.startsWith("SUP-")) return "SUPPORT";
  if (code.startsWith("ADM-")) return "ADMIN";
  if (code) return "ACCESS_CODE";
  return "COURSE";
}

/**
 * Teacher panel must not expose that support/admin enrolled the student.
 * Those tickets are usually cash paid at the office — same as a normal course buy.
 */
function teacherFacingPaymentSource(source: string): string {
  if (source === "SUPPORT" || source === "ADMIN" || source === "ACCESS_CODE" || source === "COURSE") {
    return "PAYMENT_GATEWAY";
  }
  return source;
}

/**
 * Same money + student rules as the superadmin teacher row:
 * paid bookings + anyone on a paid course who is not covered by a remaining package slot.
 */
export async function buildTeacherRoster(teacherId: string): Promise<TeacherRoster | null> {
  const teacher = await prisma.user.findFirst({
    where: { id: teacherId, role: "teacher", isDeleted: false },
    select: {
      id: true,
      name: true,
      teacherSubscriptions: {
        where: { student: REAL_STUDENT },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          amount: true,
          planType: true,
          planLabel: true,
          educationalStage: true,
          languageTrack: true,
          studentName: true,
          studentPhone: true,
          parentPhone: true,
          paymentSource: true,
          paymentRef: true,
          status: true,
          createdAt: true,
          student: {
            select: {
              id: true,
              name: true,
              email: true,
              phone: true,
              parentPhone: true,
              educationalStage: true,
            },
          },
        },
      },
      courses: {
        select: {
          id: true,
          title: true,
          isPaid: true,
          price: true,
          enrollments: {
            where: { student: REAL_STUDENT, studentId: { not: teacherId } },
            select: {
              id: true,
              studentId: true,
              amountPaid: true,
              fulfillmentSource: true,
              createdAt: true,
              student: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                  phone: true,
                  parentPhone: true,
                  educationalStage: true,
                },
              },
            },
          },
          accessCodes: {
            where: {
              studentId: { not: null },
              student: REAL_STUDENT,
            },
            select: {
              id: true,
              code: true,
              studentId: true,
              usedAt: true,
              createdAt: true,
              student: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                  phone: true,
                  parentPhone: true,
                  educationalStage: true,
                },
              },
            },
          },
        },
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!teacher) return null;

  const exclusions = await prisma.appSetting.findMany({
    where: { key: { startsWith: "course_excluded_" } },
    select: { key: true, value: true },
  });
  const excludedSet = new Set(
    exclusions.filter((e) => e.value === "true").map((e) => e.key.replace("course_excluded_", ""))
  );

  const paidSubs = teacher.teacherSubscriptions.filter((s) => (s.amount || 0) > 0 && s.status === "active");
  const bookingRevenue = paidSubs.reduce((sum, s) => sum + (s.amount || 0), 0);

  const studentSubsMap = new Map<string, Array<{ remainingSlots: number }>>();
  for (const sub of paidSubs) {
    const sId = sub.student?.id;
    if (!sId) continue;
    if (!studentSubsMap.has(sId)) studentSubsMap.set(sId, []);
    studentSubsMap.get(sId)!.push({ remainingSlots: getPlanMonths(sub.planType) });
  }

  const students = new Map<string, RosterStudent>();

  const upsertStudent = (
    id: string,
    patch: Partial<RosterStudent> & { name: string }
  ): RosterStudent => {
    const prev = students.get(id);
    const next: RosterStudent = {
      id,
      name: patch.name || prev?.name || "طالب",
      email: patch.email ?? prev?.email ?? null,
      phone: patch.phone ?? prev?.phone ?? null,
      parentPhone: patch.parentPhone ?? prev?.parentPhone ?? null,
      educationalStage: patch.educationalStage ?? prev?.educationalStage ?? null,
      kind: patch.kind ?? prev?.kind ?? "course_purchase",
      planType: patch.planType ?? prev?.planType ?? null,
      planLabel: patch.planLabel ?? prev?.planLabel ?? null,
      languageTrack: patch.languageTrack ?? prev?.languageTrack ?? null,
      bookingAmount: patch.bookingAmount ?? prev?.bookingAmount ?? 0,
      courseAmount: patch.courseAmount ?? prev?.courseAmount ?? 0,
      totalAmount: 0,
      paymentSource: patch.paymentSource ?? prev?.paymentSource ?? null,
      paymentRef: patch.paymentRef ?? prev?.paymentRef ?? null,
      status: patch.status ?? prev?.status ?? "active",
      createdAt: patch.createdAt ?? prev?.createdAt ?? new Date().toISOString(),
      subscriptionId: patch.subscriptionId ?? prev?.subscriptionId ?? null,
      courses: prev?.courses ? [...prev.courses] : [],
    };
    next.totalAmount = next.bookingAmount + next.courseAmount;
    students.set(id, next);
    return next;
  };

  for (const sub of paidSubs) {
    const sId = sub.student?.id;
    if (!sId) continue;
    upsertStudent(sId, {
      name: sub.studentName || sub.student?.name || "طالب",
      email: sub.student?.email || null,
      phone: sub.studentPhone || sub.student?.phone || null,
      parentPhone: sub.parentPhone || sub.student?.parentPhone || null,
      educationalStage: sub.educationalStage || sub.student?.educationalStage || null,
      kind: "booking",
      planType: sub.planType,
      planLabel: sub.planLabel,
      languageTrack: sub.languageTrack || "arabic",
      bookingAmount: sub.amount || 0,
      paymentSource: sub.paymentSource || "MANUAL",
      paymentRef: sub.paymentRef || null,
      status: sub.status,
      createdAt: sub.createdAt.toISOString(),
      subscriptionId: sub.id,
    });
  }

  const courseStats: RosterCourse[] = [];
  let courseRevenue = 0;
  const freeStudentIds = new Set<string>();

  for (const course of teacher.courses) {
    const isPaid = Boolean(course.isPaid && course.price && course.price > 0);
    const enrolledIds = new Set<string>();
    const byStudent = new Map<
      string,
      {
        name: string;
        email: string | null;
        phone: string | null;
        parentPhone: string | null;
        stage: string | null;
        amountPaid?: number;
        fulfillmentSource?: string | null;
        accessCode?: string | null;
        createdAt: Date;
      }
    >();

    for (const e of course.enrollments) {
      if (!e.studentId || e.studentId === teacherId) continue;
      if (excludedSet.has(`${course.id}_${e.studentId}`)) continue;
      enrolledIds.add(e.studentId);
      byStudent.set(e.studentId, {
        name: e.student?.name || "طالب",
        email: e.student?.email || null,
        phone: e.student?.phone || null,
        parentPhone: e.student?.parentPhone || null,
        stage: e.student?.educationalStage || null,
        amountPaid: e.amountPaid,
        fulfillmentSource: e.fulfillmentSource,
        createdAt: e.createdAt,
      });
    }
    for (const ac of course.accessCodes) {
      if (!ac.studentId || ac.studentId === teacherId) continue;
      if (excludedSet.has(`${course.id}_${ac.studentId}`)) continue;
      enrolledIds.add(ac.studentId);
      const prev = byStudent.get(ac.studentId);
      byStudent.set(ac.studentId, {
        name: prev?.name || ac.student?.name || "طالب",
        email: prev?.email || ac.student?.email || null,
        phone: prev?.phone || ac.student?.phone || null,
        parentPhone: prev?.parentPhone || ac.student?.parentPhone || null,
        stage: prev?.stage || ac.student?.educationalStage || null,
        amountPaid: prev?.amountPaid,
        fulfillmentSource: prev?.fulfillmentSource,
        accessCode: ac.code,
        createdAt: prev?.createdAt || ac.usedAt || ac.createdAt,
      });
    }

    let paidCount = 0;
    let coveredCount = 0;
    let revenue = 0;

    if (isPaid) {
      for (const studentId of enrolledIds) {
        const info = byStudent.get(studentId);
        if (!info) continue;
        const slots = studentSubsMap.get(studentId);
        const available = slots?.find((s) => s.remainingSlots > 0);
        const source = teacherFacingPaymentSource(
          inferCourseSource({
            fulfillmentSource: info.fulfillmentSource,
            accessCode: info.accessCode,
          })
        );
        const row = students.get(studentId) ||
          upsertStudent(studentId, {
            name: info.name,
            email: info.email,
            phone: info.phone,
            parentPhone: info.parentPhone,
            educationalStage: info.stage,
            kind: "course_purchase",
            languageTrack: inferTrack(course.title, null),
            paymentSource: source,
            createdAt: info.createdAt.toISOString(),
            status: "active",
          });

        if (available) {
          available.remainingSlots -= 1;
          coveredCount += 1;
          paidCount += 1;
          row.courses.push({
            id: course.id,
            title: course.title,
            amount: 0,
            covered: true,
            source: "COVERED_BY_PACKAGE",
          });
        } else {
          const directAmt = info.amountPaid;
          const effective = directAmt !== undefined && directAmt > 0 ? directAmt : course.price || 0;
          revenue += effective;
          courseRevenue += effective;
          paidCount += 1;
          row.courseAmount += effective;
          row.totalAmount = row.bookingAmount + row.courseAmount;
          if (row.kind !== "booking") {
            row.kind = "course_purchase";
            row.paymentSource = source;
            const createdAt = info.createdAt.toISOString();
            if (!row.createdAt || createdAt < row.createdAt) row.createdAt = createdAt;
          }
          if (!row.languageTrack) row.languageTrack = inferTrack(course.title, row.languageTrack);
          row.courses.push({
            id: course.id,
            title: course.title,
            amount: effective,
            covered: false,
            source,
          });
        }
        students.set(studentId, row);
      }
    } else {
      for (const studentId of enrolledIds) {
        if (!students.has(studentId)) freeStudentIds.add(studentId);
      }
    }

    courseStats.push({
      id: course.id,
      title: course.title,
      isPaid,
      price: isPaid ? course.price || 0 : 0,
      enrolled: enrolledIds.size,
      paidCount,
      coveredCount,
      revenue,
    });
  }

  const list = Array.from(students.values()).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  const byStage: Record<string, number> = {};
  for (const s of list) {
    const key = s.educationalStage || "unknown";
    byStage[key] = (byStage[key] || 0) + 1;
  }

  return {
    teacher: { id: teacher.id, name: teacher.name },
    stats: {
      totalStudents: list.length,
      bookingStudents: list.filter((s) => s.kind === "booking").length,
      courseOnlyStudents: list.filter((s) => s.kind === "course_purchase").length,
      grantStudents: list.filter((s) => s.kind === "grant").length,
      freeCourseStudents: freeStudentIds.size,
      bookingRevenue,
      courseRevenue,
      totalRevenue: bookingRevenue + courseRevenue,
      monthly: list.filter((s) => s.planType === "monthly").length,
      termly: list.filter((s) => s.planType === "termly").length,
      yearly: list.filter((s) => s.planType === "yearly").length,
      arabic: list.filter((s) => !s.languageTrack || s.languageTrack === "arabic").length,
      languages: list.filter((s) => s.languageTrack === "languages" || s.languageTrack === "english").length,
      byStage,
    },
    courses: courseStats,
    students: list,
  };
}
