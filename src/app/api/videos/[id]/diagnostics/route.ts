import { NextRequest, NextResponse } from "next/server";
import { getStudentSession, getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * Sink for client-reported playback faults (see lib/player-diagnostics).
 *
 * Intentionally forgiving: a student whose player is already misbehaving must
 * never see an error because the bug report failed, so every problem here is
 * swallowed and answered with 204. It is also rate-limited per student+video,
 * because the condition being reported is exactly the kind that repeats.
 */

const REPORT_INTERVAL_MS = 60_000;
const lastReport = new Map<string, number>();

const KINDS = new Set(["DOUBLE_AUDIO", "STALL"]);

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const studentSession = await getStudentSession();
    const session = studentSession || (await getSession());
    if (!session) return new NextResponse(null, { status: 204 });

    const { id: videoId } = await params;
    const key = `${session.id}:${videoId}`;
    const now = Date.now();
    const previous = lastReport.get(key) || 0;
    if (now - previous < REPORT_INTERVAL_MS) return new NextResponse(null, { status: 204 });
    lastReport.set(key, now);

    const body = (await req.json()) as Record<string, unknown>;
    const kind = String(body.kind || "");
    if (!KINDS.has(kind)) return new NextResponse(null, { status: 204 });

    const num = (v: unknown): number | null =>
      typeof v === "number" && Number.isFinite(v) ? Math.round(v) : null;

    await prisma.playbackDiagnostic.create({
      data: {
        studentId: session.id,
        videoId,
        kind,
        playingCount: num(body.playingCount) ?? 1,
        timeDeltaMs: num(body.timeDeltaMs),
        stalledMs: num(body.stalledMs),
        effectiveType: typeof body.effectiveType === "string" ? body.effectiveType.slice(0, 20) : null,
        downlinkMbps:
          typeof body.downlinkMbps === "number" && Number.isFinite(body.downlinkMbps)
            ? body.downlinkMbps
            : null,
        detail: typeof body.detail === "string" ? body.detail.slice(0, 2000) : null,
        userAgent: (req.headers.get("user-agent") || "").slice(0, 300),
      },
    });

    console.warn(`[playback-diagnostics] ${kind} student=${session.id} video=${videoId}`);
  } catch (error) {
    console.error("[videos/diagnostics] error:", error);
  }
  return new NextResponse(null, { status: 204 });
}
