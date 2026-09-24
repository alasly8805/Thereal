/**
 * Sponsor Meta Pixel — measurement only.
 * Never send emails, phones, student IDs, or purchase values into fbq.
 */
export const META_PIXEL_ID = "1087852583838868";

export const MARKETING_CONSENT_KEY = "codeup_marketing_consent";

/** Set true to show the public ads-cookie bar again. Hidden at the owner's request. */
export const SHOW_COOKIE_CONSENT_BANNER = false;

export type MarketingConsent = "granted" | "denied";

const DENY_PREFIXES = [
  "/adminpanel",
  "/admin",
  "/api",
  "/account",
  "/library",
  "/parent",
  "/thefake",
  "/preview",
  "/vpn-check",
  "/waiting-room",
  "/maintenance",
];

/** Public marketing pages. Skip admin, parent portal, and in-lesson surfaces. */
export function isMetaPixelAllowedPath(pathname: string): boolean {
  const path = (pathname.split("?")[0] || "/").replace(/\/+$/, "") || "/";

  if (DENY_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`))) return false;
  // Student product surfaces — do not measure while they watch / sit an exam.
  if (/\/(learn|watch|progress)(\/|$)/.test(path)) return false;
  if (path.startsWith("/quizzes/")) return false;
  if (/^\/homeworks\/[^/]+$/.test(path)) return false;
  return true;
}

export function readMarketingConsent(): MarketingConsent | null {
  if (typeof window === "undefined") return null;
  try {
    const value = window.localStorage.getItem(MARKETING_CONSENT_KEY);
    if (value === "granted" || value === "denied") return value;
  } catch {
    // Private mode / blocked storage — treat as no consent.
  }
  return null;
}

export function writeMarketingConsent(value: MarketingConsent): void {
  try {
    window.localStorage.setItem(MARKETING_CONSENT_KEY, value);
  } catch {
    // Ignore quota / privacy-mode failures.
  }
}
