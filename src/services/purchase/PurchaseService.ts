import { prisma } from "@/lib/prisma";
import { randomBytes } from "crypto";
import { acquireAdvisoryLock } from "@/lib/distributed-lock";
import { processTeacherAttribution } from "@/lib/referral";
import { ReferralService } from "@/services/referral/ReferralService";
import { DiscountService, PurchaseType } from "@/services/discount/DiscountService";
import { isValidCurrencyAmount, verifyAuthoritativePrice } from "@/lib/price-verifier";
import { isTester, canBypassPayment, logTesterActivity } from "@/lib/tester";
import { getPlanMonths } from "@/lib/subscription-terms";
import { termForSale, yearEndFor, ownsActiveTerm, applyTeacherTerms } from "@/lib/teacher-terms";

export interface BasePurchaseParams {
  studentId: string;
  discountCode?: string;
  promoCodeInput?: string;
  paymentMethod?: string; // "wallet_balance" | "vf_cash" | "fawry" | "split" | etc.
  tx?: any;
}

export interface CoursePurchaseParams extends BasePurchaseParams {
  courseId: string;
}

export interface FolderPurchaseParams extends BasePurchaseParams {
  folderId: string;
}

export interface VideoPurchaseParams extends BasePurchaseParams {
  videoId: string;
}

export interface PlanPurchaseParams extends BasePurchaseParams {
  planId: string;
}

export interface TeacherSubscriptionPurchaseParams extends BasePurchaseParams {
  teacherId: string;
  planType: string; // "monthly" | "termly" | "yearly"
  languageTrack?: string;
  studentGrade?: string;
  studentPhone?: string;
  studentName?: string;
  monthNumber?: number;
}

export interface PurchaseResult {
  success: boolean;
  error?: string;
  alreadyOwned?: boolean;
  insufficientFunds?: boolean;
  requiredAmount?: number;
  missingAmount?: number;
  originalPrice?: number;
  discountAmount?: number;
  finalPrice?: number;
  newBalance?: number;
  discountApplied?: boolean;
  itemTitle?: string;
  itemType?: PurchaseType;
  enrollmentId?: string;
  message?: string;
}

export interface MoneyCodePurchaseContextParams {
  studentId: string;
  moneyCode: string;
  purchaseType?: PurchaseType;
  targetId?: string;
  discountCode?: string;
  // Specific params
  planType?: string;
  studentGrade?: string;
  languageTrack?: string;
  promoCodeInput?: string;
}

export interface MoneyCodePurchaseContextResult {
  success: boolean;
  error?: string;
  codeClaimed: boolean;
  credited: number;
  newBalance: number;
  itemPurchased: boolean;
  requiredAmount?: number;
  missingAmount?: number;
  spent?: number;
  remainingBalance?: number;
  discountApplied?: boolean;
  discountAmount?: number;
  message: string;
}

export interface SplitFundingParams {
  studentId: string;
  purchaseType: PurchaseType;
  targetId: string;
  walletDeduction: number;
  gatewayAmount: number;
  discountCode?: string;
  promoCodeInput?: string;
  // Specific params
  planType?: string;
  studentGrade?: string;
  languageTrack?: string;
  tx?: any;
}

