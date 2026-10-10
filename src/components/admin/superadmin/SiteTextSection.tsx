"use client";
import { useEffect, useMemo, useState } from "react";
import { RotateCcw, Save, Undo2 } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { Badge, Button, Field, Input, Notice, PageHeader, Panel, Skeleton, Textarea, fmtNum, readJson } from "@/components/admin/ui/kit";

const SHORT_KEYS = new Set(["contact_email", "contact_phone", "contact_heading"]);

function storedActionPassword() {
  try {
    return sessionStorage.getItem("admin_action_password") || "";
  } catch {
    return "";
  }
}

export function SiteTextSection() {
  const { success: toastSuccess, error: toastError } = useToast();
  const [labels, setLabels] = useState<Record<string, string>>({});
  const [values, setValues] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState<Record<string, string>>({});
  const [defaults, setDefaults] = useState<Record<string, string>>({});
  const [actionPassword, setActionPassword] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setActionPassword(storedActionPassword());
    let isMounted = true;
    (async () => {
      try {
        const res = await fetch("/api/admin/superadmin/site-text", { credentials: "include" });
        const json = await readJson<{ text?: Record<string, string>; defaults?: Record<string, string>; labels?: Record<string, string>; error?: string }>(res);
        if (!isMounted) return;
        if (!res.ok) {
          setLoadError(json?.error ?? "تعذر تحميل النصوص");
          return;
        }
        setValues(json?.text ?? {});
        setSaved(json?.text ?? {});
        setDefaults(json?.defaults ?? {});
        setLabels(json?.labels ?? {});
      } catch {
        if (isMounted) setLoadError("تعذر الاتصال بالخادم");
      } finally {
        if (isMounted) setLoading(false);
      }
    })();
    return () => {
      isMounted = false;
    };
  }, []);

  const keys = Object.keys(labels);
  const dirtyKeys = useMemo(() => keys.filter((k) => (values[k] ?? "") !== (saved[k] ?? "")), [keys, values, saved]);

  const save = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!actionPassword) {
      toastError("أدخل كلمة مرور المشرف لتأكيد الحفظ");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/admin/superadmin/site-text", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ updates: values, actionPassword }),
      });
      const json = await readJson<{ text?: Record<string, string>; error?: string }>(res);
      if (!res.ok) {
        toastError(json?.error ?? "تعذر الحفظ");
        return;
      }
      const next = json?.text ?? values;
      setValues(next);
      setSaved(next);
      toastSuccess("حُفظت النصوص — قد يستغرق ظهورها على الموقع دقيقة");
    } catch {
      toastError("تعذر الاتصال بالخادم");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div dir="rtl" className="flex flex-col gap-5">
      <PageHeader
        title="نصوص الموقع"
        description="النصوص الظاهرة للزوّار والطلاب: العنوان الرئيسي، وسائل التواصل، وروابط الدعم — بدون تعديل الكود."
      />

      {loadError && <Notice tone="bad" title={loadError} />}

      {loading ? (
        <div className="flex flex-col gap-3 max-w-4xl">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} h={96} r={16} />
          ))}
        </div>
      ) : (
        <form onSubmit={save} className="flex flex-col gap-4 max-w-4xl">
          <Panel padded={false}>
            <div className="adm-list">
              {keys.map((k) => {
                const isShort = SHORT_KEYS.has(k);
                const isDirty = (values[k] ?? "") !== (saved[k] ?? "");
                const differsFromDefault = defaults[k] !== undefined && values[k] !== defaults[k];
                const id = `st-${k}`;
                return (
                  <div key={k} className="px-[18px] py-4 flex flex-col gap-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <label htmlFor={id} className="text-sm font-bold flex items-center gap-2">
                        {labels[k]}
                        {isDirty && <Badge tone="warn">معدّل</Badge>}
                      </label>
                      <div className="flex gap-1">
                        {isDirty && (
                          <Button size="sm" variant="ghost" icon={<Undo2 size={13} />} onClick={() => setValues({ ...values, [k]: saved[k] ?? "" })}>
                            تراجع
                          </Button>
                        )}
                        {differsFromDefault && (
                          <Button size="sm" variant="ghost" icon={<RotateCcw size={13} />} onClick={() => setValues({ ...values, [k]: defaults[k] })}>
                            الافتراضي
                          </Button>
                        )}
                      </div>
                    </div>
                    {isShort ? (
                      <Input id={id} value={values[k] ?? ""} onChange={(e) => setValues({ ...values, [k]: e.target.value })} />
                    ) : (
                      <Textarea id={id} rows={2} value={values[k] ?? ""} onChange={(e) => setValues({ ...values, [k]: e.target.value })} />
                    )}
                  </div>
                );
              })}
            </div>
          </Panel>

          <div
            className="adm-panel sticky flex flex-col sm:flex-row sm:items-end gap-3 p-4"
            style={{ bottom: 12, zIndex: 5, boxShadow: dirtyKeys.length ? "var(--shadow)" : undefined }}
          >
            <Field
              label="كلمة مرور المشرف العام للتأكيد"
              htmlFor="st-pass"
              className="flex-1"
              hint={dirtyKeys.length ? `${fmtNum(dirtyKeys.length)} تعديل غير محفوظ` : "لا توجد تعديلات غير محفوظة"}
            >
              <Input
                id="st-pass"
                type="password"
                autoComplete="current-password"
                value={actionPassword}
                onChange={(e) => setActionPassword(e.target.value)}
                placeholder="••••••••"
              />
            </Field>
            <Button type="submit" variant="primary" loading={saving} disabled={dirtyKeys.length === 0} icon={<Save size={15} />}>
              حفظ التغييرات
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
