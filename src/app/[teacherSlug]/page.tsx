import { cache } from "react";
import type { CSSProperties } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { RESERVED_SLUGS } from "@/lib/slug";
import { safeJsonLd } from "@/lib/jsonld";
import { BookingButton } from "@/components/teacher/BookingModal";
import { SubscriptionStatusBadge } from "@/components/teacher/SubscriptionStatusBadge";
import { SetTeacherRefCookie } from "@/components/teacher/SetTeacherRefCookie";

export const revalidate = 60; // Cache page for 60s for lightning fast <10ms loads

import { getSession } from "@/lib/auth";

const getProfile = cache(async (slug: string) => {
  if (RESERVED_SLUGS.has(slug.toLowerCase())) return null;
  const session = await getSession();
  const isSuperadmin = session?.role === "superadmin";
  const isTester = session?.accountMode === "TESTER";
  const canSeeDemo = isSuperadmin || isTester;
  return prisma.teacherProfile.findFirst({
    where: {
      slug,
      isPublished: true,
      teacher: canSeeDemo ? { isDeleted: false } : { isDeleted: false, isDemo: false },
    },
    include: {
      teacher: {
        include: {
          courses: {
            orderBy: { createdAt: "desc" },
            include: {
              folders: { include: { videos: { select: { id: true, isFree: true } } } },
            },
          },
        },
      },
    },
  });
});

export async function generateMetadata({ params }: { params: Promise<{ teacherSlug: string }> }): Promise<Metadata> {
  const { teacherSlug } = await params;
  const p = await getProfile(teacherSlug);
  if (!p) return { title: "صفحة غير موجودة — Code-UP" };
  const name = p.displayName ?? p.teacher.name;
  const description = p.bio ?? `كورسات وشروحات الأستاذ ${name} على منصة Code-UP التعليمية`;
  const url = `https://code-up.tech/${p.slug}`;
  const avatar = isSafe(p.photoUrl) ? p.photoUrl! : "https://code-up.tech/logo.jpeg";

  return {
    title: `${name} — كورسات وشروحات | Code-UP`,
    description,
    alternates: {
      canonical: url,
    },
    openGraph: {
      title: `${name} — Code-UP`,
      description,
      url,
      type: "profile",
      images: [{ url: avatar }],
    },
    twitter: {
      card: "summary_large_image",
      title: `${name} — Code-UP`,
      description,
      images: [avatar],
    },
  };
}

const STAGE_LABELS: Record<string, string> = {
  sec_1: "أولى بكالوريا",
  sec_2: "ثانية بكالوريا",
};

