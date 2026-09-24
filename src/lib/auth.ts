import { createHmac, timingSafeEqual } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import type { NextResponse } from "next/server";
import { isPhoneVerificationBypassed } from "@/lib/aws-sms";
import { prisma } from "./prisma";
import { getCachedUserSession } from "./cache";
import { normalizeEgyptPhone } from "@/lib/phone";
import { getConfigNumberClamped } from "./config";
import type { AssistantPermissions } from "./teacher-scope";
import { parseAssistantPermissions } from "./teacher-scope";

function getJwtSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    // Only allow static compilation during next build to use dummy secret
    if (process.env.NEXT_PHASE === "phase-production-build") {
      return new TextEncoder().encode("build-time-fallback-jwt-secret-do-not-use-in-production");
    }
    throw new Error("JWT_SECRET environment variable is not set. Please configure it in your .env file.");
  }
  return new TextEncoder().encode(secret);
}

const AUTH_COOKIE_NAME = "auth_token";
const PHONE_VERIFY_COOKIE_NAME = "student_phone_verify";

export interface JWTPayload {
  id: string;
  email: string;
  name: string;
  role: string;
  accountMode?: string;
  /** True for the owner superadmin (Ahmed) and the break-glass master login. */
  isOwner?: boolean;
  deviceId?: string;
  tokenVersion?: number;
  /**
   * Set only on a token minted by the support panel when an agent enters a
   * student's account. Marks the session read-only: proxy.ts refuses every
   * mutating request carrying it, and playback does not spend a watch slot.
   */
  supportView?: boolean;
  /** Which panel minted the support-view token, for the audit trail. */
  supportViewBy?: string;
  /** Client showroom tour: demo accounts only, production students untouched. */
  demoTour?: boolean;
  jti?: string;
  iat?: number;
  exp?: number;
}

export interface SessionUser {
  id: string;
  clerkId?: string;
  email: string;
  name: string;
  role: string;
  accountMode?: string;
  isOwner?: boolean;
  /** True while a support agent is viewing this account. Read-only session. */
  supportView?: boolean;
  supportViewBy?: string;
  /** Showroom walkthrough — never treat this session as the platform owner. */
  demoTour?: boolean;
  profileCompleted: boolean;
  phone?: string | null;
  parentPhone?: string | null;
  age?: number | null;
  educationalStage?: string | null;
  createdAt?: Date;
  deviceId?: string;
  referralCode?: string | null;
  streakFreezes?: number;
  balance?: number;
  assistantOfTeacherId?: string | null;
  assistantPermissions?: AssistantPermissions | null;
}

type PhoneChallengePayload = {
  phone: string;
  /** Opaque id of the PhoneVerificationChallenge row holding the real hash. */
  cid?: string;
  method?: string;
  iat?: number;
  exp?: number;
};

/** Wrong codes accepted per challenge before it is burned. */
const MAX_PHONE_CHALLENGE_ATTEMPTS = 5;
/** How long a phone challenge stays valid. Matches the cookie maxAge. */
const PHONE_CHALLENGE_TTL_MS = 3 * 60 * 1000;

/**
 * Whether auth cookies should carry the Secure flag.
 *
 * Defaults to on in production so the session cookie is never sent over plain
 * HTTP. `SECURE_COOKIES=false` remains available as an explicit opt-out for
 * deployments that genuinely terminate on HTTP (previously the flag had to be
 * opted *in*, which silently left production cookies non-Secure).
 */
function isSecureCookieContext() {
  if (process.env.SECURE_COOKIES === "true") return true;
  if (process.env.SECURE_COOKIES === "false") return false;
  return process.env.NODE_ENV === "production";
}

