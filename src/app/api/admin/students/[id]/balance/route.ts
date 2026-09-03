import { logAdminAction } from "@/lib/admin-auth";
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/** POST — credit or debit a student's balance (admin/superadmin) */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || !["admin", "superadmin"].includes(session.role)) {
    return NextResponse.json({ error: "غير مصرح" }, { status: 403 });
  }

  const { id: studentId } = await params;
  const { amount, note } = await req.json() as { amount: number; note?: string };

  // A manual wallet adjustment mints or destroys real money — bound it hard.
  const MAX_ADJUSTMENT = 100_000; // EGP per call
  if (typeof amount !== "number" || !Number.isFinite(amount) || amount === 0) {
    return NextResponse.json({ error: "المبلغ مطلوب ويجب أن يكون رقماً صحيحاً" }, { status: 400 });
  }
  if (Math.abs(amount) > MAX_ADJUSTMENT) {
    return NextResponse.json({ error: `الحد الأقصى للتعديل اليدوي هو ${MAX_ADJUSTMENT} جنيه للعملية الواحدة` }, { status: 400 });
  }
  const roundedAmount = +amount.toFixed(2);

  const student = await prisma.user.findUnique({
    where: { id: studentId, role: "student", isDeleted: false },
    select: { id: true, name: true, balance: true },
  });
  if (!student) return NextResponse.json({ error: "الطالب غير موجود" }, { status: 404 });

  // Atomic conditional adjustment: for a debit, only apply if the balance still
  // covers it at write time (guards against racing purchases / concurrent admins).
  const applied = await prisma.$transaction(async (tx: any) => {
    const upd = await tx.user.updateMany({
      where:
        roundedAmount < 0
          ? { id: studentId, balance: { gte: Math.abs(roundedAmount) } }
          : { id: studentId },
      data: { balance: { increment: roundedAmount } },
    });
    if (upd.count === 0) return null;

    await tx.balanceTransaction.create({
      data: {
        userId:  studentId,
        type:    roundedAmount > 0 ? "credit_admin" : "debit_admin",
        amount:  roundedAmount,
        note:    note ?? (roundedAmount > 0 ? "إضافة رصيد من الإدارة" : "خصم رصيد من الإدارة"),
        adminId: session.id,
      },
    });

    const fresh = await tx.user.findUnique({ where: { id: studentId }, select: { balance: true } });
    return fresh?.balance ?? 0;
  });

  if (applied === null) {
    return NextResponse.json({ error: "الرصيد غير كافٍ للخصم" }, { status: 400 });
  }

  // Audit every manual balance change, not just superadmin ones.
  try {
    await logAdminAction({
      adminId: session.id,
      adminName: session.name,
      action: roundedAmount > 0 ? "CREDIT_STUDENT_BALANCE" : "DEBIT_STUDENT_BALANCE",
      targetType: "STUDENT",
      targetId: studentId,
      targetName: student.name,
      metadata: { amount: roundedAmount, note: note ?? null, newBalance: applied },
    });
  } catch {}

  return NextResponse.json({
    success: true,
    newBalance: applied,
    message: `${roundedAmount > 0 ? "تم إضافة" : "تم خصم"} ${Math.abs(roundedAmount)} جنيه ${roundedAmount > 0 ? "إلى" : "من"} رصيد ${student.name} — الرصيد الآن ${applied} جنيه`,
  });
}
