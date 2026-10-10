import { NextResponse } from "next/server";
import { clearAuthCookie, getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkAndUpdateStreak } from "@/lib/streak-middleware";

const NO_CACHE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
};

export async function GET() {
  try {
    const session = await getSession();

    if (!session) {
      return NextResponse.json({ user: null }, { headers: NO_CACHE_HEADERS });
    }

    // Lightweight streak check: runs on first authenticated request of the day.
    // Fire-and-forget — don't block the /me response on streak DB writes.
    if (session.role === "student") {
      void checkAndUpdateStreak(session.id).catch(() => {/* non-critical */});
    }

    return NextResponse.json({ user: session }, { headers: NO_CACHE_HEADERS });
  } catch (error) {
    console.error("GET /api/auth/me error:", error);
    return NextResponse.json({ user: null }, { headers: NO_CACHE_HEADERS });
  }
}

export async function DELETE() {
  try {
    const session = await getSession();

    if (!session) {
      return NextResponse.json({ error: "يجب تسجيل الدخول أولاً" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { id: session.id },
    });

    if (user) {
      await prisma.user.delete({ where: { id: user.id } });
    }

    await clearAuthCookie();

    return NextResponse.json({ success: true }, { headers: NO_CACHE_HEADERS });
  } catch (error) {
    console.error("DELETE /api/auth/me error:", error);
    return NextResponse.json({ error: "حدث خطأ داخلي" }, { status: 500 });
  }
}
