export const ASSISTANT_PERMISSION_KEYS = [
  "createCourses",
  "editCourses",
  "manageHomework",
  "gradeHomework",
  "viewStudents",
  "viewStudentPhones",
  "manageCodes",
  "viewQuizResults",
  "manageRequests",
  "manageTickets",
] as const;

export type AssistantPermission = (typeof ASSISTANT_PERMISSION_KEYS)[number];

export type AssistantPermissions = Record<AssistantPermission, boolean>;

export const DEFAULT_ASSISTANT_PERMISSIONS: AssistantPermissions = {
  createCourses: false,
  editCourses: false,
  manageHomework: false,
  gradeHomework: true,
  viewStudents: true,
  viewStudentPhones: true,
  manageCodes: false,
  viewQuizResults: true,
  manageRequests: false,
  manageTickets: true,
};

export const ALL_ASSISTANT_PERMISSIONS: AssistantPermissions = {
  createCourses: true,
  editCourses: true,
  manageHomework: true,
  gradeHomework: true,
  viewStudents: true,
  viewStudentPhones: true,
  manageCodes: true,
  viewQuizResults: true,
  manageRequests: true,
  manageTickets: true,
};

export const ASSISTANT_PERMISSION_META: Array<{
  key: AssistantPermission;
  label: string;
  hint: string;
}> = [
  { key: "createCourses", label: "إنشاء كورسات", hint: "يقدر يضيف كورس جديد باسم المدرّس" },
  { key: "editCourses", label: "تعديل الكورسات والمحاضرات", hint: "رفع فيديوهات، مجلدات، إعدادات الكورس" },
  { key: "manageHomework", label: "إدارة الواجبات", hint: "إنشاء وتعديل الواجبات" },
  { key: "gradeHomework", label: "تصحيح الواجبات", hint: "مراجعة وتصحيح كل تسليمات الطلاب" },
  { key: "viewStudents", label: "عرض الطلاب", hint: "يشوف قائمة الطلاب المسجّلين" },
  { key: "viewStudentPhones", label: "أرقام الطلاب", hint: "يشوف رقم الموبايل ويتصل أو يبعت واتساب" },
  { key: "manageCodes", label: "أكواد الوصول", hint: "توليد وتفعيل وتعطيل الأكواد" },
  { key: "viewQuizResults", label: "نتائج الاختبارات", hint: "سجل الاختبارات، عرض الإجابات، وتصحيح الأسئلة المقالية" },
  { key: "manageRequests", label: "طلبات المشاهدات والدرجات", hint: "الموافقة أو الرفض على طلبات الطلاب" },
  { key: "manageTickets", label: "تذاكر الدعم", hint: "الرد على استفسارات الطلاب" },
];

export function parseAssistantPermissions(raw?: string | null): AssistantPermissions {
  const base = { ...DEFAULT_ASSISTANT_PERMISSIONS };
  if (!raw) return base;
  try {
    const parsed = JSON.parse(raw) as Partial<Record<string, boolean>>;
    for (const key of ASSISTANT_PERMISSION_KEYS) {
      if (typeof parsed[key] === "boolean") base[key] = parsed[key]!;
    }
  } catch {
    // keep defaults
  }
  return base;
}

export function isTeacherLike(role?: string | null): boolean {
  return role === "teacher" || role === "assistant";
}

export function actingTeacherId(session: {
  id: string;
  role: string;
  assistantOfTeacherId?: string | null;
}): string {
  if (session.role === "assistant" && session.assistantOfTeacherId) {
    return session.assistantOfTeacherId;
  }
  return session.id;
}

export function hasAssistantPermission(
  session: {
    role: string;
    assistantPermissions?: AssistantPermissions | null;
  },
  permission: AssistantPermission
): boolean {
  if (session.role === "teacher" || session.role === "superadmin" || session.role === "admin") {
    return true;
  }
  if (session.role !== "assistant") return false;
  return Boolean(session.assistantPermissions?.[permission]);
}

export function sectionAllowedForAssistant(
  sectionId: string,
  permissions: AssistantPermissions
): boolean {
  const map: Record<string, AssistantPermission | true> = {
    dashboard: true,
    courses: true,
    "create-course": "createCourses",
    homework: "manageHomework",
    review: "gradeHomework",
    "quiz-results": "viewQuizResults",
    "in-video-responses": "viewQuizResults",
    "exam-dashboard": "viewQuizResults",
    "grade-requests": "manageRequests",
    "teacher-subscriptions": "viewStudents",
    students: "viewStudents",
    codes: "manageCodes",
    "referred-students": "viewStudents",
    requests: "manageRequests",
    tickets: "manageTickets",
    feedback: "manageTickets",
    assistants: true, // hidden separately — teachers only
    "my-page": true, // hidden separately
  };
  const need = map[sectionId];
  if (need === undefined) return false;
  if (need === true) return true;
  return permissions[need];
}

export function maskPhone(phone?: string | null): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 7) return "••••";
  return `${digits.slice(0, 3)}••••${digits.slice(-2)}`;
}

export function applyPhoneVisibility<T extends Record<string, unknown>>(
  row: T,
  canSeePhones: boolean,
  keys: string[] = ["phone", "parentPhone", "studentPhone"]
): T {
  if (canSeePhones) return row;
  const next = { ...row };
  for (const key of keys) {
    if (key in next && typeof next[key] === "string") {
      (next as Record<string, unknown>)[key] = maskPhone(next[key] as string);
    }
  }
  return next;
}

export function generateAssistantPassword(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const bytes = new Uint8Array(10);
  crypto.getRandomValues(bytes);
  let out = "";
  for (const b of bytes) out += alphabet[b % alphabet.length];
  return out;
}
