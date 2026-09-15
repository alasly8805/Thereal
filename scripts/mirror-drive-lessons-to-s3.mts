/**
 * Backfill: puts every Google-Drive-backed lesson into S3 (the video origin).
 *
 * Normally this happens on its own — the first play of a Drive lesson mirrors
 * it, uploads it to S3 and queues its 480p copy — but the mirror refuses to run
 * when the disk is short on headroom, so lessons created while the disk was
 * full stayed Drive-only. For each lesson not yet in S3 this script:
 *   1. mirrors the Drive file to local disk (the same code path as playback),
 *   2. uploads it to S3 and verifies the S3 bytes by SHA-256,
 *   3. waits for the automatic 480p rendition to be published,
 *   4. deletes the local copy (S3 is the origin; local disk is only a cache).
 *
 *   node --import tsx scripts/mirror-drive-lessons-to-s3.mts [--dry-run]
 */
import fs from "node:fs";
import { createHash } from "node:crypto";
import { config } from "dotenv";
config({ path: ".env" });

const DRY = process.argv.includes("--dry-run");
const { prisma } = await import("../src/lib/prisma.ts");
const { ensureDriveMirror, findDriveMirror } = await import("../src/lib/google-drive.ts");
const storage = await import("../src/lib/video-storage.ts");
const { renditionQueueDepth } = await import("../src/lib/rendition-queue.ts");
const { renditionFilename, renditionSize } = await import("../src/lib/video-renditions.ts");
const { GetObjectCommand } = await import("@aws-sdk/client-s3");
const { s3Client, S3_BUCKET_NAME } = await import("../src/lib/s3.ts");

const log = (m: string) => console.log(`[${new Date().toISOString()}] ${m}`);

async function sha256Local(p: string): Promise<string> {
  const h = createHash("sha256");
  for await (const chunk of fs.createReadStream(p)) h.update(chunk as Buffer);
  return h.digest("hex");
}
async function sha256S3(key: string): Promise<string> {
  const obj = await s3Client.send(new GetObjectCommand({ Bucket: S3_BUCKET_NAME, Key: key }));
  const h = createHash("sha256");
  for await (const chunk of obj.Body as AsyncIterable<Uint8Array>) h.update(chunk);
  return h.digest("hex");
}

const rows = await prisma.video.findMany({
  where: { providerVideoId: { startsWith: "gdrive_" } },
  select: { providerVideoId: true, title: true },
});
const ids = [...new Set(rows.map((r) => r.providerVideoId))];
const todo: string[] = [];
for (const id of ids) {
  const inS3 = (await storage.videoSizeInS3(`${id}.mp4`)) !== null;
  log(`${inS3 ? "in S3   " : "MISSING "} ${id} (${rows.find((r) => r.providerVideoId === id)?.title})`);
  if (!inS3) todo.push(id);
}
if (DRY || todo.length === 0) {
  log(`${todo.length} lesson(s) to mirror${DRY ? " (dry run)" : ""}`);
  await prisma.$disconnect();
  process.exit(0);
}

const verified: Array<{ id: string; local: string; base: string }> = [];
let failures = 0;
for (const id of todo) {
  const fileId = id.replace(/^gdrive_/, "");
  log(`mirroring ${id} from Google Drive…`);
  await ensureDriveMirror(fileId);
  const local = findDriveMirror(fileId);
  if (!local) {
    log(`FAILED ${id}: mirror not created (see [drive-mirror] log above)`);
    failures++;
    continue;
  }
  const base = local.split("/").pop()!;
  if (base !== `${id}.mp4`) {
    // Playback looks the S3 copy up as <id>.mp4 once the local mirror is gone.
    log(`FAILED ${id}: mirror is ${base}, not ${id}.mp4 — left local, needs review`);
    failures++;
    continue;
  }
  await storage.uploadVideoToS3(local); // joins the upload the mirror already started
  const [a, b] = await Promise.all([sha256Local(local), sha256S3(storage.videoObjectKey(base))]);
  if (a !== b) {
    log(`FAILED ${id}: S3 copy does not match (local ${a.slice(0, 12)} vs s3 ${b.slice(0, 12)}) — local kept`);
    failures++;
    continue;
  }
  log(`in S3 and verified: ${base} (sha256 ${a.slice(0, 16)})`);
  verified.push({ id, local, base });
}

// The mirror queued each lesson's 480p copy; it runs one niced ffmpeg at a time.
log(`waiting for ${renditionQueueDepth()} rendition(s)…`);
while (renditionQueueDepth() > 0) await new Promise((r) => setTimeout(r, 15_000));

for (const v of verified) {
  const rend = renditionFilename(v.base, 480);
  const rSize = await renditionSize(rend);
  log(`${rSize !== null ? "480p published" : "480p MISSING"}: ${rend}`);
  if (rSize === null) failures++;
  // S3 holds the verified original; the local mirror is only a cache.
  fs.unlinkSync(v.local);
  log(`local copy removed: ${v.base}`);
}

log(`done: ${verified.length} mirrored, ${failures} problem(s)`);
await prisma.$disconnect();
process.exit(failures ? 1 : 0);
