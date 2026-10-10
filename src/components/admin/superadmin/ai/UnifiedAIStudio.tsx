"use client";

import { useCallback, useEffect, useState } from "react";
import { Activity, FlaskConical, KeyRound, RefreshCw, ScrollText, Send } from "lucide-react";
import {
  Badge,
  Button,
  EmptyState,
  Field,
  Notice,
  PageHeader,
  Panel,
  Select,
  SkeletonRows,
  Stat,
  Tabs,
  Textarea,
  fmtDateTime,
  fmtNum,
  readJson,
  type Tone,
} from "@/components/admin/ui/kit";

interface ProviderView {
  id: string;
  status: "Healthy" | "Degraded" | "Offline";
  requests: number;
  avgLatencyMs: number;
  successRate: number | null;
  fallbacks: number;
}

interface AIOverviewData {
  status: "healthy" | "degraded" | "unknown";
  requestsToday: number;
  studentsUsingAI: number;
  teachersUsingAI: number;
  parentsReading: number;
  todayCost: number;
  monthCost: number;
  todayTokens: number;
  avgResponse: number;
  cacheHit: number;
  budgetUsed: number;
  providersOnline: string;
  providers: ProviderView[];
  topSubjects: Array<{ name: string; count: number }>;
}

interface GeminiKey {
  displayName: string;
  status: string;
  requestsToday: number;
  remainingQuota: number | null;
  latencyMs: number;
  lastError: string | null;
}

interface AuditRecord {
  id: string;
  timestamp: string;
  who: string;
  action: string;
  previousValue: string;
  newValue: string;
  reason?: string;
}

type StudioTab = "telemetry" | "gemini" | "playground" | "audit";

const PROVIDER_TONE: Record<ProviderView["status"], Tone> = { Healthy: "ok", Degraded: "warn", Offline: "bad" };
const PROVIDER_LABEL: Record<ProviderView["status"], string> = { Healthy: "يعمل", Degraded: "متعثّر", Offline: "متوقف" };

function keyTone(status: string): Tone {
  const s = status.toLowerCase();
  if (s === "active" || s === "healthy") return "ok";
  if (s.includes("cool") || s.includes("degrad") || s.includes("limit")) return "warn";
  return "bad";
}

function useJson<T>(url: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    if (!url) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch(url, { credentials: "include" });
      const json = await readJson<T & { error?: string }>(res);
      if (!res.ok || !json) {
        setError(json?.error || "تعذر تحميل البيانات");
        return;
      }
      setData(json);
    } catch {
      setError("تعذر الاتصال بالخادم");
    } finally {
      setLoading(false);
    }
  }, [url]);
  useEffect(() => {
    void load();
  }, [load]);
  return { data, loading, error, reload: load };
}

export function UnifiedAIStudio() {
  const [tab, setTab] = useState<StudioTab>("telemetry");

  return (
    <div dir="rtl" className="flex flex-col gap-5">
      <PageHeader
        title="استوديو الذكاء الاصطناعي"
        description="استهلاك مساعد الطلاب، حالة المزوّدين ومفاتيح Gemini، تجربة المحرك، وسجل تغييرات الإعدادات. الأرقام من ذاكرة السيرفر وتبدأ من الصفر بعد كل إعادة تشغيل."
      />
      <Tabs<StudioTab>
        label="أقسام الاستوديو"
        value={tab}
        onChange={setTab}
        items={[
          { id: "telemetry", label: "الاستهلاك والمزوّدون", icon: <Activity size={15} /> },
          { id: "gemini", label: "مفاتيح Gemini", icon: <KeyRound size={15} /> },
          { id: "playground", label: "تجربة المحرك", icon: <FlaskConical size={15} /> },
          { id: "audit", label: "سجل التغييرات", icon: <ScrollText size={15} /> },
        ]}
      />
      {tab === "telemetry" && <TelemetryTab />}
      {tab === "gemini" && <GeminiTab />}
      {tab === "playground" && <PlaygroundTab />}
      {tab === "audit" && <AuditTab />}
    </div>
  );
}

