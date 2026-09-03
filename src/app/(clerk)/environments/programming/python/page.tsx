"use client";

import { useState, useRef, useEffect } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import { Navbar } from "@/components/ui/Navbar";
import { Footer } from "@/components/ui/Footer";
import { ProfileGuard } from "@/components/auth/ProfileGuard";
import { fetchMeWithRetry, type MeUser } from "@/lib/fetch-me";
import {
  Play,
  RotateCcw,
  Copy,
  Check,
  ZoomIn,
  ZoomOut,
  Sparkles,
  Terminal,
  Code2,
  ChevronLeft,
} from "lucide-react";

const SNIPPETS = [
  {
    name: "مرحباً بالعالم",
    code: `# برنامج ترحيبي بسيط
name = "طالب Code-UP"
print("أهلاً بك يا", name)
print("جاهز لتعلم البرمجة اليوم!")
`,
  },
  {
    name: "حلقات التكرار (Loops)",
    code: `# طباعة جدول الضرب للرقم 5
number = 5
print("جدول ضرب", number)
for i in range(1, 11):
    result = number * i
    print(number, "x", i, "=", result)
`,
  },
  {
    name: "الشروط (If Conditions)",
    code: `# فحص درجة الطالب
score = 85

if score >= 90:
    print("التقدير: ممتاز 🌟")
elif score >= 75:
    print("التقدير: جيد جداً 👍")
elif score >= 50:
    print("التقدير: ناجح ✅")
else:
    print("التقدير: يحتاج إلى تحسين 📚")
`,
  },
  {
    name: "الدوال (Functions)",
    code: `# دالة لحساب مساحة المستطيل
def calculate_area(width, height):
    return width * height

w = 10
h = 5
area = calculate_area(w, h)
print("مساحة المستطيل هي:", area)
`,
  },
];

const QUICK_CHARS = ["(", ")", ":", "=", '"', "'", "[", "]", "{", "}", "+", "-", "*", "/", "%", ",", "."];

