import { Prisma } from "@/generated/prisma";
import { isAutoEnrollEnabled } from "@/lib/fulfillment-settings";
import { prisma } from "@/lib/prisma";
import { SHAKEOUT_CREDITED_TYPE } from "@/lib/shakeout";
import { SHA7NAWY_CREDITED_TYPE } from "@/lib/sha7nawy";
import { PurchaseService } from "@/services/purchase/PurchaseService";
import { PurchaseType } from "@/services/discount/DiscountService";

export const PENDING_LEDGER_TYPES = [
  "credit_shakeout_pending",
  "credit_sha7nawy_pending",
  "credit_shakeout_expired",
  "credit_sha7nawy_expired",
] as const;

export interface FulfillmentResult {
  fulfilled: boolean;
  itemType?: "teacher_sub" | "course" | "folder" | "video" | "plan";
  itemName?: string;
  message?: string;
  error?: string;
  /** Auto-enroll is off: the money stays in the wallet and the student chooses what to buy. */
  awaitingChoice?: boolean;
}

/**
 * Parses item metadata stored inside a payment ledger note string.
 * Example note: "sha7nawy_ref:REF123|base:180|total:183.6|itemType:teacher_sub|teacherId:usr_1|planType:monthly|grade:sec_1|lang:arabic|discount:CODE20|splitWallet:50"
 */
export function parsePaymentNoteMetadata(note: string | null | undefined): Record<string, string> {
  if (!note) return {};
  const meta: Record<string, string> = {};
  const parts = note.split("|");
  for (const part of parts) {
    const colonIdx = part.indexOf(":");
    if (colonIdx > 0) {
      const key = part.substring(0, colonIdx).trim();
      const val = part.substring(colonIdx + 1).trim();
      if (key && val) {
        meta[key] = val;
      }
    }
  }
  return meta;
}

/**
 * Fulfills pending purchases (Teacher Subscription, Course, Folder, Video, Study Plan)
 * when a payment transaction is successfully confirmed/credited via gateway webhook.
 * Seamlessly handles direct gateway payments, discount codes, and split-funding contributions.
 */
