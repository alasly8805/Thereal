import { NextRequest, NextResponse } from "next/server";
import { publicAppOrigin } from "@/lib/admin-login";
import { SUPPORT_PANEL_PATH, getSupportSession, logSupportAction } from "@/lib/support-auth";

/**
 * Leave the student's account and return to the panel.
 *
 * Only the student cookie is dropped — the support cookie is untouched, which
 * is the whole reason the panel keeps its own. Whitelisted in proxy.ts so the
 * read-only guard can never trap an agent inside an account.
 */
export async function POST(req: NextRequest) {
  const origin = publicAppOrigin(req.url);
  const support = await getSupportSession();

  const redirect = NextResponse.redirect(
    new URL(support ? SUPPORT_PANEL_PATH : "/login", origin),
    303
  );
  redirect.cookies.set("auth_token", "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });

  if (support) {
    await logSupportAction({
      action: "SUPPORT_EXIT_STUDENT_ACCOUNT",
      targetType: "support_panel",
      targetId: support.agent,
      targetName: "خروج من حساب الطالب",
    });
  }

  return redirect;
}
