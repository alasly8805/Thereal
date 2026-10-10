import { RENDITION_HEIGHTS, generateRendition, renditionFilename, renditionSize, isRenditionFilename, type RenditionHeight } from "./video-renditions";

/**
 * Makes the low-bandwidth copy of a lesson happen automatically.
 *
 * Every lesson must have a small rendition in S3 — a student on a weak
 * connection cannot watch a 1-2 GB single-file lecture, and asking an admin to
 * remember a CLI command means newly uploaded lessons silently ship without
 * one. So the upload and Drive-mirror paths call this and forget about it.
 *
 * Work is serialized. The box is a 2-vCPU instance that also serves live
 * traffic, and two concurrent transcodes would starve the site; one niced
 * ffmpeg at a time is the most this hardware should ever be doing.
 */

/**
 * Every tier the player menu offers, lightest first so the copy that helps the
 * weakest connections exists soonest. A tier the menu shows but nobody built
 * is worse than no tier: picking "360p" used to stream the full 2 GB original.
 */
export const AUTO_HEIGHTS: RenditionHeight[] = [...RENDITION_HEIGHTS].sort((a, b) => a - b);

const queued = new Set<string>();
/** Tiers not worth building because the source is already that small. Per process. */
const settled = new Set<string>();
let chain: Promise<void> = Promise.resolve();

export function renditionQueueDepth(): number {
  return queued.size;
}

/**
 * Queues the automatic renditions for a freshly stored lesson and, after them,
 * its encrypted HLS package. Returns immediately; never throws, never blocks
 * the caller's request.
 */
export function enqueueRenditions(
  baseFilename: string,
  heights: RenditionHeight[] = AUTO_HEIGHTS,
  { thenEncrypt = true }: { thenEncrypt?: boolean } = {}
): void {
  const source = baseFilename.split("/").pop() || baseFilename;
  if (isRenditionFilename(source)) return; // never a rendition of a rendition
  queueRenditionJobs(source, heights);
  if (thenEncrypt) enqueueHlsPackage(source);
}

function queueRenditionJobs(source: string, heights: RenditionHeight[]): void {
  for (const height of heights) {
    if (!RENDITION_HEIGHTS.includes(height)) continue;
    const key = `${source}@${height}`;
    if (queued.has(key) || settled.has(key)) continue;
    queued.add(key);

    chain = chain
      .then(async () => {
        try {
          const outName = renditionFilename(source, height);
          if ((await renditionSize(outName)) !== null) return;

          console.info(`[rendition-queue] starting ${source} → ${height}p`);
          const result = await generateRendition(source, height, { evictLocal: true });
          // Only "already that small" is final; a missing source may be mirrored later.
          if (result.skipped && result.reason?.startsWith("source is already")) settled.add(key);
          console.info(
            result.skipped
              ? `[rendition-queue] skipped ${outName}: ${result.reason}`
              : `[rendition-queue] published ${outName} (${(result.bytes / 1e6).toFixed(0)} MB)`
          );
        } catch (error) {
          // A failed rendition must never affect the lesson itself; the
          // original still streams and the backfill script can retry later.
          console.error(`[rendition-queue] failed ${source} → ${height}p:`, error);
        } finally {
          queued.delete(key);
        }
      })
      .catch(() => {
        queued.delete(key);
      });
  }
}

/**
 * Queues the AES-128 HLS package for a lesson behind its renditions. It only
 * runs once every tier is built (or not worth building), so a package is never
 * published missing a quality that would have arrived an hour later.
 */
export function enqueueHlsPackage(baseFilename: string): void {
  const source = baseFilename.split("/").pop() || baseFilename;
  if (isRenditionFilename(source)) return;
  const key = `${source}@hls`;
  if (queued.has(key)) return;
  queued.add(key);

  chain = chain
    .then(async () => {
      try {
        const { hlsReady, packageHls } = await import("./hls-package");
        if (await hlsReady(source)) return;
        for (const h of AUTO_HEIGHTS) {
          if (settled.has(`${source}@${h}`)) continue;
          if ((await renditionSize(renditionFilename(source, h))) === null) {
            console.info(`[rendition-queue] encryption of ${source} waits for ${h}p`);
            return;
          }
        }
        console.info(`[rendition-queue] encrypting ${source} (HLS AES-128)`);
        const result = await packageHls(source);
        console.info(
          result.skipped
            ? `[rendition-queue] encryption skipped ${source}: ${result.reason}`
            : `[rendition-queue] encrypted ${source} → ${result.heights?.join("/")}p`
        );
      } catch (error) {
        // The lesson keeps streaming as MP4 until a later sweep succeeds.
        console.error(`[rendition-queue] encryption failed ${source}:`, error);
      } finally {
        queued.delete(key);
      }
    })
    .catch(() => {
      queued.delete(key);
    });
}

/**
 * Queues every missing tier for every Native lesson, lightest tier across all
 * lessons first, then every missing encrypted package. The queue lives in memory, so a deploy or restart mid-transcode
 * drops the job; this sweep (run at boot and nightly) is what makes that
 * harmless, and it backfilled the lessons uploaded before all tiers were auto.
 */
export async function enqueueMissingRenditions(): Promise<number> {
  const { prisma } = await import("./prisma");
  const videos = await prisma.video.findMany({
    where: { videoProvider: "alasly", providerVideoId: { not: "" } },
    select: { providerVideoId: true },
  });
  const bases = [
    ...new Set(videos.map((v) => (v.providerVideoId.startsWith("gdrive_") ? `${v.providerVideoId}.mp4` : v.providerVideoId))),
  ];

  let count = 0;
  for (const height of AUTO_HEIGHTS) {
    for (const base of bases) {
      if (isRenditionFilename(base) || settled.has(`${base}@${height}`)) continue;
      if ((await renditionSize(renditionFilename(base, height))) !== null) continue;
      enqueueRenditions(base, [height], { thenEncrypt: false });
      count++;
    }
  }
  // Encryption last, behind every rendition queued above.
  const { hlsReady } = await import("./hls-package");
  for (const base of bases) {
    if (isRenditionFilename(base) || (await hlsReady(base))) continue;
    enqueueHlsPackage(base);
    count++;
  }
  if (count) console.info(`[rendition-queue] sweep queued ${count} missing rendition/encryption job(s)`);
  return count;
}
