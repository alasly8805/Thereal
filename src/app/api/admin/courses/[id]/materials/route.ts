import { logAdminAction } from "@/lib/admin-auth";
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { isTeacherLike, actingTeacherId } from "@/lib/teacher-scope";
import { prisma } from "@/lib/prisma";

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
      } catch (e) {}
    }
  if (!session || !isTeacherLike(session.role)) {
    return NextResponse.json({ error: "غير مصرح" }, { status: 403 });
  }

  try {
    const { id: courseId } = await params;
    const { materialId } = await req.json();

    if (!materialId) {
      return NextResponse.json({ error: "معرف الملحق مطلوب" }, { status: 400 });
    }

    // Verify material belongs to course that belongs to teacher
    const material = await prisma.material.findFirst({
      where: {
        id: materialId,
        folder: {
          courseId,
          course: { teacherId: actingTeacherId(session) },
        },
      },
    });

    if (!material) {
      return NextResponse.json({ error: "الملحق غير موجود أو غير مصرح لك بحذفه" }, { status: 404 });
    }

    await prisma.material.delete({
      where: { id: materialId },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete material error:", error);
    return NextResponse.json({ error: "تعذر حذف الملحق" }, { status: 500 });
  }
}
