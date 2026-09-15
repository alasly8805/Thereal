import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { PurchaseService } from "@/services/purchase/PurchaseService";
import { prisma } from "@/lib/prisma";
import { isCenterRequest, isCourseOnSite } from "@/lib/center-mode";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "يجب تسجيل الدخول أولاً" }, { status: 401 });
  if (session.role !== "student") {
    return NextResponse.json({ error: "هذا الإجراء مخصص للطلاب فقط" }, { status: 403 });
  }

  const { id: courseId } = await params;

  // Block the purchase before any money moves if the course does not belong to
  // the site the student is on.
  const scoped = await prisma.course.findUnique({
    where: { id: courseId },
    select: { deliveryMode: true },
  });
  if (scoped && !isCourseOnSite(scoped.deliveryMode, isCenterRequest(req))) {
    return NextResponse.json({ error: "هذا الكورس غير متاح على هذه المنصة" }, { status: 404 });
  }

  const reqBody = await req.json().catch(() => ({}));
  const promoCodeInput = reqBody.promoCode || reqBody.promo_code;
  const discountCode = reqBody.discountCode || reqBody.discount_code;

  const result = await PurchaseService.purchaseCourse({
    studentId: session.id,
    courseId,
    discountCode,
    promoCodeInput,
    paymentMethod: "wallet_balance",
  });

  if (!result.success) {
    if (result.alreadyOwned) {
      return NextResponse.json({ error: result.error || "أنت مسجل في هذا الكورس مسبقاً" }, { status: 400 });
    }
    if (result.insufficientFunds) {
      return NextResponse.json(
        {
          error: result.error,
          insufficientFunds: true,
          requiredAmount: result.requiredAmount,
          missingAmount: result.missingAmount,
        },
        { status: 400 }
      );
    }
    return NextResponse.json({ error: result.error || "تعذر إتمام شراء الكورس" }, { status: 400 });
  }

  return NextResponse.json({
    success: true,
    courseId,
    courseTitle: result.itemTitle,
    originalPrice: result.originalPrice,
    discountAmount: result.discountAmount,
    charged: result.finalPrice,
    newBalance: result.newBalance,
    message: result.message || "تم شراء الكورس بنجاح!",
  });
}
