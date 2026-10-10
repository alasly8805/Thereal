/**
 * Anti-cheating settings and signals for exam homework.
 *
 * Settings live on Homework and decide how each student's HomeworkExamView is
 * drawn (see attempt-presentation.ts). Signals are read-only hints for the
 * teacher: they never change a grade on their own.
 */

export type HomeworkIntegritySettings = {
  shuffleQuestions: boolean;
  shuffleChoices: boolean;
  questionsPerStudent: number | null;
  revealAnswers: boolean;
};

type SettingsInput = {
  shuffleQuestions?: unknown;
  shuffleChoices?: unknown;
  questionsPerStudent?: unknown;
  revealAnswers?: unknown;
};

/**
 * Only the keys present in `input` are returned, so PATCH can change one
 * switch at a time. `questionCount` bounds the bank draw when it is known.
 */
export function parseIntegritySettings(
  input: SettingsInput,
  questionCount: number | null
): { settings: Partial<HomeworkIntegritySettings>; error?: string } {
  const settings: Partial<HomeworkIntegritySettings> = {};
  for (const key of ["shuffleQuestions", "shuffleChoices", "revealAnswers"] as const) {
    if (input[key] === undefined) continue;
    if (typeof input[key] !== "boolean") return { settings, error: "قيمة إعداد غير صحيحة" };
    settings[key] = input[key] as boolean;
  }
  if (input.questionsPerStudent !== undefined) {
    const raw = input.questionsPerStudent;
    if (raw === null || raw === "" || raw === 0) {
      settings.questionsPerStudent = null;
    } else {
      const n = Number(raw);
      if (!Number.isInteger(n) || n < 1) {
        return { settings, error: "عدد الأسئلة لكل طالب لازم يكون رقم صحيح أكبر من صفر" };
      }
      if (questionCount != null && n > questionCount) {
        return { settings, error: `بنك الأسئلة فيه ${questionCount} سؤال بس — اختار رقم أقل أو يساويه` };
      }
      // Drawing the whole bank is the same as no draw; store null so the
      // teacher's list does not claim a bank that does not exist.
      settings.questionsPerStudent = questionCount != null && n === questionCount ? null : n;
    }
  }
  return { settings };
}

/* ─── Answer-sheet similarity ───────────────────────────────────────────────
 * Shuffling stops copying by letter. What is left is two students agreeing on
 * the same *wrong* option for many questions: honest mistakes spread across
 * the distractors, copied ones do not. Answers are stored in the teacher's
 * original letters, so sheets from different shuffles compare directly.
 */

export type SheetForSimilarity = {
  studentId: string;
  name: string;
  answers: Record<string, string>;
};

export type SimilarPair = {
  a: { studentId: string; name: string };
  b: { studentId: string; name: string };
  /** Questions both answered wrong with the same option. */
  sharedWrong: number;
  /** Questions both answered (any option). */
  bothAnswered: number;
  /** sharedWrong / questions either of them got wrong. */
  ratio: number;
};

/** Pairs worth a teacher's look, strongest first. */
export function findSimilarSheets(
  sheets: SheetForSimilarity[],
  correct: Record<string, string>,
  opts: { minSharedWrong?: number; minRatio?: number; limit?: number } = {}
): SimilarPair[] {
  const { minSharedWrong = 3, minRatio = 0.6, limit = 30 } = opts;
  const wrongSets = sheets.map((sheet) => {
    const wrong = new Map<string, string>();
    for (const [qid, letter] of Object.entries(sheet.answers)) {
      const key = correct[qid];
      if (key && letter && letter !== key) wrong.set(qid, letter);
    }
    return wrong;
  });

  const pairs: SimilarPair[] = [];
  for (let i = 0; i < sheets.length; i += 1) {
    const wi = wrongSets[i];
    if (wi.size < minSharedWrong) continue;
    for (let j = i + 1; j < sheets.length; j += 1) {
      const wj = wrongSets[j];
      if (wj.size < minSharedWrong) continue;
      let shared = 0;
      for (const [qid, letter] of wi) if (wj.get(qid) === letter) shared += 1;
      if (shared < minSharedWrong) continue;
      const union = wi.size + wj.size - shared;
      const ratio = union > 0 ? shared / union : 0;
      if (ratio < minRatio) continue;
      let both = 0;
      for (const qid of Object.keys(sheets[i].answers)) if (qid in sheets[j].answers) both += 1;
      pairs.push({
        a: { studentId: sheets[i].studentId, name: sheets[i].name },
        b: { studentId: sheets[j].studentId, name: sheets[j].name },
        sharedWrong: shared,
        bothAnswered: both,
        ratio: Math.round(ratio * 100) / 100,
      });
    }
  }
  pairs.sort((x, y) => y.sharedWrong - x.sharedWrong || y.ratio - x.ratio);
  return pairs.slice(0, limit);
}

/** Minutes between opening and submitting, or null when the open time is unknown. */
export function attemptMinutes(startedAt: Date | string | null, completedAt: Date | string | null): number | null {
  if (!startedAt || !completedAt) return null;
  const ms = new Date(completedAt).getTime() - new Date(startedAt).getTime();
  if (!Number.isFinite(ms) || ms < 0) return null;
  return Math.round((ms / 60000) * 10) / 10;
}
