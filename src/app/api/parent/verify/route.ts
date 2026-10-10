import { NextRequest, NextResponse } from "next/server";
import { confirmParentToken, rejectParentToken } from "@/lib/whatsapp/parentToken";
import { parentVerificationRateLimiter } from "@/lib/whatsapp/parentRateLimiter";

// Tokens are UUIDs or short hashes; a very long token string is invalid
const TOKEN_MAX_LEN = 500;

export async function POST(req: NextRequest) {
  try {
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0] ||
      req.headers.get("x-real-ip") ||
      "127.0.0.1";

    const rateCheck = parentVerificationRateLimiter.checkRateLimit(ip);
    if (!rateCheck.allowed) {
      return NextResponse.json(
        { error: `تم تجاوز عدد المحاولات. يرجى الانتظار ${rateCheck.resetInSeconds} ثانية.` },
        { status: 429 }
      );
    }

    const body = (await req.json().catch(() => ({}))) as {
      token?: unknown;
      answer?: unknown;
    };
    const { token, answer } = body;

    if (
      !token ||
      typeof token !== "string" ||
      !answer ||
      (answer !== "YES" && answer !== "NO")
    ) {
      return NextResponse.json({ error: "بيانات الإجابة غير مكتملة" }, { status: 400 });
    }

    // Guard against huge token strings before DB lookup
    if (token.length > TOKEN_MAX_LEN) {
      return NextResponse.json({ ok: true, stage: "DEAD" });
    }

    const userAgent = req.headers.get("user-agent") || undefined;

    if (answer === "YES") {
      const res = await confirmParentToken(token, ip, userAgent);
      return NextResponse.json({ ok: true, stage: res ? "REPORT" : "DEAD" });
    } else {
      await rejectParentToken(token, ip, userAgent);
      return NextResponse.json({ ok: true, stage: "DEAD" });
    }
  } catch (err) {
    // Do not leak internal error messages
    console.error("[parent/verify] error:", err);
    return NextResponse.json({ error: "تعذر معالجة التأكيد" }, { status: 500 });
  }
}
