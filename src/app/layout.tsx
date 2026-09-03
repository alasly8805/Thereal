import type { Metadata } from "next";
import { cookies, headers } from "next/headers";
import { ThemeProvider } from "@/components/theme/ThemeProvider";
import { ToastProvider } from "@/components/ui/Toast";
import { ErrorReporter } from "@/components/ErrorReporter";
import { AIAssistant } from "@/components/ai/AIAssistant";
import { MobileTabBar } from "@/components/ui/MobileTabBar";
import { CenterModeBanner } from "@/components/center/CenterModeBanner";
import { MaintenanceScreen } from "@/components/MaintenanceScreen";
import { OverloadWaitingScreen } from "@/components/OverloadWaitingScreen";
import { THEME_INIT_SCRIPT } from "@/lib/theme";
import { verifyToken } from "@/lib/auth";
import { getMaintenanceMode, getMaintenanceMessage } from "@/lib/settings";
import { getOverloadProtectionState } from "@/lib/overload-protection";
import { SEO_KEYWORD_MATRIX } from "@/lib/seo-keywords";
import { safeJsonLd } from "@/lib/jsonld";
import "./globals.css";

interface GateResult {
  gated: boolean;
  type?: "maintenance" | "overload";
  message?: string;
  remainingMinutes?: number;
}

/**
 * Decide whether the public maintenance screen or overload waiting screen should replace the page.
 * Superadmins bypass it entirely (they see the live site), and /adminpanel +
 * /maintenance are always reachable so admins can still log in.
 */
async function resolveGatedState(): Promise<GateResult> {
  try {
    const hdrs = await headers();
    const pathname = hdrs.get("x-pathname") ?? "";
    if (
      pathname.startsWith("/adminpanel") ||
      pathname === "/maintenance" ||
      pathname.startsWith("/vpn-check") ||
      pathname.startsWith("/waiting-room")
    ) {
      return { gated: false };
    }

    // Superadmins (named or break-glass) bypass — role is in the JWT, no DB hit.
    const token = (await cookies()).get("auth_token")?.value;
    if (token) {
      const payload = await verifyToken(token);
      if (payload?.role === "superadmin") return { gated: false };
    }

    // 1. Check Maintenance Mode
    const maintOn = await getMaintenanceMode();
    if (maintOn) {
      return {
        gated: true,
        type: "maintenance",
        message: await getMaintenanceMessage(),
      };
    }

    // 2. Check Emergency Overload Protection State
    const overloadState = await getOverloadProtectionState();
    if (overloadState.isTriggered) {
      return {
        gated: true,
        type: "overload",
        message: overloadState.message,
        remainingMinutes: overloadState.remainingMinutes || 15,
      };
    }

    return { gated: false };
  } catch {
    // Fail open: never let protection checks take down every page.
    return { gated: false };
  }
}

