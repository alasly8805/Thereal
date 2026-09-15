"use client";

import { useCallback, useEffect, useState } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

type Student = {
  id: string;
  name: string;
  phone: string | null;
  email: string;
  isActive: boolean;
  balance: number;
  educationalStage: string | null;
  lastLoginAt: string | null;
  createdAt: string;
};

type StudentFull = Student & {
  parentPhone: string | null;
  accountMode: string;
  failedLoginAttempts: number;
  lockedUntil: string | null;
  isVerified: boolean;
};

type VideoRow = {
  id: string;
  title: string;
  folderName: string;
  courseTitle: string;
  baseWatches: number;
  grantedViews: number;
  allowance: number;
  used: number;
  remaining: number;
  exhausted: boolean;
};

type HomeworkRow = {
  id: string;
  title: string;
  dueAt: string | null;
  videoId: string | null;
  submitted: boolean;
  overdue: boolean;
};

type OverrideRow = {
  id: string;
  contentType: string;
  sourceId: string;
  reason: string | null;
  grantedByName: string;
  expiresAt: string | null;
  createdAt: string;
};

type CourseRow = {
  courseId: string;
  title: string;
  teacherName: string;
  source: string;
  since: string;
  supportGranted: boolean;
};

type DeviceRow = {
  id: string;
  label: string | null;
  userAgent: string | null;
  lastSeenAt: string;
};

type WalletRow = {
  id: string;
  type: string;
  amount: number;
  note: string | null;
  createdAt: string;
};

type ActivityRow = {
  id: string;
  adminName: string;
  action: string;
  targetName: string;
  createdAt: string;
};

type PurchaseRow = {
  id: string;
  kind: "video" | "folder";
  title: string;
  context: string;
  price: number;
  createdAt: string;
};

type GradeRow = {
  id: string;
  kind: "quiz" | "homework";
  title: string;
  status: string;
  score: number | null;
  totalQ: number | null;
  at: string | null;
};

type Dossier = {
  student: StudentFull;
  videos: VideoRow[];
  homework: HomeworkRow[];
  overrides: OverrideRow[];
  courses: CourseRow[];
  devices: DeviceRow[];
  wallet: WalletRow[];
  activity: ActivityRow[];
  purchases: PurchaseRow[];
  grades: GradeRow[];
};

type SearchResult = {
  id: string;
  title: string;
  subtitle: string;
  type: string;
  baseWatches?: number;
};

type DiscountRow = {
  id: string;
  code: string;
  discountValue: number;
  isActive: boolean;
  expiresAt: string | null;
  maxTotalUses: number | null;
  maxUsesPerStudent: number;
  usedCount: number;
  createdAt: string;
};

type Tab = "students" | "discounts" | "settings";

// ─── Panel theme ──────────────────────────────────────────────────────────────
// The panel is an ops console, not a marketing page — it gets its own fixed
// dark "mission control" palette instead of inheriting the site's theme vars.

const C = {
  bg: "#0A0E1A",
  surface: "rgba(148, 163, 200, 0.055)",
  surface2: "rgba(148, 163, 200, 0.09)",
  border: "rgba(148, 163, 200, 0.16)",
  borderSoft: "rgba(148, 163, 200, 0.10)",
  ink: "#E8EEF9",
  ink2: "#9AA8C2",
  ink3: "#64748F",
  brand: "#2DD4BF",
  brand2: "#22D3EE",
  brandGrad: "linear-gradient(135deg, #2DD4BF 0%, #22D3EE 100%)",
  brandSoft: "rgba(45, 212, 191, 0.12)",
  violet: "#A78BFA",
  violetSoft: "rgba(167, 139, 250, 0.12)",
  amber: "#FBBF24",
  amberSoft: "rgba(251, 191, 36, 0.12)",
  rose: "#FB7185",
  roseSoft: "rgba(251, 113, 133, 0.12)",
  emerald: "#34D399",
  emeraldSoft: "rgba(52, 211, 153, 0.12)",
  sky: "#38BDF8",
  skySoft: "rgba(56, 189, 248, 0.12)",
} as const;

const card =
  "sup-card-hover rounded-2xl border p-5 backdrop-blur-sm";
const cardStyle = {
  background: C.surface,
  borderColor: C.borderSoft,
  boxShadow: "0 8px 32px rgba(2, 6, 18, 0.35)",
} as const;

const input =
  "w-full rounded-xl border px-3.5 py-2.5 text-sm outline-none transition-shadow focus:ring-2 focus:ring-[#2DD4BF]/40";
const inputStyle = {
  background: "rgba(10, 14, 26, 0.55)",
  borderColor: C.border,
  color: C.ink,
} as const;

const btn =
  "rounded-xl px-4 py-2.5 text-sm font-bold transition-all hover:-translate-y-px hover:brightness-110 active:translate-y-0 disabled:opacity-50 disabled:hover:translate-y-0";
const btnPrimary = { background: C.brandGrad, color: "#05201C", boxShadow: "0 4px 18px rgba(45,212,191,.28)" } as const;
const btnGhost = { borderColor: C.border, color: C.ink, background: "rgba(148,163,200,.07)" } as const;
const btnDanger = { background: "linear-gradient(135deg,#FB7185,#F43F5E)", color: "#2A060D", boxShadow: "0 4px 18px rgba(244,63,94,.25)" } as const;

function fmtDate(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("ar-EG", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function fmtDateTime(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString("ar-EG", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ─── Small building blocks ────────────────────────────────────────────────────

function SectionHead({
  icon,
  tint,
  title,
  hint,
}: {
  icon: string;
  tint: string;
  title: string;
  hint?: string;
}) {
  return (
    <div className="mb-4 flex items-start gap-3">
      <div
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-lg"
        style={{ background: tint }}
      >
        {icon}
      </div>
      <div>
        <h3 className="text-sm font-black" style={{ color: C.ink }}>
          {title}
        </h3>
        {hint && (
          <p className="mt-0.5 text-xs leading-relaxed" style={{ color: C.ink2 }}>
            {hint}
          </p>
        )}
      </div>
    </div>
  );
}

function Pill({ label, color, soft }: { label: string; color: string; soft: string }) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold"
      style={{ background: soft, color }}
    >
      {label}
    </span>
  );
}

function StatChip({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div
      className="rounded-xl border px-3.5 py-2.5 text-center"
      style={{ background: "rgba(10,14,26,.45)", borderColor: C.borderSoft, minWidth: 92 }}
    >
      <div className="text-base font-black" style={{ color: accent || C.ink }}>
        {value}
      </div>
      <div className="mt-0.5 text-[10px] font-semibold" style={{ color: C.ink3 }}>
        {label}
      </div>
    </div>
  );
}

// ─── Root ─────────────────────────────────────────────────────────────────────

export default function SupportPanelClient({
  notice,
  error: initialError,
}: {
  notice?: string;
  error?: string;
}) {
  const [tab, setTab] = useState<Tab>("students");
  const [toast, setToast] = useState<{ kind: "ok" | "err"; text: string } | null>(
    initialError ? { kind: "err", text: initialError } : null
  );

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 5000);
    return () => window.clearTimeout(t);
  }, [toast]);

  const say = useCallback((kind: "ok" | "err", text: string) => setToast({ kind, text }), []);

  return (
    <main
      dir="rtl"
      className="relative min-h-screen px-4 py-6"
      style={{ background: C.bg, color: C.ink }}
    >
      <style>{`
        @keyframes supFadeUp { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes supPulse { 0%,100% { opacity: 1; } 50% { opacity: .35; } }
        @keyframes supAurora { 0%,100% { transform: translate(0,0) scale(1); } 33% { transform: translate(46px,-32px) scale(1.14); } 66% { transform: translate(-34px,26px) scale(.94); } }
        @keyframes supShimmer { to { background-position: 200% center; } }
        @keyframes supBorderFlow { 0%,100% { opacity: .55; } 50% { opacity: 1; } }
        .sup-anim { animation: supFadeUp .35s ease both; }
        .sup-anim-1 { animation-delay: .04s; } .sup-anim-2 { animation-delay: .08s; }
        .sup-anim-3 { animation-delay: .12s; } .sup-anim-4 { animation-delay: .16s; }
        .sup-anim-5 { animation-delay: .20s; } .sup-anim-6 { animation-delay: .24s; }
        .sup-anim-7 { animation-delay: .28s; } .sup-anim-8 { animation-delay: .32s; }
        .sup-aurora-1 { animation: supAurora 19s ease-in-out infinite; }
        .sup-aurora-2 { animation: supAurora 24s ease-in-out infinite reverse; }
        .sup-aurora-3 { animation: supAurora 28s ease-in-out infinite 4s; }
        .sup-grad-text { background-size: 200% auto !important; animation: supShimmer 7s linear infinite; }
        .sup-card-hover { transition: transform .22s ease, box-shadow .22s ease, border-color .22s ease; }
        .sup-card-hover:hover { transform: translateY(-2px); border-color: rgba(45,212,191,.32); box-shadow: 0 16px 48px rgba(2,6,18,.55), 0 0 0 1px rgba(45,212,191,.10), 0 0 36px rgba(45,212,191,.06); }
        .sup-header-line { animation: supBorderFlow 3.2s ease-in-out infinite; }
        .sup-select option { background: #10152A; color: ${C.ink}; }
        .sup-scroll::-webkit-scrollbar { width: 8px; height: 8px; }
        .sup-scroll::-webkit-scrollbar-thumb { background: rgba(148,163,200,.22); border-radius: 8px; }
        .sup-scroll::-webkit-scrollbar-track { background: transparent; }
      `}</style>

      {/* Ambient glows — slow aurora drift so the console feels alive */}
      <div aria-hidden className="pointer-events-none fixed inset-0 overflow-hidden">
        <div
          className="sup-aurora-1 absolute -top-40 right-[-10%] h-[480px] w-[480px] rounded-full"
          style={{ background: "radial-gradient(circle, rgba(45,212,191,.16) 0%, transparent 65%)" }}
        />
        <div
          className="sup-aurora-2 absolute bottom-[-15%] left-[-8%] h-[520px] w-[520px] rounded-full"
          style={{ background: "radial-gradient(circle, rgba(167,139,250,.13) 0%, transparent 65%)" }}
        />
        <div
          className="sup-aurora-3 absolute top-[35%] left-[38%] h-[380px] w-[380px] rounded-full"
          style={{ background: "radial-gradient(circle, rgba(56,189,248,.08) 0%, transparent 65%)" }}
        />
        <div
          className="absolute inset-0"
          style={{
            backgroundImage:
              "linear-gradient(rgba(148,163,200,.045) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,200,.045) 1px, transparent 1px)",
            backgroundSize: "44px 44px",
            maskImage: "radial-gradient(ellipse 90% 60% at 50% 0%, black 30%, transparent 75%)",
            WebkitMaskImage: "radial-gradient(ellipse 90% 60% at 50% 0%, black 30%, transparent 75%)",
          }}
        />
      </div>

      <div className="relative mx-auto max-w-5xl">
        <header
          className="sticky top-3 z-40 mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border px-4 py-3 backdrop-blur-xl"
          style={{ background: "rgba(10, 14, 26, 0.78)", borderColor: C.borderSoft, boxShadow: "0 10px 40px rgba(2,6,18,.5)" }}
        >
          {/* Flowing gradient line along the header's bottom edge */}
          <div
            aria-hidden
            className="sup-header-line absolute inset-x-4 bottom-0 h-px"
            style={{ background: "linear-gradient(90deg, transparent, rgba(45,212,191,.7), rgba(167,139,250,.7), transparent)" }}
          />
          <div className="flex items-center gap-3">
            <div
              className="flex h-11 w-11 items-center justify-center rounded-2xl text-xl"
              style={{ background: C.brandGrad, boxShadow: "0 4px 20px rgba(45,212,191,.4), 0 0 32px rgba(34,211,238,.25)" }}
            >
              🛟
            </div>
            <div>
              <h1
                className="sup-grad-text text-lg font-black"
                style={{
                  background: "linear-gradient(90deg, #2DD4BF, #22D3EE, #A78BFA, #2DD4BF)",
                  WebkitBackgroundClip: "text",
                  backgroundClip: "text",
                  color: "transparent",
                }}
              >
                لوحة الدعم الفني
              </h1>
              <p className="flex items-center gap-1.5 text-xs" style={{ color: C.ink2 }}>
                <span
                  className="inline-block h-1.5 w-1.5 rounded-full"
                  style={{ background: C.emerald, animation: "supPulse 2.2s infinite" }}
                />
                كل إجراء هنا يُسجَّل في سجل النشاط
              </p>
            </div>
          </div>
          <form action="/thefake/support/logout" method="POST">
            <button type="submit" className={`${btn} border`} style={btnGhost}>
              خروج
            </button>
          </form>
        </header>

        {notice === "readonly" && (
          <div
            className="mb-4 rounded-xl border px-4 py-3 text-sm font-semibold"
            style={{ borderColor: "rgba(251,191,36,.35)", background: C.amberSoft, color: C.amber }}
          >
            جلسة الدخول لحساب الطالب للاطّلاع فقط — لا يمكن تنفيذ أي تعديل من داخل حسابه.
          </div>
        )}

        <nav className="mb-5 flex flex-wrap gap-2">
          {(
            [
              ["students", "الطلاب", "🎓"],
              ["discounts", "أكواد الخصم", "🏷️"],
              ["settings", "الاختبارات والواجبات", "⚙️"],
            ] as const
          ).map(([id, label, icon]) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={`${btn} flex items-center gap-2 border`}
              style={
                tab === id
                  ? {
                      ...btnPrimary,
                      border: "1px solid transparent",
                      boxShadow: "0 6px 24px rgba(45,212,191,.4), 0 0 0 1px rgba(45,212,191,.25), 0 0 28px rgba(34,211,238,.18)",
                    }
                  : { ...btnGhost, color: C.ink2 }
              }
            >
              <span>{icon}</span>
              {label}
            </button>
          ))}
        </nav>

        {tab === "students" && <StudentsTab say={say} />}
        {tab === "discounts" && <DiscountsTab say={say} />}
        {tab === "settings" && <SettingsTab say={say} />}
      </div>

      {toast && (
        <div
          className="fixed bottom-5 left-1/2 z-50 -translate-x-1/2 rounded-xl border px-5 py-3 text-sm font-bold shadow-2xl backdrop-blur-xl"
          style={{
            background: "rgba(10,14,26,.92)",
            borderColor: toast.kind === "ok" ? "rgba(52,211,153,.45)" : "rgba(251,113,133,.45)",
            color: toast.kind === "ok" ? C.emerald : C.rose,
            boxShadow: toast.kind === "ok"
              ? "0 10px 40px rgba(52,211,153,.18)"
              : "0 10px 40px rgba(251,113,133,.18)",
          }}
        >
          {toast.kind === "ok" ? "✓ " : "✕ "}
          {toast.text}
        </div>
      )}
    </main>
  );
}

