"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

const AR_LETTERS = ["أ", "ب", "ج", "د"];
const EN_LETTERS = ["A", "B", "C", "D"];

type Track = "ar" | "en";
const TRACKS: { id: Track; icon: string; title: string; body: string }[] = [
  { id: "ar", icon: "🇪🇬", title: "عربي", body: "الأسئلة باللغة العربية" },
  { id: "en", icon: "🌍", title: "لغات", body: "Questions in English" },
];
const MAX_ESSAY_CHARS = 3000;

interface Feedback {
  summary?: string;
  correctPoints?: string[];
  missingPoints?: string[];
}

interface Question {
  id: string;
  type: "mcq" | "essay";
  lesson: string;
  lessonTitle: string;
  question: string;
  options: string[];
  selected: number | null;
  text: string;
  // Present once the set is submitted.
  status?: "GRADED" | "PENDING" | "FAILED";
  isCorrect?: boolean;
  verdict?: "CORRECT" | "PARTIAL" | "INCORRECT" | null;
  correct?: number | null;
  referenceAnswer?: string | null;
  feedback?: Feedback | null;
}

interface PracticeState {
  available: boolean;
  reason?: "STAGE" | "EMPTY" | "DISABLED";
  /** First visit: the student has not chosen عربي / لغات yet. */
  needTrack?: boolean;
  suggested?: Track | null;
  track?: Track;
  setId: string;
  day: string;
  readOnly: boolean;
  submitted: boolean;
  finalized: boolean;
  summary: { mcqCorrect: number; mcqTotal: number; essayCorrect: number; essayTotal: number; pointsAwarded: number } | null;
  totalPoints: number;
  rules: { MCQ_CORRECT: number; ESSAY_CORRECT: number; ESSAY_PARTIAL: number; PERFECT_BONUS: number };
  questions: Question[];
}

const UNAVAILABLE: Record<string, { icon: string; title: string; body: string }> = {
  STAGE: { icon: "📚", title: "التدريبات لسه مش متاحة لصفك", body: "التدريبات اليومية متاحة حالياً لطلاب الصف الثاني الثانوي، وهنضيف باقي الصفوف قريباً." },
  EMPTY: { icon: "⏳", title: "بنجهّز أسئلة التدريب", body: "أسئلة جديدة بتتجهز كل يوم بالليل حسب الدروس اللي اتشرحت. ارجع بكرة الصبح!" },
  DISABLED: { icon: "🛠️", title: "التدريبات متوقفة مؤقتاً", body: "بنعمل تحسينات على التدريبات، وهترجع قريباً." },
};

async function fetchPractice(): Promise<PracticeState> {
  const r = await fetch("/api/practice", { credentials: "include", cache: "no-store" });
  const d = await r.json().catch(() => null);
  if (!r.ok || !d) throw new Error(d?.error || "تعذر تحميل التدريب");
  return d as PracticeState;
}

function formatDay(day: string): string {
  const d = new Date(`${day}T12:00:00`);
  return d.toLocaleDateString("ar-EG", { weekday: "long", day: "numeric", month: "long" });
}

