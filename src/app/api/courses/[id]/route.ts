/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { getConfigNumberClamped } from "@/lib/config";
import { canBypassPayment } from "@/lib/demo";
import { checkCourseEnrollment } from "@/lib/authorization";
import { getCourseContentLocks } from "@/lib/content-access-engine";
import { denyCenterIdOffHost, filterFoldersForGrant, getCenterPassGrant } from "@/lib/center-pass";
import { assembleFolderContents } from "@/lib/folder-content-order";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "غير مصرح" }, { status: 401 });

    const hostDenied = denyCenterIdOffHost(req, session.accountMode);
    if (hostDenied) return hostDenied;

    const { id } = await params;
    const role = session.role;
    let isTeacherPreview = false;

    if (role === "teacher") {
      const ownsCourse = await prisma.course.count({
        where: { id, teacherId: session.id },
      });
      if (!ownsCourse) {
        const hasAccess = await prisma.accessCode.findFirst({
          where: { courseId: id, studentId: session.id },
        });
        const courseRow = await prisma.course.findUnique({
          where: { id },
          select: { isPaid: true, price: true },
        });
        const isFree = !courseRow?.isPaid || (courseRow?.price ?? 0) === 0;

        if (!hasAccess && !isFree) {
          return NextResponse.json(
            {
              error: "أنت مُعلّم — يمكنك معاينة كورساتك الخاصة أو الكورسات المسجل بها فقط.",
              code: "TEACHER_NOT_ALLOWED",
            },
            { status: 403 }
          );
        }
      }
      isTeacherPreview = true;
    }
    if (role === "staff") {
      return NextResponse.json(
        { error: "هذه الصفحة مخصّصة للطلاب فقط.", code: "STAFF_NOT_ALLOWED" },
        { status: 403 }
      );
    }
    let hasPlanAccess = false;
    let allowedVideoIds: string[] = [];

    if (role === "student") {
      const access = await checkCourseEnrollment(session.id, id, role);
      if (!access) {
        const enrolledPlans = await prisma.planEnrollment.findMany({
          where: {
            studentId: session.id,
            expiresAt: { gt: new Date() },
          },
          include: {
            plan: {
              include: {
                lessons: {
                  include: {
                    sources: {
                      include: {
                        video: true
                      }
                    }
                  }
                }
              }
            }
          }
        });

        const videoIds: string[] = [];
        for (const enroll of enrolledPlans) {
          for (const lesson of enroll.plan.lessons) {
            for (const src of lesson.sources) {
              if (src.videoId) {
                videoIds.push(src.videoId);
              }
            }
          }
        }

        if (videoIds.length > 0) {
          const matchingVideosCount = await prisma.video.count({
            where: {
              id: { in: videoIds },
              folder: { courseId: id }
            }
          });
          if (matchingVideosCount > 0) {
            hasPlanAccess = true;
            allowedVideoIds = videoIds;
          }
        }

        if (!hasPlanAccess) {
          const isTester = session.accountMode === "TESTER";
          if (!isTester) {
            const targetCourseRow = await prisma.course.findUnique({
              where: { id },
              select: { teacherId: true, bookingKind: true, bookingTerm: true },
            });
            const canBypass = await canBypassPayment(role, targetCourseRow?.teacherId, session.accountMode);
            if (!canBypass) {
              let isRenewalRequired = false;
              let renewalMonth: number | null = null;

              if (targetCourseRow?.teacherId) {
                const subs = await prisma.teacherSubscription.findMany({
                  where: { studentId: session.id, teacherId: targetCourseRow.teacherId },
                  select: { planType: true, termNumbers: true },
                });
                if (subs.length > 0) {
                  const { parseCoursePlacements } = await import("@/lib/teacher-terms");
                  const placements = parseCoursePlacements(targetCourseRow);
                  const monthPlacements = placements.filter((p) => p.kind === "month");
                  if (monthPlacements.length > 0) {
                    const ownedMonths = Array.from(
                      new Set(subs.flatMap((s) => (s.termNumbers || []).filter((n) => typeof n === "number" && n > 0)))
                    );
                    if (ownedMonths.length === 0 && subs.some((s) => s.planType === "monthly")) {
                      ownedMonths.push(1);
                    }
                    const targetPlacement = monthPlacements.find((p) => !ownedMonths.includes(p.term)) || monthPlacements[0];
                    if (targetPlacement) {
                      isRenewalRequired = true;
                      renewalMonth = targetPlacement.term || 2;
                    }
                  }
                }
              }

              console.log("[center-video-access]", JSON.stringify({
                event: "course_learn_denied",
                phone: session.phone,
                studentId: session.id,
                courseId: id,
                code: "NOT_ENROLLED",
                isRenewalRequired,
                renewalMonth,
              }));

              return NextResponse.json(
                {
                  error: isRenewalRequired
                    ? `هذا الكورس متاح لمشتركي باقة الشهر ${renewalMonth || 2}. يرجى تجديد الاشتراك للوصول إلى محتواه.`
                    : "لا يوجد صلاحية للوصول. فعّل كود الكورس أو تواصل مع المعلم.",
                  code: "NOT_ENROLLED",
                  isRenewalRequired,
                  renewalMonth,
                  teacherId: targetCourseRow?.teacherId,
                },
                { status: 403 }
              );
            }
          }
        }
      }
    }

    const isTesterUser = session.accountMode === "TESTER";
    const canSeeDemo = role === "superadmin" || isTesterUser;

    const course = await prisma.course.findFirst({
      where: {
        id,
        teacher: canSeeDemo ? { isDeleted: false } : { isDeleted: false, isDemo: false },
      },
      include: {
        teacher: { select: { id: true, name: true } },
        folders: {
          orderBy: { order: "asc" },
          include: {
            videos: {
              orderBy: { order: "asc" },
              include: {
                progress: {
                  where: { studentId: session.id },
                  select: { watched: true, watchedAt: true, lastPositionSeconds: true },
                },
                watchSessions: {
                  where: { studentId: session.id, usedWatchSlot: true },
                  select: { id: true },
                },
              },
            },
            materials: { orderBy: { order: "asc" } },
            quizzes: {
              select: ({
                id: true,
                title: true,
                timeLimitMinutes: true,
                closeAt: true,
                enableAutoClose: true,
                questions: { orderBy: { order: "asc" } },
                results: {
                  where: { studentId: session.id, completedAt: { not: null } },
                  select: { score: true, totalQ: true, completedAt: true, allowRetake: true },
                  take: 1,
                },
              } as any),
            },
            homeworks: {
              where: role === "student" && session.accountMode !== "CENTER_ID" ? { isPublished: true } : undefined,
              orderBy: { createdAt: "asc" },
              select: {
                id: true,
                title: true,
                description: true,
                type: true,
                linkUrl: true,
                dueAt: true,
                closeAt: true,
                enableAutoClose: true,
                timeLimitMinutes: true,
                isPublished: true,
                videoId: true,
                allowedFileTypes: true,
                submissions: {
                  where: { studentId: session.id },
                  select: {
                    id: true,
                    status: true,
                    score: true,
                    totalQ: true,
                    completedAt: true,
                    allowRetake: true,
                    review: { select: { verdict: true, reviewedAt: true } },
                  },
                  take: 1,
                },
              },
            },
          },
        },
      },
    });

    if (!course) return NextResponse.json({ error: "الكورس غير موجود" }, { status: 404 });

    // Extra views granted by a teacher or the support panel must appear in the
    // student UI. Without this, the learn page only subtracts used watches from
    // Video.maxWatchesPerUser and treats a support grant as if it never happened.
    const videoIdsForGrants = course.folders.flatMap((folder) => folder.videos.map((v) => v.id));
    const grants =
      role === "student" && videoIdsForGrants.length
        ? await prisma.videoViewRequest.groupBy({
            by: ["videoId"],
            where: {
              studentId: session.id,
              videoId: { in: videoIdsForGrants },
              status: "approved",
            },
            _sum: { grantedViews: true },
          })
        : [];
    const grantedByVideo = new Map(
      grants.map((g) => [g.videoId, Math.max(0, g._sum.grantedViews ?? 0)] as const)
    );

    const foldersToMap = (role === "student" && hasPlanAccess)
      ? course.folders
          .map((folder) => {
            const videos = folder.videos.filter((v) => allowedVideoIds.includes(v.id));
            if (videos.length === 0) return null;
            return {
              ...folder,
              videos,
            };
          })
          .filter(Boolean) as any[]
      : course.folders;

    const centerGrant = role === "student" ? await getCenterPassGrant(session.id) : null;
    const grantedFolders = centerGrant?.isActive
      ? filterFoldersForGrant(foldersToMap as any[], centerGrant)
      : foldersToMap;

    // Teacher-panel content chain (مسار وفتح المحتوى): when the course has
    // prerequisite edges, evaluate them against the student's progress so the
    // client locks exactly what the chain locks — not whatever happens to be
    // the previous row in display order. chainActive=false means no edges
    // exist and the client keeps its legacy previous-video behaviour.
    // Center-ID bundles skip the chain: superadmin already chose the set.
    let chainActive = false;
    let chainLocks = new Map<string, { id: string; title: string; type: string }>();
    let timedClosed = new Set<string>();
    if (role === "student" && !centerGrant) {
      try {
        const allSourceIds: string[] = [];
        for (const folder of grantedFolders as any[]) {
          folder.videos?.forEach((v: any) => allSourceIds.push(v.id));
          folder.quizzes?.forEach((q: any) => allSourceIds.push(q.id));
          folder.homeworks?.forEach((h: any) => allSourceIds.push(h.id));
          folder.materials?.forEach((m: any) => allSourceIds.push(m.id));
        }
        const result = await getCourseContentLocks(session.id, allSourceIds);
        chainActive = result.active;
        chainLocks = result.locks as typeof chainLocks;
        timedClosed = result.timedClosed;
      } catch (chainErr) {
        console.error("[courses/[id]] chain lock evaluation error:", chainErr);
      }
    }

    const grantedFolderIds = (grantedFolders as any[]).map((folder) => folder.id).filter(Boolean);
    const contentOrderRows = grantedFolderIds.length
      ? await prisma.folderContent.findMany({
          where: { folderId: { in: grantedFolderIds } },
          orderBy: { order: "asc" },
        })
      : [];
    const ordersByFolder = new Map<string, typeof contentOrderRows>();
    for (const row of contentOrderRows) {
      const list = ordersByFolder.get(row.folderId) ?? [];
      list.push(row);
      ordersByFolder.set(row.folderId, list);
    }

    const safeCourse = {
      ...course,
      homeworkUrl: course.homeworkUrl,
      maxWatchCount: course.maxWatchCount,
      folders: (grantedFolders as any[]).map((folder: any) => {
        const videos = (folder.videos || []).map((video: any) => ({
          ...video,
          vdoCipherId: undefined,
          providerVideoId: undefined,
          usedWatches: video.watchSessions?.length || 0,
          grantedViews: grantedByVideo.get(video.id) ?? 0,
          watchSessions: undefined,
          chainLocked: chainActive ? chainLocks.has(video.id) : false,
          chainLockedBy: chainActive ? (chainLocks.get(video.id)?.title ?? null) : null,
        }));
        const quizzes = (folder.quizzes || []).map((quiz: any) => {
          const q = quiz as unknown as {
            id: string;
            title: string;
            timeLimitMinutes: number;
            questions?: Array<{ correctAnswer?: string; [key: string]: unknown }>;
          };
          return {
            id: q.id,
            title: q.title,
            timeLimitMinutes: q.timeLimitMinutes,
            questions: (q.questions ?? []).map((question) => ({ ...question, correctAnswer: undefined })),
            chainLocked: chainActive ? chainLocks.has(q.id) : false,
            chainLockedBy: chainActive ? (chainLocks.get(q.id)?.title ?? null) : null,
            timedClosed: timedClosed.has(q.id),
            myResult: (quiz as { results?: Array<{ score: number; totalQ: number; completedAt: Date | null; allowRetake?: boolean }> }).results?.[0] ?? null,
          };
        });
        const homeworks = (folder.homeworks || []).map((hw: any) => ({
          id: hw.id,
          title: hw.title,
          description: hw.description,
          type: hw.type,
          linkUrl: hw.linkUrl,
          dueAt: hw.dueAt,
          timeLimitMinutes: hw.timeLimitMinutes,
          isPublished: hw.isPublished,
          videoId: hw.videoId,
          allowedFileTypes: hw.allowedFileTypes,
          mySubmission: hw.submissions?.[0] || null,
          chainLocked: chainActive ? chainLocks.has(hw.id) : false,
          chainLockedBy: chainActive ? (chainLocks.get(hw.id)?.title ?? null) : null,
          timedClosed: timedClosed.has(hw.id),
        }));
        const materials = (folder.materials || []).map((m: any) => ({
          ...m,
          chainLocked: chainActive ? chainLocks.has(m.id) : false,
          chainLockedBy: chainActive ? (chainLocks.get(m.id)?.title ?? null) : null,
        }));
        const contents = assembleFolderContents({
          orders: ordersByFolder.get(folder.id) ?? [],
          videos,
          homeworks,
          quizzes,
          materials,
        });
        return { ...folder, videos, quizzes, homeworks, materials, contents };
      }),
    };

    // Mark-complete gate (% watched) is superadmin-configurable (was 80).
    const markCompleteThreshold = await getConfigNumberClamped("mark_complete_threshold", 1, 100);
    return NextResponse.json({ course: safeCourse, markCompleteThreshold, isTeacherPreview, chainActive });
  } catch (error) {
    console.error("[courses/[id]] error:", error);
    return NextResponse.json({ error: "حدث خطأ داخلي" }, { status: 500 });
  }
}