export async function fulfillPendingItemPurchase({
  userId,
  note,
  tx,
}: {
  userId: string;
  note: string;
  tx: any;
}): Promise<FulfillmentResult> {
  const meta = parsePaymentNoteMetadata(note);
  const itemType = meta.itemType;

  if (!itemType) {
    return { fulfilled: false, message: "لا ينطبق — عملية شحن رصيد عامة" };
  }

  // Owner switch: with auto-enroll off, nothing is bought on the student's behalf.
  // The payment is already in their wallet (split-wallet portions are only
  // charged below, so none is taken), and they choose on /choose-course.
  if (!(await isAutoEnrollEnabled(tx || undefined))) {
    return {
      fulfilled: false,
      awaitingChoice: true,
      itemType: itemType as FulfillmentResult["itemType"],
      message: "تم إضافة المبلغ لمحفظتك ✅ اختار الكورس أو الحجز اللي عايز تشترك فيه",
    };
  }

  const baseAmount = meta.base ? parseFloat(meta.base) : 0;
  const splitWallet = meta.splitWallet ? parseFloat(meta.splitWallet) : 0;
  const discountCode = meta.discount || meta.discountCode || undefined;
  const promoCodeInput = meta.promo || meta.promoCode || undefined;

  // Handle Split Funding if splitWallet was recorded
  if (splitWallet > 0) {
    let targetId = "";
    let pType: PurchaseType = "COURSE";

    if (itemType === "course" && meta.courseId) {
      targetId = meta.courseId;
      pType = "COURSE";
    } else if (itemType === "folder" && meta.folderId) {
      targetId = meta.folderId;
      pType = "FOLDER";
    } else if (itemType === "video" && meta.videoId) {
      targetId = meta.videoId;
      pType = "VIDEO";
    } else if (itemType === "plan" && meta.planId) {
      targetId = meta.planId;
      pType = "PLAN";
    } else if (itemType === "teacher_sub" && meta.teacherId) {
      targetId = meta.teacherId;
      pType = "TEACHER_SUB";
    }

    if (targetId) {
      const splitRes = await PurchaseService.executeSplitFulfillment({
        studentId: userId,
        purchaseType: pType,
        targetId,
        walletDeduction: splitWallet,
        gatewayAmount: baseAmount,
        discountCode,
        promoCodeInput,
        planType: meta.planType,
        studentGrade: meta.grade,
        languageTrack: meta.lang,
        tx,
      });

      if (splitRes.success) {
        if (baseAmount > 0) {
          await tx.user.update({
            where: { id: userId },
            data: { balance: { decrement: baseAmount } },
          });

          await tx.balanceTransaction.create({
            data: {
              userId,
              type: pType === "COURSE" || pType === "FOLDER" || pType === "VIDEO" ? "debit_course" : "debit_purchase",
              amount: -baseAmount,
              note: `سداد حصة بوابة الدفع في الشراء المجمع: ${splitRes.itemTitle || targetId}`,
            },
          });
        }

        return {
          fulfilled: true,
          itemType: itemType as any,
          itemName: splitRes.itemTitle,
          message: splitRes.message || "تم إتمام الشراء المجمع وتفعيل المحتوى بنجاح!",
        };
      }
      return {
        fulfilled: false,
        error: splitRes.error || "فشل إتمام الشراء المجمع",
      };
    }
  }

  // 1. Teacher Subscription Auto-Fulfillment
  if (itemType === "teacher_sub" && meta.teacherId && meta.planType) {
    const studentPhone = meta.phone || meta.studentPhone || undefined;
    const studentName = meta.studentName ? decodeURIComponent(meta.studentName) : undefined;

    const res = await PurchaseService.purchaseTeacherSubscription({
      studentId: userId,
      teacherId: meta.teacherId,
      planType: meta.planType,
      languageTrack: meta.lang,
      studentGrade: meta.grade,
      studentPhone,
      studentName,
      discountCode,
      paymentMethod: "gateway_direct",
      tx,
    });

    if (res.success) {
      // Deduct balance that was credited for the payment
      if (baseAmount > 0) {
        await tx.user.update({
          where: { id: userId },
          data: { balance: { decrement: baseAmount } },
        });

        await tx.balanceTransaction.create({
          data: {
            userId,
            type: "debit_purchase",
            amount: -baseAmount,
            note: `تفعيل تلقائي لحجز اشتراك (${res.itemTitle || "معلم"})`,
          },
        });
      }

      // Generate in-app student confirmation notification
      await tx.notification.create({
        data: {
          userId,
          type: "payment_success",
          title: "تم تأكيد عملية الدفع بنجاح 🎉",
          body: `تم استلام دفعتك بنجاح (${baseAmount} ج.م) وتأكيد اشتراكك في (${res.itemTitle || meta.planType}). إذا كان موعد الكورس في وقت لاحق، ستتاح المحاضرات تلقائياً فور بدء موعد الدراسة.`,
          link: "/account",
        },
      }).catch(() => {});

      if (meta.teacherId) {
        await tx.notification.create({
          data: {
            userId: meta.teacherId,
            type: "new_subscriber",
            title: "طالب جديد اشترك في باقتك 🎓",
            body: `قام الطالب ${studentName || "طالب"} بالاشتراك في (${res.itemTitle || meta.planType}) بمبلغ ${baseAmount} ج.م.`,
            link: "/adminpanel/teacher",
          },
        }).catch(() => {});
      }

      return {
        fulfilled: true,
        itemType: "teacher_sub",
        itemName: res.itemTitle,
        message: res.message || "تم حجز وتفعيل اشتراك المعلم تلقائياً بنجاح! 🎉",
      };
    }

    return { fulfilled: false, error: res.error };
  }

  // 2. Course Auto-Fulfillment
  if (itemType === "course" && meta.courseId) {
    const res = await PurchaseService.purchaseCourse({
      studentId: userId,
      courseId: meta.courseId,
      discountCode,
      promoCodeInput,
      paymentMethod: "gateway_direct",
      tx,
    });

    if (res.success) {
      if (baseAmount > 0) {
        await tx.user.update({
          where: { id: userId },
          data: { balance: { decrement: baseAmount } },
        });

        await tx.balanceTransaction.create({
          data: {
            userId,
            type: "debit_course",
            amount: -baseAmount,
            note: `تفعيل تلقائي لشراء كورس: ${res.itemTitle || meta.courseId}`,
          },
        });
      }

      return {
        fulfilled: true,
        itemType: "course",
        itemName: res.itemTitle,
        message: res.message || `تم تفعيل الكورس تلقائياً بنجاح! 🎉`,
      };
    }

    return { fulfilled: false, error: res.error };
  }

  // 3. Folder Auto-Fulfillment
  if (itemType === "folder" && meta.folderId) {
    const res = await PurchaseService.purchaseFolder({
      studentId: userId,
      folderId: meta.folderId,
      discountCode,
      promoCodeInput,
      paymentMethod: "gateway_direct",
      tx,
    });

    if (res.success) {
      if (baseAmount > 0) {
        await tx.user.update({
          where: { id: userId },
          data: { balance: { decrement: baseAmount } },
        });

        await tx.balanceTransaction.create({
          data: {
            userId,
            type: "debit_course",
            amount: -baseAmount,
            note: `تفعيل تلقائي لشراء محاضرة: ${res.itemTitle || meta.folderId}`,
          },
        });
      }

      return {
        fulfilled: true,
        itemType: "folder",
        itemName: res.itemTitle,
        message: res.message || `تم تفعيل المحاضرة تلقائياً بنجاح! 🎉`,
      };
    }

    return { fulfilled: false, error: res.error };
  }

  // 4. Video Auto-Fulfillment
  if (itemType === "video" && meta.videoId) {
    const res = await PurchaseService.purchaseVideo({
      studentId: userId,
      videoId: meta.videoId,
      discountCode,
      promoCodeInput,
      paymentMethod: "gateway_direct",
      tx,
    });

    if (res.success) {
      if (baseAmount > 0) {
        await tx.user.update({
          where: { id: userId },
          data: { balance: { decrement: baseAmount } },
        });

        await tx.balanceTransaction.create({
          data: {
            userId,
            type: "debit_course",
            amount: -baseAmount,
            note: `تفعيل تلقائي لشراء درس: ${res.itemTitle || meta.videoId}`,
          },
        });
      }

      return {
        fulfilled: true,
        itemType: "video",
        itemName: res.itemTitle,
        message: res.message || `تم تفعيل الدرس تلقائياً بنجاح! 🎉`,
      };
    }

    return { fulfilled: false, error: res.error };
  }

  // 5. Study Plan Auto-Fulfillment
  if (itemType === "plan" && meta.planId) {
    const res = await PurchaseService.purchasePlan({
      studentId: userId,
      planId: meta.planId,
      discountCode,
      paymentMethod: "gateway_direct",
      tx,
    });

    if (res.success) {
      if (baseAmount > 0) {
        await tx.user.update({
          where: { id: userId },
          data: { balance: { decrement: baseAmount } },
        });

        await tx.balanceTransaction.create({
          data: {
            userId,
            type: "debit_purchase",
            amount: -baseAmount,
            note: `تفعيل تلقائي لشراء الخطة الدراسية: ${res.itemTitle || meta.planId}`,
          },
        });
      }

      return {
        fulfilled: true,
        itemType: "plan",
        itemName: res.itemTitle,
        message: res.message || `تم التسجيل في الخطة الدراسية تلقائياً بنجاح! 🎉`,
      };
    }

    return { fulfilled: false, error: res.error };
  }

  return { fulfilled: false, message: "لم يتم التعرف على نوع المحتوى المستهدف" };
}

