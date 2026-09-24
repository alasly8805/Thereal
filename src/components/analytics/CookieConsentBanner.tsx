"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Shield } from "lucide-react";
import {
  SHOW_COOKIE_CONSENT_BANNER,
  isMetaPixelAllowedPath,
  readMarketingConsent,
  writeMarketingConsent,
  type MarketingConsent,
} from "@/lib/meta-pixel";
import { usePathname } from "next/navigation";

type Props = {
  onConsentChange: (value: MarketingConsent) => void;
};

export function CookieConsentBanner({ onConsentChange }: Props) {
  const pathname = usePathname() || "/";
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!SHOW_COOKIE_CONSENT_BANNER || !isMetaPixelAllowedPath(pathname)) {
      setVisible(false);
      return;
    }
    setVisible(readMarketingConsent() === null);
  }, [pathname]);

  if (!visible) return null;

  const choose = (value: MarketingConsent) => {
    writeMarketingConsent(value);
    onConsentChange(value);
    setVisible(false);
  };

  return (
    <div
      role="dialog"
      aria-labelledby="cookie-consent-title"
      aria-describedby="cookie-consent-desc"
      className="fixed inset-x-0 bottom-[calc(60px+env(safe-area-inset-bottom,0px))] lg:bottom-0 z-[80] p-3 sm:p-4 pointer-events-none"
      dir="rtl"
    >
      <div
        className="pointer-events-auto mx-auto max-w-[720px] rounded-2xl border border-slate-700/80 bg-slate-950/95 text-slate-100 shadow-2xl backdrop-blur-md"
        style={{ fontFamily: "var(--font-body)" }}
      >
        <div className="flex gap-3 p-4 sm:p-5">
          <div className="hidden sm:flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-500/15 text-teal-300 border border-teal-500/30">
            <Shield className="w-5 h-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 id="cookie-consent-title" className="text-sm sm:text-base font-black text-white mb-1">
              ملفات تعريف الارتباط للإعلانات
            </h2>
            <p id="cookie-consent-desc" className="text-xs sm:text-sm text-slate-300 leading-relaxed">
              نستخدم أداة قياس من Meta (بيكسل الراعي) على الصفحات العامة فقط لمعرفة إن كانت الحملات الإعلانية تصل
              للصفحة الرئيسية وصفحات الكورسات. لا نرسل أرقام الهواتف أو البريد أو بيانات الحساب. يمكنك الرفض دون
              أي تأثير على استخدام المنصة.{" "}
              <Link href="/privacy" className="text-teal-300 underline underline-offset-2 hover:text-teal-200">
                التفاصيل في سياسة الخصوصية
              </Link>
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => choose("granted")}
                className="rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-xs sm:text-sm font-bold px-4 py-2 transition-colors cursor-pointer"
              >
                موافق
              </button>
              <button
                type="button"
                onClick={() => choose("denied")}
                className="rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs sm:text-sm font-semibold px-4 py-2 border border-slate-600 transition-colors cursor-pointer"
              >
                رفض
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
