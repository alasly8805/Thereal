import type { OverviewData, OverviewKpis } from "./types";

export function extractKpis(overview: OverviewData, capturedAt = new Date().toISOString()): OverviewKpis {
  const mc = overview.moneyControl;
  const gross = mc?.totalGrossRevenue ?? overview.totalRevenue ?? 0;
  const platformShare = mc?.totalPlatformShare ?? 0;
  const teachersShare = mc?.totalTeachersShare ?? Math.max(0, gross - platformShare);
  const expenses = mc?.totalExpenses ?? 0;
  const net = mc?.netPlatformProfit ?? platformShare - expenses;
  const bi = overview.bookingIntelligence;

  return {
    capturedAt,
    totalStudents: overview.totalStudents ?? 0,
    totalTeachers: overview.totalTeachers ?? 0,
    totalCourses: overview.totalCourses ?? 0,
    bookingsActiveNow: overview.bookings?.activeNow ?? 0,
    bookingsActiveStudents: overview.bookings?.activeStudents ?? 0,
    uniquePaidStudents: overview.bookings?.uniquePaidStudents ?? 0,
    bookingsAddedToday: overview.bookings?.addedToday ?? 0,
    revenueActive: overview.bookings?.revenueActive ?? 0,
    pendingStudentCount: overview.pendingPayments?.studentCount ?? 0,
    pendingTransactionCount: overview.pendingPayments?.transactionCount ?? 0,
    pendingAmount: overview.pendingPayments?.amountPending ?? 0,
    gross,
    platformShare,
    teachersShare,
    expenses,
    net,
    expensesCount: mc?.expensesCount ?? 0,
    defaultPercentage: mc?.defaultPercentage ?? 25,
    customTeacherPctCount: Object.keys(mc?.teacherPercentages ?? {}).length,
    totalPaidStudentsAcrossPlatform: overview.totalPaidStudentsAcrossPlatform ?? 0,
    totalActiveContentConsumers: overview.totalActiveContentConsumers ?? 0,
    totalRealReservations: overview.totalRealReservations ?? 0,
    totalRealPaidReservations: overview.totalRealPaidReservations ?? 0,
    totalCourseEnrollmentsCount: overview.totalCourseEnrollmentsCount ?? 0,
    totalCodesUsed: overview.totalCodesUsed ?? 0,
    totalCodesBooked: overview.totalCodesBooked ?? 0,
    totalGatewayDeposits: overview.totalGatewayDeposits ?? 0,
    totalRevenue: overview.totalRevenue ?? 0,
    teachersEarnedRevenue: overview.teachersEarnedRevenue ?? gross,
    accessMonitorAlertCount: overview.accessMonitorAlertCount ?? 0,
    outstandingValue: bi ? bi.totals.outstandingValue : null,
    coveragePercent: bi ? bi.totals.coveragePercent : null,
  };
}

