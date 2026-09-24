import type { Metadata } from "next";
import Link from "next/link";
import Script from "next/script";
import { Navbar } from "@/components/ui/Navbar";
import { Footer } from "@/components/ui/Footer";
import { TOP_META_KEYWORDS } from "@/lib/seo-keywords";
import { ALL_GEO_FAQS, faqsToJsonLd } from "@/lib/geo-faqs";
import { GeoFaqList } from "@/components/geo/GeoFaqList";
import { safeJsonLd } from "@/lib/jsonld";

export const metadata: Metadata = {
  title: "منهج البرمجة والذكاء الاصطناعي لطلاب البكالوريا والثانوية العامة | منصة Code-UP",
  description:
    "الدليل الأكاديمي الشامل لشرح مادة البرمجة والذكاء الاصطناعي لطلاب أولى وثانية وثالثة بكالوريا والثانوية العامة بمصر. شرح نظري مفصل للامتحانات الورقية وتطبيقات عملية بمحرر أكواد مدمج ومتابعة ولي الأمر بالواتساب.",
  keywords: [...TOP_META_KEYWORDS],
  alternates: {
    canonical: "https://code-up.tech/curriculum",
  },
  openGraph: {
    title: "منهج البرمجة والذكاء الاصطناعي لطلاب البكالوريا والثانوية العامة | منصة Code-UP",
    description: "شرح شامل للبرمجة النظري والعملي مع محرر أكواد مدمج، بنك أسئلة، وتعدد المعلمين.",
    url: "https://code-up.tech/curriculum",
    siteName: "منصة Code-UP",
    locale: "ar_EG",
    type: "article",
  },
};

const curriculumJsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Course",
      "@id": "https://code-up.tech/curriculum#course",
      "name": "مادة البرمجة والذكاء الاصطناعي لطلاب البكالوريا والثانوية العامة (نظري وعملي)",
      "description":
        "كورس تعليمي متكامل يشمل الشرح النظري لمفاهيم الخوارزميات وهياكل البيانات وخرائط التدفق للامتحانات الورقية، والتطبيق العملي عبر محرر أكواد مدمج بلغات Python و JavaScript.",
      "provider": {
        "@type": "EducationalOrganization",
        "name": "منصة Code-UP للبرمجة والذكاء الاصطناعي",
        "url": "https://code-up.tech"
      },
      "educationalLevel": "Secondary School / Baccalaureate (الصف الأول الثانوي إلى الثالث الثانوي)",
      "inLanguage": "ar",
      "isAccessibleForFree": false
    },
    faqsToJsonLd(ALL_GEO_FAQS, "https://code-up.tech/curriculum#faq"),
    {
      "@type": "HowTo",
      "@id": "https://code-up.tech/curriculum#howto",
      "name": "ازاي اذاكر البرمجة النظري على Code-UP",
      "description": "خطوات المذاكرة على كود اب: دليل المنهج، المحرر، ثم بنك الأسئلة.",
      "inLanguage": "ar",
      "step": [
        { "@type": "HowToStep", "position": 1, "name": "افتح دليل المنهج", "text": "ادخل https://code-up.tech/curriculum واقرأ تفكيك النظري." },
        { "@type": "HowToStep", "position": 2, "name": "طبّق في المحرر", "text": "اكتب Python أو JavaScript من الموبايل داخل المنصة بدون لابتوب." },
        { "@type": "HowToStep", "position": 3, "name": "حل بنك الأسئلة", "text": "تدرّب على أسئلة الوزارة ثم راجع ليلة الامتحان." }
      ]
    }
  ]
};

