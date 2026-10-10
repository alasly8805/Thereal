"use client";

import { useEffect, useState } from "react";
import { useToast } from "@/components/ui/Toast";

interface FeatureFlagItem {
  key: string;
  label: string;
  enabled: boolean;
}

export default function AIFeatureFlags() {
  const { success: toastSuccess, error: toastError } = useToast();
  const [loading, setLoading] = useState(true);
  const [flags, setFlags] = useState<FeatureFlagItem[]>([
    { key: "streamingEnabled", label: "البث المباشر للإجابات (Streaming)", enabled: true },
    { key: "knowledgeLoadingEnabled", label: "ربط قاعدة المعرفة المنهجية (RAG)", enabled: true },
    { key: "automaticFallbackEnabled", label: "التوجيه التلقائي للمزود البديل (Auto Fallback)", enabled: true },
  ]);

  useEffect(() => {
    async function loadFlags() {
      try {
        const res = await fetch("/api/admin/ai/operations", { credentials: "include" });
        const data = await res.json();
        if (res.ok && data.settings) {
          setFlags([
            { key: "streamingEnabled", label: "البث المباشر للإجابات (Streaming)", enabled: !!data.settings.streamingEnabled },
            { key: "knowledgeLoadingEnabled", label: "ربط قاعدة المعرفة المنهجية (RAG)", enabled: !!data.settings.knowledgeLoadingEnabled },
            { key: "automaticFallbackEnabled", label: "التوجيه التلقائي للمزود البديل (Auto Fallback)", enabled: !!data.settings.automaticFallbackEnabled },
          ]);
        }
      } catch (err) {
        console.error("Failed to fetch feature flags:", err);
      } finally {
        setLoading(false);
      }
    }
    void loadFlags();
  }, []);

  const toggleFlag = async (key: string, currentVal: boolean) => {
    const updatedVal = !currentVal;
    setFlags((prev) => prev.map((f) => (f.key === key ? { ...f, enabled: updatedVal } : f)));

    try {
      const res = await fetch("/api/admin/ai/operations", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patch: { [key]: updatedVal },
          reason: `تغيير ميزة ${key} إلى ${updatedVal}`,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        toastSuccess(`تم ${updatedVal ? "تفعيل" : "تعطيل"} الميزة بنجاح`);
      } else {
        toastError(data.error || "تعذر تحديث الميزة");
        setFlags((prev) => prev.map((f) => (f.key === key ? { ...f, enabled: currentVal } : f)));
      }
    } catch {
      toastError("حدث خطأ في الاتصال بالخادم");
      setFlags((prev) => prev.map((f) => (f.key === key ? { ...f, enabled: currentVal } : f)));
    }
  };

  if (loading) {
    return (
      <div dir="rtl" className="p-6 text-center text-sm font-bold text-[var(--ink-3)]">
        جارٍ تحميل أعلام الميزات...
      </div>
    );
  }

  return (
    <div dir="rtl" className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {flags.map((f) => (
          <div
            key={f.key}
            className="rounded-2xl p-5 flex items-center justify-between"
            style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
          >
            <div>
              <span className="font-bold text-sm text-[var(--ink)] block mb-1">{f.label}</span>
              <span className="font-mono text-xs text-[var(--ink-3)]">{f.key}</span>
            </div>
            <button
              onClick={() => toggleFlag(f.key, f.enabled)}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-colors cursor-pointer border-none ${
                f.enabled ? "bg-[var(--brand)] text-[var(--on-brand)]" : "bg-[var(--surface-2)] text-[var(--ink-3)]"
              }`}
            >
              {f.enabled ? "مُفعل" : "معطل"}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
