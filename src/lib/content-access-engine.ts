import {
  ContentProgressStatus,
  ContentType,
  Prisma,
} from "@/generated/prisma";
import { prisma } from "@/lib/prisma";
import { getCenterPassGrant, type CenterItemKind } from "@/lib/center-pass";
import { quizActiveElapsedMs } from "@/lib/quiz-attempt";

export { ContentProgressStatus, ContentType };

export type ContentLocator = {
  type: ContentType;
  sourceId: string;
  title?: string;
};

export type RequiredContentItem = {
  id: string;
  title: string;
  type: ContentType;
};

export const CONTENT_CLOSED_MESSAGE = "انتهى وقت الامتحان";

export type PrerequisiteAccessDecision =
  | { allowed: true }
  | {
      allowed: false;
      code: "PREREQUISITE_LOCKED";
      requiredItem: RequiredContentItem;
    };

export type ContentAccessDecision =
  | PrerequisiteAccessDecision
  | {
      allowed: false;
      code: "CONTENT_CLOSED";
      message: typeof CONTENT_CLOSED_MESSAGE;
    };

export type ContentCloseExtension = {
  studentId: string | null;
  extendedUntil: Date | string;
  revokedAt?: Date | string | null;
};

/**
 * Pure close-window check used by the access engine and invariant tests.
 * Past closeAt is closed unless a still-valid extension covers this student
 * or every student (studentId null).
 */
export function isContentClosed(input: {
  enableAutoClose?: boolean | null;
  closeAt?: Date | string | null;
  now?: Date;
  studentId?: string | null;
  extensions?: readonly ContentCloseExtension[];
}): boolean {
  if (!input.enableAutoClose || !input.closeAt) return false;
  const closeAt = input.closeAt instanceof Date ? input.closeAt : new Date(input.closeAt);
  if (Number.isNaN(closeAt.getTime())) return false;
  const now = input.now ?? new Date();
  if (now.getTime() <= closeAt.getTime()) return false;

  const studentId = input.studentId ?? null;
  const hasValidExtension = (input.extensions ?? []).some((extension) => {
    if (extension.revokedAt) return false;
    if (extension.studentId != null && extension.studentId !== studentId) return false;
    const until =
      extension.extendedUntil instanceof Date
        ? extension.extendedUntil
        : new Date(extension.extendedUntil);
    if (Number.isNaN(until.getTime())) return false;
    return now.getTime() <= until.getTime();
  });
  return !hasValidExtension;
}

/** Active support reopen for this student, or for every student (studentId null). */
export async function hasActiveSupportReopen(
  studentId: string,
  sourceId: string,
  types: ContentType[]
): Promise<boolean> {
  const row = await prisma.contentExtension.findFirst({
    where: {
      revokedAt: null,
      extendedUntil: { gte: new Date() },
      OR: [{ studentId: null }, { studentId }],
      content: { sourceId, type: { in: types } },
    },
    select: { id: true },
  });
  return row != null;
}

/**
 * A support reopen gives this student a fresh clock on an unfinished attempt.
 * The first visit starts the timer; coming back two days later must not be
 * treated as "time is already over" after support explicitly opened it again.
 */
export async function restartQuizClockForSupportReopen(
  quizId: string,
  studentId: string | null
): Promise<number> {
  const quiz = await prisma.quiz.findUnique({
    where: { id: quizId },
    select: { timeLimitMinutes: true },
  });
  if (!quiz) return 0;

  const now = new Date();
  const limitMs = Math.max(1, quiz.timeLimitMinutes || 30) * 60 * 1000;
  const rows = await prisma.quizResult.findMany({
    where: {
      quizId,
      completedAt: null,
      ...(studentId ? { studentId } : {}),
    },
    select: { id: true, startedAt: true, pausedAt: true, elapsedMs: true },
  });
  const staleIds = rows
    .filter(
      (row) =>
        quizActiveElapsedMs({
          startedAt: row.startedAt,
          pausedAt: row.pausedAt,
          elapsedMs: row.elapsedMs,
          now,
        }) >= limitMs
    )
    .map((row) => row.id);
  if (staleIds.length === 0) return 0;

  // Fresh clock, but do not start it. The waiting page starts the exam.
  await prisma.quizResult.updateMany({
    where: { id: { in: staleIds } },
    data: { startedAt: null, pausedAt: null, elapsedMs: 0 },
  });
  return staleIds.length;
}

