import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { getCachedCourseOutline } from "@/lib/cache";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;

    // `id` may be the cuid OR the SEO slug — resolve either so professional
    // /courses/<slug> URLs work without breaking old /courses/<id> links.
    const course = await getCachedCourseOutline(id, async () => {
      return prisma.course.findFirst({
        where: { OR: [{ id }, { slug: id }] },
        include: {
          teacher: { select: { id: true, name: true } },
          folders: {
            orderBy: { order: "asc" },
            include: {
              _count: { select: { videos: true, quizzes: true } },
            },
          },
        },
      });
    });

    if (!course) return NextResponse.json({ error: "الكورس غير موجود" }, { status: 404 });

    let hasAccess = false;
    let isOwnerTeacher = false;
    try {
      const session = await getSession();
      if (session) {
        isOwnerTeacher = session.role === "teacher" && course.teacherId === session.id;
        const isAdminPreview = session.role === "admin" || session.role === "superadmin";
        const hasCode = !!(await prisma.accessCode.findFirst({ where: { courseId: course.id, studentId: session.id } }));
        hasAccess = hasCode || isOwnerTeacher || isAdminPreview || (session.role === "teacher" && (!course.isPaid || course.price === 0));
      }
    } catch {
      // If auth fails, just show as no-access
    }

    const totalVideos = course.folders.reduce((sum, f) => sum + f._count.videos, 0);
    const totalQuizzes = course.folders.reduce((sum, f) => sum + f._count.quizzes, 0);

    const now = new Date();
    const discountActive =
      course.discountPercent != null &&
      course.discountPercent > 0 &&
      (course.discountExpiresAt == null || course.discountExpiresAt > now);

    const effectivePrice = (() => {
      if (!course.isPaid) return 0;
      if (!course.price) return 0;
      if (discountActive && course.discountPercent) {
        return +(course.price * (1 - course.discountPercent / 100)).toFixed(2);
      }
      return course.price;
    })();

    const preview = {
      id: course.id,
      slug: course.slug,
      title: course.title,
      subject: course.subject,
      description: course.description,
      thumbnailUrl: course.thumbnailUrl,
      educationalStage: course.educationalStage,
      teacher: course.teacher,
      isPaid: course.isPaid,
      deliveryMode: course.deliveryMode || "ONLINE",
      price: course.price,
      discountPercent: discountActive ? course.discountPercent : null,
      discountExpiresAt: discountActive ? course.discountExpiresAt : null,
      effectivePrice,
      contactPhone: course.isPaid ? (course.contactPhone ?? null) : null,
      allowDirectInstall: course.allowDirectInstall,
      totalVideos,
      totalQuizzes,
      folders: course.folders.map((f) => ({
        id: f.id,
        name: f.name,
        videoCount: f._count.videos,
        quizCount: f._count.quizzes,
      })),
      hasAccess,
      isOwnerTeacher,
    };

    const response = NextResponse.json({ course: preview });
    response.headers.set("Cache-Control", "private, no-cache, no-store, max-age=0, must-revalidate");
    return response;
  } catch (error) {
    console.error("Preview API error:", error);
    return NextResponse.json({ error: "حدث خطأ أثناء تحميل بيانات الكورس" }, { status: 500 });
  }
}
