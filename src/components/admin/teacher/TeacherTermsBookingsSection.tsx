"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useToast } from "@/components/ui/Toast";
import { STAGE_LABELS } from "@/lib/teacher-roster-types";
import {
  CalendarDays,
  Layers,
  Save,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Users,
  Edit2,
  RefreshCw,
  Search,
} from "lucide-react";

type Course = {
  id: string;
  title: string;
  educationalStage: string | null;
  price: number | null;
  isPaid: boolean;
  bookingKind: string | null;
  bookingTerm: number | null;
};

type Term = {
  educationalStage: string;
  termNumber: number;
  endsAt: string | null;
  onSale: boolean;
};

type Booking = {
  id: string;
  studentId: string;
  studentName: string | null;
  studentPhone?: string | null;
  planType: string;
  educationalStage: string | null;
  languageTrack: string | null;
  termNumbers: number[];
  amount: number;
  paymentSource: string;
  status: string;
  expiresAt: string | null;
  createdAt: string;
};

type TeacherState = {
  courses: Course[];
  terms: Term[];
  bookings: Booking[];
};

const PLACEMENT_OPTIONS = [
  { value: "month:1", label: "كورس شهر (الترم 1)", shortLabel: "📅 شهري (ترم 1)", badge: "sky" },
  { value: "term:1", label: "كورس الترم 1 كامل", shortLabel: "📚 ترم 1 كامل", badge: "indigo" },
  { value: "month:2", label: "كورس شهر (الترم 2)", shortLabel: "📅 شهري (ترم 2)", badge: "sky" },
  { value: "term:2", label: "كورس الترم 2 كامل", shortLabel: "📚 ترم 2 كامل", badge: "indigo" },
  { value: "extra", label: "ورشة منفصلة", shortLabel: "⭐ ورشة مستقلة", badge: "amber" },
  { value: "none", label: "خارج الحجوزات", shortLabel: "🚫 خارج الحجوزات", badge: "rose" },
];

const togglePlacementOption = (currentRaw: string, optionValue: string): string => {
  const currentTokens = currentRaw.split(",").map((s) => s.trim()).filter(Boolean);

  if (optionValue === "none") {
    return currentTokens.includes("none") ? "" : "none";
  }
  if (optionValue === "extra") {
    return currentTokens.includes("extra") ? "" : "extra";
  }

  let newTokens = currentTokens.filter((t) => t !== "none" && t !== "extra");
  if (newTokens.includes(optionValue)) {
    newTokens = newTokens.filter((t) => t !== optionValue);
  } else {
    newTokens.push(optionValue);
  }
  return newTokens.join(",");
};

const getPlacementTokens = (raw: string): string[] => {
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
};

const describePlacement = (raw: string): { text: string; color: string } => {
  if (!raw) {
    return {
      text: "لم يُحدد بعد (القواعد القديمة)",
      color: "text-slate-400 bg-slate-800/40 border-slate-700/50",
    };
  }
  if (raw === "none") {
    return {
      text: "خارج الحجوزات (لا يفتح بأي باقة اشتراك)",
      color: "text-rose-400 bg-rose-500/10 border-rose-500/20",
    };
  }
  if (raw === "extra") {
    return {
      text: "ورشة / مراجعة منفصلة (تباع مستقلاً فقط)",
      color: "text-amber-400 bg-amber-500/10 border-amber-500/20",
    };
  }

  const tokens = getPlacementTokens(raw);
  const parts: string[] = [];

  const hasM1 = tokens.includes("month:1");
  const hasT1 = tokens.includes("term:1");
  const hasM2 = tokens.includes("month:2");
  const hasT2 = tokens.includes("term:2");

  if (hasM1 && hasT1) {
    parts.push("شهري وترم 1 كامل");
  } else if (hasM1) {
    parts.push("شهري وترم 1 كامل");
  } else if (hasT1) {
    parts.push("ترم 1 كامل فقط");
  }

  if (hasM2 && hasT2) {
    parts.push("شهري وترم 2 كامل");
  } else if (hasM2) {
    parts.push("شهري وترم 2 كامل");
  } else if (hasT2) {
    parts.push("ترم 2 كامل فقط");
  }

  if (tokens.some((t) => t.startsWith("month:") || t.startsWith("term:"))) {
    parts.push("باقة السنة");
  }

  return {
    text: `متاح لمشتركي: ${parts.join(" · ")}`,
    color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/25",
  };
};

