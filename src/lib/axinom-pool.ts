import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { prisma } from "./prisma";
import {
  AXINOM_CONFIG,
  SAME_ORIGIN_LICENSE_SERVERS,
  type AxinomContentKey,
  type AxinomTokenOptions,
  type AxinomDrmPayload,
} from "./axinom-config";

// ── Security & AES-256-GCM Encryption ─────────────────────────────────────────

function aesKey(): Buffer {
  const secret = process.env.CONFIG_ENCRYPTION_KEY || process.env.SESSION_SECRET || "antigravity-secure-encryption-key-fallback-32chars";
  return createHash("sha256").update(secret).digest();
}

/**
 * Encrypts sensitive credentials (like Axinom Communication Key) using AES-256-GCM.
 * Output format: "iv:authTag:ciphertext" (all base64)
 */
export function encryptAxinomSecret(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", aesKey(), iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64")}:${tag.toString("base64")}:${enc.toString("base64")}`;
}

export function decryptAxinomSecret(payload: string): string {
  const [ivB64, tagB64, dataB64] = payload.split(":");
  if (!ivB64 || !tagB64 || !dataB64) throw new Error("Malformed ciphertext payload");
  const decipher = createDecipheriv("aes-256-gcm", aesKey(), Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(dataB64, "base64")), decipher.final()]).toString("utf8");
}

/** Masks API / Communication key for safe Superadmin display: "••••••••a1fE" */
export function maskAxinomSecret(key: string): string {
  if (!key) return "••••••••";
  const trimmed = key.trim();
  if (trimmed.length <= 6) return "••••" + trimmed;
  return "••••••••" + trimmed.slice(-6);
}

/** Converts raw string (hex or base64) into the required Communication Key Buffer */
export function parseCommunicationKeyBuffer(rawKey: string): Buffer {
  const trimmed = (rawKey || "").trim();
  if (!trimmed) {
    throw new Error("[Axinom Pool] Communication key is empty");
  }
  // 64-char Hex format (32 bytes AES-256)
  if (/^[0-9a-fA-F]{64}$/.test(trimmed)) {
    return Buffer.from(trimmed, "hex");
  }
  // 44-char Base64 format with trailing '=' or standard base64 structure
  if (/^[A-Za-z0-9+/]{42,43}={0,2}$/.test(trimmed) && trimmed.endsWith("=")) {
    return Buffer.from(trimmed, "base64");
  }
  // Standard base64 (32 bytes = 44 chars)
  if (/^[A-Za-z0-9+/]{43}=?$/.test(trimmed)) {
    return Buffer.from(trimmed, "base64");
  }
  // UTF-8 or raw binary string
  return Buffer.from(trimmed, "utf-8");
}

/** Convert GUID to standard hyphenated lowercase format */
export function toKeyGuid(value: string): string {
  const hex = value.replace(/-/g, "").toLowerCase();
  if (!/^[0-9a-f]{32}$/.test(hex)) return value;
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join("-");
}

/**
 * Encrypts a 16-byte raw Content Key with an account's Communication Key (AES-CBC no padding)
 */
export function encryptContentKeyWithCommKey(keyHex: string, communicationKey: Buffer): string {
  const keyBytes = Buffer.from(keyHex.replace(/-/g, ""), "hex");
  if (keyBytes.length !== 16) {
    throw new Error(`[Axinom Pool] Content key must be 16 bytes, got ${keyBytes.length}`);
  }
  const cipher = createCipheriv(
    "aes-256-cbc",
    communicationKey,
    Buffer.alloc(16, 0)
  );
  cipher.setAutoPadding(false);
  return Buffer.concat([cipher.update(keyBytes), cipher.final()]).toString("base64");
}

function base64UrlEncode(input: Buffer | string): string {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(input, "utf-8");
  return buf
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

// ── Public Account Types ───────────────────────────────────────────────────────

export type AxinomAccountStatus =
  | "primary"       // Active primary account currently serving requests
  | "standby"       // Active backup ready for failover
  | "exhausted"     // Quota reached (licensesUsed >= licenseLimit)
  | "expired"       // Past expiration date
  | "inactive";     // Manually disabled by admin

export interface PublicAxinomAccount {
  id: string;
  name: string;
  tenantId: string;
  communicationKeyId: string;
  communicationKeyMasked: string;
  keySeedId: string | null;
  widevineLicenseUrl: string;
  playreadyLicenseUrl: string;
  fairplayLicenseUrl: string;
  fairplayCertUrl: string | null;
  licenseLimit: number;
  licensesUsed: number;
  licensesRemaining: number;
  percentUsed: number;
  expiresAt: string;
  daysRemaining: number;
  isExpired: boolean;
  isActive: boolean;
  isPrimary: boolean;
  priority: number;
  notes: string | null;
  status: AxinomAccountStatus;
  isEligible: boolean;
  totalEventsCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface KPIAxinomStats {
  totalAccounts: number;
  activeAccounts: number;
  standbyAccounts: number;
  exhaustedAccounts: number;
  expiredAccounts: number;
  totalLicenseLimit: number;
  totalLicensesUsed: number;
  totalLicensesRemaining: number;
  overallPercentUsed: number;
}

// ── Endpoint Resolvers ────────────────────────────────────────────────────────

export function resolveEndpointsForTenant(tenantId: string, custom?: {
  widevine?: string | null;
  playready?: string | null;
  fairplay?: string | null;
  fairplayCert?: string | null;
}) {
  const cleanTenant = (tenantId || "").trim();
  return {
    widevine: custom?.widevine?.trim() || `https://${cleanTenant}.drm-widevine-licensing.axprod.net/AcquireLicense`,
    playready: custom?.playready?.trim() || `https://${cleanTenant}.drm-playready-licensing.axprod.net/AcquireLicense`,
    fairplay: custom?.fairplay?.trim() || `https://${cleanTenant}.drm-fairplay-licensing.axprod.net/AcquireLicense`,
    fairplayCert: custom?.fairplayCert?.trim() || null,
  };
}

