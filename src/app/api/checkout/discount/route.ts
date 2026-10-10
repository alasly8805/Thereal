import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { DiscountService, PurchaseType } from "@/services/discount/DiscountService";
import { verifyAuthoritativePrice } from "@/lib/price-verifier";

const CODE_MAX_LEN = 100;

/**
 * POST /api/checkout/discount
 * Validates a discount code in checkout context and returns authoritative price breakdown.
 */
export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "يجب تسجيل الدخول أولاً" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const { code, courseId, folderId, videoId, planId, teacherId, planType, grade, languageTrack, paymentMethod } = body;

    if (!code || typeof code !== "string" || !code.trim()) {
      return NextResponse.json({ error: "كود الخصم مطلوب" }, { status: 400 });
    }

    // Reject oversized codes before any DB work
    if (code.trim().length > CODE_MAX_LEN) {
      return NextResponse.json({ error: "كود الخصم غير صالح" }, { status: 400 });
    }

    let purchaseType: PurchaseType | null = null;
    let targetId: string | null = null;

    if (courseId) { purchaseType = "COURSE"; targetId = courseId; }
    else if (folderId) { purchaseType = "FOLDER"; targetId = folderId; }
    else if (videoId) { purchaseType = "VIDEO"; targetId = videoId; }
    else if (planId) { purchaseType = "PLAN"; targetId = planId; }
    else if (teacherId && planType) { purchaseType = "TEACHER_SUB"; targetId = teacherId; }

    if (!purchaseType || !targetId) {
      return NextResponse.json({ error: "يرجى تحديد المحتوى المراد تطبيق الخصم عليه" }, { status: 400 });
    }

    const priceRes = await verifyAuthoritativePrice({
      amount: 999999,
      courseId,
      folderId,
      videoId,
      planId,
      teacherId,
      planType,
      grade,
      languageTrack,
      studentId: session.id,
    });

    if (!priceRes.valid || priceRes.expectedPrice === undefined) {
      return NextResponse.json({ error: priceRes.error || "تعذر تحديد سعر المحتوى" }, { status: 400 });
    }

    const basePrice = priceRes.originalPrice ?? priceRes.expectedPrice;

    const validation = await DiscountService.validateDiscountCode({
      code: code.trim(),
      studentId: session.id,
      purchaseType,
      targetId,
      basePrice,
      paymentMethod: paymentMethod || "wallet_balance",
    });

    if (!validation.valid || !validation.pricing) {
      return NextResponse.json({ error: validation.error || "كود الخصم غير صالح" }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      code: validation.discountCode?.code,
      discountType: validation.discountCode?.discountType,
      discountValue: validation.discountCode?.discountValue,
      originalPrice: validation.pricing.originalPrice,
      discountAmount: validation.pricing.discountAmount,
      finalPrice: validation.pricing.finalPrice,
      itemName: priceRes.itemName,
      message: `تم تطبيق الخصم بنجاح (-${validation.pricing.discountAmount} جنيه) 🎉`,
    });
  } catch (error) {
    console.error("[checkout/discount] error:", error);
    return NextResponse.json({ error: "حدث خطأ أثناء فحص كود الخصم" }, { status: 500 });
  }
}