const PLAN_AR: Record<string, string> = {
  monthly: "شهري",
  termly: "ترم",
  yearly: "سنوي",
};

/** Stable key so duplicate pending invoices for the same purchase can be collapsed. */
export function paymentItemKey(note: string | null | undefined): string {
  const meta = parsePaymentNoteMetadata(note);
  if (meta.itemType === "teacher_sub" && meta.teacherId) {
    return `teacher_sub:${meta.teacherId}:${meta.planType || ""}`;
  }
  if (meta.itemType === "course" && meta.courseId) return `course:${meta.courseId}`;
  if (meta.itemType === "folder" && meta.folderId) return `folder:${meta.folderId}`;
  if (meta.itemType === "video" && meta.videoId) return `video:${meta.videoId}`;
  if (meta.itemType === "plan" && meta.planId) return `plan:${meta.planId}`;
  return "wallet";
}

export function describePaymentItem(note: string | null | undefined): string {
  const meta = parsePaymentNoteMetadata(note);
  if (meta.itemType === "teacher_sub") {
    const plan = meta.planType ? PLAN_AR[meta.planType] || meta.planType : "";
    return plan ? `اشتراك معلم (${plan})` : "اشتراك معلم";
  }
  if (meta.itemType === "course") return "كورس";
  if (meta.itemType === "folder") return "محاضرة";
  if (meta.itemType === "video") return "درس";
  if (meta.itemType === "plan") return "خطة دراسية";
  return "شحن رصيد";
}

