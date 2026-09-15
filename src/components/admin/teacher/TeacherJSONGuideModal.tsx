"use client";

import React, { useState } from "react";
import { X, Copy, Check, Download, BookOpen, HelpCircle, Sparkles } from "lucide-react";

export const sampleQuizData = {
  title: "اختبار تجريبي نموذجي (شامل الخيارات)",
  timeLimitMinutes: 30,
  questions: [
    {
      question: "ما هي وحدة قياس القوة في النظام الدولي؟ (سؤال 4 خيارات)",
      questionType: "mcq",
      imageUrl: "",
      optionA: "النيوتن",
      optionB: "الجول",
      optionC: "الفولت",
      optionD: "الواط",
      correctAnswer: "A"
    },
    {
      question: "ما هو تصنيف المثلث الذي يحتوي على زاوية 90 درجة؟ (سؤال 3 خيارات)",
      questionType: "mcq",
      imageUrl: "",
      optionA: "قائم الزاوية",
      optionB: "حاد الزوايا",
      optionC: "منفرج الزاوية",
      correctAnswer: "A"
    },
    {
      question: "تدور الأرض حول الشمس مرة كل سنة تقريباً؟ (سؤال خيارين صح / خطأ)",
      questionType: "mcq",
      imageUrl: "",
      optionA: "صح",
      optionB: "خطأ",
      correctAnswer: "A"
    },
    {
      question: "اشرح قانون نيوتن الأول وتطبيقاته العملية باختصار (سؤال مقالي يُصحح يدوياً)",
      questionType: "essay"
    }
  ]
};

export const sampleHomeworkData = {
  title: "واجب تفاعلي تطبيقي (شامل الخيارات)",
  description: "واجب يحتوي على أسئلة متنوعة: خيارين، 3 خيارات، و4 خيارات",
  type: "exam",
  timeLimitMinutes: 30,
  questions: [
    {
      question: "عاصمة جمهورية مصر العربية هي: (سؤال 4 خيارات)",
      imageUrl: "",
      optionA: "القاهرة",
      optionB: "الإسكندرية",
      optionC: "الجيزة",
      optionD: "بورسعيد",
      correctAnswer: "A"
    },
    {
      question: "أي مما يلي يُعد من مصادر الطاقة المتجددة؟ (سؤال 3 خيارات)",
      imageUrl: "",
      optionA: "الطاقة الشمسية",
      optionB: "الفحم الحجري",
      optionC: "الغاز الطبيعي",
      correctAnswer: "A"
    },
    {
      question: "الماء يتجمد عند 0 درجة مئوية تحت الضغط الجوي العادي؟ (سؤال خيارين صح / خطأ)",
      imageUrl: "",
      optionA: "صح",
      optionB: "خطأ",
      correctAnswer: "A"
    }
  ]
};

