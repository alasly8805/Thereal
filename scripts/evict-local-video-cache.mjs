#!/usr/bin/env node
/**
 * Evict local lesson videos that are already safe in S3.
 *
 * uploads/videos is a cache, not storage: /api/videos/stream serves local disk →
 * S3 → Google Drive, and every file that lands locally is mirrored to S3 in the
 * background (see src/lib/video-storage.ts). Once a file is byte-identical in
 * S3 the local copy is redundant — dropping it only costs the next viewer one
 * re-fetch from S3.
 *
 * A file is evicted ONLY when S3 reports the exact same byte size. Anything
 * missing from S3, or differing in size, is always kept.
 *
 *   node scripts/evict-local-video-cache.mjs                 # dry run (default)
 *   node scripts/evict-local-video-cache.mjs --apply         # evict to target
 *   node scripts/evict-local-video-cache.mjs --apply --all   # evict everything safe
 *   node scripts/evict-local-video-cache.mjs --apply --target=60
 */

import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import { S3Client, HeadObjectCommand } from "@aws-sdk/client-s3";
import { fromInstanceMetadata } from "@smithy/credential-provider-imds";

const UPLOAD_DIR = path.resolve(process.cwd(), "uploads", "videos");
const BUCKET = process.env.AWS_S3_STORAGE_BUCKET || "codeup-storage-687374520011";
const REGION = process.env.AWS_REGION || "eu-north-1";
const PART_STALE_HOURS = 6;

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const ALL = args.includes("--all");
const TARGET_PCT = Number((args.find((a) => a.startsWith("--target=")) || "--target=70").split("=")[1]);

// Same credential resolution as src/lib/s3.ts: the ini file on this box holds a
// human `aws login` session that expires, so go straight to the instance role.
const s3 = new S3Client({
  region: REGION,
  credentials: process.env.AWS_ACCESS_KEY_ID ? undefined : fromInstanceMetadata({ timeout: 2000, maxRetries: 3 }),
});

const mb = (b) => `${(b / 1048576).toFixed(0)} MB`;
const diskBytes = () => {
  const [used, total] = execSync("df --output=used,size -B1 / | tail -1").toString().trim().split(/\s+/).map(Number);
  return { used, total };
};
const diskUsedPct = () => {
  const { used, total } = diskBytes();
  return Math.round((used / total) * 100);
};
// Usage we would land on after freeing `freed` bytes — lets a dry run report the
// same stopping point the real run would pick.
const projectedPct = (freed) => {
  const { used, total } = diskBytes();
  return Math.round(((used - freed) / total) * 100);
};

async function sizeInS3(key) {
  try {
    const head = await s3.send(new HeadObjectCommand({ Bucket: BUCKET, Key: key }));
    return Number(head.ContentLength);
  } catch (err) {
    if (err?.$metadata?.httpStatusCode === 404 || err?.name === "NotFound") return null;
    throw err; // real failure (creds, network) — never treat as "missing"
  }
}

async function main() {
  console.log(`\n=== Local video cache eviction ${APPLY ? "(APPLY)" : "(DRY RUN)"} ===`);
  console.log(`dir=${UPLOAD_DIR}  bucket=${BUCKET}  disk=${diskUsedPct()}%  target<=${TARGET_PCT}%\n`);

  if (!fs.existsSync(UPLOAD_DIR)) {
    console.log("No uploads/videos directory. Nothing to do.");
    return;
  }

  const entries = fs.readdirSync(UPLOAD_DIR).filter((f) => fs.statSync(path.join(UPLOAD_DIR, f)).isFile());
  const safe = [];
  let keptBytes = 0;

  for (const name of entries) {
    const full = path.join(UPLOAD_DIR, name);
    const stat = fs.statSync(full);

    if (name.endsWith(".part")) {
      const ageH = (Date.now() - stat.mtimeMs) / 3600000;
      if (ageH >= PART_STALE_HOURS) {
        console.log(`🧹 STALE PART  ${name}  ${mb(stat.size)}  (${ageH.toFixed(0)}h old)`);
        if (APPLY) fs.rmSync(full, { force: true });
      } else {
        console.log(`⏳ ACTIVE PART ${name}  ${mb(stat.size)}  — in progress, keeping`);
        keptBytes += stat.size;
      }
      continue;
    }

    const remote = await sizeInS3(`videos/${name}`);
    if (remote === null) {
      console.log(`🛑 NOT IN S3   ${name}  ${mb(stat.size)}  — KEEPING (this is the only copy)`);
      keptBytes += stat.size;
    } else if (remote !== stat.size) {
      console.log(`⚠️  SIZE DIFFERS ${name}  local ${mb(stat.size)} vs S3 ${mb(remote)}  — KEEPING`);
      keptBytes += stat.size;
    } else {
      console.log(`✅ IN S3       ${name}  ${mb(stat.size)}  — evictable`);
      safe.push({ name, full, size: stat.size });
    }
  }

  // Largest first: frees the most space with the fewest re-fetches.
  safe.sort((a, b) => b.size - a.size);

  let freed = 0;
  const evicted = [];
  for (const f of safe) {
    // Stop as soon as the target is met (measured when applying, projected when not).
    if (!ALL && (APPLY ? diskUsedPct() : projectedPct(freed)) <= TARGET_PCT) break;
    if (APPLY) fs.rmSync(f.full, { force: true });
    freed += f.size;
    evicted.push(f.name);
  }

  console.log(`\n--- summary ---`);
  console.log(`scanned:   ${entries.length} file(s)`);
  console.log(`evictable: ${safe.length} file(s), ${mb(safe.reduce((s, f) => s + f.size, 0))}`);
  console.log(`${APPLY ? "evicted" : "would evict"}:   ${evicted.length} file(s), ${mb(freed)}`);
  console.log(`kept:      ${mb(keptBytes)} (not in S3 / size mismatch / active)`);
  console.log(`disk ${APPLY ? "now" : "would be"}:  ${APPLY ? diskUsedPct() : projectedPct(freed)}%`);
  if (!APPLY) console.log(`\n(dry run — nothing deleted. re-run with --apply)`);
}

main().catch((err) => {
  console.error("❌ eviction failed:", err?.message || err);
  process.exit(1);
});
