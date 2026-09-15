import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { isTeacherLike, actingTeacherId } from "@/lib/teacher-scope";
import { prisma } from "@/lib/prisma";
import { ContentType } from "@/generated/prisma";

export async function POST(
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
      return NextResponse.json({ error: "الكورس غير موجود أو لا تملك صلاحية الوصول إليه" }, { status: 404 });
    }

    // Collect all content items in natural folder order
    const gatheredItems: Array<{
      type: ContentType;
      sourceId: string;
      title: string;
      folderId: string;
      folderName: string;
    }> = [];

    for (const folder of course.folders) {
      for (const video of folder.videos) {
        gatheredItems.push({
          type: ContentType.VIDEO,
          sourceId: video.id,
          title: video.title,
          folderId: folder.id,
          folderName: folder.name,
        });
      }
      for (const hw of folder.homeworks) {
        gatheredItems.push({
          type: ContentType.HOMEWORK,
          sourceId: hw.id,
          title: hw.title,
          folderId: folder.id,
          folderName: folder.name,
        });
      }
      for (const quiz of folder.quizzes) {
        gatheredItems.push({
          type: ContentType.QUIZ,
          sourceId: quiz.id,
          title: quiz.title,
          folderId: folder.id,
          folderName: folder.name,
        });
      }
      for (const mat of folder.materials) {
        gatheredItems.push({
          type: ContentType.PDF,
          sourceId: mat.id,
          title: mat.title,
          folderId: folder.id,
          folderName: folder.name,
        });
      }
    }

    // Also check homeworks directly linked to course
    const courseHomeworks = await prisma.homework.findMany({
      where: { courseId: course.id, folderId: null },
      orderBy: { createdAt: "asc" },
    });
    for (const hw of courseHomeworks) {
      gatheredItems.push({
        type: ContentType.HOMEWORK,
        sourceId: hw.id,
        title: hw.title,
        folderId: "course-root",
        folderName: "الواجبات العامة",
      });
    }

    // Upsert all gathered items into ContentItem table
    const contentItems: Array<{
      id: string;
      type: ContentType;
      sourceId: string;
      title: string;
      folderId: string;
      folderName: string;
    }> = [];

    for (const item of gatheredItems) {
      const existing = await prisma.contentItem.findUnique({
        where: {
          type_sourceId: {
            type: item.type,
            sourceId: item.sourceId,
          },
        },
      });

      if (existing) {
        if (existing.title !== item.title) {
          const updated = await prisma.contentItem.update({
            where: { id: existing.id },
            data: { title: item.title },
          });
          contentItems.push({
            id: updated.id,
            type: updated.type,
            sourceId: updated.sourceId,
            title: updated.title,
            folderId: item.folderId,
            folderName: item.folderName,
          });
        } else {
          contentItems.push({
            id: existing.id,
            type: existing.type,
            sourceId: existing.sourceId,
            title: existing.title,
            folderId: item.folderId,
            folderName: item.folderName,
          });
        }
      } else {
        const created = await prisma.contentItem.create({
          data: {
            type: item.type,
            sourceId: item.sourceId,
            title: item.title,
          },
        });
        contentItems.push({
          id: created.id,
          type: created.type,
          sourceId: created.sourceId,
          title: created.title,
          folderId: item.folderId,
          folderName: item.folderName,
        });
      }
    }

    // Fetch existing prerequisites between these items
    const itemIds = contentItems.map((i) => i.id);
    const existingPrerequisites = await prisma.contentPrerequisite.findMany({
      where: {
        targetContentId: { in: itemIds },
      },
    });

    return NextResponse.json({
      success: true,
      items: contentItems,
      prerequisites: existingPrerequisites,
      count: contentItems.length,
    });
  } catch (error) {
    console.error("Prerequisites sync error:", error);
    return NextResponse.json(
      { error: "حدث خطأ أثناء مزامنة محتوى الكورس" },
      { status: 500 }
    );
  }
}