export function contentDeniedPayload(access: ContentAccessDecision): {
  status: number;
  body: Record<string, unknown>;
} | null {
  if (access.allowed) return null;
  if (access.code === "CONTENT_CLOSED") {
    return { status: 403, body: { error: access.message, code: access.code } };
  }
  return {
    status: 403,
    body: {
      error: `يجب إكمال «${access.requiredItem.title}» أولًا.`,
      code: access.code,
      requiredItem: access.requiredItem,
    },
  };
}

export function parseCloseSchedule(body: {
  closeAt?: unknown;
  enableAutoClose?: unknown;
}): { enableAutoClose: boolean; closeAt: Date | null; error?: string } {
  const enableAutoClose = body.enableAutoClose === true;
  let closeAt: Date | null = null;
  if (typeof body.closeAt === "string" && body.closeAt.trim()) {
    const parsed = new Date(body.closeAt);
    if (Number.isNaN(parsed.getTime())) {
      return { enableAutoClose, closeAt: null, error: "وقت الإغلاق غير صالح" };
    }
    closeAt = parsed;
  }
  if (enableAutoClose && !closeAt) {
    return { enableAutoClose, closeAt: null, error: "حدد وقت الإغلاق عند تفعيل الإغلاق التلقائي" };
  }
  return { enableAutoClose, closeAt };
}

export async function syncContentCloseSchedule(input: {
  type: ContentType;
  sourceId: string;
  title: string;
  closeAt: Date | null;
  enableAutoClose: boolean;
}): Promise<void> {
  await prisma.contentItem.upsert({
    where: { type_sourceId: { type: input.type, sourceId: input.sourceId } },
    create: {
      type: input.type,
      sourceId: input.sourceId,
      title: input.title,
      closeAt: input.closeAt,
      enableAutoClose: input.enableAutoClose,
    },
    update: {
      title: input.title,
      closeAt: input.closeAt,
      enableAutoClose: input.enableAutoClose,
    },
  }).catch(console.error);
}

export type GraphContentItem = RequiredContentItem;

export type GraphPrerequisite = {
  targetContentId: string;
  prerequisiteContentId: string;
  requiredStatus?: ContentProgressStatus;
  minScore?: number | null;
};

export type GraphStudentProgress = {
  contentId: string;
  status: ContentProgressStatus;
  score?: number | null;
};

const STATUS_RANK: Record<ContentProgressStatus, number> = {
  LOCKED: 0,
  UNLOCKED: 1,
  IN_PROGRESS: 2,
  COMPLETED: 3,
};

function compatibleContentTypes(type: ContentType): ContentType[] {
  if (type === ContentType.VIDEO || type === ContentType.SOLUTION_VIDEO) {
    return [type, type === ContentType.VIDEO ? ContentType.SOLUTION_VIDEO : ContentType.VIDEO];
  }
  if (type === ContentType.QUIZ) {
    return [ContentType.QUIZ, ContentType.EXAM];
  }
  if (type === ContentType.HOMEWORK) {
    return [ContentType.HOMEWORK, ContentType.EXAM];
  }
  if (type === ContentType.EXAM) {
    return [ContentType.EXAM, ContentType.QUIZ, ContentType.HOMEWORK];
  }
  return [type];
}

function satisfiesRule(
  progress: GraphStudentProgress | undefined,
  edge: GraphPrerequisite
): boolean {
  if (!progress) return false;

  const requiredStatus = edge.requiredStatus ?? ContentProgressStatus.COMPLETED;
  if (STATUS_RANK[progress.status] < STATUS_RANK[requiredStatus]) return false;

  return edge.minScore == null ||
    (typeof progress.score === "number" && progress.score >= edge.minScore);
}

