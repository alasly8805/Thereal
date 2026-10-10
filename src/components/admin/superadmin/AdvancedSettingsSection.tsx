"use client";
import { useCallback, useEffect, useState } from "react";
import { Bot, ChevronDown, KeyRound, Plus, Settings, Trash2 } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import {
  Badge,
  Button,
  EmptyState,
  Field,
  Input,
  Modal,
  Notice,
  PageHeader,
  Panel,
  Skeleton,
  Switch,
  readJson,
} from "@/components/admin/ui/kit";

interface ConfigItem {
  key: string;
  type: "number" | "string" | "boolean";
  label: string;
  value: string;
  enforced?: boolean;
}
interface ConfigGroup {
  category: string;
  label: string;
  items: ConfigItem[];
}
interface Provider {
  id: string;
  name: string;
  slug: string;
  baseUrl: string;
  models: string[];
  hasKey: boolean;
  isPrimary: boolean;
  isBackup: boolean;
  isActive: boolean;
}

export function AdvancedSettingsSection() {
  const { success: toastSuccess, error: toastError } = useToast();
  const [groups, setGroups] = useState<ConfigGroup[]>([]);
  const [saved, setSaved] = useState<Record<string, string>>({});
  const [providers, setProviders] = useState<Provider[]>([]);
  const [encReady, setEncReady] = useState(true);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const loadConfig = useCallback(async () => {
    setLoadError("");
    try {
      const res = await fetch("/api/admin/config", { credentials: "include" });
      const json = await readJson<{ groups?: ConfigGroup[]; error?: string }>(res);
      if (res.ok && Array.isArray(json?.groups)) {
        setGroups(json.groups);
        setSaved(Object.fromEntries(json.groups.flatMap((g) => g.items.map((i) => [i.key, i.value]))));
        setOpen((p) => (Object.keys(p).length ? p : { [json.groups![0]?.category]: true }));
      } else setLoadError(json?.error ?? "تعذر تحميل الإعدادات");
    } catch {
      setLoadError("تعذر الاتصال بالخادم");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadProviders = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/ai-providers", { credentials: "include" });
      const json = await readJson<{ providers?: Provider[]; encryptionConfigured?: boolean }>(res);
      if (res.ok) {
        setProviders(json?.providers ?? []);
        setEncReady(json?.encryptionConfigured !== false);
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    void loadConfig();
    void loadProviders();
  }, [loadConfig, loadProviders]);

  const setItemValue = (key: string, value: string) =>
    setGroups((gs) => gs.map((g) => ({ ...g, items: g.items.map((i) => (i.key === key ? { ...i, value } : i)) })));

  const saveConfig = async (key: string, value: string | boolean) => {
    setSavingKey(key);
    const asString = String(value);
    try {
      const res = await fetch("/api/admin/config", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, value }),
      });
      const json = await readJson<{ error?: string }>(res);
      if (!res.ok) {
        toastError(json?.error ?? "تعذر الحفظ");
        // Roll the control back to the last saved value.
        if (saved[key] !== undefined) setItemValue(key, saved[key]);
        return;
      }
      setItemValue(key, asString);
      setSaved((s) => ({ ...s, [key]: asString }));
      toastSuccess("تم الحفظ — يسري خلال ثوانٍ");
    } catch {
      toastError("تعذر الاتصال بالخادم");
      if (saved[key] !== undefined) setItemValue(key, saved[key]);
    } finally {
      setSavingKey(null);
    }
  };

  return (
    <div dir="rtl" className="flex flex-col gap-5">
      <PageHeader
        title="إعدادات متقدمة"
        description="قيم التشغيل التي تتحكم في سلوك المنصة، ومزوّدو الذكاء الاصطناعي. التغييرات تسري خلال ثوانٍ بدون إعادة تشغيل."
      />

      {loadError && <Notice tone="bad" title={loadError} action={<Button size="sm" onClick={() => void loadConfig()}>إعادة المحاولة</Button>} />}

      {loading ? (
        <div className="flex flex-col gap-3">
          <Skeleton h={56} r={16} />
          <Skeleton h={56} r={16} />
          <Skeleton h={56} r={16} />
        </div>
      ) : (
        <div className="flex flex-col gap-3 max-w-4xl">
          {groups.map((g) => {
            const isOpen = !!open[g.category];
            const panelId = `cfg-${g.category}`;
            return (
              <section key={g.category} className="adm-panel adm-panel-clip">
                <button
                  type="button"
                  onClick={() => setOpen((p) => ({ ...p, [g.category]: !p[g.category] }))}
                  aria-expanded={isOpen}
                  aria-controls={panelId}
                  className="flex w-full items-center justify-between gap-3 px-[18px] py-3.5 text-start cursor-pointer hover:bg-[var(--adm-hover)]"
                >
                  <span className="flex items-center gap-2.5">
                    <Settings size={16} style={{ color: "var(--brand)" }} aria-hidden />
                    <span className="adm-h3">{g.label}</span>
                    <Badge>{g.items.length}</Badge>
                  </span>
                  <ChevronDown size={16} style={{ color: "var(--ink-3)", transform: isOpen ? "rotate(180deg)" : undefined, transition: "transform 180ms" }} aria-hidden />
                </button>
                {isOpen && (
                  <div id={panelId} className="adm-list" style={{ borderTop: "1px solid var(--border)" }}>
                    {g.items.map((item) => {
                      const dirty = item.type !== "boolean" && saved[item.key] !== undefined && saved[item.key] !== item.value;
                      const inputId = `cfg-${item.key}`;
                      return (
                        <div key={item.key} className="adm-row">
                          <div className="flex-1 min-w-[200px]">
                            <label htmlFor={inputId} className="text-sm font-semibold flex flex-wrap items-center gap-2">
                              {item.label}
                              {item.enforced === false && <Badge tone="warn">غير مُطبّق بعد</Badge>}
                            </label>
                            <p className="adm-mono text-xs adm-muted mt-0.5">{item.key}</p>
                          </div>
                          {item.type === "boolean" ? (
                            <Switch
                              checked={item.value === "true"}
                              onChange={(v) => void saveConfig(item.key, v)}
                              disabled={savingKey === item.key}
                              label={item.label}
                            />
                          ) : (
                            <form
                              className="flex items-center gap-2"
                              onSubmit={(e) => {
                                e.preventDefault();
                                void saveConfig(item.key, item.value);
                              }}
                            >
                              <Input
                                id={inputId}
                                inputSize="sm"
                                type={item.type === "number" ? "number" : "text"}
                                value={item.value}
                                onChange={(e) => setItemValue(item.key, e.target.value)}
                                className={item.type === "number" ? "w-32" : "w-64 max-w-full"}
                              />
                              <Button type="submit" size="sm" variant={dirty ? "primary" : "secondary"} disabled={!dirty} loading={savingKey === item.key}>
                                حفظ
                              </Button>
                            </form>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}

      <AIProvidersBlock providers={providers} encReady={encReady} reload={loadProviders} toastSuccess={toastSuccess} toastError={toastError} />
    </div>
  );
}

const EMPTY_DRAFT = { name: "", slug: "", baseUrl: "", models: "", apiKey: "" };

function AIProvidersBlock({
  providers,
  encReady,
  reload,
  toastSuccess,
  toastError,
}: {
  providers: Provider[];
  encReady: boolean;
  reload: () => Promise<void>;
  toastSuccess: (m: string) => void;
  toastError: (m: string) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState(EMPTY_DRAFT);
  const [removeTarget, setRemoveTarget] = useState<Provider | null>(null);
  const [removing, setRemoving] = useState(false);

  const patch = async (id: string, body: Record<string, unknown>) => {
    try {
      const res = await fetch(`/api/admin/ai-providers/${id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await readJson<{ error?: string }>(res);
      if (!res.ok) {
        toastError(json?.error ?? "تعذر التعديل");
        return false;
      }
      toastSuccess("تم التحديث");
      await reload();
      return true;
    } catch {
      toastError("تعذر الاتصال بالخادم");
      return false;
    }
  };

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    try {
      const res = await fetch("/api/admin/ai-providers", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      const json = await readJson<{ error?: string }>(res);
      if (!res.ok) {
        toastError(json?.error ?? "تعذر الإنشاء");
        return;
      }
      toastSuccess("تمت إضافة المزوّد");
      setDraft(EMPTY_DRAFT);
      setAdding(false);
      await reload();
    } catch {
      toastError("تعذر الاتصال بالخادم");
    } finally {
      setCreating(false);
    }
  };

  const remove = async () => {
    if (!removeTarget) return;
    setRemoving(true);
    try {
      const res = await fetch(`/api/admin/ai-providers/${removeTarget.id}`, { method: "DELETE", credentials: "include" });
      if (!res.ok) {
        toastError("تعذر الحذف");
        return;
      }
      toastSuccess(`حُذف المزوّد ${removeTarget.name}`);
      setRemoveTarget(null);
      await reload();
    } finally {
      setRemoving(false);
    }
  };

  return (
    <Panel
      title="مزوّدو الذكاء الاصطناعي"
      icon={<Bot size={16} />}
      description="المزوّد الأساسي يُستخدم أولاً، والاحتياطي عند فشله. المفاتيح تُخزّن مشفّرة ولا تُعرض بعد الحفظ."
      actions={
        <Button size="sm" variant={adding ? "secondary" : "primary"} onClick={() => setAdding((a) => !a)} icon={adding ? undefined : <Plus size={14} />}>
          {adding ? "إلغاء" : "إضافة مزوّد"}
        </Button>
      }
      className="max-w-4xl"
    >
      <div className="flex flex-col gap-4">
        {!encReady && (
          <Notice tone="warn" title="تخزين المفاتيح غير مفعّل">
            اضبط CONFIG_ENCRYPTION_KEY على الخادم قبل حفظ مفاتيح الـ API.
          </Notice>
        )}

        {adding && (
          <form onSubmit={create} className="adm-well p-4 grid gap-3 sm:grid-cols-2">
            <Field label="الاسم" htmlFor="prov-name">
              <Input id="prov-name" required value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="DeepSeek" />
            </Field>
            <Field label="المعرّف (slug)" htmlFor="prov-slug">
              <Input id="prov-slug" required mono value={draft.slug} onChange={(e) => setDraft({ ...draft, slug: e.target.value })} placeholder="deepseek" />
            </Field>
            <Field label="رابط الـ API" htmlFor="prov-url" className="sm:col-span-2">
              <Input id="prov-url" required mono value={draft.baseUrl} onChange={(e) => setDraft({ ...draft, baseUrl: e.target.value })} placeholder="https://api.example.com/v1" />
            </Field>
            <Field label="النماذج" hint="افصل بينها بفاصلة" htmlFor="prov-models">
              <Input id="prov-models" mono value={draft.models} onChange={(e) => setDraft({ ...draft, models: e.target.value })} placeholder="model-a, model-b" />
            </Field>
            <Field label="مفتاح الـ API" htmlFor="prov-key">
              <Input id="prov-key" type="password" autoComplete="off" value={draft.apiKey} onChange={(e) => setDraft({ ...draft, apiKey: e.target.value })} />
            </Field>
            <div className="sm:col-span-2 flex justify-end">
              <Button type="submit" variant="primary" loading={creating}>
                حفظ المزوّد
              </Button>
            </div>
          </form>
        )}

        {providers.length === 0 && !adding ? (
          <EmptyState icon={<Bot size={22} />} title="لا يوجد مزوّدون بعد" text="أضف مزوّداً واحداً على الأقل لتشغيل ميزات الذكاء الاصطناعي." />
        ) : (
          <ul className="flex flex-col gap-3">
            {providers.map((p) => (
              <ProviderCard key={p.id} provider={p} onPatch={patch} onRemove={() => setRemoveTarget(p)} />
            ))}
          </ul>
        )}
      </div>

      <Modal
        open={!!removeTarget}
        onClose={() => !removing && setRemoveTarget(null)}
        size="sm"
        title="حذف المزوّد؟"
        description={removeTarget ? `سيُحذف "${removeTarget.name}" ومفتاحه المحفوظ. الميزات التي تعتمد عليه ستنتقل للمزوّد الاحتياطي إن وُجد.` : undefined}
        footer={
          <>
            <Button onClick={() => setRemoveTarget(null)} disabled={removing}>إلغاء</Button>
            <Button variant="danger-solid" onClick={() => void remove()} loading={removing}>حذف</Button>
          </>
        }
      />
    </Panel>
  );
}

function ProviderCard({
  provider,
  onPatch,
  onRemove,
}: {
  provider: Provider;
  onPatch: (id: string, body: Record<string, unknown>) => Promise<boolean>;
  onRemove: () => void;
}) {
  const [keyInput, setKeyInput] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const run = async (tag: string, body: Record<string, unknown>) => {
    setBusy(tag);
    const ok = await onPatch(provider.id, body);
    setBusy(null);
    return ok;
  };

  return (
    <li className="adm-well p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-bold">{provider.name}</span>
        <span className="adm-mono text-xs adm-muted">{provider.slug}</span>
        {provider.isPrimary && <Badge tone="brand">أساسي</Badge>}
        {provider.isBackup && <Badge tone="info">احتياطي</Badge>}
        <Badge tone={provider.hasKey ? "ok" : "bad"} dot>{provider.hasKey ? "المفتاح مضبوط" : "بدون مفتاح"}</Badge>
        {!provider.isActive && <Badge tone="bad">موقوف</Badge>}
      </div>
      <p className="adm-mono text-xs adm-muted mt-2" style={{ textAlign: "right" }}>{provider.baseUrl}</p>
      <p className="text-xs adm-muted mt-1">النماذج: <span className="adm-mono">{provider.models.join(", ") || "—"}</span></p>

      <div className="flex flex-wrap gap-2 mt-3">
        <Button size="sm" loading={busy === "primary"} onClick={() => void run("primary", { isPrimary: !provider.isPrimary })}>
          {provider.isPrimary ? "إلغاء كأساسي" : "تعيين أساسي"}
        </Button>
        <Button size="sm" loading={busy === "backup"} onClick={() => void run("backup", { isBackup: !provider.isBackup })}>
          {provider.isBackup ? "إلغاء كاحتياطي" : "تعيين احتياطي"}
        </Button>
        <Button size="sm" loading={busy === "active"} onClick={() => void run("active", { isActive: !provider.isActive })}>
          {provider.isActive ? "إيقاف" : "تفعيل"}
        </Button>
        <Button size="sm" variant="ghost" icon={<KeyRound size={14} />} onClick={() => setShowKey((s) => !s)} aria-expanded={showKey}>
          تغيير المفتاح
        </Button>
        <Button size="sm" variant="danger" icon={<Trash2 size={14} />} onClick={onRemove}>
          حذف
        </Button>
      </div>

      {showKey && (
        <form
          className="mt-3 flex gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!keyInput) return;
            const ok = await run("key", { apiKey: keyInput });
            if (ok) {
              setKeyInput("");
              setShowKey(false);
            }
          }}
        >
          <Input
            type="password"
            autoComplete="off"
            value={keyInput}
            onChange={(e) => setKeyInput(e.target.value)}
            placeholder="مفتاح API جديد (لن يُعرض بعد الحفظ)"
            aria-label="مفتاح API جديد"
          />
          <Button type="submit" variant="primary" loading={busy === "key"} disabled={!keyInput}>
            حفظ
          </Button>
        </form>
      )}
    </li>
  );
}
