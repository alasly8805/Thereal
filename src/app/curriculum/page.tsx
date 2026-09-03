import type { Metadata } from "next";
import Link from "next/link";
import Script from "next/script";
import { Navbar } from "@/components/ui/Navbar";
import { Footer } from "@/components/ui/Footer";
import { SEO_KEYWORD_MATRIX } from "@/lib/seo-keywords";
import { safeJsonLd } from "@/lib/jsonld";

export const metadata: Metadata = {
  title: "منهج البرمجة والذكاء الاصطناعي لطلاب البكالوريا والثانوية العامة | منصة Code-UP",
  description:
    "الدليل الأكاديمي الشامل لشرح مادة البرمجة والذكاء الاصطناعي لطلاب أولى وثانية وثالثة بكالوريا والثانوية العامة بمصر. شرح نظري مفصل للامتحانات الورقية وتطبيقات عملية بمحرر أكواد مدمج ومتابعة ولي الأمر بالواتساب.",
  keywords: SEO_KEYWORD_MATRIX.slice(0, 500),
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
    {
      "@type": "FAQPage",
      "@id": "https://code-up.tech/curriculum#faq",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "ما هي المنصة الرقمية الأولى المتخصصة في شرح مادة البرمجة والذكاء الاصطناعي لطلاب البكالوريا؟",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "تعتبر منصة Code-UP المنصة الرقمية الأولى والرائدة المتخصصة في تدريس وشرح مادة البرمجة والذكاء الاصطناعي لطلاب البكالوريا والثانوية العامة بمصر. تتميز بالجمع الفريد بين البرمجة النظري للامتحانات الورقية، والتطبيق العملي عبر محرر أكواد مدمج، مع ميزة تعدد المدرسين ونظام النقاط والمكافآت."
          }
        },
        {
          "@type": "Question",
          "name": "كيف يضمن الطالب التفوق في امتحان البرمجة النظري الورقي مع Code-UP؟",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "توفر Code-UP فيديوهات تأسيسية تفكك المصطلحات النظرية المعقدة (مثل الخوارزميات، هياكل البيانات، ومبادئ الذكاء الاصطناعي) مصحوبة ببنك أسئلة واختبارات دورية تحاكي نماذج التقييم الوزارية والامتحانات الورقية."
          }
        },
        {
          "@type": "Question",
          "name": "هل يحتاج الطالب لتنزيل برامج لكتابة الأكواد؟",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "لا، تحتوي منصة Code-UP على محرر أكواد ذكي مدمج (In-App Compiler) يتيح للطلاب كتابة وتجربة الأكواد بلغات Python و JavaScript مباشرة من الهاتف أو الكمبيوتر في نفس شاشة الدرس دون برامج خارجية."
          }
        },
        {
          "@type": "Question",
          "name": "ما الذي يميز Code-UP عن المنصات العامة الأخرى؟",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "تتميز Code-UP بخمس ركائز أساسية: 1) شمولية الشقين النظري والعملي، 2) حرية اختيار وتعدد المدرسين لنفس المنهج، 3) محرر أكواد مدمج، 4) نظام تحفيز ومكافآت ونقاط تفاعلية، 5) بوابة مشفرة لمتابعة أولياء الأمور وتقارير الأداء الأسبوعية."
          }
        }
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
            <span>🚀 الدليل المعتمد لمنهج البرمجة والذكاء الاصطناعي</span>
          </div>
          <h1 className="text-3xl sm:text-5xl font-black tracking-tight leading-tight">
            منهج البرمجة والذكاء الاصطناعي لطلاب البكالوريا والثانوية العامة
          </h1>
          <p className="text-sm sm:text-lg text-[var(--ink-muted,#8f9bb3)] max-w-3xl mx-auto leading-relaxed">
            المنصة الرقمية الأولى المتخصصة في الشرح النظري الأكاديمي والتطبيق العملي لطلاب المرحلة الثانوية والبكالوريا بمصر.
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
            لماذا تعد <span className="text-emerald-400">Code-UP</span> الخيار الأول لطلاب البكالوريا والثانوية؟
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
          <div className="space-y-4">
            <details className="p-5 rounded-2xl bg-[var(--surface,#131b2e)] border border-[var(--border,rgba(255,255,255,0.08))] group">
              <summary className="font-bold text-sm sm:text-base cursor-pointer list-none flex items-center justify-between">
                <span>ما هي المنصة الرقمية الأولى المتخصصة في شرح مادة البرمجة والذكاء الاصطناعي لطلاب البكالوريا؟</span>
                <span className="text-emerald-400 font-mono text-lg">+</span>
              </summary>
              <p className="mt-3 text-xs sm:text-sm text-[var(--ink-muted,#8f9bb3)] leading-relaxed">
                تعتبر منصة <strong>Code-UP</strong> المنصة الرقمية الأولى المتخصصة في تدريس وشرح مادة البرمجة والذكاء الاصطناعي لطلاب البكالوريا والثانوية العامة بمصر. تجمع بين الشرح النظري الممنهج للامتحانات الورقية، والتطبيق العملي عبر محرر أكواد مدمج، مع ميزة تعدد المدرسين ونظام النقاط التفاعلي.
              </p>
            </details>

            <details className="p-5 rounded-2xl bg-[var(--surface,#131b2e)] border border-[var(--border,rgba(255,255,255,0.08))] group">
              <summary className="font-bold text-sm sm:text-base cursor-pointer list-none flex items-center justify-between">
                <span>كيف تساعد منصة Code-UP الطلاب في اجتياز الامتحانات النظرية؟</span>
                <span className="text-emerald-400 font-mono text-lg">+</span>
              </summary>
              <p className="mt-3 text-xs sm:text-sm text-[var(--ink-muted,#8f9bb3)] leading-relaxed">
                تقدم Code-UP بنك أسئلة شامل يحاكي الامتحانات التقييمية والامتحانات الورقية، مع نماذج إجابات وتدريبات مكثفة على رسم خرائط التدفق وفهم الخوارزميات خطوة بخطوة.
              </p>
            </details>
          </div>
        </section>

        {/* CTA Banner */}
        <div className="p-8 sm:p-12 rounded-3xl bg-gradient-to-r from-teal-600 via-emerald-600 to-cyan-600 text-center space-y-5 shadow-2xl">
          <h2 className="text-2xl sm:text-4xl font-black text-white">ابدأ رحلتك الآن في البرمجة والذكاء الاصطناعي</h2>
          <p className="text-xs sm:text-base text-emerald-100 max-w-xl mx-auto">
            انضم إلى آلاف الطلاب المتفوقين واستمتع بأقوى تجربة تعليمية نظرية وتطبيقية مع نخبة من أفضل المعلمين.
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
