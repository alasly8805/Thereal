/**
 * Background Axinom/CENC packaging jobs.
 *
 * Why this exists: the original implementation downloaded the source video and
 * ran Shaka Packager with `spawnSync` *inside* the HTTP request. For a 1-2 GB
 * lecture that takes ~5 minutes, which (a) blocked the whole Node event loop so
 * every other request on the site hung, and (b) was killed by Cloudflare's
 * 100-second proxy timeout, so the browser saw an error while the server kept
 * working. The teacher retried, leaving multiple 2 GB copies on disk, and the
 * lesson was saved with the raw `gdrive_…` id, so DRM never applied.
 *
 * Now: POST starts a job and returns immediately with the future `assetId`.
 * Progress is persisted to `uploads/drm/<assetId>/status.json` and polled via
 * GET. The packager runs with async `spawn`, one job at a time.
 */

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { prisma } from "./prisma";
import { getGoogleDriveAccessToken } from "./google-drive";

export const UPLOADS_DIR = path.resolve(process.cwd(), "uploads", "videos");
export const DRM_OUTPUT_DIR = path.resolve(process.cwd(), "uploads", "drm");
export const DRM_KEYS_DIR = path.resolve(process.cwd(), "uploads", "drm-keys");
export const DRM_TEMP_DIR = path.resolve(process.cwd(), "uploads", "temp");

export type DrmJobStatus =
  | "queued"
  | "downloading"
  | "transcoding"
  | "packaging"
  | "finalizing"
  | "ready"
  | "failed";

/**
 * Tiered protection: the HD rendition is encrypted with a key that the token
 * only licenses to hardware-backed CDMs (Widevine L1 / PlayReady SL3000), so it
 * cannot be screen-captured. The SD rendition (and audio) use a second key that
 * software CDMs (desktop Chrome L3) may also receive, so every device still
 * plays — but a capture from a software device is only ever 480p.
 */
const SD_TIER = { label: "SD", height: 480, crf: 27, preset: "ultrafast", hardwareOnly: false } as const;
const HD_TIER = { label: "HD", hardwareOnly: true } as const;

export interface DrmTierKey {
  label: string;
  keyId: string;
  key: string;
  hardwareOnly: boolean;
  height?: number | null;
}

export interface DrmJobState {
  assetId: string;
  status: DrmJobStatus;
  /** 0-100 for the current stage where known */
  progress: number;
  /** Bytes downloaded / total, for the download stage */
  downloadedBytes?: number;
  totalBytes?: number;
  /** Normalised source: `gdrive_<fileId>` or `local_….mp4` (basename) */
  source: string;
  requestedBy?: string;
  dbVideoId?: string | null;
  rawVideoId: string;
  manifestUrl: string;
  error?: string | null;
  startedAt: string;
  updatedAt: string;
  finishedAt?: string | null;
}

interface StartJobParams {
  rawVideoId: string;
  gdriveFileId: string | null;
  assetId?: string;
  dbVideoId?: string | null;
  requestedBy?: string;
}

/** Consider an in-progress job dead if nothing touched its status for this long. */
const STALE_MS = 4 * 60 * 1000;

// Survive Next.js HMR / module re-evaluation in dev; PM2 runs a single fork in prod.
const g = globalThis as unknown as {
  __drmJobs?: Map<string, DrmJobState>;
  __drmQueue?: Promise<void>;
};
const jobs: Map<string, DrmJobState> = (g.__drmJobs ||= new Map());
g.__drmQueue ||= Promise.resolve();

export function findPackagerBinary(): string | null {
  const customPath = process.env.SHAKA_PACKAGER_PATH;
  if (customPath && fs.existsSync(customPath)) return customPath;

  const candidates =
    process.platform === "win32"
      ? ["packager.exe", "packager-win-x64.exe", "packager"]
      : ["/usr/local/bin/packager", "/usr/bin/packager", "packager", "packager-linux-x64", "shaka-packager"];

  for (const name of candidates) {
    try {
      const check = spawnSync(name, ["--version"], { stdio: "ignore" });
      if (check.status === 0 || check.error === undefined) return name;
    } catch {
      // not available
    }
  }

  const localBin = path.join(process.cwd(), "bin", process.platform === "win32" ? "packager.exe" : "packager");
  if (fs.existsSync(localBin)) return localBin;
  return null;
}

