"use client";

import { useEffect, useState } from "react";
import { useToast } from "@/components/ui/Toast";

export default function AISettings() {
  const { success: toastSuccess, error: toastError } = useToast();
  const [providerMode, setProviderMode] = useState<string>("balanced");
  const [maxTokens, setMaxTokens] = useState<number>(2048);
  const [dailyBudget, setDailyBudget] = useState<number>(50);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function loadSettings() {
      try {
        const res = await fetch("/api/admin/ai/operations", { credentials: "include" });
        const data = await res.json();
        if (res.ok && data.settings) {
          setProviderMode(data.settings.providerMode || "balanced");
          setMaxTokens(data.settings.maxCompletionTokens || 2048);
          setDailyBudget(data.settings.globalDailyBudgetUsd || 50);
        }
      } catch (err) {
        console.error("Failed to load AI settings:", err);
      } finally {
        setLoading(false);
      }
    }
    void loadSettings();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/admin/ai/operations", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patch: {
            providerMode,
            maxCompletionTokens: Number(maxTokens),
            globalDailyBudgetUsd: Number(dailyBudget),
          },
          reason: "تحديث الإعدادات العامة من لوحة التحكم",
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        toastSuccess("تم حفظ إعدادات الذكاء الاصطناعي بنجاح");
      } else {
        toastError(data.error || "تعذر حفظ الإعدادات");
      }
    } catch {
      toastError("حدث خطأ في الاتصال بالخادم");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div dir="rtl" className="p-6 text-center text-sm font-bold text-[var(--ink-3)]">
        جارٍ تحميل الإعدادات...
      </div>
    );
  }

  return (
    <div dir="rtl" className="space-y-6">
      <div className="rounded-2xl p-6 space-y-4" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
        <h3 className="font-bold text-base text-[var(--ink)]">الإعدادات العامة للخدمة الذكية</h3>
        
        <div>
          <label className="text-xs font-bold text-[var(--ink-2)] block mb-1">نمط التوجيه المالي (Provider Mode)</label>
          <select
            value={providerMode}
            onChange={(e) => setProviderMode(e.target.value)}
            className="w-full max-w-xs p-2.5 rounded-xl text-sm bg-[var(--surface-2)] border border-[var(--border)] text-[var(--ink)]"
          >
            <option value="economy">اقتصادي (Economy)</option>
            <option value="balanced">متوازن (Balanced)</option>
            <option value="quality">جودة فائقة (Quality)</option>
          </select>
        </div>

        <div>
          <label className="text-xs font-bold text-[var(--ink-2)] block mb-1">الميزانية اليومية العامة ($ USD)</label>
          <input
            type="number"
            min={1}
            value={dailyBudget}
            onChange={(e) => setDailyBudget(Number(e.target.value))}
            className="w-full max-w-xs p-2.5 rounded-xl text-sm bg-[var(--surface-2)] border border-[var(--border)] text-[var(--ink)]"
          />
        </div>

        <div>
          <label className="text-xs font-bold text-[var(--ink-2)] block mb-1">الحد الأقصى للتوكنات للإجابة الواحدة (Max Completion Tokens)</label>
          <input
            type="number"
            min={100}
            max={8192}
            value={maxTokens}
            onChange={(e) => setMaxTokens(Number(e.target.value))}
            className="w-full max-w-xs p-2.5 rounded-xl text-sm bg-[var(--surface-2)] border border-[var(--border)] text-[var(--ink)]"
          />
        </div>

        <button
          onClick={handleSave}
          disabled={saving}
          className="px-5 py-2.5 rounded-xl text-xs font-bold bg-[var(--brand)] text-[var(--on-brand)] hover:opacity-90 transition-opacity cursor-pointer border-none disabled:opacity-60"
        >
          {saving ? "جارٍ الحفظ..." : "حفظ التغييرات"}
        </button>
      </div>
    </div>
  );
}
