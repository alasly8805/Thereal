import { prisma } from "./prisma";
import { ContentType, recordContentCompleted } from "./content-access-engine";

/**
 * Hardcoded equivalent video clusters for teacher Mohamed Abdelbaset
 * to guarantee 100% precision for critical lessons.
 */
const ABDELBASET_EQUIVALENT_CLUSTERS: string[][] = [
  // Month 1 Lesson 1 cluster (Arabic & Languages, Monthly & Standalone courses)
  [
    "cmtra50vd01icqwpdnuplfh68", // المحاضرة الاساسية (الشهر الاول عربي)
    "cmtra4die01i9qwpdnle0ybnn", // المحاضرة الاساسية (شرح الدرس الأول تطور تكنولوجيا...)
    "cmtra8wyw01k7qwpdv600m6fo", // الحصة الاساسية1 (الشهر الاول لغات)
    "cmtra9rnv01ksqwpdnzmnzkxv", // الحصة الاساسية (شرح الدرس الأول programming & AI للغات...)
  ],
  // Foundational introductory video cluster
  [
    "cmsytmtbx02q7qx4xe1mf2mqb", // المحاضرة التعريفة
    "cmt3ellan000rqxjsyjxovzys", // المحاضرة التعريفة للغات
  ],
  // Youssef El-Tareq Languages cluster (First section vs Month 1 Languages)
  [
    "cmtaoyhvf001zqxrwv4rcehao", // First section programming language
    "cmtap0v5x0026qxrwww9zfk1k", // الحصة الاساسية (الشهر الاول programming لغات)
  ],
  // Youssef El-Tareq Arabic cluster (اول حصة vs الشهر الاول برمجة عربي)
  [
    "cmt45t1ct001uqx3ej73kfam0", // اول حصة في الشهر الاول عربي
    "cmt45vvgy001yqx3e1nnpc1qt", // الحصة الاساسية (الشهر الاول برمجة عربي)
  ],
];

/**
 * Finds all video IDs that are duplicates or equivalent to the given videoId.
 */
export async function findDuplicateOrEquivalentVideoIds(videoId: string): Promise<string[]> {
  const relatedIds = new Set<string>();

  // 1. Check known clusters
  for (const cluster of ABDELBASET_EQUIVALENT_CLUSTERS) {
    if (cluster.includes(videoId)) {
      for (const id of cluster) {
        if (id !== videoId) relatedIds.add(id);
      }
    }
  }

  // 2. Fetch video metadata to find same providerVideoId / vdoCipherId
  const currentVideo = await prisma.video.findUnique({
    where: { id: videoId },
    select: {
      id: true,
      providerVideoId: true,
      vdoCipherId: true,
      title: true,
      order: true,
      folder: {
        select: {
          id: true,
          order: true,
          course: {
            select: { id: true, teacherId: true },
          },
        },
      },
    },
  });

  if (!currentVideo) {
    return Array.from(relatedIds);
  }

  // Same provider ID (Google Drive / Bunny / YouTube / etc.)
  if (currentVideo.providerVideoId && currentVideo.providerVideoId.trim().length > 0) {
    const matchingProvider = await prisma.video.findMany({
      where: {
        providerVideoId: currentVideo.providerVideoId,
        id: { not: videoId },
      },
      select: { id: true },
    });
    matchingProvider.forEach((v) => relatedIds.add(v.id));
  }

  // Same VdoCipher ID
  if (currentVideo.vdoCipherId && currentVideo.vdoCipherId.trim().length > 0) {
    const matchingVdo = await prisma.video.findMany({
      where: {
        vdoCipherId: currentVideo.vdoCipherId,
        id: { not: videoId },
      },
      select: { id: true },
    });
    matchingVdo.forEach((v) => relatedIds.add(v.id));
  }

  return Array.from(relatedIds);
}

/**
 * Synchronizes watched state for equivalent videos across courses for a student.
 */
export async function syncVideoWatchToRelatedCourses(
  studentId: string,
  videoId: string,
  options?: {
    completedAt?: Date;
    watchedSecondsTotal?: number;
    lastPositionSeconds?: number;
  },
  db: any = prisma
): Promise<string[]> {
  const equivalentVideoIds = await findDuplicateOrEquivalentVideoIds(videoId);
  if (equivalentVideoIds.length === 0) {
    return [];
  }

  const completedAt = options?.completedAt || new Date();
  const syncedVideoIds: string[] = [];

  for (const relId of equivalentVideoIds) {
    try {
      // 1. Confirm the target video still exists BEFORE touching Progress.
      // Hardcoded clusters (above) outlive the rows they name — teachers delete
      // and re-upload lessons — and an upsert against a dead id fails P2003 on
      // Progress_videoId_fkey. The Progress row has no value without its video
      // anyway, so skipping is correct, not just defensive.
      const targetVideo = await db.video.findUnique({
        where: { id: relId },
        select: { title: true },
      });
      if (!targetVideo) continue;

      // 2. Upsert progress record
      await db.progress.upsert({
        where: { studentId_videoId: { studentId, videoId: relId } },
        create: {
          studentId,
          videoId: relId,
          watched: true,
          watchedAt: completedAt,
          watchedSecondsTotal: options?.watchedSecondsTotal ?? 3600,
          lastPositionSeconds: options?.lastPositionSeconds ?? 0,
        },
        update: {
          watched: true,
          watchedAt: completedAt,
          ...(options?.watchedSecondsTotal ? { watchedSecondsTotal: options.watchedSecondsTotal } : {}),
          ...(options?.lastPositionSeconds ? { lastPositionSeconds: options.lastPositionSeconds } : {}),
        },
      });

      // 3. Content prerequisite graph
      await recordContentCompleted(
        studentId,
        { type: ContentType.VIDEO, sourceId: relId, title: targetVideo.title },
        { completedAt },
        db
      ).catch(() => {});

      syncedVideoIds.push(relId);
    } catch (err) {
      console.error(`[video-sync] Failed to sync progress to video ${relId}:`, err);
    }
  }

  return syncedVideoIds;
}
