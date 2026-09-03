"use client";

/**
 * Center Student Hub — the exclusive landing surface for `center.code-up.tech`.
 *
 * Center students never pay online: they receive a printed/QR access code in the
 * hall and redeem it here. The page therefore has exactly two jobs —
 *   1. a unified smart code box (typed code, or `?code=` deep-link from a QR scan)
 *      that previews what the code unlocks before committing, then redeems it via
 *      POST /api/codes and drops the course straight into /library;
 *   2. a price-free showcase of the courses flagged CENTER/BOTH by their teachers.
 *
 * The visual identity is deliberately fixed-dark (independent of the site theme)
 * with amber/emerald accents so the center surface never reads as the public site.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Navbar } from "@/components/ui/Navbar";
import { Footer } from "@/components/ui/Footer";
import {
  AlertCircle,
  ArrowLeft,
  Building2,
  CheckCircle2,
  GraduationCap,
  KeyRound,
  Layers,
  Loader2,
  QrCode,
  Search,
  ShieldCheck,
  Sparkles,
  Users,
  XCircle,
} from "lucide-react";

/* ── Types ─────────────────────────────────────────────────────────────────── */

interface SessionUser {
  id?: string;
  name: string;
  role: string;
}

/** Shape returned by GET /api/codes/resolve */
interface ResolvedCode {
  valid: boolean;
  isActive: boolean;
  isUsed: boolean;
  isMine: boolean;
  code: string;
  accessType: string;
  scopeLabel: string;
  courseId: string;
  courseTitle: string;
  subject: string;
  educationalStage: string;
  thumbnailUrl: string | null;
  deliveryMode: string;
  teacherName: string;
  teacherPhoto: string | null;
}

/** Shape returned by GET /api/courses?mode=center */
interface CenterCourse {
  id: string;
  title: string;
  subject?: string;
  description?: string | null;
  thumbnailUrl?: string | null;
  educationalStage?: string;
  deliveryMode?: string;
  lessonsCount?: number;
  teacher: {
    id: string;
    name: string;
    teacherProfile?: { photoUrl?: string | null; displayName?: string | null; slug?: string | null } | null;
  };
  _count?: { accessCodes?: number; folders?: number };
  hasAccess?: boolean;
}

type PreviewStatus = "ok" | "mine" | "used" | "inactive";

/* ── Constants ─────────────────────────────────────────────────────────────── */

const STAGE_FILTERS: { value: string; label: string; short: string }[] = [
  { value: "all", label: "كل المراحل", short: "الكل" },
  { value: "sec_1", label: "الصف الأول الثانوي", short: "أولى ثانوي" },
  { value: "sec_2", label: "الصف الثاني الثانوي", short: "ثانية ثانوي" },
  { value: "sec_3", label: "الصف الثالث الثانوي", short: "ثالثة ثانوي" },
];

const STAGE_LABELS: Record<string, string> = {
  sec_1: "أولى ثانوي",
  sec_2: "ثانية ثانوي",
  sec_3: "ثالثة ثانوي",
  prep_1: "أولى إعدادي",
  prep_2: "ثانية إعدادي",
  prep_3: "ثالثة إعدادي",
};

/** Per-subject accent used for the card ribbon + badge, keyed by the Arabic subject name. */
const SUBJECT_ACCENTS: Record<string, string> = {
  رياضيات: "#60a5fa",
  فيزياء: "#a78bfa",
  كيمياء: "#34d399",
  أحياء: "#22d3ee",
  "لغة عربية": "#fbbf24",
  "لغة إنجليزية": "#fb7185",
  برمجة: "#f59e0b",
  "حاسب آلي": "#94a3b8",
};
const DEFAULT_ACCENT = "#f59e0b";

const HOW_IT_WORKS: { icon: typeof QrCode; title: string; body: string }[] = [
  {
    icon: QrCode,
    title: "١ — استلم كودك في القاعة",
    body: "كود مطبوع أو QR Code تمسحه بالكاميرا فيفتح لك هذه الصفحة والكود مكتوب تلقائياً.",
  },
  {
    icon: Sparkles,
    title: "٢ — راجع بطاقة المعاينة",
    body: "الصندوق الذكي يكشف لك اسم الأستاذ والكورس والمحاضرة قبل التفعيل، فلا تُفعّل كوداً بالخطأ.",
  },
  {
    icon: ShieldCheck,
    title: "٣ — فعّل وابدأ فوراً",
    body: "بضغطة واحدة يُضاف المحتوى إلى مكتبتك وتستمتع بمشاهدة عالية الدقة وحل الواجبات مباشرة.",
  },
];

