import { NextRequest, NextResponse } from "next/server";
import path from "path";
import { getSession } from "@/lib/auth";
import { PREVIEW_COOKIE_NAME, verifyPreviewCookie } from "@/lib/preview-auth";
import { availableQualities } from "@/lib/video-renditions";
import { hlsReady } from "@/lib/hls-package";

/**
 * Qualities the Native (alasly / Drive) player always offers: Auto, 360p,
 * 480p, 720p. Reports which pre-generated renditions exist so the menu can
 * show file sizes; missing tiers still appear and /api/videos/stream falls
 * back to the original. Watch-session checks live on the byte stream, not here.
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
    const [qualities, hls] = await Promise.all([availableQualities(base), hlsReady(safeFilename)]);
    // hlsUrl: the encrypted package exists, so the player must use it (students
    // are refused the plain MP4 from then on).
    return NextResponse.json(
      { qualities, hlsUrl: hls ? `/api/videos/hls/${encodeURIComponent(safeFilename)}/master.m3u8` : null },
      { headers: { "Cache-Control": "private, max-age=60" } }
    );
  } catch (error) {
    console.error("[videos/stream/qualities] error:", error);
    // A player that cannot list qualities must still play the lesson.
    return NextResponse.json({ qualities: [], hlsUrl: null });
  }
}
