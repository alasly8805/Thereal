import type { Metadata } from "next";
import { cookies, headers } from "next/headers";
import { ThemeProvider } from "@/components/theme/ThemeProvider";
import { ToastProvider } from "@/components/ui/Toast";
import { Toaster } from "@/components/ui/sonner";
import { ErrorReporter } from "@/components/ErrorReporter";
import { AIAssistant } from "@/components/ai/AIAssistant";
import { MobileTabBar } from "@/components/ui/MobileTabBar";
import { CenterModeBanner } from "@/components/center/CenterModeBanner";
import SupportViewBanner from "@/components/SupportViewBanner";
import StudentPollGate from "@/components/student/StudentPollGate";
import NewCoursePopupGate from "@/components/student/NewCoursePopupGate";
import { MaintenanceScreen } from "@/components/MaintenanceScreen";
import { OverloadWaitingScreen } from "@/components/OverloadWaitingScreen";
import { THEME_INIT_SCRIPT } from "@/lib/theme";
import { verifyToken } from "@/lib/auth";
import { getMaintenanceMode, getMaintenanceMessage } from "@/lib/settings";
import { getOverloadProtectionState } from "@/lib/overload-protection";
import { TOP_META_KEYWORDS } from "@/lib/seo-keywords";
import { safeJsonLd } from "@/lib/jsonld";
import { SponsorMetaPixel } from "@/components/analytics/SponsorMetaPixel";
import { META_PIXEL_ID } from "@/lib/meta-pixel";
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
      // Support must stay reachable during maintenance and overload — that is
      // precisely when students flood the inbox asking why nothing works.
      pathname.startsWith("/thefake/support") ||
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
    default: "منصة Code-UP | شرح البرمجة والذكاء الاصطناعي لطلاب البكالوريا والثانوية",
    template: "%s | منصة Code-UP التعليمية",
  },
  description: "منصة تعليمية لشرح البرمجة النظري والعملي لطلاب البكالوريا والثانوية العامة. محرر أكواد مدمج، تعدد المعلمين، بنك أسئلة، ومتابعة ولي الأمر.",
  keywords: [...TOP_META_KEYWORDS],
  alternates: {
    canonical: "https://code-up.tech",
  },
  icons: {
    icon: "/logo.jpeg",
  },
  openGraph: {
    title: "منصة Code-UP | شرح البرمجة والذكاء الاصطناعي للبكالوريا",
    description: "شرح البرمجة النظري والعملي لطلاب البكالوريا والثانوية، مع محرر أكواد مدمج وتعدد المعلمين.",
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
    title: "منصة Code-UP | شرح البرمجة والذكاء الاصطناعي للبكالوريا",
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
        "كوداب",
        "منصة كوداب"
      ],
      "url": "https://code-up.tech",
      "logo": "https://code-up.tech/logo.jpeg",
      "image": "https://code-up.tech/og-image.jpeg",
      "email": "contact@code-up.tech",
      "telephone": "+20-111-880-2621",
      "description": "منصة تعليم إلكتروني مصرية خاصة لشرح مادة البرمجة والذكاء الاصطناعي لطلاب البكالوريا والثانوية العامة. ليست منصة وزارة التربية والتعليم وليست كيريو QUREO.",
      "knowsAbout": [
        "برمجة ثانوية عامة",
        "برمجة بكالوريا",
        "البرمجة النظري",
        "البرمجة العملي",
        "Python",
        "JavaScript",
        "خرائط التدفق",
        "الخوارزميات",
        "ذكاء اصطناعي",
        "متابعة ولي الأمر",
        "فودافون كاش",
        "إنستاباي",
        "فوري",
        "محرر أكواد مدمج",
        "QUREO",
        "كيريو"
      ],
      "areaServed": {
        "@type": "Country",
        "name": "Egypt"
      },
      "parentOrganization": {
        "@type": "Organization",
        "name": "KemetCraft Engineering",
        "url": "https://kemetcraft.me/"
      },
      "sameAs": [
        "https://www.facebook.com/CodeUpAcad",
        "https://kemetcraft.me/"
      ],
      "contactPoint": {
        "@type": "ContactPoint",
        "telephone": "+20-111-880-2621",
        "email": "contact@code-up.tech",
        "contactType": "customer service",
        "areaServed": "EG",
        "availableLanguage": ["ar", "en"]
      }
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
      "@type": "WebPage",
      "@id": "https://code-up.tech/#webpage",
      "url": "https://code-up.tech",
      "name": "منصة Code-UP",
      "inLanguage": "ar",
      "speakable": {
        "@type": "SpeakableSpecification",
        "cssSelector": ["h1", "[data-geo-quote]"]
      }
    }
  ]
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const gateState = await resolveGatedState();
  const pathname = (await headers()).get("x-pathname") ?? "";
  const hideAppChrome =
    pathname.startsWith("/adminpanel") ||
    pathname.startsWith("/preview") ||
    pathname.startsWith("/thefake/support");

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
        <link rel="alternate" type="text/plain" href="https://code-up.tech/llms.txt" title="llms.txt" />
        <link rel="alternate" type="text/plain" href="https://code-up.tech/llms-full.txt" title="llms-full.txt" />
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
        <noscript>
          <img
            height={1}
            width={1}
            style={{ display: "none" }}
            src={`https://www.facebook.com/tr?id=${META_PIXEL_ID}&ev=PageView&noscript=1`}
            alt=""
          />
        </noscript>
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
                <Toaster />
                <CenterModeBanner />
                <SupportViewBanner />
                {children}
                {!hideAppChrome && <AIAssistant />}
                {!hideAppChrome && <MobileTabBar />}
                {!hideAppChrome && <StudentPollGate />}
                {!hideAppChrome && <NewCoursePopupGate />}
                {!hideAppChrome && <SponsorMetaPixel />}
              </ToastProvider>
            </>
          )}
        </ThemeProvider>
      </body>
    </html>
  );
}
