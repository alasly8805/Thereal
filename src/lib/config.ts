import { prisma } from "./prisma";

/**
 * Platform configuration — superadmin-editable constants that used to be
 * hardcoded. Values live in the PlatformConfig table; this module is the only
 * read/write path. A 60-second in-memory cache avoids a DB hit per request, and
 * setConfig() invalidates it immediately so edits take effect on the next call.
 */

export type ConfigType = "number" | "string" | "boolean";

interface ConfigDef {
  key: string;
  type: ConfigType;
  category: string;
  label: string;
  default: string;
}

/** The full catalog. Defaults render when a row is absent; the panel lists these. */
export const CONFIG_DEFINITIONS: ConfigDef[] = [
  // ── Auth & Security ──
  { key: "jwt_expiry_days", type: "number", category: "auth", label: "مدة صلاحية جلسة الدخول (أيام)", default: "7" },
  { key: "max_login_attempts", type: "number", category: "auth", label: "عدد محاولات الدخول قبل الإيقاف", default: "5" },
  { key: "lockout_minutes", type: "number", category: "auth", label: "مدة الإيقاف بعد المحاولات الفاشلة (دقائق)", default: "15" },
  { key: "student_session_timeout_minutes", type: "number", category: "auth", label: "مهلة جلسة الطالب (دقائق)", default: "10080" },
  { key: "teacher_session_timeout_minutes", type: "number", category: "auth", label: "مهلة جلسة المعلم (دقائق)", default: "10080" },
  { key: "password_min_length", type: "number", category: "auth", label: "الحد الأدنى لطول كلمة المرور", default: "6" },
  { key: "password_require_number", type: "boolean", category: "auth", label: "اشتراط رقم في كلمة المرور", default: "false" },
  { key: "password_require_uppercase", type: "boolean", category: "auth", label: "اشتراط حرف كبير في كلمة المرور", default: "false" },

  // ── Video & Content ──
  { key: "default_max_watches", type: "number", category: "video", label: "عدد المشاهدات الافتراضي للفيديو الجديد", default: "3" },
  { key: "watch_session_hours", type: "number", category: "video", label: "مدة جلسة المشاهدة (ساعات)", default: "4" },
  { key: "mark_complete_threshold", type: "number", category: "video", label: "نسبة إنهاء المحاضرة (%)", default: "60" },
  { key: "max_videos_per_folder", type: "number", category: "video", label: "الحد الأقصى للفيديوهات في المجلد", default: "100" },
  { key: "vdocipher_security_password", type: "string", category: "video", label: "كلمة مرور حماية VdoCipher للمعلمين (Security Passkey)", default: "" },
  { key: "sequential_access_enforced", type: "boolean", category: "video", label: "تفعيل إجبار مشاهدة الدروس بالترتيب (يطبّق إعداد الكورس)", default: "false" },

  // ── Assessment timing ──
  // Both default to ON: the platform's decision is that an assessment stays
  // open indefinitely. A student who loses connection mid-quiz, or comes back
  // to a homework a week later, is not punished for it. Teachers still set
  // timeLimitMinutes/dueAt on their content; these switches decide whether the
  // server actually enforces them, so turning either off restores the old
  // behaviour without re-editing every quiz.
  { key: "quiz_time_limit_disabled", type: "boolean", category: "assessment", label: "الاختبار مفتوح دائماً (إلغاء وقت الاختبار)", default: "true" },
  { key: "homework_deadline_disabled", type: "boolean", category: "assessment", label: "الواجب مفتوح دائماً (إلغاء موعد التسليم)", default: "true" },

  // ── Access Codes ──
  { key: "code_expiry_days", type: "number", category: "codes", label: "مدة صلاحية كود الوصول (أيام)", default: "365" },
  { key: "max_students_per_code", type: "number", category: "codes", label: "الحد الأقصى للطلاب لكل كود", default: "1" },
  { key: "code_auto_deactivate_uses", type: "number", category: "codes", label: "إيقاف الكود تلقائياً بعد عدد استخدامات (0 = معطّل)", default: "0" },

  // ── AI Study Plans ──
  { key: "ai_max_tokens", type: "number", category: "ai", label: "الحد الأقصى للـ tokens لكل طلب", default: "1000" },
  { key: "ai_plan_days_ahead", type: "number", category: "ai", label: "عدد الأيام المُولّدة مسبقاً للخطة", default: "1" },
  // AI essay grading. The platform switch only ALLOWS teachers to opt in — every
  // course still starts at aiEssayGradingMode = "off". Turning it off stops all
  // new essay grading/explanations platform-wide immediately (cost kill switch).
  { key: "ai_essay_grading_enabled", type: "boolean", category: "ai", label: "السماح بتصحيح الأسئلة المقالية بالذكاء الاصطناعي (مفتاح إيقاف عام)", default: "true" },
  { key: "ai_essay_max_chars", type: "number", category: "ai", label: "أقصى طول لإجابة مقالية تُرسل للذكاء الاصطناعي (حرف)", default: "6000" },
  { key: "ai_essay_explain_daily_limit", type: "number", category: "ai", label: "أقصى عدد شروحات «لماذا حصلت على هذه الدرجة» لكل طالب يومياً", default: "20" },
  // Daily practice (/practice). Questions are written at 02:00 Cairo; each
  // batch is one AI call of up to 6 questions (Arabic + English versions). Off = no new questions, no new
  // daily sets and no essay grading (cost kill switch).
  { key: "practice_enabled", type: "boolean", category: "ai", label: "تفعيل التدريبات اليومية للطلاب (مفتاح إيقاف عام)", default: "true" },
  { key: "practice_ai_batches_per_night", type: "number", category: "ai", label: "عدد دفعات توليد أسئلة التدريبات كل ليلة (6 أسئلة عربي + لغات لكل دفعة)", default: "40" },

  // ── Rate Limiting ──
  { key: "rate_max_requests_per_minute", type: "number", category: "rate", label: "أقصى عدد طلبات في الدقيقة لكل مستخدم", default: "120" },
  { key: "rate_max_quiz_per_hour", type: "number", category: "rate", label: "أقصى عدد محاولات اختبار في الساعة لكل طالب", default: "20" },
  { key: "rate_max_code_redemptions_per_day", type: "number", category: "rate", label: "أقصى عدد تفعيلات أكواد في اليوم لكل طالب", default: "10" },

  // ── Storage & Cleanup ──
  { key: "trash_purge_days", type: "number", category: "storage", label: "مدة الاحتفاظ بالمحذوفات قبل الحذف النهائي (أيام)", default: "30" },
  { key: "max_thumbnail_kb", type: "number", category: "storage", label: "أقصى حجم للصورة المصغّرة (KB)", default: "500" },
];

