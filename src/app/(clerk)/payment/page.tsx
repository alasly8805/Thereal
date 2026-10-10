"use client";

import { useState, useEffect, useCallback, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Navbar } from "@/components/ui/Navbar";
import { Footer } from "@/components/ui/Footer";
import { useToast } from "@/components/ui/Toast";
import {
  listPaymentMethods,
  getPaymentMethod,
} from "@/lib/payment-methods";
import { validateVodafoneCashPhone, validateEgyptianPhone, normalizeEgyptianPhone, calculateAmountWithTax } from "@/lib/sha7nawy";
import { PaymentMethodGrid } from "@/components/payment/PaymentMethodGrid";
import { LoadingState } from "@/components/payment/LoadingState";
import { ErrorState } from "@/components/payment/ErrorState";

type Step = "checkout" | "instructions" | "success" | "error";

interface PaymentIntent {
  reference: string;
  method: string;
  totalAmount: number;
  instructions: string;
  transactionId?: string | number;
  paymentPageUrl?: string;
  walletDeduction?: number;
}

interface AppliedDiscount {
  code: string;
  discountType: "PERCENTAGE" | "FIXED_AMOUNT";
  discountValue: number;
  originalPrice: number;
  discountAmount: number;
  finalPrice: number;
}

function PaymentContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { success: toastSuccess, error: toastError } = useToast();

  const amountParam = searchParams.get("amount");
  const methodParam = searchParams.get("method");
  const returnHref = searchParams.get("return");
  const teacherIdParam = searchParams.get("teacherId");
  const teacherNameParam = searchParams.get("teacherName");
  const planTypeParam = searchParams.get("planType");
  const planLabelParam = searchParams.get("planLabel");
  const gradeParam = searchParams.get("grade");
  const courseIdParam = searchParams.get("courseId");
  const folderIdParam = searchParams.get("folderId");
  const videoIdParam = searchParams.get("videoId");
  const planIdParam = searchParams.get("planId");
  const languageTrackParam = searchParams.get("languageTrack");
  const contextParam = searchParams.get("context");

  const [step, setStep] = useState<Step>("checkout");
  const [baseAmount, setBaseAmount] = useState<string>(() => {
    if (amountParam && Number(amountParam) > 0) return String(Number(amountParam));
    if (planTypeParam) {
      const planPriceMap: Record<string, string> = { monthly: "180", termly: "750", yearly: "1200" };
      return planPriceMap[planTypeParam] || "180";
    }
    return "180";
  });
  const [isPriceLocked, setIsPriceLocked] = useState(false);
  const [verifiedItemName, setVerifiedItemName] = useState<string>(() => {
    if (planLabelParam) return planLabelParam;
    if (contextParam) return contextParam;
    if (teacherNameParam && planTypeParam) {
      const planNames: Record<string, string> = { monthly: "اشتراك شهري", termly: "ترم كامل", yearly: "سنة كاملة" };
      return `اشتراك ${planNames[planTypeParam] || "معلم"} — الأستاذ ${teacherNameParam}`;
    }
    return "";
  });
  const [selectedMethodId, setSelectedMethodId] = useState<string>("vf_cash");
  const [phone, setPhone] = useState("");
  const [phoneError, setPhoneError] = useState("");
  const [code, setCode] = useState("");
  const [codeError, setCodeError] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [isCheckingStatus, setIsCheckingStatus] = useState(false);
  const [checkMessage, setCheckMessage] = useState<string | null>(null);
  const [intent, setIntent] = useState<PaymentIntent | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);

  // 🏷️ Discount Code state
  const [discountInput, setDiscountInput] = useState("");
  const [isApplyingDiscount, setIsApplyingDiscount] = useState(false);
  const [appliedDiscount, setAppliedDiscount] = useState<AppliedDiscount | null>(null);

  // ⚡ Split Payment / Combined Funding state
  const [useWalletBalance, setUseWalletBalance] = useState<boolean>(true);

  // 15-Minute Countdown Timer for Payment Instructions
  const [timeLeftSeconds, setTimeLeftSeconds] = useState<number>(15 * 60);

  const [user, setUser] = useState<{ id: string; name: string; role: string; balance?: number; phone?: string | null } | null>(null);
  const [userLoading, setUserLoading] = useState(true);

  const allMethods = listPaymentMethods();
  const availableMethods = allMethods.filter((m) => m.available);
  const selectedMethod = getPaymentMethod(selectedMethodId) || availableMethods[0];

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.user) {
          // Not pre-filling the number box: students kept paying with their own
          // phone while the wallet was on another line. Non-wallet methods still
          // fall back to the account phone on submit.
          setUser({ id: d.user.id, name: d.user.name, role: d.user.role, balance: d.user.balance, phone: d.user.phone });
        } else {
          setUser(null);
        }
      })
      .catch(() => setUser(null))
      .finally(() => setUserLoading(false));
  }, []);

  // ── Authoritative Server-Side Price Lookup on Load ──
  useEffect(() => {
    const fetchAuthoritativePrice = async () => {
      const hasSpecificItem = teacherIdParam || courseIdParam || folderIdParam || videoIdParam || planIdParam;

      if (amountParam && Number(amountParam) > 0) {
        setBaseAmount(String(Number(amountParam)));
      } else if (planTypeParam) {
        const planPriceMap: Record<string, string> = { monthly: "180", termly: "750", yearly: "1200" };
        if (planPriceMap[planTypeParam]) setBaseAmount(planPriceMap[planTypeParam]);
      }

      if (planLabelParam) setVerifiedItemName(planLabelParam);
      else if (contextParam) setVerifiedItemName(contextParam);
      else if (teacherNameParam && planTypeParam) {
        const planNames: Record<string, string> = { monthly: "اشتراك شهري", termly: "ترم كامل", yearly: "سنة كاملة" };
        setVerifiedItemName(`اشتراك ${planNames[planTypeParam] || "معلم"} — الأستاذ ${teacherNameParam}`);
      }

      if (hasSpecificItem) {
        setIsPriceLocked(true);
        try {
          const query = new URLSearchParams();
          if (teacherIdParam) query.set("teacherId", teacherIdParam);
          if (planTypeParam) query.set("planType", planTypeParam);
          if (gradeParam) query.set("grade", gradeParam);
          if (languageTrackParam) query.set("languageTrack", languageTrackParam);
          if (courseIdParam) query.set("courseId", courseIdParam);
          if (folderIdParam) query.set("folderId", folderIdParam);
          if (videoIdParam) query.set("videoId", videoIdParam);
          if (planIdParam) query.set("planId", planIdParam);
          if (amountParam) query.set("amount", amountParam);

          const res = await fetch(`/api/payments/quote?${query.toString()}`);
          if (res.ok) {
            const data = await res.json();
            if (data.expectedPrice > 0) {
              setBaseAmount(String(data.expectedPrice));
            }
            if (data.itemName) {
              setVerifiedItemName(data.itemName);
            }
          } else {
            if (amountParam && Number(amountParam) > 0) {
              setBaseAmount(String(Number(amountParam)));
            }
          }
        } catch {
          if (amountParam && Number(amountParam) > 0) {
            setBaseAmount(String(Number(amountParam)));
          }
        }
      } else if (amountParam) {
        const amt = Number(amountParam);
        if (amt > 0) setBaseAmount(String(amt));
      }
    };

    fetchAuthoritativePrice();

    if (methodParam) {
      const found = getPaymentMethod(methodParam);
      if (found && found.available) {
        setSelectedMethodId(found.id);
      } else if (found && !found.available) {
        setSelectedMethodId("vf_cash");
      }
    }
  }, [
    amountParam,
    methodParam,
    teacherIdParam,
    teacherNameParam,
    planTypeParam,
    planLabelParam,
    gradeParam,
    languageTrackParam,
    courseIdParam,
    folderIdParam,
    videoIdParam,
    planIdParam,
    contextParam,
  ]);

  // ── Apply Discount Code Handler ──
  const handleApplyDiscount = async () => {
    if (!discountInput.trim()) {
      toastError("يرجى إدخال كود الخصم أولاً");
      return;
    }

    setIsApplyingDiscount(true);
    try {
      const res = await fetch("/api/checkout/discount", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: discountInput.trim(),
          teacherId: teacherIdParam || undefined,
          planType: planTypeParam || undefined,
          grade: gradeParam || undefined,
          languageTrack: languageTrackParam || undefined,
          courseId: courseIdParam || undefined,
          folderId: folderIdParam || undefined,
          videoId: videoIdParam || undefined,
          planId: planIdParam || undefined,
          paymentMethod: selectedMethodId,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        toastError(data.error || "كود الخصم غير صالح");
        setAppliedDiscount(null);
      } else {
        setAppliedDiscount({
          code: data.code,
          discountType: data.discountType,
          discountValue: data.discountValue,
          originalPrice: data.originalPrice,
          discountAmount: data.discountAmount,
          finalPrice: data.finalPrice,
        });
        setBaseAmount(String(data.finalPrice));
        toastSuccess(data.message || "تم تطبيق كود الخصم بنجاح! 🎉");
      }
    } catch {
      toastError("تعذر التحقق من كود الخصم");
    } finally {
      setIsApplyingDiscount(false);
    }
  };

  const handleRemoveDiscount = () => {
    setAppliedDiscount(null);
    setDiscountInput("");
    if (appliedDiscount) {
      setBaseAmount(String(appliedDiscount.originalPrice));
    }
    toastSuccess("تم إزالة كود الخصم");
  };

  // ── Timer Countdown ──
  useEffect(() => {
    if (step !== "instructions") return;
    const interval = setInterval(() => {
      setTimeLeftSeconds((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [step]);

  const formatTimer = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  const validatePhone = useCallback((val: string, methodId: string = selectedMethodId) => {
    const clean = normalizeEgyptianPhone(val);
    if (!clean) {
      setPhoneError("رقم المحفظة مطلوب لإتمام العملية");
      return false;
    }
    if (methodId === "vf_cash") {
      if (!validateVodafoneCashPhone(clean)) {
        setPhoneError("رقم محفظة فودافون كاش يجب أن يبدأ بـ 010 ويتكون من 11 رقماً");
        return false;
      }
    } else {
      if (!validateEgyptianPhone(clean)) {
        setPhoneError("يرجى كتابة رقم هاتف مصري صحيح مكون من 11 رقماً (مثال: 010xxxxxxx)");
        return false;
      }
    }
    setPhoneError("");
    return true;
  }, [selectedMethodId]);

  const validateCode = useCallback((val: string) => {
    if (!val.trim()) {
      setCodeError("كود التفعيل مطلوب لإتمام العملية");
      return false;
    }
    setCodeError("");
    return true;
  }, []);

  // ── Price and Split Calculations ──
  const rawItemPrice = Number(baseAmount) || 0;
  const studentBalance = user?.balance ?? 0;
  const hasPartialBalance = studentBalance > 0 && studentBalance < rawItemPrice && selectedMethodId !== "wallet_balance";
  const effectiveWalletDeduction = (useWalletBalance && hasPartialBalance)
    ? Math.min(studentBalance, Math.max(0, rawItemPrice - 1))
    : 0;

  const payableToGateway = Math.max(0, rawItemPrice - effectiveWalletDeduction);
  const isFawryMinAdjusted = selectedMethodId === "fawry" && payableToGateway > 0 && payableToGateway < 10;
  const effectiveGatewayBase = selectedMethodId === "fawry" ? Math.max(10, payableToGateway) : payableToGateway;
  const taxCalculation = calculateAmountWithTax(effectiveGatewayBase, selectedMethodId);

  const handleCreatePayment = async (overrideMethodId?: string) => {
    const activeMethodId = overrideMethodId || selectedMethodId;
    const methodObj = getPaymentMethod(activeMethodId) || selectedMethod;
    if (!methodObj) return;

    if (!user) {
      toastError("يرجى تسجيل الدخول أو إنشاء حساب جديد لإتمام عملية الدفع");
      const redirectTarget = window.location.pathname + window.location.search;
      router.push(`/login?redirect_url=${encodeURIComponent(redirectTarget)}`);
      return;
    }

    if (methodObj.needsPhone && !validatePhone(phone, methodObj.id)) {
      return;
    }

    if (methodObj.needsCode && !validateCode(code)) {
      return;
    }

    setIsCreating(true);
    setErrors([]);

    try {
      if (methodObj.id === "voucher") {
        const codeRes = await fetch("/api/codes", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            code: code.trim(),
            teacherId: teacherIdParam || undefined,
            planType: planTypeParam || undefined,
            grade: gradeParam || undefined,
            languageTrack: languageTrackParam || undefined,
            courseId: courseIdParam || undefined,
            folderId: folderIdParam || undefined,
            videoId: videoIdParam || undefined,
            planId: planIdParam || undefined,
            discountCode: appliedDiscount?.code,
          }),
        });
        const codeBody = await codeRes.json().catch(() => ({}));
        if (!codeRes.ok || codeBody.error || codeBody.success === false) {
          setErrors([codeBody.error || codeBody.message || "كود التفعيل غير صحيح أو منتهي الصلاحية"]);
          setStep("error");
          setIsCreating(false);
          return;
        }

        if (codeBody.itemPurchased === false) {
          if (codeBody.newBalance !== undefined) {
            setUser((prev) => prev ? { ...prev, balance: codeBody.newBalance } : prev);
          }
          const msg = codeBody.message || "تم شحن الكود في محفظتك، ولكن رصيدك المتاح غير كافٍ لإتمام الحجز بالكامل.";
          toastError(msg);
          setErrors([msg]);
          setStep("error");
          setIsCreating(false);
          return;
        }

        toastSuccess(codeBody.message || "تم تفعيل الكود بنجاح! 🎉");
        setStep("success");
        setIsCreating(false);
        return;
      }

      // Wallet methods must use the number the student typed: the account phone is
      // often not the wallet's number (e.g. the wallet is on a parent's line).
      const normalizedPhone =
        normalizeEgyptianPhone(phone) ||
        (!methodObj.needsPhone && user?.phone ? normalizeEgyptianPhone(user.phone) : "");
      if (methodObj.needsPhone && !normalizedPhone) {
        setPhoneError("يرجى إدخال رقم محفظة صالح (010, 011, 012, 015)");
        return;
      }
      const res = await fetch("/api/payments/sha7nawy/create", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          number: methodObj.needsCode ? code.trim() : (normalizedPhone || undefined),
          amount: rawItemPrice,
          method: methodObj.id,
          code: methodObj.needsCode ? code.trim() : undefined,
          teacherId: teacherIdParam || undefined,
          planType: planTypeParam || undefined,
          grade: gradeParam || undefined,
          languageTrack: languageTrackParam || undefined,
          courseId: courseIdParam || undefined,
          folderId: folderIdParam || undefined,
          videoId: videoIdParam || undefined,
          planId: planIdParam || undefined,
          courseTitle: verifiedItemName || planLabelParam || contextParam || undefined,
          discountCode: appliedDiscount?.code,
          useWalletBalance: useWalletBalance && hasPartialBalance && methodObj.id !== "wallet_balance",
        }),
      });

      const body = await res.json().catch(() => ({}));

      if (!res.ok || !body.success) {
        setErrors([body.error || "تعذر بدء عملية الدفع الإلكتروني حالياً"]);
        setStep("error");
        setIsCreating(false);
        return;
      }

      if (body.isPaidWithBalance) {
        toastSuccess(body.message || "تمت عملية الشراء من الرصيد بنجاح! 🎉");
        setStep("success");
        setIsCreating(false);
        return;
      }

      if (body.whatsappUrl) {
        toastSuccess("جاري فتح واتساب للتأكيد والتفعيل الفوري... 💬");
        try {
          window.open(body.whatsappUrl, "_blank");
        } catch {}
        setIntent({
          reference: body.reference || "IPN-DIRECT",
          method: body.method || methodObj.id,
          totalAmount: body.totalAmount || effectiveGatewayBase,
          instructions: body.instructions || methodObj.shortNote,
          walletDeduction: body.walletDeduction,
          paymentPageUrl: body.whatsappUrl,
        });
        setTimeLeftSeconds(15 * 60);
        setStep("instructions");
        setIsCreating(false);
        return;
      }

      const redirectUrl = body.checkoutUrl || body.data?.payment_page_url || body.data?.url;
      if (redirectUrl) {
        toastSuccess("جاري تحويلك لبوابة الدفع (Shake-Out)... 🚀");
        window.location.href = redirectUrl;
        return;
      }

      setIntent({
        reference: body.reference || "REF-PENDING",
        method: body.method || methodObj.id,
        totalAmount: body.totalAmount || taxCalculation.totalAmount,
        instructions: body.instructions || methodObj.shortNote,
        transactionId: body.data?.transaction_id ?? body.data?.id,
        paymentPageUrl: body.data?.payment_page_url ?? body.data?.url ?? undefined,
        walletDeduction: body.walletDeduction,
      });

      setTimeLeftSeconds(15 * 60);
      setStep("instructions");
    } catch (err: any) {
      setErrors([err?.message || "حدث خطأ أثناء الاتصال ببوابة الدفع. يرجى المحاولة مرة أخرى."]);
      setStep("error");
    } finally {
      setIsCreating(false);
    }
  };

  // ── Manual & Background Check Function ──
  // Payment confirmed. With the owner's auto-enroll switch off nothing was
  // bought for the student: the money is in their wallet, so send them to pick
  // what to enroll in (a single course → that course's page; a booking → the
  // teacher's options on /choose-course).
  const onPaid = useCallback(async (message: string) => {
    const hasItem = teacherIdParam || courseIdParam || folderIdParam || videoIdParam || planIdParam;
    if (hasItem) {
      try {
        const r = await fetch("/api/student/choose-course", { credentials: "include" });
        const d = await r.json();
        if (d && d.autoEnroll === false) {
          toastSuccess("تم الدفع ✅ المبلغ اتضاف لمحفظتك — اختار دلوقتي الكورس اللي عايز تشترك فيه");
          router.push(
            courseIdParam
              ? `/courses/${courseIdParam}`
              : `/choose-course${teacherIdParam ? `?teacherId=${encodeURIComponent(teacherIdParam)}` : ""}`
          );
          return;
        }
      } catch {}
    }
    setStep("success");
    toastSuccess(message);
  }, [teacherIdParam, courseIdParam, folderIdParam, videoIdParam, planIdParam, router, toastSuccess]);

  const performStatusCheck = useCallback(async (isSilent = false) => {
    if (!intent) return;
    if (!isSilent) {
      setIsCheckingStatus(true);
      setCheckMessage(null);
    }

    try {
      const queryRef = intent.reference || (intent.transactionId ? String(intent.transactionId) : "");
      if (queryRef) {
        // 1. Check Sha7nawy status API
        const shaRes = await fetch(`/api/payments/sha7nawy/status?transactionId=${encodeURIComponent(queryRef)}`);
        if (shaRes.ok) {
          const data = await shaRes.json();
          const st = String(data.status || "").toLowerCase();
          if (st === "completed" || st === "paid" || st === "success" || data.paid) {
            await onPaid(data.message || "تم التحقق من نجاح عملية الدفع وتفعيل المحتوى بنجاح! 🎉");
            return;
          }
        }

        // 2. Check Shake-Out status API
        const soRes = await fetch(`/api/payments/shakeout/status?transactionId=${encodeURIComponent(queryRef)}`);
        if (soRes.ok) {
          const data = await soRes.json();
          const st = String(data.status || "").toLowerCase();
          if (st === "completed" || st === "paid" || st === "success" || data.paid) {
            await onPaid(data.message || "تم التحقق من نجاح عملية الدفع وتفعيل المحتوى بنجاح! 🎉");
            return;
          }
        }

        // 3. Fallback to Sha7nawy confirm endpoint
        const confRes = await fetch("/api/payments/sha7nawy/confirm", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ref_code: queryRef }),
        });

        if (confRes.ok) {
          const confData = await confRes.json();
          if (confData.success && (confData.status === "completed" || confData.status === "paid" || confData.status === true)) {
            await onPaid(confData.message || "تم التحقق وتأكيد سداد العملية بنجاح! 🎉");
            return;
          }
        }
      }

      if (!isSilent) {
        setCheckMessage("العملية ما زالت معلقة بانتظار سداد الفاتورة أو إدخال الرقم السري في محفظتك.");
      }
    } catch {
      if (!isSilent) {
        setCheckMessage("تعذر الاتصال بالخادم للتحقق. يرجى المحاولة بعد لحظات.");
      }
    } finally {
      if (!isSilent) {
        setIsCheckingStatus(false);
      }
    }
  }, [intent, onPaid]);

  // ── Background Auto-Polling ──
  useEffect(() => {
    if (step !== "instructions" || !intent) return;

    const interval = setInterval(() => {
      performStatusCheck(true);
    }, 4000);

    return () => clearInterval(interval);
  }, [step, intent, performStatusCheck]);

  return (
    <div dir="rtl" className="min-h-screen bg-[#F8F9FA] dark:bg-[#0B0F19] text-[#101828] dark:text-[#F2F4F7] transition-colors duration-200">
      <Navbar user={user} />

      <main className="max-w-2xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
        {step === "checkout" && (
          <div className="space-y-6">
            
            {/* Header */}
            <div>
              <h1 className="text-[24px] sm:text-[28px] font-bold text-[#101828] dark:text-[#F2F4F7]">
                {verifiedItemName ? `سداد: ${verifiedItemName}` : contextParam || "شحن رصيد المحفظة والدفع"}
              </h1>
              <p className="text-[14px] text-[#667085] dark:text-[#98A2B3] mt-1.5 leading-relaxed">
                اختر وسيلة الدفع واستكمل بيانات السداد بأمان وسرعة فائقة.
              </p>
            </div>

            {/* Context Notice / Item summary */}
            {(verifiedItemName || planLabelParam || contextParam) && (
              <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-between gap-3 text-xs sm:text-sm text-emerald-800 dark:text-emerald-300 font-bold">
                <div className="flex items-center gap-2">
                  <span>📌</span>
                  <span>{verifiedItemName || planLabelParam || contextParam}</span>
                </div>
                <span className="px-2.5 py-1 rounded-xl bg-emerald-500 text-white font-mono font-black">
                  {rawItemPrice} جنيه
                </span>
              </div>
            )}

            {/* 🏷️ Discount Code Section */}
            {(verifiedItemName || isPriceLocked) && (
              <div className="rounded-2xl border border-[#E4E7EC] dark:border-[#232C36] bg-[#FFFFFF] dark:bg-[#141A21] p-4 shadow-sm space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs sm:text-sm font-bold text-[#101828] dark:text-[#F2F4F7] flex items-center gap-1.5">
                    <span>🏷️</span>
                    <span>هل لديك كود خصم؟</span>
                  </label>
                  {appliedDiscount && (
                    <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                      ✓ كود الخصم مفعّل
                    </span>
                  )}
                </div>

                {!appliedDiscount ? (
                  <div className="flex gap-2">
                    <input
                      type="text"
                      dir="ltr"
                      value={discountInput}
                      onChange={(e) => setDiscountInput(e.target.value.toUpperCase())}
                      placeholder="أدخل كود الخصم (مثال: SUMMER2026)"
                      className="flex-1 h-11 px-3 rounded-xl border border-[#E4E7EC] dark:border-[#232C36] bg-[#F8F9FA] dark:bg-[#0B0F19] text-[#101828] dark:text-[#F2F4F7] font-mono text-sm uppercase focus:outline-none focus:border-emerald-500"
                    />
                    <button
                      type="button"
                      onClick={handleApplyDiscount}
                      disabled={isApplyingDiscount || !discountInput.trim()}
                      className="px-4 h-11 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs sm:text-sm shadow-sm transition-all disabled:opacity-50 cursor-pointer"
                    >
                      {isApplyingDiscount ? "فحص..." : "تطبيق"}
                    </button>
                  </div>
                ) : (
                  <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-between gap-3 text-xs sm:text-sm">
                    <div className="space-y-0.5">
                      <div className="font-bold text-emerald-900 dark:text-emerald-200">
                        كود: <span className="font-mono font-black">{appliedDiscount.code}</span> ({appliedDiscount.discountType === "PERCENTAGE" ? `${appliedDiscount.discountValue}%` : `${appliedDiscount.discountValue} ج`} خصم)
                      </div>
                      <div className="text-xs text-emerald-700 dark:text-emerald-300">
                        وفرت: <strong>{appliedDiscount.discountAmount} جنيه</strong> (من {appliedDiscount.originalPrice} ج إلى {appliedDiscount.finalPrice} ج)
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={handleRemoveDiscount}
                      className="text-xs text-rose-500 hover:text-rose-600 font-bold underline cursor-pointer"
                    >
                      إزالة
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Quick 100% Full Balance Purchase Callout */}
            {user?.balance !== undefined && user.balance >= rawItemPrice && rawItemPrice > 0 && (
              <div className="p-4 rounded-2xl bg-teal-500/15 border border-teal-500/30 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs sm:text-sm">
                <div className="flex items-center gap-2.5 font-bold text-teal-900 dark:text-teal-200">
                  <span className="text-xl">💰</span>
                  <div>
                    <p>يتوفر في محفظتك رصيد كافٍ ({user.balance} جنيه)!</p>
                    <p className="text-[11px] font-normal text-teal-700 dark:text-teal-300">يمكنك إتمام الحجز والشراء فوراً بالكامل من رصيدك دون أي رسوم إضافية.</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedMethodId("wallet_balance");
                    handleCreatePayment("wallet_balance");
                  }}
                  disabled={isCreating}
                  className="shrink-0 px-4 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-500 text-white font-black text-xs shadow-md transition-all cursor-pointer"
                >
                  خصم وإتمام الشراء بالرصيد ⚡
                </button>
              </div>
            )}

            {/* ⚡ Split Payment / Combined Funding Callout */}
            {hasPartialBalance && (
              <div className="p-4 rounded-2xl bg-sky-500/10 border border-sky-500/30 space-y-2.5 text-xs sm:text-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-2 font-bold text-sky-950 dark:text-sky-200">
                    <span className="text-lg">⚡</span>
                    <div>
                      <p>دفع مجمّع (Combined Payment)</p>
                      <p className="text-[11px] font-normal text-sky-700 dark:text-sky-300 mt-0.5">
                        لديك رصيد متاح في محفظتك بقيمة <strong>{studentBalance} جنيه</strong>. يمكنك استخدامه لتقليل المبلغ المطلوب دفعه عبر وسيلة الدفع الإلكترونية!
                      </p>
                    </div>
                  </div>
                  <label className="flex items-center gap-2 shrink-0 cursor-pointer font-bold text-xs bg-sky-500/20 px-3 py-1.5 rounded-xl border border-sky-500/40">
                    <input
                      type="checkbox"
                      checked={useWalletBalance}
                      onChange={(e) => setUseWalletBalance(e.target.checked)}
                      className="cursor-pointer"
                    />
                    <span>تطبيق رصيد المحفظة</span>
                  </label>
                </div>

                {useWalletBalance && (
                  <div className="pt-2 border-t border-sky-500/20 grid grid-cols-2 gap-2 text-xs font-semibold text-sky-900 dark:text-sky-200">
                    <div>خصم من المحفظة: <span className="font-bold text-emerald-600 dark:text-emerald-400">-{effectiveWalletDeduction} جنيه</span></div>
                    <div>المتبقي للدفع إلكترونياً: <span className="font-bold text-sky-600 dark:text-sky-400">{payableToGateway} جنيه</span></div>
                  </div>
                )}
              </div>
            )}

            {/* Amount Selection / Breakdown Display */}
            <div className="rounded-2xl border border-[#E4E7EC] dark:border-[#232C36] bg-[#FFFFFF] dark:bg-[#141A21] p-5 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <label className="text-[15px] font-semibold text-[#101828] dark:text-[#F2F4F7]">
                  {useWalletBalance && hasPartialBalance ? "المبلغ المتبقي للسداد الإلكتروني" : "المبلغ المطلوب سداده (جنيه مصري)"}
                </label>
                {isPriceLocked && (
                  <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-600 dark:text-amber-400">
                    🔒 سعر معتمد محدد تلقائياً
                  </span>
                )}
              </div>

              {isFawryMinAdjusted && (
                <div className="p-2.5 rounded-xl bg-sky-500/10 border border-sky-500/30 text-sky-600 dark:text-sky-300 text-xs font-bold flex items-center gap-1.5">
                  <span>⚡</span>
                  <span>تم رفع المبلغ تلقائياً ليكون 10 جنيهات (أقل قيمة تقبلها شبكة فوري Fawry Pay)</span>
                </div>
              )}

              <div className="relative">
                <input
                  type="number"
                  min={selectedMethod.minAmount}
                  max={selectedMethod.maxAmount}
                  disabled={isPriceLocked}
                  value={effectiveGatewayBase}
                  onChange={(e) => setBaseAmount(e.target.value)}
                  className={`w-full h-14 px-4 rounded-xl border border-[#E4E7EC] dark:border-[#232C36] bg-[#F8F9FA] dark:bg-[#0B0F19] text-[#101828] dark:text-[#F2F4F7] text-[22px] font-bold focus:outline-none focus:border-emerald-500 ${
                    isPriceLocked ? "cursor-not-allowed opacity-90" : ""
                  }`}
                  placeholder="100"
                />
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[14px] font-bold text-[#667085] dark:text-[#98A2B3]">
                  EGP
                </span>
              </div>

              {/* Price Breakdown */}
              <div className="space-y-1.5 pt-3 border-t border-[#E4E7EC] dark:border-[#232C36] text-xs sm:text-sm">
                {appliedDiscount && (
                  <div className="flex items-center justify-between text-[#667085] dark:text-[#98A2B3]">
                    <span>السعر الأصلي:</span>
                    <span className="line-through">{appliedDiscount.originalPrice} جنيه</span>
                  </div>
                )}
                {appliedDiscount && (
                  <div className="flex items-center justify-between text-emerald-600 dark:text-emerald-400 font-bold">
                    <span>خصم الكود ({appliedDiscount.code}):</span>
                    <span>-{appliedDiscount.discountAmount} جنيه</span>
                  </div>
                )}
                {useWalletBalance && effectiveWalletDeduction > 0 && (
                  <div className="flex items-center justify-between text-sky-600 dark:text-sky-400 font-bold">
                    <span>خصم من رصيد محفظتك:</span>
                    <span>-{effectiveWalletDeduction} جنيه</span>
                  </div>
                )}
                <div className="flex items-center justify-between text-[#667085] dark:text-[#98A2B3]">
                  <span>رسوم الخدمة والضرائب ({selectedMethod.feePercentage}%):</span>
                  <span className="font-bold">
                    {taxCalculation.taxAmount > 0 ? `+${taxCalculation.taxAmount} جنيه` : "بدون رسوم إضافية"}
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-between text-sm sm:text-base font-black text-emerald-600 dark:text-emerald-400 pt-2 border-t border-[#E4E7EC] dark:border-[#232C36]">
                <span>إجمالي المبلغ المطلوب للدفع:</span>
                <span className="font-mono text-lg sm:text-xl">{taxCalculation.totalAmount} جنيه</span>
              </div>
            </div>

            {/* Payment Methods Grid */}
            <div className="space-y-3">
              <label className="text-[15px] font-semibold text-[#101828] dark:text-[#F2F4F7]">
                اختر وسيلة الدفع:
              </label>
              <PaymentMethodGrid
                methods={allMethods}
                selectedId={selectedMethodId}
                onSelect={(m) => {
                  setSelectedMethodId(m.id);
                  setPhoneError("");
                }}
              />
            </div>

            {/* Dynamic Inputs (Phone / Code) */}
            {(!selectedMethod.needsCode && selectedMethod.id !== "wallet_balance") && (
              <div className="rounded-2xl border border-[#E4E7EC] dark:border-[#232C36] bg-[#FFFFFF] dark:bg-[#141A21] p-5 shadow-sm space-y-2">
                <label className="text-[14px] font-bold text-[#101828] dark:text-[#F2F4F7]">
                  {selectedMethod.needsPhone
                    ? "رقم محفظة فودافون كاش / الهاتف المحمول:"
                    : "رقم هاتف الطالب للتواصل وتأكيد الحجز:"}
                </label>
                <input
                  type="tel"
                  dir="ltr"
                  value={phone}
                  onChange={(e) => {
                    const normalized = normalizeEgyptianPhone(e.target.value);
                    setPhone(normalized || e.target.value);
                    if (phoneError) validatePhone(normalized || e.target.value);
                  }}
                  placeholder="010XXXXXXXX"
                  className="w-full h-12 px-4 rounded-xl border border-[#E4E7EC] dark:border-[#232C36] bg-[#F8F9FA] dark:bg-[#0B0F19] text-[#101828] dark:text-[#F2F4F7] font-mono text-base focus:outline-none focus:border-emerald-500 text-right"
                />
                {phoneError && (
                  <p className="text-xs text-rose-500 font-bold mt-1">{phoneError}</p>
                )}
                <p className="text-xs text-[#667085] dark:text-[#98A2B3]">
                  {selectedMethod.needsPhone
                    ? "اكتب الرقم المسجّل عليه المحفظة (ممكن يكون رقم ولي الأمر) — هيوصلك طلب الدفع عليه."
                    : "يتم تسجيل هذا الرقم في بيانات الفاتورة والحجز لتأكيد اشتراكك والتواصل معك فور السداد."}
                </p>
              </div>
            )}

            {selectedMethod.needsCode && (
              <div className="rounded-2xl border border-[#E4E7EC] dark:border-[#232C36] bg-[#FFFFFF] dark:bg-[#141A21] p-5 shadow-sm space-y-2">
                <label className="text-[14px] font-bold text-[#101828] dark:text-[#F2F4F7]">
                  كود السداد / كود الكارت:
                </label>
                <input
                  type="text"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="أدخل كود الكارت أو الإيصال..."
                  className="w-full h-12 px-4 rounded-xl border border-[#E4E7EC] dark:border-[#232C36] bg-[#F8F9FA] dark:bg-[#0B0F19] text-[#101828] dark:text-[#F2F4F7] font-mono text-base focus:outline-none focus:border-emerald-500"
                />
                {codeError && (
                  <p className="text-xs text-rose-500 font-bold mt-1">{codeError}</p>
                )}
              </div>
            )}

            {/* Action Submit Button */}
            <button
              onClick={() => handleCreatePayment()}
              disabled={isCreating || userLoading}
              className="w-full h-14 rounded-2xl bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-600 hover:from-emerald-500 hover:to-cyan-500 text-white text-[16px] sm:text-[18px] font-black shadow-lg shadow-emerald-500/20 active:scale-[0.99] transition-all flex items-center justify-center gap-3 disabled:opacity-60 cursor-pointer"
            >
              {isCreating ? (
                <>
                  <svg className="w-5 h-5 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" className="opacity-25" />
                    <path fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" className="opacity-75" />
                  </svg>
                  <span>جاري إنشاء طلب السداد وتجهيز البوابة...</span>
                </>
              ) : (
                <>
                  <span>متابعة السداد وتأكيد الطلب 💳</span>
                  <span className="px-2.5 py-0.5 rounded-lg bg-white/20 font-mono text-sm">
                    {taxCalculation.totalAmount} EGP
                  </span>
                </>
              )}
            </button>

            {/* 💬 WhatsApp Instant Support & Manual Transfer Alternative */}
            <div className="p-4 rounded-2xl border border-emerald-500/30 bg-emerald-500/5 dark:bg-emerald-500/10 flex flex-col sm:flex-row items-center justify-between gap-3 text-center sm:text-right">
              <div className="flex items-center gap-3">
                <span className="text-2xl">💬</span>
                <div>
                  <p className="text-xs sm:text-sm font-bold text-emerald-950 dark:text-emerald-200">
                    تفضل الدفع اليدوي أو عبر إنستاباي / التحويل المباشر؟
                  </p>
                  <p className="text-[11px] sm:text-xs text-[#667085] dark:text-[#98A2B3]">
                    تواصل مباشرة مع الدعم الفني لتفعيل حسابك ومشترياتك فوراً
                  </p>
                </div>
              </div>
              <a
                href={`https://wa.me/${(process.env.NEXT_PUBLIC_PAYMENT_ACCESS_PASSWORD || "+201118802621").replace(/\D/g, "")}?text=${encodeURIComponent(
                  `مرحباً، أود المساعدة في الدفع وشحن الحساب على منصة Code-UP.\n` +
                  `👤 اسم الطالب: ${user?.name || "طالب"}\n` +
                  `💰 المبلغ: ${taxCalculation.totalAmount} جنيه\n` +
                  (verifiedItemName || planLabelParam || contextParam ? `📚 المحتوى: ${verifiedItemName || planLabelParam || contextParam}\n` : "") +
                  `طريقة الدفع المفضلة: ${selectedMethod.label}`
                )}`}
                target="_blank"
                rel="noopener noreferrer"
                className="shrink-0 px-4 py-2.5 rounded-xl bg-[#25D366] hover:bg-[#1EBE5D] text-white text-xs font-bold transition-all shadow-sm flex items-center justify-center gap-1.5 no-underline"
              >
                <span>تواصل عبر واتساب 💬</span>
              </a>
            </div>

          </div>
        )}

        {/* ── Instructions Step with 15-Minute Timer & Manual Check Button ── */}
        {step === "instructions" && intent && selectedMethod && (
          <div className="space-y-6 animate-fadeIn">
            
            {/* Header & Live 15-Minute Countdown */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#E4E7EC] dark:border-[#232C36] pb-4">
              <div>
                <h1 className="text-[20px] sm:text-[22px] font-black text-[#101828] dark:text-[#F2F4F7]">
                  تعليمات الدفع والسداد
                </h1>
                <p className="text-xs sm:text-sm text-[#667085] dark:text-[#98A2B3] mt-0.5">
                  يرجى استكمال الدفع باستخدام الرقم المرجعي أدناه.
                </p>
              </div>

              {/* 15:00 Live Expiry Countdown */}
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-800 dark:text-amber-300 self-start sm:self-auto">
                <span className="text-sm">⏳ مهلة الطلب:</span>
                <span className="font-mono font-black text-base">{formatTimer(timeLeftSeconds)}</span>
              </div>
            </div>

            {/* Reference Box */}
            <div className="rounded-2xl border-2 border-dashed border-emerald-500/40 bg-emerald-500/5 dark:bg-emerald-500/10 p-6 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <span className="text-xs font-bold text-emerald-800 dark:text-emerald-300 block mb-1">
                  الرقم المرجعي (Reference Code)
                </span>
                <div className="text-2xl sm:text-3xl font-black font-mono tracking-wider text-[#101828] dark:text-white select-all">
                  {intent.reference}
                </div>
              </div>

              <button
                type="button"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(intent.reference);
                    setCopied(true);
                    toastSuccess("تم نسخ الرقم المرجعي للحافظة بنجاح!");
                    setTimeout(() => setCopied(false), 3000);
                  } catch {}
                }}
                className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm shadow-md active:scale-95 transition-all flex items-center justify-center gap-2 cursor-pointer shrink-0"
              >
                {copied ? (
                  <>
                    <span>✓</span>
                    <span>تم النسخ</span>
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                      <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
                    </svg>
                    <span>نسخ الرقم</span>
                  </>
                )}
              </button>
            </div>

            {/* Numbered Steps */}
            <div className="rounded-2xl border border-[#E4E7EC] dark:border-[#232C36] bg-[#FFFFFF] dark:bg-[#141A21] p-6 shadow-sm space-y-4">
              <h2 className="text-[16px] font-bold text-[#101828] dark:text-[#F2F4F7]">
                خطوات السداد والتأكيد:
              </h2>

              <ol className="space-y-3.5 text-sm sm:text-base leading-relaxed">
                <li className="flex items-start gap-3.5">
                  <span className="w-7 h-7 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 font-black text-sm flex items-center justify-center shrink-0 mt-0.5">
                    1
                  </span>
                  <span>سيصلك إشعار بطلب الدفع على رقم محفظتك خلال ثوانٍ.</span>
                </li>

                <li className="flex items-start gap-3.5">
                  <span className="w-7 h-7 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 font-black text-sm flex items-center justify-center shrink-0 mt-0.5">
                    2
                  </span>
                  <span>أو اطلب <code className="px-2 py-0.5 rounded bg-[#E4E7EC] dark:bg-[#232C36] font-mono font-bold text-emerald-600 dark:text-emerald-400">#9*1*</code> من هاتفك خلال دقيقة واحدة.</span>
                </li>

                <li className="flex items-start gap-3.5">
                  <span className="w-7 h-7 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 font-black text-sm flex items-center justify-center shrink-0 mt-0.5">
                    3
                  </span>
                  <span>اختر «الموافقة على طلب الدفع» وأدخل الرقم السري للمحفظة.</span>
                </li>

                <li className="flex items-start gap-3.5">
                  <span className="w-7 h-7 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 font-black text-sm flex items-center justify-center shrink-0 mt-0.5">
                    4
                  </span>
                  <span>بعد إدخال الرقم السري، اضغط زر <strong>«التحقق من حالة الدفع»</strong> بالأسفل لإتمام العملية فوراً.</span>
                </li>
              </ol>

              {checkMessage && (
                <div className="p-3.5 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-800 dark:text-amber-300 text-xs sm:text-sm font-semibold">
                  ⚠️ {checkMessage}
                </div>
              )}

              <div className="pt-3 border-t border-[#E4E7EC] dark:border-[#232C36] space-y-3">
                <button
                  type="button"
                  onClick={() => performStatusCheck(false)}
                  disabled={isCheckingStatus}
                  className="w-full h-13 py-3.5 rounded-xl bg-[#047857] hover:bg-[#036B4A] dark:bg-[#10B981] dark:hover:bg-[#059669] text-white font-black text-base shadow-md active:scale-98 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
                >
                  {isCheckingStatus ? (
                    <>
                      <svg className="w-5 h-5 animate-spin" viewBox="0 0 24 24" fill="none">
                        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" className="opacity-25" />
                        <path fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" className="opacity-75" />
                      </svg>
                      <span>جاري فحص وتأكيد العملية من مزود الخدمة...</span>
                    </>
                  ) : (
                    <>
                      <span>🔍 التحقق من حالة الدفع وتحديث الحساب</span>
                    </>
                  )}
                </button>

                <div className="flex items-center justify-center gap-2 text-xs text-[#667085] dark:text-[#98A2B3]">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
                  <span>يتم الفحص التلقائي والتحديث فور سدادك من الهاتف</span>
                </div>
              </div>

            </div>

            {intent.paymentPageUrl && (
              <div className="text-center">
                <a
                  href={intent.paymentPageUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-sm transition-all"
                >
                  <span>فتح صفحة فواتير الدفع المباشرة ↗</span>
                </a>
              </div>
            )}

            <div className="text-center">
              <button
                type="button"
                onClick={() => setStep("checkout")}
                className="text-xs text-[#667085] dark:text-[#98A2B3] hover:underline"
              >
                ← إلغاء والعودة لاختيار طريقة دفع أخرى
              </button>
            </div>

          </div>
        )}

        {/* Success Step */}
        {step === "success" && (
          <div className="rounded-3xl border border-[#E4E7EC] dark:border-[#232C36] bg-[#FFFFFF] dark:bg-[#141A21] p-8 shadow-xl text-center space-y-5 animate-fadeIn max-w-lg mx-auto">
            <div className="w-20 h-20 rounded-full bg-emerald-500/20 text-emerald-500 flex items-center justify-center mx-auto text-4xl font-black shadow-inner">
              ✓
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-black text-[#101828] dark:text-white">
                تم تأكيد الدفع بنجاح! 🎉
              </h1>
              <p className="text-sm font-bold text-emerald-600 dark:text-emerald-400 mt-2">
                تم استلام دفعتك بقيمة {taxCalculation.totalAmount || rawItemPrice} جنيه وتأكيد طلبك بنجاح.
              </p>
              {verifiedItemName && (
                <div className="mt-3 p-3 rounded-2xl bg-[var(--surface-2,#0f1420)] border border-[var(--border,rgba(255,255,255,0.08))] text-xs font-bold text-[var(--ink,#fff)]">
                  📦 العنصر المفعل: {verifiedItemName}
                </div>
              )}
              <div className="mt-4 p-3.5 rounded-2xl bg-sky-500/10 border border-sky-500/20 text-sky-700 dark:text-sky-300 text-xs leading-relaxed text-right">
                <span className="font-black block mb-1">📍 موعد إتاحة الدروس والمحاضرات:</span>
                تم قيد وتفعيل اشتراكك بنجاح في حسابك. إذا كان المعلم قد حدد موعداً لبدء الكورس الدراسي، ستتاح المحاضرات والواجبات تلقائياً فور بدء موعد الدراسة.
              </div>
            </div>

            <div className="pt-3 flex flex-col sm:flex-row justify-center gap-3">
              <button
                type="button"
                onClick={() => router.push(returnHref || "/account")}
                className="w-full sm:w-auto px-6 py-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm shadow-lg shadow-emerald-600/20 transition-all cursor-pointer"
              >
                الانتقال إلى المحتوى 🚀
              </button>
              <button
                type="button"
                onClick={() => router.push("/account")}
                className="w-full sm:w-auto px-6 py-3.5 rounded-xl border border-[var(--border,rgba(255,255,255,0.1))] bg-[var(--surface,#1a1f2e)] hover:bg-[var(--surface-2,#252d3d)] text-[var(--ink,#fff)] font-bold text-sm transition-all cursor-pointer"
              >
                لوحة حسابي والاشتراكات 🎓
              </button>
            </div>
          </div>
        )}

        {/* Error Step */}
        {step === "error" && (
          <div className="space-y-4 animate-fadeIn">
            <ErrorState
              message={errors[0] || "تعذر إتمام عملية السداد"}
              onRetry={() => {
                setErrors([]);
                setStep("checkout");
              }}
              onSelectMethod={(methodId) => {
                setErrors([]);
                setSelectedMethodId(methodId);
                setStep("checkout");
                if (methodId === "instapay" || methodId === "fawry" || methodId === "wallet_balance") {
                  handleCreatePayment(methodId);
                }
              }}
              itemName={verifiedItemName || planLabelParam || contextParam || "اشتراك منصة Code-UP"}
              amount={taxCalculation.totalAmount || rawItemPrice}
              userName={user?.name}
            />
          </div>
        )}

      </main>
      <Footer />
    </div>
  );
}

export default function PaymentPage() {
  return (
    <Suspense fallback={<LoadingState label="جاري تجهيز بوابة السداد الآمنة..." />}>
      <PaymentContent />
    </Suspense>
  );
}
