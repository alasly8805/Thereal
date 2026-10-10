import { prisma } from "@/lib/prisma";
import { bookingCoversCourse, loadTeacherTerms } from "@/lib/teacher-terms";
import { getEffectiveCourseTrack, isSubscriptionTrackMatching } from "@/lib/course-track";
import { teacherSubscriptionCoversCourse } from "@/lib/standalone-lessons";
import type {
  TeacherPkgSettings,
  MonthConfig,
  TeacherActivePopup,
  CourseComparisonResult,
  ComparisonStudent,
} from "./teacher-package-types";

export type {
  TeacherPkgSettings,
  MonthConfig,
  TeacherActivePopup,
  CourseComparisonResult,
  ComparisonStudent,
};

export function getDefaultMonths(activeMonth = 1, baseMonthlyName?: string): MonthConfig[] {
  const ordinals = [
    "الأول", "الثاني", "الثالث", "الرابع", "الخامس",
    "السادس", "السابع", "الثامن", "التاسع", "العاشر",
    "الحادي عشر", "الثاني عشر"
  ];
  const list: MonthConfig[] = [];
  for (let i = 1; i <= 10; i++) {
    const ord = ordinals[i - 1] || `${i}`;
    list.push({
      number: i,
      name: i === 1 && baseMonthlyName ? baseMonthlyName : `حجز الشهر ${ord}`,
      onSale: i <= activeMonth,
      price: null,
    });
  }
  return list;
}

export const DEFAULT_PKG_SETTINGS: TeacherPkgSettings = {
  monthlyName: "حجز شهر 1",
  monthNumber: 1,
  termlyName: "حجز ترم",
  termNumber: 1,
  yearlyName: "حجز سنة كاملة",
  popupEnabled: false,
  activePopup: null,
  months: getDefaultMonths(1),
  enforceSequentialRenewal: true,
  englishBookingEnabled: true,
};

export function pkgSettingKey(teacherId: string) {
  return `teacher_pkg_settings:${teacherId}`;
}

export async function getTeacherPkgSettings(teacherId: string): Promise<TeacherPkgSettings> {
  try {
    const row = await prisma.appSetting.findUnique({
      where: { key: pkgSettingKey(teacherId) },
    });
    if (!row?.value) return { ...DEFAULT_PKG_SETTINGS };
    const parsed = JSON.parse(row.value);
    const monthNum = typeof parsed.monthNumber === "number" ? parsed.monthNumber : 1;
    const monthlyName = parsed.monthlyName || DEFAULT_PKG_SETTINGS.monthlyName;

    let months: MonthConfig[] = [];
    if (Array.isArray(parsed.months) && parsed.months.length > 0) {
      months = parsed.months.map((m: Record<string, unknown>, idx: number) => ({
        number: typeof m.number === "number" ? m.number : idx + 1,
        name: typeof m.name === "string" && m.name.trim() ? m.name.trim() : `حجز الشهر ${(m.number as number) || idx + 1}`,
        onSale: Boolean(m.onSale),
        price: typeof m.price === "number" ? m.price : null,
      }));
    } else {
      months = getDefaultMonths(monthNum, monthlyName);
    }

    return {
      monthlyName,
      monthNumber: monthNum,
      termlyName: parsed.termlyName || DEFAULT_PKG_SETTINGS.termlyName,
      termNumber: typeof parsed.termNumber === "number" ? parsed.termNumber : 1,
      yearlyName: parsed.yearlyName || DEFAULT_PKG_SETTINGS.yearlyName,
      popupEnabled: Boolean(parsed.popupEnabled),
      activePopup: parsed.activePopup || null,
      months,
      enforceSequentialRenewal: parsed.enforceSequentialRenewal !== false,
      englishBookingEnabled: parsed.englishBookingEnabled !== false,
    };
  } catch {
    return { ...DEFAULT_PKG_SETTINGS };
  }
}

