import type { Metadata } from "next";
import Link from "next/link";
import Script from "next/script";
import { Navbar } from "@/components/ui/Navbar";
import { Footer } from "@/components/ui/Footer";
import { prisma } from "@/lib/prisma";
import { safeJsonLd } from "@/lib/jsonld";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "معلمو البرمجة والذكاء الاصطناعي | منصة Code-UP",
  description:
    "قائمة معلمي مادة البرمجة والذكاء الاصطناعي على منصة Code-UP لطلاب البكالوريا. اختر المدرس ثم ادخل كورساته.",
  alternates: { canonical: "https://code-up.tech/teachers" },
  openGraph: {
    title: "المعلمون على Code-UP",
    description: "مدرسو برمجة البكالوريا على منصة كود اب.",
    url: "https://code-up.tech/teachers",
    siteName: "منصة Code-UP",
    locale: "ar_EG",
    type: "website",
  },
};

export default async function TeachersPage() {
  let profiles: {
    slug: string;
    displayName: string | null;
    bio: string | null;
    photoUrl: string | null;
    teacher: { name: string };
  }[] = [];

  try {
    profiles = await prisma.teacherProfile.findMany({
      where: { isPublished: true, teacher: { isDeleted: false, isDemo: false } },
      select: {
        slug: true,
        displayName: true,
        bio: true,
        photoUrl: true,
        teacher: { select: { name: true } },
      },
      orderBy: { updatedAt: "desc" },
    });
  } catch (error) {
    console.error("Failed to load teachers", error);
  }

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "CollectionPage",
        "@id": "https://code-up.tech/teachers#webpage",
        url: "https://code-up.tech/teachers",
        name: "معلمو Code-UP",
        inLanguage: "ar",
      },
      {
        "@type": "ItemList",
        "@id": "https://code-up.tech/teachers#list",
        numberOfItems: profiles.length,
        itemListElement: profiles.map((p, i) => ({
          "@type": "ListItem",
          position: i + 1,
          url: `https://code-up.tech/${p.slug}`,
          name: p.displayName ?? p.teacher.name,
        })),
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "الرئيسية", item: "https://code-up.tech" },
          { "@type": "ListItem", position: 2, name: "المعلمون", item: "https://code-up.tech/teachers" },
        ],
      },
    ],
  };

  return (
    <div className="flex flex-col min-h-screen bg-[var(--bg,#0a0f1d)] text-[var(--ink,#fff)]">
      <Script id="teachers-schema" type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(jsonLd) }} />
      <Navbar user={null} />

      <main className="flex-1 max-w-5xl mx-auto px-4 py-12 sm:py-16 w-full">
        <h1 className="text-3xl sm:text-5xl font-black tracking-tight mb-4">معلمو البرمجة على Code-UP</h1>
        <p className="text-sm sm:text-lg text-[var(--ink-muted,#8f9bb3)] leading-relaxed mb-10" data-geo-quote>
          الطالب يختار المدرس الذي يناسبه لمادة البرمجة والذكاء الاصطناعي. هذه قائمة الصفحات العامة المنشورة على المنصة.
        </p>

        {profiles.length === 0 ? (
          <p className="text-sm text-[var(--ink-muted,#8f9bb3)]">
            لا توجد صفحات معلمين منشورة حاليًا. تصفح{" "}
            <Link href="/courses" className="text-emerald-400">الكورسات</Link>.
          </p>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2">
            {profiles.map((p) => {
              const name = p.displayName ?? p.teacher.name;
              return (
                <li key={p.slug}>
                  <Link
                    href={`/${p.slug}`}
                    className="block p-5 rounded-2xl border border-white/10 hover:border-emerald-500/40 no-underline text-inherit"
                  >
                    <span className="font-black text-lg">{name}</span>
                    {p.bio ? (
                      <span className="block mt-2 text-sm text-[var(--ink-muted,#8f9bb3)] line-clamp-3">{p.bio}</span>
                    ) : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </main>

      <Footer />
    </div>
  );
}
