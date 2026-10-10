"use client";

import { useState, useEffect, useRef } from "react";
import {
  Terminal,
  Play,
  Square,
  Copy,
  Check,
  Download,
  Trash2,
  Lock,
  Unlock,
  KeyRound,
  Maximize2,
  Minimize2,
  Sparkles,
  Cpu,
  Bot,
  Search,
  Folder,
  Clock,
  AlertCircle,
  Eye,
  EyeOff,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { parseAnsiToSpans, stripAnsi } from "./ansi-utils";

type ToolType = "agent" | "claude" | "agy" | "bash";

interface CommandHistoryItem {
  id: string;
  tool: ToolType;
  command: string;
  flags: string[];
  cwd: string;
  output: string;
  exitCode: number | null;
  durationMs: number | null;
  timestamp: number;
}

const STORAGE_GATE_KEY = "gate_ai_terminal_unlocked";
const STORAGE_PASS_KEY = "gate_ai_terminal_pass";

const TOOL_CONFIG: Record<
  ToolType,
  {
    name: string;
    subname: string;
    icon: typeof Terminal;
    accent: string;
    border: string;
    placeholder: string;
    description: string;
  }
> = {
  agent: {
    name: "Cursor Agent",
    subname: "agent CLI",
    icon: Cpu,
    accent: "#38bdf8",
    border: "rgba(56, 189, 248, 0.4)",
    placeholder: "اكتب طلبك للـ Cursor Agent أو الأمر (مثال: --continue أو افحص الأخطاء)...",
    description: "العميل الذكي المخصص للتطوير وفحص الملفات وكتابة الكود",
  },
  claude: {
    name: "Claude Code",
    subname: "claude CLI",
    icon: Sparkles,
    accent: "#fb923c",
    border: "rgba(251, 146, 60, 0.4)",
    placeholder: "اكتب تعليماتك لـ Claude أو أمر مثل doctor أو --continue...",
    description: "نموذج Claude الرسمي عبر سطر الأوامر لتنفيذ المهام المعقدة",
  },
  agy: {
    name: "Antigravity",
    subname: "agy CLI",
    icon: Bot,
    accent: "#a855f7",
    border: "rgba(168, 85, 247, 0.4)",
    placeholder: "اكتب أمر أو سؤال لـ Antigravity (agy)...",
    description: "أداة Antigravity الرسمية المزودة بنماذج Gemini المتطورة",
  },
  bash: {
    name: "Bash Terminal",
    subname: "Shell",
    icon: Terminal,
    accent: "#10b981",
    border: "rgba(16, 185, 129, 0.4)",
    placeholder: "أمر لينكس مباشر (مثال: git status أو pm2 status أو df -h)...",
    description: "سطر أوامر Bash سريع ومباشر على الخادم",
  },
};

export function AITerminalSection({
  userRole: _userRole = "superadmin",
  isOwner: _isOwner = false,
}: {
  userRole?: string;
  isOwner?: boolean;
}) {
  const { success: toastSuccess, error: toastError } = useToast();

  // Authentication State
  const [unlocked, setUnlocked] = useState(false);
  const [authReady, setAuthReady] = useState(false);
  const [gatePassword, setGatePassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState("");

  // Terminal Execution State
  const [activeTool, setActiveTool] = useState<ToolType>("agent");
  const [commandInput, setCommandInput] = useState("");
  const [cwd, setCwd] = useState<string>("/home/ec2-user/Thefake");
  const [activeFlags, setActiveFlags] = useState<Record<string, boolean>>({});
  const [isRunning, setIsRunning] = useState(false);
  const [currentExecId, setCurrentExecId] = useState<string | null>(null);
  const [liveOutput, setLiveOutput] = useState("");
  const [exitStatus, setExitStatus] = useState<{ code: number | null; durationMs: number | null } | null>(null);

  // UX & Viewer State
  const [copiedOutput, setCopiedOutput] = useState(false);
  const [copiedCmd, setCopiedCmd] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [history, setHistory] = useState<CommandHistoryItem[]>([]);
  const [historyNavIndex, setHistoryNavIndex] = useState<number>(-1);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  const outputContainerRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Initialize Auth from Session Storage safely after mount
  useEffect(() => {
    let isMounted = true;
    Promise.resolve().then(() => {
      if (!isMounted) return;
      try {
        const stored = sessionStorage.getItem(STORAGE_GATE_KEY);
        const pass = sessionStorage.getItem(STORAGE_PASS_KEY);
        if (stored === "1" && pass) {
          setUnlocked(true);
        }
      } catch {
        /* ignore */
      } finally {
        setAuthReady(true);
      }
    });
    return () => {
      isMounted = false;
    };
  }, []);

  // Timer counter when running
  useEffect(() => {
    if (!isRunning) return;
    const timer = setInterval(() => {
      setElapsedSeconds((s) => s + 1);
    }, 1000);
    return () => {
      clearInterval(timer);
    };
  }, [isRunning]);

  // Auto-scroll output container
  useEffect(() => {
    if (autoScroll && outputContainerRef.current) {
      outputContainerRef.current.scrollTop = outputContainerRef.current.scrollHeight;
    }
  }, [liveOutput, autoScroll]);

  // Unlock submission
  const handleUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!gatePassword.trim()) return;
    setAuthLoading(true);
    setAuthError("");

    try {
      const res = await fetch("/api/admin/superadmin/terminal/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ password: gatePassword }),
      });

      const data = await res.json();
      if (!res.ok || !data.ok) {
        setAuthError(data.error || "كلمة المرور غير صحيحة");
        return;
      }

      sessionStorage.setItem(STORAGE_GATE_KEY, "1");
      sessionStorage.setItem(STORAGE_PASS_KEY, gatePassword);
      setUnlocked(true);
      setGatePassword("");
      toastSuccess("تم فتح لوحة تحكم AI Agent & Claude بنجاح");
    } catch {
      setAuthError("فشل الاتصال بالخادم، يرجى المحاولة لاحقاً");
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLock = () => {
    try {
      sessionStorage.removeItem(STORAGE_GATE_KEY);
      sessionStorage.removeItem(STORAGE_PASS_KEY);
    } catch {
      /* ignore */
    }
    setUnlocked(false);
    toastSuccess("تم قفل اللوحة بنجاح");
  };

  // Run Command
  const handleExecute = async (overrideCmd?: string) => {
    const rawCmd = (overrideCmd !== undefined ? overrideCmd : commandInput).trim();
    const storedPass = sessionStorage.getItem(STORAGE_PASS_KEY) || "";

    // If both command and flags are empty, do nothing
    const selectedFlags = Object.entries(activeFlags)
      .filter(([, v]) => v)
      .map(([k]) => k);

    if (!rawCmd && selectedFlags.length === 0 && activeTool === "bash") {
      toastError("يرجى كتابة أمر لتنفيذه");
      return;
    }

    if (isRunning) {
      toastError("هناك أمر قيد التشغيل بالفعل");
      return;
    }

    const execId = `exec_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    setCurrentExecId(execId);
    setElapsedSeconds(0);
    setIsRunning(true);
    setLiveOutput("");
    setExitStatus(null);
    setHistoryNavIndex(-1);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const res = await fetch("/api/admin/superadmin/terminal/execute", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-terminal-password": storedPass,
        },
        credentials: "include",
        body: JSON.stringify({
          execId,
          tool: activeTool,
          command: rawCmd,
          flags: selectedFlags,
          cwd,
          password: storedPass,
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        if (res.status === 401) {
          handleLock();
          toastError("انتهت صلاحية جلسة الحماية. يرجى إدخال كلمة المرور مجدداً.");
          return;
        }
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || `خطأ في الخادم (${res.status})`);
      }

      if (!res.body) {
        throw new Error("لم يتم استلام تدفق مخرجات من الخادم");
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let buffer = "";
      let accumulatedOutput = "";
      let finalExitCode: number | null = null;
      let finalDuration: number | null = null;

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data: ")) continue;
          try {
            const data = JSON.parse(trimmed.substring(6));
            if (data.type === "stdout" || data.type === "stderr") {
              accumulatedOutput += data.text;
              setLiveOutput((prev) => prev + data.text);
            } else if (data.type === "exit") {
              finalExitCode = data.code;
              finalDuration = data.durationMs;
              setExitStatus({ code: data.code, durationMs: data.durationMs });
            } else if (data.type === "error") {
              const errText = `\n[خطأ]: ${data.error}\n`;
              accumulatedOutput += errText;
              setLiveOutput((prev) => prev + errText);
            }
          } catch {
            /* ignore parse error */
          }
        }
      }

      // Add to session history
      const historyItem: CommandHistoryItem = {
        id: execId,
        tool: activeTool,
        command: rawCmd,
        flags: selectedFlags,
        cwd,
        output: accumulatedOutput,
        exitCode: finalExitCode,
        durationMs: finalDuration,
        timestamp: Date.now(),
      };
      setHistory((prev) => [historyItem, ...prev.slice(0, 30)]);
    } catch (err: unknown) {
      if ((err as Error)?.name === "AbortError") {
        setLiveOutput((prev) => prev + "\n[تم إلغاء الأمر من قبل المستخدم]\n");
      } else {
        const msg = (err as Error)?.message || "حدث خطأ أثناء تنفيذ الأمر";
        setLiveOutput((prev) => prev + `\n[فشل التشغيل]: ${msg}\n`);
        toastError(msg);
      }
    } finally {
      setIsRunning(false);
      abortControllerRef.current = null;
    }
  };

  // Kill running process
  const handleStop = async () => {
    if (!currentExecId || !isRunning) return;
    const storedPass = sessionStorage.getItem(STORAGE_PASS_KEY) || "";

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    try {
      await fetch("/api/admin/superadmin/terminal/kill", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-terminal-password": storedPass,
        },
        credentials: "include",
        body: JSON.stringify({ execId: currentExecId, password: storedPass }),
      });
      toastSuccess("تم إرسال إشارة إيقاف العملية");
    } catch {
      /* ignore */
    }
  };

  // Fast Copy with Visual Feedback
  const handleCopyCleanOutput = () => {
    if (!liveOutput) return;
    const cleanText = stripAnsi(liveOutput);
    navigator.clipboard.writeText(cleanText).then(() => {
      setCopiedOutput(true);
      toastSuccess("تم نسخ مخرجات الكونسول نظيفة بنجاح!");
      setTimeout(() => setCopiedOutput(false), 2000);
    });
  };

  const handleCopyCommand = () => {
    if (!commandInput) return;
    navigator.clipboard.writeText(commandInput).then(() => {
      setCopiedCmd(true);
      toastSuccess("تم نسخ الأمر!");
      setTimeout(() => setCopiedCmd(false), 2000);
    });
  };

  const handleDownloadLog = () => {
    if (!liveOutput) return;
    const cleanText = stripAnsi(liveOutput);
    const blob = new Blob([cleanText], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `terminal-${activeTool}-${new Date().toISOString().replace(/[:.]/g, "-")}.log`;
    link.click();
    URL.revokeObjectURL(url);
    toastSuccess("تم تحميل ملف السجل");
  };

  const handleClearOutput = () => {
    setLiveOutput("");
    setExitStatus(null);
  };

  // Keyboard navigation for history (Up / Down)
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleExecute();
    } else if (e.key === "ArrowUp" && commandInput === "" && history.length > 0) {
      e.preventDefault();
      const nextIdx = Math.min(historyNavIndex + 1, history.length - 1);
      setHistoryNavIndex(nextIdx);
      setCommandInput(history[nextIdx].command);
      setActiveTool(history[nextIdx].tool);
    } else if (e.key === "ArrowDown" && historyNavIndex >= 0) {
      e.preventDefault();
      const nextIdx = historyNavIndex - 1;
      setHistoryNavIndex(nextIdx);
      if (nextIdx >= 0) {
        setCommandInput(history[nextIdx].command);
        setActiveTool(history[nextIdx].tool);
      } else {
        setCommandInput("");
      }
    }
  };

  if (!authReady) {
    return (
      <div className="flex h-96 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-sky-500 border-t-transparent" />
      </div>
    );
  }

  /* ─────────────────────────────────────────────────────────────────────────────
     1. Password Gate Screen (Requires telluswhat#2156)
     ───────────────────────────────────────────────────────────────────────────── */
  if (!unlocked) {
    return (
      <div className="mx-auto mt-6 w-full max-w-xl" dir="rtl">
        <div className="relative overflow-hidden rounded-3xl border border-sky-500/20 bg-slate-950 p-8 shadow-2xl backdrop-blur-xl sm:p-10">
          <div className="absolute -left-20 -top-20 h-56 w-56 rounded-full bg-sky-500/10 blur-3xl pointer-events-none" />
          <div className="absolute -bottom-20 -right-20 h-56 w-56 rounded-full bg-amber-500/10 blur-3xl pointer-events-none" />

          <div className="relative z-10 flex flex-col items-center text-center">
            <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl border border-sky-500/30 bg-sky-500/10 text-sky-400 shadow-[0_0_25px_rgba(56,189,248,0.25)]">
              <Lock size={32} />
            </div>

            <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
              منطقة أوامر AI Agent & Claude
            </h1>
            <p className="mt-2 text-sm text-slate-400">
              هذه الصفحة مخصصة للمشرف العام لتشغيل ومتابعة أدوات الذكاء الاصطناعي ونسخ المخرجات بسهولة.
            </p>

            <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-sky-500/30 bg-sky-950/40 px-3.5 py-1 text-xs font-mono text-sky-300">
              <KeyRound size={13} />
              <span>مطلوب كلمة مرور الحماية للدخول</span>
            </div>

            <form onSubmit={handleUnlock} className="mt-8 w-full space-y-4">
              <div className="text-right">
                <label className="mb-2 block text-xs font-semibold text-slate-300">
                  أدخل كلمة مرور الوصول
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    value={gatePassword}
                    onChange={(e) => {
                      setGatePassword(e.target.value);
                      if (authError) setAuthError("");
                    }}
                    placeholder="••••••••••••"
                    dir="ltr"
                    autoFocus
                    className="w-full rounded-xl border border-slate-700 bg-slate-900/90 px-4 py-3 text-left font-mono text-white placeholder-slate-600 transition-all focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
                {authError && (
                  <p className="mt-2 flex items-center gap-1.5 text-xs text-rose-400">
                    <AlertCircle size={14} />
                    <span>{authError}</span>
                  </p>
                )}
              </div>

              <button
                type="submit"
                disabled={authLoading || !gatePassword.trim()}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-sky-500 to-blue-600 py-3 text-sm font-semibold text-white shadow-lg shadow-sky-500/25 transition-all hover:from-sky-400 hover:to-blue-500 hover:shadow-sky-500/40 disabled:opacity-50"
              >
                {authLoading ? (
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                ) : (
                  <>
                    <Unlock size={17} />
                    <span>فتح الكونسول والمتابعة</span>
                  </>
                )}
              </button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  /* ─────────────────────────────────────────────────────────────────────────────
     2. Authenticated AI Agent & Claude Console UI ("wit gkod ui")
     ───────────────────────────────────────────────────────────────────────────── */
  const currentToolCfg = TOOL_CONFIG[activeTool];
  const ToolIcon = currentToolCfg.icon;

  // Filter output lines if search query is active
  const filteredOutput = searchQuery
    ? liveOutput
        .split("\n")
        .filter((line) => line.toLowerCase().includes(searchQuery.toLowerCase()))
        .join("\n")
    : liveOutput;

  const ansiSpans = parseAnsiToSpans(filteredOutput);

  return (
    <div
      className={`flex flex-col transition-all duration-300 ${
        isFullscreen
          ? "fixed inset-0 z-50 bg-[#090d16] p-4 sm:p-6"
          : "w-full max-w-7xl mx-auto space-y-4"
      }`}
      dir="rtl"
    >
      {/* ── Top Header Bar ── */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-800 bg-slate-900/90 p-4 shadow-lg backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div
            className="flex h-11 w-11 items-center justify-center rounded-xl shadow-md"
            style={{
              backgroundColor: `${currentToolCfg.accent}15`,
              color: currentToolCfg.accent,
              border: `1px solid ${currentToolCfg.border}`,
            }}
          >
            <ToolIcon size={22} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold text-white tracking-wide">
                وحدة تحكم الذكاء الاصطناعي (AI & Claude CMD)
              </h2>
              <span className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-mono font-medium text-emerald-400">
                مؤمّنة بكلمة المرور
              </span>
            </div>
            <p className="text-xs text-slate-400">{currentToolCfg.description}</p>
          </div>
        </div>

        {/* Directory Selector and Control Actions */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Working Directory Dropdown */}
          <div className="flex items-center gap-1.5 rounded-xl border border-slate-800 bg-slate-950/80 px-3 py-1.5 text-xs text-slate-300">
            <Folder size={14} className="text-amber-400" />
            <span className="text-slate-400 font-mono text-[11px]">المجلد:</span>
            <select
              value={cwd}
              onChange={(e) => setCwd(e.target.value)}
              className="bg-transparent font-mono text-white focus:outline-none text-xs"
              dir="ltr"
            >
              <option value="/home/ec2-user/Thefake" className="bg-slate-900">
                /home/ec2-user/Thefake (مشروع المنصة)
              </option>
              <option value="/home/ec2-user" className="bg-slate-900">
                /home/ec2-user (مجلد المستخدم)
              </option>
            </select>
          </div>

          {/* Fullscreen Toggle */}
          <button
            onClick={() => setIsFullscreen(!isFullscreen)}
            className="flex items-center gap-1 rounded-xl border border-slate-800 bg-slate-800/60 px-3 py-2 text-xs font-medium text-slate-300 hover:bg-slate-700 hover:text-white transition-colors"
            title={isFullscreen ? "تصغير النافذة" : "ملء الشاشة"}
          >
            {isFullscreen ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
            <span className="hidden sm:inline">{isFullscreen ? "تصغير" : "ملء الشاشة"}</span>
          </button>

          {/* Lock Button */}
          <button
            onClick={handleLock}
            className="flex items-center gap-1.5 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs font-medium text-rose-300 hover:bg-rose-500/20 transition-colors"
            title="قفل الشاشة وإلغاء الجلسة"
          >
            <Lock size={14} />
            <span>قفل</span>
          </button>
        </div>
      </div>

      {/* ── Tool Switcher Tabs ── */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {(["agent", "claude", "agy", "bash"] as ToolType[]).map((tool) => {
          const cfg = TOOL_CONFIG[tool];
          const Icon = cfg.icon;
          const isActive = activeTool === tool;

          return (
            <button
              key={tool}
              onClick={() => {
                setActiveTool(tool);
                if (tool === "agy") {
                  setActiveFlags({ "--dangerously-skip-permissions": true });
                } else if (tool === "claude") {
                  setActiveFlags({ "--dangerously-skip-permissions": true });
                } else if (tool === "agent") {
                  setActiveFlags({ "--yolo": true });
                } else {
                  setActiveFlags({});
                }
              }}
              className={`relative flex items-center gap-2.5 rounded-2xl border p-3 text-right transition-all ${
                isActive
                  ? "bg-slate-800/90 text-white shadow-md"
                  : "border-slate-800/80 bg-slate-900/50 text-slate-400 hover:border-slate-700 hover:bg-slate-800/50 hover:text-slate-200"
              }`}
              style={{
                borderColor: isActive ? cfg.border : undefined,
              }}
            >
              <div
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
                style={{
                  backgroundColor: `${cfg.accent}18`,
                  color: cfg.accent,
                }}
              >
                <Icon size={18} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-semibold text-xs text-white truncate">{cfg.name}</div>
                <div className="text-[11px] font-mono text-slate-400 truncate" dir="ltr">
                  {cfg.subname}
                </div>
              </div>
              {isActive && (
                <div
                  className="h-2 w-2 rounded-full absolute top-3 left-3"
                  style={{ backgroundColor: cfg.accent }}
                />
              )}
            </button>
          );
        })}
      </div>

      {/* ── Quick Action Chips & Flag Switches ── */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-800 bg-slate-900/50 px-3 py-2 text-xs">
        {/* Quick presets */}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-slate-400 text-[11px] ml-1">أوامر سريعة:</span>
          {activeTool === "agent" && (
            <>
              <button
                onClick={() => handleExecute("--continue")}
                disabled={isRunning}
                className="rounded-lg border border-sky-500/30 bg-sky-500/10 px-2.5 py-1 text-[11px] font-mono text-sky-300 hover:bg-sky-500/20 disabled:opacity-50"
                dir="ltr"
              >
                agent --continue
              </button>
              <button
                onClick={() => handleExecute("status")}
                disabled={isRunning}
                className="rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1 text-[11px] font-mono text-slate-300 hover:bg-slate-700 disabled:opacity-50"
                dir="ltr"
              >
                agent status
              </button>
              <button
                onClick={() => handleExecute("--list-models")}
                disabled={isRunning}
                className="rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1 text-[11px] font-mono text-slate-300 hover:bg-slate-700 disabled:opacity-50"
                dir="ltr"
              >
                --list-models
              </button>
              <button
                onClick={() => handleExecute("--help")}
                disabled={isRunning}
                className="rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1 text-[11px] font-mono text-slate-300 hover:bg-slate-700 disabled:opacity-50"
                dir="ltr"
              >
                agent --help
              </button>
            </>
          )}

          {activeTool === "claude" && (
            <>
              <button
                onClick={() => handleExecute("--continue")}
                disabled={isRunning}
                className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-[11px] font-mono text-amber-300 hover:bg-amber-500/20 disabled:opacity-50"
                dir="ltr"
              >
                claude --continue
              </button>
              <button
                onClick={() => handleExecute("doctor")}
                disabled={isRunning}
                className="rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1 text-[11px] font-mono text-slate-300 hover:bg-slate-700 disabled:opacity-50"
                dir="ltr"
              >
                claude doctor
              </button>
              <button
                onClick={() => handleExecute("--version")}
                disabled={isRunning}
                className="rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1 text-[11px] font-mono text-slate-300 hover:bg-slate-700 disabled:opacity-50"
                dir="ltr"
              >
                claude --version
              </button>
              <button
                onClick={() => handleExecute("-p 'ping'")}
                disabled={isRunning}
                className="rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1 text-[11px] font-mono text-slate-300 hover:bg-slate-700 disabled:opacity-50"
                dir="ltr"
              >
                claude -p &quot;ping&quot;
              </button>
            </>
          )}

          {activeTool === "agy" && (
            <>
              <button
                onClick={() => handleExecute("--continue")}
                disabled={isRunning}
                className="rounded-lg border border-purple-500/30 bg-purple-500/10 px-2.5 py-1 text-[11px] font-mono text-purple-300 hover:bg-purple-500/20 disabled:opacity-50"
                dir="ltr"
              >
                agy --continue
              </button>
              <button
                onClick={() => handleExecute("changelog")}
                disabled={isRunning}
                className="rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1 text-[11px] font-mono text-slate-300 hover:bg-slate-700 disabled:opacity-50"
                dir="ltr"
              >
                agy changelog
              </button>
              <button
                onClick={() => handleExecute("-p 'ping'")}
                disabled={isRunning}
                className="rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1 text-[11px] font-mono text-slate-300 hover:bg-slate-700 disabled:opacity-50"
                dir="ltr"
              >
                agy -p &quot;ping&quot;
              </button>
              <button
                onClick={() => handleExecute("--help")}
                disabled={isRunning}
                className="rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1 text-[11px] font-mono text-slate-300 hover:bg-slate-700 disabled:opacity-50"
                dir="ltr"
              >
                agy --help
              </button>
            </>
          )}

          {activeTool === "bash" && (
            <>
              <button
                onClick={() => handleExecute("git status")}
                disabled={isRunning}
                className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-mono text-emerald-300 hover:bg-emerald-500/20 disabled:opacity-50"
                dir="ltr"
              >
                git status
              </button>
              <button
                onClick={() => handleExecute("pm2 status")}
                disabled={isRunning}
                className="rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1 text-[11px] font-mono text-slate-300 hover:bg-slate-700 disabled:opacity-50"
                dir="ltr"
              >
                pm2 status
              </button>
              <button
                onClick={() => handleExecute("df -h /")}
                disabled={isRunning}
                className="rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1 text-[11px] font-mono text-slate-300 hover:bg-slate-700 disabled:opacity-50"
                dir="ltr"
              >
                df -h /
              </button>
              <button
                onClick={() => handleExecute("uptime")}
                disabled={isRunning}
                className="rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1 text-[11px] font-mono text-slate-300 hover:bg-slate-700 disabled:opacity-50"
                dir="ltr"
              >
                uptime
              </button>
            </>
          )}
        </div>

        {/* Flag Toggles */}
        <div className="flex flex-wrap items-center gap-2">
          {activeTool === "agent" && (
            <>
              <label className="flex items-center gap-1.5 text-[11px] text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={!!activeFlags["--continue"]}
                  onChange={(e) => setActiveFlags((p) => ({ ...p, "--continue": e.target.checked }))}
                  className="rounded border-slate-700 bg-slate-800 text-sky-500 focus:ring-0"
                />
                <span dir="ltr">--continue</span>
              </label>
              <label className="flex items-center gap-1.5 text-[11px] text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={!!activeFlags["--yolo"]}
                  onChange={(e) => setActiveFlags((p) => ({ ...p, "--yolo": e.target.checked }))}
                  className="rounded border-slate-700 bg-slate-800 text-sky-500 focus:ring-0"
                />
                <span dir="ltr">--yolo (تخطي الموافقة)</span>
              </label>
            </>
          )}

          {activeTool === "claude" && (
            <>
              <label className="flex items-center gap-1.5 text-[11px] text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={activeFlags["--dangerously-skip-permissions"] !== false}
                  onChange={(e) => setActiveFlags((p) => ({ ...p, "--dangerously-skip-permissions": e.target.checked }))}
                  className="rounded border-slate-700 bg-slate-800 text-amber-500 focus:ring-0"
                />
                <span dir="ltr">--dangerously-skip-permissions</span>
              </label>
              <label className="flex items-center gap-1.5 text-[11px] text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={!!activeFlags["--continue"]}
                  onChange={(e) => setActiveFlags((p) => ({ ...p, "--continue": e.target.checked }))}
                  className="rounded border-slate-700 bg-slate-800 text-amber-500 focus:ring-0"
                />
                <span dir="ltr">--continue</span>
              </label>
              <label className="flex items-center gap-1.5 text-[11px] text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={!!activeFlags["--verbose"]}
                  onChange={(e) => setActiveFlags((p) => ({ ...p, "--verbose": e.target.checked }))}
                  className="rounded border-slate-700 bg-slate-800 text-amber-500 focus:ring-0"
                />
                <span dir="ltr">--verbose</span>
              </label>
            </>
          )}

          {activeTool === "agy" && (
            <>
              <label className="flex items-center gap-1.5 text-[11px] text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={activeFlags["--dangerously-skip-permissions"] !== false}
                  onChange={(e) => setActiveFlags((p) => ({ ...p, "--dangerously-skip-permissions": e.target.checked }))}
                  className="rounded border-slate-700 bg-slate-800 text-purple-500 focus:ring-0"
                />
                <span dir="ltr">--dangerously-skip-permissions</span>
                <span className="text-[10px] text-purple-400 font-sans">(تخطي الأذونات)</span>
              </label>
              <label className="flex items-center gap-1.5 text-[11px] text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={!!activeFlags["--continue"]}
                  onChange={(e) => setActiveFlags((p) => ({ ...p, "--continue": e.target.checked }))}
                  className="rounded border-slate-700 bg-slate-800 text-purple-500 focus:ring-0"
                />
                <span dir="ltr">--continue</span>
                <span className="text-[10px] text-slate-400 font-sans">(استكمال المحادثة)</span>
              </label>
            </>
          )}

          {/* Session history dropdown toggle */}
          {history.length > 0 && (
            <button
              onClick={() => setHistoryOpen(!historyOpen)}
              className="flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-800/80 px-2 py-1 text-[11px] text-slate-300 hover:text-white"
            >
              <Clock size={13} />
              <span>السجل ({history.length})</span>
              {historyOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            </button>
          )}
        </div>
      </div>

      {/* ── Command Input Box ── */}
      <div className="relative rounded-2xl border border-slate-800 bg-slate-900/95 p-3 shadow-xl backdrop-blur-md">
        <div className="relative">
          <textarea
            value={commandInput}
            onChange={(e) => setCommandInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={currentToolCfg.placeholder}
            rows={2}
            className="w-full resize-y rounded-xl border border-slate-800 bg-slate-950/90 p-3 pr-4 pl-28 font-mono text-sm text-white placeholder-slate-500 transition-all focus:border-slate-700 focus:outline-none focus:ring-2"
            dir="auto"
          />

          {/* Action Buttons inside Input */}
          <div className="absolute left-2.5 bottom-3.5 flex items-center gap-2">
            {isRunning ? (
              <button
                type="button"
                onClick={handleStop}
                className="flex items-center gap-1.5 rounded-xl border border-rose-500/30 bg-rose-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-lg shadow-rose-600/30 hover:bg-rose-500 transition-all"
              >
                <Square size={13} className="fill-white" />
                <span>إيقاف العملية</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => handleExecute()}
                className="flex items-center gap-1.5 rounded-xl px-4 py-1.5 text-xs font-semibold text-white shadow-lg transition-all hover:brightness-110 active:scale-95"
                style={{
                  backgroundColor: currentToolCfg.accent,
                  boxShadow: `0 0 15px ${currentToolCfg.accent}40`,
                }}
              >
                <Play size={13} className="fill-white" />
                <span>تشغيل (Ctrl+↵)</span>
              </button>
            )}
          </div>
        </div>

        <div className="mt-2 flex items-center justify-between text-[11px] text-slate-500 px-1">
          <span>اضغط Ctrl + Enter للتشغيل السريع، أو ↑ للرجوع للأمر السابق</span>
          {commandInput && (
            <button
              onClick={() => setCommandInput("")}
              className="text-slate-400 hover:text-slate-200 underline"
            >
              مسح المدخل
            </button>
          )}
        </div>
      </div>

      {/* ── Command History Drawer ── */}
      {historyOpen && history.length > 0 && (
        <div className="rounded-2xl border border-slate-800 bg-slate-950/90 p-4 shadow-xl">
          <div className="mb-2 flex items-center justify-between">
            <h4 className="text-xs font-bold text-slate-300">سجل أوامر الجلسة</h4>
            <button
              onClick={() => setHistory([])}
              className="text-[11px] text-rose-400 hover:underline"
            >
              مسح السجل
            </button>
          </div>
          <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1">
            {history.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between rounded-xl border border-slate-800/80 bg-slate-900/60 p-2 text-xs"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className="rounded px-1.5 py-0.5 text-[10px] font-mono"
                    style={{
                      backgroundColor: `${TOOL_CONFIG[item.tool].accent}20`,
                      color: TOOL_CONFIG[item.tool].accent,
                    }}
                  >
                    {item.tool}
                  </span>
                  <span className="font-mono text-slate-300 truncate" dir="ltr">
                    {item.command || "(preset flags)"}
                  </span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {item.durationMs !== null && (
                    <span className="text-[10px] text-slate-500 font-mono">
                      {(item.durationMs / 1000).toFixed(1)}s
                    </span>
                  )}
                  <span
                    className={`rounded px-1.5 py-0.2 text-[10px] font-mono ${
                      item.exitCode === 0
                        ? "bg-emerald-500/20 text-emerald-400"
                        : "bg-rose-500/20 text-rose-400"
                    }`}
                  >
                    Exit {item.exitCode ?? "?"}
                  </span>
                  <button
                    onClick={() => {
                      setCommandInput(item.command);
                      setActiveTool(item.tool);
                      setLiveOutput(item.output);
                      setExitStatus({ code: item.exitCode, durationMs: item.durationMs });
                    }}
                    className="rounded bg-slate-800 px-2 py-0.5 text-[10px] text-slate-300 hover:bg-slate-700"
                  >
                    عرض / إعادة
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────────────
         3. The Output Console (Copy-First Design)
         ───────────────────────────────────────────────────────────────────────── */}
      <div className="flex flex-1 flex-col rounded-2xl border border-slate-800 bg-[#070b12] shadow-2xl overflow-hidden min-h-[420px]">
        {/* Console Action Bar */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/80 bg-slate-900/80 px-4 py-2.5">
          {/* Status & Search Filter */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="relative flex h-2.5 w-2.5">
                {isRunning ? (
                  <>
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-500" />
                  </>
                ) : exitStatus ? (
                  <span
                    className={`relative inline-flex rounded-full h-2.5 w-2.5 ${
                      exitStatus.code === 0 ? "bg-emerald-500" : "bg-rose-500"
                    }`}
                  />
                ) : (
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-slate-500" />
                )}
              </span>
              <span className="font-mono text-xs font-semibold text-slate-300">
                {isRunning
                  ? `جاري التشغيل... (${elapsedSeconds}s)`
                  : exitStatus
                  ? `انتهى (Exit ${exitStatus.code}) — ${(
                      (exitStatus.durationMs || 0) / 1000
                    ).toFixed(2)}s`
                  : "جاهز بانتظار الأوامر"}
              </span>
            </div>

            {/* In-Console Search Filter */}
            {liveOutput && (
              <div className="relative hidden md:block">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="تصفية / بحث في النتائج..."
                  className="rounded-lg border border-slate-800 bg-slate-950 px-2.5 py-1 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-slate-600 font-mono w-44"
                />
                <Search size={12} className="absolute left-2.5 top-2 text-slate-500" />
              </div>
            )}
          </div>

          {/* COPY ACTION BUTTONS (Super Prominent & Easy to Use) */}
          <div className="flex flex-wrap items-center gap-2">
            {/* 1. PRIMARY COPY OUTPUT BUTTON */}
            <button
              onClick={handleCopyCleanOutput}
              disabled={!liveOutput}
              className={`flex items-center gap-1.5 rounded-xl px-3.5 py-1.5 text-xs font-bold transition-all shadow-md ${
                copiedOutput
                  ? "bg-emerald-500 text-white shadow-emerald-500/30 scale-105"
                  : "bg-gradient-to-r from-sky-500 to-blue-600 text-white hover:from-sky-400 hover:to-blue-500 shadow-sky-500/20 disabled:opacity-40"
              }`}
              title="نسخ كافة المخرجات النصية نظيفة ومجهزة للّصق"
            >
              {copiedOutput ? <Check size={15} /> : <Copy size={15} />}
              <span>{copiedOutput ? "تم النسخ بنجاح!" : "نسخ المخرجات (Copy Output)"}</span>
            </button>

            {/* 2. Copy Command Button */}
            {commandInput && (
              <button
                onClick={handleCopyCommand}
                className="flex items-center gap-1 rounded-xl border border-slate-700 bg-slate-800/80 px-2.5 py-1.5 text-xs text-slate-300 hover:bg-slate-700 hover:text-white transition-colors"
                title="نسخ نص الأمر فقط"
              >
                {copiedCmd ? <Check size={13} /> : <Copy size={13} />}
                <span>نسخ الأمر</span>
              </button>
            )}

            {/* 3. Download Log Button */}
            <button
              onClick={handleDownloadLog}
              disabled={!liveOutput}
              className="flex items-center gap-1 rounded-xl border border-slate-700 bg-slate-800/80 px-2.5 py-1.5 text-xs text-slate-300 hover:bg-slate-700 hover:text-white transition-colors disabled:opacity-40"
              title="تحميل كملف نصي .log"
            >
              <Download size={13} />
              <span className="hidden sm:inline">تحميل السجل</span>
            </button>

            {/* 4. Auto-Scroll Switch */}
            <button
              onClick={() => setAutoScroll(!autoScroll)}
              className={`rounded-xl border px-2 py-1.5 text-xs font-mono transition-colors ${
                autoScroll
                  ? "border-sky-500/40 bg-sky-500/10 text-sky-400"
                  : "border-slate-800 bg-slate-900 text-slate-500"
              }`}
              title="التمرير التلقائي لأسفل مع تدفق البيانات"
            >
              Scroll {autoScroll ? "ON" : "OFF"}
            </button>

            {/* 5. Clear Console */}
            <button
              onClick={handleClearOutput}
              disabled={!liveOutput}
              className="flex items-center gap-1 rounded-xl border border-slate-800 bg-slate-900 px-2.5 py-1.5 text-xs text-slate-400 hover:border-rose-500/30 hover:bg-rose-500/10 hover:text-rose-400 transition-colors disabled:opacity-40"
              title="مسح الشاشة"
            >
              <Trash2 size={13} />
              <span className="hidden sm:inline">مسح</span>
            </button>
          </div>
        </div>

        {/* Console Viewport */}
        <div
          ref={outputContainerRef}
          className="relative flex-1 overflow-auto p-4 font-mono text-sm leading-relaxed text-slate-200 select-text"
          dir="ltr"
          style={{ minHeight: "340px" }}
        >
          {liveOutput ? (
            <div className="space-y-1">
              <pre className="whitespace-pre-wrap break-all font-mono">
                {ansiSpans.map((span, idx) => (
                  <span key={idx} style={span.style} className={span.className}>
                    {span.text}
                  </span>
                ))}
              </pre>

              {/* Streaming Cursor Animation */}
              {isRunning && (
                <span className="inline-block h-4 w-2 animate-pulse bg-sky-400 align-middle ml-1" />
              )}
            </div>
          ) : (
            <div className="flex h-full flex-col items-center justify-center text-center text-slate-600 py-16">
              <Terminal size={38} className="mb-3 opacity-40 text-sky-400" />
              <p className="text-sm font-semibold text-slate-400">شاشة المخرجات جاهزة</p>
              <p className="mt-1 text-xs text-slate-500 max-w-sm" dir="rtl">
                اختر الأداة المطلوبة (Cursor Agent أو Claude أو Antigravity أو Bash) واكتب أمرك أو اختر أمراً سريعاً، وستظهر النتائج فوراً مع أزرار نسخ سهلة بنقرة واحدة.
              </p>
            </div>
          )}
        </div>

        {/* Console Bottom Info Bar */}
        <div className="flex items-center justify-between border-t border-slate-900 bg-slate-950/80 px-4 py-2 text-[11px] font-mono text-slate-500">
          <div className="flex items-center gap-3">
            <span>
              Lines: {liveOutput ? liveOutput.split("\n").length : 0} | Chars:{" "}
              {liveOutput.length.toLocaleString()}
            </span>
            {searchQuery && (
              <span className="text-amber-400">
                تصفية: {filteredOutput.split("\n").length} سطر مطابق
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span>Selection & Clipboard Ready</span>
            <div className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
          </div>
        </div>
      </div>
    </div>
  );
}