export function getStudentMonthProgress(
  termNumbers: number[] | null | undefined,
  configuredMonths: MonthConfig[],
  enforceSequential = true
): {
  ownedMonths: number[];
  highestOwnedMonth: number;
  nextEligibleMonth: MonthConfig | null;
  monthsStatus: Array<MonthConfig & {
    isOwned: boolean;
    isEligible: boolean;
    isLocked: boolean;
    lockReason?: string;
  }>;
} {
  const owned = (termNumbers || []).filter((n) => typeof n === "number" && n > 0).sort((a, b) => a - b);
  const highest = owned.length > 0 ? owned[owned.length - 1] : 0;

  const sortedMonths = [...configuredMonths].sort((a, b) => a.number - b.number);

  let nextEligible: MonthConfig | null = null;
  if (highest === 0) {
    nextEligible = sortedMonths.find((m) => m.onSale) || null;
  } else {
    const nextCandidate = sortedMonths.find((m) => m.number === highest + 1);
    if (nextCandidate && nextCandidate.onSale) {
      nextEligible = nextCandidate;
    }
  }

  const monthsStatus = sortedMonths.map((m) => {
    const isOwned = owned.includes(m.number);
    let isEligible = false;
    let isLocked = false;
    let lockReason: string | undefined;

    if (isOwned) {
      isEligible = false;
    } else if (!m.onSale) {
      isLocked = true;
      lockReason = "لم يُفتح الحجز لهذا الشهر بعد من قِبل المعلم";
    } else if (enforceSequential && m.number > 1 && !owned.includes(m.number - 1)) {
      isLocked = true;
      const prevMonth = sortedMonths.find((x) => x.number === m.number - 1);
      lockReason = `يتطلب الاشتراك في ${prevMonth?.name || `الشهر ${m.number - 1}`} أولاً`;
    } else {
      isEligible = true;
    }

    return {
      ...m,
      isOwned,
      isEligible,
      isLocked,
      lockReason,
    };
  });

  return {
    ownedMonths: owned,
    highestOwnedMonth: highest,
    nextEligibleMonth: nextEligible,
    monthsStatus,
  };
}

export async function saveTeacherPkgSettings(
  teacherId: string,
  patch: Partial<TeacherPkgSettings>
): Promise<TeacherPkgSettings> {
  const current = await getTeacherPkgSettings(teacherId);
  const updated: TeacherPkgSettings = {
    ...current,
    ...patch,
  };
  await prisma.appSetting.upsert({
    where: { key: pkgSettingKey(teacherId) },
    create: {
      key: pkgSettingKey(teacherId),
      value: JSON.stringify(updated),
    },
    update: {
      value: JSON.stringify(updated),
    },
  });
  return updated;
}


export type AuditedCourse = {
  id: string;
  title: string;
  price: number | null;
  educationalStage: string | null;
  bookingKind: string | null;
  bookingTerm: number | null;
  isPaid: boolean;
  isVirtual: boolean;
  createdAt: Date;
};

export async function getCourseAudience(
  teacherId: string,
  courseId: string
): Promise<{ course: AuditedCourse; studentsMap: Map<string, ComparisonStudent> }> {
  const course = await prisma.course.findFirst({
    where: { id: courseId, teacherId },
    select: {
      id: true,
      title: true,
      price: true,
      educationalStage: true,
      bookingKind: true,
      bookingTerm: true,
      isPaid: true,
      isVirtual: true,
      createdAt: true,
    },
  });

  if (!course) {
    throw new Error("الكورس غير موجود أو لا ينتمي لهذا المعلم");
  }

  const studentsMap = new Map<string, ComparisonStudent>();

  // 1. Direct enrollments
  const enrollments = await prisma.courseEnrollment.findMany({
    where: { courseId },
    include: {
      student: {
        select: {
          id: true,
          name: true,
          phone: true,
          parentPhone: true,
          educationalStage: true,
          accountMode: true,
        },
      },
    },
  });

  for (const enr of enrollments) {
    if (enr.student.accountMode === "TESTER") continue;
    studentsMap.set(enr.student.id, {
      id: enr.student.id,
      name: enr.student.name,
      phone: enr.student.phone,
      parentPhone: enr.student.parentPhone,
      educationalStage: enr.student.educationalStage,
      accessSource: "DIRECT",
      amount: course.price ?? 0,
      enrolledAt: enr.createdAt.toISOString(),
    });
  }

  // 2. Active teacher subscriptions covering this course
  if (teacherSubscriptionCoversCourse(course)) {
    const subs = await prisma.teacherSubscription.findMany({
      where: {
        teacherId,
        status: "active",
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
        student: { accountMode: { not: "TESTER" } },
      },
      include: {
        student: {
          select: {
            id: true,
            name: true,
            phone: true,
            parentPhone: true,
            educationalStage: true,
          },
        },
      },
    });

    const terms = await loadTeacherTerms([teacherId]);
    const courseTrack = await getEffectiveCourseTrack(course.id, course);

    for (const sub of subs) {
      if (
        isSubscriptionTrackMatching(sub.languageTrack, courseTrack) &&
        bookingCoversCourse(sub, course, terms)
      ) {
        const existing = studentsMap.get(sub.studentId);
        if (existing) {
          existing.accessSource = "BOTH";
          existing.planType = sub.planType;
          existing.planLabel = sub.planLabel;
        } else {
          studentsMap.set(sub.studentId, {
            id: sub.student.id,
            name: sub.student.name,
            phone: sub.student.phone,
            parentPhone: sub.student.parentPhone,
            educationalStage: sub.student.educationalStage,
            accessSource: "SUBSCRIPTION",
            planType: sub.planType,
            planLabel: sub.planLabel,
            amount: sub.amount,
            enrolledAt: sub.createdAt.toISOString(),
          });
        }
      }
    }
  }

  return { course, studentsMap };
}

