const { PrismaClient } = require('../src/generated/prisma');
const prisma = new PrismaClient();

async function syncYoussefLessons() {
  console.log("=== SYNCING YOUSSEF EL-TAREQ STANDALONE LESSONS TO MONTH COURSES ===");

  const pairs = [
    {
      sourceVideoId: "cmtaoyhvf001zqxrwv4rcehao", // First section programming language
      targetVideoId: "cmtap0v5x0026qxrwww9zfk1k", // الشهر الاول programming لغات
      sourceCourseId: "cmta9me5r0007qxmwnnsq1cez",
      targetCourseId: "cmtaozekq0022qxrwfwjpxcyp",
      name: "Languages",
    },
    {
      sourceVideoId: "cmt45t1ct001uqx3ej73kfam0", // اول حصة في الشهر الاول عربي
      targetVideoId: "cmt45vvgy001yqx3e1nnpc1qt", // الشهر الاول برمجة عربي
      sourceCourseId: "cmt45qxsf001oqx3e9jtlwny8",
      targetCourseId: "cmt45u9p9001pqx3qos4rpxpx",
      name: "Arabic",
    }
  ];

  for (const pair of pairs) {
    console.log(`\nSyncing ${pair.name}: ${pair.sourceVideoId} -> ${pair.targetVideoId}`);

    const sourceProgress = await prisma.progress.findMany({
      where: { videoId: pair.sourceVideoId },
      include: { student: { select: { id: true, name: true, phone: true } } }
    });

    console.log(`Found ${sourceProgress.length} progress records.`);

    for (const sp of sourceProgress) {
      const existingTarget = await prisma.progress.findUnique({
        where: { studentId_videoId: { studentId: sp.studentId, videoId: pair.targetVideoId } }
      });

      const watched = sp.watched || existingTarget?.watched || false;
      const lastPos = Math.max(sp.lastPositionSeconds || 0, existingTarget?.lastPositionSeconds || 0);
      const watchedSecs = Math.max(sp.watchedSecondsTotal || 0, existingTarget?.watchedSecondsTotal || 0);
      const watchedAt = sp.watchedAt || existingTarget?.watchedAt || (watched ? new Date() : null);

      await prisma.progress.upsert({
        where: { studentId_videoId: { studentId: sp.studentId, videoId: pair.targetVideoId } },
        create: {
          studentId: sp.studentId,
          videoId: pair.targetVideoId,
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

      console.log(`  ✓ Synced ${sp.student?.name} (${sp.student?.phone}): watched=${watched}, pos=${lastPos}`);
    }

    // DISABLED 2026-09-07: This block mass-enrolled 28 students into full monthly
    // courses for free (they only had access to a single lesson). Do NOT re-enable
    // without explicit approval from the platform owner. To run it intentionally,
    // pass --allow-mass-enroll on the command line.
    if (process.argv.includes('--allow-mass-enroll')) {
      const accessCodes = await prisma.accessCode.findMany({
        where: { courseId: pair.sourceCourseId, isActive: true },
        select: { studentId: true }
      });

      for (const ac of accessCodes) {
        if (!ac.studentId) continue;
        await prisma.courseEnrollment.upsert({
          where: { studentId_courseId: { studentId: ac.studentId, courseId: pair.targetCourseId } },
          create: { studentId: ac.studentId, courseId: pair.targetCourseId, fulfillmentSource: 'ADMIN' },
          update: {}
        });
      }
      console.log(`  ✓ Ensured all ${accessCodes.length} access code holders are enrolled in target monthly course.`);
    } else {
      console.log('  ⏭️  Mass-enrollment SKIPPED (disabled). Pass --allow-mass-enroll to run it intentionally.');
    }
  }

  console.log("\n=== COMPLETED YOUSSEF LESSON SYNC ===");
}

syncYoussefLessons()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