// ─── Students ─────────────────────────────────────────────────────────────────

function StudentsTab({ say }: { say: (k: "ok" | "err", t: string) => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Student[]>([]);
  const [searching, setSearching] = useState(false);
  const [dossier, setDossier] = useState<Dossier | null>(null);
  const [loadingDossier, setLoadingDossier] = useState(false);

  const search = async () => {
    if (query.trim().length < 2) return say("err", "اكتب حرفين على الأقل");
    setSearching(true);
    try {
      const res = await fetch(`/api/support/students?q=${encodeURIComponent(query.trim())}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setResults(data.students ?? []);
      if ((data.students ?? []).length === 0) say("err", "لا يوجد طالب بهذا الاسم أو الرقم");
    } catch (e) {
      say("err", e instanceof Error ? e.message : "فشل البحث");
    } finally {
      setSearching(false);
    }
  };

  const loadDossier = useCallback(
    async (studentId: string) => {
      setLoadingDossier(true);
      try {
        const res = await fetch(`/api/support/students/${studentId}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        setDossier(data);
      } catch (e) {
        say("err", e instanceof Error ? e.message : "تعذر تحميل بيانات الطالب");
      } finally {
        setLoadingDossier(false);
      }
    },
    [say]
  );

  return (
    <div className="space-y-5">
      <section className={`${card} sup-anim`} style={cardStyle}>
        <SectionHead
          icon="🔎"
          tint={C.skySoft}
          title="ابحث عن الطالب"
          hint="بالاسم أو رقم الهاتف أو البريد — نتيجة البحث تفتح ملف الطالب الكامل"
        />
        <div className="flex flex-wrap gap-2">
          <input
            className={`${input} min-w-[200px] flex-1`}
            style={inputStyle}
            placeholder="الاسم أو رقم الهاتف أو البريد"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && search()}
          />
          <button
            type="button"
            onClick={search}
            disabled={searching}
            className={btn}
            style={btnPrimary}
          >
            {searching ? "..." : "بحث"}
          </button>
        </div>

        {results.length > 0 && (
          <ul className="mt-4 space-y-2">
            {results.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => loadDossier(s.id)}
                  className="flex w-full items-center justify-between rounded-xl border px-4 py-3 text-right transition-all hover:-translate-y-px hover:border-[#2DD4BF]/50"
                  style={{ borderColor: C.borderSoft, background: "rgba(10,14,26,.4)" }}
                >
                  <span>
                    <span className="block text-sm font-bold" style={{ color: C.ink }}>
                      {s.name}
                    </span>
                    <span className="block text-xs" style={{ color: C.ink2 }} dir="ltr">
                      {s.phone || s.email}
                    </span>
                  </span>
                  {!s.isActive && <Pill label="موقوف" color={C.rose} soft={C.roseSoft} />}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {loadingDossier && (
        <p className="text-center text-sm" style={{ color: C.ink2 }}>
          جارٍ التحميل...
        </p>
      )}

      {dossier && !loadingDossier && (
        <StudentDetail dossier={dossier} say={say} reload={() => loadDossier(dossier.student.id)} />
      )}
    </div>
  );
}

function StudentDetail({
  dossier,
  say,
  reload,
}: {
  dossier: Dossier;
  say: (k: "ok" | "err", t: string) => void;
  reload: () => void;
}) {
  const s = dossier.student;
  const locked = s.lockedUntil ? new Date(s.lockedUntil) > new Date() : false;

  return (
    <div className="space-y-5">
      {/* ── Hero ── */}
      <section
        className={`${card} sup-anim sup-anim-1 relative overflow-hidden`}
        style={cardStyle}
      >
        {/* Gradient strip across the top — the "you are looking at a live
            account" signal, distinct from every other card. */}
        <div
          aria-hidden
          className="absolute inset-x-0 top-0 h-[3px]"
          style={{ background: "linear-gradient(90deg, #2DD4BF, #22D3EE, #A78BFA)" }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -left-20 -top-20 h-56 w-56 rounded-full"
          style={{ background: "radial-gradient(circle, rgba(45,212,191,.12) 0%, transparent 70%)" }}
        />
        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-[220px]">
            <div className="flex flex-wrap items-center gap-2">
              <div
                className="flex h-11 w-11 items-center justify-center rounded-2xl text-lg font-black"
                style={{
                  background: "linear-gradient(135deg, rgba(45,212,191,.25), rgba(167,139,250,.25))",
                  border: "1px solid rgba(45,212,191,.35)",
                  color: C.brand,
                  boxShadow: "0 0 24px rgba(45,212,191,.18)",
                }}
              >
                {s.name.trim().charAt(0)}
              </div>
              <h2 className="text-xl font-black" style={{ color: C.ink }}>
                {s.name}
              </h2>
              {s.isActive ? (
                <Pill label="نشط" color={C.emerald} soft={C.emeraldSoft} />
              ) : (
                <Pill label="موقوف" color={C.rose} soft={C.roseSoft} />
              )}
              {locked && <Pill label="محظور دخول مؤقتاً" color={C.amber} soft={C.amberSoft} />}
              {s.isVerified && <Pill label="موثّق" color={C.sky} soft={C.skySoft} />}
            </div>
            <p className="mt-1.5 text-xs" style={{ color: C.ink2 }} dir="ltr">
              {s.phone} · {s.email}
            </p>
            {s.parentPhone && (
              <p className="mt-0.5 text-xs" style={{ color: C.ink2 }} dir="ltr">
                ولي الأمر: {s.parentPhone}
              </p>
            )}
            <p className="mt-1 text-xs" style={{ color: C.ink3 }}>
              {s.educationalStage || "—"} · آخر دخول {fmtDate(s.lastLoginAt)} · مسجل منذ{" "}
              {fmtDate(s.createdAt)}
            </p>
          </div>

          {/* Native form POST: the redirect must be a top-level navigation for
              the student cookie to apply to the browsing session. */}
          <form action="/thefake/support/enter-student" method="POST">
            <input type="hidden" name="studentId" value={s.id} />
            <button
              type="submit"
              className={btn}
              style={{
                background: "linear-gradient(135deg,#A78BFA,#8B5CF6)",
                color: "#1A0B2E",
                boxShadow: "0 4px 18px rgba(139,92,246,.3)",
              }}
              title="دخول للاطّلاع فقط — الطالب لن يرى أي أثر، ولن تُخصم منه مشاهدة"
            >
              👁 الدخول لحساب الطالب
            </button>
          </form>
        </div>

        <div className="relative mt-4 flex flex-wrap gap-2">
          <StatChip label="الرصيد" value={`${s.balance} ج`} accent={C.brand} />
          <StatChip label="الكورسات" value={String(dossier.courses.length)} accent={C.violet} />
          <StatChip label="الأجهزة" value={String(dossier.devices.length)} accent={C.sky} />
          <StatChip
            label="دروس شاهدها"
            value={String(dossier.videos.filter((v) => v.used > 0).length)}
          />
          <StatChip
            label="مشاهدات نفدت"
            value={String(dossier.videos.filter((v) => v.exhausted).length)}
            accent={dossier.videos.some((v) => v.exhausted) ? C.rose : undefined}
          />
        </div>

        <p
          className="relative mt-4 rounded-xl px-3 py-2 text-xs"
          style={{ background: "rgba(10,14,26,.5)", color: C.ink2 }}
        >
          الدخول للحساب <strong style={{ color: C.ink }}>للاطّلاع فقط</strong>: لا يمكن التعديل من
          داخله، ولا تُخصم مشاهدة من الطالب، ولا يظهر له أي إشعار.
        </p>
      </section>

      <AccountSection dossier={dossier} say={say} reload={reload} />
      <ProfileEditSection student={s} say={say} reload={reload} />
      <CoursesSection dossier={dossier} say={say} reload={reload} />
      <WalletSection dossier={dossier} say={say} reload={reload} />
      <PurchasesSection purchases={dossier.purchases} />
      <GradesSection grades={dossier.grades} />
      <ExtraViewsSection student={s} videos={dossier.videos} say={say} reload={reload} />
      <GrantAccessSection student={s} say={say} reload={reload} />
      <UnlockSection dossier={dossier} say={say} reload={reload} />
      <BypassSection dossier={dossier} say={say} reload={reload} />
      <NotifySection student={s} say={say} />
      <PasswordSection student={s} say={say} />
      <ActivitySection activity={dossier.activity} />
    </div>
  );
}

// ─── Account: lockout, devices, suspend ───────────────────────────────────────

function AccountSection({
  dossier,
  say,
  reload,
}: {
  dossier: Dossier;
  say: (k: "ok" | "err", t: string) => void;
  reload: () => void;
}) {
  const s = dossier.student;
  const [busy, setBusy] = useState<string | null>(null);
  const locked = s.lockedUntil ? new Date(s.lockedUntil) > new Date() : false;

  const call = async (url: string, body: Record<string, unknown>, fallback: string) => {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      say("ok", data.message ?? fallback);
      reload();
      return true;
    } catch (e) {
      say("err", e instanceof Error ? e.message : fallback);
      return false;
    }
  };

  const run = async (key: string, url: string, body: Record<string, unknown>, fallback: string, confirmText?: string) => {
    if (confirmText && !window.confirm(confirmText)) return;
    setBusy(key);
    await call(url, body, fallback);
    setBusy(null);
  };

  return (
    <section className={`${card} sup-anim sup-anim-2`} style={cardStyle}>
      <SectionHead
        icon="🔐"
        tint={C.skySoft}
        title="الحساب والأجهزة"
        hint="حل مشاكل «لا أستطيع الدخول»: فك الحظر، مسح الأجهزة المسجلة، إيقاف أو تفعيل الحساب"
      />

      <div className="flex flex-wrap gap-2">
        {locked && (
          <button
            type="button"
            disabled={busy !== null}
            onClick={() =>
              run("unlock", `/api/support/students/${s.id}/status`, { action: "unlock-login" }, "تعذر فك الحظر")
            }
            className={btn}
            style={btnPrimary}
          >
            {busy === "unlock" ? "..." : "🔓 فك حظر تسجيل الدخول"}
          </button>
        )}
        <button
          type="button"
          disabled={busy !== null}
          onClick={() =>
            run(
              "devices",
              `/api/support/students/${s.id}/reset-devices`,
              {},
              "تعذر مسح الأجهزة",
              `مسح كل الأجهزة المسجلة لـ ${s.name}؟ سيُسجَّل خروجه من كل الأجهزة الحالية.`
            )
          }
          className={`${btn} border`}
          style={btnGhost}
          title="لشكاوى «غيّرت هاتفي ولا أستطيع الدخول»"
        >
          {busy === "devices" ? "..." : "📱 مسح الأجهزة المسجلة"}
        </button>
        {s.isActive ? (
          <button
            type="button"
            disabled={busy !== null}
            onClick={() =>
              run(
                "suspend",
                `/api/support/students/${s.id}/status`,
                { action: "suspend" },
                "تعذر إيقاف الحساب",
                `إيقاف حساب ${s.name}؟ لن يستطيع الدخول حتى إعادة التفعيل.`
              )
            }
            className={btn}
            style={btnDanger}
          >
            {busy === "suspend" ? "..." : "⛔ إيقاف الحساب"}
          </button>
        ) : (
          <button
            type="button"
            disabled={busy !== null}
            onClick={() =>
              run("reactivate", `/api/support/students/${s.id}/status`, { action: "reactivate" }, "تعذر التفعيل")
            }
            className={btn}
            style={{ background: "linear-gradient(135deg,#34D399,#10B981)", color: "#052013" }}
          >
            {busy === "reactivate" ? "..." : "✅ إعادة تفعيل الحساب"}
          </button>
        )}
      </div>

      {locked && (
        <p className="mt-3 rounded-xl px-3 py-2 text-xs" style={{ background: C.amberSoft, color: C.amber }}>
          الحساب محظور من تسجيل الدخول حتى {fmtDateTime(s.lockedUntil)} بعد {s.failedLoginAttempts}{" "}
          محاولات فاشلة.
        </p>
      )}

      <div className="mt-4 border-t pt-4" style={{ borderColor: C.borderSoft }}>
        <p className="mb-2 text-xs font-bold" style={{ color: C.ink }}>
          الأجهزة المسجلة ({dossier.devices.length})
        </p>
        {dossier.devices.length === 0 ? (
          <p className="text-xs" style={{ color: C.ink3 }}>
            لا توجد أجهزة مسجلة حالياً.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {dossier.devices.map((d) => (
              <li
                key={d.id}
                className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-xs"
                style={{ borderColor: C.borderSoft, background: "rgba(10,14,26,.4)" }}
              >
                <span style={{ color: C.ink }}>
                  {d.label || d.userAgent?.slice(0, 60) || "جهاز غير معروف"}
                </span>
                <span style={{ color: C.ink3 }}>آخر ظهور {fmtDateTime(d.lastSeenAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

// ─── Profile edit: fix registration mistakes ─────────────────────────────────

function ProfileEditSection({
  student,
  say,
  reload,
}: {
  student: StudentFull;
  say: (k: "ok" | "err", t: string) => void;
  reload: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    name: student.name,
    email: student.email,
    phone: student.phone ?? "",
    parentPhone: student.parentPhone ?? "",
    educationalStage: student.educationalStage ?? "",
    reason: "",
  });
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      const res = await fetch(`/api/support/students/${student.id}/profile`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          email: form.email,
          phone: form.phone,
          parentPhone: form.parentPhone,
          educationalStage: form.educationalStage,
          reason: form.reason || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      say("ok", data.message ?? "تم تحديث البيانات");
      if (!data.unchanged) reload();
      setOpen(false);
    } catch (e) {
      say("err", e instanceof Error ? e.message : "تعذر تحديث البيانات");
    } finally {
      setBusy(false);
    }
  };

  const field = (
    label: string,
    key: keyof typeof form,
    opts?: { dir?: "ltr"; placeholder?: string; hint?: string }
  ) => (
    <div>
      <label className="mb-1 block text-xs font-bold" style={{ color: C.ink }}>
        {label}
      </label>
      <input
        className={input}
        style={inputStyle}
        dir={opts?.dir}
        placeholder={opts?.placeholder}
        value={form[key]}
        onChange={(e) => setForm({ ...form, [key]: e.target.value })}
      />
      {opts?.hint && (
        <p className="mt-1 text-[11px]" style={{ color: C.ink3 }}>
          {opts.hint}
        </p>
      )}
    </div>
  );

  return (
    <section className={`${card} sup-anim sup-anim-2`} style={cardStyle}>
      <SectionHead
        icon="✏️"
        tint={C.violetSoft}
        title="تعديل بيانات الطالب"
        hint="تصحيح الاسم أو الهاتف أو البريد — لشكاوى «سجّلت برقم غلط ولا أستطيع الدخول»"
      />

      {!open ? (
        <button type="button" onClick={() => setOpen(true)} className={`${btn} border`} style={btnGhost}>
          ✏️ فتح نموذج التعديل
        </button>
      ) : (
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            {field("الاسم", "name")}
            {field("البريد الإلكتروني", "email", { dir: "ltr" })}
            {field("رقم الهاتف (به يدخل الطالب)", "phone", {
              dir: "ltr",
              placeholder: "01xxxxxxxxx",
              hint: "يُطبَّع تلقائياً بصيغة ‎+20‎ — لن يُحفظ لو كان مستخدماً لحساب آخر",
            })}
            {field("هاتف ولي الأمر", "parentPhone", { dir: "ltr", placeholder: "01xxxxxxxxx" })}
            {field("المرحلة الدراسية", "educationalStage", { placeholder: "sec_3" })}
            {field("سبب التعديل (يظهر في السجل)", "reason")}
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={busy} onClick={save} className={btn} style={btnPrimary}>
              {busy ? "..." : "💾 حفظ التعديلات"}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => setOpen(false)}
              className={`${btn} border`}
              style={btnGhost}
            >
              إلغاء
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

// ─── Courses: enrollments + full-course grant ─────────────────────────────────

function CoursesSection({
  dossier,
  say,
  reload,
}: {
  dossier: Dossier;
  say: (k: "ok" | "err", t: string) => void;
  reload: () => void;
}) {
  const s = dossier.student;
  const [pickerOpen, setPickerOpen] = useState(false);
  const [picked, setPicked] = useState<SearchResult | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const enroll = async () => {
    if (!picked) return;
    setBusy(true);
    try {
      const res = await fetch("/api/support/enroll-course", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studentId: s.id,
          courseId: picked.id,
          reason: reason || "تسجيل كورس من الدعم الفني",
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      say("ok", data.message ?? "تم تسجيل الكورس");
      setPicked(null);
      setReason("");
      setPickerOpen(false);
      reload();
    } catch (e) {
      say("err", e instanceof Error ? e.message : "تعذر تسجيل الكورس");
    } finally {
      setBusy(false);
    }
  };

  const unenroll = async (courseId: string, title: string) => {
    if (!window.confirm(`إلغاء تسجيل «${title}» الممنوح من الدعم؟`)) return;
    try {
      const res = await fetch(
        `/api/support/enroll-course?studentId=${encodeURIComponent(s.id)}&courseId=${encodeURIComponent(courseId)}`,
        { method: "DELETE" }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      say("ok", data.message ?? "تم الإلغاء");
      reload();
    } catch (e) {
      say("err", e instanceof Error ? e.message : "تعذر الإلغاء");
    }
  };

  const sourceLabel = (src: string) =>
    src === "SUPPORT" ? "من الدعم" : src === "PURCHASE" ? "شراء" : src === "ADMIN" ? "الإدارة" : src === "TESTER_BYPASS" ? "فحص" : "كود";

  return (
    <section className={`${card} sup-anim sup-anim-3`} style={cardStyle}>
      <SectionHead
        icon="📚"
        tint={C.violetSoft}
        title="الكورسات المسجَّل بها"
        hint="تسجيل الطالب في كورس كامل بضغطة واحدة — لشكاوى «دفعت ولم يظهر الكورس في حسابي»"
      />

      {dossier.courses.length === 0 ? (
        <p className="mb-3 text-sm" style={{ color: C.ink2 }}>
          الطالب غير مسجل في أي كورس.
        </p>
      ) : (
        <ul className="mb-4 space-y-2">
          {dossier.courses.map((c) => (
            <li
              key={c.courseId}
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border px-4 py-2.5"
              style={{ borderColor: C.borderSoft, background: "rgba(10,14,26,.4)" }}
            >
              <span>
                <span className="block text-sm font-bold" style={{ color: C.ink }}>
                  {c.title}
                </span>
                <span className="block text-xs" style={{ color: C.ink2 }}>
                  {c.teacherName || "—"} · منذ {fmtDate(c.since)}
                </span>
              </span>
              <span className="flex items-center gap-2">
                <Pill
                  label={sourceLabel(c.source)}
                  color={c.source === "SUPPORT" ? C.brand : c.source === "PURCHASE" ? C.emerald : C.ink2}
                  soft={c.source === "SUPPORT" ? C.brandSoft : c.source === "PURCHASE" ? C.emeraldSoft : C.surface2}
                />
                {c.supportGranted && (
                  <button
                    type="button"
                    onClick={() => unenroll(c.courseId, c.title)}
                    className={`${btn} border px-3 py-1.5 text-xs`}
                    style={{ borderColor: "rgba(251,113,133,.4)", color: C.rose }}
                  >
                    إلغاء
                  </button>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}

      {!pickerOpen ? (
        <button
          type="button"
          onClick={() => setPickerOpen(true)}
          className={btn}
          style={btnPrimary}
        >
          ➕ تسجيل كورس كامل للطالب
        </button>
      ) : (
        <div
          className="space-y-3 rounded-xl border p-4"
          style={{ borderColor: C.borderSoft, background: "rgba(10,14,26,.45)" }}
        >
          <ContentPicker type="COURSE" onPick={setPicked} say={say} />
          {picked && (
            <>
              <p className="text-sm font-bold" style={{ color: C.ink }}>
                {picked.title}
                {picked.subtitle && (
                  <span className="block text-xs font-normal" style={{ color: C.ink2 }}>
                    {picked.subtitle}
                  </span>
                )}
              </p>
              <input
                className={input}
                style={inputStyle}
                placeholder="سبب التسجيل (اختياري — يظهر في سجل النشاط)"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
              <div className="flex flex-wrap gap-2">
                <button type="button" disabled={busy} onClick={enroll} className={btn} style={btnPrimary}>
                  {busy ? "..." : `سجّل «${picked.title}» للطالب`}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPickerOpen(false);
                    setPicked(null);
                  }}
                  className={`${btn} border`}
                  style={btnGhost}
                >
                  إلغاء
                </button>
              </div>
            </>
          )}
          {!picked && (
            <button
              type="button"
              onClick={() => setPickerOpen(false)}
              className={`${btn} border text-xs`}
              style={btnGhost}
            >
              إغلاق
            </button>
          )}
        </div>
      )}
    </section>
  );
}

// ─── Wallet ───────────────────────────────────────────────────────────────────

function WalletSection({
  dossier,
  say,
  reload,
}: {
  dossier: Dossier;
  say: (k: "ok" | "err", t: string) => void;
  reload: () => void;
}) {
  const s = dossier.student;
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const adjust = async (sign: 1 | -1) => {
    const value = Number(amount);
    if (!value || value <= 0) return say("err", "اكتب مبلغاً صحيحاً أكبر من صفر");
    if (sign === -1 && !window.confirm(`خصم ${value} جنيه من رصيد ${s.name}؟`)) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/support/students/${s.id}/balance`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: sign * value, note: note || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      say("ok", data.message ?? "تم تعديل الرصيد");
      setAmount("");
      setNote("");
      reload();
    } catch (e) {
      say("err", e instanceof Error ? e.message : "تعذر تعديل الرصيد");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className={`${card} sup-anim sup-anim-4`} style={cardStyle}>
      <SectionHead
        icon="💰"
        tint={C.amberSoft}
        title={`المحفظة — الرصيد الحالي ${s.balance} ج`}
        hint="إضافة أو خصم رصيد لشكاوى الشحن والأكواد — كل حركة تظهر في سجل محفظة الطالب"
      />

      <div className="flex flex-wrap items-center gap-2">
        <input
          className={`${input} w-28 text-center`}
          style={inputStyle}
          type="number"
          min={1}
          dir="ltr"
          placeholder="المبلغ"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
        <input
          className={`${input} min-w-[180px] flex-1`}
          style={inputStyle}
          placeholder="ملاحظة (اختياري — تظهر في سجل المحفظة)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        <button type="button" disabled={busy} onClick={() => adjust(1)} className={btn} style={btnPrimary}>
          {busy ? "..." : "➕ إضافة"}
        </button>
        <button type="button" disabled={busy} onClick={() => adjust(-1)} className={btn} style={btnDanger}>
          {busy ? "..." : "➖ خصم"}
        </button>
      </div>

      {dossier.wallet.length > 0 && (
        <div className="mt-4 border-t pt-4" style={{ borderColor: C.borderSoft }}>
          <p className="mb-2 text-xs font-bold" style={{ color: C.ink }}>
            آخر حركات المحفظة
          </p>
          <ul className="space-y-1.5">
            {dossier.wallet.map((w) => (
              <li
                key={w.id}
                className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-xs"
                style={{ borderColor: C.borderSoft, background: "rgba(10,14,26,.4)" }}
              >
                <span style={{ color: C.ink2 }}>
                  <strong dir="ltr" style={{ color: w.amount >= 0 ? C.emerald : C.rose }}>
                    {w.amount >= 0 ? "+" : ""}
                    {w.amount} ج
                  </strong>{" "}
                  · {w.note || w.type}
                </span>
                <span style={{ color: C.ink3 }}>{fmtDateTime(w.createdAt)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

// ─── Purchases: what the student actually paid for ───────────────────────────

function PurchasesSection({ purchases }: { purchases: PurchaseRow[] }) {
  const total = purchases.reduce((sum, p) => sum + p.price, 0);
  return (
    <section className={`${card} sup-anim sup-anim-4`} style={cardStyle}>
      <SectionHead
        icon="🧾"
        tint={C.emeraldSoft}
        title={`المشتريات — ${purchases.length} عنصر بإجمالي ${total} ج`}
        hint="كل درس أو محاضرة اشتراها الطالب بمفرده — لشكاوى «دفعت ولم يصلني المحتوى»"
      />
      {purchases.length === 0 ? (
        <p className="text-sm" style={{ color: C.ink2 }}>
          لا توجد مشتريات فردية — المحتوى المملوك جاء عبر كورس أو كود أو منحة.
        </p>
      ) : (
        <ul className="space-y-2">
          {purchases.map((p) => (
            <li
              key={p.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border px-4 py-2.5"
              style={{ borderColor: C.borderSoft, background: "rgba(10,14,26,.4)" }}
            >
              <span>
                <span className="block text-sm font-bold" style={{ color: C.ink }}>
                  {p.title}
                </span>
                {p.context && (
                  <span className="block text-xs" style={{ color: C.ink2 }}>
                    {p.context}
                  </span>
                )}
              </span>
              <span className="flex items-center gap-2">
                <Pill
                  label={p.kind === "video" ? "درس" : "محاضرة"}
                  color={p.kind === "video" ? C.sky : C.violet}
                  soft={p.kind === "video" ? C.skySoft : C.violetSoft}
                />
                <span className="text-xs font-black" dir="ltr" style={{ color: p.price > 0 ? C.emerald : C.ink3 }}>
                  {p.price > 0 ? `${p.price} ج` : "مجاني/منحة"}
                </span>
                <span className="text-[11px]" style={{ color: C.ink3 }}>
                  {fmtDate(p.createdAt)}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ─── Grades: quiz + homework results ──────────────────────────────────────────

function GradesSection({ grades }: { grades: GradeRow[] }) {
  const statusLabel = (s: string) =>
    s === "passed" ? "ناجح" : s === "failed" ? "راسب" : s === "review_requested" ? "بانتظار المراجعة" : s === "completed" ? "مكتمل" : "قيد الانتظار";
  const statusColor = (s: string) =>
    s === "passed" || s === "completed"
      ? { color: C.emerald, soft: C.emeraldSoft }
      : s === "failed"
        ? { color: C.rose, soft: C.roseSoft }
        : { color: C.amber, soft: C.amberSoft };

  return (
    <section className={`${card} sup-anim sup-anim-4`} style={cardStyle}>
      <SectionHead
        icon="📊"
        tint={C.skySoft}
        title={`الدرجات — آخر ${grades.length} نتيجة`}
        hint="نتائج الاختبارات والواجبات كما يراها الطالب — للرد على «كم درجتي؟» دون سؤال المدرّس"
      />
      {grades.length === 0 ? (
        <p className="text-sm" style={{ color: C.ink2 }}>
          لم يُكمل هذا الطالب أي اختبار أو واجب بعد.
        </p>
      ) : (
        <ul className="space-y-2">
          {grades.map((g) => (
            <li
              key={g.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border px-4 py-2.5"
              style={{ borderColor: C.borderSoft, background: "rgba(10,14,26,.4)" }}
            >
              <span>
                <span className="block text-sm font-bold" style={{ color: C.ink }}>
                  {g.title}
                </span>
                <span className="block text-xs" style={{ color: C.ink2 }}>
                  {g.kind === "quiz" ? "اختبار" : "واجب"} · {fmtDateTime(g.at)}
                </span>
              </span>
              <span className="flex items-center gap-2">
                {g.score != null && (
                  <span className="text-xs font-black" dir="ltr" style={{ color: C.ink }}>
                    {g.score}%{g.totalQ ? ` · ${g.totalQ} سؤال` : ""}
                  </span>
                )}
                <Pill
                  label={statusLabel(g.status)}
                  color={statusColor(g.status).color}
                  soft={statusColor(g.status).soft}
                />
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ─── Extra views ──────────────────────────────────────────────────────────────

function ExtraViewsSection({
  student,
  videos,
  say,
  reload,
}: {
  student: Student;
  videos: VideoRow[];
  say: (k: "ok" | "err", t: string) => void;
  reload: () => void;
}) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [amounts, setAmounts] = useState<Record<string, number>>({});
  const [manual, setManual] = useState<SearchResult | null>(null);
  const [manualAmount, setManualAmount] = useState(3);

  const grant = async (videoId: string, extraViews: number) => {
    setBusyId(videoId);
    try {
      const res = await fetch("/api/support/views", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studentId: student.id,
          videoId,
          extraViews,
          reason: "منحة من الدعم الفني",
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      say("ok", `تم منح ${extraViews} مشاهدة — المتبقي الآن ${data.remaining}`);
      reload();
    } catch (e) {
      say("err", e instanceof Error ? e.message : "تعذر منح المشاهدات");
    } finally {
      setBusyId(null);
    }
  };

  const markWatched = async (videoId: string) => {
    setBusyId(`watched:${videoId}`);
    try {
      const res = await fetch("/api/support/mark-watched", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studentId: student.id,
          videoId,
          reason: "تسجيل مشاهدة يدوي من الدعم الفني",
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      say("ok", data.alreadyWatched ? "الدرس مسجَّل كمشاهَد بالفعل" : "تم تسجيل الدرس كمشاهَد — لم تُخصم أي مشاهدة");
      reload();
    } catch (e) {
      say("err", e instanceof Error ? e.message : "تعذر تسجيل المشاهدة");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section className={`${card} sup-anim sup-anim-5`} style={cardStyle}>
      <SectionHead
        icon="▶️"
        tint={C.brandSoft}
        title="المشاهدات"
        hint="منح مشاهدات إضافية أو تسجيل درس كمشاهَد دون خصم من رصيد الطالب — الدروس النافدة في الأعلى"
      />

      {videos.length === 0 && (
        <p className="text-sm" style={{ color: C.ink2 }}>
          لم يشاهد هذا الطالب أي درس بعد.
        </p>
      )}

      <ul className="space-y-2">
        {videos.map((v) => (
          <li
            key={v.id}
            className="rounded-xl border px-4 py-3"
            style={{
              borderColor: v.exhausted ? "rgba(251,113,133,.35)" : C.borderSoft,
              background: v.exhausted ? "rgba(251,113,133,.06)" : "rgba(10,14,26,.4)",
            }}
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-[180px] flex-1">
                <p className="text-sm font-bold" style={{ color: C.ink }}>
                  {v.title}
                </p>
                <p className="text-xs" style={{ color: C.ink2 }}>
                  {[v.courseTitle, v.folderName].filter(Boolean).join(" — ")}
                </p>
                <p className="mt-1 text-xs" style={{ color: C.ink2 }}>
                  استخدم {v.used} من {v.allowance}
                  {v.grantedViews > 0 && ` (منها ${v.grantedViews} ممنوحة)`} ·{" "}
                  {v.exhausted ? (
                    <strong style={{ color: C.rose }}>نفدت المشاهدات</strong>
                  ) : (
                    <>متبقٍ {v.remaining}</>
                  )}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={1}
                  max={50}
                  value={amounts[v.id] ?? 3}
                  onChange={(e) =>
                    setAmounts((a) => ({ ...a, [v.id]: Math.max(1, parseInt(e.target.value) || 1) }))
                  }
                  className={`${input} w-20 text-center`}
                  style={inputStyle}
                  dir="ltr"
                />
                <button
                  type="button"
                  disabled={busyId === v.id}
                  onClick={() => grant(v.id, amounts[v.id] ?? 3)}
                  className={btn}
                  style={btnPrimary}
                >
                  {busyId === v.id ? "..." : "منح"}
                </button>
                <button
                  type="button"
                  disabled={busyId === `watched:${v.id}`}
                  onClick={() => markWatched(v.id)}
                  className={`${btn} border`}
                  style={btnGhost}
                  title="يُسجَّل الدرس كمشاهَد دون خصم مشاهدة من رصيد الطالب"
                >
                  {busyId === `watched:${v.id}` ? "..." : "✓ سجّله كمشاهَد"}
                </button>
              </div>
            </div>
          </li>
        ))}
      </ul>

      <div className="mt-5 border-t pt-4" style={{ borderColor: C.borderSoft }}>
        <p className="mb-2 text-xs font-bold" style={{ color: C.ink }}>
          منح مشاهدات لدرس غير موجود في القائمة
        </p>
        <ContentPicker type="VIDEO" onPick={setManual} say={say} />
        {manual && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="text-sm font-bold" style={{ color: C.ink }}>
              {manual.title}
            </span>
            <input
              type="number"
              min={1}
              max={50}
              value={manualAmount}
              onChange={(e) => setManualAmount(Math.max(1, parseInt(e.target.value) || 1))}
              className={`${input} w-20 text-center`}
              style={inputStyle}
              dir="ltr"
            />
            <button
              type="button"
              onClick={() => grant(manual.id, manualAmount)}
              className={btn}
              style={btnPrimary}
            >
              منح
            </button>
            <button
              type="button"
              disabled={busyId === `watched:${manual.id}`}
              onClick={() => markWatched(manual.id)}
              className={`${btn} border`}
              style={btnGhost}
              title="يُسجَّل الدرس كمشاهَد دون خصم مشاهدة من رصيد الطالب"
            >
              {busyId === `watched:${manual.id}` ? "..." : "✓ سجّله كمشاهَد"}
            </button>
          </div>
        )}
      </div>
    </section>
  );
}

// ─── Grant full access to any lesson ──────────────────────────────────────────

function GrantAccessSection({
  student,
  say,
  reload,
}: {
  student: Student;
  say: (k: "ok" | "err", t: string) => void;
  reload: () => void;
}) {
  const [picked, setPicked] = useState<SearchResult | null>(null);
  const [views, setViews] = useState(3);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState<"grant" | "watched" | null>(null);

  const call = async (url: string, body: Record<string, unknown>, okText: string) => {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      say("ok", data.message ?? okText);
      reload();
      return true;
    } catch (e) {
      say("err", e instanceof Error ? e.message : "تعذر تنفيذ الإجراء");
      return false;
    }
  };

  const grantAccess = async () => {
    if (!picked) return;
    setBusy("grant");
    const ok = await call(
      "/api/support/grant-access",
      {
        studentId: student.id,
        videoId: picked.id,
        extraViews: views,
        reason: reason || "فتح درس من الدعم الفني",
      },
      "تم فتح الدرس كاملاً لهذا الطالب"
    );
    if (ok) {
      setPicked(null);
      setReason("");
    }
    setBusy(null);
  };

  const markWatched = async () => {
    if (!picked) return;
    setBusy("watched");
    const ok = await call(
      "/api/support/mark-watched",
      {
        studentId: student.id,
        videoId: picked.id,
        reason: reason || "تسجيل مشاهدة يدوي من الدعم الفني",
      },
      "تم تسجيل الدرس كمشاهَد — لم تُخصم أي مشاهدة"
    );
    if (ok) setPicked(null);
    setBusy(null);
  };

  return (
    <section className={`${card} sup-anim sup-anim-6`} style={cardStyle}>
      <SectionHead
        icon="🔓"
        tint={C.brandSoft}
        title="فتح أي درس للطالب (وصول كامل)"
        hint="يمنح الطالب الدرس ولو لم يشترِه: ملكية الدرس + تخطّي التسلسل + مشاهدات إضافية — كلها في زر واحد"
      />

      <ContentPicker type="VIDEO" onPick={setPicked} say={say} />

      {picked && (
        <div
          className="mt-3 space-y-3 rounded-xl border p-4"
          style={{ borderColor: C.borderSoft, background: "rgba(10,14,26,.45)" }}
        >
          <p className="text-sm font-bold" style={{ color: C.ink }}>
            {picked.title}
            {picked.subtitle && (
              <span className="block text-xs font-normal" style={{ color: C.ink2 }}>
                {picked.subtitle}
              </span>
            )}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-xs font-bold" style={{ color: C.ink }}>
              مشاهدات إضافية:
            </label>
            <input
              type="number"
              min={0}
              max={50}
              value={views}
              onChange={(e) => setViews(Math.max(0, parseInt(e.target.value) || 0))}
              className={`${input} w-20 text-center`}
              style={inputStyle}
              dir="ltr"
            />
            <input
              className={`${input} min-w-[180px] flex-1`}
              style={inputStyle}
              placeholder="سبب الفتح (اختياري — يظهر في سجل النشاط)"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy !== null}
              onClick={grantAccess}
              className={btn}
              style={btnPrimary}
            >
              {busy === "grant" ? "..." : "افتح الدرس كاملاً"}
            </button>
            <button
              type="button"
              disabled={busy !== null}
              onClick={markWatched}
              className={`${btn} border`}
              style={btnGhost}
              title="يُسجَّل الدرس كمشاهَد دون منح وصول أو خصم مشاهدة"
            >
              {busy === "watched" ? "..." : "✓ سجّله كمشاهَد فقط"}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

// ─── Unlock / skip the flow ───────────────────────────────────────────────────

function UnlockSection({
  dossier,
  say,
  reload,
}: {
  dossier: Dossier;
  say: (k: "ok" | "err", t: string) => void;
  reload: () => void;
}) {
  const [type, setType] = useState<"VIDEO" | "HOMEWORK" | "QUIZ">("VIDEO");
  const [picked, setPicked] = useState<SearchResult | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const unlock = async (contentType: string, sourceId: string) => {
    setBusy(true);
    try {
      const res = await fetch("/api/support/unlock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studentId: dossier.student.id,
          contentType,
          sourceId,
          reason: reason || "فتح من الدعم الفني",
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      say("ok", "تم فتح المحتوى لهذا الطالب");
      setPicked(null);
      setReason("");
      reload();
    } catch (e) {
      say("err", e instanceof Error ? e.message : "تعذر فتح المحتوى");
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (id: string) => {
    try {
      const res = await fetch(`/api/support/unlock?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      say("ok", "تم إلغاء الاستثناء");
      reload();
    } catch (e) {
      say("err", e instanceof Error ? e.message : "تعذر الإلغاء");
    }
  };

  const blocking = dossier.homework.filter((h) => !h.submitted);

  return (
    <section className={`${card} sup-anim sup-anim-7`} style={cardStyle}>
      <SectionHead
        icon="⏭️"
        tint={C.skySoft}
        title="تخطّي التسلسل (فتح درس رغم الواجب)"
        hint="يفتح عنصراً واحداً لهذا الطالب فقط دون تسجيل الواجب كمحلول — الدرجات تبقى صحيحة"
      />

      {blocking.length > 0 && (
        <div className="mb-4">
          <p className="mb-2 text-xs font-bold" style={{ color: C.ink }}>
            واجبات لم يسلّمها هذا الطالب (السبب الأشهر لتوقف الدروس)
          </p>
          <ul className="space-y-2">
            {blocking.slice(0, 8).map((h) => (
              <li
                key={h.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border px-4 py-2.5"
                style={{ borderColor: C.borderSoft, background: "rgba(10,14,26,.4)" }}
              >
                <span>
                  <span className="block text-sm font-bold" style={{ color: C.ink }}>
                    {h.title}
                  </span>
                  <span className="block text-xs" style={{ color: C.ink2 }}>
                    {h.overdue ? "انتهى موعده" : "مفتوح"} · آخر موعد {fmtDate(h.dueAt)}
                  </span>
                </span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => unlock("HOMEWORK", h.id)}
                    className={`${btn} border text-xs`}
                    style={btnGhost}
                  >
                    افتح الواجب نفسه
                  </button>
                  {h.videoId && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => unlock("VIDEO", h.videoId as string)}
                      className={`${btn} text-xs`}
                      style={btnPrimary}
                    >
                      افتح الدرس التالي
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="border-t pt-4" style={{ borderColor: C.borderSoft }}>
        <p className="mb-2 text-xs font-bold" style={{ color: C.ink }}>
          أو ابحث عن العنصر يدوياً
        </p>
        <div className="mb-2 flex gap-2">
          {(["VIDEO", "HOMEWORK", "QUIZ"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => {
                setType(t);
                setPicked(null);
              }}
              className={`${btn} border text-xs`}
              style={
                type === t
                  ? { ...btnPrimary, border: "1px solid transparent" }
                  : { ...btnGhost, color: C.ink2 }
              }
            >
              {t === "VIDEO" ? "درس" : t === "HOMEWORK" ? "واجب" : "اختبار"}
            </button>
          ))}
        </div>
        <ContentPicker type={type} onPick={setPicked} say={say} />
        {picked && (
          <div className="mt-3 space-y-2">
            <input
              className={input}
              style={inputStyle}
              placeholder="سبب الفتح (اختياري — يظهر في سجل النشاط)"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
            <button
              type="button"
              disabled={busy}
              onClick={() => unlock(type, picked.id)}
              className={btn}
              style={btnPrimary}
            >
              افتح «{picked.title}» لهذا الطالب
            </button>
          </div>
        )}
      </div>

      {dossier.overrides.length > 0 && (
        <div className="mt-5 border-t pt-4" style={{ borderColor: C.borderSoft }}>
          <p className="mb-2 text-xs font-bold" style={{ color: C.ink }}>
            الاستثناءات المفعّلة حالياً
          </p>
          <ul className="space-y-2">
            {dossier.overrides.map((o) => (
              <li
                key={o.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border px-4 py-2.5"
                style={{ borderColor: C.borderSoft, background: "rgba(10,14,26,.4)" }}
              >
                <span className="text-xs" style={{ color: C.ink2 }}>
                  <strong style={{ color: C.ink }}>{o.contentType}</strong> · {o.reason || "بدون سبب"} ·{" "}
                  {fmtDate(o.createdAt)}
                  {o.expiresAt && ` · ينتهي ${fmtDate(o.expiresAt)}`}
                </span>
                <button
                  type="button"
                  onClick={() => revoke(o.id)}
                  className={`${btn} border text-xs`}
                  style={{ borderColor: "rgba(251,113,133,.4)", color: C.rose }}
                >
                  إلغاء
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

// ─── Bypass quiz / homework ───────────────────────────────────────────────────

function BypassSection({
  dossier,
  say,
  reload,
}: {
  dossier: Dossier;
  say: (k: "ok" | "err", t: string) => void;
  reload: () => void;
}) {
  const [type, setType] = useState<"QUIZ" | "HOMEWORK">("QUIZ");
  const [picked, setPicked] = useState<SearchResult | null>(null);
  const [score, setScore] = useState(100);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const run = async () => {
    if (!picked) return;
    setBusy(true);
    try {
      const res = await fetch("/api/support/bypass", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studentId: dossier.student.id,
          contentType: type,
          sourceId: picked.id,
          scorePercent: score,
          reason: reason || "تخطّي من الدعم الفني",
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      say(
        "ok",
        data.score != null
          ? `تم تسجيل «${data.title}» كناجح بدرجة ${data.score}%`
          : `تم تسجيل «${data.title}» كناجح`
      );
      setPicked(null);
      setReason("");
      reload();
    } catch (e) {
      say("err", e instanceof Error ? e.message : "تعذر تنفيذ التخطّي");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className={`${card} sup-anim sup-anim-8`} style={cardStyle}>
      <SectionHead
        icon="🎯"
        tint={C.roseSoft}
        title="تخطّي اختبار أو واجب (تسجيله كناجح)"
        hint="يُنهي الالتزام نفسه بالدرجة التي تختارها فيتوقف عن حجب الدروس — درجة حقيقية أعلى لن تُخفض"
      />

      <div className="mb-2 flex gap-2">
        {(
          [
            ["QUIZ", "اختبار"],
            ["HOMEWORK", "واجب"],
          ] as const
        ).map(([t, label]) => (
          <button
            key={t}
            type="button"
            onClick={() => {
              setType(t);
              setPicked(null);
            }}
            className={`${btn} border text-xs`}
            style={
              type === t
                ? { ...btnPrimary, border: "1px solid transparent" }
                : { ...btnGhost, color: C.ink2 }
            }
          >
            {label}
          </button>
        ))}
      </div>

      <ContentPicker type={type} onPick={setPicked} say={say} />

      {picked && (
        <div
          className="mt-3 space-y-3 rounded-xl border p-4"
          style={{ borderColor: C.borderSoft, background: "rgba(10,14,26,.45)" }}
        >
          <p className="text-sm font-bold" style={{ color: C.ink }}>
            {picked.title}
            {picked.subtitle && (
              <span className="block text-xs font-normal" style={{ color: C.ink2 }}>
                {picked.subtitle}
              </span>
            )}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-xs font-bold" style={{ color: C.ink }}>
              الدرجة (%):
            </label>
            <input
              type="number"
              min={0}
              max={100}
              value={score}
              onChange={(e) =>
                setScore(Math.min(100, Math.max(0, parseInt(e.target.value) || 0)))
              }
              className={`${input} w-20 text-center`}
              style={inputStyle}
              dir="ltr"
            />
            <input
              className={`${input} min-w-[180px] flex-1`}
              style={inputStyle}
              placeholder="سبب التخطّي (اختياري — يظهر في سجل النشاط)"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={run}
            className={btn}
            style={btnDanger}
          >
            {busy ? "..." : `سجّل «${picked.title}» كناجح لهذا الطالب`}
          </button>
        </div>
      )}
    </section>
  );
}

// ─── Notify the student ───────────────────────────────────────────────────────

function NotifySection({
  student,
  say,
}: {
  student: Student;
  say: (k: "ok" | "err", t: string) => void;
}) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [link, setLink] = useState("");
  const [busy, setBusy] = useState(false);

  const send = async () => {
    if (!title.trim() || !body.trim()) return say("err", "اكتب العنوان ونص الرسالة");
    setBusy(true);
    try {
      const res = await fetch("/api/support/notify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studentId: student.id,
          title: title.trim(),
          body: body.trim(),
          link: link.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      say("ok", data.message ?? "تم إرسال الإشعار");
      setTitle("");
      setBody("");
      setLink("");
    } catch (e) {
      say("err", e instanceof Error ? e.message : "تعذر إرسال الإشعار");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className={`${card} sup-anim sup-anim-8`} style={cardStyle}>
      <SectionHead
        icon="🔔"
        tint={C.amberSoft}
        title="إرسال إشعار للطالب"
        hint="يظهر في جرس الإشعارات داخل حسابه — «تم حل مشكلتك، جرّب الآن» بعد أي إجراء"
      />
      <div className="space-y-2">
        <input
          className={input}
          style={inputStyle}
          placeholder="العنوان — مثال: تمت إضافة مشاهدات لدرسك"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={120}
        />
        <textarea
          className={`${input} min-h-[72px] resize-y`}
          style={inputStyle}
          placeholder="نص الرسالة للطالب..."
          value={body}
          onChange={(e) => setBody(e.target.value)}
          maxLength={1000}
        />
        <div className="flex flex-wrap gap-2">
          <input
            className={`${input} min-w-[180px] flex-1`}
            style={inputStyle}
            dir="ltr"
            placeholder="رابط داخلي (اختياري) — /library"
            value={link}
            onChange={(e) => setLink(e.target.value)}
          />
          <button type="button" disabled={busy} onClick={send} className={btn} style={btnPrimary}>
            {busy ? "..." : "🔔 إرسال"}
          </button>
        </div>
      </div>
    </section>
  );
}

// ─── Password ─────────────────────────────────────────────────────────────────

function PasswordSection({
  student,
  say,
}: {
  student: Student;
  say: (k: "ok" | "err", t: string) => void;
}) {
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/support/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ studentId: student.id, newPassword: pw }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      say("ok", data.message ?? "تم تغيير كلمة المرور");
      setPw("");
    } catch (e) {
      say("err", e instanceof Error ? e.message : "تعذر تغيير كلمة المرور");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className={`${card} sup-anim sup-anim-8`} style={cardStyle}>
      <SectionHead
        icon="🔑"
        tint={C.roseSoft}
        title="تغيير كلمة مرور الطالب"
        hint="سيتم تسجيل الخروج من كل الأجهزة التي كان مسجّلاً عليها"
      />
      <div className="flex flex-wrap gap-2">
        <input
          className={`${input} min-w-[200px] flex-1`}
          style={inputStyle}
          type="text"
          dir="ltr"
          placeholder="كلمة المرور الجديدة"
          value={pw}
          onChange={(e) => setPw(e.target.value)}
        />
        <button
          type="button"
          disabled={busy || pw.length < 4}
          onClick={submit}
          className={btn}
          style={btnDanger}
        >
          {busy ? "..." : "تغيير"}
        </button>
      </div>
    </section>
  );
}

// ─── Activity timeline ────────────────────────────────────────────────────────

const ACTION_LABELS: Record<string, string> = {
  SUPPORT_MARK_WATCHED: "تسجيل مشاهدة",
  SUPPORT_GRANT_VIDEO_ACCESS: "فتح درس",
  SUPPORT_REVOKE_VIDEO_ACCESS: "سحب فتح درس",
  SUPPORT_UNLOCK_CONTENT: "فتح محتوى",
  SUPPORT_RESET_STUDENT_PASSWORD: "تغيير كلمة المرور",
  SUPPORT_ENTER_STUDENT_ACCOUNT: "دخول للاطّلاع",
  SUPPORT_RESET_STUDENT_DEVICES: "مسح الأجهزة",
  SUPPORT_CREDIT_BALANCE: "إضافة رصيد",
  SUPPORT_DEBIT_BALANCE: "خصم رصيد",
  SUPPORT_SUSPEND_STUDENT: "إيقاف الحساب",
  SUPPORT_REACTIVATE_STUDENT: "تفعيل الحساب",
  SUPPORT_UNLOCK_LOGIN: "فك حظر الدخول",
  SUPPORT_ENROLL_COURSE: "تسجيل كورس",
  SUPPORT_UNENROLL_COURSE: "إلغاء تسجيل كورس",
  SUPPORT_EDIT_PROFILE: "تعديل بيانات الطالب",
  SUPPORT_SEND_NOTIFICATION: "إرسال إشعار",
  SUPPORT_EXIT_STUDENT_ACCOUNT: "خروج من حساب الطالب",
  SUPPORT_GRANT_EXTRA_VIEWS: "منح مشاهدات",
  SUPPORT_BYPASS_ASSESSMENT: "تخطّي اختبار/واجب",
  SUPPORT_REVOKE_CONTENT_UNLOCK: "إلغاء استثناء",
};

function ActivitySection({ activity }: { activity: ActivityRow[] }) {
  return (
    <section className={`${card} sup-anim sup-anim-8`} style={cardStyle}>
      <SectionHead
        icon="🕓"
        tint={C.surface2}
        title="آخر الإجراءات على هذا الحساب"
        hint="كل ما نُفِّذ على حساب الطالب من لوحة الدعم أو الإدارة — للمراجعة قبل أي إجراء جديد"
      />
      {activity.length === 0 ? (
        <p className="text-sm" style={{ color: C.ink2 }}>
          لا توجد إجراءات مسجلة على هذا الحساب بعد.
        </p>
      ) : (
        <ul className="relative space-y-0 pr-3">
          <div
            aria-hidden
            className="absolute bottom-2 right-[7px] top-2 w-px"
            style={{ background: C.border }}
          />
          {activity.map((a) => (
            <li key={a.id} className="relative flex items-start gap-3 py-2">
              <span
                className="mt-1.5 inline-block h-[9px] w-[9px] shrink-0 rounded-full"
                style={{
                  background: a.action.startsWith("SUPPORT_") ? C.brand : C.violet,
                  boxShadow: `0 0 8px ${a.action.startsWith("SUPPORT_") ? "rgba(45,212,191,.6)" : "rgba(167,139,250,.6)"}`,
                }}
              />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold" style={{ color: C.ink }}>
                  {ACTION_LABELS[a.action] ?? a.action}
                  <span className="mr-2 font-normal" style={{ color: C.ink3 }}>
                    {a.adminName}
                  </span>
                </p>
                <p className="truncate text-xs" style={{ color: C.ink2 }}>
                  {a.targetName}
                </p>
              </div>
              <span className="shrink-0 text-[11px]" style={{ color: C.ink3 }}>
                {fmtDateTime(a.createdAt)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ─── Content picker ───────────────────────────────────────────────────────────

function ContentPicker({
  type,
  onPick,
  say,
}: {
  type: string;
  onPick: (r: SearchResult) => void;
  say: (k: "ok" | "err", t: string) => void;
}) {
  const [mode, setMode] = useState<"search" | "browse">("search");
  const [q, setQ] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [busy, setBusy] = useState(false);

  const run = async () => {
    if (q.trim().length < 2) return;
    setBusy(true);
    try {
      const res = await fetch(
        `/api/support/content-search?q=${encodeURIComponent(q.trim())}&type=${type}`
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setResults(data.results ?? []);
      if ((data.results ?? []).length === 0) say("err", "لا توجد نتائج");
    } catch (e) {
      say("err", e instanceof Error ? e.message : "فشل البحث");
    } finally {
      setBusy(false);
    }
  };

  const placeholder =
    type === "COURSE"
      ? "اسم الكورس أو المدرّس"
      : "اسم الدرس / الواجب / الاختبار";

  return (
    <div>
      <div className="mb-2 flex gap-2">
        {(
          [
            ["search", "بحث بالاسم"],
            ["browse", "استعراض بالكورس"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setMode(id)}
            className={`${btn} border text-xs`}
            style={
              mode === id
                ? { background: "rgba(148,163,200,.18)", color: C.ink, borderColor: C.border }
                : { borderColor: C.borderSoft, color: C.ink3 }
            }
          >
            {label}
          </button>
        ))}
      </div>

      {mode === "browse" ? (
        <BrowsePicker type={type} onPick={onPick} say={say} />
      ) : (
        <>
          <div className="flex gap-2">
            <input
              className={`${input} flex-1`}
              style={inputStyle}
              placeholder={placeholder}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && run()}
            />
            <button
              type="button"
              onClick={run}
              disabled={busy}
              className={`${btn} border`}
              style={btnGhost}
            >
              {busy ? "..." : "بحث"}
            </button>
          </div>
          {results.length > 0 && (
            <ul className="sup-scroll mt-2 max-h-56 space-y-1 overflow-y-auto">
              {results.map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={() => {
                      onPick(r);
                      setResults([]);
                      setQ(r.title);
                    }}
                    className="w-full rounded-lg border px-3 py-2 text-right text-xs transition-colors hover:border-[#2DD4BF]/50"
                    style={{ borderColor: C.borderSoft, color: C.ink, background: "rgba(10,14,26,.4)" }}
                  >
                    <strong>{r.title}</strong>
                    {r.subtitle && <span style={{ color: C.ink2 }}> — {r.subtitle}</span>}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

// ─── Browse picker (course → folder → item, no name needed) ──────────────────

function BrowsePicker({
  type,
  onPick,
  say,
}: {
  type: string;
  onPick: (r: SearchResult) => void;
  say: (k: "ok" | "err", t: string) => void;
}) {
  const [courses, setCourses] = useState<SearchResult[]>([]);
  const [folders, setFolders] = useState<SearchResult[]>([]);
  const [items, setItems] = useState<SearchResult[]>([]);
  const [courseId, setCourseId] = useState("");
  const [folderId, setFolderId] = useState("");
  const [courseFilter, setCourseFilter] = useState("");
  const [loading, setLoading] = useState<"courses" | "folders" | "items" | null>("courses");

  // Courses load once on mount.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading("courses");
      try {
        const res = await fetch("/api/support/content-tree");
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        if (!cancelled) setCourses(data.courses ?? []);
      } catch (e) {
        if (!cancelled) say("err", e instanceof Error ? e.message : "تعذر تحميل الكورسات");
      } finally {
        if (!cancelled) setLoading(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [say]);

  // Folders load when the course changes; downstream resets.
  useEffect(() => {
    setFolders([]);
    setItems([]);
    setFolderId("");
    if (!courseId) return;
    let cancelled = false;
    (async () => {
      setLoading("folders");
      try {
        const res = await fetch(`/api/support/content-tree?courseId=${encodeURIComponent(courseId)}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        if (!cancelled) setFolders(data.folders ?? []);
      } catch (e) {
        if (!cancelled) say("err", e instanceof Error ? e.message : "تعذر تحميل المحاضرات");
      } finally {
        if (!cancelled) setLoading(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [courseId, say]);

  // Items load when the folder (or the requested type) changes.
  useEffect(() => {
    setItems([]);
    if (!courseId || !folderId) return;
    let cancelled = false;
    (async () => {
      setLoading("items");
      try {
        const res = await fetch(
          `/api/support/content-tree?courseId=${encodeURIComponent(courseId)}&folderId=${encodeURIComponent(folderId)}&type=${encodeURIComponent(type)}`
        );
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        if (!cancelled) {
          setItems(data.results ?? []);
          if ((data.results ?? []).length === 0) say("err", "لا توجد عناصر من هذا النوع هنا");
        }
      } catch (e) {
        if (!cancelled) say("err", e instanceof Error ? e.message : "تعذر تحميل العناصر");
      } finally {
        if (!cancelled) setLoading(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [courseId, folderId, type, say]);

  const needle = courseFilter.trim();
  const visibleCourses = needle
    ? courses.filter((c) => c.title.includes(needle) || c.subtitle.includes(needle))
    : courses;

  // Picking a course for a COURSE request needs no folder/item drill-down.
  const coursePicked = (id: string) => {
    setCourseId(id);
    if (type === "COURSE") {
      const c = courses.find((x) => x.id === id);
      if (c) onPick(c);
    }
  };

  return (
    <div className="space-y-2">
      <input
        className={input}
        style={inputStyle}
        placeholder="رشّح الكورسات بالاسم أو المدرّس (اختياري)"
        value={courseFilter}
        onChange={(e) => setCourseFilter(e.target.value)}
      />
      <select
        className={`${input} sup-select`}
        style={inputStyle}
        value={courseId}
        onChange={(e) => coursePicked(e.target.value)}
        disabled={loading === "courses"}
      >
        <option value="">
          {loading === "courses" ? "جارٍ تحميل الكورسات..." : "اختر الكورس"}
        </option>
        {visibleCourses.map((c) => (
          <option key={c.id} value={c.id}>
            {c.title}
            {c.subtitle ? ` — ${c.subtitle}` : ""}
          </option>
        ))}
      </select>
      {type !== "COURSE" && (
        <>
          <select
            className={`${input} sup-select`}
            style={inputStyle}
            value={folderId}
            onChange={(e) => setFolderId(e.target.value)}
            disabled={!courseId || loading === "folders"}
          >
            <option value="">
              {loading === "folders" ? "جارٍ تحميل المحاضرات..." : "اختر المحاضرة / المجلد"}
            </option>
            {folders.map((f) => (
              <option key={f.id} value={f.id}>
                {f.title}
                {f.subtitle ? ` (${f.subtitle})` : ""}
              </option>
            ))}
          </select>
          <select
            className={`${input} sup-select`}
            style={inputStyle}
            value=""
            onChange={(e) => {
              const item = items.find((i) => i.id === e.target.value);
              if (item) onPick(item);
            }}
            disabled={!folderId || loading === "items"}
          >
            <option value="">
              {loading === "items" ? "جارٍ تحميل العناصر..." : "اختر العنصر"}
            </option>
            {items.map((i) => (
              <option key={i.id} value={i.id}>
                {i.title}
                {i.subtitle ? ` — ${i.subtitle}` : ""}
              </option>
            ))}
          </select>
        </>
      )}
    </div>
  );
}

// ─── Discounts ────────────────────────────────────────────────────────────────

function DiscountsTab({ say }: { say: (k: "ok" | "err", t: string) => void }) {
  const [codes, setCodes] = useState<DiscountRow[]>([]);
  const [maxPercent, setMaxPercent] = useState(10);
  const [form, setForm] = useState({ code: "", percent: 10, expiresInDays: "", maxTotalUses: "" });
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/support/discounts");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setCodes(data.codes ?? []);
      setMaxPercent(data.maxPercent ?? 10);
    } catch (e) {
      say("err", e instanceof Error ? e.message : "تعذر تحميل الأكواد");
    }
  }, [say]);

  useEffect(() => {
    (async () => {
      await load();
    })();
  }, [load]);

  const create = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/support/discounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: form.code,
          percent: Number(form.percent),
          expiresInDays: form.expiresInDays ? Number(form.expiresInDays) : null,
          maxTotalUses: form.maxTotalUses ? Number(form.maxTotalUses) : null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      say("ok", `تم إنشاء الكود ${data.code.code}`);
      setForm({ code: "", percent: 10, expiresInDays: "", maxTotalUses: "" });
      void load();
    } catch (e) {
      say("err", e instanceof Error ? e.message : "تعذر إنشاء الكود");
    } finally {
      setBusy(false);
    }
  };

  const toggle = async (id: string, isActive: boolean) => {
    try {
      const res = await fetch("/api/support/discounts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, isActive }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      void load();
    } catch (e) {
      say("err", e instanceof Error ? e.message : "تعذر التعديل");
    }
  };

  return (
    <div className="space-y-5">
      <section className={`${card} sup-anim`} style={cardStyle}>
        <SectionHead
          icon="🏷️"
          tint={C.brandSoft}
          title="كود خصم على المنصة كلها"
          hint={`الحد الأقصى ${maxPercent}% — مفروض من الخادم، وليس من الواجهة فقط`}
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-bold" style={{ color: C.ink }}>
              الكود
            </label>
            <input
              className={input}
              style={inputStyle}
              dir="ltr"
              placeholder="WELCOME10"
              value={form.code}
              onChange={(e) => setForm({ ...form, code: e.target.value })}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-bold" style={{ color: C.ink }}>
              النسبة (%)
            </label>
            <input
              className={input}
              style={inputStyle}
              type="number"
              min={1}
              max={maxPercent}
              dir="ltr"
              value={form.percent}
              onChange={(e) => setForm({ ...form, percent: Number(e.target.value) })}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-bold" style={{ color: C.ink }}>
              ينتهي بعد (أيام) — اتركه فارغاً لبلا نهاية
            </label>
            <input
              className={input}
              style={inputStyle}
              type="number"
              min={1}
              dir="ltr"
              value={form.expiresInDays}
              onChange={(e) => setForm({ ...form, expiresInDays: e.target.value })}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-bold" style={{ color: C.ink }}>
              أقصى عدد استخدامات — فارغ = بلا حد
            </label>
            <input
              className={input}
              style={inputStyle}
              type="number"
              min={1}
              dir="ltr"
              value={form.maxTotalUses}
              onChange={(e) => setForm({ ...form, maxTotalUses: e.target.value })}
            />
          </div>
        </div>
        <button
          type="button"
          disabled={busy || !form.code}
          onClick={create}
          className={`${btn} mt-4`}
          style={btnPrimary}
        >
          {busy ? "..." : "إنشاء الكود"}
        </button>
      </section>

      <section className={`${card} sup-anim sup-anim-1`} style={cardStyle}>
        <SectionHead icon="📋" tint={C.surface2} title="الأكواد الحالية" />
        {codes.length === 0 && (
          <p className="text-sm" style={{ color: C.ink2 }}>
            لا توجد أكواد بعد.
          </p>
        )}
        <ul className="space-y-2">
          {codes.map((c) => (
            <li
              key={c.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border px-4 py-3"
              style={{ borderColor: C.borderSoft, background: "rgba(10,14,26,.4)" }}
            >
              <span>
                <span className="block text-sm font-black" style={{ color: C.ink }} dir="ltr">
                  {c.code} · {c.discountValue}%
                </span>
                <span className="block text-xs" style={{ color: C.ink2 }}>
                  استُخدم {c.usedCount}
                  {c.maxTotalUses ? ` من ${c.maxTotalUses}` : ""} ·{" "}
                  {c.expiresAt ? `ينتهي ${fmtDate(c.expiresAt)}` : "بلا نهاية"}
                </span>
              </span>
              <span className="flex items-center gap-2">
                <Pill
                  label={c.isActive ? "مفعّل" : "متوقف"}
                  color={c.isActive ? C.emerald : C.ink3}
                  soft={c.isActive ? C.emeraldSoft : C.surface2}
                />
                <button
                  type="button"
                  onClick={() => toggle(c.id, !c.isActive)}
                  className={`${btn} border text-xs`}
                  style={
                    c.isActive
                      ? { borderColor: "rgba(251,113,133,.4)", color: C.rose }
                      : { borderColor: C.border, color: C.ink2 }
                  }
                >
                  {c.isActive ? "إيقاف" : "تفعيل"}
                </button>
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

// ─── Settings ─────────────────────────────────────────────────────────────────

function SettingsTab({ say }: { say: (k: "ok" | "err", t: string) => void }) {
  const [quizOpen, setQuizOpen] = useState(true);
  const [hwOpen, setHwOpen] = useState(true);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/support/settings");
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        setQuizOpen(data.quiz_time_limit_disabled);
        setHwOpen(data.homework_deadline_disabled);
      } catch {
        say("err", "تعذر تحميل الإعدادات");
      } finally {
        setLoaded(true);
      }
    })();
  }, [say]);

  const save = async (key: string, value: boolean) => {
    try {
      const res = await fetch("/api/support/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, value }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      say("ok", "تم الحفظ");
    } catch (e) {
      say("err", e instanceof Error ? e.message : "تعذر الحفظ");
    }
  };

  if (!loaded) {
    return (
      <p className="text-center text-sm" style={{ color: C.ink2 }}>
        جارٍ التحميل...
      </p>
    );
  }

  return (
    <section className={`${card} sup-anim`} style={cardStyle}>
      <SectionHead
        icon="⚙️"
        tint={C.surface2}
        title="توقيت الاختبارات والواجبات"
        hint="يطبَّق على المنصة كلها — المدرّس يضع المدة والموعد، وهذان المفتاحان يقرّران هل يفرضهما الخادم"
      />

      <Toggle
        label="الاختبار مفتوح دائماً"
        hint="لا ينتهي وقت الاختبار ولا يُسلَّم تلقائياً. الطالب هو من يُسلِّم."
        checked={quizOpen}
        onChange={(v) => {
          setQuizOpen(v);
          void save("quiz_time_limit_disabled", v);
        }}
      />
      <Toggle
        label="الواجب مفتوح دائماً"
        hint="يُقبل تسليم الواجب بعد موعده. التاريخ يظل ظاهراً للطالب كإرشاد."
        checked={hwOpen}
        onChange={(v) => {
          setHwOpen(v);
          void save("homework_deadline_disabled", v);
        }}
      />
    </section>
  );
}

function Toggle({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label
      className="mb-2 flex cursor-pointer items-center justify-between gap-4 rounded-xl border px-4 py-3"
      style={{ borderColor: C.borderSoft, background: "rgba(10,14,26,.4)" }}
    >
      <span>
        <span className="block text-sm font-bold" style={{ color: C.ink }}>
          {label}
        </span>
        <span className="block text-xs" style={{ color: C.ink2 }}>
          {hint}
        </span>
      </span>
      <span
        className="relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors"
        style={{ background: checked ? C.brandGrad : "rgba(148,163,200,.25)" }}
      >
        <span
          className="absolute h-5 w-5 rounded-full bg-white shadow transition-all"
          style={{ right: checked ? 2 : 22 }}
        />
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        />
      </span>
    </label>
  );
}
