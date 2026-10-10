import { redirect } from "next/navigation";
import { Navbar } from "@/components/ui/Navbar";
import { Footer } from "@/components/ui/Footer";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { Clock, Flame } from "lucide-react";
import { DEFAULT_LEADERBOARD_PRIZES, type LeaderboardPrize } from "@/lib/leaderboard-refresh";

export const dynamic = "force-dynamic";


function getCompetitionTier(stage: string | null): string[] {
  if (!stage) return [];
  if (stage.startsWith("primary")) return ["primary_4", "primary_5", "primary_6"];
  if (stage.startsWith("prep"))    return ["prep_1", "prep_2", "prep_3"];
  if (stage.startsWith("sec"))     return ["sec_1", "sec_2"];
  return [];
}

function formatStudentName(name: string): string {
  if (!name) return "";
  const parts = name.trim().split(/\s+/);
  if (parts.length <= 2) return name;
  if (parts.length === 3) return `${parts[0]} ${parts[1]}`;
  return `${parts[0]} ${parts[1]} ${parts[parts.length - 1]}`;
}

export default async function LeaderboardPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  // Allow ALL roles — each gets a different view
  const session = await getSession();
  if (!session) redirect("/login?callbackUrl=/leaderboard");

  const role = session.role;
  const isStudent    = role === "student";
  const isAdmin      = role === "admin" || role === "superadmin";
  const isRestricted = role === "teacher" || role === "staff";

  /* ── Restricted: teacher / staff ─────────────────────────────────────── */
  if (isRestricted) {
    const roleLabel = role === "teacher" ? "المعلم" : "الموظف";
    return (
      <div className="flex flex-col min-h-screen" style={{ background: "var(--bg)", fontFamily: "var(--font-body)" }}>
        <Navbar user={{ name: session.name, role }} />
        <main className="flex-1 flex items-center justify-center px-6 py-20">
          <div
            className="max-w-md w-full text-center rounded-[22px] p-10"
            style={{ background: "var(--surface)", border: "1px solid var(--border)", boxShadow: "var(--shadow-lg)" }}
          >
            <span className="inline-flex items-center justify-center w-16 h-16 rounded-[18px] mb-6"
              style={{ background: "var(--gold-soft)", border: "1px solid var(--gold-2)" }}>
              <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="var(--gold-2)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"/><path d="M12 8v4m0 4h.01"/>
              </svg>
            </span>
            <h1 style={{ fontFamily: "var(--font-head)", fontWeight: 900, fontSize: 26, color: "var(--ink)", margin: "0 0 12px" }}>
              هذا القسم للمتعلمين فقط
            </h1>
            <p style={{ fontSize: 15, color: "var(--ink-2)", lineHeight: 1.7, margin: "0 0 24px" }}>
              لوحة الشرف والمنافسة مخصصة للمتعلمين المسجلين.
              حساب {roleLabel} لا يشارك في التصنيف ولا يمكنه الاطلاع على المنافسة.
            </p>
            <Link
              href="/"
              className="inline-block no-underline rounded-[12px] font-bold transition-opacity hover:opacity-80"
              style={{ padding: "13px 32px", background: "var(--brand)", color: "#fff", fontSize: 15 }}
            >
              العودة للرئيسية
            </Link>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  const resolvedParams = await searchParams;
  const activeTab = resolvedParams.tab === "streak" ? "streak" : "points";

  /* ── Cached Leaderboard Retrieval & User Rank extraction ─────────────────── */
  let currentUserStage: string | null = null;
  if (isStudent) {
    const dbUser = await prisma.user.findUnique({
      where: { id: session.id },
      select: { educationalStage: true },
    });
    currentUserStage = dbUser?.educationalStage ?? null;
  }

  const cacheRow = await prisma.leaderboardCache.findUnique({
    where: { key: "leaderboard_data" },
  });
  const cache = cacheRow ? JSON.parse(cacheRow.data) : null;
  const lastUpdatedAt = cacheRow ? new Date(cacheRow.updatedAt) : null;

  const tierKey = isStudent
    ? (currentUserStage?.startsWith("primary") ? "student_primary"
       : currentUserStage?.startsWith("prep") ? "student_prep"
       : currentUserStage?.startsWith("sec") ? "student_sec"
       : "student_all")
    : "student_all";

  type AdminRow   = { id: string; name: string; points: number; loginStreak: number; educationalStage: string | null; phone: string | null; email: string; parentPhone: string | null; age: number | null };
  type StudentRow = { id: string; name: string; points: number; educationalStage: string | null };
  type StreakRow  = { id: string; name: string; loginStreak: number; educationalStage: string | null };

  const topStudents:  (StudentRow | AdminRow)[] = isAdmin
    ? (cache?.topStudents?.admin ?? [])
    : (cache?.topStudents?.[tierKey] ?? []);

  const topStreakers: (StreakRow  | AdminRow)[] = isAdmin
    ? (cache?.topStreakers?.admin ?? [])
    : (cache?.topStreakers?.[tierKey] ?? []);

  let currentRank      = 0;
  let currentStreakRank = 0;

  if (isStudent && cache?.userRanks?.[session.id]) {
    currentRank = cache.userRanks[session.id].pointsRank || 0;
    currentStreakRank = cache.userRanks[session.id].streakRank || 0;
  }

  const now       = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const todayEnd   = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);

  const dailyExam = isStudent && currentUserStage
    ? await prisma.dailyExam.findFirst({
        where: {
          educationalStage: currentUserStage,
          isActive: true,
          date: { gte: todayStart, lt: todayEnd },
        },
        include: { results: { where: { studentId: session.id } } },
      })
    : null;

  const rankBadge = (i: number) => {
    if (i === 0) return { bg: "var(--gold-2)",  color: "#3a2a06" };
    if (i === 1) return { bg: "#C0C5CE",        color: "#3a3f48" };
    if (i === 2) return { bg: "#C98A4B",        color: "#fff"    };
    return       { bg: "var(--surface-2)", color: "var(--ink-3)" };
  };

  const dynamicPrizes: LeaderboardPrize[] = Array.isArray(cache?.prizes) && cache.prizes.length > 0
    ? cache.prizes
    : DEFAULT_LEADERBOARD_PRIZES;

  const prizeBadge = (rank: number, highlight?: boolean) => {
    if (rank === 1) return { bg: "var(--gold-2)", color: "#3a2a06" };
    if (rank === 2) return { bg: "#C0C5CE", color: "#3a3f48" };
    if (rank === 3) return { bg: "#C98A4B", color: "#fff" };
    if (highlight) return { bg: "var(--gold-soft)", color: "var(--gold-2)" };
    return { bg: "var(--surface-2)", color: "var(--ink-2)" };
  };

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "var(--bg)", fontFamily: "var(--font-body)" }}>
      <Navbar user={{ name: session.name, role }} />

      <main className="flex-1 max-w-[1100px] mx-auto w-full px-4 sm:px-6 py-8 sm:py-16">

        {/* Admin observer banner */}
        {isAdmin && (
          <div
            className="flex items-center gap-3 mb-8 rounded-[14px]"
            style={{ padding: "14px 20px", background: "var(--gold-soft)", border: "1px solid var(--gold-2)" }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--gold-2)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
            </svg>
            <p style={{ fontSize: 14, color: "var(--gold-2)", fontWeight: 700, margin: 0 }}>
              أنت تشاهد لوحة الشرف بصفة مراقب — حسابك لا يشارك في التصنيف ولا يظهر في القائمة.
            </p>
          </div>
        )}

        {/* Header */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-[14px] mb-4">
            <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="var(--gold-2)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6M18 9h1.5a2.5 2.5 0 0 0 0-5H18M4 22h16M10 14.7V17a2 2 0 0 1-.7 1.5L8 20h8l-1.3-1.5a2 2 0 0 1-.7-1.5v-2.3M18 2H6v7a6 6 0 0 0 12 0V2Z"/>
            </svg>
            <h1 className="text-2xl sm:text-4xl" style={{ fontFamily: "var(--font-head)", fontWeight: 900, margin: 0, color: "var(--ink)" }}>
              لوحة الشرف والمنافسة
            </h1>
          </div>
          <p style={{ fontSize: 17, color: "var(--ink-2)", margin: 0 }}>تنافس مع زملائك، احصد النقاط، واربح جوائز قيّمة!</p>
          {lastUpdatedAt && (
            <p style={{ fontSize: 13, color: "var(--ink-3)", marginTop: 8, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
              <Clock className="w-3.5 h-3.5" />
              آخر تحديث: {lastUpdatedAt.toLocaleString("ar-EG", { timeZone: "Africa/Cairo", dateStyle: "medium", timeStyle: "short" })} (تحديث يومي تلقائي)
            </p>
          )}

          {/* Tab toggle */}
          <div
            className="inline-flex items-center mt-8 p-1 rounded-[12px] gap-1"
            style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
          >
            {[
              { tab: "points", label: "الأعلى نقاطًا",   icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M12 2l3 6.5 7 .6-5.3 4.6L18.3 21 12 17.3 5.7 21l1.6-7.3L2 9.1l7-.6L12 2z"/></svg> },
              { tab: "streak", label: "الأكثر التزامًا",  icon: <Flame className="w-4 h-4" /> },
            ].map(({ tab, label, icon }) => (
              <Link
                key={tab}
                href={`/leaderboard?tab=${tab}`}
                className="inline-flex items-center gap-2 no-underline transition-all"
                style={{
                  padding: "9px 20px", borderRadius: 9, fontSize: 13.5, fontWeight: 700,
                  color: activeTab === tab ? "#fff" : "var(--ink-3)",
                  background: activeTab === tab
                    ? tab === "streak" ? "var(--gold-2)" : "var(--brand)"
                    : "transparent",
                }}
              >
                {icon}{label}
              </Link>
            ))}
          </div>
        </div>

        {/* Two-column grid / Full-width when streak */}
        <div className={`grid grid-cols-1 min-w-0 ${activeTab === "points" ? "lg:grid-cols-3" : "lg:grid-cols-1 max-w-4xl mx-auto"} gap-6 items-start`}>

          {/* Leaderboard card */}
          <div className={activeTab === "points" ? "lg:col-span-2" : "w-full"} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 18, overflow: "hidden", boxShadow: "var(--shadow-sm)" }}>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3" style={{ padding: "20px 24px", borderBottom: "1px solid var(--border)" }}>
              {isStudent ? (
                <span className="inline-flex items-center gap-1"
                  style={{ padding: "6px 13px", borderRadius: 9, background: "var(--brand-soft)", color: "var(--brand)", fontSize: 13, fontWeight: 700 }}>
                  ترتيبك الحالي: #{activeTab === "streak" ? (currentStreakRank || "—") : currentRank}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1"
                  style={{ padding: "6px 13px", borderRadius: 9, background: "var(--gold-soft)", color: "var(--gold-2)", fontSize: 13, fontWeight: 700 }}>
                  وضع المراقبة
                </span>
              )}
              <h2 className="flex items-center gap-2"
                style={{ fontFamily: "var(--font-head)", fontWeight: 800, fontSize: 20, margin: 0, color: "var(--ink)" }}>
                {activeTab === "streak" ? "أكثر ١٠ طلاب التزامًا" : "أفضل ١٠ طلاب"}
                <svg width="19" height="19" viewBox="0 0 24 24" fill="var(--gold-2)" stroke="none">
                  <path d="M12 2l3 6.5 7 .6-5.3 4.6L18.3 21 12 17.3 5.7 21l1.6-7.3L2 9.1l7-.6L12 2z"/>
                </svg>
              </h2>
            </div>

            {/* ── Admin prize table ── */}
            {isAdmin && (
              <>
              {/* Mobile: admin cards (table scrolls off-screen on phones) */}
              <div className="md:hidden flex flex-col gap-2.5" style={{ padding: 14 }}>
                {(activeTab === "points" ? topStudents : topStreakers).map((s, i) => {
                  const badge = rankBadge(i);
                  const row   = s as { id: string; name: string; points?: number; loginStreak?: number; educationalStage: string | null; phone?: string | null; parentPhone?: string | null; age?: number | null };
                  const score = activeTab === "points" ? `${row.points ?? 0} نقطة` : `${row.loginStreak ?? 0} يوم`;
                  return (
                    <div key={row.id} style={{ borderRadius: 14, border: "1px solid var(--border)", background: i < 3 ? "var(--surface-2)" : "var(--surface)", padding: 14 }}>
                      <div className="flex items-center gap-3">
                        <span className="inline-flex items-center justify-center shrink-0 font-black" style={{ width: 38, height: 38, borderRadius: "50%", background: badge.bg, color: badge.color, fontSize: 15, fontFamily: "var(--font-head)" }}>
                          {["١","٢","٣"][i] ?? i + 1}
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="truncate" style={{ fontWeight: 700, color: "var(--ink)", fontSize: 14 }}>
                            {formatStudentName(row.name)}{row.age ? <span style={{ fontSize: 11.5, color: "var(--ink-3)", marginRight: 6 }}>({row.age} سنة)</span> : null}
                          </div>
                          <div className="truncate" style={{ fontSize: 12, color: "var(--ink-3)" }}>{row.educationalStage || "—"}</div>
                        </div>
                        <span className="inline-flex items-center gap-1 shrink-0" style={{ padding: "5px 11px", borderRadius: 9, background: activeTab === "streak" ? "var(--gold-soft)" : "var(--brand-soft)", color: activeTab === "streak" ? "var(--gold-2)" : "var(--brand)", fontWeight: 800, fontSize: 13, fontFamily: "var(--font-head)" }}>
                          {activeTab === "streak" && <Flame className="w-3 h-3" />}{score}
                        </span>
                      </div>
                      {(row.phone || row.parentPhone) && (
                        <div className="flex flex-wrap gap-2" style={{ marginTop: 11, paddingTop: 11, borderTop: "1px solid var(--border)" }}>
                          {row.phone && (
                            <a href={`tel:${row.phone}`} dir="ltr" className="flex items-center gap-1.5 no-underline" style={{ padding: "7px 12px", minHeight: 38, borderRadius: 9, background: "var(--brand-soft)", color: "var(--brand)", fontWeight: 600, fontSize: 12.5 }}>
                              📞 {row.phone}
                            </a>
                          )}
                          {row.parentPhone && (
                            <a href={`tel:${row.parentPhone}`} dir="ltr" className="flex items-center gap-1.5 no-underline" style={{ padding: "7px 12px", minHeight: 38, borderRadius: 9, background: "var(--surface-2)", border: "1px solid var(--border)", color: "var(--ink-2)", fontWeight: 600, fontSize: 12.5 }}>
                              👨‍👧 {row.parentPhone}
                            </a>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
                {(activeTab === "points" ? topStudents : topStreakers).length === 0 && (
                  <div className="text-center py-10" style={{ color: "var(--ink-3)", fontSize: 15 }}>لا يوجد طلاب في لوحة الشرف حتى الآن.</div>
                )}
              </div>

              {/* Desktop: full table */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-sm" style={{ borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ borderBottom: "2px solid var(--border)", background: "var(--bg)" }}>
                      {["#", "الاسم", "المرحلة", "النقاط / السلسلة", "الهاتف", "ولي الأمر"].map((h) => (
                        <th key={h} className="text-right" style={{ padding: "12px 14px", fontSize: 12, fontWeight: 700, color: "var(--ink-3)", letterSpacing: .5 }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(activeTab === "points" ? topStudents : topStreakers).map((s, i) => {
                      const badge  = rankBadge(i);
                      const row    = s as { id: string; name: string; points?: number; loginStreak?: number; educationalStage: string | null; phone?: string | null; email?: string; parentPhone?: string | null; age?: number | null };
                      const score  = activeTab === "points" ? `${row.points ?? 0} نقطة` : `${row.loginStreak ?? 0} يوم`;
                      const rankAr = ["١","٢","٣"][i];
                      return (
                        <tr
                          key={row.id}
                          style={{ borderBottom: "1px solid var(--border)", background: i < 3 ? "var(--surface-2)" : "transparent" }}
                        >
                          <td style={{ padding: "14px 14px" }}>
                            <span
                              className="inline-flex items-center justify-center font-black"
                              style={{ width: 32, height: 32, borderRadius: "50%", background: badge.bg, color: badge.color, fontSize: 15, fontFamily: "var(--font-head)" }}
                            >
                              {rankAr ?? i + 1}
                            </span>
                          </td>
                          <td style={{ padding: "14px 14px", fontWeight: 700, color: "var(--ink)", fontSize: 14 }}>
                            {formatStudentName(row.name)}
                            {row.age && <span style={{ fontSize: 11.5, color: "var(--ink-3)", marginRight: 6 }}>({row.age} سنة)</span>}
                          </td>
                          <td style={{ padding: "14px 14px", color: "var(--ink-2)", fontSize: 13 }}>
                            {row.educationalStage || "—"}
                          </td>
                          <td style={{ padding: "14px 14px" }}>
                            <span
                              className="inline-flex items-center gap-1"
                              style={{ padding: "4px 10px", borderRadius: 8, background: activeTab === "streak" ? "var(--gold-soft)" : "var(--brand-soft)", color: activeTab === "streak" ? "var(--gold-2)" : "var(--brand)", fontWeight: 800, fontSize: 13, fontFamily: "var(--font-head)" }}
                            >
                              {activeTab === "streak" && <Flame className="w-3 h-3" />}
                              {score}
                            </span>
                          </td>
                          <td style={{ padding: "14px 14px" }}>
                            {row.phone ? (
                              <a href={`tel:${row.phone}`} dir="ltr" style={{ color: "var(--brand)", fontWeight: 600, fontSize: 13, textDecoration: "none" }}>
                                {row.phone}
                              </a>
                            ) : <span style={{ color: "var(--ink-3)" }}>—</span>}
                          </td>
                          <td style={{ padding: "14px 14px" }}>
                            {row.parentPhone ? (
                              <a href={`tel:${row.parentPhone}`} dir="ltr" style={{ color: "var(--ink-2)", fontWeight: 600, fontSize: 13, textDecoration: "none" }}>
                                {row.parentPhone}
                              </a>
                            ) : <span style={{ color: "var(--ink-3)" }}>—</span>}
                          </td>
                        </tr>
                      );
                    })}
                    {(activeTab === "points" ? topStudents : topStreakers).length === 0 && (
                      <tr>
                        <td colSpan={6} className="text-center py-12" style={{ color: "var(--ink-3)", fontSize: 15 }}>
                          لا يوجد طلاب في لوحة الشرف حتى الآن.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              </>
            )}

            {/* ── Student cards ── */}
            {!isAdmin && (
              <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
                {(activeTab === "points" ? topStudents : topStreakers).length === 0 && (
                  <div className="py-12 text-center" style={{ color: "var(--ink-3)", fontSize: 15 }}>
                    لا يوجد طلاب في لوحة الشرف حتى الآن.
                  </div>
                )}

                {activeTab === "points" && topStudents.map((student, i) => {
                  const badge = rankBadge(i);
                  const isMe  = isStudent && student.id === session.id;
                  return (
                    <div key={student.id} className="flex items-center gap-3 sm:gap-4 p-4 sm:p-5"
                      style={{ borderRadius: 14,
                        border: `1px solid ${isMe ? "var(--brand)" : "var(--border)"}`,
                        background: isMe ? "linear-gradient(110deg,var(--brand-soft),transparent)" : "var(--surface-2)" }}>
                      <span className="flex items-center justify-center shrink-0 font-black text-base sm:text-[18px]"
                        style={{ width: 40, height: 40, borderRadius: "50%", background: badge.bg, color: badge.color, fontFamily: "var(--font-head)" }}>
                        {["١","٢","٣"][i] ?? i + 1}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm sm:text-[17px] truncate" style={{ fontWeight: 700, color: "var(--ink)" }}>
                          {formatStudentName(student.name)} {isMe && <span className="text-xs" style={{ color: "var(--brand)" }}>(أنت)</span>}
                        </div>
                        <div className="text-xs sm:text-[12.5px] truncate" style={{ color: "var(--ink-3)" }}>{student.educationalStage || "غير محدد"}</div>
                      </div>
                      <span className="px-2.5 py-1.5 sm:px-4 sm:py-2 text-xs sm:text-base font-extrabold shrink-0" style={{ borderRadius: 10, background: "var(--surface)", border: "1px solid var(--border)", fontFamily: "var(--font-head)", color: "var(--ink)" }}>
                        {(student as { points?: number }).points ?? 0} <span className="text-[10px] sm:text-xs" style={{ fontWeight: 500, color: "var(--ink-3)" }}>نقطة</span>
                      </span>
                    </div>
                  );
                })}

                {activeTab === "streak" && topStreakers.map((student, i) => {
                  const badge = rankBadge(i);
                  const isMe  = isStudent && student.id === session.id;
                  return (
                    <div key={student.id} className="flex items-center gap-3 sm:gap-4 p-4 sm:p-5"
                      style={{ borderRadius: 14,
                        border: `1px solid ${isMe ? "var(--gold-2)" : "var(--border)"}`,
                        background: isMe ? "linear-gradient(110deg,var(--gold-soft),transparent)" : "var(--surface-2)" }}>
                      <span className="flex items-center justify-center shrink-0 font-black text-base sm:text-[18px]"
                        style={{ width: 40, height: 40, borderRadius: "50%", background: badge.bg, color: badge.color, fontFamily: "var(--font-head)" }}>
                        {["١","٢","٣"][i] ?? i + 1}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm sm:text-[17px] truncate" style={{ fontWeight: 700, color: "var(--ink)" }}>
                          {formatStudentName(student.name)} {isMe && <span className="text-xs" style={{ color: "var(--gold-2)" }}>(أنت)</span>}
                        </div>
                        <div className="text-xs sm:text-[12.5px] truncate" style={{ color: "var(--ink-3)" }}>{student.educationalStage || "غير محدد"}</div>
                      </div>
                      <span className="px-2.5 py-1.5 sm:px-4 sm:py-2 text-xs sm:text-base font-extrabold shrink-0 flex items-center gap-1 sm:gap-1.5" style={{ borderRadius: 10, background: "var(--surface)", border: "1px solid var(--border)", fontFamily: "var(--font-head)", color: "var(--ink)" }}>
                        <Flame className="w-4 h-4 text-orange-500 shrink-0" />
                        {(student as { loginStreak?: number }).loginStreak ?? 0} <span className="text-[10px] sm:text-xs" style={{ fontWeight: 500, color: "var(--ink-3)" }}>يوم</span>
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Prizes — above the ranking on phones so the list is not pushed off screen */}
          {activeTab === "points" && (
            <div className="min-w-0 order-first lg:order-none" style={{ display: "flex", flexDirection: "column", gap: 24 }}>

              <div className="min-w-0" style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 18, overflow: "hidden", boxShadow: "var(--shadow-sm)" }}>
                <div className="flex items-center gap-3" style={{ padding: "18px 22px", borderBottom: "1px solid var(--border)" }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--gold-2)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
                    <path d="M20 12v10H4V12M2 7h20v5H2zM12 22V7M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7zM12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/>
                  </svg>
                  <div className="min-w-0 text-right flex-1">
                    <h3 style={{ fontFamily: "var(--font-head)", fontWeight: 800, fontSize: 18, margin: 0, color: "var(--ink)" }}>المراكز العشرة الأولى</h3>
                    <p style={{ fontSize: 12, color: "var(--ink-3)", margin: "2px 0 0" }}>تحديث يومي 3:00 ص</p>
                  </div>
                </div>
                <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 8 }}>
                  {dynamicPrizes.map((p) => {
                    const isTop3 = p.rank <= 3;
                    const isGold = p.highlight || isTop3;
                    const b = prizeBadge(p.rank, p.highlight);
                    const arabicRank = ["١","٢","٣","٤","٥","٦","٧","٨","٩","١٠"][p.rank - 1] ?? p.rank;
                    return (
                      <div key={p.rank} className="flex items-start gap-3 min-w-0"
                        style={{ padding: "12px", borderRadius: 12, border: `1px solid ${isGold ? "var(--gold-2)" : "var(--border)"}`, background: isGold ? "var(--gold-soft)" : "var(--surface-2)" }}>
                        <span className="flex items-center justify-center shrink-0 font-black text-[12.5px]"
                          style={{
                            width: 30, height: 30, borderRadius: 8,
                            background: b.bg,
                            color: b.color,
                            fontFamily: "var(--font-head)",
                          }}>
                          {arabicRank}
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5" style={{ fontWeight: 700, fontSize: 14, color: "var(--ink)" }}>
                            <span className="shrink-0">{p.icon || "🎁"}</span>
                            <span>{p.title || p.rankLabel || `المركز ${p.rank}`}</span>
                          </div>
                          <div style={{ fontSize: 13, color: "var(--ink-2)", marginTop: 4, lineHeight: 1.6, whiteSpace: "normal", overflowWrap: "anywhere" }}>{p.prize}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Daily challenge — students only */}
              {isStudent && (
                <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 18, overflow: "hidden", boxShadow: "var(--shadow-sm)" }}>
                  <div className="flex items-center justify-between"
                    style={{ padding: "16px 22px", background: "linear-gradient(120deg,var(--gold-2),#9a6a1c)" }}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>
                    </svg>
                    <h3 style={{ fontFamily: "var(--font-head)", fontWeight: 800, fontSize: 18, margin: 0, color: "#fff" }}>التحدي اليومي</h3>
                  </div>
                  <div style={{ padding: "24px 22px" }}>
                    {dailyExam ? (
                      dailyExam.results.length > 0 ? (
                        <div className="text-center">
                          <span className="inline-flex items-center justify-center mb-4" style={{ width: 54, height: 54, borderRadius: "50%", background: "var(--brand-soft)" }}>
                            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="var(--brand)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5"/></svg>
                          </span>
                          <h3 style={{ fontWeight: 700, fontSize: 16, color: "var(--ink)", marginBottom: 6 }}>أكملت التحدي بنجاح!</h3>
                          <p style={{ fontSize: 13.5, color: "var(--ink-2)", marginBottom: 16 }}>
                            حصلت على {dailyExam.results[0].score} من {dailyExam.results[0].totalQ} إجابة صحيحة
                          </p>
                          <button disabled style={{ width: "100%", padding: 13, borderRadius: 12, border: "none", background: "var(--surface-2)", color: "var(--ink-3)", fontWeight: 700, fontSize: 14, cursor: "not-allowed", fontFamily: "var(--font-body)" }}>
                            عد غداً لتحدي جديد
                          </button>
                        </div>
                      ) : (
                        <div>
                          <h3 style={{ fontWeight: 700, fontSize: 16, color: "var(--ink)", marginBottom: 8 }}>{dailyExam.title}</h3>
                          <div className="flex items-center gap-4 mb-6" style={{ fontSize: 13.5, color: "var(--ink-3)" }}>
                            <span className="flex items-center gap-1"><Clock className="w-4 h-4" /> {dailyExam.timeLimitMinutes} دقيقة</span>
                          </div>
                          <Link href={`/leaderboard/daily-exam/${dailyExam.id}`}
                            className="flex items-center justify-center no-underline font-bold transition-opacity hover:opacity-90"
                            style={{ padding: 13, borderRadius: 12, background: "var(--gold-2)", color: "#fff", fontSize: 15, fontFamily: "var(--font-head)", boxShadow: "0 6px 18px -6px rgba(200,146,47,.5)" }}>
                            ابدأ التحدي الآن
                          </Link>
                        </div>
                      )
                    ) : (
                      <div className="text-center py-8">
                        <span className="inline-flex items-center justify-center mb-3" style={{ width: 54, height: 54, borderRadius: "50%", background: "var(--surface-2)" }}>
                          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="var(--ink-3)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>
                          </svg>
                        </span>
                        <p style={{ fontSize: 14.5, color: "var(--ink-2)", margin: 0 }}>لا يوجد تحدٍّ متاح لصفّك التدريبي اليوم.</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

            </div>
          )}
        </div>
      </main>

      <Footer />
    </div>
  );
}