/* ── Helpers ───────────────────────────────────────────────────────────────── */

/** Only same-origin or absolute http(s) thumbnails are rendered (blocks `//evil` and `javascript:`). */
const isSafeSrc = (src: string) => /^https?:\/\//i.test(src) || (src.startsWith("/") && !src.startsWith("//"));

const normalizeCode = (raw: string) => raw.toUpperCase().replace(/\s+/g, "");

const stageLabel = (stage?: string) => STAGE_LABELS[stage ?? ""] || stage || "";

const teacherNameOf = (course: CenterCourse) =>
  course.teacher?.teacherProfile?.displayName || course.teacher?.name || "المعلم";

function previewStatusOf(preview: ResolvedCode): PreviewStatus {
  if (!preview.isActive) return "inactive";
  if (preview.isMine) return "mine";
  if (preview.isUsed) return "used";
  return "ok";
}

/* ── Page ──────────────────────────────────────────────────────────────────── */

export default function CenterHubPage() {
  const router = useRouter();

  const [user, setUser] = useState<SessionUser | null>(null);
  const [userLoading, setUserLoading] = useState(true);

  // Smart code box
  const [code, setCode] = useState("");
  const [resolving, setResolving] = useState(false);
  const [preview, setPreview] = useState<ResolvedCode | null>(null);
  const [resolveError, setResolveError] = useState("");
  const [activating, setActivating] = useState(false);
  const [activationSuccess, setActivationSuccess] = useState("");
  const [activationError, setActivationError] = useState("");
  const [pendingCourse, setPendingCourse] = useState<{ id: string; title: string } | null>(null);
  const [scannedFromQr, setScannedFromQr] = useState(false);

  // Courses showcase
  const [courses, setCourses] = useState<CenterCourse[]>([]);
  const [coursesLoading, setCoursesLoading] = useState(true);
  const [coursesError, setCoursesError] = useState("");
  const [stage, setStage] = useState("all");
  const [query, setQuery] = useState("");

  const codeBoxRef = useRef<HTMLDivElement | null>(null);
  const codeInputRef = useRef<HTMLInputElement | null>(null);

  /* — Session — */
  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/me", { credentials: "include" })
      .then(async (r) => {
        const raw = await r.text();
        return raw ? JSON.parse(raw) : {};
      })
      .then((d) => {
        if (cancelled) return;
        setUser(d?.user ? { id: d.user.id, name: d.user.name, role: d.user.role } : null);
      })
      .catch(() => {
        if (!cancelled) setUser(null);
      })
      .finally(() => {
        if (!cancelled) setUserLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  /* — QR deep link: /center?code=XXXX prefills and scrolls to the box — */
  useEffect(() => {
    const fromUrl = new URLSearchParams(window.location.search).get("code");
    if (!fromUrl) return;
    // Applied after the first paint (rather than synchronously in the effect) so
    // the prefill never cascades an extra render before the hub is on screen.
    const timer = window.setTimeout(() => {
      setCode(normalizeCode(fromUrl));
      setScannedFromQr(true);
      codeBoxRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 300);
    return () => window.clearTimeout(timer);
  }, []);

  /* — Live code preview (debounced, abortable) — */
  useEffect(() => {
    const trimmed = code.trim();
    let cancelled = false;
    const controller = new AbortController();

    const timer = window.setTimeout(async () => {
      if (trimmed.length < 4) {
        setPreview(null);
        setResolveError("");
        setResolving(false);
        return;
      }

      setResolving(true);
      try {
        const res = await fetch(`/api/codes/resolve?code=${encodeURIComponent(trimmed)}`, {
          credentials: "include",
          signal: controller.signal,
        });
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;

        if (data?.courseTitle) {
          // The endpoint still describes used / inactive / already-mine codes,
          // which lets us explain *why* a code cannot be redeemed.
          setPreview(data as ResolvedCode);
          setResolveError("");
        } else {
          setPreview(null);
          setResolveError(data?.error || "الكود غير صحيح أو غير موجود");
        }
      } catch {
        if (!cancelled) {
          setPreview(null);
          setResolveError("تعذر فحص الكود الآن، تحقق من الإنترنت وحاول مجدداً");
        }
      } finally {
        if (!cancelled) setResolving(false);
      }
    }, trimmed.length < 4 ? 0 : 380);

    return () => {
      cancelled = true;
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [code]);

  /* — Center courses —
     No state is touched before the first `await`: the mount effect below calls
     this directly, and `coursesLoading` already starts as `true`. The retry
     button re-arms the loading/error state itself. */
  const loadCourses = useCallback(async () => {
    try {
      const res = await fetch("/api/courses?mode=center", { credentials: "include" });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setCourses(Array.isArray(data.courses) ? (data.courses as CenterCourse[]) : []);
        setCoursesError("");
      } else {
        setCoursesError(data?.error || "تعذر تحميل كورسات السنتر الآن");
      }
    } catch {
      setCoursesError("تعذر الاتصال بالخادم، تحقق من الإنترنت وحاول مجدداً");
    } finally {
      setCoursesLoading(false);
    }
  }, []);

  useEffect(() => {
    // Kicked off on the next task so the initial fetch never resolves into a
    // synchronous state update inside the effect body.
    const timer = window.setTimeout(loadCourses, 0);
    return () => window.clearTimeout(timer);
  }, [loadCourses]);

  /* — Derived — */
  const previewStatus = preview ? previewStatusOf(preview) : null;
  const canActivate = previewStatus === "ok" && !activating && !activationSuccess;

  const mismatchedCourse =
    pendingCourse && preview && preview.courseId !== pendingCourse.id ? pendingCourse : null;

  const blockedRole = user?.role === "teacher" || user?.role === "staff";

  const filteredCourses = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return courses.filter((course) => {
      if (stage !== "all" && course.educationalStage !== stage) return false;
      if (!needle) return true;
      return [course.title, course.subject, teacherNameOf(course)]
        .filter(Boolean)
        .some((field) => String(field).toLowerCase().includes(needle));
    });
  }, [courses, stage, query]);

  /* — Actions — */
  const focusCodeBox = useCallback((course?: CenterCourse) => {
    if (course) setPendingCourse({ id: course.id, title: course.title });
    codeBoxRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    window.setTimeout(() => codeInputRef.current?.focus(), 420);
  }, []);

  const handleActivate = async (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = code.trim();
    if (!trimmed || activating) return;

    if (!user) {
      router.push(`/login?redirect_url=${encodeURIComponent(`/center?code=${trimmed}`)}`);
      return;
    }

    setActivating(true);
    setActivationError("");
    setActivationSuccess("");

    try {
      const res = await fetch("/api/codes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ code: normalizeCode(trimmed) }),
      });
      const data = await res.json().catch(() => ({}));

      if (res.ok) {
        setActivationSuccess(data?.message || "تم تفعيل الكود وإضافة المحتوى إلى مكتبتك بنجاح!");
        setPendingCourse(null);
        window.setTimeout(() => {
          router.push("/library");
          router.refresh();
        }, 1400);
      } else if (res.status === 401) {
        router.push(`/login?redirect_url=${encodeURIComponent(`/center?code=${trimmed}`)}`);
      } else {
        setActivationError(data?.error || "فشل تفعيل الكود، تأكد من صحة الكود المسلّم لك");
      }
    } catch {
      setActivationError("تعذر الاتصال بالخادم، تحقق من الإنترنت وحاول مجدداً");
    } finally {
      setActivating(false);
    }
  };

  /* — Render — */
  return (
    <div dir="rtl" className="min-h-screen bg-[#05080f] text-slate-100">
      <Navbar user={userLoading ? undefined : user} />

      {/* ══ Hero ══════════════════════════════════════════════════════════════ */}
      <section className="relative overflow-hidden border-b border-amber-500/15">
        {/* Ambient glows + grid */}
        <div aria-hidden className="pointer-events-none absolute inset-0">
          <div className="absolute -top-40 right-1/4 h-[420px] w-[420px] rounded-full bg-amber-500/12 blur-[130px]" />
          <div className="absolute -bottom-48 left-1/5 h-[380px] w-[380px] rounded-full bg-emerald-500/10 blur-[120px]" />
          <div
            className="absolute inset-0 opacity-[0.35]"
            style={{
              backgroundImage:
                "linear-gradient(to left, rgba(245,158,11,0.055) 1px, transparent 1px), linear-gradient(to bottom, rgba(245,158,11,0.055) 1px, transparent 1px)",
              backgroundSize: "56px 56px",
              maskImage: "radial-gradient(ellipse at 50% 0%, #000 35%, transparent 78%)",
              WebkitMaskImage: "radial-gradient(ellipse at 50% 0%, #000 35%, transparent 78%)",
            }}
          />
        </div>

        <div className="relative max-w-6xl mx-auto px-5 sm:px-7 pt-12 sm:pt-16 pb-12 sm:pb-16">
          <div className="inline-flex items-center gap-2 rounded-full border border-amber-400/30 bg-amber-400/10 px-3.5 py-1.5 text-[11px] sm:text-xs font-black text-amber-300 animate-fade-up">
            <Building2 className="h-3.5 w-3.5" />
            <span>نطاق حصري لطلاب السنتر — center.code-up.tech</span>
          </div>

          <h1 className="mt-5 text-2xl sm:text-4xl lg:text-[2.9rem] font-black leading-[1.35] tracking-tight animate-fade-up">
            <span className="bg-gradient-to-l from-amber-200 via-amber-400 to-amber-200 bg-clip-text text-transparent">
              بوابة طلاب السنتر 🏛️
            </span>
            <span className="text-slate-100"> — منصة الحصص والمجموعات الحضورية</span>
          </h1>

          <p className="mt-4 max-w-2xl text-sm sm:text-base leading-8 text-slate-300/90 animate-fade-up">
            هنا يعيش محتوى حصصك ومجموعاتك الحضورية. استلم كود المحاضرة من أستاذك داخل القاعة — أو امسح الـ QR Code —
            وفعّله في الصندوق الذكي بالأسفل لتنزل المحاضرة فوراً في مكتبتك وتبدأ المشاهدة مباشرة.
          </p>

          <div className="mt-7 flex flex-wrap items-center gap-3 animate-fade-up">
            <button
              type="button"
              onClick={() => focusCodeBox()}
              className="inline-flex cursor-pointer items-center gap-2 rounded-2xl bg-gradient-to-l from-amber-500 to-amber-400 px-5 py-3 text-sm font-black text-slate-950 shadow-lg shadow-amber-500/25 transition-all hover:from-amber-400 hover:to-amber-300 active:scale-95"
            >
              <KeyRound className="h-4 w-4" />
              <span>تفعيل كود الحصة الآن</span>
            </button>
            <a
              href="#center-courses"
              className="inline-flex items-center gap-2 rounded-2xl border border-slate-700 bg-slate-900/60 px-5 py-3 text-sm font-black text-slate-200 transition-all hover:border-amber-400/50 hover:text-amber-300"
            >
              <Layers className="h-4 w-4" />
              <span>تصفح كورسات السنتر</span>
            </a>
            {user ? (
              <Link
                href="/library"
                className="inline-flex items-center gap-2 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-5 py-3 text-sm font-black text-emerald-300 transition-all hover:bg-emerald-500/20"
              >
                <GraduationCap className="h-4 w-4" />
                <span>مكتبتي</span>
              </Link>
            ) : null}
          </div>
        </div>
      </section>

      {/* ══ Unified smart code box ════════════════════════════════════════════ */}
      <section ref={codeBoxRef} className="relative scroll-mt-24 px-5 sm:px-7 py-12 sm:py-16">
        <div className="mx-auto max-w-3xl">
          <div className="relative overflow-hidden rounded-[28px] border border-amber-500/25 bg-gradient-to-b from-slate-900/90 to-slate-950 p-5 sm:p-8 shadow-2xl shadow-black/50">
            <div
              aria-hidden
              className="pointer-events-none absolute -top-24 left-1/2 h-56 w-56 -translate-x-1/2 rounded-full bg-amber-500/15 blur-[90px]"
            />

            <div className="relative flex items-start gap-3.5">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-amber-400/30 bg-amber-400/10 text-amber-400">
                <KeyRound className="h-6 w-6" />
              </div>
              <div>
                <h2 className="text-lg sm:text-xl font-black text-white">صندوق التفعيل الذكي</h2>
                <p className="mt-1 text-xs sm:text-[13px] leading-6 text-slate-400">
                  اكتب كود السنتر المسلّم لك، وسنكشف لك تفاصيله فوراً قبل التفعيل.
                </p>
              </div>
            </div>

            {/* QR deep-link notice */}
            {scannedFromQr ? (
              <div className="relative mt-5 flex items-center gap-2 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-[12px] font-bold text-emerald-300">
                <QrCode className="h-4 w-4 shrink-0" />
                <span>تم قراءة الكود من رابط الـ QR Code تلقائياً — راجع البيانات بالأسفل ثم فعّل.</span>
              </div>
            ) : null}

            {/* Course targeted from a showcase card */}
            {pendingCourse ? (
              <div className="relative mt-5 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-slate-700 bg-slate-900/70 px-4 py-3">
                <p className="text-[12px] font-bold text-slate-300">
                  أنت تُفعّل كود كورس:{" "}
                  <span className="text-amber-300">{pendingCourse.title}</span>
                </p>
                <button
                  type="button"
                  onClick={() => setPendingCourse(null)}
                  className="cursor-pointer text-[11px] font-black text-slate-500 transition-colors hover:text-rose-400"
                >
                  إلغاء التحديد
                </button>
              </div>
            ) : null}

            <form onSubmit={handleActivate} className="relative mt-5 space-y-4">
              <div>
                <label htmlFor="center-code" className="mb-2 block text-xs font-black text-slate-300">
                  كود السنتر
                </label>
                <div className="relative">
                  <input
                    id="center-code"
                    ref={codeInputRef}
                    type="text"
                    inputMode="text"
                    autoComplete="off"
                    spellCheck={false}
                    dir="ltr"
                    placeholder="CNTR-XXXX-XXXX"
                    value={code}
                    onChange={(event) => {
                      setCode(normalizeCode(event.target.value));
                      setActivationError("");
                      setActivationSuccess("");
                    }}
                    className="w-full rounded-2xl border-2 border-slate-800 bg-slate-950/80 px-4 py-4 sm:py-5 text-center font-mono text-lg sm:text-2xl font-black tracking-[0.28em] text-amber-300 outline-none transition-all placeholder:text-sm placeholder:tracking-normal placeholder:text-slate-700 focus:border-amber-500/70 focus:shadow-[0_0_0_4px_rgba(245,158,11,0.12)]"
                  />
                  {resolving ? (
                    <Loader2 className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 animate-spin text-amber-400" />
                  ) : null}
                </div>
                <p className="mt-2 text-[11px] text-slate-500">
                  الكود مكوّن من حروف وأرقام، ولا يُفعّل إلا مرة واحدة على حساب واحد فقط.
                </p>
              </div>

              {/* ── Smart preview card ── */}
              {preview ? (
                <div
                  className={`animate-fade-up overflow-hidden rounded-2xl border ${
                    previewStatus === "ok"
                      ? "border-emerald-500/35 bg-emerald-500/[0.07]"
                      : previewStatus === "mine"
                        ? "border-sky-500/35 bg-sky-500/[0.07]"
                        : "border-amber-500/35 bg-amber-500/[0.07]"
                  }`}
                >
                  <div className="flex items-center gap-2 border-b border-white/5 px-4 py-2.5">
                    <Sparkles
                      className={`h-4 w-4 ${previewStatus === "ok" ? "text-emerald-400" : "text-amber-400"}`}
                    />
                    <p
                      className={`text-[12px] font-black ${
                        previewStatus === "ok"
                          ? "text-emerald-300"
                          : previewStatus === "mine"
                            ? "text-sky-300"
                            : "text-amber-300"
                      }`}
                    >
                      {previewStatus === "ok"
                        ? "كود صالح — تم التعرف على محتواه"
                        : previewStatus === "mine"
                          ? "هذا الكود مُفعّل بالفعل على حسابك"
                          : previewStatus === "used"
                            ? "هذا الكود مستخدم على حساب طالب آخر"
                            : "هذا الكود موقوف حالياً من قبل المعلم"}
                    </p>
                  </div>

                  <div className="flex gap-3.5 p-4">
                    {preview.thumbnailUrl && isSafeSrc(preview.thumbnailUrl) ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={preview.thumbnailUrl}
                        alt=""
                        className="h-20 w-24 shrink-0 rounded-xl border border-white/10 object-cover"
                      />
                    ) : (
                      <div className="flex h-20 w-24 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-slate-900">
                        <Building2 className="h-7 w-7 text-slate-600" />
                      </div>
                    )}

                    <div className="min-w-0 flex-1 space-y-1.5">
                      <p className="truncate text-sm font-black text-white">{preview.courseTitle}</p>
                      <p className="flex items-center gap-1.5 text-[12px] text-slate-300">
                        <Users className="h-3.5 w-3.5 text-amber-400" />
                        الأستاذ: <span className="font-black text-amber-200">{preview.teacherName}</span>
                      </p>
                      <p className="flex items-center gap-1.5 text-[11px] text-slate-400">
                        <Layers className="h-3.5 w-3.5" />
                        {preview.scopeLabel}
                      </p>
                      <div className="flex flex-wrap gap-1.5 pt-0.5">
                        {preview.subject ? (
                          <span className="rounded-md bg-white/5 px-2 py-0.5 text-[10px] font-bold text-slate-300">
                            {preview.subject}
                          </span>
                        ) : null}
                        {preview.educationalStage ? (
                          <span className="rounded-md bg-white/5 px-2 py-0.5 text-[10px] font-bold text-slate-300">
                            {stageLabel(preview.educationalStage)}
                          </span>
                        ) : null}
                        <span className="rounded-md bg-amber-400/10 px-2 py-0.5 text-[10px] font-bold text-amber-300">
                          {preview.deliveryMode === "ONLINE" ? "كورس أونلاين" : "محتوى سنتر حضوري"}
                        </span>
                      </div>
                    </div>
                  </div>

                  {previewStatus === "mine" ? (
                    <div className="border-t border-white/5 px-4 py-3">
                      <Link
                        href={`/courses/${preview.courseId}`}
                        className="inline-flex items-center gap-1.5 text-[12px] font-black text-sky-300 hover:text-sky-200"
                      >
                        <span>الذهاب إلى الكورس مباشرة</span>
                        <ArrowLeft className="h-3.5 w-3.5" />
                      </Link>
                    </div>
                  ) : null}
                </div>
              ) : null}

              {/* ── Feedback ── */}
              {mismatchedCourse && previewStatus === "ok" ? (
                <div className="flex items-start gap-2 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-[12px] font-bold text-amber-300">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>
                    تنبيه: هذا الكود يخص كورساً مختلفاً عن «{mismatchedCourse.title}» الذي اخترته. راجع الكود قبل التفعيل.
                  </span>
                </div>
              ) : null}

              {resolveError && !preview ? (
                <div className="flex items-center gap-2 rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-[12px] font-bold text-rose-300">
                  <XCircle className="h-4 w-4 shrink-0" />
                  <span>{resolveError}</span>
                </div>
              ) : null}

              {blockedRole ? (
                <div className="flex items-center gap-2 rounded-2xl border border-slate-700 bg-slate-900/70 px-4 py-3 text-[12px] font-bold text-slate-300">
                  <AlertCircle className="h-4 w-4 shrink-0 text-amber-400" />
                  <span>تفعيل أكواد السنتر متاح لحسابات الطلاب فقط — أنت مسجّل الدخول بحساب غير طالب.</span>
                </div>
              ) : null}

              {activationError ? (
                <div className="flex items-center gap-2 rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-[12px] font-bold text-rose-300">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>{activationError}</span>
                </div>
              ) : null}

              {activationSuccess ? (
                <div className="flex items-center gap-2 rounded-2xl border border-emerald-500/35 bg-emerald-500/10 px-4 py-3 text-[12px] font-black text-emerald-300">
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                  <span>{activationSuccess}</span>
                </div>
              ) : null}

              <button
                type="submit"
                disabled={!code.trim() || activating || !!activationSuccess || (!!preview && !canActivate)}
                className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-2xl bg-gradient-to-l from-amber-500 to-amber-400 py-4 text-sm font-black text-slate-950 shadow-xl shadow-amber-500/20 transition-all hover:from-amber-400 hover:to-amber-300 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-45 disabled:shadow-none"
              >
                {activating ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>جارٍ تفعيل الكود...</span>
                  </>
                ) : activationSuccess ? (
                  <>
                    <CheckCircle2 className="h-4 w-4" />
                    <span>تم التفعيل — جارٍ تحويلك إلى المكتبة</span>
                  </>
                ) : !user && !userLoading ? (
                  <>
                    <ShieldCheck className="h-4 w-4" />
                    <span>سجّل الدخول لتفعيل الكود</span>
                  </>
                ) : (
                  <>
                    <span>تفعيل وإضافة المحتوى إلى مكتبتي</span>
                    <ArrowLeft className="h-4 w-4" />
                  </>
                )}
              </button>
            </form>
          </div>

          {/* How it works */}
          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            {HOW_IT_WORKS.map((step) => (
              <div
                key={step.title}
                className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4 transition-colors hover:border-amber-500/25"
              >
                <step.icon className="mb-2 h-4.5 w-4.5 text-amber-400" />
                <p className="text-[12px] font-black text-white">{step.title}</p>
                <p className="mt-1 text-[11px] leading-6 text-slate-400">{step.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══ Center courses showcase ═══════════════════════════════════════════ */}
      <section id="center-courses" className="scroll-mt-20 border-t border-slate-900 px-5 sm:px-7 py-12 sm:py-16">
        <div className="mx-auto max-w-6xl">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 className="flex items-center gap-2 text-xl sm:text-2xl font-black text-white">
                <Layers className="h-5 w-5 text-amber-400" />
                كورسات السنتر المتاحة
              </h2>
              <p className="mt-1.5 text-xs sm:text-[13px] text-slate-400">
                هذه الكورسات مخصّصة لطلاب الحصص الحضورية، ويُفتح محتواها بكود المحاضرة فقط.
              </p>
            </div>

            <div className="relative w-full sm:w-72">
              <Search className="absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="ابحث بالكورس أو المادة أو الأستاذ"
                className="w-full rounded-2xl border border-slate-800 bg-slate-900/60 py-3 pr-10 pl-4 text-[13px] font-bold text-slate-100 outline-none transition-colors placeholder:font-normal placeholder:text-slate-600 focus:border-amber-500/50"
              />
            </div>
          </div>

          {/* Stage filter */}
          <div className="mt-6 flex flex-wrap gap-2">
            {STAGE_FILTERS.map((filter) => {
              const active = stage === filter.value;
              const count =
                filter.value === "all"
                  ? courses.length
                  : courses.filter((course) => course.educationalStage === filter.value).length;
              return (
                <button
                  key={filter.value}
                  type="button"
                  onClick={() => setStage(filter.value)}
                  aria-pressed={active}
                  title={filter.label}
                  className={`cursor-pointer rounded-full border px-4 py-2 text-[12px] font-black transition-all ${
                    active
                      ? "border-amber-400/60 bg-amber-400/15 text-amber-300 shadow-[0_0_0_3px_rgba(245,158,11,0.08)]"
                      : "border-slate-800 bg-slate-900/50 text-slate-400 hover:border-slate-600 hover:text-slate-200"
                  }`}
                >
                  {filter.short}
                  <span className="mr-1.5 text-[10px] opacity-70 tabular-nums">{count}</span>
                </button>
              );
            })}
          </div>

          {/* Grid */}
          <div className="mt-7">
            {coursesLoading ? (
              <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {[0, 1, 2, 3, 4, 5].map((index) => (
                  <div
                    key={index}
                    className="h-72 animate-pulse rounded-3xl border border-slate-800 bg-slate-900/40"
                  />
                ))}
              </div>
            ) : coursesError ? (
              <div className="rounded-3xl border border-rose-500/25 bg-rose-500/[0.06] p-8 text-center">
                <XCircle className="mx-auto mb-3 h-8 w-8 text-rose-400" />
                <p className="text-sm font-black text-rose-200">{coursesError}</p>
                <button
                  type="button"
                  onClick={() => {
                    setCoursesLoading(true);
                    setCoursesError("");
                    loadCourses();
                  }}
                  className="mt-4 cursor-pointer rounded-xl border border-rose-500/40 px-4 py-2 text-[12px] font-black text-rose-300 transition-colors hover:bg-rose-500/10"
                >
                  إعادة المحاولة
                </button>
              </div>
            ) : filteredCourses.length === 0 ? (
              <div className="rounded-3xl border border-slate-800 bg-slate-900/40 p-10 text-center">
                <Building2 className="mx-auto mb-3 h-9 w-9 text-slate-700" />
                <p className="text-sm font-black text-slate-300">
                  {courses.length === 0
                    ? "لا توجد كورسات سنتر منشورة حالياً"
                    : "لا توجد كورسات مطابقة لبحثك أو للمرحلة المختارة"}
                </p>
                <p className="mt-1.5 text-xs text-slate-500">
                  يمكنك دائماً تفعيل كود الحصة المسلّم لك من الصندوق الذكي بالأعلى.
                </p>
              </div>
            ) : (
              <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {filteredCourses.map((course) => {
                  const accent = SUBJECT_ACCENTS[course.subject ?? ""] ?? DEFAULT_ACCENT;
                  const thumb =
                    course.thumbnailUrl && isSafeSrc(course.thumbnailUrl) ? course.thumbnailUrl : null;
                  return (
                    <article
                      key={course.id}
                      className="group flex flex-col overflow-hidden rounded-3xl border border-slate-800 bg-slate-900/50 transition-all duration-300 hover:-translate-y-1 hover:border-amber-500/35 hover:shadow-2xl hover:shadow-black/40"
                    >
                      {/* Cover */}
                      <div className="relative h-36 overflow-hidden bg-slate-950">
                        {thumb ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={thumb}
                            alt={course.title}
                            loading="lazy"
                            className="h-full w-full object-cover opacity-80 transition-transform duration-500 group-hover:scale-105"
                          />
                        ) : (
                          <div
                            className="flex h-full w-full items-center justify-center"
                            style={{ background: `linear-gradient(135deg, ${accent}22, #0b1120)` }}
                          >
                            <Building2 className="h-10 w-10" style={{ color: accent }} />
                          </div>
                        )}
                        <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/25 to-transparent" />
                        <span
                          className="absolute right-3 top-3 rounded-full px-2.5 py-1 text-[10px] font-black text-slate-950"
                          style={{ background: accent }}
                        >
                          {course.subject || "مادة دراسية"}
                        </span>
                        {course.hasAccess ? (
                          <span className="absolute left-3 top-3 flex items-center gap-1 rounded-full bg-emerald-500/90 px-2.5 py-1 text-[10px] font-black text-slate-950">
                            <CheckCircle2 className="h-3 w-3" />
                            مُفعّل
                          </span>
                        ) : null}
                      </div>

                      {/* Body */}
                      <div className="flex flex-1 flex-col p-4">
                        <h3 className="line-clamp-2 text-[15px] font-black leading-7 text-white">
                          {course.title}
                        </h3>

                        <div className="mt-2.5 flex items-center gap-2">
                          <div className="flex h-7 w-7 items-center justify-center rounded-full border border-slate-700 bg-slate-800 text-[10px] font-black text-amber-300">
                            {teacherNameOf(course).charAt(0)}
                          </div>
                          <p className="truncate text-[12px] font-bold text-slate-300">
                            {teacherNameOf(course)}
                          </p>
                        </div>

                        <div className="mt-3 flex flex-wrap gap-1.5">
                          <span className="rounded-lg bg-white/5 px-2 py-1 text-[10px] font-bold text-slate-300">
                            {stageLabel(course.educationalStage) || "كل المراحل"}
                          </span>
                          <span className="flex items-center gap-1 rounded-lg bg-white/5 px-2 py-1 text-[10px] font-bold text-slate-300">
                            <GraduationCap className="h-3 w-3 text-amber-400" />
                            {course.lessonsCount ?? 0} حصة
                          </span>
                          {course.deliveryMode === "BOTH" ? (
                            <span className="rounded-lg bg-emerald-400/10 px-2 py-1 text-[10px] font-bold text-emerald-300">
                              سنتر + أونلاين
                            </span>
                          ) : null}
                        </div>

                        <div className="mt-4 flex items-center gap-2 border-t border-slate-800 pt-3.5">
                          {course.hasAccess ? (
                            <Link
                              href={`/courses/${course.id}`}
                              className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-emerald-500/40 bg-emerald-500/10 py-2.5 text-[12px] font-black text-emerald-300 transition-colors hover:bg-emerald-500/20"
                            >
                              <span>ادخل إلى الكورس</span>
                              <ArrowLeft className="h-3.5 w-3.5" />
                            </Link>
                          ) : (
                            <button
                              type="button"
                              onClick={() => focusCodeBox(course)}
                              className="flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-xl bg-gradient-to-l from-amber-500 to-amber-400 py-2.5 text-[12px] font-black text-slate-950 transition-all hover:from-amber-400 hover:to-amber-300 active:scale-95"
                            >
                              <KeyRound className="h-3.5 w-3.5" />
                              <span>تفعيل بالكود</span>
                            </button>
                          )}
                          <Link
                            href={`/courses/${course.id}`}
                            className="rounded-xl border border-slate-700 px-3 py-2.5 text-[12px] font-black text-slate-300 transition-colors hover:border-amber-400/50 hover:text-amber-300"
                          >
                            التفاصيل
                          </Link>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
