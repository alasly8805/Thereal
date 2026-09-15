import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { isTeacherLike, actingTeacherId } from "@/lib/teacher-scope";
import { prisma } from "@/lib/prisma";
import { ContentProgressStatus, ContentType } from "@/generated/prisma";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: courseId } = await params;
    const session = await getSession();

    if (!session || (!isTeacherLike(session.role) && session.role !== "superadmin")) {
      return NextResponse.json({ error: "غير مصرح لك بالوصول" }, { status: 401 });
    }

    const course = await prisma.course.findFirst({
      where: session.role === "superadmin" ? { id: courseId } : { id: courseId, teacherId: actingTeacherId(session) },
      include: {
        folders: {
          orderBy: { order: "asc" },
          include: {
            videos: { orderBy: { order: "asc" } },
            quizzes: { orderBy: { createdAt: "asc" } },
            homeworks: { orderBy: { createdAt: "asc" } },
            materials: { orderBy: { order: "asc" } },
          },
        },
      },
    });

    if (!course) {
      return NextResponse.json({ error: "الكورس غير موجود" }, { status: 404 });
    }

    const folderList: Array<{ id: string; name: string; order: number }> = [];
    const sourceItems: Array<{
      type: ContentType;
      sourceId: string;
      title: string;
      folderId: string;
      folderName: string;
      initialOrder: number;
    }> = [];

    let runningOrder = 0;

    course.folders.forEach((folder) => {
      folderList.push({ id: folder.id, name: folder.name, order: folder.order });

      folder.videos.forEach((v) => {
        sourceItems.push({
          type: ContentType.VIDEO,
          sourceId: v.id,
          title: v.title,
          folderId: folder.id,
          folderName: folder.name,
          initialOrder: runningOrder++,
        });
      });
      folder.homeworks.forEach((h) => {
        sourceItems.push({
          type: ContentType.HOMEWORK,
          sourceId: h.id,
          title: h.title,
          folderId: folder.id,
          folderName: folder.name,
          initialOrder: runningOrder++,
        });
      });
      folder.quizzes.forEach((q) => {
        sourceItems.push({
          type: ContentType.QUIZ,
          sourceId: q.id,
          title: q.title,
          folderId: folder.id,
          folderName: folder.name,
          initialOrder: runningOrder++,
        });
      });
      folder.materials.forEach((m) => {
        sourceItems.push({
          type: ContentType.PDF,
          sourceId: m.id,
          title: m.title,
          folderId: folder.id,
          folderName: folder.name,
          initialOrder: runningOrder++,
        });
      });
    });

    // Root homeworks
    const rootHomeworks = await prisma.homework.findMany({
      where: { courseId: course.id, folderId: null },
      orderBy: { createdAt: "asc" },
    });
    if (rootHomeworks.length > 0) {
      folderList.push({ id: "course-root", name: "الواجبات العامة", order: 999999 });
      rootHomeworks.forEach((h) => {
        sourceItems.push({
          type: ContentType.HOMEWORK,
          sourceId: h.id,
          title: h.title,
          folderId: "course-root",
          folderName: "الواجبات العامة",
          initialOrder: runningOrder++,
        });
      });
    }

    // Auto-ensure every single course item has a ContentItem row in database
    const enrichedItems: Array<{
      id: string;
      type: ContentType;
      sourceId: string;
      title: string;
      folderId: string;
      folderName: string;
      initialOrder: number;
    }> = [];

    for (const sItem of sourceItems) {
      const existing = await prisma.contentItem.findUnique({
        where: {
          type_sourceId: {
            type: sItem.type,
            sourceId: sItem.sourceId,
          },
        },
      });

      if (existing) {
        if (existing.title !== sItem.title) {
          await prisma.contentItem.update({
            where: { id: existing.id },
            data: { title: sItem.title },
          }).catch(() => {});
        }
        enrichedItems.push({
          id: existing.id,
          type: existing.type,
          sourceId: existing.sourceId,
          title: sItem.title,
          folderId: sItem.folderId,
          folderName: sItem.folderName,
          initialOrder: sItem.initialOrder,
        });
      } else {
        const created = await prisma.contentItem.create({
          data: {
            type: sItem.type,
            sourceId: sItem.sourceId,
            title: sItem.title,
          },
        });
        enrichedItems.push({
          id: created.id,
          type: created.type,
          sourceId: created.sourceId,
          title: created.title,
          folderId: sItem.folderId,
          folderName: sItem.folderName,
          initialOrder: sItem.initialOrder,
        });
      }
    }

    const itemIds = enrichedItems.map((i) => i.id);

    // Find all prerequisites between these items
    const prerequisites = await prisma.contentPrerequisite.findMany({
      where: {
        targetContentId: { in: itemIds },
      },
      include: {
        prerequisiteContent: true,
      },
    });

    // Topological Sort per folder using prerequisites graph to preserve exact saved sequence
    const finalSortedItems: typeof enrichedItems = [];
    const itemsGroupedByFolder = new Map<string, typeof enrichedItems>();

    enrichedItems.forEach((it) => {
      const fid = it.folderId;
      const list = itemsGroupedByFolder.get(fid) ?? [];
      list.push(it);
      itemsGroupedByFolder.set(fid, list);
    });

    // Sort items within each folder based on prerequisite chain
    for (const [, fItems] of itemsGroupedByFolder.entries()) {
      const itemMap = new Map(fItems.map((i) => [i.id, i]));
      const inDegree = new Map<string, number>();
      const adj = new Map<string, string[]>();

      fItems.forEach((i) => {
        inDegree.set(i.id, 0);
        adj.set(i.id, []);
      });

      prerequisites.forEach((p) => {
        if (itemMap.has(p.targetContentId) && itemMap.has(p.prerequisiteContentId)) {
          inDegree.set(p.targetContentId, (inDegree.get(p.targetContentId) || 0) + 1);
          adj.get(p.prerequisiteContentId)?.push(p.targetContentId);
        }
      });

      const queue: typeof fItems = [];
      fItems
        .sort((a, b) => a.initialOrder - b.initialOrder)
        .forEach((i) => {
          if (inDegree.get(i.id) === 0) queue.push(i);
        });

      const folderSorted: typeof fItems = [];
      while (queue.length > 0) {
        const curr = queue.shift()!;
        folderSorted.push(curr);

        for (const nextId of adj.get(curr.id) || []) {
          const deg = (inDegree.get(nextId) || 1) - 1;
          inDegree.set(nextId, deg);
          if (deg === 0) {
            const nextItem = itemMap.get(nextId);
            if (nextItem) queue.push(nextItem);
          }
        }
      }

      // Add any remaining items
      fItems.forEach((i) => {
        if (!folderSorted.some((s) => s.id === i.id)) {
          folderSorted.push(i);
        }
      });

      finalSortedItems.push(...folderSorted);
    }

    // Courses saved before contentFlowMode existed fall back to the old
    // derivation: no sequential flag + no edges => free, otherwise per-folder.
    const contentFlowMode =
      course.contentFlowMode ??
      (!course.sequentialAccess && prerequisites.length === 0 ? "free" : "per_folder");

    return NextResponse.json({
      sequentialAccess: course.sequentialAccess,
      contentFlowMode,
      folders: folderList,
      items: finalSortedItems,
      prerequisites: prerequisites.map((p) => ({
        id: p.id,
        targetContentId: p.targetContentId,
        prerequisiteContentId: p.prerequisiteContentId,
        prerequisiteTitle: p.prerequisiteContent.title,
        prerequisiteType: p.prerequisiteContent.type,
        requiredStatus: p.requiredStatus,
        minScore: p.minScore,
      })),
    });
  } catch (error) {
    console.error("Prerequisites GET error:", error);
    return NextResponse.json({ error: "حدث خطأ أثناء جلب مسار المحتوى" }, { status: 500 });
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: courseId } = await params;
    const session = await getSession();

    if (!session || (!isTeacherLike(session.role) && session.role !== "superadmin")) {
      return NextResponse.json({ error: "غير مصرح لك بالوصول" }, { status: 401 });
    }

    const course = await prisma.course.findFirst({
      where: session.role === "superadmin" ? { id: courseId } : { id: courseId, teacherId: actingTeacherId(session) },
      include: {
        folders: {
          include: {
            videos: true,
            quizzes: true,
            homeworks: true,
            materials: true,
          },
        },
      },
    });

    if (!course) {
      return NextResponse.json({ error: "الكورس غير موجود" }, { status: 404 });
    }

    const body = await req.json();
    const {
      mode,
      sequentialAccess,
      folderChains,
      orderedItemIds,
      customEdges,
    } = body as {
      mode?: "free" | "per_folder" | "course" | "custom";
      sequentialAccess?: boolean;
      folderChains?: Record<string, string[]>;
      orderedItemIds?: string[];
      customEdges?: Array<{
        targetContentId: string;
        prerequisiteContentId: string;
        requiredStatus?: ContentProgressStatus;
        minScore?: number | null;
      }>;
    };

    const targetSequentialAccess = mode === "free" ? false : (sequentialAccess ?? true);

    await prisma.course.update({
      where: { id: courseId },
      data: {
        sequentialAccess: targetSequentialAccess,
        // Persist the chosen unlock style so the admin panel can restore it
        // after reload (previously only the boolean + edges were stored, so
        // "custom" could never be told apart from "per_folder").
        contentFlowMode: mode ?? (targetSequentialAccess ? "per_folder" : "free"),
      },
    });

    // Gather all sourceIds for this course
    const allSourceIds: string[] = [];
    course.folders.forEach((f) => {
      f.videos.forEach((v) => allSourceIds.push(v.id));
      f.quizzes.forEach((q) => allSourceIds.push(q.id));
      f.homeworks.forEach((h) => allSourceIds.push(h.id));
      f.materials.forEach((m) => allSourceIds.push(m.id));
    });

    const courseItems = await prisma.contentItem.findMany({
      where: { sourceId: { in: allSourceIds } },
    });
    const allCourseItemIds = courseItems.map((i) => i.id);
    const itemMapById = new Map(courseItems.map((i) => [i.id, i]));

    // If free mode, delete all prerequisites
    if (mode === "free" || (!targetSequentialAccess && (!customEdges || customEdges.length === 0))) {
      if (allCourseItemIds.length > 0) {
        await prisma.contentPrerequisite.deleteMany({
          where: { targetContentId: { in: allCourseItemIds } },
        });
      }
      return NextResponse.json({
        success: true,
        message: "تم حفظ التغييرات وتفعيل المشاهدة الحرة بنجاح 🔓",
        edgesCount: 0,
      });
    }

    // Build the edges list
    const newEdges: Array<{
      targetContentId: string;
      prerequisiteContentId: string;
      requiredStatus: ContentProgressStatus;
      minScore: number | null;
    }> = [];

    if (mode === "per_folder" && folderChains) {
      for (const [, itemIds] of Object.entries(folderChains)) {
        if (Array.isArray(itemIds)) {
          // Update orders in DB for videos and materials to preserve position
          let videoOrder = 0;
          let matOrder = 0;
          for (const itemId of itemIds) {
            const item = itemMapById.get(itemId);
            if (item?.type === ContentType.VIDEO) {
              await prisma.video.update({ where: { id: item.sourceId }, data: { order: videoOrder++ } }).catch(() => {});
            } else if (item?.type === ContentType.PDF) {
              await prisma.material.update({ where: { id: item.sourceId }, data: { order: matOrder++ } }).catch(() => {});
            }
          }

          // Chain within this folder: item[i] requires item[i-1]
          if (itemIds.length > 1) {
            for (let i = 1; i < itemIds.length; i++) {
              const prevId = itemIds[i - 1];
              const currId = itemIds[i];
              if (prevId && currId && prevId !== currId) {
                newEdges.push({
                  targetContentId: currId,
                  prerequisiteContentId: prevId,
                  requiredStatus: ContentProgressStatus.COMPLETED,
                  minScore: null,
                });
              }
            }
          }
        }
      }
    } else if (orderedItemIds && Array.isArray(orderedItemIds) && orderedItemIds.length > 1) {
      let videoOrder = 0;
      let matOrder = 0;
      for (const itemId of orderedItemIds) {
        const item = itemMapById.get(itemId);
        if (item?.type === ContentType.VIDEO) {
          await prisma.video.update({ where: { id: item.sourceId }, data: { order: videoOrder++ } }).catch(() => {});
        } else if (item?.type === ContentType.PDF) {
          await prisma.material.update({ where: { id: item.sourceId }, data: { order: matOrder++ } }).catch(() => {});
        }
      }

      for (let i = 1; i < orderedItemIds.length; i++) {
        const prevId = orderedItemIds[i - 1];
        const currId = orderedItemIds[i];
        if (prevId && currId && prevId !== currId) {
          newEdges.push({
            targetContentId: currId,
            prerequisiteContentId: prevId,
            requiredStatus: ContentProgressStatus.COMPLETED,
            minScore: null,
          });
        }
      }
    } else if (customEdges && Array.isArray(customEdges)) {
      for (const edge of customEdges) {
        if (edge.targetContentId && edge.prerequisiteContentId && edge.targetContentId !== edge.prerequisiteContentId) {
          newEdges.push({
            targetContentId: edge.targetContentId,
            prerequisiteContentId: edge.prerequisiteContentId,
            requiredStatus: edge.requiredStatus || ContentProgressStatus.COMPLETED,
            minScore: edge.minScore ?? null,
          });
        }
      }
    }

    // Atomic transaction for deleting old edges and inserting new ones
    await prisma.$transaction(async (tx) => {
      if (allCourseItemIds.length > 0) {
        await tx.contentPrerequisite.deleteMany({
          where: { targetContentId: { in: allCourseItemIds } },
        });
      }

      for (const edge of newEdges) {
        await tx.contentPrerequisite.create({
          data: {
            targetContentId: edge.targetContentId,
            prerequisiteContentId: edge.prerequisiteContentId,
            requiredStatus: edge.requiredStatus,
            minScore: edge.minScore,
          },
        });
      }
    });

    return NextResponse.json({
      success: true,
      message: "تم حفظ الترتيب وأقفال المحتوى بنجاح 💾",
      edgesCount: newEdges.length,
      prerequisites: newEdges,
    });
  } catch (error) {
    console.error("Prerequisites PUT error:", error);
    return NextResponse.json({ error: "حدث خطأ أثناء حفظ مسار المحتوى" }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: courseId } = await params;
    const session = await getSession();

    if (!session || (!isTeacherLike(session.role) && session.role !== "superadmin")) {
      return NextResponse.json({ error: "غير مصرح لك بالوصول" }, { status: 401 });
    }

    const course = await prisma.course.findFirst({
      where: session.role === "superadmin" ? { id: courseId } : { id: courseId, teacherId: actingTeacherId(session) },
      include: {
        folders: {
          include: {
            videos: true,
            quizzes: true,
            homeworks: true,
            materials: true,
          },
        },
      },
    });

    if (!course) {
      return NextResponse.json({ error: "الكورس غير موجود" }, { status: 404 });
    }

    const allSourceIds: string[] = [];
    course.folders.forEach((f) => {
      f.videos.forEach((v) => allSourceIds.push(v.id));
      f.quizzes.forEach((q) => allSourceIds.push(q.id));
      f.homeworks.forEach((h) => allSourceIds.push(h.id));
      f.materials.forEach((m) => allSourceIds.push(m.id));
    });

    const items = await prisma.contentItem.findMany({
      where: { sourceId: { in: allSourceIds } },
      select: { id: true },
    });

    const itemIds = items.map((i) => i.id);

    await prisma.$transaction([
      prisma.contentPrerequisite.deleteMany({
        where: { targetContentId: { in: itemIds } },
      }),
      prisma.course.update({
        where: { id: courseId },
        data: { sequentialAccess: false },
      }),
    ]);

    return NextResponse.json({
      success: true,
      message: "تم إلغاء جميع أقفال المحتوى بنجاح (مشاهدة حرة بالكامل والبدء من أي مكان)",
    });
  } catch (error) {
    console.error("Prerequisites DELETE error:", error);
    return NextResponse.json({ error: "حدث خطأ أثناء إلغاء الأقفال" }, { status: 500 });
  }
}
