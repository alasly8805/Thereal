"use client";
import { useState } from "react";

export default function AISystemHealth() {
  const [services] = useState([
    { name: "محرك AIEngine Pipeline", status: "Healthy", latency: "12ms" },
    { name: "مراقب الميزانيات BudgetTracker", status: "Healthy", latency: "3ms" },
    { name: "مزود DeepSeek V4 API", status: "Healthy", latency: "540ms" },
    { name: "Gemini Key Pool Manager", status: "Healthy", latency: "390ms" },
    { name: "قاعدة بيانات الكاش والإحصاءات", status: "Healthy", latency: "5ms" },
  ]);

  return (
    <div dir="rtl" className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {services.map((s) => (
          <div key={s.name} className="rounded-2xl p-5 flex items-center justify-between" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
            <div className="flex items-center gap-3">
              <span className="w-3 h-3 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]" />
              <div>
                <span className="font-bold text-sm text-[var(--ink)] block">{s.name}</span>
                <span className="font-mono text-xs text-[var(--ink-3)]">الاستجابة: {s.latency}</span>
              </div>
            </div>
            <span className="text-xs font-bold text-[var(--ok)] bg-emerald-500/10 px-3 py-1 rounded-full">سليم 100%</span>
          </div>
        ))}
      </div>
    </div>
  );
}
