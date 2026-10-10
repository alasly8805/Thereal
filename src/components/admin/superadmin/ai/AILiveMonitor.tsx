"use client";
import { useState, useEffect, useRef } from "react";

interface LiveRequest {
  id: string;
  time: string;
  studentName: string;
  subject: string;
  action: string;
  provider: string;
  status: "success" | "fallback" | "failed" | "cache_hit";
  latencyMs: number;
  tokens: number;
  costUsd: number;
  // Detail fields
  question?: string;
  intent?: string;
  knowledgeUsed?: string[];
  memoryUsed?: boolean;
  toolsUsed?: string[];
  prompt?: string;
  rawResponse?: string;
  formattedResponse?: string;
}

const STATUS_STYLES: Record<string, { bg: string; color: string; label: string }> = {
  success:   { bg: "rgba(16,185,129,.12)", color: "#10b981", label: "SUCCESS" },
  fallback:  { bg: "rgba(245,158,11,.12)", color: "#f59e0b", label: "FALLBACK" },
  failed:    { bg: "rgba(239,68,68,.12)",  color: "#ef4444", label: "FAILED" },
  cache_hit: { bg: "rgba(99,102,241,.12)", color: "#6366f1", label: "CACHE HIT" },
};

// Demo data generator
function generateDemoRequests(): LiveRequest[] {
  const names = ["أحمد", "سارة", "عمر", "فاطمة", "محمد", "نور", "يوسف", "ليلى"];
  const subjects = ["الرياضيات", "الفيزياء", "الكيمياء", "العربي", "الإنجليزي"];
  const actions = ["Explain", "Quiz", "Summary", "Homework", "Exam", "Hint", "Flashcards"];
  const providers = ["DeepSeek V4 Flash", "Gemini Flash Lite", "Gemini Lite", "Groq"];
  const statuses: LiveRequest["status"][] = ["success", "success", "success", "cache_hit", "success", "fallback"];

  return Array.from({ length: 20 }, (_, i) => {
    const status = statuses[Math.floor(Math.random() * statuses.length)];
    const isCacheHit = status === "cache_hit";
    const now = new Date();
    now.setMinutes(now.getMinutes() - (20 - i));
    return {
      id: `req_${Date.now()}_${i}`,
      time: now.toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit" }),
      studentName: names[Math.floor(Math.random() * names.length)],
      subject: subjects[Math.floor(Math.random() * subjects.length)],
      action: actions[Math.floor(Math.random() * actions.length)],
      provider: isCacheHit ? "Cache" : providers[Math.floor(Math.random() * providers.length)],
      status,
      latencyMs: isCacheHit ? 0 : 200 + Math.floor(Math.random() * 600),
      tokens: isCacheHit ? 0 : 300 + Math.floor(Math.random() * 800),
      costUsd: isCacheHit ? 0 : parseFloat((Math.random() * 0.001).toFixed(5)),
      question: "اشرح قانون نيوتن الأول",
      intent: "EXPLAIN",
    };
  });
}