export const CATEGORY_LABELS: Record<string, string> = {
  auth: "المصادقة والأمان",
  video: "الفيديو والمحتوى",
  assessment: "توقيت الاختبارات والواجبات",
  codes: "أكواد الوصول",
  ai: "خطط الذكاء الاصطناعي",
  rate: "حدود المعدّل",
  storage: "التخزين والتنظيف",
};

const DEF_BY_KEY = new Map(CONFIG_DEFINITIONS.map((d) => [d.key, d]));

/**
 * Keys actually wired into runtime behavior. The rest are editable but not yet
 * enforced anywhere — the panel badges them so a superadmin doesn't trust a
 * setting that currently does nothing.
 */
const ENFORCED_KEYS = new Set([
  "jwt_expiry_days",
  "default_max_watches",
  "watch_session_hours",
  "mark_complete_threshold",
  "quiz_time_limit_disabled",
  "homework_deadline_disabled",
  "max_videos_per_folder",
  "ai_max_tokens",
  "ai_essay_grading_enabled",
  "ai_essay_max_chars",
  "ai_essay_explain_daily_limit",
  "practice_enabled",
  "practice_ai_batches_per_night",
  "trash_purge_days",
]);

// ── 60-second in-memory cache of the whole config map ──
let cache: Map<string, string> | null = null;
let cacheAt = 0;
const TTL_MS = 60_000;

async function loadAll(): Promise<Map<string, string>> {
  if (cache && Date.now() - cacheAt < TTL_MS) return cache;
  const map = new Map<string, string>();
  for (const d of CONFIG_DEFINITIONS) map.set(d.key, d.default);
  try {
    const rows = await prisma.platformConfig.findMany();
    for (const r of rows) if (DEF_BY_KEY.has(r.key)) map.set(r.key, r.value);
  } catch {
    /* table missing / db error → defaults only */
  }
  cache = map;
  cacheAt = Date.now();
  return map;
}

/** Drop the cache so the next read reflects a just-saved value. */
export function invalidateConfigCache() {
  cache = null;
  cacheAt = 0;
}

export async function getConfig(key: string): Promise<string> {
  const map = await loadAll();
  return map.get(key) ?? DEF_BY_KEY.get(key)?.default ?? "";
}

export async function getConfigNumber(key: string): Promise<number> {
  const n = Number(await getConfig(key));
  if (Number.isFinite(n)) return n;
  return Number(DEF_BY_KEY.get(key)?.default ?? 0);
}

export async function getConfigBool(key: string): Promise<boolean> {
  return (await getConfig(key)) === "true";
}

/**
 * Safety net for values that feed critical logic: never let a misconfigured
 * (or zero/negative) number break login, playback, or — worst case — trigger an
 * instant purge. Clamps to [min, max]; falls back to the definition default.
 */
export async function getConfigNumberClamped(
  key: string,
  min: number,
  max = Number.POSITIVE_INFINITY
): Promise<number> {
  let n = await getConfigNumber(key);
  if (!Number.isFinite(n) || n <= 0) n = Number(DEF_BY_KEY.get(key)?.default ?? min);
  return Math.min(Math.max(n, min), max);
}

/** Validate + persist a single setting, then invalidate the cache. */
export async function setConfig(key: string, value: unknown): Promise<void> {
  const def = DEF_BY_KEY.get(key);
  if (!def) throw new Error("Unknown config key");

  let str: string;
  if (def.type === "number") {
    const n = Number(value);
    if (!Number.isFinite(n)) throw new Error("قيمة رقمية غير صالحة");
    str = String(n);
  } else if (def.type === "boolean") {
    str = value === true || value === "true" ? "true" : "false";
  } else {
    str = String(value ?? "").slice(0, 2000);
  }

  await prisma.platformConfig.upsert({
    where: { key },
    update: { value: str, type: def.type, category: def.category, label: def.label },
    create: { key, value: str, type: def.type, category: def.category, label: def.label },
  });
  invalidateConfigCache();
}

/** Definitions merged with current values, grouped by category — for the panel. */
export async function getGroupedConfig() {
  const map = await loadAll();
  const groups: Record<string, { category: string; label: string; items: Array<ConfigDef & { value: string; enforced: boolean }> }> = {};
  for (const d of CONFIG_DEFINITIONS) {
    if (!groups[d.category]) {
      groups[d.category] = { category: d.category, label: CATEGORY_LABELS[d.category] ?? d.category, items: [] };
    }
    groups[d.category].items.push({ ...d, value: map.get(d.key) ?? d.default, enforced: ENFORCED_KEYS.has(d.key) });
  }
  return Object.values(groups);
}
