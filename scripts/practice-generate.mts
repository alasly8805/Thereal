/**
 * Manual run of the nightly practice job (same code as the 02:00 cron).
 *
 *   npx tsx scripts/practice-generate.mts            # one night's worth of batches
 *   npx tsx scripts/practice-generate.mts 120        # first backfill: up to 120 batches (6 questions × ar+en each)
 *   npx tsx scripts/practice-generate.mts --dry-run  # count what would be sent, no AI calls
 */
import { prisma } from "../src/lib/prisma";
import { buildAllDailySets, generatePracticeQuestions } from "../src/lib/practice-generate";

const arg = process.argv[2];
const maxBatches = arg === "--dry-run" ? 0 : arg ? Number(arg) : undefined;

const reports = await generatePracticeQuestions({ maxBatches });
console.table(reports);
if (maxBatches !== 0) {
  await buildAllDailySets();
}
await prisma.$disconnect();
