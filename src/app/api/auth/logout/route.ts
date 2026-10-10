import { NextResponse } from "next/server";
import { clearAuthCookie, getSession } from "@/lib/auth";
import { invalidateUserSessionCache } from "@/lib/cache";

export async function POST() {
  try {
    // Read session BEFORE clearing the cookie so we can flush the server-side
    // cache for this user. Without this, the cached DB row survives until its
    // TTL expires and the next request for the same user-id gets stale data
    // (e.g., a deactivated account still appearing active).
    const session = await getSession();
    if (session?.id) {
      invalidateUserSessionCache(session.id);
    }

    await clearAuthCookie();
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[auth/logout] error:", error);
    return NextResponse.json(
      { error: "حدث خطأ داخلي" },
      { status: 500 }
    );
  }
}
