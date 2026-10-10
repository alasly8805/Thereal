import { jwtVerify } from "jose";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { isVpnOrProxy } from "./lib/vpn-guard";

/** Admin-panel sub-pages — require a valid session; redirect to /adminpanel on failure */
const ADMIN_PANEL_PREFIXES = [
  "/adminpanel/superadmin",
  "/adminpanel/teacher",
  "/adminpanel/assistant",
  "/teacher",
];

/** Student/user page routes — require a valid session; redirect to /login on failure */
const PROTECTED_PAGE_PREFIXES = [
  "/dashboard",
  "/library",
  "/quizzes",
  "/codes",
  "/complete-profile",
  "/account",
  "/practice",
];

/** Protected API routes — require a valid session; return 401 JSON on failure.
 *  These groups contain no public endpoints, so gating them here is a
 *  defence-in-depth backstop: a handler that forgets its own getSession() check
 *  still returns 401 instead of running unauthenticated. */
const PROTECTED_API_PREFIXES = [
  "/api/library",
  "/api/quizzes",
  "/api/progress",
  "/api/auth/complete-profile",
  "/api/teacher",
  "/api/student",
  "/api/homework",
  "/api/notifications",
  "/api/practice",
];

/** Paths under /courses that require auth (the learning room) */
function isProtectedCourseRoute(pathname: string) {
  return /^\/courses\/[^/]+\/learn(\/.*)?$/.test(pathname) || /^\/courses\/[^/]+\/watch(\/.*)?$/.test(pathname);
}

function isProtectedPlanRoute(pathname: string) {
  return /^\/plans\/[^/]+\/learn(\/.*)?$/.test(pathname);
}

/** Public API routes under /api/courses that need no session */
function isPublicCoursesApi(pathname: string) {
  return pathname === "/api/courses" || /^\/api\/courses(\/[^/]+\/preview)?$/.test(pathname);
}

function isPublicPlansApi(pathname: string) {
  return pathname === "/api/plans" || /^\/api\/plans\/[^/]+$/.test(pathname);
}

