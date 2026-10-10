"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Copy, GraduationCap, KeyRound, RefreshCw, Search, Tag, Ticket, Wallet } from "lucide-react";
import { AccessGate } from "./AccessGate";
import { useToast } from "@/components/ui/Toast";
import {
  Badge,
  Button,
  EmptyState,
  Field,
  Input,
  Notice,
  PageHeader,
  Panel,
  Select,
  SkeletonRows,
  Tabs,
  fmtDate,
  fmtMoney,
  fmtNum,
  readJson,
} from "@/components/admin/ui/kit";

interface MoneyCode {
  id: string;
  code: string;
  amount: number;
  isUsed: boolean;
  usedById?: string | null;
  usedAt?: string | null;
  expiresAt?: string | null;
  createdAt: string;
}

interface DiscountCodeItem {
  id: string;
  code: string;
  discountType: "PERCENTAGE" | "FIXED_AMOUNT";
  discountValue: number;
  scope: string;
  targetId?: string | null;
  isActive: boolean;
  expiresAt?: string | null;
  maxTotalUses?: number | null;
  maxUsesPerStudent: number;
  allowedPaymentMethods?: string | null;
  createdAt: string;
  createdBy?: { id: string; name: string; email: string };
  _count?: { usages: number };
}

interface StudentResult {
  id: string;
  name: string;
  phone: string | null;
  educationalStage: string | null;
  balance: number;
}

type TabId = "codes" | "credit" | "course_access" | "discounts";

const PAYMENT_METHODS_OPTIONS = [
  { id: "wallet_balance", label: "رصيد المحفظة" },
  { id: "vf_cash", label: "فودافون كاش (محافظ إلكترونية)" },
  { id: "fawry", label: "فوري (Fawry Pay)" },
  { id: "instapay", label: "إنستاباي (InstaPay)" },
];

const SCOPE_LABEL: Record<string, string> = {
  PLATFORM_WIDE: "كل المنصة",
  TEACHER: "معلم",
  COURSE: "كورس",
  FOLDER: "محاضرة",
  VIDEO: "درس",
  PLAN: "خطة دراسية",
};

function storedActionPassword() {
  try {
    return sessionStorage.getItem("admin_action_password") || "";
  } catch {
    return "";
  }
}

function methodsCount(raw?: string | null) {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.length : null;
  } catch {
    return null;
  }
}

export function WalletSection() {
  const [tab, setTab] = useState<TabId>("codes");

  return (
    <AccessGate id="wallet" title="المحافظ والرصيد" type="wallet">
      <div dir="rtl" className="flex flex-col gap-5">
        <PageHeader
          title="المحافظ والرصيد"
          description="أكواد الرصيد، شحن رصيد طالب، أكواد الوصول للكورسات والتسجيل المباشر، وأكواد الخصم."
        />
        <Tabs<TabId>
          label="أقسام المحافظ"
          value={tab}
          onChange={setTab}
          items={[
            { id: "codes", label: "أكواد الرصيد", icon: <KeyRound size={15} /> },
            { id: "credit", label: "شحن رصيد طالب", icon: <Wallet size={15} /> },
            { id: "course_access", label: "أكواد وتسجيل الكورسات", icon: <GraduationCap size={15} /> },
            { id: "discounts", label: "أكواد الخصم", icon: <Tag size={15} /> },
          ]}
        />
        {tab === "codes" && <MoneyCodesTab />}
        {tab === "credit" && <CreditTab />}
        {tab === "course_access" && <CourseAccessTab />}
        {tab === "discounts" && <DiscountsTab />}
      </div>
    </AccessGate>
  );
}

/* ─── Copy helpers ───────────────────────────────────────────────────────── */

function useCopy() {
  const { success, error } = useToast();
  return async (text: string, label = "نُسخ") => {
    try {
      await navigator.clipboard.writeText(text);
      success(label);
    } catch {
      error("تعذر النسخ");
    }
  };
}

function CodeGrid({ codes, onCopy }: { codes: string[]; onCopy: (c: string) => void }) {
  return (
    <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))" }}>
      {codes.map((code) => (
        <button
          key={code}
          type="button"
          onClick={() => onCopy(code)}
          className="adm-well flex items-center justify-between gap-2 px-3 py-2.5 cursor-pointer hover:border-[var(--brand)]"
          title="نسخ"
        >
          <span className="adm-mono font-bold" style={{ color: "var(--brand)", letterSpacing: 1 }}>{code}</span>
          <Copy size={14} style={{ color: "var(--ink-3)" }} aria-hidden />
        </button>
      ))}
    </div>
  );
}

