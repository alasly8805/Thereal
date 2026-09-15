import { NextRequest, NextResponse } from "next/server";
import { publicAppOrigin } from "@/lib/admin-login";
import { SUPPORT_PANEL_PATH, clearSupportCookie } from "@/lib/support-auth";

export async function POST(req: NextRequest) {
  const redirect = NextResponse.redirect(new URL(SUPPORT_PANEL_PATH, publicAppOrigin(req.url)), 303);
  clearSupportCookie(redirect);
  return redirect;
}
