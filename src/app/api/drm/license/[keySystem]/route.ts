import { NextRequest, NextResponse } from "next/server";
import {
  resolveLicenseUpstream,
  type LicenseKeySystem,
} from "@/lib/drm-license-proxy";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_BODY_BYTES = 64 * 1024;
const KEY_SYSTEMS = new Set<LicenseKeySystem>(["widevine", "playready", "fairplay"]);

/**
 * Same-origin Widevine / PlayReady / FairPlay license proxy.
 *
 * The CDM still decrypts inside the browser. This route only forwards the
 * opaque challenge + entitlement JWT to Axinom so privacy browsers (Brave
 * Shields) cannot block the third-party license host.
 */
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, X-AxDRM-Message",
      "Access-Control-Max-Age": "86400",
    },
  });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ keySystem: string }> }
) {
  const { keySystem: raw } = await params;
  const keySystem = (raw || "").toLowerCase() as LicenseKeySystem;
  if (!KEY_SYSTEMS.has(keySystem)) {
    return NextResponse.json({ error: "نظام ترخيص غير مدعوم" }, { status: 400 });
  }

  const token = (req.headers.get("x-axdrm-message") || "").trim();
  if (!token || token.split(".").length !== 3) {
    return NextResponse.json({ error: "توكن الترخيص مفقود" }, { status: 401 });
  }

  const declaredLength = Number(req.headers.get("content-length") || "0");
  if (declaredLength > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "طلب الترخيص كبير جداً" }, { status: 413 });
  }

  const challenge = Buffer.from(await req.arrayBuffer());
  if (challenge.byteLength === 0 || challenge.byteLength > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "طلب الترخيص غير صالح" }, { status: 400 });
  }

  const upstream = await resolveLicenseUpstream(keySystem, token);
  if (!upstream) {
    return NextResponse.json({ error: "تعذر تحديد خادم الترخيص" }, { status: 502 });
  }

  const contentType = req.headers.get("content-type") || "application/octet-stream";

  let axinomRes: Response;
  try {
    axinomRes = await fetch(upstream, {
      method: "POST",
      headers: {
        "Content-Type": contentType,
        "X-AxDRM-Message": token,
      },
      body: challenge,
    });
  } catch (err) {
    console.error("[drm-license-proxy] upstream fetch failed:", err);
    return NextResponse.json({ error: "تعذر الاتصال بخادم الترخيص" }, { status: 502 });
  }

  const licenseBody = await axinomRes.arrayBuffer();
  const responseType = axinomRes.headers.get("content-type") || "application/octet-stream";

  return new NextResponse(licenseBody, {
    status: axinomRes.status,
    headers: {
      "Content-Type": responseType,
      "Cache-Control": "no-store",
    },
  });
}