export function sanitizeAssetId(id: string): string {
  return id.replace(/[^a-zA-Z0-9_-]/g, "_");
}

function statusPath(assetId: string) {
  return path.join(DRM_OUTPUT_DIR, assetId, "status.json");
}

function persist(state: DrmJobState) {
  state.updatedAt = new Date().toISOString();
  jobs.set(state.assetId, state);
  try {
    fs.mkdirSync(path.dirname(statusPath(state.assetId)), { recursive: true });
    fs.writeFileSync(statusPath(state.assetId), JSON.stringify(state, null, 2));
  } catch (err) {
    console.warn("[drm-packaging] failed to persist status:", err);
  }
}

function isInProgress(status: DrmJobStatus) {
  return status !== "ready" && status !== "failed";
}

function findBinary(names: string[]): string | null {
  for (const name of names) {
    try {
      const check = spawnSync(name, ["-version"], { stdio: "ignore" });
      if (check.status === 0 || check.error === undefined) return name;
    } catch {
      // not available
    }
  }
  return null;
}

function probeVideo(ffprobeBin: string, file: string): { height: number | null; durationSec: number | null } {
  try {
    const out = spawnSync(
      ffprobeBin,
      ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=height:format=duration", "-of", "json", file],
      { encoding: "utf8" }
    );
    const j = JSON.parse(out.stdout || "{}") as { streams?: Array<{ height?: number }>; format?: { duration?: string } };
    const height = j.streams?.[0]?.height ?? null;
    const durationSec = j.format?.duration ? Number.parseFloat(j.format.duration) : null;
    return { height: Number.isFinite(height as number) ? height : null, durationSec: Number.isFinite(durationSec as number) ? durationSec : null };
  } catch {
    return { height: null, durationSec: null };
  }
}

/** Runs a child process, resolving with the exit code; `onLine` receives stdout lines (ffmpeg -progress). */
function runProcess(
  bin: string,
  args: string[],
  opts: { onLine?: (line: string) => void; env?: NodeJS.ProcessEnv }
): Promise<{ code: number; stderrTail: string }> {
  return new Promise((resolve) => {
    const child = spawn(bin, args, { stdio: ["ignore", "pipe", "pipe"], env: opts.env ?? process.env });
    let stderrTail = "";
    let buf = "";
    child.stdout?.on("data", (d: Buffer) => {
      buf += d.toString();
      let idx: number;
      while ((idx = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, idx).trim();
        buf = buf.slice(idx + 1);
        if (line) opts.onLine?.(line);
      }
    });
    child.stderr?.on("data", (d: Buffer) => {
      stderrTail = (stderrTail + d.toString()).slice(-3000);
    });
    child.on("error", (err) => resolve({ code: -1, stderrTail: err.message }));
    child.on("close", (code) => resolve({ code: code ?? -1, stderrTail }));
  });
}

