import { createHash, randomBytes } from "crypto";

export type ChoiceLetter = "A" | "B" | "C" | "D";

/**
 * Saved on the attempt. `choices[questionId]` is the original letters in display order.
 * `pool` means questionIds is this student's draw from a larger bank: only
 * those questions are shown and graded.
 */
export type AttemptPresentation = {
  questionIds: string[];
  choices: Record<string, string>;
  pool?: boolean;
};

export type PresentationOptions = {
  shuffleQuestions?: boolean;
  shuffleChoices?: boolean;
  /** Draw this many questions per student. Null/0/>= bank size = all. */
  pick?: number | null;
};

type OptionCarrier = {
  id?: string;
  questionId?: string;
  questionType?: string | null;
  optionA?: string | null;
  optionB?: string | null;
  optionC?: string | null;
  optionD?: string | null;
  correctAnswer?: string | null;
  yourAnswer?: string | null;
  selectedAnswer?: string | null;
};

const LETTERS: ChoiceLetter[] = ["A", "B", "C", "D"];

function itemId(item: OptionCarrier): string {
  return item.id || item.questionId || "";
}

function hashSeed(key: string): number {
  return parseInt(createHash("sha256").update(key).digest("hex").slice(0, 8), 16);
}

function mulberry32(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(items: T[], random: () => number): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    const swap = copy[i];
    copy[i] = copy[j];
    copy[j] = swap;
  }
  return copy;
}

function filledLetters(item: OptionCarrier): ChoiceLetter[] {
  return LETTERS.filter((letter) => String(item[`option${letter}`] ?? "").trim());
}

export function parsePresentation(raw: string | null | undefined): AttemptPresentation | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as AttemptPresentation;
    if (!parsed || !Array.isArray(parsed.questionIds) || !parsed.choices || typeof parsed.choices !== "object") {
      return null;
    }
    return { questionIds: parsed.questionIds, choices: parsed.choices, ...(parsed.pool ? { pool: true } : {}) };
  } catch {
    return null;
  }
}

export function newQuizSeed(studentId: string, quizId: string): string {
  return `${studentId}|${quizId}|${randomBytes(8).toString("hex")}`;
}

/** Random per attempt: a retake must not repeat the order the student already saw with answers. */
export function homeworkSeed(studentId: string, homeworkId: string, retake: boolean): string {
  return `${studentId}|${homeworkId}|${retake ? "retake" : "attempt"}|${randomBytes(8).toString("hex")}`;
}

export function identityPresentation(questions: OptionCarrier[]): AttemptPresentation {
  return {
    questionIds: questions.map((question) => itemId(question)).filter(Boolean),
    choices: Object.fromEntries(questions.map((question) => [itemId(question), "ABCD"])),
  };
}

export function buildPresentation(
  seedKey: string,
  questions: OptionCarrier[],
  options: PresentationOptions = {}
): AttemptPresentation {
  const { shuffleQuestions = true, shuffleChoices = true, pick = null } = options;
  const random = mulberry32(hashSeed(seedKey));
  const allIds = questions.map((question) => itemId(question)).filter(Boolean);
  const drawing = !!pick && pick > 0 && pick < allIds.length;
  let questionIds = shuffleQuestions || drawing ? shuffle(allIds, random) : allIds;
  if (drawing) {
    const chosen = new Set(questionIds.slice(0, pick));
    // Without question shuffling the drawn subset keeps the teacher's order.
    questionIds = shuffleQuestions ? questionIds.slice(0, pick) : allIds.filter((id) => chosen.has(id));
  }
  const inAttempt = new Set(questionIds);
  const choices: Record<string, string> = {};
  for (const question of questions) {
    const id = itemId(question);
    if (!id || !inAttempt.has(id)) continue;
    if (question.questionType === "essay" || !shuffleChoices) {
      choices[id] = "ABCD";
      continue;
    }
    const filled = filledLetters(question);
    choices[id] = filled.length > 1 ? shuffle(filled, random).join("") : filled.join("") || "ABCD";
  }
  return drawing ? { questionIds, choices, pool: true } : { questionIds, choices };
}

/** The questions that count for this attempt: the drawn subset for a pool, else all. */
export function questionsInAttempt<T extends { id: string }>(
  questions: T[],
  presentation: AttemptPresentation | null
): T[] {
  if (!presentation?.pool) return questions;
  const ids = new Set(presentation.questionIds);
  return questions.filter((question) => ids.has(question.id));
}

export function displayToOriginal(map: string | undefined, letter: string): string {
  const display = letter.trim().toUpperCase();
  if (!map) return display;
  const index = LETTERS.indexOf(display as ChoiceLetter);
  if (index < 0 || index >= map.length) return display;
  return map[index] || display;
}

export function originalToDisplay(map: string | undefined, letter: string): string {
  const original = letter.trim().toUpperCase();
  if (!map) return original;
  const index = map.indexOf(original);
  if (index < 0) return original;
  return LETTERS[index] || original;
}

function remapItem<T extends OptionCarrier>(item: T, map: string | undefined): T {
  if (!map || item.questionType === "essay") return item;
  const next = { ...item };
  for (let i = 0; i < LETTERS.length; i += 1) {
    const source = map[i] as ChoiceLetter | undefined;
    const key = `option${LETTERS[i]}` as const;
    next[key] = source ? (item[`option${source}`] ?? "") : "";
  }
  if (next.correctAnswer) next.correctAnswer = originalToDisplay(map, next.correctAnswer);
  if (next.yourAnswer) next.yourAnswer = originalToDisplay(map, next.yourAnswer);
  if (next.selectedAnswer) next.selectedAnswer = originalToDisplay(map, next.selectedAnswer);
  return next;
}

/** Reorders questions and rewrites A/B/C/D into the order this student sees. */
export function presentStudentView<T extends OptionCarrier>(
  items: T[],
  presentation: AttemptPresentation | null
): T[] {
  if (!presentation) return items;
  const byId = new Map(items.map((item) => [itemId(item), item]));
  const ordered: T[] = [];
  const seen = new Set<string>();
  for (const id of presentation.questionIds) {
    const item = byId.get(id);
    if (!item) continue;
    seen.add(id);
    ordered.push(remapItem(item, presentation.choices[id]));
  }
  // A question added after the attempt opened is shown at the end, except in
  // a pool draw, where the student only gets the questions they drew.
  if (presentation.pool) return ordered;
  for (const item of items) {
    const id = itemId(item);
    if (seen.has(id)) continue;
    ordered.push(item);
  }
  return ordered;
}

export function answersToOriginal(
  answers: Record<string, string>,
  presentation: AttemptPresentation | null
): Record<string, string> {
  if (!presentation) return answers;
  const original: Record<string, string> = {};
  for (const [questionId, letter] of Object.entries(answers)) {
    if (typeof letter !== "string") continue;
    original[questionId] = displayToOriginal(presentation.choices[questionId], letter);
  }
  return original;
}

export function answersToDisplay(raw: string | null | undefined, presentation: AttemptPresentation | null): string | null {
  if (!raw || !presentation) return raw ?? null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return raw;
    const display: Record<string, string> = {};
    for (const [questionId, letter] of Object.entries(parsed)) {
      if (typeof letter !== "string") continue;
      display[questionId] = originalToDisplay(presentation.choices[questionId], letter);
    }
    return JSON.stringify(display);
  } catch {
    return raw;
  }
}