export async function signToken(payload: Omit<JWTPayload, "iat" | "exp">) {
  const days = await getConfigNumberClamped("jwt_expiry_days", 1, 365); // was 7d; never 0/NaN
  const tokenPayload = {
    ...payload,
    jti: payload.jti ?? crypto.randomUUID(),
  };
  return new SignJWT(tokenPayload as Record<string, unknown>)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${days}d`)
    .sign(getJwtSecret());
}

export async function verifyToken(token: string): Promise<JWTPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getJwtSecret());
    return payload as unknown as JWTPayload;
  } catch {
    return null;
  }
}

function authCookieOptions(days: number) {
  return {
    httpOnly: true,
    secure: isSecureCookieContext(),
    sameSite: "lax" as const,
    maxAge: 60 * 60 * 24 * days,
    path: "/",
  };
}

export async function setAuthCookie(token: string) {
  const cookieStore = await cookies();
  const days = await getConfigNumberClamped("jwt_expiry_days", 1, 365); // matches the JWT expiry
  cookieStore.set(AUTH_COOKIE_NAME, token, authCookieOptions(days));
}

/** Attach the session cookie to a specific response (form POST 303 redirects). */
export async function applyAuthCookie(res: NextResponse, token: string) {
  const days = await getConfigNumberClamped("jwt_expiry_days", 1, 365);
  res.cookies.set(AUTH_COOKIE_NAME, token, authCookieOptions(days));
}

export async function clearAuthCookie() {
  const cookieStore = await cookies();
  cookieStore.delete(AUTH_COOKIE_NAME);
}

/**
 * Keyed hash of a verification code, bound to the phone it was issued for.
 *
 * Keyed (HMAC) rather than a bare digest so that even a database read does not
 * hand an attacker an offline-crackable value — a 6-digit code has only 9×10^5
 * candidates, which a plain SHA-256 exhausts in milliseconds.
 */
function hashVerificationCode(phone: string, code: string) {
  return createHmac("sha256", getJwtSecret()).update(`${phone}:${code}`).digest("hex");
}

function hashesEqual(a: string, b: string) {
  const aBuf = Buffer.from(a, "utf8");
  const bBuf = Buffer.from(b, "utf8");
  if (aBuf.length !== bBuf.length) return false;
  return timingSafeEqual(aBuf, bBuf);
}

/**
 * Issues a phone-verification challenge.
 *
 * The code hash is persisted server-side; the returned token — which becomes a
 * browser cookie — carries only the phone and an opaque challenge id. Handing
 * the hash to the client would let anyone who can request a code for a victim's
 * number recover that code offline and reset the victim's password.
 */
export async function createPhoneVerificationChallenge(phone: string, code?: string, method?: string) {
  const payload: Record<string, unknown> = { phone };
  if (method) payload.method = method;

  if (code) {
    const challenge = await prisma.phoneVerificationChallenge.create({
      data: {
        phone,
        codeHash: hashVerificationCode(phone, code),
        method: method ?? null,
        expiresAt: new Date(Date.now() + PHONE_CHALLENGE_TTL_MS),
      },
      select: { id: true },
    });
    payload.cid = challenge.id;
  }

  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("3m")
    .sign(getJwtSecret());
}

export async function setPhoneVerificationCookie(token: string) {
  const cookieStore = await cookies();
  const isSecure = isSecureCookieContext();
  cookieStore.set(PHONE_VERIFY_COOKIE_NAME, token, {
    httpOnly: true,
    secure: isSecure,
    sameSite: "strict",
    maxAge: 60 * 3,
    path: "/",
  });
}

export async function clearPhoneVerificationCookie() {
  const cookieStore = await cookies();
  cookieStore.delete(PHONE_VERIFY_COOKIE_NAME);
}

/**
 * Verifies a submitted code against the server-side challenge.
 *
 * A correct code consumes the challenge (single use); a wrong one burns an
 * attempt. After MAX_PHONE_CHALLENGE_ATTEMPTS the challenge is dead, so the
 * 6-digit code space cannot be walked online either.
 */
export async function verifyPhoneVerificationCookie(phone: string, code: string) {
  const cookieStore = await cookies();
  const token = cookieStore.get(PHONE_VERIFY_COOKIE_NAME)?.value;

  if (!token) {
    return false;
  }

  try {
    const { payload } = await jwtVerify(token, getJwtSecret());
    const challenge = payload as unknown as PhoneChallengePayload;
    if (!challenge?.phone) return false;
    const normalizedPhone = normalizeEgyptPhone(String(phone));
    if (challenge.phone !== normalizedPhone) return false;

    if (isPhoneVerificationBypassed()) {
      return true;
    }

    if (!challenge.cid) return false;

    const row = await prisma.phoneVerificationChallenge.findUnique({
      where: { id: challenge.cid },
    });

    if (!row) return false;
    if (row.phone !== normalizedPhone) return false;
    if (row.consumedAt) return false;
    if (row.expiresAt < new Date()) return false;
    if (row.attempts >= MAX_PHONE_CHALLENGE_ATTEMPTS) return false;

    const submittedHash = hashVerificationCode(normalizedPhone, String(code).trim());

    if (!hashesEqual(row.codeHash, submittedHash)) {
      await prisma.phoneVerificationChallenge
        .update({ where: { id: row.id }, data: { attempts: { increment: 1 } } })
        .catch(() => {});
      return false;
    }

    // Single-use: only the first concurrent caller may consume the challenge.
    const consumed = await prisma.phoneVerificationChallenge.updateMany({
      where: { id: row.id, consumedAt: null },
      data: { consumedAt: new Date() },
    });

    return consumed.count === 1;
  } catch {
    return false;
  }
}

async function getJwtSession(): Promise<SessionUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(AUTH_COOKIE_NAME)?.value;
  if (!token) {
    return null;
  }

  const payload = await verifyToken(token);
  if (!payload) {
    return null;
  }

  if (payload.role === "superadmin") {
    // Break-glass: env master-password login carries id "superadmin", no DB row.
    if (payload.id === "superadmin") {
      return {
        id: payload.id,
        email: payload.email,
        name: payload.name,
        role: payload.role,
        isOwner: payload.demoTour === true ? false : true,
        profileCompleted: true,
        deviceId: payload.deviceId,
        demoTour: payload.demoTour === true,
      };
    }
    // Named DB-backed superadmin — re-validate against the row so a
    // renamed/suspended/deleted account reflects immediately.
    const sa = await prisma.user.findFirst({
      where: { id: payload.id, role: "superadmin", isDeleted: false },
    });
    if (!sa || !sa.isActive) return null;
    return {
      id: sa.id,
      email: sa.email,
      name: sa.name,
      role: "superadmin",
      isOwner: payload.demoTour === true ? false : sa.isOwner,
      profileCompleted: true,
      deviceId: payload.deviceId,
      demoTour: payload.demoTour === true,
    };
  }

  const user = await getCachedUserSession(payload.id, async () => {
    return prisma.user.findUnique({
      where: { id: payload.id },
    });
  });

  if (!user || !user.isActive || user.isDeleted) {
    return null;
  }

  // Token revocation check: if token carries a tokenVersion and DB user has a
  // different tokenVersion (due to password reset or device wipe), reject the token.
  const userTokenVer = (user as { tokenVersion?: number })?.tokenVersion;
  if (payload.tokenVersion !== undefined && userTokenVer !== undefined && userTokenVer !== payload.tokenVersion) {
    return null;
  }

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    accountMode: user.accountMode || "NORMAL",
    // Carried from the token, not the DB row: the flag describes THIS session
    // (a support agent looking at the account), not the account itself.
    supportView: payload.supportView === true,
    supportViewBy: payload.supportViewBy,
    demoTour: payload.demoTour === true,
    profileCompleted: user.profileCompleted,
    phone: user.phone,
    parentPhone: user.parentPhone,
    age: user.age,
    educationalStage: user.educationalStage,
    createdAt: user.createdAt,
    deviceId: payload.deviceId,
    referralCode: user.referralCode,
    streakFreezes: user.streakFreezes,
    balance: user.balance ?? 0,
    assistantOfTeacherId: (user as { assistantOfTeacherId?: string | null }).assistantOfTeacherId ?? null,
    assistantPermissions:
      user.role === "assistant"
        ? parseAssistantPermissions(
            (user as { assistantPermissions?: string | null }).assistantPermissions,
            (user as { canViewStudents?: boolean }).canViewStudents
          )
        : null,
  };
}

type SessionOptions = {
  preferStudent?: boolean;
};

function isStudentRole(role: string) {
  return role === "student";
}

export async function getSession(options?: SessionOptions): Promise<SessionUser | null> {
  const session = await getJwtSession();

  if (!session) {
    return null;
  }

  if (options?.preferStudent && !isStudentRole(session.role)) {
    return null;
  }

  return session;
}

export async function getStudentSession(): Promise<SessionUser | null> {
  return getSession({ preferStudent: true });
}

export async function getSessionWithRetry(
  maxRetries = 3,
  delayMs = 100,
  options?: SessionOptions
): Promise<SessionUser | null> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const session = await getSession(options);
    if (session) {
      return session;
    }
    if (attempt < maxRetries - 1) {
      await new Promise((resolve) => setTimeout(resolve, delayMs * (attempt + 1)));
    }
  }
  return null;
}

export async function getStudentSessionWithRetry(maxRetries = 3, delayMs = 80): Promise<SessionUser | null> {
  return getSessionWithRetry(maxRetries, delayMs, { preferStudent: true });
}

export async function markProfileCompleted(userId: string) {
  return prisma.user.update({
    where: { id: userId },
    data: { profileCompleted: true },
  });
}

export async function updateUserProfile(
  userId: string,
  data: {
    name?: string;
    phone?: string;
    parentPhone?: string;
    age?: number;
    educationalStage?: string;
  }
) {
  return prisma.user.update({
    where: { id: userId },
    data,
  });
}
