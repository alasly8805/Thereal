import { EDUCATIONAL_STAGES } from "@/types";

export interface StudentReportData {
  id?: string | null;
  name?: string | null;
  clerkId?: string | null;
  email?: string | null;
  phone?: string | null;
  parentPhone?: string | null;
  age?: number | null;
  educationalStage?: string | null;
  role?: string | null;
  isActive?: boolean | null;
  profileCompleted?: boolean | null;
  lastLoginAt?: string | Date | null;
  createdAt?: string | Date | null;
  points?: number | null;
  loginStreak?: number | null;
  streakFreezes?: number | null;
  referralCode?: string | null;
  code?: string | null;
  balance?: number | null;
  overallIQ?: number | null;
  practiceTrack?: string | null;
  isVerified?: boolean | null;
  verificationStatus?: string | null;
  parentVerified?: boolean | null;
  parentVerificationStatus?: string | null;
  parentToken?: {
    issueCount?: number | null;
    parentPhoneSnapshot?: string | null;
    lastAccessedAt?: string | null;
  } | null;

  // Progress & Media
  watchedCount?: number | null;
  totalVideos?: number | null;
  completedVideos?: Array<{
    id?: string;
    title: string;
    courseTitle?: string | null;
    folderName?: string | null;
    lastWatchedAt?: string | null;
    durationMinutes?: number | null;
  }> | null;

  // Quizzes & Homework
  quizResults?: Array<{
    id?: string;
    score: number;
    totalQ: number;
    completedAt?: string | null;
    quiz?: {
      id?: string;
      title: string;
      folder?: { course?: { id?: string; title?: string } | null } | null;
    };
  }> | null;
  homeworkSubmissions?: Array<{
    id?: string;
    score?: number | null;
    totalQ?: number | null;
    status?: string | null;
    completedAt?: string | null;
    homework?: {
      id?: string;
      title: string;
      course?: { id?: string; title?: string } | null;
    };
  }> | null;
  totalHomework?: number | null;

  // Courses & Subscriptions
  courses?: Array<{ id: string; title: string; subject?: string | null; teacher?: { name: string } | null }> | null;
  accessCodes?: Array<{
    id?: string;
    isActive?: boolean;
    course?: { id: string; title: string; subject?: string | null; teacher?: { name: string } | null };
  }> | null;
  studentSubscriptions?: Array<{
    id?: string;
    planLabel?: string | null;
    planType?: string | null;
    amount?: number | null;
    expiresAt?: string | null;
    teacher?: { name: string } | null;
  }> | null;

  // Devices
  devices?: Array<{ id?: string; label?: string | null; lastSeenAt?: string | null }> | null;
  maxDevices?: number | null;
}

export interface ReportFormatOptions {
  profileUrl?: string;
}

function resolveStageLabel(value?: string | null): string | null {
  if (!value) return null;
  const match = EDUCATIONAL_STAGES.find((s) => s.value.toLowerCase() === value.toLowerCase());
  if (match) return match.label;
  const stageMap: Record<string, string> = {
    sec_1: "أولى بكالوريا",
    sec_2: "ثانية بكالوريا",
    sec_3: "ثالثة بكالوريا",
    prep_1: "الصف الأول الإعدادي",
    prep_2: "الصف الثاني الإعدادي",
    prep_3: "الصف الثالث الإعدادي",
    prim_4: "الصف الرابع الابتدائي",
    prim_5: "الصف الخامس الابتدائي",
    prim_6: "الصف السادس الابتدائي",
  };
  return stageMap[value.toLowerCase()] || value;
}

