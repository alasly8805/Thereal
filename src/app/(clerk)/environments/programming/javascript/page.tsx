"use client";

import { useState, useRef, useEffect } from "react";
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

const JS_SNIPPETS = [
  {
    name: "مرحباً بالعالم",
    code: `// برنامج ترحيبي بـ JavaScript
const studentName = "طالب Code-UP";
console.log("أهلاً بك يا", studentName);
console.log("استعد لبرمجة مواقع وتطبيقات تفاعلية!");
`,
  },
  {
    name: "المصفوفات (Arrays)",
    code: `// التعامل مع المصفوفات
const scores = [85, 92, 78, 96, 88];

// مضاعفة الدرجات
const boosted = scores.map(s => s + 5);
console.log("الدرجات بعد الزيادة:", boosted);

// الدرجات فوق 90
const excellent = scores.filter(s => s >= 90);
console.log("درجات الامتياز:", excellent);
`,
  },
  {
    name: "الكائنات (Objects)",
    code: `// تعريف كائن يمثل طالباً
const student = {
  name: "أحمد محمد",
  stage: "الثانوية العامة",
  courses: ["فيزياء", "رياضيات", "برمجة"],
  isEnrolled: true,
};

console.log("اسم الطالب:", student.name);
console.log("عدد الكورسات المسجل بها:", student.courses.length);
`,
  },
  {
    name: "الدوال والسهم (Arrow Functions)",
    code: `// دالة سهمية لحساب المتوسط الحسابي
const getAverage = (numbers) => {
  const sum = numbers.reduce((total, n) => total + n, 0);
  return sum / numbers.length;
};

const myNumbers = [10, 20, 30, 40, 50];
console.log("المتوسط هو:", getAverage(myNumbers));
`,
  },
];

const JS_QUICK_CHARS = ["(", ")", "{", "}", "[", "]", ";", "=", "=>", '"', "'", "`", "$", "+", "-", "*", "/", "."];

function formatOutput(arg: unknown): string {
  if (arg === null) return "null";
  if (arg === undefined) return "undefined";
  if (typeof arg === "object") {
    try {
      return JSON.stringify(arg, null, 2);
    } catch {
      return String(arg);
    }
  }
  return String(arg);
}

