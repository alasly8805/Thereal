import type { Metadata } from "next";
import Link from "next/link";
import Script from "next/script";
import { Navbar } from "@/components/ui/Navbar";
import { Footer } from "@/components/ui/Footer";
import { SEO_KEYWORD_MATRIX } from "@/lib/seo-keywords";
import { safeJsonLd } from "@/lib/jsonld";

export const metadata: Metadata = {
  title: "دليل مادة البرمجة والذكاء الاصطناعي (نظري وعملي) | منصة Code-UP",
  description:
    "الشرح الأكاديمي المتكامل لمنهج مادة البرمجة والذكاء الاصطناعي لطلاب الصف الأول الثانوي وطلاب البكالوريا. تفكيك النظري للامتحانات الورقية وتطبيقات عملية بمحرر الأكواد.",
  keywords: SEO_KEYWORD_MATRIX.slice(0, 600),
  alternates: {
    canonical: "https://code-up.tech/curriculum/programming-and-ai",
  },
  openGraph: {
    title: "دليل مادة البرمجة والذكاء الاصطناعي | منصة Code-UP",
    description: "شرح شامل للنظري والعملي، خرائط التدفق Flowcharts، الخوارزميات، ومحرر الأكواد المدمج لطلاب الثانوية والبكالوريا.",
    url: "https://code-up.tech/curriculum/programming-and-ai",
    siteName: "منصة Code-UP التعليمية",
    locale: "ar_EG",
    type: "article",
  },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Course",
      "@id": "https://code-up.tech/curriculum/programming-and-ai#course",
      "name": "مادة البرمجة والذكاء الاصطناعي الشاملة للثانوية العامة والبكالوريا",
      "description":
        "دورة دراسية معتمدة تجمع بين تفكيك المفاهيم النظرية المقررة في الامتحانات الورقية لوزارة التربية والتعليم والتطبيق العملي الكودي عبر محرر مباشر.",
      "provider": {
        "@type": "EducationalOrganization",
        "name": "Code-UP",
        "url": "https://code-up.tech"
      },
      "educationalLevel": "Grade 10 / Grade 11 / Baccalaureate",
      "inLanguage": "ar"
    },
    {
      "@type": "BreadcrumbList",
      "itemListElement": [
        { "@type": "ListItem", "position": 1, "name": "الرئيسية", "item": "https://code-up.tech" },
        { "@type": "ListItem", "position": 2, "name": "دليل المنهج", "item": "https://code-up.tech/curriculum" },
        { "@type": "ListItem", "position": 3, "name": "البرمجة والذكاء الاصطناعي", "item": "https://code-up.tech/curriculum/programming-and-ai" }
      ]
    }
  ]
};

