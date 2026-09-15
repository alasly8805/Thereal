import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSupportSession, logSupportAction } from "@/lib/support-auth";

/**
 * POST /api/support/enroll-course
 * Body: { studentId, courseId, reason? }
 *
 * Enrolls a student in a WHOLE course — the fix for "I paid cash to the
 * teacher's office, add the course to my account" tickets, where granting
 * lessons one by one through /api/support/grant-access would take an hour.
 *
 * Writes the same two rows a real purchase writes, so every access check in
 * the app (course page, video gate, quiz gate, "my courses" list) sees the
 * enrollment exactly as if paid:
 *
 *   1. CourseEnrollment — fulfillmentSource "SUPPORT" keeps it out of revenue
 *      math (per the d34ddc0 convention: panel grants are never "PURCHASE").
 *   2. AccessCode (SUP-…, TERM) — the row checkCourseEnrollment() and the
 *      course detail page consult.
 *
 * Both writes are idempotent: re-running updates the existing rows instead of
 * duplicating them.
 */
export async function POST(req: NextRequest) {
  const support = await getSupportSession();
  if (!support) return NextResponse.json({ error: "غير مصرح" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as {
    studentId?: string;
    courseId?: string;
    reason?: string;
  };
  const studentId = String(body.studentId || "").trim();
  const courseId = String(body.courseId || "").trim();
  const reason = String(body.reason || "").trim().slice(0, 500);

  if (!studentId || !courseId) {
    return NextResponse.json({ error: "معرّف الطالب والكورس مطلوبان" }, { status: 400 });
  }

  const [student, course] = await Promise.all([
    prisma.user.findFirst({
      where: { id: studentId, role: "student", isDeleted: false },
      select: { id: true, name: true },
    }),
    prisma.course.findUnique({
      where: { id: courseId },
      select: { id: true, title: true, teacher: { select: { name: true } } },
    }),
  ]);
  if (!student) return NextResponse.json({ error: "الطالب غير موجود" }, { status: 404 });
  if (!course) return NextResponse.json({ error: "الكورس غير موجود" }, { status: 404 });

  try {
    const result = await prisma.$transaction(async (tx) => {
      const enrollment = await tx.courseEnrollment.upsert({
        where: { studentId_courseId: { studentId, courseId } },
        create: { studentId, courseId, fulfillmentSource: "SUPPORT", amountPaid: 0 },
        update: {},
      });

      // The purchase flow binds a consumed PAY- code to the student; mirror it
      // with a SUP- code so code-based checks see the enrollment too.
      const existingCode = await tx.accessCode.findFirst({
        where: {
          courseId,
          studentId,
          OR: [{ accessType: "TERM" }, { accessType: "COURSE" }, { folderId: null, videoId: null }],
        },
        select: { id: true, isActive: true },
      });
      if (existingCode) {
        if (!existingCode.isActive) {
          await tx.accessCode.update({ where: { id: existingCode.id }, data: { isActive: true } });
        }
      } else {
        const codeStr = `SUP-${Date.now().toString(36).toUpperCase()}-${randomBytes(3).toString("hex").toUpperCase()}`;
        await tx.accessCode.create({
          data: {
            code: codeStr,
            courseId,
            studentId,
            accessType: "TERM",
            isActive: true,
            usedAt: new Date(),
          },
        });
      }

      return { enrollmentId: enrollment.id };
    });

    await logSupportAction({
      action: "SUPPORT_ENROLL_COURSE",
      targetType: "student",
      targetId: studentId,
      targetName: `${student.name} — ${course.title}`,
      metadata: { agent: support.agent, courseId, reason: reason || null },
    });

    return NextResponse.json({
      ok: true,
      enrollmentId: result.enrollmentId,
      message: `تم تسجيل ${student.name} في «${course.title}» بالكامل`,
    });
  } catch (err) {
    console.error("support enroll-course failed:", err);
    return NextResponse.json({ error: "تعذر تسجيل الكورس" }, { status: 500 });
  }
}

/**
 * DELETE /api/support/enroll-course?studentId=...&courseId=...
 * Reverses a support grant: removes the CourseEnrollment row and deactivates
 * SUP- codes. A REAL paid enrollment (PAY- code / amountPaid > 0) is never
 * touched by this — removing paid access is an admin decision, not a ticket fix.
 */
export async function DELETE(req: NextRequest) {
  const support = await getSupportSession();
  if (!support) return NextResponse.json({ error: "غير مصرح" }, { status: 401 });

  const studentId = req.nextUrl.searchParams.get("studentId")?.trim() ?? "";
  const courseId = req.nextUrl.searchParams.get("courseId")?.trim() ?? "";
  if (!studentId || !courseId) {
    return NextResponse.json({ error: "معرّف الطالب والكورس مطلوبان" }, { status: 400 });
  }

  const enrollment = await prisma.courseEnrollment.findUnique({
    where: { studentId_courseId: { studentId, courseId } },
    select: { id: true, fulfillmentSource: true, amountPaid: true },
  });

  if (enrollment) {
    const isSupportGrant = enrollment.fulfillmentSource === "SUPPORT" && enrollment.amountPaid === 0;
    if (!isSupportGrant) {
      return NextResponse.json(
        { error: "هذا تسجيل مدفوع أو من الإدارة — لا يمكن إلغاؤه من لوحة الدعم" },
        { status: 403 }
      );
    }
    await prisma.courseEnrollment.delete({ where: { id: enrollment.id } });
  }

  await prisma.accessCode.updateMany({
    where: { courseId, studentId, code: { startsWith: "SUP-" }, isActive: true },
    data: { isActive: false },
  });

  await logSupportAction({
    action: "SUPPORT_UNENROLL_COURSE",
    targetType: "student",
    targetId: studentId,
    targetName: courseId,
    metadata: { agent: support.agent, courseId },
  });

  return NextResponse.json({ ok: true, message: "تم إلغاء تسجيل الكورس الممنوح من الدعم" });
}
