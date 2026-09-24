import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { isTeacherLike, actingTeacherId, hasAssistantPermission } from "@/lib/teacher-scope";
import { prisma } from "@/lib/prisma";
import { FolderContentType } from "@/generated/prisma";
import { removeFolderContent } from "@/lib/folder-content-order";

/** GET /api/admin/homework/[id] — teacher views a single homework */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session || !isTeacherLike(session.role))
    return NextResponse.json({ error: "غير مصرح" }, { status: 403 });
  if (!hasAssistantPermission(session, "manageHomework") && !hasAssistantPermission(session, "gradeHomework")) {
    return NextResponse.json({ error: "المدرّس لم يمنحك صلاحية الواجبات" }, { status: 403 });
  }

  const { id } = await params;
  const hw = await prisma.homework.findUnique({
    where: { id },
    include: {
      questions: { orderBy: { order: "asc" } },
      submissions: { select: { id: true, status: true, studentId: true } },
      video: { select: { id: true, title: true } },
    },
  });
  if (!hw || hw.teacherId !== actingTeacherId(session))
    return NextResponse.json({ error: "غير موجود" }, { status: 404 });

  return NextResponse.json({ homework: hw });
}

/** DELETE /api/admin/homework/[id] */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session || !isTeacherLike(session.role))
    return NextResponse.json({ error: "غير مصرح" }, { status: 403 });
  if (!hasAssistantPermission(session, "manageHomework"))
    return NextResponse.json({ error: "المدرّس لم يمنحك صلاحية إدارة الواجبات" }, { status: 403 });

  const { id } = await params;
  const hw = await prisma.homework.findUnique({ where: { id }, select: { teacherId: true } });
  if (!hw || hw.teacherId !== actingTeacherId(session))
    return NextResponse.json({ error: "غير موجود" }, { status: 404 });

  await prisma.homework.delete({ where: { id } });
  await removeFolderContent(FolderContentType.HOMEWORK, id);
  return NextResponse.json({ ok: true });
}
