import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkVideoAccess } from "@/lib/authorization";
import { verifyAxinomToken } from "@/lib/axinom";
import { PREVIEW_COOKIE_NAME, isAuthorizedPreview } from "@/lib/preview-auth";
import fs from "fs";
import path from "path";

const DRM_STORAGE_DIR = path.resolve(process.cwd(), "uploads", "drm");

// Whitelist of allowed extensions for DRM media streaming
const ALLOWED_EXTENSIONS = new Set([".mpd", ".m3u8", ".m4s", ".mp4", ".ts"]);

function getDrmCorsHeaders(req: NextRequest): Record<string, string> {
  const origin = req.headers.get("origin");
  const host = req.headers.get("host") || "";
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "";
  let isAllowed = false;

  if (origin) {
    try {
      const parsedOrigin = new URL(origin);
      const parsedApp = appUrl ? new URL(appUrl) : null;
      if (
        parsedOrigin.host === host ||
        (parsedApp && parsedOrigin.host === parsedApp.host) ||
        parsedOrigin.hostname === "localhost" ||
        parsedOrigin.hostname === "127.0.0.1"
      ) {
        isAllowed = true;
      }
    } catch {
      isAllowed = false;
    }
  }

  const headers: Record<string, string> = {
    "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
    "Access-Control-Allow-Headers": "Range, Authorization, Content-Type, X-AxDRM-Message",
    "Access-Control-Expose-Headers": "Content-Length, Content-Range, Accept-Ranges",
    "Access-Control-Max-Age": "86400",
  };

  if (isAllowed && origin) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Access-Control-Allow-Credentials"] = "true";
  }

  return headers;
}

