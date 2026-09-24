import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session || session.role !== "superadmin") {
      return NextResponse.json({ error: "غير مصرح" }, { status: 403 });
    }

    const teacherId = req.nextUrl.searchParams.get("teacherId")?.trim() || "";
    if (!teacherId) {
      return NextResponse.json({ error: "اختر معلماً أولاً" }, { status: 400 });
    }

    const teacher = await prisma.user.findFirst({
      where: { id: teacherId, role: "teacher", isDeleted: false },
      select: { id: true, name: true, teacherProfile: { select: { displayName: true } } },
    });
    if (!teacher) {
      return NextResponse.json({ error: "المعلم غير موجود" }, { status: 404 });
    }

    const courses = await prisma.course.findMany({
      where: { teacherId, teacher: { isDeleted: false } },
      select: {
        id: true,
        title: true,
        subject: true,
        deliveryMode: true,
        educationalStage: true,
        folders: {
          orderBy: { order: "asc" },
          select: {
            id: true,
            name: true,
            order: true,
            videos: { orderBy: { order: "asc" }, select: { id: true, title: true, durationMinutes: true } },
            quizzes: { orderBy: { createdAt: "asc" }, select: { id: true, title: true } },
            homeworks: { orderBy: { createdAt: "asc" }, select: { id: true, title: true, type: true, isPublished: true } },
            materials: { orderBy: { order: "asc" }, select: { id: true, title: true, type: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const looseHomeworks = await prisma.homework.findMany({
      where: { teacherId, folderId: null, courseId: { not: null } },
      select: { id: true, title: true, type: true, isPublished: true, courseId: true },
      orderBy: { createdAt: "asc" },
    });

    const looseByCourse = new Map<string, typeof looseHomeworks>();
    for (const hw of looseHomeworks) {
      if (!hw.courseId) continue;
      const list = looseByCourse.get(hw.courseId) || [];
      list.push(hw);
      looseByCourse.set(hw.courseId, list);
    }

    return NextResponse.json({
      teacher: {
        id: teacher.id,
        name: teacher.teacherProfile?.displayName || teacher.name,
      },
      courses: courses.map((course) => ({
        ...course,
        looseHomeworks: (looseByCourse.get(course.id) || []).map((hw) => ({
          id: hw.id,
          title: hw.title,
          type: hw.type,
          isPublished: hw.isPublished,
        })),
      })),
    });
  } catch (err) {
    console.error("GET center-passes/catalog error:", err);
    return NextResponse.json({ error: "تعذر تحميل كورسات المعلم" }, { status: 500 });
  }
}
