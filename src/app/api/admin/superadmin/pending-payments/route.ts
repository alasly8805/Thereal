import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { logAdminAction } from "@/lib/admin-auth";
import { claimPendingPaymentAsPaid, describePaymentItem } from "@/lib/fulfillment";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/superadmin/pending-payments
 * Superadmin/admin: treat a pending gateway invoice as paid, credit the
 * student, and run the same fulfillment path as a successful webhook.
 */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || !["superadmin", "admin"].includes(session.role)) {
    return NextResponse.json({ error: "غير مصرح — مخصص للمشرف فقط" }, { status: 403 });
  }

  let body: { transactionId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "طلب غير صالح" }, { status: 400 });
  }

  const transactionId = typeof body.transactionId === "string" ? body.transactionId.trim() : "";
  if (!transactionId) {
    return NextResponse.json({ error: "معرف المعاملة مطلوب" }, { status: 400 });
  }

  const result = await claimPendingPaymentAsPaid({
    transactionId,
    noteSuffix: `سداد يدوي من النظرة العامة بواسطة ${session.name || "مشرف"}`,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error || "تعذر تأكيد الدفعة" }, { status: 409 });
  }

  await logAdminAction({
    adminId: session.id,
    adminName: session.name || "مشرف",
    action: "MANUAL_CONFIRM_PENDING_PAYMENT",
    targetType: "BALANCE_TRANSACTION",
    targetId: transactionId,
    targetName: result.userId || transactionId,
    metadata: {
      amount: result.amount,
      alreadyPaid: result.alreadyPaid === true,
      item: describePaymentItem(result.note),
      fulfillment: result.fulfillment?.itemName || result.fulfillment?.message || null,
      cancelledDuplicates: result.cancelledDuplicates || 0,
    },
  });

  if (result.alreadyPaid) {
    return NextResponse.json({
      success: true,
      alreadyPaid: true,
      message: "هذه الدفعة مؤكدة مسبقاً",
    });
  }

  const item = describePaymentItem(result.note);
  const fulfillMsg = result.fulfillment?.error
    ? `تم تسجيل المبلغ كمدفوع لكن تفعيل المحتوى فشل: ${result.fulfillment.error}`
    : result.fulfillment?.message || "تم اعتبار الدفعة مكتملة وتفعيل المحتوى";

  return NextResponse.json({
    success: true,
    amount: result.amount,
    item,
    fulfillment: result.fulfillment,
    cancelledDuplicates: result.cancelledDuplicates || 0,
    message:
      (result.cancelledDuplicates || 0) > 0
        ? `${fulfillMsg} · أُلغيت ${result.cancelledDuplicates} محاولة مكررة لنفس الطلب`
        : fulfillMsg,
  });
}
