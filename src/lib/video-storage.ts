import fs from "fs";
import path from "path";
import { GetObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import { s3Client, S3_BUCKET_NAME } from "./s3";

/**
 * Durable storage for Native (alasly) lesson files.
 *
 * Serving order in /api/videos/stream is: local disk → S3 → Google Drive.
 * Local disk is a cache (the box has ~30 GB), S3 is the origin, and Drive is a
 * last resort because its per-file download quota blocks popular lectures.
 * Every file that lands on local disk (teacher upload, completed Drive mirror)
 * is copied here in the background so the local copy can be evicted later.
 */

export const VIDEO_S3_PREFIX = "videos/";

const VIDEO_STORAGE_DISABLED = process.env.VIDEO_S3_DISABLED === "true";

export function videoObjectKey(filename: string): string {
  return VIDEO_S3_PREFIX + path.basename(filename);
}

export function contentTypeForVideo(filename: string): string {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".webm")) return "video/webm";
  if (lower.endsWith(".mov")) return "video/quicktime";
  if (lower.endsWith(".mkv")) return "video/x-matroska";
  return "video/mp4";
}

// ── Existence cache ──────────────────────────────────────────────────────────
// Every player Range request would otherwise cost a HeadObject round-trip.
interface HeadCacheEntry {
  size: number | null; // null = known missing
  expiresAt: number;
}
const headCache = new Map<string, HeadCacheEntry>();
const HEAD_POSITIVE_TTL_MS = 10 * 60 * 1000;
const HEAD_NEGATIVE_TTL_MS = 60 * 1000;

/** Object size if the video exists in S3, otherwise null. Never throws. */
export async function videoSizeInS3(filename: string): Promise<number | null> {
  return objectSizeInS3(videoObjectKey(filename));
}

/** Size of any object under the video storage bucket, or null. Never throws. */
export async function objectSizeInS3(key: string): Promise<number | null> {
  if (VIDEO_STORAGE_DISABLED) return null;
  const cached = headCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.size;

  try {
    const head = await s3Client.send(new HeadObjectCommand({ Bucket: S3_BUCKET_NAME, Key: key }));
    const size = Number(head.ContentLength) || 0;
    headCache.set(key, { size, expiresAt: Date.now() + HEAD_POSITIVE_TTL_MS });
    return size;
  } catch (err: unknown) {
    const e = err as { $metadata?: { httpStatusCode?: number }; name?: string };
    const status = e?.$metadata?.httpStatusCode;
    if (status !== 404 && status !== 403) {
      console.warn(`[video-storage] HeadObject failed for ${key}:`, e?.name || err);
    }
    headCache.set(key, { size: null, expiresAt: Date.now() + HEAD_NEGATIVE_TTL_MS });
    return null;
  }
}

/**
 * Streams a video from S3 with the client's Range header forwarded, so seeking
 * works and the response is 206 exactly as it would be from local disk.
 */
export async function streamVideoFromS3(filename: string, rangeHeader?: string | null): Promise<Response> {
  return streamObjectFromS3(videoObjectKey(filename), rangeHeader, {
    "Content-Type": contentTypeForVideo(filename),
    "Cache-Control": "no-store, private",
  });
}

/**
 * Streams any object with the Range header forwarded (206 on ranges). `headers`
 * supplies the response headers; Content-Type there wins over the stored one.
 */
export async function streamObjectFromS3(
  key: string,
  rangeHeader: string | null | undefined,
  extraHeaders: Record<string, string>
): Promise<Response> {
  const obj = await s3Client.send(
    new GetObjectCommand({ Bucket: S3_BUCKET_NAME, Key: key, Range: rangeHeader || undefined })
  );

  const headers = new Headers({
    "Content-Type": obj.ContentType || "application/octet-stream",
    "Accept-Ranges": "bytes",
    ...extraHeaders,
  });
  if (obj.ContentLength !== undefined) headers.set("Content-Length", String(obj.ContentLength));
  if (obj.ContentRange) headers.set("Content-Range", obj.ContentRange);

  const status = obj.ContentRange ? 206 : 200;
  // The SDK returns a Node Readable; undici accepts it as a body at runtime.
  return new Response(obj.Body as unknown as ReadableStream, { status, headers });
}