export class PurchaseService {
  // ────────────────────────────────────────────────────────────────────────────
  // 1. COURSE PURCHASE
  // ────────────────────────────────────────────────────────────────────────────
  static async purchaseCourse(params: CoursePurchaseParams): Promise<PurchaseResult> {
    const { studentId, courseId, discountCode, promoCodeInput, paymentMethod = "wallet_balance" } = params;

    const course = await prisma.course.findUnique({
      where: { id: courseId },
      select: {
        id: true,
        title: true,
        teacherId: true,
        isPaid: true,
        price: true,
        discountPercent: true,
        discountExpiresAt: true,
      },
    });

    if (!course) return { success: false, error: "الكورس غير موجود" };

    // Calculate base authoritative price
    const now = new Date();
    const courseDiscountActive =
      course.discountPercent != null &&
      course.discountPercent > 0 &&
      (course.discountExpiresAt == null || course.discountExpiresAt > now);

    let basePrice = 0;
    if (course.isPaid && course.price) {
      if (courseDiscountActive && course.discountPercent) {
        basePrice = +(course.price * (1 - course.discountPercent / 100)).toFixed(2);
      } else {
        basePrice = course.price;
      }
    }

    if (!isValidCurrencyAmount(basePrice)) {
      return { success: false, error: "هذا الكورس مجاني — استخدم زر التسجيل المباشر" };
    }

    // Apply Discount Code if provided
    let finalPrice = basePrice;
    let discountAmount = 0;
    let validatedDiscount: any = null;

    if (discountCode) {
      const discountValidation = await DiscountService.validateDiscountCode({
        code: discountCode,
        studentId,
        purchaseType: "COURSE",
        targetId: courseId,
        basePrice,
        paymentMethod,
      });

      if (!discountValidation.valid) {
        return { success: false, error: discountValidation.error };
      }

      validatedDiscount = discountValidation.discountCode;
      discountAmount = discountValidation.pricing?.discountAmount ?? 0;
      finalPrice = discountValidation.pricing?.finalPrice ?? basePrice;
    }

    const runInTx = async (tx: any) => {
      // 1. Acquire advisory lock
      await acquireAdvisoryLock(`spend:${studentId}`, tx);

      if (validatedDiscount) {
        await acquireAdvisoryLock(`discount:${validatedDiscount.id}`, tx);
        const discountValidation = await DiscountService.validateDiscountCode({
          code: discountCode!,
          studentId,
          purchaseType: "COURSE",
          targetId: courseId,
          basePrice,
          paymentMethod,
          tx,
        });
        if (!discountValidation.valid) {
          return { success: false, error: discountValidation.error };
        }
        validatedDiscount = discountValidation.discountCode;
        discountAmount = discountValidation.pricing?.discountAmount ?? 0;
        finalPrice = discountValidation.pricing?.finalPrice ?? basePrice;
      }

      // Check tester account mode bypass
      const studentUser = await tx.user.findUnique({
        where: { id: studentId },
        select: { id: true, balance: true, accountMode: true, testerCapabilities: true },
      });

      if (studentUser && isTester(studentUser) && canBypassPayment(studentUser)) {
        const existingDirect = await tx.courseEnrollment.findUnique({
          where: { studentId_courseId: { studentId, courseId } },
        });
        const existingCode = await tx.accessCode.findFirst({
          where: { courseId, studentId, isActive: true },
        });

        if (existingDirect || existingCode) {
          return { success: false, alreadyOwned: true, error: "أنت مسجل في هذا الكورس بالفعل" };
        }

        const enrollment = await tx.courseEnrollment.create({
          data: {
            courseId,
            studentId,
            fulfillmentSource: "TESTER_BYPASS",
            amountPaid: 0,
          },
        });

        await logTesterActivity({
          testerId: studentId,
          action: "PAYMENT_BYPASS",
          targetId: courseId,
          targetTitle: course.title,
          details: { purchaseType: "COURSE", basePrice },
          tx,
        });

        return {
          success: true,
          itemTitle: course.title,
          itemType: "COURSE" as PurchaseType,
          originalPrice: basePrice,
          discountAmount: 0,
          finalPrice: 0,
          newBalance: studentUser.balance,
          enrollmentId: enrollment.id,
          message: "تم تفعيل اشتراك الكورس لحساب الفحص (Test Mode)",
        };
      }

      // 2. Check not already enrolled
      const existing = await tx.accessCode.findFirst({
        where: { courseId, studentId },
        select: { id: true },
      });
      if (existing) {
        return { success: false, alreadyOwned: true, error: "أنت مسجل في هذا الكورس بالفعل" };
      }

      // 3. Conditional atomic wallet deduction if payable via balance
      if (paymentMethod === "wallet_balance" || paymentMethod === "balance") {
        if (finalPrice > 0) {
          const claim = await tx.user.updateMany({
            where: { id: studentId, balance: { gte: finalPrice } },
            data: { balance: { decrement: finalPrice } },
          });

          if (claim.count === 0) {
            const user = await tx.user.findUnique({ where: { id: studentId }, select: { balance: true } });
            return {
              success: false,
              insufficientFunds: true,
              requiredAmount: finalPrice,
              missingAmount: Math.max(0, finalPrice - (user?.balance ?? 0)),
              error: `رصيد محفظتك غير كافٍ (${user?.balance ?? 0} جنيه). تحتاج إلى ${finalPrice} جنيه.`,
            };
          }

          // Balance transaction
          await tx.balanceTransaction.create({
            data: {
              userId: studentId,
              type: "debit_course",
              amount: -finalPrice,
              note: `شراء كورس: ${course.title}${discountAmount > 0 ? ` (خصم ${discountAmount} ج)` : ""}`,
            },
          });
        }
      }

      // 4. Create AccessCode for fulfillment
      const codeStr = `PAY-${Date.now().toString(36).toUpperCase()}-${randomBytes(3).toString("hex").toUpperCase()}`;
      const accessCode = await tx.accessCode.create({
        data: {
          code: codeStr,
          courseId,
          studentId,
          isActive: true,
          usedAt: now,
        },
      });

      // 5. Record discount usage if applied
      if (validatedDiscount && discountAmount > 0) {
        await DiscountService.recordUsage(
          {
            discountCodeId: validatedDiscount.id,
            studentId,
            purchaseType: "COURSE",
            purchaseTargetId: courseId,
            originalPrice: basePrice,
            discountAmount,
            finalPrice,
            paymentMethod,
          },
          tx
        );
      }

      // 6. Process Teacher Referral Attribution
      await processTeacherAttribution({
        studentId,
        teacherIdOfContent: course.teacherId,
        amount: finalPrice,
        purchaseType: "COURSE",
        courseId: course.id,
        promoCodeInput,
        tx,
      });

      // 7. Referral reward check
      await ReferralService.qualifyAndRewardReferral(studentId, `course:${course.id}`, tx);

      const freshUser = await tx.user.findUnique({ where: { id: studentId }, select: { balance: true } });

      return {
        success: true,
        itemTitle: course.title,
        itemType: "COURSE" as PurchaseType,
        originalPrice: basePrice,
        discountAmount,
        finalPrice,
        discountApplied: discountAmount > 0,
        newBalance: freshUser?.balance ?? 0,
        enrollmentId: accessCode.id,
        message: "تم شراء الكورس وتفعيله بنجاح!",
      };
    };

    if (params.tx) {
      return runInTx(params.tx);
    }
    return prisma.$transaction(runInTx);
  }

