"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ProfileGuard } from "@/components/auth/ProfileGuard";
import { Navbar } from "@/components/ui/Navbar";
import { Footer } from "@/components/ui/Footer";
import { useToast } from "@/components/ui/Toast";

import { CheckCircle2, Sparkles, Lock, Calendar, Layers, Check, AlertCircle } from "lucide-react";

type MonthItem = {
  number: number;
  name: string;
  onSale: boolean;
  isOwned: boolean;
  isEligible: boolean;
  isLocked: boolean;
  lockReason?: string;
  opens: string[];
};

type Booking = {
  planType: string;
  label: string;
  price: number | null;
  opens: string[];
  runningUntil: string | null;
  unavailable: string | null;
  monthNumber?: number;
  isRenewal?: boolean;
};

type Standalone = { id: string; title: string; price: number; owned: boolean };

type Data = {
  balance: number;
  grade: string | null;
  autoEnroll: boolean;
  teachers: { id: string; name: string }[];
  teacherId?: string;
  track?: string;
  englishBookingEnabled?: boolean;
  bookings?: Booking[];
  monthlyProgression?: {
    ownedMonths: number[];
    highestOwnedMonth: number;
    nextEligibleMonth: { number: number; name: string; opens: string[] } | null;
    enforceSequential: boolean;
    allMonths: MonthItem[];
  };
  standalone?: Standalone[];
};

const GRADE_LABELS: Record<string, string> = { sec_1: "أولى بكالوريا", sec_2: "ثانية بكالوريا", sec_3: "ثالثة ثانوية" };

