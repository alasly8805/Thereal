import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { invalidateStudentContextCache } from "@/lib/ai-context";
import { bookingGrantsCourseAccess, getEffectiveCourseTrack } from "@/lib/course-track";

export const dynamic = "force-dynamic";

/**
 * Superadmin-only: Get all students enrolled in a specific course.
 * Strictly filters out Superadmins, Teachers (and their previews), QA Testers, and Virtual Demo accounts.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session || (session.role !== "superadmin" && !session.isOwner && session.role !== "admin")) {
    return NextResponse.json({ error: "غير مصرح" }, { status: 403 });
  }

  const { id: courseId } = await params;
  if (!courseId) {
    return NextResponse.json({ error: "معرّف الكورس مطلوب" }, { status: 400 });
  }

  try {
    const course = await prisma.course.findUnique({
      where: { id: courseId },
      select: {
        id: true,
        title: true,
        subject: true,
        isPaid: true,
        price: true,
        deliveryMode: true,
        description: true,
        teacherId: true,
        teacher: { select: { id: true, name: true, email: true } },
      },
    });

    if (!course) {
      return NextResponse.json({ error: "الكورس غير موجود" }, { status: 404 });
    }

    // 1. Fetch direct course enrollments (strictly real students)
    const directEnrollments = await prisma.courseEnrollment.findMany({
      where: {
        courseId,
        student: {
          role: "student",
          accountMode: { not: "TESTER" },
          isVirtual: false,
          id: { not: course.teacherId },
        },
      },
      include: {
        student: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            parentPhone: true,
            educationalStage: true,
            createdAt: true,
            lastLoginAt: true,
            devices: { select: { id: true, lastSeenAt: true }, take: 1, orderBy: { lastSeenAt: "desc" } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    // 2. Fetch redeemed access codes for this course.
    // A booking is added later only when it actually opens this course, and only
    // for students who have no enrollment row — so nobody is listed twice.
    const redeemedCodes = await prisma.accessCode.findMany({
      where: {
        courseId,
        studentId: { not: null },
        student: {
          role: "student",
          accountMode: { not: "TESTER" },
          isVirtual: false,
          id: { not: course.teacherId },
        },
      },
      include: {
        student: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            parentPhone: true,
            educationalStage: true,
            createdAt: true,
            lastLoginAt: true,
            devices: { select: { id: true, lastSeenAt: true }, take: 1, orderBy: { lastSeenAt: "desc" } },
          },
        },
      },
      orderBy: { usedAt: "desc" },
    });

    // 3. Fetch exclusion overrides from AppSetting
    const exclusions = await prisma.appSetting.findMany({
      where: { key: { startsWith: `course_excluded_${courseId}_` } },
      select: { key: true, value: true },
    });
    const excludedStudentIds = new Set(
      exclusions
        .filter((e) => e.value === "true")
        .map((e) => e.key.replace(`course_excluded_${courseId}_`, ""))
    );

    // 4. Gather all unique student IDs to query real watches (not booking students)
    const allStudentIds = new Set<string>();
    directEnrollments.forEach((e) => allStudentIds.add(e.student.id));
    redeemedCodes.forEach((c) => c.student && allStudentIds.add(c.student.id));

    // Exclude teacher and any superadmin IDs just in case
    allStudentIds.delete(course.teacherId);
    allStudentIds.delete("superadmin");

    const courseTrack = await getEffectiveCourseTrack(courseId, course);
    const bookingSubs = bookingGrantsCourseAccess(course, "languages", courseTrack) || bookingGrantsCourseAccess(course, "arabic", courseTrack)
      ? await prisma.teacherSubscription.findMany({
          where: {
            teacherId: course.teacherId,
            status: "active",
            amount: { gt: 0 },
            OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
            student: {
              role: "student",
              accountMode: { not: "TESTER" },
              isVirtual: false,
              isDeleted: false,
              id: { not: course.teacherId },
            },
          },
          include: {
            student: {
              select: {
                id: true,
                name: true,
                email: true,
                phone: true,
                parentPhone: true,
                educationalStage: true,
                createdAt: true,
                lastLoginAt: true,
                devices: { select: { id: true, lastSeenAt: true }, take: 1, orderBy: { lastSeenAt: "desc" } },
              },
            },
          },
        })
      : [];
    const entitledBookings = bookingSubs.filter(
      (sub) =>
        !excludedStudentIds.has(sub.studentId) &&
        bookingGrantsCourseAccess(course, sub.languageTrack, courseTrack, sub.planType)
    );
    for (const sub of entitledBookings) allStudentIds.add(sub.student.id);

    const studentIdsList = Array.from(allStudentIds);

    // 5. Count real lecture watches (completed or >10s), not raw session starts
    const watchCountMap = new Map<string, number>();
    if (studentIdsList.length > 0) {
      const watchRows = await prisma.progress.groupBy({
        by: ["studentId"],
        where: {
          studentId: { in: studentIdsList },
          video: { folder: { courseId } },
          OR: [{ watched: true }, { watchedSecondsTotal: { gt: 10 } }],
        },
        _count: { _all: true },
      });
      for (const row of watchRows) {
        watchCountMap.set(row.studentId, row._count._all);
      }
    }

    // 6. Aggregate student data deduplicated by studentId
    interface StudentAggregated {
      id: string;
      name: string;
      email: string;
      phone: string | null;
      parentPhone: string | null;
      educationalStage: string | null;
      lastActive: Date | null;
      firstEnrolledAt: Date;
      watchCount: number;
      isExcluded: boolean;
      sources: Array<{
        type: "DIRECT_ENROLLMENT" | "ACCESS_CODE" | "TEACHER_SUBSCRIPTION";
        label: string;
        code?: string;
        amount?: number;
        date: Date;
      }>;
    }

    const studentMap = new Map<string, StudentAggregated>();

    // Helper to get or create entry
    const getOrCreate = (student: any, initialDate: Date): StudentAggregated => {
      let existing = studentMap.get(student.id);
      if (!existing) {
        const lastDevice = student.devices?.[0]?.lastSeenAt;
        const lastActive = lastDevice || student.lastLoginAt || null;
        existing = {
          id: student.id,
          name: student.name,
          email: student.email,
          phone: student.phone,
          parentPhone: student.parentPhone,
          educationalStage: student.educationalStage,
          lastActive,
          firstEnrolledAt: initialDate,
          watchCount: watchCountMap.get(student.id) || 0,
          isExcluded: excludedStudentIds.has(student.id),
          sources: [],
        };
        studentMap.set(student.id, existing);
      }
      return existing;
    };

    // Add direct enrollments
    for (const de of directEnrollments) {
      const agg = getOrCreate(de.student, de.createdAt);
      const effectiveAmt = de.amountPaid > 0 ? de.amountPaid : (course.isPaid ? (course.price || 0) : 0);
      const labelText = de.amountPaid > 0
        ? `شراء مباشر (${de.amountPaid} ج.م)`
        : (course.isPaid && (course.price || 0) > 0
          ? `تسجيل معتمد بالكورس (${course.price} ج.م)`
          : "تسجيل مجاني");

      agg.sources.push({
        type: "DIRECT_ENROLLMENT",
        label: labelText,
        amount: effectiveAmt,
        date: de.createdAt,
      });
      if (de.createdAt < agg.firstEnrolledAt) {
        agg.firstEnrolledAt = de.createdAt;
      }
    }

    // Add redeemed access codes
    for (const ac of redeemedCodes) {
      if (!ac.student) continue;
      const date = ac.usedAt || ac.createdAt;
      const agg = getOrCreate(ac.student, date);
      agg.sources.push({
        type: "ACCESS_CODE",
        label: `كود تفعيل: ${ac.code}`,
        code: ac.code,
        date,
      });
      if (date < agg.firstEnrolledAt) {
        agg.firstEnrolledAt = date;
      }
    }

    for (const sub of entitledBookings) {
      if (studentMap.has(sub.student.id)) continue;
      const agg = getOrCreate(sub.student, sub.createdAt);
      agg.sources.push({
        type: "TEACHER_SUBSCRIPTION",
        label: `مشمول بحجز ${sub.planLabel || "الاشتراك"}`,
        amount: 0,
        date: sub.createdAt,
      });
    }

    const studentsList = Array.from(studentMap.values()).sort((a, b) => {
      // Show active first, then by enrollment date desc
      if (a.isExcluded !== b.isExcluded) {
        return a.isExcluded ? 1 : -1;
      }
      return new Date(b.firstEnrolledAt).getTime() - new Date(a.firstEnrolledAt).getTime();
    });

    const activeCount = studentsList.filter((s) => !s.isExcluded).length;
    const excludedCount = studentsList.filter((s) => s.isExcluded).length;

    return NextResponse.json({
      course: {
        id: course.id,
        title: course.title,
        subject: course.subject,
        isPaid: course.isPaid,
        price: course.price ?? 0,
        teacher: course.teacher,
      },
      students: studentsList,
      totalCount: studentsList.length,
      activeCount,
      excludedCount,
    });
  } catch (error) {
    console.error("Failed to fetch course students for superadmin:", error);
    return NextResponse.json({ error: "تعذر جلب طلاب الكورس" }, { status: 500 });
  }
}

/**
 * Superadmin-only: Silently sign out and remove a student from the course.
 * Does NOT notify the teacher and does NOT create teacher-facing logs.
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session || (session.role !== "superadmin" && !session.isOwner && session.role !== "admin")) {
    return NextResponse.json({ error: "غير مصرح" }, { status: 403 });
  }

  const { id: courseId } = await params;
  const body = await req.json().catch(() => ({}));
  const studentId = body.studentId || new URL(req.url).searchParams.get("studentId");
  const revokeSession = body.revokeSession === true;

  if (!courseId || !studentId) {
    return NextResponse.json({ error: "معرّف الكورس ومعرّف الطالب مطلوبان" }, { status: 400 });
  }

  try {
    const [course, student] = await Promise.all([
      prisma.course.findUnique({
        where: { id: courseId },
        select: { id: true, title: true, teacherId: true },
      }),
      prisma.user.findUnique({
        where: { id: studentId },
        select: { id: true, name: true, email: true },
      }),
    ]);

    if (!course) {
      return NextResponse.json({ error: "الكورس غير موجود" }, { status: 404 });
    }
    if (!student) {
      return NextResponse.json({ error: "الطالب غير موجود" }, { status: 404 });
    }

    // 1. Delete direct CourseEnrollment
    await prisma.courseEnrollment.deleteMany({
      where: {
        courseId,
        studentId,
      },
    });

    // 2. Unlink / deactivate access codes used for this course
    await prisma.accessCode.updateMany({
      where: {
        courseId,
        studentId,
      },
      data: {
        studentId: null,
        isActive: false,
      },
    });

    // 3. Delete any specific folder or video purchases under this course
    const courseFolders = await prisma.folder.findMany({
      where: { courseId },
      select: { id: true, videos: { select: { id: true } } },
    });
    const folderIds = courseFolders.map((f) => f.id);
    const videoIds = courseFolders.flatMap((f) => f.videos.map((v) => v.id));

    if (folderIds.length > 0) {
      await prisma.folderPurchase.deleteMany({
        where: {
          studentId,
          folderId: { in: folderIds },
        },
      });
    }

    if (videoIds.length > 0) {
      await prisma.videoPurchase.deleteMany({
        where: {
          studentId,
          videoId: { in: videoIds },
        },
      });
    }

    // 4. Record permanent silent exclusion in AppSetting (overrides any active teacher subscription)
    await prisma.appSetting.upsert({
      where: { key: `course_excluded_${courseId}_${studentId}` },
      update: { value: "true" },
      create: { key: `course_excluded_${courseId}_${studentId}`, value: "true" },
    });

    // 5. Terminate any active watch sessions on videos of this course
    if (videoIds.length > 0) {
      await prisma.videoWatchSession.updateMany({
        where: {
          studentId,
          videoId: { in: videoIds },
          expiresAt: { gt: new Date() },
        },
        data: {
          expiresAt: new Date(0),
          endedAt: new Date(),
        },
      });
    }

    // 6. Optional: Revoke student device sessions and force logout from browser
    if (revokeSession) {
      await prisma.user.update({
        where: { id: studentId },
        data: { tokenVersion: { increment: 1 } },
      });
      await prisma.device.deleteMany({
        where: { userId: studentId },
      });
    }

    // 7. Invalidate AI student context cache
    invalidateStudentContextCache(studentId);

    // Note: No notification is dispatched to the teacher, ensuring complete stealth.

    return NextResponse.json({
      success: true,
      message: `تم إخراج الطالب (${student.name}) من كورس «${course.title}» بنجاح وبشكل صامت تماماً دون إشعار المعلم.`,
      studentId,
      courseId,
    });
  } catch (error) {
    console.error("Failed to silently sign out student from course:", error);
    return NextResponse.json({ error: "تعذر إخراج الطالب من الكورس" }, { status: 500 });
  }
}

/**
 * Superadmin-only: Restore access for a previously excluded student.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session || (session.role !== "superadmin" && !session.isOwner && session.role !== "admin")) {
    return NextResponse.json({ error: "غير مصرح" }, { status: 403 });
  }

  const { id: courseId } = await params;
  const body = await req.json().catch(() => ({}));
  const { studentId, action } = body as { studentId?: string; action?: string };

  if (!courseId || !studentId) {
    return NextResponse.json({ error: "معرّف الكورس ومعرّف الطالب مطلوبان" }, { status: 400 });
  }

  if (action === "restore") {
    try {
      // Remove exclusion record
      await prisma.appSetting.delete({
        where: { key: `course_excluded_${courseId}_${studentId}` },
      }).catch(() => {});

      invalidateStudentContextCache(studentId);

      return NextResponse.json({
        success: true,
        message: "تم إلغاء الاستبعاد وإعادة إتاحة الكورس للطالب بنجاح.",
      });
    } catch (error) {
      console.error("Failed to restore student access to course:", error);
      return NextResponse.json({ error: "تعذر استعادة وصول الطالب" }, { status: 500 });
    }
  }

  return NextResponse.json({ error: "إجراء غير معروف" }, { status: 400 });
}
