"use client";
import { useState } from "react";

export default function AIMemoryManager() {
  const [memories] = useState([
    { student: "أحمد محمود", keyTopics: ["الفيزياء - قانون نيوتن", "الرياضيات - التفاضل"], lastSession: "منذ 10 دقائق" },
    { student: "سارة علي", keyTopics: ["الكيمياء العضوية - الألكانات"], lastSession: "منذ ساعة" },
    { student: "عمر خالد", keyTopics: ["اللغة العربية - البلاغة"], lastSession: "منذ يومين" },
  ]);

  return (
    <div dir="rtl" className="space-y-4">
      <div className="rounded-2xl p-5" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
        <h3 className="font-bold text-base text-[var(--ink)] mb-4">جلسات الذاكرة قصيرة وطويلة المدى للطلاب</h3>
        <div className="divide-y divide-[var(--border)]">
          {memories.map((m) => (
            <div key={m.student} className="py-3 flex items-center justify-between">
              <div>
                <div className="font-bold text-sm text-[var(--ink)]">{m.student}</div>
                <div className="flex gap-2 mt-1">
                  {m.keyTopics.map(t => (
                    <span key={t} className="text-xs px-2 py-0.5 rounded bg-[var(--surface-2)] text-[var(--ink-2)]">{t}</span>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs text-[var(--ink-3)]">{m.lastSession}</span>
                <button className="text-xs font-bold text-[var(--danger)] hover:underline">محي الذاكرة</button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
