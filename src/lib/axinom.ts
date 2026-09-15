import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  AXINOM_CONFIG,
  SAME_ORIGIN_LICENSE_SERVERS,
  type AxinomContentKey,
  type AxinomTokenOptions,
  type AxinomDrmPayload,
} from "./axinom-config";

export {
  AXINOM_CONFIG,
  type AxinomContentKey,
  type AxinomTokenOptions,
  type AxinomDrmPayload,
};

/**
 * Returns the Communication Key buffer for signing tokens.
 */
function getCommunicationKeyBuffer(): Buffer {
  const rawKey = (process.env.AXINOM_COMMUNICATION_KEY || "").trim();
  if (!rawKey) {
    // Signing with a placeholder key produces a token that looks valid but is
    // rejected by Axinom with an opaque error, which is far harder to diagnose
    // than failing here.
    throw new Error(
      "[Axinom DRM] AXINOM_COMMUNICATION_KEY is not configured. Cannot mint a license token."
    );
  }

  // 64-char Hex format
  if (/^[0-9a-fA-F]{64}$/.test(rawKey)) {
    return Buffer.from(rawKey, "hex");
  }
  // 44-char Base64 format with trailing '=' or standard base64 structure
  if (/^[A-Za-z0-9+/]{42,43}={0,2}$/.test(rawKey) && rawKey.endsWith("=")) {
    return Buffer.from(rawKey, "base64");
  }
  // UTF-8 or raw binary string
  return Buffer.from(rawKey, "utf-8");
}

/**
 * Axinom identifies content keys by GUID, while Shaka Packager emits and
 * consumes them as unseparated hex. Convert without changing the value.
 */