/** Reads job state from memory, falling back to disk. Marks abandoned jobs failed. */
export function getDrmJobState(assetIdRaw: string): DrmJobState | null {
  const assetId = sanitizeAssetId(assetIdRaw);
  let state = jobs.get(assetId) || null;

  if (!state) {
    try {
      const p = statusPath(assetId);
      if (fs.existsSync(p)) state = JSON.parse(fs.readFileSync(p, "utf8")) as DrmJobState;
    } catch {
      state = null;
    }
  }

  if (!state) {
    // Legacy asset packaged before job tracking existed.
    const manifest = path.join(DRM_OUTPUT_DIR, assetId, "manifest.mpd");
    if (fs.existsSync(manifest)) {
      const now = new Date().toISOString();
      return {
        assetId,
        status: "ready",
        progress: 100,
        source: "",
        rawVideoId: assetId,
        manifestUrl: `/api/videos/drm/${assetId}/manifest.mpd`,
        startedAt: now,
        updatedAt: now,
        finishedAt: now,
      };
    }
    return null;
  }

  // A job that is "in progress" on disk but not in memory means the server
  // restarted mid-way (or the heartbeat died). Don't leave the UI spinning.
  const inMemory = jobs.has(assetId);
  const stale = Date.now() - Date.parse(state.updatedAt) > STALE_MS;
  if (isInProgress(state.status) && (!inMemory || stale)) {
    state.status = "failed";
    state.error = "انقطعت عملية التشفير (تمت إعادة تشغيل الخادم أو توقفت العملية). يرجى إعادة المحاولة.";
    state.finishedAt = new Date().toISOString();
    persist(state);
    void revertVideosOnFailure(state);
  }

  return state;
}

/** Reads the normalised source for a packaged/packaging asset (used for playback fallback). */
export function readAssetSource(assetIdRaw: string): string | null {
  const assetId = sanitizeAssetId(assetIdRaw);
  try {
    const keyFile = path.join(DRM_KEYS_DIR, `${assetId}.json`);
    if (fs.existsSync(keyFile)) {
      const data = JSON.parse(fs.readFileSync(keyFile, "utf8")) as { source?: string };
      if (data.source) return normaliseSource(data.source);
    }
  } catch {
    // ignore
  }
  const state = jobs.get(assetId);
  return state?.source || null;
}

/** Older single-key packages of the same source so retargeting picks them up. */
function siblingAssetIdsForSource(source: string): string[] {
  const wanted = normaliseSource(source);
  const ids: string[] = [];
  try {
    if (!fs.existsSync(DRM_KEYS_DIR)) return ids;
    for (const name of fs.readdirSync(DRM_KEYS_DIR)) {
      if (!name.endsWith(".json")) continue;
      try {
        const data = JSON.parse(fs.readFileSync(path.join(DRM_KEYS_DIR, name), "utf8")) as {
          assetId?: string;
          source?: string;
        };
        if (data.source && normaliseSource(data.source) === wanted && data.assetId) {
          ids.push(data.assetId);
        }
      } catch {
        // ignore one bad file
      }
    }
  } catch {
    // ignore
  }
  return ids;
}

function normaliseSource(source: string): string {
  if (source.startsWith("gdrive_")) return source;
  // Absolute or relative path to a local upload → alasly id is the basename.
  return path.basename(source);
}

async function freeBytes(dir: string): Promise<number | null> {
  try {
    const s = await fs.promises.statfs(dir);
    return Number(s.bavail) * Number(s.bsize);
  } catch {
    return null;
  }
}

function formatGB(bytes: number) {
  return `${(bytes / 1024 ** 3).toFixed(1)} جيجابايت`;
}

/**
 * Starts (or returns the existing) packaging job. Returns the initial state
 * synchronously-ish; the heavy work continues in the background.
 */
