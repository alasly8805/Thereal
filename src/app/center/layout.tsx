import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "بوابة طلاب السنتر 🏛️ | منصة الحصص والمجموعات الحضورية — Code-UP",
  description:
    "بوابة طلاب السنتر على منصة Code-UP: فعّل كود الحصة المسلّم لك في القاعة أو امسح الـ QR Code ليُضاف الكورس فوراً إلى مكتبتك وتبدأ المشاهدة مباشرة.",
  robots: { index: false, follow: false },
  openGraph: {
    title: "بوابة طلاب السنتر 🏛️ | منصة الحصص والمجموعات الحضورية",
    description:
      "فعّل كود حصة السنتر واحصل على محاضراتك فوراً داخل مكتبتك على منصة Code-UP.",
    url: "https://center.code-up.tech/",
    siteName: "منصة Code-UP التعليمية",
    locale: "ar_EG",
    type: "website",
  },
  alternates: {
    canonical: "https://center.code-up.tech/",
  },
};

export default function CenterLayout({ children }: { children: React.ReactNode }) {
  return children;
}
