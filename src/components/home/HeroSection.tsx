"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  AnimatePresence,
  MotionConfig,
  motion,
  useMotionTemplate,
  useReducedMotion,
  useSpring,
  type Variants,
} from "framer-motion";
import { useCanHover } from "@/lib/motion";

const EASE: [number, number, number, number] = [0.16, 1, 0.3, 1];

const ROTATING_SUBJECTS = ["برمجه عملي", "برمجه نظري", "مشاريع برمجه"];

const GRADE_SHORTCUTS = [
  { stage: "sec_1", label: "أولى بكالوريا" },
  { stage: "sec_2", label: "ثانية بكالوريا" },
];

const stagger: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.09, delayChildren: 0.08 } },
};

const rise: Variants = {
  hidden: { opacity: 0, y: 22 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.65, ease: EASE } },
};

interface HeroSectionProps {
  isLoggedIn: boolean;
  subtitle?: string;
}

const DEFAULT_SUBTITLE =
  "منصة تعليمية متكاملة مصممة خصيصاً للمتعلمين المصريين — مسارات تفاعلية، مشاريع عملية، ومتابعة شخصية مستمرة.";

export function HeroSection({ isLoggedIn, subtitle }: HeroSectionProps) {
  const canHover = useCanHover();
  const reduced = useReducedMotion();

  const spotX = useSpring(0, { stiffness: 140, damping: 26, mass: 0.6 });
  const spotY = useSpring(0, { stiffness: 140, damping: 26, mass: 0.6 });
  const spotOpacity = useSpring(0, { stiffness: 120, damping: 30 });
  const spotlight = useMotionTemplate`radial-gradient(640px circle at ${spotX}px ${spotY}px, rgba(14,110,98,0.13), transparent 70%)`;

  const trackSpotlight = (e: React.PointerEvent<HTMLElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    spotX.set(e.clientX - r.left);
    spotY.set(e.clientY - r.top);
  };
  const wakeSpotlight = (e: React.PointerEvent<HTMLElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    spotX.jump(e.clientX - r.left);
    spotY.jump(e.clientY - r.top);
    spotOpacity.set(1);
  };

  const [subjectIndex, setSubjectIndex] = useState(0);

  useEffect(() => {
    if (reduced) return;
    const id = window.setInterval(
      () => setSubjectIndex((i) => (i + 1) % ROTATING_SUBJECTS.length),
      2600,
    );
    return () => window.clearInterval(id);
  }, [reduced]);

  const subject = ROTATING_SUBJECTS[subjectIndex];
  const spotlightEnabled = canHover && !reduced;

  return (
    <MotionConfig reducedMotion="user">
      <section
        className="relative overflow-hidden hero-bg md:min-h-[86vh] flex items-center justify-center pt-14 pb-16 md:pt-20 md:pb-28"
        onPointerMove={spotlightEnabled ? trackSpotlight : undefined}
        onPointerEnter={spotlightEnabled ? wakeSpotlight : undefined}
        onPointerLeave={spotlightEnabled ? () => spotOpacity.set(0) : undefined}
      >
        {/* Background layers */}
        <div className="absolute inset-0 pointer-events-none" aria-hidden>
          <div className="absolute inset-0 hero-grid bg-[size:56px_56px] [mask-image:radial-gradient(ellipse_75%_65%_at_50%_38%,black_25%,transparent_78%)]" />
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full md:w-[800px] h-[400px] md:h-[600px]"
            style={{ background: "radial-gradient(ellipse at top, rgba(14,110,98,.15), transparent 70%)" }} />
          <div className="noise" />
          <div className="absolute bottom-0 inset-x-0 h-px" style={{ background: "linear-gradient(to right, transparent, rgba(14,110,98,.2), transparent)" }} />
        </div>

        {spotlightEnabled && (
          <motion.div
            aria-hidden
            className="absolute inset-0 z-[1] pointer-events-none"
            style={{ background: spotlight, opacity: spotOpacity }}
          />
        )}

        <motion.div
          variants={stagger}
          initial="hidden"
          animate="visible"
          className="relative z-10 max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 w-full text-center flex flex-col items-center"
        >
          {/* Status pill — glowing green dot + fire emoji */}
          <motion.div
            variants={rise}
            className="inline-flex items-center gap-2.5 px-5 py-2 rounded-full text-xs md:text-sm font-semibold mb-8 md:mb-10 backdrop-blur-md cursor-default select-none"
            style={{ background: "var(--brand-soft)", border: "1px solid rgba(14,110,98,.3)", color: "var(--brand)" }}
          >
            <span className="relative flex w-2.5 h-2.5 shrink-0" aria-hidden>
              <span className="motion-reduce:hidden animate-ping absolute inline-flex h-full w-full rounded-full opacity-40" style={{ background: "var(--brand)" }} />
              <span className="relative inline-flex w-2.5 h-2.5 rounded-full" style={{ background: "var(--brand)" }} />
            </span>
            🔥 أكثر من ١٬٠٠٠ طالب يتعلمون معنا
          </motion.div>

          {/* Headline — gradient highlight on key phrase */}
          <motion.h1
            variants={rise}
            className="text-balance text-4xl sm:text-5xl md:text-[4.5rem] lg:text-[5rem] font-black tracking-tight leading-[1.2] md:leading-[1.15] mb-6 md:mb-7"
            style={{ color: "var(--ink)", fontFamily: "var(--font-head)" }}
          >
            كل ما تحتاجه{" "}
            <span style={{ color: "var(--brand)" }}>للتفوّق</span>
            <br />
            <span>في </span>
            <span className="sr-only">جميع مشاريع البرمجة</span>
            <span
              aria-hidden
              className="relative inline-grid overflow-hidden align-bottom pb-[0.1em] -mb-[0.1em]"
            >
              {ROTATING_SUBJECTS.map((s) => (
                <span key={s} className="invisible col-start-1 row-start-1 whitespace-nowrap px-1">{s}</span>
              ))}
              <AnimatePresence mode="popLayout" initial={false}>
                <motion.span
                  key={subject}
                  initial={{ y: "65%", opacity: 0 }}
                  animate={{ y: "0%", opacity: 1 }}
                  exit={{ y: "-65%", opacity: 0 }}
                  transition={{ duration: 0.5, ease: EASE }}
                  className="col-start-1 row-start-1 whitespace-nowrap px-1"
                  style={{ color: "var(--brand)" }}
                >
                  {subject}
                </motion.span>
              </AnimatePresence>
            </span>
          </motion.h1>

          {/* Subtitle */}
          <motion.p
            variants={rise}
            className="text-base md:text-lg mb-10 md:mb-12 leading-relaxed max-w-xl mx-auto font-medium px-2 text-pretty"
            style={{ color: "var(--ink-2)" }}
          >
            {subtitle || DEFAULT_SUBTITLE}
          </motion.p>

          {/* CTAs — Primary glowing "تصفح الكورسات", secondary login/signup */}
          <motion.div
            variants={rise}
            className="flex flex-col sm:flex-row gap-3 justify-center items-center w-full px-4 sm:px-0"
          >
            <MagneticArea className="w-full sm:w-auto">
              <Link
                href="/courses"
                id="hero-cta-browse"
                className="group relative min-h-14 px-8 py-4 font-bold rounded-full transition-colors text-base flex items-center justify-center gap-2 overflow-hidden w-full sm:w-auto hover:bg-[var(--brand-strong)]"
                style={{
                  background: "var(--brand)",
                  color: "var(--on-brand)",
                  boxShadow: "0 8px 28px -10px var(--brand-shadow)",
                }}
              >
                <span className="relative z-10">تصفح الكورسات</span>
                <svg className="relative z-10 w-4 h-4 transition-transform group-hover:-translate-x-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                </svg>
                <span aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden rounded-full">
                  <span className="absolute inset-y-0 left-[-45%] w-1/3 -skew-x-12 bg-gradient-to-r from-transparent via-white/30 to-transparent blur-sm transition-[left] duration-700 ease-out group-hover:left-[115%]" />
                </span>
              </Link>
            </MagneticArea>

            {!isLoggedIn && (
              <Link
                href="/signup"
                id="hero-cta-signup"
                className="px-8 py-4 font-bold rounded-full transition-all text-base flex items-center justify-center w-full sm:w-auto backdrop-blur-sm"
                style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--ink-2)" }}
              >
                ابدأ الآن مجاناً
              </Link>
            )}

            {isLoggedIn && (
              <Link
                href="/library"
                id="hero-cta-continue"
                className="px-8 py-4 font-bold rounded-full transition-all text-base flex items-center justify-center w-full sm:w-auto backdrop-blur-sm"
                style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--ink-2)" }}
              >
                متابعة التعلم
              </Link>
            )}
          </motion.div>

          {/* Grade shortcuts */}
          <motion.div
            variants={rise}
            className="flex flex-wrap items-center justify-center gap-2 mt-10 md:mt-12"
          >
            <span className="text-sm font-medium w-full text-center sm:w-auto sm:ml-1" style={{ color: "var(--ink-3)" }}>اختر صفك:</span>
            {GRADE_SHORTCUTS.map((g) => (
              <Link
                key={g.stage}
                href={`/courses?stage=${g.stage}`}
                id={`hero-grade-${g.stage}`}
                className="group/chip inline-flex items-center gap-1.5 px-4 py-3 rounded-full text-sm font-bold transition-all backdrop-blur-sm"
                style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--ink-2)", minHeight: 44 }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLElement).style.background = "var(--brand-soft)";
                  (e.currentTarget as HTMLElement).style.borderColor = "var(--brand)";
                  (e.currentTarget as HTMLElement).style.color = "var(--brand)";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLElement).style.background = "var(--surface)";
                  (e.currentTarget as HTMLElement).style.borderColor = "var(--border)";
                  (e.currentTarget as HTMLElement).style.color = "var(--ink-2)";
                }}
              >
                {g.label}
                <span aria-hidden className="transition-transform group-hover/chip:-translate-x-0.5" style={{ color: "var(--brand)" }}>←</span>
              </Link>
            ))}
          </motion.div>
        </motion.div>

        {/* Scroll indicator */}
        <div aria-hidden className="absolute bottom-8 left-1/2 -translate-x-1/2 hidden md:block animate-float-slow">
          <div className="w-6 h-10 rounded-full border-2 flex justify-center pt-2" style={{ borderColor: "var(--border-strong)" }}>
            <div className="w-1 h-2.5 rounded-full" style={{ background: "var(--ink-3)" }} />
          </div>
        </div>
      </section>
    </MotionConfig>
  );
}

function MagneticArea({ children, className }: { children: React.ReactNode; className?: string }) {
  const canHover = useCanHover();
  const reduced = useReducedMotion();
  const x = useSpring(0, { stiffness: 320, damping: 22, mass: 0.6 });
  const y = useSpring(0, { stiffness: 320, damping: 22, mass: 0.6 });

  const enabled = canHover && !reduced;

  const pull = (e: React.PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    x.set((e.clientX - r.left - r.width / 2) * 0.22);
    y.set((e.clientY - r.top - r.height / 2) * 0.22);
  };
  const release = () => { x.set(0); y.set(0); };

  return (
    <motion.div
      className={className}
      style={{ x, y }}
      onPointerMove={enabled ? pull : undefined}
      onPointerLeave={enabled ? release : undefined}
    >
      {children}
    </motion.div>
  );
}
