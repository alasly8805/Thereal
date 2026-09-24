"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Script from "next/script";
import { usePathname } from "next/navigation";
import {
  META_PIXEL_ID,
  SHOW_COOKIE_CONSENT_BANNER,
  isMetaPixelAllowedPath,
  readMarketingConsent,
  type MarketingConsent,
} from "@/lib/meta-pixel";
import { CookieConsentBanner } from "./CookieConsentBanner";

declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void;
    _fbq?: (...args: unknown[]) => void;
  }
}

/**
 * Loads the sponsor Meta Pixel on public landing/catalog pages.
 * Consent bar is off — measurement runs as already agreed.
 * autoConfig is off so Meta does not scrape forms. No Advanced Matching / PII.
 */
export function SponsorMetaPixel() {
  const pathname = usePathname() || "/";
  const allowed = isMetaPixelAllowedPath(pathname);
  const [consent, setConsent] = useState<MarketingConsent | null>(null);
  const lastTrackedPath = useRef<string | null>(null);

  useEffect(() => {
    setConsent(readMarketingConsent());
  }, []);

  const onConsentChange = useCallback((value: MarketingConsent) => {
    setConsent(value);
  }, []);

  // Owner asked to run measurement without collecting موافق on each visit.
  // Banner stays hidden. Pixel still skipped on admin / watch / exams.
  const shouldLoad = allowed && (SHOW_COOKIE_CONSENT_BANNER ? consent === "granted" : true);

  useEffect(() => {
    if (!shouldLoad) return;

    // First PageView is in the official snippet below. Only extra hits are SPA navigations.
    if (lastTrackedPath.current === null) {
      lastTrackedPath.current = pathname;
      return;
    }
    if (lastTrackedPath.current === pathname) return;
    if (typeof window.fbq !== "function") return;
    lastTrackedPath.current = pathname;
    window.fbq("track", "PageView");
  }, [pathname, shouldLoad]);

  if (!shouldLoad) {
    return SHOW_COOKIE_CONSENT_BANNER ? (
      <CookieConsentBanner onConsentChange={onConsentChange} />
    ) : null;
  }

  return (
    <>
      {SHOW_COOKIE_CONSENT_BANNER ? (
        <CookieConsentBanner onConsentChange={onConsentChange} />
      ) : null}
      <Script id="meta-pixel" strategy="afterInteractive">
        {`
!function(f,b,e,v,n,t,s)
{if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};
if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];
s.parentNode.insertBefore(t,s)}(window, document,'script',
'https://connect.facebook.net/en_US/fbevents.js');
fbq('set','autoConfig',false,'${META_PIXEL_ID}');
fbq('init', '${META_PIXEL_ID}');
fbq('track', 'PageView');
        `.trim()}
      </Script>
    </>
  );
}