export async function OPTIONS(req: NextRequest) {
  const corsHeaders = getDrmCorsHeaders(req);
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders,
  });
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string[] }> }
) {
  try {
    const { slug } = await params;
    if (!slug || slug.length === 0) {
      return NextResponse.json({ error: "مسار غير صالح" }, { status: 400 });
    }

    // Strict path traversal prevention:
    // Reject any segment containing dot-dot, slashes, backslashes, or disallowed characters
    for (const segment of slug) {
      if (!segment || segment === "." || segment === ".." || segment.includes("/") || segment.includes("\\")) {
        return NextResponse.json({ error: "مسار غير صالح" }, { status: 400 });
      }
      if (!/^[a-zA-Z0-9_.-]+$/.test(segment)) {
        return NextResponse.json({ error: "مسار غير صالح" }, { status: 400 });
      }
    }

    const videoAssetId = slug[0];
    const subSegments = slug.slice(1);
    const subPath = subSegments.length > 0 ? subSegments.join(path.sep) : "manifest.mpd";

    // ── Authorization ──────────────────────────────────────────────────────────
    const tokenParam =
      req.nextUrl.searchParams.get("token") ||
      req.headers.get("x-axdrm-message") ||
      (req.headers.get("authorization")?.startsWith("Bearer ")
        ? req.headers.get("authorization")?.slice(7)
        : null);

    const isTokenAuthorized = tokenParam ? verifyAxinomToken(tokenParam) : false;

    const session = await getSession();
    const previewCookie = req.cookies.get(PREVIEW_COOKIE_NAME)?.value;
    const isPreviewAuthorized = isAuthorizedPreview(session, previewCookie);

    // If authenticated via valid signed Axinom token or preview authority, allow streaming encrypted segments
    if (!isTokenAuthorized && !isPreviewAuthorized) {
      if (!session) {
        return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
      }

      // Video must exist in database — never fall open
      const video = await prisma.video.findFirst({
        where: {
          OR: [
            { providerVideoId: videoAssetId },
            { vdoCipherId: videoAssetId },
            { id: videoAssetId },
          ],
        },
        select: {
          id: true,
          isFree: true,
          folder: {
            select: {
              course: { select: { teacherId: true } },
            },
          },
        },
      });

      if (video) {
        const isOwner = session.role === "teacher" && video.folder?.course?.teacherId === session.id;
        const isStaff = session.role === "admin" || session.role === "superadmin" || isOwner;
        if (!video.isFree && !isStaff) {
          const hasAccess = await checkVideoAccess(session.id, session.role, video.id);
          if (!hasAccess) {
            return NextResponse.json({ error: "لا يوجد صلاحية للوصول لهذا المحتوى المحمي" }, { status: 403 });
          }
        }
      } else {
        // If video is newly uploaded and not yet saved in a lecture folder: only allow teacher/staff preview
        const isStaff = session.role === "teacher" || session.role === "admin" || session.role === "superadmin";
        if (!isStaff) {
          return NextResponse.json({ error: "المحتوى غير موجود" }, { status: 404 });
        }
      }
    }


    // ── Canonical Path Resolution & Containment ────────────────────────────────
    const resolvedPath = path.resolve(DRM_STORAGE_DIR, videoAssetId, subPath);
    if (!resolvedPath.startsWith(DRM_STORAGE_DIR + path.sep)) {
      return NextResponse.json({ error: "مسار غير صالح" }, { status: 400 });
    }

    const ext = path.extname(resolvedPath).toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      return NextResponse.json({ error: "نوع ملف غير مسموح" }, { status: 403 });
    }

    if (!fs.existsSync(resolvedPath)) {
      // Local disk is only a cache: the encrypted package's origin is S3.
      // Authorization and path containment above have already run.
      const { objectSizeInS3, streamObjectFromS3, drmObjectKey } = await import("@/lib/video-storage");
      const key = drmObjectKey(videoAssetId, subSegments.length > 0 ? subSegments.join("/") : "manifest.mpd");
      if ((await objectSizeInS3(key)) !== null) {
        const extToType: Record<string, string> = {
          ".mpd": "application/dash+xml",
          ".m3u8": "application/vnd.apple.mpegurl",
          ".m4s": "video/iso.segment",
          ".mp4": "video/mp4",
          ".ts": "video/mp2t",
        };
        try {
          return await streamObjectFromS3(key, req.headers.get("range"), {
            "Content-Type": extToType[ext] ?? "application/octet-stream",
            ...getDrmCorsHeaders(req),
            "Cache-Control": "private, no-cache, no-store, must-revalidate",
          });
        } catch (err: unknown) {
          const status = (err as { $metadata?: { httpStatusCode?: number } })?.$metadata?.httpStatusCode;
          if (status === 416) {
            return new Response(null, { status: 416, headers: getDrmCorsHeaders(req) });
          }
          throw err;
        }
      }
      return NextResponse.json({ error: "الملف المشفر غير موجود" }, { status: 404 });
    }

    const stat = fs.statSync(resolvedPath);
    if (stat.isDirectory()) {
      return NextResponse.json({ error: "مسار غير صالح" }, { status: 400 });
    }

    const fileSize = stat.size;

    // Determine Content-Type
    let contentType = "application/octet-stream";

    if (ext === ".mpd") {
      contentType = "application/dash+xml";
    } else if (ext === ".m3u8") {
      contentType = "application/vnd.apple.mpegurl";
    } else if (ext === ".m4s") {
      contentType = "video/iso.segment";
    } else if (ext === ".mp4") {
      contentType = "video/mp4";
    } else if (ext === ".ts") {
      contentType = "video/mp2t";
    }

    const corsHeaders = getDrmCorsHeaders(req);
    const baseHeaders: Record<string, string> = {
      "Content-Type": contentType,
      "Accept-Ranges": "bytes",
      ...corsHeaders,
      "Cache-Control": "private, no-cache, no-store, must-revalidate",
    };

    // ── Range Request Handling (HTTP 206) with suffix range support ────────────
    const range = req.headers.get("range");
    if (range) {
      const parts = range.replace(/bytes=/, "").split("-");
      let start: number;
      let end: number;

      if (parts[0] === "") {
        // Suffix range: e.g. bytes=-500 (last 500 bytes of the file)
        const suffixLength = Number.parseInt(parts[1], 10);
        if (Number.isNaN(suffixLength) || suffixLength <= 0) {
          return new Response(null, {
            status: 416,
            headers: {
              "Content-Range": `bytes */${fileSize}`,
              "Access-Control-Allow-Origin": "*",
            },
          });
        }
        start = Math.max(0, fileSize - suffixLength);
        end = fileSize - 1;
      } else {
        start = Number.parseInt(parts[0], 10);
        const requestedEnd = parts[1] ? Number.parseInt(parts[1], 10) : fileSize - 1;
        end = Math.min(Number.isNaN(requestedEnd) ? fileSize - 1 : requestedEnd, fileSize - 1);
      }

      if (Number.isNaN(start) || start < 0 || start > end || start >= fileSize) {
        return new Response(null, {
          status: 416,
          headers: {
            "Content-Range": `bytes */${fileSize}`,
            "Access-Control-Allow-Origin": "*",
          },
        });
      }

      const chunkSize = end - start + 1;
      const fileStream = fs.createReadStream(resolvedPath, { start, end });

      return new Response(fileStream as unknown as ReadableStream, {
        status: 206,
        headers: {
          ...baseHeaders,
          "Content-Range": `bytes ${start}-${end}/${fileSize}`,
          "Content-Length": chunkSize.toString(),
        },
      });
    }

    // Full file response (HTTP 200)
    const fileStream = fs.createReadStream(resolvedPath);
    return new Response(fileStream as unknown as ReadableStream, {
      status: 200,
      headers: {
        ...baseHeaders,
        "Content-Length": fileSize.toString(),
      },
    });
  } catch (error) {
    console.error("[videos/drm] stream error:", error);
    return NextResponse.json({ error: "فشل بث المحتوى المحمي" }, { status: 500 });
  }
}
