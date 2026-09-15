import { NextRequest, NextResponse } from "next/server";
import { setAuthCookie } from "@/lib/auth";
import { performAdminLogin } from "@/lib/admin-login";

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as {
      role?: string;
      name?: string;
      email?: string;
      password?: string;
    };

    const clientIp =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      req.headers.get("x-real-ip") ||
      "127.0.0.1";

    const result = await performAdminLogin({
      role: body.role || "",
      password: body.password || "",
      name: body.name || "",
      email: body.email || "",
      clientIp,
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    await setAuthCookie(result.token);
    return NextResponse.json({ user: result.user });
  } catch (err) {
    console.error("Admin login error:", err);
    return NextResponse.json({ error: "حدث خطأ في الخادم" }, { status: 500 });
  }
}
