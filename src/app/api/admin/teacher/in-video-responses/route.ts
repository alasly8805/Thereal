import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { isTeacherLike, actingTeacherId } from "@/lib/teacher-scope";
import { prisma } from "@/lib/prisma";
import { logAdminAction } from "@/lib/admin-auth";

/**
 * Teacher API for managing and grading in-video student responses (in-video answers).
 *
 * GET   — List student responses for teacher's courses/videos.
 * PATCH — Approve / Disapprove a response and attach a teacher reply message.
 */

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session || (!isTeacherLike(session.role) && session.role !== "superadmin")) {
    return NextResponse.json({ error: "غير مصرح" }, { status: 403 });
  }

  const { searchParams } = req.nextUrl;
  const statusParam = searchParams.get("status"); // "PENDING" | "APPROVED" | "DISAPPROVED" | "all"
  const videoId = searchParams.get("videoId");
  const courseId = searchParams.get("courseId");

  const whereClause: any = {
    ...(session.role !== "superadmin"
      ? { videoQuestion: { video: { folder: { course: { teacherId: actingTeacherId(session) } } } } }
      : {}),
  };

  if (statusParam && statusParam !== "all") {
    whereClause.status = statusParam;
  }
  if (videoId) {
    whereClause.videoQuestion = { ...whereClause.videoQuestion, videoId };
  } else if (courseId) {
    whereClause.videoQuestion = {
      ...whereClause.videoQuestion,
      video: { folder: { courseId } },
    };
  }

  const responses = await prisma.videoQuestionResponse.findMany({
    where: whereClause,
    orderBy: { createdAt: "desc" },
    take: 100,
    include: {
      student: {
        select: { id: true, name: true, email: true, phone: true },
      },
      videoQuestion: {
        select: {
          id: true,
          questionText: true,
          questionType: true,
          triggerSecond: true,
          video: {
            select: {
              id: true,
              title: true,
              folder: {
                select: {
                  course: {
                    select: { id: true, title: true },
                  },
                },
              },
            },
          },
        },
      },
    },
  });

  return NextResponse.json({ responses });
}

export async function PATCH(req: NextRequest) {
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
    } catch {}
  }
  if (!session || (!isTeacherLike(session.role) && session.role !== "superadmin")) {
    return NextResponse.json({ error: "غير مصرح" }, { status: 403 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    responseId?: string;
    status?: "APPROVED" | "DISAPPROVED";
    teacherReply?: string;
  };

  const { responseId, status, teacherReply } = body;

  if (!responseId || !status || !["APPROVED", "DISAPPROVED"].includes(status)) {
    return NextResponse.json(
      { error: "بيانات غير صالحة: responseId و status مطلوبان" },
      { status: 400 }
    );
  }

  // Verify ownership
  const response = await prisma.videoQuestionResponse.findFirst({
    where: {
      id: responseId,
      ...(session.role !== "superadmin"
        ? { videoQuestion: { video: { folder: { course: { teacherId: actingTeacherId(session) } } } } }
        : {}),
    },
    include: {
      student: { select: { id: true, name: true } },
      videoQuestion: {
        select: {
          questionText: true,
          video: { select: { id: true, title: true, folder: { select: { courseId: true } } } },
        },
      },
    },
  });

  if (!response) {
    return NextResponse.json({ error: "الإجابة غير موجودة" }, { status: 404 });
  }

  const updated = await prisma.videoQuestionResponse.update({
    where: { id: responseId },
    data: {
      status,
      isCorrect: status === "APPROVED",
      teacherReply: teacherReply?.trim() || null,
      reviewedAt: new Date(),
      reviewedById: session.id,
    },
  });

  // Notify the student
  try {
    const isApproved = status === "APPROVED";
    await prisma.notification.create({
      data: {
        userId: response.studentId,
        type: "grade_resolved",
        title: isApproved ? "✅ تم قبول إجابتك المقالية" : "❌ تم مراجعة إجابتك المقالية",
        body: `قام المعلم بمراجعة إجابتك على سؤال الفيديو (${response.videoQuestion.video.title}). ${
          teacherReply?.trim() ? `ملاحظات المعلم: "${teacherReply.trim()}"` : ""
        }`,
        link: `/courses/${response.videoQuestion.video.folder.courseId}/learn?videoId=${response.videoQuestion.video.id}`,
      },
    });
  } catch (err) {
    console.error("Failed to create student notification:", err);
  }

  return NextResponse.json({ updated });
}
