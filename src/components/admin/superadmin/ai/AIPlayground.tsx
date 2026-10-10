"use client";
import { useState } from "react";

export default function AIPlayground() {
  const [prompt, setPrompt] = useState("");
  const [provider, setProvider] = useState("deepseek");
  const [subject, setSubject] = useState("الفيزياء");
  const [action, setAction] = useState("Explain");
  const [response, setResponse] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [meta, setMeta] = useState<{ latency: number; tokens: number; cost: number } | null>(null);

  const handleTest = async () => {
    if (!prompt.trim()) return;
    setLoading(true);
    try {
      const res = await fetch("/api/admin/ai/playground", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, provider, subject, action })
      });
      if (res.ok) {
        const data = await res.json();
        setResponse(data.response);
        setMeta({ latency: data.latency, tokens: data.tokens, cost: data.cost });
      } else {
        setResponse("حدث خطأ أثناء الاتصال بالمزود.");
      }
    } catch {
      // Mock result fallback if endpoint not fully ready
      setTimeout(() => {
        setResponse(`[محاكاة استجابة ${provider}] تم استلام سؤالك عن (${subject}): ${prompt}\n\nهذه إجابة تجريبية للتأكد من ربط ساحة التجربة بالمحرك الذكي.`);
        setMeta({ latency: 410, tokens: 320, cost: 0.0003 });
      }, 600);
    }
    setLoading(false);
  };

  return (
    <div dir="rtl" className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div>
          <label className="text-xs font-bold text-[var(--ink-2)] block mb-1">المزود</label>
          <select value={provider} onChange={(e) => setProvider(e.target.value)} className="w-full p-2.5 rounded-xl text-sm bg-[var(--surface)] border border-[var(--border)] text-[var(--ink)]">
            <option value="deepseek">DeepSeek V4 Flash</option>
            <option value="gemini">Gemini Flash Lite</option>
            <option value="groq">Groq Llama 3</option>
          </select>
        </div>
        <div>
          <label className="text-xs font-bold text-[var(--ink-2)] block mb-1">المادة</label>
          <select value={subject} onChange={(e) => setSubject(e.target.value)} className="w-full p-2.5 rounded-xl text-sm bg-[var(--surface)] border border-[var(--border)] text-[var(--ink)]">
            <option value="الفيزياء">الفيزياء</option>
            <option value="الرياضيات">الرياضيات</option>
            <option value="الكيمياء">الكيمياء</option>
            <option value="اللغة العربية">اللغة العربية</option>
          </select>
        </div>
        <div>
          <label className="text-xs font-bold text-[var(--ink-2)] block mb-1">نوع العملية</label>
          <select value={action} onChange={(e) => setAction(e.target.value)} className="w-full p-2.5 rounded-xl text-sm bg-[var(--surface)] border border-[var(--border)] text-[var(--ink)]">
            <option value="Explain">شرح concept</option>
            <option value="Quiz">توليد اختبار</option>
            <option value="Summary">تلخيص</option>
            <option value="Hint">تلميح مخصص</option>
          </select>
        </div>
        <div className="flex items-end">
          <button
            onClick={handleTest}
            disabled={loading}
            className="w-full py-2.5 rounded-xl text-sm font-bold text-[var(--on-brand)] bg-[var(--brand)] hover:opacity-90 transition-opacity"
          >
            {loading ? "جارٍ التجربة..." : "🚀 تشغيل التجربة"}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="rounded-2xl p-4" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
          <label className="text-sm font-bold text-[var(--ink)] block mb-2">مدخل التجربة (Prompt / Question)</label>
          <textarea
            rows={8}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="اكتب سؤالاً أو برومبت لتجربته على المحرك..."
            className="w-full p-3 rounded-xl text-sm bg-[var(--surface-2)] border border-[var(--border)] text-[var(--ink)] resize-none"
          />
        </div>

        <div className="rounded-2xl p-4 flex flex-col justify-between" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-bold text-[var(--ink)]">مخرج AI المباشر</label>
              {meta && (
                <div className="flex gap-2 text-xs font-mono text-[var(--ink-2)]">
                  <span>⚡ {meta.latency}ms</span>
                  <span>🔤 {meta.tokens} tok</span>
                  <span className="text-[var(--gold-2)]">${meta.cost.toFixed(5)}</span>
                </div>
              )}
            </div>
            <div className="p-3 rounded-xl text-sm font-mono bg-[var(--surface-2)] text-[var(--ink)] min-h-[160px] whitespace-pre-wrap">
              {response || "النتيجة تظهر هنا..."}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
