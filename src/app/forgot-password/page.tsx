"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AuthShell } from "@/components/auth/AuthShell";
import { useRecaptcha } from "@/lib/use-recaptcha";

type Step = "phone" | "reset" | "done";

export default function ForgotPasswordPage() {
  const router = useRouter();
  const { execute: executeRecaptcha } = useRecaptcha();
  const [step, setStep] = useState<Step>("phone");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [devCode, setDevCode] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [isBypassed, setIsBypassed] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [sentChannel, setSentChannel] = useState<"whatsapp" | "sms" | null>(null);
  const [success, setSuccess] = useState("");

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => {
      setCooldown((c) => c - 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  const formatPhone = (p: string) => {
    const digits = p.replace(/\D/g, "");
    if (digits.startsWith("20") && digits.length === 12) return `+${digits}`;
    if (digits.startsWith("0") && digits.length === 11) return `+20${digits.slice(1)}`;
    if (digits.length === 9) return `+20${digits}`;
    if (p.startsWith("+")) return p;
    return p;
  };

  const handleSendCode = async (e?: React.FormEvent, forceSms?: boolean) => {
    if (e) e.preventDefault();
    setError("");
    setSuccess("");
    setLoading(true);
    try {
      const recaptchaToken = await executeRecaptcha("forgot_password");
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone: formatPhone(phone),
          forceChannel: forceSms ? "sms" : undefined,
          recaptchaToken,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "حدث خطأ");
        return;
      }

      if (data?.bypass) {
        setIsBypassed(true);
        setDevCode("123456");
        setCode("123456");
        setSentChannel("sms");
        setStep("reset");
        return;
      }

      setIsBypassed(false);
      setDevCode(null);
      setSentChannel(data?.channel === "whatsapp" ? "whatsapp" : "sms");
      setSuccess(
        data?.channel === "whatsapp"
          ? "تم إرسال رمز التحقق إلى حساب WhatsApp الخاص بك. يرجى التحقق من تطبيق واتساب."
          : "تم إرسال رمز التحقق عبر الرسائل النصية (SMS). يرجى التحقق من الرسائل النصية على هاتفك."
      );
      setStep("reset");
      setCooldown(60);
    } catch (err: any) {
      console.error("forgot-password sendCode error:", err);
      const errCode = err?.code ? ` [${err.code}]` : "";
      setError((err?.message || "تعذر إرسال كود التحقق. حاول مرة أخرى.") + errCode);
    } finally {
      setLoading(false);
    }
  };

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (newPassword !== confirmPassword) {
      setError("كلمتا المرور غير متطابقتين");
      return;
    }
    if (newPassword.length < 6) {
      setError("كلمة المرور يجب أن تكون 6 أحرف على الأقل");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone: formatPhone(phone),
          verificationCode: code,
          newPassword,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "حدث خطأ");
        return;
      }
      setStep("done");
    } catch {
      setError("تعذر الاتصال بالخادم");
    } finally {
      setLoading(false);
    }
  };

  if (step === "done") {
    return (
      <AuthShell
        title="تم تغيير كلمة المرور"
        subtitle="يمكنك الآن تسجيل الدخول بكلمة المرور الجديدة"
        footer={null}
      >
        <div className="bg-white/95 dark:bg-slate-900/95 backdrop-blur rounded-2xl border border-slate-200/80 dark:border-slate-700/80 shadow-xl p-6 sm:p-8 text-center space-y-5">
          <div className="w-16 h-16 mx-auto rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center text-3xl">
            ✅
          </div>
          <p className="text-gray-700 dark:text-gray-300 text-sm">
            تم تغيير كلمة المرور بنجاح. سجّل الدخول الآن باستخدام رقمك وكلمة المرور الجديدة.
          </p>
          <button
            onClick={() => router.push("/login")}
            className="w-full py-3.5 bg-sky-600 hover:bg-sky-700 text-white font-bold rounded-xl transition-all shadow-md"
          >
            الذهاب إلى تسجيل الدخول
          </button>
        </div>
      </AuthShell>
    );
  }

  if (step === "reset") {
    return (
      <AuthShell
        title="إعادة تعيين كلمة المرور"
        subtitle={`أدخل الكود المُرسَل إلى ${phone}`}
        footer={
          <button
            onClick={() => { setStep("phone"); setDevCode(null); setCode(""); setError(""); }}
            className="text-sky-600 dark:text-sky-400 font-semibold hover:underline"
          >
            تغيير الرقم
          </button>
        }
      >
        <div className="bg-white/95 dark:bg-slate-900/95 backdrop-blur rounded-2xl border border-slate-200/80 dark:border-slate-700/80 shadow-xl p-6 sm:p-8">
          {devCode && (
            <div className="mb-5 p-3 rounded-xl border border-amber-200 bg-amber-50 dark:border-amber-700 dark:bg-amber-900/30 text-center">
              <p className="text-xs text-amber-700 dark:text-amber-300 font-medium mb-1">وضع التطوير — الكود:</p>
              <p className="text-2xl font-mono font-black tracking-[0.3em] text-amber-800 dark:text-amber-200 select-all">
                {devCode}
              </p>
            </div>
          )}

          {success && (
            <div className="mb-5 p-3 rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-700 text-sm dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
              {success}
            </div>
          )}

          {error && (
            <div className="mb-5 p-3 rounded-xl border border-red-200 bg-red-50 text-red-700 text-sm dark:border-red-800 dark:bg-red-950/40 dark:text-red-300">
              {error}
            </div>
          )}

          <form onSubmit={handleReset} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                كود التحقق
              </label>
              <input
                type="text"
                required
                dir="ltr"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                maxLength={6}
                placeholder="123456"
                className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-sky-500 text-center font-mono tracking-widest text-lg"
              />
            </div>

            <div className="text-center text-xs text-slate-500 dark:text-slate-400 mt-2">
              تحتاج مساعدة؟ تواصل مع الدعم عبر واتساب:{" "}
              <a
                href="https://wa.me/201118802621?text=%D9%85%D8%B1%D8%AD%D8%A8%D8%A7%D9%8B%D8%8C%20%D8%A3%D8%AD%D8%AA%D8%A7%D8%AC%20%D9%85%D8%B3%D8%A7%D8%B9%D8%AF%D8%A9%20%D9%81%D9%8A%20%D8%A7%D8%B3%D8%AA%D8%B9%D8%A7%D8%AF%D8%A9%20%D9%83%D9%84%D9%85%D8%A9%20%D8%A7%D9%84%D9%85%D8%B1%D9%88%D8%B1%20%D8%B9%D9%84%D9%89%20Code-UP"
                target="_blank"
                rel="noopener noreferrer"
                className="text-emerald-600 dark:text-emerald-400 font-semibold hover:underline"
              >
                01118802621 💬
              </a>
            </div>

            {sentChannel === "whatsapp" && (
              <div className="text-xs text-slate-500 dark:text-slate-400">
                <button
                  type="button"
                  onClick={() => handleSendCode(undefined, true)}
                  disabled={loading}
                  className="text-sky-600 dark:text-sky-400 underline font-semibold hover:text-sky-800 dark:hover:text-sky-300 cursor-pointer"
                >
                  لم أستلم الرمز على واتساب؟ الإرسال عبر SMS بدلاً من ذلك
                </button>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                كلمة المرور الجديدة
              </label>
              <input
                type="password"
                required
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="6 أحرف على الأقل"
                className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-sky-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                تأكيد كلمة المرور
              </label>
              <input
                type="password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="أعد كتابة كلمة المرور"
                className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-sky-500"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 bg-sky-600 hover:bg-sky-700 disabled:opacity-60 text-white font-bold rounded-xl transition-all shadow-md"
            >
              {loading ? "جارٍ التغيير..." : "تغيير كلمة المرور"}
            </button>
          </form>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="نسيت كلمة المرور؟"
      subtitle="أدخل رقم هاتفك المسجّل وسنرسل لك كود التحقق"
      footer={
        <>
          تذكّرت كلمة المرور؟{" "}
          <Link href="/login" className="text-sky-600 dark:text-sky-400 font-semibold hover:underline">
            تسجيل الدخول
          </Link>
        </>
      }
    >
      <div className="bg-white/95 dark:bg-slate-900/95 backdrop-blur rounded-2xl border border-slate-200/80 dark:border-slate-700/80 shadow-xl p-6 sm:p-8">
        {error && (
          <div className="mb-5 p-3 rounded-xl border border-red-200 bg-red-50 text-red-700 text-sm dark:border-red-800 dark:bg-red-950/40 dark:text-red-300">
            {error}
          </div>
        )}

        <div id="recaptcha-container"></div>

        <form onSubmit={handleSendCode} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              رقم المتعلم
            </label>
            <input
              type="tel"
              required
              dir="ltr"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-sky-500 text-left"
              placeholder="01XXXXXXXXX"
            />
          </div>

          <button
            type="submit"
            disabled={loading || cooldown > 0}
            className="w-full py-3.5 bg-sky-600 hover:bg-sky-700 disabled:opacity-60 text-white font-bold rounded-xl transition-all shadow-md"
          >
            {loading ? "جارٍ الإرسال..." : cooldown > 0 ? `إعادة الإرسال خلال ${cooldown}ث` : "إرسال كود التحقق"}
          </button>
        </form>
      </div>
    </AuthShell>
  );
}
