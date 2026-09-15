import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { prisma } from "./prisma";

// ── Bandwidth Constants ───────────────────────────────────────────────────────
export const BYTES_PER_MB = 1024 * 1024;
export const BYTES_PER_GB = 1024 * 1024 * 1024;
export const DEFAULT_BANDWIDTH_LIMIT_BYTES = BigInt(5) * BigInt(BYTES_PER_GB); // 5 GB default
export const DEFAULT_VALIDITY_DAYS = 30; // 30 days default

// Average streaming bitrate: ~1.2 Mbps ≈ 150 KB/sec ≈ 9 MB/minute
export const BYTES_PER_VIDEO_MINUTE = 150 * 1024 * 60; // 9,216,000 bytes/min (~9 MB)

// ── AES-256-GCM Encryption (Aligned with project standard in ai-provider.ts) ──
function aesKey(): Buffer {
  const secret = process.env.CONFIG_ENCRYPTION_KEY;
  if (!secret) throw new Error("CONFIG_ENCRYPTION_KEY is not set in environment");
  return createHash("sha256").update(secret).digest();
}

/** Returns "iv:authTag:ciphertext" (all base64) */
export function encryptVdoCipherSecret(plaintext: string): string {
  const secret = process.env.CONFIG_ENCRYPTION_KEY ?? "";
  if (secret.length < 32) {
    throw new Error("CONFIG_ENCRYPTION_KEY must be at least 32 characters");
  }
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", aesKey(), iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64")}:${tag.toString("base64")}:${enc.toString("base64")}`;
}

export function decryptVdoCipherSecret(payload: string): string {
  const [ivB64, tagB64, dataB64] = payload.split(":");
  if (!ivB64 || !tagB64 || !dataB64) throw new Error("Malformed ciphertext");
  const decipher = createDecipheriv("aes-256-gcm", aesKey(), Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(dataB64, "base64")), decipher.final()]).toString("utf8");
}

/** Masks API key for safe Superadmin display: "••••••••a1fE" */
export function maskApiKey(key: string): string {
  if (!key) return "••••••••";
  const trimmed = key.trim();
  if (trimmed.length <= 4) return "••••" + trimmed;
  return "••••••••" + trimmed.slice(-4);
}

// ── Public Account Shapes (Never exposes plaintext API key) ───────────────────
export interface PublicVdoCipherAccount {
  id: string;
  name: string;
  apiKeyMasked: string;
  playerId: string | null;
  bandwidthLimitBytes: number;
  bandwidthUsedBytes: number;
  bandwidthReservedBytes: number;
  bandwidthSafeRemainingBytes: number;
  bandwidthLimitGb: number;
  bandwidthUsedGb: number;
  bandwidthSafeRemainingGb: number;
  bandwidthPercentUsed: number;
  expiresAt: string;
  daysRemaining: number;
  isExpired: boolean;
  isActive: boolean;
  notes: string | null;
  activeViewersCount: number;
  totalVideosCount: number;
  isEligibleForUpload: boolean;
  isEligibleForPlayback: boolean;
  createdAt: string;
  updatedAt: string;
}

// ── Bandwidth Estimation ──────────────────────────────────────────────────────
/**
 * Estimates the expected bandwidth consumption for a student watch session.
 * Uses video duration / size metadata, bounding between 50 MB and 1.5 GB.
 */
export function estimateSessionBandwidth(video: {
  durationMinutes?: number | null;
  durationSeconds?: number | null;
  sizeBytes?: bigint | number | null;
}): bigint {
  if (video.sizeBytes && Number(video.sizeBytes) > 0) {
    // If exact video size is known, reserve up to the file size (capped at 1.5 GB)
    const size = Number(video.sizeBytes);
    return BigInt(Math.min(size, 1.5 * BYTES_PER_GB));
  }

  const durationMinutes =
    typeof video.durationMinutes === "number" && video.durationMinutes > 0
      ? video.durationMinutes
      : typeof video.durationSeconds === "number" && video.durationSeconds > 0
      ? video.durationSeconds / 60
      : 45;

  const effectiveMinutes = Math.max(5, durationMinutes);
  const estimated = effectiveMinutes * BYTES_PER_VIDEO_MINUTE;
  const clamped = Math.max(50 * BYTES_PER_MB, Math.min(estimated, 1.5 * BYTES_PER_GB));
  return BigInt(Math.floor(clamped));
}

// ── Account Stats & Secret Accounting ─────────────────────────────────────────
export async function getAccountWithComputedStats(
  account: {
    id: string;
    name: string;
    apiKeyEnc: string;
    playerId: string | null;
    bandwidthLimitBytes: bigint;
    bandwidthUsedBytes: bigint;
    expiresAt: Date;
    isActive: boolean;
    notes: string | null;
    createdAt: Date;
    updatedAt: Date;
    _count?: { videoAssets?: number };
  },
  activeReservationsSum?: bigint,
  activeViewersCount?: number
): Promise<PublicVdoCipherAccount> {
  const now = new Date();
  const limit = Number(account.bandwidthLimitBytes);
  const used = Number(account.bandwidthUsedBytes);

  let reserved = 0;
  let viewers = activeViewersCount ?? 0;

  if (activeReservationsSum !== undefined) {
    reserved = Number(activeReservationsSum);
  } else {
    // Query active reservations if not passed in
    const activeRes = await prisma.vdoCipherReservation.findMany({
      where: {
        accountId: account.id,
        status: "active",
        expiresAt: { gt: now },
      },
      select: { reservedBytes: true },
    });
    reserved = activeRes.reduce((sum, r) => sum + Number(r.reservedBytes), 0);
    viewers = activeRes.length;
  }

  const safeRemaining = Math.max(0, limit - (used + reserved));
  const percentUsed = limit > 0 ? Math.min(100, Math.round(((used + reserved) / limit) * 100)) : 100;
  const isExpired = account.expiresAt <= now;
  const daysRemaining = Math.max(
    0,
    Math.ceil((account.expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
  );

  let apiKeyMasked = "••••••••";
  try {
    const decrypted = decryptVdoCipherSecret(account.apiKeyEnc);
    apiKeyMasked = maskApiKey(decrypted);
  } catch {
    apiKeyMasked = "••••(error)";
  }

  const isEligibleForUpload = account.isActive && !isExpired && safeRemaining >= 200 * BYTES_PER_MB;
  const isEligibleForPlayback = account.isActive && !isExpired && safeRemaining > 0;

  return {
    id: account.id,
    name: account.name,
    apiKeyMasked,
    playerId: account.playerId,
    bandwidthLimitBytes: limit,
    bandwidthUsedBytes: used,
    bandwidthReservedBytes: reserved,
    bandwidthSafeRemainingBytes: safeRemaining,
    bandwidthLimitGb: Number((limit / BYTES_PER_GB).toFixed(2)),
    bandwidthUsedGb: Number((used / BYTES_PER_GB).toFixed(2)),
    bandwidthSafeRemainingGb: Number((safeRemaining / BYTES_PER_GB).toFixed(2)),
    bandwidthPercentUsed: percentUsed,
    expiresAt: account.expiresAt.toISOString(),
    daysRemaining,
    isExpired,
    isActive: account.isActive,
    notes: account.notes,
    activeViewersCount: viewers,
    totalVideosCount: account._count?.videoAssets ?? 0,
    isEligibleForUpload,
    isEligibleForPlayback,
    createdAt: account.createdAt.toISOString(),
    updatedAt: account.updatedAt.toISOString(),
  };
}

/** Fetches all accounts with secret bandwidth calculations */
export async function getAllAccountsWithStats(): Promise<PublicVdoCipherAccount[]> {
  const now = new Date();
  const accounts = await prisma.vdoCipherAccount.findMany({
    include: {
      _count: { select: { videoAssets: true } },
      reservations: {
        where: { status: "active", expiresAt: { gt: now } },
        select: { reservedBytes: true },
      },
    },
    orderBy: [{ isActive: "desc" }, { createdAt: "asc" }],
  });

  return Promise.all(
    accounts.map(async (acc) => {
      const activeReserved = acc.reservations.reduce((sum, r) => sum + r.reservedBytes, BigInt(0));
      const viewersCount = acc.reservations.length;
      return getAccountWithComputedStats(acc, activeReserved, viewersCount);
    })
  );
}

// ── Intelligent Account Selection ─────────────────────────────────────────────
/**
 * Selects the best VdoCipher account for uploading a new video.
 * Criteria: Active, not expired (valid for ≥ 24h), highest safe capacity, least load.
 */
export async function selectBestAccountForUpload(options?: {
  estimatedSizeBytes?: bigint | number;
}): Promise<{
  id: string;
  name: string;
  apiKey: string;
  playerId: string | null;
  safeRemainingBytes: number;
} | null> {
  const now = new Date();
  const minExpiration = new Date(now.getTime() + 24 * 60 * 60 * 1000); // at least 24h validity
  const requiredBytes = options?.estimatedSizeBytes ? BigInt(options.estimatedSizeBytes) : BigInt(300 * BYTES_PER_MB);

  const accounts = await prisma.vdoCipherAccount.findMany({
    where: {
      isActive: true,
      expiresAt: { gt: minExpiration },
    },
    include: {
      reservations: {
        where: { status: "active", expiresAt: { gt: now } },
        select: { reservedBytes: true },
      },
    },
  });

  if (!accounts.length) {
    // If no accounts with >24h validity, try any active non-expired account
    const fallbackAccounts = await prisma.vdoCipherAccount.findMany({
      where: {
        isActive: true,
        expiresAt: { gt: now },
      },
      include: {
        reservations: {
          where: { status: "active", expiresAt: { gt: now } },
          select: { reservedBytes: true },
        },
      },
    });
    if (!fallbackAccounts.length) return null;
    accounts.push(...fallbackAccounts);
  }

  // Score each account
  const candidates: Array<{
    account: (typeof accounts)[0];
    safeRemaining: bigint;
    activeViewers: number;
    decryptedKey: string;
  }> = [];

  for (const acc of accounts) {
    const totalReserved = acc.reservations.reduce((sum, r) => sum + r.reservedBytes, BigInt(0));
    const safeRemaining = acc.bandwidthLimitBytes - (acc.bandwidthUsedBytes + totalReserved);

    if (safeRemaining >= requiredBytes) {
      try {
        const decryptedKey = decryptVdoCipherSecret(acc.apiKeyEnc);
        candidates.push({
          account: acc,
          safeRemaining,
          activeViewers: acc.reservations.length,
          decryptedKey,
        });
      } catch (err) {
        console.error(`[VdoCipher Accounts] Failed to decrypt key for account ${acc.id}:`, err);
      }
    }
  }

  if (!candidates.length) return null;

  // Sort candidates:
  // 1. Highest safe capacity first
  // 2. Lowest active viewers count as tie-breaker
  candidates.sort((a, b) => {
    if (b.safeRemaining !== a.safeRemaining) {
      return b.safeRemaining > a.safeRemaining ? 1 : -1;
    }
    return a.activeViewers - b.activeViewers;
  });

  const best = candidates[0];
  return {
    id: best.account.id,
    name: best.account.name,
    apiKey: best.decryptedKey,
    playerId: best.account.playerId,
    safeRemainingBytes: Number(best.safeRemaining),
  };
}

// ── Viewer Bandwidth Reservation & Playback Routing ───────────────────────────
export interface PlaybackAccountSelection {
  accountId: string;
  apiKey: string;
  playerId: string | null;
  vdoCipherVideoId: string;
  reservationId?: string;
  reservedBytes: bigint;
}

/**
 * Concurrency-safe Viewer Bandwidth Reservation.
 * Selects an eligible account holding the video, checks safe remaining capacity,
 * and creates a reservation record atomically inside a database transaction `tx`.
 */
export async function reserveViewerBandwidth(
  tx: any,
  params: {
    videoId: string;
    studentId: string;
    sessionToken: string;
    durationMinutes?: number | null;
    rawVdoCipherId?: string;
  }
): Promise<PlaybackAccountSelection> {
  const now = new Date();
  const estimatedBytes = estimateSessionBandwidth({ durationMinutes: params.durationMinutes });

  // 1. Expire stale active reservations for clean math
  await tx.vdoCipherReservation.updateMany({
    where: {
      status: "active",
      expiresAt: { lt: now },
    },
    data: { status: "expired" },
  });

  // 2. Query all available VdoCipher video assets for this video
  const assets = await tx.vdoCipherVideoAsset.findMany({
    where: {
      videoId: params.videoId,
      status: "ready",
      account: {
        isActive: true,
        expiresAt: { gt: now },
      },
    },
    include: {
      account: {
        include: {
          reservations: {
            where: { status: "active", expiresAt: { gt: now } },
            select: { reservedBytes: true },
          },
        },
      },
    },
  });

  // If explicit assets exist in multi-account DB
  if (assets.length > 0) {
    const candidates: Array<{
      asset: (typeof assets)[0];
      safeRemaining: bigint;
      activeCount: number;
      decryptedKey: string;
    }> = [];

    for (const a of assets) {
      const reserved = a.account.reservations.reduce((sum: bigint, r: any) => sum + BigInt(r.reservedBytes || 0), BigInt(0));
      const limit = BigInt(a.account.bandwidthLimitBytes || 0);
      const used = BigInt(a.account.bandwidthUsedBytes || 0);
      const safeRemaining: bigint = limit > (used + reserved) ? limit - (used + reserved) : BigInt(0);

      if (safeRemaining >= estimatedBytes) {
        try {
          const key = decryptVdoCipherSecret(a.account.apiKeyEnc);
          candidates.push({
            asset: a,
            safeRemaining,
            activeCount: a.account.reservations.length,
            decryptedKey: key,
          });
        } catch (e) {
          console.error(`[VdoCipher Reservation] Decrypt failure for account ${a.accountId}:`, e);
        }
      }
    }

    if (candidates.length > 0) {
      // Pick healthiest candidate (highest safe remaining)
      candidates.sort((a, b) => {
        if (b.safeRemaining !== a.safeRemaining) {
          return b.safeRemaining > a.safeRemaining ? 1 : -1;
        }
        return a.activeCount - b.activeCount;
      });

      const selected = candidates[0];
      const reservationExpiresAt = new Date(now.getTime() + 4 * 60 * 60 * 1000); // 4-hour watch window

      const reservation = await tx.vdoCipherReservation.create({
        data: {
          accountId: selected.asset.accountId,
          videoId: params.videoId,
          studentId: params.studentId,
          sessionToken: params.sessionToken,
          reservedBytes: estimatedBytes,
          status: "active",
          expiresAt: reservationExpiresAt,
        },
      });

      return {
        accountId: selected.asset.accountId,
        apiKey: selected.decryptedKey,
        playerId: selected.asset.account.playerId,
        vdoCipherVideoId: selected.asset.vdoCipherVideoId,
        reservationId: reservation.id,
        reservedBytes: estimatedBytes,
      };
    }
  }

  // Fallback: If no dedicated asset row exists yet (legacy videos or direct ID), check if there is an active account in DB or env
  const allAccounts = await tx.vdoCipherAccount.findMany({
    where: { isActive: true, expiresAt: { gt: now } },
    include: {
      reservations: {
        where: { status: "active", expiresAt: { gt: now } },
        select: { reservedBytes: true },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  const legacyVdoId = params.rawVdoCipherId || "";

  if (allAccounts.length > 0 && legacyVdoId) {
    for (const acc of allAccounts) {
      const reserved = acc.reservations.reduce((sum: bigint, r: any) => sum + BigInt(r.reservedBytes || 0), BigInt(0));
      const limit = BigInt(acc.bandwidthLimitBytes || 0);
      const used = BigInt(acc.bandwidthUsedBytes || 0);
      const safeRemaining = limit > (used + reserved) ? limit - (used + reserved) : BigInt(0);

      if (safeRemaining >= estimatedBytes) {
        try {
          const key = decryptVdoCipherSecret(acc.apiKeyEnc);
          const reservationExpiresAt = new Date(now.getTime() + 4 * 60 * 60 * 1000);

          const reservation = await tx.vdoCipherReservation.create({
            data: {
              accountId: acc.id,
              videoId: params.videoId,
              studentId: params.studentId,
              sessionToken: params.sessionToken,
              reservedBytes: estimatedBytes,
              status: "active",
              expiresAt: reservationExpiresAt,
            },
          });

          return {
            accountId: acc.id,
            apiKey: key,
            playerId: acc.playerId,
            vdoCipherVideoId: legacyVdoId,
            reservationId: reservation.id,
            reservedBytes: estimatedBytes,
          };
        } catch {}
      }
    }
  }

  // Fallback to global environment variable if no multi-account is configured
  const envSecret = process.env.VDOCIPHER_API_SECRET || "";
  return {
    accountId: "env-global",
    apiKey: envSecret,
    playerId: null,
    vdoCipherVideoId: legacyVdoId,
    reservedBytes: BigInt(0),
  };
}

/**
 * Releases or completes an active viewer bandwidth reservation.
 * Increments the account's actual consumed bandwidth (`bandwidthUsedBytes`).
 */
export async function releaseViewerBandwidth(
  sessionToken: string,
  options?: {
    completed?: boolean;
    actualBytes?: bigint | number | null;
  }
): Promise<void> {
  const now = new Date();
  try {
    const reservation = await prisma.vdoCipherReservation.findFirst({
      where: { sessionToken, status: "active" },
    });

    if (!reservation) return;

    const consumed =
      options?.actualBytes && Number(options.actualBytes) > 0
        ? BigInt(options.actualBytes)
        : reservation.reservedBytes;

    await prisma.$transaction([
      prisma.vdoCipherReservation.update({
        where: { id: reservation.id },
        data: {
          status: options?.completed ? "completed" : "released",
          releasedAt: now,
        },
      }),
      prisma.vdoCipherAccount.update({
        where: { id: reservation.accountId },
        data: {
          bandwidthUsedBytes: { increment: consumed },
        },
      }),
    ]);
  } catch (error) {
    console.error("[VdoCipher Accounts] Error releasing bandwidth reservation:", error);
  }
}

// ── VdoCipher API Calls ───────────────────────────────────────────────────────
export interface VdoCipherUploadTicket {
  uploadLink: string;
  clientPayload: {
    uploadLink: string;
    policy: string;
    "x-amz-signature": string;
    "x-amz-date": string;
    key: string;
    "x-amz-algorithm": string;
    "x-amz-credential": string;
    success_action_status: string;
    [key: string]: any;
  };
  videoId: string;
}

/**
 * Initiates an upload on VdoCipher via `PUT https://dev.vdocipher.com/api/videos`.
 * Returns upload credentials for S3 transfer without exposing API secret to client.
 */
