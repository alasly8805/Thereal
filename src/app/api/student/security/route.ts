import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const { getSession } = await import("@/lib/auth");
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "غير مصرح" }, { status: 401 });

    const [devices, userRow] = await Promise.all([
      prisma.device.findMany({
        where: { userId: session.id },
        orderBy: { lastSeenAt: "desc" },
        select: {
          id: true,
          deviceId: true,
          label: true,
          userAgent: true,
          ipAddress: true,
          lastSeenAt: true,
          createdAt: true,
        },
      }),
      prisma.user.findUnique({
        where: { id: session.id },
        select: { loginStreak: true, streakFreezes: true },
      }),
    ]);

    return NextResponse.json(
      {
        devices,
        loginStreak: userRow?.loginStreak ?? 0,
        streakFreezes: userRow?.streakFreezes ?? 0,
      },
      { headers: { "Cache-Control": "private, max-age=60" } }
    );
  } catch (error) {
    console.error("[student/security] error:", error);
    return NextResponse.json({ error: "حدث خطأ داخلي" }, { status: 500 });
  }
}