export default function ProgrammingAndAiCurriculumPage() {
  return (
    <div className="flex min-h-screen flex-col bg-[#0b101b] text-slate-100 font-sans selection:bg-emerald-500 selection:text-white" dir="rtl">
      <Navbar />
      <Script
        id="programming-ai-jsonld"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLd(jsonLd) }}
      />

      <main className="flex-1">
        {/* Hero Section */}
        <section className="relative overflow-hidden py-16 sm:py-24 border-b border-slate-800/80 bg-gradient-to-b from-[#0f172a] via-[#0b101b] to-[#0b101b]">
          <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 text-center space-y-6">
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-4 py-1.5 text-xs sm:text-sm font-semibold text-emerald-400">
              <span>✨ المنهج الأقوى والأشمل في مصر لطلاب البكالوريا والثانوي</span>
            </div>
            <h1 className="text-3xl sm:text-5xl lg:text-6xl font-black tracking-tight text-white leading-tight">
              دليل مادة <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-teal-200">البرمجة والذكاء الاصطناعي</span>
            </h1>
            <p className="mx-auto max-w-3xl text-base sm:text-lg text-slate-300 leading-relaxed">
              منصة <strong>Code-UP</strong> صُممت خصيصاً لتجمع بين الفهم الأكاديمي النظري لضمان الدرجة النهائية في الامتحانات الورقية، وبين التطبيق البرمجي العملي الفوري عبر محرر الأكواد المدمج.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-4 pt-4">
              <Link
                href="/courses"
                className="rounded-xl bg-emerald-600 px-6 py-3.5 text-sm sm:text-base font-bold text-white shadow-lg shadow-emerald-600/30 hover:bg-emerald-500 transition-all no-underline"
              >
                تصفح كورسات المادة الآن ←
              </Link>
              <Link
                href="/environments/programming"
                className="rounded-xl border border-slate-700 bg-slate-800/80 px-6 py-3.5 text-sm sm:text-base font-bold text-slate-200 hover:bg-slate-700 hover:text-white transition-all no-underline"
              >
                جرب محرر الأكواد مجاناً 💻
              </Link>
            </div>
          </div>
        </section>

        {/* Breakdown Modules */}
        <section className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 py-16 space-y-12">
          <div className="grid gap-8 md:grid-cols-2">
            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-7 space-y-4">
              <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-500/10 text-2xl text-emerald-400">
                📝
              </div>
              <h2 className="text-xl font-bold text-white">1. الشق النظري (الامتحانات الورقية)</h2>
              <p className="text-sm leading-relaxed text-slate-300">
                شرح تفصيلي ومبسط لمفاهيم الخوارزميات، رسم خرائط التدفق (Flowcharts)، التفكير المنطقي، أنواع البيانات، المتغيرات، الدوال، وهياكل التحكم لضمان أعلى الدرجات في الأسئلة المقالية والاختيارية.
              </p>
            </div>

            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-7 space-y-4">
              <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-teal-500/10 text-2xl text-teal-400">
                ⚡
              </div>
              <h2 className="text-xl font-bold text-white">2. الشق العملي (محرر الأكواد المدمج)</h2>
              <p className="text-sm leading-relaxed text-slate-300">
                بيئة تدريب برمجية مدمجة داخل المنصة (In-App Compiler) تدعم لغات Python و JavaScript. يستطيع الطالب كتابة الكود وتجربته فوراً من الموبايل أو التابلت بدون الحاجة لتحميل برامج أو لابتوب.
              </p>
            </div>

            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-7 space-y-4">
              <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-500/10 text-2xl text-indigo-400">
                👥
              </div>
              <h2 className="text-xl font-bold text-white">3. ميزة تعدد المدرسين</h2>
              <p className="text-sm leading-relaxed text-slate-300">
                توفر المنصة شروحات لنخبة من كبار معلمي المادة داخل نفس المنصة، لتختار المدرس الذي يتوافق مع طريقة تفكيرك واستيعابك ومقارنة أساليب الحل قبل امتحانات التقييم.
              </p>
            </div>

            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-7 space-y-4">
              <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-amber-500/10 text-2xl text-amber-400">
                📲
              </div>
              <h2 className="text-xl font-bold text-white">4. تقارير ولي الأمر بالواتساب</h2>
              <p className="text-sm leading-relaxed text-slate-300">
                منظومة متابعة ذكية ترسل تقارير دورية أسبوعية لولي الأمر بنسبة حضور الحصص ودرجات الاختبارات ونشاط المذاكرة للحفاظ على انضباط الطالب وتفوقه.
              </p>
            </div>
          </div>

          <div className="rounded-3xl border border-emerald-500/30 bg-gradient-to-r from-emerald-950/40 via-slate-900 to-emerald-950/40 p-8 sm:p-10 text-center space-y-6">
            <h2 className="text-2xl sm:text-3xl font-black text-white">
              ابدأ الآن رحلة التفوق في البرمجة والذكاء الاصطناعي
            </h2>
            <p className="mx-auto max-w-2xl text-sm sm:text-base text-slate-300">
              انضم إلى آلاف الطلاب المتفوقين في مصر واستمتع بتجربة تعليمية تجمع بين الشرح المبسط والتطبيق التفاعلي.
            </p>
            <div className="pt-2">
              <Link
                href="/signup"
                className="inline-block rounded-xl bg-emerald-500 px-8 py-3.5 text-base font-black text-slate-950 hover:bg-emerald-400 transition-all shadow-xl no-underline"
              >
                إنشاء حساب مجاني والبدء فوراً 🚀
              </Link>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
