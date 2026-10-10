/**
 * Backfill course placements (bookingKind and bookingTerm) for existing courses.
 * Uses inferCoursePlacement from src/lib/teacher-terms.ts to accurately map courses
 * (e.g. Month 1, Month 2, Term 1, Term 2, etc.) and ensures months 1-4 are assigned
 * to Term 1, and months 5-8 to Term 2.
 *
 * Run via: npx tsx scripts/backfill-course-placements.ts
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { inferCoursePlacement } from "../src/lib/teacher-terms";

async function main() {
  console.log("🚀 Starting Course Placements Backfill Migration...");

  const courses = await prisma.course.findMany({
    select: {
      id: true,
      title: true,
      bookingKind: true,
      bookingTerm: true,
      educationalStage: true,
      teacher: { select: { name: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  console.log(`Found ${courses.length} total courses in database.`);

  let updatedCount = 0;
  let alreadyConfiguredCount = 0;
  let unplacedCount = 0;

  for (const course of courses) {
    const teacherName = course.teacher?.name || "Unknown Teacher";
    const currentKind = course.bookingKind;
    const currentTerm = course.bookingTerm;

    // Check if course has bookingKind already
    if (!currentKind) {
      const inferred = inferCoursePlacement(course.title);
      if (inferred) {
        await prisma.course.update({
          where: { id: course.id },
          data: {
            bookingKind: inferred.bookingKind,
            bookingTerm: inferred.bookingTerm,
          },
        });
        console.log(`✅ [SET] ${teacherName} | "${course.title}" -> bookingKind: "${inferred.bookingKind}", bookingTerm: ${inferred.bookingTerm}`);
        updatedCount++;
      } else {
        console.log(`ℹ️ [UNPLACED] ${teacherName} | "${course.title}" -> No month/term pattern inferred (retains general access)`);
        unplacedCount++;
      }
    } else {
      // Fix potential misconfigured bookingTerm for existing month courses (e.g. month:2 with bookingTerm: 2)
      let correctTerm = currentTerm;
      const monthMatch = currentKind.match(/month:(\d+)/);
      if (monthMatch) {
        const m = Number(monthMatch[1]);
        correctTerm = m >= 5 ? 2 : 1;
      } else if (currentKind.startsWith("term:")) {
        const termMatch = currentKind.match(/term:([12])/);
        if (termMatch) correctTerm = Number(termMatch[1]);
      }

      if (correctTerm !== currentTerm) {
        await prisma.course.update({
          where: { id: course.id },
          data: { bookingTerm: correctTerm },
        });
        console.log(`🔄 [FIX TERM] ${teacherName} | "${course.title}" -> bookingTerm updated from ${currentTerm} to ${correctTerm}`);
        updatedCount++;
      } else {
        console.log(`✔️ [OK] ${teacherName} | "${course.title}" -> already "${currentKind}" (term ${currentTerm})`);
        alreadyConfiguredCount++;
      }
    }
  }

  console.log("\n==========================================");
  console.log(`🎉 Backfill migration complete!`);
  console.log(`   Updated courses: ${updatedCount}`);
  console.log(`   Already configured: ${alreadyConfiguredCount}`);
  console.log(`   Unplaced (general): ${unplacedCount}`);
  console.log("==========================================");

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("❌ Migration failed:", err);
  process.exit(1);
});
