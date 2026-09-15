const { PrismaClient } = require('../src/generated/prisma');
const { randomBytes } = require('crypto');
const prisma = new PrismaClient();

async function runChecker() {
  const startTime = new Date();
  console.log(`\n======================================================`);
  console.log(`[${startTime.toISOString()}] 🔍 Running Hourly Course Enrollment Checker`);
  console.log(`======================================================`);

  let checkedCount = 0;
  let missingEnrollmentsFixed = 0;
  let missingCodesFixed = 0;
  let anomaliesFound = 0;
  const auditSummary = [];

  try {
    // 1. Fetch all manual enrollments logged by superadmin
    const logs = await prisma.activityLog.findMany({
      where: { action: 'SUPERADMIN_MANUAL_ENROLL' },
      orderBy: { createdAt: 'asc' },
    });

    console.log(`Found ${logs.length} manual enrollment records logged by superadmin.`);

    for (const log of logs) {
      checkedCount++;
      const courseId = log.targetId;
      const targetName = log.targetName || '';

      const match = targetName.match(/تسجيل الطالب:\s*(.*?)\s*في كورس:\s*(.*)/);
      if (!match) {
        console.warn(`⚠️ Log format unrecognized: "${targetName}" (id: ${log.id})`);
        continue;
      }

      const studentName = match[1].trim();
      const courseTitle = match[2].trim();

      const student = await prisma.user.findFirst({
        where: { name: studentName, role: 'student' },
        select: { id: true, name: true, email: true, phone: true },
      });

      if (!student) {
        console.warn(`⚠️ Student not found in database: "${studentName}" (Course: ${courseTitle})`);
        continue;
      }

      const course = await prisma.course.findUnique({
        where: { id: courseId },
        select: { id: true, title: true, teacherId: true },
      });

      if (!course) {
        console.warn(`⚠️ Course not found: "${courseId}" (${courseTitle})`);
        continue;
      }

      // Check CourseEnrollment
      const existingEnrollment = await prisma.courseEnrollment.findUnique({
        where: {
          studentId_courseId: {
            studentId: student.id,
            courseId: course.id,
          },
        },
      });

      if (!existingEnrollment) {
        await prisma.courseEnrollment.create({
          data: {
            studentId: student.id,
            courseId: course.id,
            fulfillmentSource: 'ADMIN',
            amountPaid: 0,
          },
        });
        missingEnrollmentsFixed++;
        console.log(`  [REPAIRED] Created missing CourseEnrollment for student ${student.name} in course: ${course.title}`);
      }

      // Check AccessCode
      const existingCode = await prisma.accessCode.findFirst({
        where: {
          studentId: student.id,
          courseId: course.id,
          isActive: true,
          OR: [{ accessType: 'TERM' }, { accessType: 'COURSE' }, { folderId: null, videoId: null }],
        },
      });

      if (!existingCode) {
        const hex = randomBytes(4).toString('hex').toUpperCase();
        const code = `ADM-${hex}`;
        await prisma.accessCode.create({
          data: {
            code,
            courseId: course.id,
            studentId: student.id,
            isActive: true,
            usedAt: new Date(),
            accessType: 'TERM',
          },
        });
        missingCodesFixed++;
        console.log(`  [REPAIRED] Generated missing AccessCode (${code}) for student ${student.name} in course: ${course.title}`);
      }

      auditSummary.push({
        student: student.name,
        course: course.title,
        status: 'VERIFIED',
      });
    }

    // 2. Cross-track verification for Mohamed Abdelbaset
    const langCourseId = 'cmtr5aiko00zkqwwv03ucyju7'; // الشهر الاول لغات
    const arCourseId = 'cmtqhrxrh0013qw6iec0ikr89';   // الشهر الاول عربي

    const [langEnrollments, arEnrollments] = await Promise.all([
      prisma.courseEnrollment.findMany({ where: { courseId: langCourseId }, select: { studentId: true } }),
      prisma.courseEnrollment.findMany({ where: { courseId: arCourseId }, select: { studentId: true } }),
    ]);

    const langStudentIds = new Set(langEnrollments.map((e) => e.studentId));
    const arStudentIds = new Set(arEnrollments.map((e) => e.studentId));

    for (const sId of langStudentIds) {
      if (arStudentIds.has(sId)) {
        anomaliesFound++;
        console.warn(`⚠️ ANOMALY DETECTED: Student ${sId} has direct CourseEnrollment in BOTH Arabic and Languages tracks!`);
      }
    }

    // 3. Cross-course video watch synchronization & promotion
    let videoPromotedCount = 0;
    let videoSyncedCount = 0;

    const ABDELBASET_CLUSTERS = [
      [
        "cmtra50vd01icqwpdnuplfh68", // المحاضرة الاساسية (الشهر الاول عربي)
        "cmtra4die01i9qwpdnle0ybnn", // المحاضرة الاساسية (شرح الدرس الأول تطور تكنولوجيا...)
        "cmtra8wyw01k7qwpdv600m6fo", // الحصة الاساسية1 (الشهر الاول لغات)
        "cmtra9rnv01ksqwpdnzmnzkxv", // الحصة الاساسية (شرح الدرس الأول programming & AI للغات...)
      ],
      [
        "cmsytmtbx02q7qx4xe1mf2mqb", // المحاضرة التعريفة
        "cmt3ellan000rqxjsyjxovzys", // المحاضرة التعريفة للغات
      ],
      [
        "cmtaoyhvf001zqxrwv4rcehao", // First section programming language
        "cmtap0v5x0026qxrwww9zfk1k", // الحصة الاساسية (الشهر الاول programming لغات)
      ],
      [
        "cmt45t1ct001uqx3ej73kfam0", // اول حصة في الشهر الاول عربي
        "cmt45vvgy001yqx3e1nnpc1qt", // الحصة الاساسية (الشهر الاول برمجة عربي)
      ],
    ];

    // Some cluster IDs point at lessons that have since been deleted. Creating a
    // Progress row for a missing video violates Progress_videoId_fkey and aborts
    // the whole run, so drop unknown IDs before syncing.
    const clusterIds = [...new Set(ABDELBASET_CLUSTERS.flat())];
    const existingClusterVideos = await prisma.video.findMany({
      where: { id: { in: clusterIds } },
      select: { id: true },
    });
    const existingClusterIds = new Set(existingClusterVideos.map((v) => v.id));

    const missingClusterIds = clusterIds.filter((id) => !existingClusterIds.has(id));
    if (missingClusterIds.length > 0) {
      console.warn(`⚠️ Skipping ${missingClusterIds.length} cluster video(s) no longer in the database: ${missingClusterIds.join(', ')}`);
    }

    const activeClusters = ABDELBASET_CLUSTERS
      .map((cluster) => cluster.filter((id) => existingClusterIds.has(id)))
      .filter((cluster) => cluster.length > 1);

    // 3a. Promote completed in-progress videos
    const allProgress = await prisma.progress.findMany({
      where: { watched: false },
      include: { video: { select: { durationMinutes: true } } },
    });

    for (const p of allProgress) {
      const durSec = (p.video?.durationMinutes || 0) * 60;
      const thresholdSec = durSec > 0 ? durSec * 0.8 : 30;
      if ((p.lastPositionSeconds || 0) >= thresholdSec || (p.watchedSecondsTotal || 0) >= thresholdSec) {
        await prisma.progress.update({
          where: { id: p.id },
          data: { watched: true, watchedAt: p.lastWatchedAt || p.positionUpdatedAt || new Date() },
        });
        videoPromotedCount++;
      }
    }

    // 3b. Sync watched records across clusters
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

    for (const rec of watchedRecords) {
      const targetIds = new Set();
      for (const cluster of activeClusters) {
        if (cluster.includes(rec.videoId)) {
          for (const id of cluster) {
            if (id !== rec.videoId) targetIds.add(id);
          }
        }
      }

      for (const targetId of targetIds) {
        const existing = await prisma.progress.findUnique({
          where: { studentId_videoId: { studentId: rec.studentId, videoId: targetId } },
        });

        if (!existing || !existing.watched) {
          await prisma.progress.upsert({
            where: { studentId_videoId: { studentId: rec.studentId, videoId: targetId } },
            create: {
              studentId: rec.studentId,
              videoId: targetId,
              watched: true,
              watchedAt: rec.watchedAt || new Date(),
              watchedSecondsTotal: rec.watchedSecondsTotal || 3600,
              lastPositionSeconds: rec.lastPositionSeconds || 0,
            },
            update: {
              watched: true,
              watchedAt: rec.watchedAt || new Date(),
              ...(rec.watchedSecondsTotal ? { watchedSecondsTotal: rec.watchedSecondsTotal } : {}),
              ...(rec.lastPositionSeconds ? { lastPositionSeconds: rec.lastPositionSeconds } : {}),
            },
          });
          videoSyncedCount++;
        }
      }
    }

    const report = {
      timestamp: startTime.toISOString(),
      completedAt: new Date().toISOString(),
      logsChecked: checkedCount,
      missingEnrollmentsFixed,
      missingCodesFixed,
      anomaliesFound,
      videoPromotedCount,
      videoSyncedCount,
      status: (missingEnrollmentsFixed === 0 && missingCodesFixed === 0 && anomaliesFound === 0) ? 'HEALTHY' : 'RECONCILED',
    };

    // Save report to AppSetting for superadmin visibility
    await prisma.appSetting.upsert({
      where: { key: 'last_hourly_enrollment_checker_report' },
      create: { key: 'last_hourly_enrollment_checker_report', value: JSON.stringify(report, null, 2) },
      update: { value: JSON.stringify(report, null, 2) },
    });

    console.log(`\n📊 CHECKER RESULT: Status=${report.status} | Checked=${checkedCount} | RepairedEnrollments=${missingEnrollmentsFixed} | RepairedCodes=${missingCodesFixed} | Anomalies=${anomaliesFound} | VideoPromotions=${videoPromotedCount} | VideoSyncs=${videoSyncedCount}`);
  } catch (error) {
    console.error('❌ Error executing enrollment checker:', error);
  } finally {
    await prisma.$disconnect();
  }
}

runChecker();
