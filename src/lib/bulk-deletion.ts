import { timingSafeEqual } from "crypto";
import { prisma } from "./prisma";
import { getConfigNumberClamped } from "./config";

/**
 * Bulk account deletion — the superadmin "danger zone".
 *
 * Flow:
 *  - A request targets a scope: "students", "teachers", or "all" (= both).
 *    Admins, staff and superadmins are NEVER touched, regardless of scope.
 *  - Scheduled requests wait GRACE_DAYS before the accounts are soft-deleted;
 *    they can be cancelled any time during the wait. Accounts stay fully active
 *    until the soft-delete runs.
 *  - Instant requests (gated by BULK_DELETE_PASSWORD) soft-delete immediately.
 *  - Soft-deleted users land in the existing trash (DeletedStudents/Teachers),
 *    where the superadmin can restore them. After PURGE_DAYS they are removed
 *    permanently (teachers' courses go with them).
 *
 * No cron is required: runBulkMaintenance() is called lazily whenever the
 * superadmin touches the bulk-deletion endpoints, and can also be hit by a
 * server cron via the maintenance endpoint.
 */

export const GRACE_DAYS = 7; // scheduled wait before soft-delete
const DAY_MS = 86_400_000;

/** Recoverable window before permanent purge — superadmin-configurable (was 30). */
export async function getPurgeDays(): Promise<number> {
  // Clamp to ≥1 day so a stray 0 can never purge everything instantly.
  return getConfigNumberClamped("trash_purge_days", 1);
}

export type BulkScope = "all" | "students" | "teachers";
/** Roles a bulk request may ever delete. Superadmin/admin/staff are excluded. */
const SCOPE_ROLES: Record<BulkScope, string[]> = {
  all: ["student", "teacher"],
  students: ["student"],
  teachers: ["teacher"],
};

export function isBulkScope(v: unknown): v is BulkScope {
  return v === "all" || v === "students" || v === "teachers";
}

export function scopeRoles(scope: BulkScope): string[] {
  return SCOPE_ROLES[scope];
}

const SCOPE_LABEL: Record<BulkScope, string> = {
  all: "كل المتعلمين والمعلمين",
  students: "كل المتعلمين",
  teachers: "كل المعلمين",
};
export function scopeLabel(scope: BulkScope): string {
  return SCOPE_LABEL[scope];
}

// ─── Instant-delete password ──────────────────────────────────────────────────

function safeEqual(a: string, b: string): boolean {
  try {
    const ab = Buffer.from(a, "utf8");
    const bb = Buffer.from(b, "utf8");
    if (ab.length !== bb.length) return false;
    return timingSafeEqual(ab, bb);
  } catch {
    return false;
  }
}

/** True only when BULK_DELETE_PASSWORD is set AND matches. */
export function verifyBulkDeletePassword(password: string): boolean {
  const env = process.env.BULK_DELETE_PASSWORD;
  if (!env || !password) return false;
  return safeEqual(password, env);
}

export function bulkDeletePasswordConfigured(): boolean {
  return !!process.env.BULK_DELETE_PASSWORD;
}

// ─── Counting / preview ─────────────────────────────────────────────────────

/** How many live (non-deleted) accounts a scope would affect right now. */
export async function countScope(scope: BulkScope, opts?: { demoOnly?: boolean }): Promise<number> {
  return prisma.user.count({
    where: {
      role: { in: scopeRoles(scope) },
      isDeleted: false,
      ...(opts?.demoOnly ? { isDemo: true } : {}),
    },
  });
}

// ─── Soft delete ────────────────────────────────────────────────────────────

/**
 * Soft-deletes every live account in scope (sets isDeleted/deletedAt, blocks
 * login). Returns the number affected. `exceptId` is always spared.
 */
export async function softDeleteScope(scope: BulkScope, exceptId?: string): Promise<number> {
  const res = await prisma.user.updateMany({
    where: {
      role: { in: scopeRoles(scope) },
      isDeleted: false,
      ...(exceptId ? { id: { not: exceptId } } : {}),
    },
    data: { isDeleted: true, deletedAt: new Date(), isActive: false },
  });
  return res.count;
}

// ─── Maintenance: execute due requests + purge expired ────────────────────────

/** Runs any pending request whose executeAt has passed. */
export async function runDueBulkDeletions(): Promise<number> {
  const due = await prisma.bulkDeletionRequest.findMany({
    where: { status: "pending", executeAt: { lte: new Date() } },
  });
  let executed = 0;
  for (const req of due) {
    if (!isBulkScope(req.scope)) continue;
    const affected = await softDeleteScope(req.scope, req.requestedById);
    await prisma.bulkDeletionRequest.update({
      where: { id: req.id },
      data: { status: "executed", executedAt: new Date(), affectedCount: affected },
    });
    executed += 1;
  }
  return executed;
}

/**
 * Permanently removes student/teacher accounts soft-deleted more than
 * PURGE_DAYS ago. Teachers' courses are deleted first (FK safety). Superadmins
 * are never purged.
 */
export async function purgeExpiredDeletedUsers(): Promise<number> {
  const purgeDays = await getConfigNumberClamped("trash_purge_days", 1);
  const cutoff = new Date(Date.now() - purgeDays * DAY_MS);
  const expired = await prisma.user.findMany({
    where: {
      role: { in: ["student", "teacher"] },
      isDeleted: true,
      deletedAt: { lt: cutoff },
    },
    select: { id: true, role: true },
  });
  if (expired.length === 0) return 0;

  const teacherIds = expired.filter((u) => u.role === "teacher").map((u) => u.id);
  if (teacherIds.length > 0) {
    await prisma.course.deleteMany({ where: { teacherId: { in: teacherIds } } });
  }
  const ids = expired.map((u) => u.id);
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
  return ids.length;
}

/** Lazy maintenance hook — safe to call on every superadmin request. */
export async function runBulkMaintenance(): Promise<{ executed: number; purged: number }> {
  const executed = await runDueBulkDeletions();
  const purged = await purgeExpiredDeletedUsers();
  return { executed, purged };
}
