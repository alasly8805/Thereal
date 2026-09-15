const { PrismaClient } = require('../src/generated/prisma');
const prisma = new PrismaClient();

const ABDELBASET_CLUSTERS = [
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
];

async function main() {
  console.log('🔄 Starting video watch progress reconciliation & cross-course synchronization...');

  // 1. Promote all progress records where student watched >= 80% to watched = true
  const allProgress = await prisma.progress.findMany({
    include: {
      video: { select: { id: true, title: true, durationMinutes: true } },
      student: { select: { id: true, name: true, phone: true } },
    },
  });

  let promotedCount = 0;
  for (const p of allProgress) {
    if (p.watched) continue;

    const durSec = (p.video?.durationMinutes || 0) * 60;
    const thresholdSec = durSec > 0 ? durSec * 0.8 : 30;
    const isCompleted = (p.lastPositionSeconds || 0) >= thresholdSec || (p.watchedSecondsTotal || 0) >= thresholdSec;

    if (isCompleted) {
      await prisma.progress.update({
        where: { id: p.id },
        data: {
          watched: true,
          watchedAt: p.lastWatchedAt || p.positionUpdatedAt || new Date(),
        },
      });
      promotedCount++;
      console.log(`  ✅ Promoted to watched: ${p.student?.name} (${p.student?.phone}) on ${p.video?.title}`);
    }
  }
  console.log(`\nPromoted ${promotedCount} records from in-progress to watched.`);

  // 2. Gather all watched progress records
  const watchedRecords = await prisma.progress.findMany({
    where: { watched: true },
    select: {
      studentId: true,
      videoId: true,
      watchedAt: true,
      watchedSecondsTotal: true,
      lastPositionSeconds: true,
    },
  });

  console.log(`Found ${watchedRecords.length} completed watch records to synchronize.`);

  let syncedCount = 0;

  for (const record of watchedRecords) {
    const studentId = record.studentId;
    const sourceVideoId = record.videoId;

    // Find all equivalent video IDs
    const targetVideoIds = new Set();

    // From known clusters
    for (const cluster of ABDELBASET_CLUSTERS) {
      if (cluster.includes(sourceVideoId)) {
        for (const id of cluster) {
          if (id !== sourceVideoId) targetVideoIds.add(id);
        }
      }
    }

    // From matching providerVideoId or vdoCipherId
    const sourceVideo = await prisma.video.findUnique({
      where: { id: sourceVideoId },
      select: { providerVideoId: true, vdoCipherId: true },
    });

    if (sourceVideo) {
      if (sourceVideo.providerVideoId && sourceVideo.providerVideoId.trim().length > 0) {
        const matching = await prisma.video.findMany({
          where: {
            providerVideoId: sourceVideo.providerVideoId,
            id: { not: sourceVideoId },
          },
          select: { id: true },
        });
        matching.forEach((m) => targetVideoIds.add(m.id));
      }

      if (sourceVideo.vdoCipherId && sourceVideo.vdoCipherId.trim().length > 0) {
        const matching = await prisma.video.findMany({
          where: {
            vdoCipherId: sourceVideo.vdoCipherId,
            id: { not: sourceVideoId },
          },
          select: { id: true },
        });
        matching.forEach((m) => targetVideoIds.add(m.id));
      }
    }

    // Sync to all target videos
    for (const targetId of targetVideoIds) {
      const existing = await prisma.progress.findUnique({
        where: { studentId_videoId: { studentId, videoId: targetId } },
      });

      if (!existing || !existing.watched) {
        await prisma.progress.upsert({
          where: { studentId_videoId: { studentId, videoId: targetId } },
          create: {
            studentId,
            videoId: targetId,
            watched: true,
            watchedAt: record.watchedAt || new Date(),
            watchedSecondsTotal: record.watchedSecondsTotal || 3600,
            lastPositionSeconds: record.lastPositionSeconds || 0,
          },
          update: {
            watched: true,
            watchedAt: record.watchedAt || new Date(),
          },
        });
        syncedCount++;
        console.log(`  -> Synced watched=true for student ${studentId} to video ${targetId} (source: ${sourceVideoId})`);
      }
    }
  }

  console.log(`✅ Synchronization completed! Synced ${syncedCount} missing video progress records.`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
