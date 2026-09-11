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

type Dossier = {
  student: Student & { parentPhone: string | null; accountMode: string };
  videos: VideoRow[];
  homework: HomeworkRow[];
  overrides: OverrideRow[];
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

// ─── Shared styles ────────────────────────────────────────────────────────────

const card = "rounded-2xl border p-5";
const cardStyle = { background: "var(--surface)", borderColor: "var(--border)" } as const;
const input =
  "w-full rounded-xl border px-3.5 py-2.5 text-sm outline-none focus:ring-2 focus:ring-[var(--brand)]/40";
const inputStyle = {
  background: "var(--surface-2)",
  borderColor: "var(--border)",
  color: "var(--ink)",
} as const;
const btn = "rounded-xl px-4 py-2.5 text-sm font-bold transition-opacity hover:opacity-90 disabled:opacity-50";

function fmtDate(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("ar-EG", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
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
    <main dir="rtl" className="min-h-screen px-4 py-6" style={{ background: "var(--bg)" }}>
      <div className="mx-auto max-w-5xl">
        <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div
              className="flex h-11 w-11 items-center justify-center rounded-2xl text-xl"
              style={{ background: "var(--brand-soft)" }}
            >
              🛟
            </div>
            <div>
              <h1 className="text-lg font-black" style={{ color: "var(--ink)" }}>
                لوحة الدعم الفني
              </h1>
              <p className="text-xs" style={{ color: "var(--ink-muted)" }}>
                كل إجراء هنا يُسجَّل في سجل النشاط
              </p>
            </div>
          </div>
          <form action="/thefake/support/logout" method="POST">
            <button
              type="submit"
              className={`${btn} border`}
              style={{ borderColor: "var(--border)", color: "var(--ink-muted)" }}
            >
              خروج
            </button>
          </form>
        </header>

        {notice === "readonly" && (
          <div className="mb-4 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">
            جلسة الدخول لحساب الطالب للاطّلاع فقط — لا يمكن تنفيذ أي تعديل من داخل حسابه.
          </div>
        )}

        <nav className="mb-5 flex flex-wrap gap-2">
          {(
            [
              ["students", "الطلاب"],
              ["discounts", "أكواد الخصم"],
              ["settings", "الاختبارات والواجبات"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={`${btn} border`}
              style={
                tab === id
                  ? { background: "var(--brand)", color: "#fff", borderColor: "var(--brand)" }
                  : { borderColor: "var(--border)", color: "var(--ink-muted)" }
              }
            >
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
          className={`fixed bottom-5 left-1/2 z-50 -translate-x-1/2 rounded-xl px-5 py-3 text-sm font-bold text-white shadow-xl ${
            toast.kind === "ok" ? "bg-emerald-600" : "bg-rose-600"
          }`}
        >
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
      <section className={card} style={cardStyle}>
        <h2 className="mb-3 text-sm font-black" style={{ color: "var(--ink)" }}>
          ابحث عن الطالب
        </h2>
        <div className="flex flex-wrap gap-2">
          <input
            className={`${input} flex-1 min-w-[200px]`}
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
            className={`${btn} text-white`}
            style={{ background: "var(--brand)" }}
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
                  className="flex w-full items-center justify-between rounded-xl border px-4 py-3 text-right transition-colors hover:border-[var(--brand)]"
                  style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}
                >
                  <span>
                    <span className="block text-sm font-bold" style={{ color: "var(--ink)" }}>
                      {s.name}
                    </span>
                    <span className="block text-xs" style={{ color: "var(--ink-muted)" }} dir="ltr">
                      {s.phone || s.email}
                    </span>
                  </span>
                  {!s.isActive && (
                    <span className="rounded-lg bg-rose-100 px-2 py-1 text-[11px] font-bold text-rose-700">
                      موقوف
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {loadingDossier && (
        <p className="text-center text-sm" style={{ color: "var(--ink-muted)" }}>
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

  return (
    <div className="space-y-5">
      <section className={card} style={cardStyle}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-black" style={{ color: "var(--ink)" }}>
              {s.name}
            </h2>
            <p className="mt-1 text-xs" style={{ color: "var(--ink-muted)" }} dir="ltr">
              {s.phone} · {s.email}
            </p>
            <p className="mt-1 text-xs" style={{ color: "var(--ink-muted)" }}>
              {s.educationalStage || "—"} · الرصيد {s.balance} ج · آخر دخول {fmtDate(s.lastLoginAt)}
            </p>
          </div>

          {/* Native form POST: the redirect must be a top-level navigation for
              the student cookie to apply to the browsing session. */}
          <form action="/thefake/support/enter-student" method="POST">
            <input type="hidden" name="studentId" value={s.id} />
            <button
              type="submit"
              className={`${btn} text-white`}
              style={{ background: "var(--ink)" }}
              title="دخول للاطّلاع فقط — الطالب لن يرى أي أثر، ولن تُخصم منه مشاهدة"
            >
              الدخول لحساب الطالب
            </button>
          </form>
        </div>
        <p className="mt-3 rounded-xl px-3 py-2 text-xs" style={{ background: "var(--surface-2)", color: "var(--ink-muted)" }}>
          الدخول للحساب <strong>للاطّلاع فقط</strong>: لا يمكن التعديل من داخله، ولا تُخصم مشاهدة من
          الطالب، ولا يظهر له أي إشعار.
        </p>
      </section>

      <ExtraViewsSection student={s} videos={dossier.videos} say={say} reload={reload} />
      <GrantAccessSection student={s} say={say} reload={reload} />
      <UnlockSection dossier={dossier} say={say} reload={reload} />
      <BypassSection dossier={dossier} say={say} reload={reload} />
      <PasswordSection student={s} say={say} />
    </div>
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
    <section className={card} style={cardStyle}>
      <h3 className="mb-1 text-sm font-black" style={{ color: "var(--ink)" }}>
        المشاهدات
      </h3>
      <p className="mb-4 text-xs" style={{ color: "var(--ink-muted)" }}>
        يمكن المنح مباشرة دون أن يرسل الطالب طلباً. الدروس التي نفدت مشاهداتها في الأعلى.
      </p>

      {videos.length === 0 && (
        <p className="text-sm" style={{ color: "var(--ink-muted)" }}>
          لم يشاهد هذا الطالب أي درس بعد.
        </p>
      )}

      <ul className="space-y-2">
        {videos.map((v) => (
          <li
            key={v.id}
            className="rounded-xl border px-4 py-3"
            style={{
              borderColor: v.exhausted ? "#f43f5e55" : "var(--border)",
              background: v.exhausted ? "#f43f5e0d" : "var(--surface-2)",
            }}
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-[180px] flex-1">
                <p className="text-sm font-bold" style={{ color: "var(--ink)" }}>
                  {v.title}
                </p>
                <p className="text-xs" style={{ color: "var(--ink-muted)" }}>
                  {[v.courseTitle, v.folderName].filter(Boolean).join(" — ")}
                </p>
                <p className="mt-1 text-xs" style={{ color: "var(--ink-muted)" }}>
                  استخدم {v.used} من {v.allowance}
                  {v.grantedViews > 0 && ` (منها ${v.grantedViews} ممنوحة)`} ·{" "}
                  {v.exhausted ? (
                    <strong className="text-rose-600">نفدت المشاهدات</strong>
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
                  className={`${btn} text-white`}
                  style={{ background: "var(--brand)" }}
                >
                  {busyId === v.id ? "..." : "منح"}
                </button>
                <button
                  type="button"
                  disabled={busyId === `watched:${v.id}`}
                  onClick={() => markWatched(v.id)}
                  className={`${btn} border`}
                  style={{ borderColor: "var(--border)", color: "var(--ink)" }}
                  title="يُسجَّل الدرس كمشاهَد دون خصم مشاهدة من رصيد الطالب"
                >
                  {busyId === `watched:${v.id}` ? "..." : "سجّله كمشاهَد"}
                </button>
              </div>
            </div>
          </li>
        ))}
      </ul>

      <div className="mt-5 border-t pt-4" style={{ borderColor: "var(--border)" }}>
        <p className="mb-2 text-xs font-bold" style={{ color: "var(--ink)" }}>
          منح مشاهدات لدرس غير موجود في القائمة
        </p>
        <ContentPicker type="VIDEO" onPick={setManual} say={say} />
        {manual && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="text-sm font-bold" style={{ color: "var(--ink)" }}>
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
              className={`${btn} text-white`}
              style={{ background: "var(--brand)" }}
            >
              منح
            </button>
            <button
              type="button"
              disabled={busyId === `watched:${manual.id}`}
              onClick={() => markWatched(manual.id)}
              className={`${btn} border`}
              style={{ borderColor: "var(--border)", color: "var(--ink)" }}
              title="يُسجَّل الدرس كمشاهَد دون خصم مشاهدة من رصيد الطالب"
            >
              {busyId === `watched:${manual.id}` ? "..." : "سجّله كمشاهَد"}
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
    <section className={card} style={cardStyle}>
      <h3 className="mb-1 text-sm font-black" style={{ color: "var(--ink)" }}>
        فتح أي درس للطالب (وصول كامل)
      </h3>
      <p className="mb-4 text-xs" style={{ color: "var(--ink-muted)" }}>
        يمنح الطالب الدرس ولو لم يشترِه: ملكية الدرس + تخطّي التسلسل + مشاهدات إضافية — كلها في زر
        واحد. ابحث بالاسم أو استعرض الكورس ← المحاضرة ← الدرس.
      </p>

      <ContentPicker type="VIDEO" onPick={setPicked} say={say} />

      {picked && (
        <div
          className="mt-3 space-y-3 rounded-xl border p-4"
          style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}
        >
          <p className="text-sm font-bold" style={{ color: "var(--ink)" }}>
            {picked.title}
            {picked.subtitle && (
              <span className="block text-xs font-normal" style={{ color: "var(--ink-muted)" }}>
                {picked.subtitle}
              </span>
            )}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-xs font-bold" style={{ color: "var(--ink)" }}>
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
              className={`${input} flex-1 min-w-[180px]`}
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
              className={`${btn} text-white`}
              style={{ background: "var(--brand)" }}
            >
              {busy === "grant" ? "..." : "افتح الدرس كاملاً"}
            </button>
            <button
              type="button"
              disabled={busy !== null}
              onClick={markWatched}
              className={`${btn} border`}
              style={{ borderColor: "var(--border)", color: "var(--ink)" }}
              title="يُسجَّل الدرس كمشاهَد دون منح وصول أو خصم مشاهدة"
            >
              {busy === "watched" ? "..." : "سجّله كمشاهَد فقط"}
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
    <section className={card} style={cardStyle}>
      <h3 className="mb-1 text-sm font-black" style={{ color: "var(--ink)" }}>
        تخطّي التسلسل (فتح درس رغم الواجب)
      </h3>
      <p className="mb-4 text-xs" style={{ color: "var(--ink-muted)" }}>
        يفتح عنصراً واحداً لهذا الطالب فقط. لا يُسجَّل الواجب كأنه محلول — درجات الطالب وإحصائيات
        المدرّس تبقى صحيحة.
      </p>

      {blocking.length > 0 && (
        <div className="mb-4">
          <p className="mb-2 text-xs font-bold" style={{ color: "var(--ink)" }}>
            واجبات لم يسلّمها هذا الطالب (السبب الأشهر لتوقف الدروس)
          </p>
          <ul className="space-y-2">
            {blocking.slice(0, 8).map((h) => (
              <li
                key={h.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border px-4 py-2.5"
                style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}
              >
                <span>
                  <span className="block text-sm font-bold" style={{ color: "var(--ink)" }}>
                    {h.title}
                  </span>
                  <span className="block text-xs" style={{ color: "var(--ink-muted)" }}>
                    {h.overdue ? "انتهى موعده" : "مفتوح"} · آخر موعد {fmtDate(h.dueAt)}
                  </span>
                </span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => unlock("HOMEWORK", h.id)}
                    className={`${btn} border`}
                    style={{ borderColor: "var(--border)", color: "var(--ink)" }}
                  >
                    افتح الواجب نفسه
                  </button>
                  {h.videoId && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => unlock("VIDEO", h.videoId as string)}
                      className={`${btn} text-white`}
                      style={{ background: "var(--brand)" }}
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

      <div className="border-t pt-4" style={{ borderColor: "var(--border)" }}>
        <p className="mb-2 text-xs font-bold" style={{ color: "var(--ink)" }}>
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
                  ? { background: "var(--brand)", color: "#fff", borderColor: "var(--brand)" }
                  : { borderColor: "var(--border)", color: "var(--ink-muted)" }
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
              className={`${btn} text-white`}
              style={{ background: "var(--brand)" }}
            >
              افتح «{picked.title}» لهذا الطالب
            </button>
          </div>
        )}
      </div>

      {dossier.overrides.length > 0 && (
        <div className="mt-5 border-t pt-4" style={{ borderColor: "var(--border)" }}>
          <p className="mb-2 text-xs font-bold" style={{ color: "var(--ink)" }}>
            الاستثناءات المفعّلة حالياً
          </p>
          <ul className="space-y-2">
            {dossier.overrides.map((o) => (
              <li
                key={o.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border px-4 py-2.5"
                style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}
              >
                <span className="text-xs" style={{ color: "var(--ink-muted)" }}>
                  <strong style={{ color: "var(--ink)" }}>{o.contentType}</strong> · {o.reason || "بدون سبب"} ·{" "}
                  {fmtDate(o.createdAt)}
                  {o.expiresAt && ` · ينتهي ${fmtDate(o.expiresAt)}`}
                </span>
                <button
                  type="button"
                  onClick={() => revoke(o.id)}
                  className={`${btn} border text-xs`}
                  style={{ borderColor: "#f43f5e55", color: "#e11d48" }}
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
    <section className={card} style={cardStyle}>
      <h3 className="mb-1 text-sm font-black" style={{ color: "var(--ink)" }}>
        تخطّي اختبار أو واجب (تسجيله كناجح)
      </h3>
      <p className="mb-4 text-xs" style={{ color: "var(--ink-muted)" }}>
        يُنهي الالتزام نفسه: يُسجَّل الاختبار/الواجب كمكتمل وناجح لهذا الطالب، فيتوقف عن حجب الدروس
        ويظهر في درجاته بالنسبة التي تختارها. درجة حقيقية موجودة أعلى لن تُخفض. بخلاف «فتح» عنصر
        واحد في قسم تخطّي التسلسل أعلاه، الذي يترك الاختبار مطلوباً.
      </p>

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
                ? { background: "var(--brand)", color: "#fff", borderColor: "var(--brand)" }
                : { borderColor: "var(--border)", color: "var(--ink-muted)" }
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
          style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}
        >
          <p className="text-sm font-bold" style={{ color: "var(--ink)" }}>
            {picked.title}
            {picked.subtitle && (
              <span className="block text-xs font-normal" style={{ color: "var(--ink-muted)" }}>
                {picked.subtitle}
              </span>
            )}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-xs font-bold" style={{ color: "var(--ink)" }}>
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
              className={`${input} flex-1 min-w-[180px]`}
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
            className={`${btn} text-white`}
            style={{ background: "#e11d48" }}
          >
            {busy ? "..." : `سجّل «${picked.title}» كناجح لهذا الطالب`}
          </button>
        </div>
      )}
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
    <section className={card} style={cardStyle}>
      <h3 className="mb-1 text-sm font-black" style={{ color: "var(--ink)" }}>
        تغيير كلمة مرور الطالب
      </h3>
      <p className="mb-3 text-xs" style={{ color: "var(--ink-muted)" }}>
        سيتم تسجيل الخروج من كل الأجهزة التي كان مسجّلاً عليها.
      </p>
      <div className="flex flex-wrap gap-2">
        <input
          className={`${input} flex-1 min-w-[200px]`}
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
          className={`${btn} text-white`}
          style={{ background: "#e11d48" }}
        >
          {busy ? "..." : "تغيير"}
        </button>
      </div>
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
                ? { background: "var(--ink)", color: "#fff", borderColor: "var(--ink)" }
                : { borderColor: "var(--border)", color: "var(--ink-muted)" }
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
              placeholder="اسم الدرس / الواجب / الاختبار"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && run()}
            />
            <button
              type="button"
              onClick={run}
              disabled={busy}
              className={`${btn} border`}
              style={{ borderColor: "var(--border)", color: "var(--ink)" }}
            >
              {busy ? "..." : "بحث"}
            </button>
          </div>
          {results.length > 0 && (
            <ul className="mt-2 max-h-56 space-y-1 overflow-y-auto">
              {results.map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={() => {
                      onPick(r);
                      setResults([]);
                      setQ(r.title);
                    }}
                    className="w-full rounded-lg border px-3 py-2 text-right text-xs transition-colors hover:border-[var(--brand)]"
                    style={{ borderColor: "var(--border)", color: "var(--ink)" }}
                  >
                    <strong>{r.title}</strong>
                    {r.subtitle && (
                      <span style={{ color: "var(--ink-muted)" }}> — {r.subtitle}</span>
                    )}
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
        className={input}
        style={inputStyle}
        value={courseId}
        onChange={(e) => setCourseId(e.target.value)}
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
      <select
        className={input}
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
        className={input}
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
      <section className={card} style={cardStyle}>
        <h3 className="mb-1 text-sm font-black" style={{ color: "var(--ink)" }}>
          كود خصم على المنصة كلها
        </h3>
        <p className="mb-4 text-xs" style={{ color: "var(--ink-muted)" }}>
          الحد الأقصى {maxPercent}% — مفروض من الخادم، وليس من الواجهة فقط.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-bold" style={{ color: "var(--ink)" }}>
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
            <label className="mb-1 block text-xs font-bold" style={{ color: "var(--ink)" }}>
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
            <label className="mb-1 block text-xs font-bold" style={{ color: "var(--ink)" }}>
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
            <label className="mb-1 block text-xs font-bold" style={{ color: "var(--ink)" }}>
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
          className={`${btn} mt-4 text-white`}
          style={{ background: "var(--brand)" }}
        >
          {busy ? "..." : "إنشاء الكود"}
        </button>
      </section>

      <section className={card} style={cardStyle}>
        <h3 className="mb-3 text-sm font-black" style={{ color: "var(--ink)" }}>
          الأكواد الحالية
        </h3>
        {codes.length === 0 && (
          <p className="text-sm" style={{ color: "var(--ink-muted)" }}>
            لا توجد أكواد بعد.
          </p>
        )}
        <ul className="space-y-2">
          {codes.map((c) => (
            <li
              key={c.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border px-4 py-3"
              style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}
            >
              <span>
                <span className="block text-sm font-black" style={{ color: "var(--ink)" }} dir="ltr">
                  {c.code} · {c.discountValue}%
                </span>
                <span className="block text-xs" style={{ color: "var(--ink-muted)" }}>
                  استُخدم {c.usedCount}
                  {c.maxTotalUses ? ` من ${c.maxTotalUses}` : ""} ·{" "}
                  {c.expiresAt ? `ينتهي ${fmtDate(c.expiresAt)}` : "بلا نهاية"}
                </span>
              </span>
              <button
                type="button"
                onClick={() => toggle(c.id, !c.isActive)}
                className={`${btn} border text-xs`}
                style={
                  c.isActive
                    ? { borderColor: "#f43f5e55", color: "#e11d48" }
                    : { borderColor: "var(--border)", color: "var(--ink-muted)" }
                }
              >
                {c.isActive ? "إيقاف" : "تفعيل"}
              </button>
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
      <p className="text-center text-sm" style={{ color: "var(--ink-muted)" }}>
        جارٍ التحميل...
      </p>
    );
  }

  return (
    <section className={card} style={cardStyle}>
      <h3 className="mb-1 text-sm font-black" style={{ color: "var(--ink)" }}>
        توقيت الاختبارات والواجبات
      </h3>
      <p className="mb-4 text-xs" style={{ color: "var(--ink-muted)" }}>
        يطبَّق على المنصة كلها. المدرّس يظل يضع المدة والموعد، وهذان المفتاحان يقرّران هل يفرضهما
        الخادم أم لا.
      </p>

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
      style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}
    >
      <span>
        <span className="block text-sm font-bold" style={{ color: "var(--ink)" }}>
          {label}
        </span>
        <span className="block text-xs" style={{ color: "var(--ink-muted)" }}>
          {hint}
        </span>
      </span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-5 w-5 shrink-0 accent-[var(--brand)]"
      />
    </label>
  );
}
