"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Navbar } from "@/components/ui/Navbar";
import { Footer } from "@/components/ui/Footer";
import { EDUCATIONAL_STAGES } from "@/types";
import { fetchMeWithRetry } from "@/lib/fetch-me";
import { getIQData, SKILL_LABELS, SKILL_COLORS, getIQLevel, type IQData, type IQSkillName } from "@/lib/iq-system";

/* ─── Types ─────────────────────────────────────────────────────────────── */
interface User {
  id: string; email: string; role: string; name?: string;
  phone?: string | null; parentPhone?: string | null; age?: number | null;
  educationalStage?: string | null; createdAt?: string | Date;
  referralCode?: string | null; streakFreezes?: number;
}
interface StudentStats {
  points: number; streak: number; watchedVideos: number; quizzesPassed: number;
  coursesCount: number; hours: number; weekActive: boolean[];
  achievements: { id: string; title: string; description: string; icon: string; unlocked: boolean }[];
  achievementsUnlocked: number;
  weaknesses: { subject: string; avgScore: number; quizCount: number; course: { id: string; title: string } }[];
  activity: number[];
}
interface Course {
  id: string; title: string; subject: string; teacher: { name: string };
  folders: { videos: { watched: boolean }[] }[];
  totalVideos: number; watchedVideos: number;
}
interface ShapedResult {
  serial: number; id: string; quizId: string; quizTitle: string;
  courseTitle: string; subject: string; courseId: string;
  totalQ: number; score: number; pct: number;
  attempted: number; correct: number; hasAnswers: boolean;
  pendingEssays?: number; essayCount?: number; gradingStatus?: "PENDING" | "GRADED";
  startedAt: string | null; completedAt: string;
  allowRetake: boolean;
}
interface AnswerDetail {
  id: string; question: string;
  questionType?: string; imageUrl?: string | null;
  optionA: string; optionB: string; optionC: string; optionD: string;
  selectedAnswer: string | null; correctAnswer: string; isCorrect: boolean;
  essayAnswer?: string | null;
  status?: "PENDING" | "APPROVED" | "DISAPPROVED";
  teacherReply?: string | null; reviewedAt?: string | null;
}
interface WrongQuestion {
  id: string; questionId: string; question: string;
  optionA: string; optionB: string; optionC: string; optionD: string;
  correctAnswer: string; selectedAnswer: string | null;
  result: { quiz: { title: string; folder: { course: { subject: string; title: string } } } };
}
interface BalanceTx {
  id: string; type: string; amount: number; note: string | null; createdAt: string;
  isPending?: boolean;
  status?: "PAID" | "UNPAID";
  paymentUrl?: string | null;
  reference?: string | null;
}
interface Device {
  id: string; deviceId: string; label?: string | null;
  userAgent?: string | null; ipAddress?: string | null;
  lastSeenAt: string; createdAt: string;
}

/* ─── Nav sections ───────────────────────────────────────────────────────── */
const SECTIONS = [
  { id: "profile", label: "ملف المستخدم", icon: "👤" },
  { id: "courses", label: "كورساتي وخططي", icon: "📚" },
  { id: "stats", label: "إحصائياتي", icon: "📊" },
  { id: "results", label: "نتائج الاختبارات", icon: "📝" },
  { id: "wrong", label: "امتحان من أخطائي", icon: "🎯" },
  { id: "wallet", label: "رصيدي", icon: "💰" },
  { id: "achievements", label: "الإنجازات", icon: "🏆" },
  { id: "iq", label: "IQ Dashboard", icon: "🧠" },
  { id: "security", label: "الأمان", icon: "🔒" },
];

const ACH_ICON: Record<string, string> = { rocket: "🚀", bolt: "⚡", flame: "🔥", star: "⭐", medal: "🏅", trophy: "🏆" };

/* ─── IQ Dashboard Component ────────────────────────────────────────────── */
const IQ_LEVEL_STYLE: Record<string, { bg: string; color: string }> = {
  "مبتدئ": { bg: "#EEE", color: "#888" },
  "متوسط": { bg: "#7F77DD22", color: "#7F77DD" },
  "متقدم": { bg: "#EF9F2722", color: "#EF9F27" },
  "خبير": { bg: "#D4537E22", color: "#D4537E" },
  "نخبة": { bg: "#534AB722", color: "#534AB7" },
};

function IQSkillBar({ skillKey, data }: { skillKey: IQSkillName; data: IQData["skills"][IQSkillName] }) {
  const pct = Math.min(100, (data.score / 2000) * 100);
  const style = IQ_LEVEL_STYLE[data.level] || IQ_LEVEL_STYLE["متوسط"];
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
      <span style={{ width: 100, textAlign: "right", fontSize: 12, color: "var(--ink-3)", flexShrink: 0 }}>{SKILL_LABELS[skillKey]}</span>
      <div style={{ flex: 1, height: 8, borderRadius: 4, background: "var(--border)", overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: SKILL_COLORS[skillKey], borderRadius: 4, transition: "width 0.8s cubic-bezier(0.4,0,0.2,1)" }} />
      </div>
      <span style={{ fontSize: 12, fontWeight: 700, minWidth: 40, textAlign: "center", color: "var(--ink)" }}>{data.score.toLocaleString("ar-EG")}</span>
      <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 20, ...style, flexShrink: 0 }}>{data.level}</span>
    </div>
  );
}

