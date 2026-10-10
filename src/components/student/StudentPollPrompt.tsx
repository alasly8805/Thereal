"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { CheckCircle2, Vote, X } from "lucide-react";

interface ActivePoll {
  id: string;
  question: string;
  options: Array<{ id: string; text: string }>;
}

/** How often an open tab re-checks, so a poll opened by the admin shows up without a reload. */
const REFRESH_MS = 2 * 60 * 1000;
const DISMISS_KEY = "poll-dismissed";

/** Never interrupt a video, an exam or homework. */
function isFocusPage(pathname: string) {
  return (
    pathname.includes("/learn") ||
    pathname.includes("/watch") ||
    pathname.startsWith("/quizzes") ||
    pathname.startsWith("/homework") ||
    pathname.startsWith("/leaderboard/daily-exam")
  );
}

function dismissedIds(): string[] {
  try {
    return JSON.parse(sessionStorage.getItem(DISMISS_KEY) || "[]");
  } catch {
    return [];
  }
}

export function StudentPollPrompt() {
  const pathname = usePathname() ?? "";
  const [poll, setPoll] = useState<ActivePoll | null>(null);
  const [choice, setChoice] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [thanks, setThanks] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/student/polls", { credentials: "include", cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as { poll: ActivePoll | null };
      const next = data.poll && !dismissedIds().includes(data.poll.id) ? data.poll : null;
      setPoll((cur) => (cur?.id === next?.id ? cur : next));
    } catch {
      /* offline — try again next tick */
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, REFRESH_MS);
    return () => clearInterval(timer);
  }, [load]);

  const dismiss = () => {
    if (!poll) return;
    sessionStorage.setItem(DISMISS_KEY, JSON.stringify([...dismissedIds(), poll.id]));
    setPoll(null);
    setError("");
  };

  // A choice from a previous poll never carries over to the next one.
  const selectedId = poll?.options.some((o) => o.id === choice) ? choice : null;

  const submit = async () => {
    if (!poll || !selectedId) return;
    setSending(true);
    setError("");
    try {
      const res = await fetch(`/api/student/polls/${poll.id}/vote`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ optionId: selectedId }),
      });
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      // 409 = already voted (e.g. from another tab), 410 = closed meanwhile — either way we're done here.
      if (res.ok || res.status === 409 || res.status === 410) {
        setPoll(null);
        setError("");
        if (res.ok) {
          setThanks(true);
          setTimeout(() => setThanks(false), 3000);
        }
        return;
      }
      setError(data?.error || "تعذر إرسال إجابتك، حاول تاني");
    } catch {
      setError("تعذر الاتصال، حاول تاني");
    } finally {
      setSending(false);
    }
  };

  if (isFocusPage(pathname)) return null;

  const cardClass =
    "fixed z-[55] right-4 left-4 sm:left-auto sm:w-[380px] bottom-[85px] lg:bottom-6 lg:right-6 rounded-2xl border p-4 shadow-xl";
  const cardStyle = { background: "var(--surface)", borderColor: "var(--border)", color: "var(--ink)" };

  if (thanks) {
    return (
      <div dir="rtl" role="status" className={`${cardClass} flex items-center gap-2 text-sm font-bold`} style={cardStyle}>
        <CheckCircle2 size={18} style={{ color: "var(--brand)" }} aria-hidden />
        شكراً، إجابتك وصلت
      </div>
    );
  }

  if (!poll) return null;

  return (
    <section dir="rtl" aria-labelledby="student-poll-q" className={cardClass} style={cardStyle}>
      <div className="flex items-start gap-2 mb-3">
        <span
          className="shrink-0 grid place-items-center w-8 h-8 rounded-full"
          style={{ background: "var(--brand-soft)", color: "var(--brand)" }}
          aria-hidden
        >
          <Vote size={16} />
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-bold" style={{ color: "var(--ink-2)" }}>استطلاع رأي</p>
          <h2 id="student-poll-q" className="text-sm font-bold leading-relaxed">{poll.question}</h2>
        </div>
        <button
          type="button"
          onClick={dismiss}
          aria-label="بعدين"
          className="shrink-0 p-1 rounded-lg cursor-pointer hover:opacity-70"
          style={{ color: "var(--ink-3)" }}
        >
          <X size={16} />
        </button>
      </div>

      <div role="radiogroup" aria-labelledby="student-poll-q" className="flex flex-col gap-2 max-h-[40vh] overflow-y-auto">
        {poll.options.map((o) => {
          const selected = selectedId === o.id;
          return (
            <button
              key={o.id}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => setChoice(o.id)}
              className="text-right text-sm rounded-xl border px-3 py-2.5 cursor-pointer transition-colors"
              style={{
                borderColor: selected ? "var(--brand)" : "var(--border)",
                background: selected ? "var(--brand-soft)" : "var(--surface-2)",
                fontWeight: selected ? 700 : 500,
              }}
            >
              {o.text}
            </button>
          );
        })}
      </div>

      {error && <p className="text-xs mt-2" style={{ color: "var(--danger)" }}>{error}</p>}

      <div className="flex items-center justify-between gap-2 mt-3">
        <button type="button" onClick={dismiss} className="text-xs font-bold cursor-pointer" style={{ color: "var(--ink-2)" }}>
          بعدين
        </button>
        <button
          type="button"
          disabled={!selectedId || sending}
          onClick={() => void submit()}
          className="rounded-xl px-4 py-2 text-sm font-bold cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          style={{ background: "var(--brand)", color: "var(--on-brand)" }}
        >
          {sending ? "جارٍ الإرسال" : "إرسال"}
        </button>
      </div>
    </section>
  );
}
