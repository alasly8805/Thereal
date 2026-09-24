import fs from "fs";
import path from "path";
import { spawn, spawnSync } from "child_process";
import { videoSizeInS3, uploadVideoToS3, presignedVideoReadUrl } from "./video-storage";

/**
 * Low-bandwidth renditions for Native (alasly) lessons.
 *
 * A lecture recorded at 1080p lands here as a single 1–2 GB MP4 (~5 Mbit/s),
 * which is unwatchable on a weak mobile connection — the student buffers
 * forever and gives up. There is no adaptive ladder to fall back on because the
 * file *is* the stream, so we pre-transcode a smaller copy next to the original
 * and let the player pick between them.
 *
 * A rendition is stored beside its source as `<base>__<height>p.mp4`, in the
 * same places the original lives (local disk cache + S3 origin behind
 * CloudFront), so /api/videos/stream serves it through exactly the same
 * authorization, Range, and CDN path as the original.
 */

const UPLOAD_DIR = path.join(process.cwd(), "uploads", "videos");

/** Ladder offered to students, smallest first. `maxKbps` caps the peak bitrate. */
export const RENDITION_LADDER = [
  { height: 360, label: "360p", note: "أقل استهلاك للإنترنت", maxKbps: 500, crf: 30 },
  { height: 480, label: "480p", note: "مناسب للإنترنت الضعيف", maxKbps: 900, crf: 28 },
  { height: 720, label: "720p", note: "جودة متوسطة", maxKbps: 1800, crf: 26 },
] as const;

export type RenditionHeight = (typeof RENDITION_LADDER)[number]["height"];

export const RENDITION_HEIGHTS: RenditionHeight[] = RENDITION_LADDER.map((r) => r.height);

export interface QualityOption {
  /** null means Auto — the original file, whatever height that is. */
  height: RenditionHeight | null;
  label: string;
  note?: string;
  bytes?: number;
  /** False until the transcoded file exists; the player still offers the tier. */
  ready?: boolean;
}

export function isRenditionHeight(value: unknown): value is RenditionHeight {
  return typeof value === "number" && (RENDITION_HEIGHTS as number[]).includes(value);
}

/** Parses the player's `?q=` parameter. Anything unrecognised (incl. "auto") means the original. */
export function parseQualityParam(raw: string | null | undefined): RenditionHeight | null {
  if (!raw) return null;
  const n = Number.parseInt(String(raw).replace(/p$/i, ""), 10);
  return isRenditionHeight(n) ? n : null;
}

/** `gdrive_x.mp4` + 480 → `gdrive_x__480p.mp4`. Renditions are always MP4. */
export function renditionFilename(baseFilename: string, height: RenditionHeight): string {
  const stem = path.basename(baseFilename).replace(/\.[^./]+$/, "");
  return `${stem}__${height}p.mp4`;
}

/** True for a name this module generated — used to refuse renditions of renditions. */
export function isRenditionFilename(name: string): boolean {
  return /__\d{3,4}p\.mp4$/i.test(path.basename(name));
}

/** Size of a rendition on local disk or in S3, or null when it does not exist yet. */
export async function renditionSize(name: string): Promise<number | null> {
  const local = path.join(UPLOAD_DIR, path.basename(name));
  try {
    if (fs.existsSync(local)) return fs.statSync(local).size;
  } catch {
    // fall through to S3
  }
  return videoSizeInS3(name);
}

/**
 * The filename /api/videos/stream should actually serve for a requested
 * quality. Falls back to the original whenever that rendition has not been
 * generated, so a stale `?q=` in a bookmarked URL never 404s a student.
 */
export async function resolveRenditionName(
  baseFilename: string,
  height: RenditionHeight | null
): Promise<string> {
  if (!height || isRenditionFilename(baseFilename)) return baseFilename;
  const candidate = renditionFilename(baseFilename, height);
  return (await renditionSize(candidate)) !== null ? candidate : baseFilename;
}

/**
 * Qualities the player offers for this asset: Auto plus 360p / 480p / 720p.
 *
 * The menu is always the full ladder so a student on a weak link can pick a
 * lighter copy without waiting for us to finish transcoding. Tiers that have
 * not been generated yet still appear; /api/videos/stream falls back to the
 * original rather than 404ing. Never throws.
 */
