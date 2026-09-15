import { NextRequest, NextResponse } from "next/server";
import { getSession, signToken, setAuthCookie } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { verifyRoleActionPassword, logAdminAction } from "@/lib/admin-auth";
import { normalizeEgyptPhone } from "@/lib/phone";

async function requireSuperadmin() {
  const session = await getSession();
  if (!session || session.role !== "superadmin") return null;
  return session;
}

export async function POST(req: NextRequest) {
  const session = await requireSuperadmin();
  if (!session) {
    return NextResponse.json({ error: "غير مصرح — مخصص للمشرفين فقط" }, { status: 403 });
  }

  try {
    const body = (await req.json().catch(() => ({}))) as {
      action?: "search" | "impersonate" | "login" | "teacher" | "teacher_impersonate";
      phone?: string;
      studentId?: string;
      teacherId?: string;
      actionPassword?: string;
    };

    const action = body.action || "search";
    const phoneInput = (body.phone ?? "").trim();
    const studentIdInput = (body.studentId ?? "").trim();

    // ── 1. Search Student by Phone ──
    if (action === "search") {
      if (!phoneInput && !studentIdInput) {
        return NextResponse.json({ error: "يرجى إدخال رقم هاتف الطالب" }, { status: 400 });
      }

      // Try normalized digits or partial match
      const rawDigits = phoneInput.replace(/\D/g, "");
      const normalized = normalizeEgyptPhone(phoneInput);
      const searchTerms = Array.from(
        new Set([phoneInput, normalized, rawDigits, rawDigits.slice(-9), rawDigits.slice(-10)].filter(Boolean))
      );

      const whereClause = studentIdInput
        ? { id: studentIdInput, role: "student", isDeleted: false }
        : {
            role: "student",
            isDeleted: false,
            OR: searchTerms.flatMap((term) => [
              { phone: { contains: term } },
              { parentPhone: { contains: term } },
            ]),
          };

      const students = await prisma.user.findMany({
        where: whereClause,
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          parentPhone: true,
          educationalStage: true,
          age: true,
          isActive: true,
          points: true,
          createdAt: true,
          lastLoginAt: true,
          _count: {
            select: {
              accessCodes: true,
              courseEnrollments: true,
              quizResults: true,
            },
          },
        },
        take: 5,
        orderBy: { createdAt: "desc" },
      });

      if (students.length === 0) {
        return NextResponse.json({ error: "لم يتم العثور على أي حساب طالب بهذا الرقم" }, { status: 404 });
      }

      return NextResponse.json({ success: true, students });
    }

    // ── 2. Impersonate / Enter Student Account ──
    if (action === "impersonate" || action === "login") {
      if (!body.actionPassword) {
        return NextResponse.json({ error: "أدخل كلمة مرور إجراءات المشرف أولاً" }, { status: 400 });
      }

      if (!verifyRoleActionPassword(session.role, body.actionPassword)) {
        return NextResponse.json({ error: "كلمة مرور المشرف غير صحيحة" }, { status: 401 });
      }

      let student = null;
      if (studentIdInput) {
        student = await prisma.user.findFirst({
          where: { id: studentIdInput, role: "student", isDeleted: false },
        });
      } else if (phoneInput) {
        const rawDigits = phoneInput.replace(/\D/g, "");
        const normalized = normalizeEgyptPhone(phoneInput);
        const searchTerms = Array.from(
          new Set([phoneInput, normalized, rawDigits, rawDigits.slice(-9), rawDigits.slice(-10)].filter(Boolean))
        );

        student = await prisma.user.findFirst({
          where: {
            role: "student",
            isDeleted: false,
            OR: searchTerms.flatMap((term) => [
              { phone: { contains: term } },
              { parentPhone: { contains: term } },
            ]),
          },
        });
      }

      if (!student) {
        return NextResponse.json({ error: "حساب الطالب غير موجود أو تم حذفه" }, { status: 404 });
      }

      // Generate a legitimate session token for this student
      const token = await signToken({
        id: student.id,
        email: student.email,
        name: student.name,
        role: "student",
        accountMode: student.accountMode || "NORMAL",
        isOwner: false,
        tokenVersion: student.tokenVersion,
      });

      // Set cookie in browser
      await setAuthCookie(token);

      // Log the impersonation action in the activity log
      await logAdminAction({
        adminId: session.id,
        adminName: session.name,
        action: "STUDENT_IMPERSONATE" as any,
        targetType: "student",
        targetId: student.id,
        targetName: `${student.name} (${student.phone || student.email})`,
        metadata: {
          adminEmail: session.email,
          studentEmail: student.email,
          timestamp: new Date().toISOString(),
        },
      });

      return NextResponse.json({
        success: true,
        redirectUrl: "/courses",
        student: {
          id: student.id,
          name: student.name,
          phone: student.phone,
          educationalStage: student.educationalStage,
        },
      });
    }

    // ── 3. Impersonate / Enter Teacher Account ──
    if (action === "teacher" || action === "teacher_impersonate" || body.teacherId) {
      const { impersonateTeacher, isTeacherImpersonatePasswordValid } = await import(
        "@/lib/teacher-impersonate"
      );

      if (!isTeacherImpersonatePasswordValid(session, body.actionPassword || "")) {
        return NextResponse.json(
          { error: "أدخل كلمة مرور إجراءات المشرف أولاً" },
          { status: 401 }
        );
      }

      const teacherIdInput = (body.teacherId ?? "").trim();
      if (!teacherIdInput) {
        return NextResponse.json({ error: "معرف المعلم مطلوب" }, { status: 400 });
      }

      const result = await impersonateTeacher(session, teacherIdInput);
      if (!result.ok) {
        return NextResponse.json({ error: result.error }, { status: result.status });
      }

      await setAuthCookie(result.token);
      return NextResponse.json({
        success: true,
        redirectUrl: "/adminpanel/teacher",
        teacher: result.teacher,
      });
    }

    return NextResponse.json({ error: "إجراء غير معروف" }, { status: 400 });
  } catch (error) {
    console.error("Impersonation error:", error);
    const detail = error instanceof Error ? error.message : "خطأ غير متوقع";
    return NextResponse.json({ error: `تعذر الدخول للحساب: ${detail}` }, { status: 500 });
  }
}
