import crypto from "crypto";
import fs from "fs";
import path from "path";
import { Readable } from "stream";
import { pipeline } from "stream/promises";

export interface GoogleDriveFileMetadata {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  videoMediaMetadata?: {
    width?: number;
    height?: number;
    durationMillis?: string;
  };
}

export interface GoogleDriveDownloadResult {
  success: boolean;
  videoId: string;
  filename: string;
  title: string;
  durationMinutes: number;
  sizeBytes: number;
  mimeType: string;
  videoProvider: "alasly";
}

const UPLOAD_DIR = path.join(process.cwd(), "uploads", "videos");

// In-memory token cache to prevent unnecessary JWT signing & token requests
let cachedAccessToken: { token: string; expiresAt: number } | null = null;

/**
 * Normalizes and extracts Google Drive file ID from various URL formats or raw ID.
 */
export function extractGoogleDriveFileId(input: string): string | null {
  if (!input || typeof input !== "string") return null;
  const trimmed = input.trim();

  // Pattern 1: /file/d/{id} or /file/u/0/d/{id}
  const fileDPattern = /\/file\/(?:u\/\d+\/)?d\/([a-zA-Z0-9_-]{20,})/;
  const matchD = trimmed.match(fileDPattern);
  if (matchD?.[1]) return matchD[1];

  // Pattern 2: id={id} in query string (open?id=..., uc?id=..., etc.)
  const queryPattern = /[?&]id=([a-zA-Z0-9_-]{20,})/;
  const matchQuery = trimmed.match(queryPattern);
  if (matchQuery?.[1]) return matchQuery[1];

  // Pattern 3: /d/{id}/
  const shortDPattern = /\/d\/([a-zA-Z0-9_-]{20,})/;
  const matchShortD = trimmed.match(shortDPattern);
  if (matchShortD?.[1]) return matchShortD[1];

  // Pattern 4: Raw file ID directly (at least 20 chars, alphanumeric with - and _)
  if (/^[a-zA-Z0-9_-]{20,60}$/.test(trimmed)) {
    return trimmed;
  }

  return null;
}

/**
 * Returns Google Service Account credentials safely from environment variables.
 * Never logs credentials.
 */
function getGoogleCredentials() {
  const email = (process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || "").trim();
  let privateKey = (process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY || "").trim();
  const projectId = (process.env.GOOGLE_SERVICE_ACCOUNT_PROJECT_ID || "").trim();

  if (!email || !privateKey) {
    throw new Error(
      "بيانات حساب خدمة Google Drive (Service Account) غير مهيأة في متغيرات البيئة. يرجى مراجعة إعدادات السيرفر."
    );
  }

  // Handle literal escaped newlines "\n" if present in string
  if (privateKey.includes("\\n")) {
    privateKey = privateKey.replace(/\\n/g, "\n");
  }

  return { email, privateKey, projectId };
}

/**
 * Signs an RS256 JWT assertion and exchanges it for a Google OAuth2 Bearer Access Token.
 */
export async function getGoogleDriveAccessToken(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);

  // Return cached token if valid for at least 5 more minutes
  if (cachedAccessToken && cachedAccessToken.expiresAt > now + 300) {
    return cachedAccessToken.token;
  }

  const { email, privateKey } = getGoogleCredentials();

  // Create JWT Header & Payload
  const header = {
    alg: "RS256",
    typ: "JWT",
  };

  const payload = {
    iss: email,
    scope: "https://www.googleapis.com/auth/drive.readonly",
    aud: "https://oauth2.googleapis.com/token",
    exp: now + 3600,
    iat: now,
  };

  const base64UrlEncode = (obj: any) =>
    Buffer.from(JSON.stringify(obj))
      .toString("base64")
      .replace(/=/g, "")
      .replace(/\+/g, "-")
      .replace(/\//g, "_");

  const unsignedToken = `${base64UrlEncode(header)}.${base64UrlEncode(payload)}`;

  // Sign with RSA-SHA256 using native crypto
  const signer = crypto.createSign("RSA-SHA256");
  signer.update(unsignedToken);
  const signature = signer
    .sign(privateKey, "base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");

  const signedJwt = `${unsignedToken}.${signature}`;

  // Exchange signed JWT for OAuth2 Access Token
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: signedJwt,
    }).toString(),
  });

  const tokenData = await tokenRes.json().catch(() => ({}));

  if (!tokenRes.ok || !tokenData.access_token) {
    const errorMsg = tokenData.error_description || tokenData.error || `HTTP ${tokenRes.status}`;
    throw new Error(`فشل المصادقة مع Google Cloud: ${errorMsg}`);
  }

  const token = tokenData.access_token as string;
  const expiresIn = Number(tokenData.expires_in) || 3600;
  cachedAccessToken = {
    token,
    expiresAt: now + expiresIn,
  };

  return token;
}

