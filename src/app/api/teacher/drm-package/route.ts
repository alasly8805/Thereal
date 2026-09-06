import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import fs from "fs";
import path from "path";
import os from "os";
import crypto from "crypto";
import { spawnSync } from "child_process";
import { Readable } from "stream";
import { pipeline } from "stream/promises";
import { prisma } from "@/lib/prisma";
import { isDrmRequestAuthorized } from "@/lib/drm-auth";
import {
  extractGoogleDriveFileId,
  getGoogleDriveAccessToken,
} from "@/lib/google-drive";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // Allow up to 5 minutes for downloading and packaging multi-GB video files

const UPLOADS_DIR = path.resolve(process.cwd(), "uploads", "videos");
const DRM_OUTPUT_DIR = path.resolve(process.cwd(), "uploads", "drm");
const DRM_KEYS_DIR = path.resolve(process.cwd(), "uploads", "drm-keys");
const TEMP_DIR = path.resolve(process.cwd(), "uploads", "temp");

function findPackagerBinary(): string | null {
  const customPath = process.env.SHAKA_PACKAGER_PATH;
  if (customPath && fs.existsSync(customPath)) return customPath;

  const standardNames =
    process.platform === "win32"
      ? ["packager.exe", "packager-win-x64.exe", "packager"]
      : ["/usr/local/bin/packager", "/usr/bin/packager", "packager", "packager-linux-x64", "shaka-packager"];

  for (const name of standardNames) {
    try {
      const check = spawnSync(name, ["--version"], { stdio: "ignore" });
      if (check.status === 0 || check.error === undefined) {
        return name;
      }
    } catch {
      // not available
    }
  }

  const localBin = path.join(process.cwd(), "bin", process.platform === "win32" ? "packager.exe" : "packager");
  if (fs.existsSync(localBin)) return localBin;

  return null;
}

