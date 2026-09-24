"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowUp,
  Bot,
  Loader2,
  Sparkles,
  Trash2,
  Wallet,
  Users,
  Tag,
  AlertTriangle,
  BarChart3,
} from "lucide-react";
import type { CopilotChart, CopilotKpi, CopilotModelInfo, CopilotTable } from "@/lib/superadmin-copilot/types";

type Suggestion = { label: string; prompt: string };

type ChatTurn = {
  id: string;
  role: "user" | "assistant";
  content: string;
  model?: CopilotModelInfo | null;
  charts?: CopilotChart[];
  tables?: CopilotTable[];
  kpis?: CopilotKpi[];
  toolsUsed?: Array<{ name: string; label: string; ok: boolean; summary: string }>;
};

type LiveTool = { id: string; label: string; done: boolean; ok?: boolean; summary?: string };

const TONE: Record<NonNullable<CopilotKpi["tone"]>, string> = {
  default: "var(--ink)",
  good: "#22c55e",
  warn: "#f59e0b",
  bad: "#ef4444",
  gold: "var(--gold-2)",
};

function uid() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function MiniChart({ chart }: { chart: CopilotChart }) {
  const series = chart.series;
  const points = chart.points;
  const keys = series.map((s) => s.key);
  const max = Math.max(1, ...points.flatMap((p) => keys.map((k) => Math.abs(p.values[k] || 0))));
  const barW = 100 / Math.max(points.length, 1);

  return (
    <div className="rounded-2xl p-4" style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}>
      <div className="flex items-center justify-between gap-2 mb-3">
        <h4 className="text-xs font-black" style={{ color: "var(--ink)", fontFamily: "var(--font-head)" }}>
          {chart.title}
        </h4>
        {chart.unit && (
          <span className="text-[10px] font-bold" style={{ color: "var(--ink-3)" }}>
            {chart.unit}
          </span>
        )}
      </div>
      <div className="flex items-end gap-1 h-36">
        {points.map((p, i) => (
          <div key={`${p.x}-${i}`} className="flex-1 min-w-0 flex flex-col items-center gap-1" title={p.x}>
            <div className="w-full flex items-end justify-center gap-0.5 h-28">
              {series.map((s) => {
                const v = p.values[s.key] || 0;
                const h = Math.max(v === 0 ? 2 : 6, Math.round((Math.abs(v) / max) * 104));
                return (
                  <div
                    key={s.key}
                    className="rounded-t-md flex-1 min-w-[3px]"
                    style={{
                      height: h,
                      background: v < 0 ? "#ef4444" : s.color || "var(--brand)",
                      opacity: v === 0 ? 0.25 : 1,
                    }}
                    title={`${s.label}: ${v.toLocaleString("ar-EG")}`}
                  />
                );
              })}
            </div>
            <span className="text-[9px] truncate w-full text-center leading-tight" style={{ color: "var(--ink-3)" }}>
              {p.x.replace(/،.*/, "").split(" ").slice(0, 2).join(" ")}
            </span>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-3 mt-3">
        {series.map((s) => (
          <span key={s.key} className="inline-flex items-center gap-1.5 text-[10px] font-bold" style={{ color: "var(--ink-2)" }}>
            <span className="w-2 h-2 rounded-sm" style={{ background: s.color || "var(--brand)" }} />
            {s.label}
          </span>
        ))}
      </div>
      {points.length === 0 && <p className="text-xs text-center py-6" style={{ color: "var(--ink-3)" }}>لا نقاط في هذا الرسم</p>}
      <span className="sr-only">{barW}</span>
    </div>
  );
}

function DataTable({ table }: { table: CopilotTable }) {
  if (!table.rows.length) return null;
  return (
    <div className="rounded-2xl overflow-hidden" style={{ border: "1px solid var(--border)" }}>
      <div className="px-3 py-2 text-[11px] font-black" style={{ background: "var(--surface-2)", color: "var(--ink)" }}>
        {table.title}
      </div>
      <div className="overflow-x-auto max-h-64 overflow-y-auto">
        <table className="w-full text-xs">
          <thead>
            <tr style={{ color: "var(--ink-3)" }}>
              {table.columns.map((c) => (
                <th key={c} className="px-3 py-2 text-right font-medium whitespace-nowrap">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y" style={{ borderColor: "var(--border)" }}>
            {table.rows.map((row, i) => (
              <tr key={i}>
                {row.map((cell, j) => (
                  <td key={j} className="px-3 py-2 whitespace-nowrap" style={{ color: "var(--ink)" }}>
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function renderText(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((p, i) =>
    p.startsWith("**") && p.endsWith("**") ? (
      <strong key={i}>{p.slice(2, -2)}</strong>
    ) : (
      <span key={i}>{p}</span>
    )
  );
}

export function SuperadminCopilot() {
  const [model, setModel] = useState<CopilotModelInfo | null>(null);
  const [models, setModels] = useState<CopilotModelInfo[]>([]);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [liveTools, setLiveTools] = useState<LiveTool[]>([]);
  const [bootError, setBootError] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/admin/superadmin/copilot", { credentials: "include" })
      .then(async (res) => {
        if (res.status === 403) throw new Error("هذا المساعد للمشرف العام فقط");
        if (!res.ok) throw new Error("تعذر تحميل المساعد");
        return res.json() as Promise<{
          model: CopilotModelInfo | null;
          models: CopilotModelInfo[];
          suggestions: Suggestion[];
        }>;
      })
      .then((data) => {
        if (cancelled) return;
        setModel(data.model);
        setModels(data.models || []);
        setSuggestions(data.suggestions || []);
      })
      .catch((err: Error) => {
        if (!cancelled) setBootError(err.message);
      });
    return () => {
      cancelled = true;
      abortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [turns, liveTools, status]);

  const send = useCallback(async (text: string) => {
    const content = text.trim();
    if (!content || busy) return;
    setDraft("");
    const userTurn: ChatTurn = { id: uid(), role: "user", content };
    const history = [...turns, userTurn];
    setTurns(history);
    setBusy(true);
    setStatus("يتصل بالنموذج...");
    setLiveTools([]);

    const ac = new AbortController();
    abortRef.current = ac;

    try {
      const res = await fetch("/api/admin/superadmin/copilot", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: history.map((t) => ({ role: t.role, content: t.content })),
        }),
        signal: ac.signal,
      });
      if (res.status === 403) throw new Error("غير مصرح — للمشرف العام فقط");
      if (!res.ok || !res.body) throw new Error("تعذر الرد");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let assistant: ChatTurn = { id: uid(), role: "assistant", content: "" };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() || "";
        for (const line of lines) {
          if (!line.trim()) continue;
          let evt: Record<string, unknown>;
          try {
            evt = JSON.parse(line) as Record<string, unknown>;
          } catch {
            continue;
          }
          const type = evt.type as string;
          if (type === "hello" && evt.model) setModel(evt.model as CopilotModelInfo);
          if (type === "status") setStatus(String(evt.text || ""));
          if (type === "tool_start") {
            setLiveTools((prev) => [
              ...prev.filter((t) => t.id !== evt.id),
              { id: String(evt.id), label: String(evt.label || evt.name), done: false },
            ]);
          }
          if (type === "tool_end") {
            setLiveTools((prev) =>
              prev.map((t) =>
                t.id === evt.id
                  ? { ...t, done: true, ok: Boolean(evt.ok), summary: String(evt.summary || "") }
                  : t
              )
            );
          }
          if (type === "error") throw new Error(String(evt.message || "فشل المساعد"));
          if (type === "done") {
            assistant = {
              ...assistant,
              content: String(evt.message || ""),
              model: (evt.model as CopilotModelInfo) || null,
              charts: (evt.charts as CopilotChart[]) || [],
              tables: (evt.tables as CopilotTable[]) || [],
              kpis: (evt.kpis as CopilotKpi[]) || [],
              toolsUsed: (evt.toolsUsed as ChatTurn["toolsUsed"]) || [],
            };
            setModel((evt.model as CopilotModelInfo) || null);
          }
        }
      }
      if (assistant.content || assistant.charts?.length) {
        setTurns((prev) => [...prev, assistant]);
      }
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      setTurns((prev) => [
        ...prev,
        {
          id: uid(),
          role: "assistant",
          content: err instanceof Error ? err.message : "فشل غير متوقع",
        },
      ]);
    } finally {
      setBusy(false);
      setStatus("");
      setLiveTools([]);
    }
  }, [busy, turns]);

  const fallback = models.find((m) => m.fallback);

  const emptyHints = useMemo(
    () =>
      suggestions.length
        ? suggestions
        : [
            { label: "صافي ٩–٢٠ سبتمبر", prompt: "ما هو صافي ربح المنصة من 9 سبتمبر إلى 20 سبتمبر؟ أظهر الرسم." },
            { label: "ملخص المقر", prompt: "ملخص المقر الآن" },
          ],
    [suggestions]
  );

  if (bootError) {
    return (
      <div className="rounded-2xl p-8 text-center" style={{ background: "var(--surface)", border: "1px solid var(--border)" }} dir="rtl">
        <AlertTriangle className="mx-auto mb-2" style={{ color: "#ef4444" }} />
        <p className="font-bold" style={{ color: "var(--ink)" }}>{bootError}</p>
      </div>
    );
  }

  return (
    <div dir="rtl" className="flex flex-col gap-4 min-h-[70vh]">
      <div
        className="rounded-2xl p-5"
        style={{
          background:
            "linear-gradient(145deg, color-mix(in srgb, var(--brand) 16%, var(--surface)) 0%, var(--surface) 55%, color-mix(in srgb, var(--gold) 10%, var(--surface)) 100%)",
          border: "1px solid var(--border-strong)",
          boxShadow: "var(--shadow)",
        }}
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <span
              className="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0"
              style={{ background: "var(--brand)", color: "#fff" }}
            >
              <Sparkles size={20} />
            </span>
            <div>
              <h2 className="text-lg font-black" style={{ color: "var(--ink)", fontFamily: "var(--font-head)" }}>
                مساعد المقر — قراءة فقط
              </h2>
              <p className="text-xs mt-1 max-w-xl leading-relaxed" style={{ color: "var(--ink-2)" }}>
                العقل: Antigravity (agy) · Gemini 3.8 Flash High — لا يستهلك مفاتيح شات الطلاب. قراءة فقط: يفتّش ولا يعدّل ولا يعيد تشغيل شيء.
              </p>
            </div>
          </div>
          <div className="flex flex-col items-end gap-1">
            <span
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-black"
              style={{ background: "var(--gold-soft)", color: "var(--gold-2)", border: "1px solid color-mix(in srgb, var(--gold) 35%, transparent)" }}
            >
              <Bot size={12} />
              {model ? `${model.provider} · ${model.label}` : "يتحقّق من النموذج..."}
            </span>
            <span className="text-[10px] font-black" style={{ color: "#15803d" }}>
              لا إجراءات — inspect only
            </span>
            {model && (
              <span className="text-[10px] font-mono" style={{ color: "var(--ink-3)" }}>
                {model.id}
                {model.fallback ? " · احتياطي" : " · أساسي"}
              </span>
            )}
            {fallback && !model?.fallback && (
              <span className="text-[10px]" style={{ color: "var(--ink-3)" }}>
                احتياطي: {fallback.label}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="flex-1 rounded-2xl overflow-hidden flex flex-col" style={{ background: "var(--surface)", border: "1px solid var(--border)", minHeight: 480 }}>
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {turns.length === 0 && (
            <div className="py-6 space-y-4">
              <p className="text-sm text-center" style={{ color: "var(--ink-2)" }}>
                اسأل بالعربية أو الإنجليزية. مثال: «what is the net from 9 september to the 20»
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {emptyHints.map((s) => (
                  <button
                    key={s.label}
                    type="button"
                    onClick={() => void send(s.prompt)}
                    className="text-right rounded-xl px-3 py-2.5 text-xs font-bold cursor-pointer transition-colors"
                    style={{ background: "var(--surface-2)", border: "1px solid var(--border)", color: "var(--ink)" }}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2">
                {[
                  { icon: Wallet, t: "المال والصافي" },
                  { icon: Users, t: "الطلاب" },
                  { icon: Tag, t: "الأسعار" },
                  { icon: BarChart3, t: "رسوم بيانية" },
                ].map((x) => (
                  <div key={x.t} className="rounded-xl p-3 text-center" style={{ background: "var(--surface-2)" }}>
                    <x.icon size={16} className="mx-auto mb-1" style={{ color: "var(--brand)" }} />
                    <div className="text-[11px] font-bold" style={{ color: "var(--ink-2)" }}>{x.t}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {turns.map((t) => (
            <div key={t.id} className={`flex ${t.role === "user" ? "justify-start" : "justify-end"}`}>
              <div
                className="max-w-[92%] sm:max-w-[80%] rounded-2xl px-4 py-3 space-y-3"
                style={
                  t.role === "user"
                    ? { background: "var(--brand)", color: "#fff" }
                    : { background: "var(--surface-2)", color: "var(--ink)", border: "1px solid var(--border)" }
                }
              >
                {t.role === "assistant" && t.model && (
                  <div className="text-[10px] font-bold opacity-80">
                    {t.model.provider} · {t.model.label} · <span className="font-mono">{t.model.id}</span>
                    {t.model.fallback ? " · احتياطي" : ""}
                  </div>
                )}
                {t.kpis && t.kpis.length > 0 && (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {t.kpis.map((k) => (
                      <div key={k.key} className="rounded-xl p-2" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
                        <div className="text-[10px]" style={{ color: "var(--ink-3)" }}>{k.label}</div>
                        <div className="text-sm font-black tabular-nums" style={{ color: TONE[k.tone || "default"] }}>
                          {k.value}
                        </div>
                        {k.hint && <div className="text-[10px]" style={{ color: "var(--ink-3)" }}>{k.hint}</div>}
                      </div>
                    ))}
                  </div>
                )}
                <div className="text-sm leading-relaxed whitespace-pre-wrap">{renderText(t.content)}</div>
                {t.charts?.map((c) => (
                  <MiniChart key={c.id} chart={c} />
                ))}
                {t.tables?.map((tb) => (
                  <DataTable key={tb.id} table={tb} />
                ))}
                {t.toolsUsed && t.toolsUsed.length > 0 && (
                  <div className="flex flex-wrap gap-1 pt-1">
                    {t.toolsUsed.map((tool, i) => (
                      <span
                        key={`${tool.name}-${i}`}
                        className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                        style={{
                          background: tool.ok ? "color-mix(in srgb, #22c55e 15%, transparent)" : "color-mix(in srgb, #ef4444 15%, transparent)",
                          color: tool.ok ? "#15803d" : "#b91c1c",
                        }}
                        title={tool.summary}
                      >
                        {tool.label}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}

          {busy && (
            <div className="flex justify-end">
              <div className="rounded-2xl px-4 py-3 space-y-2 max-w-[80%]" style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}>
                <div className="flex items-center gap-2 text-xs font-bold" style={{ color: "var(--ink-2)" }}>
                  <Loader2 size={14} className="animate-spin" />
                  {status || "يعمل..."}
                </div>
                {liveTools.map((t) => (
                  <div key={t.id} className="text-[11px]" style={{ color: t.done ? "#15803d" : "var(--ink-3)" }}>
                    {t.done ? "✓" : "…"} {t.label}
                    {t.summary ? ` — ${t.summary}` : ""}
                  </div>
                ))}
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        <form
          className="p-3 flex items-end gap-2"
          style={{ borderTop: "1px solid var(--border)" }}
          onSubmit={(e) => {
            e.preventDefault();
            void send(draft);
          }}
        >
          <button
            type="button"
            onClick={() => {
              abortRef.current?.abort();
              setTurns([]);
              setLiveTools([]);
              setStatus("");
            }}
            className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 cursor-pointer"
            style={{ background: "var(--surface-2)", color: "var(--ink-3)", border: "1px solid var(--border)" }}
            title="مسح المحادثة"
          >
            <Trash2 size={16} />
          </button>
          <textarea
            rows={2}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send(draft);
              }
            }}
            placeholder="مثال: الصافي من 9 سبتمبر إلى 20 سبتمبر مع الرسم..."
            className="flex-1 rounded-xl px-3 py-2 text-sm resize-none outline-none"
            style={{ background: "var(--surface-2)", border: "1px solid var(--border)", color: "var(--ink)" }}
            disabled={busy}
          />
          <button
            type="submit"
            disabled={busy || !draft.trim()}
            className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 cursor-pointer disabled:opacity-50"
            style={{ background: "var(--brand)", color: "#fff" }}
          >
            {busy ? <Loader2 size={16} className="animate-spin" /> : <ArrowUp size={16} />}
          </button>
        </form>
      </div>
    </div>
  );
}
