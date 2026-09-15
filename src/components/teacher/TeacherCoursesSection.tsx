"use client";

import React, { useMemo, useState } from "react";
import Link from "next/link";
import { Search, Sparkles, BookOpen, Calendar, Gift, Zap, Layers } from "lucide-react";

export interface FolderVideoItem {
  id: string;
  isFree?: boolean;
}

export interface FolderItem {
  id?: string;
  videos: FolderVideoItem[];
}

export interface TeacherCourseItem {
  id: string;
  title: string;
  subject?: string | null;
  description?: string | null;
  thumbnailUrl?: string | null;
  educationalStage: string;
  isPaid: boolean;
  price?: number | null;
  folders: FolderItem[];
}

export type CourseCategoryType = "all" | "lesson" | "foundation" | "month" | "free";

const STAGE_LABELS: Record<string, string> = {
  sec_1: "أولى بكالوريا",
  sec_2: "ثانية بكالوريا",
};

const isSafeUrl = (s?: string | null) =>
  !!s && (/^https?:\/\//i.test(s) || s.startsWith("data:image/") || s.startsWith("/"));

/**
 * Extracts chronological month index from Arabic course title:
 * e.g. "الشهر الاول", "شهر 1", "شهر اكتوبر"
 */
export function extractMonthNumber(title: string): number {
  const t = title.toLowerCase();

  // Arabic ordinals
  if (t.includes("الأول") || t.includes("الاول")) return 1;
  if (t.includes("الثاني") || t.includes("التاني")) return 2;
  if (t.includes("الثالث") || t.includes("التالت")) return 3;
  if (t.includes("الرابع")) return 4;
  if (t.includes("الخامس")) return 5;
  if (t.includes("السادس")) return 6;
  if (t.includes("السابع")) return 7;
  if (t.includes("الثامن")) return 8;
  if (t.includes("التاسع")) return 9;
  if (t.includes("العاشر")) return 10;

  // Month names
  if (t.includes("أكتوبر") || t.includes("اكتوبر")) return 10;
  if (t.includes("نوفمبر")) return 11;
  if (t.includes("ديسمبر")) return 12;
  if (t.includes("يناير")) return 13;
  if (t.includes("فبراير")) return 14;
  if (t.includes("مارس")) return 15;
  if (t.includes("أبريل") || t.includes("ابريل")) return 16;
  if (t.includes("مايو")) return 17;

  // Direct numbers after month keyword e.g. "شهر 1"
  const m = t.match(/شهر\s*(\d+)/);
  if (m && m[1]) return parseInt(m[1], 10);

  return 99;
}

/**
 * Determines course category:
 * Prioritizes explicit overrides, then algorithmic title parsing.
 */
export function classifyCourse(
  course: TeacherCourseItem,
  categoryMap?: Record<string, string>
): "lesson" | "foundation" | "month" | "general" {
  // 1. Explicit override from AI / Superadmin
  if (categoryMap && categoryMap[course.id]) {
    const ov = categoryMap[course.id];
    if (ov === "lesson" || ov === "foundation" || ov === "month") {
      return ov;
    }
  }

  const title = (course.title || "").trim().toLowerCase();

  // 2. Foundation courses
  if (
    title.includes("تأسيس") ||
    title.includes("تاسيس") ||
    title.includes("تأسيسي") ||
    title.includes("تمهيد") ||
    title.includes("مقدمة")
  ) {
    return "foundation";
  }

  // 3. Single lessons / workshops / introductory sessions
  if (
    title.includes("حصة") ||
    title.includes("حصه") ||
    title.includes("ورشة") ||
    title.includes("ورشه") ||
    title.includes("شرح الدرس") ||
    title.includes("الدرس الأول") ||
    title.includes("الدرس الاول") ||
    title.includes("الدرس الثاني") ||
    title.includes("محاضرة 1") ||
    title.includes("المحاضرة الأولى") ||
    title.includes("المحاضرة الاولى")
  ) {
    return "lesson";
  }

  // 4. Monthly courses
  if (
    title.includes("الشهر") ||
    title.includes("شهر") ||
    title.includes("أكتوبر") ||
    title.includes("اكتوبر") ||
    title.includes("نوفمبر") ||
    title.includes("ديسمبر") ||
    title.includes("يناير") ||
    title.includes("فبراير") ||
    title.includes("مارس") ||
    title.includes("أبريل") ||
    title.includes("مايو")
  ) {
    return "month";
  }

  return "general";
}

interface Props {
  courses: TeacherCourseItem[];
  featuredCourseId?: string | null;
  categoryMap?: Record<string, string>;
  accentColor?: string;
}

export function TeacherCoursesSection({
  courses,
  featuredCourseId,
  categoryMap = {},
  accentColor = "#6366f1",
}: Props) {
  const [activeFilter, setActiveFilter] = useState<CourseCategoryType>("all");
  const [searchQuery, setSearchQuery] = useState("");

  // Categorize and sort all courses according to strict user requirement:
  // 1. Paid introductory lessons (الحصص الأولى المدفوعة)
  // 2. Foundation courses (التأسيسي)
  // 3. Monthly courses chronologically (الشهور بالترتيب)
  // 4. General & remaining courses
  const categorizedCourses = useMemo(() => {
    return courses.map((c) => {
      const cat = classifyCourse(c, categoryMap);
      const isFree = !c.isPaid || (c.price ?? 0) === 0;
      const monthNum = cat === "month" ? extractMonthNumber(c.title) : 999;

      let priorityScore = 400; // default general
      if (cat === "lesson" && !isFree) {
        // First: Paid lessons / workshops
        priorityScore = 100;
      } else if (cat === "foundation") {
        // Second: Foundation
        priorityScore = 200;
      } else if (cat === "month") {
        // Third: Months in chronological order
        priorityScore = 300 + monthNum;
      } else if (cat === "lesson" && isFree) {
        // Free lessons follow
        priorityScore = 400;
      }

      // Featured course stays with a slight boost if appropriate
      if (c.id === featuredCourseId) {
        priorityScore -= 50;
      }

      return {
        ...c,
        category: cat,
        isFree,
        monthNum,
        priorityScore,
      };
    });
  }, [courses, categoryMap, featuredCourseId]);

  // Counts for badge pills
  const counts = useMemo(() => {
    return {
      all: categorizedCourses.length,
      lesson: categorizedCourses.filter((c) => c.category === "lesson").length,
      foundation: categorizedCourses.filter((c) => c.category === "foundation").length,
      month: categorizedCourses.filter((c) => c.category === "month").length,
      free: categorizedCourses.filter((c) => c.isFree).length,
    };
  }, [categorizedCourses]);

  // Filtered & Sorted list
  const filteredCourses = useMemo(() => {
    let list = [...categorizedCourses];

    // Filter by active category tab
    if (activeFilter === "lesson") {
      list = list.filter((c) => c.category === "lesson");
    } else if (activeFilter === "foundation") {
      list = list.filter((c) => c.category === "foundation");
    } else if (activeFilter === "month") {
      list = list.filter((c) => c.category === "month");
    } else if (activeFilter === "free") {
      list = list.filter((c) => c.isFree);
    }

    // Filter by search query
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      list = list.filter(
        (c) =>
          c.title.toLowerCase().includes(q) ||
          (c.subject && c.subject.toLowerCase().includes(q)) ||
          (c.description && c.description.toLowerCase().includes(q))
      );
    }

    // Sort by priorityScore
    list.sort((a, b) => a.priorityScore - b.priorityScore);

    return list;
  }, [categorizedCourses, activeFilter, searchQuery]);

  const filterTabs: Array<{ id: CourseCategoryType; label: string; icon: React.ReactNode; count: number }> = [
    { id: "all", label: "الكل", icon: <Layers className="w-3.5 h-3.5" />, count: counts.all },
    { id: "lesson", label: "الحصص والورش", icon: <Zap className="w-3.5 h-3.5 text-amber-500" />, count: counts.lesson },
    { id: "foundation", label: "التأسيسي", icon: <Sparkles className="w-3.5 h-3.5 text-sky-500" />, count: counts.foundation },
    { id: "month", label: "الشهور", icon: <Calendar className="w-3.5 h-3.5 text-emerald-500" />, count: counts.month },
    { id: "free", label: "المجاني", icon: <Gift className="w-3.5 h-3.5 text-purple-500" />, count: counts.free },
  ];

  return (
    <section className="max-w-6xl mx-auto px-6 pb-20 space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[var(--border)] pb-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-black text-[var(--ink)] flex items-center gap-2">
            <BookOpen className="w-6 h-6 text-[var(--accent)]" />
            <span>الكورسات والمحتوى التعليمي</span>
          </h2>
          <p className="text-xs text-[var(--ink-muted)] mt-1">
            اختر ما يناسبك من الحصص الفردية، الكورسات التأسيسية، أو اشتراكات الشهور
          </p>
        </div>

        {/* Search input */}
        <div className="relative w-full md:w-72">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="بحث في الكورسات..."
            className="w-full pe-9 ps-3 py-2 text-xs rounded-xl border border-[var(--border)] bg-[var(--surface)] text-[var(--ink)] placeholder:text-[var(--ink-muted)] focus:outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)] transition-all"
          />
          <Search className="w-4 h-4 text-[var(--ink-muted)] absolute end-3 top-2.5 pointer-events-none" />
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none">
        {filterTabs.map((tab) => {
          const isActive = activeFilter === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveFilter(tab.id)}
              className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all shrink-0 cursor-pointer ${
                isActive
                  ? "text-white shadow-md scale-105"
                  : "bg-[var(--surface)] text-[var(--ink-muted)] hover:text-[var(--ink)] border border-[var(--border)] hover:bg-[var(--border)]/40"
              }`}
              style={{
                background: isActive ? accentColor : undefined,
              }}
            >
              {tab.icon}
              <span>{tab.label}</span>
              <span
                className={`text-[10px] px-1.5 py-0.5 rounded-full font-black ${
                  isActive ? "bg-white/20 text-white" : "bg-[var(--border)] text-[var(--ink-muted)]"
                }`}
              >
                {tab.count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Courses Grid */}
      {filteredCourses.length === 0 ? (
        <div className="text-center py-16 px-4 rounded-3xl border border-dashed border-[var(--border)] bg-[var(--surface)]/50 space-y-3">
          <BookOpen className="w-10 h-10 text-[var(--ink-muted)] mx-auto opacity-50" />
          <p className="text-sm font-bold text-[var(--ink)]">لا توجد كورسات مطابقة لهذا التصنيف حالياً</p>
          <p className="text-xs text-[var(--ink-muted)]">جرب اختيار تصنيف آخر أو مسح عبارة البحث</p>
          {(activeFilter !== "all" || searchQuery) && (
            <button
              type="button"
              onClick={() => {
                setActiveFilter("all");
                setSearchQuery("");
              }}
              className="px-4 py-2 rounded-xl text-xs font-bold text-white transition-opacity hover:opacity-90"
              style={{ background: accentColor }}
            >
              عرض جميع الكورسات
            </button>
          )}
        </div>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {filteredCourses.map((c) => {
            const isFeatured = c.id === featuredCourseId;
            const vCount = c.folders.reduce((b, f) => b + f.videos.length, 0);

            // Badge text & color
            let badgeText = "";
            let badgeBg = "bg-slate-500/20 text-slate-300";
            if (c.category === "lesson" && !c.isFree) {
              badgeText = "حصة مدفوعة ⚡";
              badgeBg = "bg-amber-500/20 text-amber-500 border border-amber-500/30";
            } else if (c.category === "foundation") {
              badgeText = "كورس تأسيسي 🎯";
              badgeBg = "bg-sky-500/20 text-sky-400 border border-sky-500/30";
            } else if (c.category === "month") {
              badgeText = c.monthNum < 99 ? `الشهر ${c.monthNum} 📅` : "شهر 📅";
              badgeBg = "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30";
            } else if (c.isFree) {
              badgeText = "مجاني 🎁";
              badgeBg = "bg-purple-500/20 text-purple-400 border border-purple-500/30";
            }

            return (
              <Link
                key={c.id}
                href={`/courses/${c.id}`}
                className="group relative flex flex-col rounded-2xl border border-[var(--border)] bg-[var(--surface)] overflow-hidden hover:shadow-xl hover:border-[var(--accent)]/50 transition-all duration-300"
              >
                {isFeatured && (
                  <span
                    className="absolute top-3 end-3 z-10 px-2.5 py-1 rounded-full text-[10px] font-bold text-white shadow-md"
                    style={{ background: accentColor }}
                  >
                    مميّز ⭐
                  </span>
                )}

                <div className="relative h-44 bg-[var(--bg)] overflow-hidden">
                  {isSafeUrl(c.thumbnailUrl) ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={c.thumbnailUrl!}
                      alt={c.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-[var(--ink-muted)]">
                      <BookOpen className="w-10 h-10 opacity-30" />
                    </div>
                  )}

                  {/* Category Pill on Image */}
                  {badgeText && (
                    <span
                      className={`absolute bottom-3 start-3 px-2 py-0.5 rounded-lg text-[10px] font-bold backdrop-blur-md shadow-sm ${badgeBg}`}
                    >
                      {badgeText}
                    </span>
                  )}
                </div>

                <div className="p-4 flex flex-col flex-1 space-y-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    {c.subject && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[var(--border)] text-[var(--ink-muted)]">
                        {c.subject}
                      </span>
                    )}
                    <span className="text-[10px] text-[var(--ink-muted)]">
                      {STAGE_LABELS[c.educationalStage] ?? c.educationalStage}
                    </span>
                  </div>

                  <h3 className="font-bold text-sm sm:text-base text-[var(--ink)] leading-snug line-clamp-2 flex-1 group-hover:text-[var(--accent)] transition-colors">
                    {c.title}
                  </h3>

                  <div className="flex items-center justify-between pt-2 border-t border-[var(--border)]/60 text-xs">
                    <span className="text-[var(--ink-muted)] font-medium">
                      {vCount} محاضرة
                    </span>
                    <span className="font-black text-sm" style={{ color: accentColor }}>
                      {c.isFree ? "مجاني" : `${c.price ?? 0} جنيه`}
                    </span>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </section>
  );
}
