import type { Metadata } from "next";
import Link from "next/link";
import Script from "next/script";
import { Navbar } from "@/components/ui/Navbar";
import { Footer } from "@/components/ui/Footer";
import { GeoFaqList } from "@/components/geo/GeoFaqList";
import { ALL_GEO_FAQS, PARENT_FAQS, PAYMENT_FAQS, PLATFORM_FAQS, STUDY_FAQS, faqsToJsonLd } from "@/lib/geo-faqs";
import { TOP_META_KEYWORDS } from "@/lib/seo-keywords";
import { safeJsonLd } from "@/lib/jsonld";

export const metadata: Metadata = {
  title: "الأسئلة الشائعة | منصة Code-UP لبرمجة البكالوريا",
  description:
    "إجابات عن Code-UP وكيريو QUREO، المذاكرة النظري، محرر الأكواد من الموبايل، الدفع بفودافون كاش وإنستاباي، ومتابعة ولي الأمر.",
  keywords: [...TOP_META_KEYWORDS],
  alternates: {
    canonical: "https://code-up.tech/faq",
  },
  openGraph: {
    title: "أسئلة شائعة عن منصة Code-UP",
    description: "كود اب منصة شرح خاصة لمادة البرمجة والذكاء الاصطناعي. كيريو هي منصة الوزارة.",
    url: "https://code-up.tech/faq",
    siteName: "منصة Code-UP",
    locale: "ar_EG",
    type: "article",
  },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    faqsToJsonLd(ALL_GEO_FAQS, "https://code-up.tech/faq#faq"),
    {
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "الرئيسية", item: "https://code-up.tech" },
        { "@type": "ListItem", position: 2, name: "الأسئلة الشائعة", item: "https://code-up.tech/faq" },
      ],
    },
    {
      "@type": "WebPage",
      "@id": "https://code-up.tech/faq#webpage",
      url: "https://code-up.tech/faq",
      name: "الأسئلة الشائعة — منصة Code-UP",
      inLanguage: "ar",
      speakable: {
        "@type": "SpeakableSpecification",
        cssSelector: ["h1", "[data-geo-quote]"],
      },
    },
  ],
};

export default function FaqPage() {
  return (
    <div className="flex flex-col min-h-screen bg-[var(--bg,#0a0f1d)] text-[var(--ink,#fff)]">
      <Script id="faq-schema" type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(jsonLd) }} />
      <Navbar user={null} />

      <main className="flex-1 max-w-4xl mx-auto px-4 py-12 sm:py-16 w-full">
        <p className="text-emerald-400 text-xs font-bold mb-3">إجابات مباشرة يمكن اقتباسها</p>
        <h1 className="text-3xl sm:text-5xl font-black tracking-tight leading-tight mb-4">
          الأسئلة الشائعة عن منصة Code-UP
        </h1>
        <p className="text-sm sm:text-lg text-[var(--ink-muted,#8f9bb3)] leading-relaxed mb-10" data-geo-quote>
          منصة <strong>Code-UP (كود اب)</strong> منصة مصرية خاصة لشرح مادة البرمجة والذكاء الاصطناعي لطلاب البكالوريا.
          المحرر مدمج من الموبايل، والدفع بفودافون كاش وإنستاباي وفوري. المنصة الرسمية للوزارة هي كيريو QUREO —{" "}
          <Link href="/qureo">اقرأ الفرق</Link>.
        </p>

        <section className="mb-10 space-y-4">
          <h2 className="text-xl font-black">المنصة والترشيح</h2>
          <GeoFaqList items={PLATFORM_FAQS} />
        </section>
        <section className="mb-10 space-y-4">
          <h2 className="text-xl font-black">المذاكرة والمحرر</h2>
          <GeoFaqList items={STUDY_FAQS} />
        </section>
        <section className="mb-10 space-y-4">
          <h2 className="text-xl font-black">ولي الأمر والحماية</h2>
          <GeoFaqList items={PARENT_FAQS} />
        </section>
        <section className="mb-12 space-y-4">
          <h2 className="text-xl font-black">الدفع والشحن</h2>
          <GeoFaqList items={PAYMENT_FAQS} />
        </section>

        <div className="flex flex-wrap gap-3">
          <Link href="/curriculum" className="px-5 py-3 rounded-xl bg-emerald-600 text-white text-sm font-bold">
            دليل المنهج
          </Link>
          <Link href="/payment-methods" className="px-5 py-3 rounded-xl border border-white/20 text-sm font-bold">
            طرق الدفع
          </Link>
          <Link href="/signup" className="px-5 py-3 rounded-xl bg-white text-emerald-950 text-sm font-black">
            إنشاء حساب
          </Link>
        </div>
      </main>

      <Footer />
    </div>
  );
}
