import { redirect } from "next/navigation";
import { Navbar } from "@/components/ui/Navbar";
import { Footer } from "@/components/ui/Footer";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { quizResultPercent } from "@/lib/scoring";
import Link from "next/link";
import { PrintButton } from "@/components/ui/PrintButton";
import { 
  BarChart3, 
  TrendingUp, 
  BookOpen, 
  AlertTriangle, 
  MessageSquare, 
  Bell, 
  Download,
  Calendar,
  Award
} from "lucide-react";

export default async function ParentDashboardPage() {
  const session = await getSession({ preferStudent: true });

  if (!session) {
    redirect("/login?callbackUrl=/parent");
  }

  // Fetch student data for the parent dashboard
  const student = await prisma.user.findUnique({
    where: { id: session.id },
    include: {
      quizResults: {
        include: {
          quiz: true,
          // Essay answers awaiting teacher review — no final grade yet.
          answers: { where: { status: "PENDING" }, select: { id: true } },
        },
        orderBy: { completedAt: "desc" },
        take: 5
      },
      aiInsights: {
        where: { type: "weak_area" },
        orderBy: { createdAt: "desc" },
        take: 3
      },
      accessCodes: {
        where: { isActive: true },
        include: { course: true }
      },
      feedbacks: {
        where: { type: "teacher_issue" },
        orderBy: { createdAt: "desc" },
        take: 3
      }
    }
  });

  // Parse IQ data (stored as JSON string in DB)
  type IQSkill = { score: number; level: string; sessions: unknown[] };
  type ParsedIQ = {
    overallIQ: number;
    totalGamesPlayed: number;
    streak: { current: number; best: number };
    skills: Record<string, IQSkill>;
    lastUpdated: number | null;
  };
  let iqData: ParsedIQ | null = null;
  try {
    if (student?.iqData) iqData = JSON.parse(student.iqData) as ParsedIQ;
  } catch { /* ignore */ }

  // Calculate monthly ranking stats
  const overallIQ = student?.overallIQ ?? 1000;
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const monthlyCount = await prisma.user.count({
    where: {
      role: "student",
      overallIQ: { gt: 0 },
      updatedAt: { gte: startOfMonth }
    }
  });

  let rank = 1;
  let totalRanked = 1;
  let averageIQ = 1000;
  let rankingPeriod = "overall";

  if (monthlyCount >= 5) {
    rank = await prisma.user.count({
      where: {
        role: "student",
        overallIQ: { gt: overallIQ },
        updatedAt: { gte: startOfMonth }
      }
    }) + 1;
    totalRanked = monthlyCount;
    const avgIQVal = await prisma.user.aggregate({
      where: {
        role: "student",
        overallIQ: { gt: 0 },
        updatedAt: { gte: startOfMonth }
      },
      _avg: { overallIQ: true }
    });
    averageIQ = Math.round(avgIQVal._avg.overallIQ || 1000);
    rankingPeriod = "monthly";
  } else {
    rank = await prisma.user.count({
      where: {
        role: "student",
        overallIQ: { gt: overallIQ }
      }
    }) + 1;
    totalRanked = await prisma.user.count({
      where: {
        role: "student",
        overallIQ: { gt: 0 }
      }
    });
    const avgIQVal = await prisma.user.aggregate({
      where: {
        role: "student",
        overallIQ: { gt: 0 }
      },
      _avg: { overallIQ: true }
    });
    averageIQ = Math.round(avgIQVal._avg.overallIQ || 1000);
    rankingPeriod = "overall";
  }

  const IQ_SKILLS = [
    { key: "speed",          label: "السرعة",           color: "#E91E63" },
    { key: "memory",         label: "الذاكرة",           color: "#9C27B0" },
    { key: "attention",      label: "التركيز",           color: "#FF9800" },
    { key: "flexibility",    label: "المرونة",           color: "#FF5722" },
    { key: "linguistic",     label: "اللغة",             color: "#F06292" },
    { key: "logical",        label: "الرياضيات",        color: "#2196F3" },
    { key: "problemsolving", label: "حل المشاكل",      color: "#009688" },
  ] as const;


  if (!student) {
    redirect("/login");
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC] dark:bg-[#0B0F19] transition-colors duration-300 flex flex-col font-sans">
      <div className="print:hidden">
        <Navbar user={{ name: session.name, role: session.role }} />
      </div>
      
      <main className="flex-1 max-w-7xl mx-auto w-full p-4 md:p-8 space-y-8">
        {/* Header Section */}
        <header className="relative bg-white dark:bg-[#151B2B] rounded-[2rem] border border-gray-100 dark:border-white/5 p-8 md:p-10 shadow-sm overflow-hidden flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mt-4">
          <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/10 blur-[80px] rounded-full pointer-events-none"></div>
          <div className="relative z-10">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 text-sm font-bold mb-4 border border-indigo-100 dark:border-indigo-500/20">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" /></svg>
              متابعة الأداء الأكاديمي
            </div>
            <h1 className="text-3xl md:text-4xl font-black text-gray-900 dark:text-white tracking-tight mb-2">بوابة ولي الأمر</h1>
            <p className="text-gray-500 dark:text-gray-400 text-lg">
              التقرير الأكاديمي للمتعلم: <span className="font-bold text-indigo-600 dark:text-indigo-400">{student.name}</span>
            </p>
          </div>
          <div className="relative z-10 shrink-0">
            <PrintButton />
          </div>
        </header>

        {/* Quick Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white dark:bg-[#151B2B] p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-white/5 flex items-center gap-5 hover:border-indigo-500/30 transition-colors">
            <div className="w-14 h-14 rounded-2xl bg-blue-50 dark:bg-blue-500/10 flex items-center justify-center text-blue-600 dark:text-blue-400 shrink-0 border border-blue-100 dark:border-blue-500/20">
              <Award className="w-7 h-7" />
            </div>
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400 font-medium mb-1">النقاط الأكاديمية</p>
              <h3 className="text-2xl font-black text-gray-900 dark:text-white">{student.points} <span className="text-base font-normal text-gray-400">نقطة</span></h3>
            </div>
          </div>

          <div className="bg-white dark:bg-[#151B2B] p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-white/5 flex items-center gap-5 hover:border-emerald-500/30 transition-colors">
            <div className="w-14 h-14 rounded-2xl bg-emerald-50 dark:bg-emerald-500/10 flex items-center justify-center text-emerald-600 dark:text-emerald-400 shrink-0 border border-emerald-100 dark:border-emerald-500/20">
              <TrendingUp className="w-7 h-7" />
            </div>
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400 font-medium mb-1">أيام الحضور المتتالية</p>
              <h3 className="text-2xl font-black text-gray-900 dark:text-white">{student.loginStreak} <span className="text-base font-normal text-gray-400">أيام</span></h3>
            </div>
          </div>

          <div className="bg-white dark:bg-[#151B2B] p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-white/5 flex items-center gap-5 hover:border-purple-500/30 transition-colors">
            <div className="w-14 h-14 rounded-2xl bg-purple-50 dark:bg-purple-500/10 flex items-center justify-center text-purple-600 dark:text-purple-400 shrink-0 border border-purple-100 dark:border-purple-500/20">
              <BookOpen className="w-7 h-7" />
            </div>
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400 font-medium mb-1">الكورسات المسجلة</p>
              <h3 className="text-2xl font-black text-gray-900 dark:text-white">{student.accessCodes.length} <span className="text-base font-normal text-gray-400">كورسات</span></h3>
            </div>
          </div>
        </div>

        {/* Main Content Sections */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="md:col-span-2 space-y-6">
            
            {/* Academic Performance */}
            <section className="bg-white dark:bg-[#151B2B] p-8 rounded-2xl shadow-sm border border-gray-100 dark:border-white/5 relative overflow-hidden">
              <div className="absolute top-0 left-0 w-32 h-32 bg-indigo-500/5 blur-[50px] rounded-full pointer-events-none"></div>
              <h2 className="text-xl font-black text-gray-900 dark:text-white mb-6 flex items-center gap-3 relative z-10">
                <div className="p-2 rounded-lg bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-500/20">
                  <BarChart3 className="w-5 h-5" />
                </div>
                الأداء الأكاديمي الأخير
              </h2>
              {student.quizResults.length > 0 ? (
                <div className="space-y-6 relative z-10">
                  {student.quizResults.map((result) => {
                    // QuizResult.score is already a percentage; dividing by
                    // totalQ (the question count) showed parents e.g. 2833%.
                    const percentage = Math.round(quizResultPercent(result));
                    const pendingEssays = result.answers.length;
                    if (pendingEssays > 0) {
                      return (
                        <div key={result.id} className="group">
                          <div className="flex justify-between text-sm mb-2">
                            <span className="font-bold text-gray-700 dark:text-gray-300">{result.quiz.title}</span>
                            <span className="font-black text-amber-500" title={`${pendingEssays} سؤال مقالي بانتظار تصحيح المعلم`}>
                              ⏳ يتم المراجعة
                            </span>
                          </div>
                          <div className="w-full bg-gray-100 dark:bg-[#0F141F] rounded-full h-3 overflow-hidden border border-dashed border-amber-300 dark:border-amber-500/30"></div>
                        </div>
                      );
                    }
                    return (
                      <div key={result.id} className="group">
                        <div className="flex justify-between text-sm mb-2">
                          <span className="font-bold text-gray-700 dark:text-gray-300">{result.quiz.title}</span>
                          <span className={`font-black ${percentage >= 80 ? "text-emerald-500" : percentage >= 50 ? "text-amber-500" : "text-rose-500"}`}>
                            {percentage}%
                          </span>
                        </div>
                        <div className="w-full bg-gray-100 dark:bg-[#0F141F] rounded-full h-3 overflow-hidden border border-gray-200 dark:border-white/5">
                          <div 
                            className={`h-full rounded-full transition-all duration-1000 ease-out ${percentage >= 80 ? 'bg-gradient-to-r from-emerald-400 to-emerald-500' : percentage >= 50 ? 'bg-gradient-to-r from-amber-400 to-amber-500' : 'bg-gradient-to-r from-rose-400 to-rose-500'}`} 
                            style={{ width: `${percentage}%` }}
                          ></div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <div className="text-center py-10 bg-gray-50 dark:bg-[#0F141F] rounded-xl border border-dashed border-gray-200 dark:border-white/10 relative z-10">
                  <p className="text-gray-500 dark:text-gray-400 font-medium">لم يقم المتعلم بأي اختبارات بعد.</p>
                </div>
              )}
            </section>

            {/* ── IQ Brain Section ── */}
            <section className="bg-white dark:bg-[#151B2B] p-8 rounded-2xl shadow-sm border border-purple-100 dark:border-purple-500/20 relative overflow-hidden">
              <div className="absolute top-0 left-0 w-32 h-32 bg-purple-500/5 blur-[50px] rounded-full pointer-events-none"></div>
              <h2 className="text-xl font-black text-gray-900 dark:text-white mb-6 flex items-center gap-3 relative z-10">
                <div className="p-2 rounded-lg bg-purple-50 dark:bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-100 dark:border-purple-500/20">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" /></svg>
                </div>
                معدل الذكاء المعرفي
              </h2>
              {!iqData || iqData.totalGamesPlayed === 0 ? (
                <div className="text-center py-10 bg-gray-50 dark:bg-[#0F141F] rounded-xl border border-dashed border-gray-200 dark:border-white/10 relative z-10">
                  <div className="text-4xl mb-3">🧠</div>
                  <p className="text-gray-500 dark:text-gray-400 font-medium">لم يلعب أي جلسة تدريب بعد.</p>
                  <p className="text-xs text-gray-400 mt-1">شجع الطالب على الدخول لبيئات التعلم لتحسين هذا المعدل.</p>
                </div>
              ) : (
                <div className="relative z-10">
                  {/* Overall score */}
                  <div className="flex items-center gap-6 mb-6 p-5 rounded-2xl" style={{ background: "linear-gradient(135deg,#1a1a2e,#16213e)" }}>
                    {(() => {
                      const iq = iqData.overallIQ;
                      const pct = Math.min(100, ((iq - 200) / 1800) * 100);
                      const r = 36; const circ = 2 * Math.PI * r;
                      const levelColors: Record<string, string> = {
                        "مبتدئ": "#757575", "تحت المتوسط": "#1976D2",
                        "متوسط": "#7F77DD", "متقدم": "#E65100",
                        "خبير": "#C2185B", "نخبة": "#534AB7",
                      };
                      const getLevel = (s: number) => s < 700 ? "مبتدئ" : s < 1000 ? "تحت المتوسط" : s < 1200 ? "متوسط" : s < 1400 ? "متقدم" : s < 1700 ? "خبير" : "نخبة";
                      const lvl = getLevel(iq);
                      const lc = levelColors[lvl] ?? "#7F77DD";
                      return (
                        <>
                          <svg width="90" height="90" viewBox="0 0 90 90" className="shrink-0">
                            <circle cx="45" cy="45" r={r} fill="none" stroke="rgba(255,255,255,.15)" strokeWidth="7" />
                            <circle cx="45" cy="45" r={r} fill="none" stroke={lc} strokeWidth="7"
                              strokeDasharray={circ} strokeDashoffset={circ - (pct / 100) * circ}
                              strokeLinecap="round" transform="rotate(-90 45 45)" />
                            <text x="45" y="41" textAnchor="middle" fontSize="18" fontWeight="900" fill="white">{iq}</text>
                            <text x="45" y="55" textAnchor="middle" fontSize="9" fill={lc}>{lvl}</text>
                          </svg>
                          <div>
                            <div className="text-white font-black text-xl mb-1">معدل الذكاء الكلي</div>
                            <div className="text-sm text-gray-400 mb-2">{iqData.totalGamesPlayed} جلسة مكتملة</div>
                            <div className="flex items-center gap-3 text-sm mb-2">
                              <span className="text-orange-400 font-bold">🔥 streak: {iqData.streak.current}</span>
                              <span className="text-gray-400">· أفضل: {iqData.streak.best}</span>
                            </div>
                            <div className="text-xs text-gray-400 flex flex-col gap-1 border-t border-white/10 pt-2 mt-2">
                              <div>الترتيب {rankingPeriod === "monthly" ? "هذا الشهر" : "العام"}: <span className="text-indigo-400 font-bold">#{rank}</span> من {totalRanked} طالب</div>
                              <div>متوسط ذكاء الطلاب: <span className="text-emerald-400 font-bold">{averageIQ}</span></div>
                            </div>
                            {iqData.lastUpdated && <div className="text-[10px] text-gray-500 mt-1">آخر جلسة: {new Date(iqData.lastUpdated).toLocaleDateString("ar-EG", { month: "short", day: "numeric" })}</div>}
                          </div>
                        </>
                      );
                    })()}
                  </div>
                  {/* Per-skill bars */}
                  <div className="space-y-3">
                    {IQ_SKILLS.map(({ key, label, color }) => {
                      const skill = iqData?.skills[key];
                      if (!skill) return null;
                      const pct = Math.min(100, ((skill.score - 200) / 1800) * 100);
                      return (
                        <div key={key}>
                          <div className="flex justify-between text-sm mb-1">
                            <span className="font-bold px-2 py-0.5 rounded-full text-xs" style={{ background: color + "22", color }}>{skill.level}</span>
                            <span className="font-bold text-gray-700 dark:text-gray-300">{label}: {skill.score}</span>
                          </div>
                          <div className="w-full bg-gray-100 dark:bg-[#0F141F] rounded-full h-2.5 overflow-hidden border border-gray-200 dark:border-white/5">
                            <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, background: color }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </section>

            <section className="bg-white dark:bg-[#151B2B] p-8 rounded-2xl shadow-sm border border-gray-100 dark:border-white/5 relative overflow-hidden">
              <h2 className="text-xl font-black text-gray-900 dark:text-white mb-6 flex items-center gap-3 relative z-10">
                <div className="p-2 rounded-lg bg-sky-50 dark:bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-100 dark:border-sky-500/20">
                  <BookOpen className="w-5 h-5" />
                </div>
                الكورسات المسجلة
              </h2>
              {student.accessCodes.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 relative z-10">
                  {student.accessCodes.map(ac => (
                    <div key={ac.id} className="border border-gray-100 dark:border-white/5 p-5 rounded-xl bg-gray-50 dark:bg-[#0F141F] hover:border-sky-500/30 transition-colors">
                      <p className="font-bold text-gray-900 dark:text-gray-200 mb-1">{ac.course.title}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-sky-500"></span>
                        {ac.course.subject} - {ac.course.educationalStage}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-10 bg-gray-50 dark:bg-[#0F141F] rounded-xl border border-dashed border-gray-200 dark:border-white/10 relative z-10">
                  <p className="text-gray-500 dark:text-gray-400 font-medium">لا توجد كورسات مسجلة.</p>
                </div>
              )}
            </section>

          </div>

          <div className="space-y-6">
            
            {/* Weak Points Report */}
            <section className="bg-white dark:bg-[#151B2B] p-8 rounded-2xl shadow-sm border border-rose-100 dark:border-rose-500/20 relative overflow-hidden">
              <div className="absolute top-0 left-0 w-32 h-32 bg-rose-500/5 blur-[40px] rounded-full pointer-events-none"></div>
              <h2 className="text-xl font-black text-gray-900 dark:text-white mb-6 flex items-center gap-3 relative z-10">
                <div className="p-2 rounded-lg bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-100 dark:border-rose-500/20">
                  <AlertTriangle className="w-5 h-5" />
                </div>
                نقاط الضعف (ذكاء اصطناعي)
              </h2>
              {student.aiInsights.length > 0 ? (
                <div className="space-y-4 relative z-10">
                  {student.aiInsights.map(insight => (
                    <div key={insight.id} className="bg-rose-50/50 dark:bg-rose-500/5 p-4 rounded-xl border border-rose-100 dark:border-rose-500/10">
                      <p className="text-sm font-bold text-rose-800 dark:text-rose-300 mb-1">{insight.title}</p>
                      <p className="text-xs text-rose-600/80 dark:text-rose-200/70 leading-relaxed">{insight.description}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 relative z-10 bg-emerald-50 dark:bg-[#0F141F] rounded-xl border border-dashed border-emerald-200 dark:border-white/10">
                  <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-white dark:bg-emerald-500/10 text-emerald-500 mb-3 border border-emerald-100 dark:border-emerald-500/20 shadow-sm">
                    <TrendingUp className="w-7 h-7" />
                  </div>
                  <p className="text-sm text-emerald-700 dark:text-emerald-400 font-bold block">أداء ممتاز!</p>
                  <p className="text-xs text-emerald-600/70 dark:text-emerald-400/70 mt-1">لا توجد نقاط ضعف ملحوظة.</p>
                </div>
              )}
            </section>

            {/* Complaints and Messages */}
            <section className="bg-white dark:bg-[#151B2B] p-8 rounded-2xl shadow-sm border border-gray-100 dark:border-white/5 relative overflow-hidden">
              <h2 className="text-xl font-black text-gray-900 dark:text-white mb-6 flex items-center gap-3 relative z-10">
                <div className="p-2 rounded-lg bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-100 dark:border-amber-500/20">
                  <MessageSquare className="w-5 h-5" />
                </div>
                الشكاوى والرسائل
              </h2>
              {student.feedbacks.length > 0 ? (
                <div className="space-y-4 relative z-10">
                  {student.feedbacks.map(fb => (
                    <div key={fb.id} className="p-4 rounded-xl bg-gray-50 dark:bg-[#0F141F] border border-gray-100 dark:border-white/5">
                      <div className="flex justify-between items-start mb-2 gap-2">
                        <span className="font-semibold text-gray-800 dark:text-gray-200 text-sm leading-relaxed">{fb.content.length > 50 ? fb.content.substring(0, 50) + "..." : fb.content}</span>
                        <span className={`text-[10px] font-bold px-2.5 py-1 rounded-md shrink-0 border ${fb.isResolved ? 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/20' : 'bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-500/20'}`}>
                          {fb.isResolved ? "تم الحل" : "قيد المراجعة"}
                        </span>
                      </div>
                      <p className="text-[11px] text-gray-400 dark:text-gray-500">{new Date(fb.createdAt).toLocaleDateString('ar-EG', { year: 'numeric', month: 'short', day: 'numeric' })}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-10 bg-gray-50 dark:bg-[#0F141F] rounded-xl border border-dashed border-gray-200 dark:border-white/10 relative z-10">
                  <p className="text-gray-500 dark:text-gray-400 text-sm font-medium">لا توجد شكاوى مسجلة.</p>
                </div>
              )}
            </section>

          </div>

        </div>
      </main>
      
      <div className="print:hidden mt-auto">
        <Footer />
      </div>
    </div>
  );
}