export function PracticeClient() {
  const [state, setState] = useState<PracticeState | null>(null);
  const [error, setError] = useState("");
  const [index, setIndex] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [showReview, setShowReview] = useState(false);
  const [changingTrack, setChangingTrack] = useState(false);
  const [savingTrack, setSavingTrack] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingEssay = useRef<{ questionId: string; text: string } | null>(null);

  const load = useCallback(
    () =>
      fetchPractice().then(
        (d) => {
          setState(d);
          setError("");
        },
        (e: Error) => setError(e.message)
      ),
    []
  );

  useEffect(() => {
    fetchPractice().then(setState, (e: Error) => setError(e.message));
  }, []);

  // While essays are being graded, check back every few seconds.
  useEffect(() => {
    if (!state?.submitted || state.finalized) return;
    const t = setInterval(load, 4000);
    return () => clearInterval(t);
  }, [state?.submitted, state?.finalized, load]);

  const save = useCallback(
    async (questionId: string, payload: { slot: number | null } | { text: string }) => {
      if (!state || state.readOnly || state.submitted) return;
      await fetch("/api/practice/answer", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ setId: state.setId, questionId, ...payload }),
      }).catch(() => {});
    },
    [state]
  );

  const flushEssay = useCallback(async () => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    const p = pendingEssay.current;
    pendingEssay.current = null;
    if (p) await save(p.questionId, { text: p.text });
  }, [save]);

  const update = (id: string, patch: Partial<Question>) =>
    setState((s) => (s ? { ...s, questions: s.questions.map((q) => (q.id === id ? { ...q, ...patch } : q)) } : s));

  const choose = (q: Question, slot: number) => {
    if (state?.submitted || state?.readOnly) return;
    const next = q.selected === slot ? null : slot;
    update(q.id, { selected: next });
    save(q.id, { slot: next });
  };

  const typeEssay = (q: Question, text: string) => {
    const t = text.slice(0, MAX_ESSAY_CHARS);
    update(q.id, { text: t });
    pendingEssay.current = { questionId: q.id, text: t };
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(flushEssay, 900);
  };

  const go = async (i: number) => {
    await flushEssay();
    setIndex(i);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const submit = async () => {
    if (!state) return;
    setSubmitting(true);
    await flushEssay();
    try {
      const r = await fetch("/api/practice/submit", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ setId: state.setId }),
      });
      const d = await r.json().catch(() => ({}));
      setConfirmOpen(false);
      if (!r.ok) {
        setError(d?.error || "تعذر التسليم");
        await load();
        return;
      }
      setIndex(0);
      await load();
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذر التسليم");
    } finally {
      setSubmitting(false);
    }
  };

  const chooseTrack = async (track: Track) => {
    setSavingTrack(true);
    await flushEssay();
    try {
      const r = await fetch("/api/practice/track", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ track }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => null))?.error || "تعذر حفظ اختيارك");
      setChangingTrack(false);
      setIndex(0);
      setShowReview(false);
      setError("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذر حفظ اختيارك");
    } finally {
      setSavingTrack(false);
    }
  };

  if (error && !state) {
    return (
      <Panel>
        <p style={{ color: "var(--danger)", fontWeight: 700, margin: 0 }}>{error}</p>
        <button type="button" onClick={load} className="mt-4 cursor-pointer" style={btn("var(--brand)", "#fff")}>
          حاول تاني
        </button>
      </Panel>
    );
  }

  if (!state) {
    return (
      <div className="flex items-center justify-center gap-3 py-24" style={{ color: "var(--ink-3)" }}>
        <div className="w-5 h-5 border-2 border-[var(--brand)] border-t-transparent rounded-full animate-spin" />
        <span style={{ fontSize: 15 }}>جارٍ تحميل تدريب اليوم...</span>
      </div>
    );
  }

  if (state.available && (state.needTrack || changingTrack)) {
    return (
      <TrackPicker
        current={state.track ?? null}
        suggested={state.suggested ?? null}
        saving={savingTrack}
        error={error}
        onPick={chooseTrack}
        onCancel={state.needTrack ? undefined : () => setChangingTrack(false)}
      />
    );
  }

  if (!state.available) {
    const u = UNAVAILABLE[state.reason ?? "EMPTY"];
    return (
      <Panel>
        <div style={{ fontSize: 46, marginBottom: 10 }}>{u.icon}</div>
        <h1 style={{ fontFamily: "var(--font-head)", fontWeight: 900, fontSize: 24, color: "var(--ink)", margin: "0 0 8px" }}>{u.title}</h1>
        <p style={{ fontSize: 15, color: "var(--ink-2)", lineHeight: 1.8, margin: 0 }}>{u.body}</p>
        {state.track && (
          <button type="button" onClick={() => setChangingTrack(true)} className="mt-5 cursor-pointer" style={btn("var(--surface-2)", "var(--ink)", true)}>
            تغيير المسار ({state.track === "en" ? "لغات" : "عربي"})
          </button>
        )}
      </Panel>
    );
  }

  const en = state.track === "en";
  const letters = en ? EN_LETTERS : AR_LETTERS;
  const contentDir = en ? "ltr" : "rtl";

  const qs = state.questions;
  const q = qs[index];
  const mcqCount = qs.filter((x) => x.type === "mcq").length;
  const essayCount = qs.length - mcqCount;
  const answered = (x: Question) => (x.type === "mcq" ? x.selected !== null : x.text.trim().length > 0);
  const answeredCount = qs.filter(answered).length;
  const pendingCount = qs.filter((x) => x.status === "PENDING").length;
  const reviewing = !state.submitted || showReview;

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <header
        className="relative overflow-hidden rounded-[24px] p-6 sm:p-7"
        style={{ background: "linear-gradient(135deg, var(--brand) 0%, var(--brand-strong, var(--brand)) 100%)", color: "#fff", boxShadow: "var(--shadow-lg)" }}
      >
        <Ornament style={{ top: -40, left: -30, width: 160, height: 160, opacity: 0.18 }} />
        <Ornament style={{ bottom: -60, right: 40, width: 200, height: 200, opacity: 0.12 }} />
        <div className="relative flex flex-wrap items-center justify-between gap-4">
          <div>
            <p style={{ fontSize: 13.5, opacity: 0.85, margin: "0 0 4px", fontWeight: 600 }}>{formatDay(state.day)}</p>
            <h1 style={{ fontFamily: "var(--font-head)", fontWeight: 900, fontSize: 28, margin: 0 }}>✍️ تدريبات اليوم</h1>
            <p style={{ fontSize: 14, opacity: 0.9, margin: "6px 0 0" }}>
              {mcqCount} اختيار من متعدد · {essayCount} سؤال مقالي — مرتّبة حسب دروس المنهج
            </p>
            <button
              type="button"
              onClick={() => setChangingTrack(true)}
              className="mt-3 cursor-pointer rounded-full transition-colors hover:bg-white/25"
              style={{ padding: "5px 12px", fontSize: 12.5, fontWeight: 800, color: "#fff", background: "rgba(255,255,255,.16)", border: "1px solid rgba(255,255,255,.3)" }}
            >
              {en ? "🌍 لغات" : "🇪🇬 عربي"} · تغيير
            </button>
          </div>
          <div className="text-center rounded-[16px] px-4 py-3" style={{ background: "rgba(255,255,255,.16)", border: "1px solid rgba(255,255,255,.28)" }}>
            <div style={{ fontSize: 12, opacity: 0.85, fontWeight: 600 }}>نقاطك</div>
            <div style={{ fontFamily: "var(--font-head)", fontSize: 24, fontWeight: 900 }}>⭐ {state.totalPoints}</div>
          </div>
        </div>
      </header>

      {state.submitted && (
        <ResultCard state={state} pendingCount={pendingCount} showReview={showReview} onToggleReview={() => { setShowReview((v) => !v); setIndex(0); }} />
      )}

      {reviewing && q && (
        <>
          {/* Progress */}
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between" style={{ fontSize: 13.5, color: "var(--ink-2)", fontWeight: 700 }}>
              <span>السؤال {index + 1} من {qs.length}</span>
              {!state.submitted && <span>تمت الإجابة على {answeredCount} / {qs.length}</span>}
            </div>
            <div className="h-2 rounded-full overflow-hidden" style={{ background: "var(--surface-2)" }}>
              <div className="h-full rounded-full transition-all duration-300" style={{ width: `${((index + 1) / qs.length) * 100}%`, background: "linear-gradient(90deg, var(--brand), var(--gold))" }} />
            </div>
            <div className="flex flex-wrap gap-1.5">
              {qs.map((x, i) => (
                <button
                  key={x.id}
                  type="button"
                  onClick={() => go(i)}
                  aria-label={`السؤال ${i + 1}`}
                  aria-current={i === index ? "step" : undefined}
                  className="cursor-pointer transition-transform hover:scale-110"
                  style={dot(x, i === index, state.submitted, answered(x))}
                >
                  {i + 1}
                </button>
              ))}
            </div>
          </div>

          {/* Question card */}
          <div className="rounded-[26px] p-[2px]" style={{ background: "linear-gradient(135deg, var(--brand), var(--gold), var(--brand))", boxShadow: "var(--shadow-lg)" }}>
            <article className="relative overflow-hidden rounded-[24px] p-5 sm:p-8" style={{ background: "var(--surface)" }}>
              <Ornament style={{ top: -50, left: -50, width: 140, height: 140, opacity: 0.07, background: "var(--brand)" }} />
              <Ornament style={{ bottom: -60, right: -40, width: 160, height: 160, opacity: 0.08, background: "var(--gold)" }} />

              <div className="relative flex flex-wrap items-center gap-2 mb-5">
                <span className="inline-flex items-center justify-center rounded-full" style={{ width: 42, height: 42, background: "var(--brand)", color: "#fff", fontFamily: "var(--font-head)", fontWeight: 900, fontSize: 18, boxShadow: "0 6px 14px -6px var(--brand)" }}>
                  {index + 1}
                </span>
                <Chip bg={q.type === "mcq" ? "var(--brand-soft)" : "var(--gold-soft)"} color={q.type === "mcq" ? "var(--brand)" : "var(--gold-2)"}>
                  {q.type === "mcq" ? "اختيار من متعدد" : "سؤال مقالي"}
                </Chip>
                {q.lesson && (
                  <Chip bg="var(--surface-2)" color="var(--ink-2)">
                    📖 درس {q.lesson}{q.lessonTitle ? ` · ${q.lessonTitle}` : ""}
                  </Chip>
                )}
              </div>

              {q.type === "essay" && (
                <div className="relative flex items-start gap-2 rounded-[14px] px-4 py-3 mb-5" style={{ background: "var(--gold-soft)", border: "1px dashed var(--gold-2)", color: "var(--ink)", fontSize: 13.5, lineHeight: 1.7 }}>
                  <span aria-hidden>⚠️</span>
                  <span>
                    <b>تنبيه:</b> الأسئلة المقالية بيصحّحها الذكاء الاصطناعي، وممكن يغلط أحياناً. اعتبر التصحيح إرشادي يساعدك تراجع نفسك.
                  </span>
                </div>
              )}

              <h2 className="relative" dir={contentDir} style={{ fontFamily: "var(--font-head)", fontWeight: 800, fontSize: 19, lineHeight: 1.85, color: "var(--ink)", margin: "0 0 22px", whiteSpace: "pre-wrap" }}>
                {q.question}
              </h2>

              {q.type === "mcq" ? (
                <div className="relative grid gap-3" dir={contentDir}>
                  {q.options.map((opt, slot) => {
                    const look = choiceLook(q, slot, state.submitted);
                    return (
                      <button
                        key={slot}
                        type="button"
                        onClick={() => choose(q, slot)}
                        disabled={state.submitted || state.readOnly}
                        className="flex items-center gap-3 text-start rounded-[16px] transition-all enabled:cursor-pointer enabled:hover:-translate-y-0.5"
                        style={{ padding: "14px 16px", border: `2px solid ${look.border}`, background: look.bg, color: "var(--ink)", fontSize: 15.5, fontWeight: 600, lineHeight: 1.7 }}
                      >
                        <span className="shrink-0 inline-flex items-center justify-center rounded-[10px]" style={{ width: 34, height: 34, background: look.badgeBg, color: look.badgeColor, fontWeight: 900, fontSize: 16 }}>
                          {look.icon ?? letters[slot]}
                        </span>
                        <span className="flex-1">{opt}</span>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="relative">
                  <textarea
                    dir={contentDir}
                    value={q.text}
                    onChange={(e) => typeEssay(q, e.target.value)}
                    onBlur={flushEssay}
                    readOnly={state.submitted || state.readOnly}
                    rows={7}
                    placeholder={en ? "Write your answer here in your own words..." : "اكتب إجابتك هنا بأسلوبك..."}
                    className="w-full rounded-[16px] outline-none focus:ring-2 focus:ring-[var(--brand)]"
                    style={{ padding: 16, border: "2px solid var(--border)", background: "var(--surface-2)", color: "var(--ink)", fontSize: 15.5, lineHeight: 1.9, resize: "vertical", fontFamily: "inherit" }}
                  />
                  {!state.submitted && (
                    <div style={{ fontSize: 12, color: "var(--ink-3)", textAlign: "left" }}>{q.text.length} / {MAX_ESSAY_CHARS}</div>
                  )}
                  {state.submitted && <EssayResult q={q} dir={contentDir} />}
                </div>
              )}
            </article>
          </div>

          {error && <p style={{ color: "var(--danger)", fontWeight: 700, textAlign: "center", margin: 0 }}>{error}</p>}

          {/* Navigation */}
          <nav className="flex items-center justify-between gap-3">
            <button type="button" onClick={() => go(index - 1)} disabled={index === 0} className="enabled:cursor-pointer disabled:opacity-40" style={btn("var(--surface)", "var(--ink)", true)}>
              → السؤال السابق
            </button>
            {index < qs.length - 1 ? (
              <button type="button" onClick={() => go(index + 1)} className="cursor-pointer" style={btn("var(--brand)", "#fff")}>
                السؤال التالي ←
              </button>
            ) : !state.submitted && !state.readOnly ? (
              <button type="button" onClick={async () => { await flushEssay(); setConfirmOpen(true); }} className="cursor-pointer" style={btn("var(--success, #16a34a)", "#fff")}>
                ✅ تسليم التدريب
              </button>
            ) : (
              <span />
            )}
          </nav>
        </>
      )}

      {confirmOpen && (
        <div className="fixed inset-0 z-[var(--z-modal)] flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,.45)" }} role="dialog" aria-modal="true">
          <div className="w-full max-w-[420px] rounded-[22px] p-6 text-center" style={{ background: "var(--surface)", boxShadow: "var(--shadow-lg)" }}>
            <div style={{ fontSize: 40 }}>📝</div>
            <h3 style={{ fontFamily: "var(--font-head)", fontWeight: 900, fontSize: 20, color: "var(--ink)", margin: "6px 0 8px" }}>تسليم التدريب؟</h3>
            <p style={{ fontSize: 14.5, color: "var(--ink-2)", lineHeight: 1.8, margin: "0 0 18px" }}>
              {answeredCount < qs.length
                ? `لسه فيه ${qs.length - answeredCount} سؤال من غير إجابة، وهيتحسبوا غلط.`
                : "جاوبت على كل الأسئلة. بعد التسليم مش هتقدر تعدّل."}
              <br />التسليم مرة واحدة بس في اليوم.
            </p>
            <div className="flex gap-3 justify-center">
              <button type="button" onClick={() => setConfirmOpen(false)} disabled={submitting} className="cursor-pointer" style={btn("var(--surface-2)", "var(--ink)", true)}>
                رجوع
              </button>
              <button type="button" onClick={submit} disabled={submitting} className="cursor-pointer disabled:opacity-60" style={btn("var(--brand)", "#fff")}>
                {submitting ? "جارٍ التسليم..." : "تسليم"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Pieces ───────────────────────────────────────────────────────────────────

function ResultCard({ state, pendingCount, showReview, onToggleReview }: { state: PracticeState; pendingCount: number; showReview: boolean; onToggleReview: () => void }) {
  const qs = state.questions;
  const mcq = qs.filter((q) => q.type === "mcq");
  const essays = qs.filter((q) => q.type === "essay");
  const s = state.summary;
  const mcqCorrect = s?.mcqCorrect ?? mcq.filter((q) => q.isCorrect).length;
  const essayCorrect = s?.essayCorrect ?? essays.filter((q) => q.verdict === "CORRECT").length;
  const total = mcqCorrect + essayCorrect;
  const pct = qs.length ? Math.round((total / qs.length) * 100) : 0;

  return (
    <section className="rounded-[24px] p-6 sm:p-7" style={{ background: "var(--surface)", border: "1px solid var(--border)", boxShadow: "var(--shadow)" }}>
      <div className="flex flex-wrap items-center justify-between gap-4 mb-5">
        <div>
          <h2 style={{ fontFamily: "var(--font-head)", fontWeight: 900, fontSize: 22, color: "var(--ink)", margin: 0 }}>
            {pct >= 85 ? "🏆 أداء ممتاز!" : pct >= 60 ? "👏 شغل حلو!" : "💪 كمّل وهتتحسن"}
          </h2>
          <p style={{ fontSize: 14, color: "var(--ink-2)", margin: "4px 0 0" }}>
            {state.finalized ? `نتيجتك: ${total} من ${qs.length} (${pct}%)` : "بنصحّح إجاباتك المقالية..."}
          </p>
        </div>
        <div className="text-center rounded-[18px] px-5 py-3" style={{ background: "var(--gold-soft)", border: "1px solid var(--gold-2)" }}>
          <div style={{ fontSize: 12.5, color: "var(--ink-2)", fontWeight: 700 }}>النقاط المكتسبة</div>
          <div style={{ fontFamily: "var(--font-head)", fontSize: 26, fontWeight: 900, color: "var(--gold-2)" }}>
            {state.finalized ? `+${s?.pointsAwarded ?? 0}` : "…"}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-5">
        <Stat label="اختيار من متعدد" value={`${mcqCorrect} / ${mcq.length}`} />
        <Stat
          label="أسئلة مقالية"
          value={pendingCount > 0 ? `جارٍ التصحيح (${essays.length - pendingCount}/${essays.length})` : `${essayCorrect} / ${essays.length}`}
          spinning={pendingCount > 0}
        />
      </div>

      {pendingCount > 0 && (
        <p className="rounded-[14px] px-4 py-3" style={{ fontSize: 13.5, color: "var(--gold-2)", background: "var(--gold-soft)", lineHeight: 1.8, margin: "0 0 16px" }}>
          ⏳ تصحيح الأسئلة المقالية ممكن ياخد لحد 10 دقايق. تقدر تسيب الصفحة وترجع لها، النتيجة والنقاط هتتحفظ لوحدها.
        </p>
      )}

      <p style={{ fontSize: 12.5, color: "var(--ink-3)", lineHeight: 1.8, margin: "0 0 16px" }}>
        كل إجابة صح في الاختيار من متعدد = {state.rules.MCQ_CORRECT} نقطة · سؤال مقالي صح = {state.rules.ESSAY_CORRECT} نقاط (صح جزئياً = {state.rules.ESSAY_PARTIAL}) · كل الأسئلة صح = {state.rules.PERFECT_BONUS} نقاط زيادة.
        النقاط بتتضاف لرصيدك في لوحة الشرف.
      </p>

      <div className="flex flex-wrap gap-3">
        <button type="button" onClick={onToggleReview} className="cursor-pointer" style={btn("var(--brand)", "#fff")}>
          {showReview ? "إخفاء المراجعة" : "📋 راجع إجاباتك"}
        </button>
        <Link href="/leaderboard" className="no-underline" style={btn("var(--surface-2)", "var(--ink)", true)}>
          🏆 لوحة الشرف
        </Link>
      </div>
      <p style={{ fontSize: 13, color: "var(--ink-3)", margin: "14px 0 0" }}>تدريب جديد هيكون جاهز بكرة الصبح ✨</p>
    </section>
  );
}

function EssayResult({ q, dir }: { q: Question; dir: "ltr" | "rtl" }) {
  if (q.status === "PENDING") {
    return (
      <div className="flex items-center gap-2 mt-4" style={{ color: "var(--ink-2)", fontSize: 14 }}>
        <div className="w-4 h-4 border-2 border-[var(--brand)] border-t-transparent rounded-full animate-spin" />
        الذكاء الاصطناعي بيصحّح إجابتك...
      </div>
    );
  }
  const v = q.status === "FAILED" ? null : q.verdict;
  const look =
    v === "CORRECT" ? { t: "✅ إجابة صحيحة", c: "var(--success, #16a34a)" }
    : v === "PARTIAL" ? { t: "🟡 صحيحة جزئياً", c: "var(--gold-2)" }
    : v === "INCORRECT" ? { t: q.text.trim() ? "❌ إجابة غير مكتملة" : "❌ لم تتم الإجابة", c: "var(--danger)" }
    : { t: "⚠️ تعذّر التصحيح هذه المرة", c: "var(--ink-3)" };
  return (
    <div className="mt-4 flex flex-col gap-3">
      <div style={{ fontWeight: 800, color: look.c, fontSize: 15.5 }}>{look.t}</div>
      {q.feedback?.summary && <p style={{ fontSize: 14.5, color: "var(--ink)", lineHeight: 1.85, margin: 0 }}>{q.feedback.summary}</p>}
      {!!q.feedback?.missingPoints?.length && (
        <div>
          <div style={{ fontSize: 13.5, fontWeight: 800, color: "var(--ink-2)", marginBottom: 4 }}>ناقصك:</div>
          <ul style={{ margin: 0, paddingInlineStart: 20, fontSize: 14, color: "var(--ink)", lineHeight: 1.8 }}>
            {q.feedback.missingPoints.map((p, i) => <li key={i}>{p}</li>)}
          </ul>
        </div>
      )}
      {q.referenceAnswer && (
        <details className="rounded-[14px] px-4 py-3" style={{ background: "var(--brand-soft)", border: "1px solid var(--border)" }}>
          <summary className="cursor-pointer" style={{ fontWeight: 800, color: "var(--brand)", fontSize: 14 }}>إجابة نموذجية</summary>
          <p dir={dir} style={{ fontSize: 14.5, color: "var(--ink)", lineHeight: 1.9, margin: "8px 0 0", whiteSpace: "pre-wrap" }}>{q.referenceAnswer}</p>
        </details>
      )}
    </div>
  );
}

function TrackPicker({ current, suggested, saving, error, onPick, onCancel }: {
  current: Track | null;
  suggested: Track | null;
  saving: boolean;
  error: string;
  onPick: (t: Track) => void;
  onCancel?: () => void;
}) {
  const [picked, setPicked] = useState<Track | null>(current ?? suggested);
  return (
    <div className="max-w-[560px] mx-auto my-6 rounded-[26px] p-[2px]" style={{ background: "linear-gradient(135deg, var(--brand), var(--gold), var(--brand))", boxShadow: "var(--shadow-lg)" }}>
      <div className="relative overflow-hidden rounded-[24px] p-7 sm:p-9 text-center" style={{ background: "var(--surface)" }}>
        <Ornament style={{ top: -50, left: -50, width: 140, height: 140, opacity: 0.07, background: "var(--brand)" }} />
        <div style={{ fontSize: 44 }}>✍️</div>
        <h1 style={{ fontFamily: "var(--font-head)", fontWeight: 900, fontSize: 24, color: "var(--ink)", margin: "6px 0 6px" }}>انت لغات ولا عربي؟</h1>
        <p style={{ fontSize: 14.5, color: "var(--ink-2)", lineHeight: 1.8, margin: "0 0 22px" }}>
          اختار نظام دراستك علشان نديك أسئلة التدريب باللغة المناسبة. تقدر تغيّره بعدين.
        </p>
        <div className="grid grid-cols-2 gap-3 mb-5">
          {TRACKS.map((t) => {
            const on = picked === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setPicked(t.id)}
                aria-pressed={on}
                className="relative cursor-pointer rounded-[18px] p-5 transition-all hover:-translate-y-0.5"
                style={{ border: `2px solid ${on ? "var(--brand)" : "var(--border)"}`, background: on ? "var(--brand-soft)" : "var(--surface-2)" }}
              >
                {suggested === t.id && !current && (
                  <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 rounded-full whitespace-nowrap" style={{ padding: "2px 10px", fontSize: 11, fontWeight: 800, background: "var(--gold)", color: "#fff" }}>
                    مقترح لك
                  </span>
                )}
                <div style={{ fontSize: 32 }}>{t.icon}</div>
                <div style={{ fontFamily: "var(--font-head)", fontWeight: 900, fontSize: 20, color: on ? "var(--brand)" : "var(--ink)" }}>{t.title}</div>
                <div style={{ fontSize: 12.5, color: "var(--ink-3)", marginTop: 2 }}>{t.body}</div>
              </button>
            );
          })}
        </div>
        {error && <p style={{ color: "var(--danger)", fontWeight: 700, margin: "0 0 12px" }}>{error}</p>}
        <div className="flex gap-3 justify-center">
          {onCancel && (
            <button type="button" onClick={onCancel} disabled={saving} className="cursor-pointer" style={btn("var(--surface-2)", "var(--ink)", true)}>
              رجوع
            </button>
          )}
          <button type="button" onClick={() => picked && onPick(picked)} disabled={!picked || saving} className="cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed" style={btn("var(--brand)", "#fff")}>
            {saving ? "جارٍ الحفظ..." : "يلا نبدأ ←"}
          </button>
        </div>
        {current && <p style={{ fontSize: 12.5, color: "var(--ink-3)", margin: "14px 0 0" }}>النقاط بتتحسب مرة واحدة في اليوم، حتى لو غيّرت المسار.</p>}
      </div>
    </div>
  );
}

function Panel({ children }: { children: React.ReactNode }) {
  return (
    <div className="max-w-[520px] mx-auto text-center rounded-[22px] p-10 my-10" style={{ background: "var(--surface)", border: "1px solid var(--border)", boxShadow: "var(--shadow-lg)" }}>
      {children}
    </div>
  );
}

function Chip({ children, bg, color }: { children: React.ReactNode; bg: string; color: string }) {
  return (
    <span className="inline-flex items-center rounded-full" style={{ padding: "6px 12px", background: bg, color, fontSize: 12.5, fontWeight: 800 }}>
      {children}
    </span>
  );
}

function Stat({ label, value, spinning }: { label: string; value: string; spinning?: boolean }) {
  return (
    <div className="rounded-[16px] p-4 text-center" style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}>
      <div style={{ fontSize: 12.5, color: "var(--ink-3)", fontWeight: 700, marginBottom: 4 }}>{label}</div>
      <div className="flex items-center justify-center gap-2" style={{ fontFamily: "var(--font-head)", fontSize: spinning ? 15 : 22, fontWeight: 900, color: "var(--ink)" }}>
        {spinning && <span className="w-4 h-4 border-2 border-[var(--brand)] border-t-transparent rounded-full animate-spin" />}
        {value}
      </div>
    </div>
  );
}

function Ornament({ style }: { style: React.CSSProperties }) {
  return <span aria-hidden className="absolute rounded-full pointer-events-none" style={{ background: "#fff", filter: "blur(2px)", ...style }} />;
}

function btn(bg: string, color: string, outlined = false): React.CSSProperties {
  return {
    padding: "12px 20px",
    borderRadius: 14,
    background: bg,
    color,
    fontWeight: 800,
    fontSize: 15,
    border: outlined ? "1px solid var(--border-strong)" : "none",
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
  };
}

function dot(q: Question, current: boolean, submitted: boolean, answered: boolean): React.CSSProperties {
  let bg = "var(--surface-2)";
  let color = "var(--ink-2)";
  if (submitted) {
    if (q.status === "PENDING") { bg = "var(--gold-soft)"; color = "var(--gold-2)"; }
    else if (q.isCorrect) { bg = "var(--success, #16a34a)"; color = "#fff"; }
    else if (q.verdict === "PARTIAL") { bg = "var(--gold)"; color = "#fff"; }
    else { bg = "var(--danger)"; color = "#fff"; }
  } else if (answered) {
    bg = "var(--brand-soft)";
    color = "var(--brand)";
  }
  return {
    width: 32,
    height: 32,
    borderRadius: 10,
    fontSize: 13,
    fontWeight: 800,
    background: bg,
    color,
    border: current ? "2px solid var(--brand)" : "1px solid var(--border)",
    boxShadow: current ? "0 0 0 3px var(--brand-soft)" : "none",
  };
}

function choiceLook(q: Question, slot: number, submitted: boolean) {
  const selected = q.selected === slot;
  if (submitted) {
    if (slot === q.correct) return { border: "var(--success, #16a34a)", bg: "color-mix(in srgb, var(--success, #16a34a) 12%, var(--surface))", badgeBg: "var(--success, #16a34a)", badgeColor: "#fff", icon: "✓" };
    if (selected) return { border: "var(--danger)", bg: "var(--danger-soft)", badgeBg: "var(--danger)", badgeColor: "#fff", icon: "✕" };
    return { border: "var(--border)", bg: "var(--surface)", badgeBg: "var(--surface-2)", badgeColor: "var(--ink-3)", icon: null };
  }
  if (selected) return { border: "var(--brand)", bg: "var(--brand-soft)", badgeBg: "var(--brand)", badgeColor: "#fff", icon: null };
  return { border: "var(--border)", bg: "var(--surface)", badgeBg: "var(--surface-2)", badgeColor: "var(--ink-2)", icon: null };
}
