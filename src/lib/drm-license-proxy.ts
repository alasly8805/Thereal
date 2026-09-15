import { prisma } from "./prisma";
import { AXINOM_CONFIG } from "./axinom-config";
import { resolveEndpointsForTenant } from "./axinom-pool";

export type LicenseKeySystem = "widevine" | "playready" | "fairplay";

/** Official Axinom public test-vector communication key. */
export const AXINOM_TEST_COM_KEY_ID = "b3364eb5-51f6-4ae3-8c98-33ced5e31c78";

const AXINOM_TEST_ENDPOINTS: Record<LicenseKeySystem, string> = {
  widevine: "https://drm-widevine-licensing.axtest.net/AcquireLicense",
  playready: "https://drm-playready-licensing.axtest.net/AcquireLicense",
  fairplay: "https://drm-fairplay-licensing.axtest.net/AcquireLicense",
};

const LICENSE_HOST_ALLOWLIST = [
  /^drm-(widevine|playready|fairplay)-licensing\.axtest\.net$/i,
  /^[a-z0-9-]+\.drm-(widevine|playready|fairplay)-licensing\.axprod\.net$/i,
];

export function isAllowedLicenseUpstream(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return false;
    if (!parsed.pathname.endsWith("/AcquireLicense")) return false;
    return LICENSE_HOST_ALLOWLIST.some((re) => re.test(parsed.hostname));
  } catch {
    return false;
  }
}

export function decodeComKeyIdFromToken(token: string): string | null {
  try {
    const parts = token.split(".");
    if (parts.length < 2) return null;
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
    const id = payload?.com_key_id;
    return typeof id === "string" && id.length > 0 ? id : null;
  } catch {
    return null;
  }
}

/**
 * Pick the Axinom license URL for this token. The browser never sees this
 * host — the CDM challenge is forwarded server-side.
 */
export async function resolveLicenseUpstream(
  keySystem: LicenseKeySystem,
  token: string
): Promise<string | null> {
  const comKeyId = decodeComKeyIdFromToken(token)?.toLowerCase() || null;

  if (comKeyId === AXINOM_TEST_COM_KEY_ID) {
    return AXINOM_TEST_ENDPOINTS[keySystem];
  }

  if (comKeyId) {
    const account = await prisma.axinomAccount.findFirst({
      where: { communicationKeyId: comKeyId },
      select: {
        tenantId: true,
        widevineLicenseUrl: true,
        playreadyLicenseUrl: true,
        fairplayLicenseUrl: true,
        fairplayCertUrl: true,
      },
    });
    if (account) {
      const endpoints = resolveEndpointsForTenant(account.tenantId, {
        widevine: account.widevineLicenseUrl,
        playready: account.playreadyLicenseUrl,
        fairplay: account.fairplayLicenseUrl,
        fairplayCert: account.fairplayCertUrl,
      });
      const url =
        keySystem === "widevine"
          ? endpoints.widevine
          : keySystem === "playready"
            ? endpoints.playready
            : endpoints.fairplay;
      if (isAllowedLicenseUpstream(url)) return url;
    }
  }

  const fallback =
    keySystem === "widevine"
      ? AXINOM_CONFIG.endpoints.widevine
      : keySystem === "playready"
        ? AXINOM_CONFIG.endpoints.playready
        : AXINOM_CONFIG.endpoints.fairplay;

  return isAllowedLicenseUpstream(fallback) ? fallback : null;
}
