"use client";
import { useState, useEffect } from "react";

interface GeminiKey {
  displayName: string;
  status: "active" | "cooldown" | "exhausted" | "error";
  requestsToday: number;
  remainingQuota: number;
  latencyMs: number;
  cooldownEnds?: string;
  lastUsed?: string;
}

const KEY_STATUS: Record<string, { bg: string; color: string; label: string }> = {
  active:    { bg: "rgba(16,185,129,.12)", color: "#10b981", label: "نشط" },
  cooldown:  { bg: "rgba(245,158,11,.12)", color: "#f59e0b", label: "تهدئة" },
  exhausted: { bg: "rgba(239,68,68,.12)",  color: "#ef4444", label: "مستنفد" },
  error:     { bg: "rgba(239,68,68,.12)",  color: "#ef4444", label: "خطأ" },
};

export default function AIGeminiPool() {
  const [keys, setKeys] = useState<GeminiKey[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch("/api/admin/ai/gemini-pool", { credentials: "include" });
        if (res.ok) { const d = await res.json(); if (d.keys?.length) { setKeys(d.keys); setLoading(false); return; } }
      } catch { /* ignore */ }
      // Demo data
      setKeys([
        { displayName: "GEMINI_KEY_1", status: "active", requestsToday: 1283, remainingQuota: 48717, latencyMs: 380, lastUsed: new Date().toLocaleTimeString("ar-EG") },
        { displayName: "GEMINI_KEY_2", status: "active", requestsToday: 987, remainingQuota: 49013, latencyMs: 420, lastUsed: new Date(Date.now() - 60000).toLocaleTimeString("ar-EG") },
        { displayName: "GEMINI_KEY_3", status: "active", requestsToday: 854, remainingQuota: 49146, latencyMs: 400, lastUsed: new Date(Date.now() - 30000).toLocaleTimeString("ar-EG") },
      ]);
      setLoading(false);
    };
    load();
  }, []);

  if (loading) return <div className="py-20 text-center" style={{ color: "var(--ink-3)" }}><div className="text-3xl mb-2 animate-pulse">💎</div>جارٍ التحميل...</div>;

  const healthy = keys.filter((k) => k.status === "active").length;
  const cooling = keys.filter((k) => k.status === "cooldown").length;
  const totalRequests = keys.reduce((sum, k) => sum + k.requestsToday, 0);

  return (
    <div dir="rtl" className="space-y-5">
      {/* Pool Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "إجمالي المفاتيح", value: keys.length, icon: "🔑" },
          { label: "مفاتيح نشطة", value: healthy, icon: "✅" },
          { label: "مفاتيح تهدئة", value: cooling, icon: "⏳" },
          { label: "إجمالي الطلبات اليوم", value: totalRequests.toLocaleString(), icon: "📊" },
        ].map((c) => (
          <div key={c.label} className="rounded-2xl p-4" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
            <div className="text-xl mb-1">{c.icon}</div>
            <div className="text-2xl font-black" style={{ color: "var(--brand)", fontFamily: "var(--font-head)" }}>{c.value}</div>
            <div className="text-xs font-medium mt-1" style={{ color: "var(--ink-2)" }}>{c.label}</div>
          </div>
        ))}
      </div>

      {/* Key Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {keys.map((k) => {
          const st = KEY_STATUS[k.status] || KEY_STATUS.error;
          return (
            <div key={k.displayName} className="rounded-2xl p-5" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-sm" style={{ color: "var(--ink)", fontFamily: "var(--font-head)" }}>{k.displayName}</h3>
                <span className="text-xs font-bold px-2.5 py-1 rounded-full" style={{ background: st.bg, color: st.color }}>{st.label}</span>
              </div>
              <div className="space-y-2.5">
                {[
                  { label: "طلبات اليوم", value: k.requestsToday.toLocaleString() },
                  { label: "الحصة المتبقية", value: k.remainingQuota.toLocaleString() },
                  { label: "الاستجابة", value: `${k.latencyMs}ms` },
                  { label: "آخر استخدام", value: k.lastUsed || "—" },
                ].map((item) => (
                  <div key={item.label} className="flex justify-between">
                    <span className="text-xs" style={{ color: "var(--ink-3)" }}>{item.label}</span>
                    <span className="text-xs font-bold" style={{ color: "var(--ink)" }}>{item.value}</span>
                  </div>
                ))}
                {/* Quota bar */}
                <div className="mt-2">
                  <div className="h-2 rounded-full overflow-hidden" style={{ background: "var(--surface-2)" }}>
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${Math.min(100, (k.requestsToday / (k.requestsToday + k.remainingQuota)) * 100)}%`,
                        background: st.color,
                      }}
                    />
                  </div>
                </div>
              </div>
              {k.cooldownEnds && (
                <div className="text-xs mt-3 p-2 rounded-xl" style={{ background: st.bg, color: st.color }}>
                  ⏳ تنتهي التهدئة: {k.cooldownEnds}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
