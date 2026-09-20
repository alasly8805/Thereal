"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AuthShell } from "@/components/auth/AuthShell";
import { useRecaptcha } from "@/lib/use-recaptcha";

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [resettingDevices, setResettingDevices] = useState(false);
  const [error, setError] = useState("");
  const [isDeviceLimitError, setIsDeviceLimitError] = useState(false);
  const { execute: executeRecaptcha } = useRecaptcha();

  const formatForSend = (p: string) => {
    const raw = String(p || "");
    const digits = raw.replace(/\D/g, "");
    if (digits.startsWith("20") && digits.length === 12) return `+${digits}`;
    if (digits.startsWith("0") && digits.length === 11) return `+20${digits.slice(1)}`;
    if (digits.length === 9) return `+20${digits}`;
    if (raw.startsWith("+")) return raw;
    return raw;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setIsDeviceLimitError(false);

    try {
      const recaptchaToken = await executeRecaptcha("login");

      const response = await fetch("/api/auth/login", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: formatForSend(phone), password, recaptchaToken }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(data.error || "فشل تسجيل الدخول");
        if (data.code === "DEVICE_LIMIT") {
          setIsDeviceLimitError(true);
        }
        return;
      }

      const redirectTo = searchParams.get("redirect_url") || "/";
      router.push(redirectTo);
      router.refresh();
    } catch {
      setError("تعذر الاتصال بالخادم. حاول مرة أخرى.");
    } finally {
      setLoading(false);
    }
  };

  const handleLogoutAllDevices = async () => {
    setResettingDevices(true);
    setError("");

    try {
      const recaptchaToken = await executeRecaptcha("login");
      const response = await fetch("/api/auth/reset-devices", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: formatForSend(phone), password, recaptchaToken }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(data.error || "فشل إعاده ضبط الأجهزة");
        return;
      }

      const redirectTo = searchParams.get("redirect_url") || "/";
      router.push(redirectTo);
      router.refresh();
    } catch {
      setError("حدث خطأ أثناء الاتصال. يرجى المحاولة لاحقاً.");
    } finally {
      setResettingDevices(false);
    }
  };

  return (
    <AuthShell
      title="تسجيل الدخول"
      subtitle="أهلاً بعودتك إلى منصة Code-UP"
      footer={
        <>
          ليس لديك حساب؟{" "}
          <Link href="/signup" className="text-sky-600 dark:text-sky-400 font-semibold hover:underline">
            إنشاء حساب مجاني
          </Link>
        </>
      }
    >
      <div className="bg-white/95 dark:bg-slate-900/95 backdrop-blur rounded-2xl border border-slate-200/80 dark:border-slate-700/80 shadow-xl p-6 sm:p-8">
        {error && (
          <div className="mb-5 p-4 rounded-xl border border-red-200 bg-red-50 text-red-700 text-sm dark:border-red-800/80 dark:bg-red-950/50 dark:text-red-300">
            <div>{error}</div>
            {isDeviceLimitError && (
              <button
                type="button"
                onClick={handleLogoutAllDevices}
                disabled={resettingDevices}
                className="mt-3 w-full py-2.5 px-4 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white font-bold text-xs rounded-xl transition-all shadow flex items-center justify-center gap-2 cursor-pointer border-none"
              >
                {resettingDevices ? "جارٍ تسجيل الخروج وتفريغ الأجهزة..." : "🚪 تسجيل الخروج من كل الأجهزة"}
              </button>
            )}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">رقم المتعلم</label>
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

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">كلمة المرور</label>
              <Link href="/forgot-password" className="text-xs text-sky-600 dark:text-sky-400 hover:underline">
                نسيت كلمة المرور؟
              </Link>
            </div>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-sky-500"
              placeholder="********"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3.5 bg-gradient-to-l from-sky-600 to-blue-700 hover:from-sky-700 hover:to-blue-800 disabled:opacity-60 text-white font-bold rounded-xl transition-all shadow-md"
          >
            {loading ? "جاري تسجيل الدخول..." : "دخول"}
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
