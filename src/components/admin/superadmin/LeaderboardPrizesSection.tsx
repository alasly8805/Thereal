"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Clock, RotateCcw, Save, Zap } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { Badge, Button, Field, Input, Modal, Notice, PageHeader, Panel, Select, Skeleton, Switch, Textarea, fmtDateTime, readJson } from "@/components/admin/ui/kit";

interface PrizeItem {
  rank: number;
  rankLabel: string;
  title: string;
  prize: string;
  icon?: string;
  highlight?: boolean;
}

interface ApiResponse {
  prizes: PrizeItem[];
  defaults: PrizeItem[];
  lastCalculatedAt: string | null;
  prizesUpdatedAt: string | null;
  studentCount: number;
  topStudentsCount: number;
  error?: string;
  message?: string;
}

const AVAILABLE_ICONS = ["🥇", "🥈", "🥉", "🏆", "🎁", "⭐", "🎖️", "🏷️", "💫", "🌟", "👑", "💎", "🎒", "🎧", "💻", "🔥"];

const PODIUM: Record<number, string> = { 1: "var(--gold)", 2: "#8a97a8", 3: "#b8733a" };

export function LeaderboardPrizesSection() {
  const { success, error: toastError } = useToast();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [saving, setSaving] = useState(false);
  const [recalculating, setRecalculating] = useState(false);
  const [prizes, setPrizes] = useState<PrizeItem[]>([]);
  const [savedJson, setSavedJson] = useState("[]");
  const [meta, setMeta] = useState<Pick<ApiResponse, "lastCalculatedAt" | "prizesUpdatedAt" | "studentCount" | "topStudentsCount"> | null>(null);
  const [confirm, setConfirm] = useState<"recalc" | "reset" | null>(null);

  const fetchPrizes = useCallback(async () => {
    setLoadError("");
    try {
      const res = await fetch("/api/admin/superadmin/leaderboard-prizes", { credentials: "include" });
      const data = await readJson<ApiResponse>(res);
      if (!res.ok || !data) {
        setLoadError(data?.error || "تعذر تحميل إعدادات الجوائز");
        return;
      }
      const list = Array.isArray(data.prizes) ? data.prizes : [];
      setPrizes(list);
      setSavedJson(JSON.stringify(list));
      setMeta({
        lastCalculatedAt: data.lastCalculatedAt,
        prizesUpdatedAt: data.prizesUpdatedAt,
        studentCount: data.studentCount,
        topStudentsCount: data.topStudentsCount,
      });
    } catch {
      setLoadError("تعذر الاتصال بالخادم");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchPrizes();
  }, [fetchPrizes]);

  const dirty = useMemo(() => JSON.stringify(prizes) !== savedJson, [prizes, savedJson]);

  const updatePrize = <K extends keyof PrizeItem>(index: number, field: K, val: PrizeItem[K]) => {
    setPrizes((prev) => prev.map((p, i) => (i === index ? { ...p, [field]: val } : p)));
  };

  const post = async (body: Record<string, unknown>) => {
    const res = await fetch("/api/admin/superadmin/leaderboard-prizes", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await readJson<ApiResponse>(res);
    if (!res.ok) throw new Error(data?.error || "تعذر تنفيذ الإجراء");
    return data;
  };

  const handleSavePrizes = async () => {
    setSaving(true);
    try {
      const data = await post({ action: "save_prizes", prizes });
      success(data?.message || "حُفظت جوائز المراكز العشرة");
      void fetchPrizes();
    } catch (e) {
      toastError(e instanceof Error ? e.message : "تعذر حفظ الجوائز");
    } finally {
      setSaving(false);
    }
  };

  const runConfirm = async () => {
    const kind = confirm;
    setConfirm(null);
    if (kind === "recalc") {
      setRecalculating(true);
      try {
        const data = await post({ action: "force_recalculate" });
        success(data?.message || "أُعيد احتساب لوحة الشرف");
        void fetchPrizes();
      } catch (e) {
        toastError(e instanceof Error ? e.message : "فشل إعادة الاحتساب");
      } finally {
        setRecalculating(false);
      }
    } else if (kind === "reset") {
      setSaving(true);
      try {
        const data = await post({ action: "reset_defaults" });
        success(data?.message || "استُعيدت الجوائز الافتراضية");
        void fetchPrizes();
      } catch (e) {
        toastError(e instanceof Error ? e.message : "تعذر استعادة الجوائز");
      } finally {
        setSaving(false);
      }
    }
  };

  return (
    <div dir="rtl" className="flex flex-col gap-5">
      <PageHeader
        title="جوائز لوحة الشرف"
        description="الجوائز التي يراها الطلاب بجوار المراكز من ١ إلى ١٠ في لوحة الشرف اليومية. تُحفظ في كاش سريع وتُحدّث تلقائياً الساعة ٣ فجراً بتوقيت القاهرة."
        actions={
          <>
            <Button onClick={() => setConfirm("recalc")} loading={recalculating} disabled={saving} icon={<Zap size={15} />}>إعادة الاحتساب الآن</Button>
            <Button variant="ghost" onClick={() => setConfirm("reset")} disabled={saving || recalculating} icon={<RotateCcw size={15} />}>الجوائز الافتراضية</Button>
          </>
        }
        meta={
          meta && (
            <>
              <Badge tone="ok" dot><Clock size={12} aria-hidden /> آخر احتساب {meta.lastCalculatedAt ? fmtDateTime(meta.lastCalculatedAt) : "غير متوفر"}</Badge>
              <Badge>التحديث التلقائي ٣:٠٠ ص يومياً</Badge>
            </>
          )
        }
      />

      {loadError && <Notice tone="bad" title={loadError} action={<Button size="sm" onClick={() => void fetchPrizes()}>إعادة المحاولة</Button>} />}

      {loading ? (
        <div className="grid gap-4 lg:grid-cols-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} h={240} r={16} />)}</div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {prizes.map((p, idx) => {
            const podium = PODIUM[p.rank];
            return (
              <Panel key={p.rank} padded clip={false}>
                <div className="flex flex-col gap-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <span
                        className="w-9 h-9 rounded-[10px] grid place-items-center font-extrabold text-sm"
                        style={{ background: podium ?? "var(--surface-2)", color: podium ? "#fff" : "var(--ink)" }}
                        aria-hidden
                      >
                        {p.rank}
                      </span>
                      <div>
                        <h3 className="adm-h3">{p.rankLabel || `المركز ${p.rank}`}</h3>
                        {podium && <p className="text-xs adm-muted">منصة التتويج</p>}
                      </div>
                    </div>
                    <Select inputSize="sm" value={p.icon || "🎁"} onChange={(e) => updatePrize(idx, "icon", e.target.value)} aria-label={`أيقونة المركز ${p.rank}`} className="w-20 text-lg">
                      {AVAILABLE_ICONS.map((ic) => (
                        <option key={ic} value={ic}>{ic}</option>
                      ))}
                    </Select>
                  </div>

                  <Field label="اللقب" htmlFor={`pz-title-${p.rank}`}>
                    <Input id={`pz-title-${p.rank}`} inputSize="sm" value={p.title} onChange={(e) => updatePrize(idx, "title", e.target.value)} placeholder={p.rankLabel} />
                  </Field>
                  <Field label="الجائزة" htmlFor={`pz-prize-${p.rank}`}>
                    <Textarea id={`pz-prize-${p.rank}`} rows={2} value={p.prize} onChange={(e) => updatePrize(idx, "prize", e.target.value)} placeholder="مثال: تيشيرت + كود اشتراك + ٥٠٠ نقطة" />
                  </Field>
                  <label className="flex items-center justify-between gap-3 text-sm">
                    <span className="font-semibold">إبراز بلون ذهبي</span>
                    <Switch checked={!!p.highlight} onChange={(v) => updatePrize(idx, "highlight", v)} label={`إبراز جائزة المركز ${p.rank}`} />
                  </label>

                  <div
                    className="rounded-[10px] px-3 py-2.5 flex items-center gap-2.5 text-[13px]"
                    style={{
                      background: p.highlight ? "var(--gold-soft)" : "var(--surface-2)",
                      border: `1px solid ${p.highlight ? "color-mix(in srgb, var(--gold) 40%, transparent)" : "var(--border)"}`,
                    }}
                    aria-label="معاينة كما يراها الطالب"
                  >
                    <span className="text-base" aria-hidden>{p.icon || "🎁"}</span>
                    <p className="min-w-0">
                      <b style={{ color: p.highlight ? "var(--gold)" : "var(--ink)" }}>{p.title || p.rankLabel}:</b>{" "}
                      <span style={{ color: "var(--ink-2)" }}>{p.prize || "لم تُحدد جائزة"}</span>
                    </p>
                  </div>
                </div>
              </Panel>
            );
          })}
        </div>
      )}

      {!loading && prizes.length > 0 && (
        <div className="adm-panel sticky flex flex-wrap items-center justify-between gap-3 p-4" style={{ bottom: 12, zIndex: 5, boxShadow: dirty ? "var(--shadow)" : undefined }}>
          <p className="text-sm" style={{ color: dirty ? "var(--warn)" : "var(--ink-3)" }}>
            {dirty ? "لديك تعديلات غير محفوظة" : "كل التعديلات محفوظة"}
          </p>
          <Button variant="primary" onClick={() => void handleSavePrizes()} loading={saving} disabled={!dirty || recalculating} icon={<Save size={15} />}>
            حفظ الجوائز
          </Button>
        </div>
      )}

      <Modal
        open={!!confirm}
        onClose={() => setConfirm(null)}
        size="sm"
        title={confirm === "recalc" ? "إعادة احتساب لوحة الشرف الآن؟" : "استعادة الجوائز الافتراضية؟"}
        description={
          confirm === "recalc"
            ? "سيُعاد حساب النقاط والسلاسل وترتيب الطلاب فوراً بدل انتظار تحديث ٣ فجراً."
            : "ستُستبدل الجوائز الحالية للمراكز العشرة بالقيم الافتراضية."
        }
        footer={
          <>
            <Button onClick={() => setConfirm(null)}>إلغاء</Button>
            <Button variant="primary" onClick={() => void runConfirm()}>{confirm === "recalc" ? "إعادة الاحتساب" : "استعادة"}</Button>
          </>
        }
      />
    </div>
  );
}