/**
 * Pure graph evaluator used by both the database-backed engine and invariant
 * tests. Every incoming edge is authoritative; cycles fail closed.
 */
export function evaluateContentAccess(input: {
  targetContentId: string;
  items: readonly GraphContentItem[];
  prerequisites: readonly GraphPrerequisite[];
  progress: readonly GraphStudentProgress[];
}): PrerequisiteAccessDecision {
  const itemById = new Map(input.items.map((item) => [item.id, item]));
  const progressByContentId = new Map(
    input.progress.map((entry) => [entry.contentId, entry])
  );
  const edgesByTarget = new Map<string, GraphPrerequisite[]>();

  for (const edge of input.prerequisites) {
    const edges = edgesByTarget.get(edge.targetContentId) ?? [];
    edges.push(edge);
    edgesByTarget.set(edge.targetContentId, edges);
  }

  const visiting = new Set<string>();
  const resolved = new Set<string>();

  const blocked = (contentId: string): PrerequisiteAccessDecision => {
    const item = itemById.get(contentId) ?? itemById.get(input.targetContentId);
    if (!item) {
      throw new Error(`Content graph references missing item: ${contentId}`);
    }
    return { allowed: false, code: "PREREQUISITE_LOCKED", requiredItem: item };
  };

  const walk = (targetId: string): PrerequisiteAccessDecision => {
    if (resolved.has(targetId)) return { allowed: true };
    if (visiting.has(targetId)) return blocked(targetId);

    visiting.add(targetId);
    for (const edge of edgesByTarget.get(targetId) ?? []) {
      const prerequisite = itemById.get(edge.prerequisiteContentId);
      if (!prerequisite) return blocked(targetId);

      if (!satisfiesRule(progressByContentId.get(prerequisite.id), edge)) {
        return blocked(prerequisite.id);
      }

      const indirectDecision = walk(prerequisite.id);
      if (!indirectDecision.allowed) return indirectDecision;
    }

    visiting.delete(targetId);
    resolved.add(targetId);
    return { allowed: true };
  };

  return walk(input.targetContentId);
}

type LoadedContentItem = {
  id: string;
  title: string;
  type: ContentType;
  sourceId: string;
};

async function loadDependencyGraph(target: LoadedContentItem) {
  const items = new Map<string, LoadedContentItem>([[target.id, target]]);
  const prerequisites: GraphPrerequisite[] = [];
  const expanded = new Set<string>();
  let frontier = [target.id];

  while (frontier.length > 0) {
    const targetIds = frontier.filter((id) => !expanded.has(id));
    if (targetIds.length === 0) break;
    targetIds.forEach((id) => expanded.add(id));

    const edges = await prisma.contentPrerequisite.findMany({
      where: { targetContentId: { in: targetIds } },
      select: {
        targetContentId: true,
        prerequisiteContentId: true,
        requiredStatus: true,
        minScore: true,
        prerequisiteContent: {
          select: { id: true, title: true, type: true, sourceId: true },
        },
      },
    });

    frontier = [];
    for (const edge of edges) {
      prerequisites.push({
        targetContentId: edge.targetContentId,
        prerequisiteContentId: edge.prerequisiteContentId,
        requiredStatus: edge.requiredStatus,
        minScore: edge.minScore,
      });
      items.set(edge.prerequisiteContent.id, edge.prerequisiteContent);
      if (!expanded.has(edge.prerequisiteContent.id)) {
        frontier.push(edge.prerequisiteContent.id);
      }
    }
  }

  return { items: [...items.values()], prerequisites };
}