export async function compareTeacherCourses(
  teacherId: string,
  course1Id: string,
  course2Id: string
): Promise<CourseComparisonResult> {
  const [data1, data2] = await Promise.all([
    getCourseAudience(teacherId, course1Id),
    getCourseAudience(teacherId, course2Id),
  ]);

  const map1 = data1.studentsMap;
  const map2 = data2.studentsMap;

  const allCourse1 = Array.from(map1.values());
  const allCourse2 = Array.from(map2.values());

  const both: ComparisonStudent[] = [];
  const course1Only: ComparisonStudent[] = [];
  const course2Only: ComparisonStudent[] = [];

  for (const s of allCourse1) {
    if (map2.has(s.id)) {
      both.push(s);
    } else {
      course1Only.push(s);
    }
  }

  for (const s of allCourse2) {
    if (!map1.has(s.id)) {
      course2Only.push(s);
    }
  }

  const count1 = allCourse1.length;
  const count2 = allCourse2.length;
  const diffCount = count2 - count1;
  const percentChange = count1 > 0 ? Math.round(((count2 - count1) / count1) * 100) : 0;
  const retentionRate = count1 > 0 ? Math.round((both.length / count1) * 100) : 0;
  const churnRate = count1 > 0 ? Math.round((course1Only.length / count1) * 100) : 0;

  const rev1 = allCourse1.reduce((sum, s) => sum + (s.amount || 0), 0);
  const rev2 = allCourse2.reduce((sum, s) => sum + (s.amount || 0), 0);

  return {
    course1: {
      id: data1.course.id,
      title: data1.course.title,
      price: data1.course.price,
      educationalStage: data1.course.educationalStage,
      bookingKind: data1.course.bookingKind,
      totalBuyers: count1,
      estimatedRevenue: rev1,
    },
    course2: {
      id: data2.course.id,
      title: data2.course.title,
      price: data2.course.price,
      educationalStage: data2.course.educationalStage,
      bookingKind: data2.course.bookingKind,
      totalBuyers: count2,
      estimatedRevenue: rev2,
    },
    metrics: {
      diffCount,
      percentChange,
      bothCount: both.length,
      retentionRate,
      course1OnlyCount: course1Only.length,
      churnRate,
      course2OnlyCount: course2Only.length,
      revenueDiff: rev2 - rev1,
    },
    students: {
      course1Only,
      course2Only,
      both,
      allCourse1,
      allCourse2,
    },
  };
}

