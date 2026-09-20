"use client";

import { useMemo, useState, useRef, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AuthShell } from "@/components/auth/AuthShell";
import { EDUCATIONAL_STAGES } from "@/types";
import { useRecaptcha } from "@/lib/use-recaptcha";

export default function SignupPage() {
  const router = useRouter();
  // Read referral/promo code from query params (?promo=, ?ref=, ?teacher=, ?code=)
  const [initialPromoCode, setInitialPromoCode] = useState<string>("");
  const [refCode] = useState<string>(() => {
    if (typeof window === "undefined") return "";
    const params = new URLSearchParams(window.location.search);
    return params.get("ref") ?? "";
  });
  const [form, setForm] = useState({
    name: "",
    phone: "",
    parentPhone: "",
    age: "",
    educationalStage: "",
    password: "",
    confirmPassword: "",
    verificationCode: "",
    promoCode: "",
  });

  // Read URL query params for teacher promo code on mount
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const codeFromUrl = (
      params.get("promo") ||
      params.get("teacher") ||
      params.get("code") ||
      params.get("ref") ||
      ""
    ).trim().toUpperCase();

    if (codeFromUrl) {
      setInitialPromoCode(codeFromUrl);
      setForm((prev) => ({ ...prev, promoCode: codeFromUrl }));
    }
  }, []);
  const [sendingCode, setSendingCode] = useState(false);
  const [signingUp, setSigningUp] = useState(false);
  const [codeSent, setCodeSent] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [codeMethod, setCodeMethod] = useState<"sms" | "verify" | "dev">("sms");
  const [isBypassed, setIsBypassed] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [sentChannel, setSentChannel] = useState<"whatsapp" | "sms" | null>(null);
  const { execute: executeRecaptcha } = useRecaptcha();

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => {
      setCooldown((c) => c - 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  const canSendCode = useMemo(() => form.phone.trim().length >= 9, [form.phone]);

  // sanitize phone for sending: always return E.164 (+20...) when possible
  const formatForSend = (p: string) => {
    const raw = String(p || "");
    const digits = raw.replace(/\D/g, "");
    // already in international with country code
    if (digits.startsWith("20") && digits.length === 12) return `+${digits}`;
    // local 01XXXXXXXXX -> +20XXXXXXXXXX
    if (digits.startsWith("0") && digits.length === 11) return `+20${digits.slice(1)}`;
    // if user provided 9-digit (without leading 0), assume local and add +20
    if (digits.length === 9) return `+20${digits}`;
    // if it already includes leading + and looks valid
    if (raw.startsWith("+")) return raw;
    return raw;
  };

  const sendCode = async (forceSms?: boolean) => {
    if (!canSendCode) {
      setError("أدخل رقم المتعلم أولاً");
      return;
    }

    setSendingCode(true);
    setError("");
    setSuccess("");

    try {
      // Get a reCAPTCHA token for the send_code action.
      const recaptchaToken = await executeRecaptcha("send_code");

      const response = await fetch("/api/auth/phone/send-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: formatForSend(form.phone), forceChannel: forceSms ? "sms" : undefined, recaptchaToken }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(data.error || "فشل إرسال الكود");
        return;
      }

      if (data?.bypass) {
        setIsBypassed(true);
        setCodeSent(true);
        setCodeMethod("dev");
        setSentChannel("sms");
        setForm((s) => ({ ...s, verificationCode: "123456" }));
        setSuccess("وضع التطوير مفعّل: تم تخطي التحقق من رقم الهاتف (DEV).");
        return;
      }

      setIsBypassed(false);
      setCodeSent(true);
      setSentChannel(data?.channel === "whatsapp" ? "whatsapp" : "sms");
      setSuccess(
        data?.channel === "whatsapp"
          ? "تم إرسال رمز التحقق إلى حساب WhatsApp الخاص بك. يرجى التحقق من تطبيق واتساب."
          : "تم إرسال رمز التحقق عبر الرسائل النصية (SMS). يرجى التحقق من الرسائل النصية على هاتفك."
      );
      setCooldown(60);
    } catch (err: any) {
      console.error("sendCode error:", err);
      const errCode = err?.code ? ` [${err.code}]` : "";
      setError((err?.message || "تعذر إرسال كود التحقق. حاول مرة أخرى.") + errCode);
    } finally {
      setSendingCode(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSigningUp(true);
    setError("");
    setSuccess("");

    if (form.password !== form.confirmPassword) {
      setError("كلمتا المرور غير متطابقتين");
      setSigningUp(false);
      return;
    }

    if (!codeSent) {
      setError("يجب إرسال رمز التحقق أولاً");
      setSigningUp(false);
      return;
    }

    try {
      const response = await fetch("/api/auth/signup", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          phone: formatForSend(form.phone),
          parentPhone: formatForSend(form.parentPhone),
          age: form.age,
          educationalStage: form.educationalStage,
          password: form.password,
          verificationCode: form.verificationCode,
          referralCode: refCode || undefined,
          promoCode: form.promoCode ? form.promoCode.trim() : undefined,
        }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(data.error || "تعذر إنشاء الحساب");
        return;
      }

      router.push("/");
      router.refresh();
    } catch (err) {
      console.error("Signup submit error:", err);
      setError("حدث خطأ في الاتصال بالخادم.");
    } finally {
      setSigningUp(false);
    }
  };

  return (
    <AuthShell
      title="إنشاء حساب جديد"
      subtitle="سجل بيانات المتعلم كاملة لبدء التعلم فورًا"
      maxWidth="2xl"
      footer={
        <>
          لديك حساب بالفعل؟{" "}
          <Link href="/login" className="text-sky-600 dark:text-sky-400 font-semibold hover:underline">
            تسجيل الدخول
          </Link>
        </>
      }
    >
      <div className="space-y-5">
        {error && (
          <div className="mb-5 p-3 rounded-xl border border-red-200 bg-red-50 text-red-700 text-sm dark:border-red-800 dark:bg-red-950/40 dark:text-red-300">
            {error}
          </div>
        )}
        {success && (
          <div className="mb-5 p-3 rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-700 text-sm dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
            {success}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="rounded-2xl border border-white/10 bg-slate-950/10 p-4 sm:p-5 dark:bg-white/5">
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">اسم المتعلم</label>
                <input
                  type="text"
                  required
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-sky-500"
                  placeholder="أحمد محمد"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">العمر</label>
                <input
                  type="number"
                  min={6}
                  max={25}
                  required
                  value={form.age}
                  onChange={(e) => setForm({ ...form, age: e.target.value })}
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-sky-500"
                  placeholder="15"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">رقم المتعلم</label>
                <input
                  type="tel"
                  dir="ltr"
                  required
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value.replace(/[^\d+]/g, "") })}
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-sky-500 text-left"
                  placeholder="01XXXXXXXXX"
                />
                <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">اكتب الرقم المصري بصيغة 01XXXXXXXXX أو +20XXXXXXXXXX</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">رقم ولي الأمر</label>
                <input
                  type="tel"
                  dir="ltr"
                  required
                  value={form.parentPhone}
                  onChange={(e) => setForm({ ...form, parentPhone: e.target.value.replace(/[^\d+]/g, "") })}
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-sky-500 text-left"
                  placeholder="01XXXXXXXXX"
                />
                <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">لا تستخدم نفس الرقم للمتعلم وولي الأمر</p>
              </div>

              <div className="md:col-span-2">
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                    كود خصم المعلم (اختياري)
                  </label>
                  {initialPromoCode && form.promoCode === initialPromoCode && (
                    <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                      ✓ تم التطبيق تلقائياً عبر رابط الدعوة
                    </span>
                  )}
                </div>
                <input
                  type="text"
                  value={form.promoCode}
                  onChange={(e) => setForm({ ...form, promoCode: e.target.value.toUpperCase() })}
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-sky-500 font-mono"
                  placeholder="إذا كان لديك كود إحالة من معلمك (مثال: 123)"
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">الصف التدريبي</label>
                <select
                  required
                  value={form.educationalStage}
                  onChange={(e) => setForm({ ...form, educationalStage: e.target.value })}
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-sky-500"
                >
                  <option value="">— اختر الصف التدريبي —</option>
                  {EDUCATIONAL_STAGES.map((stage) => (
                    <option key={stage.value} value={stage.value}>
                      {stage.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">كلمة المرور</label>
                <input
                  type="password"
                  required
                  minLength={8}
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-sky-500"
                  placeholder="8 أحرف أو أكثر"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">تأكيد كلمة المرور</label>
                <input
                  type="password"
                  required
                  minLength={8}
                  value={form.confirmPassword}
                  onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })}
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-sky-500"
                  placeholder="أعد كتابة كلمة المرور"
                />
              </div>

              <div className="md:col-span-2 rounded-xl border border-sky-200/60 bg-sky-50/70 p-4 text-sm text-sky-900 dark:border-sky-900/60 dark:bg-sky-950/30 dark:text-sky-200">
                {codeMethod === "verify" && "سيتم إرسال الرمز عبر Twilio Verify. أفضل خيار للإنتاج."}
                {codeMethod === "dev" && "وضع التطوير مفعّل: الكود محفوظ محليًا لتجربة التسجيل بدون SMS."}
                {!codeSent && codeMethod !== "dev" && codeMethod !== "verify" && "سيتم إرسال كود التحقق عبر WhatsApp كقناة أساسية، أو عبر SMS كقناة احتياطية."}
                {codeSent && sentChannel === "whatsapp" && "تم إرسال الرمز عبر WhatsApp إلى رقم المتعلم."}
                {codeSent && sentChannel === "sms" && "تم إرسال الرمز عبر SMS مباشرة إلى رقم المتعلم."}
                {codeSent && sentChannel === "whatsapp" && (
                  <div className="mt-2 pt-2 border-t border-sky-200/40 dark:border-sky-900/40">
                    <button
                      type="button"
                      onClick={() => sendCode(true)}
                      disabled={sendingCode}
                      className="text-xs text-sky-700 dark:text-sky-300 underline font-semibold hover:text-sky-900 dark:hover:text-white cursor-pointer"
                    >
                      لم أستلم الرمز على واتساب؟ الإرسال عبر SMS بدلاً من ذلك
                    </button>
                  </div>
                )}
              </div>

              <div id="recaptcha-container"></div>

              <div className="md:col-span-2 grid sm:grid-cols-[1fr_auto] gap-3 items-end">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">رمز التحقق</label>
                  <input
                    type="text"
                    required
                    value={form.verificationCode}
                    onChange={(e) => setForm({ ...form, verificationCode: e.target.value })}
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-sky-500"
                    placeholder="أدخل الكود المرسل"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => sendCode()}
                  disabled={sendingCode || !canSendCode || cooldown > 0}
                  className="h-12 px-5 rounded-xl bg-slate-900 text-white hover:bg-slate-700 disabled:opacity-50 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200"
                >
                  {sendingCode ? "جارٍ الإرسال..." : cooldown > 0 ? `إعادة الإرسال خلال ${cooldown}ث` : codeSent ? "إعادة إرسال الكود" : "إرسال كود التحقق"}
                </button>
              </div>
              {codeSent && (
                <div className="md:col-span-2 text-center text-xs text-slate-500 dark:text-slate-400 mt-1">
                  تحتاج مساعدة؟ تواصل مع الدعم عبر واتساب:{" "}
                  <a
                    href="https://wa.me/201118802621?text=%D9%85%D8%B1%D8%AD%D8%A8%D8%A7%D9%8B%D8%8C%20%D8%A3%D8%AD%D8%AA%D8%A7%D8%AC%20%D9%85%D8%B3%D8%A7%D8%B9%D8%AF%D8%A9%20%D9%81%D9%8A%20%D8%A5%D9%86%D8%B4%D8%A7%D8%A1%20%D8%AD%D8%B3%D8%A7%D8%A8%20%D8%B9%D9%84%D9%89%20Code-UP"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-emerald-600 dark:text-emerald-400 font-semibold hover:underline"
                  >
                    01118802621 💬
                  </a>
                </div>
              )}
            </div>
          </div>

          <button
            type="submit"
            disabled={signingUp}
            className="w-full py-3.5 bg-gradient-to-l from-sky-600 to-blue-700 hover:from-sky-700 hover:to-blue-800 disabled:opacity-60 text-white font-bold rounded-2xl transition-all shadow-lg shadow-sky-950/20"
          >
            {signingUp ? "جاري إنشاء الحساب..." : "إنشاء الحساب"}
          </button>
          <p className="text-center text-xs text-slate-500 dark:text-slate-400 mt-4">
            بالمتابعة فإنك توافق على{" "}
            <Link href="/terms" className="text-sky-600 dark:text-sky-400 hover:underline">
              الشروط والأحكام
            </Link>
            {" "}و{" "}
            <Link href="/privacy" className="text-sky-600 dark:text-sky-400 hover:underline">
              سياسة الخصوصية
            </Link>
          </p>
        </form>
      </div>
    </AuthShell>
  );
}