// ── CloudFront signed URLs ───────────────────────────────────────────────────
// When configured, students are redirected to CloudFront instead of having the
// bytes proxied through this box. The URL is signed and expires with the watch
// session, so it cannot be shared beyond that window. Bucket access is via OAC,
// so the S3 objects themselves stay private.
const CF_DOMAIN = (process.env.CLOUDFRONT_VIDEO_DOMAIN || "").trim();
const CF_KEY_PAIR_ID = (process.env.CLOUDFRONT_KEY_PAIR_ID || "").trim();
const CF_PRIVATE_KEY = (process.env.CLOUDFRONT_PRIVATE_KEY || "").replace(/\\n/g, "\n").trim();

export function cloudFrontEnabled(): boolean {
  return !VIDEO_STORAGE_DISABLED && !!CF_DOMAIN && !!CF_KEY_PAIR_ID && !!CF_PRIVATE_KEY;
}

/** Signed CloudFront URL for a video that exists in S3. Caller checks existence. */
export async function signedVideoUrl(filename: string, expiresAt: Date): Promise<string> {
  const { getSignedUrl } = await import("@aws-sdk/cloudfront-signer");
  const url = `https://${CF_DOMAIN}/${encodeURIComponent(path.basename(filename))}`;
  return getSignedUrl({
    url,
    keyPairId: CF_KEY_PAIR_ID,
    privateKey: CF_PRIVATE_KEY,
    dateLessThan: expiresAt.toISOString(),
  });
}

/**
 * One CloudFront signature valid for every object under `<prefix>` (custom
 * policy with a wildcard). Returns the URL base and the query string to append
 * to each object name — an HLS lesson has ~1,000 segments and signing each one
 * separately would cost seconds of CPU per playlist. Caller checks cloudFrontEnabled().
 */
export async function signedPrefixQuery(prefix: string, expiresAt: Date): Promise<{ base: string; query: string }> {
  const { getSignedUrl } = await import("@aws-sdk/cloudfront-signer");
  const base = `https://${CF_DOMAIN}/${prefix.replace(/^\/+/, "")}`;
  const policy = JSON.stringify({
    Statement: [{ Resource: `${base}*`, Condition: { DateLessThan: { "AWS:EpochTime": Math.floor(expiresAt.getTime() / 1000) } } }],
  });
  const signed = getSignedUrl({ url: `${base}*`, keyPairId: CF_KEY_PAIR_ID, privateKey: CF_PRIVATE_KEY, policy });
  return { base, query: signed.slice(signed.indexOf("?")) };
}

// ── Background upload ────────────────────────────────────────────────────────
const inflightUploads = new Map<string, Promise<boolean>>();

/**
 * Copies a local video to S3 (multipart, bounded memory). Single-flight per
 * key, skips files already present with the same size, never throws.
 */
export function uploadVideoToS3(localPath: string, filename?: string): Promise<void> {
  const name = path.basename(filename || localPath);
  return uploadFileToS3(localPath, videoObjectKey(name), contentTypeForVideo(name)).then(() => undefined);
}

/**
 * Copies a local file to an S3 key (multipart, bounded memory). Single-flight
 * per key, skips when the object already exists with the same size. Resolves
 * true when the object is in S3 afterwards; never throws.
 */
export function uploadFileToS3(localPath: string, key: string, contentType: string): Promise<boolean> {
  if (VIDEO_STORAGE_DISABLED) return Promise.resolve(false);
  const name = key;
  const existing = inflightUploads.get(key);
  if (existing) return existing;

  const job = (async (): Promise<boolean> => {
    try {
      const stat = fs.statSync(localPath);
      const remoteSize = await objectSizeInS3(key);
      if (remoteSize === stat.size) return true;

      console.info(`[video-storage] Uploading ${name} (${(stat.size / 1e9).toFixed(2)} GB) → s3://${S3_BUCKET_NAME}/${key}`);
      const upload = new Upload({
        client: s3Client,
        params: {
          Bucket: S3_BUCKET_NAME,
          Key: key,
          Body: fs.createReadStream(localPath),
          ContentType: contentType,
        },
        partSize: 32 * 1024 * 1024,
        queueSize: 2,
        leavePartsOnError: false,
      });
      await upload.done();
      headCache.set(key, { size: stat.size, expiresAt: Date.now() + HEAD_POSITIVE_TTL_MS });
      console.info(`[video-storage] Upload complete: ${key}`);
      return true;
    } catch (err) {
      console.error(`[video-storage] Upload failed for ${name}:`, err instanceof Error ? err.message : err);
      return false;
    } finally {
      inflightUploads.delete(key);
    }
  })();

  inflightUploads.set(key, job);
  return job;
}

