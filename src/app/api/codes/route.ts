import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { PurchaseService } from "@/services/purchase/PurchaseService";
import { DiscountService, PurchaseType } from "@/services/discount/DiscountService";
import { blockSupportView } from "@/lib/support-auth";

const ROLE_MESSAGES: Record<string, string> = {
  teacher: "حساب المعلم لا يمكنه تفعيل أكواد الكورسات — هذا الإجراء مخصص للمتعلمين فقط.",
  staff:   "حساب الموظف لا يمكنه تفعيل أكواد الكورسات — هذا الإجراء مخصص للمتعلمين فقط.",
};

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    // Defence in depth behind the proxy guard: never let a support agent act as
    // the student on grades, progress or money.
    const supportBlocked = blockSupportView(session);
    if (supportBlocked) return supportBlocked;

    if (!session) {
      return NextResponse.json({ error: "يجب تسجيل الدخول أولاً" }, { status: 401 });
    }

    // Teacher and staff are blocked — admins and superadmins are allowed through
    if (session.role === "teacher" || session.role === "staff") {
      return NextResponse.json(
        { error: ROLE_MESSAGES[session.role] },
        { status: 403 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const { code, teacherId, planType, grade, languageTrack, courseId, folderId, videoId, planId, discountCode, promoCode } = body;
    if (!code) return NextResponse.json({ error: "الكود مطلوب" }, { status: 400 });

    const clientIp = req.headers.get("x-forwarded-for")?.split(",")[0] || "127.0.0.1";
    const { AccessCodeGuard } = await import("@/services/security/AccessCodeGuard");

    // Enforce exponential rate limiting
    const rateCheck = await AccessCodeGuard.verifyRateLimit(clientIp, session.id);
    if (!rateCheck.allowed) {
      await AccessCodeGuard.logAttempt({ ip: clientIp, userId: session.id, codeAttempted: String(code), success: false });
      return NextResponse.json(
        { error: `تم تجاوز عدد محاولات الكود المسموح بها. يرجى الانتظار ${rateCheck.lockTimeSeconds} ثانية قبل المحاولة مجدداً.` },
        { status: 429 }
      );
    }

    const normalizedCode = String(code).trim().toUpperCase();
    const rawCode = String(code).trim();

    // ────────────────────────────────────────────────────────────────────────
    // 1. Check Course / Folder / Video Access Code (Teacher or System Generated)
    // ────────────────────────────────────────────────────────────────────────
    const accessCode = await prisma.accessCode.findFirst({
      where: {
        OR: [
          { code: normalizedCode },
          { code: rawCode },
          { code: normalizedCode.replace(/-/g, "") },
        ],
      },
      include: {
        course: {
          select: {
            id: true,
            title: true,
            teacher: { select: { isDemo: true } },
          },
        },
      },
    });

    if (accessCode) {
      if (accessCode.course?.teacher?.isDemo && session.role !== "superadmin" && session.accountMode !== "TESTER") {
        await AccessCodeGuard.logAttempt({ ip: clientIp, userId: session.id, codeAttempted: normalizedCode, success: false });
        return NextResponse.json({ error: "محتوى تجريبي — الأكواد التجريبية مخصصة للمعاينة الإدارية وفاحصي الجودة فقط" }, { status: 403 });
      }

      if (accessCode.studentId) {
        await AccessCodeGuard.logAttempt({ ip: clientIp, userId: session.id, codeAttempted: normalizedCode, success: false });
        return NextResponse.json({ error: "هذا الكود مستخدم بالفعل" }, { status: 400 });
      }
      if (!accessCode.isActive) {
        await AccessCodeGuard.logAttempt({ ip: clientIp, userId: session.id, codeAttempted: normalizedCode, success: false });
        return NextResponse.json({ error: "هذا الكود غير فعال" }, { status: 400 });
      }

      try {
        const result = await prisma.$transaction(async (tx: any) => {
          let alreadyEnrolledWhere: any = { studentId: session.id };
          if (accessCode.accessType === "FOLDER" && accessCode.folderId) {
            alreadyEnrolledWhere.folderId = accessCode.folderId;
          } else if (accessCode.accessType === "VIDEO" && accessCode.videoId) {
            alreadyEnrolledWhere.videoId = accessCode.videoId;
          } else {
            alreadyEnrolledWhere.courseId = accessCode.courseId;
            alreadyEnrolledWhere.OR = [
              { accessType: "TERM" },
              { accessType: "COURSE" },
              { folderId: null, videoId: null },
            ];
          }

          const alreadyEnrolled = await tx.accessCode.findFirst({
            where: alreadyEnrolledWhere,
          });

          if (alreadyEnrolled) {
            return {
              alreadyEnrolled: true,
              courseId: accessCode.courseId,
              message: accessCode.accessType === "FOLDER"
                ? "أنت مسجل بالفعل في هذه المحاضرة"
                : accessCode.accessType === "VIDEO"
                ? "أنت مسجل بالفعل في هذا الدرس"
                : "أنت مسجل بالفعل في هذا الكورس",
            };
          }

          const updateResult = await tx.accessCode.updateMany({
            where: { id: accessCode.id, studentId: null, isActive: true },
            data: { studentId: session.id, usedAt: new Date() },
          });

          if (updateResult.count === 0) {
            throw new Error("ALREADY_USED_OR_INACTIVE");
          }

          const course = await tx.course.findUnique({
            where: { id: accessCode.courseId },
            select: { id: true, title: true },
          });

          return {
            alreadyEnrolled: false,
            courseId: accessCode.courseId,
            courseTitle: course?.title,
          };
        });

        if (result.alreadyEnrolled) {
          return NextResponse.json({
            success: true,
            courseId: result.courseId,
            message: result.message,
          });
        }

        // Log successful redemption
        await AccessCodeGuard.logAttempt({ ip: clientIp, userId: session.id, codeAttempted: normalizedCode, success: true });

        return NextResponse.json({
          success: true,
          type: "course",
          courseId: result.courseId,
          courseTitle: result.courseTitle,
          message: "تم تفعيل كود الوصول وإضافة المحتوى إلى مكتبتك بنجاح!",
        });
      } catch (err: any) {
        await AccessCodeGuard.logAttempt({ ip: clientIp, userId: session.id, codeAttempted: normalizedCode, success: false });
        if (err.message === "ALREADY_USED_OR_INACTIVE") {
          return NextResponse.json({ error: "هذا الكود مستخدم بالفعل أو غير فعال" }, { status: 400 });
        }
        throw err;
      }
    }

    // ────────────────────────────────────────────────────────────────────────
    // 2. Check Plan Access Code
    // ────────────────────────────────────────────────────────────────────────
    const planCode = await prisma.planAccessCode.findFirst({
      where: {
        OR: [
          { code: normalizedCode },
          { code: rawCode },
          { code: normalizedCode.replace(/-/g, "") },
        ],
      },
    });
    if (planCode) {
      if (planCode.usedById) {
        return NextResponse.json({ error: "هذا الكود مستخدم بالفعل" }, { status: 400 });
      }
      if (!planCode.isActive) {
        return NextResponse.json({ error: "هذا الكود غير فعال" }, { status: 400 });
      }

      try {
        const result = await prisma.$transaction(async (tx: any) => {
          const student = await tx.user.findUnique({
            where: { id: session.id },
            select: { educationalStage: true },
          });

          const plan = await tx.plan.findUnique({
            where: { id: planCode.planId },
            select: { id: true, title: true, durationDays: true, educationalStage: true },
          });

          if (!plan) throw new Error("PLAN_NOT_FOUND");

          if (student?.educationalStage && plan.educationalStage && student.educationalStage !== plan.educationalStage) {
            throw new Error("STAGE_MISMATCH");
          }

          const alreadyEnrolled = await tx.planEnrollment.findUnique({
            where: { planId_studentId: { planId: planCode.planId, studentId: session.id } },
          });

          const now = new Date();

          if (alreadyEnrolled) {
            const isExpired = alreadyEnrolled.expiresAt < now;
            if (isExpired) {
              const updateResult = await tx.planAccessCode.updateMany({
                where: { id: planCode.id, usedById: null, isActive: true },
                data: { usedById: session.id, usedAt: now, isActive: false },
              });
              if (updateResult.count === 0) {
                throw new Error("ALREADY_USED_OR_INACTIVE");
              }

              const durationDays = plan.durationDays ?? 365;
              await tx.planEnrollment.update({
                where: { id: alreadyEnrolled.id },
                data: {
                  unlockedAt: now,
                  expiresAt: new Date(now.getTime() + durationDays * 24 * 60 * 60 * 1000),
                  pricePaid: 0,
                },
              });

              return {
                renewed: true,
                planId: planCode.planId,
                planTitle: plan.title,
              };
            }

            return {
              alreadyEnrolled: true,
              planId: planCode.planId,
            };
          }

          const updateResult = await tx.planAccessCode.updateMany({
            where: { id: planCode.id, usedById: null, isActive: true },
            data: { usedById: session.id, usedAt: now, isActive: false },
          });
          if (updateResult.count === 0) {
            throw new Error("ALREADY_USED_OR_INACTIVE");
          }

          const durationDays = plan.durationDays ?? 365;
          await tx.planEnrollment.create({
            data: {
              planId: planCode.planId,
              studentId: session.id,
              pricePaid: 0,
              expiresAt: new Date(now.getTime() + durationDays * 24 * 60 * 60 * 1000),
            },
          });

          return {
            renewed: false,
            planId: planCode.planId,
            planTitle: plan.title,
          };
        });

        if (result.alreadyEnrolled) {
          return NextResponse.json({
            success: true,
            planId: result.planId,
            message: "أنت مسجل بالفعل في هذه الخطة",
          });
        }

        if (result.renewed) {
          return NextResponse.json({
            success: true,
            type: "plan",
            planId: result.planId,
            planTitle: result.planTitle,
            message: "تم تجديد اشتراكك في هذه الخطة بنجاح وتفعيل المحتوى",
          });
        }

        return NextResponse.json({
          success: true,
          type: "plan",
          planId: result.planId,
          planTitle: result.planTitle,
          message: "تم تفعيل الكود وإضافة الخطة إلى مكتبتك",
        });
      } catch (err: any) {
        if (err.message === "PLAN_NOT_FOUND") return NextResponse.json({ error: "الخطة غير موجودة" }, { status: 404 });
        if (err.message === "STAGE_MISMATCH") return NextResponse.json({ error: "هذا الكود مخصص لمرحلة دراسية مختلفة" }, { status: 400 });
        if (err.message === "ALREADY_USED_OR_INACTIVE") return NextResponse.json({ error: "هذا الكود مستخدم بالفعل أو غير فعال" }, { status: 400 });
        throw err;
      }
    }

    // ────────────────────────────────────────────────────────────────────────
    // 3. Check Money Code (Prepaid Recharge Card)
    // ────────────────────────────────────────────────────────────────────────
    const moneyCode = await prisma.moneyCode.findFirst({
      where: {
        OR: [
          { code: normalizedCode },
          { code: rawCode },
          { code: normalizedCode.replace(/-/g, "") },
        ],
      },
    });
    if (moneyCode) {
      if (moneyCode.isUsed) {
        return NextResponse.json({ error: "هذا الكود مستخدم بالفعل" }, { status: 400 });
      }
      if (moneyCode.expiresAt && moneyCode.expiresAt < new Date()) {
        return NextResponse.json({ error: "هذا الكود منتهي الصلاحية" }, { status: 400 });
      }

      // Determine purchase context if supplied
      let purchaseType: PurchaseType | undefined = undefined;
      let targetId: string | undefined = undefined;

      if (courseId) {
        purchaseType = "COURSE";
        targetId = courseId;
      } else if (folderId) {
        purchaseType = "FOLDER";
        targetId = folderId;
      } else if (videoId) {
        purchaseType = "VIDEO";
        targetId = videoId;
      } else if (planId) {
        purchaseType = "PLAN";
        targetId = planId;
      } else if (teacherId && planType) {
        purchaseType = "TEACHER_SUB";
        targetId = teacherId;
      }

      try {
        const combinedResult = await PurchaseService.processCombinedMoneyCodePurchase({
          studentId: session.id,
          moneyCode: moneyCode.code,
          purchaseType,
          targetId,
          discountCode,
          planType,
          studentGrade: grade,
          languageTrack,
          promoCodeInput: promoCode,
        });

        // Log successful attempt
        await AccessCodeGuard.logAttempt({ ip: clientIp, userId: session.id, codeAttempted: normalizedCode, success: true });

        return NextResponse.json(combinedResult);
      } catch (err: any) {
        await AccessCodeGuard.logAttempt({ ip: clientIp, userId: session.id, codeAttempted: normalizedCode, success: false });
        if (err.message === "MONEY_CODE_ALREADY_USED") {
          return NextResponse.json({ error: "هذا الكود مستخدم بالفعل" }, { status: 400 });
        }
        if (err.message === "MONEY_CODE_EXPIRED") {
          return NextResponse.json({ error: "هذا الكود منتهي الصلاحية" }, { status: 400 });
        }
        if (err.message === "MONEY_CODE_NOT_FOUND") {
          return NextResponse.json({ error: "الكود غير صحيح أو غير موجود" }, { status: 404 });
        }
        return NextResponse.json({ error: err?.message || "تعذر معالجة الكود — يرجى المحاولة مرة أخرى" }, { status: 400 });
      }
    }

    // ────────────────────────────────────────────────────────────────────────
    // 4. Check Teacher Promo Code
    // ────────────────────────────────────────────────────────────────────────
    const teacher = await prisma.user.findFirst({
      where: {
        role: "teacher",
        promoProgramEnabled: true,
        OR: [
          { promoCode: normalizedCode },
          { promoCode: rawCode },
        ],
      },
      select: { id: true, name: true, promoCode: true, promoCodeCreatedAt: true },
    });

    if (teacher && teacher.promoCodeCreatedAt) {
      const now = new Date();
      const isWithin350Days = now.getTime() - teacher.promoCodeCreatedAt.getTime() <= 350 * 24 * 60 * 60 * 1000;

      if (!isWithin350Days) {
        return NextResponse.json({ error: "كود الخصم هذا منتهي الصلاحية" }, { status: 400 });
      }

      await prisma.user.update({
        where: { id: session.id },
        data: { referredByTeacherId: teacher.id },
      });

      const existing = await prisma.teacherReferralAttribution.findFirst({
        where: { teacherId: teacher.id, studentId: session.id, purchaseType: "SIGNUP" },
      });

      if (!existing) {
        await prisma.teacherReferralAttribution.create({
          data: {
            teacherId: teacher.id,
            studentId: session.id,
            purchaseType: "SIGNUP",
            amount: 0,
            promoCodeUsed: teacher.promoCode,
          },
        });
      }

      return NextResponse.json({
        success: true,
        type: "teacher_promo",
        teacherName: teacher.name,
        message: `تم ربط حسابك بكود المعلم أ/ ${teacher.name} بنجاح!`,
      });
    }

    // ────────────────────────────────────────────────────────────────────────
    // 5. Check Discount Code (Coupon / Discount Voucher)
    // ────────────────────────────────────────────────────────────────────────
    const discountCodeRecord = await prisma.discountCode.findFirst({
      where: {
        OR: [
          { code: normalizedCode },
          { code: rawCode },
        ],
        isActive: true,
      },
    });

    if (discountCodeRecord) {
      const now = new Date();
      if (discountCodeRecord.expiresAt && discountCodeRecord.expiresAt < now) {
        return NextResponse.json({ error: "كود الخصم منتهي الصلاحية" }, { status: 400 });
      }

      let purchaseType: PurchaseType | undefined = undefined;
      let targetId: string | undefined = undefined;

      if (courseId) {
        purchaseType = "COURSE";
        targetId = courseId;
      } else if (folderId) {
        purchaseType = "FOLDER";
        targetId = folderId;
      } else if (videoId) {
        purchaseType = "VIDEO";
        targetId = videoId;
      } else if (planId) {
        purchaseType = "PLAN";
        targetId = planId;
      } else if (teacherId && planType) {
        purchaseType = "TEACHER_SUB";
        targetId = teacherId;
      }

      if (purchaseType && targetId) {
        const { verifyAuthoritativePrice } = await import("@/lib/price-verifier");
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
        const discountValidation = await DiscountService.validateDiscountCode({
          code: discountCodeRecord.code,
          studentId: session.id,
          purchaseType,
          targetId,
          basePrice,
        });

        if (!discountValidation.valid || !discountValidation.pricing) {
          return NextResponse.json({ error: discountValidation.error || "كود الخصم غير صالح لهذا المحتوى" }, { status: 400 });
        }

        const finalPrice = discountValidation.pricing.finalPrice;
        const user = await prisma.user.findUnique({ where: { id: session.id }, select: { balance: true } });
        const userBalance = user?.balance ?? 0;

        if (finalPrice === 0 || userBalance >= finalPrice) {
          let purchaseResult: any = null;
          if (purchaseType === "COURSE") {
            purchaseResult = await PurchaseService.purchaseCourse({
              studentId: session.id,
              courseId: targetId,
              discountCode: discountCodeRecord.code,
              promoCodeInput: promoCode,
              paymentMethod: "wallet_balance",
            });
          } else if (purchaseType === "FOLDER") {
            purchaseResult = await PurchaseService.purchaseFolder({
              studentId: session.id,
              folderId: targetId,
              discountCode: discountCodeRecord.code,
              promoCodeInput: promoCode,
              paymentMethod: "wallet_balance",
            });
          } else if (purchaseType === "VIDEO") {
            purchaseResult = await PurchaseService.purchaseVideo({
              studentId: session.id,
              videoId: targetId,
              discountCode: discountCodeRecord.code,
              promoCodeInput: promoCode,
              paymentMethod: "wallet_balance",
            });
          } else if (purchaseType === "PLAN") {
            purchaseResult = await PurchaseService.purchasePlan({
              studentId: session.id,
              planId: targetId,
              discountCode: discountCodeRecord.code,
              paymentMethod: "wallet_balance",
            });
          } else if (purchaseType === "TEACHER_SUB") {
            purchaseResult = await PurchaseService.purchaseTeacherSubscription({
              studentId: session.id,
              teacherId: targetId,
              planType: planType || "monthly",
              languageTrack,
              studentGrade: grade,
              discountCode: discountCodeRecord.code,
              paymentMethod: "wallet_balance",
            });
          }

          if (purchaseResult && purchaseResult.success) {
            await AccessCodeGuard.logAttempt({ ip: clientIp, userId: session.id, codeAttempted: normalizedCode, success: true });
            return NextResponse.json({
              success: true,
              type: "discount_purchase",
              message: purchaseResult.message || "تم تطبيق الخصم وتفعيل المحتوى بنجاح! 🎉",
            });
          } else {
            return NextResponse.json({ error: purchaseResult?.error || "تعذر إتمام العملية باستخدام الكود" }, { status: 400 });
          }
        } else {
          return NextResponse.json({
            success: true,
            type: "discount_applied",
            code: discountCodeRecord.code,
            discountAmount: discountValidation.pricing.discountAmount,
            finalPrice,
            message: `تم تطبيق خصم بقيمة ${discountValidation.pricing.discountAmount} جنيه. السعر المتبقي هو ${finalPrice} جنيه.`,
          });
        }
      }

      return NextResponse.json({
        success: true,
        type: "discount",
        discountType: discountCodeRecord.discountType,
        discountValue: discountCodeRecord.discountValue,
        message: `كود خصم صالح (${discountCodeRecord.discountValue}${discountCodeRecord.discountType === "PERCENTAGE" ? "%" : " ج"} خصم). يمكنك استخدامه عند الشراء.`,
      });
    }

    await AccessCodeGuard.logAttempt({ ip: clientIp, userId: session.id, codeAttempted: normalizedCode, success: false });
    return NextResponse.json({ error: "الكود غير صحيح أو منتهي الصلاحية" }, { status: 404 });
  } catch (error) {
    console.error("[codes] error:", error);
    return NextResponse.json({ error: "حدث خطأ داخلي أثناء معالجة الكود" }, { status: 500 });
  }
}
