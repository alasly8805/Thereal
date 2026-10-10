import fs from "fs";
import path from "path";
import { spawn, spawnSync } from "child_process";
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from "crypto";
import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { s3Client, S3_BUCKET_NAME } from "./s3";
import { RENDITION_HEIGHTS, renditionFilename, renditionSize, resolveSourceInput, type RenditionHeight } from "./video-renditions";
import { objectSizeInS3, uploadFileToS3, cloudFrontEnabled, signedPrefixQuery } from "./video-storage";

/**
 * AES-128 encrypted HLS for Native (alasly / Drive) lessons.
 *
 * The 360p/480p/720p renditions are cut into 6-second segments (stream copy,
 * no re-encode) and encrypted here, segment by segment. Every CHUNK_SECONDS
 * of the lesson has its own key, derived from one random per-lesson secret, so
 * holding one key unlocks two minutes and nothing else. Segments live in S3
 * under `videos/hls2/<asset>/` and are served by CloudFront.
 *
 * The secret is never stored where the CDN can reach it: it sits sealed
 * (AES-256-GCM, server secret) on local disk with a backup under
 * `hls-keys/v2/` in the private bucket, outside the `videos/` prefix
 * CloudFront serves. Chunk keys only leave through /api/videos/hls/<id>/key,
 * which applies the MP4 stream's login + enrollment + watch-session checks and
 * then paces them (src/lib/hls-key-pacing.ts): a viewer needs one key every
 * couple of minutes, a downloader needs all of them at once and is refused.
 *
 * What this does and does not stop: shared links and downloaded segments are
 * worthless, and downloader extensions get a few minutes at most before the
 * session is cut. A student can still screen-record; nothing short of
 * hardware DRM prevents that, which is what the watermark is for.
 */

const HLS_LOCAL_DIR = path.join(process.cwd(), "uploads", "hls");
const KEY_LOCAL_DIR = path.join(process.cwd(), "uploads", "hls-keys");
const KEY_S3_PREFIX = "hls-keys/v2/";
/** Under the `videos/` prefix, so CloudFront (origin path /videos) serves segments. */
const HLS_CDN_DIR = "hls2/";
const HLS_S3_PREFIX = `videos/${HLS_CDN_DIR}`;
const SEGMENT_SECONDS = 6;
/** Lesson time covered by one key. Small enough that a short lesson still has many. */
export const CHUNK_SECONDS = 120;
const UPLOAD_CONCURRENCY = 8;

/** `gdrive_x` → `gdrive_x.mp4`; any other provider id is already the file name. */
export function baseFilenameFor(providerVideoId: string): string {
  const id = path.basename(providerVideoId);
  return id.startsWith("gdrive_") && !id.endsWith(".mp4") ? `${id}.mp4` : id;
}

/** Directory name for a lesson's package: the base file name without extension. */
export function hlsAssetId(providerVideoId: string): string {
  return baseFilenameFor(providerVideoId).replace(/\.[^./]+$/, "");
}

export function hlsObjectKey(asset: string, file: string): string {
  return `${HLS_S3_PREFIX}${asset}/${file}`;
}

/** Only names this module writes: master.m3u8, 480.m3u8, 480_00012.ts. */
export function isSafeHlsFile(file: string): boolean {
  return /^(master|\d{3,4})\.m3u8$/.test(file) || /^\d{3,4}_\d{5}\.ts$/.test(file);
}

/** True once master.m3u8 is in S3 — it is uploaded last, so the package is complete. */
export async function hlsReady(providerVideoId: string): Promise<boolean> {
  const asset = hlsAssetId(providerVideoId);
  if (!asset) return false;
  return (await objectSizeInS3(hlsObjectKey(asset, "master.m3u8"))) !== null;
}

// ── Key storage ──────────────────────────────────────────────────────────────

function wrappingKey(): Buffer {
  const secret = process.env.CONFIG_ENCRYPTION_KEY || process.env.SESSION_SECRET;
  if (!secret) throw new Error("CONFIG_ENCRYPTION_KEY or SESSION_SECRET must be set to store HLS keys");
  return createHash("sha256").update(`hls-key:${secret}`).digest();
}

