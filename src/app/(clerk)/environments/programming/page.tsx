"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import dynamic from "next/dynamic";
import { Navbar } from "@/components/ui/Navbar";
import { Footer } from "@/components/ui/Footer";
import { ProfileGuard } from "@/components/auth/ProfileGuard";
import { fetchMeWithRetry, type MeUser } from "@/lib/fetch-me";
import {
  updateIQ, getIQData, getRecommendedDifficulty, vibrate,
  SKILL_LABELS, SKILL_COLORS, SUBJECT_SKILLS,
  levelToDifficulty, difficultyToStartLevel, levelToTimer,
  type Difficulty, type IQData, type GameResult,
} from "@/lib/iq-system";
import { GameFeedback } from "@/components/ai/GameFeedback";

// The curriculum bank holds ~1000 questions; only download it when that tab is opened.
const CurriculumPractice = dynamic(
  () => import("@/components/environments/CurriculumPractice").then((mod) => mod.CurriculumPractice),
  {
    ssr: false,
    loading: () => <div className="h-80 sm:h-96 animate-pulse rounded-3xl bg-slate-800/70" aria-busy="true" />,
  }
);

/* ─── Sandbox Languages ────────────────────────────────────────────────── */
const LANGUAGES = [
  {
    id: "javascript",
    name: "JavaScript",
    icon: "⚡",
    color: "from-yellow-400 to-amber-500",
    description: "اكتب وتجرب كود JavaScript مباشرة",
    features: ["Console output", "Error detection", "Real-time execution"],
  },
  {
    id: "python",
    name: "Python",
    icon: "🐍",
    color: "from-blue-400 to-green-500",
    description: "اكتب وتجرب كود Python مباشرة",
    features: ["Console output", "Error detection", "Real-time execution"],
  },
  {
    id: "html-css-js",
    name: "HTML / CSS / JS",
    icon: "🌐",
    color: "from-orange-400 to-red-500",
    description: "أنشئ صفحات ويب كاملة",
    features: ["Live preview", "Console output", "Error detection"],
  },
];

/* ─── Coding Question Interface & Generator ────────────────────────────── */
interface CodingQuestion {
  language: "javascript" | "python" | "html-css";
  question: string;
  code?: string;
  choices: string[];
  answer: string;
  hint: string;
  explanation: string;
}

