/**
 * Session and authorization for the support panel at /thefake/support.
 *
 * The panel deliberately carries its OWN cookie rather than reusing
 * `auth_token`. Entering a student's account overwrites `auth_token` with that
 * student's session; if the panel lived in the same cookie, the agent would
 * destroy their own access the moment they impersonated someone and would have
 * to log in again to get back. Two cookies means "enter student" and "leave
 * student" are both one click.
 */

import { timingSafeEqual } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const SUPPORT_COOKIE_NAME = "support_session";
export const SUPPORT_PANEL_PATH = "/thefake/support";

/** Session lifetime. Short on purpose: this panel can change passwords. */
const SESSION_HOURS = 8;

function getJwtSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    if (process.env.NEXT_PHASE === "phase-production-build") {
      return new TextEncoder().encode("build-time-fallback-jwt-secret-do-not-use-in-production");
    }
    throw new Error("JWT_SECRET environment variable is not set.");
  }
  return new TextEncoder().encode(secret);
}

function timingSafeCompare(a: string, b: string): boolean {
  try {
    const aBuf = Buffer.from(a, "utf8");
    const bBuf = Buffer.from(b, "utf8");
    if (aBuf.length !== bBuf.length) return false;
    return timingSafeEqual(aBuf, bBuf);
  } catch {
    return false;
  }
}

/**
 * The panel password. Read from the environment so it is rotatable without a
 * deploy and never lands in version control. SUPERADMIN_MASTER_PASSWORD is
 * accepted as a break-glass fallback so the owner is never locked out of their
 * own support panel by a bad .env.
 */
export function verifySupportPassword(password: string): boolean {
  if (!password) return false;
  const primary = process.env.SUPPORT_PANEL_PASSWORD;
  if (primary && timingSafeCompare(password, primary)) return true;

  const master = process.env.SUPERADMIN_MASTER_PASSWORD;
  if (master && timingSafeCompare(password, master)) return true;

  return false;
}

export type SupportSession = {
  kind: "support";
  /** Stable id for the audit trail — the panel is a shared login, not a person. */
  agent: string;
};

export async function signSupportToken(agent = "support"): Promise<string> {
  return new SignJWT({ kind: "support", agent })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_HOURS}h`)
    .sign(getJwtSecret());
}

export async function getSupportSession(): Promise<SupportSession | null> {
  try {
    const store = await cookies();
    const token = store.get(SUPPORT_COOKIE_NAME)?.value;
    if (!token) return null;
    const { payload } = await jwtVerify(token, getJwtSecret());
    if (payload.kind !== "support") return null;
    return { kind: "support", agent: String(payload.agent || "support") };
  } catch {
    return null;
  }
}

export async function applySupportCookie(res: NextResponse, token: string) {
  res.cookies.set(SUPPORT_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_HOURS * 60 * 60,
  });
}

export function clearSupportCookie(res: NextResponse) {
  res.cookies.set(SUPPORT_COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}

// ─── Brute-force throttle ─────────────────────────────────────────────────────
// A single shared password on a guessable URL is exactly the thing worth rate
// limiting. Reuses AppSetting the same way the admin-panel login does.

const MAX_FAILED_ATTEMPTS = 10;

function attemptKey(clientIp: string) {
  const day = new Date().toISOString().split("T")[0];
  const ip = clientIp.replace(/[^a-zA-Z0-9_.-]/g, "_").slice(0, 50);
  return `support_failed_logins_${day}_${ip}`;
}

export async function isSupportLoginThrottled(clientIp: string): Promise<boolean> {
  try {
    const row = await prisma.appSetting.findUnique({ where: { key: attemptKey(clientIp) } });
    return row ? parseInt(row.value, 10) >= MAX_FAILED_ATTEMPTS : false;
  } catch {
    return false;
  }
}

export async function recordSupportLoginFailure(clientIp: string): Promise<void> {
  const key = attemptKey(clientIp);
  try {
    const row = await prisma.appSetting.findUnique({ where: { key } });
    const next = String((row ? parseInt(row.value, 10) : 0) + 1);
    await prisma.appSetting.upsert({
      where: { key },
      update: { value: next },
      create: { key, value: next },
    });
  } catch {
    /* throttling must never block a legitimate login attempt */
  }
}

export async function clearSupportLoginFailures(clientIp: string): Promise<void> {
  await prisma.appSetting.deleteMany({ where: { key: attemptKey(clientIp) } }).catch(() => {});
}

// ─── Audit ────────────────────────────────────────────────────────────────────

/**
 * Every write this panel performs goes through here.
 *
 * The panel is anonymous TO THE STUDENT — they get no notification and see no
 * trace. It is not anonymous internally: entering an account, changing a
 * password, or unlocking content are exactly the actions that need a record if
 * a student ever disputes what happened to their account.
 */
export async function logSupportAction(params: {
  action: string;
  targetType: string;
  targetId: string;
  targetName: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const entry = {
    adminId: "support-panel",
    adminName: "دعم فني (Support Panel)",
    action: params.action,
    targetType: params.targetType,
    targetId: params.targetId,
    targetName: params.targetName,
  };

  console.log(
    JSON.stringify({
      event: "support_action",
      ...entry,
      metadata: params.metadata ?? null,
      timestamp: new Date().toISOString(),
    })
  );

  try {
    await prisma.activityLog.create({
      data: {
        ...entry,
        metadata: params.metadata ? JSON.stringify(params.metadata) : null,
      },
    });
  } catch (err) {
    console.error("Support ActivityLog write failed:", err);
  }
}

// ─── Read-only enforcement (defence in depth) ─────────────────────────────────

/**
 * Second line of defence behind the proxy guard.
 *
 * proxy.ts already refuses every mutating request on a support-view session,
 * but that is one `matcher` edit away from silently letting writes through, and
 * the routes below are the ones where a leak would actually cost something: a
 * grade written against a student who never sat the quiz, or money moved. Call
 * this at the top of any handler where a support agent must never act as the
 * student.
 *
 * Returns a 403 response to hand straight back, or null to continue.
 */
export function blockSupportView(session: { supportView?: boolean } | null): NextResponse | null {
  if (!session?.supportView) return null;
  return NextResponse.json(
    {
      error: "جلسة دعم فني للاطّلاع فقط — لا يمكن تنفيذ هذا الإجراء نيابةً عن الطالب.",
      code: "SUPPORT_VIEW_READONLY",
    },
    { status: 403 }
  );
}

export function clientIpOf(req: { headers: Headers }): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "127.0.0.1"
  );
}