export default function AILiveMonitor() {
  const [requests, setRequests] = useState<LiveRequest[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [paused, setPaused] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Initial load
    const load = async () => {
      try {
        const res = await fetch("/api/admin/ai/live", { credentials: "include" });
        if (res.ok) {
          const data = await res.json();
          if (data.requests?.length > 0) {
            setRequests(data.requests);
            return;
          }
        }
      } catch { /* ignore */ }
      // Fallback to demo data
      setRequests(generateDemoRequests());
    };
    load();

    // Polling every 2s
    const interval = setInterval(async () => {
      if (paused) return;
      try {
        const res = await fetch("/api/admin/ai/live", { credentials: "include" });
        if (res.ok) {
          const data = await res.json();
          if (data.requests?.length > 0) {
            setRequests(data.requests);
          }
        }
      } catch { /* ignore */ }
    }, 2000);

    return () => clearInterval(interval);
  }, [paused]);

  useEffect(() => {
    if (!paused && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [requests, paused]);

  const selected = selectedId ? requests.find((r) => r.id === selectedId) : null;

  const legend = [
    { color: "#10b981", label: "ناجح" },
    { color: "#f59e0b", label: "بديل" },
    { color: "#ef4444", label: "فاشل" },
    { color: "#6366f1", label: "كاش" },
  ];

  return (
    <div dir="rtl" className="space-y-4">
      {/* Controls */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {legend.map((l) => (
            <div key={l.label} className="flex items-center gap-1.5">
              <span
                className="w-2.5 h-2.5 rounded-full inline-block"
                style={{ background: l.color }}
              />
              <span className="text-xs font-medium" style={{ color: "var(--ink-2)" }}>
                {l.label}
              </span>
            </div>
          ))}
        </div>
        <button
          onClick={() => setPaused(!paused)}
          className="text-xs font-bold px-4 py-2 rounded-xl cursor-pointer border-none transition-colors"
          style={{
            background: paused ? "var(--brand)" : "var(--surface-2)",
            color: paused ? "white" : "var(--ink-2)",
            border: `1px solid ${paused ? "var(--brand)" : "var(--border)"}`,
          }}
        >
          {paused ? "▶ استئناف" : "⏸ إيقاف مؤقت"}
        </button>
      </div>

      <div className="flex gap-4">
        {/* Request Feed */}
        <div
          ref={scrollRef}
          className="flex-1 rounded-2xl overflow-hidden"
          style={{
            background: "var(--surface)",
            border: "1px solid var(--border)",
            maxHeight: "70vh",
            overflowY: "auto",
          }}
        >
          {/* Header */}
          <div
            className="sticky top-0 z-10 grid gap-2 px-4 py-3 text-xs font-bold"
            style={{
              gridTemplateColumns: "60px 80px 90px 80px 160px 80px 70px 70px 70px",
              background: "var(--surface-2)",
              borderBottom: "1px solid var(--border)",
              color: "var(--ink-3)",
            }}
          >
            <span>الوقت</span>
            <span>الطالب</span>
            <span>المادة</span>
            <span>العملية</span>
            <span>المزود</span>
            <span>الحالة</span>
            <span>الوقت</span>
            <span>التوكنات</span>
            <span>التكلفة</span>
          </div>

          {/* Rows */}
          {requests.map((req) => {
            const st = STATUS_STYLES[req.status] || STATUS_STYLES.success;
            return (
              <button
                key={req.id}
                onClick={() => setSelectedId(selectedId === req.id ? null : req.id)}
                className="w-full grid gap-2 px-4 py-2.5 text-sm border-none cursor-pointer transition-colors text-right"
                style={{
                  gridTemplateColumns: "60px 80px 90px 80px 160px 80px 70px 70px 70px",
                  background: selectedId === req.id ? "var(--brand-soft)" : "transparent",
                  borderBottom: "1px solid var(--border)",
                }}
                onMouseEnter={(e) => {
                  if (selectedId !== req.id)
                    (e.currentTarget as HTMLElement).style.background = "var(--surface-2)";
                }}
                onMouseLeave={(e) => {
                  if (selectedId !== req.id)
                    (e.currentTarget as HTMLElement).style.background = "transparent";
                }}
              >
                <span className="font-mono text-xs" style={{ color: "var(--ink-3)" }}>
                  {req.time}
                </span>
                <span className="truncate font-semibold" style={{ color: "var(--ink)" }}>
                  {req.studentName}
                </span>
                <span className="truncate" style={{ color: "var(--ink-2)" }}>
                  {req.subject}
                </span>
                <span className="truncate font-medium" style={{ color: "var(--brand)" }}>
                  {req.action}
                </span>
                <span className="truncate text-xs" style={{ color: "var(--ink-2)" }}>
                  {req.provider}
                </span>
                <span
                  className="inline-flex items-center justify-center text-xs font-black px-2 py-0.5 rounded-full"
                  style={{ background: st.bg, color: st.color }}
                >
                  {st.label}
                </span>
                <span className="font-mono text-xs" style={{ color: "var(--ink-2)" }}>
                  {req.latencyMs} ms
                </span>
                <span className="font-mono text-xs" style={{ color: "var(--ink-2)" }}>
                  {req.tokens}
                </span>
                <span className="font-mono text-xs" style={{ color: "var(--gold-2)" }}>
                  ${req.costUsd.toFixed(5)}
                </span>
              </button>
            );
          })}
        </div>

        {/* Detail Panel */}
        {selected && (
          <div
            className="w-80 shrink-0 rounded-2xl overflow-auto"
            style={{
              background: "var(--surface)",
              border: "1px solid var(--border)",
              maxHeight: "70vh",
            }}
          >
            <div
              className="px-4 py-3 font-bold text-sm"
              style={{ borderBottom: "1px solid var(--border)", color: "var(--ink)" }}
            >
              تفاصيل الطلب
            </div>
            <div className="px-4 py-3 space-y-3">
              {[
                { label: "الطالب", value: selected.studentName },
                { label: "السؤال", value: selected.question || "—" },
                { label: "النية", value: selected.intent || "—" },
                { label: "العملية", value: selected.action },
                { label: "المادة", value: selected.subject },
                { label: "المزود", value: selected.provider },
                { label: "الحالة", value: STATUS_STYLES[selected.status]?.label || selected.status },
                { label: "الوقت", value: `${selected.latencyMs} ms` },
                { label: "التوكنات", value: `${selected.tokens}` },
                { label: "التكلفة", value: `$${selected.costUsd.toFixed(5)}` },
              ].map((item) => (
                <div key={item.label}>
                  <div className="text-xs font-bold mb-0.5" style={{ color: "var(--ink-3)" }}>
                    {item.label}
                  </div>
                  <div className="text-sm" style={{ color: "var(--ink)" }}>
                    {item.value}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
