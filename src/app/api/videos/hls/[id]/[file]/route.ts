import { NextRequest, NextResponse } from "next/server";
import path from "path";
import { authorizeNativeStream, NativeStreamAccess } from "@/lib/native-stream-auth";
import { hlsAssetId, hlsObjectKey, isSafeHlsFile, readChunkKey, readHlsPlaylist, signedSegmentQuery } from "@/lib/hls-package";
import { decideKey, isRevoked } from "@/lib/hls-key-pacing";
import { prisma } from "@/lib/prisma";

/**
 * Encrypted HLS for a Native lesson: master.m3u8, <height>.m3u8, per-chunk AES keys,
 * and (only when CloudFront is off) the segments themselves.
 *
 * Every file goes through the same checks as /api/videos/stream: logged in,
 * enrolled, and — for students — a live watch session for this exact lesson.
 * Playlists are rewritten per request so key URIs carry that watch token
 * and segment URLs carry a CloudFront signature expiring with the session.
 */

const NO_STORE = { "Cache-Control": "no-store, private" };
const M3U8 = "application/vnd.apple.mpegurl";

async function recordViolation(
  access: NativeStreamAccess,
  type: string,
  safeFilename: string,
  req: NextRequest,
  details?: string
) {
  try {
    const studentId = access.session?.role === "student" ? access.session.id : access.watchSession?.studentId;
    if (!studentId) return;
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";
    const userAgent = req.headers.get("user-agent") || undefined;

    await prisma.securityViolation.create({
      data: {
        studentId,
        videoId: access.video?.id || null,
        type,
        details: details ? `${details} (Asset: ${safeFilename})` : `Asset: ${safeFilename}`,
        ip,
        userAgent,
      },
    });
  } catch (err) {
    console.error("[videos/hls] failed to record security violation:", err);
  }
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string; file: string }> }) {
  try {
    const { id, file: rawFile } = await params;
    const safeFilename = path.basename(id);
    const file = path.basename(rawFile);

    const access = await authorizeNativeStream(req, safeFilename);
    if (access instanceof NextResponse) return access;

    const asset = hlsAssetId(safeFilename);
    const token = req.nextUrl.searchParams.get("token");
    const withToken = (uri: string) => (token ? `${uri}?token=${encodeURIComponent(token)}` : uri);

    // Key requests: "key-<chunk>" or legacy "key"
    const keyMatch = file.match(/^key(?:-(\d+))?$/);
    if (keyMatch) {
      const chunk = keyMatch[1] !== undefined ? parseInt(keyMatch[1], 10) : 0;
      const viewerKey =
        access.watchSession?.id ??
        access.watchSession?.studentId ??
        access.session?.id ??
        req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
        "anon";

      // If already revoked, refuse immediately
      if (isRevoked(viewerKey)) {
        return NextResponse.json({ error: "تم إيقاف تشغيل الفيديو بسبب نشاط مشبوه" }, { status: 403 });
      }

      // Check key pacing
      const decision = decideKey(viewerKey, chunk);
      if (!decision.ok) {
        if (decision.report) {
          await recordViolation(access, decision.report, safeFilename, req, `Chunk: ${chunk}`);
        }
        if ("revoked" in decision && decision.revoked) {
          if (access.watchSession?.id) {
            await prisma.videoWatchSession.updateMany({
              where: { id: access.watchSession.id, endedAt: null },
              data: { endedAt: new Date() },
            });
          }
          return NextResponse.json({ error: "تم إيقاف تشغيل الفيديو بسبب نشاط مشبوه" }, { status: 403 });
        }
        return new Response("Key rate limit exceeded", {
          status: 429,
          headers: {
            ...NO_STORE,
            "Retry-After": String(decision.retryAfterSec ?? 5),
          },
        });
      }

      if (decision.report) {
        await recordViolation(access, decision.report, safeFilename, req, `Chunk: ${chunk}`);
      }

      const key = await readChunkKey(asset, chunk);
      if (!key) return NextResponse.json({ error: "المفتاح غير موجود" }, { status: 404 });
      return new Response(new Uint8Array(key), {
        headers: { ...NO_STORE, "Content-Type": "application/octet-stream", "Content-Length": String(key.length) },
      });
    }

    if (!isSafeHlsFile(file)) return NextResponse.json({ error: "الفيديو غير موجود" }, { status: 404 });

    if (file.endsWith(".ts")) {
      // Fallback path only; with CloudFront on, playlists point straight at the CDN.
      const { streamObjectFromS3 } = await import("@/lib/video-storage");
      return await streamObjectFromS3(hlsObjectKey(asset, file), req.headers.get("range"), { ...NO_STORE, "Content-Type": "video/mp2t" });
    }

    const playlist = await readHlsPlaylist(asset, file);
    if (!playlist) return NextResponse.json({ error: "الفيديو غير موجود" }, { status: 404 });

    let body: string;
    if (file === "master.m3u8") {
      body = playlist.replace(/^(\d{3,4}\.m3u8)$/gm, (m) => withToken(m));
    } else {
      const cap = new Date(Date.now() + 4 * 60 * 60 * 1000);
      const sess = access.watchSession?.expiresAt;
      const signed = await signedSegmentQuery(asset, sess && sess < cap ? sess : cap);
      body = playlist
        .replace(/URI="key-(\d+)"/g, (_, c) => `URI="${withToken(`key-${c}`)}"`)
        .replace(/URI="key"/g, `URI="${withToken("key")}"`)
        .replace(/^(\d{3,4}_\d{5}\.ts)$/gm, (seg) => (signed ? `${signed.base}${seg}${signed.query}` : withToken(seg)));
    }
    return new Response(body, { headers: { ...NO_STORE, "Content-Type": M3U8 } });
  } catch (error) {
    console.error("[videos/hls] error:", error);
    return NextResponse.json({ error: "فشل عرض الفيديو" }, { status: 500 });
  }
}
