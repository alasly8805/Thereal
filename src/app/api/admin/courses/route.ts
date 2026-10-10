import { logAdminAction } from "@/lib/admin-auth";
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { isTeacherLike, actingTeacherId, hasAssistantPermission } from "@/lib/teacher-scope";
import { prisma } from "@/lib/prisma";
import { buildCourseSlug } from "@/lib/course-slug";
import { inferCoursePlacement } from "@/lib/teacher-terms";

const MAX_TITLE_LENGTH = 100;
const MAX_SUBJECT_LENGTH = 50;
const MAX_DESCRIPTION_LENGTH = 1000;
const MAX_URL_LENGTH = 5000000;
const MIN_TITLE_LENGTH = 1;

function isValidUrl(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

export async function GET() {
  const session = await getSession();
  if (!session || !isTeacherLike(session.role)) {
    return NextResponse.json({ error: "غير مصرح" }, { status: 403 });
  }

  const courses = await prisma.course.findMany({
    where: { teacherId: actingTeacherId(session) },
    include: {
      _count: {
        select: {
          accessCodes: {
            where: {
              OR: [
                { studentId: null },
                { student: { accountMode: { not: "TESTER" } } },
              ],
            },
          },
          folders: true,
        },
      },
      folders: { include: { _count: { select: { videos: true, quizzes: true } } } },
    },
    orderBy: { createdAt: "desc" },
  });

  const teacher = await prisma.user.findUnique({
    where: { id: actingTeacherId(session) },
    select: { name: true },
  });

  return NextResponse.json({ courses, teacherName: teacher?.name || "" });
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();

    if (session && session.role === "superadmin") {
      try {
        await logAdminAction({
          adminId: session.id,
          adminName: session.name,
          action: "SUPERADMIN_ACTION",
          targetType: "API_ROUTE",
          targetId: req.nextUrl ? req.nextUrl.pathname : req.url,
          targetName: req.method,
        });
      } catch (e) {}
    }
    if (!session || !isTeacherLike(session.role)) {
      return NextResponse.json({ error: "غير مصرح" }, { status: 403 });
    }
    if (!hasAssistantPermission(session, "createCourses")) {
      return NextResponse.json({ error: "المدرّس لم يمنحك صلاحية إنشاء كورسات" }, { status: 403 });
    }

    const body = await req.json();
    const title = typeof body.title === "string" ? body.title.trim() : "";
    const subject = typeof body.subject === "string" ? body.subject.trim() : "";
    const educationalStage = typeof body.educationalStage === "string" ? body.educationalStage.trim() : "";
    const description = typeof body.description === "string" ? body.description.trim() : "";
    const thumbnailUrl = typeof body.thumbnailUrl === "string" ? body.thumbnailUrl.trim() : "";
    const contactPhone = typeof body.contactPhone === "string" ? body.contactPhone.trim() : null;

    // Validate required fields
    if (!title) {
      return NextResponse.json({ error: "العنوان مطلوب" }, { status: 400 });
    }

    if (title.length < MIN_TITLE_LENGTH) {
      return NextResponse.json({ error: "العنوان لا يمكن أن يكون فارغاً" }, { status: 400 });
    }

    if (title.length > MAX_TITLE_LENGTH) {
      return NextResponse.json(
        { error: `العنوان لا يمكن أن يزيد عن ${MAX_TITLE_LENGTH} حرف` },
        { status: 400 }
      );
    }

    if (!subject) {
      return NextResponse.json({ error: "المادة مطلوبة" }, { status: 400 });
    }

    if (subject.length > MAX_SUBJECT_LENGTH) {
      return NextResponse.json(
        { error: `المادة لا يمكن أن تزيد عن ${MAX_SUBJECT_LENGTH} حرف` },
        { status: 400 }
      );
    }

    if (!educationalStage) {
      return NextResponse.json({ error: "المرحلة التدريبية مطلوبة" }, { status: 400 });
    }

    if (description && description.length > MAX_DESCRIPTION_LENGTH) {
      return NextResponse.json(
        { error: `الوصف لا يمكن أن يزيد عن ${MAX_DESCRIPTION_LENGTH} حرف` },
        { status: 400 }
      );
    }

    if (thumbnailUrl && thumbnailUrl.length > MAX_URL_LENGTH) {
      return NextResponse.json({ error: "رابط الصورة طويل جداً" }, { status: 400 });
    }

    if (thumbnailUrl && !isValidUrl(thumbnailUrl)) {
      return NextResponse.json({ error: "رابط الصورة غير صحيح" }, { status: 400 });
    }

    // Check for duplicate course title for this teacher
    const existingCourse = await prisma.course.findFirst({
      where: {
        teacherId: actingTeacherId(session),
        title: title,
      },
    });

    if (existingCourse) {
      return NextResponse.json({ error: "يوجد كورس بنفس العنوان لديك" }, { status: 400 });
    }

    const deliveryModeRaw = typeof body.deliveryMode === "string" ? body.deliveryMode.toUpperCase().trim() : "ONLINE";
    const deliveryMode = ["ONLINE", "CENTER", "BOTH"].includes(deliveryModeRaw) ? deliveryModeRaw : "ONLINE";

    let bookingKind: string | null = typeof body.bookingKind === "string" ? body.bookingKind.trim() : null;
    let bookingTerm: number | null = typeof body.bookingTerm === "number" ? body.bookingTerm : null;

    if (!bookingKind) {
      const inferred = inferCoursePlacement(title);
      if (inferred) {
        bookingKind = inferred.bookingKind;
        bookingTerm = inferred.bookingTerm;
      }
    }

    const course = await prisma.course.create({
      data: {
        title,
        subject,
        description: description || null,
        thumbnailUrl: thumbnailUrl || null,
        educationalStage,
        teacherId: actingTeacherId(session),
        contactPhone: contactPhone || null,
        deliveryMode,
        bookingKind,
        bookingTerm,
      },
    });

    // Generate the SEO English slug now that we have the course id.
    const withSlug = await prisma.course.update({
      where: { id: course.id },
      data: { slug: buildCourseSlug(course) },
    });

    return NextResponse.json({ course: withSlug }, { status: 201 });
  } catch (error) {
    console.error("Create course failed:", error);
    return NextResponse.json({ error: "تعذر إنشاء الكورس الآن" }, { status: 500 });
  }
}
