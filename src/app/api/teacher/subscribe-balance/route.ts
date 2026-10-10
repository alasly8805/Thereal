import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { PurchaseService } from "@/services/purchase/PurchaseService";

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "يجب تسجيل الدخول أولاً لشراء الاشتراك بالرصيد" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const { teacherId, planType, languageTrack, studentGrade, discountCode, monthNumber } = body;

    if (!teacherId || typeof teacherId !== "string") {
      return NextResponse.json({ error: "معرف الأستاذ مطلوب" }, { status: 400 });
    }

    if (teacherId === session.id) {
      return NextResponse.json({ error: "لا يمكنك الاشتراك في حسابك الخاص" }, { status: 400 });
    }

    const validPlanTypes = ["monthly", "termly", "yearly"];
    if (!planType || !validPlanTypes.includes(planType)) {
      return NextResponse.json({ error: "نوع الباقة غير صحيح" }, { status: 400 });
    }

    const result = await PurchaseService.purchaseTeacherSubscription({
      studentId: session.id,
      teacherId,
      planType,
      languageTrack,
      studentGrade,
      discountCode,
      monthNumber: typeof monthNumber === "number" ? monthNumber : undefined,
      paymentMethod: "wallet_balance",
    });

    if (!result.success) {
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
      return NextResponse.json({ error: result.error || "تعذر تفعيل الاشتراك" }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      teacherId,
      planType,
      planLabel: result.itemTitle,
      originalPrice: result.originalPrice,
      discountAmount: result.discountAmount,
      charged: result.finalPrice,
      newBalance: result.newBalance,
      message: result.message || "تم تفعيل الاشتراك بنجاح!",
    });
  } catch (error: any) {
    console.error("[subscribe-balance] error:", error);
    return NextResponse.json({ error: "حدث خطأ داخلي أثناء الاشتراك" }, { status: 500 });
  }
}