  // ────────────────────────────────────────────────────────────────────────────
  // 2. FOLDER PURCHASE
  // ────────────────────────────────────────────────────────────────────────────
  static async purchaseFolder(params: FolderPurchaseParams): Promise<PurchaseResult> {
    const { studentId, folderId, discountCode, promoCodeInput, paymentMethod = "wallet_balance" } = params;

    const folder = await prisma.folder.findUnique({
      where: { id: folderId },
      include: { course: { select: { id: true, teacherId: true, title: true } } },
    });

    if (!folder) return { success: false, error: "المحاضرة غير موجودة" };
    if (!folder.isPurchasable) {
      return { success: false, error: "هذه المحاضرة غير متاحة للشراء منفرداً — يمكنك شراء الكورس كاملاً" };
    }

    const basePrice = folder.price ?? 0;
    if (!isValidCurrencyAmount(basePrice)) {
      return { success: false, error: "هذه المحاضرة مجانية" };
    }

    let finalPrice = basePrice;
    let discountAmount = 0;
    let validatedDiscount: any = null;

    if (discountCode) {
      const discountValidation = await DiscountService.validateDiscountCode({
        code: discountCode,
        studentId,
        purchaseType: "FOLDER",
        targetId: folderId,
        basePrice,
        paymentMethod,
      });

      if (!discountValidation.valid) {
        return { success: false, error: discountValidation.error };
      }

      validatedDiscount = discountValidation.discountCode;
      discountAmount = discountValidation.pricing?.discountAmount ?? 0;
      finalPrice = discountValidation.pricing?.finalPrice ?? basePrice;
    }

    const runInTx = async (tx: any) => {
      await acquireAdvisoryLock(`spend:${studentId}`, tx);

      if (validatedDiscount) {
        await acquireAdvisoryLock(`discount:${validatedDiscount.id}`, tx);
        const discountValidation = await DiscountService.validateDiscountCode({
          code: discountCode!,
          studentId,
          purchaseType: "FOLDER",
          targetId: folderId,
          basePrice,
          paymentMethod,
          tx,
        });
        if (!discountValidation.valid) {
          return { success: false, error: discountValidation.error };
        }
        validatedDiscount = discountValidation.discountCode;
        discountAmount = discountValidation.pricing?.discountAmount ?? 0;
        finalPrice = discountValidation.pricing?.finalPrice ?? basePrice;
      }

      // Check tester account mode bypass
      const studentUser = await tx.user.findUnique({
        where: { id: studentId },
        select: { id: true, balance: true, accountMode: true, testerCapabilities: true },
      });

      if (studentUser && isTester(studentUser) && canBypassPayment(studentUser)) {
        const existing = await tx.folderPurchase.findUnique({
          where: { studentId_folderId: { studentId, folderId } },
        });
        if (existing) {
          return { success: false, alreadyOwned: true, error: "لقد اشتريت هذه المحاضرة مسبقاً" };
        }

        const purchase = await tx.folderPurchase.create({
          data: { studentId, folderId, price: 0 },
        });

        await logTesterActivity({
          testerId: studentId,
          action: "PAYMENT_BYPASS",
          targetId: folderId,
          targetTitle: folder.name,
          details: { purchaseType: "FOLDER", basePrice },
          tx,
        });

        return {
          success: true,
          itemTitle: folder.name,
          itemType: "FOLDER" as PurchaseType,
          originalPrice: basePrice,
          discountAmount: 0,
          finalPrice: 0,
          newBalance: studentUser.balance,
          enrollmentId: purchase.id,
          message: "تم تفعيل المحاضرة لحساب الفحص (Test Mode)",
        };
      }

      const existing = await tx.folderPurchase.findUnique({
        where: { studentId_folderId: { studentId, folderId } },
      });
      if (existing) {
        return { success: false, alreadyOwned: true, error: "لقد اشتريت هذه المحاضرة مسبقاً" };
      }

      if (paymentMethod === "wallet_balance" || paymentMethod === "balance") {
        if (finalPrice > 0) {
          const claim = await tx.user.updateMany({
            where: { id: studentId, balance: { gte: finalPrice } },
            data: { balance: { decrement: finalPrice } },
          });

          if (claim.count === 0) {
            const user = await tx.user.findUnique({ where: { id: studentId }, select: { balance: true } });
            return {
              success: false,
              insufficientFunds: true,
              requiredAmount: finalPrice,
              missingAmount: Math.max(0, finalPrice - (user?.balance ?? 0)),
              error: `رصيد محفظتك غير كافٍ (${user?.balance ?? 0} جنيه). تحتاج إلى ${finalPrice} جنيه.`,
            };
          }

          await tx.balanceTransaction.create({
            data: {
              userId: studentId,
              type: "debit_course",
              amount: -finalPrice,
              note: `شراء محاضرة: ${folder.name}${discountAmount > 0 ? ` (خصم ${discountAmount} ج)` : ""}`,
            },
          });
        }
      }

      const purchase = await tx.folderPurchase.create({
        data: { studentId, folderId, price: finalPrice },
      });

      if (validatedDiscount && discountAmount > 0) {
        await DiscountService.recordUsage(
          {
            discountCodeId: validatedDiscount.id,
            studentId,
            purchaseType: "FOLDER",
            purchaseTargetId: folderId,
            originalPrice: basePrice,
            discountAmount,
            finalPrice,
            paymentMethod,
          },
          tx
        );
      }

      await processTeacherAttribution({
        studentId,
        teacherIdOfContent: folder.course.teacherId,
        amount: finalPrice,
        purchaseType: "FOLDER",
        folderId,
        courseId: folder.course.id,
        promoCodeInput,
        tx,
      });

      await ReferralService.qualifyAndRewardReferral(studentId, `folder:${folder.id}`, tx);
      const freshUser = await tx.user.findUnique({ where: { id: studentId }, select: { balance: true } });

      return {
        success: true,
        itemTitle: folder.name,
        itemType: "FOLDER" as PurchaseType,
        originalPrice: basePrice,
        discountAmount,
        finalPrice,
        discountApplied: discountAmount > 0,
        newBalance: freshUser?.balance ?? 0,
        enrollmentId: purchase.id,
        message: "تم شراء المحاضرة وتفعيلها بنجاح!",
      };
    };

    if (params.tx) {
      return runInTx(params.tx);
    }
    return prisma.$transaction(runInTx);
  }

  // ────────────────────────────────────────────────────────────────────────────
  // 3. VIDEO PURCHASE
  // ────────────────────────────────────────────────────────────────────────────
  static async purchaseVideo(params: VideoPurchaseParams): Promise<PurchaseResult> {
    const { studentId, videoId, discountCode, promoCodeInput, paymentMethod = "wallet_balance" } = params;

    const video = await prisma.video.findUnique({
      where: { id: videoId },
      include: { folder: { include: { course: { select: { id: true, teacherId: true, title: true } } } } },
    });

    if (!video) return { success: false, error: "الدرس غير موجود" };

    const basePrice = video.price ?? 0;
    if (!isValidCurrencyAmount(basePrice)) {
      return { success: false, error: "هذا الدرس مجاني" };
    }

    let finalPrice = basePrice;
    let discountAmount = 0;
    let validatedDiscount: any = null;

    if (discountCode) {
      const discountValidation = await DiscountService.validateDiscountCode({
        code: discountCode,
        studentId,
        purchaseType: "VIDEO",
        targetId: videoId,
        basePrice,
        paymentMethod,
      });

      if (!discountValidation.valid) {
        return { success: false, error: discountValidation.error };
      }

      validatedDiscount = discountValidation.discountCode;
      discountAmount = discountValidation.pricing?.discountAmount ?? 0;
      finalPrice = discountValidation.pricing?.finalPrice ?? basePrice;
    }

    const runInTx = async (tx: any) => {
      await acquireAdvisoryLock(`spend:${studentId}`, tx);

      if (validatedDiscount) {
        await acquireAdvisoryLock(`discount:${validatedDiscount.id}`, tx);
        const discountValidation = await DiscountService.validateDiscountCode({
          code: discountCode!,
          studentId,
          purchaseType: "VIDEO",
          targetId: videoId,
          basePrice,
          paymentMethod,
          tx,
        });
        if (!discountValidation.valid) {
          return { success: false, error: discountValidation.error };
        }
        validatedDiscount = discountValidation.discountCode;
        discountAmount = discountValidation.pricing?.discountAmount ?? 0;
        finalPrice = discountValidation.pricing?.finalPrice ?? basePrice;
      }

      // Check tester account mode bypass
      const studentUser = await tx.user.findUnique({
        where: { id: studentId },
        select: { id: true, balance: true, accountMode: true, testerCapabilities: true },
      });

      if (studentUser && isTester(studentUser) && canBypassPayment(studentUser)) {
        const existing = await tx.videoPurchase.findUnique({
          where: { studentId_videoId: { studentId, videoId } },
        });
        if (existing) {
          return { success: false, alreadyOwned: true, error: "لقد اشتريت هذا الدرس مسبقاً" };
        }

        const purchase = await tx.videoPurchase.create({
          data: { studentId, videoId, price: 0 },
        });

        await logTesterActivity({
          testerId: studentId,
          action: "PAYMENT_BYPASS",
          targetId: videoId,
          targetTitle: video.title,
          details: { purchaseType: "VIDEO", basePrice },
          tx,
        });

        return {
          success: true,
          itemTitle: video.title,
          itemType: "VIDEO" as PurchaseType,
          originalPrice: basePrice,
          discountAmount: 0,
          finalPrice: 0,
          newBalance: studentUser.balance,
          enrollmentId: purchase.id,
          message: "تم تفعيل الدرس لحساب الفحص (Test Mode)",
        };
      }

      const existing = await tx.videoPurchase.findUnique({
        where: { studentId_videoId: { studentId, videoId } },
      });
      if (existing) {
        return { success: false, alreadyOwned: true, error: "لقد اشتريت هذا الدرس مسبقاً" };
      }

      if (paymentMethod === "wallet_balance" || paymentMethod === "balance") {
        if (finalPrice > 0) {
          const claim = await tx.user.updateMany({
            where: { id: studentId, balance: { gte: finalPrice } },
            data: { balance: { decrement: finalPrice } },
          });

          if (claim.count === 0) {
            const user = await tx.user.findUnique({ where: { id: studentId }, select: { balance: true } });
            return {
              success: false,
              insufficientFunds: true,
              requiredAmount: finalPrice,
              missingAmount: Math.max(0, finalPrice - (user?.balance ?? 0)),
              error: `رصيد محفظتك غير كافٍ (${user?.balance ?? 0} جنيه). تحتاج إلى ${finalPrice} جنيه.`,
            };
          }

          await tx.balanceTransaction.create({
            data: {
              userId: studentId,
              type: "debit_course",
              amount: -finalPrice,
              note: `شراء درس: ${video.title}${discountAmount > 0 ? ` (خصم ${discountAmount} ج)` : ""}`,
            },
          });
        }
      }

      const purchase = await tx.videoPurchase.create({
        data: { studentId, videoId, price: finalPrice },
      });

      if (validatedDiscount && discountAmount > 0) {
        await DiscountService.recordUsage(
          {
            discountCodeId: validatedDiscount.id,
            studentId,
            purchaseType: "VIDEO",
            purchaseTargetId: videoId,
            originalPrice: basePrice,
            discountAmount,
            finalPrice,
            paymentMethod,
          },
          tx
        );
      }

      await processTeacherAttribution({
        studentId,
        teacherIdOfContent: video.folder.course.teacherId,
        amount: finalPrice,
        purchaseType: "VIDEO",
        videoId,
        folderId: video.folder.id,
        courseId: video.folder.course.id,
        promoCodeInput,
        tx,
      });

      await ReferralService.qualifyAndRewardReferral(studentId, `video:${video.id}`, tx);
      const freshUser = await tx.user.findUnique({ where: { id: studentId }, select: { balance: true } });

      return {
        success: true,
        itemTitle: video.title,
        itemType: "VIDEO" as PurchaseType,
        originalPrice: basePrice,
        discountAmount,
        finalPrice,
        discountApplied: discountAmount > 0,
        newBalance: freshUser?.balance ?? 0,
        enrollmentId: purchase.id,
        message: "تم شراء الدرس بنجاح!",
      };
    };

    if (params.tx) {
      return runInTx(params.tx);
    }
    return prisma.$transaction(runInTx);
  }