function genCodingQ(level: number, usedQuestions: Set<string>): CodingQuestion {
  const isEasy = level <= 3;
  const isMedium = level > 3 && level <= 7;
  
  let attempts = 0;
  while (attempts < 100) {
    attempts++;
    
    const languages: ("javascript" | "python" | "html-css")[] = ["javascript", "python", "html-css"];
    const lang = languages[Math.floor(Math.random() * 3)];
    
    if (lang === "javascript") {
      const templates: (() => CodingQuestion)[] = [
        // 1. Basic math operations
        () => {
          const x = Math.floor(Math.random() * 10) + 3;
          const y = Math.floor(Math.random() * 5) + 2;
          const z = Math.floor(Math.random() * 4) + 1;
          const ops = ["+", "-", "*"];
          const op = ops[Math.floor(Math.random() * 3)];
          
          let ansValue = 0;
          if (op === "+") ansValue = x * y + z;
          else if (op === "-") ansValue = x * y - z;
          else ansValue = x * y * z;
          
          const code = `let x = ${x};\nlet y = ${y};\nlet z = ${z};\nconsole.log(x * y ${op} z);`;
          const question = "ما هي القيمة المطبوعة في الكونسول (Output)؟";
          const answer = String(ansValue);
          const choices = [
            answer,
            String(ansValue + Math.floor(Math.random() * 4) + 1),
            String(ansValue - Math.floor(Math.random() * 4) - 1),
            String(x * y)
          ];
          
          return {
            language: "javascript" as const,
            question,
            code,
            answer,
            choices: Array.from(new Set(choices)),
            hint: "تذكر ترتيب العمليات الحسابية في لغات البرمجة: الضرب له الأسبقية على الجمع والطرح.",
            explanation: `قيمة الضرب x * y هي ${x * y}، ثم بتطبيق العملية ${op} z (${z}) نحصل على ${ansValue}.`
          };
        },
        // 2. Array length / push / pop
        () => {
          const vals = [Math.floor(Math.random() * 10), Math.floor(Math.random() * 10), Math.floor(Math.random() * 10)];
          const method = Math.random() < 0.5 ? "push" : "pop";
          const pushVal = Math.floor(Math.random() * 10);
          
          let ansValue = 0;
          let methodCode = "";
          let expl = "";
          if (method === "push") {
            ansValue = vals.length + 1;
            methodCode = `arr.push(${pushVal});`;
            expl = `الدالة push تضيف عنصراً جديداً إلى نهاية المصفوفة، فيصبح طولها ${ansValue}.`;
          } else {
            ansValue = vals.length - 1;
            methodCode = `arr.pop();`;
            expl = `الدالة pop تحذف العنصر الأخير من المصفوفة، فيقل طولها ليصبح ${ansValue}.`;
          }
          
          const code = `const arr = [${vals.join(", ")}];\n${methodCode}\nconsole.log(arr.length);`;
          const question = "ما هو طول المصفوفة المطبوع بعد تنفيذ الكود؟";
          const answer = String(ansValue);
          const choices = ["0", "1", "2", "3", "4"].filter(v => v !== answer).slice(0, 3).concat(answer);
          
          return {
            language: "javascript" as const,
            question,
            code,
            answer,
            choices,
            hint: `ابحث عن وظيفة الدالة ${method} في مصفوفات JavaScript وكيف تؤثر على طولها (length).`,
            explanation: expl
          };
        },
        // 3. String slicing / indexing
        () => {
          const words = ["Apple", "Orange", "Banana", "Cherry", "Grapes"];
          const word = words[Math.floor(Math.random() * words.length)];
          const idx = Math.floor(Math.random() * (word.length - 2)) + 1;
          
          const code = `let str = "${word}";\nconsole.log(str[${idx}]);`;
          const question = "ما هو الحرف المطبوع في الكونسول؟";
          const answer = word[idx];
          const choices = [answer, word[idx - 1] || "A", word[idx + 1] || "B", "undefined"];
          
          return {
            language: "javascript" as const,
            question,
            code,
            answer,
            choices: Array.from(new Set(choices)),
            hint: `الترقيم (indexing) في السلاسل النصية يبدأ من الرقم 0. الحرف الأول هو str[0] الثاني str[1] وهكذا.`,
            explanation: `الحرف عند الفهرس ${idx} في الكلمة "${word}" هو الحرف "${answer}" (الترتيب يبدأ من 0).`
          };
        },
        // 4. Function execution
        () => {
          const multiplier = Math.floor(Math.random() * 4) + 2;
          const input = Math.floor(Math.random() * 5) + 1;
          const add = Math.floor(Math.random() * 4) + 1;
          
          const code = `const calc = (x) => x * ${multiplier} + ${add};\nconsole.log(calc(${input}));`;
          const question = "ما هي القيمة الناتجة عن استدعاء الدالة وطباعتها؟";
          const ansVal = input * multiplier + add;
          const answer = String(ansVal);
          const choices = [
            answer,
            String(input * multiplier),
            String((input + add) * multiplier),
            String(ansVal + 4)
          ];
          
          return {
            language: "javascript" as const,
            question,
            code,
            answer,
            choices: Array.from(new Set(choices)),
            hint: `يتم التعويض عن الوسيط x بالقيمة الممررة ${input} في المعادلة: x * ${multiplier} + ${add}.`,
            explanation: `نعوض x بـ ${input}: النتيجة ${input} * ${multiplier} = ${input * multiplier}، ثم إضافة ${add} تعطي النتيجة ${ansVal}.`
          };
        }
      ];
      
      const chosenTemplate = templates[Math.floor(Math.random() * templates.length)];
      const q = chosenTemplate();
      const key = `js-${q.question.substring(0, 20)}-${q.code ? q.code.replace(/\s+/g, "") : ""}`;
      if (usedQuestions.has(key)) continue;
      usedQuestions.add(key);
      return q;
      
    } else if (lang === "python") {
      const templates: (() => CodingQuestion)[] = [
        // 1. List slicing
        () => {
          const vals = [Math.floor(Math.random() * 10), Math.floor(Math.random() * 10), Math.floor(Math.random() * 10), Math.floor(Math.random() * 10)];
          const start = Math.floor(Math.random() * 2);
          const end = start + Math.floor(Math.random() * 2) + 2;
          
          const code = `items = [${vals.join(", ")}]\nprint(items[${start}:${end}])`;
          const question = "ما هو ناتج تقطيع القائمة (List Slicing) المطبوع؟";
          const sliceResult = vals.slice(start, end);
          const answer = `[${sliceResult.join(", ")}]`;
          const choices = [
            answer,
            `[${vals.slice(start, end + 1).join(", ")}]`,
            `[${vals.slice(start + 1, end).join(", ")}]`,
            `[${vals.join(", ")}]`
          ];
          
          return {
            language: "python" as const,
            question,
            code,
            answer,
            choices: Array.from(new Set(choices)),
            hint: `التقطيع [start:end] يبدأ من الفهرس start ويقف قبل العنصر الأخير عند الفهرس end (أي لا يتضمن العنصر الأخير).`,
            explanation: `يبدأ التقطيع من الفهرس ${start} وحتى قبل الفهرس ${end}، مما يعطي القائمة الفرعية ${answer}.`
          };
        },
        // 2. String operations len/strip
        () => {
          const word = ["  Python  ", "  Code  ", "  Data  "][Math.floor(Math.random() * 3)];
          
          const code = `s = "${word}"\nprint(len(s.strip()))`;
          const question = "ما هي القيمة الرقمية المطبوعة؟";
          const answer = String(word.trim().length);
          const choices = [answer, String(word.length), String(word.trim().length + 2), "0"];
          
          return {
            language: "python" as const,
            question,
            code,
            answer,
            choices: Array.from(new Set(choices)),
            hint: `الدالة strip() تزيل جميع المسافات من الأطراف، بينما len() تحسب طول السلسلة النصية الناتجة.`,
            explanation: `بعد إزالة مسافات الأطراف من "${word}"، نحصل على كلمة طولها ${answer} أحرف.`
          };
        },
        // 3. For loop accumulator
        () => {
          const limit = Math.floor(Math.random() * 3) + 3;
          let sum = 0;
          for (let i = 0; i < limit; i++) sum += i;
          
          const code = `total = 0\nfor i in range(${limit}):\n    total += i\nprint(total)`;
          const question = "ما هي القيمة النهائية للمتغير total المطبوعة بعد انتهاء التكرار؟";
          const answer = String(sum);
          const choices = [
            answer,
            String(sum + limit),
            String(sum - 1),
            String(limit)
          ];
          
          return {
            language: "python" as const,
            question,
            code,
            answer,
            choices: Array.from(new Set(choices)),
            hint: `الدالة range(${limit}) تولد أرقاماً متتالية تبدأ من 0 وتنتهي عند ${limit - 1}.`,
            explanation: `نقوم بجمع الأرقام من 0 إلى ${limit - 1}: ${Array.from({ length: limit }, (_, i) => i).join(" + ")} = ${sum}.`
          };
        },
        // 4. Dictionary operations
        () => {
          const xVal = Math.floor(Math.random() * 5) + 1;
          const yVal = Math.floor(Math.random() * 5) + 2;
          const targetKey = Math.random() < 0.5 ? "x" : "y";
          const mult = Math.floor(Math.random() * 3) + 2;
          
          const code = `d = { "x": ${xVal}, "y": ${yVal} }\nprint(d["${targetKey}"] * ${mult})`;
          const question = "ما هو ناتج عملية الضرب المطبوع؟";
          const activeVal = targetKey === "x" ? xVal : yVal;
          const answer = String(activeVal * mult);
          const choices = [answer, String(xVal * mult), String(yVal * mult), String(xVal + yVal)];
          
          return {
            language: "python" as const,
            question,
            code,
            answer,
            choices: Array.from(new Set(choices)),
            hint: `نقوم بجلب القيمة المرتبطة بالمفتاح "${targetKey}" من القاموس d ثم نضربها في الرقم ${mult}.`,
            explanation: `قيمة المفتاح "${targetKey}" هي ${activeVal}، وبضربها في ${mult} نحصل على ${answer}.`
          };
        }
      ];
      
      const chosenTemplate = templates[Math.floor(Math.random() * templates.length)];
      const q = chosenTemplate();
      const key = `py-${q.question.substring(0, 20)}-${q.code ? q.code.replace(/\s+/g, "") : ""}`;
      if (usedQuestions.has(key)) continue;
      usedQuestions.add(key);
      return q;
      
    } else {
      // HTML/CSS templates
      const templates: (() => CodingQuestion)[] = [
        // 1. Selector specificity
        () => {
          const selectors = [
            { s: "#nav .link", ans: "110" },
            { s: ".menu li a", ans: "12" },
            { s: "div p span", ans: "3" },
            { s: "#header", ans: "100" }
          ];
          const sorted = [...selectors].sort(() => Math.random() - 0.5);
          
          return {
            language: "html-css" as const,
            question: `أي من المحددات (CSS Selectors) التالية يمتلك أعلى درجة خصوصية (Specificity) وسيتم تطبيق قواعده أولاً؟`,
            choices: sorted.map(s => s.s),
            answer: selectors.reduce((max, s) => parseInt(s.ans) > parseInt(max.ans) ? s : max, selectors[0]).s,
            hint: `الأوزان هي: المعرّف (ID) = 100، فئة التنسيق (Class) = 10، الوسم نفسه (Tag) = 1.`,
            explanation: `محددات الهوية ID تمتلك الخصوصية الأعلى (100). المحدّد الفائز هو المحدّد المحتوي على ID والفئة.`
          };
        },
        // 2. Box model calculation
        () => {
          const width = [100, 150, 200, 250][Math.floor(Math.random() * 4)];
          const padding = [5, 10, 15, 20][Math.floor(Math.random() * 4)];
          const border = [1, 2, 5][Math.floor(Math.random() * 3)];
          
          const code = `.box {\n  width: ${width}px;\n  padding: ${padding}px;\n  border: ${border}px solid black;\n  box-sizing: content-box;\n}`;
          const question = "باستخدام نموذج الصندوق الافتراضي (content-box)، ما هو العرض الكلي الفعلي (Total Width) للمركب بالبكسل؟";
          
          const totalWidth = width + 2 * padding + 2 * border;
          const answer = `${totalWidth}px`;
          const choices = [
            answer,
            `${width}px`,
            `${width + padding + border}px`,
            `${width + 2 * padding}px`
          ];
          
          return {
            language: "html-css" as const,
            question,
            code,
            answer,
            choices: Array.from(new Set(choices)),
            hint: `العرض الكلي = العرض الأساسي + (الحشوة الجانبية * 2) + (الإطار * 2).`,
            explanation: `الحساب الفعلي: ${width} + (2 * ${padding}) + (2 * ${border}) = ${totalWidth}px.`
          };
        },
        // 3. Tag purpose
        () => {
          const tags = [
            { tag: "<ol>", label: "قائمة مرتبة بأرقام (Ordered List)", wrong: ["<ul>", "<dl>", "<li>"] },
            { tag: "<a>", label: "رابط تشعبي (Hyperlink)", wrong: ["<link>", "<href>", "<nav>"] },
            { tag: "<img>", label: "إدراج صورة (Image)", wrong: ["<picture>", "<src>", "<figure>"] },
            { tag: "<table>", label: "جدول بيانات (Table)", wrong: ["<grid>", "<form>", "<list>"] },
            { tag: "<article>", label: "محتوى مستقل ومكتمل بذاته (Article)", wrong: ["<section>", "<div>", "<aside>"] }
          ];
          
          const chosen = tags[Math.floor(Math.random() * tags.length)];
          const choices = [chosen.tag, ...chosen.wrong].sort(() => Math.random() - 0.5);
          
          return {
            language: "html-css" as const,
            question: `أي وسم HTML كودي (Tag) يستخدم لإنشاء: ${chosen.label}؟`,
            choices,
            answer: chosen.tag,
            hint: `ابحث عن الاختصار الحرفي القياسي لـ ${chosen.label}.`,
            explanation: `الوسم ${chosen.tag} هو الوسم القياسي المعتمد لإنشاء ${chosen.label}.`
          };
        }
      ];
      
      const chosenTemplate = templates[Math.floor(Math.random() * templates.length)];
      const q = chosenTemplate();
      const key = `html-${q.question.substring(0, 30)}-${q.code ? q.code.replace(/\s+/g, "") : ""}`;
      if (usedQuestions.has(key)) continue;
      usedQuestions.add(key);
      return q;
    }
  }
  
  return {
    language: "javascript",
    question: "ما هي القيمة المطبوعة؟",
    code: "console.log(2 + 2);",
    choices: ["2", "4", "22", "8"],
    answer: "4",
    hint: "عملية جمع عادية للرقمين 2 و 2.",
    explanation: "حاصل جمع 2 + 2 هو 4."
  };
}

