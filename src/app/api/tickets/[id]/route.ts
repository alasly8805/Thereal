import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { isTeacherLike, actingTeacherId, hasAssistantPermission } from "@/lib/teacher-scope";
import { prisma } from "@/lib/prisma";

// PATCH — update ticket status / resolution (teacher/admin)
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session || (!isTeacherLike(session.role) && session.role !== "superadmin" && session.role !== "admin")) {
      return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
    }
    if (isTeacherLike(session.role) && !hasAssistantPermission(session, "manageTickets")) {
      return NextResponse.json({ error: "المدرّس لم يمنحك صلاحية التذاكر" }, { status: 403 });
    }

    const { id } = await params;
    const { status, resolution, assignedTo } = await req.json();

    const ticket = await prisma.supportTicket.findUnique({
      where: { id },
      include: { course: { select: { teacherId: true } } },
    });
    if (!ticket) return NextResponse.json({ error: "غير موجود" }, { status: 404 });

    // Teachers can only manage tickets for their own courses
    if (isTeacherLike(session.role)) {
      if (!ticket.course || ticket.course.teacherId !== actingTeacherId(session)) {
        return NextResponse.json({ error: "ليست لديك صلاحية" }, { status: 403 });
      }
    }

    const updated = await prisma.supportTicket.update({
      where: { id },
      data: {
        ...(status ? { status } : {}),
        ...(resolution ? { resolution } : {}),
        ...(assignedTo !== undefined ? { assignedTo } : {}),
      },
    });

    return NextResponse.json({ ticket: updated, message: "تم تحديث التذكرة" });
  } catch (err) {
    console.error("Ticket PATCH error:", err);
    return NextResponse.json({ error: "حدث خطأ" }, { status: 500 });
  }
}
