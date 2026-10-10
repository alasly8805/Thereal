import { randomInt } from "node:crypto";
import structure from "@/ai/knowledge/curriculum/curriculum_structure.json";

/**
 * Shared rules for the daily practice (التدريبات اليومية) feature.
 *
 * The question bank is written nightly by src/lib/practice-generate.ts; essays
 * are graded by src/lib/practice-grading.ts. Everything a student receives goes
 * through `publicQuestion` — bank provenance (source*) never leaves the server.
 */

export const MCQ_PER_DAY = 10;

/** Study track the student picks on first visit: عربي or لغات (English). */
export const PRACTICE_LANGUAGES = ["ar", "en"] as const;
export type PracticeLanguage = (typeof PRACTICE_LANGUAGES)[number];

export function parseLanguage(value: unknown): PracticeLanguage | null {
  return typeof value === "string" && (PRACTICE_LANGUAGES as readonly string[]).includes(value) ? (value as PracticeLanguage) : null;
}
export const ESSAY_PER_DAY = 10;
export const MAX_ESSAY_CHARS = 3000;

export const PRACTICE_POINTS = {
  MCQ_CORRECT: 2,
  ESSAY_CORRECT: 3,
  ESSAY_PARTIAL: 1,
  /** Every question in the set answered correctly. */
  PERFECT_BONUS: 10,
};

// ── Curriculum (المنهج) ──────────────────────────────────────────────────────

export interface CurriculumLesson {
  number: string; // "1-2"
  title: string;
  chapterTitle: string;
  term: number;
  order: number; // position in the book, 1-based
}

interface StructureFile {
  subject_ar: string;
  grade_ar: string;
  terms: Array<{
    term: number;
    chapters: Array<{ chapter_number: number; title: string }>;
    lessons: Array<{ chapter_number: number; lesson_number: string; title: string }>;
  }>;
}

function lessonsOf(file: StructureFile): CurriculumLesson[] {
  const out: CurriculumLesson[] = [];
  for (const term of file.terms) {
    const chapters = new Map(term.chapters.map((c) => [c.chapter_number, c.title]));
    for (const l of term.lessons) {
      out.push({
        number: l.lesson_number,
        title: l.title,
        chapterTitle: chapters.get(l.chapter_number) ?? "",
        term: term.term,
        order: out.length + 1,
      });
    }
  }
  return out;
}

/**
 * Stages that have an official curriculum file. Practice is only generated for
 * these — without the book there is nothing to arrange questions by. Add a
 * stage here when its curriculum is ingested.
 */
export const PRACTICE_CURRICULA: Record<string, { subject: string; grade: string; lessons: CurriculumLesson[] }> = {
  sec_2: {
    subject: (structure as StructureFile).subject_ar,
    grade: (structure as StructureFile).grade_ar,
    lessons: lessonsOf(structure as StructureFile),
  },
};

export function practiceStages(): string[] {
  return Object.keys(PRACTICE_CURRICULA);
}

export function lessonFor(stage: string, number: string): CurriculumLesson | null {
  return PRACTICE_CURRICULA[stage]?.lessons.find((l) => l.number === number) ?? null;
}

// ── Days ─────────────────────────────────────────────────────────────────────

/** Cairo calendar day, "YYYY-MM-DD". */
export function cairoDay(d: Date = new Date()): string {
  return d.toLocaleDateString("en-CA", { timeZone: "Africa/Cairo" });
}

export function cairoHour(d: Date = new Date()): number {
  return Number(d.toLocaleString("en-US", { timeZone: "Africa/Cairo", hour: "2-digit", hourCycle: "h23" }));
}

/** The question ids a student's attempt covers — their own list, or the shared set's for older attempts. */
export function attemptQuestionIds(attempt: { questionIds: string | null } | null | undefined, set: { questionIds: string }): string[] {
  return JSON.parse(attempt?.questionIds ?? set.questionIds) as string[];
}

// ── Choices ──────────────────────────────────────────────────────────────────

export const LETTERS = ["A", "B", "C", "D"] as const;

export interface BankQuestion {
  id: string;
  questionType: string;
  lessonNumber: string;
  lessonTitle: string;
  question: string;
  optionA: string;
  optionB: string;
  optionC: string;
  optionD: string;
}

export function optionsOf(q: Pick<BankQuestion, "optionA" | "optionB" | "optionC" | "optionD">): string[] {
  return [q.optionA, q.optionB, q.optionC, q.optionD];
}

/** Original option indexes in a random display order, skipping empty options. */
export function shuffledOrder(q: BankQuestion): number[] {
  const idx = optionsOf(q)
    .map((text, i) => (text.trim() ? i : -1))
    .filter((i) => i >= 0);
  for (let i = idx.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [idx[i], idx[j]] = [idx[j], idx[i]];
  }
  return idx;
}

export type Presentation = Record<string, number[]>;

export function parsePresentation(raw: string | null | undefined): Presentation {
  try {
    const v = JSON.parse(raw ?? "{}");
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Presentation) : {};
  } catch {
    return {};
  }
}

/** Display slot the student picked → original letter, or null if out of range. */
export function letterForSlot(order: number[] | undefined, slot: number): string | null {
  if (!order || !Number.isInteger(slot) || slot < 0 || slot >= order.length) return null;
  return LETTERS[order[slot]] ?? null;
}

/** Original letter → display slot for this student. */
export function slotForLetter(order: number[] | undefined, letter: string | null | undefined): number | null {
  if (!order || !letter) return null;
  const i = order.indexOf(LETTERS.indexOf(letter as (typeof LETTERS)[number]));
  return i >= 0 ? i : null;
}

/** The only shape of a bank question a student ever receives. */
export function publicQuestion(q: BankQuestion, order: number[] | undefined) {
  const opts = optionsOf(q);
  return {
    id: q.id,
    type: q.questionType === "essay" ? ("essay" as const) : ("mcq" as const),
    lesson: q.lessonNumber,
    lessonTitle: q.lessonTitle,
    question: q.question,
    options: q.questionType === "essay" ? [] : (order ?? []).map((i) => opts[i]),
  };
}

export function practicePoints(r: { mcqCorrect: number; essayCorrect: number; essayPartial: number; total: number }): number {
  let pts =
    r.mcqCorrect * PRACTICE_POINTS.MCQ_CORRECT +
    r.essayCorrect * PRACTICE_POINTS.ESSAY_CORRECT +
    r.essayPartial * PRACTICE_POINTS.ESSAY_PARTIAL;
  if (r.total > 0 && r.mcqCorrect + r.essayCorrect === r.total) pts += PRACTICE_POINTS.PERFECT_BONUS;
  return pts;
}
