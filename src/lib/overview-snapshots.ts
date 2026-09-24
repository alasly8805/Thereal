import { prisma } from "@/lib/prisma";
import type { OverviewKpis, OverviewSnapshot, OverviewSnapshotSource } from "@/components/admin/superadmin/overview/types";

const SNAPSHOT_KEY = "overview_hq_snapshots";
const MAX_SNAPSHOTS = 120;
const DEDUPE_MS = 2 * 60 * 1000;

function kpisEqual(a: OverviewKpis, b: OverviewKpis) {
  const skip = new Set(["capturedAt"]);
  const keys = Object.keys(a) as Array<keyof OverviewKpis>;
  return keys.every((k) => skip.has(k) || a[k] === b[k]);
}

export async function listOverviewSnapshots(): Promise<OverviewSnapshot[]> {
  try {
    const row = await prisma.appSetting.findUnique({ where: { key: SNAPSHOT_KEY } });
    if (!row?.value) return [];
    const parsed = JSON.parse(row.value) as OverviewSnapshot[];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((s) => s && s.id && s.capturedAt && s.kpis)
      .sort((a, b) => new Date(b.capturedAt).getTime() - new Date(a.capturedAt).getTime());
  } catch {
    return [];
  }
}

export async function persistOverviewSnapshot(
  kpis: OverviewKpis,
  source: Exclude<OverviewSnapshotSource, "reconstructed">
): Promise<OverviewSnapshot> {
  const existing = await listOverviewSnapshots();
  const newest = existing[0];
  const now = Date.now();
  if (
    newest &&
    source !== "pin" &&
    now - new Date(newest.capturedAt).getTime() < DEDUPE_MS &&
    kpisEqual(newest.kpis, kpis)
  ) {
    return newest;
  }

  const snapshot: OverviewSnapshot = {
    id: `snap_${now.toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    capturedAt: kpis.capturedAt || new Date().toISOString(),
    source,
    kpis: { ...kpis, capturedAt: kpis.capturedAt || new Date().toISOString() },
  };
  const next = [snapshot, ...existing].slice(0, MAX_SNAPSHOTS);
  await prisma.appSetting.upsert({
    where: { key: SNAPSHOT_KEY },
    update: { value: JSON.stringify(next) },
    create: { key: SNAPSHOT_KEY, value: JSON.stringify(next) },
  });
  return snapshot;
}