const PLAN_LABELS: Record<string, string> = {
  monthly: "شهري",
  termly: "ترم",
  yearly: "سنة",
};

const toPlacement = (c: Course) =>
  !c.bookingKind
    ? ""
    : c.bookingKind === "month" || c.bookingKind === "term"
    ? `${c.bookingKind}:${c.bookingTerm ?? 1}`
    : c.bookingKind;

const fromPlacement = (v: string) => {
  if (!v) return { bookingKind: null, bookingTerm: null };
  let primaryTerm: number | null = null;
  const match = v.match(/(?:month|term):([12])/);
  if (match) primaryTerm = Number(match[1]);
  return { bookingKind: v, bookingTerm: primaryTerm };
};

const dateInput = (iso: string | null) => (iso ? iso.slice(0, 10) : "");
const isRunning = (b: Booking) =>
  b.status === "active" && (!b.expiresAt || new Date(b.expiresAt) > new Date());

export function TeacherTermsBookingsSection() {
  const { success: toastSuccess, error: toastError } = useToast();
  const [loading, setLoading] = useState(true);
  const [state, setState] = useState<TeacherState | null>(null);
  const [placements, setPlacements] = useState<Record<string, string>>({});
  const [terms, setTerms] = useState<Record<string, Term>>({});
  const [stage, setStage] = useState("");
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState<"running" | "all">("running");
  const [search, setSearch] = useState("");
  const [edits, setEdits] = useState<Record<string, Partial<Booking>>>({});

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/teacher/terms", { credentials: "include" });
      const d = await res.json();
      if (d.error) {
        toastError(d.error);
        return;
      }
      setState(d);
      setPlacements(Object.fromEntries(d.courses.map((c: Course) => [c.id, toPlacement(c)])));
      setTerms(
        Object.fromEntries(d.terms.map((t: Term) => [`${t.educationalStage}|${t.termNumber}`, t]))
      );
      setEdits({});
    } catch {
      toastError("تعذر تحميل بيانات التيرمات");
    } finally {
      setLoading(false);
    }
  }, [toastError]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const stages = useMemo(() => {
    const set = new Set<string>();
    state?.courses.forEach((c) => c.educationalStage && set.add(c.educationalStage));
    state?.bookings.forEach(
      (b) => b.educationalStage && b.educationalStage !== "الكل" && set.add(b.educationalStage)
    );
    return [...set].sort();
  }, [state]);

  useEffect(() => {
    if (stages.length && !stages.includes(stage)) {
      setStage(stages[0]);
    }
  }, [stages, stage]);

  const term = (n: number): Term =>
    terms[`${stage}|${n}`] ?? {
      educationalStage: stage,
      termNumber: n,
      endsAt: null,
      onSale: false,
    };

  const setTermPatch = (n: number, patch: Partial<Term>) =>
    setTerms((p) => ({ ...p, [`${stage}|${n}`]: { ...term(n), ...patch } }));

  const hasUnsavedChanges = useMemo(() => {
    if (!state) return false;
    const coursesChanged = state.courses.some(
      (c) => toPlacement(c) !== (placements[c.id] ?? "")
    );
    const termsChanged = Object.values(terms).some((t) => {
      const orig = state.terms.find(
        (ot) => ot.educationalStage === t.educationalStage && ot.termNumber === t.termNumber
      );
      if (!orig) return t.endsAt !== null || t.onSale !== false;
      return dateInput(orig.endsAt) !== dateInput(t.endsAt) || orig.onSale !== t.onSale;
    });
    return coursesChanged || termsChanged;
  }, [state, placements, terms]);

  const saveAll = async () => {
    if (!state) return;
    const payload = {
      courses: state.courses
        .filter((c) => toPlacement(c) !== (placements[c.id] ?? ""))
        .map((c) => ({ id: c.id, ...fromPlacement(placements[c.id] ?? "") })),
      terms: Object.values(terms),
    };
    setBusy(true);
    try {
      const checkRes = await fetch("/api/teacher/terms", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ ...payload, preview: true }),
      });
      const check = await checkRes.json();
      if (check.error) {
        toastError(check.error);
        return;
      }

      const lines = (check.losses ?? []).map(
        (l: { title: string; students: number }) => `• "${l.title}": ${l.students} طالب سينتهي وصولهم للكورس`
      );
      if (lines.length && !window.confirm(`⚠️ تنبيه قبل الحفظ:\n\n${lines.join("\n")}\n\nهل تريد المتابعة بالتأكيد؟`)) {
        return;
      }

      const saveRes = await fetch("/api/teacher/terms", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      const d = await saveRes.json();
      if (d.error) {
        toastError(d.error);
        return;
      }

      setState(d);
      setPlacements(Object.fromEntries(d.courses.map((c: Course) => [c.id, toPlacement(c)])));
      setTerms(
        Object.fromEntries(d.terms.map((t: Term) => [`${t.educationalStage}|${t.termNumber}`, t]))
      );
      setEdits({});
      toastSuccess("تم حفظ إعدادات التيرمات والكورسات بنجاح ✅");
    } catch {
      toastError("فشل حفظ التعديلات");
    } finally {
      setBusy(false);
    }
  };

  const applyEndDate = async (n: number) => {
    try {
      const prevRes = await fetch("/api/teacher/terms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ action: "applyEndDate", educationalStage: stage, termNumber: n, preview: true }),
      });
      const p = await prevRes.json();
      if (p.error) {
        toastError(p.error);
        return;
      }

      const when = new Date(p.endsAt).toLocaleDateString("ar-EG");
      if (
        !window.confirm(
          `تطبيق تاريخ النهاية (${when}) على ${p.total} حجز ترم ${n === 2 ? "ثانٍ" : "أول"} ساري.\n${
            p.shortened > 0 ? `⚠️ ${p.shortened} طالب منهم ستنتهي باقتهم مبكراً عن تاريخهم الحالي.\n` : ""
          }هل أنت متأكد؟`
        )
      ) {
        return;
      }

      const res = await fetch("/api/teacher/terms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ action: "applyEndDate", educationalStage: stage, termNumber: n }),
      });
      const d = await res.json();
      if (d.error) {
        toastError(d.error);
        return;
      }
      setState(d);
      toastSuccess(`تم تحديث ${d.updated} حجز بنجاح ✅`);
    } catch {
      toastError("فشل تطبيق التاريخ على الحجوزات");
    }
  };

  const saveBooking = async (b: Booking) => {
    const e = edits[b.id];
    if (!e) return;
    try {
      const res = await fetch("/api/teacher/terms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ action: "updateBooking", bookingId: b.id, ...e }),
      });
      const d = await res.json();
      if (d.error) {
        toastError(d.error);
        return;
      }
      setState(d);
      setEdits((p) => {
        const next = { ...p };
        delete next[b.id];
        return next;
      });
      toastSuccess("تم تعديل بيانات الحجز ✅");
    } catch {
      toastError("فشل حفظ تعديل الحجز");
    }
  };

  const stageCourses = (state?.courses ?? []).filter((c) => c.educationalStage === stage);
  const stageBookings = (state?.bookings ?? []).filter((b) => {
    const matchesStage = b.educationalStage === stage || !b.educationalStage || b.educationalStage === "الكل";
    const matchesFilter = filter === "all" || isRunning(b);
    const matchesSearch =
      !search ||
      (b.studentName && b.studentName.toLowerCase().includes(search.toLowerCase())) ||
      (b.studentPhone && b.studentPhone.includes(search));
    return matchesStage && matchesFilter && matchesSearch;
  });

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center text-slate-400">
        <RefreshCw size={24} className="animate-spin ml-2" />
        <span>جاري تحميل بيانات التيرمات والحجوزات...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6" dir="rtl">
      {/* Top Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-800 bg-slate-900/60 p-5 backdrop-blur-sm">
        <div>
          <h2 className="flex items-center gap-2.5 text-xl font-bold text-white">
            <CalendarDays size={24} className="text-sky-400" />
            <span>إدارة التيرمات والحجوزات للكورسات</span>
          </h2>
          <p className="mt-1 text-sm text-slate-400">
            حدد موقع كل كورس (شهر أو تيرم كامل)، ومواعيد انتهاء التيرمات، وتفعيل حجز التيرم للطلاب
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={loadData}
            disabled={busy}
            className="flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800 px-3.5 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-700 disabled:opacity-50 transition-all"
          >
            <RefreshCw size={14} />
            <span>تحديث</span>
          </button>

          <button
            type="button"
            onClick={saveAll}
            disabled={busy || !hasUnsavedChanges}
            className={`flex items-center gap-2 rounded-xl px-5 py-2 text-sm font-bold shadow-lg transition-all ${
              hasUnsavedChanges
                ? "bg-sky-500 text-white shadow-sky-500/25 hover:bg-sky-400 animate-pulse"
                : "bg-slate-800 text-slate-500 border border-slate-700/60 cursor-not-allowed"
            }`}
          >
            <Save size={16} />
            <span>حفظ التعديلات</span>
          </button>
        </div>
      </div>

      {/* Stage Selector Tabs */}
      {stages.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-800 pb-3">
          <span className="text-xs font-semibold text-slate-400 ml-2">المرحلة الدراسية:</span>
          {stages.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStage(s)}
              className={`rounded-xl px-4 py-2 text-xs font-bold transition-all ${
                stage === s
                  ? "bg-sky-500/15 text-sky-400 border border-sky-500/30 shadow-sm"
                  : "bg-slate-900/60 text-slate-400 border border-slate-800 hover:text-white hover:border-slate-700"
              }`}
            >
              {STAGE_LABELS[s] || s}
            </button>
          ))}
        </div>
      )}

      {/* Term Controls (Term 1 & Term 2) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {[1, 2].map((n) => {
          const t = term(n);
          return (
            <div
              key={n}
              className="rounded-2xl border border-slate-800 bg-slate-900/40 p-5 space-y-4 transition-all hover:border-slate-700"
            >
              <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
                <div className="flex items-center gap-2">
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-sky-500/10 font-bold text-sky-400 text-sm">
                    {n}
                  </span>
                  <span className="font-bold text-white text-base">الترم {n === 1 ? "الأول" : "الثاني"}</span>
                  <span className="text-xs text-slate-400">({STAGE_LABELS[stage] || stage})</span>
                </div>

                <label className="flex items-center gap-2 text-xs font-semibold text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={t.onSale}
                    onChange={(e) => setTermPatch(n, { onSale: e.target.checked })}
                    className="h-4 w-4 rounded border-slate-700 bg-slate-800 text-sky-500 focus:ring-0 cursor-pointer"
                  />
                  <span>فتح بيع الترم للطلاب</span>
                </label>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1.5">
                    تاريخ انتهاء حجز الترم (افتراضياً للطلبة الجدد):
                  </label>
                  <input
                    type="date"
                    value={dateInput(t.endsAt)}
                    onChange={(e) =>
                      setTermPatch(n, {
                        endsAt: e.target.value ? new Date(e.target.value).toISOString() : null,
                      })
                    }
                    className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3.5 py-2 text-sm text-white focus:border-sky-500 focus:outline-none"
                  />
                </div>

                {t.endsAt && (
                  <div className="pt-1">
                    <button
                      type="button"
                      onClick={() => applyEndDate(n)}
                      className="flex items-center justify-center gap-1.5 w-full rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs font-semibold text-amber-300 hover:bg-amber-500/20 transition-all"
                    >
                      <Clock size={13} />
                      <span>تطبيق هذا التاريخ على حجوزات الترم الحالية</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Course Placements Table */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Layers size={20} className="text-sky-400" />
            <h3 className="font-bold text-white text-base">توزيع الكورسات على الشهور والتيرمات</h3>
            <span className="rounded-md bg-slate-800 px-2 py-0.5 text-xs text-slate-400">
              {stageCourses.length} كورس
            </span>
          </div>
        </div>

        <div className="overflow-x-auto rounded-xl border border-slate-800">
          <table className="w-full text-right text-xs">
            <thead className="bg-slate-950/80 text-slate-400 border-b border-slate-800">
              <tr>
                <th className="p-3">اسم الكورس</th>
                <th className="p-3">السعر</th>
                <th className="p-3">الموقع والحجز (Placement)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 bg-slate-900/20">
              {stageCourses.length === 0 ? (
                <tr>
                  <td colSpan={3} className="p-6 text-center text-slate-500">
                    لا توجد كورسات في هذه المرحلة الدراسية
                  </td>
                </tr>
              ) : (
                stageCourses.map((c) => {
                  const val = placements[c.id] ?? "";
                  const selectedTokens = getPlacementTokens(val);
                  const desc = describePlacement(val);

                  return (
                    <tr key={c.id} className="hover:bg-slate-800/30 transition-colors">
                      <td className="p-3.5 align-top">
                        <div className="font-semibold text-white text-sm">{c.title}</div>
                        <div className="mt-1 text-[11px] text-slate-500">
                          معرف الكورس: {c.id.slice(0, 10)}...
                        </div>
                      </td>
                      <td className="p-3.5 align-top whitespace-nowrap text-slate-300 font-medium">
                        {c.isPaid ? `${c.price ?? 0} ج.م` : "مجاني"}
                      </td>
                      <td className="p-3.5 align-top">
                        <div className="space-y-2">
                          {/* Multi-booking selector pills */}
                          <div className="flex flex-wrap items-center gap-1.5">
                            {PLACEMENT_OPTIONS.map((opt) => {
                              const isSelected = selectedTokens.includes(opt.value);
                              return (
                                <button
                                  key={opt.value}
                                  type="button"
                                  onClick={() =>
                                    setPlacements((p) => ({
                                      ...p,
                                      [c.id]: togglePlacementOption(val, opt.value),
                                    }))
                                  }
                                  className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold transition-all border ${
                                    isSelected
                                      ? opt.value === "none"
                                        ? "bg-rose-500/20 text-rose-300 border-rose-500/40 shadow-sm"
                                        : opt.value === "extra"
                                        ? "bg-amber-500/20 text-amber-300 border-amber-500/40 shadow-sm"
                                        : "bg-sky-500/20 text-sky-200 border-sky-400/50 shadow-sm ring-1 ring-sky-400/30"
                                      : "bg-slate-950/60 text-slate-400 border-slate-800 hover:border-slate-700 hover:text-slate-200"
                                  }`}
                                >
                                  <span
                                    className={`inline-block h-2 w-2 rounded-full ${
                                      isSelected
                                        ? opt.value === "none"
                                          ? "bg-rose-400"
                                          : opt.value === "extra"
                                          ? "bg-amber-400"
                                          : "bg-sky-400"
                                        : "bg-slate-600"
                                    }`}
                                  />
                                  <span>{opt.shortLabel}</span>
                                </button>
                              );
                            })}
                          </div>

                          {/* Live Access Description & Presets */}
                          <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5">
                            <div
                              className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] font-medium border ${desc.color}`}
                            >
                              <span>{desc.text}</span>
                            </div>

                            {/* Quick Presets */}
                            <div className="flex items-center gap-1.5 text-[11px]">
                              <button
                                type="button"
                                onClick={() =>
                                  setPlacements((p) => ({ ...p, [c.id]: "month:1,term:1" }))
                                }
                                className="text-slate-400 hover:text-sky-300 transition-colors px-1.5 py-0.5 rounded hover:bg-slate-800 border border-slate-800"
                                title="إتاحة الكورس لمشتركي الشهر والترم الأول معاً"
                              >
                                + شهري وترم 1
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  setPlacements((p) => ({ ...p, [c.id]: "month:2,term:2" }))
                                }
                                className="text-slate-400 hover:text-sky-300 transition-colors px-1.5 py-0.5 rounded hover:bg-slate-800 border border-slate-800"
                                title="إتاحة الكورس لمشتركي الشهر والترم الثاني معاً"
                              >
                                + شهري وترم 2
                              </button>
                              {val && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    setPlacements((p) => ({ ...p, [c.id]: "" }))
                                  }
                                  className="text-slate-500 hover:text-rose-400 transition-colors px-1.5 py-0.5 rounded hover:bg-slate-800"
                                  title="مسح التوزيع والرجوع للوضع الافتراضي"
                                >
                                  إلغاء
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Bookings Section */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800/80 pb-3">
          <div className="flex items-center gap-2">
            <Users size={20} className="text-sky-400" />
            <h3 className="font-bold text-white text-base">حجوزات طلاب هذه المرحلة</h3>
            <span className="rounded-md bg-slate-800 px-2 py-0.5 text-xs text-slate-400">
              {stageBookings.length} طالب
            </span>
          </div>

          <div className="flex items-center gap-3">
            <div className="relative">
              <Search
                size={14}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none"
              />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="بحث بالاسم أو الهاتف..."
                className="rounded-xl border border-slate-800 bg-slate-950 pr-8 pl-3 py-1.5 text-xs text-white placeholder-slate-500 focus:border-sky-500 focus:outline-none"
              />
            </div>

            <div className="flex rounded-xl border border-slate-800 bg-slate-950 p-0.5">
              <button
                type="button"
                onClick={() => setFilter("running")}
                className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition-all ${
                  filter === "running" ? "bg-sky-500/15 text-sky-400" : "text-slate-400 hover:text-white"
                }`}
              >
                الساري فقط
              </button>
              <button
                type="button"
                onClick={() => setFilter("all")}
                className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition-all ${
                  filter === "all" ? "bg-sky-500/15 text-sky-400" : "text-slate-400 hover:text-white"
                }`}
              >
                الكل
              </button>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto rounded-xl border border-slate-800">
          <table className="w-full text-right text-xs">
            <thead className="bg-slate-950/80 text-slate-400 border-b border-slate-800">
              <tr>
                <th className="p-3">الطالب</th>
                <th className="p-3">نوع الباقة</th>
                <th className="p-3">الترم المملوك</th>
                <th className="p-3">المبلغ</th>
                <th className="p-3">تاريخ الانتهاء</th>
                <th className="p-3">الحالة</th>
                <th className="p-3">إجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 bg-slate-900/20">
              {stageBookings.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-6 text-center text-slate-500">
                    لا توجد حجوزات مطابقة
                  </td>
                </tr>
              ) : (
                stageBookings.map((b) => {
                  const running = isRunning(b);
                  const isEdited = !!edits[b.id];
                  const currentEdit = edits[b.id] || {};
                  const currentExpires = "expiresAt" in currentEdit ? currentEdit.expiresAt : b.expiresAt;
                  const currentStatus = currentEdit.status || b.status;

                  return (
                    <tr key={b.id} className="hover:bg-slate-800/30 transition-colors">
                      <td className="p-3">
                        <div className="font-semibold text-white">{b.studentName || "طالب"}</div>
                        {b.studentPhone && (
                          <div className="text-[11px] text-slate-500" dir="ltr">
                            {b.studentPhone}
                          </div>
                        )}
                      </td>
                      <td className="p-3 text-slate-300">
                        {PLAN_LABELS[b.planType] || b.planType}
                      </td>
                      <td className="p-3 text-slate-300">
                        {b.termNumbers && b.termNumbers.length > 0
                          ? `ترم ${b.termNumbers.join(" + ")}`
                          : b.planType === "termly"
                          ? "ترم 1 (تلقائي)"
                          : "—"}
                      </td>
                      <td className="p-3 font-mono text-slate-300">{b.amount} ج.م</td>
                      <td className="p-3">
                        <input
                          type="date"
                          value={dateInput(currentExpires as string | null)}
                          onChange={(e) =>
                            setEdits((prev) => ({
                              ...prev,
                              [b.id]: {
                                ...prev[b.id],
                                expiresAt: e.target.value ? new Date(e.target.value).toISOString() : null,
                              },
                            }))
                          }
                          className="rounded border border-slate-800 bg-slate-950 px-2 py-1 text-xs text-white focus:border-sky-500 focus:outline-none"
                        />
                      </td>
                      <td className="p-3">
                        <select
                          value={currentStatus}
                          onChange={(e) =>
                            setEdits((prev) => ({
                              ...prev,
                              [b.id]: { ...prev[b.id], status: e.target.value },
                            }))
                          }
                          className="rounded border border-slate-800 bg-slate-950 px-2 py-1 text-xs text-white focus:border-sky-500 focus:outline-none"
                        >
                          <option value="active">ساري</option>
                          <option value="cancelled">ملغي</option>
                        </select>
                      </td>
                      <td className="p-3">
                        <div className="flex items-center gap-1.5 justify-end">
                          {isEdited ? (
                            <button
                              type="button"
                              onClick={() => saveBooking(b)}
                              className="rounded-lg bg-sky-500 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-sky-400 transition-all"
                            >
                              حفظ
                            </button>
                          ) : (
                            <span
                              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                                running
                                  ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                                  : "bg-slate-800 text-slate-400"
                              }`}
                            >
                              {running ? "شغال" : "منتهي"}
                            </span>
                          )}
                          <button
                            type="button"
                            onClick={async () => {
                              if (!confirm(`هل أنت متأكد من حذف حجز الطالب ${b.studentName || "طالب"}؟ سيتم حذف الحجز فقط وليس الطالب نفسه.`)) return;
                              try {
                                const res = await fetch(`/api/teacher/subscriptions/${b.id}`, { method: 'DELETE' });
                                const data = await res.json();
                                if (data.success) {
                                  alert('تم حذف الحجز');
                                  setState((prev) =>
                                    prev
                                      ? { ...prev, bookings: prev.bookings.filter((item) => item.id !== b.id) }
                                      : prev
                                  );
                                } else {
                                  alert('فشل: ' + (data.error || 'تعذر حذف الحجز'));
                                }
                              } catch (err) {
                                alert('خطأ في الحذف');
                              }
                            }}
                            className="bg-red-600 hover:bg-red-700 text-white px-2 py-1 rounded-md text-[11px] font-semibold transition-colors shrink-0"
                            title="حذف الحجز فقط"
                          >
                            حذف الحجز 🗑️
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
