import { ContentType, FolderContentType } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";

export type FolderContentKind = "VIDEO" | "HOMEWORK" | "ATTACHMENT" | "EXAM";

type OrderRow = {
  contentType: FolderContentKind | string;
  contentId: string;
  order: number;
};

export type OrderedFolderEntry<V, H, Q, M> =
  | { contentType: "VIDEO"; contentId: string; order: number; video: V }
  | { contentType: "HOMEWORK"; contentId: string; order: number; homework: H }
  | { contentType: "EXAM"; contentId: string; order: number; exam: Q }
  | { contentType: "ATTACHMENT"; contentId: string; order: number; attachment: M };

type OrderSlot = { contentType: FolderContentType; contentId: string };

export function slotsFromContentItems(
  itemIds: string[],
  itemMapById: Map<string, { type: ContentType | string; sourceId: string }>,
): OrderSlot[] {
  const rows: OrderSlot[] = [];
  const seen = new Set<string>();
  for (const itemId of itemIds) {
    const item = itemMapById.get(itemId);
    if (!item) continue;
    const contentType = toFolderContentType(item.type);
    if (!contentType) continue;
    const key = `${contentType}:${item.sourceId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push({ contentType, contentId: item.sourceId });
  }
  return rows;
}

/** Map graph/content-item types onto the single folder display order. */
export function toFolderContentType(type: ContentType | string): FolderContentType | null {
  switch (type) {
    case ContentType.VIDEO:
    case "VIDEO":
    case ContentType.SOLUTION_VIDEO:
    case "SOLUTION_VIDEO":
      return FolderContentType.VIDEO;
    case ContentType.HOMEWORK:
    case "HOMEWORK":
      return FolderContentType.HOMEWORK;
    case ContentType.QUIZ:
    case "QUIZ":
    case ContentType.EXAM:
    case "EXAM":
      return FolderContentType.EXAM;
    case ContentType.PDF:
    case "PDF":
      return FolderContentType.ATTACHMENT;
    default:
      return null;
  }
}

/**
 * Interleave a folder's videos, homework, exams, and attachments by the saved
 * FolderContent.order. Anything not yet in the table is appended, so a newly
 * created item still shows up until the admin saves the path again.
 */
export function assembleFolderContents<
  V extends { id: string },
  H extends { id: string },
  Q extends { id: string },
  M extends { id: string },
>(input: {
  orders: OrderRow[];
  videos: V[];
  homeworks: H[];
  quizzes: Q[];
  materials: M[];
}): Array<OrderedFolderEntry<V, H, Q, M>> {
  const videos = new Map(input.videos.map((row) => [row.id, row]));
  const homeworks = new Map(input.homeworks.map((row) => [row.id, row]));
  const quizzes = new Map(input.quizzes.map((row) => [row.id, row]));
  const materials = new Map(input.materials.map((row) => [row.id, row]));
  const seen = new Set<string>();
  const contents: Array<OrderedFolderEntry<V, H, Q, M>> = [];

  const push = (entry: OrderedFolderEntry<V, H, Q, M>) => {
    const key = `${entry.contentType}:${entry.contentId}`;
    if (seen.has(key)) return false;
    seen.add(key);
    contents.push(entry);
    return true;
  };

  const sortedOrders = [...input.orders].sort((a, b) => a.order - b.order);
  for (const row of sortedOrders) {
    if (row.contentType === "VIDEO") {
      const video = videos.get(row.contentId);
      if (video) push({ contentType: "VIDEO", contentId: row.contentId, order: row.order, video });
    } else if (row.contentType === "HOMEWORK") {
      const homework = homeworks.get(row.contentId);
      if (homework) push({ contentType: "HOMEWORK", contentId: row.contentId, order: row.order, homework });
    } else if (row.contentType === "EXAM") {
      const exam = quizzes.get(row.contentId);
      if (exam) push({ contentType: "EXAM", contentId: row.contentId, order: row.order, exam });
    } else if (row.contentType === "ATTACHMENT") {
      const attachment = materials.get(row.contentId);
      if (attachment) push({ contentType: "ATTACHMENT", contentId: row.contentId, order: row.order, attachment });
    }
  }

  let cursor = contents.reduce((max, entry) => Math.max(max, entry.order), -1) + 1;
  const append = (entry: OrderedFolderEntry<V, H, Q, M>) => {
    if (push(entry)) cursor = entry.order + 1;
  };
  for (const video of input.videos) append({ contentType: "VIDEO", contentId: video.id, order: cursor, video });
  for (const homework of input.homeworks) append({ contentType: "HOMEWORK", contentId: homework.id, order: cursor, homework });
  for (const exam of input.quizzes) append({ contentType: "EXAM", contentId: exam.id, order: cursor, exam });
  for (const attachment of input.materials) append({ contentType: "ATTACHMENT", contentId: attachment.id, order: cursor, attachment });

  return contents;
}

export async function appendFolderContent(folderId: string | null | undefined, contentType: FolderContentType, contentId: string) {
  if (!folderId || !contentId) return;
  try {
    const agg = await prisma.folderContent.aggregate({
      where: { folderId },
      _max: { order: true },
    });
    const order = (agg._max.order ?? -1) + 1;
    await prisma.folderContent.upsert({
      where: {
        folderId_contentType_contentId: { folderId, contentType, contentId },
      },
      create: { folderId, contentType, contentId, order },
      update: {},
    });
  } catch (error) {
    console.error("[folder-content] append failed", error);
  }
}

export async function removeFolderContent(contentType: FolderContentType, contentId: string) {
  if (!contentId) return;
  try {
    await prisma.folderContent.deleteMany({ where: { contentType, contentId } });
  } catch (error) {
    console.error("[folder-content] remove failed", error);
  }
}

export async function persistFolderContentOrders(byFolder: Map<string, OrderSlot[]>) {
  const entries = [...byFolder.entries()].filter(
    ([folderId]) => folderId && folderId !== "course-root" && folderId !== "unassigned",
  );
  if (entries.length === 0) return;

  await prisma.$transaction(async (tx) => {
    for (const [folderId, rows] of entries) {
      await tx.folderContent.deleteMany({ where: { folderId } });
      if (rows.length === 0) continue;
      await tx.folderContent.createMany({
        data: rows.map((row, order) => ({
          folderId,
          contentType: row.contentType,
          contentId: row.contentId,
          order,
        })),
      });
    }
  });
}

type BackfillNode = {
  key: string;
  contentType: FolderContentType;
  contentId: string;
  initialOrder: number;
  contentItemId?: string;
};

/**
 * Seed FolderContent from the same sequence the admin path page used to
 * reconstruct: natural type order, then a prerequisite topological sort so an
 * already-saved chain keeps its order.
 */
export async function backfillFolderContentOrders() {
  const folders = await prisma.folder.findMany({
    include: {
      videos: { orderBy: { order: "asc" }, select: { id: true } },
      homeworks: { orderBy: { createdAt: "asc" }, select: { id: true } },
      quizzes: { orderBy: { createdAt: "asc" }, select: { id: true } },
      materials: { orderBy: { order: "asc" }, select: { id: true } },
    },
  });

  const sourceIds: string[] = [];
  for (const folder of folders) {
    folder.videos.forEach((row) => sourceIds.push(row.id));
    folder.homeworks.forEach((row) => sourceIds.push(row.id));
    folder.quizzes.forEach((row) => sourceIds.push(row.id));
    folder.materials.forEach((row) => sourceIds.push(row.id));
  }

  const contentItems = sourceIds.length
    ? await prisma.contentItem.findMany({
        where: { sourceId: { in: sourceIds } },
        select: { id: true, type: true, sourceId: true },
      })
    : [];
  const itemBySource = new Map(contentItems.map((item) => [`${item.type}:${item.sourceId}`, item]));
  const itemIds = contentItems.map((item) => item.id);
  const prerequisites = itemIds.length
    ? await prisma.contentPrerequisite.findMany({
        where: { targetContentId: { in: itemIds } },
        select: { targetContentId: true, prerequisiteContentId: true },
      })
    : [];

  const existing = await prisma.folderContent.findMany({ select: { folderId: true }, distinct: ["folderId"] });
  const alreadySeeded = new Set(existing.map((row) => row.folderId));

  let seededFolders = 0;
  let seededRows = 0;

  for (const folder of folders) {
    if (alreadySeeded.has(folder.id)) continue;

    const nodes: BackfillNode[] = [];
    let initialOrder = 0;
    const pushNode = (type: ContentType, contentType: FolderContentType, contentId: string) => {
      const item = itemBySource.get(`${type}:${contentId}`);
      nodes.push({
        key: `${contentType}:${contentId}`,
        contentType,
        contentId,
        initialOrder: initialOrder++,
        contentItemId: item?.id,
      });
    };
    for (const video of folder.videos) pushNode(ContentType.VIDEO, FolderContentType.VIDEO, video.id);
    for (const homework of folder.homeworks) pushNode(ContentType.HOMEWORK, FolderContentType.HOMEWORK, homework.id);
    for (const quiz of folder.quizzes) pushNode(ContentType.QUIZ, FolderContentType.EXAM, quiz.id);
    for (const material of folder.materials) pushNode(ContentType.PDF, FolderContentType.ATTACHMENT, material.id);
    if (nodes.length === 0) continue;

    const sorted = topoSortFolder(nodes, prerequisites);
    await prisma.folderContent.createMany({
      data: sorted.map((node, order) => ({
        folderId: folder.id,
        contentType: node.contentType,
        contentId: node.contentId,
        order,
      })),
    });
    seededFolders += 1;
    seededRows += sorted.length;
  }

  return { seededFolders, seededRows, skippedFolders: alreadySeeded.size };
}

function topoSortFolder(
  nodes: BackfillNode[],
  prerequisites: Array<{ targetContentId: string; prerequisiteContentId: string }>,
) {
  const byItemId = new Map(nodes.filter((node) => node.contentItemId).map((node) => [node.contentItemId as string, node]));
  const indegree = new Map(nodes.map((node) => [node.key, 0]));
  const next = new Map<string, string[]>(nodes.map((node) => [node.key, []]));

  for (const edge of prerequisites) {
    const from = byItemId.get(edge.prerequisiteContentId);
    const to = byItemId.get(edge.targetContentId);
    if (!from || !to || from.key === to.key) continue;
    indegree.set(to.key, (indegree.get(to.key) ?? 0) + 1);
    next.get(from.key)?.push(to.key);
  }

  const byKey = new Map(nodes.map((node) => [node.key, node]));
  const queue = [...nodes].filter((node) => (indegree.get(node.key) ?? 0) === 0).sort((a, b) => a.initialOrder - b.initialOrder);
  const sorted: BackfillNode[] = [];
  const queued = new Set(queue.map((node) => node.key));

  while (queue.length > 0) {
    const current = queue.shift()!;
    sorted.push(current);
    for (const nextKey of next.get(current.key) ?? []) {
      const degree = (indegree.get(nextKey) ?? 1) - 1;
      indegree.set(nextKey, degree);
      if (degree === 0 && !queued.has(nextKey)) {
        const node = byKey.get(nextKey);
        if (node) {
          queue.push(node);
          queued.add(nextKey);
        }
      }
    }
  }

  for (const node of nodes) {
    if (!sorted.some((row) => row.key === node.key)) sorted.push(node);
  }
  return sorted;
}
