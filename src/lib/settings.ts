import { prisma } from "./prisma";

/** Platform-wide key/value settings (superadmin-editable). */

const TEACHER_GRACE_KEY = "teacher_delete_grace_days";
export const DEFAULT_TEACHER_GRACE_DAYS = 7;
export const MIN_GRACE_DAYS = 1;
export const MAX_GRACE_DAYS = 365;

// ── 60-second in-memory cache to eliminate repetitive DB queries on SSR renders ──
const settingsCache = new Map<string, { value: string; fetchedAt: number }>();
const CACHE_TTL_MS = 60_000;

async function getCachedSetting(key: string, ttlMs = CACHE_TTL_MS): Promise<string | null> {
  const cached = settingsCache.get(key);
  if (cached && Date.now() - cached.fetchedAt < ttlMs) {
    return cached.value;
  }
  try {
    const row = await prisma.appSetting.findUnique({ where: { key } });
    const val = row?.value ?? null;
    if (val !== null) {
      settingsCache.set(key, { value: val, fetchedAt: Date.now() });
    } else {
      settingsCache.delete(key);
    }
    return val;
  } catch {
    return cached ? cached.value : null;
  }
}

export function invalidateSettingsCache(key?: string) {
  if (key) {
    settingsCache.delete(key);
  } else {
    settingsCache.clear();
  }
}

export async function getTeacherGraceDays(): Promise<number> {
  try {
    const val = await getCachedSetting(TEACHER_GRACE_KEY);
    const n = val ? parseInt(val, 10) : NaN;
    if (Number.isFinite(n) && n >= MIN_GRACE_DAYS && n <= MAX_GRACE_DAYS) return n;
  } catch { /* table missing / db error → fall back */ }
  return DEFAULT_TEACHER_GRACE_DAYS;
}

export async function setTeacherGraceDays(days: number): Promise<number> {
  const clamped = Math.min(MAX_GRACE_DAYS, Math.max(MIN_GRACE_DAYS, Math.floor(days)));
  await prisma.appSetting.upsert({
    where: { key: TEACHER_GRACE_KEY },
    update: { value: String(clamped) },
    create: { key: TEACHER_GRACE_KEY, value: String(clamped) },
  });
  invalidateSettingsCache(TEACHER_GRACE_KEY);
  return clamped;
}

// ── Student device limit (account ↔ devices) ──────────────────────────────────
const STUDENT_MAX_DEVICES_KEY = "student_max_devices";
export const DEFAULT_STUDENT_MAX_DEVICES = 4;
export const MIN_DEVICES = 1;
export const MAX_DEVICES = 10;

export async function getStudentMaxDevices(): Promise<number> {
  try {
    const val = await getCachedSetting(STUDENT_MAX_DEVICES_KEY);
    const n = val ? parseInt(val, 10) : NaN;
    if (Number.isFinite(n) && n >= MIN_DEVICES && n <= MAX_DEVICES) return n;
  } catch { /* fall back */ }
  return DEFAULT_STUDENT_MAX_DEVICES;
}

export async function setStudentMaxDevices(n: number): Promise<number> {
  const clamped = Math.min(MAX_DEVICES, Math.max(MIN_DEVICES, Math.floor(n)));
  await prisma.appSetting.upsert({
    where: { key: STUDENT_MAX_DEVICES_KEY },
    update: { value: String(clamped) },
    create: { key: STUDENT_MAX_DEVICES_KEY, value: String(clamped) },
  });
  invalidateSettingsCache(STUDENT_MAX_DEVICES_KEY);
  return clamped;
}

// ── Maintenance mode (public site frozen behind a friendly screen) ────────────
const MAINTENANCE_KEY = "maintenance_mode";
const MAINTENANCE_MSG_KEY = "maintenance_message";
export const DEFAULT_MAINTENANCE_MESSAGE =
  "نُحضّر لكم تحديثاً جديداً ومميّزاً ✨ سنعود إليكم بعد قليل بحُلّة أفضل.";

export async function getMaintenanceMode(): Promise<boolean> {
  try {
    const val = await getCachedSetting(MAINTENANCE_KEY);
    return val === "on";
  } catch {
    return false;
  }
}

export async function setMaintenanceMode(on: boolean): Promise<boolean> {
  await prisma.appSetting.upsert({
    where: { key: MAINTENANCE_KEY },
    update: { value: on ? "on" : "off" },
    create: { key: MAINTENANCE_KEY, value: on ? "on" : "off" },
  });
  invalidateSettingsCache(MAINTENANCE_KEY);
  return on;
}

export async function getMaintenanceMessage(): Promise<string> {
  try {
    const val = await getCachedSetting(MAINTENANCE_MSG_KEY);
    return val?.trim() || DEFAULT_MAINTENANCE_MESSAGE;
  } catch {
    return DEFAULT_MAINTENANCE_MESSAGE;
  }
}

export async function setMaintenanceMessage(msg: string): Promise<string> {
  const value = (msg ?? "").trim().slice(0, 280);
  await prisma.appSetting.upsert({
    where: { key: MAINTENANCE_MSG_KEY },
    update: { value },
    create: { key: MAINTENANCE_MSG_KEY, value },
  });
  invalidateSettingsCache(MAINTENANCE_MSG_KEY);
  return value;
}

// ── Maintenance warning banner (displayed below navbar instead of locking users out) ──
const MAINTENANCE_WARNING_KEY = "maintenance_warning_banner";
export const DEFAULT_MAINTENANCE_WARNING_MESSAGE =
  "تنبيه مجدول: سيتم إجراء تحديث دوري لموارد السيرفر بعد دقيقة واحدة (قد يستمر التوقف 30-60 ثانية). يرجى حفظ أي إجابات أو أعمال مفتوحة.";

export async function getMaintenanceWarning(): Promise<{ active: boolean; message: string }> {
  try {
    const val = await getCachedSetting(MAINTENANCE_WARNING_KEY, 5000);
    const active = val === "on" || (val !== null && val !== "off" && val.trim() !== "");
    const message = await getMaintenanceMessage();
    return { active, message: message || DEFAULT_MAINTENANCE_WARNING_MESSAGE };
  } catch {
    return { active: false, message: DEFAULT_MAINTENANCE_WARNING_MESSAGE };
  }
}

export async function setMaintenanceWarning(on: boolean, msg?: string): Promise<boolean> {
  await prisma.appSetting.upsert({
    where: { key: MAINTENANCE_WARNING_KEY },
    update: { value: on ? "on" : "off" },
    create: { key: MAINTENANCE_WARNING_KEY, value: on ? "on" : "off" },
  });
  if (msg) {
    await setMaintenanceMessage(msg);
  }
  invalidateSettingsCache(MAINTENANCE_WARNING_KEY);
  return on;
}

