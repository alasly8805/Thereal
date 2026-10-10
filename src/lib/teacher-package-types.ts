export interface TeacherActivePopup {
  id: string;
  courseId: string;
  courseTitle: string;
  teacherId: string;
  teacherName: string;
  customTitle?: string;
  message?: string;
  targetPlan?: "all" | "monthly" | "termly" | "yearly";
  targetStage?: string | null;
  actionType?: "course" | "renewal" | "both";
  renewalButtonText?: string;
  enabled: boolean;
  createdAt: string;
}

export interface MonthConfig {
  number: number;
  name: string;
  onSale: boolean;
  price?: number | null;
}

export interface TeacherPkgSettings {
  monthlyName: string;
  monthNumber: number;
  termlyName: string;
  termNumber: number;
  yearlyName: string;
  popupEnabled: boolean;
  activePopup?: TeacherActivePopup | null;
  months?: MonthConfig[];
  enforceSequentialRenewal?: boolean;
  englishBookingEnabled?: boolean;
}

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

export interface ComparisonStudent {
  id: string;
  name: string;
  phone: string | null;
  parentPhone: string | null;
  educationalStage: string | null;
  accessSource: "DIRECT" | "SUBSCRIPTION" | "BOTH";
  planType?: string | null;
  planLabel?: string | null;
  amount?: number | null;
  enrolledAt: string;
}

export interface CourseComparisonResult {
  course1: {
    id: string;
    title: string;
    price: number | null;
    educationalStage: string | null;
    bookingKind: string | null;
    totalBuyers: number;
    estimatedRevenue: number;
  };
  course2: {
    id: string;
    title: string;
    price: number | null;
    educationalStage: string | null;
    bookingKind: string | null;
    totalBuyers: number;
    estimatedRevenue: number;
  };
  metrics: {
    diffCount: number;
    percentChange: number;
    bothCount: number;
    retentionRate: number;
    course1OnlyCount: number;
    churnRate: number;
    course2OnlyCount: number;
    revenueDiff: number;
  };
  students: {
    course1Only: ComparisonStudent[];
    course2Only: ComparisonStudent[];
    both: ComparisonStudent[];
    allCourse1: ComparisonStudent[];
    allCourse2: ComparisonStudent[];
  };
}