/**
 * Retrieves file metadata from Google Drive API.
 */
export async function getGoogleDriveFileMetadata(fileId: string): Promise<GoogleDriveFileMetadata> {
  const token = await getGoogleDriveAccessToken();
  const url = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?fields=id,name,mimeType,size,videoMediaMetadata&supportsAllDrives=true`;

  const res = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
  });

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    const errCode = res.status;
    if (errCode === 404) {
      throw new Error("الفيديو غير موجود في Google Drive أو تم حذفه.");
    }
    if (errCode === 403) {
      throw new Error(
        "تعذر الوصول للفيديو. يرجى التأكد من مشاركة الفيديو في Google Drive مع الإيميل: code-up-drive-downloader@gen-lang-client-0511580613.iam.gserviceaccount.com أو جعله متاحاً لمن يملك الرابط."
      );
    }
    throw new Error(errBody.error?.message || `خطأ Google Drive (${errCode})`);
  }

  return (await res.json()) as GoogleDriveFileMetadata;
}

/**
 * Downloads a video from Google Drive directly into Code-UP's Native Video pipeline
 * using streaming to avoid memory bloat.
 */
export async function downloadGoogleDriveVideo(
  fileId: string,
  options?: { maxSizeBytes?: number }
): Promise<GoogleDriveDownloadResult> {
  if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  }

  // 1. Verify metadata & access
  const metadata = await getGoogleDriveFileMetadata(fileId);

  // Configurable size limit: Default 6 GB (to easily handle 3GB & 5GB teacher videos)
  const envMaxGb = Number(process.env.GOOGLE_DRIVE_MAX_FILE_SIZE_GB) || 6;
  const maxBytes = options?.maxSizeBytes || envMaxGb * 1024 * 1024 * 1024;
  const fileSize = Number(metadata.size) || 0;
  if (fileSize > maxBytes) {
    const sizeGB = (fileSize / (1024 * 1024 * 1024)).toFixed(2);
    const maxGB = (maxBytes / (1024 * 1024 * 1024)).toFixed(0);
    throw new Error(`حجم الفيديو (${sizeGB} جيجابايت) يتجاوز الحد الأقصى المسموح به (${maxGB} جيجابايت).`);
  }

  // 2. Validate MIME type & file extension (strictly allow only video formats)
  const mime = (metadata.mimeType || "").toLowerCase();
  const originalName = metadata.name || "video.mp4";
  let ext = path.extname(originalName).toLowerCase();

  const isVideoMime =
    mime.startsWith("video/") ||
    mime === "application/octet-stream" ||
    mime === "application/x-matroska" ||
    mime === "application/mp4";

  const allowedExtensions = [".mp4", ".webm", ".mov", ".mkv", ".m4v", ".avi", ".ts"];
  const hasValidExt = ext && allowedExtensions.includes(ext);

  if (!isVideoMime && !hasValidExt) {
    throw new Error(
      `نوع الملف (${mime || "غير معروف"}) ليس ملف فيديو صالحاً. يُسمح فقط بملفات الفيديو (MP4, WebM, MOV, MKV).`
    );
  }

  if (!ext || ext.length < 2) {
    if (mime.includes("mp4")) ext = ".mp4";
    else if (mime.includes("webm")) ext = ".webm";
    else if (mime.includes("quicktime") || mime.includes("mov")) ext = ".mov";
    else if (mime.includes("matroska") || mime.includes("mkv")) ext = ".mkv";
    else ext = ".mp4";
  }

  const randomId = crypto.randomBytes(8).toString("hex");
  const filename = `local_${Date.now()}_${randomId}${ext}`;
  const targetPath = path.join(UPLOAD_DIR, filename);

  // 3. Stream download from Google Drive API
  const token = await getGoogleDriveAccessToken();
  const downloadUrl = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media&supportsAllDrives=true`;

  const response = await fetch(downloadUrl, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok || !response.body) {
    const errText = await response.text().catch(() => "");
    throw new Error(`فشل تحميل محتوى الفيديو من Google Drive: ${errText || response.statusText}`);
  }

  // Pipe web readable stream directly to disk write stream
  const nodeReadable = Readable.fromWeb(response.body as any);
  const writeStream = fs.createWriteStream(targetPath);

  try {
    await pipeline(nodeReadable, writeStream);
  } catch (err: any) {
    // Cleanup partial file on error
    if (fs.existsSync(targetPath)) {
      try {
        fs.unlinkSync(targetPath);
      } catch {}
    }
    throw new Error(`حدث انقطاع أثناء تحميل الفيديو: ${err.message}`);
  }

  // Calculate duration in minutes if provided in metadata
  let durationMinutes = 0;
  if (metadata.videoMediaMetadata?.durationMillis) {
    const millis = Number(metadata.videoMediaMetadata.durationMillis);
    if (!isNaN(millis) && millis > 0) {
      durationMinutes = Math.ceil(millis / 60000);
    }
  }

  // Clean title (remove extension)
  const cleanTitle = originalName.replace(/\.[^/.]+$/, "").trim() || "درس فيديو";

  return {
    success: true,
    videoId: filename,
    filename,
    title: cleanTitle,
    durationMinutes,
    sizeBytes: fileSize,
    mimeType: metadata.mimeType || "video/mp4",
    videoProvider: "alasly",
  };
}