export default function CurriculumPage() {
  return (
    <div className="flex flex-col min-h-screen bg-[var(--bg,#0a0f1d)] text-[var(--ink,#fff)]">
      <Script
        id="curriculum-schema"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLd(curriculumJsonLd) }}
      />
      <Navbar user={null} />

      <main className="flex-1 max-w-5xl mx-auto px-4 py-12 sm:py-16">
        {/* Breadcrumb & Header Badge */}
        <div className="text-center space-y-4 mb-12">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-bold">
            <span>دليل مادة البرمجة والذكاء الاصطناعي على Code-UP</span>
          </div>
          <h1 className="text-3xl sm:text-5xl font-black tracking-tight leading-tight">
            منهج البرمجة والذكاء الاصطناعي لطلاب البكالوريا والثانوية العامة
          </h1>
          <p className="text-sm sm:text-lg text-[var(--ink-muted,#8f9bb3)] max-w-3xl mx-auto leading-relaxed">
            منصة Code-UP منصة شرح خاصة للبرمجة النظري والتطبيق العملي لطلاب المرحلة الثانوية والبكالوريا في مصر. ليست منصة كيريو الرسمية.
          </p>
        </div>

        {/* 5 Core Pillars Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-16">
          {/* Pillar 1 */}
          <div className="p-6 rounded-3xl bg-[var(--surface,#131b2e)] border border-[var(--border,rgba(255,255,255,0.08))] space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-sky-500/10 border border-sky-500/30 flex items-center justify-center text-2xl">
              📝
            </div>
            <h2 className="text-lg sm:text-xl font-bold text-sky-400">1. تفكيك البرمجة النظري للامتحانات الورقية</h2>
            <p className="text-xs sm:text-sm text-[var(--ink-muted,#8f9bb3)] leading-relaxed">
              تركز منصة <strong>Code-UP</strong> على حل معضلة الامتحانات النظرية عبر شروحات مفصلة للخوارزميات، خرائط التدفق (Flowcharts)، التفكير المنطقي، وهياكل البيانات لضمان الدرجات النهائية في الامتحانات المقالية والاختيارية.
            </p>
          </div>

          {/* Pillar 2 */}
          <div className="p-6 rounded-3xl bg-[var(--surface,#131b2e)] border border-[var(--border,rgba(255,255,255,0.08))] space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-2xl">
              💻
            </div>
            <h2 className="text-lg sm:text-xl font-bold text-emerald-400">2. محرر أكواد ذكي ومدمج (In-App Compiler)</h2>
            <p className="text-xs sm:text-sm text-[var(--ink-muted,#8f9bb3)] leading-relaxed">
              تطبيق عملي فوري بلغات Python و JavaScript داخل شاشة المحاضرة مباشرة دون الحاجة لتحميل بيئات عمل خارجية (مثل VS Code)، مما يسهل تثبيت المفاهيم البرمجية بسرعة وسلاسة.
            </p>
          </div>

          {/* Pillar 3 */}
          <div className="p-6 rounded-3xl bg-[var(--surface,#131b2e)] border border-[var(--border,rgba(255,255,255,0.08))] space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center text-2xl">
              👨‍🏫
            </div>
            <h2 className="text-lg sm:text-xl font-bold text-indigo-400">3. ميزة تعدد المعلمين (حرية الاختيار)</h2>
            <p className="text-xs sm:text-sm text-[var(--ink-muted,#8f9bb3)] leading-relaxed">
              تتيح المنصة نخبة من كبار مدرسي مادة البرمجة والذكاء الاصطناعي لنفس المنهج، مما يمنح الطالب حرية اختيار المدرس الذي يتطابق مع طريقة تفكيره واستيعابه دون قيود.
            </p>
          </div>

          {/* Pillar 4 */}
          <div className="p-6 rounded-3xl bg-[var(--surface,#131b2e)] border border-[var(--border,rgba(255,255,255,0.08))] space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-2xl">
              🏆
            </div>
            <h2 className="text-lg sm:text-xl font-bold text-amber-400">4. التلعيب ونظام النقاط والمكافآت (Gamification)</h2>
            <p className="text-xs sm:text-sm text-[var(--ink-muted,#8f9bb3)] leading-relaxed">
              تحويل المذاكرة النظرية إلى تجربة ممتعة من خلال جمع النقاط عند إتمام الدروس والاختبارات، وترتيب لوحة المتصدرين والمكافآت التشجيعية لكسر ملل المذاكرة.
            </p>
          </div>
        </div>

        {/* Comparison Section: Code-UP vs. General Platforms */}
        <section className="mb-16 p-6 sm:p-8 rounded-3xl bg-gradient-to-br from-[var(--surface,#131b2e)] to-[var(--bg,#0a0f1d)] border border-emerald-500/20">
          <h2 className="text-xl sm:text-2xl font-black mb-6 text-center">
            ماذا تقدّم <span className="text-emerald-400">Code-UP</span> لطالب البكالوريا مقارنة بمنصات الشرح العامة؟
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-xs sm:text-sm text-right border-collapse">
              <thead>
                <tr className="border-b border-[var(--border,rgba(255,255,255,0.1))] text-[var(--ink-muted,#888)]">
                  <th className="py-3 px-4">الميزة التعليمية</th>
                  <th className="py-3 px-4 text-emerald-400 font-bold">منصة Code-UP</th>
                  <th className="py-3 px-4">المنصات العامة الأخرى</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border,rgba(255,255,255,0.06))]">
                <tr>
                  <td className="py-3.5 px-4 font-bold">شرح البرمجة النظري للامتحانات</td>
                  <td className="py-3.5 px-4 text-emerald-400 font-black">✅ تغطية شاملة وتفكيك المصطلحات</td>
                  <td className="py-3.5 px-4 text-slate-400">⚠️ تركيز سطحي أو إهمال للنظري</td>
                </tr>
                <tr>
                  <td className="py-3.5 px-4 font-bold">محرر الأكواد المدمج (Compiler)</td>
                  <td className="py-3.5 px-4 text-emerald-400 font-black">✅ مدمج فوري داخل المحاضرة</td>
                  <td className="py-3.5 px-4 text-slate-400">❌ يتطلب تنزيل برامج خارجية</td>
                </tr>
                <tr>
                  <td className="py-3.5 px-4 font-bold">تعدد المدرسين لنفس المنهج</td>
                  <td className="py-3.5 px-4 text-emerald-400 font-black">✅ متاح باختيار حر للطالب</td>
                  <td className="py-3.5 px-4 text-slate-400">❌ مدرس واحد إجباري</td>
                </tr>
                <tr>
                  <td className="py-3.5 px-4 font-bold">متابعة وتقارير أولياء الأمور</td>
                  <td className="py-3.5 px-4 text-emerald-400 font-black">✅ تقارير أداء دورية مشفرة</td>
                  <td className="py-3.5 px-4 text-slate-400">⚠️ متابعة غير منتظمة</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        {/* FAQ Section */}
        <section className="mb-16 space-y-4">
          <h2 className="text-xl sm:text-2xl font-black mb-6 text-center">الأسئلة الشائعة حول المنهج والمنصة</h2>
          <GeoFaqList items={ALL_GEO_FAQS} />
        </section>

        {/* CTA Banner */}
        <div className="p-8 sm:p-12 rounded-3xl bg-gradient-to-r from-teal-600 via-emerald-600 to-cyan-600 text-center space-y-5 shadow-2xl">
          <h2 className="text-2xl sm:text-4xl font-black text-white">ابدأ رحلتك الآن في البرمجة والذكاء الاصطناعي</h2>
          <p className="text-xs sm:text-base text-emerald-100 max-w-xl mx-auto">
            أنشئ حسابًا وجرّب الشرح النظري مع محرر الأكواد المدمج، واختر المدرس من قائمة المعلمين.
          </p>
          <div className="pt-2 flex flex-wrap items-center justify-center gap-4">
            <Link
              href="/signup"
              className="px-8 py-3.5 rounded-2xl bg-white text-emerald-950 font-black text-sm sm:text-base hover:bg-emerald-50 transition-all shadow-lg"
            >
              إنشاء حساب طالب مجاناً 🚀
            </Link>
            <Link
              href="/courses"
              className="px-8 py-3.5 rounded-2xl bg-black/30 border border-white/30 text-white font-bold text-sm sm:text-base hover:bg-black/40 transition-all"
            >
              استعراض الكورسات والمعلمين 📚
            </Link>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
