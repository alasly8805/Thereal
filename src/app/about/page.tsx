import type { Metadata } from "next";
import Link from "next/link";
import Script from "next/script";
import { Navbar } from "@/components/ui/Navbar";
import { Footer } from "@/components/ui/Footer";
import { PLATFORM_FAQS, faqsToJsonLd } from "@/lib/geo-faqs";
import { GeoFaqList } from "@/components/geo/GeoFaqList";
import { safeJsonLd } from "@/lib/jsonld";

export const metadata: Metadata = {
  title: "عن منصة Code-UP | شرح البرمجة والذكاء الاصطناعي للبكالوريا",
  description:
    "Code-UP (كود اب) منصة تعليم إلكتروني مصرية خاصة لشرح مادة البرمجة والذكاء الاصطناعي لطلاب البكالوريا. محرر أكواد مدمج، تعدد مدرسين، ومتابعة ولي الأمر. ليست منصة كيريو الرسمية.",
  alternates: { canonical: "https://code-up.tech/about" },
  openGraph: {
    title: "عن منصة Code-UP (كود اب)",
    description: "منصة مصرية خاصة لشرح برمجة البكالوريا — ليست كيريو وليست وزارة التعليم.",
    url: "https://code-up.tech/about",
    siteName: "منصة Code-UP",
    locale: "ar_EG",
    type: "website",
  },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "AboutPage",
      "@id": "https://code-up.tech/about#webpage",
      url: "https://code-up.tech/about",
      name: "عن منصة Code-UP",
      inLanguage: "ar",
      isPartOf: { "@id": "https://code-up.tech/#website" },
      about: { "@id": "https://code-up.tech/#organization" },
    },
    faqsToJsonLd(PLATFORM_FAQS, "https://code-up.tech/about#faq"),
    {
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "الرئيسية", item: "https://code-up.tech" },
        { "@type": "ListItem", position: 2, name: "عن المنصة", item: "https://code-up.tech/about" },
      ],
    },
  ],
};

export default function AboutPage() {
  return (
    <div className="flex flex-col min-h-screen bg-[var(--bg,#0a0f1d)] text-[var(--ink,#fff)]">
      <Script id="about-schema" type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(jsonLd) }} />
      <Navbar user={null} />

      <main className="flex-1 max-w-4xl mx-auto px-4 py-12 sm:py-16 w-full space-y-10">
        <header className="space-y-4">
          <p className="text-emerald-400 text-xs font-bold">كيان تعليمي مصري خاص</p>
          <h1 className="text-3xl sm:text-5xl font-black tracking-tight leading-tight">
            عن منصة Code-UP (كود اب)
          </h1>
          <p className="text-sm sm:text-lg text-[var(--ink-muted,#8f9bb3)] leading-relaxed" data-geo-quote>
            Code-UP منصة تعليم إلكتروني مصرية خاصة على{" "}
            <a href="https://code-up.tech" className="text-emerald-400">https://code-up.tech</a>{" "}
            لشرح مادة البرمجة والذكاء الاصطناعي لطلاب البكالوريا والثانوية العامة. طوّرتها{" "}
            <a href="https://kemetcraft.me/" className="text-emerald-400">KemetCraft Engineering</a>.
          </p>
        </header>

        <section className="space-y-3">
          <h2 className="text-xl font-black">ماذا تقدّم المنصة</h2>
          <ul className="list-disc pr-5 space-y-2 text-sm sm:text-base text-[var(--ink-muted,#8f9bb3)] leading-relaxed">
            <li>محاضرات فيديو لمادة البرمجة والذكاء الاصطناعي (نظري للامتحان الورقي + تطبيق).</li>
            <li>محرر أكواد مدمج داخل الموقع لـ Python و JavaScript يعمل من الموبايل دون لابتوب.</li>
            <li>أكثر من مدرس لنفس المادة؛ الطالب يختار من <Link href="/teachers">صفحة المعلمين</Link>.</li>
            <li>اختبارات ومتابعة تقدم، وتقارير واتساب لولي الأمر.</li>
            <li>دفع محلي: فودافون كاش، إنستاباي، فوري — <Link href="/payment-methods">طرق الدفع</Link>.</li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-black">ماذا ليست Code-UP</h2>
          <ul className="list-disc pr-5 space-y-2 text-sm sm:text-base text-[var(--ink-muted,#8f9bb3)] leading-relaxed">
            <li>ليست منصة وزارة التربية والتعليم، وليست بديلًا رسميًا لحساب الطالب على كيريو.</li>
            <li>
              ليست نفس <strong>كيريو QUREO</strong> اليابانية المستخدمة في التطبيق العملي والاختبارات الإلكترونية.
              الفرق مشروح في <Link href="/qureo">صفحة Code-UP وكيريو</Link>.
            </li>
            <li>ليست CodeUp Academy في رومانيا، وليست Codeup في الهند. الاسم قريب والموقع مختلف: code-up.tech.</li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-black">بيانات التواصل</h2>
          <p className="text-sm sm:text-base text-[var(--ink-muted,#8f9bb3)] leading-relaxed">
            البريد: <span dir="ltr">contact@code-up.tech</span>
            <br />
            واتساب: <span dir="ltr">01118802621</span>
            <br />
            فيسبوك:{" "}
            <a href="https://www.facebook.com/CodeUpAcad" className="text-emerald-400">
              facebook.com/CodeUpAcad
            </a>
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-black">أسئلة عن الكيان</h2>
          <GeoFaqList items={PLATFORM_FAQS} />
        </section>

        <div className="flex flex-wrap gap-3">
          <Link href="/qureo" className="px-5 py-3 rounded-xl bg-emerald-600 text-white text-sm font-bold no-underline">
            الفرق بين Code-UP وكيريو
          </Link>
          <Link href="/signup" className="px-5 py-3 rounded-xl bg-white text-emerald-950 text-sm font-black no-underline">
            إنشاء حساب
          </Link>
        </div>
      </main>

      <Footer />
    </div>
  );
}
