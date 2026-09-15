import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { isTeacherLike, actingTeacherId } from "@/lib/teacher-scope";
import { prisma } from "@/lib/prisma";
import { triggerPlanSyncForCourse } from "@/lib/plan-lesson-matcher";

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session || (!isTeacherLike(session.role) && session.role !== "superadmin")) {
      return NextResponse.json({ error: "غير مصرح لك بالوصول" }, { status: 403 });
    }

    const body = (await req.json().catch(() => ({}))) as {
      videoId?: string;
      durationMinutes?: number;
      sizeBytes?: number;
    };

    const videoId = body.videoId;
    if (!videoId) {
      return NextResponse.json({ error: "معرف الفيديو مطلوب" }, { status: 400 });
    }

    // Verify video and ownership
    const video = await prisma.video.findFirst({
      where:
        session.role === "superadmin"
          ? { id: videoId }
          : { id: videoId, folder: { course: { teacherId: actingTeacherId(session) } } },
      include: { folder: { include: { course: { select: { id: true } } } } },
    });

    if (!video) {
      return NextResponse.json({ error: "الفيديو غير موجود أو غير مصرح" }, { status: 404 });
    }

    const updateData: any = {};
    if (typeof body.durationMinutes === "number" && body.durationMinutes > 0) {
      updateData.durationMinutes = Math.floor(body.durationMinutes);
    }

    const updatedVideo = await prisma.video.update({
      where: { id: videoId },
      data: updateData,
    });

    // Mark multi-account assets as ready
    await prisma.vdoCipherVideoAsset.updateMany({
      where: { videoId },
      data: {
        status: "ready",
        ...(body.sizeBytes ? { sizeBytes: BigInt(body.sizeBytes) } : {}),
        ...(body.durationMinutes ? { durationSeconds: Math.floor(body.durationMinutes * 60) } : {}),
      },
    });

    // Fire auto-matcher sync in background
    triggerPlanSyncForCourse(video.folder.course.id).catch(console.error);

    return NextResponse.json({
      success: true,
      video: updatedVideo,
      message: "تم اكتمال رفع الفيديو وتجهيزه بنجاح",
    });
  } catch (error: any) {
    console.error("[Teacher VdoCipher Complete Upload] Error:", error.message || error);
    return NextResponse.json(
      { error: error.message || "تعذر تأكيد اكتمال الرفع" },
      { status: 500 }
    );
  }
}