/**
 * Presigned S3 URL for *reading* a video, for server-side consumers that speak
 * HTTP rather than the SDK (ffmpeg/ffprobe, MediaConvert job inputs).
 *
 * This deliberately points at S3 rather than CloudFront: it is an origin-side
 * read by our own tooling, so it should neither need the CDN signing key nor
 * pollute the edge cache with objects no student ever requests.
 */
export async function presignedVideoReadUrl(
  filename: string,
  expiresInSeconds = 6 * 60 * 60
): Promise<string | null> {
  if (VIDEO_STORAGE_DISABLED) return null;
  try {
    const { getSignedUrl } = await import("@aws-sdk/s3-request-presigner");
    return await getSignedUrl(
      s3Client,
      new GetObjectCommand({ Bucket: S3_BUCKET_NAME, Key: videoObjectKey(filename) }),
      { expiresIn: expiresInSeconds }
    );
  } catch (error) {
    console.error(`[video-storage] presign failed for ${filename}:`, error);
    return null;
  }
}

// ── DRM packages ─────────────────────────────────────────────────────────────
// A packaged (CENC-encrypted) lesson is a directory of media files plus a
// manifest. The media are already encrypted, so S3 holds them as the origin
// exactly like plain videos; the content keys stay on this box (uploads/
// drm-keys) and in the database, and are only ever released through the
// license server. /api/videos/drm serves local files first, then S3.

export const DRM_S3_PREFIX = "videos/drm/";
const DRM_LOCAL_DIR = path.resolve(process.cwd(), "uploads", "drm");
/** Job bookkeeping, not media — it stays local. */
const DRM_LOCAL_ONLY_FILES = new Set(["status.json"]);

export function isSafeDrmSegment(value: string): boolean {
  return /^[a-zA-Z0-9_.-]+$/.test(value) && value !== "." && value !== "..";
}

export function drmObjectKey(assetId: string, file: string): string {
  return `${DRM_S3_PREFIX}${assetId}/${file}`;
}

export function drmContentType(file: string): string {
  const ext = path.extname(file).toLowerCase();
  if (ext === ".mpd") return "application/dash+xml";
  if (ext === ".m3u8") return "application/vnd.apple.mpegurl";
  if (ext === ".m4s") return "video/iso.segment";
  if (ext === ".ts") return "video/mp2t";
  return "video/mp4";
}

/**
 * Copies every media file of a packaged asset to S3 (sequentially, so a 2 GB
 * package never holds more than one multipart upload). Safe to re-run: files
 * already in S3 with the same size are skipped. Never throws.
 */
export async function uploadDrmPackageToS3(assetId: string): Promise<{ uploaded: string[]; failed: string[] }> {
  const result = { uploaded: [] as string[], failed: [] as string[] };
  if (VIDEO_STORAGE_DISABLED || !isSafeDrmSegment(assetId)) return result;
  const dir = path.join(DRM_LOCAL_DIR, assetId);
  let files: string[] = [];
  try {
    files = fs.readdirSync(dir).filter((f) => isSafeDrmSegment(f) && !DRM_LOCAL_ONLY_FILES.has(f) && fs.statSync(path.join(dir, f)).isFile());
  } catch {
    return result;
  }
  for (const file of files) {
    const ok = await uploadFileToS3(path.join(dir, file), drmObjectKey(assetId, file), drmContentType(file));
    (ok ? result.uploaded : result.failed).push(file);
  }
  return result;
}
