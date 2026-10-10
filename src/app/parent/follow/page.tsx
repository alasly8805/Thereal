"use client";

import React, { Suspense, useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import {
  Award,
  BookOpen,
  CheckCircle2,
  Clock,
  Flame,
  GraduationCap,
  PlayCircle,
  Search,
  ShieldCheck,
  UserCheck,
} from "lucide-react";
import { BrandLogo } from "@/components/ui/BrandLogo";
import { EDUCATIONAL_STAGES } from "@/types";

interface StudentReport {
  student: {
    id: string;
    name: string;
    code: string;
    educationalStage?: string | null;
    points: number;
    loginStreak: number;
    overallIQ?: number | null;
    lastLoginAt?: string | null;
    createdAt: string;
    courses?: Array<{ id: string; title: string; teacher?: { name: string } | null }>;
    subscriptions?: Array<{ planLabel?: string; expiresAt?: string | null; teacher?: { name: string } | null }>;
  };
  stats: {
    watchedCount: number;
    totalVideos: number;
    progressPct: number;
  };
  completedVideos: Array<{
    id: string;
    title: string;
    courseTitle?: string | null;
    folderName?: string | null;
    lastWatchedAt?: string | null;
  }>;
  quizResults: Array<{
    id: string;
    score: number;
    totalQ: number;
    completedAt?: string | null;
    quiz?: { title: string; folder?: { course?: { title?: string } | null } | null };
  }>;
  homeworkSubmissions: Array<{
    score?: number | null;
    totalQ?: number | null;
    status?: string | null;
    homework?: { title: string; course?: { title?: string } | null };
  }>;
}

function resolveStage(val?: string | null): string {
  if (!val) return "—";
  const match = EDUCATIONAL_STAGES.find((s) => s.value.toLowerCase() === val.toLowerCase());
  if (match) return match.label;
  const stageMap: Record<string, string> = {
    sec_1: "أولى بكالوريا",
    sec_2: "ثانية بكالوريا",
    sec_3: "ثالثة بكالوريا",
    prep_1: "الصف الأول الإعدادي",
    prep_2: "الصف الثاني الإعدادي",
    prep_3: "الصف الثالث الإعدادي",
    prim_4: "الصف الرابع الابتدائي",
    prim_5: "الصف الخامس الابتدائي",
    prim_6: "الصف السادس الابتدائي",
  };
  return stageMap[val.toLowerCase()] || val;
}

function fmtDate(d?: string | null): string {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleDateString("ar-EG", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return d;
  }
}

function fmtDateTime(d?: string | null): string {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleString("ar-EG", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return d;
  }
}

function ParentFollowContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const codeParam = searchParams.get("code") || "";
  const phoneParam = searchParams.get("phone") || "";

  const [inputCode, setInputCode] = useState(codeParam);
  const [inputPhone, setInputPhone] = useState(phoneParam);

  const [report, setReport] = useState<StudentReport | null>(null);
  const [loading, setLoading] = useState(Boolean(codeParam));
  const [error, setError] = useState("");

  const fetchReport = async (code: string, phone: string) => {
    if (!code.trim()) {
      setError("يرجى إدخال كود الطالب");
      return;
    }

    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      params.set("code", code.trim());
      if (phone.trim()) params.set("phone", phone.trim());

      const res = await fetch(`/api/parent/follow?${params.toString()}`);
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "تعذر جلب تقرير الطالب");
        setReport(null);
      } else {
        setReport(data);
      }
    } catch {
      setError("حدث خطأ في الاتصال بالخادم");
      setReport(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (codeParam) {
      setInputCode(codeParam);
      setInputPhone(phoneParam);
      void fetchReport(codeParam, phoneParam);
    }
  }, [codeParam, phoneParam]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const params = new URLSearchParams();
    if (inputCode.trim()) params.set("code", inputCode.trim());
    if (inputPhone.trim()) params.set("phone", inputPhone.trim());
    router.push(`/parent/follow?${params.toString()}`);
    void fetchReport(inputCode, inputPhone);
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 font-sans" dir="rtl">
      {/* Top Navigation */}
      <header className="sticky top-0 z-40 border-b border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <BrandLogo />
            <div>
              <h1 className="text-base font-bold text-slate-800 dark:text-slate-100">
                منصة Code-Up
              </h1>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                بوابة متابعة ولي الأمر 👨‍👧‍👦
              </p>
            </div>
          </div>
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300">
            <ShieldCheck size={14} /> وصول آمن لولي الأمر
          </span>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8 space-y-6">
        {/* Search / Entry Card */}
        <section className="bg-white dark:bg-slate-900 rounded-3xl p-6 shadow-sm border border-slate-200 dark:border-slate-800">
          <h2 className="text-lg font-black mb-1">تقرير متابعة الطالب</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
            تابع مستوى ابنك، الحصص المشاهدة، والدرجات مباشرة دون الحاجة لتسجيل دخول.
          </p>

          <form onSubmit={handleSubmit} className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1">
                كود الطالب <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                value={inputCode}
                onChange={(e) => setInputCode(e.target.value)}
                placeholder="مثال: CUP-1234 أو كود الطالب"
                required
                className="w-full px-3 py-2 text-sm rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1">
                رقم هاتف ولي الأمر
              </label>
              <input
                type="text"
                value={inputPhone}
                onChange={(e) => setInputPhone(e.target.value)}
                placeholder="01xxxxxxxxx"
                className="w-full px-3 py-2 text-sm rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
            <div className="flex items-end">
              <button
                type="submit"
                disabled={loading}
                className="w-full px-4 py-2 text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 rounded-xl transition-all shadow-sm flex items-center justify-center gap-2 cursor-pointer"
              >
                <Search size={16} />
                {loading ? "جارٍ التحميل..." : "عرض التقرير"}
              </button>
            </div>
          </form>

          {error && (
            <div className="mt-4 p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 text-xs font-bold">
              {error}
            </div>
          )}
        </section>

        {/* Loading skeleton */}
        {loading && (
          <div className="p-12 text-center text-slate-500 dark:text-slate-400">
            <div className="inline-block animate-spin w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full mb-3" />
            <p className="text-sm font-semibold">جارٍ جلب تقرير الطالب...</p>
          </div>
        )}

        {/* Report Content */}
        {!loading && report && (
          <div className="space-y-6 animate-in fade-in duration-300">
            {/* Student Hero Header */}
            <section className="bg-gradient-to-br from-emerald-600 to-teal-800 rounded-3xl p-6 text-white shadow-md">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="p-2 rounded-xl bg-white/10 backdrop-blur-sm">
                      <GraduationCap size={24} />
                    </span>
                    <h3 className="text-2xl font-black">{report.student.name}</h3>
                  </div>
                  <p className="text-xs text-emerald-100 flex flex-wrap items-center gap-3 mt-2">
                    <span>📚 المستوى: {resolveStage(report.student.educationalStage)}</span>
                    <span>🆔 كود الطالب: {report.student.code}</span>
                    <span>📅 تاريخ التسجيل: {fmtDate(report.student.createdAt)}</span>
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="bg-white/15 backdrop-blur-sm rounded-2xl px-4 py-2 text-center">
                    <p className="text-xs text-emerald-100 font-bold">النقاط</p>
                    <p className="text-xl font-black flex items-center justify-center gap-1">
                      <Award size={18} className="text-yellow-300" />
                      {report.student.points.toLocaleString("ar-EG")}
                    </p>
                  </div>
                  {report.student.loginStreak > 0 && (
                    <div className="bg-white/15 backdrop-blur-sm rounded-2xl px-4 py-2 text-center">
                      <p className="text-xs text-emerald-100 font-bold">الستريك</p>
                      <p className="text-xl font-black flex items-center justify-center gap-1">
                        <Flame size={18} className="text-orange-300" />
                        {report.student.loginStreak} يوم
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </section>

            {/* Quick Stats Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-200 dark:border-slate-800">
                <p className="text-xs text-slate-500 font-bold mb-1">نسبة التقدم الإجمالية</p>
                <p className="text-2xl font-black text-emerald-600 dark:text-emerald-400">
                  {report.stats.progressPct}%
                </p>
                <p className="text-[11px] text-slate-400 mt-1">
                  {report.stats.watchedCount} من أصل {report.stats.totalVideos} فيديو
                </p>
              </div>

              <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-200 dark:border-slate-800">
                <p className="text-xs text-slate-500 font-bold mb-1">الفيديوهات المكتملة</p>
                <p className="text-2xl font-black text-sky-600 dark:text-sky-400">
                  {report.stats.watchedCount}
                </p>
                <p className="text-[11px] text-slate-400 mt-1">حصة مسجلة</p>
              </div>

              <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-200 dark:border-slate-800">
                <p className="text-xs text-slate-500 font-bold mb-1">الاختبارات المنجزة</p>
                <p className="text-2xl font-black text-purple-600 dark:text-purple-400">
                  {report.quizResults.length}
                </p>
                <p className="text-[11px] text-slate-400 mt-1">اختبار إلكتروني</p>
              </div>

              <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-200 dark:border-slate-800">
                <p className="text-xs text-slate-500 font-bold mb-1">آخر نشاط</p>
                <p className="text-sm font-bold text-slate-700 dark:text-slate-300 mt-2 truncate" title={fmtDateTime(report.student.lastLoginAt)}>
                  <Clock size={14} className="inline ml-1 text-slate-400" />
                  {fmtDateTime(report.student.lastLoginAt)}
                </p>
              </div>
            </div>

            {/* Video Progress Bar */}
            <section className="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200 dark:border-slate-800">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-black flex items-center gap-2">
                  <PlayCircle size={18} className="text-emerald-600" />
                  معدل إكمال الحصص والمشاهدة
                </h3>
                <span className="text-xs font-bold text-emerald-600">
                  {report.stats.watchedCount} / {report.stats.totalVideos} ({report.stats.progressPct}%)
                </span>
              </div>
              <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-3 overflow-hidden">
                <div
                  className="bg-emerald-500 h-3 rounded-full transition-all duration-500"
                  style={{ width: `${Math.min(report.stats.progressPct, 100)}%` }}
                />
              </div>
            </section>

            {/* Quizzes Results */}
            {report.quizResults.length > 0 && (
              <section className="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200 dark:border-slate-800">
                <h3 className="text-sm font-black mb-3 flex items-center gap-2">
                  <Award size={18} className="text-amber-500" />
                  نتائج الاختبارات والتقييمات
                </h3>
                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                  {report.quizResults.map((q) => {
                    const pct = q.totalQ > 0 ? Math.round((q.score / q.totalQ) * 100) : Math.round(q.score);
                    const isGood = pct >= 60;
                    return (
                      <div key={q.id} className="py-3 flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-bold truncate">
                            {q.quiz?.title || "اختبار"}
                          </p>
                          <p className="text-xs text-slate-400 mt-0.5">
                            {q.quiz?.folder?.course?.title ? `${q.quiz.folder.course.title} · ` : ""}
                            {fmtDate(q.completedAt)}
                          </p>
                        </div>
                        <span
                          className={`px-3 py-1 rounded-xl text-xs font-black shrink-0 ${
                            isGood
                              ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800"
                              : "bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300 border border-rose-200 dark:border-rose-800"
                          }`}
                        >
                          {pct}% ({q.score}/{q.totalQ})
                        </span>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {/* Completed Videos */}
            {report.completedVideos.length > 0 && (
              <section className="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200 dark:border-slate-800">
                <h3 className="text-sm font-black mb-3 flex items-center gap-2">
                  <CheckCircle2 size={18} className="text-emerald-500" />
                  سجل الفيديوهات المكتملة ({report.completedVideos.length})
                </h3>
                <div className="max-h-80 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
                  {report.completedVideos.map((v) => (
                    <div key={v.id} className="py-2.5 flex items-center justify-between gap-3">
                      <div className="min-w-0 flex items-center gap-2">
                        <CheckCircle2 size={14} className="text-emerald-500 shrink-0" />
                        <p className="text-xs font-semibold truncate text-slate-800 dark:text-slate-200">
                          {v.title}
                        </p>
                      </div>
                      <span className="text-[11px] text-slate-400 shrink-0">
                        {v.courseTitle || v.folderName || fmtDate(v.lastWatchedAt)}
                      </span>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Enrolled Courses */}
            {report.student.courses && report.student.courses.length > 0 && (
              <section className="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200 dark:border-slate-800">
                <h3 className="text-sm font-black mb-3 flex items-center gap-2">
                  <BookOpen size={18} className="text-sky-500" />
                  الكورسات المشترك بها
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {report.student.courses.map((c) => (
                    <div key={c.id} className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/60 dark:border-slate-700/60">
                      <p className="text-sm font-bold">{c.title}</p>
                      {c.teacher?.name && (
                        <p className="text-xs text-slate-400 mt-1">أ. {c.teacher.name}</p>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
      </main>

      <footer className="mt-12 py-6 text-center text-xs text-slate-400 border-t border-slate-200 dark:border-slate-800">
        منصة Code-Up التعليمية © {new Date().getFullYear()} — متابعة أداء الطالب لولي الأمر
      </footer>
    </div>
  );
}

export default function ParentFollowPage() {
  return (
    <Suspense fallback={<div className="p-12 text-center text-sm">جارٍ تحميل صفحة المتابعة...</div>}>
      <ParentFollowContent />
    </Suspense>
  );
}
