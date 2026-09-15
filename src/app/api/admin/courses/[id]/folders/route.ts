import { logAdminAction } from "@/lib/admin-auth";
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { isTeacherLike, actingTeacherId, hasAssistantPermission } from "@/lib/teacher-scope";
import { prisma } from "@/lib/prisma";
import { parsePublishAt } from "@/lib/publish";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || !isTeacherLike(session.role)) return NextResponse.json({ error: "غير مصرح" }, { status: 403 });
  const { id } = await params;
  const folders = await prisma.folder.findMany({
    where: { courseId: id },
    include: {
      videos: { orderBy: { order: "asc" } },
      quizzes: { include: { questions: { orderBy: { order: "asc" } } } },
      materials: { orderBy: { order: "asc" } },
      homeworks: { orderBy: { createdAt: "desc" }, include: { questions: { orderBy: { order: "asc" } } } },
    },
    orderBy: { order: "asc" },
  });
  return NextResponse.json({ folders });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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
  if (!session || !isTeacherLike(session.role)) return NextResponse.json({ error: "غير مصرح" }, { status: 403 });
  if (!hasAssistantPermission(session, "editCourses")) {
    return NextResponse.json({ error: "المدرّس لم يمنحك صلاحية تعديل الكورسات" }, { status: 403 });
  }
  const { id: courseId } = await params;
  const { name, publishAt, color } = (await req.json()) as { name?: string; publishAt?: string | null; color?: string };
  if (!name) return NextResponse.json({ error: "اسم المحاضرة مطلوب" }, { status: 400 });
  const count = await prisma.folder.count({ where: { courseId } });
  const folder = await prisma.folder.create({
    data: { name, courseId, order: count, color: color || "blue", publishAt: parsePublishAt(publishAt) ?? null },
  });
  return NextResponse.json({ folder }, { status: 201 });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || !isTeacherLike(session.role)) return NextResponse.json({ error: "غير مصرح" }, { status: 403 });
  if (!hasAssistantPermission(session, "editCourses")) {
    return NextResponse.json({ error: "المدرّس لم يمنحك صلاحية تعديل الكورسات" }, { status: 403 });
  }
  const { id: courseId } = await params;
  const body = (await req.json()) as {
    folderId?: string;
    name?: string;
    color?: string;
    order?: number;
    publishAt?: string | null;
    price?: number;
    isPurchasable?: boolean;
  };
  const { folderId, name, color, order, publishAt, price, isPurchasable } = body;
  if (!folderId) return NextResponse.json({ error: "معرف المحاضرة مطلوب" }, { status: 400 });

  const existing = await prisma.folder.findFirst({
    where: { id: folderId, course: { id: courseId, teacherId: actingTeacherId(session) } },
  });
  if (!existing) return NextResponse.json({ error: "المحاضرة غير موجودة أو غير مصرح بتعديلها" }, { status: 404 });

  const updated = await prisma.folder.update({
    where: { id: folderId },
    data: {
      ...(name ? { name } : {}),
      ...(color ? { color } : {}),
      ...(typeof order === "number" ? { order } : {}),
      ...(typeof price === "number" ? { price } : {}),
      ...(typeof isPurchasable === "boolean" ? { isPurchasable } : {}),
      ...(publishAt !== undefined ? { publishAt: parsePublishAt(publishAt) ?? null } : {}),
    },
  });
  return NextResponse.json({ success: true, folder: updated });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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
    } catch { /* ignore */ }
  }

  if (!session || !isTeacherLike(session.role)) {
    return NextResponse.json({ error: "غير مصرح" }, { status: 403 });
  }
  if (!hasAssistantPermission(session, "editCourses")) {
    return NextResponse.json({ error: "المدرّس لم يمنحك صلاحية تعديل الكورسات" }, { status: 403 });
  }

  try {
    const { id: courseId } = await params;
    const { folderId } = (await req.json()) as { folderId?: string };

    if (!folderId) {
      return NextResponse.json({ error: "معرف المحاضرة (folderId) مطلوب" }, { status: 400 });
    }

    // Verify course belongs to teacher
    const course = await prisma.course.findFirst({
      where: { id: courseId, teacherId: actingTeacherId(session) },
    });

    if (!course) {
      return NextResponse.json({ error: "الكورس غير موجود أو غير مصرح" }, { status: 404 });
    }

    // Verify folder belongs to this course
    const folder = await prisma.folder.findFirst({
      where: { id: folderId, courseId },
    });

    if (!folder) {
      return NextResponse.json({ error: "المحاضرة غير موجودة في هذا الكورس" }, { status: 404 });
    }

    // Delete folder
    await prisma.folder.delete({
      where: { id: folderId },
    });

    return NextResponse.json({ success: true, message: "تم حذف المحاضرة بنجاح" });
  } catch (error) {
    console.error("Failed to delete folder:", error);
    return NextResponse.json({ error: "تعذر حذف المحاضرة" }, { status: 500 });
  }
}
