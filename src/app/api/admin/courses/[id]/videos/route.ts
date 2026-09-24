import { logAdminAction } from "@/lib/admin-auth";
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { isTeacherLike, actingTeacherId, hasAssistantPermission } from "@/lib/teacher-scope";
import { prisma } from "@/lib/prisma";
import { FolderContentType } from "@/generated/prisma";
import { removeFolderContent } from "@/lib/folder-content-order";

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession();

    if (session && session.role === "superadmin") {
      try {
        await logAdminAction({
          adminId: session.id,
          adminName: session.name,
          action: "SUPERADMIN_ACTION",
          targetType: "API_ROUTE",
          targetId: req.nextUrl ? req.nextUrl.pathname : req.url,
          targetName: req.method,
        });
      } catch (e) {}
    }
    if (!session || !isTeacherLike(session.role)) {
      return NextResponse.json({ error: "غير مصرح" }, { status: 403 });
    }
    if (!hasAssistantPermission(session, "editCourses")) {
      return NextResponse.json({ error: "المدرّس لم يمنحك صلاحية تعديل الكورسات" }, { status: 403 });
    }

    const { id: courseId } = await params;
    const { videoId } = await req.json();

    if (!videoId) {
      return NextResponse.json({ error: "معرف الفيديو مطلوب" }, { status: 400 });
    }

    // Verify course belongs to this teacher
    const course = await prisma.course.findFirst({
      where: { id: courseId, teacherId: actingTeacherId(session) },
    });

    if (!course) {
      return NextResponse.json({ error: "الكورس غير موجود" }, { status: 404 });
    }

    // Verify video belongs to a folder in this course
    const video = await prisma.video.findFirst({
      where: {
        id: videoId,
        folder: { courseId },
      },
    });

    if (!video) {
      return NextResponse.json({ error: "الفيديو غير موجود" }, { status: 404 });
    }

    // Delete related records then the video
    await prisma.videoWatchSession.deleteMany({ where: { videoId } });
    await prisma.progress.deleteMany({ where: { videoId } });
    await prisma.video.delete({ where: { id: videoId } });
    await removeFolderContent(FolderContentType.VIDEO, videoId);

    return NextResponse.json({ success: true, message: "تم حذف الفيديو بنجاح" });
  } catch (error) {
    console.error("Failed to delete video:", error);
    return NextResponse.json({ error: "تعذر حذف الفيديو" }, { status: 500 });
  }
}