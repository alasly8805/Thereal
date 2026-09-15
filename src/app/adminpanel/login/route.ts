import { NextRequest, NextResponse } from "next/server";
import { applyAuthCookie } from "@/lib/auth";
import { adminPanelDestination, performAdminLogin, publicAppOrigin } from "@/lib/admin-login";

/**
 * Native form POST for لوحة الإدارة.
 * Runs login in-process (no loopback HTTP) so a single PM2 worker cannot deadlock.
 */
export async function POST(req: NextRequest) {
  const form = await req.formData();
  const role = String(form.get("role") || "");
  const password = String(form.get("password") || "");
  const name = String(form.get("name") || "");
  const email = String(form.get("email") || "");

  const origin = publicAppOrigin(req.url);
  const loginUrl = new URL("/adminpanel", origin);
  if (role) loginUrl.searchParams.set("role", role);

  const clientIp =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "127.0.0.1";

  try {
    const result = await performAdminLogin({ role, password, name, email, clientIp });

    if (!result.ok) {
      loginUrl.searchParams.set("error", result.error);
      return NextResponse.redirect(loginUrl, 303);
    }

    const redirect = NextResponse.redirect(new URL(adminPanelDestination(result.user.role), origin), 303);
    await applyAuthCookie(redirect, result.token);
    return redirect;
  } catch (err) {
    console.error("Admin panel form login error:", err);
    loginUrl.searchParams.set("error", "حدث خطأ في الخادم");
    return NextResponse.redirect(loginUrl, 303);
  }
}