async function loadProgressWithLegacyFallback(
  studentId: string,
  items: readonly LoadedContentItem[]
): Promise<GraphStudentProgress[]> {
  const genericProgress = await prisma.studentContentProgress.findMany({
    where: { studentId, contentId: { in: items.map((item) => item.id) } },
    select: { contentId: true, status: true, score: true },
  });
  const progressByContentId = new Map<string, GraphStudentProgress>(
    genericProgress.map((entry) => [entry.contentId, entry])
  );
  const unresolved = items.filter((item) => !progressByContentId.has(item.id));

  const videoItems = unresolved.filter(
    (item) => item.type === ContentType.VIDEO || item.type === ContentType.SOLUTION_VIDEO
  );
  const quizItems = unresolved.filter(
    (item) => item.type === ContentType.QUIZ || item.type === ContentType.EXAM
  );
  // Homework unlock is always derived from the live submission. Stale
  // studentContentProgress (IN_PROGRESS after a PDF upload) must not win.
  const homeworkItems = items.filter(
    (item) => item.type === ContentType.HOMEWORK || item.type === ContentType.EXAM
  );

  const [videoProgress, quizResults, homeworkSubmissions] = await Promise.all([
    videoItems.length
      ? prisma.progress.findMany({
          where: { studentId, videoId: { in: videoItems.map((item) => item.sourceId) } },
          select: { videoId: true, watched: true },
        })
      : [],
    quizItems.length
      ? prisma.quizResult.findMany({
          where: { studentId, quizId: { in: quizItems.map((item) => item.sourceId) } },
          select: { quizId: true, score: true, totalQ: true },
        })
      : [],
    homeworkItems.length
      ? prisma.homeworkSubmission.findMany({
          where: { studentId, homeworkId: { in: homeworkItems.map((item) => item.sourceId) } },
          select: {
            homeworkId: true,
            score: true,
            status: true,
            allowRetake: true,
            fileUrl: true,
            review: { select: { verdict: true } },
          },
        })
      : [],
  ]);

  const videoBySource = new Map<string, { watched: boolean }>();
  for (const entry of videoProgress) videoBySource.set(entry.videoId, entry);

  const quizBySource = new Map<string, { score: number; totalQ: number }>();
  for (const entry of quizResults) quizBySource.set(entry.quizId, entry);

  const homeworkBySource = new Map<
    string,
    {
      score: number | null;
      status: string;
      allowRetake: boolean;
      fileUrl?: string | null;
      reviewVerdict?: string | null;
    }
  >();
  for (const entry of homeworkSubmissions) {
    homeworkBySource.set(entry.homeworkId, {
      score: entry.score,
      status: entry.status,
      allowRetake: entry.allowRetake,
      fileUrl: entry.fileUrl,
      reviewVerdict: entry.review?.verdict ?? null,
    });
  }

  for (const item of unresolved) {
    if (item.type === ContentType.VIDEO || item.type === ContentType.SOLUTION_VIDEO) {
      const legacy = videoBySource.get(item.sourceId);
      if (legacy?.watched) {
        progressByContentId.set(item.id, {
          contentId: item.id,
          status: ContentProgressStatus.COMPLETED,
        });
      }
      continue;
    }

    if (item.type === ContentType.QUIZ || item.type === ContentType.EXAM) {
      const legacyQuiz = quizBySource.get(item.sourceId);
      if (legacyQuiz && legacyQuiz.totalQ > 0) {
        progressByContentId.set(item.id, {
          contentId: item.id,
          status: ContentProgressStatus.COMPLETED,
          score: legacyQuiz.score,
        });
      }
    }
  }

  for (const item of homeworkItems) {
    const legacyHomework = homeworkBySource.get(item.sourceId);
    if (!legacyHomework) continue;
    const opensNext = homeworkOpensNextContent(legacyHomework.status, {
      allowRetake: legacyHomework.allowRetake,
      reviewVerdict: legacyHomework.reviewVerdict,
      hasUploadedFile: Boolean(legacyHomework.fileUrl),
    });
    progressByContentId.set(item.id, {
      contentId: item.id,
      status: opensNext ? ContentProgressStatus.COMPLETED : ContentProgressStatus.IN_PROGRESS,
      score: legacyHomework.score,
    });
  }

  return [...progressByContentId.values()];
}