function formatArDate(dInput?: string | number | Date | null): string | null {
  if (!dInput) return null;
  const d = new Date(dInput);
  if (isNaN(d.getTime())) return null;
  return d.toLocaleDateString("ar-EG", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function formatArDateTime(dInput?: string | number | Date | null): string | null {
  if (!dInput) return null;
  const d = new Date(dInput);
  if (isNaN(d.getTime())) return null;
  return d.toLocaleString("ar-EG", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Format a comprehensive, premium student report ready for WhatsApp.
 * Adheres strictly to the required template and omits empty/null fields.
 */
export function formatStudentReport(data: StudentReportData, options?: ReportFormatOptions): string {
  const lines: string[] = [];

  // Header
  lines.push("✦ تقرير الطالب - Code-Up ✦");
  lines.push("━━━━━━━━━━━━━━━━━━━━━");

  // Full Name
  if (data.name?.trim()) {
    lines.push(`👤 الاسم: ${data.name.trim()}`);
  }

  // Student Code (prefer referralCode or code or short ID)
  const studentCode = data.code || data.referralCode || data.id;
  if (studentCode) {
    lines.push(`🆔 الكود: ${studentCode}`);
  }

  // Stage / Level
  const stage = resolveStageLabel(data.educationalStage);
  if (stage) {
    lines.push(`📚 المستوى: ${stage}`);
  }

  // Parent Phone
  if (data.parentPhone?.trim()) {
    lines.push(`📱 ولي الأمر: ${data.parentPhone.trim()}`);
  }

  // Student Phone
  if (data.phone?.trim() && data.phone !== data.parentPhone) {
    lines.push(`📞 هاتف الطالب: ${data.phone.trim()}`);
  }

  // Email
  if (data.email?.trim()) {
    lines.push(`✉️ البريد: ${data.email.trim()}`);
  }

  // Age
  if (data.age != null && data.age > 0) {
    lines.push(`🎂 السن: ${data.age} سنة`);
  }

  // Points
  if (data.points != null && data.points > 0) {
    lines.push(`🏆 النقاط: ${data.points.toLocaleString("ar-EG")} نقطة`);
  }

  // Login Streak
  if (data.loginStreak != null && data.loginStreak > 0) {
    lines.push(`🔥 أيام التفاعل المتتالية: ${data.loginStreak.toLocaleString("ar-EG")} يوم`);
  }

  // Balance
  if (data.balance != null && data.balance > 0) {
    lines.push(`💰 رصيد المحفظة: ${data.balance.toLocaleString("ar-EG")} ج.م`);
  }

  // Overall IQ
  if (data.overallIQ != null && data.overallIQ > 0 && data.overallIQ !== 1000) {
    lines.push(`🧠 مستوى الذكاء: ${data.overallIQ}`);
  }

  // Parent Verification Status
  if (data.parentVerificationStatus) {
    const parentStatusLabels: Record<string, string> = {
      CONFIRMED: "مؤكد ✓",
      PENDING: "في الانتظار ⏳",
      REJECTED: "مرفوض ✕",
      UNVERIFIED: "غير موثق",
    };
    const parentLabel = parentStatusLabels[data.parentVerificationStatus] || (data.parentVerified ? "مؤكد ✓" : null);
    if (parentLabel) {
      lines.push(`🛡️ توثيق ولي الأمر: ${parentLabel}`);
    }
  } else if (data.parentVerified != null) {
    lines.push(`🛡️ توثيق ولي الأمر: ${data.parentVerified ? "مؤكد ✓" : "في الانتظار"}`);
  }

  // Account Verification
  if (data.verificationStatus && data.verificationStatus !== "UNVERIFIED") {
    const verMap: Record<string, string> = {
      VERIFIED: "موثق ✓",
      WAITING_FOR_OTP: "بانتظار رمز التفعيل ⏳",
    };
    lines.push(`🔐 حالة الحساب: ${verMap[data.verificationStatus] || data.verificationStatus}`);
  }

  // Devices count
  const deviceCount = data.devices?.length ?? 0;
  if (deviceCount > 0) {
    lines.push(`📱 الأجهزة المسجلة: ${deviceCount} جهاز`);
  }

  // Video Progress: [X/Y فيديو] - [Z%]
  const watched = data.watchedCount ?? (data.completedVideos ? data.completedVideos.length : 0);
  const total = data.totalVideos ?? 0;
  if (total > 0) {
    const pct = Math.round((watched / total) * 100);
    lines.push(`📊 التقدم: [${watched}/${total} فيديو] - [${pct}%]`);
  } else if (watched > 0) {
    lines.push(`📊 التقدم: [${watched} فيديو مكتمل]`);
  }

  // Last Activity
  const lastActiveStr = formatArDateTime(data.lastLoginAt);
  if (lastActiveStr) {
    lines.push(`⏰ آخر نشاط: ${lastActiveStr}`);
  }

  // Registration Date
  const regDateStr = formatArDate(data.createdAt);
  if (regDateStr) {
    lines.push(`📅 تاريخ التسجيل: ${regDateStr}`);
  }

  // Learning Status: [نشط / لم يبدأ / مكتمل]
  let statusStr = "نشط";
  if (data.isActive === false) {
    statusStr = "موقوف ⚠️";
  } else if (total > 0 && watched >= total) {
    statusStr = "مكتمل 🏆";
  } else if (watched === 0 && (!data.quizResults || data.quizResults.length === 0)) {
    statusStr = "لم يبدأ ⏳";
  } else {
    statusStr = "نشط ⚡";
  }
  lines.push(`🎯 الحالة: ${statusStr}`);

  // Enrolled Courses
  const coursesList: Array<{ title: string; teacher?: string | null }> = [];
  if (data.courses?.length) {
    for (const c of data.courses) {
      if (c.title) coursesList.push({ title: c.title, teacher: c.teacher?.name });
    }
  } else if (data.accessCodes?.length) {
    for (const ac of data.accessCodes) {
      if (ac.course?.title) {
        coursesList.push({ title: ac.course.title, teacher: ac.course.teacher?.name });
      }
    }
  }

  if (coursesList.length > 0) {
    lines.push("");
    lines.push(`📖 الكورسات المشترك بها (${coursesList.length}):`);
    for (const c of coursesList) {
      lines.push(c.teacher ? `• ${c.title} (أ. ${c.teacher})` : `• ${c.title}`);
    }
  }

  // Subscriptions (Teacher Plans)
  if (data.studentSubscriptions && data.studentSubscriptions.length > 0) {
    lines.push("");
    lines.push(`🎟️ باقات المعلمين:`);
    for (const sub of data.studentSubscriptions) {
      const exp = sub.expiresAt ? formatArDate(sub.expiresAt) : null;
      const tName = sub.teacher?.name ? `أ. ${sub.teacher.name}` : "";
      const expPart = exp ? ` · ينتهي: ${exp}` : "";
      lines.push(`• ${sub.planLabel || sub.planType || "باقة"} ${tName ? `(${tName})` : ""}${expPart}`);
    }
  }

  // Quiz Results Summary
  if (data.quizResults && data.quizResults.length > 0) {
    const validScores = data.quizResults.filter((q) => q.totalQ > 0);
    const avgScore = validScores.length
      ? Math.round(validScores.reduce((acc, q) => acc + (q.score / q.totalQ) * 100, 0) / validScores.length)
      : null;

    lines.push("");
    lines.push(
      avgScore != null
        ? `📝 نتائج الاختبارات (${data.quizResults.length} اختبار - متوسط ${avgScore}%):`
        : `📝 نتائج الاختبارات (${data.quizResults.length} اختبار):`
    );

    // List top 3 recent quizzes
    for (const q of data.quizResults.slice(0, 3)) {
      const qTitle = q.quiz?.title || "اختبار";
      const qScorePct = q.totalQ > 0 ? Math.round((q.score / q.totalQ) * 100) : Math.round(q.score);
      lines.push(`  - ${qTitle}: ${qScorePct}%`);
    }
  }

  // Homework Submissions Summary
  if (data.homeworkSubmissions && data.homeworkSubmissions.length > 0) {
    lines.push("");
    const totalHwStr = data.totalHomework ? ` من إجمالي ${data.totalHomework}` : "";
    lines.push(`📋 الواجبات: تم تسليم ${data.homeworkSubmissions.length}${totalHwStr} واجب`);
  }

  // Completed Videos List
  if (data.completedVideos && data.completedVideos.length > 0) {
    lines.push("");
    lines.push("📈 تفاصيل المشاهدة:");
    const maxVideosToShow = 25;
    const shownVideos = data.completedVideos.slice(0, maxVideosToShow);
    for (const v of shownVideos) {
      const parentName = v.courseTitle || v.folderName;
      lines.push(parentName ? `- ${v.title} (${parentName})` : `- ${v.title}`);
    }
    if (data.completedVideos.length > maxVideosToShow) {
      lines.push(`- وعدد ${data.completedVideos.length - maxVideosToShow} فيديو آخر مكتمل...`);
    }
  }

  // Link to Parent Follow Portal
  const studentCode = data.code || (data as any).shareCode || (data as any).studentCode || data.referralCode || data.id || "";
  const origin = typeof window !== "undefined" ? window.location.origin : "https://code-up.tech";
  const parentLink = options?.profileUrl || `${origin}/p/${studentCode}`;

  lines.push("");
  lines.push(`🔗 رابط متابعة ولي الأمر: ${parentLink}`);

  // Footer with Current Arabic Date & Time
  lines.push("━━━━━━━━━━━━━━━━━━━━━");
  const now = new Date();
  const currentFormatted = now.toLocaleString("ar-EG", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  lines.push(`تم النسخ من منصة Code-Up | ${currentFormatted}`);

  return lines.join("\n");
}
