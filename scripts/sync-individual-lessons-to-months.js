const { PrismaClient } = require('../src/generated/prisma');
const prisma = new PrismaClient();

async function syncIndividualLessons() {
  console.log("=== STEP 1: MIGRATING & SYNCING WATCH PROGRESS TO MONTHLY COURSES ===");

  const pairs = [
    {
      sourceVideoId: "cmtra4die01i9qwpdnle0ybnn",
      targetVideoId: "cmtra50vd01icqwpdnuplfh68",
      sourceCourseId: "cmtqbw41d005qqwobfcrfg07c",
      targetCourseId: "cmtqhrxrh0013qw6iec0ikr89",
      track: "Arabic",
    },
    {
      sourceVideoId: "cmtra9rnv01ksqwpdnzmnzkxv",
      targetVideoId: "cmtra8wyw01k7qwpdv600m6fo",
      sourceCourseId: "cmtr54unr00wfqwwvtbvaxy8q",
      targetCourseId: "cmtr5aiko00zkqwwv03ucyju7",
      track: "Languages",
    }
  ];

  for (const pair of pairs) {
    console.log(`\nProcessing ${pair.track}: from ${pair.sourceVideoId} to ${pair.targetVideoId}`);

    // 1. Get all Progress from source
    const sourceProgress = await prisma.progress.findMany({
      where: { videoId: pair.sourceVideoId },
      include: { student: { select: { id: true, name: true, phone: true } } }
    });

    console.log(`Found ${sourceProgress.length} progress records in source video.`);

    for (const sp of sourceProgress) {
      const existingTarget = await prisma.progress.findUnique({
        where: {
          studentId_videoId: {
            studentId: sp.studentId,
            videoId: pair.targetVideoId,
          }
        }
      });

      const shouldBeWatched = sp.watched || existingTarget?.watched || false;

      if (!existingTarget) {
        await prisma.progress.create({
          data: {
            studentId: sp.studentId,
            videoId: pair.targetVideoId,
            watched: shouldBeWatched,
            watchedAt: sp.watchedAt || (shouldBeWatched ? new Date() : null),
          }
        });
        console.log(`  + Created Progress for ${sp.student.name} (${sp.student.phone}) on target video: watched=${shouldBeWatched}`);
      } else if (!existingTarget.watched && shouldBeWatched) {
        await prisma.progress.update({
          where: { id: existingTarget.id },
          data: {
            watched: true,
            watchedAt: sp.watchedAt || new Date(),
          }
        });
        console.log(`  ↑ Updated Progress to watched=true for ${sp.student.name} (${sp.student.phone})`);
      }
    }

    // 2. Get all WatchSessions from source
    const sourceSessions = await prisma.videoWatchSession.findMany({
      where: { videoId: pair.sourceVideoId },
      include: { student: { select: { id: true, name: true, phone: true } } }
    });

    console.log(`Found ${sourceSessions.length} watch sessions in source video.`);

    for (const ss of sourceSessions) {
      const existingSession = await prisma.videoWatchSession.findFirst({
        where: {
          studentId: ss.studentId,
          videoId: pair.targetVideoId,
        }
      });

      if (!existingSession) {
        await prisma.videoWatchSession.create({
          data: {
            studentId: ss.studentId,
            videoId: pair.targetVideoId,
            lastPositionSeconds: ss.lastPositionSeconds || 0,
            durationSeconds: ss.durationSeconds || 0,
            watchCount: ss.watchCount || 1,
            completed: ss.completed || false,
            expiresAt: ss.expiresAt || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
            createdAt: ss.createdAt || new Date(),
            updatedAt: new Date(),
          }
        });
        console.log(`  + Cloned WatchSession for ${ss.student?.name} (${ss.student?.phone})`);
      } else {
        const higherPos = Math.max(existingSession.lastPositionSeconds || 0, ss.lastPositionSeconds || 0);
        const higherDuration = Math.max(existingSession.durationSeconds || 0, ss.durationSeconds || 0);
        const completed = existingSession.completed || ss.completed || false;

        await prisma.videoWatchSession.update({
          where: { id: existingSession.id },
          data: {
            lastPositionSeconds: higherPos,
            durationSeconds: higherDuration,
            completed,
            updatedAt: new Date(),
          }
        });
        console.log(`  ↑ Updated WatchSession for ${ss.student?.name} (${ss.student?.phone}) pos=${higherPos}`);
      }
    }

    // 3. Mark StudentContentProgress on target ContentItem if present
    const targetContentItem = await prisma.contentItem.findFirst({
      where: { videoId: pair.targetVideoId },
      select: { id: true }
    });

    if (targetContentItem) {
      for (const sp of sourceProgress) {
        if (sp.watched) {
          const existingCp = await prisma.studentContentProgress.findUnique({
            where: {
              studentId_contentItemId: {
                studentId: sp.studentId,
                contentItemId: targetContentItem.id,
              }
            }
          });
          if (!existingCp) {
            await prisma.studentContentProgress.create({
              data: {
                studentId: sp.studentId,
                contentItemId: targetContentItem.id,
                completed: true,
                completedAt: sp.watchedAt || new Date(),
              }
            });
            console.log(`  + Created StudentContentProgress for ${sp.student?.name}`);
          } else if (!existingCp.completed) {
            await prisma.studentContentProgress.update({
              where: { id: existingCp.id },
              data: {
                completed: true,
                completedAt: sp.watchedAt || new Date(),
              }
            });
            console.log(`  ↑ Marked StudentContentProgress completed for ${sp.student?.name}`);
          }
        }
      }
    }
  }

  // NOTE (2026-09-07): the hardcoded block that force-enrolled a specific student
  // into "الشهر الاول عربي" was removed. It granted unpaid access to a paid course
  // without any panel log. Course access must go through the superadmin panel
  // (trusted, logged) or the purchase flow — never through sync scripts.

  console.log("\n=== COMPLETED WATCH SYNC TO MONTHLY COURSES ===");
}

syncIndividualLessons()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
