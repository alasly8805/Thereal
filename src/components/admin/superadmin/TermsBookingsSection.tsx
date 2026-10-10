"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useToast } from "@/components/ui/Toast";
import { STAGE_LABELS } from "@/lib/teacher-roster-types";
import {
  type TeacherPkgSettings,
  type CourseComparisonResult,
  type MonthConfig,
  getDefaultMonths,
  DEFAULT_PKG_SETTINGS,
} from "@/lib/teacher-package-types";
import {
  Sparkles,
  BookOpen,
  Users,
  BarChart3,
  TrendingUp,
  TrendingDown,
  Layers,
  Calendar,
  CheckCircle2,
  AlertCircle,
  Copy,
  Send,
  Eye,
  Sliders,
  ArrowRightLeft,
  X,
  Phone,
  Search,
  Plus,
  Trash2,
  Lock,
  Unlock,
  Check,
  ShieldCheck,
  Globe,
} from "lucide-react";

type Course = {
  id: string;
  title: string;
  educationalStage: string | null;
  price: number | null;
  isPaid: boolean;
  bookingKind: string | null;
  bookingTerm: number | null;
  languageTrack?: "arabic" | "languages" | "all";
  _count?: { enrollments: number };
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
  studentPhone: string | null;
  parentPhone: string | null;
  planType: string;
  planLabel: string | null;
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
  autoEnroll: boolean;
  courses: Course[];
  terms: Term[];
  bookings: Booking[];
  pkgConfig?: TeacherPkgSettings;
};

const getDynamicPlacementOptions = (monthsConfig?: MonthConfig[]) => {
  const months = monthsConfig && monthsConfig.length > 0 ? monthsConfig : getDefaultMonths();
  const monthOptions = months.map((m) => ({
    value: `month:${m.number}`,
    label: m.name,
    shortLabel: `📅 ${m.name}`,
    onSale: m.onSale,
  }));

  return [
    ...monthOptions,
    { value: "term:1", label: "كورس الترم 1", shortLabel: "📚 ترم 1", onSale: true },
    { value: "term:2", label: "كورس الترم 2", shortLabel: "📚 ترم 2", onSale: true },
    { value: "yearly", label: "باقة السنة كاملة", shortLabel: "🎓 باقة السنة", onSale: true },
    { value: "extra", label: "ورشة منفصلة", shortLabel: "⭐ ورشة مستقلة", onSale: true },
    { value: "none", label: "خارج الحجوزات", shortLabel: "🚫 خارج الحجوزات", onSale: true },
  ];
};

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