// ── Computed Stats ────────────────────────────────────────────────────────────

export async function getAxinomAccountWithComputedStats(
  account: {
    id: string;
    name: string;
    tenantId: string;
    communicationKeyId: string;
    communicationKeyEnc: string;
    keySeedId: string | null;
    widevineLicenseUrl: string | null;
    playreadyLicenseUrl: string | null;
    fairplayLicenseUrl: string | null;
    fairplayCertUrl: string | null;
    licenseLimit: number;
    licensesUsed: number;
    expiresAt: Date;
    isActive: boolean;
    isPrimary: boolean;
    priority: number;
    notes: string | null;
    createdAt: Date;
    updatedAt: Date;
    _count?: { licenseEvents?: number };
  },
  eventsCount?: number
): Promise<PublicAxinomAccount> {
  const now = new Date();
  const limit = account.licenseLimit;
  const used = account.licensesUsed;
  const remaining = Math.max(0, limit - used);
  const percentUsed = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 100;
  const isExpired = account.expiresAt <= now;
  const isExhausted = used >= limit;
  const daysRemaining = Math.max(
    0,
    Math.ceil((account.expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
  );

  let communicationKeyMasked = "••••••••";
  try {
    const decrypted = decryptAxinomSecret(account.communicationKeyEnc);
    communicationKeyMasked = maskAxinomSecret(decrypted);
  } catch {
    communicationKeyMasked = "••••(error)";
  }

  const endpoints = resolveEndpointsForTenant(account.tenantId, {
    widevine: account.widevineLicenseUrl,
    playready: account.playreadyLicenseUrl,
    fairplay: account.fairplayLicenseUrl,
    fairplayCert: account.fairplayCertUrl,
  });

  const isEligible = account.isActive && !isExpired && !isExhausted;

  let status: AxinomAccountStatus = "inactive";
  if (!account.isActive) {
    status = "inactive";
  } else if (isExpired) {
    status = "expired";
  } else if (isExhausted) {
    status = "exhausted";
  } else if (account.isPrimary) {
    status = "primary";
  } else {
    status = "standby";
  }

  return {
    id: account.id,
    name: account.name,
    tenantId: account.tenantId,
    communicationKeyId: account.communicationKeyId,
    communicationKeyMasked,
    keySeedId: account.keySeedId,
    widevineLicenseUrl: endpoints.widevine,
    playreadyLicenseUrl: endpoints.playready,
    fairplayLicenseUrl: endpoints.fairplay,
    fairplayCertUrl: endpoints.fairplayCert,
    licenseLimit: limit,
    licensesUsed: used,
    licensesRemaining: remaining,
    percentUsed,
    expiresAt: account.expiresAt.toISOString(),
    daysRemaining,
    isExpired,
    isActive: account.isActive,
    isPrimary: account.isPrimary,
    priority: account.priority,
    notes: account.notes,
    status,
    isEligible,
    totalEventsCount: eventsCount ?? account._count?.licenseEvents ?? 0,
    createdAt: account.createdAt.toISOString(),
    updatedAt: account.updatedAt.toISOString(),
  };
}

/** Fetches all accounts from DB with computed quota stats & global KPIs */
export async function getAllAxinomAccountsWithStats(): Promise<{
  accounts: PublicAxinomAccount[];
  kpis: KPIAxinomStats;
}> {
  const accounts = await prisma.axinomAccount.findMany({
    include: {
      _count: { select: { licenseEvents: true } },
    },
    orderBy: [
      { isPrimary: "desc" },
      { priority: "asc" },
      { createdAt: "asc" },
    ],
  });

  const publicAccounts = await Promise.all(
    accounts.map((acc) => getAxinomAccountWithComputedStats(acc))
  );

  const totalAccounts = publicAccounts.length;
  const activeAccounts = publicAccounts.filter((a) => a.isEligible).length;
  const standbyAccounts = publicAccounts.filter((a) => a.status === "standby").length;
  const exhaustedAccounts = publicAccounts.filter((a) => a.status === "exhausted").length;
  const expiredAccounts = publicAccounts.filter((a) => a.status === "expired").length;

  const totalLicenseLimit = publicAccounts.reduce((sum, a) => sum + a.licenseLimit, 0);
  const totalLicensesUsed = publicAccounts.reduce((sum, a) => sum + a.licensesUsed, 0);
  const totalLicensesRemaining = Math.max(0, totalLicenseLimit - totalLicensesUsed);
  const overallPercentUsed =
    totalLicenseLimit > 0
      ? Math.min(100, Math.round((totalLicensesUsed / totalLicenseLimit) * 100))
      : 0;

  return {
    accounts: publicAccounts,
    kpis: {
      totalAccounts,
      activeAccounts,
      standbyAccounts,
      exhaustedAccounts,
      expiredAccounts,
      totalLicenseLimit,
      totalLicensesUsed,
      totalLicensesRemaining,
      overallPercentUsed,
    },
  };
}

// ── Active Account Selection & Failover ────────────────────────────────────────

export interface ResolvedActiveAxinomAccount {
  id: string;
  name: string;
  tenantId: string;
  communicationKeyId: string;
  communicationKey: Buffer;
  keySeedId: string | null;
  widevineLicenseUrl: string;
  playreadyLicenseUrl: string;
  fairplayLicenseUrl: string;
  fairplayCertUrl: string | null;
  licensesRemaining: number;
}

/**
 * Intelligent Account Selection with Automatic Failover:
 * 1. Checks all active accounts ordered by isPrimary (desc), priority (asc), createdAt (asc).
 * 2. Skips expired or exhausted accounts (where licensesUsed >= licenseLimit).
 * 3. Attempts decrypting communication key. If an account has corrupt keys, logs error and moves to next.
 * 4. Fallback: If no DB accounts qualify, falls back to env-configured default AXINOM_CONFIG.
 */
export async function getActiveAxinomAccount(): Promise<ResolvedActiveAxinomAccount | null> {
  const now = new Date();

  const candidates = await prisma.axinomAccount.findMany({
    where: {
      isActive: true,
      expiresAt: { gt: now },
    },
    orderBy: [
      { isPrimary: "desc" },
      { priority: "asc" },
      { createdAt: "asc" },
    ],
  });

  for (const acc of candidates) {
    if (acc.licensesUsed >= acc.licenseLimit) {
      // Account quota exhausted - failover to next
      continue;
    }

    try {
      const rawDecrypted = decryptAxinomSecret(acc.communicationKeyEnc);
      const keyBuffer = parseCommunicationKeyBuffer(rawDecrypted);
      const endpoints = resolveEndpointsForTenant(acc.tenantId, {
        widevine: acc.widevineLicenseUrl,
        playready: acc.playreadyLicenseUrl,
        fairplay: acc.fairplayLicenseUrl,
        fairplayCert: acc.fairplayCertUrl,
      });

      return {
        id: acc.id,
        name: acc.name,
        tenantId: acc.tenantId,
        communicationKeyId: acc.communicationKeyId,
        communicationKey: keyBuffer,
        keySeedId: acc.keySeedId,
        widevineLicenseUrl: endpoints.widevine,
        playreadyLicenseUrl: endpoints.playready,
        fairplayLicenseUrl: endpoints.fairplay,
        fairplayCertUrl: endpoints.fairplayCert,
        licensesRemaining: acc.licenseLimit - acc.licensesUsed,
      };
    } catch (err) {
      console.error(`[Axinom Pool] Failed to decrypt communication key for account ${acc.id} (${acc.name}):`, err);
    }
  }

  // Fallback to environment variables if no DB account is eligible
  const envRawKey = (process.env.AXINOM_COMMUNICATION_KEY || "").trim();
  if (envRawKey) {
    try {
      const keyBuffer = parseCommunicationKeyBuffer(envRawKey);
      return {
        id: "env_default",
        name: "Default Env Configuration",
        tenantId: AXINOM_CONFIG.tenantId,
        communicationKeyId: AXINOM_CONFIG.communicationKeyId,
        communicationKey: keyBuffer,
        keySeedId: AXINOM_CONFIG.keySeedId,
        widevineLicenseUrl: AXINOM_CONFIG.endpoints.widevine,
        playreadyLicenseUrl: AXINOM_CONFIG.endpoints.playready,
        fairplayLicenseUrl: AXINOM_CONFIG.endpoints.fairplay,
        fairplayCertUrl: AXINOM_CONFIG.endpoints.fairplayCert || null,
        licensesRemaining: 999999,
      };
    } catch {
      // fall through
    }
  }

  return null;
}

// ── DRM Key Persistence & Cross-Account Retrieval ──────────────────────────────

export interface SavedVideoDrmKey {
  videoId: string;
  assetId: string;
  keyId: string;
  key: string; // decrypted hex
  manifestUrl?: string | null;
}

/**
 * Saves a video's Content Key securely in PostgreSQL (AES-256-GCM encrypted).
 * Ensures that even across server moves or account failovers, the key is permanently accessible.
 */
/** Marker stored in `keyId` when `keyEnc` holds an encrypted JSON array of tiered keys. */
const TIERED_KEY_MARKER = "tiered:v1";

export async function saveVideoDrmKey(params: {
  videoId: string;
  assetId: string;
  keyId: string;
  keyHex: string;
  /** Tiered (HD hardware-only / SD software) keys — stored as one encrypted JSON blob. */
  keys?: AxinomContentKey[];
  manifestUrl?: string;
}): Promise<void> {
  const tiered = Array.isArray(params.keys) && params.keys.length > 1;
  const keyEnc = encryptAxinomSecret(tiered ? JSON.stringify(params.keys) : params.keyHex);
  const keyId = tiered ? TIERED_KEY_MARKER : params.keyId;
  await prisma.axinomVideoKey.upsert({
    where: { videoId: params.videoId },
    update: {
      assetId: params.assetId,
      keyId,
      keyEnc,
      manifestUrl: params.manifestUrl ?? null,
    },
    create: {
      videoId: params.videoId,
      assetId: params.assetId,
      keyId,
      keyEnc,
      manifestUrl: params.manifestUrl ?? null,
    },
  });
}

function readDiskDrmKeys(safeId: string): {
  tieredKeys: AxinomContentKey[];
  manifestUrl?: string;
} {
  try {
    const keyFilePath = path.resolve(process.cwd(), "uploads", "drm-keys", `${safeId}.json`);
    if (!fs.existsSync(keyFilePath)) return { tieredKeys: [] };
    const keyData = JSON.parse(fs.readFileSync(keyFilePath, "utf8"));
    if (Array.isArray(keyData.keys) && keyData.keys.length) {
      return { tieredKeys: keyData.keys, manifestUrl: keyData.manifestUrl || undefined };
    }
    if (keyData.keyId && keyData.key) {
      return {
        tieredKeys: [{ keyId: keyData.keyId, key: keyData.key, hardwareOnly: false }],
        manifestUrl: keyData.manifestUrl || undefined,
      };
    }
  } catch (err) {
    console.warn(`[Axinom Pool] Disk lookup for video key failed:`, err);
  }
  return { tieredKeys: [] };
}

/**
 * Retrieves a video's Content Key by videoId or assetId:
 * 1. Checks PostgreSQL `AxinomVideoKey`.
 * 2. Checks local disk `uploads/drm-keys/${safeId}.json`.
 * If found on disk but missing in DB, lazily backs it up to the DB!
 */
export async function resolveVideoContentKeys(
  videoId: string,
  optionsFallback?: { keyId?: string; key?: string; keys?: AxinomContentKey[] }
): Promise<{
  tieredKeys: AxinomContentKey[];
  manifestUrl?: string;
}> {
  const safeId = String(videoId).replace(/[^a-zA-Z0-9_-]/g, "_");

  // 1. Try DB first
  try {
    const dbKey = await prisma.axinomVideoKey.findFirst({
      where: {
        OR: [
          { videoId: videoId },
          { assetId: safeId },
          { assetId: videoId },
        ],
      },
    });

    if (dbKey) {
      const rawKey = decryptAxinomSecret(dbKey.keyEnc);
      if (dbKey.keyId === TIERED_KEY_MARKER) {
        const parsed = JSON.parse(rawKey) as AxinomContentKey[];
        if (Array.isArray(parsed) && parsed.length) {
          return { tieredKeys: parsed, manifestUrl: dbKey.manifestUrl || undefined };
        }
      } else {
        const disk = readDiskDrmKeys(safeId);
        // A leftover single-key DB row must not hide a later tiered package
        // (HD hardware-only + SD software). Prefer disk when it has both.
        if (disk.tieredKeys.length > 1) {
          saveVideoDrmKey({
            videoId,
            assetId: safeId,
            keyId: disk.tieredKeys[0].keyId,
            keyHex: disk.tieredKeys[0].key,
            keys: disk.tieredKeys,
            manifestUrl: disk.manifestUrl,
          }).catch((e) => console.error("[Axinom Pool] Lazy DB upgrade error:", e));
          return disk;
        }
        return {
          tieredKeys: [{ keyId: dbKey.keyId, key: rawKey, hardwareOnly: false }],
          manifestUrl: dbKey.manifestUrl || undefined,
        };
      }
    }
  } catch (err) {
    console.warn(`[Axinom Pool] DB lookup for video key failed, falling back to disk:`, err);
  }

  // 2. Try Disk file: uploads/drm-keys/${safeId}.json
  const disk = readDiskDrmKeys(safeId);
  if (disk.tieredKeys.length) {
    const foundKeyId = disk.tieredKeys[0].keyId;
    const foundKeyHex = disk.tieredKeys[0].key;
    if (foundKeyId && foundKeyHex) {
      saveVideoDrmKey({
        videoId,
        assetId: safeId,
        keyId: foundKeyId,
        keyHex: foundKeyHex,
        keys: disk.tieredKeys.length > 1 ? disk.tieredKeys : undefined,
        manifestUrl: disk.manifestUrl,
      }).catch((e) => console.error("[Axinom Pool] Lazy DB save error:", e));
    }
    return disk;
  }

  // 3. Fallback to passed-in options
  if (optionsFallback?.keys?.length) {
    return { tieredKeys: optionsFallback.keys };
  }
  if (optionsFallback?.keyId && optionsFallback?.key) {
    return {
      tieredKeys: [
        {
          keyId: optionsFallback.keyId,
          key: optionsFallback.key,
          hardwareOnly: false,
        },
      ],
    };
  }

  return { tieredKeys: [] };
}

// ── License Token Generation with Pool & Usage Tracking ────────────────────────

const HARDWARE_POLICY = "hw-secure";
const SOFTWARE_POLICY = "sw-secure";

const USAGE_POLICIES = [
  {
    name: HARDWARE_POLICY,
    playready: { min_device_security_level: 3000 },
    widevine: { device_security_level: "HW_SECURE_DECODE" },
  },
  {
    name: SOFTWARE_POLICY,
    playready: { min_device_security_level: 2000 },
    widevine: { device_security_level: "SW_SECURE_CRYPTO" },
  },
];

export interface MintTokenOptions extends AxinomTokenOptions {
  studentId?: string;
  ipAddress?: string;
  userAgent?: string;
}

/**
 * Mints an Axinom DRM Entitlement Token using the active account in the pool,
 * with atomic quota increment and audit logging.
 *
 * CRUCIAL FAILOVER GUARANTEE:
 * Because the video Content Key is encrypted on-demand with the ACTIVE account's
 * Communication Key, any previously packaged video (from Account 1) will play
 * seamlessly through Account 2 without re-encoding!
 */
export async function mintAxinomTokenWithPool(options: MintTokenOptions): Promise<AxinomDrmPayload> {
  const expiresInSeconds = options.expiresInSeconds || 2 * 60 * 60; // 2 hours default
  const nowUnix = Math.floor(Date.now() / 1000);
  const expUnix = nowUnix + expiresInSeconds;
  const expiresAt = new Date(expUnix * 1000).toISOString();

  // Test Vectors
  if (options.videoId === "axinom_clear" || options.videoId === "clear_demo") {
    return {
      token: "",
      manifestUrl: "https://media.axprod.net/TestVectors/v7-Clear/Manifest_1080p.mpd",
      licenseServers: { widevine: "", playready: "", fairplay: "" },
      expiresAt,
      expiresInSeconds,
    };
  }

  if (
    options.videoId === "axinom_demo" ||
    options.videoId === "axinom_test" ||
    options.videoId === "axinom_test_singlekey" ||
    options.videoId === "axinom_widevine_test"
  ) {
    return {
      token:
        "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ2ZXJzaW9uIjoxLCJjb21fa2V5X2lkIjoiYjMzNjRlYjUtNTFmNi00YWUzLThjOTgtMzNjZWQ1ZTMxYzc4IiwibWVzc2FnZSI6eyJ0eXBlIjoiZW50aXRsZW1lbnRfbWVzc2FnZSIsInZlcnNpb24iOjIsImxpY2Vuc2UiOnsiYWxsb3dfcGVyc2lzdGVuY2UiOnRydWV9LCJjb250ZW50X2tleXNfc291cmNlIjp7ImlubGluZSI6W3siaWQiOiI5ZWI0MDUwZC1lNDRiLTQ4MDItOTMyZS0yN2Q3NTA4M2UyNjYiLCJlbmNyeXB0ZWRfa2V5IjoibEszT2pITFlXMjRjcjJrdFI3NGZudz09IiwidXNhZ2VfcG9saWN5IjoiUG9saWN5IEEifV19LCJjb250ZW50X2tleV91c2FnZV9wb2xpY2llcyI6W3sibmFtZSI6IlBvbGljeSBBIiwicGxheXJlYWR5Ijp7Im1pbl9kZXZpY2Vfc2VjdXJpdHlfbGV2ZWwiOjE1MCwicGxheV9lbmFibGVycyI6WyI3ODY2MjdEOC1DMkE2LTQ0QkUtOEY4OC0wOEFFMjU1QjAxQTciXX19XX19.W2FbPDSDaq-LeeLfOnbpTMa-zCmXh8RLChEVDYvdcVw",
      manifestUrl: "https://media.axprod.net/TestVectors/v7-MultiDRM-SingleKey/Manifest_1080p.mpd",
      licenseServers: {
        widevine: SAME_ORIGIN_LICENSE_SERVERS.widevine,
        playready: SAME_ORIGIN_LICENSE_SERVERS.playready,
        fairplay: SAME_ORIGIN_LICENSE_SERVERS.fairplay,
      },
      expiresAt,
      expiresInSeconds,
    };
  }

  // 1. Fetch active account from pool
  const activeAccount = await getActiveAxinomAccount();
  if (!activeAccount) {
    throw new Error(
      "[Axinom DRM] No active Axinom accounts available in pool. Please add or enable an account in Superadmin Settings."
    );
  }

  // 2. Resolve content keys for the video
  const resolved = await resolveVideoContentKeys(options.videoId, {
    keyId: options.keyId,
    key: options.key,
    keys: options.keys,
  });

  const tieredKeys = resolved.tieredKeys;
  let manifestUrl = resolved.manifestUrl || options.videoId;

  let usesTieredPolicies = false;
  let contentKeysSource: Record<string, unknown> = {
    key_seed: {
      key_seed_id: activeAccount.keySeedId || AXINOM_CONFIG.keySeedId,
    },
  };

  if (tieredKeys.length > 0) {
    contentKeysSource = {
      inline: tieredKeys.map((entry) => ({
        id: toKeyGuid(entry.keyId),
        encrypted_key: encryptContentKeyWithCommKey(entry.key, activeAccount.communicationKey),
        usage_policy: entry.hardwareOnly ? HARDWARE_POLICY : SOFTWARE_POLICY,
      })),
    };
    usesTieredPolicies = true;
  }

  // 3. Build Entitlement Message
  const entitlementMessage: Record<string, unknown> = {
    type: "entitlement_message",
    version: 2,
    iat: nowUnix,
    nbf: nowUnix - 30, // 30s clock skew tolerance
    exp: expUnix,
    license: {
      allow_persistence: options.allowPersistence || false,
    },
    content_keys_source: contentKeysSource,
  };

  if (usesTieredPolicies) {
    entitlementMessage.content_key_usage_policies = USAGE_POLICIES;
  }

  if (options.userId) {
    entitlementMessage.user_id = options.userId;
  }

  // 4. Wrap in License Service Message and Sign
  const licenseServiceMessage = {
    version: 1,
    com_key_id: activeAccount.communicationKeyId,
    message: entitlementMessage,
  };

  const header = { alg: "HS256", typ: "JWT" };
  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(licenseServiceMessage));
  const signingInput = `${encodedHeader}.${encodedPayload}`;

  const signature = createHmac("sha256", activeAccount.communicationKey)
    .update(signingInput)
    .digest();

  const token = `${signingInput}.${base64UrlEncode(signature)}`;

  // 5. Atomic Usage Tracking & Audit Logging
  if (activeAccount.id !== "env_default") {
    // Atomically increment licensesUsed counter
    prisma.axinomAccount
      .update({
        where: { id: activeAccount.id },
        data: {
          licensesUsed: { increment: 1 },
        },
      })
      .catch((err) => console.error("[Axinom Pool] Failed to increment license usage:", err));

    // Log license event asynchronously
    prisma.axinomLicenseEvent
      .create({
        data: {
          accountId: activeAccount.id,
          videoId: options.videoId,
          studentId: options.studentId || options.userId || null,
          ipAddress: options.ipAddress || null,
          userAgent: options.userAgent || null,
        },
      })
      .catch((err) => console.error("[Axinom Pool] Failed to log license event:", err));
  }

  // Resolve Manifest URL
  if (!manifestUrl.startsWith("http://") && !manifestUrl.startsWith("https://")) {
    const safeId = String(options.videoId).replace(/[^a-zA-Z0-9_-]/g, "_");
    manifestUrl = `/api/videos/drm/${encodeURIComponent(safeId)}/manifest.mpd`;
  }

  return {
    token,
    manifestUrl,
    licenseServers: {
      widevine: SAME_ORIGIN_LICENSE_SERVERS.widevine,
      playready: SAME_ORIGIN_LICENSE_SERVERS.playready,
      fairplay: SAME_ORIGIN_LICENSE_SERVERS.fairplay,
      fairplayCertUrl: activeAccount.fairplayCertUrl || undefined,
    },
    expiresAt,
    expiresInSeconds,
  };
}

// ── Account Connection & Format Verification ───────────────────────────────────

export async function testAxinomAccountCredentials(params: {
  tenantId: string;
  communicationKeyId: string;
  communicationKey: string;
}): Promise<{ ok: boolean; message: string }> {
  try {
    const tenantId = (params.tenantId || "").trim();
    const comKeyId = (params.communicationKeyId || "").trim();
    const rawKey = (params.communicationKey || "").trim();

    if (!tenantId) return { ok: false, message: "Tenant ID مطلوب" };
    if (!comKeyId) return { ok: false, message: "Communication Key ID مطلوب" };
    if (!rawKey) return { ok: false, message: "Communication Key مطلوب" };

    // 1. Validate key format and parsing
    const keyBuf = parseCommunicationKeyBuffer(rawKey);
    if (keyBuf.length !== 32) {
      return {
        ok: false,
        message: `مفتاح Communication Key يجب أن يكون بطول 32 بايت (256-bit). الطول الحالي: ${keyBuf.length} بايت.`,
      };
    }

    // 2. Validate GUID format
    const guidRegex = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
    if (!guidRegex.test(comKeyId)) {
      return {
        ok: false,
        message: "Communication Key ID يجب أن يكون بصيغة GUID صالحة (UUID v4).",
      };
    }

    // 3. Test AES-CBC content key encryption with this communication key
    const testContentKey = "0123456789abcdef0123456789abcdef";
    const encKey = encryptContentKeyWithCommKey(testContentKey, keyBuf);
    if (!encKey) {
      return { ok: false, message: "فشلت عملية اختبار تشفير مفتاح المحتوى (AES-CBC)." };
    }

    // 4. Test HMAC-SHA256 signing
    const testHeader = base64UrlEncode(JSON.stringify({ alg: "HS256", typ: "JWT" }));
    const testPayload = base64UrlEncode(JSON.stringify({ test: true, tenantId }));
    const sig = createHmac("sha256", keyBuf).update(`${testHeader}.${testPayload}`).digest();
    if (!sig || sig.length !== 32) {
      return { ok: false, message: "فشلت عملية اختبار توقيع رمز الترخيص (HMAC-SHA256)." };
    }

    return {
      ok: true,
      message: `تم التحقق بنجاح! المفتاح صالح ومطابق لمعايير Axinom Multi-DRM (256-bit AES + HMAC-SHA256).`,
    };
  } catch (err: any) {
    return { ok: false, message: err.message || "حدث خطأ أثناء فحص الحساب" };
  }
}
