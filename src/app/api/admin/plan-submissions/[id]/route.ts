import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { isTeacherLike, actingTeacherId } from "@/lib/teacher-scope";
import { prisma } from "@/lib/prisma";
import { notifyProjectGraded } from "@/lib/notifications";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || (session.role !== "superadmin" && !isTeacherLike(session.role))) {
    return NextResponse.json({ error: "غير مصرح" }, { status: 403 });
  }

  const { id: submissionId } = await params;
  
  try {
    const { status, grade, feedback } = await req.json();

    if (status !== "graded" && status !== "failed") {
      return NextResponse.json({ error: "حالة غير صالحة" }, { status: 400 });
    }

    const submission = await prisma.planProjectSubmission.findUnique({
      where: { id: submissionId },
      include: {
        enrollment: {
          select: {
            progress: {
              select: {
                planLessonId: true,
                chosenSourceId: true,
              }
            }
          }
        }
      }
    });

    if (!submission) {
      return NextResponse.json({ error: "التقييم غير موجود" }, { status: 404 });
    }

    // Teacher ownership validation
    if (isTeacherLike(session.role)) {
      const progress = submission.enrollment.progress.find(p => p.planLessonId === submission.planLessonId);
      if (progress?.chosenSourceId) {
        const source = await prisma.planLessonSource.findUnique({
          where: { id: progress.chosenSourceId },
          select: { teacherId: true }
        });
        if (source?.teacherId !== actingTeacherId(session)) {
          return NextResponse.json({ error: "غير مصرح لك بتقييم هذا المشروع" }, { status: 403 });
        }
      } else {
        // Fallback: check if the teacher has any source for this lesson
        const source = await prisma.planLessonSource.findFirst({
          where: { planLessonId: submission.planLessonId, teacherId: actingTeacherId(session) },
          select: { id: true }
        });
        if (!source) {
          return NextResponse.json({ error: "غير مصرح لك بتقييم هذا المشروع" }, { status: 403 });
        }
      }
    }

    const passed = grade >= 50;

    await prisma.$transaction(async (tx: any) => {
      await tx.planProjectSubmission.update({
        where: { id: submissionId },
        data: {
          status,
          grade: status === "graded" ? Number(grade) : null,
          feedback,
          gradedAt: new Date()
        }
      });

      await tx.planLessonProgress.upsert({
        where: {
          enrollmentId_planLessonId: {
            enrollmentId: submission.enrollmentId,
            planLessonId: submission.planLessonId
          }
        },
        create: {
          enrollmentId: submission.enrollmentId,
          planLessonId: submission.planLessonId,
          projectPassed: passed,
          projectGrade: status === "graded" ? Number(grade) : null
        },
        update: {
          projectPassed: passed,
          projectGrade: status === "graded" ? Number(grade) : null
        }
      });
    });

    const lesson = await prisma.planLesson.findUnique({
      where: { id: submission.planLessonId },
      select: { title: true }
    });

    await notifyProjectGraded(submission.studentId, lesson?.title ?? "مشروع عملي", grade || 0);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Grading patch error:", error);
    return NextResponse.json({ error: "حدث خطأ أثناء التقييم" }, { status: 500 });
  }
}
