"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { EDUCATIONAL_STAGES } from "@/types";
import { formatEgp } from "@/lib/motion";

/**
 * Real courses right under the hero. The home page used to describe the
 * platform without showing a single course; course access is the main event,
 * so the first scroll lands on something a student can open.
 */

type ShowcaseCourse = {
  id: string;
  title: string;
  subject?: string | null;
  educationalStage?: string | null;
  thumbnailUrl?: string | null;
  lessonsCount?: number;
  isPaid?: boolean;
  price?: number | null;
  discountPercent?: number | null;
  discountExpiresAt?: string | null;
  hasAccess?: boolean;
  inLibrary?: boolean;
  teacher?: { name: string; teacherProfile?: { slug?: string | null } | null } | null;
};

const LIMIT = 6;
/**
 * Teachers upload course photos that are stored inline as data: URIs, so
 * those must be accepted. Raster types only: an SVG data URI can carry script.
 */
const isSafeSrc = (src: string) =>
  /^https?:\/\//i.test(src) ||
  (src.startsWith("/") && !src.startsWith("//")) ||
  /^data:image\/(jpeg|jpg|png|webp|gif);base64,/i.test(src);
const hasPhoto = (c: ShowcaseCourse) => Boolean(c.thumbnailUrl && isSafeSrc(c.thumbnailUrl));
const STAGE_LABEL = Object.fromEntries(EDUCATIONAL_STAGES.map((s) => [s.value, s.label]));

function isHidden(c: ShowcaseCourse) {
  const name = c.teacher?.name ?? "";
  return c.teacher?.teacherProfile?.slug === "demo" || name === "test" || name.includes("المدرس التجريبي");
}

function priceLabel(c: ShowcaseCourse) {
  if (c.hasAccess || c.inLibrary) return { text: "في مكتبتك", tone: "brand" as const };
  const discountLive =
    (c.discountPercent ?? 0) > 0 && (!c.discountExpiresAt || new Date(c.discountExpiresAt).getTime() > Date.now());
  if (!c.isPaid || (discountLive && c.discountPercent === 100)) return { text: "مجاني", tone: "brand" as const };
  if (c.price == null) return null;
  const final = discountLive ? Math.round(c.price * (1 - (c.discountPercent ?? 0) / 100)) : c.price;
  return { text: formatEgp(final), tone: "ink" as const };
}

