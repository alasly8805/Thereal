"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import {
  CURRICULUM_CHAPTERS,
  CURRICULUM_QUESTIONS,
  getCurriculumQuestionsByChapter,
  generate100CurriculumQuestions,
  type CurriculumChapter,
  type CurriculumQuestion,
} from "@/lib/curriculum-programming-questions";
import { updateIQ } from "@/lib/iq-system";

type AnswerState = { choice: string; correct: boolean } | null;

export interface TopStudent {
  rank: number;
  studentId: string;
  name: string;
  image?: string | null;
  correctCount: number;
  points?: number;
}

function formatStudentName(name: string): string {
  if (!name) return "طالب مميز";
  const parts = name.trim().split(/\s+/);
  if (parts.length <= 2) return name;
  if (parts.length === 3) return parts.join(" ");
  return `${parts[0]} ${parts[1]} ${parts[parts.length - 1]}`;
}

const ARABIC_LETTERS = ["أ", "ب", "ج", "د", "هـ", "و"];

function shuffle<T>(items: readonly T[]): T[] {
  return [...items].sort(() => Math.random() - 0.5);
}

function CodeBlock({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard?.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative my-3 rounded-2xl border border-slate-700/80 bg-slate-950 overflow-hidden shadow-inner" dir="ltr">
      <div className="flex items-center justify-between px-3 py-1 bg-slate-900/90 border-b border-slate-800 text-[10px] font-mono text-slate-400">
        <span className="font-bold text-teal-400">PYTHON / CODE</span>
        <button
          type="button"
          onClick={handleCopy}
          className="text-[10px] px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
        >
          {copied ? "✓ Copied" : "Copy"}
        </button>
      </div>
      <pre className="max-h-52 overflow-x-auto p-3 text-left font-mono text-xs sm:text-sm leading-relaxed text-emerald-300">
        <code>{code}</code>
      </pre>
    </div>
  );
}

