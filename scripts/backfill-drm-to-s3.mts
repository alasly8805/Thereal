/**
 * Copies every existing DRM package in uploads/drm to S3 (videos/drm/<asset>/…).
 * New packages are copied automatically when packaging finishes; this is only
 * the backfill for packages made before that. Safe to re-run.
 *
 *   node --import tsx scripts/backfill-drm-to-s3.mts
 */
import fs from "node:fs";
import path from "node:path";
import { config } from "dotenv";
config({ path: ".env" });

const { uploadDrmPackageToS3 } = await import("../src/lib/video-storage.ts");
const dir = path.resolve("uploads", "drm");
let failed = 0;
for (const asset of fs.readdirSync(dir)) {
  if (!fs.statSync(path.join(dir, asset)).isDirectory()) continue;
  const r = await uploadDrmPackageToS3(asset);
  failed += r.failed.length;
  console.log(`${asset}: uploaded/verified ${r.uploaded.length}${r.failed.length ? `, FAILED ${r.failed.join(",")}` : ""}`);
}
process.exit(failed ? 1 : 0);
