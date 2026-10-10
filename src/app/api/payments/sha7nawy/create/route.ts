import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PurchaseService } from "@/services/purchase/PurchaseService";
import {
  createSha7nawyPayment,
  calculateAmountWithTax,
  SHA7NAWY_PENDING_TYPE,
  sha7nawyRefNote,
  normalizeEgyptianPhone,
  sha7nawyGatewayIdNote,
} from "@/lib/sha7nawy";
import {
  createShakeOutPayment,
  SHAKEOUT_PENDING_TYPE,
  shakeOutRefNote,
} from "@/lib/shakeout";
import { getPaymentMethod } from "@/lib/payment-methods";
import { paymentRateLimiter } from "@/lib/paymentRateLimiter";
import { verifyAuthoritativePrice } from "@/lib/price-verifier";
import { blockSupportView } from "@/lib/support-auth";

export async function POST(req: NextRequest) {
  const session = await getSession();
  // Defence in depth behind the proxy guard: never let a support agent act as
  // the student on grades, progress or money.
  const supportBlocked = blockSupportView(session);
  if (supportBlocked) return supportBlocked;
  if (!session) {
    return NextResponse.json({ error: "يجب تسجيل الدخول أولاً" }, { status: 401 });
  }

  const rateCheck = await paymentRateLimiter.checkRateLimit(session.id);
  if (!rateCheck.allowed) {
    return NextResponse.json(
      { error: `تم تجاوز الحد الأقصى لبدء عمليات الدفع (10 عمليات/ساعة). يرجى الانتظار لمدة ${Math.ceil(rateCheck.resetInSeconds / 60)} دقيقة.` },
      { status: 429 }
    );
  }

  try {
    const body = await req.json().catch(() => ({}));
    const {
      number,
      amount,
      method,
      courseId,
      courseTitle,
      teacherId,
      planType,
      grade,
      languageTrack,
      folderId,
      videoId,
      planId,
      discountCode,
      promoCode,
      useWalletBalance,
    } = body as {
      number?: string;
      amount?: number;
      method?: string;
      courseId?: string;
      courseTitle?: string;
      teacherId?: string;
      planType?: string;
      grade?: string;
      languageTrack?: string;
      folderId?: string;
      videoId?: string;
      planId?: string;
      discountCode?: string;
      promoCode?: string;
      useWalletBalance?: boolean;
    };

    if (!method) {
      return NextResponse.json({ error: "طريقة الدفع مطلوبة" }, { status: 400 });
    }

    const methodConfig = getPaymentMethod(method);
    if (!methodConfig) {
      return NextResponse.json({ error: "طريقة الدفع غير مدعومة" }, { status: 400 });
    }

    if (!methodConfig.available) {
      return NextResponse.json(
        { error: methodConfig.unavailableNote ?? "طريقة الدفع غير متاحة حالياً" },
        { status: 400 }
      );
    }

    const cleanNumber = number ? normalizeEgyptianPhone(number) : "";
    if (methodConfig.needsPhone && !cleanNumber) {
      return NextResponse.json({ error: "رقم المحفظة مطلوب" }, { status: 400 });
    }

    // ── Server-Side Authoritative Price Verification ──
    const priceCheck = await verifyAuthoritativePrice({
      amount: amount || 999999,
      teacherId,
      planType,
      grade,
      languageTrack,
      courseId,
      folderId,
      videoId,
      planId,
      discountCode,
      studentId: session.id,
      paymentMethod: method,
    });

    if (!priceCheck.valid) {
      return NextResponse.json(
        { error: priceCheck.error || "المبلغ المطلوب لا يطابق السعر الفعلي المعتمد." },
        { status: 400 }
      );
    }

    // Stop a student paying (by any method) for a term they already own.
    if (teacherId && planType === "termly") {
      const { termForSale, ownsActiveTerm } = await import("@/lib/teacher-terms");
      const stageUser = grade ? null : await prisma.user.findUnique({ where: { id: session.id }, select: { educationalStage: true } });
      const saleTerm = await termForSale(teacherId, grade || stageUser?.educationalStage);
      if (saleTerm && saleTerm.termNumber === null) {
        return NextResponse.json({ error: "حجز الترم غير متاح حالياً عند هذا المعلم" }, { status: 400 });
      }
      if (saleTerm && saleTerm.termNumber !== null) {
        const owned = await prisma.teacherSubscription.findUnique({
          where: { studentId_teacherId_planType: { studentId: session.id, teacherId, planType } },
          select: { status: true, expiresAt: true, termNumbers: true },
        });
        if (ownsActiveTerm(owned, saleTerm.termNumber)) {
          return NextResponse.json(
            { error: saleTerm.termNumber === 2 ? "أنت مشترك بالفعل في الترم الثاني مع هذا المعلم" : "أنت مشترك بالفعل في الترم الأول مع هذا المعلم" },
            { status: 400 }
          );
        }
      }
    }

    const verifiedFinalPrice = priceCheck.finalPrice ?? priceCheck.expectedPrice;

    // ────────────────────────────────────────────────────────────────────────
    // 1. Direct Purchase via Wallet Balance
    // ────────────────────────────────────────────────────────────────────────
    if (methodConfig.id === "wallet_balance") {
      let purchaseRes: any = null;

      if (teacherId && planType) {
        purchaseRes = await PurchaseService.purchaseTeacherSubscription({
          studentId: session.id,
          teacherId,
          planType,
          languageTrack,
          studentGrade: grade,
          discountCode,
          paymentMethod: "wallet_balance",
        });
      } else if (courseId) {
        purchaseRes = await PurchaseService.purchaseCourse({
          studentId: session.id,
          courseId,
          discountCode,
          promoCodeInput: promoCode,
          paymentMethod: "wallet_balance",
        });
      } else if (folderId) {
        purchaseRes = await PurchaseService.purchaseFolder({
          studentId: session.id,
          folderId,
          discountCode,
          promoCodeInput: promoCode,
          paymentMethod: "wallet_balance",
        });
      } else if (videoId) {
        purchaseRes = await PurchaseService.purchaseVideo({
          studentId: session.id,
          videoId,
          discountCode,
          promoCodeInput: promoCode,
          paymentMethod: "wallet_balance",
        });
      } else if (planId) {
        purchaseRes = await PurchaseService.purchasePlan({
          studentId: session.id,
          planId,
          discountCode,
          paymentMethod: "wallet_balance",
        });
      } else {
        return NextResponse.json(
          { error: "رصيد المحفظة مخصص لشراء المحتوى مباشرة. لشحن رصيد جديد اختر وسيلة دفع إلكترونية." },
          { status: 400 }
        );
      }

      if (!purchaseRes.success) {
        if (purchaseRes.insufficientFunds) {
          return NextResponse.json(
            {
              error: purchaseRes.error,
              insufficientFunds: true,
              requiredAmount: purchaseRes.requiredAmount,
              missingAmount: purchaseRes.missingAmount,
            },
            { status: 400 }
          );
        }
        return NextResponse.json({ error: purchaseRes.error || "تعذر إتمام الشراء بالرصيد" }, { status: 400 });
      }

      return NextResponse.json({
        success: true,
        isPaidWithBalance: true,
        itemTitle: purchaseRes.itemTitle,
        originalPrice: purchaseRes.originalPrice,
        discountAmount: purchaseRes.discountAmount,
        charged: purchaseRes.finalPrice,
        newBalance: purchaseRes.newBalance,
        message: purchaseRes.message || "تمت عملية الشراء من الرصيد بنجاح! 🎉",
      });
    }

    // ────────────────────────────────────────────────────────────────────────
    // 2. InstaPay Direct Option (WhatsApp Redirect)
    // ────────────────────────────────────────────────────────────────────────
    if (methodConfig.id === "instapay") {
      const whatsappNumber = (process.env.NEXT_PUBLIC_PAYMENT_ACCESS_PASSWORD || "+201118802621").replace(/\D/g, "");
      const itemName = courseTitle || priceCheck.itemName || "شحن رصيد";
      const waMsg =
        `مرحباً، أريد إتمام الدفع عبر InstaPay 💳\n` +
        `👤 اسم الطالب: ${session.name || "طالب"}\n` +
        `📚 المحتوى: ${itemName}\n` +
        `💰 المبلغ: ${verifiedFinalPrice} جنيه\n` +
        (discountCode ? `🏷️ كود الخصم: ${discountCode}\n` : "") +
        `أرجو إرسال عنوان InstaPay وتأكيد التفعيل.`;

      return NextResponse.json({
        success: true,
        provider: "internal",
        method: "instapay",
        methodLabel: "إنستاباي (InstaPay)",
        baseAmount: verifiedFinalPrice,
        taxAmount: 0,
        totalAmount: verifiedFinalPrice,
        whatsappUrl: `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(waMsg)}`,
        instructions: "حوّل المبلغ عبر تطبيق InstaPay ثم اضغط على زر واتساب لإرسال الإشعار والتفعيل الفوري.",
        reference: `IPN-${Date.now().toString(36).toUpperCase()}`,
      });
    }

    // ────────────────────────────────────────────────────────────────────────
    // 3. Combined Funding / Split Tender Evaluation (Wallet + Gateway)
    // ────────────────────────────────────────────────────────────────────────
    const student = await prisma.user.findUnique({
      where: { id: session.id },
      select: { balance: true },
    });
    const currentBalance = student?.balance ?? 0;

    let splitWalletPortion = 0;
    let payableGatewayBase = verifiedFinalPrice;

    if (useWalletBalance && currentBalance > 0 && verifiedFinalPrice > 0) {
      // Use wallet balance up to (verifiedFinalPrice - 1), ensuring at least 1 EGP goes through the gateway
      splitWalletPortion = Math.min(currentBalance, Math.max(0, verifiedFinalPrice - 1));
      payableGatewayBase = Math.max(1, Math.round((verifiedFinalPrice - splitWalletPortion) * 100) / 100);
    }

    if (methodConfig.id === "fawry") {
      payableGatewayBase = Math.max(10, payableGatewayBase);
    }

    // Calculate tax on the gateway payable amount
    const { baseAmount, taxAmount, totalAmount } = calculateAmountWithTax(payableGatewayBase, methodConfig.id);

    const origin = req.nextUrl ? req.nextUrl.origin : "https://code-up.tech";
    const appUrl = (process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL || origin).replace(/\/$/, "");

    const details = courseTitle || priceCheck.itemName
      ? `سداد: ${courseTitle || priceCheck.itemName} (${baseAmount} ج + ${methodConfig.feePercentage}% رسوم) = ${totalAmount} ج`
      : `شحن رصيد: ${baseAmount} ج (+ ${methodConfig.feePercentage}% رسوم = ${totalAmount} ج)`;

    // Query user details for reliable student identity snapshot
    const studentUser = await prisma.user.findUnique({
      where: { id: session.id },
      select: { phone: true, name: true, parentPhone: true },
    });
    const snapshotPhone = cleanNumber || (studentUser?.phone ? normalizeEgyptianPhone(studentUser.phone) : "") || number || "";
    const snapshotName = studentUser?.name || session.name || "";

    // Encode item metadata for webhook auto-fulfillment
    let itemMeta = "";
    if (teacherId && planType) {
      itemMeta = `|itemType:teacher_sub|teacherId:${teacherId}|planType:${planType}|grade:${grade || ""}|lang:${languageTrack || ""}`;
    } else if (courseId) {
      itemMeta = `|itemType:course|courseId:${courseId}`;
    } else if (folderId) {
      itemMeta = `|itemType:folder|folderId:${folderId}`;
    } else if (videoId) {
      itemMeta = `|itemType:video|videoId:${videoId}`;
    } else if (planId) {
      itemMeta = `|itemType:plan|planId:${planId}`;
    }

    if (snapshotPhone) {
      itemMeta += `|phone:${snapshotPhone}`;
    }
    if (snapshotName) {
      itemMeta += `|studentName:${encodeURIComponent(snapshotName)}`;
    }
    if (discountCode) {
      itemMeta += `|discount:${discountCode}`;
    }
    if (promoCode) {
      itemMeta += `|promo:${promoCode}`;
    }
    if (splitWalletPortion > 0) {
      itemMeta += `|splitWallet:${splitWalletPortion}|splitGateway:${baseAmount}`;
    }

    // ────────────────────────────────────────────────────────────────────────
    // 4. Route to Shake-Out (Fawry / Card)
    // ────────────────────────────────────────────────────────────────────────
    if (methodConfig.provider === "shakeout") {
      const webhookUrl = `${appUrl}/api/payments/shakeout/webhook`;
      const result = await createShakeOutPayment({
        number: snapshotPhone || number || "",
        amount: totalAmount,
        method: methodConfig.id,
        client: session.id,
        customerName: snapshotName || "Student",
        customerEmail: session.email || undefined,
        details,
        webhook_url: webhookUrl,
      });

      if (!result.status) {
        return NextResponse.json({ error: result.message }, { status: result.code || 400 });
      }

      const reference = result.data?.reference ? String(result.data.reference) : null;
      if (!reference) {
        return NextResponse.json(
          { error: "لم يتم بدء عملية الدفع بنجاح من مزود الخدمة ولم يتم خصم أي أموال. حاول مرة أخرى." },
          { status: 502 }
        );
      }

      const invoiceId = result.data?.invoice_id ? String(result.data.invoice_id) : "";
      const invoiceRef = result.data?.invoice_ref ? String(result.data.invoice_ref) : "";
      const extraRefTags = `${invoiceId ? `|inv_id:${invoiceId}` : ""}${invoiceRef ? `|inv_ref:${invoiceRef}` : ""}`;

      const soCheckoutUrl = result.data?.payment_page_url || result.data?.url || null;
      const noteText = `${shakeOutRefNote(reference)}|base:${baseAmount}|total:${totalAmount}${itemMeta}${extraRefTags}${soCheckoutUrl ? `|url:${soCheckoutUrl}` : ""}`;

      await prisma.balanceTransaction.create({
        data: {
          userId: session.id,
          type: SHAKEOUT_PENDING_TYPE,
          amount: baseAmount,
          note: noteText,
          providerRef: String(reference),
        } as any,
      });

      const finalCheckoutUrl = soCheckoutUrl || `https://dash.shake-out.com/invoice/${reference}`;

      return NextResponse.json({
        success: true,
        provider: "shakeout",
        reference: result.data?.reference,
        checkoutUrl: finalCheckoutUrl,
        method: methodConfig.id,
        methodLabel: methodConfig.label,
        baseAmount,
        taxAmount,
        totalAmount,
        walletDeduction: splitWalletPortion,
        instructions: result.message || methodConfig.shortNote,
        data: result.data,
      });
    }

    // ────────────────────────────────────────────────────────────────────────
    // 5. Route to Sha7nawy (Vodafone Cash / Mobile Wallets)
    // ────────────────────────────────────────────────────────────────────────
    const webhookUrl = `${appUrl}/api/payments/sha7nawy/webhook`;
    const result = await createSha7nawyPayment({
      number: cleanNumber || snapshotPhone || number || "",
      amount: totalAmount,
      method: methodConfig.id,
      client: session.id,
      details,
      webhook_url: webhookUrl,
    });

    if (!result.status) {
      return NextResponse.json(
        {
          error: result.message,
          suggestedAlternatives: ["instapay", "fawry"],
        },
        { status: result.code || 400 }
      );
    }

    const reference = result.data?.reference ? String(result.data.reference) : null;
    if (!reference) {
      return NextResponse.json(
        { error: "لم يتم بدء عملية الدفع بنجاح من مزود الخدمة ولم يتم خصم أي أموال. حاول مرة أخرى." },
        { status: 502 }
      );
    }

    // Capture the gateway's own transaction id alongside our reference: it is the
    // only identifier its verification endpoint accepts, and without it a payment
    // can never be confirmed after the fact.
    const gatewayTxId =
      result.data?.id ?? result.data?.transaction_id ?? result.data?.provider_transaction_id ?? null;
    const gatewayIdTag = gatewayTxId ? `|${sha7nawyGatewayIdNote(gatewayTxId)}` : "";
    if (!gatewayTxId) {
      console.warn(`[Sha7nawy Create] No gateway transaction id in create response for ref ${reference} — later verification will not be possible`);
    }

    const noteText = `${sha7nawyRefNote(reference)}|base:${baseAmount}|total:${totalAmount}${itemMeta}${gatewayIdTag}`;
    await prisma.balanceTransaction.create({
      data: {
        userId: session.id,
        type: SHA7NAWY_PENDING_TYPE,
        amount: baseAmount,
        note: noteText,
        providerRef: String(reference),
      } as any,
    });

    return NextResponse.json({
      success: true,
      provider: "sha7nawy",
      reference: result.data?.reference,
      method: methodConfig.id,
      methodLabel: methodConfig.label,
      baseAmount,
      taxAmount,
      totalAmount,
      walletDeduction: splitWalletPortion,
      instructions: result.message || methodConfig.shortNote,
      data: result.data,
    });
  } catch (error: any) {
    console.error("[Create Payment API] Error:", error);
    return NextResponse.json(
      { error: error?.message || "حدث خطأ غير متوقع أثناء بدء عملية الدفع" },
      { status: 500 }
    );
  }
}
