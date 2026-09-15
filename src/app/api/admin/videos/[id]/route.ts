import { logAdminAction } from "@/lib/admin-auth";
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { isTeacherLike, actingTeacherId, hasAssistantPermission } from "@/lib/teacher-scope";
import { prisma } from "@/lib/prisma";
import { triggerPlanSyncForCourse } from "@/lib/plan-lesson-matcher";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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
      } catch {
        /* ignore audit failures */
      }
    }
    if (!session || (!isTeacherLike(session.role) && session.role !== "superadmin")) {
      return NextResponse.json({ error: "غير مصرح" }, { status: 403 });
    }
    if (isTeacherLike(session.role) && !hasAssistantPermission(session, "editCourses")) {
      return NextResponse.json({ error: "المدرّس لم يمنحك صلاحية تعديل الكورسات" }, { status: 403 });
    }

    const { id: videoId } = await params;
    const body = await req.json() as { maxWatchesPerUser?: number; durationMinutes?: number; isFree?: boolean; publishAt?: string | null; title?: string };

    const isSuperAdmin = session.role === "superadmin";
    const video = await prisma.video.findFirst({
      where: isSuperAdmin ? { id: videoId } : { id: videoId, folder: { course: { teacherId: actingTeacherId(session) } } },
      include: { folder: { select: { courseId: true } } }
    });
    if (!video) return NextResponse.json({ error: "الفيديو غير موجود" }, { status: 404 });

    const data: {
      maxWatchesPerUser?: number;
      durationMinutes?: number;
      isFree?: boolean;
      publishAt?: Date | null;
      title?: string;
    } = {};

    if (typeof body.maxWatchesPerUser === "number" && body.maxWatchesPerUser >= 1) {
      data.maxWatchesPerUser = Math.floor(body.maxWatchesPerUser);
    }
    if (typeof body.durationMinutes === "number" && body.durationMinutes >= 0) {
      data.durationMinutes = Math.floor(body.durationMinutes);
    }
    if (typeof body.isFree === "boolean") {
      data.isFree = body.isFree;
    }
    if (body.publishAt !== undefined) {
      data.publishAt = body.publishAt ? new Date(body.publishAt) : null;
    }
    if (body.title && typeof body.title === "string" && body.title.trim()) {
      data.title = body.title.trim();
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: "لا توجد بيانات للتحديث" }, { status: 400 });
    }

    const updated = await prisma.video.update({ where: { id: videoId }, data });

    // Fire and forget auto-matcher sync if title changed
    if (data.title) {
      triggerPlanSyncForCourse(video.folder.courseId).catch(console.error);
    }

    return NextResponse.json({ video: updated });
  } catch (error) {
    console.error("Failed to patch video:", error);
    return NextResponse.json({ error: "تعذر تحديث الدرس" }, { status: 500 });
  }
}