export async function POST(req: NextRequest) {
  let tempFilePathToCleanup: string | null = null;

  try {
    const session = await getSession();
    if (!session || (session.role !== "teacher" && session.role !== "superadmin" && session.role !== "admin")) {
      return NextResponse.json({ error: "غير مصرح لك بالوصول" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const drmPassword = String(req.headers.get("x-drm-password") || body.drmPassword || body.password || "").trim();
    const authorized = await isDrmRequestAuthorized(session, drmPassword);
    if (!authorized) {
      return NextResponse.json({ error: "كلمة مرور حماية DRM غير صحيحة أو مطلوبة للتشفير" }, { status: 403 });
    }

    const rawVideoId = String(body.videoId || body.assetId || body.url || "").trim();
    if (!rawVideoId) {
      return NextResponse.json({ error: "معرّف الفيديو (videoId) مطلوب للتشفير" }, { status: 400 });
    }

    // Determine if the video is sourced from Google Drive
    let gdriveFileId: string | null = null;
    if (rawVideoId.startsWith("gdrive_")) {
      gdriveFileId = rawVideoId.replace(/^gdrive_/, "");
    } else if (body.gdriveUrl) {
      gdriveFileId = extractGoogleDriveFileId(body.gdriveUrl);
    } else {
      gdriveFileId = extractGoogleDriveFileId(rawVideoId);
    }

    if (session.role === "teacher") {
      const ownerId = session.id.replace(/[^a-zA-Z0-9_-]/g, "_");
      const ownsPendingUpload =
        path.basename(rawVideoId) === rawVideoId && rawVideoId.startsWith(`local_${ownerId}_`);

      // If it is a Google Drive file, verify ownership if associated with a folder or video
      if (!ownsPendingUpload && !gdriveFileId) {
        const ownedVideo = await prisma.video.findFirst({
          where: {
            OR: [
              { id: rawVideoId },
              { providerVideoId: rawVideoId },
              { vdoCipherId: rawVideoId },
            ],
            folder: { course: { teacherId: session.id } },
          },
          select: { id: true },
        });

        if (!ownedVideo) {
          return NextResponse.json({ error: "You can only package videos that belong to your account" }, { status: 403 });
        }
      }
    }

    let sourcePath: string;

    if (gdriveFileId) {
      // 1. Download directly from Google Drive API to temporary location
      const token = await getGoogleDriveAccessToken();
      const downloadUrl = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(gdriveFileId)}?alt=media&supportsAllDrives=true`;

      const gdriveRes = await fetch(downloadUrl, {
        method: "GET",
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!gdriveRes.ok || !gdriveRes.body) {
        return NextResponse.json(
          { error: `فشل تنزيل ملف الفيديو من Google Drive (${gdriveRes.status}). تأكد من صحة الرابط والصلاحيات.` },
          { status: 400 }
        );
      }

      if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true });
      const tempFilename = `codeup-drm-gdrive-${Date.now()}-${crypto.randomBytes(6).toString("hex")}.mp4`;
      const tempPath = path.join(TEMP_DIR, tempFilename);
      tempFilePathToCleanup = tempPath;

      await pipeline(
        Readable.fromWeb(gdriveRes.body as Parameters<typeof Readable.fromWeb>[0]),
        fs.createWriteStream(tempPath)
      );

      const stats = fs.statSync(tempPath);
      if (stats.size === 0) {
        try { fs.unlinkSync(tempPath); } catch {}
        tempFilePathToCleanup = null;
        return NextResponse.json(
          { error: "تم تنزيل ملف فارغ من Google Drive. تأكد من صلاحيات مشاركة الملف." },
          { status: 400 }
        );
      }

      sourcePath = tempPath;
    } else {
      const safeFilename = path.basename(rawVideoId);
      sourcePath = path.join(UPLOADS_DIR, safeFilename);

      if (!fs.existsSync(sourcePath)) {
        return NextResponse.json(
          { error: `ملف الفيديو غير موجود على السيرفر لتشفيره عتادياً: ${safeFilename}` },
          { status: 404 }
        );
      }
    }

    const packagerBin = findPackagerBinary();
    if (!packagerBin) {
      return NextResponse.json(
        {
          error:
            "أداة Shaka Packager غير مثبتة على السيرفر. يرجى مراجعة إعدادات السيرفر.",
        },
        { status: 500 }
      );
    }

    const assetId = body.assetId || `cenc_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
    const safeAssetId = assetId.replace(/[^a-zA-Z0-9_-]/g, "_");
    const outputDir = path.join(DRM_OUTPUT_DIR, safeAssetId);

    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
    if (!fs.existsSync(DRM_KEYS_DIR)) fs.mkdirSync(DRM_KEYS_DIR, { recursive: true });

    const keyId = crypto.randomBytes(16).toString("hex");
    const key = crypto.randomBytes(16).toString("hex");

    const manifestPath = path.join(outputDir, "manifest.mpd");
    const videoOut = path.join(outputDir, "video.mp4");
    const audioOut = path.join(outputDir, "audio.mp4");

    const packagerArgs = [
      `in=${sourcePath},stream=video,output=${videoOut}`,
      `in=${sourcePath},stream=audio,output=${audioOut}`,
      `--temp_dir=${TEMP_DIR}`,
      "--io_cache_size=67108864",
      "--enable_raw_key_encryption",
      `--keys=label=:key_id=${keyId}:key=${key}`,
      "--protection_systems=Widevine,PlayReady",
      "--protection_scheme=cenc",
      `--mpd_output=${manifestPath}`,
    ];

    const result = spawnSync(packagerBin, packagerArgs, {
      stdio: "inherit",
      env: { ...process.env, TMPDIR: TEMP_DIR },
    });

    // Clean up temporary download file immediately to conserve disk space
    if (tempFilePathToCleanup && fs.existsSync(tempFilePathToCleanup)) {
      try {
        fs.unlinkSync(tempFilePathToCleanup);
        tempFilePathToCleanup = null;
      } catch (cleanErr) {
        console.warn("[drm-package] Warning: failed to delete temp file:", cleanErr);
      }
    }

    if (result.status !== 0) {
      return NextResponse.json(
        { error: `فشلت عملية التشفير العتادي Shaka Packager (رمز الخطأ: ${result.status})` },
        { status: 500 }
      );
    }

    const keyMeta = {
      assetId: safeAssetId,
      keyId,
      key,
      source: gdriveFileId ? `gdrive_${gdriveFileId}` : sourcePath,
      createdAt: new Date().toISOString(),
    };
    fs.writeFileSync(path.join(DRM_KEYS_DIR, `${safeAssetId}.json`), JSON.stringify(keyMeta, null, 2));

    // Save to PostgreSQL AxinomVideoKey table for disaster recovery and cross-account failover
    try {
      const { saveVideoDrmKey } = await import("@/lib/axinom-pool");
      await saveVideoDrmKey({
        videoId: rawVideoId,
        assetId: safeAssetId,
        keyId,
        keyHex: key,
        manifestUrl: `/api/videos/drm/${safeAssetId}/manifest.mpd`,
      });
    } catch (dbSaveErr) {
      console.error("[drm-package] Warning: failed to save DRM key to database:", dbSaveErr);
    }

    // If an existing video in DB matches this rawVideoId or body.dbVideoId, update its provider and providerVideoId
    try {
      const dbTargetId = body.dbVideoId || rawVideoId;
      await prisma.video.updateMany({
        where: {
          OR: [
            { id: dbTargetId },
            { providerVideoId: rawVideoId },
            ...(gdriveFileId ? [{ providerVideoId: `gdrive_${gdriveFileId}` }] : []),
          ],
        },
        data: {
          videoProvider: "axinom",
          providerVideoId: safeAssetId,
        },
      });
    } catch (updateErr) {
      console.warn("[drm-package] Note: video record update skipped or completed:", updateErr);
    }

    return NextResponse.json({
      success: true,
      assetId: safeAssetId,
      manifestUrl: `/api/videos/drm/${safeAssetId}/manifest.mpd`,
      message: "تم تشفير الفيديو عتادياً بنظام CENC Widevine + PlayReady بنجاح!",
    });
  } catch (error: unknown) {
    if (tempFilePathToCleanup && fs.existsSync(tempFilePathToCleanup)) {
      try { fs.unlinkSync(tempFilePathToCleanup); } catch {}
    }
    console.error("[drm-package] error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "حدث خطأ أثناء معالجة وتشفير الفيديو" },
      { status: 500 }
    );
  }
}
