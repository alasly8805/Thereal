/**
 * Read-only production diagnostic for one student's PDF homework chain.
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import {
  canAccessContent,
  ContentType,
  getCourseContentLocks,
  homeworkOpensNextContent,
} from "../src/lib/content-access-engine";

const PHONE_HINT = process.argv[2] || "01552776600";

function phoneVariants(raw: string): string[] {
  const digits = raw.replace(/\D/g, "");
  const local = digits.startsWith("20") ? `0${digits.slice(2)}` : digits.startsWith("0") ? digits : `0${digits}`;
  const e164 = local.startsWith("0") ? `+20${local.slice(1)}` : `+${digits}`;
  const e164NoPlus = e164.replace("+", "");
  return [...new Set([raw, local, e164, e164NoPlus, digits])];
}

async function main() {
  const variants = phoneVariants(PHONE_HINT);
  const student = await prisma.user.findFirst({
    where: {
      role: "student",
      OR: [
        { phone: { in: variants } },
        { parentPhone: { in: variants } },
        { email: { contains: PHONE_HINT } },
        { name: { contains: PHONE_HINT } },
      ],
    },
    select: {
      id: true,
      name: true,
      phone: true,
      email: true,
      role: true,
    },
  });

  if (!student) {
    const users = await prisma.user.findMany({
      where: {
        OR: [
          { phone: { contains: "1552776600" } },
          { phone: { contains: "01552776600" } },
          { email: { contains: "1552776600" } },
        ],
      },
      select: { id: true, name: true, phone: true, email: true, role: true },
      take: 20,
    });
    console.log(JSON.stringify({ found: false, variants, users }, null, 2));
    return;
  }

  const submissions = await prisma.homeworkSubmission.findMany({
    where: { studentId: student.id },
    include: {
      review: { select: { verdict: true, reviewedAt: true, note: true } },
        homework: {
          select: {
            id: true,
            title: true,
            type: true,
            courseId: true,
            folderId: true,
            folder: {
              select: {
                id: true,
                name: true,
                courseId: true,
                course: { select: { id: true, title: true, sequentialAccess: true } },
              },
            },
          },
        },
    },
    orderBy: { completedAt: "desc" },
  });

  const report: Record<string, unknown> = {
    student,
    submissionCount: submissions.length,
    submissions: [] as unknown[],
  };

  for (const sub of submissions) {
    const opens = homeworkOpensNextContent(sub.status, {
      allowRetake: sub.allowRetake,
      reviewVerdict: sub.review?.verdict ?? null,
      hasUploadedFile: Boolean(sub.fileUrl),
    });
    const contentItem = await prisma.contentItem.findFirst({
      where: { sourceId: sub.homeworkId, type: { in: [ContentType.HOMEWORK, ContentType.EXAM] } },
    });
    const progress = contentItem
      ? await prisma.studentContentProgress.findUnique({
          where: { studentId_contentId: { studentId: student.id, contentId: contentItem.id } },
        })
      : null;
    const dependents = contentItem
      ? await prisma.contentPrerequisite.findMany({
          where: { prerequisiteContentId: contentItem.id },
          include: { targetContent: true },
        })
      : [];

    const dependentAccess = [];
    for (const edge of dependents) {
      const loc = {
        type: edge.targetContent.type,
        sourceId: edge.targetContent.sourceId,
        title: edge.targetContent.title,
      };
      const access = await canAccessContent(student.id, loc);
      dependentAccess.push({
        title: edge.targetContent.title,
        type: edge.targetContent.type,
        sourceId: edge.targetContent.sourceId,
        requiredStatus: edge.requiredStatus,
        minScore: edge.minScore,
        canAccess: access,
      });
    }

    const courseId = sub.homework.folder?.courseId || sub.homework.courseId;
    let courseLocks: unknown = null;
    if (courseId) {
      const course = await prisma.course.findUnique({
        where: { id: courseId },
        include: {
          folders: {
            include: { videos: true, quizzes: true, homeworks: true, materials: true },
          },
        },
      });
      if (course) {
        const sourceIds: string[] = [];
        for (const folder of course.folders) {
          folder.videos.forEach((v) => sourceIds.push(v.id));
          folder.quizzes.forEach((q) => sourceIds.push(q.id));
          folder.homeworks.forEach((h) => sourceIds.push(h.id));
          folder.materials.forEach((m) => sourceIds.push(m.id));
        }
        const result = await getCourseContentLocks(student.id, sourceIds);
        const nextLocked = [...result.locks.entries()].map(([sourceId, item]) => ({
          sourceId,
          lockedBy: item.title,
          lockedByType: item.type,
        }));
        courseLocks = {
          courseTitle: course.title,
          chainActive: result.active,
          lockCount: result.locks.size,
          locksInvolvingThisHomework: nextLocked.filter(
            (row) => row.lockedBy === sub.homework.title || row.sourceId === sub.homeworkId
          ),
          sampleLocks: nextLocked.slice(0, 30),
        };
      }
    }

    (report.submissions as unknown[]).push({
      homeworkTitle: sub.homework.title,
      homeworkType: sub.homework.type,
      courseTitle: sub.homework.folder?.course?.title,
      status: sub.status,
      allowRetake: sub.allowRetake,
      fileUrl: sub.fileUrl,
      fileName: sub.fileName,
      score: sub.score,
      reviewVerdict: sub.review?.verdict ?? null,
      homeworkOpensNextContent: opens,
      contentItemId: contentItem?.id ?? null,
      studentContentProgress: progress
        ? { status: progress.status, score: progress.score, completedAt: progress.completedAt }
        : null,
      dependents: dependentAccess,
      courseLocks,
    });
  }

  console.log(JSON.stringify(report, null, 2));
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
