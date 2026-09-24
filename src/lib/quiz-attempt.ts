const MAX_DRAFT_CHARS = 50_000;

export function retakeCooldownRemainingMs(completedAt: Date, cooldownHours: number): number {
  if (!cooldownHours || cooldownHours <= 0) return 0;
  const elapsed = Date.now() - completedAt.getTime();
  return Math.max(0, cooldownHours * 3_600_000 - elapsed);
}

export function parseDraftAnswers(raw: string | null | undefined): Record<string, string> {
  if (!raw?.trim()) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const out: Record<string, string> = {};
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof value === "string" && value.length > 0) {
        out[key] = value.slice(0, MAX_DRAFT_CHARS);
      }
    }
    return out;
  } catch {
    return {};
  }
}

export function serializeDraftAnswers(answers: Record<string, string>): string {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(answers)) {
    if (typeof value === "string" && value.length > 0) {
      out[key] = value.slice(0, MAX_DRAFT_CHARS);
    }
  }
  return JSON.stringify(out);
}

/** Local wins on the same question (this device is newest); server fills gaps. */
export function mergeDraftAnswers(
  server: Record<string, string>,
  local: Record<string, string>
): Record<string, string> {
  const clean = (src: Record<string, string> | null | undefined): Record<string, string> => {
    const out: Record<string, string> = {};
    for (const [key, value] of Object.entries(src || {})) {
      if (typeof value === "string" && value.length > 0) {
        out[key] = value.slice(0, MAX_DRAFT_CHARS);
      }
    }
    return out;
  };
  return { ...clean(server), ...clean(local) };
}

export function localDraftKey(quizId: string): string {
  return `codeup-quiz-draft:${quizId}`;
}

export function readLocalDraft(quizId: string): Record<string, string> {
  if (typeof window === "undefined") return {};
  try {
    return parseDraftAnswers(window.localStorage.getItem(localDraftKey(quizId)));
  } catch {
    return {};
  }
}

export function writeLocalDraft(quizId: string, answers: Record<string, string>): void {
  if (typeof window === "undefined") return;
  try {
    const serialized = serializeDraftAnswers(answers);
    if (serialized === "{}") window.localStorage.removeItem(localDraftKey(quizId));
    else window.localStorage.setItem(localDraftKey(quizId), serialized);
  } catch {
    // Quota or private mode — server draft is the fallback.
  }
}

export function clearLocalDraft(quizId: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(localDraftKey(quizId));
  } catch {
    // ignore
  }
}