export async function broadcastNewCourseNotification(params: {
  teacherId: string;
  courseId: string;
  customTitle?: string;
  customMessage?: string;
  targetPlan?: "all" | "monthly" | "termly" | "yearly";
  actionType?: "course" | "renewal" | "both";
  renewalButtonText?: string;
}): Promise<{ notificationsCount: number; popup: TeacherActivePopup }> {
  const {
    teacherId,
    courseId,
    customTitle,
    customMessage,
    targetPlan = "all",
    actionType = "both",
    renewalButtonText,
  } = params;

  const [course, teacher] = await Promise.all([
    prisma.course.findUnique({
      where: { id: courseId },
      select: { id: true, title: true, educationalStage: true },
    }),
    prisma.user.findUnique({
      where: { id: teacherId },
      select: {
        id: true,
        name: true,
        teacherProfile: { select: { displayName: true } },
      },
    }),
  ]);

  if (!course) throw new Error("الكورس غير موجود");
  if (!teacher) throw new Error("المعلم غير موجود");

  const teacherName = teacher.teacherProfile?.displayName || teacher.name;
  const popupId = `popup_${course.id}_${Date.now()}`;

  const title = customTitle || `🎉 كورس جديد: ${course.title}`;
  const body =
    customMessage ||
    `أضاف الأستاذ ${teacherName} كورساً جديداً (${course.title}) متاحاً الآن في حسابك! اضغط للمشاهدة فوراً.`;

  // Find target students
  const activeSubs = await prisma.teacherSubscription.findMany({
    where: {
      teacherId,
      status: "active",
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      ...(targetPlan && targetPlan !== "all" ? { planType: targetPlan } : {}),
      student: { accountMode: { not: "TESTER" } },
    },
    select: { studentId: true },
  });

  const studentIds = Array.from(new Set(activeSubs.map((s) => s.studentId)));

  if (studentIds.length > 0) {
    const notificationLink = actionType === "renewal" ? `/choose-course?teacherId=${teacherId}` : `/courses/${course.id}`;
    await prisma.notification.createMany({
      data: studentIds.map((userId) => ({
        userId,
        type: "new_course_added",
        title,
        body,
        link: notificationLink,
      })),
    });
  }

  const activePopup: TeacherActivePopup = {
    id: popupId,
    courseId: course.id,
    courseTitle: course.title,
    teacherId,
    teacherName,
    customTitle: title,
    message: body,
    targetPlan,
    targetStage: course.educationalStage,
    actionType,
    renewalButtonText,
    enabled: true,
    createdAt: new Date().toISOString(),
  };

  await saveTeacherPkgSettings(teacherId, {
    popupEnabled: true,
    activePopup,
  });

  return {
    notificationsCount: studentIds.length,
    popup: activePopup,
  };
}

export async function autoEnrollEligibleSubscribers(params: {
  teacherId: string;
  courseId: string;
  targetPlan?: "all" | "monthly" | "termly" | "yearly";
}): Promise<{ newlyEnrolledCount: number }> {
  const { teacherId, courseId, targetPlan } = params;

  const course = await prisma.course.findUnique({
    where: { id: courseId },
    select: { id: true, teacherId: true, educationalStage: true },
  });
  if (!course || course.teacherId !== teacherId) {
    throw new Error("الكورس غير موجود أو غير تابع لهذا المعلم");
  }

  const subs = await prisma.teacherSubscription.findMany({
    where: {
      teacherId,
      status: "active",
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      ...(targetPlan && targetPlan !== "all" ? { planType: targetPlan } : {}),
      student: { accountMode: { not: "TESTER" } },
    },
    select: { studentId: true, educationalStage: true },
  });

  const matchingStudentIds = subs
    .filter((s) => !course.educationalStage || !s.educationalStage || s.educationalStage === "الكل" || s.educationalStage === course.educationalStage)
    .map((s) => s.studentId);

  const uniqueStudentIds = Array.from(new Set(matchingStudentIds));

  // Find existing enrollments to avoid duplicate key errors
  const existing = await prisma.courseEnrollment.findMany({
    where: {
      courseId,
      studentId: { in: uniqueStudentIds },
    },
    select: { studentId: true },
  });
  const existingSet = new Set(existing.map((e) => e.studentId));
  const toEnroll = uniqueStudentIds.filter((id) => !existingSet.has(id));

  if (toEnroll.length > 0) {
    await prisma.courseEnrollment.createMany({
      data: toEnroll.map((studentId) => ({
        courseId,
        studentId,
        fulfillmentSource: "ADMIN",
        amountPaid: 0,
      })),
      skipDuplicates: true,
    });
  }

  return { newlyEnrolledCount: toEnroll.length };
}