export async function requestVdoCipherUploadTicket(params: {
  apiKey: string;
  title: string;
  folderId?: string;
}): Promise<VdoCipherUploadTicket> {
  const queryParams = new URLSearchParams({ title: params.title.trim() });
  if (params.folderId) {
    queryParams.set("folderId", params.folderId);
  }

  const response = await fetch(`https://dev.vdocipher.com/api/videos?${queryParams.toString()}`, {
    method: "PUT",
    headers: {
      Authorization: `Apisecret ${params.apiKey}`,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[VdoCipher API] Upload ticket error ${response.status}: ${errorText}`);
    let detailedMsg = "";
    try {
      const parsed = JSON.parse(errorText);
      detailedMsg = parsed.message || parsed.error || errorText;
    } catch {
      detailedMsg = errorText.slice(0, 200);
    }
    throw new Error(`تعذر إنشاء تذكرة رفع VdoCipher (${response.status}): ${detailedMsg || "طلب غير مصرح به"}`);
  }

  const data = await response.json();
  return {
    uploadLink: data.clientPayload?.uploadLink || data.uploadLink,
    clientPayload: data.clientPayload,
    videoId: data.videoId || data.id || data.clientPayload?.key,
  };
}

/**
 * Generates OTP & Playback credentials using a specific account's credentials.
 */
export async function generateAccountOtp(params: {
  apiKey: string;
  playerId?: string | null;
  vdoCipherVideoId: string;
  userId?: string;
  watermarkText?: string;
  ttl?: number;
}): Promise<{
  otp: string;
  playbackInfo: string;
  embedUrl: string;
}> {
  const { apiKey, playerId, vdoCipherVideoId, userId, watermarkText, ttl = 120 } = params;

  if (!apiKey || apiKey === "test") {
    const mockOtp = "mock-otp-" + Date.now();
    const mockPlaybackInfo = "mock-playback-info-" + Date.now();
    const playerParam = playerId ? `&player=${encodeURIComponent(playerId)}` : "";
    return {
      otp: mockOtp,
      playbackInfo: mockPlaybackInfo,
      embedUrl: `https://player.vdocipher.com/v2/?otp=${mockOtp}&playbackInfo=${mockPlaybackInfo}${playerParam}`,
    };
  }

  const body: any = { ttl };
  if (userId) {
    body.userId = userId;
  }
  if (watermarkText) {
    body.annotate = JSON.stringify([
      {
        type: "rtext",
        text: watermarkText,
        alpha: "0.45",
        color: "0xFFFFFF",
        size: "15",
        interval: "5000",
      },
    ]);
  }

  const response = await fetch(`https://dev.vdocipher.com/api/videos/${vdoCipherVideoId}/otp`, {
    method: "POST",
    headers: {
      Authorization: `Apisecret ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[VdoCipher API] OTP Error ${response.status}: ${errorText}`);
    throw new Error(`VdoCipher API Error: ${response.status}`);
  }

  const data = await response.json();
  const playerParam = playerId ? `&player=${encodeURIComponent(playerId)}` : "";
  const embedUrl = `https://player.vdocipher.com/v2/?otp=${data.otp}&playbackInfo=${data.playbackInfo}${playerParam}`;

  return {
    otp: data.otp,
    playbackInfo: data.playbackInfo,
    embedUrl,
  };
}

/**
 * Tests connection to VdoCipher API with provided API key.
 */
export async function testVdoCipherApiKey(apiKey: string): Promise<{
  ok: boolean;
  error?: string;
  totalVideos?: number;
}> {
  try {
    if (!apiKey || apiKey.trim().length < 10) {
      return { ok: false, error: "مفتاح API غير صالح (قصير جداً)" };
    }

    if (apiKey === "test") {
      return { ok: true, totalVideos: 0 };
    }

    const response = await fetch("https://dev.vdocipher.com/api/videos?limit=1", {
      method: "GET",
      headers: {
        Authorization: `Apisecret ${apiKey.trim()}`,
      },
    });

    if (!response.ok) {
      return { ok: false, error: `فشل التحقق من المفتاح (رمز الاستجابة: ${response.status})` };
    }

    const data = await response.json();
    return {
      ok: true,
      totalVideos: typeof data.total === "number" ? data.total : Array.isArray(data.rows) ? data.rows.length : 0,
    };
  } catch (err: any) {
    return { ok: false, error: err.message || "تعذر الاتصال بخوادم VdoCipher" };
  }
}

/**
 * Periodic sweeper to expire stale active reservations.
 */
export async function reconcileStaleReservations(): Promise<number> {
  const now = new Date();
  const result = await prisma.vdoCipherReservation.updateMany({
    where: {
      status: "active",
      expiresAt: { lt: now },
    },
    data: { status: "expired" },
  });
  return result.count;
}

/**
 * Automatically ensures a video exists on an active VdoCipher account on-request.
 * If the video was on an old/expired account and a new account has been added,
 * triggers an automated background transfer from Google Drive/local source to the new account
 * so the new account contains the old videos when requested.
 */
export async function ensureVideoSyncedToActiveAccount(video: {
  id: string;
  title?: string;
  url?: string | null;
  providerVideoId?: string | null;
  vdoCipherId?: string | null;
}): Promise<{
  active: boolean;
  vdoCipherVideoId?: string;
  syncing?: boolean;
}> {
  // 1. Check if an active asset already exists on an active account
  const currentAsset = await prisma.vdoCipherVideoAsset.findFirst({
    where: {
      videoId: video.id,
      account: { isActive: true },
    },
    include: { account: true },
  });

  if (currentAsset && currentAsset.account.isActive) {
    return { active: true, vdoCipherVideoId: currentAsset.vdoCipherVideoId };
  }

  // 2. Locate the best active account (e.g. newly added account)
  const bestAccount = await selectBestAccountForUpload();
  if (!bestAccount || !bestAccount.apiKey) {
    return { active: false };
  }

  // 3. Extract Google Drive file ID if available
  const rawUrl = video.url || video.providerVideoId || "";
  const match =
    rawUrl.match(/\/file\/d\/([a-zA-Z0-9_-]+)/) ||
    rawUrl.match(/gdrive_([a-zA-Z0-9_-]+)/) ||
    rawUrl.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  const fileId = match?.[1];

  if (!fileId) {
    return { active: false };
  }

  // 4. Trigger asynchronous background transfer to the new account (non-blocking for current viewer)
  setTimeout(async () => {
    try {
      console.info(`[vdocipher-sync] Starting on-request background sync for video ${video.id} to new account ${bestAccount.name}...`);
      const { getGoogleDriveAccessToken } = await import("./google-drive");
      const { createWriteStream, openAsBlob, existsSync, mkdirSync } = await import("node:fs");
      const { unlink } = await import("node:fs/promises");
      const path = await import("node:path");
      const { Readable } = await import("node:stream");
      const { pipeline } = await import("node:stream/promises");
      const { randomUUID } = await import("node:crypto");

      const token = await getGoogleDriveAccessToken();
      const downloadUrl = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media&supportsAllDrives=true`;
      const res = await fetch(downloadUrl, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok || !res.body) {
        console.error(`[vdocipher-sync] Failed to download file from Google Drive: ${res.status}`);
        return;
      }

      const tempDir = path.resolve(process.cwd(), "uploads", "temp");
      if (!existsSync(tempDir)) mkdirSync(tempDir, { recursive: true });
      const tempPath = path.join(tempDir, `sync-vdocipher-${randomUUID()}.mp4`);

      await pipeline(Readable.fromWeb(res.body as any), createWriteStream(tempPath));

      const ticket = await requestVdoCipherUploadTicket({
        apiKey: bestAccount.apiKey,
        title: video.title || "درس مستورد تلقائياً",
      });

      const videoBlob = await openAsBlob(tempPath, { type: "video/mp4" });
      const formData = new FormData();
      if (ticket.clientPayload) {
        for (const k of Object.keys(ticket.clientPayload)) {
          if (k !== "uploadLink") formData.append(k, ticket.clientPayload[k]);
        }
      }
      formData.append("file", videoBlob, "video.mp4");

      const s3Res = await fetch(ticket.uploadLink, { method: "POST", body: formData });
      await unlink(tempPath).catch(() => {});

      if (s3Res.ok || s3Res.status === 201 || s3Res.status === 204) {
        // Register asset under the new account
        await prisma.$transaction([
          prisma.vdoCipherVideoAsset.create({
            data: {
              videoId: video.id,
              accountId: bestAccount.id,
              vdoCipherVideoId: ticket.videoId,
            },
          }),
          prisma.video.update({
            where: { id: video.id },
            data: {
              videoProvider: "vdocipher",
              vdoCipherId: ticket.videoId,
              providerVideoId: ticket.videoId,
            },
          }),
        ]);
        console.info(`[vdocipher-sync] Successfully synced video ${video.id} to new account ${bestAccount.name} with assetId ${ticket.videoId}!`);
      }
    } catch (err) {
      console.error("[vdocipher-sync] Error syncing video to new account:", err);
    }
  }, 100);

  return { active: false, syncing: true };
}
