import type { Metadata } from "next";
import Script from "next/script";
import { PAYMENT_FAQS, faqsToJsonLd } from "@/lib/geo-faqs";
import { TOP_META_KEYWORDS } from "@/lib/seo-keywords";
import { safeJsonLd } from "@/lib/jsonld";

export const metadata: Metadata = {
  title: "طرق الدفع والشحن | فودافون كاش وإنستاباي وفوري — Code-UP",
  description:
    "ادفع على منصة Code-UP بفودافون كاش، إنستاباي، فوري، المحافظ، أو البطاقة. حاسبة رسوم تظهر قبل التحويل.",
  keywords: [...TOP_META_KEYWORDS],
  alternates: {
    canonical: "https://code-up.tech/payment-methods",
  },
  openGraph: {
    title: "طرق الدفع والشحن الإلكتروني | منصة Code-UP",
    description: "فودافون كاش، انستاباي InstaPay، وفوري لشحن حساب كود اب.",
    url: "https://code-up.tech/payment-methods",
    siteName: "منصة Code-UP التعليمية",
    type: "website",
  },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    faqsToJsonLd(PAYMENT_FAQS, "https://code-up.tech/payment-methods#faq"),
    {
      "@type": "HowTo",
      "@id": "https://code-up.tech/payment-methods#howto",
      name: "ازاي أشحن حساب Code-UP بفودافون كاش أو إنستاباي",
      description: "خطوات الدفع على كود اب بفودافون كاش أو إنستاباي أو فوري.",
      inLanguage: "ar",
      step: [
        { "@type": "HowToStep", position: 1, name: "افتح طرق الدفع", text: "ادخل https://code-up.tech/payment-methods واختر الوسيلة." },
        { "@type": "HowToStep", position: 2, name: "احسب الرسوم", text: "استخدم حاسبة الرسوم لمعرفة الإجمالي قبل التحويل." },
        { "@type": "HowToStep", position: 3, name: "أكد الدفع", text: "ادفع بفودافون كاش أو إنستاباي أو فوري ثم يعود الرصيد لحسابك." },
      ],
    },
  ],
};

export default function PaymentMethodsLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Script
        id="payment-methods-schema"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLd(jsonLd) }}
      />
      {children}
    </>
  );
}
