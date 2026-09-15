import { NextRequest, NextResponse } from "next/server";
import { publicAppOrigin } from "@/lib/admin-login";
import { SUPPORT_PANEL_PATH, getSupportSession } from "@/lib/support-auth";
import {
  impersonateStudentForSupport,
  supportImpersonateRedirect,
} from "@/lib/support-impersonate";

/**
 * Native form POST (not an XHR) so the browser follows the redirect and the
 * student session cookie is applied to the top-level navigation.
 */
export async function POST(req: NextRequest) {
  const origin = publicAppOrigin(req.url);
  const back = (error: string) => {
    const url = new URL(SUPPORT_PANEL_PATH, origin);
    url.searchParams.set("error", error);
    return NextResponse.redirect(url, 303);
  };

  const support = await getSupportSession();
  if (!support) return back("انتهت جلسة الدعم — سجّل الدخول مرة أخرى");

  try {
    const form = await req.formData();
    const studentId = String(form.get("studentId") || "").trim();
    if (!studentId) return back("معرّف الطالب مطلوب");

    const result = await impersonateStudentForSupport(support.agent, studentId);
    if (!result.ok) return back(result.error);

    // The support cookie is a separate cookie and survives this, so "العودة
    // للوحة الدعم" works without logging in again.
    return supportImpersonateRedirect(req.url, result.token, "/");
  } catch (err) {
    console.error("Support enter-student error:", err);
    return back("تعذر الدخول إلى حساب الطالب");
  }
}