function toKeyGuid(value: string): string {
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
 * Wraps a content key for transport inside the entitlement token.
 *
 * Axinom expects the raw 16-byte key encrypted with the communication key and
 * base64-encoded — one AES block, no padding and no IV prefix, which is what
 * the reference token in this file decodes to.
 */
function encryptContentKey(keyHex: string, communicationKey: Buffer): string {
  const keyBytes = Buffer.from(keyHex.replace(/-/g, ""), "hex");
  if (keyBytes.length !== 16) {
    throw new Error(`[Axinom DRM] Content key must be 16 bytes, got ${keyBytes.length}.`);
  }
  const cipher = crypto.createCipheriv(
    "aes-256-cbc",
    communicationKey,
    Buffer.alloc(16, 0)
  );
  cipher.setAutoPadding(false);
  return Buffer.concat([cipher.update(keyBytes), cipher.final()]).toString("base64");
}

/**
 * Security policies attached to content keys.
 *
 * Splitting renditions across two keys is what lets hardware and software
 * devices coexist: a software (L3 / SL2000) CDM is licensed for the SD key
 * only, so Shaka drops the HD renditions for it rather than refusing to play.
 * PlayReady security levels are 2000 for software and 3000 for hardware.
 */
const HARDWARE_POLICY = "hw-secure";
const SOFTWARE_POLICY = "sw-secure";

const USAGE_POLICIES = [
  {
    name: HARDWARE_POLICY,
    playready: { min_device_security_level: 3000 },
    widevine: {
      device_security_level: "HW_SECURE_DECODE",
    },
  },
  {
    name: SOFTWARE_POLICY,
    playready: { min_device_security_level: 2000 },
    widevine: { device_security_level: "SW_SECURE_CRYPTO" },
  },
];

function base64UrlEncode(input: Buffer | string): string {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(input, "utf-8");
  return buf
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

/**
 * Creates a signed Axinom DRM Entitlement Token (JWT) with X-AxDRM-Message schema.
 */
export function createAxinomDrmToken(options: AxinomTokenOptions): AxinomDrmPayload {
  const expiresInSeconds = options.expiresInSeconds || 2 * 60 * 60; // 2 hours
  const nowUnix = Math.floor(Date.now() / 1000);
  const expUnix = nowUnix + expiresInSeconds;
  const expiresAt = new Date(expUnix * 1000).toISOString();

  // Clear DASH Test Vector (Plays on all browsers including Brave with Widevine disabled)
  if (options.videoId === "axinom_clear" || options.videoId === "clear_demo") {
    return {
      token: "",
      manifestUrl: "https://media.axprod.net/TestVectors/v7-Clear/Manifest_1080p.mpd",
      licenseServers: {
        widevine: "",
        playready: "",
        fairplay: "",
      },
      expiresAt,
      expiresInSeconds,
    };
  }

  // Official Axinom Widevine + PlayReady Multi-DRM Test Vector (1080p CENC)
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

  const header = {
    alg: "HS256",
    typ: "JWT",
  };

  const keyBuffer = getCommunicationKeyBuffer();

  // Determine content keys source (explicit inline key or Key-seed derivation)
  let usesTieredPolicies = false;
  let contentKeysSource: Record<string, unknown> = {
    key_seed: {
      key_seed_id: AXINOM_CONFIG.keySeedId,
    },
  };

  try {
    let tieredKeys: AxinomContentKey[] | undefined = options.keys;
    let keyId = options.keyId;
    let key = options.key;
    if (!tieredKeys?.length && (!keyId || !key)) {
      const safeId = String(options.videoId).replace(/[^a-zA-Z0-9_-]/g, "_");
      const keyFilePath = path.resolve(process.cwd(), "uploads", "drm-keys", `${safeId}.json`);
      if (fs.existsSync(keyFilePath)) {
        const keyData = JSON.parse(fs.readFileSync(keyFilePath, "utf8"));
        if (Array.isArray(keyData.keys) && keyData.keys.length) {
          tieredKeys = keyData.keys;
        } else if (keyData.keyId && keyData.key) {
          keyId = keyData.keyId;
          key = keyData.key;
        }
      }
    }

    if (!tieredKeys?.length && keyId && key) {
      tieredKeys = [{ keyId, key, hardwareOnly: false }];
    }

    if (tieredKeys?.length) {
      contentKeysSource = {
        inline: tieredKeys.map((entry) => ({
          id: toKeyGuid(entry.keyId),
          encrypted_key: encryptContentKey(entry.key, keyBuffer),
          usage_policy: entry.hardwareOnly ? HARDWARE_POLICY : SOFTWARE_POLICY,
        })),
      };
      usesTieredPolicies = true;
    }
  } catch {
    // If not found, use Key-seed ID
  }

  const entitlementMessage: Record<string, unknown> = {
    type: "entitlement_message",
    version: 2,
    iat: nowUnix,
    nbf: nowUnix - 30, // 30s clock skew allowance
    exp: expUnix,
    license: {
      allow_persistence: options.allowPersistence || false,
    },
    content_keys_source: contentKeysSource,
  };

  // Policies are only meaningful when keys reference them by name.
  if (usesTieredPolicies) {
    entitlementMessage.content_key_usage_policies = USAGE_POLICIES;
  }

  // Optional user tracking metadata
  if (options.userId) {
    entitlementMessage.user_id = options.userId;
  }

  // Wrap in Axinom License Service Message envelope
  const licenseServiceMessage = {
    version: 1,
    com_key_id: AXINOM_CONFIG.communicationKeyId,
    message: entitlementMessage,
  };

  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(licenseServiceMessage));
  const signingInput = `${encodedHeader}.${encodedPayload}`;


  const signature = crypto
    .createHmac("sha256", keyBuffer)
    .update(signingInput)
    .digest();

  const encodedSignature = base64UrlEncode(signature);
  const token = `${signingInput}.${encodedSignature}`;

  // Local or remote manifest URL
  let manifestUrl = options.videoId;
  if (!manifestUrl.startsWith("http://") && !manifestUrl.startsWith("https://")) {
    try {
      const safeId = String(options.videoId).replace(/[^a-zA-Z0-9_-]/g, "_");
      const keyFilePath = path.resolve(process.cwd(), "uploads", "drm-keys", `${safeId}.json`);
      if (fs.existsSync(keyFilePath)) {
        const keyData = JSON.parse(fs.readFileSync(keyFilePath, "utf8"));
        if (keyData.manifestUrl) {
          manifestUrl = keyData.manifestUrl;
        }
      }
    } catch {
      // ignore
    }

    if (!manifestUrl.startsWith("http://") && !manifestUrl.startsWith("https://")) {
      const safeId = String(options.videoId).replace(/[^a-zA-Z0-9_-]/g, "_");
      manifestUrl = `/api/videos/drm/${encodeURIComponent(safeId)}/manifest.mpd`;
    }
  }



  return {
    token,
    manifestUrl,
    licenseServers: {
      widevine: SAME_ORIGIN_LICENSE_SERVERS.widevine,
      playready: SAME_ORIGIN_LICENSE_SERVERS.playready,
      fairplay: SAME_ORIGIN_LICENSE_SERVERS.fairplay,
      fairplayCertUrl: AXINOM_CONFIG.endpoints.fairplayCert || undefined,
    },
    expiresAt,
    expiresInSeconds,
  };
}

/**
 * Validates an Axinom DRM token (HMAC-SHA256 signature and expiration).
 */
export function verifyAxinomToken(token: string): boolean {
  try {
    if (!token || typeof token !== "string") return false;
    const parts = token.trim().split(".");
    if (parts.length !== 3) return false;
    const [headerB64, payloadB64, sigB64] = parts;
    const rawKey = (process.env.AXINOM_COMMUNICATION_KEY || "").trim();
    if (!rawKey) return false;
    const keyBuf = getCommunicationKeyBuffer();
    const expectedSig = crypto
      .createHmac("sha256", keyBuf)
      .update(`${headerB64}.${payloadB64}`)
      .digest();
    const actualSig = Buffer.from(sigB64.replace(/-/g, "+").replace(/_/g, "/"), "base64");
    if (actualSig.length !== expectedSig.length) return false;
    if (!crypto.timingSafeEqual(expectedSig, actualSig)) return false;
    const payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8"));
    const exp = payload?.message?.exp || payload?.exp;
    if (exp && Math.floor(Date.now() / 1000) > exp) return false;
    return true;
  } catch {
    return false;
  }
}

