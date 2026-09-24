import "dotenv/config";
import { backfillFolderContentOrders } from "../src/lib/folder-content-order";
import { prisma } from "../src/lib/prisma";

async function main() {
  const result = await backfillFolderContentOrders();
  console.log("[folder-content] backfill", result);
}

main()
  .catch((error) => {
    console.error("[folder-content] backfill failed", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
