import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSupportSession, logSupportAction } from "@/lib/support-auth";

/**
 * Support may move smaller amounts than the admin panel (100k). Wallet fixes
 * on tickets are "we charged you twice" / "the code didn't arrive" — none of
 * which need five figures. A larger correction still goes through the admin
 * panel, which is the right place for real money movement.
 */
const MAX_ADJUSTMENT = 10_000; // EGP per call

/**
 * POST /api/support/students/[id]/balance
 * Body: { amount, note? } — positive credits the wallet, negative debits it.
 *
 * Writes the same BalanceTransaction row the admin panel writes, atomically
 * with the balance change, so the student's wallet history explains itself.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const support = await getSupportSession();
  if (!support) return NextResponse.json({ error: "غير مصرح" }, { status: 401 });

  const { id: studentId } = await params;
  const body = (await req.json().catch(() => ({}))) as { amount?: number; note?: string };
  const amount = body.amount;
  const note = String(body.note || "").trim().slice(0, 500);

  if (typeof amount !== "number" || !Number.isFinite(amount) || amount === 0) {
    return NextResponse.json({ error: "المبلغ مطلوب ويجب أن يكون رقماً صحيحاً" }, { status: 400 });
  }
  if (Math.abs(amount) > MAX_ADJUSTMENT) {
    return NextResponse.json(
      { error: `الحد الأقصى للتعديل من لوحة الدعم هو ${MAX_ADJUSTMENT} جنيه للعملية الواحدة` },
      { status: 400 }
    );
  }
  const rounded = +amount.toFixed(2);

  const student = await prisma.user.findFirst({
    where: { id: studentId, role: "student", isDeleted: false },
    select: { id: true, name: true, balance: true },
  });
  if (!student) return NextResponse.json({ error: "الطالب غير موجود" }, { status: 404 });

  try {
    // Atomic conditional adjustment: a debit only lands if the balance still
    // covers it at write time (guards against racing purchases).
    const newBalance = await prisma.$transaction(async (tx) => {
      const upd = await tx.user.updateMany({
        where:
          rounded < 0
            ? { id: studentId, balance: { gte: Math.abs(rounded) } }
            : { id: studentId },
        data: { balance: { increment: rounded } },
      });
      if (upd.count === 0) return null;

      await tx.balanceTransaction.create({
        data: {
          userId: studentId,
          type: rounded > 0 ? "credit_admin" : "debit_admin",
          amount: rounded,
          note: note || (rounded > 0 ? "إضافة رصيد من الدعم الفني" : "خصم رصيد من الدعم الفني"),
          adminId: "support-panel",
        },
      });

      const fresh = await tx.user.findUnique({
        where: { id: studentId },
        select: { balance: true },
      });
      return fresh?.balance ?? 0;
    });

    if (newBalance === null) {
      return NextResponse.json({ error: "الرصيد غير كافٍ للخصم" }, { status: 400 });
    }

    await logSupportAction({
      action: rounded > 0 ? "SUPPORT_CREDIT_BALANCE" : "SUPPORT_DEBIT_BALANCE",
      targetType: "student",
      targetId: studentId,
      targetName: student.name,
      metadata: { agent: support.agent, amount: rounded, note: note || null, newBalance },
    });

    return NextResponse.json({
      ok: true,
      newBalance,
      message: `${rounded > 0 ? "تم إضافة" : "تم خصم"} ${Math.abs(rounded)} جنيه — الرصيد الآن ${newBalance} جنيه`,
    });
  } catch (err) {
    console.error("support balance adjustment failed:", err);
    return NextResponse.json({ error: "تعذر تعديل الرصيد" }, { status: 500 });
  }
}