/**
 * Instantly imports a Google Drive video into Code-UP's Native Security pipeline
 * without saving to disk (Zero VPS Disk Usage).
 * Video is securely streamed on-demand to authorized students via Service Account.
 */
export async function importGoogleDriveVideo(
  fileId: string,
  options?: { maxSizeBytes?: number }
): Promise<GoogleDriveDownloadResult & { isCloudStream: boolean; sizeFormatted: string }> {
  // 1. Verify metadata & access with Google Drive API v3
  const metadata = await getGoogleDriveFileMetadata(fileId);

  // Configurable size limit: Default 6 GB (to easily handle 3GB & 5GB teacher videos)
  const envMaxGb = Number(process.env.GOOGLE_DRIVE_MAX_FILE_SIZE_GB) || 6;
  const maxBytes = options?.maxSizeBytes || envMaxGb * 1024 * 1024 * 1024;
  const fileSize = Number(metadata.size) || 0;
  if (fileSize > maxBytes) {
    const sizeGB = (fileSize / (1024 * 1024 * 1024)).toFixed(2);
    const maxGB = (maxBytes / (1024 * 1024 * 1024)).toFixed(0);
    throw new Error(`حجم الفيديو (${sizeGB} جيجابايت) يتجاوز الحد الأقصى المسموح به (${maxGB} جيجابايت).`);
  }

  // 2. Validate MIME type & file extension
  const mime = (metadata.mimeType || "").toLowerCase();
  const originalName = metadata.name || "video.mp4";
  const ext = path.extname(originalName).toLowerCase();

  const isVideoMime =
    mime.startsWith("video/") ||
    mime === "application/octet-stream" ||
    mime === "application/x-matroska" ||
    mime === "application/mp4";

  const allowedExtensions = [".mp4", ".webm", ".mov", ".mkv", ".m4v", ".avi", ".ts"];
  const hasValidExt = ext && allowedExtensions.includes(ext);

  if (!isVideoMime && !hasValidExt) {
    throw new Error(
      `نوع الملف (${mime || "غير معروف"}) ليس ملف فيديو صالحاً. يُسمح فقط بملفات الفيديو (MP4, WebM, MOV, MKV).`
    );
  }

  // Calculate duration in minutes if provided in metadata
  let durationMinutes = 0;
  if (metadata.videoMediaMetadata?.durationMillis) {
    const millis = Number(metadata.videoMediaMetadata.durationMillis);
    if (!isNaN(millis) && millis > 0) {
      durationMinutes = Math.ceil(millis / 60000);
    }
  }

  const cleanTitle = originalName.replace(/\.[^/.]+$/, "").trim() || "درس فيديو";
  const videoId = `gdrive_${fileId}`;

  const sizeFormatted =
    fileSize >= 1024 * 1024 * 1024
      ? `${(fileSize / (1024 * 1024 * 1024)).toFixed(2)} جيجابايت`
      : `${(fileSize / (1024 * 1024)).toFixed(1)} ميجابايت`;

  return {
    success: true,
    videoId,
    filename: videoId,
    title: cleanTitle,
    durationMinutes,
    sizeBytes: fileSize,
    sizeFormatted,
    mimeType: metadata.mimeType || "video/mp4",
    videoProvider: "alasly",
    isCloudStream: true,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Local mirror of Drive-backed lessons
// ─────────────────────────────────────────────────────────────────────────────
//
// Google enforces a per-file download quota. A 2 GB lecture watched by a class
// (each seek = another ranged download through the API) trips it within hours
// and Drive answers 403 "The download quota for this file has been exceeded".
// The <video> element then errors and students see a blank player.
//
// So a gdrive_ lesson is streamed from Drive only until it has been mirrored
// to uploads/videos/gdrive_<fileId>.<ext> once; from then on it is served from
// local disk with normal Range support and Drive is never touched at play time.

const MIRROR_EXTENSIONS = [".mp4", ".webm", ".mov", ".mkv", ".m4v"];
const MIRROR_HEADROOM_BYTES = 1.5 * 1024 * 1024 * 1024; // keep ≥1.5 GB free for builds/logs
const MIRROR_CHUNK_BYTES = 16 * 1024 * 1024; // Drive rejects ranges >32 MB on a throttled file
const inflightMirrors = new Map<string, Promise<void>>();

export function driveMirrorBasename(fileId: string): string {
  return `gdrive_${fileId}`;
}

/** Returns the absolute path of a completed local mirror for this Drive file, if any. */
export function findDriveMirror(fileId: string): string | null {
  const base = path.join(UPLOAD_DIR, driveMirrorBasename(fileId));
  for (const ext of MIRROR_EXTENSIONS) {
    const candidate = base + ext;
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

function freeDiskBytes(dir: string): number {
  try {
    const s = fs.statfsSync(dir);
    return Number(s.bavail) * Number(s.bsize);
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

/**
 * Downloads the Drive file to the local mirror location once. Concurrent callers
 * share one download; a partial file is written to `.part` and renamed on success
 * so a crash mid-download never leaves a truncated file that looks complete.
 * Never throws — mirroring is best-effort and the caller keeps proxying Drive.
 */
export function ensureDriveMirror(fileId: string): Promise<void> {
  if (findDriveMirror(fileId)) return Promise.resolve();
  const existing = inflightMirrors.get(fileId);
  if (existing) return existing;

  const job = (async () => {
    try {
      if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

      const metadata = await getGoogleDriveFileMetadata(fileId);
      const size = Number(metadata.size) || 0;
      const free = freeDiskBytes(UPLOAD_DIR);
      if (size <= 0 || free - size < MIRROR_HEADROOM_BYTES) {
        console.warn(
          `[drive-mirror] Skipping mirror of ${fileId}: size=${size} free=${free} (need ${MIRROR_HEADROOM_BYTES} headroom)`
        );
        return;
      }

      const mime = (metadata.mimeType || "").toLowerCase();
      let ext = path.extname(metadata.name || "").toLowerCase();
      if (!MIRROR_EXTENSIONS.includes(ext)) {
        if (mime.includes("webm")) ext = ".webm";
        else if (mime.includes("quicktime")) ext = ".mov";
        else if (mime.includes("matroska")) ext = ".mkv";
        else ext = ".mp4";
      }

      const finalPath = path.join(UPLOAD_DIR, driveMirrorBasename(fileId) + ext);
      const partPath = finalPath + ".part";
      if (fs.existsSync(partPath)) fs.unlinkSync(partPath);

      console.info(`[drive-mirror] Mirroring ${fileId} (${(size / 1e9).toFixed(2)} GB) → ${path.basename(finalPath)}`);

      // Once Drive has flagged a file as over-quota it still answers small Range
      // requests (players keep working) but refuses whole-file and large-range
      // downloads. Pulling the mirror in ≤32 MB ranged chunks therefore works
      // even while the file is throttled; a plain GET would 403.
      const downloadUrl = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media&supportsAllDrives=true`;
      const out = fs.createWriteStream(partPath);
      try {
        for (let start = 0; start < size; start += MIRROR_CHUNK_BYTES) {
          const end = Math.min(start + MIRROR_CHUNK_BYTES, size) - 1;
          let lastErr: unknown = null;
          for (let attempt = 0; attempt < 4; attempt++) {
            try {
              const token = await getGoogleDriveAccessToken();
              const res = await fetch(downloadUrl, {
                headers: { Authorization: `Bearer ${token}`, Range: `bytes=${start}-${end}` },
              });
              if (res.status !== 206 || !res.body) {
                const errText = await res.text().catch(() => "");
                throw new Error(`chunk ${start}-${end} failed (${res.status}): ${errText.slice(0, 120)}`);
              }
              for await (const chunk of Readable.fromWeb(res.body as any)) {
                if (!out.write(chunk)) await new Promise<void>((r) => out.once("drain", () => r()));
              }
              lastErr = null;
              break;
            } catch (err) {
              lastErr = err;
              await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
            }
          }
          if (lastErr) throw lastErr;
        }
      } finally {
        await new Promise<void>((resolve, reject) => out.end((err?: Error | null) => (err ? reject(err) : resolve())));
      }

      const written = fs.statSync(partPath).size;
      if (written !== size) {
        fs.unlinkSync(partPath);
        throw new Error(`Size mismatch after download: got ${written}, expected ${size}`);
      }
      fs.renameSync(partPath, finalPath);
      console.info(`[drive-mirror] Mirror complete for ${fileId}`);

      // Durable copy: once in S3 the local mirror is only a cache. A mirrored
      // Drive lecture is exactly the 1-2 GB single file students cannot stream
      // on mobile, so it gets its low-bandwidth rendition queued immediately.
      const { uploadVideoToS3 } = await import("./video-storage");
      void uploadVideoToS3(finalPath).then(async () => {
        const { enqueueRenditions } = await import("./rendition-queue");
        enqueueRenditions(path.basename(finalPath));
      });
    } catch (err) {
      console.error(`[drive-mirror] Failed to mirror ${fileId}:`, err instanceof Error ? err.message : err);
    } finally {
      inflightMirrors.delete(fileId);
    }
  })();

  inflightMirrors.set(fileId, job);
  return job;
}

/**
 * Proxies partial byte-range requests directly from Google Drive API to authorized students.
 * Supports seek/scrubbing and HTTP 206 Partial Content with zero local disk footprint.
 */
export async function streamGoogleDriveVideo(
  fileId: string,
  rangeHeader?: string | null
): Promise<Response> {
  const token = await getGoogleDriveAccessToken();
  const downloadUrl = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media&supportsAllDrives=true`;

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
  };

  if (rangeHeader) {
    headers["Range"] = rangeHeader;
  }

  const driveRes = await fetch(downloadUrl, {
    method: "GET",
    headers,
  });

  if (!driveRes.ok && driveRes.status !== 206) {
    const errText = await driveRes.text().catch(() => "");
    throw new Error(`خطأ في تشغيل الفيديو من Google Drive (${driveRes.status}): ${errText}`);
  }

  const responseHeaders = new Headers();
  const forwardHeaders = [
    "content-type",
    "content-length",
    "content-range",
    "accept-ranges",
    "content-duration",
  ];

  for (const h of forwardHeaders) {
    const val = driveRes.headers.get(h);
    if (val) responseHeaders.set(h, val);
  }

  if (!responseHeaders.has("content-type")) {
    responseHeaders.set("content-type", "video/mp4");
  }
  if (!responseHeaders.has("accept-ranges")) {
    responseHeaders.set("accept-ranges", "bytes");
  }
  responseHeaders.set("Cache-Control", "no-store, private");

  return new Response(driveRes.body, {
    status: driveRes.status,
    headers: responseHeaders,
  });
}