export async function availableQualities(baseFilename: string): Promise<QualityOption[]> {
  const auto: QualityOption = { height: null, label: "Auto", note: "تلقائي", ready: true };
  if (isRenditionFilename(baseFilename)) return [auto];

  const found = await Promise.all(
    RENDITION_LADDER.map(async (tier) => {
      const bytes = await renditionSize(renditionFilename(baseFilename, tier.height)).catch(() => null);
      return {
        height: tier.height,
        label: tier.label,
        note: tier.note,
        bytes: bytes ?? undefined,
        ready: bytes !== null,
      };
    })
  );

  return [auto, ...found];
}

// ── Generation ───────────────────────────────────────────────────────────────

function findBinary(names: string[]): string | null {
  for (const name of names) {
    try {
      const check = spawnSync(name, ["-version"], { stdio: "ignore" });
      if (check.status === 0) return name;
    } catch {
      // not available
    }
  }
  return null;
}

function probe(file: string): { height: number | null; durationSec: number | null } {
  const bin = findBinary(["ffprobe", "/usr/local/bin/ffprobe", "/usr/bin/ffprobe"]);
  if (!bin) return { height: null, durationSec: null };
  try {
    const out = spawnSync(
      bin,
      ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=height:format=duration", "-of", "json", file],
      { encoding: "utf8" }
    );
    const j = JSON.parse(out.stdout || "{}") as {
      streams?: Array<{ height?: number }>;
      format?: { duration?: string };
    };
    const height = j.streams?.[0]?.height ?? null;
    const duration = j.format?.duration ? Number.parseFloat(j.format.duration) : null;
    return {
      height: Number.isFinite(height as number) ? (height as number) : null,
      durationSec: Number.isFinite(duration as number) ? (duration as number) : null,
    };
  } catch {
    return { height: null, durationSec: null };
  }
}

/** Free bytes on the volume holding the upload directory, or null if unknown. */
function freeDiskBytes(): number | null {
  try {
    const st = fs.statfsSync(UPLOAD_DIR);
    return Number(st.bavail) * Number(st.bsize);
  } catch {
    return null;
  }
}

export interface GenerateRenditionResult {
  filename: string;
  bytes: number;
  skipped: boolean;
  reason?: string;
}

export interface GenerateRenditionOptions {
  /** Called with 0–100 as ffmpeg reports progress. */
  onProgress?: (percent: number) => void;
  /** Delete the local copy once it is safely in S3. Default false. */
  evictLocal?: boolean;
  /** Regenerate even when the rendition already exists. */
  force?: boolean;
}

interface SourceInput {
  /** A local file path, or a presigned https URL into the S3 origin. */
  input: string;
  remote: boolean;
}

/**
 * Where ffmpeg should read a lesson from: the local cache when it happens to be
 * warm, otherwise a presigned S3 URL. Returns null only when the lesson exists
 * in neither place (a Drive-only or placeholder row).
 */
export async function resolveSourceInput(baseFilename: string): Promise<SourceInput | null> {
  const name = path.basename(baseFilename);
  const local = path.join(UPLOAD_DIR, name);
  if (fs.existsSync(local)) return { input: local, remote: false };

  if ((await videoSizeInS3(name)) === null) return null;
  const url = await presignedVideoReadUrl(name);
  return url ? { input: url, remote: true } : null;
}

/**
 * Transcodes one lesson down to `height` and publishes it to S3.
 *
 * The box is a 2-vCPU t4g.medium serving live traffic, so ffmpeg runs under
 * `nice` and the output is written to a `.part` file first: a transcode killed
 * half-way must never leave a truncated MP4 that the player would happily serve
 * as a "480p" copy of a lecture that stops in the middle.
 */