  // ────────────────────────────────────────────────────────────────────────────
  // 4. PLAN PURCHASE
  // ────────────────────────────────────────────────────────────────────────────
  static async purchasePlan(params: PlanPurchaseParams): Promise<PurchaseResult> {
    const { studentId, planId, discountCode, paymentMethod = "wallet_balance" } = params;

    const plan = await prisma.plan.findUnique({
      where: { id: planId },
    });

    if (!plan || plan.status !== "published") {
      return { success: false, error: "الخطة الدراسية غير متاحة" };
    }

    const planPrice = plan.price ?? 0;
    if (!isValidCurrencyAmount(planPrice, true)) {
      return { success: false, error: "Invalid plan price" };
    }
    let basePrice = planPrice;
    if (
      plan.discountPrice !== null &&
      plan.discountPrice !== undefined &&
      plan.discountExpiresAt &&
      new Date(plan.discountExpiresAt) > new Date()
    ) {
      if (!isValidCurrencyAmount(plan.discountPrice, true)) {
        return { success: false, error: "Invalid plan discount price" };
      }
      basePrice = plan.discountPrice;
    }

    const student = await prisma.user.findUnique({
      where: { id: studentId },
      select: { educationalStage: true },
    });

    if (student?.educationalStage && plan.educationalStage && student.educationalStage !== plan.educationalStage) {
      return { success: false, error: "هذه الخطة مخصصة لمرحلة دراسية مختلفة عن مرحلتك" };
    }

    let finalPrice = basePrice;
    let discountAmount = 0;
    let validatedDiscount: any = null;

    if (discountCode) {
      const discountValidation = await DiscountService.validateDiscountCode({
        code: discountCode,
        studentId,
        purchaseType: "PLAN",
        targetId: planId,
        basePrice,
        paymentMethod,
      });

      if (!discountValidation.valid) {
        return { success: false, error: discountValidation.error };
      }

      validatedDiscount = discountValidation.discountCode;
      discountAmount = discountValidation.pricing?.discountAmount ?? 0;
      finalPrice = discountValidation.pricing?.finalPrice ?? basePrice;
    }

    const runInTx = async (tx: any) => {
      await acquireAdvisoryLock(`spend:${studentId}`, tx);

      if (validatedDiscount) {
        await acquireAdvisoryLock(`discount:${validatedDiscount.id}`, tx);
        const discountValidation = await DiscountService.validateDiscountCode({
          code: discountCode!,
          studentId,
          purchaseType: "PLAN",
          targetId: planId,
          basePrice,
          paymentMethod,
          tx,
        });
        if (!discountValidation.valid) {
          return { success: false, error: discountValidation.error };
        }
        validatedDiscount = discountValidation.discountCode;
        discountAmount = discountValidation.pricing?.discountAmount ?? 0;
        finalPrice = discountValidation.pricing?.finalPrice ?? basePrice;
      }

      // Check tester account mode bypass
      const studentUser = await tx.user.findUnique({
        where: { id: studentId },
        select: { id: true, balance: true, accountMode: true, testerCapabilities: true },
      });

      if (studentUser && isTester(studentUser) && canBypassPayment(studentUser)) {
        const alreadyEnrolled = await tx.planEnrollment.findUnique({
          where: { planId_studentId: { planId, studentId } },
        });
        if (alreadyEnrolled) {
          return { success: false, alreadyOwned: true, error: "أنت مسجل بالفعل في هذه الخطة" };
        }

        const durationDays = plan.durationDays > 0 ? plan.durationDays : 365;
        const enrollment = await tx.planEnrollment.create({
          data: {
            planId,
            studentId,
            pricePaid: 0,
            expiresAt: new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000),
          },
        });

        await logTesterActivity({
          testerId: studentId,
          action: "PAYMENT_BYPASS",
          targetId: planId,
          targetTitle: plan.title,
          details: { purchaseType: "PLAN", basePrice },
          tx,
        });

        return {
          success: true,
          itemTitle: plan.title,
          itemType: "PLAN" as PurchaseType,
          originalPrice: basePrice,
          discountAmount: 0,
          finalPrice: 0,
          newBalance: studentUser.balance,
          enrollmentId: enrollment.id,
          message: "تم تفعيل الخطة الدراسية لحساب الفحص (Test Mode)",
        };
      }

      const alreadyEnrolled = await tx.planEnrollment.findUnique({
        where: { planId_studentId: { planId, studentId } },
      });
      if (alreadyEnrolled) {
        return { success: false, alreadyOwned: true, error: "أنت مسجل بالفعل في هذه الخطة" };
      }

      if (paymentMethod === "wallet_balance" || paymentMethod === "balance") {
        if (finalPrice > 0) {
          const claim = await tx.user.updateMany({
            where: { id: studentId, balance: { gte: finalPrice } },
            data: { balance: { decrement: finalPrice } },
          });

          if (claim.count === 0) {
            const user = await tx.user.findUnique({ where: { id: studentId }, select: { balance: true } });
            return {
              success: false,
              insufficientFunds: true,
              requiredAmount: finalPrice,
              missingAmount: Math.max(0, finalPrice - (user?.balance ?? 0)),
              error: `رصيد محفظتك غير كافٍ (${user?.balance ?? 0} جنيه). تحتاج إلى ${finalPrice} جنيه.`,
            };
          }

          await tx.balanceTransaction.create({
            data: {
              userId: studentId,
              type: "debit_purchase",
              amount: -finalPrice,
              note: `شراء الخطة الدراسية: ${plan.title}${discountAmount > 0 ? ` (خصم ${discountAmount} ج)` : ""}`,
            },
          });
        }
      }

      const durationDays = plan.durationDays > 0 ? plan.durationDays : 365;
      const enrollment = await tx.planEnrollment.create({
        data: {
          planId,
          studentId,
          pricePaid: finalPrice,
          expiresAt: new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000),
        },
      });

