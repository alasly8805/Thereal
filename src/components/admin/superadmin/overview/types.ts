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

/** One student's purchase (or package-covered seat) of a paid course. */
export interface OverviewCoursePayment {
  id: string;
  studentId?: string;
  studentName: string;
  studentPhone: string;
  courseId: string;
  courseTitle: string;
  amount: number;
  coveredBySubscription: boolean;
  source?: string;
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
  coursePayments?: OverviewCoursePayment[];
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

/** Compact board reading — stored when the HQ page is opened, and reconstructed for the time machine. */
export interface OverviewKpis {
  capturedAt: string;
  totalStudents: number;
  totalTeachers: number;
  totalCourses: number;
  bookingsActiveNow: number;
  bookingsActiveStudents: number;
  uniquePaidStudents: number;
  bookingsAddedToday: number;
  revenueActive: number;
  pendingStudentCount: number;
  pendingTransactionCount: number;
  pendingAmount: number;
  gross: number;
  platformShare: number;
  teachersShare: number;
  expenses: number;
  net: number;
  expensesCount: number;
  defaultPercentage: number;
  customTeacherPctCount: number;
  totalPaidStudentsAcrossPlatform: number;
  totalActiveContentConsumers: number;
  totalRealReservations: number;
  totalRealPaidReservations: number;
  totalCourseEnrollmentsCount: number;
  totalCodesUsed: number;
  totalCodesBooked: number;
  totalGatewayDeposits: number;
  totalRevenue: number;
  teachersEarnedRevenue: number;
  accessMonitorAlertCount: number;
  outstandingValue: number | null;
  coveragePercent: number | null;
}

export type OverviewSnapshotSource = "page_open" | "pin" | "reconstructed";

export interface OverviewSnapshot {
  id: string;
  capturedAt: string;
  source: OverviewSnapshotSource;
  kpis: OverviewKpis;
}

export interface OverviewData {
  totalStudents: number;
  signupsByDay?: Array<{ date: string; count: number }>;
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
    activeStudents?: number;
    uniquePaidStudents?: number;
    addedToday: number;
    revenueActive: number;
    generatedAt: string;
  };
  pendingPayments?: {
    studentCount: number;
    transactionCount: number;
    amountPending: number;
    students: Array<{
      studentId: string;
      name: string;
      phone: string | null;
      transactions: Array<{
        id: string;
        amount: number;
        provider: "shakeout" | "sha7nawy";
        itemLabel: string;
        createdAt: string;
      }>;
    }>;
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