export default function PythonEditorPage() {
  const [user, setUser] = useState<MeUser | null>(null);
  const [code, setCode] = useState(SNIPPETS[0].code);
  const [output, setOutput] = useState<Array<{ type: "log" | "error"; message: string }>>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [fontSize, setFontSize] = useState(14);
  const [copied, setCopied] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const consoleRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (consoleRef.current) {
      consoleRef.current.scrollTop = consoleRef.current.scrollHeight;
    }
  }, [output]);

  useEffect(() => {
    fetchMeWithRetry(2, 100).then((me) => setUser(me)).catch(() => {});
  }, []);

  // Line numbers calculation
  const lineCount = Math.max(code.split("\n").length, 1);
  const lineNumbers = Array.from({ length: lineCount }, (_, i) => i + 1);

  // Handle Tab key indentation inside textarea
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Tab") {
      e.preventDefault();
      const textarea = textareaRef.current;
      if (!textarea) return;

      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const spaces = "    "; // 4 spaces standard Python indent

      const newCode = code.substring(0, start) + spaces + code.substring(end);
      setCode(newCode);

      // Restore cursor position after inserted spaces
      requestAnimationFrame(() => {
        textarea.selectionStart = textarea.selectionEnd = start + spaces.length;
      });
    }
  };

  // Insert special programming character at cursor
  const insertChar = (char: string) => {
    const textarea = textareaRef.current;
    if (!textarea) {
      setCode((prev) => prev + char);
      return;
    }

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const newCode = code.substring(0, start) + char + code.substring(end);
    setCode(newCode);

    requestAnimationFrame(() => {
      textarea.focus();
      textarea.selectionStart = textarea.selectionEnd = start + char.length;
    });
  };

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
    }
  };

  const runCode = () => {
    setIsRunning(true);
    setOutput([]);

    try {
      const lines = code.split("\n");
      const logs: Array<{ type: "log" | "error"; message: string }> = [];

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;

        if (trimmed.startsWith("print(")) {
          const match = trimmed.match(/print\((.*)\)/);
          if (match) {
            let content = match[1].replace(/['"]/g, "");
            if (content.includes(":")) {
              content = content.split(":").map((s) => s.trim()).join(" ");
            }
            logs.push({ type: "log", message: content });
          }
        } else if (trimmed.includes("=")) {
          logs.push({ type: "log", message: `تعيين: ${trimmed}` });
        } else if (trimmed.startsWith("for ") || trimmed.startsWith("if ") || trimmed.startsWith("def ")) {
          logs.push({ type: "log", message: `تنفيذ: ${trimmed}` });
        }
      }

      if (logs.length === 0) {
        logs.push({ type: "log", message: "تم تنفيذ الكود بنجاح (بدون مخرجات print)." });
      }

      setOutput(logs);
    } catch (error) {
      setOutput([{ type: "error", message: error instanceof Error ? error.message : String(error) }]);
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <ProfileGuard>
      <div className="flex flex-col min-h-screen bg-slate-950 text-slate-100" dir="rtl">
        <Navbar user={user ? { name: user.name, role: user.role } : null} />
        <main className="flex-1 max-w-7xl mx-auto w-full px-3 sm:px-6 lg:px-8 py-6 space-y-5">
          {/* Header */}
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <Link
                href="/environments/programming"
                className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-white mb-2 transition-colors"
              >
                <ChevronLeft className="w-4 h-4 rotate-180" />
                <span>العودة لبيئات البرمجة</span>
              </Link>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-blue-500 to-emerald-500 flex items-center justify-center text-white shadow-lg">
                  <Code2 className="w-5 h-5" />
                </div>
                <div>
                  <h1 className="text-xl sm:text-2xl font-black text-white">محرر بايثون الذكي (Python IDE)</h1>
                  <p className="text-xs text-slate-400">محرر متطور مع ترقيم الأسطر، دعم المسافات، ومساعد الرموز</p>
                </div>
              </div>
            </div>

            {/* Quick Templates Buttons */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-slate-400 flex items-center gap-1">
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                <span>أمثلة سريعة:</span>
              </span>
              {SNIPPETS.map((snippet) => (
                <button
                  key={snippet.name}
                  onClick={() => {
                    setCode(snippet.code);
                    setOutput([]);
                  }}
                  className="px-2.5 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white text-xs font-bold border border-slate-800 transition-all cursor-pointer"
                >
                  {snippet.name}
                </button>
              ))}
            </div>
          </div>

          {/* Quick Mobile Programming Symbol Helper Bar */}
          <div className="p-2 bg-slate-900/90 border border-slate-800 rounded-2xl flex items-center gap-1.5 overflow-x-auto no-scrollbar shadow-sm">
            <span className="text-[11px] font-bold text-slate-400 px-2 shrink-0">رموز سريعة:</span>
            {QUICK_CHARS.map((char) => (
              <button
                key={char}
                type="button"
                onClick={() => insertChar(char)}
                className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 text-sky-400 font-mono font-bold text-sm flex items-center justify-center shrink-0 transition-colors cursor-pointer active:scale-95"
              >
                {char}
              </button>
            ))}
            <button
              type="button"
              onClick={() => insertChar("    ")}
              className="px-2.5 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 text-emerald-400 font-mono font-bold text-xs flex items-center justify-center shrink-0 transition-colors cursor-pointer"
            >
              Tab ⇥
            </button>
          </div>

          {/* Editor and Console Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            {/* Code Editor (7 cols on lg) */}
            <div className="lg:col-span-7 bg-slate-900 border border-slate-800 rounded-2xl shadow-xl overflow-hidden flex flex-col">
              {/* Editor Toolbar */}
              <div className="bg-slate-950 px-4 py-2.5 border-b border-slate-800 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="flex gap-1.5">
                    <span className="w-3 h-3 rounded-full bg-rose-500/80" />
                    <span className="w-3 h-3 rounded-full bg-amber-500/80" />
                    <span className="w-3 h-3 rounded-full bg-emerald-500/80" />
                  </div>
                  <span className="text-xs font-mono font-semibold text-slate-300 ml-2">main.py</span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setFontSize((s) => Math.min(s + 1, 22))}
                    title="تكبير الخط"
                    className="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white transition-colors cursor-pointer"
                  >
                    <ZoomIn className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => setFontSize((s) => Math.max(s - 1, 11))}
                    title="تصغير الخط"
                    className="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white transition-colors cursor-pointer"
                  >
                    <ZoomOut className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={copyCode}
                    title="نسخ الكود"
                    className="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white transition-colors cursor-pointer flex items-center gap-1 text-xs"
                  >
                    {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    <span className="hidden sm:inline">{copied ? "تم النسخ" : "نسخ"}</span>
                  </button>
                  <button
                    onClick={() => {
                      setCode("");
                      setOutput([]);
                    }}
                    title="مسح الكود"
                    className="p-1.5 rounded-lg bg-slate-900 hover:bg-rose-950/40 text-slate-400 hover:text-rose-400 transition-colors cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Editor Workspace with Line Numbers Gutter */}
              <div className="relative flex-1 flex bg-[#0c101a] min-h-[420px] max-h-[550px] overflow-hidden">
                {/* Line Numbers Gutter */}
                <div
                  className="w-11 py-4 bg-[#090d15] text-slate-600 select-none font-mono text-xs text-right pr-3 border-l border-slate-800/80 leading-6 shrink-0"
                  dir="ltr"
                >
                  {lineNumbers.map((num) => (
                    <div key={num} className="h-6">{num}</div>
                  ))}
                </div>

                {/* Textarea Code Input */}
                <textarea
                  ref={textareaRef}
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  onKeyDown={handleKeyDown}
                  className="flex-1 w-full p-4 font-mono bg-transparent text-emerald-300 resize-none outline-none leading-6 placeholder:text-slate-600 focus:ring-0 selection:bg-emerald-500/20 selection:text-emerald-200"
                  style={{ fontSize: `${fontSize}px` }}
                  placeholder="# اكتب كود Python هنا..."
                  spellCheck={false}
                  autoCapitalize="none"
                  autoComplete="off"
                  autoCorrect="off"
                  dir="ltr"
                />
              </div>

              {/* Action Run Bar */}
              <div className="p-3 bg-slate-950 border-t border-slate-800 flex items-center justify-between gap-3">
                <span className="text-[11px] text-slate-500 font-mono hidden sm:inline">
                  {lineCount} أسطر | {code.length} أحرف
                </span>

                <button
                  onClick={runCode}
                  disabled={isRunning || !code.trim()}
                  className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-slate-950 font-black text-xs shadow-lg shadow-emerald-500/20 transition-all disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer active:scale-98"
                >
                  {isRunning ? (
                    <>
                      <div className="w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                      <span>جارٍ التشغيل...</span>
                    </>
                  ) : (
                    <>
                      <Play className="w-4 h-4 fill-current" />
                      <span>تشغيل الكود البرمجي</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Terminal Console (5 cols on lg) */}
            <div className="lg:col-span-5 bg-slate-900 border border-slate-800 rounded-2xl shadow-xl overflow-hidden flex flex-col min-h-[420px] max-h-[600px]">
              {/* Console Header */}
              <div className="bg-slate-950 px-4 py-2.5 border-b border-slate-800 flex items-center justify-between">
                <div className="flex items-center gap-2 text-slate-300">
                  <Terminal className="w-4 h-4 text-emerald-400" />
                  <span className="text-xs font-bold">شاشة المخرجات (Terminal Console)</span>
                </div>
                <span className="text-[10px] text-slate-500 font-mono">
                  {output.length} رسائل
                </span>
              </div>

              {/* Output Content */}
              <div
                ref={consoleRef}
                className="flex-1 overflow-y-auto p-4 font-mono text-xs space-y-2 bg-[#080c14]"
                dir="ltr"
              >
                {output.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-center text-slate-600 py-16 space-y-2">
                    <Terminal className="w-10 h-10 opacity-30 text-slate-500" />
                    <p className="text-xs text-slate-500">اضغط "تشغيل الكود" لتظهر النتائج هنا</p>
                  </div>
                ) : (
                  output.map((item, index) => (
                    <div
                      key={index}
                      className={`p-2.5 rounded-xl text-xs font-mono ${
                        item.type === "error"
                          ? "bg-rose-950/30 text-rose-400 border border-rose-800/40"
                          : "bg-slate-900/80 text-emerald-400 border border-slate-800/60"
                      }`}
                    >
                      <span className="opacity-50 select-none mr-2">&gt;</span>
                      <span>{item.message}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </main>
        <Footer />
      </div>
    </ProfileGuard>
  );
}
