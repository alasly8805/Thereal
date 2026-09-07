const { PrismaClient } = require('../src/generated/prisma');
const prisma = new PrismaClient();

async function backfill() {
  console.log("=== SYNCING VIDEO PROGRESS FROM LESSONS TO MONTH COURSES ===");

  const singleLessonVideos = [
    { videoId: "cmtra4die01i9qwpdnle0ybnn", targetMonthlyVideoId: "cmtra50vd01icqwpdnuplfh68", name: "Arabic Lesson 1" },
    { videoId: "cmtra9rnv01ksqwpdnzmnzkxv", targetMonthlyVideoId: "cmtra8wyw01k7qwpdv600m6fo", name: "Languages Lesson 1" },
  ];

  for (const item of singleLessonVideos) {
    console.log(`\nScanning source video: ${item.name} (${item.videoId})`);

    const sourceProgressList = await prisma.progress.findMany({
      where: { videoId: item.videoId },
      include: { student: { select: { id: true, name: true, phone: true } } }
    });

    console.log(`Found ${sourceProgressList.length} progress records.`);

    for (const sp of sourceProgressList) {
      const existingTarget = await prisma.progress.findUnique({
        where: {
          studentId_videoId: {
            studentId: sp.studentId,
            videoId: item.targetMonthlyVideoId,
          }
        }
      });

      const watched = sp.watched || existingTarget?.watched || false;
      const lastPos = Math.max(sp.lastPositionSeconds || 0, existingTarget?.lastPositionSeconds || 0);
      const watchedSecs = Math.max(sp.watchedSecondsTotal || 0, existingTarget?.watchedSecondsTotal || 0);
      const watchedAt = sp.watchedAt || existingTarget?.watchedAt || (watched ? new Date() : null);

      await prisma.progress.upsert({
        where: {
          studentId_videoId: {
            studentId: sp.studentId,
            videoId: item.targetMonthlyVideoId,
          }
        },
        create: {
          studentId: sp.studentId,
          videoId: item.targetMonthlyVideoId,
          watched,
          watchedAt,
          lastPositionSeconds: lastPos,
          watchedSecondsTotal: watchedSecs,
          lastWatchedAt: sp.lastWatchedAt || new Date(),
        },
        update: {
          watched,
          ...(watchedAt ? { watchedAt } : {}),
          lastPositionSeconds: lastPos,
          watchedSecondsTotal: watchedSecs,
        }
      });

      console.log(`  ✓ Synced ${sp.student?.name} (${sp.student?.phone}) -> watched=${watched}, lastPos=${lastPos}s`);
    }
  }

  // NOTE (2026-09-07): the hardcoded block that force-enrolled a specific student
  // into "الشهر الاول عربي" was removed. It granted unpaid access to a paid course
  // without any panel log. Course access must go through the superadmin panel
  // (trusted, logged) or the purchase flow — never through sync scripts.

  console.log("\n=== COMPLETED PROGRESS SYNC ===");
}

backfill()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