/* ─── Money codes ────────────────────────────────────────────────────────── */

function MoneyCodesTab() {
  const { success: toastSuccess, error: toastError } = useToast();
  const copy = useCopy();
  const [amount, setAmount] = useState("");
  const [count, setCount] = useState("1");
  const [prefix, setPrefix] = useState("CODEUP");
  const [expiresAt, setExpiresAt] = useState("");
  const [actionPassword, setActionPassword] = useState("");
  const [generating, setGenerating] = useState(false);
  const [generated, setGenerated] = useState<string[]>([]);
  const [allCodes, setAllCodes] = useState<MoneyCode[]>([]);
  const [loadingCodes, setLoadingCodes] = useState(true);
  const [codesError, setCodesError] = useState("");
  const [filter, setFilter] = useState<"all" | "available" | "used">("all");

  useEffect(() => setActionPassword(storedActionPassword()), []);

  const loadAllCodes = useCallback(async () => {
    setLoadingCodes(true);
    setCodesError("");
    try {
      const res = await fetch("/api/admin/money-codes", { credentials: "include" });
      const data = await readJson<{ codes?: MoneyCode[]; error?: string }>(res);
      if (!res.ok) {
        setCodesError(data?.error || "تعذر تحميل الأكواد");
        return;
      }
      setAllCodes(data?.codes ?? []);
    } catch {
      setCodesError("تعذر الاتصال بالخادم");
    } finally {
      setLoadingCodes(false);
    }
  }, []);

  useEffect(() => {
    void loadAllCodes();
  }, [loadAllCodes]);

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    const amt = parseFloat(amount);
    const cnt = parseInt(count, 10);
    if (!amt || amt <= 0) return toastError("أدخل مبلغاً صحيحاً");
    if (!cnt || cnt < 1 || cnt > 100) return toastError("العدد يجب أن يكون بين ١ و ١٠٠");
    if (!actionPassword.trim()) return toastError("أدخل كلمة مرور إجراءات المشرف");

    setGenerating(true);
    try {
      const res = await fetch("/api/admin/money-codes", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: amt,
          count: cnt,
          prefix: prefix.trim() || "CODEUP",
          expiresAt: expiresAt || undefined,
          actionPassword: actionPassword.trim(),
        }),
      });
      const data = await readJson<{ codes?: string[]; count?: number; error?: string }>(res);
      if (!res.ok) {
        toastError(data?.error || "تعذر إنشاء الأكواد");
        return;
      }
      setGenerated(data?.codes ?? []);
      toastSuccess(`أُنشئ ${fmtNum(data?.count ?? data?.codes?.length ?? 0)} كود`);
      void loadAllCodes();
    } catch {
      toastError("تعذر الاتصال بالخادم");
    } finally {
      setGenerating(false);
    }
  };

  const shown = allCodes.filter((c) => (filter === "all" ? true : filter === "used" ? c.isUsed : !c.isUsed));
  const available = allCodes.filter((c) => !c.isUsed);

  return (
    <>
      <Panel title="إنشاء أكواد رصيد" icon={<KeyRound size={16} />} description="كل كود يضيف مبلغه لمحفظة الطالب عند استخدامه مرة واحدة.">
        <form onSubmit={handleGenerate} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="المبلغ (جنيه)" htmlFor="mc-amount">
            <Input id="mc-amount" type="number" min="1" step="0.5" required value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="50" mono />
          </Field>
          <Field label="عدد الأكواد" hint="من ١ إلى ١٠٠" htmlFor="mc-count">
            <Input id="mc-count" type="number" min="1" max="100" required value={count} onChange={(e) => setCount(e.target.value)} mono />
          </Field>
          <Field label="البادئة" hint="اختياري" htmlFor="mc-prefix">
            <Input id="mc-prefix" value={prefix} onChange={(e) => setPrefix(e.target.value.toUpperCase())} maxLength={10} mono />
          </Field>
          <Field label="تاريخ الانتهاء" hint="اختياري" htmlFor="mc-exp">
            <Input id="mc-exp" type="datetime-local" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
          </Field>
          <Field label="كلمة مرور إجراءات المشرف" htmlFor="mc-pass" className="sm:col-span-2">
            <Input id="mc-pass" type="password" required autoComplete="current-password" value={actionPassword} onChange={(e) => setActionPassword(e.target.value)} />
          </Field>
          <div className="sm:col-span-2 flex items-end">
            <Button type="submit" variant="primary" block loading={generating}>
              إنشاء {count ? fmtNum(Number(count) || 0) : "؟"} كود بقيمة {amount ? fmtMoney(Number(amount) || 0) : "؟"}
            </Button>
          </div>
        </form>
      </Panel>

      {generated.length > 0 && (
        <Panel
          title={`أُنشئ ${fmtNum(generated.length)} كود`}
          icon={<Check size={16} />}
          actions={<Button size="sm" icon={<Copy size={14} />} onClick={() => void copy(generated.join("\n"), "نُسخت كل الأكواد")}>نسخ الكل</Button>}
        >
          <CodeGrid codes={generated} onCopy={(c) => void copy(c, `نُسخ ${c}`)} />
        </Panel>
      )}

      <Panel
        padded={false}
        title="سجل أكواد الرصيد"
        description={allCodes.length ? `${fmtNum(available.length)} متاح من ${fmtNum(allCodes.length)} · قيمة المتاح ${fmtMoney(available.reduce((s, c) => s + c.amount, 0))}` : undefined}
        actions={
          <>
            <Select inputSize="sm" value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)} aria-label="تصفية الأكواد" className="w-32">
              <option value="all">الكل</option>
              <option value="available">المتاح</option>
              <option value="used">المستخدم</option>
            </Select>
            <Button size="sm" onClick={() => void loadAllCodes()} loading={loadingCodes} icon={<RefreshCw size={14} />}>تحديث</Button>
          </>
        }
      >
        {codesError ? (
          <div className="p-4"><Notice tone="bad" title={codesError} /></div>
        ) : loadingCodes && allCodes.length === 0 ? (
          <SkeletonRows rows={4} />
        ) : shown.length === 0 ? (
          <EmptyState icon={<KeyRound size={22} />} title="لا توجد أكواد" />
        ) : (
          <div className="adm-table-wrap max-h-[520px]">
            <table className="adm-table" style={{ minWidth: 640 }}>
              <thead>
                <tr>
                  <th>الكود</th>
                  <th className="is-num">المبلغ</th>
                  <th>الحالة</th>
                  <th>استُخدم في</th>
                  <th>الانتهاء</th>
                  <th>أُنشئ</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((c) => (
                  <tr key={c.id} className={c.isUsed ? "is-muted" : undefined}>
                    <td>
                      <button type="button" onClick={() => void copy(c.code, `نُسخ ${c.code}`)} className="adm-mono font-bold cursor-pointer hover:underline" style={{ color: c.isUsed ? "var(--ink-3)" : "var(--brand)", textDecoration: c.isUsed ? "line-through" : undefined }}>
                        {c.code}
                      </button>
                    </td>
                    <td className="is-num font-bold">{fmtMoney(c.amount)}</td>
                    <td><Badge tone={c.isUsed ? "neutral" : "ok"}>{c.isUsed ? "مستخدم" : "متاح"}</Badge></td>
                    <td className="adm-muted whitespace-nowrap">{c.usedAt ? fmtDate(c.usedAt) : "—"}</td>
                    <td className="adm-muted whitespace-nowrap">{c.expiresAt ? fmtDate(c.expiresAt) : "بدون"}</td>
                    <td className="adm-muted whitespace-nowrap">{fmtDate(c.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </>
  );
}

/* ─── Student search (shared) ────────────────────────────────────────────── */

function useStudentSearch() {
  const [results, setResults] = useState<StudentResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const seq = useRef(0);

  const search = useCallback(async (q: string) => {
    const id = ++seq.current;
    if (!q.trim()) {
      setResults([]);
      setSearched(false);
      return;
    }
    setSearching(true);
    try {
      const res = await fetch(`/api/admin/students/search?q=${encodeURIComponent(q.trim())}`, { credentials: "include" });
      const data = await readJson<{ students?: StudentResult[] }>(res);
      if (id !== seq.current) return; // a newer search is in flight
      setResults(data?.students ?? []);
      setSearched(true);
    } catch {
      if (id === seq.current) setResults([]);
    } finally {
      if (id === seq.current) setSearching(false);
    }
  }, []);

  return { results, setResults, searching, searched, search };
}

function StudentPicker({
  selected,
  onSelect,
  label = "ابحث عن طالب",
}: {
  selected: StudentResult | null;
  onSelect: (s: StudentResult | null) => void;
  label?: string;
}) {
  const [q, setQ] = useState("");
  const { results, searching, searched, search } = useStudentSearch();

  // Debounced live search.
  useEffect(() => {
    if (selected) return;
    const t = setTimeout(() => void search(q), 300);
    return () => clearTimeout(t);
  }, [q, search, selected]);

  if (selected) {
    return (
      <div className="adm-well flex flex-wrap items-center justify-between gap-3 px-4 py-3">
        <div className="min-w-0">
          <p className="text-sm font-bold">{selected.name}</p>
          <p className="text-xs adm-muted">
            {selected.phone ? <span className="adm-mono">{selected.phone}</span> : "بدون هاتف"} · الرصيد {fmtMoney(selected.balance)}
          </p>
        </div>
        <Button size="sm" onClick={() => onSelect(null)}>تغيير الطالب</Button>
      </div>
    );
  }

  return (
    <Field label={label} htmlFor="stu-picker">
      <div className="adm-search">
        <Search size={15} aria-hidden />
        <input
          id="stu-picker"
          type="search"
          className="adm-input"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="الاسم أو رقم الهاتف"
          autoComplete="off"
        />
      </div>
      {searching && <p className="adm-hint">جارٍ البحث…</p>}
      {!searching && searched && results.length === 0 && <p className="adm-hint">لا توجد نتائج</p>}
      {results.length > 0 && (
        <ul className="adm-well adm-list max-h-64 overflow-y-auto mt-1">
          {results.map((s) => (
            <li key={s.id}>
              <button type="button" onClick={() => onSelect(s)} className="adm-row w-full text-start cursor-pointer hover:bg-[var(--adm-hover)]" style={{ padding: "10px 14px" }}>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold">{s.name}</p>
                  <p className="text-xs adm-muted">{s.phone ? <span className="adm-mono">{s.phone}</span> : "بدون هاتف"}{s.educationalStage ? ` · ${s.educationalStage}` : ""}</p>
                </div>
                <span className="text-sm font-bold adm-num" style={{ color: "var(--gold)" }}>{fmtMoney(s.balance)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Field>
  );
}

/* ─── Credit ─────────────────────────────────────────────────────────────── */

function CreditTab() {
  const { success: toastSuccess, error: toastError } = useToast();
  const [selected, setSelected] = useState<StudentResult | null>(null);
  const [creditAmt, setCreditAmt] = useState("");
  const [note, setNote] = useState("");
  const [crediting, setCrediting] = useState(false);

  const amt = parseFloat(creditAmt);
  const isDebit = amt < 0;

  const handleCredit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selected) return;
    if (!amt) return toastError("أدخل المبلغ");
    setCrediting(true);
    try {
      const res = await fetch(`/api/admin/students/${selected.id}/balance`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: amt, note: note.trim() || undefined }),
      });
      const data = await readJson<{ message?: string; newBalance?: number; error?: string }>(res);
      if (!res.ok) {
        toastError(data?.error || "تعذر تعديل الرصيد");
        return;
      }
      toastSuccess(data?.message || "تم تعديل الرصيد");
      setSelected((prev) => (prev ? { ...prev, balance: data?.newBalance ?? prev.balance } : null));
      setCreditAmt("");
      setNote("");
    } catch {
      toastError("تعذر الاتصال بالخادم");
    } finally {
      setCrediting(false);
    }
  };

  return (
    <Panel title="شحن أو خصم رصيد طالب" icon={<Wallet size={16} />} description="المبلغ الموجب يُضاف لمحفظة الطالب، والسالب يُخصم منها. كل عملية تُسجّل بملاحظتها.">
      <div className="flex flex-col gap-4 max-w-2xl">
        <StudentPicker selected={selected} onSelect={setSelected} />
        {selected && (
          <form onSubmit={handleCredit} className="flex flex-col gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="المبلغ (جنيه)" hint="سالب للخصم، مثال: -50" htmlFor="cr-amt">
                <Input id="cr-amt" type="number" step="0.5" required value={creditAmt} onChange={(e) => setCreditAmt(e.target.value)} placeholder="100" mono />
              </Field>
              <Field label="ملاحظة" hint="اختياري — سبب الشحن أو الخصم" htmlFor="cr-note">
                <Input id="cr-note" value={note} onChange={(e) => setNote(e.target.value)} />
              </Field>
            </div>
            <div className="flex flex-wrap gap-2" aria-label="مبالغ سريعة">
              {[25, 50, 100, 150, 200, 250, 300, 500].map((v) => (
                <button key={v} type="button" className="adm-chip" aria-pressed={creditAmt === String(v)} onClick={() => setCreditAmt(String(v))}>
                  {fmtNum(v)} ج
                </button>
              ))}
            </div>
            <Button type="submit" variant={isDebit ? "danger-solid" : "primary"} loading={crediting} disabled={!creditAmt}>
              {isDebit ? `خصم ${fmtMoney(Math.abs(amt) || 0)} من ${selected.name}` : `إضافة ${creditAmt ? fmtMoney(amt || 0) : "؟"} لـ ${selected.name}`}
            </Button>
          </form>
        )}
      </div>
    </Panel>
  );
}

/* ─── Course access & direct enrollment ──────────────────────────────────── */

type CourseOption = { id: string; title: string; subject: string; teacher?: { name: string } };

function CourseAccessTab() {
  const { success: toastSuccess, error: toastError } = useToast();
  const copy = useCopy();
  const [coursesList, setCoursesList] = useState<CourseOption[]>([]);
  const [loadingCourses, setLoadingCourses] = useState(true);

  const [accessCourseId, setAccessCourseId] = useState("");
  const [accessCount, setAccessCount] = useState("1");
  const [accessPrefix, setAccessPrefix] = useState("CRS");
  const [generatingAccess, setGeneratingAccess] = useState(false);
  const [generatedAccessCodes, setGeneratedAccessCodes] = useState<Array<{ id?: string; code: string }>>([]);

  const [enrollStudent, setEnrollStudent] = useState<StudentResult | null>(null);
  const [enrollCourseId, setEnrollCourseId] = useState("");
  const [enrolling, setEnrolling] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/admin/superadmin/courses", { credentials: "include" });
        const data = await readJson<{ courses?: CourseOption[] }>(res);
        if (res.ok && data?.courses) {
          setCoursesList(data.courses);
          if (data.courses[0]) {
            setAccessCourseId((p) => p || data.courses![0].id);
            setEnrollCourseId((p) => p || data.courses![0].id);
          }
        }
      } finally {
        setLoadingCourses(false);
      }
    })();
  }, []);

  const courseOptions = coursesList.map((c) => (
    <option key={c.id} value={c.id}>
      {c.title} — {c.subject || "عام"}
      {c.teacher?.name ? ` · أ. ${c.teacher.name}` : ""}
    </option>
  ));

  const handleGenerateAccessCodes = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accessCourseId) return toastError("اختر الكورس أولاً");
    const cnt = parseInt(accessCount, 10);
    if (!cnt || cnt < 1 || cnt > 100) return toastError("العدد يجب أن يكون بين ١ و ١٠٠");
    setGeneratingAccess(true);
    try {
      const res = await fetch("/api/admin/codes", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ courseId: accessCourseId, count: cnt, prefix: accessPrefix.trim() || "CRS", accessType: "TERM" }),
      });
      const data = await readJson<{ codes?: Array<{ id?: string; code: string }>; error?: string }>(res);
      if (!res.ok || !data?.codes) {
        toastError(data?.error || "تعذر توليد أكواد الوصول");
        return;
      }
      setGeneratedAccessCodes(data.codes);
      toastSuccess(`وُلّد ${fmtNum(data.codes.length)} كود وصول`);
    } catch {
      toastError("تعذر الاتصال بالخادم");
    } finally {
      setGeneratingAccess(false);
    }
  };

  const handleDirectEnroll = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!enrollStudent) return toastError("اختر الطالب أولاً");
    if (!enrollCourseId) return toastError("اختر الكورس");
    setEnrolling(true);
    try {
      const res = await fetch("/api/admin/superadmin/courses/enroll", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ studentId: enrollStudent.id, courseId: enrollCourseId }),
      });
      const data = await readJson<{ success?: boolean; message?: string; error?: string }>(res);
      if (!res.ok || !data?.success) {
        toastError(data?.error || "تعذر تسجيل الطالب في الكورس");
        return;
      }
      toastSuccess(data.message || `سُجّل ${enrollStudent.name} في الكورس`);
      setEnrollStudent(null);
    } catch {
      toastError("تعذر الاتصال بالخادم");
    } finally {
      setEnrolling(false);
    }
  };

  return (
    <>
      <Panel
        title="أكواد وصول لكورس"
        icon={<Ticket size={16} />}
        description="تفتح الكورس في مكتبة الطالب فوراً عند إدخالها. لا تضيف أي رصيد للمحفظة."
      >
        {loadingCourses ? (
          <SkeletonRows rows={2} />
        ) : coursesList.length === 0 ? (
          <Notice tone="warn" title="لا توجد كورسات على المنصة بعد" />
        ) : (
          <form onSubmit={handleGenerateAccessCodes} className="grid gap-4 sm:grid-cols-[2fr_1fr_1fr_auto] items-end">
            <Field label="الكورس" htmlFor="ac-course">
              <Select id="ac-course" value={accessCourseId} onChange={(e) => setAccessCourseId(e.target.value)} required>
                {courseOptions}
              </Select>
            </Field>
            <Field label="العدد" htmlFor="ac-count">
              <Input id="ac-count" type="number" min="1" max="100" required value={accessCount} onChange={(e) => setAccessCount(e.target.value)} mono />
            </Field>
            <Field label="البادئة" htmlFor="ac-prefix">
              <Input id="ac-prefix" value={accessPrefix} onChange={(e) => setAccessPrefix(e.target.value.toUpperCase())} maxLength={10} mono />
            </Field>
            <Button type="submit" variant="primary" loading={generatingAccess}>توليد</Button>
          </form>
        )}
        {generatedAccessCodes.length > 0 && (
          <div className="mt-5 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <Badge tone="ok" dot>وُلّد {fmtNum(generatedAccessCodes.length)} كود</Badge>
              <Button size="sm" icon={<Copy size={14} />} onClick={() => void copy(generatedAccessCodes.map((c) => c.code).join("\n"), "نُسخت كل الأكواد")}>نسخ الكل</Button>
            </div>
            <CodeGrid codes={generatedAccessCodes.map((c) => c.code)} onCopy={(c) => void copy(c, `نُسخ ${c}`)} />
          </div>
        )}
      </Panel>

      <Panel title="تسجيل طالب مباشرة في كورس" icon={<GraduationCap size={16} />} description="يفتح محتوى الكورس للطالب فوراً بدون كود.">
        <div className="flex flex-col gap-4 max-w-2xl">
          <StudentPicker selected={enrollStudent} onSelect={setEnrollStudent} />
          {enrollStudent && (
            <form onSubmit={handleDirectEnroll} className="flex flex-col gap-4">
              <Field label="الكورس" htmlFor="en-course">
                <Select id="en-course" value={enrollCourseId} onChange={(e) => setEnrollCourseId(e.target.value)} required>
                  {courseOptions}
                </Select>
              </Field>
              <Button type="submit" variant="primary" loading={enrolling} disabled={!enrollCourseId}>
                تسجيل {enrollStudent.name} في الكورس
              </Button>
            </form>
          )}
        </div>
      </Panel>
    </>
  );
}