export function CurriculumPractice() {
  const prefersReducedMotion = useReducedMotion();
  const [chapter, setChapter] = useState<CurriculumChapter | "all">("all");
  const [is100Mode, setIs100Mode] = useState(false);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [choices, setChoices] = useState<string[]>([]);
  const [answer, setAnswer] = useState<AnswerState>(null);
  const [score, setScore] = useState(0);
  const [completed, setCompleted] = useState(0);
  const [serverCompleted, setServerCompleted] = useState<string[]>([]);
  const [topStudents, setTopStudents] = useState<TopStudent[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sessionStartedAt] = useState(() => Date.now());
  const [finished, setFinished] = useState(false);

  const questions = useMemo(
    () => is100Mode
      ? generate100CurriculumQuestions(chapter)
      : getCurriculumQuestionsByChapter(chapter),
    [chapter, is100Mode]
  );
  const question: CurriculumQuestion | undefined = questions[questionIndex];

  useEffect(() => {
    let cancelled = false;
    fetch("/api/curriculum/practice", { credentials: "include" })
      .then((res) => res.ok ? res.json() : null)
      .then((data: { completedCount?: number; correctCount?: number; completedQuestionIds?: string[]; topStudents?: TopStudent[] } | null) => {
        if (cancelled || !data) return;
        setCompleted(data.completedCount ?? 0);
        setScore(data.correctCount ?? 0);
        setServerCompleted(data.completedQuestionIds ?? []);
        if (data.topStudents) setTopStudents(data.topStudents);
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    setQuestionIndex(0);
    setAnswer(null);
    setFinished(false);
  }, [chapter, is100Mode]);

  useEffect(() => {
    if (question) setChoices(shuffle(question.choices));
  }, [question]);

  const resetPractice = useCallback(() => {
    setQuestionIndex(0);
    setAnswer(null);
    setScore(0);
    setCompleted(0);
    setFinished(false);
  }, []);

  const start100Marathon = () => {
    setIs100Mode(true);
    resetPractice();
  };

  const startStandardMode = () => {
    setIs100Mode(false);
    resetPractice();
  };

  const openAiHelp = () => {
    if (!question) return;
    window.dispatchEvent(new CustomEvent("open-ai-assistant", {
      detail: {
        initialPrompt: `اشرح لي بالتفصيل مفهوم «${question.lessonTitle}» من منهج البرمجة والذكاء الاصطناعي. السؤال الحالي: ${question.question} ولا تعطِني الإجابة مباشرة؛ ساعدني في فهم الفكرة.`,
      },
    }));
  };

  const submitAnswer = async (choice: string) => {
    if (!question || answer || saving) return;
    const correct = choice === question.answer;
    setAnswer({ choice, correct });
    setScore((current) => current + (correct ? 1 : 0));
    setCompleted((current) => current + (serverCompleted.includes(question.id) ? 0 : 1));
    setSaving(true);
    try {
      const res = await fetch("/api/curriculum/practice", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questionId: question.id, choice }),
      });
      const data = await res.json().catch(() => null) as {
        progress?: { completedCount?: number; correctCount?: number; completedQuestionIds?: string[] };
        topStudents?: TopStudent[];
      } | null;
      if (res.ok && data) {
        if (data.progress) {
          setCompleted(data.progress.completedCount ?? completed);
          setScore(data.progress.correctCount ?? score);
          setServerCompleted(data.progress.completedQuestionIds ?? serverCompleted);
        }
        if (data.topStudents) {
          setTopStudents(data.topStudents);
        }
      }
    } catch {
      // Keep answer visible
    } finally {
      setSaving(false);
    }
  };

  const next = () => {
    if (!question) return;
    if (questionIndex >= questions.length - 1) {
      updateIQ("coding", {
        correct: score,
        total: questions.length,
        totalTimeMs: Date.now() - sessionStartedAt,
        avgLevel: 5,
        maxStreak: 0,
        difficulty: "medium",
      });
      setFinished(true);
      return;
    }
    setQuestionIndex((index) => index + 1);
    setAnswer(null);
  };

  if (loading) {
    return (
      <div className="grid gap-3 sm:gap-4 lg:grid-cols-[240px_1fr]" aria-busy="true">
        <div className="h-16 lg:h-32 animate-pulse rounded-2xl bg-slate-800/70" />
        <div className="h-80 sm:h-96 animate-pulse rounded-3xl bg-slate-800/70" />
      </div>
    );
  }

  if (finished) {
    const percentage = questions.length > 0 ? Math.round((score / questions.length) * 100) : 0;
    return (
      <motion.section
        initial={prefersReducedMotion ? false : { opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="rounded-3xl border border-teal-500/30 bg-slate-900/95 p-6 sm:p-10 text-center shadow-2xl backdrop-blur-xl mb-24"
        dir="rtl"
      >
        <div className="mx-auto mb-4 flex h-16 w-16 sm:h-20 sm:w-20 items-center justify-center rounded-3xl bg-emerald-500/20 text-3xl sm:text-4xl text-emerald-300 ring-4 ring-emerald-500/20 animate-bounce">
          🏆
        </div>
        <h3 className="text-xl sm:text-3xl font-black text-white">رائع! أكملت الجولة بنجاح</h3>
        <p className="mt-2 text-xs sm:text-base text-slate-300">
          أجبت عن <span className="font-bold text-white">{questions.length}</span> أسئلة، حققت منها <span className="font-black text-emerald-400">{score}</span> إجابة صحيحة ({percentage}%).
        </p>

        {/* Progress Ring / Bar */}
        <div className="my-5 sm:my-6 mx-auto max-w-xs p-4 rounded-2xl bg-slate-950/70 border border-slate-800 text-center">
          <div className="text-xs font-bold text-slate-400 mb-2">معدل الإتقان المعرفي</div>
          <div className="h-3 w-full rounded-full bg-slate-800 overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-teal-500 to-emerald-400 transition-all duration-1000"
              style={{ width: `${percentage}%` }}
            />
          </div>
          <div className="mt-2 text-base sm:text-lg font-black text-emerald-300">{percentage}%</div>
        </div>

        <div className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-2.5 sm:gap-3">
          <button
            type="button"
            onClick={resetPractice}
            className="w-full sm:w-auto min-h-11 rounded-2xl bg-slate-800 hover:bg-slate-700 px-5 py-2.5 text-xs sm:text-sm font-bold text-white transition active:scale-95 cursor-pointer"
          >
            🔄 إعادة نفس الجولة
          </button>
          <button
            type="button"
            onClick={is100Mode ? startStandardMode : start100Marathon}
            className="w-full sm:w-auto min-h-11 rounded-2xl bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-500 hover:to-emerald-500 px-5 py-2.5 text-xs sm:text-sm font-black text-white shadow-lg transition active:scale-95 cursor-pointer"
          >
            {is100Mode ? `📚 كل أسئلة المنهج (${CURRICULUM_QUESTIONS.length})` : "🔥 تحدي 100 سؤال من المنهج"}
          </button>
        </div>
      </motion.section>
    );
  }

  const progressPercent = questions.length > 0 ? Math.round(((questionIndex + 1) / questions.length) * 100) : 0;

  return (
    <section className="flex flex-col lg:grid lg:grid-cols-[250px_1fr] gap-3 sm:gap-6 pb-28 sm:pb-12" dir="rtl" aria-label="أسئلة برمجة المنهج">
      
      {/* ── Top Bar on Mobile & Sidebar on Desktop ── */}
      <aside className="rounded-2xl sm:rounded-3xl border border-slate-700/80 bg-slate-900/95 p-3 sm:p-5 shadow-xl lg:sticky lg:top-24 h-fit">
        
        {/* Chapter Header & Total Count */}
        <div className="flex items-center justify-between mb-2.5 px-0.5">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-black text-slate-300">الفصل:</span>
            <span className="rounded-full bg-teal-400/15 border border-teal-400/30 px-2 py-0.5 text-[10px] font-black text-teal-300">
              {is100Mode ? "تحدي 100" : `${questions.length} سؤال`}
            </span>
          </div>
          <button
            type="button"
            onClick={() => setIs100Mode(!is100Mode)}
            className={`text-[10px] sm:text-[11px] font-black px-2.5 py-1 rounded-xl transition cursor-pointer ${
              is100Mode
                ? "bg-amber-400/20 text-amber-300 border border-amber-400/40"
                : "bg-slate-800 text-slate-300 hover:text-white border border-slate-700"
            }`}
          >
            {is100Mode ? "⚡ 100 سؤال نشط" : "🎯 وضع 100"}
          </button>
        </div>

        {/* Scrollable Chapter Selector Carousel (Mobile) / Vertical List (Desktop) */}
        <div className="flex gap-1.5 overflow-x-auto scrollbar-none pb-1.5 lg:pb-0 lg:block lg:space-y-1.5 lg:overflow-visible">
          <button
            type="button"
            onClick={() => setChapter("all")}
            aria-pressed={chapter === "all"}
            className={`min-h-[38px] sm:min-h-[42px] shrink-0 rounded-xl px-3 py-1.5 text-xs sm:text-sm font-bold transition-all text-center lg:text-right cursor-pointer flex items-center justify-between gap-1.5 ${
              chapter === "all"
                ? "bg-gradient-to-r from-teal-600 to-emerald-600 text-white shadow-md font-black"
                : "bg-slate-950/70 text-slate-300 hover:bg-slate-800 border border-slate-800"
            } lg:w-full`}
          >
            <span>كل الفصول</span>
            <span className="text-[10px] opacity-80 font-mono">({CURRICULUM_QUESTIONS.length})</span>
          </button>

          {CURRICULUM_CHAPTERS.map((item) => {
            const isSelected = chapter === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setChapter(item.id)}
                aria-pressed={isSelected}
                className={`min-h-[38px] sm:min-h-[42px] shrink-0 rounded-xl px-3 py-1.5 text-xs sm:text-sm font-bold transition-all text-center lg:text-right cursor-pointer whitespace-nowrap lg:whitespace-normal ${
                  isSelected
                    ? "bg-gradient-to-r from-teal-600 to-emerald-600 text-white shadow-md font-black"
                    : "bg-slate-950/70 text-slate-300 hover:bg-slate-800 border border-slate-800"
                } lg:w-full`}
              >
                <span>{item.shortLabel}</span>
              </button>
            );
          })}
        </div>

        {/* Live Progress Box (Compact on desktop) */}
        <div className="hidden lg:grid mt-3.5 pt-3 border-t border-slate-800 gap-2 text-xs">
          <div className="p-2.5 rounded-xl bg-slate-950/80 border border-slate-800/80 flex items-center justify-between">
            <span className="text-slate-400">المكتمل:</span>
            <strong className="text-white font-black text-sm">{completed}</strong>
          </div>
          <div className="p-2.5 rounded-xl bg-slate-950/80 border border-slate-800/80 flex items-center justify-between">
            <span className="text-slate-400">الإجابات الصحيحة:</span>
            <strong className="text-emerald-400 font-black text-sm">✓ {score}</strong>
          </div>
        </div>

        {/* Top 3 High Scores Card (أعلى ٣ سكور للطلاب) */}
        <div className="hidden lg:block mt-3.5 pt-3 border-t border-slate-800">
          <div className="flex items-center justify-between mb-2.5 px-0.5">
            <span className="text-xs font-black text-amber-400 flex items-center gap-1.5">
              <span>🏆</span>
              <span>أعلى ٣ سكور للطلاب</span>
            </span>
            <span className="text-[10px] font-bold text-slate-400 bg-slate-800/80 px-2 py-0.5 rounded-full border border-slate-700">
              المتصدرين
            </span>
          </div>

          <div className="space-y-1.5">
            {topStudents.length > 0 ? (
              topStudents.slice(0, 3).map((s, idx) => {
                const medal = idx === 0 ? "🥇" : idx === 1 ? "🥈" : "🥉";
                const arabicRank = ["الأول", "الثاني", "الثالث"][idx] || `${idx + 1}`;
                const formattedName = formatStudentName(s.name);
                const bgStyle =
                  idx === 0
                    ? "bg-gradient-to-r from-amber-500/15 to-yellow-500/10 border-amber-500/30 text-amber-200"
                    : idx === 1
                    ? "bg-slate-800/60 border-slate-700/80 text-slate-200"
                    : "bg-amber-900/10 border-amber-800/30 text-amber-300/90";
                
                return (
                  <div
                    key={s.studentId || idx}
                    title={s.name}
                    className={`p-2.5 rounded-xl border flex items-center justify-between gap-2 text-xs transition-all ${bgStyle}`}
                  >
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <span className="text-lg leading-none shrink-0">{medal}</span>
                      <div className="min-w-0 flex-1">
                        <p className="font-bold text-[12.5px] leading-tight text-white m-0 truncate">
                          {formattedName}
                        </p>
                        <p className="text-[10px] text-slate-400 leading-tight m-0 mt-0.5 font-medium">
                          المركز {arabicRank}
                        </p>
                      </div>
                    </div>
                    <div className="text-left shrink-0 pl-0.5">
                      <span className="font-black font-mono text-emerald-400 text-sm block leading-none">
                        {s.correctCount}
                      </span>
                      <span className="text-[9px] text-slate-400 block mt-0.5 font-medium">
                        إجابة صحيحة
                      </span>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="text-center py-2 text-[11px] text-slate-500">
                كن أول من يحقق أعلى سكور!
              </div>
            )}
          </div>
        </div>
      </aside>

      {/* ── Main Question Card Column ── */}
      <div className="flex flex-col gap-3">
        {/* Mobile Top 3 High Scores Banner */}
        {topStudents.length > 0 && (
          <div className="lg:hidden rounded-2xl border border-amber-500/20 bg-slate-900/95 p-2.5 px-3.5 flex items-center justify-between gap-2 text-xs shadow-md">
            <div className="flex items-center gap-1.5 font-black text-amber-400 shrink-0">
              <span>🏆</span>
              <span className="text-[11px]">أعلى ٣ سكور:</span>
            </div>
            <div className="flex items-center gap-2.5 overflow-x-auto scrollbar-none py-0.5">
              {topStudents.slice(0, 3).map((s, idx) => (
                <div key={s.studentId || idx} title={s.name} className="flex items-center gap-1 shrink-0 text-[11px] text-slate-200">
                  <span>{idx === 0 ? "🥇" : idx === 1 ? "🥈" : "🥉"}</span>
                  <span className="font-bold truncate max-w-[95px]">{formatStudentName(s.name)}</span>
                  <span className="font-mono font-black text-emerald-400 text-[10px]">({s.correctCount})</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {question ? (
          <motion.article
          key={question.id}
          initial={prefersReducedMotion ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
          className="rounded-2xl sm:rounded-3xl border border-slate-700/80 bg-slate-900/95 p-3.5 sm:p-7 shadow-2xl flex flex-col justify-between"
        >
          <div>
            {/* Question Header & Live Progress Strip */}
            <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 sm:pb-3.5 border-b border-slate-800">
              <div className="flex flex-wrap items-center gap-1.5 text-xs font-bold">
                <span className="rounded-lg bg-teal-400/15 border border-teal-400/30 px-2 py-0.5 text-teal-300 text-[10px] sm:text-[11px] font-black">
                  الفصل {question.lessonNumber.split("-")[0]}
                </span>
                <span className="rounded-lg border border-slate-700/80 bg-slate-800/60 px-2 py-0.5 text-slate-300 text-[10px] sm:text-[11px] max-w-[180px] sm:max-w-none truncate">
                  {question.lessonTitle}
                </span>
              </div>

              {/* Progress counter & live score */}
              <div className="flex items-center gap-2 text-xs font-black text-slate-300 shrink-0">
                <span className="hidden sm:inline text-emerald-400 text-[11px]">✓ {score}</span>
                <span>{questionIndex + 1} / {questions.length}</span>
                <div className="w-12 sm:w-20 h-2 bg-slate-800 rounded-full overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-teal-500 to-emerald-400 transition-all duration-300" style={{ width: `${progressPercent}%` }} />
                </div>
              </div>
            </div>

            {/* Question Text */}
            <h3 className="mt-3.5 sm:mt-5 text-sm sm:text-xl font-extrabold leading-snug sm:leading-relaxed text-white">
              {question.question}
            </h3>

            {/* Optional Code Snippet */}
            {question.code && <CodeBlock code={question.code} />}

            {/* Option Choices */}
            <div className="mt-3.5 sm:mt-6 grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-2.5">
              {choices.map((choice, index) => {
                const isSelected = answer?.choice === choice;
                const isCorrect = answer && choice === question.answer;

                let btnStyle = "border-slate-700/80 bg-slate-950/70 text-slate-100 hover:border-teal-400/70 hover:bg-teal-500/10 active:scale-[0.98]";

                if (answer) {
                  if (isCorrect) {
                    btnStyle = "border-emerald-400 bg-emerald-500/20 text-emerald-100 font-bold ring-2 ring-emerald-400/40 shadow-lg";
                  } else if (isSelected && !answer.correct) {
                    btnStyle = "border-rose-400 bg-rose-500/20 text-rose-100 line-through opacity-90";
                  } else {
                    btnStyle = "border-slate-800 bg-slate-950/40 text-slate-500 opacity-40";
                  }
                }

                return (
                  <button
                    key={`${question.id}-${choice}`}
                    type="button"
                    onClick={() => void submitAnswer(choice)}
                    disabled={Boolean(answer) || saving}
                    className={`min-h-[46px] sm:min-h-[54px] rounded-xl sm:rounded-2xl border px-3 sm:px-3.5 py-2.5 sm:py-3 text-right text-xs sm:text-sm font-semibold leading-relaxed transition-all duration-200 flex items-center justify-between gap-2.5 cursor-pointer ${btnStyle}`}
                    aria-label={`اختيار ${index + 1}`}
                  >
                    <div className="flex items-center gap-2 sm:gap-2.5 flex-1 min-w-0">
                      <span className={`inline-flex h-6 w-6 sm:h-7 sm:w-7 items-center justify-center rounded-lg sm:rounded-xl text-xs font-black shrink-0 transition-colors ${
                        answer && isCorrect
                          ? "bg-emerald-500 text-white shadow-sm"
                          : answer && isSelected && !answer.correct
                          ? "bg-rose-500 text-white"
                          : "bg-white/10 text-slate-200"
                      }`}>
                        {ARABIC_LETTERS[index] || index + 1}
                      </span>
                      <span className="break-words leading-snug flex-1 font-medium">{choice}</span>
                    </div>

                    {answer && isCorrect && <span className="text-emerald-400 font-bold text-sm shrink-0">✅</span>}
                    {answer && isSelected && !answer.correct && <span className="text-rose-400 font-bold text-sm shrink-0">❌</span>}
                  </button>
                );
              })}
            </div>

            {/* Answer & Full Explanation Drawer */}
            <AnimatePresence>
              {answer && (
                <motion.div
                  initial={prefersReducedMotion ? false : { opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  className={`mt-3.5 sm:mt-4 p-3.5 sm:p-4 rounded-2xl border text-xs sm:text-sm leading-relaxed transition-all shadow-md ${
                    answer.correct
                      ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-100"
                      : "border-amber-400/30 bg-amber-400/10 text-amber-100"
                  }`}
                >
                  <div className="flex items-center gap-1.5 font-black text-xs sm:text-sm mb-1">
                    <span>{answer.correct ? "🎉 إجابة صحيحة وممتازة! ✓" : "❌ مش مشكلة — نراجع المفهوم سوا:"}</span>
                  </div>

                  {!answer.correct && question.revisionPrompt && (
                    <div className="mb-2 p-2 rounded-xl bg-amber-500/15 border border-amber-400/20 text-amber-200 font-semibold text-xs">
                      💡 {question.revisionPrompt}
                    </div>
                  )}

                  <p className="mt-1 text-xs sm:text-sm text-slate-200 leading-relaxed font-normal">
                    {question.explanation}
                  </p>

                  <div className="mt-2.5 pt-2 border-t border-white/10 text-[10px] sm:text-[11px] font-bold text-teal-200 flex items-center gap-1.5">
                    <span>📖 المصدر:</span>
                    <span>كتاب الوزارة — {question.chapterTitle} — الدرس {question.lessonNumber} (صـ {question.bookPage})</span>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Action Bar (Optimized for Mobile Thumb Tapping) */}
          <div className="mt-4 sm:mt-5 pt-3 border-t border-slate-800 flex flex-wrap sm:flex-nowrap items-center justify-between gap-2">
            <button
              type="button"
              onClick={openAiHelp}
              className="flex-1 sm:flex-none min-h-10 sm:min-h-11 rounded-xl border border-sky-400/30 bg-sky-500/10 hover:bg-sky-500/20 px-3.5 py-2 text-xs sm:text-sm font-bold text-sky-200 transition active:scale-95 flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <span>💡</span>
              <span>اسأل المساعد عن المفهوم</span>
            </button>

            {answer && (
              <button
                type="button"
                onClick={next}
                className="w-full sm:w-auto min-h-11 sm:min-h-12 rounded-xl bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-500 hover:to-emerald-500 px-5 sm:px-6 py-2 sm:py-2.5 text-xs sm:text-sm font-black text-white shadow-lg transition active:scale-95 flex items-center justify-center gap-2 cursor-pointer"
              >
                <span>{questionIndex === questions.length - 1 ? "عرض النتيجة النهائية 🏆" : "السؤال التالي ➔"}</span>
              </button>
            )}
          </div>
        </motion.article>
      ) : (
        <div className="rounded-3xl border border-slate-700 bg-slate-900/80 p-10 text-center text-slate-300">
          لا توجد أسئلة لهذا الفصل حاليًا.
        </div>
      )}
      </div>
    </section>
  );
}

