export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const globalForCron = globalThis as unknown as {
      leaderboardCronInitialized: boolean | undefined;
    };

    if (!globalForCron.leaderboardCronInitialized) {
      globalForCron.leaderboardCronInitialized = true;
      console.log("⏰ Initializing Leaderboard Caching & Scheduler...");

      const { refreshLeaderboard } = await import("./lib/leaderboard-refresh");
      const { prisma } = await import("./lib/prisma");
      const cron = (await import("node-cron")).default;

      // 1. Initial calculation if the cache is empty
      try {
        const cache = await prisma.leaderboardCache.findUnique({
          where: { key: "leaderboard_data" },
        });

        if (!cache) {
          console.log("⏰ Leaderboard cache is empty. Populating cache for the first time...");
          // Force is set to true to ensure it runs immediately during startup
          await refreshLeaderboard(true);
        } else {
          console.log(`⏰ Leaderboard cache already populated. Last updated at: ${cache.updatedAt.toISOString()}`);
        }

        // The legacy 200/600 -> 180/750/1200 teacher-pricing backfill that used
        // to run here has moved to migration 20260813000002_backfill_teacher_pricing.
        //
        // It ran on *every* boot, in *every* PM2 worker, and rewrote all three
        // price columns for any profile matching the old values — so a teacher
        // who deliberately priced at 200 had their monthly, termly and yearly
        // prices silently reset on the next restart. Schema defaults are already
        // 180/750/1200, so no new profile can need it.
      } catch (err) {
        console.error("❌ Failed to perform initial leaderboard cache check/refresh:", err);
      }

      // 2. Setup the daily scheduled cron (03:00 AM Africa/Cairo timezone)
      // Guard for PM2 cluster mode: only schedule on NODE_APP_INSTANCE = 0 or undefined
      const isMainInstance = process.env.NODE_APP_INSTANCE === undefined || process.env.NODE_APP_INSTANCE === "0";
      if (isMainInstance) {
        console.log("⏰ Main instance detected. Scheduling daily 24H leaderboard refresh at 03:00 AM Cairo time.");
        cron.schedule(
          "0 3 * * *",
          async () => {
            console.log("⏰ [03:00 AM Cairo] Triggering daily scheduled 24H leaderboard refresh & rollover...");
            try {
              await refreshLeaderboard();
            } catch (err) {
              console.error("❌ Scheduled 03:00 AM Cairo leaderboard refresh failed:", err);
            }
          },
          {
            timezone: "Africa/Cairo",
          }
        );

        // Daily practice: rewrite newly released quiz/homework questions into
        // the practice bank and publish today's set. 02:00 is the quietest hour.
        console.log("⏰ Scheduling daily practice question generation at 02:00 AM Cairo time.");
        cron.schedule(
          "0 2 * * *",
          async () => {
            try {
              const { runNightlyPractice } = await import("./lib/practice-generate");
              await runNightlyPractice();
            } catch (err) {
              console.error("❌ Scheduled practice generation failed:", err);
            }
          },
          {
            timezone: "Africa/Cairo",
          }
        );

        // Video quality copies (360p/480p/720p): the transcode queue is in
        // memory, so a restart mid-job drops it. Re-queue anything missing a
        // few minutes after boot (clear of the deploy smoke test) and nightly.
        const sweepRenditions = async () => {
          try {
            const { enqueueMissingRenditions } = await import("./lib/rendition-queue");
            await enqueueMissingRenditions();
          } catch (err) {
            console.error("❌ Rendition sweep failed:", err);
          }
        };
        setTimeout(() => void sweepRenditions(), 5 * 60 * 1000);
        cron.schedule("0 4 * * *", () => void sweepRenditions(), { timezone: "Africa/Cairo" });

        // 3. Setup the weekly database backup cron (Every Sunday at 02:00 AM Africa/Cairo timezone)
        console.log("⏰ Scheduling weekly database backup at 02:00 AM (Sunday) Cairo time.");
        const { performDatabaseBackup } = await import("./lib/db-backup");
        cron.schedule(
          "0 2 * * 0",
          async () => {
            console.log("⏰ Triggering weekly scheduled database backup...");
            try {
              await performDatabaseBackup();
            } catch (err) {
              console.error("❌ Scheduled database backup failed:", err);
            }
          },
          {
            timezone: "Africa/Cairo",
          }
        );
      } else {
        console.log(`⏰ Worker instance (NODE_APP_INSTANCE=${process.env.NODE_APP_INSTANCE}) detected. Skipping cron scheduling.`);
      }
    }
  }
}
