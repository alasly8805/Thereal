import { createHmac, timingSafeEqual } from "node:crypto";
import type { SessionUser } from "./auth";

export const PREVIEW_COOKIE_NAME = "codeup_preview_auth";
export const PREVIEW_COOKIE_MAX_AGE = 60 * 60 * 24; // 24 hours (shortened from 7 days)

/**
 * Resolves the preview password.
 *
 * In production, if PREVIEW_PASSWORD is unset, we refuse to fall back to a
 * hardcoded default to prevent unauthorized access.
 */
export function getPreviewPassword(): string | null {
  const envSecret = process.env.PREVIEW_PASSWORD;
  if (envSecret && envSecret.trim().length > 0) {
    return envSecret.trim();
  }

  if (process.env.NODE_ENV === "production") {
    return null;
  }

  return "codeup2030";
}

function getPreviewHmacSecret(): string {
  return process.env.JWT_SECRET || "codeup-preview-hmac-secret-fallback";
}

/**
 * Computes a keyed HMAC token for preview authentication.
 * The cookie carries this HMAC digest rather than the plaintext PREVIEW_PASSWORD.
 */
export function generatePreviewCookieToken(): string | null {
  const expectedPassword = getPreviewPassword();
  if (!expectedPassword) return null;
  return createHmac("sha256", getPreviewHmacSecret())
    .update(`codeup_preview_auth_v1:${expectedPassword}`)
    .digest("hex");
}

/**
 * Constant-time comparison for preview password verification (e.g. from POST body).
 */
export function verifyPreviewPassword(inputPassword?: string | null): boolean {
  if (!inputPassword || typeof inputPassword !== "string") {
    return false;
  }

  const expected = getPreviewPassword();
  if (!expected) {
    return false;
  }

  try {
    const actualBuf = Buffer.from(inputPassword.trim(), "utf8");
    const expectedBuf = Buffer.from(expected, "utf8");
    if (actualBuf.length !== expectedBuf.length) {
      return false;
    }
    return timingSafeEqual(actualBuf, expectedBuf);
  } catch {
    return false;
  }
}

/**
 * Validates the preview cookie token against the expected HMAC signature.
 * Also supports backward-compatible check during migration if raw password was stored.
 */
export function verifyPreviewCookie(cookieValue?: string | null): boolean {
  if (!cookieValue || typeof cookieValue !== "string") {
    return false;
  }

  const expectedToken = generatePreviewCookieToken();
  if (!expectedToken) {
    return false;
  }

  try {
    const actualBuf = Buffer.from(cookieValue.trim(), "utf8");
    const expectedBuf = Buffer.from(expectedToken, "utf8");
    if (actualBuf.length === expectedBuf.length && timingSafeEqual(actualBuf, expectedBuf)) {
      return true;
    }
  } catch {
    // fall through
  }

  // Fallback: verify if legacy plaintext password was in cookie
  return verifyPreviewPassword(cookieValue);
}

/**
 * Validates whether a caller is authorized for preview operations:
 * - Logged-in staff (superadmin, admin, teacher)
 * - OR possesses a valid preview cookie verified against generatePreviewCookieToken()
 */
export function isAuthorizedPreview(
  session: SessionUser | { role?: string; id?: string; name?: string } | null,
  cookieValue?: string | null
): boolean {
  if (session && ["superadmin", "admin", "teacher", "assistant"].includes(session.role || "")) {
    return true;
  }

  return verifyPreviewCookie(cookieValue);
}

/**
 * Validates that a user has a full, authenticated staff session (teacher, admin, superadmin).
 * Preview cookies alone are explicitly forbidden from performing provider uploads or imports.
 */
export function isAuthorizedStaffUpload(
  session: SessionUser | { role?: string; id?: string; name?: string } | null
): boolean {
  return !!(session && ["superadmin", "admin", "teacher", "assistant"].includes(session.role || ""));
}

