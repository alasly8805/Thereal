"use client";

import { useEffect, useState } from "react";

interface AuditRecord {
  id: string;
  timestamp: string;
  who: string;
  ip: string;
  action: string;
  previousValue: string;
  newValue: string;
  reason?: string;
}

export default function AIAuditLogs() {
  const [logs, setLogs] = useState<AuditRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchLogs() {
      try {
        const res = await fetch("/api/admin/ai/audit?limit=100", { credentials: "include" });
        const data = await res.json();
        if (res.ok && Array.isArray(data.logs)) {
          setLogs(data.logs);
        }
      } catch (err) {
        console.error("Failed to fetch audit logs:", err);
      } finally {
        setLoading(false);
      }
    }
    void fetchLogs();
  }, []);

  return (
    <div dir="rtl" className="space-y-4">
      <div className="rounded-2xl p-5" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
        <h3 className="font-bold text-base text-[var(--ink)] mb-4">سجل تغييرات وإعدادات نظام AI (Audit Trail)</h3>
        {loading ? (
          <div className="p-4 text-center text-xs text-[var(--ink-3)]">جارٍ تحميل السجلات...</div>
        ) : logs.length === 0 ? (
          <div className="p-4 text-center text-xs text-[var(--ink-3)]">لا توجد سجلات تغييرات حتى الآن</div>
        ) : (
          <div className="divide-y divide-[var(--border)] text-xs">
            {logs.map((l) => (
              <div key={l.id} className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <span className="font-bold text-[var(--brand)] ml-2">{l.who}</span>
                  <span className="font-semibold text-[var(--ink)] ml-2">{l.action}</span>
                  {l.reason && <span className="text-[var(--ink-2)] text-xs">({l.reason})</span>}
                  <div className="text-xs font-mono text-[var(--ink-3)] mt-0.5 dir-ltr text-right">
                    prev: {l.previousValue} → new: {l.newValue}
                  </div>
                </div>
                <div className="text-left shrink-0">
                  <span className="font-mono text-[var(--ink-3)] text-xs block">
                    {new Date(l.timestamp).toLocaleString("ar-EG")}
                  </span>
                  <span className="font-mono text-[var(--ink-3)] text-xs block">{l.ip}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
