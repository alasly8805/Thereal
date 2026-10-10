"use client";

import { useEffect, useState } from "react";
import { useToast } from "@/components/ui/Toast";

interface ActionItem {
  id: string;
  name: string;
  enabled: boolean;
  desc: string;
}

const ACTION_DESCRIPTIONS: Record<string, { name: string; desc: string }> = {
  EXPLAIN: { name: "شرح المفاهيم (EXPLAIN)", desc: "يشرح المفاهيم والأفكار بدقة بناءً على منهج المادة" },
  QUIZ: { name: "توليد كويز (QUIZ)", desc: "يولّد أسئلة خيارات متعددة مع شرح الإجابة" },
  EXAM: { name: "امتحانات شاملة (EXAM)", desc: "إنهاء وتقييم الامتحانات الطويلة" },
  PLAN: { name: "خطط دراسية (PLAN)", desc: "إنشاء جداول وخطط مذاكرة يومية" },
  HOMEWORK: { name: "تحليل الواجبات (HOMEWORK)", desc: "مراجعة إجابات الواجب وإعطاء ملاحظات" },
  TEACHER_REPORT: { name: "تقارير المعلمين (TEACHER_REPORT)", desc: "توليد تقارير أداء المعلمين وأسئلتهم" },
  PARENT_REPORT: { name: "تقارير أولياء الأمور (PARENT_REPORT)", desc: "توليد ملخص أسبوعي للأهالي" },
};

export default function AIEducationalActions() {
  const { success: toastSuccess, error: toastError } = useToast();
  const [loading, setLoading] = useState(true);
  const [actions, setActions] = useState<ActionItem[]>([]);

  const fetchSettings = async () => {
    try {
      const res = await fetch("/api/admin/ai/operations", { credentials: "include" });
      const data = await res.json();
      if (res.ok && data.settings?.enabledActions) {
        const enabledActions: Record<string, boolean> = data.settings.enabledActions;
        const list: ActionItem[] = Object.keys(ACTION_DESCRIPTIONS).map((id) => ({
          id,
          name: ACTION_DESCRIPTIONS[id].name,
          desc: ACTION_DESCRIPTIONS[id].desc,
          enabled: enabledActions[id] ?? true,
        }));
        setActions(list);
      }
    } catch (err) {
      console.error("Failed to fetch actions:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchSettings();
  }, []);

  const toggleAction = async (id: string, currentVal: boolean) => {
    const newVal = !currentVal;
    setActions((prev) => prev.map((a) => (a.id === id ? { ...a, enabled: newVal } : a)));

    try {
      const res = await fetch("/api/admin/ai/operations", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patch: {
            enabledActions: {
              ...actions.reduce((acc, a) => ({ ...acc, [a.id]: a.enabled }), {}),
              [id]: newVal,
            },
          },
          reason: `تغيير تفعيل الأمر التعليمي ${id} إلى ${newVal}`,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        toastSuccess(`تم ${newVal ? "تفعيل" : "تعطيل"} الأمر "${id}" بنجاح`);
      } else {
        toastError(data.error || "تعذر التحديث");
        setActions((prev) => prev.map((a) => (a.id === id ? { ...a, enabled: currentVal } : a)));
      }
    } catch {
      toastError("حدث خطأ في الاتصال بالخادم");
      setActions((prev) => prev.map((a) => (a.id === id ? { ...a, enabled: currentVal } : a)));
    }
  };

  if (loading) {
    return (
      <div dir="rtl" className="p-6 text-center text-sm font-bold text-[var(--ink-3)]">
        جارٍ تحميل الأوامر التعليمية...
      </div>
    );
  }

  return (
    <div dir="rtl" className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {actions.map((act) => (
          <div
            key={act.id}
            className="rounded-2xl p-5 flex items-center justify-between"
            style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
          >
            <div>
              <h3 className="font-bold text-base text-[var(--ink)] mb-1">{act.name}</h3>
              <p className="text-xs text-[var(--ink-2)]">{act.desc}</p>
            </div>
            <button
              onClick={() => toggleAction(act.id, act.enabled)}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-colors cursor-pointer border-none shrink-0 ${
                act.enabled ? "bg-[var(--brand)] text-[var(--on-brand)]" : "bg-[var(--surface-2)] text-[var(--ink-3)]"
              }`}
            >
              {act.enabled ? "مُفعّل ✅" : "معطّل ❌"}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
