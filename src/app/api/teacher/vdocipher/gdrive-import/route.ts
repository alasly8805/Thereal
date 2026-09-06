import { createWriteStream, openAsBlob } from "node:fs";
import { stat, unlink } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { randomUUID } from "node:crypto";

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  extractGoogleDriveFileId,
  getGoogleDriveFileMetadata,
  getGoogleDriveAccessToken,
} from "@/lib/google-drive";
import { getConfigNumber, getConfigNumberClamped } from "@/lib/config";
import { triggerPlanSyncForCourse } from "@/lib/plan-lesson-matcher";
import {
  selectBestAccountForUpload,
  requestVdoCipherUploadTicket,
  decryptVdoCipherSecret,
} from "@/lib/vdocipher-accounts";
import { isAuthorizedStaffUpload } from "@/lib/preview-auth";
import { isDrmAuthorized, isDrmRequestAuthorized } from "@/lib/drm-auth";

const activeImportsByStaff = new Map<string, number>();
const hourlyImportsByStaff = new Map<string, { count: number; resetAt: number }>();

/**
 * Checks concurrency and hourly rate limit for Google Drive imports.
 */
function checkStaffImportLimit(staffId: string): { allowed: boolean; error?: string } {
  const active = activeImportsByStaff.get(staffId) || 0;
  if (active >= 2) {
    return {
      allowed: false,
      error: "لديك عمليتا استيراد جاريتان بالفعل من Google Drive. يرجى الانتظار حتى اكتمالهما.",
    };
  }

  const now = Date.now();
  let hourly = hourlyImportsByStaff.get(staffId);
  if (!hourly || now > hourly.resetAt) {
    hourly = { count: 0, resetAt: now + 60 * 60 * 1000 };
    hourlyImportsByStaff.set(staffId, hourly);
  }

  if (hourly.count >= 10) {
    return {
      allowed: false,
      error: "تجاوزت الحد الأقصى لعمليات الاستيراد في الساعة (10 عمليات). يرجى المحاولة لاحقاً.",
    };
  }

  return { allowed: true };
}

/**
 * An S3 POST policy is a base64 JSON document carrying an expiry and a
 * content-length-range condition. Reading the range lets an oversized file fail
 * with a precise message instead of an opaque 403 from S3.
 */
function readPolicyLimits(policy: unknown): { maxBytes?: number; expiration?: string } {
  if (typeof policy !== "string") return {};
  try {
    const decoded = JSON.parse(Buffer.from(policy, "base64").toString("utf-8")) as {
      expiration?: string;
      conditions?: unknown[];
    };
    let maxBytes: number | undefined;
    for (const condition of decoded.conditions || []) {
      if (Array.isArray(condition) && condition[0] === "content-length-range") {
        const upper = Number(condition[2]);
        if (Number.isFinite(upper)) maxBytes = upper;
      }
    }
    return { maxBytes, expiration: decoded.expiration };
  } catch {
    return {};
  }
}

/** Pulls the human-readable <Message> out of an S3 XML error body. */
function s3ErrorMessage(body: string): string {
  const message = /<Message>([\s\S]*?)<\/Message>/.exec(body)?.[1];
  const code = /<Code>([\s\S]*?)<\/Code>/.exec(body)?.[1];
  if (message && code) return `${code}: ${message}`;
  return message || code || body.slice(0, 300);
}

export const maxDuration = 300; // 5 minutes

