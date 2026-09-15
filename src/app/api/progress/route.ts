import { NextRequest, NextResponse } from "next/server";
import { getStudentSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkVideoAccess } from "@/lib/authorization";
import { blockSupportView } from "@/lib/support-auth";

export async function GET() {

      try {
      const session = await getStudentSession();
      if (!session) return NextResponse.json({ error: "غير مصرح" }, { status: 401 });

      const codes = await prisma.accessCode.findMany({
        where: { studentId: session.id },
        include: {
          course: {
            include: {
              teacher: { select: { id: true, name: true } },
              folders: {
                include: {
                  videos: true,
                  quizzes: true,
                },
              },
              _count: { select: { folders: true } },
            },
          },
        },
      });

      const quizResults = await prisma.quizResult.findMany({
        where: { studentId: session.id },
        orderBy: { completedAt: "desc" },
        take: 10,
        include: {
          quiz: {
            select: {
              id: true,
              title: true,
              folder: {
                select: {
                  name: true,
                  course: { select: { id: true, title: true, subject: true } },
                },
              },
            },
          },
        },
      });

      return NextResponse.json({ courses: codes.map((c) => c.course), quizResults });
    } catch (error) {
        console.error("[progress] error:", error);
        return NextResponse.json(
          { error: "حدث خطأ داخلي" },
          { status: 500 }
        );
      }
}

export async function POST(req: NextRequest) {

      try {
      const session = await getStudentSession();
      // Defence in depth behind the proxy guard: never let a support agent act as
      // the student on grades, progress or money.
      const supportBlocked = blockSupportView(session);
      if (supportBlocked) return supportBlocked;
      if (!session) return NextResponse.json({ error: "غير مصرح" }, { status: 401 });

      const { videoId, watched = true } = await req.json();
      if (!videoId) return NextResponse.json({ error: "videoId مطلوب" }, { status: 400 });

      const hasAccess = await checkVideoAccess(session.id, session.role, videoId);
      if (!hasAccess) return NextResponse.json({ error: "لا يوجد صلاحية للوصول" }, { status: 403 });

      const completedAt = watched ? new Date() : null;
      const progress = await prisma.progress.upsert({
        where: { studentId_videoId: { studentId: session.id, videoId } },
        update: { watched, watchedAt: completedAt },
        create: { studentId: session.id, videoId, watched, watchedAt: completedAt },
      });

      if (watched) {
        try {
          const { syncVideoWatchToRelatedCourses } = await import("@/lib/video-sync");
          await syncVideoWatchToRelatedCourses(session.id, videoId, { completedAt: completedAt || new Date() });
        } catch (syncErr) {
          console.error("[progress POST] video sync error:", syncErr);
        }
      }

      return NextResponse.json({ progress });
    } catch (error) {
        console.error("[progress] error:", error);
        return NextResponse.json(
          { error: "حدث خطأ داخلي" },
          { status: 500 }
        );
      }
}
