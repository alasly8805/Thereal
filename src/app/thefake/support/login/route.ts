import { NextRequest, NextResponse } from "next/server";
import { publicAppOrigin } from "@/lib/admin-login";
import {
  SUPPORT_PANEL_PATH,
  applySupportCookie,
  clearSupportLoginFailures,
  clientIpOf,
  isSupportLoginThrottled,
  logSupportAction,
  recordSupportLoginFailure,
  signSupportToken,
  verifySupportPassword,
} from "@/lib/support-auth";

/**
 * Native form POST, matching /adminpanel/login. A plain form submit rather than
 * an XHR so Cloudflare does not throw a challenge at the login request.
 */
export async function POST(req: NextRequest) {
  const origin = publicAppOrigin(req.url);
  const back = (error: string) => {
    const url = new URL(SUPPORT_PANEL_PATH, origin);
    url.searchParams.set("error", error);
    return NextResponse.redirect(url, 303);
  };

  const clientIp = clientIpOf(req);

  try {
    const form = await req.formData();
    const password = String(form.get("password") || "");

    if (await isSupportLoginThrottled(clientIp)) {
      return back("تم تجاوز عدد المحاولات المسموح بها. حاول مرة أخرى غداً.");
    }

    if (!verifySupportPassword(password)) {
      await recordSupportLoginFailure(clientIp);
      await logSupportAction({
        action: "SUPPORT_LOGIN_FAILED",
        targetType: "support_panel",
        targetId: clientIp,
        targetName: "محاولة دخول فاشلة",
        metadata: { ip: clientIp },
      });
      return back("كلمة المرور غير صحيحة");
    }

    await clearSupportLoginFailures(clientIp);

    const token = await signSupportToken("support");
    const redirect = NextResponse.redirect(new URL(SUPPORT_PANEL_PATH, origin), 303);
    await applySupportCookie(redirect, token);

    await logSupportAction({
      action: "SUPPORT_LOGIN",
      targetType: "support_panel",
      targetId: clientIp,
      targetName: "دخول ناجح للوحة الدعم",
      metadata: { ip: clientIp },
    });

    return redirect;
  } catch (err) {
    console.error("Support panel login error:", err);
    return back("حدث خطأ في الخادم");
  }
}