/* ─── Discounts ──────────────────────────────────────────────────────────── */

function DiscountsTab() {
  const { success: toastSuccess, error: toastError } = useToast();
  const copy = useCopy();
  const [discountCodes, setDiscountCodes] = useState<DiscountCodeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [dCode, setDCode] = useState("");
  const [dType, setDType] = useState<"PERCENTAGE" | "FIXED_AMOUNT">("PERCENTAGE");
  const [dValue, setDValue] = useState("");
  const [dScope, setDScope] = useState("PLATFORM_WIDE");
  const [dTargetId, setDTargetId] = useState("");
  const [dExpiresAt, setDExpiresAt] = useState("");
  const [dMaxTotal, setDMaxTotal] = useState("");
  const [dMaxPerStudent, setDMaxPerStudent] = useState("1");
  const [dAllowedMethods, setDAllowedMethods] = useState<string[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/discount-codes", { credentials: "include" });
      const data = await readJson<{ discountCodes?: DiscountCodeItem[] }>(res);
      if (res.ok && data?.discountCodes) setDiscountCodes(data.discountCodes);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const val = parseFloat(dValue);
    if (!dCode.trim()) return toastError("أدخل كود الخصم");
    if (!val || val <= 0) return toastError("أدخل قيمة الخصم");
    if (dType === "PERCENTAGE" && val > 100) return toastError("النسبة لا تتجاوز ١٠٠٪");
    if (dScope !== "PLATFORM_WIDE" && !dTargetId.trim()) return toastError("أدخل معرّف العنصر المستهدف");
    setCreating(true);
    try {
      const res = await fetch("/api/admin/discount-codes", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: dCode.trim(),
          discountType: dType,
          discountValue: val,
          scope: dScope,
          targetId: dScope === "PLATFORM_WIDE" ? null : dTargetId.trim(),
          expiresAt: dExpiresAt || undefined,
          maxTotalUses: dMaxTotal ? parseInt(dMaxTotal, 10) : null,
          maxUsesPerStudent: parseInt(dMaxPerStudent, 10) || 1,
          allowedPaymentMethods: dAllowedMethods.length > 0 ? dAllowedMethods : undefined,
        }),
      });
      const data = await readJson<{ discountCode?: { code: string }; error?: string }>(res);
      if (!res.ok) {
        toastError(data?.error || "تعذر إنشاء كود الخصم");
        return;
      }
      toastSuccess(`أُنشئ كود الخصم ${data?.discountCode?.code ?? ""}`);
      setDCode("");
      setDValue("");
      setDTargetId("");
      setDExpiresAt("");
      setDMaxTotal("");
      setDAllowedMethods([]);
      void load();
    } catch {
      toastError("تعذر الاتصال بالخادم");
    } finally {
      setCreating(false);
    }
  };

  const handleToggle = async (d: DiscountCodeItem) => {
    setTogglingId(d.id);
    try {
      const res = await fetch("/api/admin/discount-codes", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: d.id, isActive: !d.isActive }),
      });
      if (!res.ok) throw new Error();
      setDiscountCodes((prev) => prev.map((x) => (x.id === d.id ? { ...x, isActive: !d.isActive } : x)));
      toastSuccess(!d.isActive ? "فُعّل كود الخصم" : "أُوقف كود الخصم");
    } catch {
      toastError("تعذر تحديث حالة كود الخصم");
    } finally {
      setTogglingId(null);
    }
  };

  return (
    <>
      <Panel title="كود خصم جديد" icon={<Tag size={16} />} description="أكواد الخصم تقلل سعر الشراء فقط، ولا تضيف رصيداً للمحفظة.">
        <form onSubmit={handleCreate} className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 200px), 1fr))" }}>
          <Field label="الكود" htmlFor="dc-code">
            <Input id="dc-code" required value={dCode} onChange={(e) => setDCode(e.target.value.toUpperCase())} placeholder="SUMMER2026" mono />
          </Field>
          <Field label="النوع" htmlFor="dc-type">
            <Select id="dc-type" value={dType} onChange={(e) => setDType(e.target.value as typeof dType)}>
              <option value="PERCENTAGE">نسبة مئوية (٪)</option>
              <option value="FIXED_AMOUNT">مبلغ ثابت (جنيه)</option>
            </Select>
          </Field>
          <Field label="القيمة" htmlFor="dc-val" hint={dType === "PERCENTAGE" ? "مثال: 20 = ٢٠٪" : "مثال: 100 جنيه"}>
            <Input id="dc-val" type="number" min="0.1" step="0.5" required value={dValue} onChange={(e) => setDValue(e.target.value)} mono />
          </Field>
          <Field label="النطاق" htmlFor="dc-scope">
            <Select id="dc-scope" value={dScope} onChange={(e) => setDScope(e.target.value)}>
              {Object.entries(SCOPE_LABEL).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </Select>
          </Field>
          {dScope !== "PLATFORM_WIDE" && (
            <Field label={`معرّف ${SCOPE_LABEL[dScope] ?? "العنصر"}`} htmlFor="dc-target" className="col-span-full">
              <Input id="dc-target" required value={dTargetId} onChange={(e) => setDTargetId(e.target.value.trim())} placeholder="ID" mono />
            </Field>
          )}
          <Field label="تاريخ الانتهاء" hint="اختياري" htmlFor="dc-exp">
            <Input id="dc-exp" type="datetime-local" value={dExpiresAt} onChange={(e) => setDExpiresAt(e.target.value)} />
          </Field>
          <Field label="حد الاستخدام الكلي" hint="فارغ = بلا حد" htmlFor="dc-max">
            <Input id="dc-max" type="number" min="1" value={dMaxTotal} onChange={(e) => setDMaxTotal(e.target.value)} mono />
          </Field>
          <Field label="مرات لكل طالب" htmlFor="dc-per">
            <Input id="dc-per" type="number" min="1" required value={dMaxPerStudent} onChange={(e) => setDMaxPerStudent(e.target.value)} mono />
          </Field>
          <fieldset className="col-span-full adm-well p-3">
            <legend className="adm-label px-1">طرق الدفع المسموحة (فارغ = الكل)</legend>
            <div className="flex flex-wrap gap-x-5 gap-y-1">
              {PAYMENT_METHODS_OPTIONS.map((m) => (
                <label key={m.id} className="adm-check">
                  <input
                    type="checkbox"
                    checked={dAllowedMethods.includes(m.id)}
                    onChange={(e) => setDAllowedMethods((prev) => (e.target.checked ? [...prev, m.id] : prev.filter((x) => x !== m.id)))}
                  />
                  {m.label}
                </label>
              ))}
            </div>
          </fieldset>
          <div className="col-span-full">
            <Button type="submit" variant="primary" loading={creating}>حفظ كود الخصم</Button>
          </div>
        </form>
      </Panel>

      <Panel
        padded={false}
        title={`أكواد الخصم (${fmtNum(discountCodes.length)})`}
        actions={<Button size="sm" onClick={() => void load()} loading={loading} icon={<RefreshCw size={14} />}>تحديث</Button>}
      >
        {loading && discountCodes.length === 0 ? (
          <SkeletonRows rows={3} />
        ) : discountCodes.length === 0 ? (
          <EmptyState icon={<Tag size={22} />} title="لا توجد أكواد خصم" />
        ) : (
          <div className="adm-table-wrap">
            <table className="adm-table" style={{ minWidth: 820 }}>
              <thead>
                <tr>
                  <th>الكود</th>
                  <th>القيمة</th>
                  <th>النطاق</th>
                  <th className="is-num">الاستخدام</th>
                  <th>طرق الدفع</th>
                  <th>الحالة</th>
                  <th>الانتهاء</th>
                  <th className="is-actions" />
                </tr>
              </thead>
              <tbody>
                {discountCodes.map((d) => {
                  const methods = methodsCount(d.allowedPaymentMethods);
                  return (
                    <tr key={d.id} className={d.isActive ? undefined : "is-muted"}>
                      <td>
                        <button type="button" onClick={() => void copy(d.code, `نُسخ ${d.code}`)} className="adm-mono font-bold cursor-pointer hover:underline" style={{ color: "var(--brand)" }}>
                          {d.code}
                        </button>
                      </td>
                      <td className="font-bold whitespace-nowrap" style={{ color: "var(--gold)" }}>
                        {d.discountType === "PERCENTAGE" ? `${fmtNum(d.discountValue)}٪` : fmtMoney(d.discountValue)}
                      </td>
                      <td>
                        <Badge>{SCOPE_LABEL[d.scope] ?? d.scope}</Badge>
                        {d.targetId && <span className="adm-mono adm-muted text-xs ms-1" title={d.targetId}>{d.targetId.slice(0, 8)}…</span>}
                      </td>
                      <td className="is-num">
                        {fmtNum(d._count?.usages ?? 0)}
                        {d.maxTotalUses ? ` / ${fmtNum(d.maxTotalUses)}` : ""}
                      </td>
                      <td className="adm-muted">{methods ? `${fmtNum(methods)} طرق` : "الكل"}</td>
                      <td><Badge tone={d.isActive ? "ok" : "neutral"} dot>{d.isActive ? "مفعّل" : "متوقف"}</Badge></td>
                      <td className="adm-muted whitespace-nowrap">{d.expiresAt ? fmtDate(d.expiresAt) : "دائم"}</td>
                      <td className="is-actions">
                        <Button size="sm" variant={d.isActive ? "ghost" : "secondary"} loading={togglingId === d.id} onClick={() => void handleToggle(d)}>
                          {d.isActive ? "إيقاف" : "تفعيل"}
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </>
  );
}