function seal(secret: Buffer): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", wrappingKey(), iv);
  const enc = Buffer.concat([cipher.update(secret), cipher.final()]);
  return JSON.stringify({ v: 2, iv: iv.toString("hex"), tag: cipher.getAuthTag().toString("hex"), secret: enc.toString("hex") });
}

function unseal(sealed: string): Buffer {
  const j = JSON.parse(sealed) as { iv: string; tag: string; secret: string };
  const decipher = createDecipheriv("aes-256-gcm", wrappingKey(), Buffer.from(j.iv, "hex"));
  decipher.setAuthTag(Buffer.from(j.tag, "hex"));
  return Buffer.concat([decipher.update(Buffer.from(j.secret, "hex")), decipher.final()]);
}

const secretCache = new Map<string, Buffer>();

/** The lesson's 32-byte secret, or null when it has never been packaged. */
async function readLessonSecret(asset: string): Promise<Buffer | null> {
  const cached = secretCache.get(asset);
  if (cached) return cached;
  const local = path.join(KEY_LOCAL_DIR, `${asset}.v2.json`);
  let sealed: string | null = null;
  try {
    if (fs.existsSync(local)) sealed = fs.readFileSync(local, "utf8");
  } catch {
    // fall through to the S3 backup
  }
  if (!sealed) {
    try {
      const res = await s3Client.send(new GetObjectCommand({ Bucket: S3_BUCKET_NAME, Key: `${KEY_S3_PREFIX}${asset}.json` }));
      sealed = (await res.Body?.transformToString("utf8")) ?? null;
      if (sealed) {
        fs.mkdirSync(KEY_LOCAL_DIR, { recursive: true, mode: 0o700 });
        fs.writeFileSync(local, sealed, { mode: 0o600 });
      }
    } catch {
      return null;
    }
  }
  if (!sealed) return null;
  const secret = unseal(sealed);
  secretCache.set(asset, secret);
  return secret;
}

/** Reuses an existing secret (a retried package must stay decryptable), else mints one. */
async function ensureLessonSecret(asset: string): Promise<Buffer> {
  const existing = await readLessonSecret(asset);
  if (existing) return existing;
  const secret = randomBytes(32);
  const sealed = seal(secret);
  // The backup must exist before a single segment encrypted with it does.
  await s3Client.send(
    new PutObjectCommand({ Bucket: S3_BUCKET_NAME, Key: `${KEY_S3_PREFIX}${asset}.json`, Body: sealed, ContentType: "application/json" })
  );
  fs.mkdirSync(KEY_LOCAL_DIR, { recursive: true, mode: 0o700 });
  fs.writeFileSync(path.join(KEY_LOCAL_DIR, `${asset}.v2.json`), sealed, { mode: 0o600 });
  secretCache.set(asset, secret);
  return secret;
}

function deriveChunkKey(secret: Buffer, chunk: number): Buffer {
  return createHmac("sha256", secret).update(`codeup-hls-chunk:${chunk}`).digest().subarray(0, 16);
}

/** The 16-byte AES key for one chunk of a lesson, or null when not packaged. */
export async function readChunkKey(asset: string, chunk: number): Promise<Buffer | null> {
  if (!Number.isInteger(chunk) || chunk < 0 || chunk > 10_000) return null;
  const secret = await readLessonSecret(asset);
  return secret ? deriveChunkKey(secret, chunk) : null;
}

// ── Packaging ────────────────────────────────────────────────────────────────

function ffBinary(name: "ffmpeg" | "ffprobe"): string | null {
  for (const bin of [name, `/usr/local/bin/${name}`, `/usr/bin/${name}`]) {
    try {
      if (spawnSync(bin, ["-version"], { stdio: "ignore" }).status === 0) return bin;
    } catch {
      // not available
    }
  }
  return null;
}

function probeStream(input: string): { width: number; height: number; durationSec: number } | null {
  const bin = ffBinary("ffprobe");
  if (!bin) return null;
  try {
    const out = spawnSync(
      bin,
      ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height:format=duration", "-of", "json", input],
      { encoding: "utf8" }
    );
    const j = JSON.parse(out.stdout || "{}") as { streams?: Array<{ width?: number; height?: number }>; format?: { duration?: string } };
    const s = j.streams?.[0];
    const durationSec = Number.parseFloat(j.format?.duration ?? "");
    if (!s?.width || !s?.height || !Number.isFinite(durationSec)) return null;
    return { width: s.width, height: s.height, durationSec };
  } catch {
    return null;
  }
}

