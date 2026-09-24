import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { denyCenterIdOffHost, getCenterPassGrant } from "@/lib/center-pass";

export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "يجب تسجيل الدخول أولاً" }, { status: 401 });
    }

    const hostDenied = denyCenterIdOffHost(req, session.accountMode);
    if (hostDenied) return hostDenied;

    const grant = await getCenterPassGrant(session.id);
    if (!grant || session.accountMode !== "CENTER_ID") {
      return NextResponse.json({ pass: null, courses: [] });
    }

    if (!grant.isActive) {
      return NextResponse.json({ error: "هذا الرقم التعريفي موقوف.", code: "CENTER_PASS_INACTIVE" }, { status: 403 });
    }

    const pass = await prisma.centerPass.findUnique({
      where: { id: grant.passId },
      select: {
        publicId: true,
        title: true,
        items: {
          orderBy: [{ courseId: "asc" }, { sortOrder: "asc" }],
          select: { kind: true, sourceId: true, courseId: true, folderId: true, title: true },
        },
      },
    });
    if (!pass) {
      return NextResponse.json({ pass: null, courses: [] });
    }

    const courseIds = [...grant.courseIds];
    const courses = courseIds.length
      ? await prisma.course.findMany({
          where: { id: { in: courseIds } },
          select: {
            id: true,
            title: true,
            subject: true,
            thumbnailUrl: true,
            educationalStage: true,
            deliveryMode: true,
            teacher: {
              select: {
                id: true,
                name: true,
                teacherProfile: { select: { displayName: true, photoUrl: true } },
              },
            },
          },
        })
      : [];

    const counts = new Map<string, { videos: number; homeworks: number; quizzes: number; materials: number }>();
    for (const item of pass.items) {
      const row = counts.get(item.courseId) || { videos: 0, homeworks: 0, quizzes: 0, materials: 0 };
      if (item.kind === "VIDEO") row.videos += 1;
      else if (item.kind === "HOMEWORK") row.homeworks += 1;
      else if (item.kind === "QUIZ") row.quizzes += 1;
      else if (item.kind === "MATERIAL") row.materials += 1;
      counts.set(item.courseId, row);
    }

    return NextResponse.json({
      pass: {
        publicId: pass.publicId,
        title: pass.title,
        studentName: session.name,
      },
      courses: courses.map((course) => ({
        ...course,
        teacherName: course.teacher.teacherProfile?.displayName || course.teacher.name,
        counts: counts.get(course.id) || { videos: 0, homeworks: 0, quizzes: 0, materials: 0 },
      })),
    });
  } catch (err) {
    console.error("GET /api/center/my-bundle error:", err);
    return NextResponse.json({ error: "تعذر تحميل الباقة المخصصة" }, { status: 500 });
  }
}