const isSafe = (s?: string | null) => !!s && (/^https?:\/\//i.test(s) || s.startsWith("data:image/") || s.startsWith("/"));

import { DemoBanner } from "@/components/ui/DemoBanner";

export default async function TeacherPage({ params }: { params: Promise<{ teacherSlug: string }> }) {
  const { teacherSlug } = await params;
  const p = await getProfile(teacherSlug);
  if (!p) notFound();

  const name = p.displayName ?? p.teacher.name;
  const isDemo = p.teacher.isDemo;
  const courses = p.teacher.courses;
  const ordered = p.featuredCourseId
    ? [...courses].sort((a, b) => (a.id === p.featuredCourseId ? -1 : b.id === p.featuredCourseId ? 1 : 0))
    : courses;

  const videoCount = courses.reduce((s, c) => s + c.folders.reduce((b, f) => b + f.videos.length, 0), 0);
  const demo = courses
    .flatMap((c) => c.folders.flatMap((f) => f.videos.map((v) => ({ ...v, courseId: c.id }))))
    .find((v) => v.isFree);

  let socials: { facebook?: string; youtube?: string; tiktok?: string } = {};
  try { socials = p.socials ? JSON.parse(p.socials) : {}; } catch { socials = {}; }
  const socialLinks = Object.entries(socials).filter(([, v]) => v) as [string, string][];

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Person",
        "@id": `https://code-up.tech/${p.slug}#teacher`,
        "name": name,
        "description": p.bio || `معلم على منصة Code-UP التعليمية`,
        "image": isSafe(p.photoUrl) ? p.photoUrl : "https://code-up.tech/logo.jpeg",
        "worksFor": {
          "@type": "EducationalOrganization",
          "name": "Code-UP",
          "url": "https://code-up.tech"
        }
      },
      {
        "@type": "BreadcrumbList",
        "itemListElement": [
          { "@type": "ListItem", "position": 1, "name": "الرئيسية", "item": "https://code-up.tech" },
          { "@type": "ListItem", "position": 2, "name": "المعلمون", "item": "https://code-up.tech/courses" },
          { "@type": "ListItem", "position": 3, "name": name, "item": `https://code-up.tech/${p.slug}` }
        ]
      }
    ]
  };

  const theme = {
    "--accent": p.accentColor ?? "#6366f1",
    "--nav": p.navColor ?? "#0b0f19",
  } as CSSProperties;

  return (
    <main dir="rtl" style={theme} className="min-h-screen bg-[var(--bg)] text-[var(--ink)]">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLd(jsonLd) }}
      />
      <DemoBanner show={isDemo} />
      <SetTeacherRefCookie teacherId={p.teacherId} />
      {/* Top bar */}
      <nav style={{ background: "var(--nav)" }} className="px-5 sm:px-8 py-3.5 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          {isSafe(p.photoUrl) && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={p.photoUrl!} alt="" className="w-8 h-8 rounded-full object-cover ring-1 ring-white/20" />
          )}
          <span className="font-black text-white">{name}</span>
        </div>
        <Link href="/courses" className="text-xs font-semibold text-white/70 hover:text-white transition-colors">كل الكورسات ←</Link>
      </nav>

      {/* Banner */}
      {isSafe(p.bannerUrl) && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={p.bannerUrl!} alt="" className="w-full h-40 sm:h-56 object-cover" />
      )}

      {/* Header */}
      <header className="max-w-4xl mx-auto px-6 pt-10 pb-8 text-center">
        {isSafe(p.photoUrl) && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={p.photoUrl!} alt={name} className="w-28 h-28 rounded-full object-cover mx-auto mb-4"
               style={{ boxShadow: "0 0 0 4px var(--accent)" }} />
        )}
        <h1 className="text-3xl sm:text-4xl font-black tracking-tight text-balance">{name}</h1>
        {p.bio && <p className="text-[var(--ink-muted)] mt-3 leading-relaxed max-w-2xl mx-auto text-pretty">{p.bio}</p>}

        {/* Social proof */}
        <div className="mt-5 flex items-center justify-center gap-2 flex-wrap">
          <span className="px-3 py-1.5 rounded-full text-xs font-bold bg-[var(--surface)] border border-[var(--border)]">{courses.length} كورس</span>
          <span className="px-3 py-1.5 rounded-full text-xs font-bold bg-[var(--surface)] border border-[var(--border)]">{videoCount} محاضرة</span>
        </div>

        {/* Subscription Status Badge */}
        <SubscriptionStatusBadge teacherId={p.teacherId} teacherName={name} />

        {/* Booking Button + Modal */}
        <BookingButton
          teacherId={p.teacherId}
          priceMonthly={p.priceMonthly}
          priceTermly={p.priceTermly}
          priceYearly={p.priceYearly}
          stagePricing={p.stagePricing}
          priceLanguagesMonthly={p.priceLanguagesMonthly}
          priceLanguagesTermly={p.priceLanguagesTermly}
          priceLanguagesYearly={p.priceLanguagesYearly}
          enableLanguagesTrack={p.enableLanguagesTrack}
          paymentNotes={p.paymentNotes}
          courseStartDate={p.courseStartDate ? p.courseStartDate.toISOString() : null}
          bookingContactUrl={p.bookingContactUrl}
          accentColor={p.accentColor ?? "#6366f1"}
          teacherName={name}
        />

        {/* Demo CTA */}
        {demo && (
          <Link href={`/courses/${demo.courseId}`}
                style={{ background: "var(--accent)" }}
                className="inline-flex items-center gap-2 mt-6 px-6 py-3 rounded-xl font-bold text-white shadow-lg hover:brightness-110 transition-all">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M8 5v14l11-7z" /></svg>
            شاهد المحاضرة الأولى مجاناً
          </Link>
        )}

        {/* Socials */}
        {socialLinks.length > 0 && (
          <div className="mt-5 flex items-center justify-center gap-3">
            {socialLinks.map(([k, v]) => (
              <a key={k} href={v} target="_blank" rel="noreferrer noopener"
                 className="text-xs font-semibold text-[var(--ink-muted)] hover:text-[var(--ink)] transition-colors capitalize" dir="ltr">
                {k}
              </a>
            ))}
          </div>
        )}
      </header>

      {/* Courses */}
      <section className="max-w-6xl mx-auto px-6 pb-20">
        <h2 className="text-lg font-bold mb-5">الكورسات</h2>
        {ordered.length === 0 ? (
          <p className="text-center text-[var(--ink-muted)] py-12">لا توجد كورسات منشورة بعد.</p>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {ordered.map((c) => {
              const featured = c.id === p.featuredCourseId;
              const vCount = c.folders.reduce((b, f) => b + f.videos.length, 0);
              return (
                <Link key={c.id} href={`/courses/${c.id}`}
                      className="group relative flex flex-col rounded-2xl border border-[var(--border)] bg-[var(--surface)] overflow-hidden hover:shadow-xl transition-shadow">
                  {featured && (
                    <span className="absolute top-3 end-3 z-10 px-2.5 py-1 rounded-full text-[10px] font-bold text-white" style={{ background: "var(--accent)" }}>مميّز</span>
                  )}
                  <div className="relative h-40 bg-[var(--bg)] overflow-hidden">
                    {isSafe(c.thumbnailUrl) ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={c.thumbnailUrl!} alt={c.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-[var(--ink-muted)]">
                        <svg className="w-10 h-10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.4} aria-hidden><path d="M4 4h5l2 3h9a2 2 0 012 2v9a2 2 0 01-2 2H4a2 2 0 01-2-2V6a2 2 0 012-2z" /></svg>
                      </div>
                    )}
                  </div>
                  <div className="p-4 flex flex-col flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      {c.subject && <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-[var(--border)] text-[var(--ink-muted)]">{c.subject}</span>}
                      <span className="text-[11px] text-[var(--ink-muted)]">{STAGE_LABELS[c.educationalStage] ?? c.educationalStage}</span>
                    </div>
                    <h3 className="font-bold text-[var(--ink)] leading-snug line-clamp-2 flex-1">{c.title}</h3>
                    <div className="flex items-center justify-between mt-3">
                      <span className="text-xs text-[var(--ink-muted)]">{vCount} محاضرة</span>
                      <span className="text-sm font-black" style={{ color: "var(--accent)" }}>
                        {!c.isPaid ? "مجاني" : `${c.price ?? 0} جنيه`}
                      </span>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </section>

      <footer className="border-t border-[var(--border)] py-6 text-center">
        <Link href="/" className="text-xs font-bold text-[var(--ink-muted)] hover:text-[var(--ink)] transition-colors">مدعوم من Code-UP</Link>
      </footer>
    </main>
  );
}
