import type { BookingIntelligenceData } from "@/components/admin/superadmin/BookingIntelligenceSection";

export interface TeacherCourse {
  id: string;
  title: string;
  subject: string;
  educationalStage: string;
  isPaid: boolean;
  price: number;
  discountPercent?: number | null;
  totalCodes?: number;
  usedCodes?: number;
  availableCodes?: number;
  directEnrollments?: number;
  enrolledStudents: number;
  paidStudents?: number;
  coursePaidStudentsCount?: number;
  courseCoveredBySubCount?: number;
  freeStudents?: number;
  revenue: number;
  createdAt?: string;
}

export interface OverviewSubscription {
  id: string;
  studentName: string;
  studentPhone: string;
  planType: string;
  planLabel: string;
  amount: number;
  isPaid?: boolean;
  educationalStage: string;
  languageTrack: string;
  paymentSource?: string;
  paymentRef?: string | null;
  gatewayProvider?: string | null;
  hasGatewayAttempt?: boolean;
  registeredBy?: string;
  createdAt: string;
}

export interface PlanPricingStage {
  key: string;
  label: string;
  bookingEnabled: boolean;
  monthly: number;
  termly: number;
  yearly: number;
  languagesMonthly: number;
  languagesTermly: number;
  languagesYearly: number;
}

export interface PlanPricing {
  hasProfile: boolean;
  slug: string | null;
  isPublished: boolean;
  usesDefaults: boolean;
  base: { monthly: number; termly: number; yearly: number };
  discounts: { monthly: number; termly: number; yearly: number };
  enableLanguagesTrack: boolean;
  languagesSurcharge: { monthly: number; termly: number; yearly: number };
  stages: PlanPricingStage[];
}

export interface OverviewTeacher {
  id: string;
  name: string;
  email: string;
  createdAt: string;
  totalCourses: number;
  totalCodes?: number;
  usedCodes?: number;
  availableCodes?: number;
  totalStudents?: number;
  courseEnrolledStudents?: number;
  realReservationsCount: number;
  realPaidReservationsCount?: number;
  realFreeReservationsCount?: number;
  realReservationsRevenue: number;
  totalPaidStudents?: number;
  totalFreeStudents?: number;
  coursesRevenue?: number;
  totalRevenue: number;
  platformPercentage?: number;
  platformShare?: number;
  teacherShare?: number;
  planPricing?: PlanPricing;
  subscriptions: OverviewSubscription[];
  courses: TeacherCourse[];
}

export interface CoursePricingRow {
  id: string;
  title: string;
  subject: string;
  teacherName: string;
  isPaid: boolean;
  price: number;
  discountPercent: number | null;
  enrolledStudents: number;
  paidStudents: number;
  coursePaidStudentsCount: number;
  courseCoveredBySubCount: number;
  freeStudents: number;
  revenue: number;
  usedCodes: number;
  createdAt: string;
}

export interface AccessMonitorEvent {
  kind: "subscription" | "enrollment" | "debit";
  id: string;
  studentName: string;
  target: string;
  amount: number;
  source: string;
  createdAt: string;
  severity: "ok" | "warn" | "alert";
  reason: string;
}

export interface OverviewData {
  totalStudents: number;
  totalTeachers: number;
  totalCourses: number;
  totalRealReservations?: number;
  totalRealPaidReservations?: number;
  totalPaidStudentsAcrossPlatform?: number;
  totalCourseEnrollmentsCount?: number;
  totalActiveContentConsumers?: number;
  totalCodesBooked?: number;
  totalCodesUsed?: number;
  teachersEarnedRevenue?: number;
  totalGatewayDeposits?: number;
  totalRevenue: number;
  bookings?: {
    activeNow: number;
    addedToday: number;
    revenueActive: number;
    generatedAt: string;
  };
  bookingIntelligence?: BookingIntelligenceData;
  coursesPricing?: CoursePricingRow[];
  accessMonitor?: AccessMonitorEvent[];
  accessMonitorAlertCount?: number;
  moneyControl?: {
    defaultPercentage: number;
    teacherPercentages: Record<string, number>;
    totalGrossRevenue: number;
    totalPlatformShare: number;
    totalTeachersShare: number;
    totalExpenses: number;
    netPlatformProfit: number;
    expensesCount: number;
  };
  teachers: OverviewTeacher[];
}