export async function startDrmPackagingJob(params: StartJobParams): Promise<DrmJobState> {
  const assetId = sanitizeAssetId(
    params.assetId || `cenc_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`
  );

  const existing = getDrmJobState(assetId);
  if (existing && (existing.status === "ready" || isInProgress(existing.status))) {
    return existing;
  }

  const source = params.gdriveFileId ? `gdrive_${params.gdriveFileId}` : path.basename(params.rawVideoId);

  if (!params.gdriveFileId) {
    const sourcePath = path.join(UPLOADS_DIR, path.basename(params.rawVideoId));
    if (!fs.existsSync(sourcePath)) {
      throw new Error(`ملف الفيديو غير موجود على السيرفر لتشفيره: ${path.basename(params.rawVideoId)}`);
    }
  }

  if (!findPackagerBinary()) {
    throw new Error("أداة Shaka Packager غير مثبتة على السيرفر. يرجى مراجعة إعدادات السيرفر.");
  }

  const now = new Date().toISOString();
  const state: DrmJobState = {
    assetId,
    status: "queued",
    progress: 0,
    source,
    requestedBy: params.requestedBy,
    dbVideoId: params.dbVideoId ?? null,
    rawVideoId: params.rawVideoId,
    manifestUrl: `/api/videos/drm/${assetId}/manifest.mpd`,
    error: null,
    startedAt: now,
    updatedAt: now,
    finishedAt: null,
  };
  persist(state);

  // Write the key file up-front so playback can already resolve the *source*
  // for the alasly fallback while the job runs (see video-provider.ts).
  const keyId = crypto.randomBytes(16).toString("hex");
  const key = crypto.randomBytes(16).toString("hex");
  fs.mkdirSync(DRM_KEYS_DIR, { recursive: true });
  fs.writeFileSync(
    path.join(DRM_KEYS_DIR, `${assetId}.json`),
    JSON.stringify({ assetId, keyId, key, source, status: "processing", createdAt: now }, null, 2)
  );

  // Serialise jobs: this box has 2 vCPU / 1.8 GB RAM.
  g.__drmQueue = (g.__drmQueue || Promise.resolve())
    .then(() => runJob(state, keyId, key))
    .catch((err) => console.error("[drm-packaging] queue error:", err));

  return state;
}