      if (validatedDiscount && discountAmount > 0) {
        await DiscountService.recordUsage(
          {
            discountCodeId: validatedDiscount.id,
            studentId,
            purchaseType: "PLAN",
            purchaseTargetId: planId,
            originalPrice: basePrice,
            discountAmount,
            finalPrice,
            paymentMethod,
          },
          tx
        );
      }

      await ReferralService.qualifyAndRewardReferral(studentId, `plan:${plan.id}`, tx);
      const freshUser = await tx.user.findUnique({ where: { id: studentId }, select: { balance: true } });

      return {
        success: true,
        itemTitle: plan.title,
        itemType: "PLAN" as PurchaseType,
        originalPrice: basePrice,
        discountAmount,
        finalPrice,
        discountApplied: discountAmount > 0,
        newBalance: freshUser?.balance ?? 0,
        enrollmentId: enrollment.id,
        message: "تم الاشتراك في الخطة بنجاح!",
      };
    };

    if (params.tx) {
      return runInTx(params.tx);
    }
    return prisma.$transaction(runInTx, { timeout: 60000 });
  }

  // ────────────────────────────────────────────────────────────────────────────
  // 5. TEACHER SUBSCRIPTION PURCHASE
  // ────────────────────────────────────────────────────────────────────────────
  static async purchaseTeacherSubscription(params: TeacherSubscriptionPurchaseParams): Promise<PurchaseResult> {
    const { studentId, teacherId, planType, languageTrack, studentGrade, discountCode, paymentMethod = "wallet_balance" } = params;
    const db = params.tx || prisma;

    if (teacherId === studentId) {
      return { success: false, error: "لا يمكنك الاشتراك في حسابك الخاص" };
    }

    const teacherUser = await db.user.findUnique({
      where: { id: teacherId },
      select: { id: true, role: true, isActive: true, isDeleted: true },
    });

    if (!teacherUser || teacherUser.role !== "teacher" || !teacherUser.isActive || teacherUser.isDeleted) {
      return { success: false, error: "معلم غير متاح أو غير محدد" };
    }

    const validPlanTypes = ["monthly", "termly", "yearly"];
    if (!planType || !validPlanTypes.includes(planType)) {
      return { success: false, error: "نوع الباقة غير صحيح" };
    }

    const priceResult = await verifyAuthoritativePrice({
      amount: 999999,
      teacherId,
      planType,
      grade: studentGrade,
      languageTrack,
      studentId,
    });

    if (!priceResult.valid || !priceResult.expectedPrice) {
      return { success: false, error: priceResult.error || "تعذر تحديد سعر باقة المعلم" };
    }

    const basePrice = priceResult.expectedPrice;
    let finalPrice = basePrice;
    let discountAmount = 0;
    let validatedDiscount: any = null;

    if (discountCode) {
      const discountValidation = await DiscountService.validateDiscountCode({
        code: discountCode,
        studentId,
        purchaseType: "TEACHER_SUB",
        targetId: teacherId,
        basePrice,
        paymentMethod,
      });

      if (!discountValidation.valid) {
        return { success: false, error: discountValidation.error };
      }

      validatedDiscount = discountValidation.discountCode;
      discountAmount = discountValidation.pricing?.discountAmount ?? 0;
      finalPrice = discountValidation.pricing?.finalPrice ?? basePrice;
    }

    const months = getPlanMonths(planType);
    const isLanguages = languageTrack === "languages" || languageTrack === "english";

    const profile = await db.teacherProfile.findUnique({
      where: { teacherId },
      select: { displayName: true, slug: true },
    });
    const teacherName = profile?.displayName || profile?.slug || "المعلم";
    const planNames: Record<string, string> = {
      monthly: "اشتراك شهري",
      termly: "ترم كامل",
      yearly: "سنة كاملة",
    };
    const userDetails = await prisma.user.findUnique({
      where: { id: studentId },
      select: { name: true, phone: true, parentPhone: true, educationalStage: true },
    });

    // Teacher-defined terms ("Terms & Bookings" page). null = the teacher has not
    // set up terms for this grade, and the booking keeps the legacy duration rules.
    const termStage = studentGrade || userDetails?.educationalStage || null;
    const saleTerm = planType === "termly" ? await termForSale(teacherId, termStage) : null;
    const yearEnd = planType === "yearly" ? await yearEndFor(teacherId, termStage) : null;

    if (saleTerm && saleTerm.termNumber === null) {
      return { success: false, error: "حجز الترم غير متاح حالياً عند هذا المعلم" };
    }
    const { getTeacherPkgSettings } = await import("@/lib/teacher-packages");
    const pkgConfig = await getTeacherPkgSettings(teacherId);

    if (isLanguages && pkgConfig.englishBookingEnabled === false) {
      return { success: false, error: "حجز مسار اللغات (English) غير متاح حالياً عند هذا المعلم" };
    }

    // Monthly renewal target calculation & prerequisite check
    const existingMonthlySub = await db.teacherSubscription.findUnique({
      where: { studentId_teacherId_planType: { studentId, teacherId, planType } },
      select: { expiresAt: true, status: true, termNumbers: true },
    });

    let targetMonthNumber = params.monthNumber;
    if (planType === "monthly") {
      const isCurrentlyActive =
        existingMonthlySub &&
        existingMonthlySub.status === "active" &&
        (!existingMonthlySub.expiresAt || existingMonthlySub.expiresAt > new Date());

      let ownedMonths = (existingMonthlySub?.termNumbers || [])
        .filter((n: any) => typeof n === "number" && n > 0)
        .sort((a: number, b: number) => a - b);
      if (ownedMonths.length === 0 && isCurrentlyActive) {
        ownedMonths = [1];
      }
      const highestOwned = ownedMonths.length > 0 ? ownedMonths[ownedMonths.length - 1] : 0;

      if (!targetMonthNumber) {
        targetMonthNumber = highestOwned > 0 ? highestOwned + 1 : (pkgConfig.monthNumber || 1);
      }

      // Check if already active and owns this month
      if (isCurrentlyActive && ownedMonths.includes(targetMonthNumber)) {
        return { success: false, error: `أنت مشترك بالفعل في الشهر ${targetMonthNumber} مع هذا المعلم` };
      }

      // Sequential renewal enforcement
      if (pkgConfig.enforceSequentialRenewal !== false && targetMonthNumber > 1) {
        if (!ownedMonths.includes(targetMonthNumber - 1)) {
          const prevMonthConfig = pkgConfig.months?.find((m) => m.number === targetMonthNumber - 1);
          const prevMonthName = prevMonthConfig?.name || `الشهر ${targetMonthNumber - 1}`;
          return {
            success: false,
            error: `يجب الاشتراك في ${prevMonthName} أولاً لتتمكن من التجديد للشهر ${targetMonthNumber}`,
          };
        }
      }
    }

    const termLabel = saleTerm ? (saleTerm.termNumber === 2 ? "الترم الثاني" : "الترم الأول") : null;
    const targetMonthConfig =
      planType === "monthly" ? pkgConfig.months?.find((m) => m.number === targetMonthNumber) : null;
    const basePlanLabel =
      planType === "monthly"
        ? (targetMonthConfig?.name || pkgConfig.monthlyName || `حجز الشهر ${targetMonthNumber}`)
        : planType === "termly"
        ? (termLabel || pkgConfig.termlyName || planNames.termly)
        : (pkgConfig.yearlyName || planNames.yearly);
    const planLabel = `${basePlanLabel} ${isLanguages ? "(لغات)" : "(عربي)"}`;

    const runInTx = async (tx: any) => {
      await acquireAdvisoryLock(`spend:${studentId}`, tx);

      if (validatedDiscount) {
        await acquireAdvisoryLock(`discount:${validatedDiscount.id}`, tx);
        const discountValidation = await DiscountService.validateDiscountCode({
          code: discountCode!,
          studentId,
          purchaseType: "TEACHER_SUB",
          targetId: teacherId,
          basePrice,
          paymentMethod,
          tx,
        });
        if (!discountValidation.valid) {
          return { success: false, error: discountValidation.error };
        }
        validatedDiscount = discountValidation.discountCode;
        discountAmount = discountValidation.pricing?.discountAmount ?? 0;
        finalPrice = discountValidation.pricing?.finalPrice ?? basePrice;
      }

      // Check tester account mode bypass
      const studentUser = await tx.user.findUnique({
        where: { id: studentId },
        select: { id: true, balance: true, accountMode: true, testerCapabilities: true },
      });

      if (studentUser && isTester(studentUser) && canBypassPayment(studentUser)) {
        const now = new Date();
        const existingSub = await tx.teacherSubscription.findUnique({
          where: {
            studentId_teacherId_planType: {
              studentId,
              teacherId,
              planType,
            },
          },
        });

        const baseDate =
          existingSub && existingSub.status === "active" && existingSub.expiresAt && existingSub.expiresAt > now
            ? existingSub.expiresAt
            : now;

        let expiresAt = new Date(baseDate);
        expiresAt.setMonth(expiresAt.getMonth() + months);
        const testerTerms = applyTeacherTerms(existingSub, saleTerm, yearEnd, now);
        if (testerTerms.expiresAt) expiresAt = testerTerms.expiresAt;

        const effectiveTesterTerms =
          planType === "monthly" && targetMonthNumber
            ? [...new Set([...((existingSub?.termNumbers as number[]) || []), targetMonthNumber])].sort((a, b) => a - b)
            : testerTerms.termNumbers && testerTerms.termNumbers.length > 0
            ? testerTerms.termNumbers
            : null;

        const sub = await tx.teacherSubscription.upsert({
          where: {
            studentId_teacherId_planType: {
              studentId,
              teacherId,
              planType,
            },
          },
          create: {
            studentId,
            teacherId,
            planType,
            planLabel,
            amount: 0,
            educationalStage: studentGrade || userDetails?.educationalStage || "الكل",
            languageTrack: languageTrack || "arabic",
            studentName: userDetails?.name || "طالب تجريبي",
            studentPhone: userDetails?.phone || "01000000000",
            parentPhone: userDetails?.parentPhone || "01000000000",
            paymentSource: "TESTER_BYPASS",
            status: "active",
            expiresAt,
            ...(effectiveTesterTerms ? { termNumbers: effectiveTesterTerms } : {}),
          },
          update: {
            ...(effectiveTesterTerms ? { termNumbers: effectiveTesterTerms } : {}),
            status: "active",
            expiresAt,
            amount: 0,
            paymentSource: "TESTER_BYPASS",
          },
        });

        await logTesterActivity({
          testerId: studentId,
          action: "PAYMENT_BYPASS",
          targetId: teacherId,
          targetTitle: `اشتراك معلم (${planType})`,
          details: { purchaseType: "TEACHER_SUB", teacherId, planType, basePrice },
          tx,
        });

        return {
          success: true,
          itemTitle: `اشتراك المعلم: ${teacherName}`,
          itemType: "TEACHER_SUB" as PurchaseType,
          originalPrice: basePrice,
          discountAmount: 0,
          finalPrice: 0,
          newBalance: studentUser.balance,
          enrollmentId: sub.id,
          message: "تم تفعيل اشتراك المعلم لحساب الفحص (Test Mode)",
        };
      }

      // Never charge the wallet twice for a term the student already owns.
      if (saleTerm && (paymentMethod === "wallet_balance" || paymentMethod === "balance")) {
        const owned = await tx.teacherSubscription.findUnique({
          where: { studentId_teacherId_planType: { studentId, teacherId, planType } },
          select: { status: true, expiresAt: true, termNumbers: true },
        });
        if (ownsActiveTerm(owned, saleTerm.termNumber!)) {
          return { success: false, error: `أنت مشترك بالفعل في ${termLabel} مع هذا المعلم` };
        }
      }

      if (paymentMethod === "wallet_balance" || paymentMethod === "balance") {
        if (finalPrice > 0) {
          const claim = await tx.user.updateMany({
            where: { id: studentId, balance: { gte: finalPrice } },
            data: { balance: { decrement: finalPrice } },
          });

          if (claim.count === 0) {
            const user = await tx.user.findUnique({ where: { id: studentId }, select: { balance: true } });
            return {
              success: false,
              insufficientFunds: true,
              requiredAmount: finalPrice,
              missingAmount: Math.max(0, finalPrice - (user?.balance ?? 0)),
              error: `رصيد محفظتك (${user?.balance ?? 0} جنيه) لا يكفي لشراء الاشتراك (${finalPrice} جنيه).`,
            };
          }

          await tx.balanceTransaction.create({
            data: {
              userId: studentId,
              type: "debit_purchase",
              amount: -finalPrice,
              note: `حجز اشتراك (${planLabel}) - أستاذ ${teacherName}${discountAmount > 0 ? ` (خصم ${discountAmount} ج)` : ""}`,
            },
          });
        }
      }

      // Extension logic — extend from existing.expiresAt if active and unexpired
      const existingSub = await tx.teacherSubscription.findUnique({
        where: {
          studentId_teacherId_planType: {
            studentId,
            teacherId,
            planType,
          },
        },
        select: { expiresAt: true, status: true, termNumbers: true },
      });

      const now = new Date();
      const baseDate =
        existingSub && existingSub.status === "active" && existingSub.expiresAt && existingSub.expiresAt > now
          ? existingSub.expiresAt
          : now;

      let expiresAt = new Date(baseDate);
      expiresAt.setMonth(expiresAt.getMonth() + months);

      const { termNumbers, expiresAt: termExpiresAt } = applyTeacherTerms(existingSub, saleTerm, yearEnd, now);
      if (termExpiresAt) expiresAt = termExpiresAt;

      const effectiveTermNumbers =
        planType === "monthly" && targetMonthNumber
          ? [...new Set([...((existingSub?.termNumbers as number[]) || []), targetMonthNumber])].sort((a, b) => a - b)
          : termNumbers && termNumbers.length > 0
          ? termNumbers
          : null;

      const trackedLang = isLanguages ? "languages" : "arabic";
      const activeStudentPhone = params.studentPhone || userDetails?.phone || null;
      const activeStudentName = params.studentName || userDetails?.name || null;
      const source = paymentMethod === "wallet_balance" || paymentMethod === "balance" ? "WALLET" : "PAYMENT_GATEWAY";

      const sub = await tx.teacherSubscription.upsert({
        where: {
          studentId_teacherId_planType: {
            studentId,
            teacherId,
            planType,
          },
        },
        create: {
          studentId,
          teacherId,
          planType,
          planLabel,
          amount: finalPrice,
          educationalStage: studentGrade || userDetails?.educationalStage,
          languageTrack: trackedLang,
          studentName: activeStudentName,
          studentPhone: activeStudentPhone,
          parentPhone: userDetails?.parentPhone,
          paymentSource: source,
          status: "active",
          expiresAt,
          ...(effectiveTermNumbers ? { termNumbers: effectiveTermNumbers } : {}),
        },
        update: {
          ...(effectiveTermNumbers ? { termNumbers: effectiveTermNumbers } : {}),
          planLabel,
          amount: finalPrice,
          educationalStage: studentGrade || userDetails?.educationalStage,
          languageTrack: trackedLang,
          studentName: activeStudentName,
          studentPhone: activeStudentPhone,
          parentPhone: userDetails?.parentPhone,
          paymentSource: source,
          status: "active",
          expiresAt,
        },
      });

      if (validatedDiscount && discountAmount > 0) {
        await DiscountService.recordUsage(
          {
            discountCodeId: validatedDiscount.id,
            studentId,
            purchaseType: "TEACHER_SUB",
            purchaseTargetId: `${teacherId}:${planType}`,
            originalPrice: basePrice,
            discountAmount,
            finalPrice,
            paymentMethod,
          },
          tx
        );
      }

      await processTeacherAttribution({
        studentId,
        teacherIdOfContent: teacherId,
        amount: finalPrice,
        purchaseType: "TEACHER_SUB",
        tx,
      });

      await ReferralService.qualifyAndRewardReferral(studentId, `sub:${teacherId}:${planType}`, tx);
      const freshUser = await tx.user.findUnique({ where: { id: studentId }, select: { balance: true } });

      return {
        success: true,
        itemTitle: planLabel,
        itemType: "TEACHER_SUB" as PurchaseType,
        originalPrice: basePrice,
        discountAmount,
        finalPrice,
        discountApplied: discountAmount > 0,
        newBalance: freshUser?.balance ?? 0,
        enrollmentId: sub.id,
        message: "تم الاشتراك في باقة المعلم وتفعيلها بنجاح!",
      };
    };

    if (params.tx) {
      return runInTx(params.tx);
    }
    return prisma.$transaction(runInTx);
  }

  // ────────────────────────────────────────────────────────────────────────────
  // 6. MONEY CODE REDEMPTION IN PURCHASE CONTEXT (Server Authoritative)
  // ────────────────────────────────────────────────────────────────────────────
  static async processCombinedMoneyCodePurchase(
    params: MoneyCodePurchaseContextParams
  ): Promise<MoneyCodePurchaseContextResult> {
    const { studentId, moneyCode, purchaseType, targetId, discountCode, planType, studentGrade, languageTrack, promoCodeInput } = params;

    return prisma.$transaction(async (tx: any) => {
      // 1. Acquire advisory lock
      await acquireAdvisoryLock(`spend:${studentId}`, tx);

      // 2. Validate & Claim MoneyCode
      const rawCodeStr = (moneyCode || "").trim();
      const upperCodeStr = rawCodeStr.toUpperCase();
      const codeRecord = await tx.moneyCode.findFirst({
        where: {
          OR: [
            { code: moneyCode },
            { code: upperCodeStr },
            { code: rawCodeStr },
            { code: upperCodeStr.replace(/-/g, "") },
          ],
        },
      });

      if (!codeRecord) {
        throw new Error("MONEY_CODE_NOT_FOUND");
      }
      if (codeRecord.isUsed) {
        throw new Error("MONEY_CODE_ALREADY_USED");
      }
      if (codeRecord.expiresAt && codeRecord.expiresAt < new Date()) {
        throw new Error("MONEY_CODE_EXPIRED");
      }

      const claim = await tx.moneyCode.updateMany({
        where: { id: codeRecord.id, isUsed: false },
        data: { isUsed: true, usedById: studentId, usedAt: new Date() },
      });

      if (claim.count === 0) {
        throw new Error("MONEY_CODE_ALREADY_USED");
      }

      // 3. Atomically Credit Wallet Balance
      await tx.user.update({
        where: { id: studentId },
        data: { balance: { increment: codeRecord.amount } },
      });

      await tx.balanceTransaction.create({
        data: {
          userId: studentId,
          type: "credit_code",
          amount: codeRecord.amount,
          note: `شحن كود رصيد: ${codeRecord.code}`,
        },
      });

      // 4. Check if a purchase context was supplied
      if (!purchaseType || !targetId) {
        // Pure Money Code top-up
        await ReferralService.qualifyAndRewardReferral(studentId, `code:${codeRecord.code}`, tx);
        const user = await tx.user.findUnique({ where: { id: studentId }, select: { balance: true } });

        return {
          success: true,
          codeClaimed: true,
          credited: codeRecord.amount,
          newBalance: user?.balance ?? 0,
          itemPurchased: false,
          message: `تم شحن ${codeRecord.amount} جنيه إلى محفظتك بنجاح!`,
        };
      }

      // 5. Evaluate Purchase authoritatively
      let purchaseResult: PurchaseResult | null = null;

      if (purchaseType === "COURSE") {
        purchaseResult = await this.purchaseCourse({
          studentId,
          courseId: targetId,
          discountCode,
          promoCodeInput,
          paymentMethod: "wallet_balance",
          tx,
        });
      } else if (purchaseType === "FOLDER") {
        purchaseResult = await this.purchaseFolder({
          studentId,
          folderId: targetId,
          discountCode,
          promoCodeInput,
          paymentMethod: "wallet_balance",
          tx,
        });
      } else if (purchaseType === "VIDEO") {
        purchaseResult = await this.purchaseVideo({
          studentId,
          videoId: targetId,
          discountCode,
          promoCodeInput,
          paymentMethod: "wallet_balance",
          tx,
        });
      } else if (purchaseType === "PLAN") {
        purchaseResult = await this.purchasePlan({
          studentId,
          planId: targetId,
          discountCode,
          paymentMethod: "wallet_balance",
          tx,
        });
      } else if (purchaseType === "TEACHER_SUB") {
        purchaseResult = await this.purchaseTeacherSubscription({
          studentId,
          teacherId: targetId,
          planType: planType || "monthly",
          languageTrack,
          studentGrade,
          discountCode,
          paymentMethod: "wallet_balance",
          tx,
        });
      }

      const freshUser = await tx.user.findUnique({ where: { id: studentId }, select: { balance: true } });
      const currentBalance = freshUser?.balance ?? 0;

      if (purchaseResult && purchaseResult.success) {
        return {
          success: true,
          codeClaimed: true,
          credited: codeRecord.amount,
          itemPurchased: true,
          spent: purchaseResult.finalPrice ?? 0,
          newBalance: currentBalance,
          remainingBalance: currentBalance,
          discountApplied: purchaseResult.discountApplied,
          discountAmount: purchaseResult.discountAmount,
          message: `تم شحن ${codeRecord.amount} جنيه وشراء المحتوى بنجاح!`,
        };
      }

      // If purchase failed because balance is still insufficient (or item already owned)
      const reqAmount = purchaseResult?.requiredAmount;
      const missing = reqAmount ? Math.max(0, reqAmount - currentBalance) : undefined;

      return {
        success: true,
        codeClaimed: true,
        credited: codeRecord.amount,
        newBalance: currentBalance,
        itemPurchased: false,
        requiredAmount: reqAmount,
        missingAmount: missing,
        message:
          purchaseResult?.error ||
          `تم إضافة ${codeRecord.amount} جنيه إلى محفظتك. رصيدك الحالي (${currentBalance} ج) غير كافٍ لإتمام الشراء.${missing ? ` تحتاج إلى ${missing} ج إضافية.` : ""}`,
      };
    }, { maxWait: 15000, timeout: 60000 });
  }

  // ────────────────────────────────────────────────────────────────────────────
  // 7. SPLIT FUNDING FULFILLMENT (Wallet + Gateway Confirmed)
  // ────────────────────────────────────────────────────────────────────────────
  static async executeSplitFulfillment(params: SplitFundingParams): Promise<PurchaseResult> {
    const { studentId, purchaseType, targetId, walletDeduction, discountCode, promoCodeInput, planType, studentGrade, languageTrack } = params;

    const runInTx = async (tx: any) => {
      await acquireAdvisoryLock(`spend:${studentId}`, tx);

      // 1. Deduct wallet portion if > 0
      if (walletDeduction > 0) {
        const claim = await tx.user.updateMany({
          where: { id: studentId, balance: { gte: walletDeduction } },
          data: { balance: { decrement: walletDeduction } },
        });

        if (claim.count === 0) {
          throw new Error("SPLIT_WALLET_INSUFFICIENT");
        }

        await tx.balanceTransaction.create({
          data: {
            userId: studentId,
            type: purchaseType === "COURSE" || purchaseType === "FOLDER" || purchaseType === "VIDEO" ? "debit_course" : "debit_purchase",
            amount: -walletDeduction,
            note: `مساهمة المحفظة في عملية شراء مجمعة (Split Payment)`,
          },
        });
      }

      // 2. Delegate fulfillment
      let res: PurchaseResult;
      if (purchaseType === "COURSE") {
        res = await this.purchaseCourse({
          studentId,
          courseId: targetId,
          discountCode,
          promoCodeInput,
          paymentMethod: "split",
          tx,
        });
      } else if (purchaseType === "FOLDER") {
        res = await this.purchaseFolder({
          studentId,
          folderId: targetId,
          discountCode,
          promoCodeInput,
          paymentMethod: "split",
          tx,
        });
      } else if (purchaseType === "VIDEO") {
        res = await this.purchaseVideo({
          studentId,
          videoId: targetId,
          discountCode,
          promoCodeInput,
          paymentMethod: "split",
          tx,
        });
      } else if (purchaseType === "PLAN") {
        res = await this.purchasePlan({
          studentId,
          planId: targetId,
          discountCode,
          paymentMethod: "split",
          tx,
        });
      } else {
        res = await this.purchaseTeacherSubscription({
          studentId,
          teacherId: targetId,
          planType: planType || "monthly",
          languageTrack,
          studentGrade,
          discountCode,
          paymentMethod: "split",
          tx,
        });
      }

      return res;
    };

    if (params.tx) {
      return runInTx(params.tx);
    }
    return prisma.$transaction(runInTx);
  }
}
