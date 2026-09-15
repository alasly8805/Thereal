import { logAdminAction } from "@/lib/admin-auth";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { invalidateCourseCache } from "@/lib/cache";
import { actingTeacherId, hasAssistantPermission, isTeacherLike } from "@/lib/teacher-scope";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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
  if (!session) return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
  if (session.role !== "superadmin" && !isTeacherLike(session.role)) {
    return NextResponse.json({ error: "غير مصرح" }, { status: 403 });
  }
  if (isTeacherLike(session.role) && !hasAssistantPermission(session, "editCourses")) {
    return NextResponse.json({ error: "المدرّس لم يمنحك صلاحية تعديل الكورسات" }, { status: 403 });
  }

  const { id } = await params;

  const course = await prisma.course.findUnique({ where: { id }, select: { teacherId: true } });
  if (!course) return NextResponse.json({ error: "الكورس غير موجود" }, { status: 404 });

  if (session.role !== "superadmin" && course.teacherId !== actingTeacherId(session)) {
    return NextResponse.json({ error: "لا يمكنك تعديل هذا الكورس" }, { status: 403 });
  }

  const body = await req.json() as {
    isPaid?: boolean;
    price?: number | null;
    discountPercent?: number | null;
    discountExpiresAt?: string | null;
    allowDirectInstall?: boolean;
  };

  const isPaid = body.isPaid ?? false;
  const price = isPaid ? (body.price ?? null) : null;
  const discountPercent =
    body.discountPercent != null && body.discountPercent > 0 && body.discountPercent <= 100
      ? body.discountPercent
      : null;
  const discountExpiresAt =
    body.discountExpiresAt ? new Date(body.discountExpiresAt) : null;
  // Direct install only makes sense for free courses; auto-disable for paid
  const allowDirectInstall = !isPaid ? (body.allowDirectInstall ?? false) : false;

  const updated = await prisma.course.update({
    where: { id },
    data: { isPaid, price, discountPercent, discountExpiresAt, allowDirectInstall },
    select: { id: true, isPaid: true, price: true, discountPercent: true, discountExpiresAt: true, allowDirectInstall: true },
  });
  invalidateCourseCache(id);

  return NextResponse.json({ course: updated });
}
