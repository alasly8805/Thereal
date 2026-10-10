"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Script from "next/script";
import { Navbar } from "@/components/ui/Navbar";
import { Footer } from "@/components/ui/Footer";
import { HeroSection } from "@/components/home/HeroSection";
import { FeaturesSection } from "@/components/home/FeaturesSection";
import { ContactSection } from "@/components/home/ContactSection";
import { CoursesShowcase } from "@/components/home/CoursesShowcase";
import type { MeUser } from "@/lib/fetch-me";
import type { SiteText } from "@/lib/site-text";
import { safeJsonLd } from "@/lib/jsonld";

/**
 * Client shell for the homepage. Site copy (`text`) is server-rendered and
 * passed in as a prop — no fetch, no flash. Only the logged-in/out state is
 * resolved client-side via /api/auth/me.
 */
export function HomeContent({ text }: { text: SiteText }) {
  const [user, setUser] = useState<MeUser | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const response = await fetch("/api/auth/me", { credentials: "include" });
        const data = (await response.json()) as { user: MeUser | null };
        if (!cancelled) setUser(data.user ?? null);
      } catch {
        if (!cancelled) setUser(null);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const isLoggedIn = Boolean(user);

  return (
    <div className="flex flex-col min-h-screen bg-[var(--bg)]">
      <Script
        id="organization-schema"
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: safeJsonLd({
            "@context": "https://schema.org",
            "@type": "Organization",
            "name": "منصة Code-UP الكورسات",
            "alternateName": "Code-UP",
            "url": "https://code-up.tech",
            "logo": "https://code-up.tech/logo.jpeg",
            "description": "منصة تعليمية مصرية لشرح البرمجة والذكاء الاصطناعي لطلاب البكالوريا والثانوية. محاضرات فيديو، محرر أكواد مدمج، ومتابعة ولي الأمر.",
            "contactPoint": {
              "@type": "ContactPoint",
              "telephone": "+20-111-880-2621",
              "contactType": "customer service",
              "areaServed": "EG",
              "availableLanguage": "Arabic"
            },
            "sameAs": [
              "https://www.facebook.com/CodeUpAcad",
              "https://kemetcraft.me/"
            ]
          })
        }}
      />
      <Navbar user={user ? { name: user.name, role: user.role } : null} />
      <main className="flex-1">
        <HeroSection isLoggedIn={isLoggedIn} subtitle={text.hero_subtitle} />
        <CoursesShowcase isLoggedIn={isLoggedIn} />
        <FeaturesSection />

        {/* ─── Parent Portal Banner ──────────────────────────────────── */}
        <section
          id="parent-portal-banner"
          className="py-16 border-t"
          style={{ background: "var(--bg-2)", borderColor: "var(--border)" }}
        >
          <div className="max-w-4xl mx-auto px-4">
            <Link
              href="/parent"
              id="parent-portal-link"
              className="group flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6 rounded-2xl px-7 py-6 no-underline transition-all"
              style={{
                background: "var(--surface)",
                border: "1px solid var(--border)",
                boxShadow: "var(--shadow-sm)",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.borderColor = "var(--brand)";
                (e.currentTarget as HTMLElement).style.boxShadow = "0 0 30px var(--brand-soft), var(--shadow-sm)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.borderColor = "var(--border)";
                (e.currentTarget as HTMLElement).style.boxShadow = "var(--shadow-sm)";
              }}
            >
              <div className="flex items-center gap-5">
                <div
                  className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0 transition-colors"
                  style={{
                    background: "var(--brand-soft)",
                    border: "1px solid var(--brand)",
                  }}
                >
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="var(--brand)" strokeWidth={1.5} aria-hidden>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-lg font-bold tracking-tight mb-0.5" style={{ color: "var(--ink)", fontFamily: "var(--font-head)" }}>بوابة ولي الأمر</h3>
                  <p className="text-sm" style={{ color: "var(--ink-2)" }}>تابع الأداء الأكاديمي، النقاط، وتقارير الذكاء الاصطناعي للمتعلم.</p>
                </div>
              </div>
              <span className="shrink-0 inline-flex items-center gap-2 text-sm font-semibold transition-colors" style={{ color: "var(--brand)" }}>
                الدخول لبوابة المتابعة
                <svg className="w-4 h-4 rotate-180 transition-transform group-hover:-translate-x-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </span>
            </Link>
          </div>
        </section>

        <ContactSection
          heading={text.contact_heading}
          subtitle={text.contact_subtitle}
          email={text.contact_email}
          phone={text.contact_phone}
        />

        {/* ─── Final CTA (logged-out only) ───────────────────────────── */}
        {!isLoggedIn && (
          <section className="py-28 border-t" style={{ background: "var(--bg-2)", borderColor: "var(--border)" }}>
            <div className="max-w-3xl mx-auto px-4 text-center">
              <h2
                className="text-balance text-3xl md:text-4xl font-black tracking-tight mb-4"
                style={{ color: "var(--ink)", fontFamily: "var(--font-head)" }}
              >
                {text.cta_heading}
              </h2>
              <p className="text-base md:text-lg mb-10 max-w-xl mx-auto font-medium" style={{ color: "var(--ink-2)" }}>
                {text.cta_subtitle}
              </p>
              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <Link
                  href="/signup"
                  id="footer-cta-signup"
                  className="group relative min-h-14 px-8 py-4 font-bold rounded-full text-base flex w-full sm:w-auto items-center justify-center overflow-hidden transition-colors hover:bg-[var(--brand-strong)]"
                  style={{
                    background: "var(--brand)",
                    color: "var(--on-brand)",
                    boxShadow: "0 8px 24px -10px var(--brand-shadow)",
                  }}
                >
                  <span className="relative z-10">إنشاء حساب مجاني</span>
                  <span aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden rounded-full">
                    <span className="absolute inset-y-0 left-[-45%] w-1/3 -skew-x-12 bg-gradient-to-r from-transparent via-white/30 to-transparent blur-sm transition-[left] duration-700 ease-out group-hover:left-[115%]" />
                  </span>
                </Link>
                <Link
                  href="/courses"
                  id="footer-cta-courses"
                  className="px-8 py-4 font-bold rounded-full text-base flex w-full sm:w-auto items-center justify-center transition-all hover:border-[var(--brand-strong)]"
                  style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--ink-2)" }}
                >
                  تصفح الكورسات
                </Link>
              </div>
            </div>
          </section>
        )}
      </main>
      <Footer />
    </div>
  );
}