/**
 * True when support has explicitly unlocked this one item for this one student.
 *
 * Scoped as narrowly as the panel allows: one student, one item, optionally
 * time-boxed, revocable. It bypasses the prerequisite graph ONLY — enrollment,
 * ownership and payment checks live in checkVideoAccess/checkHomeworkAccess and
 * are untouched, so an override can never hand out content nobody paid for.
 */
async function hasSupportOverride(studentId: string, locator: ContentLocator): Promise<boolean> {
  try {
    const override = await prisma.contentAccessOverride.findFirst({
      where: {
        studentId,
        sourceId: locator.sourceId,
        contentType: { in: compatibleContentTypes(locator.type) },
        revokedAt: null,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      select: { id: true },
    });
    return override !== null;
  } catch {
    // Fail closed: a lookup error must not silently open the whole graph.
    return false;
  }
}

async function loadTimedCloseState(
  locator: ContentLocator,
  studentId: string
): Promise<{ closed: boolean }> {
  if (
    locator.type !== ContentType.QUIZ &&
    locator.type !== ContentType.EXAM &&
    locator.type !== ContentType.HOMEWORK
  ) {
    return { closed: false };
  }

  const items = await prisma.contentItem.findMany({
    where: {
      sourceId: locator.sourceId,
      type: { in: compatibleContentTypes(locator.type) },
    },
    select: { id: true, closeAt: true, enableAutoClose: true },
  });

  let enableAutoClose = items.some((item) => item.enableAutoClose);
  let closeAt: Date | null = items.find((item) => item.closeAt)?.closeAt ?? null;

  const quiz = await prisma.quiz.findUnique({
    where: { id: locator.sourceId },
    select: { closeAt: true, enableAutoClose: true },
  });
  if (quiz) {
    enableAutoClose = quiz.enableAutoClose;
    closeAt = quiz.closeAt;
  } else {
    const homework = await prisma.homework.findUnique({
      where: { id: locator.sourceId },
      select: { closeAt: true, enableAutoClose: true },
    });
    if (homework) {
      enableAutoClose = homework.enableAutoClose;
      closeAt = homework.closeAt;
    }
  }

  if (!enableAutoClose || !closeAt) return { closed: false };

  const extensions = items.length
    ? await prisma.contentExtension.findMany({
        where: {
          contentId: { in: items.map((item) => item.id) },
          revokedAt: null,
          extendedUntil: { gte: new Date() },
          OR: [{ studentId: null }, { studentId }],
        },
        select: { studentId: true, extendedUntil: true, revokedAt: true },
      })
    : [];

  return {
    closed: isContentClosed({
      enableAutoClose,
      closeAt,
      studentId,
      extensions,
    }),
  };
}

/** Authoritative server-side prerequisite gate for every supported content type. */
function locatorToCenterKind(type: ContentType): CenterItemKind | null {
  if (type === ContentType.VIDEO || type === ContentType.SOLUTION_VIDEO) return "VIDEO";
  if (type === ContentType.QUIZ || type === ContentType.EXAM) return "QUIZ";
  if (type === ContentType.HOMEWORK) return "HOMEWORK";
  if (type === ContentType.PDF) return "MATERIAL";
  return null;
}

export async function canAccessContent(
  studentId: string,
  locator: ContentLocator
): Promise<ContentAccessDecision> {
  const timed = await loadTimedCloseState(locator, studentId);
  const reopenTypes =
    locator.type === ContentType.QUIZ || locator.type === ContentType.EXAM
      ? [ContentType.QUIZ, ContentType.EXAM]
      : locator.type === ContentType.HOMEWORK
        ? [ContentType.HOMEWORK, ContentType.EXAM]
        : null;
  // A support reopen opens the quiz the student already has for the window,
  // including when the previous lesson is still locked.
  if (
    reopenTypes &&
    (await hasActiveSupportReopen(studentId, locator.sourceId, reopenTypes))
  ) {
    return { allowed: true };
  }
  if (timed.closed) {
    return { allowed: false, code: "CONTENT_CLOSED", message: CONTENT_CLOSED_MESSAGE };
  }

  if (await hasSupportOverride(studentId, locator)) {
    return { allowed: true };
  }

  const centerGrant = await getCenterPassGrant(studentId);
  if (centerGrant) {
    const kind = locatorToCenterKind(locator.type);
    if (kind && centerGrant.has(kind, locator.sourceId)) {
      return { allowed: true };
    }
    return {
      allowed: false,
      code: "PREREQUISITE_LOCKED",
      requiredItem: {
        id: locator.sourceId,
        title: locator.title || "",
        type: locator.type,
      },
    };
  }

  const candidates = await prisma.contentItem.findMany({
    where: {
      sourceId: locator.sourceId,
      type: { in: compatibleContentTypes(locator.type) },
    },
    select: { id: true, title: true, type: true, sourceId: true },
  });
  const target = candidates.find((item) => item.type === locator.type) ?? candidates[0];

  // Content without graph metadata has no declared prerequisite and remains
  // accessible through its existing enrollment/ownership authorization checks.
  if (!target) return { allowed: true };

  const graph = await loadDependencyGraph(target);
  const progress = await loadProgressWithLegacyFallback(studentId, graph.items);
  return evaluateContentAccess({
    targetContentId: target.id,
    items: graph.items,
    prerequisites: graph.prerequisites,
    progress,
  });
}

/**
 * Bulk prerequisite evaluation for every content item of a course. Lets the
 * student course payload show lock state that matches the teacher's content
 * chain (مسار وفتح المحتوى) exactly — the client previously guessed locks from
 * display order, which disagreed with the graph whenever the chain crossed
 * folders, used custom edges, or chained through quizzes/homework.
 *
 * Returns active:false when the course has no prerequisite edges at all, so
 * callers can fall back to their legacy behaviour for untouched courses.
 */
export async function getCourseContentLocks(
  studentId: string,
  sourceIds: string[]
): Promise<{ active: boolean; locks: Map<string, RequiredContentItem>; timedClosed: Set<string> }> {
  const locks = new Map<string, RequiredContentItem>();
  const timedClosed = new Set<string>();
  if (sourceIds.length === 0) return { active: false, locks, timedClosed };

  const items = await prisma.contentItem.findMany({
    where: { sourceId: { in: sourceIds } },
    select: { id: true, title: true, type: true, sourceId: true, closeAt: true, enableAutoClose: true },
  });

  const [quizzes, homeworks] = await Promise.all([
    prisma.quiz.findMany({
      where: { id: { in: sourceIds } },
      select: { id: true, closeAt: true, enableAutoClose: true },
    }),
    prisma.homework.findMany({
      where: { id: { in: sourceIds } },
      select: { id: true, closeAt: true, enableAutoClose: true },
    }),
  ]);
  const quizById = new Map(quizzes.map((row) => [row.id, row]));
  const homeworkById = new Map(homeworks.map((row) => [row.id, row]));

  const itemIds = items.map((item) => item.id);
  const extensions = itemIds.length
    ? await prisma.contentExtension.findMany({
        where: {
          contentId: { in: itemIds },
          revokedAt: null,
          extendedUntil: { gte: new Date() },
          OR: [{ studentId: null }, { studentId }],
        },
        select: { contentId: true, studentId: true, extendedUntil: true, revokedAt: true },
      })
    : [];
  const extensionsByContentId = new Map<string, ContentCloseExtension[]>();
  for (const extension of extensions) {
    const list = extensionsByContentId.get(extension.contentId) ?? [];
    list.push(extension);
    extensionsByContentId.set(extension.contentId, list);
  }

  const scheduleForSource = (sourceId: string) => {
    const quiz = quizById.get(sourceId);
    if (quiz) return quiz;
    const homework = homeworkById.get(sourceId);
    if (homework) return homework;
    const item = items.find((entry) => entry.sourceId === sourceId);
    return item
      ? { closeAt: item.closeAt, enableAutoClose: item.enableAutoClose }
      : { closeAt: null, enableAutoClose: false };
  };

  for (const sourceId of sourceIds) {
    const schedule = scheduleForSource(sourceId);
    const relatedItems = items.filter((item) => item.sourceId === sourceId);
    const sourceExtensions = relatedItems.flatMap(
      (item) => extensionsByContentId.get(item.id) ?? []
    );
    if (
      isContentClosed({
        enableAutoClose: schedule.enableAutoClose,
        closeAt: schedule.closeAt,
        studentId,
        extensions: sourceExtensions,
      })
    ) {
      timedClosed.add(sourceId);
    }
  }

  if (items.length === 0) return { active: false, locks, timedClosed };

  const itemIdSet = new Set(items.map((item) => item.id));
  const prerequisites = await prisma.contentPrerequisite.findMany({
    where: { targetContentId: { in: [...itemIdSet] } },
    select: {
      targetContentId: true,
      prerequisiteContentId: true,
      requiredStatus: true,
      minScore: true,
    },
  });
  if (prerequisites.length === 0) return { active: false, locks, timedClosed };

  // Edges may point at prerequisite items outside this course's source set
  // (ContentItem is keyed by source, so cross-course chains are possible) —
  // pull those in too or the evaluator would fail closed on a missing item.
  const missingIds = [
    ...new Set(prerequisites.map((edge) => edge.prerequisiteContentId).filter((id) => !itemIdSet.has(id))),
  ];
  const extraItems = missingIds.length
    ? await prisma.contentItem.findMany({
        where: { id: { in: missingIds } },
        select: { id: true, title: true, type: true, sourceId: true },
      })
    : [];
  const allItems = [...items, ...extraItems];

  const progress = await loadProgressWithLegacyFallback(studentId, allItems);

  const reopenedSourceIds = new Set<string>();
  for (const item of items) {
    if ((extensionsByContentId.get(item.id) ?? []).length > 0) {
      reopenedSourceIds.add(item.sourceId);
    }
  }

  for (const item of items) {
    if (reopenedSourceIds.has(item.sourceId)) continue;
    const decision = evaluateContentAccess({
      targetContentId: item.id,
      items: allItems,
      prerequisites,
      progress,
    });
    if (!decision.allowed) locks.set(item.sourceId, decision.requiredItem);
  }

  return { active: true, locks, timedClosed };
}

type ContentProgressDb = Pick<
  Prisma.TransactionClient,
  "contentItem" | "studentContentProgress"
>;

/**
 * Synchronizes a canonical completion/result into the generic graph state.
 * Pass the caller's transaction client when the legacy mutation must be atomic.
 */
export async function recordContentProgress(
  studentId: string,
  locator: ContentLocator,
  progress: {
    status: ContentProgressStatus;
    score?: number | null;
    completedAt?: Date | null;
  },
  db: ContentProgressDb = prisma
): Promise<void> {
  let items = await db.contentItem.findMany({
    where: {
      sourceId: locator.sourceId,
      type: { in: compatibleContentTypes(locator.type) },
    },
    select: { id: true },
  });

  if (items.length === 0) {
    const item = await db.contentItem.create({
      data: {
        type: locator.type,
        sourceId: locator.sourceId,
        title: locator.title ?? locator.sourceId,
      },
      select: { id: true },
    });
    items = [item];
  } else if (locator.title) {
    await db.contentItem.updateMany({
      where: { id: { in: items.map((item) => item.id) } },
      data: { title: locator.title },
    });
  }

  for (const item of items) {
    await db.studentContentProgress.upsert({
      where: { studentId_contentId: { studentId, contentId: item.id } },
      create: {
        studentId,
        contentId: item.id,
        status: progress.status,
        score: progress.score ?? null,
        completedAt: progress.completedAt ?? null,
      },
      update: {
        status: progress.status,
        score: progress.score ?? null,
        completedAt: progress.completedAt ?? null,
      },
    });
  }
}

export async function recordContentCompleted(
  studentId: string,
  locator: ContentLocator,
  options: { score?: number | null; completedAt?: Date } = {},
  db: ContentProgressDb = prisma
): Promise<void> {
  await recordContentProgress(
    studentId,
    locator,
    {
      status: ContentProgressStatus.COMPLETED,
      score: options.score,
      completedAt: options.completedAt ?? new Date(),
    },
    db
  );
}

export type HomeworkUnlockOptions = {
  allowRetake?: boolean;
  /** Last teacher verdict. Unlock is driven by submission status, not this. */
  reviewVerdict?: string | null;
  /** True when the student already stored a PDF/file on the submission. */
  hasUploadedFile?: boolean;
};

/** Canonical status for every PDF homework persist/submit ("قيد المراجعة"). */
export const HOMEWORK_REVIEW_REQUESTED_STATUS = "review_requested";

export function isHomeworkUnderReview(
  status: string,
  options: HomeworkUnlockOptions = {}
): boolean {
  return (
    status === HOMEWORK_REVIEW_REQUESTED_STATUS ||
    (status === "pending" && options.hasUploadedFile === true)
  );
}

/**
 * Global PDF homework chain rule (all current and future uploads):
 * - Any قيد المراجعة row (`review_requested`, or legacy `pending` with a file)
 *   marks progress COMPLETED and unlocks the next item.
 * - Teacher reject (`failed`) locks the next item again and closes re-upload.
 * - Re-upload stays closed until the teacher or an assistant sets allowRetake.
 * - That replacement returns to قيد المراجعة and unlocks the next item.
 * - Teacher accept (`passed`) keeps it unlocked. A later reject locks it again.
 *
 * `canAccessContent` / `getCourseContentLocks` both overlay live submissions
 * through this helper, so a later upload cannot stay locked just because
 * studentContentProgress was left IN_PROGRESS.
 */
export function homeworkOpensNextContent(
  status: string,
  options: HomeworkUnlockOptions = {}
): boolean {
  if (options.allowRetake) return false;
  if (status === "passed") return true;
  return isHomeworkUnderReview(status, options);
}

export function homeworkProgressStatusFromSubmission(
  status: string,
  options: HomeworkUnlockOptions = {}
): ContentProgressStatus {
  return homeworkOpensNextContent(status, options)
    ? ContentProgressStatus.COMPLETED
    : ContentProgressStatus.IN_PROGRESS;
}

/**
 * A second file is allowed only after the teacher or an assistant opens it.
 * Rejection alone does not reopen the upload.
 */
export function canReplaceRejectedHomeworkUpload(
  homeworkType: string,
  status: string,
  allowRetake: boolean
): boolean {
  if (!allowRetake) return false;
  if (homeworkType !== "upload") return true;
  return (
    status === "failed" ||
    status === "passed" ||
    status === "pending" ||
    status === HOMEWORK_REVIEW_REQUESTED_STATUS
  );
}

/**
 * /upload may store a PDF on this attempt. A rejected or accepted file stays
 * locked until the teacher or an assistant reopens it. قيد المراجعة rows may
 * still be replaced so a dropped follow-up /submit can finish the same attempt.
 */
export function canPersistPdfHomeworkUpload(
  homeworkType: string,
  status: string | null | undefined,
  allowRetake: boolean
): boolean {
  if (!status) return true;
  if (homeworkType !== "upload") return false;
  if (allowRetake) return true;
  return status === "pending" || status === HOMEWORK_REVIEW_REQUESTED_STATUS;
}

/**
 * Keep studentContentProgress in lock-step with the homework submission.
 */
export async function syncHomeworkContentProgress(
  studentId: string,
  locator: ContentLocator,
  status: string,
  options: HomeworkUnlockOptions & { score?: number | null; completedAt?: Date } = {},
  db: ContentProgressDb = prisma
): Promise<void> {
  const opensNext = homeworkOpensNextContent(status, options);
  if (opensNext) {
    await recordContentCompleted(studentId, locator, {
      score: options.score,
      completedAt: options.completedAt,
    }, db);
    return;
  }

  await recordContentProgress(
    studentId,
    locator,
    {
      status: ContentProgressStatus.IN_PROGRESS,
      score: options.score ?? null,
      completedAt: null,
    },
    db
  );
}
