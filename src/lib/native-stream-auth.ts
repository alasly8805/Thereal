import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkVideoAccess } from "@/lib/authorization";
import { PREVIEW_COOKIE_NAME, verifyPreviewCookie } from "@/lib/preview-auth";

export interface NativeStreamAccess {
  session: Awaited<ReturnType<typeof getSession>>;
  isPreviewAuthorized: boolean;
  video: { id: string; isFree: boolean } | null;
  watchSession: { id: string; studentId: string; videoId: string; expiresAt: Date; endedAt: Date | null } | null;
}

/**
 * Who may read a Native (alasly / Drive) lesson's bytes, shared by the plain
 * MP4 stream and the encrypted HLS routes so the two can never drift apart.
 *
 * `safeFilename` is the provider asset id from the URL (already basename'd).
 * Returns the resolved access, or the response to send back when denied.
 */
export async function authorizeNativeStream(
  req: NextRequest,
  safeFilename: string
): Promise<NativeStreamAccess | NextResponse> {
  const session = await getSession();
  const isPreviewAuthorized = verifyPreviewCookie(req.cookies.get(PREVIEW_COOKIE_NAME)?.value);
  if (!session && !isPreviewAuthorized) {
    return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
  }

  // ── Authorization ────────────────────────────────────────────────────────
  // The path segment is a *provider asset id*, not a Video row id, so resolve
  // the owning lesson first. When a token is provided, resolve the exact video
  // bound to this watch session to avoid ambiguity if multiple lessons share
  // the same providerVideoId (e.g. duplicate uploads or across courses).
  const token = req.nextUrl.searchParams.get("token");
  let video: { id: string; isFree: boolean } | null = null;
  let watchSession: NativeStreamAccess["watchSession"] = null;

  if (token) {
    watchSession = await prisma.videoWatchSession.findUnique({
      where: { sessionToken: token },
      select: { id: true, studentId: true, videoId: true, expiresAt: true, endedAt: true },
    });
    if (watchSession) {
      const candidate = await prisma.video.findUnique({
        where: { id: watchSession.videoId },
        select: { id: true, isFree: true, providerVideoId: true, vdoCipherId: true },
      });
      if (candidate && (candidate.providerVideoId === safeFilename || candidate.vdoCipherId === safeFilename)) {
        video = { id: candidate.id, isFree: candidate.isFree };
      }
    }
  }

  if (!video) {
    video = await prisma.video.findFirst({
      where: { OR: [{ providerVideoId: safeFilename }, { vdoCipherId: safeFilename }] },
      select: { id: true, isFree: true },
    });
  }

  if (video) {
    // Preview-cookie access is intentionally limited to Drive-backed previews.
    if (!session && (!isPreviewAuthorized || !safeFilename.startsWith("gdrive_"))) {
      return NextResponse.json({ error: "لا توجد صلاحية" }, { status: 403 });
    }

    const hasAccess = session ? await checkVideoAccess(session.id, session.role, video.id) : true;
    if (!hasAccess) {
      return NextResponse.json({ error: "لا يوجد صلاحية للوصول لهذا الفيديو" }, { status: 403 });
    }

    // A student must present the watch-session token they were issued.
    //
    // Enrollment alone used to be enough here, which quietly voided the whole
    // per-video watch limit: this URL is what the player loads, so a student
    // could lift it from their own network tab on the first legitimate watch
    // and replay the lesson forever without ever consuming another slot.
    // /api/videos/[id]/secure-url already required a token; this path did not.
    if (session?.role === "student" && !video.isFree) {
      if (!token) {
        return NextResponse.json({ error: "يجب بدء جلسة مشاهدة أولاً" }, { status: 403 });
      }
      if (!watchSession) {
        watchSession = await prisma.videoWatchSession.findUnique({
          where: { sessionToken: token },
          select: { id: true, studentId: true, videoId: true, expiresAt: true, endedAt: true },
        });
      }
      if (
        !watchSession ||
        watchSession.studentId !== session.id ||
        watchSession.videoId !== video.id ||
        watchSession.endedAt ||
        watchSession.expiresAt < new Date()
      ) {
        return NextResponse.json({ error: "جلسة المشاهدة غير صالحة أو منتهية" }, { status: 403 });
      }
    }
  } else {
    // Newly imported video not yet saved in a lecture folder: only allow teacher/admin staff preview
    const isStaff = !!session && (session.role === "teacher" || session.role === "admin" || session.role === "superadmin");
    if (!isStaff && !isPreviewAuthorized) {
      return NextResponse.json({ error: "الفيديو غير موجود" }, { status: 404 });
    }
  }

  return { session, isPreviewAuthorized, video, watchSession };
}

/** Students only ever get the encrypted copy once one exists; staff and preview keep the MP4. */
export function isStudentViewer(access: NativeStreamAccess): boolean {
  return access.session?.role === "student";
}
