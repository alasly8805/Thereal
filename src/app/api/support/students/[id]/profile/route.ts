import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSupportSession, logSupportAction } from "@/lib/support-auth";
import { normalizeEgyptPhone } from "@/lib/phone";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_STAGE_LEN = 50;

/**
 * PATCH /api/support/students/[id]/profile
 * Body: { name?, email?, phone?, parentPhone?, educationalStage?, reason? }
 *
 * Fixes registration mistakes — the "I typed my phone wrong and can't log in"
 * and "my name is misspelled on the certificate" tickets. Only the fields
 * present in the body are touched; everything else stays as-is.
 *
 * Two guards matter here because login is by phone:
 *   - phone is normalized with the same helper the login route uses, and must
 *     be unique across live accounts — a duplicate would make findFirst()
 *     ambiguous and could sign the wrong person in.
 *   - an empty phone never clears the stored one. Phone is the only login
 *     identifier; wiping it would lock the student out silently.
 *
 * Every change is audit-logged with the before/after diff.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const support = await getSupportSession();
  if (!support) return NextResponse.json({ error: "غير مصرح" }, { status: 401 });

  const { id: studentId } = await params;
  const body = (await req.json().catch(() => ({}))) as {
    name?: string;
    email?: string;
    phone?: string;
    parentPhone?: string;
    educationalStage?: string;
    reason?: string;
  };
  const reason = String(body.reason || "").trim().slice(0, 500);

  const student = await prisma.user.findFirst({
    where: { id: studentId, role: "student", isDeleted: false },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      parentPhone: true,
      educationalStage: true,
    },
  });
  if (!student) return NextResponse.json({ error: "الطالب غير موجود" }, { status: 404 });

  const data: Record<string, string | null> = {};
  const before: Record<string, string | null> = {};

  if (body.name !== undefined) {
    const name = String(body.name).trim();
    if (name.length < 2 || name.length > 100) {
      return NextResponse.json({ error: "الاسم يجب أن يكون بين حرفين و 100 حرف" }, { status: 400 });
    }
    if (name !== student.name) {
      data.name = name;
      before.name = student.name;
    }
  }

  if (body.email !== undefined) {
    const email = String(body.email).trim().toLowerCase();
    if (!EMAIL_REGEX.test(email)) {
      return NextResponse.json({ error: "البريد الإلكتروني غير صالح" }, { status: 400 });
    }
    if (email !== student.email) {
      const taken = await prisma.user.findFirst({
        where: { email, id: { not: studentId } },
        select: { id: true },
      });
      if (taken) {
        return NextResponse.json({ error: "هذا البريد مستخدم لحساب آخر" }, { status: 409 });
      }
      data.email = email;
      before.email = student.email;
    }
  }

  if (body.phone !== undefined) {
    const raw = String(body.phone).trim();
    if (raw.length > 0) {
      let normalized: string;
      try {
        normalized = normalizeEgyptPhone(raw);
      } catch {
        return NextResponse.json({ error: "رقم الهاتف غير صالح — استخدم رقماً مصرياً يبدأ بـ 01" }, { status: 400 });
      }
      if (normalized !== student.phone) {
        const taken = await prisma.user.findFirst({
          where: { phone: normalized, isDeleted: false, id: { not: studentId } },
          select: { id: true, name: true },
        });
        if (taken) {
          return NextResponse.json(
            { error: `هذا الرقم مستخدم لحساب آخر (${taken.name})` },
            { status: 409 }
          );
        }
        data.phone = normalized;
        before.phone = student.phone;
      }
    }
    // Empty phone is ignored on purpose — see the header comment.
  }

  if (body.parentPhone !== undefined) {
    const raw = String(body.parentPhone).trim();
    let parentPhone: string | null = null;
    if (raw.length > 0) {
      try {
        parentPhone = normalizeEgyptPhone(raw);
      } catch {
        return NextResponse.json({ error: "رقم ولي الأمر غير صالح — استخدم رقماً مصرياً يبدأ بـ 01" }, { status: 400 });
      }
    }
    if (parentPhone !== student.parentPhone) {
      data.parentPhone = parentPhone;
      before.parentPhone = student.parentPhone;
    }
  }

  if (body.educationalStage !== undefined) {
    const stage = String(body.educationalStage).trim().slice(0, MAX_STAGE_LEN) || null;
    if (stage !== student.educationalStage) {
      data.educationalStage = stage;
      before.educationalStage = student.educationalStage;
    }
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ ok: true, unchanged: true, message: "لا توجد تغييرات" });
  }

  try {
    await prisma.user.update({ where: { id: studentId }, data });

    await logSupportAction({
      action: "SUPPORT_EDIT_PROFILE",
      targetType: "student",
      targetId: studentId,
      targetName: student.name,
      metadata: { agent: support.agent, before, after: data, reason: reason || null },
    });

    return NextResponse.json({
      ok: true,
      message: "تم تحديث بيانات الطالب",
      changed: Object.keys(data),
    });
  } catch (err) {
    console.error("support profile edit failed:", err);
    return NextResponse.json({ error: "تعذر تحديث البيانات" }, { status: 500 });
  }
}
