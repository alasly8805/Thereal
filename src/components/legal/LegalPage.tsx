import type { ReactNode } from "react";
import Link from "next/link";
import { Navbar } from "@/components/ui/Navbar";
import { Footer } from "@/components/ui/Footer";

type LegalPageProps = {
  badge: ReactNode;
  title: string;
  intro: string;
  updated: string;
  siblingHref: string;
  siblingLabel: string;
  children: ReactNode;
};

export function LegalPage({
  badge,
  title,
  intro,
  updated,
  siblingHref,
  siblingLabel,
  children,
}: LegalPageProps) {
  return (
    <div
      className="min-h-screen flex flex-col bg-slate-950 text-slate-100 selection:bg-sky-500/30 selection:text-sky-200"
      dir="rtl"
    >
      <Navbar />

      <main className="flex-1 py-16 sm:py-24 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-12">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-sky-500/10 border border-sky-500/30 text-sky-300 text-sm font-bold mb-4 shadow-sm">
              {badge}
            </div>
            <h1 className="text-3xl sm:text-5xl font-black text-white tracking-tight mb-4 leading-tight">
              {title}
            </h1>
            <p className="text-slate-400 text-sm sm:text-base max-w-2xl mx-auto leading-relaxed">
              {intro}
            </p>
            <p className="mt-4 text-xs text-slate-500">
              آخر تحديث: {updated}
            </p>
            <p className="mt-3">
              <Link
                href={siblingHref}
                className="text-sm font-semibold text-sky-400 hover:text-sky-300 underline underline-offset-4"
              >
                {siblingLabel}
              </Link>
            </p>
          </div>
          <div className="space-y-6 sm:space-y-8">{children}</div>
        </div>
      </main>

      <Footer />
    </div>
  );
}

type LegalSectionProps = {
  icon: ReactNode;
  iconClass: string;
  title: string;
  children: ReactNode;
  featured?: boolean;
};

export function LegalSection({
  icon,
  iconClass,
  title,
  children,
  featured = false,
}: LegalSectionProps) {
  return (
    <section
      className={
        featured
          ? "p-6 sm:p-8 rounded-3xl bg-gradient-to-br from-slate-900 via-sky-950/40 to-slate-900 border border-sky-500/40 shadow-xl"
          : "p-6 sm:p-8 rounded-3xl bg-slate-900/90 border border-slate-800 shadow-lg hover:border-slate-700 transition-all"
      }
    >
      <div className="flex items-center gap-3 mb-5">
        <div
          className={`w-9 h-9 rounded-xl flex items-center justify-center font-black text-sm border ${iconClass}`}
        >
          {icon}
        </div>
        <h2 className="text-lg sm:text-xl font-black text-white">{title}</h2>
      </div>
      <div className="space-y-3.5 text-xs sm:text-sm text-slate-300 leading-relaxed">
        {children}
      </div>
    </section>
  );
}

type LegalCalloutProps = {
  tone?: "warning" | "info" | "success";
  title: string;
  children: ReactNode;
};

export function LegalCallout({
  tone = "info",
  title,
  children,
}: LegalCalloutProps) {
  const tones = {
    warning: "border-rose-500/30 text-rose-200",
    info: "border-sky-500/30 text-sky-100",
    success: "border-emerald-500/30 text-emerald-100",
  };
  const body = {
    warning: "text-rose-300/90",
    info: "text-sky-200/90",
    success: "text-emerald-200/90",
  };

  return (
    <div className={`p-4 rounded-2xl bg-slate-950/60 border ${tones[tone]}`}>
      <p className="font-bold mb-1 text-xs sm:text-sm">{title}</p>
      <div className={`text-xs sm:text-sm ${body[tone]}`}>{children}</div>
    </div>
  );
}
