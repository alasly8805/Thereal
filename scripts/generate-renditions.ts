/**
 * Generates low-bandwidth renditions for Native (alasly) lessons.
 *
 * Students on weak mobile connections cannot watch a 1–2 GB single-file
 * lecture; this pre-builds the smaller copy the player's quality menu switches
 * to. One lesson at a time, niced, with a disk guard — the box serves live
 * traffic from the same 30 GB volume.
 *
 *   npx tsx scripts/generate-renditions.ts                 # show the plan
 *   npx tsx scripts/generate-renditions.ts --run           # build 480p, biggest first
 *   npx tsx scripts/generate-renditions.ts --run --height=360 --limit=2
 *   npx tsx scripts/generate-renditions.ts --run --only=gdrive_abc123 --evict
 */
import "dotenv/config";
import fs from "fs";
import path from "path";
import { prisma } from "../src/lib/prisma";
import {
  generateRendition,
  renditionFilename,
  renditionSize,
  isRenditionHeight,
  type RenditionHeight,
} from "../src/lib/video-renditions";

const UPLOAD_DIR = path.join(process.cwd(), "uploads", "videos");
const MIRROR_EXTENSIONS = [".mp4", ".webm", ".mov", ".mkv", ".m4v"];

function arg(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : undefined;
}
const has = (name: string) => process.argv.includes(`--${name}`);

/** The file on local disk backing a providerVideoId, or null if it is not mirrored yet. */
function localSourceFor(providerVideoId: string): string | null {
  const direct = path.join(UPLOAD_DIR, path.basename(providerVideoId));
  if (fs.existsSync(direct) && fs.statSync(direct).isFile()) return path.basename(direct);
  for (const ext of MIRROR_EXTENSIONS) {
    const candidate = path.join(UPLOAD_DIR, path.basename(providerVideoId) + ext);
    if (fs.existsSync(candidate)) return path.basename(candidate);
  }
  return null;
}

const mb = (n: number) => `${(n / 1e6).toFixed(0)} MB`;

async function main() {
  const heightRaw = Number.parseInt(arg("height") || "480", 10);
  if (!isRenditionHeight(heightRaw)) {
    throw new Error(`--height must be one of 360, 480, 720 (got ${heightRaw})`);
  }
  const height: RenditionHeight = heightRaw;
  const limit = Number.parseInt(arg("limit") || "0", 10) || Infinity;
  const only = arg("only");
  const run = has("run");

  const videos = await prisma.video.findMany({
    where: { videoProvider: "alasly" },
    select: { id: true, title: true, providerVideoId: true },
  });

  // One asset can back several lesson rows; transcode it once.
  const assets = new Map<string, string>();
  for (const v of videos) {
    if (!v.providerVideoId) continue;
    if (only && v.providerVideoId !== only) continue;
    if (!assets.has(v.providerVideoId)) assets.set(v.providerVideoId, v.title);
  }

  const plan: Array<{ asset: string; title: string; source: string; bytes: number }> = [];
  for (const [asset, title] of assets) {
    const source = localSourceFor(asset);
    if (!source) {
      console.log(`⏭  ${asset} — لا توجد نسخة محلية (${title})`);
      continue;
    }
    const existing = await renditionSize(renditionFilename(source, height));
    if (existing !== null && !has("force")) {
      console.log(`✓  ${asset} — ${height}p موجودة بالفعل (${mb(existing)})`);
      continue;
    }
    plan.push({ asset, title, source, bytes: fs.statSync(path.join(UPLOAD_DIR, source)).size });
  }

  // Biggest first: those are the lessons actually breaking on weak connections.
  plan.sort((a, b) => b.bytes - a.bytes);
  const todo = plan.slice(0, limit === Infinity ? plan.length : limit);

  console.log(`\n${todo.length} درس محتاج نسخة ${height}p:`);
  for (const t of todo) console.log(`   • ${t.source}  ${mb(t.bytes)}  — ${t.title}`);
  if (!run) {
    console.log(`\n(معاينة فقط — أضف --run للتنفيذ)`);
    return;
  }

  for (const t of todo) {
    const started = Date.now();
    process.stdout.write(`\n▶ ${t.source} → ${height}p ... `);
    try {
      const result = await generateRendition(t.source, height, {
        evictLocal: has("evict"),
        force: has("force"),
        onProgress: (p) => process.stdout.write(`\r▶ ${t.source} → ${height}p ... ${p}%   `),
      });
      if (result.skipped) {
        console.log(`\r⏭ ${t.source} → ${height}p — ${result.reason}                `);
      } else {
        const mins = ((Date.now() - started) / 60000).toFixed(1);
        const saved = ((1 - result.bytes / t.bytes) * 100).toFixed(0);
        console.log(
          `\r✅ ${result.filename}  ${mb(result.bytes)} (أصغر بـ ${saved}%) في ${mins} دقيقة        `
        );
      }
    } catch (err) {
      console.log(`\r❌ ${t.source} — ${err instanceof Error ? err.message : err}            `);
    }
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
