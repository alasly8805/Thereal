import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { isTeacherLike, actingTeacherId } from "@/lib/teacher-scope";
import { prisma } from "@/lib/prisma";

/** GET /api/admin/homework/[id]/submissions — teacher views all submissions for a homework */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session || !isTeacherLike(session.role))
    return NextResponse.json({ error: "غير مصرح" }, { status: 403 });

  const { id: homeworkId } = await params;

  const hw = await prisma.homework.findUnique({
    where: { id: homeworkId },
    select: { teacherId: true, title: true },
  });
  if (!hw || hw.teacherId !== actingTeacherId(session))
    return NextResponse.json({ error: "غير موجود" }, { status: 404 });

  const submissions = await prisma.homeworkSubmission.findMany({
    where: { homeworkId },
    include: {
      student: { select: { id: true, name: true, email: true } },
      review: true,
    },
    orderBy: { completedAt: "desc" },
  });

  return NextResponse.json({ submissions, homeworkTitle: hw.title });
}
