/**
 * Prove student 01552776600's live chain: PDF قيد المراجعة opens the next video.
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import {
  canAccessContent,
  ContentType,
  getCourseContentLocks,
  homeworkOpensNextContent,
} from "../src/lib/content-access-engine";

const STUDENT_ID = "cmtlm8vfn00a9qwhvpgnf1ima";
const HW_ID = "cmu157gy202vkqwlkhjweoelm";
const NEXT_VIDEO_ID = "cmu5fiuk601syqwli6b1eztp4";
const COURSE_ID = "cmtqhrxrh0013qw6iec0ikr89";

async function main() {
  const sub = await prisma.homeworkSubmission.findUnique({
    where: { homeworkId_studentId: { homeworkId: HW_ID, studentId: STUDENT_ID } },
    include: { review: { select: { verdict: true } }, homework: { select: { title: true, type: true } } },
  });
  if (!sub) throw new Error("submission missing");

  const opens = homeworkOpensNextContent(sub.status, {
    allowRetake: sub.allowRetake,
    reviewVerdict: sub.review?.verdict ?? null,
    hasUploadedFile: Boolean(sub.fileUrl),
  });
  const access = await canAccessContent(STUDENT_ID, {
    type: ContentType.VIDEO,
    sourceId: NEXT_VIDEO_ID,
    title: "فديو واجب المحاضرة الثانية",
  });

  const course = await prisma.course.findUnique({
    where: { id: COURSE_ID },
    include: { folders: { include: { videos: true, quizzes: true, homeworks: true, materials: true } } },
  });
  const sourceIds: string[] = [];
  for (const folder of course?.folders ?? []) {
    folder.videos.forEach((v) => sourceIds.push(v.id));
    folder.quizzes.forEach((q) => sourceIds.push(q.id));
    folder.homeworks.forEach((h) => sourceIds.push(h.id));
    folder.materials.forEach((m) => sourceIds.push(m.id));
  }
  const locks = await getCourseContentLocks(STUDENT_ID, sourceIds);
  const nextLockedBy = locks.locks.get(NEXT_VIDEO_ID);

  const report = {
    student: "علي احمد صقر / 01552776600",
    homework: sub.homework.title,
    homeworkType: sub.homework.type,
    status: sub.status,
    hasPdf: Boolean(sub.fileUrl),
    homeworkOpensNextContent: opens,
    canAccessNextVideo: access,
    chainActive: locks.active,
    nextVideoLocked: Boolean(nextLockedBy),
    nextVideoLockedBy: nextLockedBy?.title ?? null,
  };
  console.log(JSON.stringify(report, null, 2));

  if (sub.status !== "review_requested") throw new Error(`expected review_requested, got ${sub.status}`);
  if (!opens) throw new Error("homeworkOpensNextContent returned false under review");
  if (!access.allowed) throw new Error(`canAccessContent blocked next video: ${JSON.stringify(access)}`);
  if (nextLockedBy) throw new Error(`getCourseContentLocks still locks next video via ${nextLockedBy.title}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