async function runFfmpeg(args: string[]): Promise<void> {
  const bin = ffBinary("ffmpeg");
  if (!bin) throw new Error("ffmpeg غير مثبت على السيرفر");
  await new Promise<void>((resolve, reject) => {
    const child = spawn("nice", ["-n", "15", bin, ...args], { stdio: ["ignore", "ignore", "pipe"] });
    let tail = "";
    child.stderr?.on("data", (d: Buffer) => {
      tail = (tail + d.toString()).slice(-2000);
    });
    child.on("error", reject);
    child.on("close", (code) =>
      code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}: ${tail.trim().split("\n").slice(-2).join(" | ")}`))
    );
  });
}

async function uploadDir(dir: string, asset: string, files: string[]): Promise<void> {
  let next = 0;
  let failed: string | null = null;
  const worker = async () => {
    while (next < files.length && !failed) {
      const f = files[next++];
      const type = f.endsWith(".m3u8") ? "application/vnd.apple.mpegurl" : "video/mp2t";
      const ok = await uploadFileToS3(path.join(dir, f), hlsObjectKey(asset, f), type);
      if (!ok) failed = f;
    }
  };
  await Promise.all(Array.from({ length: UPLOAD_CONCURRENCY }, worker));
  if (failed) throw new Error(`S3 upload failed for ${asset}/${failed}`);
}

/**
 * Encrypts every segment of one tier in place (AES-128-CBC, PKCS#7, IV = media
 * sequence number as HLS specifies when EXT-X-KEY carries no IV) with the key
 * of the chunk its start time falls in, and inserts an EXT-X-KEY tag wherever
 * the chunk changes. URI "key-<n>" is rewritten per request by the HLS route.
 */
function encryptTier(dir: string, playlistName: string, secret: Buffer): void {
  const playlistPath = path.join(dir, playlistName);
  const lines = fs.readFileSync(playlistPath, "utf8").split("\n");
  const out: string[] = [];
  let seq = 0;
  let t = 0;
  let duration = 0;
  let currentChunk = -1;
  for (const line of lines) {
    const ms = line.match(/^#EXT-X-MEDIA-SEQUENCE:(\d+)/);
    if (ms) seq = Number(ms[1]);
    const inf = line.match(/^#EXTINF:([\d.]+)/);
    if (inf) {
      duration = Number.parseFloat(inf[1]);
      const chunk = Math.floor(t / CHUNK_SECONDS);
      if (chunk !== currentChunk) {
        out.push(`#EXT-X-KEY:METHOD=AES-128,URI="key-${chunk}"`);
        currentChunk = chunk;
      }
    }
    if (line && !line.startsWith("#")) {
      if (!isSafeHlsFile(line)) throw new Error(`unexpected segment name ${line}`);
      const segPath = path.join(dir, line);
      const iv = Buffer.alloc(16);
      iv.writeBigUInt64BE(BigInt(seq), 8);
      const cipher = createCipheriv("aes-128-cbc", deriveChunkKey(secret, currentChunk), iv);
      fs.writeFileSync(segPath, Buffer.concat([cipher.update(fs.readFileSync(segPath)), cipher.final()]));
      seq++;
      t += duration;
    }
    out.push(line);
  }
  fs.writeFileSync(playlistPath, out.join("\n"));
}

export interface PackageResult {
  asset: string;
  skipped: boolean;
  reason?: string;
  heights?: number[];
}

/**
 * Builds and publishes the encrypted HLS package for one lesson from whichever
 * renditions exist. One rendition at a time is segmented, uploaded and
 * deleted locally, so the disk only ever holds one tier's segments.
 */
