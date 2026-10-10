import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { LiveAIDashboard } from "@/ai/admin/dashboard/LiveAIDashboard";
import { BudgetTracker } from "@/ai/admin/budget/BudgetTracker";
import { ProviderMonitor } from "@/ai/admin/monitoring/ProviderMonitor";

export async function GET() {
  try {
    const session = await getSession();
    if (!session || (session.role !== "superadmin" && session.role !== "owner")) {
      return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
    }

    const dashboard = LiveAIDashboard.getInstance().getDashboardData();
    const budget = BudgetTracker.getInstance().getSnapshot();
    const providerStats = ProviderMonitor.getInstance().getAllStats();

    const providers = Object.values(providerStats).map((p) => ({
      id: p.providerId,
      status: p.status,
      requests: p.requestCount,
      avgLatencyMs: p.requestCount > 0 ? Math.round(p.totalLatencyMs / p.requestCount) : 0,
      successRate: p.requestCount > 0 ? Math.round((p.successCount / p.requestCount) * 100) : null,
      fallbacks: p.fallbackCount,
    }));
    const activeProviders = providers.filter((p) => p.status === "Healthy").length;

    const cardsMap: Record<string, string | number> = {};
    for (const card of dashboard.cards || []) {
      cardsMap[card.label] = card.value;
    }
    // Real telemetry only. These counters live in memory and reset when the
    // server restarts — report 0 rather than inventing numbers.
    const num = (key: string) => {
      const n = Number(cardsMap[key]);
      return Number.isFinite(n) ? n : 0;
    };

    return NextResponse.json({
      status: providers.length === 0 ? "unknown" : activeProviders > 0 ? "healthy" : "degraded",
      requestsToday: num("requestsToday"),
      studentsUsingAI: num("studentsUsingAI"),
      teachersUsingAI: num("teachersUsingAI"),
      parentsReading: num("parentsReading"),
      todayCost: budget.globalDailyUsd || 0,
      monthCost: budget.globalMonthlyUsd || 0,
      todayTokens: num("todayTokens"),
      avgResponse: num("avgLatencyMs"),
      cacheHit: num("cacheHitRate"),
      budgetUsed: Math.min(100, Math.round(((budget.globalMonthlyUsd || 0) / 50) * 100)),
      providersOnline: `${activeProviders} / ${providers.length}`,
      providers,
      topSubjects: dashboard.subjectDistribution?.map((x) => ({ name: x.subject, count: x.requests })) ?? [],
    });
  } catch (err) {
    console.error("AI Overview API error:", err);
    return NextResponse.json({ error: "حدث خطأ أثناء تحميل البيانات" }, { status: 500 });
  }
}