export default function JavaScriptEditorPage() {
  const [user, setUser] = useState<MeUser | null>(null);
  const [code, setCode] = useState(JS_SNIPPETS[0].code);
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

  const lineCount = Math.max(code.split("\n").length, 1);
  const lineNumbers = Array.from({ length: lineCount }, (_, i) => i + 1);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Tab") {
      e.preventDefault();
      const textarea = textareaRef.current;
      if (!textarea) return;

      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const spaces = "  "; // 2 spaces standard JS indent

      const newCode = code.substring(0, start) + spaces + code.substring(end);
      setCode(newCode);

      requestAnimationFrame(() => {
        textarea.selectionStart = textarea.selectionEnd = start + spaces.length;
      });
    }
  };

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

    const originalLog = console.log;
    const originalError = console.error;
    const originalWarn = console.warn;

    const logs: Array<{ type: "log" | "error"; message: string }> = [];

    console.log = (...args: unknown[]) => {
      logs.push({ type: "log", message: args.map((a) => formatOutput(a)).join(" ") });
    };

    console.error = (...args: unknown[]) => {
      logs.push({ type: "error", message: args.map((a) => formatOutput(a)).join(" ") });
    };

    console.warn = (...args: unknown[]) => {
      logs.push({ type: "log", message: `⚠️ ${args.map((a) => formatOutput(a)).join(" ")}` });
    };

    try {
      const sandbox = new Function(code);
      sandbox();

      if (logs.length === 0) {
        logs.push({ type: "log", message: "تم تنفيذ الكود بنجاح (بدون مخرجات console.log)." });
      }

      setOutput(logs);
    } catch (error) {
      setOutput([{ type: "error", message: error instanceof Error ? error.message : String(error) }]);
    } finally {
      console.log = originalLog;
      console.error = originalError;
      console.warn = originalWarn;
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
                <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-amber-500 to-yellow-500 flex items-center justify-center text-slate-950 shadow-lg">
                  <Code2 className="w-5 h-5" />
                </div>
                <div>
                  <h1 className="text-xl sm:text-2xl font-black text-white">محرر جافاسكريبت (JavaScript IDE)</h1>
                  <p className="text-xs text-slate-400">محرر تفاعلي مباشر مع ترقيم الأسطر، دعم المسافات، ومساعد الرموز</p>
                </div>
              </div>
            </div>

            {/* Quick Templates Buttons */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-slate-400 flex items-center gap-1">
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                <span>أمثلة سريعة:</span>
              </span>
              {JS_SNIPPETS.map((snippet) => (
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
            {JS_QUICK_CHARS.map((char) => (
              <button
                key={char}
                type="button"
                onClick={() => insertChar(char)}
                className="px-2.5 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 text-amber-400 font-mono font-bold text-sm flex items-center justify-center shrink-0 transition-colors cursor-pointer active:scale-95"
              >
                {char}
              </button>
            ))}
            <button
              type="button"
              onClick={() => insertChar("  ")}
              className="px-2.5 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 text-yellow-400 font-mono font-bold text-xs flex items-center justify-center shrink-0 transition-colors cursor-pointer"
            >
              Tab ⇥
            </button>
          </div>

          {/* Editor and Console Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            {/* Code Editor */}
            <div className="lg:col-span-7 bg-slate-900 border border-slate-800 rounded-2xl shadow-xl overflow-hidden flex flex-col">
              {/* Toolbar */}
              <div className="bg-slate-950 px-4 py-2.5 border-b border-slate-800 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="flex gap-1.5">
                    <span className="w-3 h-3 rounded-full bg-rose-500/80" />
                    <span className="w-3 h-3 rounded-full bg-amber-500/80" />
                    <span className="w-3 h-3 rounded-full bg-emerald-500/80" />
                  </div>
                  <span className="text-xs font-mono font-semibold text-slate-300 ml-2">app.js</span>
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

              {/* Workspace with Line Numbers */}
              <div className="relative flex-1 flex bg-[#0c101a] min-h-[420px] max-h-[550px] overflow-hidden">
                <div
                  className="w-11 py-4 bg-[#090d15] text-slate-600 select-none font-mono text-xs text-right pr-3 border-l border-slate-800/80 leading-6 shrink-0"
                  dir="ltr"
                >
                  {lineNumbers.map((num) => (
                    <div key={num} className="h-6">{num}</div>
                  ))}
                </div>

                <textarea
                  ref={textareaRef}
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  onKeyDown={handleKeyDown}
                  className="flex-1 w-full p-4 font-mono bg-transparent text-amber-300 resize-none outline-none leading-6 placeholder:text-slate-600 focus:ring-0 selection:bg-amber-500/20 selection:text-amber-200"
                  style={{ fontSize: `${fontSize}px` }}
                  placeholder="// اكتب كود JavaScript هنا..."
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
                  className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-400 hover:to-yellow-400 text-slate-950 font-black text-xs shadow-lg shadow-amber-500/20 transition-all disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer active:scale-98"
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

            {/* Terminal Console */}
            <div className="lg:col-span-5 bg-slate-900 border border-slate-800 rounded-2xl shadow-xl overflow-hidden flex flex-col min-h-[420px] max-h-[600px]">
              <div className="bg-slate-950 px-4 py-2.5 border-b border-slate-800 flex items-center justify-between">
                <div className="flex items-center gap-2 text-slate-300">
                  <Terminal className="w-4 h-4 text-amber-400" />
                  <span className="text-xs font-bold">شاشة المخرجات (Console)</span>
                </div>
                <span className="text-[10px] text-slate-500 font-mono">
                  {output.length} رسائل
                </span>
              </div>

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
                          : "bg-slate-900/80 text-amber-300 border border-slate-800/60"
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