function startsWithAny(pathname: string, prefixes: string[]) {
  return prefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

/** /adminpanel login page itself — exact match only, never prefix */
function isAdminLoginPage(pathname: string) {
  return pathname === "/adminpanel" || pathname === "/adminpanel/";
}

function isVpnExemptRoute(pathname: string) {
  return (
    pathname === "/vpn-check" ||
    pathname.startsWith("/vpn-check/") ||
    pathname === "/waiting-room" ||
    pathname.startsWith("/waiting-room/") ||
    pathname === "/api/security/vpn-check" ||
    pathname.startsWith("/api/security/vpn-check/") ||
    isAdminLoginPage(pathname) ||
    startsWithAny(pathname, ADMIN_PANEL_PREFIXES) ||
    pathname.startsWith("/api/admin/") ||
    // Support panel: agents are staff and may legitimately be behind a VPN.
    pathname === "/thefake/support" ||
    pathname.startsWith("/thefake/support/") ||
    pathname.startsWith("/api/support/") ||
    pathname.startsWith("/api/thefake/support/")
  );
}

// Read JWT_SECRET dynamically inside hasValidSession to handle hot-reloads and Edge runtime environment injection correctly.
async function readSession(req: NextRequest): Promise<{ supportView: boolean; demoTour: boolean; accountMode?: string } | null> {
  const secretStr = process.env.JWT_SECRET;
  if (!secretStr) {
    console.warn("JWT_SECRET environment variable is missing in middleware context!");
    return null;
  }
  const token = req.cookies.get("auth_token")?.value;
  if (!token) {
    return null;
  }
  try {
    const secret = new TextEncoder().encode(secretStr);
    const { payload } = await jwtVerify(token, secret);
    return {
      supportView: payload.supportView === true,
      demoTour: payload.demoTour === true,
      accountMode: typeof payload.accountMode === "string" ? payload.accountMode : undefined,
    };
  } catch {
    return null;
  }
}

async function hasValidSession(req: NextRequest) {
  return (await readSession(req)) !== null;
}

/**
 * The single chokepoint that makes a support agent's visit to a student account
 * read-only.
 *
 * Enforcing this here rather than inside each handler means a route added next
 * month is covered by default — the failure mode of the alternative is a new
 * endpoint that silently lets support write to a student's record.
 *
 * The one carve-out is starting video playback: that POST is what opens a
 * lesson, and the watch route already creates the session with
 * usedWatchSlot=false for a support view, so it costs the student nothing.
 */
function isSupportViewAllowedWrite(pathname: string) {
  return /^\/api\/videos\/[^/]+\/watch$/.test(pathname);
}

function isSupportViewReadOnlyViolation(req: NextRequest, pathname: string) {
  const method = req.method.toUpperCase();
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") return false;
  // Leaving the student account is a POST and must always be permitted.
  if (pathname === "/thefake/support/exit-student") return false;
  if (isSupportViewAllowedWrite(pathname)) return false;
  return true;
}

export default async function proxy(req: NextRequest) {
  const pathname = req.nextUrl.pathname;

  const host = req.headers.get("host") || "";
  const isCenterMode =
    host.startsWith("center.") ||
    host.includes("center.code-up.tech") ||
    req.nextUrl.searchParams.get("center") === "1" ||
    req.cookies.get("center_mode")?.value === "1";

  // Forward the current path to server components (root layout reads this to
  // decide maintenance gating — middleware runs on Edge and can't touch the DB).
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-pathname", pathname);
  if (isCenterMode) {
    requestHeaders.set("x-center-mode", "1");
  }

  const pass = () => {
    const res = NextResponse.next({ request: { headers: requestHeaders } });
    if (isCenterMode && req.cookies.get("center_mode")?.value !== "1") {
      res.cookies.set("center_mode", "1", { path: "/" });
    } else if (!isCenterMode && req.cookies.get("center_mode")?.value === "1" && !host.startsWith("center.")) {
      res.cookies.delete("center_mode");
    }
    return res;
  };

  // Root of the center subdomain serves the Center Student Hub instead of the
  // public marketing home. Rewritten (not redirected) so the URL stays
  // `https://center.code-up.tech/`.
  if (pathname === "/") {
    if (isCenterMode) {
      const centerUrl = req.nextUrl.clone();
      centerUrl.pathname = "/center";
      const res = NextResponse.rewrite(centerUrl, { request: { headers: requestHeaders } });
      if (req.cookies.get("center_mode")?.value !== "1") {
        res.cookies.set("center_mode", "1", { path: "/" });
      }
      return res;
    }
    return pass();
  }

  // Admin panel login page — always public
  if (isAdminLoginPage(pathname) || pathname === "/adminpanel/login") return pass();

  // Superadmin → teacher panel (form POST, not /api, so Cloudflare does not challenge it)
  if (pathname === "/adminpanel/enter-teacher") {
    if (!(await hasValidSession(req))) {
      return NextResponse.redirect(new URL("/adminpanel", req.url));
    }
    return pass();
  }

  // VPN Check Waiting Room & Verification API are always exempt
  if (isVpnExemptRoute(pathname)) {
    if (
      pathname.startsWith("/api/admin/") &&
      !["GET", "HEAD", "OPTIONS"].includes(req.method.toUpperCase())
    ) {
      const tour = await readSession(req);
      if (tour?.demoTour) {
        return NextResponse.json({ ok: true, success: true }, { status: 200 });
      }
    }
    return pass();
  }

  // Always allow public access to login and signup
  if (pathname.startsWith("/login") || pathname.startsWith("/signup")) {
    return pass();
  }

  // VPN & Proxy Detection Protocol for student surfaces
  const isProtectedStudentPage =
    isProtectedCourseRoute(pathname) ||
    isProtectedPlanRoute(pathname) ||
    startsWithAny(pathname, PROTECTED_PAGE_PREFIXES);

  const isProtectedStudentApi =
    startsWithAny(pathname, PROTECTED_API_PREFIXES) ||
    pathname.startsWith("/api/videos/") ||
    (pathname.startsWith("/api/courses") && !isPublicCoursesApi(pathname)) ||
    (pathname.startsWith("/api/plans") && !isPublicPlansApi(pathname));

  const vpnCheck = isVpnOrProxy(req.headers);
  if (vpnCheck.isVpn) {
    if (isProtectedStudentPage) {
      const vpnUrl = new URL("/vpn-check", req.url);
      const targetUrl = `${pathname}${req.nextUrl.search || ""}`;
      vpnUrl.searchParams.set("redirect_url", targetUrl);
      return NextResponse.redirect(vpnUrl);
    }

    if (isProtectedStudentApi) {
      return NextResponse.json(
        {
          error: "تم رصد استخدام تطبيق VPN أو بروكسي. يرجى إيقاف الـ VPN والمتابعة عبر غرفة الانتظار.",
          code: "VPN_DETECTED",
          vpnDetected: true,
        },
        { status: 403 }
      );
    }
  }

  const sessionInfo = await readSession(req);
  const authed = sessionInfo !== null;

  // Center-ID hall accounts are bound to center.code-up.tech. A cookie on the
  // online host would otherwise leak their custom curriculum onto code-up.tech.
  if (sessionInfo?.accountMode === "CENTER_ID" && !isCenterMode) {
    const allowOnOnline =
      pathname === "/api/auth/me" ||
      pathname.startsWith("/api/auth/logout") ||
      pathname === "/login" ||
      pathname.startsWith("/login/");
    if (!allowOnOnline) {
      if (pathname.startsWith("/api/")) {
        return NextResponse.json(
          {
            error: "حساب الرقم التعريفي يعمل فقط على منصة السنتر (center.code-up.tech).",
            code: "CENTER_ID_HOST_ONLY",
          },
          { status: 403 }
        );
      }
      const host = req.headers.get("host") || "";
      if (host.startsWith("localhost") || host.startsWith("127.")) {
        const local = req.nextUrl.clone();
        local.pathname = "/center";
        local.searchParams.set("center", "1");
        return NextResponse.redirect(local);
      }
      return NextResponse.redirect("https://center.code-up.tech/center");
    }
  }

  // Read-only enforcement for "support is looking at this account". Runs before
  // every other check so no downstream branch can let a write slip through.
  if (sessionInfo?.supportView && isSupportViewReadOnlyViolation(req, pathname)) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        {
          error: "جلسة دعم فني للاطّلاع فقط — لا يمكن تنفيذ أي تعديل على حساب الطالب.",
          code: "SUPPORT_VIEW_READONLY",
        },
        { status: 403 }
      );
    }
    return NextResponse.redirect(new URL("/thefake/support?notice=readonly", req.url));
  }

  // Showroom superadmin: the UI is live, writes to admin APIs stay on demo rows
  // by no-op so a client cannot delete real students or move money.
  if (
    sessionInfo?.demoTour &&
    pathname.startsWith("/api/admin/") &&
    !["GET", "HEAD", "OPTIONS"].includes(req.method.toUpperCase())
  ) {
    return NextResponse.json({ ok: true, success: true }, { status: 200 });
  }

  // Admin sub-pages: redirect to /adminpanel login if no session
  if (startsWithAny(pathname, ADMIN_PANEL_PREFIXES) && !authed) {
    return NextResponse.redirect(new URL("/adminpanel", req.url));
  }

  // Learning room inside courses — auth required
  if (isProtectedCourseRoute(pathname) && !authed) {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("redirect_url", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Learning room inside plans — auth required
  if (isProtectedPlanRoute(pathname) && !authed) {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("redirect_url", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Protect /api/courses/* except public preview endpoint
  if (pathname.startsWith("/api/courses") && !isPublicCoursesApi(pathname) && !authed) {
    return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
  }

  // Protect /api/plans/* except public endpoints
  if (pathname.startsWith("/api/plans") && !isPublicPlansApi(pathname) && !authed) {
    return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
  }

  // Protect other API endpoints (return 401 JSON, NEVER redirect to /login HTML)
  if (startsWithAny(pathname, PROTECTED_API_PREFIXES) && !authed) {
    return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
  }

  // Protected page routes: redirect to /login if no session
  if (startsWithAny(pathname, PROTECTED_PAGE_PREFIXES) && !authed) {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("redirect_url", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return pass();
}

export const config = {
  matcher: [
    // Next.js ORs matcher entries, so the upload skip has to live in THIS
    // pattern. The second entry used to "exclude" /api/homework/*/upload, but
    // the catch-all above still matched it — proxy then buffered the multipart
    // body, Android Chrome got HTTP 400 with an empty body, and the student
    // toast was just "فشل رفع الملف". Auth for the upload route is enforced
    // inside the handler.
    "/((?!_next|api/homework/[^/]+/upload|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest|txt|xml)).*)",
  ],
};