function TelemetryTab() {
  const { data, loading, error, reload } = useJson<AIOverviewData>("/api/admin/ai/overview");

  if (error) return <Notice tone="bad" title={error} action={<Button size="sm" onClick={() => void reload()}>إعادة المحاولة</Button>} />;
  if (!data) return <SkeletonRows rows={3} h={96} />;

  const noTraffic = data.requestsToday === 0 && data.providers.every((p) => p.requests === 0);

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Badge tone={data.status === "healthy" ? "ok" : data.status === "degraded" ? "warn" : "neutral"} dot>
          {data.status === "healthy" ? "المزوّدون يعملون" : data.status === "degraded" ? "كل المزوّدين متعثّرون" : "لا توجد بيانات مزوّدين بعد"} · {data.providersOnline}
        </Badge>
        <Button size="sm" onClick={() => void reload()} loading={loading} icon={<RefreshCw size={14} />}>تحديث</Button>
      </div>

      {noTraffic && (
        <Notice tone="neutral" title="لا توجد طلبات مسجلة منذ آخر تشغيل للسيرفر">
          ستظهر الأرقام بمجرد أن يستخدم الطلاب المساعد.
        </Notice>
      )}

      <div className="adm-stats">
        <Stat label="طلبات اليوم" value={fmtNum(data.requestsToday)} />
        <Stat label="طلاب يستخدمون المساعد" value={fmtNum(data.studentsUsingAI)} />
        <Stat label="متوسط الاستجابة" value={data.avgResponse ? `${fmtNum(data.avgResponse)} ms` : "—"} />
        <Stat label="من الكاش" value={`${fmtNum(data.cacheHit)}٪`} sub="أسئلة خُدمت بدون استدعاء المزوّد" />
        <Stat label="تكلفة اليوم" value={`$${data.todayCost.toFixed(2)}`} sub={`الشهر $${data.monthCost.toFixed(2)} · ${fmtNum(data.budgetUsed)}٪ من ٥٠$`} tone={data.budgetUsed > 80 ? "warn" : "neutral"} />
        <Stat label="توكنز اليوم" value={fmtNum(data.todayTokens)} />
      </div>

      <Panel title="المزوّدون" icon={<Activity size={16} />} padded={data.providers.length === 0}>
        {data.providers.length === 0 ? (
          <EmptyState title="لم يستخدم أي مزوّد بعد" text="يظهر كل مزوّد هنا بعد أول طلب يمر عبره." />
        ) : (
          <div className="adm-table-wrap">
            <table className="adm-table">
              <thead>
                <tr>
                  <th>المزوّد</th>
                  <th>الحالة</th>
                  <th className="is-num">الطلبات</th>
                  <th className="is-num">نسبة النجاح</th>
                  <th className="is-num">متوسط الاستجابة</th>
                  <th className="is-num">تحويل احتياطي</th>
                </tr>
              </thead>
              <tbody>
                {data.providers.map((p) => (
                  <tr key={p.id}>
                    <td className="adm-mono font-bold">{p.id}</td>
                    <td><Badge tone={PROVIDER_TONE[p.status] ?? "neutral"} dot>{PROVIDER_LABEL[p.status] ?? p.status}</Badge></td>
                    <td className="is-num">{fmtNum(p.requests)}</td>
                    <td className="is-num">{p.successRate == null ? "—" : `${fmtNum(p.successRate)}٪`}</td>
                    <td className="is-num">{p.avgLatencyMs ? `${fmtNum(p.avgLatencyMs)} ms` : "—"}</td>
                    <td className="is-num">{fmtNum(p.fallbacks)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {data.topSubjects.length > 0 && (
        <Panel title="المواد الأكثر سؤالاً">
          <ul className="flex flex-col gap-2">
            {data.topSubjects.map((s) => {
              const max = Math.max(...data.topSubjects.map((x) => x.count), 1);
              return (
                <li key={s.name} className="grid grid-cols-[8rem_1fr_auto] items-center gap-3 text-sm">
                  <span className="truncate">{s.name}</span>
                  <span className="adm-bar"><span style={{ width: `${(s.count / max) * 100}%`, background: "var(--brand)" }} /></span>
                  <span className="adm-num adm-muted text-xs">{fmtNum(s.count)}</span>
                </li>
              );
            })}
          </ul>
        </Panel>
      )}
    </>
  );
}

function GeminiTab() {
  const { data, loading, error, reload } = useJson<{ keys: GeminiKey[] }>("/api/admin/ai/gemini-pool");
  const keys = data?.keys ?? [];

  return (
    <Panel
      padded={false}
      title="مفاتيح Gemini"
      icon={<KeyRound size={16} />}
      description="تدوير تلقائي بين المفاتيح لتوزيع الحمل وتفادي حدود الحصة."
      actions={
        <>
          {keys.length > 0 && <Badge>{fmtNum(keys.filter((k) => keyTone(k.status) === "ok").length)} من {fmtNum(keys.length)} نشط</Badge>}
          <Button size="sm" onClick={() => void reload()} loading={loading} icon={<RefreshCw size={14} />}>تحديث</Button>
        </>
      }
    >
      {error ? (
        <div className="p-4"><Notice tone="bad" title={error} /></div>
      ) : !data ? (
        <SkeletonRows rows={3} />
      ) : keys.length === 0 ? (
        <EmptyState icon={<KeyRound size={22} />} title="لا توجد مفاتيح Gemini مُعدّة" text="أضف المفاتيح في متغيرات البيئة على السيرفر." />
      ) : (
        <div className="adm-table-wrap">
          <table className="adm-table" style={{ minWidth: 620 }}>
            <thead>
              <tr>
                <th>المفتاح</th>
                <th>الحالة</th>
                <th className="is-num">طلبات اليوم</th>
                <th className="is-num">الحصة المتبقية</th>
                <th className="is-num">الاستجابة</th>
                <th>آخر خطأ</th>
              </tr>
            </thead>
            <tbody>
              {keys.map((k) => (
                <tr key={k.displayName}>
                  <td className="adm-mono font-bold">{k.displayName}</td>
                  <td><Badge tone={keyTone(k.status)} dot>{k.status}</Badge></td>
                  <td className="is-num">{fmtNum(k.requestsToday)}</td>
                  <td className="is-num">{k.remainingQuota == null ? "—" : fmtNum(k.remainingQuota)}</td>
                  <td className="is-num">{k.latencyMs ? `${fmtNum(k.latencyMs)} ms` : "—"}</td>
                  <td className="text-xs adm-muted" style={{ maxWidth: 240 }}>
                    <span className="block truncate" title={k.lastError ?? undefined}>{k.lastError ?? "—"}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}

function PlaygroundTab() {
  const [prompt, setPrompt] = useState("");
  const [subject, setSubject] = useState("الفيزياء");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ response: string; latency: number; tokens: number | null; provider: string | null } | null>(null);

  const run = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim()) return;
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const res = await fetch("/api/admin/ai/playground", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, subject }),
      });
      const data = await readJson<{ response?: string; latency?: number; tokens?: number | null; provider?: string | null; error?: string }>(res);
      if (!res.ok || !data?.response) {
        setError(data?.error || "لم يرد المحرك");
        return;
      }
      setResult({ response: data.response, latency: data.latency ?? 0, tokens: data.tokens ?? null, provider: data.provider ?? null });
    } catch {
      setError("تعذر الاتصال بالخادم");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Panel title="تجربة المحرك" icon={<FlaskConical size={16} />} description="أرسل سؤالاً كما يرسله الطالب، وشاهد الإجابة وزمنها والمزوّد الذي اختاره المحرك تلقائياً.">
      <form onSubmit={run} className="flex flex-col gap-4">
        <Field label="المادة" htmlFor="pg-subject" className="max-w-xs">
          <Select id="pg-subject" value={subject} onChange={(e) => setSubject(e.target.value)}>
            {["الفيزياء", "الكيمياء", "الرياضيات", "الأحياء", "اللغة العربية", "البرمجة"].map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </Select>
        </Field>
        <Field label="السؤال" htmlFor="pg-prompt">
          <Textarea id="pg-prompt" rows={4} value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="مثال: اشرح قانون نيوتن الثاني باختصار مع مثال من الحياة" />
        </Field>
        <div>
          <Button type="submit" variant="primary" loading={loading} disabled={!prompt.trim()} icon={<Send size={15} />}>إرسال</Button>
        </div>
      </form>
      {error && <Notice tone="bad" title={error} className="mt-4" />}
      {result && (
        <div className="adm-well p-4 mt-4 flex flex-col gap-3">
          <div className="flex flex-wrap gap-2">
            {result.provider && <Badge tone="brand">{result.provider}</Badge>}
            <Badge>{fmtNum(result.latency)} ms</Badge>
            {result.tokens != null && <Badge>{fmtNum(result.tokens)} توكن</Badge>}
          </div>
          <p className="text-sm leading-relaxed whitespace-pre-wrap">{result.response}</p>
        </div>
      )}
    </Panel>
  );
}

function AuditTab() {
  const { data, loading, error, reload } = useJson<{ logs: AuditRecord[] }>("/api/admin/ai/audit");
  const logs = data?.logs ?? [];

  return (
    <Panel
      padded={false}
      title="سجل تغييرات إعدادات الذكاء الاصطناعي"
      icon={<ScrollText size={16} />}
      actions={<Button size="sm" onClick={() => void reload()} loading={loading} icon={<RefreshCw size={14} />}>تحديث</Button>}
    >
      {error ? (
        <div className="p-4"><Notice tone="bad" title={error} /></div>
      ) : !data ? (
        <SkeletonRows rows={4} />
      ) : logs.length === 0 ? (
        <EmptyState icon={<ScrollText size={22} />} title="لا توجد تغييرات مسجلة" text="يُسجّل هنا كل تعديل على المزوّدين والميزانيات والإعدادات منذ آخر تشغيل للسيرفر." />
      ) : (
        <ul className="adm-list">
          {logs.map((log) => (
            <li key={log.id} className="adm-row" style={{ alignItems: "flex-start" }}>
              <div className="min-w-0 flex-1">
                <p className="text-sm flex flex-wrap items-center gap-2">
                  <Badge><span className="adm-mono">{log.action}</span></Badge>
                  <b>{log.who}</b>
                </p>
                <p className="text-xs adm-muted mt-1">
                  <span className="adm-mono">{log.previousValue || "—"}</span> ← <span className="adm-mono">{log.newValue || "—"}</span>
                  {log.reason ? ` · ${log.reason}` : ""}
                </p>
              </div>
              <span className="text-xs adm-muted whitespace-nowrap">{fmtDateTime(log.timestamp)}</span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
