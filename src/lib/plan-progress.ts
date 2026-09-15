import { prisma } from "@/lib/prisma";

/**
 * Marks every plan lesson that includes this video as watched for the student
 * (when they hold an active enrollment in that plan). Shared by the manual
 * complete route and the position-route auto-complete so a video counts as
 * watched in study plans no matter which path marked it.
 */
export async function markPlanLessonsWatched(studentId: string, videoId: string): Promise<void> {
  const now = new Date();
  const planSources = await prisma.planLessonSource.findMany({
    where: { videoId },
    include: {
      planLesson: {
        select: {
          id: true,
          planId: true,
        },
      },
    },
  });

  for (const source of planSources) {
    const enrollment = await prisma.planEnrollment.findFirst({
      where: {
        studentId,
        planId: source.planLesson.planId,
        expiresAt: { gt: now },
      },
      select: { id: true },
    });

    if (enrollment) {
      await prisma.planLessonProgress.upsert({
        where: {
          enrollmentId_planLessonId: {
            enrollmentId: enrollment.id,
            planLessonId: source.planLessonId,
          },
        },
        create: {
          enrollmentId: enrollment.id,
          planLessonId: source.planLessonId,
          chosenSourceId: source.id,
          watched: true,
        },
        update: {
          chosenSourceId: source.id,
          watched: true,
        },
      });
    }
  }
}
