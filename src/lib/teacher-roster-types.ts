export const STAGE_LABELS: Record<string, string> = {
  sec_1: "أولى بكالوريا",
  sec_2: "ثانية بكالوريا",
  sec_3: "ثالثة ثانوية",
};

export type RosterStudentKind = "booking" | "course_purchase" | "grant";

export type RosterCourseLink = {
  id: string;
  title: string;
  amount: number;
  covered: boolean;
  source: string;
};

export type RosterStudent = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  parentPhone: string | null;
  educationalStage: string | null;
  kind: RosterStudentKind;
  planType: string | null;
  planLabel: string | null;
  languageTrack: string | null;
  bookingAmount: number;
  courseAmount: number;
  totalAmount: number;
  paymentSource: string | null;
  paymentRef: string | null;
  status: string;
  createdAt: string;
  subscriptionId: string | null;
  courses: RosterCourseLink[];
};

export type RosterCourse = {
  id: string;
  title: string;
  isPaid: boolean;
  price: number;
  enrolled: number;
  paidCount: number;
  coveredCount: number;
  revenue: number;
};

export type TeacherRoster = {
  teacher: { id: string; name: string };
  stats: {
    totalStudents: number;
    bookingStudents: number;
    courseOnlyStudents: number;
    grantStudents: number;
    freeCourseStudents: number;
    bookingRevenue: number;
    courseRevenue: number;
    totalRevenue: number;
    monthly: number;
    termly: number;
    yearly: number;
    arabic: number;
    languages: number;
    byStage: Record<string, number>;
  };
  courses: RosterCourse[];
  students: RosterStudent[];
};