export async function generateRendition(
  baseFilename: string,
  height: RenditionHeight,
  opts: GenerateRenditionOptions = {}
): Promise<GenerateRenditionResult> {
  const source = path.basename(baseFilename);
  if (isRenditionFilename(source)) {
    throw new Error(`${source} is already a rendition`);
  }
  const tier = RENDITION_LADDER.find((t) => t.height === height);
  if (!tier) throw new Error(`Unsupported rendition height: ${height}`);

  const outName = renditionFilename(source, height);
  if (!opts.force) {
    const existing = await renditionSize(outName);
    if (existing !== null) {
      return { filename: outName, bytes: existing, skipped: true, reason: "already exists" };
    }
  }

  // S3 is the origin and local disk is only an evictable cache, so a lesson
  // missing from uploads/ is not missing at all — read it straight from the
  // bucket. ffmpeg streams it over HTTP with Range requests, which means the
  // 1-2 GB source never has to be staged on the 30 GB volume.
  const sourceInput = await resolveSourceInput(source);
  if (!sourceInput) {
    return { filename: outName, bytes: 0, skipped: true, reason: "source not on local disk or in S3" };
  }

  const ffmpegBin = findBinary(["ffmpeg", "/usr/local/bin/ffmpeg", "/usr/bin/ffmpeg"]);
  if (!ffmpegBin) throw new Error("ffmpeg غير مثبت على السيرفر");

  const info = probe(sourceInput.input);
  if (info.height !== null && info.height <= height + 40) {
    return {
      filename: outName,
      bytes: 0,
      skipped: true,
      reason: `source is already ${info.height}p`,
    };
  }

  // Guard the volume against the *output* only. The source is streamed from S3
  // rather than copied down, so the catalog's size is not a local constraint;
  // the rendition we are about to write is.
  const estimate = info.durationSec ? (tier.maxKbps * 1000 * info.durationSec) / 8 : 500 * 1024 * 1024;
  const free = freeDiskBytes();
  if (free !== null && free < estimate * 1.5 + 512 * 1024 * 1024) {
    return {
      filename: outName,
      bytes: 0,
      skipped: true,
      reason: `not enough free disk (${(free / 1e9).toFixed(2)} GB free, needs ~${(estimate / 1e9).toFixed(2)} GB)`,
    };
  }

  const partPath = path.join(UPLOAD_DIR, `${outName}.part`);
  const outPath = path.join(UPLOAD_DIR, outName);
  if (fs.existsSync(partPath)) fs.unlinkSync(partPath);

  const durationUs = info.durationSec ? info.durationSec * 1_000_000 : 0;
  const code = await new Promise<number>((resolve) => {
    const child = spawn(
      "nice",
      [
        "-n", "15",
        ffmpegBin,
        "-hide_banner", "-loglevel", "error", "-nostdin", "-y",
        // A remote read runs for hours over one HTTPS connection; without these
        // a single dropped socket kills the whole transcode near the end.
        ...(sourceInput.remote
          ? [
              "-reconnect", "1",
              "-reconnect_streamed", "1",
              "-reconnect_on_network_error", "1",
              "-reconnect_delay_max", "30",
              "-rw_timeout", "30000000",
            ]
          : []),
        "-i", sourceInput.input,
        "-vf", `scale=-2:${height}`,
        "-c:v", "libx264",
        "-profile:v", "main",
        "-preset", "veryfast",
        "-crf", String(tier.crf),
        "-maxrate", `${tier.maxKbps}k`,
        "-bufsize", `${tier.maxKbps * 2}k`,
        "-g", "48",
        "-c:a", "aac",
        "-b:a", "64k",
        "-ac", "2",
        "-movflags", "+faststart",
        // niced, so the live site still wins CPU when it needs it
        "-threads", "0",
        "-progress", "pipe:1",
        "-f", "mp4",
        partPath,
      ],
      { stdio: ["ignore", "pipe", "pipe"] }
    );

    let buf = "";
    child.stdout?.on("data", (d: Buffer) => {
      buf += d.toString();
      let idx: number;
      while ((idx = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, idx).trim();
        buf = buf.slice(idx + 1);
        if (durationUs && opts.onProgress && line.startsWith("out_time_us=")) {
          const t = Number(line.slice("out_time_us=".length));
          if (Number.isFinite(t)) opts.onProgress(Math.min(99, Math.round((t / durationUs) * 100)));
        }
      }
    });
    let stderrTail = "";
    child.stderr?.on("data", (d: Buffer) => {
      stderrTail = (stderrTail + d.toString()).slice(-2000);
    });
    child.on("error", () => resolve(-1));
    child.on("close", (c) => {
      if (c !== 0 && stderrTail.trim()) {
        console.error(`[video-renditions] ffmpeg failed for ${outName}: ${stderrTail.trim().split("\n").slice(-2).join(" | ")}`);
      }
      resolve(c ?? -1);
    });
  });

  if (code !== 0 || !fs.existsSync(partPath) || fs.statSync(partPath).size === 0) {
    if (fs.existsSync(partPath)) fs.unlinkSync(partPath);
    throw new Error(`فشل إنشاء نسخة ${height}p (ffmpeg رمز ${code})`);
  }

  fs.renameSync(partPath, outPath);
  const bytes = fs.statSync(outPath).size;
  opts.onProgress?.(100);

  await uploadVideoToS3(outPath, outName);

  if (opts.evictLocal && (await videoSizeInS3(outName)) === bytes) {
    try {
      fs.unlinkSync(outPath);
    } catch {
      // keeping the local copy is harmless
    }
  }

  return { filename: outName, bytes, skipped: false };
}