function IQDashboard() {
  const [iqData, setIqData] = useState<IQData | null>(null);

  useEffect(() => {
    setIqData(getIQData());
    const handler = () => setIqData(getIQData());
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, []);

  if (!iqData) return null;

  const overallLevel = getIQLevel(iqData.overallIQ);
  const levelStyle = IQ_LEVEL_STYLE[overallLevel] || IQ_LEVEL_STYLE["متوسط"];
  const skills = Object.keys(iqData.skills) as IQSkillName[];

  return (
    <div className="rounded-[20px]" style={{ background: "var(--surface)", border: "1px solid var(--border)", boxShadow: "var(--shadow-sm)", overflow: "hidden" }}>
      <div style={{ padding: "16px 22px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <Link href="/environments" style={{ fontSize: 13, fontWeight: 700, color: "var(--brand)", textDecoration: "none" }}>→ ابدأ العب لتحسين نقاطك</Link>
        <h2 style={{ fontFamily: "var(--font-head)", fontWeight: 800, fontSize: 18, color: "var(--ink)", margin: 0 }}>🧠 IQ Dashboard</h2>
      </div>

      {/* Overall IQ Card */}
      <div style={{ padding: "20px 22px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 16 }}>
        <div style={{ textAlign: "center", minWidth: 80 }}>
          <div style={{ fontSize: 36, fontWeight: 900, color: "var(--ink)", fontFamily: "var(--font-head)" }}>{iqData.overallIQ}</div>
          <div style={{ fontSize: 11, color: "var(--ink-3)" }}>IQ الكلي</div>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
            <span style={{ fontSize: 14, fontWeight: 800, color: "var(--ink)" }}>المستوى:</span>
            <span style={{ fontSize: 13, fontWeight: 700, padding: "3px 10px", borderRadius: 20, ...levelStyle }}>{overallLevel}</span>
          </div>
          <div style={{ display: "flex", gap: 16, fontSize: 12, color: "var(--ink-3)" }}>
            <span>🎮 {iqData.totalGamesPlayed} جلسة</span>
            {iqData.streak.current > 0 && <span>🔥 {iqData.streak.current} يوم streak</span>}
          </div>
          {/* mini progress bar 0–2000 */}
          <div style={{ marginTop: 8, height: 6, borderRadius: 3, background: "var(--border)", overflow: "hidden" }}>
            <div style={{ width: `${Math.min(100, (iqData.overallIQ / 2000) * 100)}%`, height: "100%", background: "linear-gradient(90deg,#534AB7,#7F77DD)", borderRadius: 3 }} />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "var(--ink-3)", marginTop: 2 }}>
            <span>0</span><span>2000</span>
          </div>
        </div>
      </div>

      {/* Skills Breakdown */}
      <div style={{ padding: "16px 22px", borderBottom: "1px solid var(--border)" }}>
        <h3 style={{ fontWeight: 700, fontSize: 14, color: "var(--ink)", marginBottom: 14, textAlign: "right" }}>تفصيل المهارات</h3>
        {skills.map(sk => <IQSkillBar key={sk} skillKey={sk} data={iqData.skills[sk]} />)}
      </div>

      {/* Recent activity */}
      <div style={{ padding: "14px 22px" }}>
        <h3 style={{ fontWeight: 700, fontSize: 13, color: "var(--ink-3)", marginBottom: 10, textAlign: "right" }}>آخر الجلسات</h3>
        {skills.flatMap(sk => iqData.skills[sk].sessions.slice(-3).map(s => ({ ...s, skill: sk }))).sort((a, b) => b.date - a.date).slice(0, 5).length === 0 ? (
          <p style={{ textAlign: "center", color: "var(--ink-3)", fontSize: 13, padding: "12px 0" }}>لم تلعب بعد — اذهب للبيئات وابدأ!</p>
        ) : (
          skills.flatMap(sk => iqData.skills[sk].sessions.slice(-3).map(s => ({ ...s, skill: sk }))).sort((a, b) => b.date - a.date).slice(0, 5).map((s, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: i < 4 ? "1px solid var(--border)" : "none" }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: SKILL_COLORS[s.skill as IQSkillName], flexShrink: 0 }} />
              <span style={{ flex: 1, fontSize: 12, color: "var(--ink)" }}>{SKILL_LABELS[s.skill as IQSkillName]}</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: "var(--ink)" }}>{s.score.toLocaleString("ar-EG")}</span>
              <span style={{ fontSize: 11, color: "var(--ink-3)" }}>{new Date(s.date).toLocaleDateString("ar-EG", { month: "short", day: "numeric" })}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

const OPTION_LABELS: Record<string, string> = { A: "أ", B: "ب", C: "ج", D: "د" };

/* ─── Circular ring ─────────────────────────────────────────────────────── */
function Ring({ pct, color, size = 100, label, sublabel }: { pct: number; color: string; size?: number; label: string; sublabel?: string }) {
  const r = 38; const c = 2 * Math.PI * r;
  return (
    <div className="flex flex-col items-center gap-2">
      <svg width={size} height={size} viewBox="0 0 100 100">
        <circle cx="50" cy="50" r={r} fill="none" stroke="var(--border)" strokeWidth="10" />
        <circle cx="50" cy="50" r={r} fill="none" stroke={color} strokeWidth="10"
          strokeDasharray={c} strokeDashoffset={c - (Math.min(pct, 100) / 100) * c}
          strokeLinecap="round" transform="rotate(-90 50 50)" />
        <text x="50" y="46" textAnchor="middle" fontSize="16" fontWeight="800" fill="var(--ink)" fontFamily="var(--font-head)">{Math.round(pct)}%</text>
        <text x="50" y="62" textAnchor="middle" fontSize="9" fill="var(--ink-3)">{label}</text>
      </svg>
      {sublabel && <p className="text-xs text-center" style={{ color: "var(--ink-3)" }}>{sublabel}</p>}
    </div>
  );
}

/* ─── Answer review modal ───────────────────────────────────────────────── */
function AnswerModal({ resultId, quizTitle, onClose }: { resultId: string; quizTitle: string; onClose: () => void }) {
  const [data, setData] = useState<{ answers: AnswerDetail[]; score: number; totalQ: number; pendingEssays?: number; correct?: number } | null>(null);
  useEffect(() => {
    fetch(`/api/student/results/${resultId}`, { credentials: "include" })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.result) setData(d.result); })
      .catch(() => { });
  }, [resultId]);

  return (
    <div className="fixed inset-0 z-[var(--z-modal)] flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,.6)" }} onClick={onClose}>
      <div className="w-full max-w-2xl max-h-[85vh] overflow-y-auto rounded-[20px]" style={{ background: "var(--surface)", border: "1px solid var(--border)", boxShadow: "var(--shadow-lg)" }} onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 flex items-center justify-between" style={{ padding: "16px 20px", borderBottom: "1px solid var(--border)", background: "var(--surface)" }}>
          <button onClick={onClose} style={{ width: 32, height: 32, borderRadius: 8, border: "none", background: "var(--surface-2)", color: "var(--ink-2)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
          <h3 style={{ fontFamily: "var(--font-head)", fontWeight: 800, fontSize: 16, margin: 0, color: "var(--ink)" }}>عرض إجابات — {quizTitle}</h3>
        </div>
        <div style={{ padding: 16 }}>
          {!data ? (
            <div className="flex items-center justify-center py-10 gap-2" style={{ color: "var(--ink-3)" }}>
              <div className="w-5 h-5 border-2 border-[var(--brand)] border-t-transparent rounded-full animate-spin" />
              <span>جارٍ التحميل...</span>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {(data.pendingEssays ?? 0) > 0 && (
                <div style={{ padding: "12px 14px", borderRadius: 12, border: "1px solid var(--gold-2)", background: "var(--gold-soft)", color: "var(--gold-2)", fontSize: 13, fontWeight: 700 }}>
                  ⏳ {data.pendingEssays} سؤال مقالي بانتظار تصحيح المعلم — الدرجة النهائية تظهر بعد التصحيح.
                </div>
              )}
              {data.answers.map((a, i) => {
                const isEssay = a.questionType === "essay";
                const pending = isEssay && a.status !== "APPROVED" && a.status !== "DISAPPROVED";
                const good = isEssay ? a.status === "APPROVED" : a.isCorrect;
                const edge = pending ? "var(--gold-2)" : good ? "var(--brand)" : "var(--danger)";
                const soft = pending ? "var(--gold-soft)" : good ? "var(--brand-soft)" : "var(--danger-soft)";
                return (
                <div key={a.id} style={{ padding: "14px 16px", borderRadius: 12, border: `1px solid ${edge}`, background: soft }}>
                  <p style={{ fontWeight: 700, fontSize: 14, color: "var(--ink)", margin: "0 0 10px" }}>
                    <span style={{ color: "var(--ink-3)", marginLeft: 6 }}>س{i + 1}.</span> {a.question}
                  </p>
                  {a.imageUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={a.imageUrl} alt="" style={{ maxHeight: 240, width: "100%", objectFit: "contain", borderRadius: 10, marginBottom: 10, border: "1px solid var(--border)" }} />
                  )}
                  {isEssay ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      <span style={{ alignSelf: "flex-start", padding: "3px 10px", borderRadius: 8, fontSize: 12, fontWeight: 800, color: edge, background: "var(--surface)", border: `1px solid ${edge}` }}>
                        {pending ? "📝 مقالي — بانتظار التصحيح ⏳" : good ? "📝 مقالي — مقبولة ✓" : "📝 مقالي — لم تُقبل ✗"}
                      </span>
                      <div style={{ padding: "10px 12px", borderRadius: 8, fontSize: 13, background: "var(--surface)", border: "1px solid var(--border)", color: "var(--ink)", whiteSpace: "pre-wrap", lineHeight: 1.7 }}>
                        {a.essayAnswer?.trim() || "— لم تكتب إجابة —"}
                      </div>
                      {!pending && a.teacherReply && (
                        <div style={{ padding: "10px 12px", borderRadius: 8, fontSize: 13, background: "var(--surface)", border: "1px dashed var(--border)", color: "var(--ink-2)" }}>
                          <strong style={{ color: "var(--ink)" }}>ملاحظة المعلم: </strong>{a.teacherReply}
                        </div>
                      )}
                    </div>
                  ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {(["A", "B", "C", "D"] as const).map(opt => {
                      const isSelected = a.selectedAnswer === opt;
                      const isCorrect = a.correctAnswer === opt;
                      return (
                        <div key={opt} style={{
                          padding: "8px 12px", borderRadius: 8, fontSize: 13,
                          border: `1px solid ${isCorrect ? "var(--brand)" : isSelected ? "var(--danger)" : "var(--border)"}`,
                          background: isCorrect ? "var(--brand-soft)" : isSelected ? "var(--danger-soft)" : "var(--surface)",
                          color: isCorrect ? "var(--brand)" : isSelected ? "var(--danger)" : "var(--ink-2)",
                          fontWeight: (isSelected || isCorrect) ? 700 : 400,
                          display: "flex", alignItems: "center", gap: 8,
                        }}>
                          <span style={{ fontFamily: "var(--font-head)", fontWeight: 800 }}>{OPTION_LABELS[opt]}</span>
                          {a[`option${opt}` as keyof AnswerDetail] as string}
                          {isCorrect && <span style={{ marginRight: "auto" }}>✓</span>}
                          {isSelected && !isCorrect && <span style={{ marginRight: "auto" }}>✗</span>}
                        </div>
                      );
                    })}
                  </div>
                  )}
                </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── Main component ─────────────────────────────────────────────────────── */
export default function AccountPage() {
  const router = useRouter();
  const [section, setSection] = useState("profile");
  const [user, setUser] = useState<User | null>(null);
  const [resolved, setResolved] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");
  const [copiedRef, setCopiedRef] = useState(false);

  // Lazy section data
  const [stats, setStats] = useState<StudentStats | null>(null);
  const [courses, setCourses] = useState<Course[] | null>(null);
  const [plans, setPlans] = useState<any[] | null>(null);
  const [courseToDelete, setCourseToDelete] = useState<Course | null>(null);
  const [deletingCourse, setDeletingCourse] = useState(false);
  const [courseDeleteError, setCourseDeleteError] = useState("");
  const [results, setResults] = useState<ShapedResult[] | null>(null);
  const [devices, setDevices] = useState<Device[] | null>(null);
  const [wrongQuestions, setWrongQuestions] = useState<{ total: number; bySubject: Record<string, WrongQuestion[]>; questions: WrongQuestion[] } | null>(null);
  const [balance, setBalance] = useState<number | null>(null);
  const [balanceTx, setBalanceTx] = useState<BalanceTx[]>([]);
  const [txTab, setTxTab] = useState<"all" | "unpaid" | "paid">("all");
  const [checkingTxId, setCheckingTxId] = useState<string | null>(null);
  const [redeemCode, setRedeemCode] = useState("");
  const [redeeming, setRedeeming] = useState(false);
  const [redeemMsg, setRedeemMsg] = useState("");

  // Payment & Wallet Top-up state
  const [topupTab, setTopupTab] = useState<"wallet" | "fawry" | "whatsapp" | "code">("wallet");
  const [walletPhone, setWalletPhone] = useState("");
  const [walletAmount, setWalletAmount] = useState("100");
  const [selectedWalletMethod, setSelectedWalletMethod] = useState<"vf_cash" | "et_cash" | "fawry">("vf_cash");
  const [walletLoading, setWalletLoading] = useState(false);
  const [walletMsg, setWalletMsg] = useState("");
  const [walletModal, setWalletModal] = useState<{ reference: string; instructions: string; methodLabel: string; amount: number } | null>(null);

  // Results pagination + modal
  const PAGE_SIZE = 10;
  const [resultPage, setResultPage] = useState(1);
  const [answerModal, setAnswerModal] = useState<{ id: string; title: string } | null>(null);

  // Wrong questions exam
  const [wrongFilter, setWrongFilter] = useState("all");
  const [wrongExam, setWrongExam] = useState<WrongQuestion[] | null>(null);
  const [wrongExamAnswers, setWrongExamAnswers] = useState<Record<string, string>>({});
  const [wrongExamDone, setWrongExamDone] = useState(false);

  /* ── Auth ── */
  useEffect(() => {
    let cancelled = false;
    fetchMeWithRetry(2, 100).then(me => {
      if (cancelled) return;
      if (!me) { setResolved(true); return; }
      if (me.role === "student" && !me.profileCompleted) { router.replace("/complete-profile"); return; }
      setUser(me as User);
      setResolved(true);
    }).catch(() => { if (!cancelled) setResolved(true); });
    return () => { cancelled = true; };
  }, [router]);

  const EMPTY_STATS: StudentStats = {
    points: 0, streak: 0, watchedVideos: 0, quizzesPassed: 0,
    coursesCount: 0, hours: 0, weekActive: Array(7).fill(false) as boolean[],
    achievements: [], achievementsUnlocked: 0, weaknesses: [],
    activity: Array(28).fill(0) as number[],
  };

  /* ── Lazy fetch — always terminates loading state even on error ── */
  const loadSection = useCallback((s: string) => {
    if ((s === "stats" || s === "achievements") && !stats) {
      fetch("/api/student/stats", { credentials: "include" })
        .then(r => r.ok ? r.json() : null)
        .then(d => setStats(d ?? EMPTY_STATS))
        .catch(() => setStats(EMPTY_STATS));
    }
    if (s === "courses" && (!courses || !plans)) {
      fetch("/api/courses/enrolled", { credentials: "include" })
        .then(r => r.ok ? r.json() : null)
        .then(d => setCourses(d?.enrolledCourses ?? []))
        .catch(() => setCourses([]));
        
      fetch("/api/student/plans", { credentials: "include" })
        .then(r => r.ok ? r.json() : null)
        .then(d => setPlans(d?.enrolledPlans ?? []))
        .catch(() => setPlans([]));
    }
    if (s === "results" && !results) {
      fetch("/api/student/results", { credentials: "include" })
        .then(r => r.ok ? r.json() : null)
        .then(d => setResults(d?.results ?? []))
        .catch(() => setResults([]));
    }
    if (s === "wrong" && !wrongQuestions) {
      fetch("/api/student/wrong-questions", { credentials: "include" })
        .then(r => r.ok ? r.json() : null)
        .then(d => setWrongQuestions(d ?? { total: 0, bySubject: {}, questions: [] }))
        .catch(() => setWrongQuestions({ total: 0, bySubject: {}, questions: [] }));
    }
    if (s === "wallet" && balance === null) {
      fetch("/api/student/balance", { credentials: "include" })
        .then(r => r.ok ? r.json() : null)
        .then(d => { setBalance(d?.balance ?? 0); setBalanceTx(d?.transactions ?? []); })
        .catch(() => { setBalance(0); setBalanceTx([]); });
    }
    if (s === "security" && !devices) {
      fetch("/api/student/security", { credentials: "include" })
        .then(r => r.ok ? r.json() : null)
        .then(d => setDevices(d?.devices ?? []))
        .catch(() => setDevices([]));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stats, courses, results, devices, wrongQuestions, balance]);

  const go = (s: string) => { setSection(s); loadSection(s); setResultPage(1); };

  const handleSignOut = async () => {
    setSigningOut(true);
    try { await fetch("/api/auth/logout", { method: "POST", credentials: "include" }); router.push("/login"); router.refresh(); }
    catch { setError("تعذر تسجيل الخروج."); setSigningOut(false); }
  };

  const handleDelete = async () => {
    if (!confirm("هل أنت متأكد؟ لا يمكن التراجع.")) return;
    setDeleting(true);
    const res = await fetch("/api/auth/me", { method: "DELETE", credentials: "include" });
    setDeleting(false);
    if (res.ok) { router.push("/login"); router.refresh(); } else setError("تعذر حذف الحساب");
  };

  const confirmDeleteCourse = async () => {
    if (!courseToDelete) return;
    setDeletingCourse(true);
    setCourseDeleteError("");
    try {
      const res = await fetch(`/api/courses/enrolled/${courseToDelete.id}`, {
        method: "DELETE",
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "تعذر حذف الكورس من المكتبة");
      setCourses((prev) => (prev ? prev.filter((c) => c.id !== courseToDelete.id) : []));
      setCourseToDelete(null);
    } catch (err) {
      setCourseDeleteError(err instanceof Error ? err.message : "حدث خطأ أثناء الحذف");
    } finally {
      setDeletingCourse(false);
    }
  };

  const redeemBalance = async () => {
    if (!redeemCode.trim()) return;
    setRedeeming(true); setRedeemMsg("");
    const res = await fetch("/api/student/balance", {
      method: "POST", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: redeemCode.trim().toUpperCase() }),
    });
    const d = await res.json().catch(() => ({}));
    setRedeeming(false);
    if (res.ok) {
      setRedeemMsg(`✅ ${d.message}`);
      setRedeemCode("");
      if (d.credited) setBalance(b => (b ?? 0) + d.credited);
      setBalanceTx(tx => [{ id: Date.now().toString(), type: "credit_code", amount: d.credited, note: redeemCode, createdAt: new Date().toISOString() }, ...tx]);
    } else {
      setRedeemMsg(`❌ ${d.error || "كود غير صحيح"}`);
    }
  };

  const stageLabel = user ? (EDUCATIONAL_STAGES.find(s => s.value === user.educationalStage)?.label ?? user.educationalStage ?? "—") : "—";
  const isStudent = user?.role === "student";
  const filteredSections = SECTIONS.filter(s => {
    if (!isStudent) {
      return s.id === "profile" || s.id === "security";
    }
    return true;
  });

  // Excel export helper
  const exportExcel = () => {
    if (!results) return;
    const rows = [
      ["التسلسل", "اسم الامتحان", "الكورس", "عدد الأسئلة", "النتيجة %", "الدرجة", "محلولة", "صحيحة", "وقت البداية", "وقت النهاية"],
      ...results.map(r => [
        r.serial, r.quizTitle, r.courseTitle, r.totalQ,
        (r.pendingEssays ?? 0) > 0 ? "قيد التصحيح" : r.pct + "%",
        (r.pendingEssays ?? 0) > 0 ? "—" : `${r.correct} من ${r.totalQ}`, r.attempted, r.correct,
        r.startedAt ? new Date(r.startedAt).toLocaleString("ar-EG") : "—",
        new Date(r.completedAt).toLocaleString("ar-EG"),
      ])
    ];
    const csv = rows.map(r => r.map(c => `"${c}"`).join(",")).join("\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "نتائج_الاختبارات.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  /* ── Loading states ── */
  if (!resolved) return (
    <div className="min-h-screen flex flex-col" style={{ background: "var(--bg)" }}>
      <Navbar user={null} />
      <div className="flex-1 flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-[var(--brand)] border-t-transparent rounded-full animate-spin" />
      </div>
    </div>
  );
  if (!user) return (
    <div className="min-h-screen flex flex-col" style={{ background: "var(--bg)" }}>
      <Navbar user={null} />
      <div className="flex-1 flex items-center justify-center px-4 text-center">
        <div>
          <div className="text-5xl mb-4">🔒</div>
          <h2 style={{ fontFamily: "var(--font-head)", fontWeight: 800, fontSize: 22, color: "var(--ink)", marginBottom: 16 }}>يجب تسجيل الدخول أولاً</h2>
          <Link href="/login" className="inline-block no-underline rounded-[12px] text-white hover:opacity-90" style={{ padding: "12px 28px", background: "var(--brand)", fontWeight: 700 }}>تسجيل الدخول</Link>
        </div>
      </div>
      <Footer />
    </div>
  );

  /* ── Pagination helpers ── */
  const pagedResults = results ? results.slice((resultPage - 1) * PAGE_SIZE, resultPage * PAGE_SIZE) : [];
  const totalPages = results ? Math.ceil(results.length / PAGE_SIZE) : 0;

  /* ── Wrong questions filtered list ── */
  const filteredWrong = wrongQuestions
    ? (wrongFilter === "all" ? wrongQuestions.questions : (wrongQuestions.bySubject[wrongFilter] ?? []))
    : [];

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "var(--bg)", fontFamily: "var(--font-body)" }}>
      <Navbar user={{ name: user.name ?? "", role: user.role }} />

      {answerModal && <AnswerModal resultId={answerModal.id} quizTitle={answerModal.title} onClose={() => setAnswerModal(null)} />}

      <main className="flex-1 max-w-[1200px] mx-auto w-full px-3 sm:px-4 py-4 sm:py-6 md:py-10">

        {/* ── Profile Header Banner ── */}
        <div className="rounded-2xl overflow-hidden mb-6" style={{ background: "linear-gradient(135deg, rgba(20,184,166,0.15), rgba(16,185,129,0.08))", border: "1px solid rgba(20,184,166,0.2)" }}>
          <div className="relative px-6 py-6 md:py-8">
            <div className="absolute inset-0 opacity-10 pointer-events-none" style={{ backgroundImage: "linear-gradient(rgba(255,255,255,.06) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.06) 1px,transparent 1px)", backgroundSize: "32px 32px" }} />
            <div className="relative z-10 flex flex-col sm:flex-row items-center gap-5">
              {/* Avatar */}
              <div className="relative">
                <span className="flex items-center justify-center w-20 h-20 rounded-2xl text-3xl font-black text-white" style={{ background: "linear-gradient(135deg, #10B981, #14B8A6)", boxShadow: "0 8px 24px -8px rgba(16,185,129,0.4)" }}>
                  {user.name?.[0] ?? "م"}
                </span>
                <span className="absolute -bottom-1 -left-1 w-6 h-6 rounded-full flex items-center justify-center text-xs" style={{ background: "var(--gold-2)", color: "#fff", boxShadow: "0 2px 8px rgba(200,146,47,0.3)" }}>✏️</span>
              </div>
              {/* Info */}
              <div className="text-center sm:text-right flex-1">
                <h2 className="text-xl md:text-2xl font-black mb-1" style={{ color: "var(--ink)", fontFamily: "var(--font-head)" }}>{user.name}</h2>
                <p className="text-sm mb-2" style={{ color: "var(--ink-2)" }}>{stageLabel}</p>
                <span className="inline-block px-3 py-1 rounded-lg text-xs font-bold" style={{ background: "rgba(20,184,166,0.1)", color: "#14B8A6", border: "1px solid rgba(20,184,166,0.25)" }}>#{user.id.slice(-10)}</span>
              </div>
              {/* Gamification Pills */}
              {isStudent && (
                <div className="flex items-center gap-2 flex-wrap justify-center sm:justify-end">
                  <span className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold" style={{ background: "var(--gold-soft)", color: "var(--gold-2)", border: "1px solid var(--gold-2)" }}>
                    💎 {stats?.points?.toLocaleString() ?? "0"} نقطة
                  </span>
                  <span className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold" style={{ background: "rgba(20,184,166,0.1)", color: "#14B8A6", border: "1px solid rgba(20,184,166,0.25)" }}>
                    ⚡ مستوى {stats?.achievementsUnlocked ?? 0}
                  </span>
                  <span className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold" style={{ background: "rgba(245,158,11,0.12)", color: "#F59E0B", border: "1px solid rgba(245,158,11,0.25)" }}>
                    🔥 {stats?.streak ?? 0} يوم
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Desktop layout: sidebar + content ── */}
        <div className="grid grid-cols-1 gap-4 sm:gap-6 md:grid-cols-[240px_minmax(0,1fr)]">

          {/* ── Sidebar (hidden on mobile) ── */}
          <aside className="hidden md:block rounded-2xl overflow-hidden self-start sticky top-24" style={{ background: "var(--surface)", border: "1px solid var(--border)", boxShadow: "var(--shadow-sm)" }}>
            <div className="text-center p-5" style={{ borderBottom: "1px solid var(--border)", background: "linear-gradient(180deg, rgba(20,184,166,0.08), transparent)" }}>
              <span className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-3" style={{ background: "linear-gradient(135deg, #10B981, #14B8A6)", border: "4px solid var(--surface)", boxShadow: "0 8px 20px -6px rgba(16,185,129,0.4)" }}>
                <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="4" /><path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1" /></svg>
              </span>
              <h2 style={{ fontFamily: "var(--font-head)", fontWeight: 800, fontSize: 15, color: "var(--ink)", margin: "0 0 4px" }}>{user.name}</h2>
              <span style={{ fontSize: 11, padding: "3px 10px", borderRadius: 20, background: "rgba(20,184,166,0.1)", color: "#14B8A6", fontWeight: 700 }}>
                {isStudent ? "طالب" : user.role}
              </span>
              {balance !== null && (
                <div className="mt-3" style={{ padding: "6px 12px", borderRadius: 20, background: "var(--gold-soft)", border: "1px solid var(--gold-2)" }}>
                  <span style={{ fontFamily: "var(--font-head)", fontWeight: 900, fontSize: 16, color: "var(--gold-2)" }}>{balance} جنيه</span>
                  <span style={{ fontSize: 11, color: "var(--gold)", display: "block" }}>رصيدك</span>
                </div>
              )}
            </div>
            <nav style={{ padding: "8px 8px" }}>
              {filteredSections.map(s => (
                <button key={s.id} onClick={() => go(s.id)} className="w-full flex items-center gap-3 cursor-pointer border-none transition-colors rounded-[10px]"
                  style={{
                    padding: "10px 12px", marginBottom: 2, textAlign: "right", fontFamily: "var(--font-body)",
                    background: section === s.id ? "rgba(20,184,166,0.1)" : "transparent",
                    color: section === s.id ? "#14B8A6" : "var(--ink-2)",
                    fontWeight: section === s.id ? 700 : 600, fontSize: 13.5
                  }}>
                  <span className="flex-1 text-right">{s.label}</span>
                  <span>{s.icon}</span>
                </button>
              ))}
            </nav>
            <div style={{ padding: "8px 8px", borderTop: "1px solid var(--border)" }}>
              <button onClick={handleSignOut} disabled={signingOut} className="w-full flex items-center justify-between gap-3 cursor-pointer border-none rounded-[10px] transition-colors"
                style={{ padding: "10px 12px", background: "var(--danger-soft)", color: "var(--danger)", fontWeight: 700, fontSize: 13.5, fontFamily: "var(--font-body)" }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9" /></svg>
                {signingOut ? "جارٍ الخروج..." : "تسجيل الخروج"}
              </button>
            </div>
          </aside>

          {/* ── Content ── */}
          <div className="min-w-0">
            {/* Mobile section picker — scrollable tab bar, hidden on md+ */}
            <div className="md:hidden mb-4 -mx-1 min-w-0">
              {/* User chip on mobile */}
              <div className="flex items-center gap-2 px-1 mb-3">
                <span className="flex items-center justify-center w-8 h-8 rounded-full shrink-0" style={{ background: "var(--brand)", color: "#fff", fontWeight: 800, fontSize: 13 }}>
                  {user.name?.[0] ?? "م"}
                </span>
                <span style={{ fontSize: 14, fontWeight: 700, color: "var(--ink)" }}>{user.name}</span>
                {balance !== null && (
                  <span className="mr-auto flex items-center gap-1 rounded-full px-2.5 py-1" style={{ background: "var(--gold-soft)", border: "1px solid var(--gold-2)" }}>
                    <span style={{ fontFamily: "var(--font-head)", fontWeight: 900, fontSize: 13, color: "var(--gold-2)" }}>{balance} ج</span>
                  </span>
                )}
              </div>
              {/* Horizontal scrollable tabs */}
              <div className="flex overflow-x-auto gap-2 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden px-1">
                {filteredSections.map(s => (
                  <button key={s.id} onClick={() => go(s.id)}
                    className="shrink-0 flex flex-col items-center gap-1 cursor-pointer border-none rounded-[12px] transition-colors"
                    style={{
                      padding: "10px 14px",
                      minWidth: 72,
                      minHeight: 64,
                      background: section === s.id ? "var(--brand-soft)" : "var(--surface)",
                      border: `1px solid ${section === s.id ? "var(--brand)" : "var(--border)"}`,
                      color: section === s.id ? "var(--brand)" : "var(--ink-3)",
                    }}>
                    <span style={{ fontSize: 20 }}>{s.icon}</span>
                    <span style={{ fontSize: 10.5, fontWeight: section === s.id ? 700 : 500, whiteSpace: "nowrap" }}>{s.label.replace("امتحان من أخطائي", "أخطائي")}</span>
                  </button>
                ))}
                <button onClick={handleSignOut} disabled={signingOut}
                  className="shrink-0 flex flex-col items-center gap-1 cursor-pointer border-none rounded-[12px] transition-colors"
                  style={{ padding: "10px 14px", minWidth: 72, minHeight: 64, background: "var(--danger-soft)", border: "1px solid var(--danger)", color: "var(--danger)" }}>
                  <span style={{ fontSize: 20 }}>🚪</span>
                  <span style={{ fontSize: 10.5, fontWeight: 600, whiteSpace: "nowrap" }}>خروج</span>
                </button>
              </div>
            </div>

            {error && (
              <div className="mb-4 flex items-center gap-2" style={{ padding: "12px 16px", borderRadius: 12, border: "1px solid var(--danger)", background: "var(--danger-soft)", color: "var(--danger)", fontSize: 14 }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0"><circle cx="12" cy="12" r="10" /><path d="M12 8v4m0 4h.01" /></svg>{error}
              </div>
            )}

            {/* ════ PROFILE ════ */}
            {section === "profile" && (
              <div className="space-y-4">
                <div className="rounded-2xl overflow-hidden" style={{ background: "var(--surface)", border: "1px solid var(--border)", boxShadow: "var(--shadow)" }}>
                  <div style={{ height: 80, background: "linear-gradient(120deg, #10B981, #14B8A6)", position: "relative", overflow: "hidden" }}>
                    <div style={{ position: "absolute", inset: 0, backgroundImage: "linear-gradient(rgba(255,255,255,.08) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.08) 1px,transparent 1px)", backgroundSize: "40px 40px" }} />
                  </div>
                  <div style={{ padding: "20px 24px 24px" }}>
                    <h2 style={{ fontFamily: "var(--font-head)", fontWeight: 900, fontSize: 20, color: "var(--ink)", margin: "0 0 16px" }}>معلومات الحساب</h2>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-[10px]">
                      {[
                        { label: "الاسم الكامل", value: user.name || "—", icon: "👤" },
                        { label: "البريد الإلكتروني", value: user.email, icon: "📧", ltr: true },
                        { label: "رقم الهاتف", value: user.phone || "—", icon: "📱", ltr: true },
                        { label: "رقم ولي الأمر", value: user.parentPhone || "—", icon: "👨‍👧", ltr: true },
                        { label: "العمر", value: user.age ? `${user.age} سنة` : "—", icon: "🎂" },
                        { label: "المرحلة", value: stageLabel || "—", icon: "🎓" },
                        { label: "تاريخ الانضمام", value: user.createdAt ? new Date(user.createdAt).toLocaleDateString("ar-EG", { year: "numeric", month: "long", day: "numeric" }) : "—", icon: "📅", full: true },
                      ].map(item => (
                        <div key={item.label} className="flex items-center gap-3 justify-between" style={{ padding: "12px 14px", borderRadius: 10, background: "var(--surface-2)", border: "1px solid var(--border)", gridColumn: item.full ? "1 / -1" : undefined }}>
                          <div style={{ textAlign: "right", minWidth: 0 }}>
                            <div style={{ fontSize: 11, color: "var(--ink-3)", marginBottom: 2 }}>{item.label}</div>
                            <div style={{ fontSize: 13.5, fontWeight: 700, color: "var(--ink)", direction: item.ltr ? "ltr" : undefined, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.value}</div>
                          </div>
                          <span className="flex items-center justify-center shrink-0" style={{ width: 34, height: 34, borderRadius: 9, background: "var(--brand-soft)", fontSize: 16 }}>{item.icon}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="flex gap-3">
                  <button onClick={handleDelete} disabled={deleting} className="flex-1 cursor-pointer border-none rounded-[12px] hover:opacity-80 disabled:opacity-50"
                    style={{ padding: "12px", background: "var(--danger-soft)", color: "var(--danger)", fontWeight: 700, fontSize: 13.5, border: "1px solid var(--danger)" }}>
                    {deleting ? "جارٍ الحذف..." : "حذف الحساب"}
                  </button>
                  <Link href="/parent" className="flex-1 text-center no-underline rounded-[12px] hover:opacity-80"
                    style={{ padding: "12px", background: "var(--surface)", border: "1px solid var(--border)", color: "var(--ink-2)", fontWeight: 700, fontSize: 13.5 }}>
                    بوابة ولي الأمر 👨‍👧
                  </Link>
                </div>
              </div>
            )}

            {/* ════ COURSES ════ */}
            {section === "courses" && (
              <div className="rounded-[20px]" style={{ background: "var(--surface)", border: "1px solid var(--border)", boxShadow: "var(--shadow-sm)", overflow: "hidden" }}>
                <div style={{ padding: "18px 22px", borderBottom: "1px solid var(--border)" }}>
                  <h2 style={{ fontFamily: "var(--font-head)", fontWeight: 800, fontSize: 18, color: "var(--ink)", margin: 0 }}>📚 مساراتي (كورسات وخطط)</h2>
                </div>
                {!courses || !plans ? <div className="flex items-center justify-center py-10 gap-2" style={{ color: "var(--ink-3)" }}><div className="w-5 h-5 border-2 border-[var(--brand)] border-t-transparent rounded-full animate-spin" /><span>جارٍ التحميل...</span></div>
                  : (courses.length === 0 && plans.length === 0) ? <div className="py-10 text-center"><div style={{ fontSize: 36, marginBottom: 8 }}>📭</div><p style={{ color: "var(--ink-3)" }}>لم تسجل في أي كورس أو خطة.</p><div className="flex gap-2 justify-center mt-3"><Link href="/courses" className="inline-block no-underline rounded-[10px] text-white" style={{ padding: "9px 22px", background: "var(--brand)", fontWeight: 700 }}>تصفح الكورسات</Link><Link href="/plans" className="inline-block no-underline rounded-[10px]" style={{ padding: "9px 22px", background: "var(--surface-2)", color: "var(--ink)", border: "1px solid var(--border)", fontWeight: 700 }}>تصفح الخطط</Link></div></div>
                    : (
                      <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
                        {plans.length > 0 && <h3 style={{ fontSize: 15, fontWeight: 800, color: "var(--ink-2)", margin: "8px 0 4px" }}>الخطط الدراسية</h3>}
                        {plans.map(p => (
                          <div key={p.id} className="flex items-center gap-3" style={{ padding: "14px 16px", borderRadius: 12, background: "var(--surface-2)", border: "1px solid var(--border)" }}>
                            <Link href={`/plans/${p.id}/learn`} className="shrink-0 no-underline rounded-[9px] text-white hover:opacity-80" style={{ padding: "8px 14px", background: "var(--brand)", fontSize: 13, fontWeight: 700 }}>▶ تعلم</Link>
                            <div className="flex-1 min-w-0">
                              <div style={{ fontWeight: 700, fontSize: 14, color: "var(--ink)", marginBottom: 3 }}>{p.title}</div>
                              <div style={{ fontSize: 12, color: "var(--ink-3)", marginBottom: 6 }}>خطة دراسية · {p.educationalStage}</div>
                              <div style={{ height: 5, borderRadius: 3, background: "var(--border)", overflow: "hidden" }}>
                                <div style={{ height: "100%", width: `${p.progressPercent}%`, background: p.progressPercent === 100 ? "#10b981" : "var(--brand)", borderRadius: 3 }} />
                              </div>
                              <div style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 3 }}>{p.completedLessons} / {p.totalLessons} درس · {p.progressPercent}%</div>
                            </div>
                          </div>
                        ))}
                        {courses.length > 0 && <h3 style={{ fontSize: 15, fontWeight: 800, color: "var(--ink-2)", margin: "16px 0 4px" }}>الكورسات المستقلة</h3>}
                        {courses.map(c => {
                          const total = c.totalVideos || c.folders?.reduce((s, f) => s + f.videos.length, 0) || 1;
                          const watched = c.watchedVideos || c.folders?.reduce((s, f) => s + f.videos.filter(v => v.watched).length, 0) || 0;
                          const pct = Math.round((watched / Math.max(total, 1)) * 100);
                          return (
                            <div key={c.id} className="flex items-center gap-3" style={{ padding: "14px 16px", borderRadius: 12, background: "var(--surface-2)", border: "1px solid var(--border)" }}>
                              <div className="flex items-center gap-2 shrink-0">
                                <Link href={`/courses/${c.id}/learn`} className="no-underline rounded-[9px] text-white hover:opacity-80 flex items-center gap-1" style={{ padding: "8px 14px", background: "var(--brand)", fontSize: 13, fontWeight: 700 }}>
                                  ▶ تعلم
                                </Link>
                                <button
                                  type="button"
                                  onClick={() => { setCourseToDelete(c); setCourseDeleteError(""); }}
                                  title="إزالة الكورس من مكتبتي"
                                  className="cursor-pointer rounded-[9px] hover:opacity-80 transition-opacity flex items-center justify-center text-xs font-bold"
                                  style={{
                                    padding: "8px 10px",
                                    background: "var(--danger-soft)",
                                    color: "var(--danger)",
                                    border: "1px solid rgba(239, 68, 68, 0.3)",
                                  }}
                                >
                                  🗑️
                                </button>
                              </div>
                              <div className="flex-1 min-w-0">
                                <div style={{ fontWeight: 700, fontSize: 14, color: "var(--ink)", marginBottom: 3 }}>{c.title}</div>
                                <div style={{ fontSize: 12, color: "var(--ink-3)", marginBottom: 6 }}>{c.subject} · {c.teacher.name}</div>
                                <div style={{ height: 5, borderRadius: 3, background: "var(--border)", overflow: "hidden" }}>
                                  <div style={{ height: "100%", width: `${pct}%`, background: pct === 100 ? "#10b981" : "var(--brand)", borderRadius: 3 }} />
                                </div>
                                <div style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 3 }}>{watched} / {total} فيديو · {pct}%</div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}

                {/* ── Confirm Delete Course Modal ── */}
                {courseToDelete && (
                  <div
                    className="fixed inset-0 z-[var(--z-modal)] flex items-center justify-center p-4"
                    style={{ background: "rgba(0,0,0,0.65)", backdropFilter: "blur(4px)" }}
                    onClick={() => !deletingCourse && setCourseToDelete(null)}
                  >
                    <div
                      className="w-full max-w-md rounded-2xl p-6"
                      style={{ background: "var(--surface)", border: "1px solid var(--border)", boxShadow: "var(--shadow-lg)" }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="flex items-center gap-3 mb-4">
                        <div className="w-10 h-10 rounded-full flex items-center justify-center text-lg shrink-0" style={{ background: "var(--danger-soft)", color: "var(--danger)" }}>
                          🗑️
                        </div>
                        <div>
                          <h3 style={{ fontFamily: "var(--font-head)", fontWeight: 800, fontSize: 16, color: "var(--ink)", margin: 0 }}>
                            إزالة الكورس من المكتبة
                          </h3>
                          <p style={{ fontSize: 12, color: "var(--ink-3)", margin: "2px 0 0" }}>
                            تأكيد حذف الكورس من حسابك
                          </p>
                        </div>
                      </div>

                      <p style={{ fontSize: 13.5, color: "var(--ink-2)", lineHeight: 1.6, marginBottom: 16 }}>
                        هل أنت متأكد من رغبتك في إزالة كورس <strong style={{ color: "var(--ink)" }}>«{courseToDelete.title}»</strong> من مكتبتك؟
                        <br />
                        <span style={{ fontSize: 12, color: "var(--danger)" }}>
                          ⚠️ لن تتمكن من مشاهدة محتوى هذا الكورس إلا بإعادة التسجيل فيه مجدداً.
                        </span>
                      </p>

                      {courseDeleteError && (
                        <div className="mb-4 text-xs font-bold text-red-500 bg-red-500/10 p-2.5 rounded-lg border border-red-500/20">
                          {courseDeleteError}
                        </div>
                      )}

                      <div className="flex gap-2 justify-end">
                        <button
                          type="button"
                          onClick={() => setCourseToDelete(null)}
                          disabled={deletingCourse}
                          className="px-4 py-2 rounded-xl text-xs font-bold cursor-pointer transition-colors"
                          style={{ background: "var(--surface-2)", color: "var(--ink)", border: "1px solid var(--border)" }}
                        >
                          إلغاء
                        </button>
                        <button
                          type="button"
                          onClick={confirmDeleteCourse}
                          disabled={deletingCourse}
                          className="px-4 py-2 rounded-xl text-xs font-bold text-white cursor-pointer transition-colors flex items-center gap-1.5"
                          style={{ background: "#ef4444" }}
                        >
                          {deletingCourse ? (
                            <>
                              <span className="inline-block w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                              <span>جارٍ الحذف...</span>
                            </>
                          ) : (
                            <>
                              <span>تأكيد الحذف</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ════ STATS ════ */}
            {section === "stats" && (
              <div className="space-y-4">
                {!stats ? <div className="flex items-center justify-center py-16 gap-2 rounded-[20px]" style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--ink-3)" }}><div className="w-5 h-5 border-2 border-[var(--brand)] border-t-transparent rounded-full animate-spin" /></div>
                  : (
                    <>
                      <div className="rounded-[20px]" style={{ background: "var(--surface)", border: "1px solid var(--border)", padding: "22px" }}>
                        <h3 style={{ fontFamily: "var(--font-head)", fontWeight: 800, fontSize: 17, color: "var(--ink)", margin: "0 0 18px", textAlign: "center" }}>⭐ إحصائيات كورساتك ⭐</h3>
                        <div className="flex justify-around flex-wrap gap-4">
                          <Ring pct={stats.hours > 0 ? Math.min((stats.hours / Math.max(stats.hours + 5, 10)) * 100, 100) : 0} color="var(--brand)" label="ساعات التعلم" sublabel={`${stats.hours} ساعة`} />
                          <Ring pct={stats.quizzesPassed > 0 ? Math.round((stats.quizzesPassed / Math.max(stats.quizzesPassed + 5, 10)) * 100) : 0} color="var(--gold-2)" label="الاختبارات" sublabel={`${stats.quizzesPassed} ناجح`} />
                          <Ring pct={stats.watchedVideos > 0 ? Math.min((stats.watchedVideos / Math.max(stats.watchedVideos + 10, 20)) * 100, 100) : 0} color="#8b5cf6" label="الفيديوهات" sublabel={`${stats.watchedVideos} فيديو`} />
                        </div>
                      </div>
                      <div className="rounded-[20px]" style={{ background: "var(--surface)", border: "1px solid var(--border)", padding: "22px" }}>
                        <h3 style={{ fontFamily: "var(--font-head)", fontWeight: 800, fontSize: 17, color: "var(--ink)", margin: "0 0 14px", textAlign: "center" }}>⭐ إحصائياتك على المنصة ⭐</h3>
                        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                          {[
                            { label: "إجمالي ساعات التعلم", value: `${stats.hours} ساعة`, color: "var(--brand)" },
                            { label: "الفيديوهات المشاهدة", value: `${stats.watchedVideos}`, color: "var(--brand)" },
                            { label: "الاختبارات الناجحة", value: `${stats.quizzesPassed}`, color: "var(--gold-2)" },
                            { label: "النقاط المكتسبة", value: `${stats.points}`, color: "var(--gold-2)" },
                            { label: "سلسلة المواظبة", value: `${stats.streak} يوم 🔥`, color: "#f97316" },
                            { label: "الكورسات المسجّل بها", value: `${stats.coursesCount}`, color: "#8b5cf6" },
                          ].map(item => (
                            <div key={item.label} className="flex items-center justify-between" style={{ padding: "12px 16px", borderRadius: 10, background: "var(--surface-2)", border: "1px solid var(--border)" }}>
                              <span style={{ fontFamily: "var(--font-head)", fontWeight: 900, fontSize: 17, color: item.color }}>{item.value}</span>
                              <span style={{ fontSize: 13.5, color: "var(--ink-2)" }}>{item.label}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                      <div className="rounded-[20px]" style={{ background: "var(--surface)", border: "1px solid var(--border)", padding: "22px" }}>
                        <h3 style={{ fontFamily: "var(--font-head)", fontWeight: 800, fontSize: 15, color: "var(--ink)", margin: "0 0 12px" }}>نشاطك — آخر ٢٨ يوماً</h3>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 5 }}>
                          {stats.activity.map((v, i) => (
                            <div key={i} style={{ aspectRatio: "1", borderRadius: 5, background: v === 0 ? "var(--border)" : v >= 4 ? "var(--brand)" : v >= 2 ? "var(--brand-soft)" : "rgba(14,110,98,.2)" }} title={`${v} جلسة`} />
                          ))}
                        </div>
                      </div>
                    </>
                  )}
              </div>
            )}

            {/* ════ RESULTS — Professional Paginated Table ════ */}
            {section === "results" && (
              <div className="rounded-[20px]" style={{ background: "var(--surface)", border: "1px solid var(--border)", boxShadow: "var(--shadow-sm)", overflow: "hidden" }}>
                <div className="flex items-center justify-between" style={{ padding: "16px 20px", borderBottom: "1px solid var(--border)" }}>
                  <button onClick={exportExcel} disabled={!results || results.length === 0}
                    className="flex items-center gap-1.5 cursor-pointer border-none rounded-[10px] text-white disabled:opacity-40 hover:opacity-90 transition-opacity"
                    style={{ padding: "8px 16px", background: "#10b981", fontWeight: 700, fontSize: 13 }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" /></svg>
                    تحميل ملف إكسيل
                  </button>
                  <h2 style={{ fontFamily: "var(--font-head)", fontWeight: 800, fontSize: 18, color: "var(--ink)", margin: 0 }}>📝 نتائج الاختبارات</h2>
                </div>

                {!results ? (
                  <div className="flex items-center justify-center py-12 gap-2" style={{ color: "var(--ink-3)" }}><div className="w-5 h-5 border-2 border-[var(--brand)] border-t-transparent rounded-full animate-spin" /><span>جارٍ التحميل...</span></div>
                ) : results.length === 0 ? (
                  <div className="py-12 text-center"><div style={{ fontSize: 36, marginBottom: 8 }}>📋</div><p style={{ color: "var(--ink-3)" }}>لم تؤدِّ أي اختبار بعد.</p></div>
                ) : (
                  <>
                    {/* Mobile: card list (table scrolls horribly on phones) */}
                    <div className="md:hidden flex flex-col gap-3" style={{ padding: 14 }}>
                      {pagedResults.map((r) => {
                        const pending = (r.pendingEssays ?? 0) > 0;
                        const tone = pending ? "gold" : r.pct >= 80 ? "brand" : r.pct >= 50 ? "gold" : "danger";
                        const bg = tone === "brand" ? "var(--brand-soft)" : tone === "gold" ? "var(--gold-soft)" : "var(--danger-soft)";
                        const fg = tone === "brand" ? "var(--brand)" : tone === "gold" ? "var(--gold-2)" : "var(--danger)";
                        return (
                          <div key={r.id} style={{ borderRadius: 14, border: "1px solid var(--border)", background: "var(--surface-2)", padding: 14 }}>
                            <div className="flex items-start gap-3">
                              <span className="flex items-center justify-center shrink-0 text-center" style={{ width: 54, height: 54, borderRadius: 13, background: bg, color: fg, fontFamily: "var(--font-head)", fontWeight: 900, fontSize: pending ? 11 : 17, lineHeight: 1.2 }}>
                                {pending ? "قيد التصحيح" : `${r.pct}%`}
                              </span>
                              <div className="flex-1 min-w-0">
                                <div style={{ fontWeight: 700, fontSize: 14.5, color: "var(--ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.quizTitle}</div>
                                <div style={{ fontSize: 12, color: "var(--ink-3)", marginBottom: 7 }}>
                                  {r.subject}
                                  {pending && <span style={{ color: "var(--gold-2)", fontWeight: 700 }}> · {r.pendingEssays} مقالي بانتظار المعلم</span>}
                                </div>
                                <div className="flex flex-wrap items-center gap-x-3 gap-y-1" style={{ fontSize: 12, color: "var(--ink-2)" }}>
                                  <span>الدرجة <strong style={{ color: "var(--ink)", fontFamily: "var(--font-head)" }}>{pending ? "—" : `${r.correct}/${r.totalQ}`}</strong></span>
                                  <span>صحيحة <strong style={{ color: "var(--brand)", fontFamily: "var(--font-head)" }}>{r.correct}</strong></span>
                                  <span>محلولة {r.attempted}</span>
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center justify-between gap-2" style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--border)" }}>
                              <span style={{ fontSize: 11.5, color: "var(--ink-3)" }}>{new Date(r.completedAt).toLocaleDateString("ar-EG", { month: "short", day: "numeric" })}</span>
                              {r.hasAnswers ? (
                                <button onClick={() => setAnswerModal({ id: r.id, title: r.quizTitle })}
                                  className="cursor-pointer border-none rounded-[9px] text-white active:opacity-80 transition-opacity"
                                  style={{ padding: "8px 16px", minHeight: 40, background: "var(--brand)", fontSize: 13, fontWeight: 700 }}>
                                  عرض الإجابات
                                </button>
                              ) : <span style={{ fontSize: 12, color: "var(--ink-3)" }}>لا إجابات</span>}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Desktop: full table */}
                    <div className="hidden md:block" style={{ overflowX: "auto" }}>
                      <table className="w-full text-xs sm:text-sm" style={{ borderCollapse: "collapse", minWidth: 700 }}>
                        <thead>
                          <tr style={{ background: "var(--bg)", borderBottom: "2px solid var(--border)" }}>
                            {["#", "اسم الامتحان", "عدد الأسئلة", "النتيجة", "الدرجة", "محلولة", "صحيحة", "الإجابات", "وقت البداية", "وقت النهاية"].map(h => (
                              <th key={h} className="text-right" style={{ padding: "11px 14px", fontSize: 11.5, fontWeight: 700, color: "var(--ink-3)", whiteSpace: "nowrap" }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {pagedResults.map((r) => (
                            <tr key={r.id} style={{ borderBottom: "1px solid var(--border)" }}
                              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "var(--surface-2)"; }}
                              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}>
                              <td style={{ padding: "12px 14px", color: "var(--ink-3)", fontSize: 13 }}>{r.serial}</td>
                              <td style={{ padding: "12px 14px", maxWidth: 200 }}>
                                <div style={{ fontWeight: 700, fontSize: 13.5, color: "var(--ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.quizTitle}</div>
                                <div style={{ fontSize: 11, color: "var(--ink-3)" }}>{r.subject}</div>
                              </td>
                              <td style={{ padding: "12px 14px", color: "var(--ink-2)", fontSize: 13, textAlign: "center" }}>{r.totalQ}</td>
                              <td style={{ padding: "12px 14px", textAlign: "center" }}>
                                {(r.pendingEssays ?? 0) > 0 ? (
                                  <span title={`${r.pendingEssays} سؤال مقالي بانتظار تصحيح المعلم`} style={{
                                    padding: "4px 10px", borderRadius: 8, fontSize: 12, fontWeight: 800, whiteSpace: "nowrap",
                                    background: "var(--gold-soft)", color: "var(--gold-2)", fontFamily: "var(--font-head)"
                                  }}>
                                    ⏳ قيد التصحيح
                                  </span>
                                ) : (
                                  <span style={{
                                    padding: "4px 10px", borderRadius: 8, fontSize: 13, fontWeight: 800,
                                    background: r.pct >= 80 ? "var(--brand-soft)" : r.pct >= 50 ? "var(--gold-soft)" : "var(--danger-soft)",
                                    color: r.pct >= 80 ? "var(--brand)" : r.pct >= 50 ? "var(--gold-2)" : "var(--danger)",
                                    fontFamily: "var(--font-head)"
                                  }}>
                                    {r.pct}%
                                  </span>
                                )}
                              </td>
                              <td style={{ padding: "12px 14px", fontFamily: "var(--font-head)", fontWeight: 900, fontSize: 14, color: "var(--ink)", textAlign: "center" }}>
                                {(r.pendingEssays ?? 0) > 0 ? "—" : `${r.correct} من ${r.totalQ}`}
                              </td>
                              <td style={{ padding: "12px 14px", color: "var(--ink-2)", fontSize: 13, textAlign: "center" }}>{r.attempted}</td>
                              <td style={{ padding: "12px 14px", textAlign: "center" }}>
                                <span style={{ fontWeight: 800, fontSize: 14, color: "var(--brand)", fontFamily: "var(--font-head)" }}>{r.correct}</span>
                              </td>
                              <td style={{ padding: "12px 14px", textAlign: "center" }}>
                                {r.hasAnswers ? (
                                  <button onClick={() => setAnswerModal({ id: r.id, title: r.quizTitle })}
                                    className="cursor-pointer border-none rounded-[8px] text-white hover:opacity-80 transition-opacity"
                                    style={{ padding: "6px 14px", background: "var(--brand)", fontSize: 12.5, fontWeight: 700 }}>
                                    عرض الإجابات
                                  </button>
                                ) : <span style={{ fontSize: 12, color: "var(--ink-3)" }}>—</span>}
                              </td>
                              <td style={{ padding: "12px 14px", fontSize: 11.5, color: "var(--ink-3)", whiteSpace: "nowrap" }}>
                                {r.startedAt ? new Date(r.startedAt).toLocaleString("ar-EG", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "—"}
                              </td>
                              <td style={{ padding: "12px 14px", fontSize: 11.5, color: "var(--ink-3)", whiteSpace: "nowrap" }}>
                                {new Date(r.completedAt).toLocaleString("ar-EG", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {/* Pagination */}
                    <div className="flex flex-col sm:flex-row items-center justify-between gap-4" style={{ padding: "16px 20px", borderTop: "1px solid var(--border)" }}>
                      <div className="flex items-center gap-2">
                        {[
                          { label: "|◄", action: () => setResultPage(1), disabled: resultPage === 1 },
                          { label: "◄", action: () => setResultPage(p => Math.max(1, p - 1)), disabled: resultPage === 1 },
                          { label: "►", action: () => setResultPage(p => Math.min(totalPages, p + 1)), disabled: resultPage === totalPages },
                          { label: "►|", action: () => setResultPage(totalPages), disabled: resultPage === totalPages },
                        ].map(btn => (
                          <button key={btn.label} onClick={btn.action} disabled={btn.disabled}
                            className="cursor-pointer border-none rounded-[7px] transition-colors disabled:opacity-30"
                            style={{ width: 30, height: 30, background: "var(--surface-2)", border: "1px solid var(--border)", color: "var(--ink-2)", fontFamily: "monospace" }}>
                            {btn.label}
                          </button>
                        ))}
                      </div>
                      <div className="flex items-center gap-4 flex-wrap justify-center">
                        <span style={{ fontSize: 13, color: "var(--ink-3)" }}>
                          {(resultPage - 1) * PAGE_SIZE + 1}–{Math.min(resultPage * PAGE_SIZE, results.length)} من {results.length}
                        </span>
                        <span className="hidden sm:inline" style={{ fontSize: 13, color: "var(--ink-2)", fontWeight: 600 }}>صفوف الصفحة: {PAGE_SIZE}</span>
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* ════ WRONG QUESTIONS EXAM ════ */}
            {section === "wrong" && (
              <div className="space-y-4">
                {!wrongQuestions ? (
                  <div className="flex items-center justify-center py-16 gap-2 rounded-[20px]" style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--ink-3)" }}><div className="w-5 h-5 border-2 border-[var(--brand)] border-t-transparent rounded-full animate-spin" /></div>
                ) : wrongExamDone ? (
                  /* Results of the special exam */
                  <div className="rounded-[20px]" style={{ background: "var(--surface)", border: "1px solid var(--border)", padding: "28px 24px" }}>
                    <div className="text-center mb-6">
                      <div style={{ fontSize: 48, marginBottom: 8 }}>🏆</div>
                      <h2 style={{ fontFamily: "var(--font-head)", fontWeight: 900, fontSize: 24, color: "var(--ink)", margin: "0 0 8px" }}>نتيجة الامتحان الخاص</h2>
                      {(() => {
                        const correct = (wrongExam ?? []).filter(q => wrongExamAnswers[q.questionId] === q.correctAnswer).length;
                        const total = (wrongExam ?? []).length;
                        const pct = Math.round((correct / Math.max(total, 1)) * 100);
                        return <>
                          <div style={{ fontFamily: "var(--font-head)", fontWeight: 900, fontSize: 40, color: pct >= 70 ? "var(--brand)" : "var(--danger)" }}>{pct}%</div>
                          <p style={{ fontSize: 15, color: "var(--ink-2)" }}>{correct} إجابة صحيحة من {total}</p>
                        </>;
                      })()}
                    </div>
                    <button onClick={() => { setWrongExam(null); setWrongExamAnswers({}); setWrongExamDone(false); }}
                      className="w-full cursor-pointer border-none rounded-[12px] text-white hover:opacity-90 transition-opacity"
                      style={{ padding: "13px", background: "var(--brand)", fontWeight: 700, fontSize: 15 }}>
                      إعادة المحاولة
                    </button>
                  </div>
                ) : wrongExam ? (
                  /* Taking the exam */
                  <div className="rounded-[20px]" style={{ background: "var(--surface)", border: "1px solid var(--border)", overflow: "hidden" }}>
                    <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border)", background: "linear-gradient(120deg,var(--brand-soft),transparent)" }}>
                      <h2 style={{ fontFamily: "var(--font-head)", fontWeight: 800, fontSize: 18, color: "var(--ink)", margin: 0 }}>🎯 امتحانك الخاص ({wrongExam.length} سؤال)</h2>
                    </div>
                    <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 14 }}>
                      {wrongExam.map((q, i) => (
                        <div key={q.questionId} style={{ padding: "16px", borderRadius: 14, background: "var(--surface-2)", border: "1px solid var(--border)" }}>
                          <p style={{ fontWeight: 700, fontSize: 14.5, color: "var(--ink)", margin: "0 0 12px" }}>
                            <span style={{ color: "var(--ink-3)", marginLeft: 6 }}>س{i + 1}.</span> {q.question}
                          </p>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {(["A", "B", "C", "D"] as const).map(opt => {
                              const chosen = wrongExamAnswers[q.questionId] === opt;
                              return (
                                <button key={opt} onClick={() => setWrongExamAnswers(prev => ({ ...prev, [q.questionId]: opt }))}
                                  className="flex items-center gap-2 cursor-pointer rounded-[10px] text-right transition-all"
                                  style={{ padding: "12px 14px", minHeight: 48, border: `1px solid ${chosen ? "var(--brand)" : "var(--border)"}`, background: chosen ? "var(--brand-soft)" : "transparent", fontFamily: "var(--font-body)", fontSize: 14, color: chosen ? "var(--brand)" : "var(--ink-2)", fontWeight: chosen ? 700 : 400 }}>
                                  <span style={{ fontFamily: "var(--font-head)", fontWeight: 800, minWidth: 20 }}>{OPTION_LABELS[opt]}</span>
                                  {q[`option${opt}` as keyof WrongQuestion] as string}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                      <button
                        onClick={() => setWrongExamDone(true)}
                        disabled={Object.keys(wrongExamAnswers).length < wrongExam.length}
                        className="w-full cursor-pointer border-none rounded-[12px] text-white disabled:opacity-40 hover:opacity-90 transition-opacity"
                        style={{ padding: "14px", background: "var(--brand)", fontWeight: 800, fontSize: 16, fontFamily: "var(--font-head)" }}>
                        تسليم الامتحان ({Object.keys(wrongExamAnswers).length}/{wrongExam.length} أجبت)
                      </button>
                    </div>
                  </div>
                ) : (
                  /* Build the exam */
                  <div className="space-y-4">
                    <div className="rounded-[20px]" style={{ background: "var(--surface)", border: "1px solid var(--border)", padding: "22px 24px" }}>
                      <h2 style={{ fontFamily: "var(--font-head)", fontWeight: 900, fontSize: 22, color: "var(--ink)", margin: "0 0 8px" }}>
                        كوّن امتحان من أسئلة غلطت فيها قبل كدة
                      </h2>
                      <p style={{ fontSize: 14, color: "var(--ink-2)", margin: "0 0 18px" }}>
                        بنجمعلك كل الأسئلة اللي غلطت فيها وبتعملك امتحان خاص بيك عشان تتدرب عليها وتتعلم من أخطاء الماضي.
                      </p>
                      {wrongQuestions.total === 0 ? (
                        <div className="text-center py-6">
                          <div style={{ fontSize: 40, marginBottom: 8 }}>🎉</div>
                          <p style={{ fontSize: 15, color: "var(--ink-2)" }}>ما عندكش أسئلة غلطت فيها. استمر!</p>
                        </div>
                      ) : (
                        <>
                          <div className="flex items-center justify-between mb-4">
                            <span style={{ fontFamily: "var(--font-head)", fontWeight: 900, fontSize: 20, color: "var(--danger)" }}>
                              عندك {wrongQuestions.total} سؤال غلطت فيه
                            </span>
                          </div>
                          {/* Subject filter */}
                          <div className="flex flex-wrap gap-2 mb-5">
                            <button onClick={() => setWrongFilter("all")} className="cursor-pointer border-none rounded-full transition-colors"
                              style={{ padding: "6px 14px", fontSize: 13, fontWeight: 700, background: wrongFilter === "all" ? "var(--brand)" : "var(--surface-2)", color: wrongFilter === "all" ? "#fff" : "var(--ink-2)", border: "1px solid var(--border)" }}>
                              كل المواد ({wrongQuestions.total})
                            </button>
                            {Object.entries(wrongQuestions.bySubject).map(([subj, qs]) => (
                              <button key={subj} onClick={() => setWrongFilter(subj)} className="cursor-pointer border-none rounded-full transition-colors"
                                style={{ padding: "6px 14px", fontSize: 13, fontWeight: 700, background: wrongFilter === subj ? "var(--brand)" : "var(--surface-2)", color: wrongFilter === subj ? "#fff" : "var(--ink-2)", border: "1px solid var(--border)" }}>
                                {subj} ({qs.length})
                              </button>
                            ))}
                          </div>
                          <div style={{ padding: "14px 16px", borderRadius: 12, background: "var(--surface-2)", border: "1px solid var(--border)", marginBottom: 16 }}>
                            <p style={{ fontSize: 14, color: "var(--ink-2)", margin: 0 }}>
                              <strong style={{ color: "var(--ink)" }}>تعليمات:</strong>{" "}
                              اقرأ التعليمات عشان تفهم الهدف. الهدف إنك تستفيد من غلطاتك السابقة. بناءً على غلطاتك اللي انت اخترتها، هنعملك امتحان خاص تتعلم منه.
                            </p>
                          </div>
                          <button
                            onClick={() => { setWrongExam(filteredWrong); setWrongExamAnswers({}); setWrongExamDone(false); }}
                            disabled={filteredWrong.length === 0}
                            className="w-full cursor-pointer border-none rounded-[12px] text-white disabled:opacity-40 hover:opacity-90 transition-opacity"
                            style={{ padding: "14px", background: "linear-gradient(135deg,var(--brand),var(--brand-strong))", fontWeight: 800, fontSize: 16, fontFamily: "var(--font-head)", boxShadow: "0 6px 18px -6px var(--brand-shadow)" }}>
                            امتحان خاص بيك 🎯 ({filteredWrong.length} سؤال)
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ════ WALLET ════ */}
            {section === "wallet" && (
              <div className="space-y-4">
                <div className="rounded-[20px]" style={{ background: "var(--surface)", border: "1px solid var(--border)", padding: "22px 24px" }}>
                  <h2 style={{ fontFamily: "var(--font-head)", fontWeight: 800, fontSize: 20, color: "var(--ink)", margin: "0 0 16px" }}>💰 رصيدي</h2>
                  <div className="text-center py-6 rounded-[16px] mb-5" style={{ background: "linear-gradient(135deg,var(--brand),var(--brand-strong))" }}>
                    <div style={{ fontFamily: "var(--font-head)", fontWeight: 900, fontSize: 48, color: "#fff" }}>{balance ?? "—"}</div>
                    <div style={{ fontSize: 16, color: "rgba(255,255,255,.8)", marginTop: 4 }}>جنيه مصري</div>
                  </div>
                  {/* Top-up options selector */}
                  <div className="mb-6">
                    <label style={{ display: "block", fontSize: 14, fontWeight: 700, color: "var(--ink)", marginBottom: 10 }}>اختر طريقة شحن الرصيد:</label>
                    <div className="flex gap-2 p-1 rounded-xl" style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}>
                      <button onClick={() => { setTopupTab("wallet"); setSelectedWalletMethod("vf_cash"); }}
                        className="flex-1 py-2.5 px-2 rounded-lg text-xs sm:text-sm font-bold border-none cursor-pointer transition-colors"
                        style={{ background: topupTab === "wallet" ? "var(--brand)" : "transparent", color: topupTab === "wallet" ? "#fff" : "var(--ink-2)" }}>
                        📱 محفظة إلكترونية
                      </button>
                      <button onClick={() => { setTopupTab("fawry"); setSelectedWalletMethod("fawry"); }}
                        className="flex-1 py-2.5 px-2 rounded-lg text-xs sm:text-sm font-bold border-none cursor-pointer transition-colors"
                        style={{ background: topupTab === "fawry" ? "#FFCC00" : "transparent", color: topupTab === "fawry" ? "#000" : "var(--ink-2)" }}>
                        🏪 فوري
                      </button>
                      <button onClick={() => setTopupTab("whatsapp")}
                        className="flex-1 py-2.5 px-2 rounded-lg text-xs sm:text-sm font-bold border-none cursor-pointer transition-colors"
                        style={{ background: topupTab === "whatsapp" ? "#25D366" : "transparent", color: topupTab === "whatsapp" ? "#fff" : "var(--ink-2)" }}>
                        💬 طُرق أخرى (واتسآب)
                      </button>
                      <button onClick={() => setTopupTab("code")}
                        className="flex-1 py-2.5 px-2 rounded-lg text-xs sm:text-sm font-bold border-none cursor-pointer transition-colors"
                        style={{ background: topupTab === "code" ? "var(--gold-2)" : "transparent", color: topupTab === "code" ? "#fff" : "var(--ink-2)" }}>
                        🔑 كود شحن
                      </button>
                    </div>
                  </div>

                  {/* TAB 1 & 2: Mobile Wallets / Fawry */}
                  {(topupTab === "wallet" || topupTab === "fawry") && (
                    <div className="p-4 rounded-2xl space-y-4" style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}>
                      {topupTab === "wallet" && (
                        <div>
                          <label className="block text-xs font-bold mb-2" style={{ color: "var(--ink-2)" }}>اختر طريقة الدفع والمحفظة:</label>
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                            {[
                              { id: "vf_cash", label: "فودافون كاش", color: "#E60000" },
                            ].map(m => (
                              <button key={m.id} type="button" onClick={() => setSelectedWalletMethod(m.id as any)}
                                className="py-2.5 px-2 rounded-xl text-xs font-bold border cursor-pointer transition-all text-center flex items-center justify-center gap-1"
                                style={{
                                  borderColor: selectedWalletMethod === m.id ? m.color : "var(--border)",
                                  background: selectedWalletMethod === m.id ? `${m.color}15` : "var(--surface)",
                                  color: selectedWalletMethod === m.id ? m.color : "var(--ink-2)",
                                }}>
                                {m.label}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      {(() => {
                        const isWallet = selectedWalletMethod === "vf_cash" || selectedWalletMethod === "et_cash";
                        const isFawry = selectedWalletMethod === "fawry";
                        const feeRate = isFawry ? 0.025 : 0.02;
                        const baseAmt = Number(walletAmount) || 0;
                        const totalAmt = Math.round((baseAmt * (1 + feeRate)) * 100) / 100;

                        return (
                          <>
                            {baseAmt > 0 && (
                              <div className="p-3 rounded-xl text-xs space-y-1" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
                                <div className="flex justify-between" style={{ color: "var(--ink-2)" }}>
                                  <span>رصيد الشحن المضاف لحسابك:</span>
                                  <span className="font-bold">{baseAmt} جنيه</span>
                                </div>
                                <div className="flex justify-between" style={{ color: "var(--ink-3)" }}>
                                  <span>رسوم الخصم والخدمة ({(feeRate * 100).toFixed(1)}%):</span>
                                  <span className="font-bold">{Math.round(baseAmt * feeRate * 100) / 100} جنيه</span>
                                </div>
                                <div className="flex justify-between pt-1 border-t border-[var(--border)]" style={{ color: "var(--brand)" }}>
                                  <span className="font-black">إجمالي الخصم/المطلوب:</span>
                                  <span className="font-black text-sm">{totalAmt} جنيه</span>
                                </div>
                              </div>
                            )}

                            {isFawry && (
                              <div className="p-3 rounded-xl text-xs text-amber-600 dark:text-amber-300 bg-amber-500/10 border border-amber-500/20 text-center leading-relaxed font-bold">
                                🏪 خيار فوري كشك: سيتم تحويلك للبوابة لإصدار الفاتورة وكود الشحن المرجعي لتدفعه كاش في أي كشك فوري.
                              </div>
                            )}

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                              {isWallet && (
                                <div>
                                  <label className="block text-xs font-bold mb-1" style={{ color: "var(--ink-2)" }}>رقم المحفظة (11 رقماً):</label>
                                  <input type="tel" value={walletPhone} onChange={e => setWalletPhone(e.target.value)}
                                    placeholder="01xxxxxxxxx" dir="ltr"
                                    className="w-full p-2.5 rounded-xl text-center font-mono text-sm border focus:outline-none"
                                    style={{ border: "1px solid var(--border)", background: "var(--surface)", color: "var(--ink)" }} />
                                </div>
                              )}
                              <div className={isWallet ? "" : "sm:col-span-2"}>
                                <label className="block text-xs font-bold mb-1" style={{ color: "var(--ink-2)" }}>مبلغ الشحن (جنيه مصري):</label>
                                <input type="number" value={walletAmount} onChange={e => setWalletAmount(e.target.value)}
                                  placeholder="100" min="5" max="10000" dir="ltr"
                                  className="w-full p-2.5 rounded-xl text-center font-mono text-sm border focus:outline-none"
                                  style={{ border: "1px solid var(--border)", background: "var(--surface)", color: "var(--ink)" }} />
                              </div>
                            </div>

                            <button onClick={async () => {
                              if (isWallet && !walletPhone.trim()) { setWalletMsg("❌ رقم المحفظة مطلوب"); return; }
                              const amt = Number(walletAmount);
                              if (!amt || amt < 5) { setWalletMsg("❌ المبلغ يجب أن يكون 5 جنيه على الأقل"); return; }
                              setWalletLoading(true); setWalletMsg("");
                              try {
                                const res = await fetch("/api/payments/sha7nawy/create", {
                                  method: "POST", credentials: "include",
                                  headers: { "Content-Type": "application/json" },
                                  body: JSON.stringify({ number: isWallet ? walletPhone.trim() : "", amount: amt, method: selectedWalletMethod }),
                                });
                                const d = await res.json().catch(() => ({}));
                                setWalletLoading(false);
                                if (res.ok && d.success) {
                                  const targetUrl = d.checkoutUrl || d.data?.payment_page_url || d.data?.url || (d.provider === "shakeout" && d.reference ? `https://dash.shake-out.com/invoice/${d.reference}` : null);
                                  if (targetUrl) {
                                    window.location.href = targetUrl;
                                    return;
                                  }
                                  setWalletModal({
                                    reference: d.reference || "SH-PENDING",
                                    instructions: d.instructions || "اطلب *9*1# لخصم من فودافون كاش أو وافق على طلب الدفع من تطبيق e& Money",
                                    methodLabel: d.methodLabel || "المحفظة الإلكترونية",
                                    amount: amt,
                                  });
                                } else {
                                  setWalletMsg(`❌ ${d.error || "تعذر إرسال طلب الشحن"}`);
                                }
                              } catch {
                                setWalletLoading(false);
                                setWalletMsg("❌ حدث خطأ أثناء الاتصال ببوابة الدفع");
                              }
                            }} disabled={walletLoading}
                              className="w-full py-3 rounded-xl text-white font-bold text-sm cursor-pointer border-none transition-all disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90 shadow-md"
                              style={{ background: "linear-gradient(135deg, var(--brand), var(--brand-strong))" }}>
                              {walletLoading
                                ? "جارٍ تجهيز طلب الشحن..."
                                : isWallet
                                ? `خصم ${totalAmt} جنيه من المحفظة 📱`
                                : isFawry
                                ? `إصدار كود شحن فوري كاش بقيمة ${totalAmt} جنيه 🏪`
                                : `الانتقال للبوابة البنكية للشحن (${totalAmt} جنيه) 💳`}
                            </button>
                          </>
                        );
                      })()}

                      {walletMsg && <p className="text-xs font-semibold text-center" style={{ color: walletMsg.startsWith("❌") ? "var(--danger)" : "var(--brand)" }}>{walletMsg}</p>}
                    </div>
                  )}

                  {/* TAB 2: WhatsApp Assistance */}
                  {topupTab === "whatsapp" && (
                    <div className="p-4 rounded-2xl space-y-3 text-center" style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}>
                      <p className="text-xs sm:text-sm font-medium" style={{ color: "var(--ink-2)" }}>
                        تواصل معنا مباشرة عبر واتسآب لشحن رصيدك عبر InstaPay، التحويلات البنكية، أو الكاش:
                      </p>
                      <a href={`https://wa.me/${(process.env.NEXT_PUBLIC_PAYMENT_ACCESS_PASSWORD || "+201118802621").replace(/\D/g, "")}?text=${encodeURIComponent(`مرحباً، أريد شحن رصيد بقيمة ${walletAmount || 100} جنيه لحساب الطالب: ${user?.name || "طالب"} (رقم: ${user?.phone || "غير مسجل"}). ما هي طُرق الدفع المتاحة؟`)}`}
                        target="_blank" rel="noopener noreferrer"
                        className="inline-flex items-center justify-center gap-2 w-full py-3 rounded-xl text-white font-bold text-sm no-underline hover:opacity-90 transition-opacity"
                        style={{ background: "#25D366" }}>
                        💬 تواصل عبر واتسآب لشحن الرصيد
                      </a>
                    </div>
                  )}

                  {/* TAB 3: Code Redemption */}
                  {topupTab === "code" && (
                    <div>
                      <label style={{ display: "block", fontSize: 13.5, fontWeight: 600, color: "var(--ink-2)", marginBottom: 8 }}>شحن كود رصيد</label>
                      <div className="flex gap-3">
                        <input type="text" value={redeemCode} onChange={e => { setRedeemCode(e.target.value.toUpperCase()); setRedeemMsg(""); }}
                          placeholder="أدخل كود الشحن" dir="ltr"
                          className="flex-1 rounded-[10px] text-center font-mono tracking-widest focus:outline-none"
                          style={{ padding: "12px", border: "1px solid var(--border)", background: "var(--surface-2)", color: "var(--ink)", fontSize: 15 }} />
                        <button onClick={redeemBalance} disabled={redeeming || !redeemCode.trim()}
                          className="shrink-0 cursor-pointer border-none rounded-[10px] text-white disabled:opacity-40 hover:opacity-90 transition-opacity"
                          style={{ padding: "12px 20px", background: "var(--brand)", fontWeight: 700, fontSize: 14 }}>
                          {redeeming ? "..." : "تفعيل"}
                        </button>
                      </div>
                      {redeemMsg && <p style={{ fontSize: 13.5, marginTop: 10, color: redeemMsg.startsWith("✅") ? "var(--brand)" : "var(--danger)" }}>{redeemMsg}</p>}
                    </div>
                  )}
                </div>

                {/* Sha7nawy Instruction Modal */}
                {walletModal && (
                  <div className="fixed inset-0 z-[var(--z-modal)] flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,.6)" }} onClick={() => setWalletModal(null)}>
                    <div className="w-full max-w-md rounded-2xl p-6 text-center space-y-4 shadow-2xl" style={{ background: "var(--surface)", border: "1px solid var(--border)" }} onClick={e => e.stopPropagation()}>
                      <div className="text-4xl">📲</div>
                      <h3 className="text-lg font-bold" style={{ color: "var(--ink)" }}>تم إرسال طلب الشحن بنجاح!</h3>
                      <p className="text-xs text-gray-500 font-mono">رقم المرجع: {walletModal.reference}</p>
                      
                      <div className="p-4 rounded-xl space-y-2 text-right text-sm" style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}>
                        <p className="font-bold text-center" style={{ color: "var(--brand)" }}>تعليمات إتمام عملية الشحن:</p>
                        <p className="text-xs leading-relaxed" style={{ color: "var(--ink-2)" }}>{walletModal.instructions}</p>
                      </div>

                      <div className="pt-2 space-y-2">
                        <button onClick={async () => {
                          setWalletLoading(true);
                          try {
                            const res = await fetch("/api/payments/sha7nawy/confirm", {
                              method: "POST", credentials: "include",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ ref_code: walletModal.reference }),
                            });
                            const d = await res.json().catch(() => ({}));
                            setWalletLoading(false);
                            if (res.ok && d.success) {
                              setWalletModal(null);
                              // Refresh balance
                              fetch("/api/student/balance", { credentials: "include" })
                                .then(r => r.ok ? r.json() : null)
                                .then(d => { if (d) { setBalance(d.balance ?? 0); setBalanceTx(d.transactions ?? []); } });
                            } else {
                              setWalletMsg(`⚠️ ${d.error || "العملية معلقة بانتظار تأكيدك من الهاتف"}`);
                            }
                          } catch {
                            setWalletLoading(false);
                            setWalletMsg("❌ تعذر الاستعلام من الخادم");
                          }
                        }} disabled={walletLoading}
                          className="w-full py-3 rounded-xl text-white font-bold text-sm cursor-pointer border-none transition-all hover:opacity-90 shadow-md"
                          style={{ background: "linear-gradient(135deg, var(--brand), var(--brand-strong))" }}>
                          {walletLoading ? "جارٍ التحقق والتأكيد..." : "تأكيد واستعلام حالة الدفع 🔄"}
                        </button>

                        <button onClick={() => {
                          setWalletModal(null);
                          fetch("/api/student/balance", { credentials: "include" })
                            .then(r => r.ok ? r.json() : null)
                            .then(d => { if (d) { setBalance(d.balance ?? 0); setBalanceTx(d.transactions ?? []); } });
                        }}
                          className="w-full py-2.5 rounded-xl text-xs font-bold border cursor-pointer transition-colors"
                          style={{ background: "var(--surface-2)", border: "1px solid var(--border)", color: "var(--ink-2)" }}>
                          إغلاق النافذة
                        </button>
                      </div>
                    </div>
                  </div>
                )}
                {balanceTx.length > 0 && (() => {
                  const unpaidList = balanceTx.filter(t => t.isPending || t.status === "UNPAID" || t.type.toLowerCase().includes("pending"));
                  const paidList = balanceTx.filter(t => !t.isPending && t.status !== "UNPAID" && !t.type.toLowerCase().includes("pending"));
                  const filteredList = txTab === "unpaid" ? unpaidList : txTab === "paid" ? paidList : balanceTx;

                  const checkTxStatus = async (tx: BalanceTx) => {
                    if (!tx.reference) return;
                    setCheckingTxId(tx.id);
                    try {
                      const isSha7nawy = tx.type.toLowerCase().includes("sha7nawy") || (tx.note && tx.note.includes("sha7nawy_ref"));
                      const endpoint = isSha7nawy
                        ? `/api/payments/sha7nawy/status?transactionId=${encodeURIComponent(tx.reference)}`
                        : `/api/payments/shakeout/status?transactionId=${encodeURIComponent(tx.reference)}`;

                      const res = await fetch(endpoint);
                      const data = await res.json();
                      if (data.paid || data.status === "paid" || data.status === "completed" || data.status === "success") {
                        alert(data.message || "🎉 تم تأكيد الدفع وتفعيل طلبك بنجاح!");
                        const balRes = await fetch("/api/student/balance", { credentials: "include" });
                        if (balRes.ok) {
                          const balData = await balRes.json();
                          setBalance(balData.balance ?? 0);
                          setBalanceTx(balData.transactions ?? []);
                        }
                      } else {
                        alert(`ℹ️ الفاتورة ما زالت بانتظار السداد (الحالة: ${data.status || "معلقة"})`);
                      }
                    } catch (err) {
                      alert("تعذر جلب حالة الفاتورة حالياً، يرجى المحاولة لاحقاً.");
                    } finally {
                      setCheckingTxId(null);
                    }
                  };

                  return (
                    <div className="rounded-[20px] overflow-hidden" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
                      <div className="p-4 border-b flex flex-wrap items-center justify-between gap-3" style={{ borderColor: "var(--border)" }}>
                        <h3 style={{ fontFamily: "var(--font-head)", fontWeight: 800, fontSize: 16, color: "var(--ink)", margin: 0 }}>
                          📜 سجل المعاملات والفواتير
                        </h3>
                        <div className="flex items-center gap-1.5 p-1 rounded-xl" style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}>
                          <button
                            onClick={() => setTxTab("unpaid")}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${txTab === "unpaid" ? "bg-amber-500/20 text-amber-300 border border-amber-500/30" : "text-slate-400 hover:text-white"}`}
                          >
                            ⏳ الفواتير المعلقة ({unpaidList.length})
                          </button>
                          <button
                            onClick={() => setTxTab("paid")}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${txTab === "paid" ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30" : "text-slate-400 hover:text-white"}`}
                          >
                            🟢 المدفوعة ({paidList.length})
                          </button>
                          <button
                            onClick={() => setTxTab("all")}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${txTab === "all" ? "bg-indigo-500/20 text-indigo-300 border border-indigo-500/30" : "text-slate-400 hover:text-white"}`}
                          >
                            📋 الكل ({balanceTx.length})
                          </button>
                        </div>
                      </div>

                      <div className="divide-y divide-[var(--border)]">
                        {filteredList.length === 0 ? (
                          <div className="py-8 text-center text-xs text-slate-400">
                            {txTab === "unpaid" ? "لا توجد فواتير معلقة بانتظار السداد ✨" : txTab === "paid" ? "لا توجد معاملات مدفوعة حتى الآن" : "لا توجد معاملات مسجلة"}
                          </div>
                        ) : (
                          filteredList.map(tx => {
                            const isPending = tx.isPending || tx.status === "UNPAID" || tx.type.toLowerCase().includes("pending");
                            const cleanNote = (tx.note || "").replace(/\|url:https?:\/\/[^\s|]+/, "").trim();

                            return (
                              <div key={tx.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-800/30 transition-colors">
                                <div className="space-y-1 text-right">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    {isPending ? (
                                      <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                                        ⏳ فاتورة معلقة (بانتظار السداد)
                                      </span>
                                    ) : (
                                      <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                                        ✓ معاملة مكتملة / مدفوعة
                                      </span>
                                    )}
                                    <span style={{ fontSize: 11.5, color: "var(--ink-3)" }}>
                                      {new Date(tx.createdAt).toLocaleString("ar-EG", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                                    </span>
                                  </div>
                                  {cleanNote && <div style={{ fontSize: 13, color: "var(--ink-2)", fontWeight: 600 }}>{cleanNote}</div>}
                                </div>

                                <div className="flex items-center gap-3 justify-between sm:justify-end">
                                  <span style={{
                                    fontFamily: "var(--font-head)",
                                    fontWeight: 900,
                                    fontSize: 16,
                                    color: isPending ? "#f59e0b" : tx.amount > 0 ? "var(--brand)" : "var(--danger)"
                                  }}>
                                    {isPending ? "" : tx.amount > 0 ? "+" : ""}{tx.amount} جنيه
                                  </span>

                                  {isPending && (() => {
                                    const payUrl = tx.paymentUrl || (tx.reference ? `https://dash.shake-out.com/invoice/${tx.reference}` : null);

                                    return (
                                      <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
                                        {payUrl && (
                                          <a
                                            href={payUrl}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="px-3.5 py-1.5 rounded-xl text-xs font-extrabold bg-gradient-to-r from-emerald-500 to-teal-600 text-white shadow-md hover:brightness-110 transition-all flex items-center gap-1.5 no-underline shrink-0"
                                          >
                                            💳 الانتقال لإتمام الدفع
                                          </a>
                                        )}

                                        {tx.reference && (
                                          <button
                                            onClick={() => checkTxStatus(tx)}
                                            disabled={checkingTxId === tx.id}
                                            className="px-3 py-1.5 rounded-xl text-xs font-bold bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 hover:bg-indigo-500/20 transition-all flex items-center gap-1 cursor-pointer shrink-0"
                                            title="التحقق من حالة السداد من الخادم"
                                          >
                                            {checkingTxId === tx.id ? "⏳ جارٍ التحقق..." : "🔄 التحقق من السداد"}
                                          </button>
                                        )}
                                      </div>
                                    );
                                  })()}
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}

            {/* ════ ACHIEVEMENTS ════ */}
            {section === "achievements" && (
              !stats ? <div className="flex items-center justify-center py-12 gap-2 rounded-[20px]" style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--ink-3)" }}><div className="w-5 h-5 border-2 border-[var(--brand)] border-t-transparent rounded-full animate-spin" /></div>
                : (
                  <div className="rounded-[20px]" style={{ background: "var(--surface)", border: "1px solid var(--border)", boxShadow: "var(--shadow-sm)", padding: "22px" }}>
                    <div className="flex items-center justify-between mb-5">
                      <span style={{ padding: "5px 12px", borderRadius: 20, background: "var(--brand-soft)", color: "var(--brand)", fontWeight: 700, fontSize: 13 }}>{stats.achievementsUnlocked} / {stats.achievements.length} مفتوح</span>
                      <h2 style={{ fontFamily: "var(--font-head)", fontWeight: 800, fontSize: 18, color: "var(--ink)", margin: 0 }}>🏆 الإنجازات</h2>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 12 }}>
                      {stats.achievements.map(a => (
                        <div key={a.id} className="text-center rounded-2xl" style={{ padding: "18px 10px", border: a.unlocked ? "1px solid rgba(20,184,166,0.3)" : "1px solid var(--border)", background: a.unlocked ? "linear-gradient(135deg, rgba(20,184,166,0.12), rgba(16,185,129,0.06))" : "var(--surface-2)", opacity: a.unlocked ? 1 : 0.5, boxShadow: a.unlocked ? "0 4px 16px -4px rgba(16,185,129,0.2)" : "none" }}>
                          <div style={{ fontSize: 32, marginBottom: 6 }}>{ACH_ICON[a.icon] ?? "🏅"}</div>
                          <div style={{ fontWeight: 700, fontSize: 13, color: "var(--ink)", marginBottom: 3 }}>{a.title}</div>
                          <div style={{ fontSize: 11.5, color: "var(--ink-3)" }}>{a.description}</div>
                          {a.unlocked && <div style={{ marginTop: 6, fontSize: 11.5, color: "var(--brand)", fontWeight: 700 }}>✓ مفتوح</div>}
                        </div>
                      ))}
                    </div>
                  </div>
                )
            )}

            {/* ════ IQ DASHBOARD ════ */}
            {section === "iq" && <IQDashboard />}

            {/* ════ SECURITY ════ */}
            {section === "security" && (
              <div className="rounded-[20px]" style={{ background: "var(--surface)", border: "1px solid var(--border)", boxShadow: "var(--shadow-sm)", overflow: "hidden" }}>
                <div style={{ padding: "16px 22px", borderBottom: "1px solid var(--border)" }}>
                  <h2 style={{ fontFamily: "var(--font-head)", fontWeight: 800, fontSize: 18, color: "var(--ink)", margin: 0 }}>🔒 الأمان والأجهزة</h2>
                </div>
                {!devices ? <div className="flex items-center justify-center py-12 gap-2" style={{ color: "var(--ink-3)" }}><div className="w-5 h-5 border-2 border-[var(--brand)] border-t-transparent rounded-full animate-spin" /></div>
                  : (
                    <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
                      {devices.length === 0 && <div className="py-8 text-center" style={{ color: "var(--ink-3)" }}>لا توجد أجهزة مسجّلة.</div>}
                      {devices.map(d => {
                        const ua = d.userAgent ?? ""; const icon = /mobile|android|iphone/i.test(ua) ? "📱" : "🖥️";
                        const browser = ua.match(/(Chrome|Firefox|Safari|Edge)\/[\d.]+/)?.[0]?.split("/")[0] ?? "متصفح";
                        return (
                          <div key={d.id} className="flex items-center gap-3" style={{ padding: "14px 16px", borderRadius: 12, background: "var(--surface-2)", border: "1px solid var(--border)" }}>
                            <span style={{ fontSize: 26 }}>{icon}</span>
                            <div className="flex-1">
                              <div style={{ fontWeight: 700, fontSize: 14, color: "var(--ink)" }}>{d.label || browser}</div>
                              {d.ipAddress && <div style={{ fontSize: 11.5, color: "var(--ink-3)", direction: "ltr", textAlign: "right" }}>IP: {d.ipAddress}</div>}
                              <div style={{ fontSize: 11.5, color: "var(--ink-3)" }}>آخر نشاط: {new Date(d.lastSeenAt).toLocaleDateString("ar-EG", { year: "numeric", month: "short", day: "numeric" })}</div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
              </div>
            )}
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