export const KPI_LORE: Record<keyof Omit<OverviewKpis, "capturedAt">, { title: string; body: string }> = {
  bookingsActiveNow: {
    title: "حجوزات نشطة الآن",
    body: "اشتراكات معلمين سارية لم ينتهِ تاريخها بعد. هذا ليس كل من دفع عبر الزمن — إذا انتهى الاشتراك يخرج من الرقم فوراً.",
  },
  bookingsActiveStudents: {
    title: "طلاب ساري حجزهم",
    body: "عدد الطلاب المختلفين الذين لديهم حجز معلم ساري. طالب واحد قد يملك أكثر من حجز، لذلك هذا الرقم أصغر أو يساوي الحجوزات النشطة.",
  },
  uniquePaidStudents: {
    title: "طلاب دفعوا حجز معلم",
    body: "طلاب مختلفون دفعوا اشتراك معلم مرة واحدة على الأقل — حتى لو انتهى الحجز. هذا رقم تراكمي، لا يهبط عندما ينتهي الاشتراك.",
  },
  bookingsAddedToday: {
    title: "حجوزات اليوم",
    body: "اشتراكات أُنشئت منذ منتصف الليل (بتوقيت الخادم). يشمل المدفوع والمجاني إذا كان سجل الحجز قد أُنشئ اليوم.",
  },
  revenueActive: {
    title: "قيمة الاشتراكات السارية",
    body: "مجموع مبالغ الحجوزات التي لم تنتهِ بعد. ليست إيراداً جديداً اليوم، بل قيمة العقود التي ما زالت شغّالة.",
  },
  pendingStudentCount: {
    title: "طلاب عالقون في الدفع",
    body: "فتحوا فاتورة بوابة دفع ولم تُؤكد بعد، وليس لديهم حجز ساري ولا كورس مدفوع. لا يدخلون رقم الحجوزات النشطة حتى تضغط «اعتباره مدفوعاً» أو تؤكد البوابة الدفع.",
  },
  pendingTransactionCount: {
    title: "فواتير معلّقة",
    body: "عدد محاولات الدفع غير المكتملة. طالب واحد قد يملك أكثر من فاتورة معلّقة.",
  },
  pendingAmount: {
    title: "مبلغ معلّق",
    body: "مجموع الفواتير التي بدأت ولم تكتمل. هذا مال لم يدخل المنصة بعد.",
  },
  totalStudents: {
    title: "الطلاب المسجلون",
    body: "حسابات طلاب حقيقية نشطة: غير محذوفة وليست حساب فحص (QA). هذا عدد الحسابات، لا عدد الحجوزات.",
  },
  totalTeachers: {
    title: "المعلمون",
    body: "حسابات المعلمين النشطة غير المحذوفة. كل معلم يمكن أن يملك كورسات وحجوزات باقات.",
  },
  totalCourses: {
    title: "الكورسات",
    body: "كل كورسات المعلمين المنشورة في اللوحة، المدفوعة والمجانية.",
  },
  totalPaidStudentsAcrossPlatform: {
    title: "طلاب سُجّلوا في كورس مدفوع",
    body: "طلاب مختلفون مسجّلون في كورس مدفوع (منهج). يشمل منح الإدارة، وليس بالضرورة دفع بوابة. لا يساوي حجوزات الباقات.",
  },
  totalActiveContentConsumers: {
    title: "يشاهدون فعلاً",
    body: "طلاب فتحوا محتوى كورس مدفوع أكثر من ١٠ ثوانٍ أو أنهوا فيديو. هذا استهلاك حقيقي، لا مجرد تسجيل.",
  },
  totalRealReservations: {
    title: "إجمالي حجوزات الباقات",
    body: "كل سجلات اشتراك المعلم النشطة حالياً في اللوحة، مدفوعة ومجانية. يشمل من انتهى يومه ما دام السجل ما زال active حسب النظام.",
  },
  totalRealPaidReservations: {
    title: "حجوزات مدفوعة",
    body: "حجوزات الباقات التي مبلغها أكبر من صفر. الفرق بينها وبين الإجمالي = الحجوزات المجانية / المنح.",
  },
  totalCourseEnrollmentsCount: {
    title: "تسجيلات الكورسات المدفوعة",
    body: "عدد صفوف التسجيل في الكورسات المدفوعة الحقيقية (بدون الدروس المنفردة والتعريفية). طالب في كورسين يُحسب مرتين.",
  },
  totalCodesUsed: {
    title: "أكواد مستخدمة",
    body: "أكواد وصول رُبطت بطالب. المقام هو إجمالي الأكواد المُنشأة.",
  },
  totalCodesBooked: {
    title: "إجمالي أكواد الوصول",
    body: "كل أكواد الوصول المُنشأة للكورسات، مستخدمة وغير مستخدمة.",
  },
  gross: {
    title: "إجمالي المدفوع (Gross)",
    body: "ما دفعه الطلاب فعلاً للمعلمين بعد إزالة التكرار (باقة المعلم تغطي كورساته فلا تُحسب مرتين) وبدون الكورسات المجانية.",
  },
  teachersShare: {
    title: "مستحقات المعلمين",
    body: "حصة المعلمين من الإجمالي حسب النسبة الافتراضية أو النسبة المخصصة لكل معلم من «التحكم في الأموال».",
  },
  platformShare: {
    title: "حصة المنصة",
    body: "ما تأخذه المنصة من الإجمالي قبل خصم المصروفات. النسبة الافتراضية تظهر في الشريط الذهبي.",
  },
  expenses: {
    title: "المصروفات",
    body: "بنود المصروفات المسجّلة في التحكم في الأموال. تُخصم من حصة المنصة لا من إجمالي الطلاب.",
  },
  net: {
    title: "صافي ربح المنصة",
    body: "حصة المنصة ناقص المصروفات. هذا «سكور» المقر — الرقم الذي يبقى بعد تقسيم الغنائم ودفع التكاليف.",
  },
  expensesCount: {
    title: "عدد بنود المصروفات",
    body: "كم بند مصروف مفتوح في التحكم في الأموال، لا مجموع المبالغ.",
  },
  defaultPercentage: {
    title: "نسبة المنصة الافتراضية",
    body: "النسبة التي تُطبَّق على أي معلم بلا نسبة مخصصة. تُغيَّر من التحكم في الأموال.",
  },
  customTeacherPctCount: {
    title: "معلمون بنسبة مخصصة",
    body: "عدد المعلمين الذين لهم نسبة منصة مختلفة عن الافتراضي.",
  },
  totalGatewayDeposits: {
    title: "إيداعات بوابات الدفع",
    body: "مجموع الشحنات المكتملة عبر شحناوي وShake-Out والأكواد والشحن اليدوي. قد يختلف عن Gross لأن طريقة الحساب مختلفة.",
  },
  totalRevenue: {
    title: "الإيراد المعتمد",
    body: "الأكبر بين إيراد المعلمين المحسوب وإيداعات البوابات — حتى لا نُظهر رقم أقل من الأموال التي دخلت فعلاً.",
  },
  teachersEarnedRevenue: {
    title: "إيراد المعلمين المحسوب",
    body: "مجموع ما نُسب للمعلمين بعد إزالة التكرار بين الباقة والكورس.",
  },
  accessMonitorAlertCount: {
    title: "تنبيهات المراقبة",
    body: "حجوزات صفرية أو تسجيلات كورس مدفوع بلا دفع وبلا سجل لوحة موثّق. تحتاج مراجعة في تبويب المراقبة.",
  },
  outstandingValue: {
    title: "أموال مقابل محتوى لم يُنشر",
    body: "قيمة أشهر دفعها الطلاب ولم ينشر المعلم محتواها بعد. المال دخل، لكن المحتوى ما زال دَيناً على المنصة.",
  },
  coveragePercent: {
    title: "تغطية المحتوى",
    body: "نسبة الأشهر المنشورة إلى الأشهر المدفوعة في ذكاء الحجوزات. تحت ٦٠٪ تعني فجوة محتوى كبيرة.",
  },
};

export type KpiKey = keyof typeof KPI_LORE;