export async function POST(req: NextRequest) {
  let tempPath: string | null = null;
  let callerStaffId: string | null = null;
  try {
    const session = await getSession();

    if (!isAuthorizedStaffUpload(session) || !session?.id) {
      return NextResponse.json(
        { error: "غير مصرح لك بالوصول. تسجيل الدخول كمعلم أو مشرف مطلوب." },
        { status: 401 }
      );
    }

    callerStaffId = session.id;
    const limitCheck = checkStaffImportLimit(callerStaffId);
    if (!limitCheck.allowed) {
      return NextResponse.json({ error: limitCheck.error }, { status: 429 });
    }

    // Increment concurrency and hourly counter
    activeImportsByStaff.set(callerStaffId, (activeImportsByStaff.get(callerStaffId) || 0) + 1);
    const hourly = hourlyImportsByStaff.get(callerStaffId);
    if (hourly) hourly.count += 1;

    const body = (await req.json().catch(() => ({}))) as {
      url?: string;
      driveUrl?: string;
      title?: string;
      folderId?: string;
      durationMinutes?: number;
      maxWatchesPerUser?: number;
      publishAt?: string | null;
      drmPassword?: string;
    };

    const drmPass = req.headers.get("x-drm-password") || body.drmPassword || "";
    const isAuthorized = await isDrmRequestAuthorized(session, drmPass);
    if (!isAuthorized) {
      return NextResponse.json(
        { error: "كلمة مرور حماية DRM غير صحيحة أو مطلوبة للتشفير" },
        { status: 403 }
      );
    }

    const rawUrl = body.url || body.driveUrl || "";
    const fileId = extractGoogleDriveFileId(rawUrl);

    if (!fileId) {
      return NextResponse.json(
        {
          error:
            "رابط Google Drive غير صحيح. يرجى إدخال رابط مشاركة صالح (مثال: https://drive.google.com/file/d/.../view) أو معرّف الملف.",
        },
        { status: 400 }
      );
    }

    const folderId = body.folderId;
    let folder: { id: string; course?: { id: string } | null } | null = null;

    if (folderId) {
      if (!session || !["teacher", "admin", "superadmin"].includes(session.role || "")) {
        return NextResponse.json(
          { error: "تسجيل الدخول كمعلم أو مشرف مطلوب لإضافة فيديو لمحاضرة" },
          { status: 403 }
        );
      }

      // Verify folder ownership for course lecture
      folder = await prisma.folder.findFirst({
        where:
          session.role === "superadmin" || session.role === "admin"
            ? { id: folderId }
            : { id: folderId, course: { teacherId: session.id } },
        include: { course: { select: { id: true } } },
      });

      if (!folder) {
        return NextResponse.json(
          { error: "المحاضرة غير موجودة أو لا تملك صلاحية إضافتها" },
          { status: 404 }
        );
      }

      const count = await prisma.video.count({ where: { folderId } });
      const maxPerFolder = await getConfigNumber("max_videos_per_folder");
      if (maxPerFolder > 0 && count >= maxPerFolder) {
        return NextResponse.json(
          { error: `لا يمكن إضافة أكثر من ${maxPerFolder} فيديو في المحاضرة الواحدة` },
          { status: 400 }
        );
      }
    }

    // 1. Fetch file metadata from Google Drive
    const metadata = await getGoogleDriveFileMetadata(fileId);
    const videoTitle = (body.title || metadata.name || "معاينة درس مشفر").trim();
    const sizeBytes = Number(metadata.size) || 0;

    if (sizeBytes > 2 * 1024 * 1024 * 1024) {
      return NextResponse.json(
        { error: "حجم ملف Google Drive يتجاوز الحد الأقصى المسموح (2 جيجابايت)" },
        { status: 413 }
      );
    }

    let durationMinutes = body.durationMinutes || 0;
    if (!durationMinutes && metadata.videoMediaMetadata?.durationMillis) {
      durationMinutes = Math.round(Number(metadata.videoMediaMetadata.durationMillis) / 60000);
    }

    // 2. Select best VdoCipher account automatically with fallback
    const bestAccount = await selectBestAccountForUpload({
      estimatedSizeBytes: sizeBytes,
    });

    let apiKey = bestAccount?.apiKey || "";
    let accountId = bestAccount?.id || "";

    if (!apiKey) {
      const anyActive = await prisma.vdoCipherAccount.findFirst({
        where: { isActive: true },
        orderBy: { createdAt: "asc" },
      });
      if (anyActive?.apiKeyEnc) {
        try {
          apiKey = decryptVdoCipherSecret(anyActive.apiKeyEnc);
          accountId = anyActive.id;
        } catch (e) {
          console.error("[gdrive-import] Fallback decrypt error:", e);
        }
      }
    }

    if (!apiKey && process.env.VDOCIPHER_API_SECRET) {
      apiKey = process.env.VDOCIPHER_API_SECRET;
    }

    if (!apiKey) {
      return NextResponse.json(
        {
          error:
            "لا توجد حسابات VdoCipher نشطة أو مفاتيح API مهيأة في المنصة. يرجى مراجعة إدارة المنصة (Superadmin).",
        },
        { status: 503 }
      );
    }

    // 3. Download from Google Drive to disk FIRST.
    //
    // The previous order minted the upload ticket before downloading, then held
    // it while buffering the whole file into memory with arrayBuffer(). For the
    // multi-GB lectures this endpoint advertises that meant two failures: the
    // buffer alone could exhaust the box, and the S3 POST policy — which carries
    // a hard expiry — routinely died before the upload ever started, surfacing
    // as a bare 403. Downloading to a temp file first keeps memory flat and
    // makes the ticket as fresh as possible when the upload begins.
    const token = await getGoogleDriveAccessToken();
    const downloadUrl = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media&supportsAllDrives=true`;

    const gdriveRes = await fetch(downloadUrl, {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!gdriveRes.ok || !gdriveRes.body) {
      throw new Error(`فشل تنزيل الفيديو من Google Drive (${gdriveRes.status})`);
    }

    tempPath = path.join(os.tmpdir(), `codeup-vdocipher-${randomUUID()}.mp4`);
    await pipeline(
      Readable.fromWeb(gdriveRes.body as Parameters<typeof Readable.fromWeb>[0]),
      createWriteStream(tempPath)
    );
    const downloadedBytes = (await stat(tempPath)).size;
    if (downloadedBytes === 0) {
      throw new Error("تم تنزيل ملف فارغ من Google Drive. تأكد من صلاحيات مشاركة الملف.");
    }

    // 4. Mint the upload ticket now that the bytes are already local.
    const ticket = await requestVdoCipherUploadTicket({
      apiKey,
      title: videoTitle,
    });

    const limits = readPolicyLimits(ticket.clientPayload?.policy);
    if (limits.maxBytes && downloadedBytes > limits.maxBytes) {
      const limitGb = (limits.maxBytes / (1024 * 1024 * 1024)).toFixed(2);
      const fileGb = (downloadedBytes / (1024 * 1024 * 1024)).toFixed(2);
      throw new Error(
        `حجم الفيديو (${fileGb} جيجابايت) يتجاوز الحد المسموح به من VdoCipher لهذا الحساب (${limitGb} جيجابايت).`
      );
    }

    const videoBlob = await openAsBlob(tempPath, {
      type: metadata.mimeType || "video/mp4",
    });

    const formData = new FormData();
    const payload = ticket.clientPayload;
    if (payload) {
      for (const key of Object.keys(payload)) {
        if (key !== "uploadLink") {
          formData.append(key, payload[key]);
        }
      }
    }
    formData.append("file", videoBlob, metadata.name || "video.mp4");

    const s3Res = await fetch(ticket.uploadLink, {
      method: "POST",
      body: formData,
    });

    if (!s3Res.ok && s3Res.status !== 201 && s3Res.status !== 204) {
      const s3ErrorText = await s3Res.text();
      console.error("[VdoCipher S3 Upload Error]:", s3Res.status, s3ErrorText);
      throw new Error(
        `تعذر إتمام رفع الفيديو إلى VdoCipher (${s3Res.status}): ${s3ErrorMessage(s3ErrorText)}`
      );
    }

    const sizeFormatted =
      sizeBytes >= 1024 * 1024 * 1024
        ? `${(sizeBytes / (1024 * 1024 * 1024)).toFixed(2)} جيجابايت`
        : `${(sizeBytes / (1024 * 1024)).toFixed(1)} ميجابايت`;

    // 5. If standalone preview import (no folderId), return success immediately
    if (!folderId) {
      return NextResponse.json({
        success: true,
        isPreview: true,
        videoId: ticket.videoId,
        providerVideoId: ticket.videoId,
        title: videoTitle,
        durationMinutes,
        sizeFormatted,
        message: `تم استيراد الفيديو بنجاح من Google Drive (${sizeFormatted}) وتشفيره في VdoCipher! 🚀`,
      });
    }

    // 6. If course lecture import (with folderId), create Video & VdoCipherVideoAsset records
    const maxWatchesPerUser =
      typeof body.maxWatchesPerUser === "number" && body.maxWatchesPerUser >= 1
        ? Math.floor(body.maxWatchesPerUser)
        : await getConfigNumberClamped("default_max_watches", 1, 99);

    const count = await prisma.video.count({ where: { folderId } });
    const createdVideo = await prisma.video.create({
      data: {
        title: videoTitle,
        videoProvider: "vdocipher",
        providerVideoId: ticket.videoId,
        vdoCipherId: ticket.videoId,
        durationMinutes,
        maxWatchesPerUser,
        folderId,
        order: count,
      },
    });

    if (accountId) {
      await prisma.vdoCipherVideoAsset.create({
        data: {
          videoId: createdVideo.id,
          accountId,
          vdoCipherVideoId: ticket.videoId,
          status: "ready",
          durationSeconds: durationMinutes * 60,
          sizeBytes: BigInt(sizeBytes),
        },
      });
    }

    // Fire auto-matcher sync
    if (folder?.course?.id) {
      triggerPlanSyncForCourse(folder.course.id).catch(console.error);
    }

    return NextResponse.json({
      success: true,
      videoId: createdVideo.id,
      providerVideoId: ticket.videoId,
      title: videoTitle,
      durationMinutes,
      sizeFormatted,
      video: createdVideo,
      message: `تم استيراد الفيديو بنجاح (${sizeFormatted}) وتعيينه في VdoCipher بحماية كاملة! 🚀`,
    });
  } catch (error: unknown) {
    const errMsg = (error as Error)?.message || String(error);
    console.error("[VdoCipher Google Drive Import] Error:", errMsg);
    return NextResponse.json(
      { error: "حدث خطأ أثناء استيراد الفيديو من Google Drive. يرجى مراجعة صلاحيات الرابط والمحاولة مجدداً." },
      { status: 500 }
    );
  } finally {
    if (callerStaffId) {
      const cur = activeImportsByStaff.get(callerStaffId) || 0;
      if (cur <= 1) {
        activeImportsByStaff.delete(callerStaffId);
      } else {
        activeImportsByStaff.set(callerStaffId, cur - 1);
      }
    }
    if (tempPath) {
      await unlink(tempPath).catch(() => {
        /* the OS temp dir is swept anyway */
      });
    }
  }
}