export async function packageHls(providerVideoId: string, opts: { force?: boolean } = {}): Promise<PackageResult> {
  const base = baseFilenameFor(providerVideoId);
  const asset = hlsAssetId(providerVideoId);
  if (!opts.force && (await hlsReady(providerVideoId))) return { asset, skipped: true, reason: "already packaged" };

  const heights: RenditionHeight[] = [];
  for (const h of RENDITION_HEIGHTS) {
    if ((await renditionSize(renditionFilename(base, h))) !== null) heights.push(h);
  }
  if (heights.length === 0) return { asset, skipped: true, reason: "no renditions yet" };

  const secret = await ensureLessonSecret(asset);
  const work = path.join(HLS_LOCAL_DIR, asset);
  fs.rmSync(work, { recursive: true, force: true });
  fs.mkdirSync(work, { recursive: true, mode: 0o700 });

  const variants: string[] = [];
  try {
    for (const h of heights) {
      const src = await resolveSourceInput(renditionFilename(base, h));
      if (!src) continue;
      const info = probeStream(src.input);
      const tierDir = path.join(work, String(h));
      fs.mkdirSync(tierDir, { recursive: true });
      await runFfmpeg([
        "-hide_banner", "-loglevel", "error", "-nostdin", "-y",
        ...(src.remote ? ["-reconnect", "1", "-reconnect_streamed", "1", "-reconnect_on_network_error", "1", "-reconnect_delay_max", "30", "-rw_timeout", "30000000"] : []),
        "-i", src.input,
        "-map", "0:v:0", "-map", "0:a:0?",
        "-c", "copy",
        "-f", "hls",
        "-hls_time", String(SEGMENT_SECONDS),
        "-hls_playlist_type", "vod",
        "-hls_segment_filename", path.join(tierDir, `${h}_%05d.ts`),
        path.join(tierDir, `${h}.m3u8`),
      ]);

      encryptTier(tierDir, `${h}.m3u8`, secret);

      const files = fs.readdirSync(tierDir).filter(isSafeHlsFile);
      const segments = files.filter((f) => f.endsWith(".ts"));
      // Segments first, playlist last: a half-uploaded tier never looks complete.
      await uploadDir(tierDir, asset, segments);
      await uploadDir(tierDir, asset, [`${h}.m3u8`]);

      const bytes = segments.reduce((n, f) => n + fs.statSync(path.join(tierDir, f)).size, 0);
      const duration = info?.durationSec || 1;
      const bandwidth = Math.max(1, Math.round((bytes * 8) / duration));
      const resolution = info ? `,RESOLUTION=${info.width}x${info.height}` : "";
      variants.push(`#EXT-X-STREAM-INF:BANDWIDTH=${bandwidth}${resolution}\n${h}.m3u8`);
      fs.rmSync(tierDir, { recursive: true, force: true });
    }
    if (variants.length === 0) return { asset, skipped: true, reason: "renditions unreadable" };

    // master.m3u8 last: its presence is what marks the lesson as encrypted.
    fs.writeFileSync(path.join(work, "master.m3u8"), `#EXTM3U\n#EXT-X-VERSION:3\n${variants.join("\n")}\n`);
    await uploadDir(work, asset, ["master.m3u8"]);
    return { asset, skipped: false, heights };
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }
}

// ── Serving ──────────────────────────────────────────────────────────────────

const playlistCache = new Map<string, string>();

/** Playlist text from S3. Packages are immutable once published, so cache them. */
export async function readHlsPlaylist(asset: string, file: string): Promise<string | null> {
  const k = `${asset}/${file}`;
  const cached = playlistCache.get(k);
  if (cached) return cached;
  try {
    const res = await s3Client.send(new GetObjectCommand({ Bucket: S3_BUCKET_NAME, Key: hlsObjectKey(asset, file) }));
    const text = (await res.Body?.transformToString("utf8")) ?? null;
    if (text) {
      if (playlistCache.size > 500) playlistCache.clear();
      playlistCache.set(k, text);
    }
    return text;
  } catch {
    return null;
  }
}

/** Segment URL base + signed query for a lesson, or null when CloudFront is off. */
export async function signedSegmentQuery(asset: string, expiresAt: Date): Promise<{ base: string; query: string } | null> {
  if (!cloudFrontEnabled()) return null;
  return signedPrefixQuery(`${HLS_CDN_DIR}${asset}/`, expiresAt);
}
