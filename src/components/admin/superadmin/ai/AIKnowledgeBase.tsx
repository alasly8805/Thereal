"use client";
import { useState } from "react";

export default function AIKnowledgeBase() {
  const [subjects] = useState([
    { name: "الفيزياء", chapters: 8, lessons: 34, version: "2.1", status: "منشور" },
    { name: "الرياضيات", chapters: 12, lessons: 52, version: "3.0", status: "منشور" },
    { name: "الكيمياء", chapters: 6, lessons: 28, version: "1.5", status: "محدث مؤخراً" },
    { name: "اللغة العربية", chapters: 10, lessons: 40, version: "2.0", status: "منشور" },
  ]);

  return (
    <div dir="rtl" className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {subjects.map((s) => (
          <div key={s.name} className="rounded-2xl p-5" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold text-base text-[var(--ink)]">محتوى {s.name}</h3>
              <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-[var(--surface-2)] text-[var(--brand)]">{s.status}</span>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center my-4">
              <div className="p-2 rounded-xl bg-[var(--surface-2)]">
                <div className="text-lg font-black text-[var(--ink)]">{s.chapters}</div>
                <div className="text-xs text-[var(--ink-3)]">فصل</div>
              </div>
              <div className="p-2 rounded-xl bg-[var(--surface-2)]">
                <div className="text-lg font-black text-[var(--ink)]">{s.lessons}</div>
                <div className="text-xs text-[var(--ink-3)]">درس</div>
              </div>
              <div className="p-2 rounded-xl bg-[var(--surface-2)]">
                <div className="text-lg font-black text-[var(--brand)]">v{s.version}</div>
                <div className="text-xs text-[var(--ink-3)]">الإصدار</div>
              </div>
            </div>
            <button className="w-full py-2 rounded-xl text-xs font-bold bg-[var(--surface-2)] text-[var(--ink)] hover:bg-[var(--border)] transition-colors">
              استعراض شجرة المحتوى والمفاهيم
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
