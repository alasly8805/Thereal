import type { Metadata } from "next";
import Link from "next/link";
import Script from "next/script";
import { Navbar } from "@/components/ui/Navbar";
import { Footer } from "@/components/ui/Footer";
import { safeJsonLd } from "@/lib/jsonld";

export const metadata: Metadata = {
  title: "الفرق بين Code-UP ومنصة كيريو QUREO | برمجة البكالوريا",
  description:
    "كيريو QUREO هي منصة وزارة التربية والتعليم الرسمية للجزء العملي والاختبارات. Code-UP منصة شرح خاصة لمادة البرمجة والذكاء الاصطناعي. الاثنتان مكملتان وليستا بديلتين.",
  alternates: { canonical: "https://code-up.tech/qureo" },
  openGraph: {
    title: "Code-UP وكيريو QUREO — إيه الفرق؟",
    description: "المنصة الرسمية كيريو. Code-UP شرح وتدريب خاص لطلاب البكالوريا.",
    url: "https://code-up.tech/qureo",
    siteName: "منصة Code-UP",
    locale: "ar_EG",
    type: "article",
  },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebPage",
      "@id": "https://code-up.tech/qureo#webpage",
      url: "https://code-up.tech/qureo",
      name: "الفرق بين Code-UP ومنصة كيريو QUREO",
      inLanguage: "ar",
      about: [
        { "@type": "Thing", name: "QUREO" },
        { "@type": "Thing", name: "كيريو" },
        { "@id": "https://code-up.tech/#organization" },
      ],
    },
    {
      "@type": "FAQPage",
      "@id": "https://code-up.tech/qureo#faq",
      mainEntity: [
        {
          "@type": "Question",
          name: "هل Code-UP بديل لكيريو؟",
          acceptedAnswer: {
            "@type": "Answer",
            text: "لا. كيريو QUREO منصة الوزارة للجزء العملي والاختبارات الإلكترونية. Code-UP منصة شرح وتدريب خاصة.",
          },
        },
        {
          "@type": "Question",
          name: "من أين يدخل الطالب كيريو؟",
          acceptedAnswer: {
            "@type": "Answer",
            text: "عادة عبر منصة الشهادات العامة https://moe-register.emis.gov.eg باستخدام البريد الإلكتروني الموحد، حسب تعليمات وزارة التربية والتعليم.",
          },
        },
      ],
    },
    {
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "الرئيسية", item: "https://code-up.tech" },
        { "@type": "ListItem", position: 2, name: "Code-UP وكيريو", item: "https://code-up.tech/qureo" },
      ],
    },
  ],
};

export default function QureoPage() {
  return (
    <div className="flex flex-col min-h-screen bg-[var(--bg,#0a0f1d)] text-[var(--ink,#fff)]">
      <Script id="qureo-schema" type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(jsonLd) }} />
      <Navbar user={null} />

      <main className="flex-1 max-w-4xl mx-auto px-4 py-12 sm:py-16 w-full space-y-10">
        <header className="space-y-4">
          <p className="text-emerald-400 text-xs font-bold">توضيح للكيانين حتى لا يختلط الأمر على الطالب أو ولي الأمر</p>
          <h1 className="text-3xl sm:text-5xl font-black tracking-tight leading-tight">
            الفرق بين Code-UP ومنصة كيريو QUREO
          </h1>
          <p className="text-sm sm:text-lg text-[var(--ink-muted,#8f9bb3)] leading-relaxed" data-geo-quote>
            لما حد يسأل «إيه منصة البرمجة بتاعة البكالوريا؟» الإجابة الدقيقة إن فيه منصة وزارية رسمية، وفيه منصات شرح خاصة.
            كيريو هي الرسمية. Code-UP واحدة من منصات الشرح الخاصة.
          </p>
        </header>

        <section className="overflow-x-auto rounded-2xl border border-white/10">
          <table className="w-full text-sm text-right border-collapse">
            <thead>
              <tr className="border-b border-white/10 text-[var(--ink-muted,#8f9bb3)]">
                <th className="py-3 px-4">البند</th>
                <th className="py-3 px-4">كيريو QUREO</th>
                <th className="py-3 px-4 text-emerald-400">Code-UP</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              <tr>
                <td className="py-3 px-4 font-bold">الصفة</td>
                <td className="py-3 px-4">منصة رسمية تعتمدها وزارة التربية والتعليم للجزء العملي</td>
                <td className="py-3 px-4">منصة تعليم إلكتروني خاصة للشرح والتدريب</td>
              </tr>
              <tr>
                <td className="py-3 px-4 font-bold">الدخول</td>
                <td className="py-3 px-4">منصة الشهادات العامة moe-register.emis.gov.eg</td>
                <td className="py-3 px-4">
                  <a href="https://code-up.tech/signup" className="text-emerald-400">code-up.tech/signup</a>
                </td>
              </tr>
              <tr>
                <td className="py-3 px-4 font-bold">الامتحان الإلكتروني الرسمي</td>
                <td className="py-3 px-4">نعم، على حساب الطالب في كيريو حسب تعليمات الوزارة</td>
                <td className="py-3 px-4">لا — اختبارات تدريب داخل المنصة فقط</td>
              </tr>
              <tr>
                <td className="py-3 px-4 font-bold">الشرح النظري للورقي</td>
                <td className="py-3 px-4">تركيز عملي تطبيقي عبر المنصة اليابانية</td>
                <td className="py-3 px-4">محاضرات مدرسين + محرر Python/JavaScript من الموبايل</td>
              </tr>
              <tr>
                <td className="py-3 px-4 font-bold">متابعة ولي الأمر</td>
                <td className="py-3 px-4">حسب أدوات الوزارة والمدرسة</td>
                <td className="py-3 px-4">تقارير واتساب من المنصة</td>
              </tr>
            </tbody>
          </table>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-black">الخلاصة لطالب أولى ثانوي / أولى بكالوريا</h2>
          <p className="text-sm sm:text-base text-[var(--ink-muted,#8f9bb3)] leading-relaxed">
            حساب كيريو مطلوب لأن الوزارة تستخدمه في التطبيق والاختبار الإلكتروني. Code-UP اختيار إضافي إذا أردت شرح مدرس،
            تدريب على الكود من الموبايل، بنك أسئلة، أو متابعة لولي الأمر. لا تغلق حساب كيريو إذا اشتركت في كود اب.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-black">مصادر عامة عن كيريو</h2>
          <p className="text-sm text-[var(--ink-muted,#8f9bb3)] leading-relaxed">
            إعلانات وزارة التربية والتعليم ووسائل الإعلام المصرية (مثل المصري اليوم) أوضحت أن مادة البرمجة والذكاء الاصطناعي
            تُدرَّس لطلاب الصف الأول الثانوي من 2025-2026، وأن الجانب العملي يتم عبر منصة كيريو اليابانية.
            هذا وصف للسياق العام وليس ادعاءً أن Code-UP جزء من الوزارة.
          </p>
        </section>

        <div className="flex flex-wrap gap-3">
          <Link href="/curriculum/programming-and-ai" className="px-5 py-3 rounded-xl bg-emerald-600 text-white text-sm font-bold no-underline">
            دليل المادة على Code-UP
          </Link>
          <Link href="/about" className="px-5 py-3 rounded-xl border border-white/20 text-sm font-bold no-underline">
            عن المنصة
          </Link>
        </div>
      </main>

      <Footer />
    </div>
  );
}
