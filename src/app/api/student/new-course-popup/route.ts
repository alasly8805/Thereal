import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getTeacherPkgSettings } from "@/lib/teacher-packages";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "student") {
    return NextResponse.json({ popup: null });
  }

  try {
    const student = await prisma.user.findUnique({
      where: { id: session.id },
      select: {
        id: true,
        educationalStage: true,
        teacherSubscriptions: {
          where: {
            status: "active",
            OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
          },
          select: {
            teacherId: true,
            planType: true,
            termNumbers: true,
          },
        },
      },
    });

    if (!student) return NextResponse.json({ popup: null });

    // Collect all teachers student is associated with
    const teacherIds = Array.from(
      new Set(student.teacherSubscriptions.map((s) => s.teacherId))
    );

    // If student has no subscriptions, also look up teachers for their grade
    if (teacherIds.length === 0 && student.educationalStage) {
      const stageTeachers = await prisma.course.findMany({
        where: {
          educationalStage: student.educationalStage,
          isVirtual: false,
        },
        select: { teacherId: true },
        distinct: ["teacherId"],
        take: 5,
      });
      for (const t of stageTeachers) {
        if (t.teacherId) teacherIds.push(t.teacherId);
      }
    }

    if (teacherIds.length === 0) return NextResponse.json({ popup: null });

    // Check each teacher for an active popup
    for (const tId of teacherIds) {
      const config = await getTeacherPkgSettings(tId);
      if (config.popupEnabled && config.activePopup && config.activePopup.enabled) {
        const popup = config.activePopup;

        // Check stage match
        if (
          popup.targetStage &&
          student.educationalStage &&
          popup.targetStage !== student.educationalStage &&
          popup.targetStage !== "الكل"
        ) {
          continue;
        }

        // Check targetPlan match if set
        if (popup.targetPlan && popup.targetPlan !== "all") {
          const hasMatchingPlan = student.teacherSubscriptions.some(
            (s) => s.teacherId === tId && s.planType === popup.targetPlan
          );
          if (!hasMatchingPlan) continue;
        }

        const { checkCourseEnrollment } = await import("@/lib/authorization");
        const hasAccess = await checkCourseEnrollment(session.id, popup.courseId, session.role);
        return NextResponse.json({
          popup: {
            ...popup,
            hasAccess,
            actionType: popup.actionType || (hasAccess ? "course" : "both"),
          },
        });
      }
    }

    return NextResponse.json({ popup: null });
  } catch (error) {
    console.error("Error fetching new course popup:", error);
    return NextResponse.json({ popup: null });
  }
}
