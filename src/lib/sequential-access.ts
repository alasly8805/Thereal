/**
 * Sequential lesson gating.
 *
 * Course.sequentialAccess has existed in the schema and in the teacher panel
 * ("إجباري بالترتيب") since early on, but nothing on the server ever read it —
 * a teacher could switch it on and students still jumped straight to any
 * lesson. This module makes the control real.
 *
 * Because the flag has been a no-op while defaulting to true in the panel, most
 * existing courses almost certainly have it set. Turning enforcement on
 * globally would lock students out of lessons they legitimately reached before.
 * So enforcement is additionally gated on the platform config
 * `sequential_access_enforced`, which defaults to false: flip it once you have
 * checked how many courses carry the flag.
 */

import { getConfigBool } from "@/lib/config";
import { prisma } from "@/lib/prisma";
import { isScheduledLocked } from "@/lib/publish";

export interface SequentialLock {
  locked: true;
  /** The lesson the student has to finish first. */
  requiredVideoId: string;
  requiredVideoTitle: string;
}

/**
 * Returns a lock when the student has not yet watched the lesson immediately
 * preceding this one, or null when they may proceed.
 *
 * Only the immediately preceding *published* lesson is required, not the whole
 * backlog: a student who joins mid-course, or whose earlier progress predates
 * this check, is not permanently stranded.
 */
export async function checkSequentialAccess(
  studentId: string,
  videoId: string
): Promise<SequentialLock | null> {
  if (!(await getConfigBool("sequential_access_enforced"))) return null;

  const student = await prisma.user.findUnique({
    where: { id: studentId },
    select: { accountMode: true },
  });
  if (student?.accountMode === "CENTER_ID") return null;

  const video = await prisma.video.findUnique({
    where: { id: videoId },
    select: {
      id: true,
      order: true,
      folder: {
        select: {
          id: true,
          order: true,
          courseId: true,
          course: { select: { sequentialAccess: true } },
        },
      },
    },
  });
  if (!video || !video.folder.course.sequentialAccess) return null;

  const siblings = await prisma.video.findMany({
    where: { folder: { courseId: video.folder.courseId } },
    select: {
      id: true,
      title: true,
      order: true,
      publishAt: true,
      folder: { select: { order: true, publishAt: true } },
    },
  });

  // Course order is folder order first, then video order inside the folder.
  const ordered = siblings
    .filter((v) => !isScheduledLocked(v.folder.publishAt, v.publishAt))
    .sort((a, b) => a.folder.order - b.folder.order || a.order - b.order || a.id.localeCompare(b.id));

  const index = ordered.findIndex((v) => v.id === videoId);
  if (index <= 0) return null; // first lesson, or this one is not yet published

  const previous = ordered[index - 1];
  const progress = await prisma.progress.findUnique({
    where: { studentId_videoId: { studentId, videoId: previous.id } },
    select: { watched: true },
  });
  if (progress?.watched) return null;

  return {
    locked: true,
    requiredVideoId: previous.id,
    requiredVideoTitle: previous.title,
  };
}
