import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  selectBestAccountForUpload,
  requestVdoCipherUploadTicket,
  decryptVdoCipherSecret,
} from "@/lib/vdocipher-accounts";
import { isAuthorizedStaffUpload } from "@/lib/preview-auth";

function s3ErrorMessage(body: string): string {
  const message = /<Message>([\s\S]*?)<\/Message>/.exec(body)?.[1];
  const code = /<Code>([\s\S]*?)<\/Code>/.exec(body)?.[1];
  if (message && code) return `${code}: ${message}`;
  return message || code || body.slice(0, 300);
}

import { isDrmAuthorized, isDrmRequestAuthorized } from "@/lib/drm-auth";

export const maxDuration = 300; // 5 minutes for large video uploads
export const dynamic = "force-dynamic";

/**
 * Server-side VdoCipher Video Upload Endpoint:
 * Receives video file from client (within same-origin Nginx 3GB allowance),
 * requests S3 ticket, and proxies upload to VdoCipher S3 without client CORS restrictions.
 */
export async function POST(req: NextRequest) {
  try {
    const session = await getSession();

    if (!isAuthorizedStaffUpload(session)) {
      return NextResponse.json(
        { error: "تسجيل الدخول كمعلم أو مشرف مطلوب لرفع الفيديو" },
        { status: 401 }
      );
    }

    const formData = await req.formData().catch(() => null);
    if (!formData) {
      return NextResponse.json({ error: "البيانات المرسلة غير صالحة" }, { status: 400 });
    }

    const drmPass = req.headers.get("x-drm-password") || (formData.get("drmPassword") as string | null) || "";
    const isAuthorized = await isDrmRequestAuthorized(session, drmPass);
    if (!isAuthorized) {
      return NextResponse.json(
        { error: "كلمة مرور حماية DRM غير صحيحة أو مطلوبة للتشفير" },
        { status: 403 }
      );
    }

    const file = formData.get("file") as File | null;
    if (!file) {
      return NextResponse.json({ error: "لم يتم تحديد أي ملف للرفع" }, { status: 400 });
    }

    const customTitle = (formData.get("title") as string | null) || "";
    const videoTitle = customTitle.trim() || file.name.replace(/\.[^/.]+$/, "") || "معاينة درس مشفر";
    const folderId = formData.get("folderId") as string | null;

    let folder: { id: string; course?: { id: string; teacherId: string } | null } | null = null;
    if (folderId) {
      if (!session || !["teacher", "admin", "superadmin"].includes(session.role || "")) {
        return NextResponse.json(
          { error: "تسجيل الدخول كمعلم أو مشرف مطلوب لإضافة فيديو لمحاضرة" },
          { status: 403 }
        );
      }

      folder = await prisma.folder.findFirst({
        where:
          session.role === "superadmin" || session.role === "admin"
            ? { id: folderId }
            : { id: folderId, course: { teacherId: session.id } },
        include: { course: { select: { id: true, teacherId: true } } },
      });

      if (!folder) {
        return NextResponse.json(
          { error: "المحاضرة غير موجودة أو لا تملك صلاحية إضافتها" },
          { status: 404 }
        );
      }
    }

    // 1. Select the best VdoCipher account
    const bestAccount = await selectBestAccountForUpload({
      estimatedSizeBytes: file.size,
    });

    let apiKey = bestAccount?.apiKey || "";
    let accountId = bestAccount?.id || "";

    if (!apiKey) {
      const anyAccount = await prisma.vdoCipherAccount.findFirst({
        where: { isActive: true },
        orderBy: { createdAt: "asc" },
      });
      if (anyAccount?.apiKeyEnc) {
        try {
          apiKey = decryptVdoCipherSecret(anyAccount.apiKeyEnc);
          accountId = anyAccount.id;
        } catch (e) {
          console.error("[server-upload] Failed to decrypt fallback key:", e);
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
            "لا توجد حسابات VdoCipher نشطة أو مفاتيح API مهيأة في المنصة. يرجى إضافة حساب من لوحة التحكم العامة (Superadmin).",
        },
        { status: 503 }
      );
    }

    // 2. Request upload ticket from VdoCipher
    const ticket = await requestVdoCipherUploadTicket({
      apiKey,
      title: videoTitle,
    });

    // 3. Construct S3 multipart payload and upload from server
    const s3FormData = new FormData();
    const payload = ticket.clientPayload;
    if (payload) {
      for (const key of Object.keys(payload)) {
        if (key !== "uploadLink") {
          s3FormData.append(key, payload[key]);
        }
      }
    }
    s3FormData.append("file", file, file.name || "video.mp4");

    const s3Res = await fetch(ticket.uploadLink, {
      method: "POST",
      body: s3FormData,
    });

    if (!s3Res.ok && s3Res.status !== 201 && s3Res.status !== 204) {
      const s3ErrorText = await s3Res.text();
      console.error("[VdoCipher S3 Server Upload Error]:", s3Res.status, s3ErrorText);
      return NextResponse.json(
        {
          error: `فشل نقل الفيديو إلى خوادم VdoCipher (${s3Res.status}): ${s3ErrorMessage(s3ErrorText)}`,
        },
        { status: 502 }
      );
    }

    const providerVideoId = ticket.videoId;

    // 4. If folderId provided (course upload), create database records
    if (folderId && session) {
      try {
        const count = await prisma.video.count({ where: { folderId } });
        const video = await prisma.video.create({
          data: {
            title: videoTitle,
            videoProvider: "vdocipher",
            providerVideoId,
            vdoCipherId: providerVideoId,
            durationMinutes: 0,
            maxWatchesPerUser: 3,
            folderId,
            order: count,
          },
        });

        if (accountId) {
          await prisma.vdoCipherVideoAsset.create({
            data: {
              videoId: video.id,
              accountId,
              vdoCipherVideoId: providerVideoId,
              status: "ready",
              sizeBytes: BigInt(file.size),
            },
          });
        }
      } catch (dbErr) {
        console.warn("[server-upload] Database record creation notice:", dbErr);
      }
    }

    return NextResponse.json({
      success: true,
      providerVideoId,
      videoId: providerVideoId,
      title: videoTitle,
      sizeBytes: file.size,
      message: "تم رفع الفيديو إلى VdoCipher وتشفيره بنجاح! 🚀",
    });
  } catch (error: unknown) {
    const errMsg = (error as Error)?.message || String(error);
    console.error("[Teacher VdoCipher Server Upload] Error:", errMsg);
    return NextResponse.json(
      { error: "حدث خطأ غير متوقع أثناء معالجة رفع الفيديو إلى VdoCipher" },
      { status: 500 }
    );
  }
}
