import { NextRequest, NextResponse } from "next/server";
import path from "path";
import { getSession } from "@/lib/auth";
import { PREVIEW_COOKIE_NAME, verifyPreviewCookie } from "@/lib/preview-auth";
import { availableQualities } from "@/lib/video-renditions";

/**
 * Qualities the player may offer for a Native (alasly) lesson.
 *
 * Deliberately thin: it reports which pre-generated renditions exist, nothing
 * about the lesson itself. The bytes still go through /api/videos/stream, which
 * is where watch-session and entitlement checks live — this route only needs to
 * know the caller is signed in so the ladder is not enumerable anonymously.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  const isPreviewAuthorized = verifyPreviewCookie(req.cookies.get(PREVIEW_COOKIE_NAME)?.value);
  if (!session && !isPreviewAuthorized) {
    return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
  }

  const { id } = await params;
  const safeFilename = path.basename(id);
  const base = safeFilename.startsWith("gdrive_") ? `${safeFilename}.mp4` : safeFilename;

  try {
    const qualities = await availableQualities(base);
    return NextResponse.json(
      { qualities },
      { headers: { "Cache-Control": "private, max-age=60" } }
    );
  } catch (error) {
    console.error("[videos/stream/qualities] error:", error);
    // A player that cannot list qualities must still play the lesson.
    return NextResponse.json({ qualities: [] });
  }
}