const describePlacement = (raw: string, monthsConfig?: MonthConfig[]): { text: string; color: string } => {
  if (!raw) {
    return {
      text: "لم يُحدد بعد (القواعد الافتراضية)",
      color: "text-slate-400 bg-slate-800/40 border-slate-700/50",
    };
  }
  if (raw === "none") {
    return {
      text: "خارج الحجوزات (لا يفتح بأي باقة)",
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
  const months = monthsConfig || [];

  for (const t of tokens) {
    if (t.startsWith("month:")) {
      const num = Number(t.split(":")[1]);
      const found = months.find((m) => m.number === num);
      parts.push(found ? found.name : `الشهر ${num}`);
    } else if (t === "term:1") {
      parts.push("ترم 1 كامل");
    } else if (t === "term:2") {
      parts.push("ترم 2 كامل");
    } else if (t === "yearly") {
      parts.push("باقة السنة");
    }
  }

  if (parts.length === 0) {
    parts.push("باقة السنة");
  }

  return {
    text: `متاح لمشتركي: ${parts.join(" · ")}`,
    color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/25",
  };
};

const PLAN_LABELS: Record<string, string> = { monthly: "شهري", termly: "ترم", yearly: "سنة" };

const toPlacement = (c: Course) => {
  if (!c.bookingKind) return "";
  if (c.bookingKind === "month" || c.bookingKind === "term") {
    return `${c.bookingKind}:${c.bookingTerm ?? 1}`;
  }
  return c.bookingKind;
};

const fromPlacement = (v: string) => {
  if (!v) return { bookingKind: null, bookingTerm: null };
  let primaryTerm: number | null = null;
  const match = v.match(/(?:month|term):(\d+)/);
  if (match) primaryTerm = Number(match[1]);
  return { bookingKind: v, bookingTerm: primaryTerm };
};

const dateInput = (iso: string | null) => (iso ? iso.slice(0, 10) : "");
const isRunning = (b: Booking) => b.status === "active" && (!b.expiresAt || new Date(b.expiresAt) > new Date());

export function TermsBookingsSection() {
  const { success: toastSuccess, error: toastError } = useToast();
  const [activeTab, setActiveTab] = useState<"packages" | "popup" | "comparison" | "students">("packages");
  const [autoEnroll, setAutoEnroll] = useState<boolean | null>(null);
  const [teachers, setTeachers] = useState<{ id: string; name: string; bookings: number }[]>([]);
  const [teacherId, setTeacherId] = useState("");
  const [loadingState, setLoadingState] = useState(false);
  const [state, setState] = useState<TeacherState | null>(null);
  const [placements, setPlacements] = useState<Record<string, string>>({});
  const [courseTracks, setCourseTracks] = useState<Record<string, "arabic" | "languages" | "all">>({});
  const [terms, setTerms] = useState<Record<string, Term>>({});
  const [stage, setStage] = useState("");
  const [busy, setBusy] = useState(false);
  const [edits, setEdits] = useState<Record<string, Partial<Booking>>>({});
  const [filter, setFilter] = useState<"running" | "all">("running");
  const [planFilter, setPlanFilter] = useState<string>("all");
  const [searchStudent, setSearchStudent] = useState<string>("");

  // Package Names and Month/Term configuration state
  const [pkgConfig, setPkgConfig] = useState<TeacherPkgSettings>({
    ...DEFAULT_PKG_SETTINGS,
  });

  // Popup broadcast state
  const [popupCourseId, setPopupCourseId] = useState("");
  const [popupTitle, setPopupTitle] = useState("");
  const [popupMessage, setPopupMessage] = useState("");
  const [popupTargetPlan, setPopupTargetPlan] = useState<"all" | "monthly" | "termly" | "yearly">("all");
  const [popupActionType, setPopupActionType] = useState<"both" | "renewal" | "course">("both");
  const [popupRenewalBtnText, setPopupRenewalBtnText] = useState("تجديد الاشتراك الآن ⚡");
  const [showPreviewModal, setShowPreviewModal] = useState(false);

  // Comparison state
  const [compCourse1, setCompCourse1] = useState("");
  const [compCourse2, setCompCourse2] = useState("");
  const [comparison, setComparison] = useState<CourseComparisonResult | null>(null);
  const [compLoading, setCompLoading] = useState(false);
  const [compStudentTab, setCompStudentTab] = useState<"diff" | "course2" | "course1" | "both" | "dropped" | "new">("diff");
  const [compSearch, setCompSearch] = useState("");

  const api = useCallback(
    async (method: string, body?: object) => {
      const res = await fetch(`/api/admin/superadmin/terms${teacherId ? `?teacherId=${teacherId}` : ""}`, {
        method,
        credentials: "include",
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.error || `خطأ في الخادم (${res.status})`);
      }
      return data;
    },
    [teacherId]
  );

  const applyState = useCallback((s: TeacherState) => {
    if (!s) return;
    setState(s);
    setAutoEnroll(s.autoEnroll);
    setPlacements(Object.fromEntries((s.courses || []).map((c) => [c.id, toPlacement(c)])));
    setCourseTracks(Object.fromEntries((s.courses || []).map((c) => [c.id, c.languageTrack || "all"])));
    setTerms(Object.fromEntries((s.terms || []).map((t) => [`${t.educationalStage}|${t.termNumber}`, t])));
    if (s.pkgConfig) {
      setPkgConfig({
        ...s.pkgConfig,
        months: s.pkgConfig.months && s.pkgConfig.months.length > 0
          ? s.pkgConfig.months
          : getDefaultMonths(s.pkgConfig.monthNumber, s.pkgConfig.monthlyName),
        enforceSequentialRenewal: s.pkgConfig.enforceSequentialRenewal !== false,
        englishBookingEnabled: s.pkgConfig.englishBookingEnabled !== false,
      });
    }
    setEdits({});

    // Pre-populate comparison courses if available and none selected yet
    if (s.courses && s.courses.length >= 2) {
      setCompCourse1((prev) => prev || s.courses[0].id);
      setCompCourse2((prev) => (prev && prev !== s.courses[0].id ? prev : s.courses[1].id));
    }
  }, []);

  useEffect(() => {
    fetch("/api/admin/superadmin/terms", { credentials: "include" })
      .then((r) => r.json())
      .then((d) => {
        if (!d) return;
        if (d.error) return toastError(d.error);
        setTeachers(d.teachers || []);
        setAutoEnroll(d.autoEnroll);

        const urlParams = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
        const requestedTeacherId = urlParams?.get("teacherId");
        const requestedTab = urlParams?.get("tab");
        if (requestedTab && ["packages", "popup", "comparison", "students"].includes(requestedTab)) {
          setActiveTab(requestedTab as "packages" | "popup" | "comparison" | "students");
        }

        if (requestedTeacherId && d.teachers?.some((t: { id: string }) => t.id === requestedTeacherId)) {
          setTeacherId(requestedTeacherId);
        } else if (d.teachers && d.teachers.length > 0) {
          // Auto-select the teacher with the most bookings so data is visible immediately
          const sorted = [...d.teachers].sort((a: { bookings: number }, b: { bookings: number }) => (b.bookings || 0) - (a.bookings || 0));
          const best = sorted[0]?.id;
          if (best) setTeacherId(best);
        }
      })
      .catch((err) => {
        toastError(err?.message || "تعذر تحميل قائمة المعلمين");
      });
  }, [toastError]);

  useEffect(() => {
    if (!teacherId) {
      setState(null);
      setComparison(null);
      return;
    }
    setLoadingState(true);
    api("GET")
      .then((d) => {
        setLoadingState(false);
        if (!d) return;
        if (d.error) return toastError(d.error);
        applyState(d);
      })
      .catch((err) => {
        setLoadingState(false);
        toastError(err?.message || "تعذر تحميل بيانات المعلم");
      });
  }, [teacherId, api, applyState, toastError]);

  const handleTeacherChange = (id: string) => {
    setTeacherId(id);
    setComparison(null);
    setCompCourse1("");
    setCompCourse2("");
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      if (id) url.searchParams.set("teacherId", id);
      else url.searchParams.delete("teacherId");
      window.history.replaceState({}, "", url.toString());
    }
  };

  const handleTabChange = (tab: "packages" | "popup" | "comparison" | "students") => {
    setActiveTab(tab);
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.set("tab", tab);
      window.history.replaceState({}, "", url.toString());
    }
  };

  const stages = useMemo(() => {
    const set = new Set<string>();
    state?.courses.forEach((c) => c.educationalStage && set.add(c.educationalStage));
    state?.bookings.forEach((b) => b.educationalStage && b.educationalStage !== "الكل" && set.add(b.educationalStage));
    return [...set].sort();
  }, [state]);

  useEffect(() => {
    if (stages.length && !stages.includes(stage)) setStage(stages[0]);
  }, [stages, stage]);

  const term = (n: number): Term => terms[`${stage}|${n}`] ?? { educationalStage: stage, termNumber: n, endsAt: null, onSale: false };
  const setTerm = (n: number, patch: Partial<Term>) => setTerms((p) => ({ ...p, [`${stage}|${n}`]: { ...term(n), ...patch } }));

  const toggleAutoEnroll = async () => {
    const next = !autoEnroll;
    const msg = next
      ? "تشغيل التفعيل التلقائي: بعد الدفع أونلاين، الحجز/الكورس هيتفعل للطالب لوحده. متأكد؟"
      : "إيقاف التفعيل التلقائي: بعد الدفع أونلاين، الفلوس هتتحط في محفظة الطالب وهو يختار بنفسه. متأكد؟";
    if (!window.confirm(msg)) return;
    const d = await fetch("/api/admin/superadmin/terms", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "setAutoEnroll", enabled: next }),
    }).then((r) => r.json());
    if (d.error) return toastError(d.error);
    setAutoEnroll(d.autoEnroll);
    toastSuccess(d.autoEnroll ? "التفعيل التلقائي شغال" : "التفعيل التلقائي متوقف ✅");
  };

  const savePackageConfig = async () => {
    if (!teacherId) return;
    setBusy(true);
    try {
      const d = await api("POST", {
        action: "savePackageConfig",
        ...pkgConfig,
      });
      if (d.error) return toastError(d.error);
      applyState({ ...d, autoEnroll: autoEnroll ?? false });
      toastSuccess("تم حفظ إعدادات وسلسلة الشهور والباقات بنجاح ✅");
    } finally {
      setBusy(false);
    }
  };

  const updateMonth = (num: number, patch: Partial<MonthConfig>) => {
    setPkgConfig((prev) => {
      const currentMonths = prev.months && prev.months.length > 0
        ? prev.months
        : getDefaultMonths(prev.monthNumber, prev.monthlyName);
      const updatedMonths = currentMonths.map((m) =>
        m.number === num ? { ...m, ...patch } : m
      );
      const activePatch = num === prev.monthNumber && patch.name ? { monthlyName: patch.name } : {};
      return {
        ...prev,
        ...activePatch,
        months: updatedMonths,
      };
    });
  };

  const addNewMonth = () => {
    setPkgConfig((prev) => {
      const currentMonths = prev.months && prev.months.length > 0
        ? prev.months
        : getDefaultMonths(prev.monthNumber, prev.monthlyName);
      const nextNum = currentMonths.length + 1;
      const newMonth: MonthConfig = {
        number: nextNum,
        name: `حجز الشهر ${nextNum}`,
        onSale: false,
        price: null,
      };
      return {
        ...prev,
        months: [...currentMonths, newMonth],
      };
    });
    toastSuccess("تمت إضافة شهر جديد للسلسلة — يمكنك الآن تسميته وتحديد كورساته وفتح إتاحته");
  };

  const removeLastMonth = () => {
    setPkgConfig((prev) => {
      const currentMonths = prev.months && prev.months.length > 0
        ? prev.months
        : getDefaultMonths(prev.monthNumber, prev.monthlyName);
      if (currentMonths.length <= 1) return prev;
      const last = currentMonths[currentMonths.length - 1];
      if (!window.confirm(`هل أنت متأكد من حذف ${last.name} من السلسلة؟`)) return prev;
      const updated = currentMonths.slice(0, -1);
      return {
        ...prev,
        monthNumber: prev.monthNumber >= last.number ? Math.max(1, prev.monthNumber - 1) : prev.monthNumber,
        months: updated,
      };
    });
  };

  const getCourseCountForMonth = (monthNum: number) => {
    if (!state?.courses) return 0;
    const targetToken = `month:${monthNum}`;
    return state.courses.filter((c) => {
      const raw = placements[c.id] ?? toPlacement(c);
      return getPlacementTokens(raw).includes(targetToken);
    }).length;
  };

  const dynamicPlacementOptions = useMemo(() => {
    return getDynamicPlacementOptions(pkgConfig.months);
  }, [pkgConfig.months]);

  const saveCoursesAndTerms = async () => {
    if (!state) return;
    const changedCourses = state.courses.filter((c) => {
      const placementChanged = toPlacement(c) !== (placements[c.id] ?? "");
      const currentTrack = courseTracks[c.id] ?? c.languageTrack ?? "all";
      const trackChanged = currentTrack !== (c.languageTrack ?? "all");
      return placementChanged || trackChanged;
    });

    const payload = {
      courses: changedCourses.map((c) => ({
        id: c.id,
        ...fromPlacement(placements[c.id] ?? toPlacement(c)),
        languageTrack: courseTracks[c.id] ?? c.languageTrack ?? "all",
      })),
      terms: Object.values(terms),
    };
    setBusy(true);
    try {
      const check = await api("PUT", { ...payload, preview: true });
      if (check.error) return toastError(check.error);
      const lines = (check.losses ?? []).map((l: { title: string; students: number }) => `• "${l.title}": ${l.students} طالب هيتقفل عندهم`);
      if (lines.length && !window.confirm(`⚠️ قبل الحفظ:\n\n${lines.join("\n")}\n\nمتأكد؟`)) return;
      const d = await api("PUT", payload);
      if (d.error) return toastError(d.error);
      applyState(d);
      toastSuccess("تم حفظ وتحديث توزيع الكورسات والترمات ومسارات اللغات ✅");
    } finally {
      setBusy(false);
    }
  };

  const autoEnrollSubscribers = async (courseId: string, courseTitle: string) => {
    if (!window.confirm(`تفعيل كورس "${courseTitle}" فوراً في حسابات جميع المشتركين المؤهلين حالياً؟`)) return;
    setBusy(true);
    try {
      const d = await api("POST", {
        action: "autoEnrollSubscribers",
        courseId,
      });
      if (d.error) return toastError(d.error);
      toastSuccess(`تم تفعيل الكورس فوراً لـ ${d.newlyEnrolledCount} طالب ✅`);
      applyState({ ...d, autoEnroll: autoEnroll ?? false });
    } finally {
      setBusy(false);
    }
  };

  const togglePopupFeature = async (nextVal: boolean) => {
    setBusy(true);
    try {
      const d = await api("POST", {
        action: "togglePopup",
        enabled: nextVal,
      });
      if (d.error) return toastError(d.error);
      setPkgConfig((p) => ({ ...p, popupEnabled: nextVal }));
      toastSuccess(nextVal ? "تم تفعيل ميزة الإشعار المنبثق للطلاب" : "تم تعطيل ميزة الإشعار المنبثق");
    } finally {
      setBusy(false);
    }
  };

  const broadcastPopup = async () => {
    if (!popupCourseId) return toastError("اختر الكورس أولاً");
    setBusy(true);
    try {
      const d = await api("POST", {
        action: "configureNewCoursePopup",
        courseId: popupCourseId,
        customTitle: popupTitle || undefined,
        customMessage: popupMessage || undefined,
        targetPlan: popupTargetPlan,
        actionType: popupActionType,
        renewalButtonText: popupRenewalBtnText || undefined,
      });
      if (d.error) return toastError(d.error);
      toastSuccess(`تم نشر وتفعيل الإشعار المنبثق لـ ${d.notificationsCount} طالب ✅`);
      applyState({ ...d, autoEnroll: autoEnroll ?? false });
    } finally {
      setBusy(false);
    }
  };

  const runComparison = useCallback(
    async (options?: { silent?: boolean }) => {
      const silent = options?.silent ?? false;
      if (!compCourse1 || !compCourse2) {
        if (!silent) toastError("اختر كلاً من الكورس الأول والكورس الثاني للمقارنة");
        return;
      }
      if (compCourse1 === compCourse2) {
        if (!silent) toastError("يرجى اختيار كورسين مختلفين");
        return;
      }
      setCompLoading(true);
      try {
        const res = await fetch(
          `/api/admin/superadmin/terms?teacherId=${teacherId}&compare=1&course1=${compCourse1}&course2=${compCourse2}`,
          { credentials: "include" }
        );
        const data = await res.json();
        if (!res.ok || data.error) {
          if (!silent) toastError(data.error || "تعذر إجراء المقارنة");
          return;
        }
        setComparison(data.comparison);
        if (!silent) toastSuccess("تم استخراج بيانات المقارنة والفرق بنجاح 📊");
      } finally {
        setCompLoading(false);
      }
    },
    [compCourse1, compCourse2, teacherId, toastError, toastSuccess]
  );

  useEffect(() => {
    if (
      activeTab === "comparison" &&
      teacherId &&
      compCourse1 &&
      compCourse2 &&
      compCourse1 !== compCourse2 &&
      !comparison &&
      !compLoading
    ) {
      void runComparison({ silent: true });
    }
  }, [activeTab, teacherId, compCourse1, compCourse2, comparison, compLoading, runComparison]);

  const copyPhones = (phones: (string | null | undefined)[]) => {
    const list = Array.from(new Set(phones.filter(Boolean) as string[])).join("\n");
    if (!list) return toastError("لا توجد أرقام هواتف متوفرة");
    navigator.clipboard.writeText(list);
    toastSuccess(`تم نسخ ${phones.filter(Boolean).length} رقم هاتف إلى الحافظة ✅`);
  };

  const applyEndDate = async (n: number) => {
    const p = await api("POST", { action: "applyEndDate", educationalStage: stage, termNumber: n, preview: true });
    if (p.error) return toastError(p.error);
    const when = new Date(p.endsAt).toLocaleDateString("ar-EG");
    if (!window.confirm(`تطبيق تاريخ النهاية ${when} على ${p.total} حجز ترم ${n === 2 ? "تاني" : "أول"} شغال.\n${p.shortened > 0 ? `⚠️ ${p.shortened} منهم هينتهوا بدري عن ميعادهم الحالي.\n` : ""}متأكد؟`)) return;
    const d = await api("POST", { action: "applyEndDate", educationalStage: stage, termNumber: n });
    if (d.error) return toastError(d.error);
    applyState({ ...d, autoEnroll: autoEnroll ?? false });
    toastSuccess(`اتحدّث ${d.updated} حجز ✅`);
  };

  const saveBooking = async (b: Booking) => {
    const e = edits[b.id];
    if (!e) return;
    const d = await api("POST", { action: "updateBooking", bookingId: b.id, ...e });
    if (d.error) return toastError(d.error);
    applyState({ ...d, autoEnroll: autoEnroll ?? false });
    toastSuccess("تم تعديل الحجز بنجاح ✅");
  };

  const edit = (id: string, patch: Partial<Booking>) => setEdits((p) => ({ ...p, [id]: { ...p[id], ...patch } }));

  const card = "p-5 rounded-2xl border border-[var(--border)] bg-[var(--surface)] space-y-4 shadow-sm";
  const input = "h-10 px-3 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] text-[var(--ink)] text-sm focus:border-emerald-500 focus:outline-none transition-colors";

  const stageCourses = (state?.courses ?? []).filter((c) => !stage || c.educationalStage === stage);
  const allCourses = state?.courses ?? [];

  const stageBookings = (state?.bookings ?? []).filter((b) => {
    if (stage && b.educationalStage && b.educationalStage !== "الكل" && b.educationalStage !== stage) return false;
    if (filter === "running" && !isRunning(b)) return false;
    if (planFilter !== "all" && b.planType !== planFilter) return false;
    if (searchStudent) {
      const q = searchStudent.toLowerCase();
      const matchName = b.studentName?.toLowerCase().includes(q);
      const matchPhone = b.studentPhone?.includes(q) || b.parentPhone?.includes(q);
      if (!matchName && !matchPhone) return false;
    }
    return true;
  });

  const selectedTeacher = teachers.find((t) => t.id === teacherId);

  return (
    <div className="space-y-6" dir="rtl">
      {/* Top Header Card: Teacher Picker & Auto-Enroll Switch */}
      <div className={card}>
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1">
            <h1 className="text-xl font-black text-[var(--ink)] flex items-center gap-2">
              <span className="p-1.5 rounded-xl bg-emerald-500/10 text-emerald-600">
                <Layers size={22} />
              </span>
              <span>إدارة باقات وحجوزات المعلمين</span>
            </h1>
            <p className="text-xs text-[var(--ink-2)]">
              تحكم كامل في كورسات المعلم، أسماء الحجوزات (الشهر الأول/الثاني، الترمين، السنة)، الإشعارات المنبثقة، ومقارنة المشتركين بيانيا.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Auto Enroll Toggle Badge */}
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-[var(--border)] bg-[var(--surface-2)]">
              <div className="text-right">
                <span className="text-[11px] block font-bold text-[var(--ink)]">التفعيل بعد الدفع</span>
                <span className="text-[10px] text-[var(--ink-2)]">
                  {autoEnroll ? "تلقائي فوري" : "يدوي بالمحفظة"}
                </span>
              </div>
              <button
                type="button"
                onClick={toggleAutoEnroll}
                disabled={autoEnroll === null}
                className={`px-3 h-8 rounded-lg text-xs font-bold text-white transition-all ${
                  autoEnroll ? "bg-rose-600 hover:bg-rose-500" : "bg-emerald-600 hover:bg-emerald-500"
                }`}
              >
                {autoEnroll ? "إيقاف" : "تشغيل"}
              </button>
            </div>

            {/* Teacher Selection Dropdown */}
            <div className="min-w-[240px]">
              <select
                className={`${input} w-full font-bold`}
                value={teacherId}
                onChange={(e) => handleTeacherChange(e.target.value)}
              >
                <option value="">— اختر المعلم للبدء —</option>
                {teachers.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({t.bookings} حجز)
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Selected Teacher Quick Summary Banner */}
        {selectedTeacher && state && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-[var(--border)]">
            <div className="p-2.5 rounded-xl bg-[var(--surface-2)]">
              <span className="text-[11px] text-[var(--ink-2)] block">المعلم الحالي</span>
              <span className="text-sm font-black text-[var(--ink)]">{selectedTeacher.name}</span>
            </div>
            <div className="p-2.5 rounded-xl bg-[var(--surface-2)]">
              <span className="text-[11px] text-[var(--ink-2)] block">إجمالي الكورسات</span>
              <span className="text-sm font-black text-emerald-600">{state.courses.length} كورس</span>
            </div>
            <div className="p-2.5 rounded-xl bg-[var(--surface-2)]">
              <span className="text-[11px] text-[var(--ink-2)] block">إجمالي الحجوزات</span>
              <span className="text-sm font-black text-indigo-600">{state.bookings.length} طالب</span>
            </div>
            <div className="p-2.5 rounded-xl bg-[var(--surface-2)]">
              <span className="text-[11px] text-[var(--ink-2)] block">الإشعار المنبثق</span>
              <span className={`text-sm font-black ${pkgConfig.popupEnabled ? "text-emerald-500" : "text-slate-400"}`}>
                {pkgConfig.popupEnabled ? "مُفعّل نشط ✓" : "معطل"}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Main Tabs Navigation */}
      {state && (
        <>
          <div className="flex items-center gap-1.5 p-1 rounded-2xl border border-[var(--border)] bg-[var(--surface)] overflow-x-auto">
            <button
              type="button"
              onClick={() => handleTabChange("packages")}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-black transition-all ${
                activeTab === "packages"
                  ? "bg-emerald-600 text-white shadow-md shadow-emerald-600/20"
                  : "text-[var(--ink-2)] hover:text-[var(--ink)] hover:bg-[var(--surface-2)]"
              }`}
            >
              <Sliders size={16} />
              <span>إدارة الباقات والكورسات</span>
            </button>

            <button
              type="button"
              onClick={() => handleTabChange("popup")}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-black transition-all ${
                activeTab === "popup"
                  ? "bg-emerald-600 text-white shadow-md shadow-emerald-600/20"
                  : "text-[var(--ink-2)] hover:text-[var(--ink)] hover:bg-[var(--surface-2)]"
              }`}
            >
              <Sparkles size={16} />
              <span>إشعار الكورس الجديد المنبثق</span>
              {pkgConfig.popupEnabled && (
                <span className="w-2 h-2 rounded-full bg-emerald-300 animate-ping" />
              )}
            </button>

            <button
              type="button"
              onClick={() => handleTabChange("comparison")}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-black transition-all ${
                activeTab === "comparison"
                  ? "bg-emerald-600 text-white shadow-md shadow-emerald-600/20"
                  : "text-[var(--ink-2)] hover:text-[var(--ink)] hover:bg-[var(--surface-2)]"
              }`}
            >
              <BarChart3 size={16} />
              <span>مقارنة الكورسات والفرق البياني</span>
            </button>

            <button
              type="button"
              onClick={() => handleTabChange("students")}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-black transition-all ${
                activeTab === "students"
                  ? "bg-emerald-600 text-white shadow-md shadow-emerald-600/20"
                  : "text-[var(--ink-2)] hover:text-[var(--ink)] hover:bg-[var(--surface-2)]"
              }`}
            >
              <Users size={16} />
              <span>الطلاب وحجوزاتهم ({state.bookings.length})</span>
            </button>
          </div>

          {/* ══════════════════════════════════════════════════════════════════
              TAB 1: PACKAGES & COURSES MANAGEMENT
             ══════════════════════════════════════════════════════════════════ */}
          {activeTab === "packages" && (
            <div className="space-y-6">
              {/* 1. Monthly Renewal Chain & Sequence Customizer Card */}
              <div className={card}>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[var(--border)] pb-3">
                  <div>
                    <h2 className="text-base font-bold text-[var(--ink)] flex items-center gap-2">
                      <Calendar size={18} className="text-emerald-600" />
                      <span>سلسلة الشهور الدراسية والتجديد التتابعي (Months Chain & Renewal)</span>
                    </h2>
                    <p className="text-xs text-[var(--ink-2)] mt-0.5">
                      تحكم في مسار الشهور (من شهر 1 حتى 10 أو أكثر)، تسمية كل شهر، فتح وإتاحة التجديد للطلاب (onSale)، وضبط قواعد التتابع.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={addNewMonth}
                      disabled={busy}
                      className="px-3.5 h-9 rounded-xl border border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 text-xs font-bold transition-all flex items-center gap-1.5"
                    >
                      <Plus size={14} />
                      <span>إضافة شهر جديد</span>
                    </button>
                    <button
                      type="button"
                      onClick={savePackageConfig}
                      disabled={busy}
                      className="px-5 h-9 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold disabled:opacity-50 transition-colors shadow-sm"
                    >
                      {busy ? "جاري الحفظ…" : "حفظ إعدادات وسلسلة الشهور"}
                    </button>
                  </div>
                </div>

                {/* Sequential Renewal & Active Month Global Controls */}
                <div className="p-3.5 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="flex items-start sm:items-center gap-3">
                    <div className={`p-2 rounded-lg ${pkgConfig.enforceSequentialRenewal !== false ? "bg-emerald-500/15 text-emerald-400" : "bg-amber-500/15 text-amber-400"}`}>
                      <ShieldCheck size={20} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-black text-[var(--ink)]">إلزام التجديد التتابعي المتسلسل</span>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                          pkgConfig.enforceSequentialRenewal !== false ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30" : "bg-amber-500/15 text-amber-400 border border-amber-500/30"
                        }`}>
                          {pkgConfig.enforceSequentialRenewal !== false ? "مُفعّل (إلزامي)" : "معطل (اختياري)"}
                        </span>
                      </div>
                      <p className="text-[11px] text-[var(--ink-2)] mt-0.5">
                        {pkgConfig.enforceSequentialRenewal !== false
                          ? "الطالب ملزم بإنهاء واشتراك كل شهر بالتتابع (شهر 1 ثم 2 ثم 3...)، ولا يمكنه القفز لشهر قادم دون امتلاك الشهر السابق."
                          : "الطالب يمكنه الاشتراك أو التجديد لأي شهر مفتوح مباشرة دون التقيد بإنهاء الشهور السابقة."}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setPkgConfig((p) => ({ ...p, enforceSequentialRenewal: p.enforceSequentialRenewal === false }))}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors ${
                        pkgConfig.enforceSequentialRenewal !== false
                          ? "bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border-rose-500/30"
                          : "bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
                      }`}
                    >
                      {pkgConfig.enforceSequentialRenewal !== false ? "تعطيل الإلزام" : "تفعيل الإلزام المتسلسل"}
                    </button>

                    <div className="flex items-center gap-2 border-r border-[var(--border)] pr-3">
                      <span className="text-xs text-[var(--ink-2)]">الشهر النشط للجدد:</span>
                      <select
                        value={pkgConfig.monthNumber}
                        onChange={(e) => {
                          const num = Number(e.target.value) || 1;
                          const targetMonth = pkgConfig.months?.find((m) => m.number === num);
                          setPkgConfig((p) => ({
                            ...p,
                            monthNumber: num,
                            monthlyName: targetMonth?.name || p.monthlyName,
                          }));
                        }}
                        className={`${input} py-1 text-xs`}
                      >
                        {(pkgConfig.months || getDefaultMonths()).map((m) => (
                          <option key={m.number} value={m.number}>
                            شهر {m.number} ({m.name})
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>

                {/* Months Sequence Cards / Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3 pt-2">
                  {(pkgConfig.months || getDefaultMonths()).map((m, idx) => {
                    const isDefaultActive = pkgConfig.monthNumber === m.number;
                    const coursesCount = getCourseCountForMonth(m.number);
                    const isLast = idx === (pkgConfig.months || []).length - 1 && (pkgConfig.months || []).length > 1;

                    return (
                      <div
                        key={m.number}
                        className={`p-3.5 rounded-xl border transition-all flex flex-col justify-between gap-3 ${
                          isDefaultActive
                            ? "bg-emerald-950/20 border-emerald-500/50 ring-1 ring-emerald-500/30"
                            : "bg-[var(--surface-2)] border-[var(--border)]"
                        }`}
                      >
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1.5">
                              <span className="w-6 h-6 rounded-full bg-emerald-600/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center text-xs font-black">
                                {m.number}
                              </span>
                              <span className="text-xs font-black text-[var(--ink)]">
                                شهر {m.number}
                              </span>
                            </div>

                            {isDefaultActive ? (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                                النشط للجدد ⭐
                              </span>
                            ) : (
                              <button
                                type="button"
                                onClick={() =>
                                  setPkgConfig((p) => ({
                                    ...p,
                                    monthNumber: m.number,
                                    monthlyName: m.name || p.monthlyName,
                                  }))
                                }
                                className="text-[10px] text-[var(--ink-2)] hover:text-emerald-400 transition-colors"
                              >
                                جعله النشط
                              </button>
                            )}
                          </div>

                          <div>
                            <label className="text-[10px] text-[var(--ink-2)] block mb-1">اسم الحجز المعروض</label>
                            <input
                              type="text"
                              value={m.name}
                              onChange={(e) => updateMonth(m.number, { name: e.target.value })}
                              className={`${input} w-full text-xs font-medium py-1 px-2.5`}
                              placeholder={`حجز الشهر ${m.number}`}
                            />
                          </div>

                          <div className="pt-1 flex items-center justify-between text-[11px] text-[var(--ink-2)]">
                            <span className="flex items-center gap-1">
                              <BookOpen size={12} className="text-emerald-500" />
                              <span>{coursesCount} كورس مرتبط</span>
                            </span>
                            {isLast && (
                              <button
                                type="button"
                                onClick={removeLastMonth}
                                className="text-rose-400 hover:text-rose-300 transition-colors p-1"
                                title="حذف هذا الشهر من السلسلة"
                              >
                                <Trash2 size={13} />
                              </button>
                            )}
                          </div>
                        </div>

                        {/* onSale Toggle Button */}
                        <button
                          type="button"
                          onClick={() => updateMonth(m.number, { onSale: !m.onSale })}
                          className={`w-full h-8 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all border ${
                            m.onSale
                              ? "bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 border-emerald-500/40"
                              : "bg-slate-800/60 hover:bg-slate-800 text-slate-400 border-slate-700"
                          }`}
                        >
                          {m.onSale ? (
                            <>
                              <Unlock size={13} className="text-emerald-400" />
                              <span>مفتوح للتجديد ✓</span>
                            </>
                          ) : (
                            <>
                              <Lock size={13} className="text-slate-400" />
                              <span>مغلق حالياً 🔒</span>
                            </>
                          )}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* 2. Term & Yearly Packages Customizer Card */}
              <div className={card}>
                <div className="flex items-center justify-between border-b border-[var(--border)] pb-3">
                  <div>
                    <h2 className="text-base font-bold text-[var(--ink)] flex items-center gap-2">
                      <Sliders size={18} className="text-indigo-600" />
                      <span>باقات الترم والسنة كاملة</span>
                    </h2>
                    <p className="text-xs text-[var(--ink-2)] mt-0.5">
                      تخصيص أسماء حجز الترم وحجز السنة كاملة للمعلم.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
                  {/* Term Package Setting */}
                  <div className="p-4 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-indigo-600">باقة الترم (Termly)</span>
                      <span className="text-[10px] px-2 py-0.5 rounded-md bg-indigo-500/10 text-indigo-500 font-bold">
                        ترم 1 أو 2
                      </span>
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs text-[var(--ink-2)] block">اسم حجز الترم للمعلم</label>
                      <input
                        type="text"
                        className={`${input} w-full`}
                        value={pkgConfig.termlyName}
                        onChange={(e) => setPkgConfig((p) => ({ ...p, termlyName: e.target.value }))}
                        placeholder="مثال: حجز الترم الثاني"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs text-[var(--ink-2)] block">الترم النشط المعروض</label>
                      <select
                        className={`${input} w-full`}
                        value={pkgConfig.termNumber}
                        onChange={(e) => setPkgConfig((p) => ({ ...p, termNumber: Number(e.target.value) || 1 }))}
                      >
                        <option value={1}>الترم الأول (1)</option>
                        <option value={2}>الترم الثاني (2)</option>
                      </select>
                    </div>
                  </div>

                  {/* Yearly Package Setting */}
                  <div className="p-4 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-amber-600">باقة السنة (Yearly)</span>
                      <span className="text-[10px] px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-500 font-bold">
                        كامل السنة
                      </span>
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs text-[var(--ink-2)] block">اسم حجز السنة للمعلم</label>
                      <input
                        type="text"
                        className={`${input} w-full`}
                        value={pkgConfig.yearlyName}
                        onChange={(e) => setPkgConfig((p) => ({ ...p, yearlyName: e.target.value }))}
                        placeholder="مثال: حجز السنة كاملة"
                      />
                    </div>

                    <p className="text-[11px] text-[var(--ink-2)] pt-2 leading-relaxed">
                      باقة السنة تفتح تلقائياً كورسات الترمين الأول والثاني، وأي كورس يتم تعليمه لباقة السنة.
                    </p>
                  </div>
                </div>
              </div>

              {/* 3. English Track Booking Card */}
              <div className={card}>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[var(--border)] pb-3">
                  <div>
                    <h2 className="text-base font-bold text-[var(--ink)] flex items-center gap-2">
                      <Globe size={18} className="text-blue-500" />
                      <span>إتاحة حجز مسار اللغات / English Track Booking</span>
                    </h2>
                    <p className="text-xs text-[var(--ink-2)] mt-0.5">
                      التحكم في إتاحة حجز وتجديد باقات المعلم (شهري / ترم / سنة) لطلاب مسار اللغات (English / Languages).
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-xs font-bold px-3 py-1 rounded-full border ${
                        pkgConfig.englishBookingEnabled !== false
                          ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                          : "bg-rose-500/10 text-rose-400 border-rose-500/30"
                      }`}
                    >
                      {pkgConfig.englishBookingEnabled !== false ? "متاح لطلاب اللغات ✓" : "معطل ومغلق للغات 🔒"}
                    </span>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-1">
                  <div className="text-xs text-[var(--ink-2)] leading-relaxed max-w-xl">
                    عند تفعيل هذا الخيار، سيتمكن طلاب مسار اللغات من حجز الباقات وتجديدها. عند تعطيله، يتم إغلاق الحجز لطلاب اللغات مع تنبيههم بأن الحجز متاح فقط للمسار العربي.
                  </div>

                  <button
                    type="button"
                    onClick={() =>
                      setPkgConfig((p) => ({
                        ...p,
                        englishBookingEnabled: p.englishBookingEnabled === false ? true : false,
                      }))
                    }
                    className={`shrink-0 px-4 h-10 rounded-xl text-xs font-bold flex items-center gap-2 border transition-all ${
                      pkgConfig.englishBookingEnabled !== false
                        ? "bg-rose-500/15 hover:bg-rose-500/25 text-rose-400 border-rose-500/30"
                        : "bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-400 border-emerald-500/30"
                    }`}
                  >
                    {pkgConfig.englishBookingEnabled !== false ? (
                      <>
                        <Lock size={14} />
                        <span>تعطيل حجز اللغات</span>
                      </>
                    ) : (
                      <>
                        <Unlock size={14} />
                        <span>إتاحة وتفعيل حجز اللغات</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Stage Filter Buttons */}
              <div className="flex gap-2 flex-wrap items-center">
                <span className="text-xs font-bold text-[var(--ink-2)] ml-2">تصفية حسب الصف:</span>
                {stages.map((s) => (
                  <button
                    key={s}
                    onClick={() => setStage(s)}
                    className={`px-4 h-9 rounded-full text-xs font-bold border transition-all ${
                      s === stage
                        ? "bg-emerald-600 text-white border-emerald-600 shadow-sm"
                        : "bg-[var(--surface)] text-[var(--ink)] border-[var(--border)] hover:bg-[var(--surface-2)]"
                    }`}
                  >
                    {STAGE_LABELS[s] || s}
                  </button>
                ))}
              </div>

              {/* Term Dates & OnSale Card for Current Stage */}
              {stage && (
                <div className={card}>
                  <h3 className="font-bold text-sm text-[var(--ink)] flex items-center gap-2">
                    <Calendar size={16} className="text-emerald-600" />
                    <span>تواريخ نهاية الترمات وإتاحة الحجز — {STAGE_LABELS[stage] || stage}</span>
                  </h3>

                  {[1, 2].map((n) => (
                    <div
                      key={n}
                      className="flex flex-col sm:flex-row sm:items-end gap-3 border-b border-[var(--border)] pb-3 last:border-0"
                    >
                      <span className="font-bold text-sm w-28 text-[var(--ink)]">
                        {n === 1 ? "الترم الأول" : "الترم الثاني"}
                      </span>

                      <label className="text-xs text-[var(--ink-2)] space-y-1">
                        <span className="block">تاريخ نهاية الترم</span>
                        <input
                          type="date"
                          className={input}
                          value={dateInput(term(n).endsAt)}
                          onChange={(e) => setTerm(n, { endsAt: e.target.value || null })}
                        />
                      </label>

                      <label className="flex items-center gap-2 text-xs font-bold h-10 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={term(n).onSale}
                          onChange={(e) => setTerm(n, { onSale: e.target.checked })}
                          className="rounded border-[var(--border)]"
                        />
                        <span>متاح للحجز الآن</span>
                      </label>

                      <button
                        type="button"
                        onClick={() => applyEndDate(n)}
                        className="px-3 h-10 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] hover:bg-[var(--surface)] text-xs font-bold transition-colors"
                      >
                        تطبيق تاريخ النهاية على الحجوزات السارية
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Courses Placement Matrix */}
              <div className={card}>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[var(--border)] pb-3">
                  <div>
                    <h3 className="font-bold text-sm text-[var(--ink)] flex items-center gap-2">
                      <BookOpen size={16} className="text-emerald-600" />
                      <span>كورسات المعلم وتحديد ما تفتحه كل باقة</span>
                    </h3>
                    <p className="text-xs text-[var(--ink-2)] mt-0.5">
                      حدد الكورسات التي يتم فتحها تلقائياً لمشتركي الشهر 1، الشهر 2، الترمين، أو السنة.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={saveCoursesAndTerms}
                    disabled={busy}
                    className="px-6 h-10 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black shadow-md shadow-emerald-600/20 disabled:opacity-60 transition-all"
                  >
                    {busy ? "جاري الحفظ…" : "حفظ توزيع الكورسات والترمات"}
                  </button>
                </div>

                {stageCourses.length === 0 ? (
                  <p className="text-sm text-[var(--ink-2)] py-4 text-center">لا توجد كورسات لهذا الصف.</p>
                ) : (
                  <div className="divide-y divide-[var(--border)]">
                    {stageCourses.map((c) => {
                      const val = placements[c.id] ?? "";
                      const selectedTokens = getPlacementTokens(val);
                      const desc = describePlacement(val, pkgConfig.months);

                      return (
                        <div key={c.id} className="py-4 flex flex-col lg:flex-row lg:items-start gap-4 justify-between">
                          <div className="min-w-0 lg:w-1/3 space-y-1.5">
                            <p className="font-bold text-sm text-[var(--ink)] leading-snug">{c.title}</p>
                            <div className="flex items-center gap-2 text-xs text-[var(--ink-2)]">
                              <span className="font-semibold text-emerald-600">
                                {c.isPaid ? `${c.price ?? 0} ج` : "مجاني"}
                              </span>
                              <span>·</span>
                              <span>{c._count?.enrollments ?? 0} طالب مسجل</span>
                              <span>·</span>
                              <span className="text-[11px] px-2 py-0.5 rounded bg-[var(--surface-2)]">
                                {STAGE_LABELS[c.educationalStage || ""] || c.educationalStage}
                              </span>
                            </div>

                            {/* Course Language Track Selector */}
                            <div className="pt-1 flex items-center gap-1.5 flex-wrap">
                              <span className="text-[10px] font-bold text-[var(--ink-2)]">المسار:</span>
                              {[
                                { val: "arabic", label: "🇪🇬 عربي", activeCls: "bg-emerald-500/20 text-emerald-400 border-emerald-500/50" },
                                { val: "languages", label: "🇬🇧 لغات / English", activeCls: "bg-blue-500/20 text-blue-400 border-blue-500/50" },
                                { val: "all", label: "🌐 الكل / مشترك", activeCls: "bg-purple-500/20 text-purple-400 border-purple-500/50" },
                              ].map((trackOpt) => {
                                const currentTrack = courseTracks[c.id] ?? c.languageTrack ?? "all";
                                const isSelected = currentTrack === trackOpt.val;
                                return (
                                  <button
                                    key={trackOpt.val}
                                    type="button"
                                    onClick={() =>
                                      setCourseTracks((prev) => ({
                                        ...prev,
                                        [c.id]: trackOpt.val as "arabic" | "languages" | "all",
                                      }))
                                    }
                                    className={`px-2 py-0.5 rounded-md text-[10px] font-bold border transition-all ${
                                      isSelected
                                        ? `${trackOpt.activeCls} shadow-sm ring-1 ring-white/10`
                                        : "bg-[var(--surface-2)] text-[var(--ink-2)] border-[var(--border)] hover:text-[var(--ink)] opacity-70"
                                    }`}
                                  >
                                    {trackOpt.label}
                                  </button>
                                );
                              })}
                            </div>
                          </div>

                          <div className="flex-1 space-y-2.5">
                            {/* Placement Buttons */}
                            <div className="flex flex-wrap items-center gap-1.5">
                              {dynamicPlacementOptions.map((opt) => {
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
                                          ? "bg-rose-500/20 text-rose-400 border-rose-500/40"
                                          : opt.value === "extra"
                                          ? "bg-amber-500/20 text-amber-400 border-amber-500/40"
                                          : "bg-emerald-600/20 text-emerald-400 border-emerald-500/50"
                                        : "bg-[var(--surface-2)] text-[var(--ink-2)] border-[var(--border)] hover:text-[var(--ink)]"
                                    }`}
                                  >
                                    <span
                                      className={`inline-block h-2 w-2 rounded-full ${
                                        isSelected
                                          ? opt.value === "none"
                                            ? "bg-rose-400"
                                            : opt.value === "extra"
                                            ? "bg-amber-400"
                                            : "bg-emerald-400"
                                          : "bg-slate-400"
                                      }`}
                                    />
                                    <span>{opt.shortLabel}</span>
                                  </button>
                                );
                              })}
                            </div>

                            {/* Access status description & quick presets */}
                            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                              <div className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] font-medium border ${desc.color}`}>
                                <span>{desc.text}</span>
                              </div>

                              <div className="flex items-center gap-1.5 text-[11px] flex-wrap">
                                <button
                                  type="button"
                                  onClick={() => {
                                    const allMonthsTokens = (pkgConfig.months || getDefaultMonths())
                                      .map((m) => `month:${m.number}`)
                                      .join(",");
                                    setPlacements((p) => ({ ...p, [c.id]: allMonthsTokens }));
                                  }}
                                  className="text-[var(--ink-2)] hover:text-emerald-500 transition-colors px-2 py-0.5 rounded border border-[var(--border)] bg-[var(--surface-2)]"
                                  title="إتاحة الكورس لجميع الشهور"
                                >
                                  + كل الشهور
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setPlacements((p) => ({ ...p, [c.id]: "term:1" }))}
                                  className="text-[var(--ink-2)] hover:text-indigo-400 transition-colors px-2 py-0.5 rounded border border-[var(--border)] bg-[var(--surface-2)]"
                                  title="إتاحة الكورس لمشتركي ترم 1"
                                >
                                  + ترم 1
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setPlacements((p) => ({ ...p, [c.id]: "term:2" }))}
                                  className="text-[var(--ink-2)] hover:text-indigo-400 transition-colors px-2 py-0.5 rounded border border-[var(--border)] bg-[var(--surface-2)]"
                                  title="إتاحة الكورس لمشتركي ترم 2"
                                >
                                  + ترم 2
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setPlacements((p) => ({ ...p, [c.id]: "yearly" }))}
                                  className="text-[var(--ink-2)] hover:text-amber-400 transition-colors px-2 py-0.5 rounded border border-[var(--border)] bg-[var(--surface-2)]"
                                  title="إتاحة الكورس لمشتركي باقة السنة فقط"
                                >
                                  + باقة السنة
                                </button>
                                <button
                                  type="button"
                                  onClick={() => autoEnrollSubscribers(c.id, c.title)}
                                  className="text-indigo-600 hover:text-indigo-500 font-bold transition-colors px-2 py-0.5 rounded border border-indigo-500/30 bg-indigo-500/10"
                                  title="تفعيل هذا الكورس في حسابات جميع المشتركين المؤهلين حالياً بضغطة واحدة"
                                >
                                  ⚡ تفعيل فوري للمشتركين
                                </button>
                                {val && (
                                  <button
                                    type="button"
                                    onClick={() => setPlacements((p) => ({ ...p, [c.id]: "" }))}
                                    className="text-rose-400 hover:text-rose-300 font-bold transition-colors px-2 py-0.5 rounded border border-rose-500/20 bg-rose-500/10"
                                    title="تفريغ التوزيع وإعادته للافتراضي"
                                  >
                                    تفريغ (إلغاء)
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════════
              TAB 2: BIG NOTIFICATION POP-UP FEATURE
             ══════════════════════════════════════════════════════════════════ */}
          {activeTab === "popup" && (
            <div className="space-y-6">
              {/* Feature Master Switch Card */}
              <div className={card}>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="space-y-1">
                    <h2 className="text-base font-bold text-[var(--ink)] flex items-center gap-2">
                      <Sparkles size={18} className="text-emerald-500" />
                      <span>ميزة الإشعار المنبثق الكبير للكورسات الجديدة (Big Notification Pop-up)</span>
                    </h2>
                    <p className="text-xs text-[var(--ink-2)]">
                      عند تفعيلها، يظهر للطلاب مربع إشعار منبثق فخم وكبير فور دخولهم المنصة يخبرهم بإضافة الكورس الجديد وبدء دراسته فوراً.
                    </p>
                  </div>

                  <div className="flex items-center gap-3">
                    <span className={`text-xs font-black ${pkgConfig.popupEnabled ? "text-emerald-500" : "text-rose-400"}`}>
                      {pkgConfig.popupEnabled ? "الميزة مُفعّلة حالياً" : "الميزة مُعطّلة"}
                    </span>
                    <button
                      type="button"
                      onClick={() => togglePopupFeature(!pkgConfig.popupEnabled)}
                      disabled={busy}
                      className={`px-5 h-10 rounded-xl font-bold text-xs text-white transition-all shadow-sm ${
                        pkgConfig.popupEnabled
                          ? "bg-rose-600 hover:bg-rose-500 shadow-rose-600/20"
                          : "bg-emerald-600 hover:bg-emerald-500 shadow-emerald-600/20"
                      }`}
                    >
                      {pkgConfig.popupEnabled ? "إيقاف الميزة" : "تفعيل الميزة الآن"}
                    </button>
                  </div>
                </div>
              </div>

              {/* Active Broadcast Status (if running) */}
              {pkgConfig.activePopup && (
                <div className="p-4 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0">
                      <Sparkles size={20} />
                    </span>
                    <div>
                      <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 block">
                        إشعار منبثق نشط حالياً للطلاب
                      </span>
                      <h4 className="text-sm font-black text-[var(--ink)]">
                        {pkgConfig.activePopup.customTitle || pkgConfig.activePopup.courseTitle}
                      </h4>
                      <p className="text-xs text-[var(--ink-2)] line-clamp-1">
                        {pkgConfig.activePopup.message}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setShowPreviewModal(true)}
                      className="px-3 h-8 rounded-lg border border-[var(--border)] bg-[var(--surface)] text-xs font-bold hover:bg-[var(--surface-2)] transition-colors"
                    >
                      معاينة الإشعار
                    </button>
                    <button
                      type="button"
                      onClick={() => togglePopupFeature(false)}
                      className="px-3 h-8 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold transition-colors"
                    >
                      إلغاء النشاط
                    </button>
                  </div>
                </div>
              )}

              {/* Create / Broadcast New Course Pop-up Form */}
              <div className={card}>
                <h3 className="font-bold text-sm text-[var(--ink)] flex items-center gap-2 border-b border-[var(--border)] pb-3">
                  <Send size={16} className="text-emerald-600" />
                  <span>تجهيز ونشر إشعار منبثق لكورس جديد</span>
                </h3>

                <div className="space-y-4 pt-1">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Course Selection */}
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-[var(--ink)] block">
                        اختر الكورس الجديد للإعلان عنه <span className="text-rose-500">*</span>
                      </label>
                      <select
                        className={`${input} w-full`}
                        value={popupCourseId}
                        onChange={(e) => {
                          const cid = e.target.value;
                          setPopupCourseId(cid);
                          const crs = allCourses.find((c) => c.id === cid);
                          if (crs) {
                            setPopupTitle(`🎉 كورس جديد أُضيف إلى حسابك: ${crs.title}`);
                            setPopupMessage(
                              `أستاذ ${selectedTeacher?.name || "معلمك"} أضاف كورساً جديداً (${crs.title}) متاحاً الآن في حسابك تلقائياً ضمن باقتك. اضغط للمشاهدة فوراً.`
                            );
                          }
                        }}
                      >
                        <option value="">— اختر الكورس من كورسات المعلم —</option>
                        {allCourses.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.title} ({STAGE_LABELS[c.educationalStage || ""] || c.educationalStage} - {c.price ?? 0} ج)
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Target Audience */}
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-[var(--ink)] block">
                        الجمهور المستهدف بالإشعار المنبثق
                      </label>
                      <select
                        className={`${input} w-full`}
                        value={popupTargetPlan}
                        onChange={(e) => setPopupTargetPlan(e.target.value as any)}
                      >
                        <option value="all">جميع طلاب المعلم (مشتركو جميع الباقات)</option>
                        <option value="monthly">مشتركو الشهر فقط (حجز الشهر الحالي)</option>
                        <option value="termly">مشتركو الترم فقط</option>
                        <option value="yearly">مشتركو باقة السنة فقط</option>
                      </select>
                    </div>
                  </div>

                  {/* Title Input */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-[var(--ink)] block">
                      عنوان الإشعار المنبثق (يظهر بخط كبير)
                    </label>
                    <input
                      type="text"
                      className={`${input} w-full`}
                      value={popupTitle}
                      onChange={(e) => setPopupTitle(e.target.value)}
                      placeholder="مثال: 🎉 كورس الشهر الثاني متاح الآن في حسابك!"
                    />
                  </div>

                  {/* Message Input */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-[var(--ink)] block">
                      نص الرسالة والشرح
                    </label>
                    <textarea
                      rows={3}
                      className="w-full p-3 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] text-[var(--ink)] text-sm focus:border-emerald-500 focus:outline-none transition-colors"
                      value={popupMessage}
                      onChange={(e) => setPopupMessage(e.target.value)}
                      placeholder="رسالة تشجيعية توضح للطالب محتويات الكورس وكيفية البدء..."
                    />
                  </div>

                  {/* Action Type & Renewal Button Options */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-[var(--ink)] block">
                        نوع أزرار الإجراء في الإشعار المنبثق
                      </label>
                      <select
                        className={`${input} w-full`}
                        value={popupActionType}
                        onChange={(e) => setPopupActionType(e.target.value as any)}
                      >
                        <option value="both">الزرين معاً: تجديد الاشتراك + فتح الكورس (موصى به للشهور الجديدة)</option>
                        <option value="renewal">زر التجديد فقط (يوجّه لصفحة حجز وتجديد الشهر مباشرة)</option>
                        <option value="course">زر فتح الكورس فقط (للكورسات المجانية أو المشمولة)</option>
                      </select>
                    </div>

                    {(popupActionType === "both" || popupActionType === "renewal") && (
                      <div className="space-y-1.5">
                        <label className="text-xs font-bold text-[var(--ink)] block">
                          نص زر التجديد
                        </label>
                        <input
                          type="text"
                          className={`${input} w-full`}
                          value={popupRenewalBtnText}
                          onChange={(e) => setPopupRenewalBtnText(e.target.value)}
                          placeholder="مثال: تجديد الاشتراك الآن ⚡ أو حجز الشهر الثاني"
                        />
                      </div>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-3 pt-2">
                    <button
                      type="button"
                      onClick={broadcastPopup}
                      disabled={busy || !popupCourseId}
                      className="px-6 h-11 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-black text-xs flex items-center gap-2 shadow-md shadow-emerald-600/25 disabled:opacity-50 transition-all"
                    >
                      <Send size={16} />
                      <span>نشر وتفعيل الإشعار المنبثق للطلاب 🚀</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setShowPreviewModal(true)}
                      disabled={!popupCourseId}
                      className="px-4 h-11 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] hover:bg-[var(--surface)] text-[var(--ink)] font-bold text-xs flex items-center gap-2 transition-colors disabled:opacity-50"
                    >
                      <Eye size={16} />
                      <span>معاينة حية للمودال</span>
                    </button>

                    {popupCourseId && (
                      <button
                        type="button"
                        onClick={() => {
                          const crs = allCourses.find((c) => c.id === popupCourseId);
                          if (crs) autoEnrollSubscribers(crs.id, crs.title);
                        }}
                        className="px-4 h-11 rounded-xl border border-indigo-500/30 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-500 font-bold text-xs flex items-center gap-2 transition-colors"
                      >
                        <span>تفعيل الكورس فوراً في حسابات المشتركين المؤهلين</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Live Preview Modal */}
              {showPreviewModal && (
                <div
                  dir="rtl"
                  className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
                  onClick={() => setShowPreviewModal(false)}
                >
                  <div
                    className="relative w-full max-w-lg rounded-3xl border border-[var(--border)] bg-[var(--surface)] text-[var(--ink)] shadow-2xl overflow-hidden"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="relative h-28 bg-gradient-to-r from-emerald-600 via-teal-600 to-indigo-600 p-6 flex items-start justify-between text-white">
                      <div className="flex items-center gap-3">
                        <span className="w-12 h-12 rounded-2xl bg-white/20 backdrop-blur-md border border-white/30 flex items-center justify-center text-white">
                          <Sparkles size={24} />
                        </span>
                        <div>
                          <span className="inline-block text-[11px] font-bold px-2 py-0.5 rounded-full bg-white/25 text-white">
                            إشعار كورس جديد 🎉 (معاينة)
                          </span>
                          <h3 className="text-base font-extrabold mt-0.5">
                            {selectedTeacher ? `أستاذ ${selectedTeacher.name}` : "اسم المعلم"}
                          </h3>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowPreviewModal(false)}
                        className="p-1.5 rounded-xl bg-black/20 text-white"
                      >
                        <X size={18} />
                      </button>
                    </div>

                    <div className="p-6 space-y-4">
                      <div className="space-y-1">
                        <span className="text-xs font-bold text-emerald-600">كورس متاح الآن في حسابك</span>
                        <h2 className="text-xl font-black text-[var(--ink)]">
                          {popupTitle || "عنوان الكورس الجديد"}
                        </h2>
                      </div>

                      <p className="text-sm text-[var(--ink-2)] bg-[var(--surface-2)] p-4 rounded-2xl border border-[var(--border)] leading-relaxed">
                        {popupMessage || "تم تفعيل هذا الكورس في حسابك تلقائياً ضمن اشتراكك الحالي..."}
                      </p>

                      <div className="flex flex-col sm:flex-row items-center gap-2 pt-2">
                        {(popupActionType === "both" || popupActionType === "renewal") && (
                          <button
                            type="button"
                            className="flex-1 w-full h-12 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 text-white font-black text-sm flex items-center justify-center gap-2 shadow-md shadow-amber-500/20"
                          >
                            <Sparkles size={16} />
                            <span>{popupRenewalBtnText || "تجديد الاشتراك الآن ⚡"}</span>
                          </button>
                        )}
                        {(popupActionType === "both" || popupActionType === "course") && (
                          <button
                            type="button"
                            className="flex-1 w-full h-12 rounded-xl bg-emerald-600 text-white font-black text-sm flex items-center justify-center gap-2"
                          >
                            ابدأ دراسة الكورس الآن
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => setShowPreviewModal(false)}
                          className="px-5 h-12 rounded-xl border border-[var(--border)] text-[var(--ink-2)] font-bold text-sm"
                        >
                          إغلاق
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════════
              TAB 3: COURSE COMPARISON & DIFFERENCE GRAPH
             ══════════════════════════════════════════════════════════════════ */}
          {activeTab === "comparison" && (
            <div className="space-y-6">
              {/* Course Selector & Compare Button */}
              <div className={card}>
                <div className="border-b border-[var(--border)] pb-3">
                  <h2 className="text-base font-bold text-[var(--ink)] flex items-center gap-2">
                    <BarChart3 size={18} className="text-emerald-600" />
                    <span>مقارنة المشتركين بين كورسين والفرق البياني</span>
                  </h2>
                  <p className="text-xs text-[var(--ink-2)] mt-0.5">
                    قارن بين من اشترى الكورس الأول (مثلاً كورس الشهر الأول) ومن اشترى الكورس الثاني (الشهر الثاني)، وشاهد رسم بياني للفرق ونسبة الاستمرار والطلاب المنقطعين.
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
                  {/* Course 1 Selector */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-[var(--ink)] flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                      <span>الكورس الأول (الأساس / السابق)</span>
                    </label>
                    <select
                      className={`${input} w-full`}
                      value={compCourse1}
                      onChange={(e) => setCompCourse1(e.target.value)}
                    >
                      <option value="">— اختر الكورس الأول (مثلاً الشهر 1) —</option>
                      {allCourses.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.title} ({STAGE_LABELS[c.educationalStage || ""] || c.educationalStage} - {c._count?.enrollments ?? 0} طالب)
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Course 2 Selector */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-[var(--ink)] flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-indigo-500" />
                      <span>الكورس الثاني (المقارن / الجديد)</span>
                    </label>
                    <select
                      className={`${input} w-full`}
                      value={compCourse2}
                      onChange={(e) => setCompCourse2(e.target.value)}
                    >
                      <option value="">— اختر الكورس الثاني (مثلاً الشهر 2) —</option>
                      {allCourses.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.title} ({STAGE_LABELS[c.educationalStage || ""] || c.educationalStage} - {c._count?.enrollments ?? 0} طالب)
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="flex items-center justify-end pt-2">
                  <button
                    type="button"
                    onClick={() => void runComparison()}
                    disabled={compLoading || !compCourse1 || !compCourse2}
                    className="px-6 h-10 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-2 shadow-md shadow-emerald-600/20 disabled:opacity-50 transition-all"
                  >
                    <ArrowRightLeft size={16} />
                    <span>{compLoading ? "جاري استخراج المقارنة…" : "بدء المقارنة والرسم البياني"}</span>
                  </button>
                </div>
              </div>

              {/* Comparison Results */}
              {comparison && (
                <div className="space-y-6">
                  {/* Summary Metric Cards */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {/* Course 1 Buyers */}
                    <div className="p-4 rounded-2xl border border-[var(--border)] bg-[var(--surface)] space-y-1 shadow-sm">
                      <span className="text-[11px] font-bold text-emerald-600 block">طلاب الكورس الأول</span>
                      <div className="text-2xl font-black text-[var(--ink)]">
                        {comparison.course1.totalBuyers}
                      </div>
                      <span className="text-[10px] text-[var(--ink-2)] line-clamp-1">
                        {comparison.course1.title}
                      </span>
                    </div>

                    {/* Course 2 Buyers */}
                    <div className="p-4 rounded-2xl border border-[var(--border)] bg-[var(--surface)] space-y-1 shadow-sm">
                      <span className="text-[11px] font-bold text-indigo-600 block">طلاب الكورس الثاني</span>
                      <div className="text-2xl font-black text-[var(--ink)]">
                        {comparison.course2.totalBuyers}
                      </div>
                      <span className="text-[10px] text-[var(--ink-2)] line-clamp-1">
                        {comparison.course2.title}
                      </span>
                    </div>

                    {/* Difference Card */}
                    <div className="p-4 rounded-2xl border border-[var(--border)] bg-[var(--surface)] space-y-1 shadow-sm">
                      <span className="text-[11px] font-bold text-[var(--ink-2)] block">فرق العدد والنمو</span>
                      <div className={`text-2xl font-black flex items-center gap-1.5 ${
                        comparison.metrics.diffCount >= 0 ? "text-emerald-500" : "text-rose-500"
                      }`}>
                        {comparison.metrics.diffCount >= 0 ? <TrendingUp size={22} /> : <TrendingDown size={22} />}
                        <span>{comparison.metrics.diffCount >= 0 ? `+${comparison.metrics.diffCount}` : comparison.metrics.diffCount}</span>
                      </div>
                      <span className="text-[10px] text-[var(--ink-2)]">
                        نسبة التغير: {comparison.metrics.percentChange}%
                      </span>
                    </div>

                    {/* Retention Card */}
                    <div className="p-4 rounded-2xl border border-[var(--border)] bg-[var(--surface)] space-y-1 shadow-sm">
                      <span className="text-[11px] font-bold text-amber-500 block">المشتركون في الاثنين (الاستمرار)</span>
                      <div className="text-2xl font-black text-amber-500">
                        {comparison.metrics.bothCount}
                      </div>
                      <span className="text-[10px] text-[var(--ink-2)]">
                        معدل التجديد: {comparison.metrics.retentionRate}%
                      </span>
                    </div>
                  </div>

                  {/* Visual Difference Graph & Cohort Funnel Card */}
                  <div className={card}>
                    <h3 className="font-bold text-sm text-[var(--ink)] flex items-center gap-2 border-b border-[var(--border)] pb-3">
                      <BarChart3 size={16} className="text-emerald-600" />
                      <span>الرسم البياني للمقارنة وتوزيع المشتركين</span>
                    </h3>

                    {/* SVG / CSS Bar Chart */}
                    <div className="space-y-4 pt-2">
                      {/* Bar 1: Course 1 Total */}
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-bold text-[var(--ink)] flex items-center gap-1.5">
                            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                            <span>الكورس الأول: {comparison.course1.title}</span>
                          </span>
                          <span className="font-black text-[var(--ink)]">{comparison.course1.totalBuyers} طالب</span>
                        </div>
                        <div className="w-full h-7 rounded-xl bg-[var(--surface-2)] overflow-hidden p-0.5">
                          <div
                            className="h-full rounded-lg bg-emerald-500 transition-all duration-500 flex items-center justify-end px-2"
                            style={{
                              width: `${Math.max(
                                8,
                                Math.round(
                                  (comparison.course1.totalBuyers /
                                    Math.max(1, comparison.course1.totalBuyers, comparison.course2.totalBuyers)) *
                                    100
                                )
                              )}%`,
                            }}
                          >
                            <span className="text-[10px] font-bold text-white">
                              {comparison.course1.totalBuyers}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Bar 2: Course 2 Total */}
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-bold text-[var(--ink)] flex items-center gap-1.5">
                            <span className="w-2.5 h-2.5 rounded-full bg-indigo-500" />
                            <span>الكورس الثاني: {comparison.course2.title}</span>
                          </span>
                          <span className="font-black text-[var(--ink)]">{comparison.course2.totalBuyers} طالب</span>
                        </div>
                        <div className="w-full h-7 rounded-xl bg-[var(--surface-2)] overflow-hidden p-0.5">
                          <div
                            className="h-full rounded-lg bg-indigo-500 transition-all duration-500 flex items-center justify-end px-2"
                            style={{
                              width: `${Math.max(
                                8,
                                Math.round(
                                  (comparison.course2.totalBuyers /
                                    Math.max(1, comparison.course1.totalBuyers, comparison.course2.totalBuyers)) *
                                    100
                                )
                              )}%`,
                            }}
                          >
                            <span className="text-[10px] font-bold text-white">
                              {comparison.course2.totalBuyers}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Bar 3: Both (Overlap) */}
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-bold text-[var(--ink)] flex items-center gap-1.5">
                            <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                            <span>المشتركون في الاثنين معاً (جددوا في الثاني)</span>
                          </span>
                          <span className="font-black text-amber-500">
                            {comparison.metrics.bothCount} طالب ({comparison.metrics.retentionRate}%)
                          </span>
                        </div>
                        <div className="w-full h-7 rounded-xl bg-[var(--surface-2)] overflow-hidden p-0.5">
                          <div
                            className="h-full rounded-lg bg-amber-500 transition-all duration-500 flex items-center justify-end px-2"
                            style={{
                              width: `${Math.max(
                                8,
                                Math.round(
                                  (comparison.metrics.bothCount /
                                    Math.max(1, comparison.course1.totalBuyers, comparison.course2.totalBuyers)) *
                                    100
                                )
                              )}%`,
                            }}
                          >
                            <span className="text-[10px] font-bold text-white">
                              {comparison.metrics.bothCount}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Bar 4: Dropped off (Course 1 only) */}
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-bold text-[var(--ink)] flex items-center gap-1.5">
                            <span className="w-2.5 h-2.5 rounded-full bg-rose-500" />
                            <span>اشتروا الأول فقط ولم يجددوا في الثاني (منقطعون)</span>
                          </span>
                          <span className="font-black text-rose-500">
                            {comparison.metrics.course1OnlyCount} طالب ({comparison.metrics.churnRate}%)
                          </span>
                        </div>
                        <div className="w-full h-7 rounded-xl bg-[var(--surface-2)] overflow-hidden p-0.5">
                          <div
                            className="h-full rounded-lg bg-rose-500 transition-all duration-500 flex items-center justify-end px-2"
                            style={{
                              width: `${Math.max(
                                8,
                                Math.round(
                                  (comparison.metrics.course1OnlyCount /
                                    Math.max(1, comparison.course1.totalBuyers, comparison.course2.totalBuyers)) *
                                    100
                                )
                              )}%`,
                            }}
                          >
                            <span className="text-[10px] font-bold text-white">
                              {comparison.metrics.course1OnlyCount}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Bar 5: New in Course 2 */}
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-bold text-[var(--ink)] flex items-center gap-1.5">
                            <span className="w-2.5 h-2.5 rounded-full bg-teal-500" />
                            <span>مشتركون جدد في الكورس الثاني فقط</span>
                          </span>
                          <span className="font-black text-teal-500">
                            {comparison.metrics.course2OnlyCount} طالب
                          </span>
                        </div>
                        <div className="w-full h-7 rounded-xl bg-[var(--surface-2)] overflow-hidden p-0.5">
                          <div
                            className="h-full rounded-lg bg-teal-500 transition-all duration-500 flex items-center justify-end px-2"
                            style={{
                              width: `${Math.max(
                                8,
                                Math.round(
                                  (comparison.metrics.course2OnlyCount /
                                    Math.max(1, comparison.course1.totalBuyers, comparison.course2.totalBuyers)) *
                                    100
                                )
                              )}%`,
                            }}
                          >
                            <span className="text-[10px] font-bold text-white">
                              {comparison.metrics.course2OnlyCount}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Student Cohorts Lists with WhatsApp 1-Click Export */}
                  <div className={card}>
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[var(--border)] pb-3">
                      <div className="flex items-center gap-1.5 overflow-x-auto p-1 bg-[var(--surface-2)] rounded-xl">
                        <button
                          type="button"
                          onClick={() => setCompStudentTab("diff")}
                          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                            compStudentTab === "diff"
                              ? "bg-emerald-600 text-white"
                              : "text-[var(--ink-2)] hover:text-[var(--ink)]"
                          }`}
                        >
                          المنقطعون ({comparison.students.course1Only.length})
                        </button>
                        <button
                          type="button"
                          onClick={() => setCompStudentTab("both")}
                          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                            compStudentTab === "both"
                              ? "bg-amber-600 text-white"
                              : "text-[var(--ink-2)] hover:text-[var(--ink)]"
                          }`}
                        >
                          المستمرون في الاثنين ({comparison.students.both.length})
                        </button>
                        <button
                          type="button"
                          onClick={() => setCompStudentTab("new")}
                          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                            compStudentTab === "new"
                              ? "bg-teal-600 text-white"
                              : "text-[var(--ink-2)] hover:text-[var(--ink)]"
                          }`}
                        >
                          الجدد في الثاني ({comparison.students.course2Only.length})
                        </button>
                        <button
                          type="button"
                          onClick={() => setCompStudentTab("course2")}
                          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                            compStudentTab === "course2"
                              ? "bg-indigo-600 text-white"
                              : "text-[var(--ink-2)] hover:text-[var(--ink)]"
                          }`}
                        >
                          كل طلاب الثاني ({comparison.students.allCourse2.length})
                        </button>
                        <button
                          type="button"
                          onClick={() => setCompStudentTab("course1")}
                          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                            compStudentTab === "course1"
                              ? "bg-emerald-600 text-white"
                              : "text-[var(--ink-2)] hover:text-[var(--ink)]"
                          }`}
                        >
                          كل طلاب الأول ({comparison.students.allCourse1.length})
                        </button>
                      </div>

                      <div className="flex items-center gap-2">
                        <div className="relative">
                          <input
                            type="text"
                            placeholder="بحث بالاسم أو الهاتف…"
                            value={compSearch}
                            onChange={(e) => setCompSearch(e.target.value)}
                            className={`${input} pr-8 h-9 text-xs w-48`}
                          />
                          <Search size={14} className="absolute right-2.5 top-2.5 text-[var(--ink-2)]" />
                        </div>

                        {/* Copy Phone Numbers for WhatsApp button */}
                        <button
                          type="button"
                          onClick={() => {
                            const list =
                              compStudentTab === "diff"
                                ? comparison.students.course1Only
                                : compStudentTab === "both"
                                ? comparison.students.both
                                : compStudentTab === "new"
                                ? comparison.students.course2Only
                                : compStudentTab === "course2"
                                ? comparison.students.allCourse2
                                : comparison.students.allCourse1;
                            copyPhones(list.map((s) => s.phone || s.parentPhone));
                          }}
                          className="px-3 h-9 rounded-xl border border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 text-xs font-bold flex items-center gap-1.5 transition-colors"
                        >
                          <Copy size={14} />
                          <span>نسخ الأرقام للواتساب</span>
                        </button>
                      </div>
                    </div>

                    {/* Cohort Table */}
                    {(() => {
                      const activeList =
                        compStudentTab === "diff"
                          ? comparison.students.course1Only
                          : compStudentTab === "both"
                          ? comparison.students.both
                          : compStudentTab === "new"
                          ? comparison.students.course2Only
                          : compStudentTab === "course2"
                          ? comparison.students.allCourse2
                          : comparison.students.allCourse1;

                      const filtered = activeList.filter((s) => {
                        if (!compSearch) return true;
                        const q = compSearch.toLowerCase();
                        return (
                          s.name.toLowerCase().includes(q) ||
                          s.phone?.includes(q) ||
                          s.parentPhone?.includes(q)
                        );
                      });

                      if (filtered.length === 0) {
                        return (
                          <p className="text-xs text-[var(--ink-2)] py-6 text-center">
                            لا يوجد طلاب مطابقون في هذا التصنيف.
                          </p>
                        );
                      }

                      return (
                        <div className="overflow-x-auto max-h-96 overflow-y-auto">
                          <table className="w-full text-xs">
                            <thead className="text-[var(--ink-2)] border-b border-[var(--border)]">
                              <tr className="text-right">
                                <th className="p-2">الطالب</th>
                                <th className="p-2">هاتف الطالب</th>
                                <th className="p-2">هاتف ولي الأمر</th>
                                <th className="p-2">الصف</th>
                                <th className="p-2">طريقة الوصول</th>
                                <th className="p-2">الباقة</th>
                                <th className="p-2">إجراءات</th>
                              </tr>
                            </thead>
                            <tbody>
                              {filtered.map((s) => (
                                <tr key={s.id} className="border-b border-[var(--border)] hover:bg-[var(--surface-2)]">
                                  <td className="p-2 font-bold text-[var(--ink)]">{s.name}</td>
                                  <td className="p-2 text-[var(--ink-2)]" dir="ltr">
                                    {s.phone || "—"}
                                  </td>
                                  <td className="p-2 text-[var(--ink-2)]" dir="ltr">
                                    {s.parentPhone || "—"}
                                  </td>
                                  <td className="p-2 text-[var(--ink-2)]">
                                    {STAGE_LABELS[s.educationalStage || ""] || s.educationalStage || "—"}
                                  </td>
                                  <td className="p-2">
                                    <span
                                      className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                        s.accessSource === "DIRECT"
                                          ? "bg-indigo-500/10 text-indigo-500"
                                          : s.accessSource === "BOTH"
                                          ? "bg-purple-500/10 text-purple-500"
                                          : "bg-emerald-500/10 text-emerald-500"
                                      }`}
                                    >
                                      {s.accessSource === "DIRECT"
                                        ? "شراء مباشر"
                                        : s.accessSource === "BOTH"
                                        ? "شراء وباقة"
                                        : "اشتراك باقة"}
                                    </span>
                                  </td>
                                  <td className="p-2 text-[var(--ink-2)]">
                                    {s.planLabel || PLAN_LABELS[s.planType || ""] || s.planType || "كورس فردي"}
                                  </td>
                                  <td className="p-2">
                                    {s.phone && (
                                      <a
                                        href={`https://wa.me/2${s.phone.replace(/^0+/, "")}`}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-600 hover:text-emerald-500"
                                      >
                                        <Phone size={12} />
                                        <span>واتساب</span>
                                      </a>
                                    )}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      );
                    })()}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════════
              TAB 4: STUDENTS & BOOKINGS ROSTER
             ══════════════════════════════════════════════════════════════════ */}
          {activeTab === "students" && (
            <div className="space-y-4">
              <div className={card}>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[var(--border)] pb-3">
                  <div>
                    <h3 className="font-bold text-sm text-[var(--ink)] flex items-center gap-2">
                      <Users size={16} className="text-emerald-600" />
                      <span>جميع الطلاب المشتركين في باقات المعلم ({stageBookings.length})</span>
                    </h3>
                    <p className="text-xs text-[var(--ink-2)] mt-0.5">
                      قائمة بجميع الطلاب وباقاتهم وتواريخ انتهائها وإمكانية تعديل وتمديد أي حجز.
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <div className="relative">
                      <input
                        type="text"
                        placeholder="بحث بالاسم أو الهاتف…"
                        className={`${input} pr-8 h-9 text-xs w-48`}
                        value={searchStudent}
                        onChange={(e) => setSearchStudent(e.target.value)}
                      />
                      <Search size={14} className="absolute right-2.5 top-2.5 text-[var(--ink-2)]" />
                    </div>

                    <select
                      className={`${input} h-9 text-xs`}
                      value={planFilter}
                      onChange={(e) => setPlanFilter(e.target.value)}
                    >
                      <option value="all">كل الباقات</option>
                      <option value="monthly">شهري</option>
                      <option value="termly">ترم</option>
                      <option value="yearly">سنة كاملة</option>
                    </select>

                    <select
                      className={`${input} h-9 text-xs`}
                      value={filter}
                      onChange={(e) => setFilter(e.target.value as "running" | "all")}
                    >
                      <option value="running">السارية فقط</option>
                      <option value="all">الكل (مع المنتهية)</option>
                    </select>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="text-[var(--ink-2)] border-b border-[var(--border)]">
                      <tr className="text-right">
                        <th className="p-2.5">الطالب</th>
                        <th className="p-2.5">الباقة</th>
                        <th className="p-2.5">اسم الحجز المسجل</th>
                        <th className="p-2.5">الترم / الشهر</th>
                        <th className="p-2.5">تاريخ الانتهاء</th>
                        <th className="p-2.5">الحالة</th>
                        <th className="p-2.5"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {stageBookings.map((b) => {
                        const e = edits[b.id] ?? {};
                        const nums = e.termNumbers ?? (b.termNumbers.length ? b.termNumbers : b.planType === "termly" ? [1] : []);
                        return (
                          <tr key={b.id} className="border-b border-[var(--border)] hover:bg-[var(--surface-2)]">
                            <td className="p-2.5">
                              <span className="font-bold text-[var(--ink)] block text-sm">{b.studentName || "—"}</span>
                              <div className="text-[11px] text-[var(--ink-2)] mt-0.5 space-x-1">
                                <span>{b.studentPhone || "بدون هاتف"}</span>
                                <span>·</span>
                                <span>{b.languageTrack === "languages" ? "لغات" : "عربي"}</span>
                                <span>·</span>
                                <span>{b.amount} ج</span>
                                <span>·</span>
                                <span>{b.paymentSource}</span>
                              </div>
                            </td>

                            <td className="p-2.5">
                              <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-emerald-500/10 text-emerald-500">
                                {PLAN_LABELS[b.planType] || b.planType}
                              </span>
                            </td>

                            <td className="p-2.5 text-[var(--ink)] font-semibold">
                              {b.planLabel || "—"}
                            </td>

                            <td className="p-2.5 whitespace-nowrap">
                              {b.planType === "termly" ? (
                                [1, 2].map((n) => (
                                  <label key={n} className="ml-2 font-bold">
                                    <input
                                      type="checkbox"
                                      checked={nums.includes(n)}
                                      onChange={(ev) =>
                                        edit(b.id, {
                                          termNumbers: ev.target.checked
                                            ? [...nums, n].sort()
                                            : nums.filter((x) => x !== n),
                                        })
                                      }
                                    />{" "}
                                    ترم {n}
                                  </label>
                                ))
                              ) : b.planType === "monthly" ? (
                                nums.length > 0 ? `شهر ${nums.join(", ")}` : "شهري"
                              ) : (
                                "سنة كاملة (1+2)"
                              )}
                            </td>

                            <td className="p-2.5">
                              <input
                                type="date"
                                className={`${input} h-8 text-xs`}
                                value={dateInput((e.expiresAt as string | undefined) ?? b.expiresAt)}
                                onChange={(ev) => edit(b.id, { expiresAt: ev.target.value || null })}
                              />
                            </td>

                            <td className="p-2.5">
                              <select
                                className={`${input} h-8 text-xs`}
                                value={e.status ?? b.status}
                                onChange={(ev) => edit(b.id, { status: ev.target.value })}
                              >
                                <option value="active">شغال ✓</option>
                                <option value="cancelled">ملغي ✕</option>
                              </select>
                            </td>

                            <td className="p-2.5">
                              <button
                                disabled={!edits[b.id]}
                                onClick={() => saveBooking(b)}
                                className="px-3 h-8 rounded-lg bg-emerald-600 text-white font-bold text-xs disabled:opacity-30 hover:bg-emerald-500 transition-colors"
                              >
                                حفظ
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {loadingState && !state && (
        <div className="p-12 rounded-3xl border border-[var(--border)] bg-[var(--surface)] text-center space-y-4">
          <div className="inline-block w-8 h-8 border-3 border-emerald-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm font-bold text-[var(--ink)]">جارٍ تحميل كورسات وباقات المعلم والبيانات الإحصائية…</p>
        </div>
      )}

      {!loadingState && !state && (
        <div className="p-12 rounded-3xl border border-[var(--border)] bg-[var(--surface)] text-center space-y-2">
          <p className="text-sm font-bold text-[var(--ink)]">اختر معلماً من القائمة أعلاه لبدء التحكم بكورساته وباقاته والفرق البياني للمشتركين.</p>
        </div>
      )}
    </div>
  );
}