function ChooseCourse() {
  const params = useSearchParams();
  const { success: toastSuccess, error: toastError } = useToast();
  const [user, setUser] = useState<{ name: string; role: string } | null>(null);
  const [data, setData] = useState<Data | null>(null);
  const [teacherId, setTeacherId] = useState<string>(params.get("teacherId") || "");
  const [track, setTrack] = useState<string>("");
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/auth/me", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setUser(d?.user ? { name: d.user.name, role: d.user.role } : null))
      .catch(() => {});
  }, []);

  const load = useCallback(() => {
    const q = new URLSearchParams();
    if (teacherId) q.set("teacherId", teacherId);
    if (track) q.set("track", track);
    fetch(`/api/student/choose-course?${q}`, { credentials: "include" })
      .then((r) => r.json())
      .then((d) => {
        if (d.error) return toastError(d.error);
        setData(d);
        if (!teacherId && d.teachers?.length === 1) setTeacherId(d.teachers[0].id);
        if (d.track && !track) setTrack(d.track);
      })
      .catch(() => toastError("تعذر تحميل الصفحة"));
  }, [teacherId, track, toastError]);

  useEffect(load, [load]);

  const buy = async (key: string, url: string, body: object, what: string) => {
    if (!window.confirm(`تأكيد الاشتراك في: ${what}؟ هيتخصم من رصيد محفظتك.`)) return;
    setBusy(key);
    try {
      const res = await fetch(url, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok || d.success === false) {
        toastError(d.insufficientFunds ? `رصيدك مش كفاية — ناقصك ${d.missingAmount} ج` : d.error || "تعذر الاشتراك");
        return;
      }
      toastSuccess("تم الاشتراك بنجاح 🎉");
      load();
    } finally {
      setBusy(null);
    }
  };

  const card = "p-5 rounded-2xl border border-[var(--border)] bg-[var(--surface)] space-y-3";

  return (
    <div className="flex flex-col min-h-screen" style={{ background: "var(--bg)", color: "var(--ink)" }} dir="rtl">
      <Navbar user={user} />
      <main className="flex-1 max-w-3xl mx-auto w-full px-4 py-8 space-y-5">
        <div className={card}>
          <h1 className="text-xl font-bold">اختار الكورس اللي عايز تشترك فيه</h1>
          <p className="text-sm text-[var(--ink-2)]">
            رصيد محفظتك: <b className="text-[var(--ink)]">{data?.balance ?? "…"} ج</b>
            {data?.grade && <> · صفّك: <b className="text-[var(--ink)]">{GRADE_LABELS[data.grade] || data.grade}</b></>}
          </p>
          <p className="text-xs text-[var(--ink-2)]">
            الفلوس اللي دفعتها بتتحط في محفظتك. اختار من تحت الحجز أو الكورس اللي يناسبك، وهيتخصم من رصيدك.
          </p>
        </div>

        {data && data.teachers.length > 1 && (
          <div className={card}>
            <label className="text-sm font-bold">المعلم</label>
            <select
              className="w-full h-11 px-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] text-[var(--ink)]"
              value={teacherId}
              onChange={(e) => setTeacherId(e.target.value)}
            >
              <option value="">— اختار المعلم —</option>
              {data.teachers.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>
        )}

        {data?.bookings && (
          <>
            <div className="flex gap-2">
              {[
                { v: "arabic", l: "عربي" },
                { v: "languages", l: "لغات" },
              ].map((o) => (
                <button
                  key={o.v}
                  onClick={() => setTrack(o.v)}
                  className={`px-4 h-9 rounded-full text-sm font-bold border border-[var(--border)] ${track === o.v ? "bg-emerald-600 text-white" : "bg-[var(--surface)]"}`}
                >
                  {o.l}
                </button>
              ))}
            </div>

            {/* English Booking Disabled Notice */}
            {track === "languages" && data.englishBookingEnabled === false && (
              <div className="p-3.5 rounded-xl border border-amber-500/40 bg-amber-500/10 text-amber-200 flex items-center gap-2.5 text-xs font-semibold shadow-sm">
                <AlertCircle size={18} className="shrink-0 text-amber-400" />
                <span>
                  حجز مسار اللغات (English) غير متاح حالياً عند هذا المعلم — الحجز والتجديد متاحان فقط لطلاب المسار العربي. يمكنك التبديل للمسار العربي إن كنت ترغب في دراسة المنهج بالعربية.
                </span>
              </div>
            )}

            {/* Monthly Journey & Progression Timeline */}
            {data.monthlyProgression && data.monthlyProgression.allMonths.length > 0 && (
              <div className={`${card} border-emerald-500/30 bg-emerald-950/10`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="p-1 rounded-lg bg-emerald-500/20 text-emerald-500">
                      <Calendar size={18} />
                    </span>
                    <div>
                      <h3 className="font-black text-sm text-[var(--ink)]">مسار وخريطة الشهور الدراسية</h3>
                      <p className="text-xs text-[var(--ink-2)]">
                        {data.monthlyProgression.highestOwnedMonth > 0
                          ? `أنت مشترك حالياً حتى الشهر (${data.monthlyProgression.highestOwnedMonth}) — يمكنك التجديد شهراً بشهر بالتتابع.`
                          : "يمكنك البدء بالاشتراك في الشهر الأول ثم التجديد للشهور التالية تباعاً."}
                      </p>
                    </div>
                  </div>
                  {data.monthlyProgression.highestOwnedMonth > 0 && (
                    <span className="text-xs px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-400 font-black">
                      مكتمل حتى شهر {data.monthlyProgression.highestOwnedMonth} ✓
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2 overflow-x-auto py-2 px-1">
                  {data.monthlyProgression.allMonths.map((m) => (
                    <div
                      key={m.number}
                      className={`shrink-0 flex flex-col p-2.5 rounded-xl border text-xs min-w-[130px] transition-all ${
                        m.isOwned
                          ? "bg-emerald-500/10 border-emerald-500/40 text-emerald-400"
                          : m.isEligible
                          ? "bg-amber-500/10 border-amber-500/50 text-amber-300 ring-2 ring-amber-500/30 shadow-md shadow-amber-500/10"
                          : "bg-[var(--surface-2)]/60 border-[var(--border)] text-[var(--ink-3)] opacity-60"
                      }`}
                    >
                      <div className="flex items-center justify-between font-bold mb-1">
                        <span>شهر {m.number}</span>
                        {m.isOwned ? (
                          <Check size={14} className="text-emerald-400" />
                        ) : m.isEligible ? (
                          <Sparkles size={14} className="text-amber-400 animate-pulse" />
                        ) : (
                          <Lock size={12} className="text-[var(--ink-3)]" />
                        )}
                      </div>
                      <span className="font-semibold truncate text-[11px]">{m.name}</span>
                      <span className="text-[10px] mt-1 text-[var(--ink-2)]">
                        {m.isOwned
                          ? "مُفعّل في حسابك ✓"
                          : m.isEligible
                          ? "متاح للتجديد الآن ⚡"
                          : m.lockReason || "مغلق حالياً"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {data.bookings.map((b) => (
              <div
                key={b.planType}
                className={`${card} ${b.isRenewal ? "border-amber-500/40 ring-1 ring-amber-500/20" : ""}`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <h2 className="font-bold text-base">{b.label}</h2>
                    {b.isRenewal && (
                      <span className="px-2 py-0.5 rounded-md text-[11px] font-black bg-amber-500/15 text-amber-400 border border-amber-500/30">
                        تجديد للشهر التالي ⚡
                      </span>
                    )}
                  </div>
                  {b.price !== null && <span className="font-black text-base text-emerald-600">{b.price} ج</span>}
                </div>
                {b.opens.length > 0 ? (
                  <div className="space-y-1">
                    <span className="text-xs text-[var(--ink-2)] block font-semibold">الكورسات التي يفتحها هذا الحجز:</span>
                    <ul className="text-xs sm:text-sm text-[var(--ink)] list-disc pr-5 space-y-0.5">
                      {b.opens.map((t) => <li key={t}>{t}</li>)}
                    </ul>
                  </div>
                ) : (
                  <p className="text-xs text-[var(--ink-2)]">مفيش كورسات محددة للحجز ده دلوقتي.</p>
                )}
                {b.runningUntil && (
                  <p className="text-xs text-[var(--ink-2)]">
                    مشترك لحد {new Date(b.runningUntil).toLocaleDateString("ar-EG")} — الشراء يجدد ويفتح الشهر التالي مباشرة.
                  </p>
                )}
                <button
                  disabled={!!b.unavailable || b.price === null || busy !== null}
                  onClick={() =>
                    buy(
                      b.planType,
                      "/api/teacher/subscribe-balance",
                      {
                        teacherId: data.teacherId,
                        planType: b.planType,
                        languageTrack: track,
                        studentGrade: data.grade,
                        monthNumber: b.monthNumber,
                      },
                      `${b.label} (${b.price} ج)`
                    )
                  }
                  className={`w-full h-11 rounded-xl text-white font-black text-sm disabled:opacity-50 transition-all ${
                    b.isRenewal
                      ? "bg-gradient-to-r from-amber-600 to-emerald-600 hover:from-amber-500 hover:to-emerald-500 shadow-md shadow-amber-600/20"
                      : "bg-emerald-600 hover:bg-emerald-500"
                  }`}
                >
                  {b.unavailable ||
                    (busy === b.planType
                      ? "جاري التفعيل…"
                      : b.isRenewal
                      ? `تجديد ${b.label} الآن · ${b.price} ج`
                      : `اشترك الآن · ${b.price} ج`)}
                </button>
              </div>
            ))}

            {data.standalone && data.standalone.length > 0 && (
              <div className={card}>
                <h2 className="font-bold">مراجعات وورش وكورسات بتتشترى لوحدها</h2>
                <div className="divide-y divide-[var(--border)]">
                  {data.standalone.map((c) => (
                    <div key={c.id} className="py-3 flex items-center justify-between gap-3">
                      <span className="text-sm">{c.title}</span>
                      {c.owned ? (
                        <Link href={`/courses/${c.id}`} className="text-sm font-bold text-emerald-600">مشترك ✓</Link>
                      ) : (
                        <button
                          disabled={busy !== null}
                          onClick={() => buy(c.id, `/api/courses/${c.id}/purchase`, {}, `${c.title} (${c.price} ج)`)}
                          className="px-4 h-9 rounded-lg bg-emerald-600 text-white text-sm font-bold disabled:opacity-50"
                        >
                          {busy === c.id ? "جاري…" : `اشترك · ${c.price} ج`}
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        <Link href="/library" className="block text-center text-sm font-bold text-emerald-600">روح لكورساتي ←</Link>
      </main>
      <Footer />
    </div>
  );
}

export default function ChooseCoursePage() {
  return (
    <ProfileGuard>
      <Suspense fallback={null}>
        <ChooseCourse />
      </Suspense>
    </ProfileGuard>
  );
}
