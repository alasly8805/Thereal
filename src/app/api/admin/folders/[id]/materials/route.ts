import { logAdminAction } from "@/lib/admin-auth";
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { isTeacherLike, actingTeacherId, hasAssistantPermission } from "@/lib/teacher-scope";
import { prisma } from "@/lib/prisma";

export async function POST(
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
      } catch (e) {}
    }
  if (!session || !isTeacherLike(session.role)) {
    return NextResponse.json({ error: "غير مصرح" }, { status: 403 });
  }
  if (!hasAssistantPermission(session, "editCourses")) {
    return NextResponse.json({ error: "المدرّس لم يمنحك صلاحية تعديل الكورسات" }, { status: 403 });
  }

  try {
    const { id: folderId } = await params;
    const { title, url, type } = await req.json();

    if (!title || !url || !type) {
      return NextResponse.json({ error: "بيانات الملحق غير مكتملة" }, { status: 400 });
    }

    if (type !== "link" && type !== "pdf") {
      return NextResponse.json({ error: "نوع الملحق غير صحيح" }, { status: 400 });
    }

    // Verify folder belongs to teacher
    const folder = await prisma.folder.findFirst({
      where: {
        id: folderId,
        course: { teacherId: actingTeacherId(session) },
      },
    });

    if (!folder) {
      return NextResponse.json({ error: "المحاضرة غير موجودة أو غير مصرح لك" }, { status: 404 });
    }

    const materialCount = await prisma.material.count({ where: { folderId } });

    const material = await prisma.material.create({
      data: {
        title: title.trim(),
        url: url.trim(),
        type,
        folderId,
        order: materialCount,
      },
    });

    return NextResponse.json({ success: true, material });
  } catch (error) {
    console.error("Create material error:", error);
    return NextResponse.json({ error: "تعذر إضافة الملحق" }, { status: 500 });
  }
}