/* ─── Level Badge Component ────────────────────────────────────────────── */
const TOTAL_Q = 10;
const BASE_TIMERS = { easy: 24, medium: 18, hard: 12 };
const DIFF_LABEL: Record<Difficulty, string> = { easy: "سهل", medium: "متوسط", hard: "صعب" };
const DIFF_COLOR: Record<Difficulty, string> = { easy: "#1D9E75", medium: "#EF9F27", hard: "#D4537E" };

function LevelBadge({ level, anim }: { level: number; anim: boolean }) {
  const diff = levelToDifficulty(level);
  return (
    <div className="flex items-center gap-2">
      <div className={`flex items-center gap-1 px-3 py-1 rounded-full text-xs font-black text-white transition-all ${anim ? "scale-125" : ""}`}
        style={{ background: DIFF_COLOR[diff] }}>
        Lv.{level}
        {anim && <span className="mr-1">⬆️</span>}
      </div>
    </div>
  );
}

/* ─── Cognitive Coding Arena Game Component ────────────────────────────── */
function CognitiveArenaGame({ onFinish, isAdaptive }: { onFinish: () => void; isAdaptive: boolean }) {
  const [diff, setDiff] = useState<Difficulty>(() => getRecommendedDifficulty("coding"));
  const startLevel = difficultyToStartLevel(diff);
  const [level, setLevel] = useState(startLevel);
  const [levelAnim, setLevelAnim] = useState(false);
  const [state, setState] = useState<"idle" | "playing" | "result">("idle");
  
  const usedQuestionsRef = useRef<Set<string>>(new Set());
  const [q, setQ] = useState<CodingQuestion | null>(null);
  const [qIdx, setQIdx] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [correct, setCorrect] = useState(0);
  const [showHint, setShowHint] = useState(false);
  const [timerPct, setTimerPct] = useState(100);
  const [result, setResult] = useState<{ correct: number; sessionScore: number; newIQ: number } | null>(null);
  
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const advRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  
  const totalMsRef = useRef(0);
  const tStartRef = useRef(0);
  const correctRef = useRef(0);
  const streakRef = useRef(0);
  const maxStreakRef = useRef(0);
  const levelsRef = useRef<number[]>([]);
  const levelRef = useRef(startLevel);

  const clear = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (advRef.current) clearTimeout(advRef.current);
  };

  const nextQ = useCallback((idx: number) => {
    if (idx >= TOTAL_Q) {
      const avgLevel = levelsRef.current.reduce((a, b) => a + b, 0) / levelsRef.current.length;
      const gameResult: GameResult = {
        correct: correctRef.current,
        total: TOTAL_Q,
        totalTimeMs: totalMsRef.current,
        avgLevel,
        maxStreak: maxStreakRef.current,
        difficulty: levelToDifficulty(levelRef.current),
      };
      const res = updateIQ("coding", gameResult);
      setResult({ correct: correctRef.current, sessionScore: res.sessionScore, newIQ: res.newOverallIQ });
      setState("result");
      onFinish();
      return;
    }
    
    const cur = levelRef.current;
    levelsRef.current.push(cur);
    const secs = levelToTimer(cur, BASE_TIMERS);
    
    setQ(genCodingQ(cur, usedQuestionsRef.current));
    setSelected(null);
    setShowHint(false);
    setQIdx(idx);
    setTimerPct(100);
    
    let elapsed = 0;
    timerRef.current = setInterval(() => {
      elapsed += 100;
      setTimerPct(Math.max(0, 100 - (elapsed / (secs * 1000)) * 100));
      if (elapsed >= secs * 1000) {
        clearInterval(timerRef.current!);
        vibrate("wrong");
        levelRef.current = Math.max(1, levelRef.current - 1);
        setLevel(levelRef.current);
        setSelected("__timeout__");
        const now = Date.now();
        totalMsRef.current += now - tStartRef.current;
        tStartRef.current = now;
        streakRef.current = 0;
        advRef.current = setTimeout(() => nextQ(idx + 1), 1500);
      }
    }, 100);
    tStartRef.current = Date.now();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onFinish]);

  const start = () => {
    clear();
    usedQuestionsRef.current.clear();
    correctRef.current = 0;
    streakRef.current = 0;
    maxStreakRef.current = 0;
    levelsRef.current = [];
    totalMsRef.current = 0;
    const startLvl = difficultyToStartLevel(diff);
    levelRef.current = startLvl;
    setLevel(startLvl);
    setCorrect(0);
    setResult(null);
    setState("playing");
    nextQ(0);
  };

  const answer = useCallback((ch: string) => {
    if (selected) return;
    clear();
    setSelected(ch);
    const now = Date.now();
    totalMsRef.current += now - tStartRef.current;
    
    const curLevel = levelRef.current;
    const secs = levelToTimer(curLevel, BASE_TIMERS);
    const timeUsedPct = (now - tStartRef.current) / (secs * 1000);
    
    const ok = ch === q?.answer;
    const newC = correctRef.current + (ok ? 1 : 0);
    correctRef.current = newC;
    setCorrect(newC);
    
    const newStr = ok ? streakRef.current + 1 : 0;
    streakRef.current = newStr;
    maxStreakRef.current = Math.max(maxStreakRef.current, newStr);
    vibrate(ok ? (newStr >= 3 ? "streak" : "correct") : "wrong");

    const prevLvl = levelRef.current;
    if (ok && timeUsedPct < 0.45 && levelRef.current < 10) {
      levelRef.current = Math.min(10, levelRef.current + 1);
      setLevel(levelRef.current);
      if (levelRef.current > prevLvl) {
        setLevelAnim(true);
        setTimeout(() => setLevelAnim(false), 800);
        vibrate("levelup");
      }
    } else if (!ok && levelRef.current > 1) {
      levelRef.current = Math.max(1, levelRef.current - 1);
      setLevel(levelRef.current);
    }
    
    advRef.current = setTimeout(() => nextQ(qIdx + 1), 2200);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, q, qIdx, nextQ]);

  useEffect(() => () => clear(), []);

  if (state === "idle") return (
    <div className="rounded-[2rem] p-8 text-center bg-white dark:bg-gray-800 shadow-xl border border-gray-100 dark:border-gray-700 max-w-2xl mx-auto">
      <div className="text-6xl mb-4">💻</div>
      <h3 className="text-2xl font-black text-gray-900 dark:text-white mb-2">حلبة التحدي البرمجي المعرفي</h3>
      <p className="text-gray-500 dark:text-gray-400 text-sm mb-4 leading-relaxed">
        تحدي ذكاء برمجي يتكون من 10 أسئلة برمجية تفاعلية. الأسئلة تكتشف مهارات المنطق وحل المشكلات في لغات JavaScript و Python وتنسيقات الويب.
      </p>
      <p className="text-xs text-indigo-500 font-bold mb-6">
        المستويات تتعدل تلقائياً (1–10) بناءً على سرعة إجابتك وصحتها! ⚡
      </p>
      
      {!isAdaptive && (
        <div className="flex gap-3 justify-center mb-6">
          {(["easy", "medium", "hard"] as Difficulty[]).map(d => (
            <button key={d} onClick={() => setDiff(d)} className="px-5 py-2.5 rounded-xl text-sm font-black transition-all"
              style={{ background: diff === d ? DIFF_COLOR[d] : "#F1F5F9", color: diff === d ? "#fff" : "#475569", border: `2px solid ${diff === d ? DIFF_COLOR[d] : "#E2E8F0"}` }}>
              {DIFF_LABEL[d]}
            </button>
          ))}
        </div>
      )}
      {isAdaptive && (
        <p className="text-xs py-3 px-4 rounded-xl bg-purple-50 text-purple-600 font-bold border border-purple-200 mb-6 inline-block">
          تم تفعيل صعوبة البداية التلقائية بناءً على مستواك الحالي: {DIFF_LABEL[diff]} ⚡
        </p>
      )}
      
      <button onClick={start} className="w-full py-4 bg-gradient-to-r from-indigo-500 to-purple-600 text-white font-black rounded-2xl text-lg shadow-lg shadow-indigo-500/20 hover:opacity-90 transition-opacity">ابدأ التحدي</button>
    </div>
  );

  if (state === "result" && result) return (
    <div className="rounded-[2rem] p-8 text-center bg-white dark:bg-gray-800 shadow-xl border border-gray-100 dark:border-gray-700 max-w-2xl mx-auto">
      <div className="text-6xl mb-4">{result.correct >= 8 ? "🏆" : result.correct >= 5 ? "⭐" : "💪"}</div>
      <h3 className="text-2xl font-black text-gray-900 dark:text-white mb-2">{result.correct}/{TOTAL_Q} صحيح</h3>
      <p className="text-xs text-gray-500 mb-4">أعلى مستوى وصلت له: Lv.{Math.max(...levelsRef.current)}</p>
      
      <div className="rounded-2xl p-5 my-6 bg-indigo-50 dark:bg-indigo-950/20 border border-indigo-200/50">
        <div className="text-xs font-bold text-indigo-600 mb-1">نقاط الجلسة المكتسبة</div>
        <div className="text-4xl font-black text-indigo-600">{result.sessionScore.toLocaleString("ar-EG")}</div>
        <div className="text-xs text-gray-500 dark:text-gray-400 mt-2">معدل IQ الكلي الجديد: <strong>{result.newIQ}</strong></div>
      </div>
      
      <GameFeedback
        subject="coding"
        correctAnswers={result.correct}
        totalQuestions={TOTAL_Q}
        totalTimeMs={totalMsRef.current}
        maxLevel={levelsRef.current.length > 0 ? Math.max(...levelsRef.current) : 1}
        maxStreak={maxStreakRef.current}
        difficulty={levelToDifficulty(levelRef.current)}
        autoLoad
      />
      
      <div className="flex gap-4 mt-6">
        <button onClick={start} className="flex-1 py-3.5 bg-gradient-to-r from-indigo-500 to-purple-600 text-white font-black rounded-xl hover:opacity-90 transition-opacity">العب مجدداً</button>
        <button onClick={onFinish} className="flex-1 py-3.5 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-white font-black rounded-xl border border-gray-200 dark:border-gray-600">العودة للرئيسية</button>
      </div>
    </div>
  );

  return (
    <div className="max-w-2xl mx-auto bg-white dark:bg-gray-800 rounded-3xl p-6 shadow-xl border border-gray-100 dark:border-gray-700">
      {/* Timer Progress */}
      <div className="h-2 rounded-full mb-4 overflow-hidden bg-gray-100 dark:bg-gray-700">
        <div className="h-full rounded-full transition-all duration-100" style={{ width: `${timerPct}%`, background: timerPct > 50 ? "#1D9E75" : timerPct > 20 ? "#EF9F27" : "#D4537E" }} />
      </div>
      
      {/* Stats */}
      <div className="flex justify-between items-center mb-4">
        <LevelBadge level={level} anim={levelAnim} />
        <span className="text-xs font-bold text-gray-500">{qIdx + 1}/{TOTAL_Q}</span>
        <span className="text-xs font-bold text-emerald-500">✅ {correct}</span>
      </div>

      {q && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <span className="text-xs font-black text-indigo-500 uppercase tracking-wider">{q.language === "html-css" ? "HTML & CSS" : q.language}</span>
            <button onClick={() => setShowHint(!showHint)} className="px-3 py-1 bg-yellow-50 text-yellow-700 border border-yellow-200 rounded-lg text-xs font-bold shrink-0">
              💡 تلميح
            </button>
          </div>
          
          <h4 className="text-lg font-bold text-gray-900 dark:text-white leading-relaxed">{q.question}</h4>
          
          {showHint && (
            <motion.p className="text-xs p-3 rounded-xl bg-yellow-50/50 text-yellow-800 border border-yellow-100 leading-relaxed" initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }}>
              💡 {q.hint}
            </motion.p>
          )}

          {q.code && (
            <pre className="bg-gray-950 text-gray-100 rounded-xl p-4 font-mono text-sm overflow-x-auto text-left leading-relaxed my-4 border border-gray-900" dir="ltr">
              <code>{q.code}</code>
            </pre>
          )}

          {selected && q.explanation && (
            <motion.div className="text-xs p-3 rounded-xl bg-green-50 text-green-700 border border-green-100 leading-relaxed" initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }}>
              <strong>التفسير العلمي للحل:</strong> {q.explanation}
            </motion.div>
          )}
        </div>
      )}

      {/* Choices Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-6">
        {q?.choices.map(ch => {
          const isSel = selected === ch;
          const isAns = selected !== null && ch === q.answer;
          const isWrong = isSel && ch !== q.answer;
          return (
            <button key={ch} onClick={() => answer(ch)} disabled={!!selected}
              className="py-4 px-5 rounded-2xl text-sm font-black transition-all active:scale-95 leading-snug text-right sm:text-center"
              style={{
                minHeight: 56,
                background: isAns ? "#1D9E75" : isWrong ? "#D4537E" : "#F8FAFC",
                color: (isAns || isWrong) ? "#fff" : "#1E293B",
                border: `2px solid ${isAns ? "#1D9E75" : isWrong ? "#D4537E" : "#E2E8F0"}`
              }}>
              <span className="font-mono">{ch}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ─── Main Programming Environment Page ────────────────────────────────── */
export default function ProgrammingPage() {
  const [user, setUser] = useState<MeUser | null>(null);
  const [tab, setTab] = useState<"sandboxes" | "arena" | "curriculum">("sandboxes");
  const [iqData, setIqData] = useState<IQData>(() => getIQData());
  const [isAdaptive, setIsAdaptive] = useState(false);

  useEffect(() => {
    fetchMeWithRetry(2, 100).then(me => setUser(me)).catch(() => {});

    if (new URLSearchParams(window.location.search).get("tab") === "curriculum") {
      setTab("curriculum");
    }
    
    // Fetch adaptive difficulty setting from server
    fetch("/api/student/iq")
      .then(res => res.json())
      .then(data => {
        if (data && data.isAdaptive) {
          setIsAdaptive(true);
        }
      })
      .catch(() => {});
  }, []);

  const refreshIQ = () => setIqData(getIQData());
  const skills = SUBJECT_SKILLS["coding"] || ["problemsolving", "logical"];

  return (
    <ProfileGuard>
      <div className="flex flex-col min-h-screen bg-gray-50 dark:bg-gray-950">
        <Navbar user={user ? { name: user.name, role: user.role } : null} />
        <main className="flex-1 max-w-7xl mx-auto w-full px-3 sm:px-6 lg:px-8 py-3 sm:py-8 pb-36 sm:pb-16">
          
          {/* Header */}
          <motion.div
            className="mb-4 sm:mb-8 flex flex-wrap justify-between items-center gap-3 sm:gap-4"
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <div>
              <Link
                href="/environments"
                className="inline-flex items-center gap-1.5 text-xs sm:text-sm text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white mb-1.5 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                العودة للبيئات
              </Link>
              <div className="flex items-center gap-2.5 sm:gap-3">
                <div className="text-3xl sm:text-4xl">💻</div>
                <div>
                  <h1 className="text-xl sm:text-3xl font-black text-gray-900 dark:text-white">البرمجة</h1>
                  <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">اختر لغة البرمجة أو اختبر معلوماتك في المنهج</p>
                </div>
              </div>
            </div>

            <div className="flex gap-1.5 sm:gap-2 items-center flex-wrap">
              {skills.map(sk => (
                <span key={sk} className="px-2.5 py-1 rounded-full text-[11px] sm:text-xs font-bold"
                  style={{ background: SKILL_COLORS[sk as keyof typeof SKILL_COLORS] + "22", color: SKILL_COLORS[sk as keyof typeof SKILL_COLORS] }}>
                  {SKILL_LABELS[sk as keyof typeof SKILL_LABELS]} {iqData.skills[sk as keyof typeof SKILL_LABELS]?.score || 1000}
                </span>
              ))}
              <Link href="/environments/iq" className="px-2.5 py-1 rounded-full text-[11px] sm:text-xs font-bold bg-indigo-100 text-indigo-600">
                🧠 {iqData.overallIQ}
              </Link>
            </div>
          </motion.div>

          {/* Navigation Tabs */}
          <div className="flex w-full max-w-2xl gap-1 sm:gap-2 overflow-x-auto mb-4 sm:mb-8 p-1 sm:p-1.5 rounded-2xl bg-gray-200/50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 mx-auto sm:mx-0 scrollbar-none">
            {([["sandboxes", "💻 المحررات"], ["arena", "🏆 حلبة التحدي"], ["curriculum", "📚 أسئلة المنهج"]] as const).map(([id, label]) => (
              <button key={id} onClick={() => setTab(id)}
                className="min-h-[42px] sm:min-h-11 flex-1 shrink-0 px-2.5 sm:px-3 py-2 sm:py-2.5 text-xs sm:text-sm font-black rounded-xl transition-all focus:outline-none focus:ring-4 focus:ring-sky-400/30 whitespace-nowrap cursor-pointer"
                style={{ background: tab === id ? "#fff" : "transparent", color: tab === id ? "#1E293B" : "#64748B", boxShadow: tab === id ? "0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06)" : "none" }}>
                {label}
              </button>
            ))}
          </div>

          <AnimatePresence mode="wait">
            {tab === "sandboxes" && (
              <motion.div
                key="sandboxes"
                className="grid grid-cols-1 md:grid-cols-3 gap-8"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                transition={{ duration: 0.3 }}
              >
                {LANGUAGES.map((lang, index) => (
                  <motion.div
                    key={lang.id}
                    initial={{ opacity: 0, y: 30 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5, delay: index * 0.1 }}
                    whileHover={{ y: -6 }}
                  >
                    <Link href={`/environments/programming/${lang.id}`}>
                      <div className="h-full bg-white dark:bg-gray-800 rounded-3xl overflow-hidden shadow-xl hover:shadow-2xl transition-all duration-300 border border-gray-100 dark:border-gray-700">
                        <div className={`h-32 bg-gradient-to-br ${lang.color} relative overflow-hidden`}>
                          <div className="absolute inset-0 opacity-20">
                            <div className="absolute inset-0" style={{
                              backgroundImage: `radial-gradient(circle at 2px 2px, white 1px, transparent 0)`,
                              backgroundSize: '20px 20px'
                            }} />
                          </div>
                          <div className="relative h-full flex items-center justify-center">
                            <motion.div
                              className="text-6xl"
                              whileHover={{ scale: 1.15, rotate: 5 }}
                              transition={{ type: "spring", stiffness: 300 }}
                            >
                              {lang.icon}
                            </motion.div>
                          </div>
                        </div>

                        <div className="p-6">
                          <h3 className="text-2xl font-black text-gray-900 dark:text-white mb-2">{lang.name}</h3>
                          <p className="text-gray-500 dark:text-gray-400 text-sm mb-4">{lang.description}</p>
                          
                          <div className="space-y-2 mb-6">
                            {lang.features.map((feature, i) => (
                              <div key={i} className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
                                <div className="w-1.5 h-1.5 bg-green-500 rounded-full" />
                                {feature}
                              </div>
                            ))}
                          </div>

                          <motion.button
                            className="w-full py-3 bg-gradient-to-r from-gray-900 to-gray-700 dark:from-white dark:to-gray-200 text-white dark:text-gray-900 font-bold rounded-xl hover:opacity-90 transition-opacity"
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                          >
                            ابدأ التطوير
                          </motion.button>
                        </div>
                      </div>
                    </Link>
                  </motion.div>
                ))}
              </motion.div>
            )}

            {tab === "arena" && (
              <motion.div
                key="arena"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                transition={{ duration: 0.3 }}
              >
                <CognitiveArenaGame onFinish={refreshIQ} isAdaptive={isAdaptive} />
              </motion.div>
            )}

            {tab === "curriculum" && (
              <motion.div
                key="curriculum"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                transition={{ duration: 0.2 }}
              >
                <div className="mb-3.5 sm:mb-5 rounded-2xl sm:rounded-3xl border border-teal-500/20 bg-slate-950/80 p-3.5 sm:p-6 text-right shadow-xl" dir="rtl">
                  <div className="flex flex-wrap items-center justify-between gap-2.5">
                    <div className="flex items-center gap-2.5">
                      <span className="inline-flex items-center rounded-full border border-teal-300/30 bg-teal-400/10 px-2.5 py-0.5 text-[10px] sm:text-xs font-black text-teal-200">منهج 2026 الرسمي</span>
                      <h2 className="text-base sm:text-xl font-black text-white">أسئلة برمجة المنهج الوزاري</h2>
                    </div>
                    <span className="hidden sm:inline-block rounded-xl bg-slate-900 px-3 py-1 text-xs font-bold text-slate-300">اختيار من متعدد · شرح وتفسير فوري</span>
                  </div>
                </div>
                <CurriculumPractice />
              </motion.div>
            )}
          </AnimatePresence>
        </main>
        <Footer />
      </div>
    </ProfileGuard>
  );
}