async function runJob(state: DrmJobState, keyId: string, key: string) {
  const outputDir = path.join(DRM_OUTPUT_DIR, state.assetId);
  const manifestPath = path.join(outputDir, "manifest.mpd");
  const videoOut = path.join(outputDir, "video.mp4");
  const videoHdOut = path.join(outputDir, "video_hd.mp4");
  const videoSdOut = path.join(outputDir, "video_sd.mp4");
  const audioOut = path.join(outputDir, "audio.mp4");
  const sdRendition = path.join(DRM_TEMP_DIR, `drm-sd-${state.assetId}.mp4`);
  let tempFile: string | null = null;

  const fail = async (message: string) => {
    console.error(`[drm-packaging] ${state.assetId} failed: ${message}`);
    state.status = "failed";
    state.error = message;
    state.finishedAt = new Date().toISOString();
    persist(state);
    for (const f of [videoOut, videoHdOut, videoSdOut, audioOut, manifestPath, sdRendition]) {
      try { if (fs.existsSync(f)) fs.unlinkSync(f); } catch { /* ignore */ }
    }
    if (tempFile) { try { fs.unlinkSync(tempFile); } catch { /* ignore */ } }
    await revertVideosOnFailure(state);
  };

  try {
    fs.mkdirSync(outputDir, { recursive: true });
    fs.mkdirSync(DRM_TEMP_DIR, { recursive: true });

    // ── 1. Resolve source file ────────────────────────────────────────────────
    let sourcePath: string;
    let sourceBytes = 0;

    if (state.source.startsWith("gdrive_")) {
      const fileId = state.source.slice("gdrive_".length);
      state.status = "downloading";
      persist(state);

      const token = await getGoogleDriveAccessToken();
      const authHeaders = { Authorization: `Bearer ${token}` };

      // Size first so we can refuse early when the disk cannot hold source + output.
      const metaRes = await fetch(
        `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?fields=size,name,mimeType&supportsAllDrives=true`,
        { headers: authHeaders }
      );
      if (metaRes.ok) {
        const meta = (await metaRes.json()) as { size?: string };
        sourceBytes = Number(meta.size || 0);
      }

      if (sourceBytes > 0) {
        const free = await freeBytes(DRM_OUTPUT_DIR);
        // temp download + HD output (≈ source) + SD rendition ×2 (~20 % each) + headroom
        const needed = Math.round(sourceBytes * 2.4) + 500 * 1024 * 1024;
        if (free !== null && free < needed) {
          await fail(
            `مساحة القرص غير كافية للتشفير: مطلوب ${formatGB(needed)} والمتاح ${formatGB(free)}. احذف فيديوهات قديمة أو وسّع القرص.`
          );
          return;
        }
        state.totalBytes = sourceBytes;
      }

      const dl = await fetch(
        `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media&supportsAllDrives=true`,
        { headers: authHeaders }
      );
      if (!dl.ok || !dl.body) {
        await fail(`فشل تنزيل ملف الفيديو من Google Drive (${dl.status}). تأكد من صحة الرابط ومشاركته مع حساب الخدمة.`);
        return;
      }

      tempFile = path.join(DRM_TEMP_DIR, `drm-src-${state.assetId}.mp4`);
      let downloaded = 0;
      let lastTick = 0;
      const counter = new Transform({
        transform(chunk, _enc, cb) {
          downloaded += chunk.length;
          const now = Date.now();
          if (now - lastTick > 2000) {
            lastTick = now;
            state.downloadedBytes = downloaded;
            state.progress = sourceBytes ? Math.min(99, Math.round((downloaded / sourceBytes) * 100)) : 0;
            persist(state);
          }
          cb(null, chunk);
        },
      });

      await pipeline(
        Readable.fromWeb(dl.body as Parameters<typeof Readable.fromWeb>[0]),
        counter,
        fs.createWriteStream(tempFile)
      );

      const st = fs.statSync(tempFile);
      if (st.size === 0) {
        await fail("تم تنزيل ملف فارغ من Google Drive. تأكد من صلاحيات مشاركة الملف.");
        return;
      }
      sourceBytes = st.size;
      state.downloadedBytes = st.size;
      state.progress = 100;
      persist(state);
      sourcePath = tempFile;
    } else {
      sourcePath = path.join(UPLOADS_DIR, state.source);
      if (!fs.existsSync(sourcePath)) {
        await fail(`ملف الفيديو غير موجود على السيرفر: ${state.source}`);
        return;
      }
      sourceBytes = fs.statSync(sourcePath).size;
      const free = await freeBytes(DRM_OUTPUT_DIR);
      const needed = Math.round(sourceBytes * 1.4) + 500 * 1024 * 1024;
      if (free !== null && free < needed) {
        await fail(`مساحة القرص غير كافية للتشفير: مطلوب ${formatGB(needed)} والمتاح ${formatGB(free)}.`);
        return;
      }
    }

    // ── 2. SD rendition (ffmpeg) for the software-licensable tier ────────────
    const packagerBin = findPackagerBinary();
    if (!packagerBin) {
      await fail("أداة Shaka Packager غير مثبتة على السيرفر.");
      return;
    }

    const ffmpegBin = findBinary(["ffmpeg", "/usr/local/bin/ffmpeg", "/usr/bin/ffmpeg"]);
    const ffprobeBin = findBinary(["ffprobe", "/usr/local/bin/ffprobe", "/usr/bin/ffprobe"]);
    const probe = ffprobeBin ? probeVideo(ffprobeBin, sourcePath) : { height: null, durationSec: null };

    // Tiering only makes sense when the source is meaningfully above SD and we can transcode.
    const tiered = Boolean(ffmpegBin) && (probe.height === null || probe.height > SD_TIER.height + 60);

    const sdKey: DrmTierKey = { label: SD_TIER.label, keyId, key, hardwareOnly: false, height: tiered ? SD_TIER.height : probe.height };
    const tierKeys: DrmTierKey[] = [sdKey];

    if (tiered) {
      state.status = "transcoding";
      state.progress = 0;
      persist(state);

      const hb = setInterval(() => persist(state), 5000);
      const durationUs = probe.durationSec ? probe.durationSec * 1_000_000 : 0;
      const ff = await runProcess(
        "nice",
        [
          "-n", "10",
          ffmpegBin as string,
          "-hide_banner", "-loglevel", "error", "-nostdin", "-y",
          "-i", sourcePath,
          "-an",
          "-vf", `scale=-2:${SD_TIER.height}`,
          "-c:v", "libx264",
          "-profile:v", "main",
          "-preset", SD_TIER.preset,
          "-crf", String(SD_TIER.crf),
          "-threads", "0", // niced, so the live site still wins CPU when it needs it
          "-movflags", "+faststart",
          "-progress", "pipe:1",
          sdRendition,
        ],
        {
          onLine: (line) => {
            if (durationUs && line.startsWith("out_time_us=")) {
              const t = Number(line.slice("out_time_us=".length));
              if (Number.isFinite(t)) state.progress = Math.min(99, Math.round((t / durationUs) * 100));
            } else if (durationUs && line.startsWith("out_time_ms=")) {
              const t = Number(line.slice("out_time_ms=".length));
              if (Number.isFinite(t)) state.progress = Math.min(99, Math.round((t / durationUs) * 100));
            }
          },
        }
      );
      clearInterval(hb);

      if (ff.code !== 0 || !fs.existsSync(sdRendition) || fs.statSync(sdRendition).size === 0) {
        await fail(`فشل إنشاء نسخة SD (ffmpeg، رمز ${ff.code}) — ${ff.stderrTail.trim().split("\n").slice(-2).join(" | ")}`);
        return;
      }

      tierKeys.push({
        label: HD_TIER.label,
        keyId: crypto.randomBytes(16).toString("hex"),
        key: crypto.randomBytes(16).toString("hex"),
        hardwareOnly: true,
        height: probe.height,
      });
    }

    // ── 3. Shaka Packager (async, so the event loop keeps serving the site) ──
    state.status = "packaging";
    state.progress = 0;
    persist(state);

    const streamArgs = tiered
      ? [
          `in=${sdRendition},stream=video,output=${videoSdOut},drm_label=SD`,
          `in=${sourcePath},stream=video,output=${videoHdOut},drm_label=HD`,
          // Audio rides on the SD key so software devices still get sound.
          `in=${sourcePath},stream=audio,output=${audioOut},drm_label=SD`,
        ]
      : [
          `in=${sourcePath},stream=video,output=${videoOut},drm_label=SD`,
          `in=${sourcePath},stream=audio,output=${audioOut},drm_label=SD`,
        ];

    const args = [
      ...streamArgs,
      `--temp_dir=${DRM_TEMP_DIR}`,
      "--io_cache_size=33554432",
      "--enable_raw_key_encryption",
      `--keys=${tierKeys.map((t) => `label=${t.label}:key_id=${t.keyId}:key=${t.key}`).join(",")}`,
      "--protection_systems=Widevine,PlayReady",
      "--protection_scheme=cenc",
      `--mpd_output=${manifestPath}`,
    ];

    const expectedOut = tiered ? sourceBytes + fs.statSync(sdRendition).size : sourceBytes;
    const outputs = tiered ? [videoSdOut, videoHdOut, audioOut] : [videoOut, audioOut];
    const hbPack = setInterval(() => {
      try {
        const written = outputs.reduce((sum, f) => sum + (fs.existsSync(f) ? fs.statSync(f).size : 0), 0);
        if (expectedOut > 0) state.progress = Math.min(99, Math.round((written / expectedOut) * 100));
      } catch { /* ignore */ }
      persist(state);
    }, 5000);

    const pk = await runProcess("nice", ["-n", "10", packagerBin, ...args], {
      env: { ...process.env, TMPDIR: DRM_TEMP_DIR },
    });
    clearInterval(hbPack);

    if (tempFile) {
      try { fs.unlinkSync(tempFile); } catch { /* ignore */ }
      tempFile = null;
    }
    try { if (fs.existsSync(sdRendition)) fs.unlinkSync(sdRendition); } catch { /* ignore */ }

    const outputsOk = outputs.every((f) => fs.existsSync(f) && fs.statSync(f).size > 0);
    if (pk.code !== 0 || !fs.existsSync(manifestPath) || !outputsOk) {
      const tail = pk.stderrTail.trim().split("\n").slice(-3).join(" | ");
      await fail(`فشلت عملية التشفير Shaka Packager (رمز الخطأ: ${pk.code})${tail ? ` — ${tail}` : ""}`);
      return;
    }

    // ── 3. Finalise: sanitise manifest, persist keys, point lessons at the asset ─
    state.status = "finalizing";
    state.progress = 100;
    persist(state);

    try {
      let mpd = fs.readFileSync(manifestPath, "utf8");
      mpd = mpd.replace(/<SupplementalProperty schemeIdUri="urn:mpeg:mpegB:cicp:TransferCharacteristics"[^>]*\/>\s*/g, "");
      fs.writeFileSync(manifestPath, mpd, "utf8");
    } catch (err) {
      console.warn("[drm-packaging] manifest sanitise failed:", err);
    }

    fs.writeFileSync(
      path.join(DRM_KEYS_DIR, `${state.assetId}.json`),
      JSON.stringify(
        {
          assetId: state.assetId,
          // Legacy single-key fields (SD / software tier) for older readers.
          keyId,
          key,
          tiered,
          keys: tierKeys,
          source: state.source,
          manifestUrl: state.manifestUrl,
          status: "ready",
          createdAt: state.startedAt,
          readyAt: new Date().toISOString(),
        },
        null,
        2
      )
    );

    try {
      const { saveVideoDrmKey } = await import("./axinom-pool");
      await saveVideoDrmKey({
        videoId: state.rawVideoId,
        assetId: state.assetId,
        keyId,
        keyHex: key,
        keys: tierKeys,
        manifestUrl: state.manifestUrl,
      });
    } catch (err) {
      console.error("[drm-packaging] failed to save DRM key to DB:", err);
    }

    try {
      const siblingIds = siblingAssetIdsForSource(state.source);
      const or: Array<Record<string, string>> = [
        { providerVideoId: state.rawVideoId },
        { providerVideoId: state.source },
        { providerVideoId: state.assetId },
        ...siblingIds.map((id) => ({ providerVideoId: id })),
      ];
      if (state.dbVideoId) or.push({ id: state.dbVideoId });
      await prisma.video.updateMany({
        where: { OR: or },
        data: { videoProvider: "axinom", providerVideoId: state.assetId },
      });
    } catch (err) {
      console.warn("[drm-packaging] video row update failed:", err);
    }

    state.status = "ready";
    state.error = null;
    state.finishedAt = new Date().toISOString();
    persist(state);

    // Every packaged lesson is copied to S3 automatically (origin); the local
    // copy becomes an evictable cache. Background, best-effort, re-runnable.
    void import("./video-storage")
      .then(({ uploadDrmPackageToS3 }) => uploadDrmPackageToS3(state.assetId))
      .then((r) => {
        if (r.failed.length) console.error(`[drm-packaging] S3 copy incomplete for ${state.assetId}: ${r.failed.join(", ")}`);
        else console.info(`[drm-packaging] ${state.assetId} copied to S3 (${r.uploaded.length} files)`);
      })
      .catch((err) => console.error("[drm-packaging] S3 copy failed:", err));
    console.info(
      `[drm-packaging] ${state.assetId} ready (${formatGB(sourceBytes)}, ${tiered ? "tiered HD=hw-only / SD=sw" : "single key"})`
    );
  } catch (err) {
    await fail(err instanceof Error ? err.message : "حدث خطأ غير متوقع أثناء التشفير");
  }
}

/**
 * If a lesson was already saved pointing at this asset and packaging failed,
 * send it back to the Native (alasly) engine on the original source so the
 * student can still watch, instead of a permanently broken DRM lesson.
 */
async function revertVideosOnFailure(state: DrmJobState) {
  if (!state.source) return;
  try {
    await prisma.video.updateMany({
      where: { providerVideoId: state.assetId },
      data: { videoProvider: "alasly", providerVideoId: state.source },
    });
  } catch (err) {
    console.warn("[drm-packaging] revert on failure skipped:", err);
  }
}
