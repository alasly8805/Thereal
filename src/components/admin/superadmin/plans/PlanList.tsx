"use client";

import { useState, useEffect } from "react";
import { useToast } from "@/components/ui/Toast";
import { IconPlus, IconFolder, IconBook } from "@/components/admin/AdminIcons";

export function PlanList({ onSelectPlan }: { onSelectPlan: (id: string) => void }) {
  const { success, error } = useToast();
  const [plans, setPlans] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [stageFilter, setStageFilter] = useState("");
  const [showCreateModal, setShowCreateModal] = useState(false);

  // Form State for creating a new plan
  const [newPlan, setNewPlan] = useState({
    title: "",
    description: "",
    educationalStage: "sec_1",
    monthIndex: 1,
    price: 0,
    durationDays: 30,
    chatEnabled: true,
    gradingAIEnabled: true
  });

  const fetchPlans = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/superadmin/plans${stageFilter ? `?stage=${stageFilter}` : ""}`);
      const data = await res.json();
      if (res.ok) setPlans(data.plans || []);
      else error(data.error);
    } catch {
      error("تعذر جلب الخطط");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPlans();
  }, [stageFilter]);

  const STAGES = [
    { value: "", label: "الكل" },
    { value: "sec_1", label: "أولى بكالوريا" },
    { value: "sec_2", label: "ثانية بكالوريا" },
  ];

  const getStageLabel = (stage: string) => {
    const s = STAGES.find(x => x.value === stage);
    return s ? s.label : stage;
  };

  const handleCreatePlan = async (e: React.FormEvent) => {
    e.preventDefault();
    const points = newPlan.description.split("\n").map(p => p.trim()).filter(Boolean);
    const serializedDesc = JSON.stringify(points);
    try {
      const res = await fetch("/api/admin/superadmin/plans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...newPlan,
          description: serializedDesc,
          monthIndex: Number(newPlan.monthIndex),
          price: Number(newPlan.price),
          durationDays: Number(newPlan.durationDays)
        })
      });

      const data = await res.json();
      if (res.ok) {
        success("تم إنشاء الخطة بنجاح");
        setShowCreateModal(false);
        setNewPlan({
          title: "",
          description: "",
          educationalStage: "sec_1",
          monthIndex: 1,
          price: 0,
          durationDays: 30,
          chatEnabled: true,
          gradingAIEnabled: true
        });
        fetchPlans();
      } else {
        error(data.error || "فشل إنشاء الخطة");
      }
    } catch {
      error("حدث خطأ أثناء الإنشاء");
    }
  };

  return (
    <div className="space-y-4" dir="rtl">
      <div className="flex items-center justify-between">
        <select
          value={stageFilter}
          onChange={(e) => setStageFilter(e.target.value)}
          className="px-4 py-2 rounded-lg border outline-none text-sm font-bold"
          style={{ background: "var(--surface)", borderColor: "var(--border)", color: "var(--ink)" }}
        >
          {STAGES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>

        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-2 px-4 py-2 text-[var(--on-brand)] font-bold rounded-lg transition-opacity hover:opacity-90 cursor-pointer border-none text-sm"
          style={{ background: "var(--brand)" }}
        >
          <IconPlus className="w-4 h-4" />
          إنشاء خطة جديدة
        </button>
      </div>

      {loading ? (
        <div className="p-10 text-center animate-pulse" style={{ color: "var(--ink-3)" }}>جارٍ التحميل...</div>
      ) : plans.length === 0 ? (
        <div className="p-10 text-center" style={{ color: "var(--ink-3)" }}>لا توجد خطط دراسية</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {plans.map(plan => (
            <div
              key={plan.id}
              onClick={() => onSelectPlan(plan.id)}
              className="rounded-xl p-5 cursor-pointer transition-all hover:-translate-y-1"
              style={{ background: "var(--surface)", border: "1px solid var(--border)", boxShadow: "var(--shadow-sm)" }}
            >
              <div className="flex justify-between items-start mb-4">
                <span className={`px-2 py-1 text-xs font-bold rounded-full ${
                  plan.status === "published" ? "bg-[var(--ok-soft)] text-[var(--ok)]" :
                  plan.status === "archived" ? "bg-[var(--surface-2)] text-[var(--ink-2)]" :
                  "bg-[var(--warn-soft)] text-[var(--warn)]"
                }`}>
                  {plan.status === "published" ? "منشورة" : plan.status === "archived" ? "مؤرشفة" : "مسودة"}
                </span>
                <span className="text-xs font-semibold" style={{ color: "var(--brand)" }}>
                  {plan.price.toLocaleString("ar-EG")} ج.م
                </span>
              </div>
              
              <h3 className="font-bold text-lg mb-1" style={{ color: "var(--ink)" }}>{plan.title}</h3>
              
              {/* Display Educational Stage and Month Index */}
              <div className="flex gap-2 my-2">
                <span className="bg-[color-mix(in_srgb,var(--violet)_12%,transparent)] text-[var(--violet)] px-2 py-0.5 rounded text-xs font-bold">
                  {getStageLabel(plan.educationalStage)}
                </span>
                <span className="bg-[var(--info-soft)] text-[var(--info)] px-2 py-0.5 rounded text-xs font-bold">
                  الشهر {plan.monthIndex}
                </span>
              </div>

              <p className="text-sm line-clamp-2 mb-4" style={{ color: "var(--ink-2)" }}>{plan.description}</p>
              
              <div className="flex items-center gap-4 text-xs font-semibold" style={{ color: "var(--ink-3)" }}>
                <span className="flex items-center gap-1">
                  <IconBook className="w-4 h-4" />
                  {plan._count?.lessons || 0} درس
                </span>
                <span className="flex items-center gap-1">
                  <IconFolder className="w-4 h-4" />
                  {plan._count?.enrollments || 0} طالب
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create Plan Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg bg-[var(--surface)] border border-[var(--border)] rounded-2xl shadow-xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-5 border-b border-[var(--border)] flex justify-between items-center bg-[var(--surface-2)]">
              <h3 className="text-lg font-black text-[var(--ink)]">إنشاء خطة دراسية جديدة</h3>
              <button 
                onClick={() => setShowCreateModal(false)}
                className="text-[var(--ink-2)] hover:text-[var(--ink-2)] bg-transparent border-none cursor-pointer text-xl font-bold"
              >
                &times;
              </button>
            </div>
            
            <form onSubmit={handleCreatePlan} className="p-6 overflow-y-auto space-y-4 flex-1">
              <div>
                <label className="block text-sm font-bold mb-1 text-[var(--ink)]">المرحلة الدراسية</label>
                <select
                  value={newPlan.educationalStage}
                  onChange={e => setNewPlan({...newPlan, educationalStage: e.target.value})}
                  className="w-full p-2 border rounded bg-[var(--surface-2)] text-[var(--ink)]"
                  style={{ borderColor: "var(--border)" }}
                >
                  {STAGES.filter(s => s.value !== "").map(s => (
                    <option key={s.value} value={s.value}>{s.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-bold mb-1 text-[var(--ink)]">مؤشر الشهر</label>
                <input 
                  type="number"
                  min="1"
                  max="12"
                  value={newPlan.monthIndex}
                  onChange={e => setNewPlan({...newPlan, monthIndex: Number(e.target.value)})}
                  className="w-full p-2 border rounded bg-[var(--surface-2)] text-[var(--ink)]"
                  style={{ borderColor: "var(--border)" }}
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-bold mb-1 text-[var(--ink)]">عنوان الخطة</label>
                <input 
                  type="text"
                  value={newPlan.title}
                  onChange={e => setNewPlan({...newPlan, title: e.target.value})}
                  className="w-full p-2 border rounded bg-[var(--surface-2)] text-[var(--ink)]"
                  style={{ borderColor: "var(--border)" }}
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-bold mb-1 text-[var(--ink)]">الوصف</label>
                <textarea 
                  value={newPlan.description}
                  onChange={e => setNewPlan({...newPlan, description: e.target.value})}
                  className="w-full p-2 border rounded bg-[var(--surface-2)] text-[var(--ink)]"
                  style={{ borderColor: "var(--border)" }}
                  rows={3}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-bold mb-1 text-[var(--ink)]">السعر (جنيه)</label>
                  <input 
                    type="number"
                    min="0"
                    value={newPlan.price}
                    onChange={e => setNewPlan({...newPlan, price: Number(e.target.value)})}
                    className="w-full p-2 border rounded bg-[var(--surface-2)] text-[var(--ink)]"
                    style={{ borderColor: "var(--border)" }}
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold mb-1 text-[var(--ink)]">المدة (بالأيام)</label>
                  <input 
                    type="number"
                    min="1"
                    value={newPlan.durationDays}
                    onChange={e => setNewPlan({...newPlan, durationDays: Number(e.target.value)})}
                    className="w-full p-2 border rounded bg-[var(--surface-2)] text-[var(--ink)]"
                    style={{ borderColor: "var(--border)" }}
                    required
                  />
                </div>
              </div>

              <div className="flex flex-col gap-2 pt-2">
                <label className="flex items-center gap-2 text-sm font-bold text-[var(--ink)] cursor-pointer">
                  <input 
                    type="checkbox"
                    checked={newPlan.chatEnabled}
                    onChange={e => setNewPlan({...newPlan, chatEnabled: e.target.checked})}
                    className="w-4 h-4 rounded text-[var(--info)]"
                  />
                  تفعيل شات المساعد الذكي
                </label>
                <label className="flex items-center gap-2 text-sm font-bold text-[var(--ink)] cursor-pointer">
                  <input 
                    type="checkbox"
                    checked={newPlan.gradingAIEnabled}
                    onChange={e => setNewPlan({...newPlan, gradingAIEnabled: e.target.checked})}
                    className="w-4 h-4 rounded text-[var(--info)]"
                  />
                  تفعيل تقييم المشاريع بالذكاء الاصطناعي
                </label>
              </div>

              <div className="flex gap-3 pt-4 border-t border-[var(--border)]">
                <button
                  type="submit"
                  className="flex-1 py-2 text-[var(--on-brand)] font-bold rounded-xl border-none cursor-pointer text-sm"
                  style={{ background: "var(--brand)" }}
                >
                  حفظ الخطة
                </button>
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="flex-1 py-2 bg-[var(--surface-2)] hover:bg-[var(--adm-hover)] text-[var(--ink-2)] font-bold rounded-xl border-none cursor-pointer text-sm"
                >
                  إلغاء
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
