/**
 * Axinom Multi-DRM Public Configuration & Shared Types.
 * Pure, client-safe constants with zero Node.js dependencies (no fs, crypto, or path).
 */

export const AXINOM_CONFIG = {
  tenantId: process.env.AXINOM_TENANT_ID || "a85ddc8b-8c74-4fe3-806d-1f2f87df5745",
  communicationKeyId: process.env.AXINOM_COMMUNICATION_KEY_ID || "c7f03846-00ba-4af6-9fa4-b4ac0141be68",
  keySeedId: process.env.AXINOM_KEY_SEED_ID || "17d4929c-8f6a-45dc-89ed-b4ac0141be68",
  endpoints: {
    widevine: process.env.AXINOM_WIDEVINE_LICENSE_URL || "https://a85ddc8b.drm-widevine-licensing.axprod.net/AcquireLicense",
    playready: process.env.AXINOM_PLAYREADY_LICENSE_URL || "https://a85ddc8b.drm-playready-licensing.axprod.net/AcquireLicense",
    fairplay: process.env.AXINOM_FAIRPLAY_LICENSE_URL || "https://a85ddc8b.drm-fairplay-licensing.axprod.net/AcquireLicense",
    fairplayCert: process.env.AXINOM_FAIRPLAY_CERT_URL || "",
    spekeV2: "https://a85ddc8b.key-service-management.axprod.net/api/SpekeV2",
    cenc: "https://a85ddc8b.key-service-management.axprod.net/api/WidevineProtectionInfo",
  },
};

/**
 * Same-origin license endpoints. The browser talks only to this site; the
 * server forwards the CDM challenge to Axinom. Widevine/PlayReady keys never
 * leave the CDM — this only stops Brave Shields from blocking third-party
 * license hosts.
 */
export const SAME_ORIGIN_LICENSE_SERVERS = {
  widevine: "/api/drm/license/widevine",
  playready: "/api/drm/license/playready",
  fairplay: "/api/drm/license/fairplay",
} as const;

export interface AxinomContentKey {
  keyId: string;
  key: string;
  /** Rendition tier this key protects, e.g. "SD" or "HD". */
  label?: string;
  /** When true, only hardware-backed CDMs are licensed for this key. */
  hardwareOnly?: boolean;
}

export interface AxinomTokenOptions {
  videoId: string;
  userId?: string;
  expiresInSeconds?: number;
  allowPersistence?: boolean;
  keyId?: string;
  key?: string;
  /** Tiered keys. Takes precedence over the single keyId/key pair. */
  keys?: AxinomContentKey[];
}

export interface AxinomDrmPayload {
  token: string;
  manifestUrl: string;
  licenseServers: {
    widevine: string;
    playready: string;
    fairplay: string;
    fairplayCertUrl?: string;
  };
  expiresAt: string;
  expiresInSeconds: number;
}
