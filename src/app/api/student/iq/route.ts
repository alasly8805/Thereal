import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Guard against storing huge blobs in the DB
const IQ_DATA_MAX_LEN = 10_000;
// IQ scores outside this range are nonsensical
const IQ_MIN = 40;
const IQ_MAX = 200;

export async function GET() {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const user = await prisma.user.findUnique({
      where: { id: session.id },
      select: { iqData: true, overallIQ: true },
    });

    const studentCount = await prisma.user.count({ where: { role: "student" } });

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const monthlyCount = await prisma.user.count({
      where: {
        role: "student",
        overallIQ: { gt: 0 },
        updatedAt: { gte: startOfMonth },
      },
    });

    const currentUserIQ = user?.overallIQ ?? 1000;

    let rank = 1;
    let totalRanked = 1;
    let averageIQ = 1000;
    let rankingPeriod = "overall";

    if (monthlyCount >= 5) {
      rank =
        (await prisma.user.count({
          where: {
            role: "student",
            overallIQ: { gt: currentUserIQ },
            updatedAt: { gte: startOfMonth },
          },
        })) + 1;
      totalRanked = monthlyCount;
      const avgIQVal = await prisma.user.aggregate({
        where: { role: "student", overallIQ: { gt: 0 }, updatedAt: { gte: startOfMonth } },
        _avg: { overallIQ: true },
      });
      averageIQ = Math.round(avgIQVal._avg.overallIQ ?? 1000);
      rankingPeriod = "monthly";
    } else {
      rank =
        (await prisma.user.count({
          where: { role: "student", overallIQ: { gt: currentUserIQ } },
        })) + 1;
      totalRanked = await prisma.user.count({
        where: { role: "student", overallIQ: { gt: 0 } },
      });
      const avgIQVal = await prisma.user.aggregate({
        where: { role: "student", overallIQ: { gt: 0 } },
        _avg: { overallIQ: true },
      });
      averageIQ = Math.round(avgIQVal._avg.overallIQ ?? 1000);
      rankingPeriod = "overall";
    }

    return NextResponse.json({
      iqData: user?.iqData ?? null,
      studentCount,
      rank,
      totalRanked,
      averageIQ,
      isAdaptive: studentCount > 100,
      rankingPeriod,
    });
  } catch (error) {
    console.error("[student/iq] GET error:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const { iqData } = body as { iqData?: unknown };

    if (typeof iqData !== "string") {
      return NextResponse.json({ error: "Invalid iqData" }, { status: 400 });
    }

    // Prevent storing huge blobs
    if (iqData.length > IQ_DATA_MAX_LEN) {
      return NextResponse.json({ error: "iqData too large" }, { status: 400 });
    }

    // Validate it's valid JSON before storing
    let parsed: unknown;
    try {
      parsed = JSON.parse(iqData);
    } catch {
      return NextResponse.json({ error: "iqData is not valid JSON" }, { status: 400 });
    }

    const rawIQ =
      parsed !== null && typeof parsed === "object" && "overallIQ" in parsed
        ? Number((parsed as Record<string, unknown>).overallIQ)
        : NaN;

    // Clamp to a sane range; invalid or out-of-range values default to 1000
    const overallIQ =
      Number.isFinite(rawIQ) && rawIQ >= IQ_MIN && rawIQ <= IQ_MAX ? rawIQ : 1000;

    await prisma.user.update({
      where: { id: session.id },
      data: { iqData, overallIQ },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[student/iq] PUT error:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
