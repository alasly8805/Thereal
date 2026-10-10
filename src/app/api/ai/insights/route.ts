import { NextResponse } from "next/server";
import { getStudentSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { buildStudentContext } from "@/lib/ai-context";
import { generateInsights } from "@/lib/ai-assistant";

function hasInvalidPercentage(text: string) {
  const matches = text.match(/\d+(?=%)/g) ?? [];
  return matches.some((value) => Number(value) > 100);
}

// Per-user in-process lock: prevents two concurrent GET requests from both
// triggering a refresh simultaneously, which would produce duplicate insight
// rows (two deleteMany + two sets of creates racing each other).
const refreshingUsers = new Set<string>();

// GET — return existing insights + auto-refresh if older than 24h
export async function GET() {
  try {
    const session = await getStudentSession();
    if (!session) return NextResponse.json({ error: "غير مصرح" }, { status: 401 });

    const existing = await prisma.aIStudentInsight.findMany({
      where: { studentId: session.id },
      orderBy: { createdAt: "desc" },
      take: 10,
    });

    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const hasBadInsight = existing.some((i) =>
      hasInvalidPercentage(`${i.title} ${i.description}`)
    );
    const stale =
      existing.length === 0 ||
      existing[0].createdAt < oneDayAgo ||
      hasBadInsight;

    // If another request for this user is already refreshing, return the
    // existing (possibly stale) insights rather than running a second refresh.
    if (stale && !refreshingUsers.has(session.id)) {
      refreshingUsers.add(session.id);
      try {
        const ctx = await buildStudentContext(session.id);
        const fresh = await generateInsights(ctx);

        if (hasBadInsight) {
          await prisma.aIStudentInsight.deleteMany({
            where: { studentId: session.id },
          });
        }

        const created = await Promise.all(
          fresh.map((i) =>
            prisma.aIStudentInsight.create({
              data: {
                studentId: session.id,
                type: i.type,
                category: i.category,
                title: i.title,
                description: i.description,
                confidence: i.confidence,
                dataSnapshot: JSON.stringify({
                  averageScore: ctx.overallStats.averageScore,
                  courses: ctx.overallStats.totalCourses,
                  weakAreas: ctx.weakAreas.length,
                }),
              },
            })
          )
        );

        return NextResponse.json({ insights: created, refreshed: true });
      } finally {
        refreshingUsers.delete(session.id);
      }
    }

    return NextResponse.json({ insights: existing, refreshed: false });
  } catch (err) {
    console.error("Insights GET error:", err);
    return NextResponse.json({ error: "حدث خطأ" }, { status: 500 });
  }
}

// POST — mark insight as read/actioned
export async function POST(req: Request) {
  try {
    const session = await getStudentSession();
    if (!session) return NextResponse.json({ error: "غير مصرح" }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const { id, isRead, isActioned, actionTaken } = body as {
      id?: string;
      isRead?: unknown;
      isActioned?: unknown;
      actionTaken?: unknown;
    };

    if (!id || typeof id !== "string") {
      return NextResponse.json({ error: "id مطلوب" }, { status: 400 });
    }

    const insight = await prisma.aIStudentInsight.findFirst({
      where: { id, studentId: session.id },
    });
    if (!insight) {
      return NextResponse.json({ error: "غير موجود" }, { status: 404 });
    }

    const updated = await prisma.aIStudentInsight.update({
      where: { id },
      data: {
        ...(typeof isRead === "boolean" ? { isRead } : {}),
        ...(typeof isActioned === "boolean" ? { isActioned } : {}),
        ...(actionTaken && typeof actionTaken === "string" ? { actionTaken } : {}),
      },
    });
    return NextResponse.json({ insight: updated });
  } catch (err) {
    console.error("Insights POST error:", err);
    return NextResponse.json({ error: "حدث خطأ" }, { status: 500 });
  }
}