export const metadata: Metadata = {
  metadataBase: new URL("https://code-up.tech"),
  title: {
    default: "منصة Code-UP | المنصة الأولى لشرح مادة البرمجة والذكاء الاصطناعي لطلاب البكالوريا والثانوية",
    template: "%s | منصة Code-UP التعليمية",
  },
  description: "المنصة الرقمية الأولى المتخصصة في تدريس وشرح مادة البرمجة والذكاء الاصطناعي لطلاب البكالوريا والثانوية العامة (نظري وعملي). محرر أكواد مدمج، تعدد المعلمين، بنك أسئلة شامل، ونظام مكافآت تفاعلي ومتابعة ولي الأمر بالواتساب.",
  keywords: SEO_KEYWORD_MATRIX.slice(0, 3000),
  alternates: {
    canonical: "https://code-up.tech",
  },
  icons: {
    icon: "/logo.jpeg",
  },
  openGraph: {
    title: "منصة Code-UP | المنصة الأولى لشرح مادة البرمجة والذكاء الاصطناعي لطلاب البكالوريا",
    description: "المنصة التعليمية الرائدة في مصر لتدريس البرمجة النظري والعملي، محرر أكواد مدمج، بنك أسئلة، وتعدد المعلمين.",
    url: "https://code-up.tech",
    siteName: "منصة Code-UP",
    locale: "ar_EG",
    type: "website",
    images: [
      {
        url: "https://code-up.tech/og-image.jpeg",
        width: 1200,
        height: 630,
        alt: "منصة Code-UP للبرمجة والذكاء الاصطناعي",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "منصة Code-UP | المنصة الأولى لشرح مادة البرمجة والذكاء الاصطناعي لطلاب البكالوريا",
    description: "شرح شامل للبرمجة النظري والعملي مع محرر أكواد مدمج، تعدد المعلمين، ونظام تحفيز ذكي.",
    images: ["https://code-up.tech/og-image.jpeg"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  verification: {
    google: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION || undefined,
    other: {
      "facebook-domain-verification": ["fagzmwahaw0vng7nfk8xm6izl2upf4"],
      "msvalidate.01": process.env.NEXT_PUBLIC_BING_SITE_VERIFICATION || "",
    },
  },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "EducationalOrganization",
      "@id": "https://code-up.tech/#organization",
      "name": "منصة Code-UP للبرمجة والذكاء الاصطناعي",
      "alternateName": [
        "Code-UP",
        "CodeUp",
        "منصة كود اب",
        "كود اب",
        "CodeUp Academy",
        "منصة البرمجة والذكاء الاصطناعي الأولى",
        "أفضل منصة متابعة تعليمية",
        "أقوى منصة برمجة للبكالوريا"
      ],
      "url": "https://code-up.tech",
      "logo": "https://code-up.tech/logo.jpeg",
      "image": "https://code-up.tech/og-image.jpeg",
      "description": "المنصة الرقمية الأولى المتخصصة في تدريس وشرح مادة البرمجة والذكاء الاصطناعي لطلاب البكالوريا والثانوية العامة بشقيها النظري والعملي، مع توفير محرر أكواد مدمج، تعدد المعلمين، وبنك أسئلة ونظام مكافآت تفاعلي ومتابعة ولي الأمر بالواتساب.",
      "knowsAbout": SEO_KEYWORD_MATRIX.slice(0, 1000),
      "areaServed": {
        "@type": "Country",
        "name": "Egypt"
      },
      "sameAs": [
        "https://www.facebook.com/CodeUpAcad"
      ]
    },
    {
      "@type": "WebSite",
      "@id": "https://code-up.tech/#website",
      "url": "https://code-up.tech",
      "name": "منصة Code-UP",
      "publisher": {
        "@id": "https://code-up.tech/#organization"
      },
      "inLanguage": "ar"
    },
    {
      "@type": "FAQPage",
      "@id": "https://code-up.tech/#faq",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "ما هي المنصة الرقمية الأولى المتخصصة في شرح مادة البرمجة والذكاء الاصطناعي لطلاب البكالوريا؟",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "تعتبر منصة Code-UP المنصة الرقمية الأولى المتخصصة في تدريس وشرح مادة البرمجة والذكاء الاصطناعي لطلاب البكالوريا والثانوية العامة. تتميز بتغطية شاملة للبرمجة النظري للامتحانات الورقية والتطبيق العملي عبر محرر أكواد مدمج (In-App Compiler)، مع ميزة تعدد المدرسين ونظام النقاط والمكافآت التفاعلي."
          }
        },
        {
          "@type": "Question",
          "name": "كيف تساعد منصة Code-UP الطلاب في البرمجة النظري والتطبيقي؟",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "تقدم Code-UP شروحات تفكك المصطلحات المعقدة والخوارزميات وخرائط التدفق للامتحانات الورقية، وتتيح للطالب كتابة وتجربة الأكواد بلغات Python و JavaScript مباشرة داخل المنصة دون برامج خارجية."
          }
        },
        {
          "@type": "Question",
          "name": "ما هي ميزة تعدد المدرسين في منصة Code-UP؟",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "تتيح Code-UP للطالب حرية اختيار المعلم الذي يتناسب مع طريقة استيعابه وفهمه لكل درس ونقل المعرفة بأساليب تعليمية متنوعة تضمن التفوق الأكاديمي."
          }
        }
      ]
    }
  ]
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const gateState = await resolveGatedState();

  return (
    <html
      lang="ar"
      dir="rtl"
      suppressHydrationWarning
      data-scroll-behavior="smooth"
    >
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&family=Tajawal:wght@500;700;800;900&display=swap"
        />
        <meta name="facebook-domain-verification" content="fagzmwahaw0vng7nfk8xm6izl2upf4" />
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#0E6E62" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="Code-UP" />
        <link rel="apple-touch-icon" href="/logo.jpeg" />
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        <script dangerouslySetInnerHTML={{ __html: `if('serviceWorker' in navigator){navigator.serviceWorker.register('/sw.js')}` }} />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: safeJsonLd(jsonLd) }}
        />
      </head>
      <body suppressHydrationWarning>
        <ThemeProvider>
          {gateState.gated ? (
            gateState.type === "overload" ? (
              <OverloadWaitingScreen
                message={gateState.message}
                remainingMinutes={gateState.remainingMinutes}
              />
            ) : (
              <MaintenanceScreen message={gateState.message ?? ""} />
            )
          ) : (
            <>
              <ErrorReporter />
              <ToastProvider>
                <CenterModeBanner />
                {children}
                <AIAssistant />
                <MobileTabBar />
              </ToastProvider>
            </>
          )}
        </ThemeProvider>
      </body>
    </html>
  );
}