export function creditedTypeForLedger(type: string): string | null {
  if (type.includes("shakeout")) return SHAKEOUT_CREDITED_TYPE;
  if (type.includes("sha7nawy")) return SHA7NAWY_CREDITED_TYPE;
  return null;
}

export function expiredTypeForLedger(type: string): string | null {
  if (type.includes("shakeout")) return "credit_shakeout_expired";
  if (type.includes("sha7nawy")) return "credit_sha7nawy_expired";
  return null;
}

export async function claimPendingPaymentAsPaid(args: {
  transactionId: string;
  noteSuffix: string;
}): Promise<{
  ok: boolean;
  alreadyPaid?: boolean;
  error?: string;
  userId?: string;
  amount?: number;
  note?: string | null;
  type?: string;
  fulfillment?: FulfillmentResult;
  cancelledDuplicates?: number;
}> {
  const existing = await prisma.balanceTransaction.findUnique({
    where: { id: args.transactionId },
    select: { id: true, userId: true, type: true, amount: true, note: true },
  });

  if (!existing) {
    return { ok: false, error: "المعاملة غير موجودة" };
  }

  const creditedType = creditedTypeForLedger(existing.type);
  if (existing.type === SHAKEOUT_CREDITED_TYPE || existing.type === SHA7NAWY_CREDITED_TYPE) {
    return {
      ok: true,
      alreadyPaid: true,
      userId: existing.userId,
      amount: existing.amount,
      note: existing.note,
      type: existing.type,
    };
  }

  if (!creditedType || !PENDING_LEDGER_TYPES.includes(existing.type as (typeof PENDING_LEDGER_TYPES)[number])) {
    return { ok: false, error: "هذه المعاملة ليست دفعة معلّقة" };
  }

  let fulfillment: FulfillmentResult | undefined;
  let cancelledDuplicates = 0;

  const claimed = await prisma.$transaction(
    async (tx: Prisma.TransactionClient) => {
      cancelledDuplicates = 0;
      const claim = await tx.balanceTransaction.updateMany({
        where: { id: existing.id, type: existing.type },
        data: {
          type: creditedType,
          note: `${existing.note || ""} — ${args.noteSuffix}`.trim(),
        },
      });
      if (claim.count === 0) return false;

      await tx.user.update({
        where: { id: existing.userId },
        data: { balance: { increment: existing.amount } },
      });

      fulfillment = await fulfillPendingItemPurchase({
        userId: existing.userId,
        note: existing.note || "",
        tx,
      });

      const itemKey = paymentItemKey(existing.note);
      if (itemKey !== "wallet") {
        const siblings = await tx.balanceTransaction.findMany({
          where: {
            userId: existing.userId,
            id: { not: existing.id },
            type: { in: [...PENDING_LEDGER_TYPES] },
          },
          select: { id: true, type: true, note: true },
        });
        const expiredType = expiredTypeForLedger(existing.type) || "credit_shakeout_expired";
        for (const row of siblings) {
          if (paymentItemKey(row.note) !== itemKey) continue;
          await tx.balanceTransaction.update({
            where: { id: row.id },
            data: {
              type: expiredType,
              note: `${row.note || ""} — أُلغيت كمحاولة مكررة بعد تفعيل الدفعة`.trim(),
            },
          });
          cancelledDuplicates += 1;
        }
      }

      return true;
    },
    { timeout: 20000, maxWait: 10000 }
  );

  if (!claimed) {
    return { ok: false, error: "تعذر تأكيد المعاملة — ربما أكّدها شخص آخر للتو" };
  }

  return {
    ok: true,
    userId: existing.userId,
    amount: existing.amount,
    note: existing.note,
    type: creditedType,
    fulfillment,
    cancelledDuplicates,
  };
}
