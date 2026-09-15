import {
  ContentProgressStatus,
  ContentType,
  Prisma,
} from "@/generated/prisma";
import { prisma } from "@/lib/prisma";

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

export type ContentAccessDecision =
  | { allowed: true }
  | {
      allowed: false;
      code: "PREREQUISITE_LOCKED";
      requiredItem: RequiredContentItem;
    };

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
}): ContentAccessDecision {
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

  const blocked = (contentId: string): ContentAccessDecision => {
    const item = itemById.get(contentId) ?? itemById.get(input.targetContentId);
    if (!item) {
      throw new Error(`Content graph references missing item: ${contentId}`);
    }
    return { allowed: false, code: "PREREQUISITE_LOCKED", requiredItem: item };
  };

  const walk = (targetId: string): ContentAccessDecision => {
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
  const homeworkItems = unresolved.filter(
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
          select: { homeworkId: true, score: true, status: true, allowRetake: true },
        })
      : [],
  ]);

  const videoBySource = new Map<string, { watched: boolean }>();
  for (const entry of videoProgress) videoBySource.set(entry.videoId, entry);

  const quizBySource = new Map<string, { score: number; totalQ: number }>();
  for (const entry of quizResults) quizBySource.set(entry.quizId, entry);

  const homeworkBySource = new Map<string, { score: number | null; status: string; allowRetake: boolean }>();
  for (const entry of homeworkSubmissions) {
    homeworkBySource.set(entry.homeworkId, entry);
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
        continue;
      }
    }

    if (item.type === ContentType.HOMEWORK || item.type === ContentType.EXAM) {
      const legacyHomework = homeworkBySource.get(item.sourceId);
      // Only a passed (and not-reopened) attempt unlocks the next item.
      // Rejected / pending / retry-open work must keep the chain closed.
      if (legacyHomework?.status === "passed" && !legacyHomework.allowRetake) {
        progressByContentId.set(item.id, {
          contentId: item.id,
          status: ContentProgressStatus.COMPLETED,
          score: legacyHomework.score,
        });
      }
    }
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

/** Authoritative server-side prerequisite gate for every supported content type. */
export async function canAccessContent(
  studentId: string,
  locator: ContentLocator
): Promise<ContentAccessDecision> {
  if (await hasSupportOverride(studentId, locator)) {
    return { allowed: true };
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
): Promise<{ active: boolean; locks: Map<string, RequiredContentItem> }> {
  const locks = new Map<string, RequiredContentItem>();
  if (sourceIds.length === 0) return { active: false, locks };

  const items = await prisma.contentItem.findMany({
    where: { sourceId: { in: sourceIds } },
    select: { id: true, title: true, type: true, sourceId: true },
  });
  if (items.length === 0) return { active: false, locks };

  const itemIds = new Set(items.map((item) => item.id));
  const prerequisites = await prisma.contentPrerequisite.findMany({
    where: { targetContentId: { in: [...itemIds] } },
    select: {
      targetContentId: true,
      prerequisiteContentId: true,
      requiredStatus: true,
      minScore: true,
    },
  });
  if (prerequisites.length === 0) return { active: false, locks };

  // Edges may point at prerequisite items outside this course's source set
  // (ContentItem is keyed by source, so cross-course chains are possible) —
  // pull those in too or the evaluator would fail closed on a missing item.
  const missingIds = [
    ...new Set(prerequisites.map((edge) => edge.prerequisiteContentId).filter((id) => !itemIds.has(id))),
  ];
  const extraItems = missingIds.length
    ? await prisma.contentItem.findMany({
        where: { id: { in: missingIds } },
        select: { id: true, title: true, type: true, sourceId: true },
      })
    : [];
  const allItems = [...items, ...extraItems];

  const progress = await loadProgressWithLegacyFallback(studentId, allItems);

  for (const item of items) {
    const decision = evaluateContentAccess({
      targetContentId: item.id,
      items: allItems,
      prerequisites,
      progress,
    });
    if (!decision.allowed) locks.set(item.sourceId, decision.requiredItem);
  }

  return { active: true, locks };
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

/**
 * Homework only opens the next item when the attempt is passed and not
 * reopened. Reject / pending / retry-open all keep the chain closed so a
 * failed file cannot skip the rest of the lecture.
 */
export async function syncHomeworkContentProgress(
  studentId: string,
  locator: ContentLocator,
  status: string,
  options: { score?: number | null; completedAt?: Date; allowRetake?: boolean } = {},
  db: ContentProgressDb = prisma
): Promise<void> {
  const opensNext = status === "passed" && !options.allowRetake;
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