export function downloadJsonFile(filename: string, data: unknown) {
  const jsonStr = JSON.stringify(data, null, 2);
  const blob = new Blob([jsonStr], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function TeacherJSONGuideModal({
  isOpen,
  onClose,
  initialTab = "quiz",
}: {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: "quiz" | "homework";
}) {
  const [activeTab, setActiveTab] = useState<"quiz" | "homework">(initialTab);
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const currentData = activeTab === "quiz" ? sampleQuizData : sampleHomeworkData;
  const currentFilename = activeTab === "quiz" ? "quiz_sample.json" : "homework_sample.json";

  const handleCopy = () => {
    navigator.clipboard.writeText(JSON.stringify(currentData, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    downloadJsonFile(currentFilename, currentData);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-xs animate-in fade-in duration-150"
      dir="rtl"
    >
      <div className="w-full max-w-3xl max-h-[92vh] rounded-3xl overflow-hidden flex flex-col shadow-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-950/60">
          <div className="flex items-center gap-3">
            <span className="p-2.5 rounded-2xl bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
              <Sparkles className="w-5 h-5" />
            </span>
            <div>
              <h3 className="text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
                <span>دليل وقوالب استيراد ملفات JSON</span>
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                يدعم الاختبارات والواجبات، والأسئلة بـ (خيارين صح/خطأ)، (3 خيارات)، و(4 خيارات).
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-xl bg-slate-200/70 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 flex items-center justify-center transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab switcher */}
        <div className="flex border-b border-slate-200 dark:border-slate-800 bg-slate-100/70 dark:bg-slate-950/40 p-1.5 gap-1.5">
          <button
            type="button"
            onClick={() => setActiveTab("quiz")}
            className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer ${
              activeTab === "quiz"
                ? "bg-white dark:bg-slate-800 text-sky-600 dark:text-sky-400 shadow-xs"
                : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
            }`}
          >
            <HelpCircle className="w-4 h-4" />
            <span>قالب الاختبارات (Quizzes)</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("homework")}
            className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer ${
              activeTab === "homework"
                ? "bg-white dark:bg-slate-800 text-amber-600 dark:text-amber-400 shadow-xs"
                : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
            }`}
          >
            <BookOpen className="w-4 h-4" />
            <span>قالب الواجبات (Homeworks)</span>
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5">
          {/* Rules & Guidelines Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="p-3.5 rounded-2xl bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200/80 dark:border-emerald-900/50 space-y-1">
              <span className="text-[11px] font-black text-emerald-700 dark:text-emerald-300 block">
                ⚡ خيارين (صح / خطأ)
              </span>
              <p className="text-[11px] text-emerald-900/80 dark:text-emerald-300/80 leading-relaxed">
                اكتب <code className="font-mono font-bold">optionA</code> و <code className="font-mono font-bold">optionB</code> فقط. اجعل <code className="font-mono font-bold">correctAnswer</code> إما <code className="font-mono">"A"</code> أو <code className="font-mono">"B"</code>.
              </p>
            </div>

            <div className="p-3.5 rounded-2xl bg-sky-50/70 dark:bg-sky-950/30 border border-sky-200/80 dark:border-sky-900/50 space-y-1">
              <span className="text-[11px] font-black text-sky-700 dark:text-sky-300 block">
                🎯 ٣ خيارات (A, B, C)
              </span>
              <p className="text-[11px] text-sky-900/80 dark:text-sky-300/80 leading-relaxed">
                اكتب <code className="font-mono font-bold">optionA</code> و <code className="font-mono font-bold">optionB</code> و <code className="font-mono font-bold">optionC</code>. واترك الخيار الرابع فارغاً أو محذوفاً.
              </p>
            </div>

            <div className="p-3.5 rounded-2xl bg-purple-50/70 dark:bg-purple-950/30 border border-purple-200/80 dark:border-purple-900/50 space-y-1">
              <span className="text-[11px] font-black text-purple-700 dark:text-purple-300 block">
                🌟 ٤ خيارات ومقالي
              </span>
              <p className="text-[11px] text-purple-900/80 dark:text-purple-300/80 leading-relaxed">
                النموذج التقليدي (A, B, C, D). وفي الاختبارات يمكنك إضافة سؤال مقالي بجعل <code className="font-mono font-bold">"questionType": "essay"</code>.
              </p>
            </div>
          </div>

          {/* Code Viewer Section */}
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-950 overflow-hidden shadow-inner">
            <div className="px-4 py-2.5 bg-slate-900 border-b border-slate-800 flex items-center justify-between text-xs">
              <span className="font-mono text-slate-400 flex items-center gap-2">
                <span>📄 {currentFilename}</span>
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleCopy}
                  className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copied ? "تم النسخ!" : "نسخ الكود"}</span>
                </button>
                <button
                  type="button"
                  onClick={handleDownload}
                  className="px-2.5 py-1 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>تحميل ملف JSON</span>
                </button>
              </div>
            </div>
            <pre
              className="p-4 text-xs font-mono text-emerald-400 overflow-x-auto max-h-80 leading-relaxed text-left"
              dir="ltr"
            >
              {JSON.stringify(currentData, null, 2)}
            </pre>
          </div>

          {/* Import Tips */}
          <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-950/50 border border-slate-200 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-400 space-y-1.5">
            <p className="font-bold text-slate-800 dark:text-slate-200">💡 نصائح مفيدة:</p>
            <ul className="list-disc list-inside space-y-1 text-[11px] leading-relaxed">
              <li>يمكنك أيضاً استيراد مصفوفة أسئلة مباشرة <code className="font-mono text-sky-500">[ &#123; ... &#125; ]</code> بدون كائن العنوان الرئيسي.</li>
              <li>الصور: يمكنك وضع رابط مباشر لصورة السؤال في الحقل <code className="font-mono text-sky-500">imageUrl</code> (مثل رابط ImgBB أو Google Drive المباشر).</li>
              <li>يمكنك تنزيل هذا القالب وتعديله في أي برنامج أو إرساله لـ ChatGPT لتوليد مئات الأسئلة بنفس التنسيق فوراً!</li>
            </ul>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-950/60">
          <button
            type="button"
            onClick={handleDownload}
            className="px-4 py-2 rounded-xl bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5"
          >
            <Download className="w-3.5 h-3.5" />
            <span>تحميل نموذج {activeTab === "quiz" ? "الاختبار" : "الواجب"} (.json)</span>
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold transition-colors cursor-pointer shadow-sm"
          >
            فهمت، إغلاق الدليل
          </button>
        </div>
      </div>
    </div>
  );
}
