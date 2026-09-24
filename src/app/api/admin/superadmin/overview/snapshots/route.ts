import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { extractKpis } from "@/components/admin/superadmin/overview/kpis";
import type { OverviewData, OverviewKpis, OverviewSnapshotSource } from "@/components/admin/superadmin/overview/types";
import { listOverviewSnapshots, persistOverviewSnapshot } from "@/lib/overview-snapshots";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  if (!session || !["superadmin", "admin", "staff"].includes(session.role)) {
    return NextResponse.json({ error: "غير مصرح" }, { status: 403 });
  }
  const snapshots = await listOverviewSnapshots();
  return NextResponse.json({ snapshots });
}

/** Pin the current live board, or persist KPIs the client already computed. */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || !["superadmin", "admin", "staff"].includes(session.role)) {
    return NextResponse.json({ error: "غير مصرح" }, { status: 403 });
  }

  let body: { source?: string; overview?: OverviewData; kpis?: OverviewKpis };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "طلب غير صالح" }, { status: 400 });
  }

  const source: Exclude<OverviewSnapshotSource, "reconstructed"> =
    body.source === "pin" ? "pin" : "page_open";

  const kpis = body.kpis
    ? { ...body.kpis, capturedAt: body.kpis.capturedAt || new Date().toISOString() }
    : body.overview
      ? extractKpis(body.overview)
      : null;

  if (!kpis) {
    return NextResponse.json({ error: "بيانات النظرة العامة مطلوبة" }, { status: 400 });
  }

  const snapshot = await persistOverviewSnapshot(kpis, source);
  return NextResponse.json({ snapshot });
}
