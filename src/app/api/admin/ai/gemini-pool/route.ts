import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { GeminiClusterDashboard, GeminiKeyView } from "@/ai/admin/monitoring/GeminiClusterDashboard";

export async function GET() {
  try {
    const session = await getSession();
    if (!session || (session.role !== "superadmin" && session.role !== "owner")) {
      return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
    }

    const cluster = GeminiClusterDashboard.getInstance().getSummary();

    const keys = (cluster.keys || []).map((k: GeminiKeyView) => ({
      displayName: k.displayName,
      status: k.status,
      requestsToday: k.dailyRequests || 0,
      remainingQuota: typeof k.remainingQuota === "number" ? k.remainingQuota : null,
      latencyMs: k.averageLatencyMs || 0,
      lastError: k.lastError ? String(k.lastError) : null,
    }));

    return NextResponse.json({ keys });
  } catch (err) {
    console.error("AI Gemini Pool API error:", err);
    return NextResponse.json({ error: "حدث خطأ" }, { status: 500 });
  }
}
