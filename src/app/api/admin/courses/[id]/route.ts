import { logAdminAction } from "@/lib/admin-auth";
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma";
import { invalidateCourseCache } from "@/lib/cache";

const MAX_TITLE_LENGTH = 100;
const MAX_DESCRIPTION_LENGTH = 1000;
const MAX_URL_LENGTH = 5000000;
const MIN_TITLE_LENGTH = 1;

type CoursePatchInput = {
  title?: string;
  subject?: string;
  educationalStage?: string;
  description?: string | null;
  thumbnailUrl?: string | null;
  contactPhone?: string | null;
  maxWatchCount?: number | null;
  homeworkUrl?: string | null;
  sequentialAccess?: boolean;
  enableWatchedButton?: boolean;
  deliveryMode?: string;
};

function validateCourseData(data: CoursePatchInput): { valid: boolean; error?: string } {
  if (data.title !== undefined) {
    if (typeof data.title !== "string" || data.title.trim().length < MIN_TITLE_LENGTH) {
      return { valid: false, error: "العنوان مطلوب" };
    }
    if (data.title.length > MAX_TITLE_LENGTH) {
      return { valid: false, error: `العنوان لا يمكن أن يزيد عن ${MAX_TITLE_LENGTH} حرف` };
    }
  }

  if (data.description !== undefined && data.description !== null) {
    if (typeof data.description !== "string") {
      return { valid: false, error: "الوصف يجب أن يكون نصاً" };
    }
    if (data.description.length > MAX_DESCRIPTION_LENGTH) {
      return { valid: false, error: `الوصف لا يمكن أن يزيد عن ${MAX_DESCRIPTION_LENGTH} حرف` };
    }
  }

  if (data.thumbnailUrl !== undefined && data.thumbnailUrl !== null) {
    if (typeof data.thumbnailUrl !== "string") {
      return { valid: false, error: "رابط الصورة يجب أن يكون نصاً" };
    }
    if (data.thumbnailUrl.length > MAX_URL_LENGTH) {
      return { valid: false, error: `رابط الصورة طويل جداً` };
    }
    if (data.thumbnailUrl.trim().length > 0 && !isValidUrl(data.thumbnailUrl)) {
      return { valid: false, error: "رابط الصورة غير صحيح" };
    }
  }

  return { valid: true };
}

function isValidUrl(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

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
    if (!session || session.role !== "teacher") {
      return NextResponse.json({ error: "غير مصرح" }, { status: 403 });
    }

    const { id } = await params;

    const course = await prisma.course.findFirst({
      where: { id, teacherId: session.id },
    });

    if (!course) {
      return NextResponse.json({ error: "الكورس غير موجود" }, { status: 404 });
    }

    // Delete course cascade (folders, videos, quizzes, access codes, progress records)
    await prisma.course.delete({
      where: { id },
    });
    invalidateCourseCache(id);

    return NextResponse.json({ success: true, message: "تم حذف الكورس بنجاح" });
  } catch (error) {
    console.error("Failed to delete course:", error);
    return NextResponse.json({ error: "تعذر حذف الكورس" }, { status: 500 });
  }
}

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
      } catch (e) {}
    }
    if (!session || session.role !== "teacher") {
      return NextResponse.json({ error: "غير مصرح" }, { status: 403 });
    }

    const { id } = await params;

    const course = await prisma.course.findFirst({
      where: { id, teacherId: session.id },
    });

    if (!course) {
      return NextResponse.json({ error: "الكورس غير موجود" }, { status: 404 });
    }

    const data = (await req.json()) as CoursePatchInput;

    // Validate course data
    const validation = validateCourseData(data);
    if (!validation.valid) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    const updateData: Prisma.CourseUpdateInput = {};

    if (data.title !== undefined) {
      updateData.title = data.title.trim();
    }
    if (data.subject !== undefined) {
      updateData.subject = data.subject ? data.subject.trim() : undefined;
    }
    if (data.educationalStage !== undefined) {
      updateData.educationalStage = data.educationalStage ? data.educationalStage.trim() : undefined;
    }
    if (data.description !== undefined) {
      updateData.description = data.description ? data.description.trim() : null;
    }
    if (data.thumbnailUrl !== undefined) {
      updateData.thumbnailUrl = data.thumbnailUrl ? data.thumbnailUrl.trim() : null;
    }
    if (data.contactPhone !== undefined) {
      updateData.contactPhone = data.contactPhone ? data.contactPhone.trim() : null;
    }
    if (data.maxWatchCount !== undefined) {
      if (data.maxWatchCount === null) {
        updateData.maxWatchCount = 3; // reset to default
      } else if (typeof data.maxWatchCount === "number" && data.maxWatchCount >= 1 && data.maxWatchCount <= 99) {
        updateData.maxWatchCount = data.maxWatchCount;
      } else {
        return NextResponse.json({ error: "عدد المشاهدات يجب أن يكون بين 1 و 99" }, { status: 400 });
      }
    }
    if (data.homeworkUrl !== undefined) {
      if (data.homeworkUrl !== null && data.homeworkUrl.trim().length > 0 && !isValidUrl(data.homeworkUrl)) {
        return NextResponse.json({ error: "رابط الواجب غير صحيح" }, { status: 400 });
      }
      updateData.homeworkUrl = data.homeworkUrl ? data.homeworkUrl.trim() : null;
    }
    if (data.sequentialAccess !== undefined) {
      updateData.sequentialAccess = !!data.sequentialAccess;
    }
    if (data.enableWatchedButton !== undefined) {
      updateData.enableWatchedButton = !!data.enableWatchedButton;
    }
    if (data.deliveryMode !== undefined) {
      const mode = typeof data.deliveryMode === "string" ? data.deliveryMode.toUpperCase().trim() : "ONLINE";
      if (["ONLINE", "CENTER", "BOTH"].includes(mode)) {
        updateData.deliveryMode = mode;
      }
    }

    const updated = await prisma.course.update({
      where: { id },
      data: updateData,
    });
    invalidateCourseCache(id);

    return NextResponse.json({ course: updated });
  } catch (error) {
    console.error("Failed to update course:", error);
    return NextResponse.json({ error: "تعذر تحديث الكورس" }, { status: 500 });
  }
}
