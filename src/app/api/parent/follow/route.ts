import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { phonesMatch } from "@/lib/phone-match";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl;
    const code = searchParams.get("code")?.trim() || "";
    const phone = searchParams.get("phone")?.trim() || "";

    if (!code) {
      return NextResponse.json(
        { error: "يرجى إدخال كود الطالب" },
        { status: 400 }
      );
    }

    // Match student by ID or referralCode (case-insensitive)
    const student = await prisma.user.findFirst({
      where: {
        role: "student",
        isDeleted: false,
        OR: [
          { id: code },
          { referralCode: code },
          { referralCode: { equals: code, mode: "insensitive" } },
        ],
      },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        parentPhone: true,
        age: true,
        educationalStage: true,
        isActive: true,
        points: true,
        loginStreak: true,
        overallIQ: true,
        createdAt: true,
        lastLoginAt: true,
        referralCode: true,
        accessCodes: {
          where: { isActive: true },
          select: {
            course: {
              select: {
                id: true,
                title: true,
                subject: true,
                teacher: { select: { id: true, name: true } },
              },
            },
          },
        },
        studentSubscriptions: {
          where: { status: "active" },
          select: {
            id: true,
            planLabel: true,
            planType: true,
            expiresAt: true,
            teacher: { select: { name: true } },
          },
        },
      },
    });

    if (!student) {
      return NextResponse.json(
        { error: "لم يتم العثور على طالب بهذا الكود" },
        { status: 404 }
      );
    }

    // If parent phone was provided, verify it matches
    if (phone && student.parentPhone) {
      const match = phonesMatch(student.parentPhone, phone) || phonesMatch(student.phone, phone);
      if (!match) {
        return NextResponse.json(
          { error: "رقم هاتف ولي الأمر غير مطابق لبيانات الطالب المسجلة" },
          { status: 403 }
        );
      }
    }

    const courseIds = student.accessCodes.map((ac) => ac.course.id);

    // Fetch video progress, completed videos, quizzes, and homework
    const [rawQuizResults, watchedCount, completedProgress, totalVideos, homeworkSubmissions] = await Promise.all([
      prisma.quizResult.findMany({
        where: { studentId: student.id },
        select: {
          id: true,
          score: true,
          totalQ: true,
          completedAt: true,
          quiz: {
            select: {
              id: true,
              title: true,
              folder: { select: { course: { select: { title: true } } } },
            },
          },
        },
        orderBy: { completedAt: "desc" },
        take: 30,
      }),
      prisma.progress.count({ where: { studentId: student.id, watched: true } }),
      prisma.progress.findMany({
        where: { studentId: student.id, watched: true },
        select: {
          lastWatchedAt: true,
          video: {
            select: {
              id: true,
              title: true,
              durationMinutes: true,
              folder: { select: { name: true, course: { select: { title: true } } } },
            },
          },
        },
        orderBy: { lastWatchedAt: "desc" },
        take: 50,
      }),
      courseIds.length > 0
        ? prisma.video.count({
            where: { folder: { courseId: { in: courseIds } } },
          })
        : Promise.resolve(0),
      prisma.homeworkSubmission.findMany({
        where: { studentId: student.id },
        select: {
          score: true,
          totalQ: true,
          status: true,
          completedAt: true,
          homework: {
            select: {
              title: true,
              course: { select: { title: true } },
            },
          },
        },
        orderBy: { completedAt: "desc" },
        take: 20,
      }),
    ]);

    const completedVideos = completedProgress.map((p) => ({
      id: p.video.id,
      title: p.video.title,
      durationMinutes: p.video.durationMinutes,
      folderName: p.video.folder.name,
      courseTitle: p.video.folder.course?.title,
      lastWatchedAt: p.lastWatchedAt ? p.lastWatchedAt.toISOString() : null,
    }));

    return NextResponse.json({
      success: true,
      student: {
        id: student.id,
        name: student.name,
        code: student.referralCode || student.id,
        educationalStage: student.educationalStage,
        points: student.points,
        loginStreak: student.loginStreak,
        overallIQ: student.overallIQ,
        lastLoginAt: student.lastLoginAt ? student.lastLoginAt.toISOString() : null,
        createdAt: student.createdAt.toISOString(),
        courses: student.accessCodes.map((ac) => ac.course),
        subscriptions: student.studentSubscriptions,
      },
      stats: {
        watchedCount,
        totalVideos,
        progressPct: totalVideos > 0 ? Math.round((watchedCount / totalVideos) * 100) : 0,
      },
      completedVideos,
      quizResults: rawQuizResults,
      homeworkSubmissions,
    });
  } catch (error) {
    console.error("[parent/follow GET] error:", error);
    return NextResponse.json(
      { error: "حدث خطأ أثناء جلب تقرير الطالب" },
      { status: 500 }
    );
  }
}