export function CoursesShowcase({ isLoggedIn }: { isLoggedIn: boolean }) {
  const [courses, setCourses] = useState<ShowcaseCourse[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [stage, setStage] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetch("/api/courses", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: { courses?: ShowcaseCourse[] }) => {
        if (!cancelled) setCourses((d.courses ?? []).filter((c) => !isHidden(c)));
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [isLoggedIn]);

  const stages = useMemo(
    () => EDUCATIONAL_STAGES.filter((s) => courses?.some((c) => c.educationalStage === s.value)),
    [courses]
  );

  const shown = useMemo(() => {
    const list = (courses ?? []).filter((c) => !stage || c.educationalStage === stage);
    // A signed-in student sees their own courses first, then courses with a
    // photo, so the section leads with real course covers.
    const owned = (c: ShowcaseCourse) => Number(Boolean(c.hasAccess || c.inLibrary));
    return [...list]
      .sort((a, b) => owned(b) - owned(a) || Number(hasPhoto(b)) - Number(hasPhoto(a)))
      .slice(0, LIMIT);
  }, [courses, stage]);

  if (failed || (courses && courses.length === 0)) return null;

  const total = courses?.length ?? 0;
  const moreHref = stage ? `/courses?stage=${stage}` : "/courses";

  return (
    <section
      id="home-courses"
      aria-labelledby="home-courses-title"
      className="py-14 md:py-20 border-t"
      style={{ background: "var(--bg)", borderColor: "var(--border)" }}
    >
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
          <div>
            <h2
              id="home-courses-title"
              className="text-2xl md:text-3xl font-black tracking-tight text-balance"
              style={{ color: "var(--ink)", fontFamily: "var(--font-head)" }}
            >
              ابدأ من هنا
            </h2>
            <p className="mt-1 text-sm md:text-base" style={{ color: "var(--ink-2)" }}>
              {total ? `${total.toLocaleString("ar-EG")} كورس متاح دلوقتي — افتح أي كورس وشوف محتواه.` : "الكورسات المتاحة دلوقتي"}
            </p>
          </div>
          {stages.length > 1 && (
            <div className="flex flex-wrap gap-2" role="group" aria-label="الصف الدراسي">
              {[{ value: "", label: "الكل" }, ...stages].map((s) => {
                const on = stage === s.value;
                return (
                  <button
                    key={s.value || "all"}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setStage(s.value)}
                    className="min-h-11 px-4 rounded-full text-sm font-bold transition-colors"
                    style={{
                      background: on ? "var(--brand)" : "var(--surface)",
                      color: on ? "var(--on-brand)" : "var(--ink-2)",
                      border: `1px solid ${on ? "var(--brand)" : "var(--border)"}`,
                    }}
                  >
                    {s.label}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Phones: one row that scrolls sideways; larger screens: a grid. */}
        <ul
          className="-mx-4 px-4 sm:mx-0 sm:px-0 flex sm:grid sm:grid-cols-2 lg:grid-cols-3 gap-4 overflow-x-auto sm:overflow-visible snap-x snap-mandatory overscroll-x-contain [scrollbar-width:none] list-none p-0"
          aria-busy={!courses}
        >
          {!courses
            ? Array.from({ length: 3 }).map((_, i) => (
                <li key={i} className="shrink-0 w-[78%] sm:w-auto snap-start">
                  <div className="rounded-2xl overflow-hidden" style={{ border: "1px solid var(--border)", background: "var(--surface)" }}>
                    <div className="skeleton aspect-video w-full" />
                    <div className="p-4 space-y-2">
                      <div className="skeleton h-5 w-3/4" />
                      <div className="skeleton h-4 w-1/2" />
                    </div>
                  </div>
                </li>
              ))
            : shown.map((c) => <ShowcaseTile key={c.id} course={c} />)}
        </ul>

        <div className="mt-6 flex justify-center sm:justify-start">
          <Link
            href={moreHref}
            className="min-h-12 inline-flex items-center gap-2 px-6 rounded-full text-sm font-bold no-underline transition-colors"
            style={{ border: "1px solid var(--border)", background: "var(--surface)", color: "var(--ink)" }}
          >
            {stage ? `كل كورسات ${STAGE_LABEL[stage] ?? ""}` : `كل الكورسات (${total.toLocaleString("ar-EG")})`}
            <span aria-hidden style={{ color: "var(--brand)" }}>←</span>
          </Link>
        </div>
      </div>
    </section>
  );
}

function ShowcaseTile({ course }: { course: ShowcaseCourse }) {
  const [broken, setBroken] = useState(false);
  const thumb = course.thumbnailUrl && isSafeSrc(course.thumbnailUrl) && !broken ? course.thumbnailUrl : null;
  const owned = Boolean(course.hasAccess || course.inLibrary);
  const href = owned ? `/courses/${course.id}/learn` : `/courses/${course.id}`;
  const price = priceLabel(course);
  const meta = [course.subject, STAGE_LABEL[course.educationalStage ?? ""]].filter(Boolean).join(" · ");

  return (
    <li className="shrink-0 w-[78%] sm:w-auto snap-start">
      <Link
        href={href}
        className="group flex flex-col h-full rounded-2xl overflow-hidden no-underline transition-[border-color,box-shadow] duration-200 hover:shadow-[0_4px_24px_rgba(0,0,0,0.12)] focus-visible:shadow-[0_0_0_3px_var(--brand-soft)]"
        style={{ border: "1px solid var(--border)", background: "var(--surface)" }}
      >
        <div className="relative aspect-video w-full overflow-hidden" style={{ background: "var(--surface-2)" }}>
          {thumb ? (
            // eslint-disable-next-line @next/next/no-img-element -- thumbnails come from many hosts
            <img
              src={thumb}
              alt=""
              loading="lazy"
              decoding="async"
              onError={() => setBroken(true)}
              className="absolute inset-0 w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.03] motion-reduce:transition-none"
            />
          ) : (
            <div className="absolute inset-0 grid place-items-center text-4xl font-black" style={{ color: "var(--brand)" }} aria-hidden>
              {course.title.trim().charAt(0)}
            </div>
          )}
          {price && (
            <span
              className="absolute top-3 start-3 px-2.5 py-1 rounded-full text-xs font-black"
              style={
                price.tone === "brand"
                  ? { background: "var(--brand)", color: "var(--on-brand)" }
                  : { background: "var(--surface)", color: "var(--ink)" }
              }
            >
              {price.text}
            </span>
          )}
        </div>
        <div className="p-4 flex flex-col gap-1 flex-1">
          {meta && <p className="text-xs font-semibold" style={{ color: "var(--ink-3)" }}>{meta}</p>}
          <h3 className="text-base font-bold leading-snug line-clamp-2" style={{ color: "var(--ink)" }}>
            {course.title}
          </h3>
          <div className="mt-auto pt-2 flex items-center justify-between gap-2 text-sm" style={{ color: "var(--ink-2)" }}>
            <span className="truncate">{course.teacher?.name}</span>
            {course.lessonsCount ? (
              <span className="shrink-0 text-xs font-semibold">{course.lessonsCount.toLocaleString("ar-EG")} درس</span>
            ) : null}
          </div>
          {owned && (
            <span className="mt-2 text-sm font-bold" style={{ color: "var(--brand)" }}>
              كمّل المذاكرة ←
            </span>
          )}
        </div>
      </Link>
    </li>
  );
}
