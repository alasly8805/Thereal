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

/** The copy every lesson gets. Higher tiers stay opt-in via the backfill script. */
export const DEFAULT_AUTO_HEIGHT: RenditionHeight = 480;

const queued = new Set<string>();
let chain: Promise<void> = Promise.resolve();

export function renditionQueueDepth(): number {
  return queued.size;
}

/**
 * Queues the automatic rendition for a freshly stored lesson. Returns
 * immediately; never throws, never blocks the caller's request.
 */
export function enqueueRenditions(
  baseFilename: string,
  heights: RenditionHeight[] = [DEFAULT_AUTO_HEIGHT]
): void {
  const source = baseFilename.split("/").pop() || baseFilename;
  if (isRenditionFilename(source)) return; // never a rendition of a rendition

  for (const height of heights) {
    if (!RENDITION_HEIGHTS.includes(height)) continue;
    const key = `${source}@${height}`;
    if (queued.has(key)) continue;
    queued.add(key);

    chain = chain
      .then(async () => {
        try {
          const outName = renditionFilename(source, height);
          if ((await renditionSize(outName)) !== null) return;

          console.info(`[rendition-queue] starting ${source} → ${height}p`);
          const result = await generateRendition(source, height, { evictLocal: true });
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
