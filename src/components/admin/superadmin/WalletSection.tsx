"use client";

import { useState, useEffect } from "react";
import { AccessGate } from "./AccessGate";
import { useToast } from "@/components/ui/Toast";

interface MoneyCode {
  id: string; code: string; amount: number; isUsed: boolean;
  usedById?: string | null; usedAt?: string | null;
  expiresAt?: string | null; createdAt: string;
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
  id: string; name: string; phone: string | null;
  educationalStage: string | null; balance: number;
}

/* ── tiny helpers ── */
const input = "w-full px-4 py-2.5 rounded-xl outline-none text-sm transition-colors";
const inputStyle = { border: "1px solid var(--border)", background: "var(--surface-2)", color: "var(--ink)", fontFamily: "var(--font-body)" };

const PAYMENT_METHODS_OPTIONS = [
  { id: "wallet_balance", label: "رصيد المحفظة" },
  { id: "vf_cash", label: "فودافون كاش (محافظ إلكترونية)" },
  { id: "fawry", label: "فوري (Fawry Pay)" },
  { id: "instapay", label: "إنستاباي (InstaPay)" },
];

export function WalletSection() {
  const { success: toastSuccess, error: toastError } = useToast();
  const [tab, setTab] = useState<"codes" | "credit" | "discounts" | "course_access">("codes");

  /* ── Code generator state ── */
  const [amount,    setAmount]    = useState("");
  const [count,     setCount]     = useState("1");
  const [prefix,    setPrefix]    = useState("CODEUP");
  const [expiresAt, setExpiresAt] = useState("");
  const [moneyActionPassword, setMoneyActionPassword] = useState("");
  const [generating, setGenerating] = useState(false);
  const [generated,  setGenerated]  = useState<string[]>([]);
  const [allCodes,   setAllCodes]   = useState<MoneyCode[]>([]);
  const [loadingCodes, setLoadingCodes] = useState(false);
  const [codesLoaded,  setCodesLoaded]  = useState(false);

  /* ── Course Access & Direct Enrollment State ── */
  const [coursesList, setCoursesList] = useState<{ id: string; title: string; subject: string; teacher?: { name: string } }[]>([]);
  const [loadingCourses, setLoadingCourses] = useState(false);

  // 1. Course Code Generator
  const [accessCourseId, setAccessCourseId] = useState("");
  const [accessCount, setAccessCount] = useState("1");
  const [accessPrefix, setAccessPrefix] = useState("CRS");
  const [accessType, setAccessType] = useState<"TERM" | "FOLDER" | "VIDEO">("TERM");
  const [generatingAccess, setGeneratingAccess] = useState(false);
  const [generatedAccessCodes, setGeneratedAccessCodes] = useState<any[]>([]);

  // 2. Direct Student Enrollment
  const [enrollStudentQ, setEnrollStudentQ] = useState("");
  const [enrollSearching, setEnrollSearching] = useState(false);
  const [enrollStudents, setEnrollStudents] = useState<StudentResult[]>([]);
  const [enrollSelectedStudent, setEnrollSelectedStudent] = useState<StudentResult | null>(null);
  const [enrollCourseId, setEnrollCourseId] = useState("");
  const [enrolling, setEnrolling] = useState(false);

  /* ── Discount codes state ── */
  const [discountCodes, setDiscountCodes] = useState<DiscountCodeItem[]>([]);
  const [loadingDiscounts, setLoadingDiscounts] = useState(false);
  const [creatingDiscount, setCreatingDiscount] = useState(false);
  const [dCode, setDCode] = useState("");
  const [dType, setDType] = useState<"PERCENTAGE" | "FIXED_AMOUNT">("PERCENTAGE");
  const [dValue, setDValue] = useState("");
  const [dScope, setDScope] = useState("PLATFORM_WIDE");
  const [dTargetId, setDTargetId] = useState("");
  const [dExpiresAt, setDExpiresAt] = useState("");
  const [dMaxTotal, setDMaxTotal] = useState("");
  const [dMaxPerStudent, setDMaxPerStudent] = useState("1");
  const [dAllowedMethods, setDAllowedMethods] = useState<string[]>([]);

  /* ── Student credit state ── */
  const [searchQ,   setSearchQ]   = useState("");
  const [searching, setSearching] = useState(false);
  const [students,  setStudents]  = useState<StudentResult[]>([]);
  const [selected,  setSelected]  = useState<StudentResult | null>(null);
  const [creditAmt, setCreditAmt] = useState("");
  const [note,      setNote]      = useState("");
  const [crediting, setCrediting] = useState(false);

  /* ── Generate codes ── */
  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    const amt = parseFloat(amount);
    const cnt = parseInt(count);
    if (!amt || amt <= 0) return toastError("أدخل مبلغاً صحيحاً");
    if (!cnt || cnt < 1 || cnt > 100) return toastError("العدد يجب بين 1 و 100");
    if (!moneyActionPassword.trim()) return toastError("أدخل كلمة مرور إجراءات المشرف أولاً");

    setGenerating(true);
    const res = await fetch("/api/admin/money-codes", {
      method: "POST", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        amount: amt,
        count: cnt,
        prefix: prefix.trim() || "CODEUP",
        expiresAt: expiresAt || undefined,
        actionPassword: moneyActionPassword.trim()
      }),
    });
    const data = await res.json().catch(() => ({}));
    setGenerating(false);

    if (res.ok) {
      setGenerated(data.codes ?? []);
      toastSuccess(`تم إنشاء ${data.count} كود بنجاح`);
      setCodesLoaded(false); // reset list so it reloads
    } else {
      toastError(data.error || "تعذر إنشاء الأكواد");
    }
  };

  /* ── Load all money codes ── */
  const loadAllCodes = async () => {
    setLoadingCodes(true);
    const res = await fetch("/api/admin/money-codes", { credentials: "include" });
    const data = await res.json().catch(() => ({}));
    setLoadingCodes(false);
    if (res.ok) { setAllCodes(data.codes ?? []); setCodesLoaded(true); }
  };

  /* ── Load all discount codes ── */
  const loadDiscountCodes = async () => {
    setLoadingDiscounts(true);
    const res = await fetch("/api/admin/discount-codes", { credentials: "include" });
    const data = await res.json().catch(() => ({}));
    setLoadingDiscounts(false);
    if (res.ok && data.discountCodes) {
      setDiscountCodes(data.discountCodes);
    }
  };

  useEffect(() => {
    if (tab === "discounts") {
      loadDiscountCodes();
    }
  }, [tab]);

  /* ── Create Discount Code ── */
  const handleCreateDiscount = async (e: React.FormEvent) => {
    e.preventDefault();
    const val = parseFloat(dValue);
    if (!dCode.trim()) return toastError("أدخل كود الخصم");
    if (!val || val <= 0) return toastError("أدخل قيمة الخصم بشكل صحيح");
    if (dType === "PERCENTAGE" && val > 100) return toastError("النسبة المئوية لا يمكن أن تتجاوز 100%");
    if (dScope !== "PLATFORM_WIDE" && !dTargetId.trim()) return toastError("أدخل معرف العنصر المستهدف لنطاق الخصم");

    setCreatingDiscount(true);
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
        maxTotalUses: dMaxTotal ? parseInt(dMaxTotal) : null,
        maxUsesPerStudent: parseInt(dMaxPerStudent) || 1,
        allowedPaymentMethods: dAllowedMethods.length > 0 ? dAllowedMethods : undefined,
      }),
    });
    const data = await res.json().catch(() => ({}));
    setCreatingDiscount(false);

    if (res.ok) {
      toastSuccess(`تم إنشاء كود الخصم (${data.discountCode?.code}) بنجاح! 🎉`);
      setDCode("");
      setDValue("");
      setDTargetId("");
      setDExpiresAt("");
      setDMaxTotal("");
      setDAllowedMethods([]);
      loadDiscountCodes();
    } else {
      toastError(data.error || "تعذر إنشاء كود الخصم");
    }
  };

  /* ── Toggle Discount Active State ── */
  const handleToggleDiscount = async (id: string, currentActive: boolean) => {
    const res = await fetch("/api/admin/discount-codes", {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, isActive: !currentActive }),
    });
    if (res.ok) {
      setDiscountCodes(prev => prev.map(d => d.id === id ? { ...d, isActive: !currentActive } : d));
      toastSuccess(!currentActive ? "تم تفعيل كود الخصم" : "تم تعطيل كود الخصم");
    } else {
      toastError("تعذر تحديث حالة كود الخصم");
    }
  };

  /* ── Search students ── */
  const searchStudents = async () => {
    if (!searchQ.trim()) return;
    setSearching(true);
    setStudents([]);
    const params = new URLSearchParams({ q: searchQ.trim() });
    const res = await fetch(`/api/admin/students/search?${params}`, { credentials: "include" });
    const data = await res.json().catch(() => ({}));
    setSearching(false);
    setStudents(data.students ?? []);
  };

  /* ── Credit student ── */
  const handleCredit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selected) return;
    const amt = parseFloat(creditAmt);
    if (!amt || amt === 0) return toastError("أدخل المبلغ");

    setCrediting(true);
    const res = await fetch(`/api/admin/students/${selected.id}/balance`, {
      method: "POST", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount: amt, note: note.trim() || undefined }),
    });
    const data = await res.json().catch(() => ({}));
    setCrediting(false);

    if (res.ok) {
      toastSuccess(data.message || "تم تعديل الرصيد بنجاح");
      setSelected(prev => prev ? { ...prev, balance: data.newBalance } : null);
      setStudents(prev => prev.map(s => s.id === selected.id ? { ...s, balance: data.newBalance } : s));
      setCreditAmt(""); setNote("");
    } else {
      toastError(data.error || "تعذر تعديل الرصيد");
    }
  };

  /* ── Load all courses for access code generator & enrollment ── */
  const loadCourses = async () => {
    setLoadingCourses(true);
    try {
      const res = await fetch("/api/admin/superadmin/courses", { credentials: "include" });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.courses) {
        setCoursesList(data.courses);
        if (data.courses.length > 0) {
          setAccessCourseId((prev) => prev || data.courses[0].id);
          setEnrollCourseId((prev) => prev || data.courses[0].id);
        }
      }
    } finally {
      setLoadingCourses(false);
    }
  };

  useEffect(() => {
    if (tab === "course_access" && coursesList.length === 0) {
      loadCourses();
    }
  }, [tab]);

  /* ── Generate Course Access Codes (Access Only — No Money) ── */
  const handleGenerateAccessCodes = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accessCourseId) return toastError("يرجى اختيار الكورس أولاً");
    const cnt = parseInt(accessCount);
    if (!cnt || cnt < 1 || cnt > 100) return toastError("العدد يجب أن يكون بين 1 و 100");

    setGeneratingAccess(true);
    try {
      const res = await fetch("/api/admin/codes", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          courseId: accessCourseId,
          count: cnt,
          prefix: accessPrefix.trim() || "CRS",
          accessType,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.codes) {
        setGeneratedAccessCodes(data.codes);
        toastSuccess(`تم توليد ${data.codes.length} كود وصول بنجاح (وصول تعليمي فقط دون المساس برصيد المحفظة)`);
      } else {
        toastError(data.error || "تعذر توليد أكواد الوصول");
      }
    } catch {
      toastError("حدث خطأ أثناء إنشاء الأكواد");
    } finally {
      setGeneratingAccess(false);
    }
  };

  /* ── Direct Student Course Enrollment ── */
  const handleEnrollSearch = async (q: string) => {
    setEnrollStudentQ(q);
    if (!q.trim()) { setEnrollStudents([]); return; }
    setEnrollSearching(true);
    try {
      const res = await fetch(`/api/admin/students/search?q=${encodeURIComponent(q)}`, { credentials: "include" });
      const data = await res.json().catch(() => ({}));
      if (res.ok) setEnrollStudents(data.students ?? []);
    } finally {
      setEnrollSearching(false);
    }
  };

  const handleDirectEnroll = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!enrollSelectedStudent) return toastError("يرجى اختيار الطالب أولاً");
    if (!enrollCourseId) return toastError("يرجى اختيار الكورس");

    setEnrolling(true);
    try {
      const res = await fetch("/api/admin/superadmin/courses/enroll", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studentId: enrollSelectedStudent.id,
          courseId: enrollCourseId,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        toastSuccess(data.message || `تم تسجيل ${enrollSelectedStudent.name} في الكورس وتفعيل المحتوى بنجاح!`);
        setEnrollSelectedStudent(null);
        setEnrollStudentQ("");
        setEnrollStudents([]);
      } else {
        toastError(data.error || "تعذر تسجيل الطالب في الكورس");
      }
    } catch {
      toastError("حدث خطأ أثناء تنفيذ التسجيل");
    } finally {
      setEnrolling(false);
    }
  };

  const copyCode = async (code: string) => {
    await navigator.clipboard.writeText(code).catch(() => {});
    toastSuccess(`تم نسخ: ${code}`);
  };

  const copyAll = async () => {
    await navigator.clipboard.writeText(generated.join("\n")).catch(() => {});
    toastSuccess("تم نسخ جميع الأكواد");
  };

  return (
    <AccessGate id="wallet" title="إدارة الرصيد والخصومات" type="wallet">
      <div dir="rtl">
      {/* Tab bar */}
      <div className="flex flex-wrap gap-2 mb-6 p-1 rounded-[14px]" style={{ background: "var(--surface-2)", border: "1px solid var(--border)", width: "fit-content" }}>
        {[
          { id: "codes" as const, label: "🔑 توليد أكواد رصيد" },
          { id: "credit" as const, label: "💳 شحن رصيد طالب" },
          { id: "course_access" as const, label: "🎓 أكواد وتسجيل الكورسات" },
          { id: "discounts" as const, label: "🏷️ أكواد الخصم" },
        ].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className="cursor-pointer border-none rounded-[10px] transition-colors font-bold"
            style={{ padding: "10px 18px", fontSize: 14, fontFamily: "var(--font-body)",
              background: tab === t.id ? "var(--brand)" : "transparent",
              color: tab === t.id ? "#fff" : "var(--ink-2)" }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ═══ CODE GENERATOR ═══ */}
      {tab === "codes" && (
        <div className="space-y-6">
          {/* Generator form */}
          <div className="rounded-[18px] p-6 space-y-4" style={{ background: "var(--surface)", border: "1px solid var(--border)", boxShadow: "var(--shadow-sm)" }}>
            <h3 style={{ fontFamily: "var(--font-head)", fontWeight: 800, fontSize: 18, color: "var(--ink)", margin: 0 }}>إنشاء أكواد رصيد جديدة</h3>
            <form onSubmit={handleGenerate} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold mb-2" style={{ color: "var(--ink-2)" }}>المبلغ (جنيه) *</label>
                <input type="number" min="1" step="0.5" required value={amount} onChange={e => setAmount(e.target.value)}
                  placeholder="مثال: 50" dir="ltr" className={input} style={inputStyle} />
              </div>
              <div>
                <label className="block text-sm font-semibold mb-2" style={{ color: "var(--ink-2)" }}>عدد الأكواد (1-100) *</label>
                <input type="number" min="1" max="100" required value={count} onChange={e => setCount(e.target.value)}
                  placeholder="مثال: 10" dir="ltr" className={input} style={inputStyle} />
              </div>
              <div>
                <label className="block text-sm font-semibold mb-2" style={{ color: "var(--ink-2)" }}>البادئة (اختياري)</label>
                <input type="text" value={prefix} onChange={e => setPrefix(e.target.value.toUpperCase())}
                  placeholder="CODEUP" maxLength={10} dir="ltr" className={input} style={inputStyle} />
              </div>
              <div>
                <label className="block text-sm font-semibold mb-2" style={{ color: "var(--ink-2)" }}>تاريخ الانتهاء (اختياري)</label>
                <input type="datetime-local" value={expiresAt} onChange={e => setExpiresAt(e.target.value)}
                  dir="ltr" className={input} style={inputStyle} />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-sm font-semibold mb-2" style={{ color: "var(--ink-2)" }}>كلمة مرور إجراءات المشرف *</label>
                <input type="password" required value={moneyActionPassword} onChange={e => setMoneyActionPassword(e.target.value)}
                  placeholder="أدخل كلمة مرور إجراءات المشرف" dir="ltr" className={input} style={inputStyle} />
              </div>
              <div className="sm:col-span-2">
                <button type="submit" disabled={generating}
                  className="w-full cursor-pointer border-none rounded-[12px] text-white font-bold transition-opacity hover:opacity-90 disabled:opacity-50"
                  style={{ padding: "13px", background: "var(--brand)", fontSize: 15, fontFamily: "var(--font-head)", boxShadow: "0 6px 16px -6px var(--brand-shadow)" }}>
                  {generating ? "جارٍ الإنشاء..." : `إنشاء ${count || "?"} كود بمبلغ ${amount || "?"} جنيه`}
                </button>
              </div>
            </form>
          </div>

          {/* Newly generated codes */}
          {generated.length > 0 && (
            <div className="rounded-[18px] p-5" style={{ background: "var(--brand-soft)", border: "1px solid var(--brand)" }}>
              <div className="flex items-center justify-between mb-3">
                <button onClick={copyAll} className="cursor-pointer border-none rounded-[10px] font-bold text-white hover:opacity-80 transition-opacity"
                  style={{ padding: "8px 16px", background: "var(--brand)", fontSize: 13 }}>
                  نسخ الكل
                </button>
                <h4 style={{ fontFamily: "var(--font-head)", fontWeight: 800, fontSize: 16, color: "var(--brand)", margin: 0 }}>
                  ✓ تم إنشاء {generated.length} كود
                </h4>
              </div>
              <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))" }}>
                {generated.map(code => (
                  <button key={code} onClick={() => copyCode(code)}
                    className="flex items-center justify-between gap-2 cursor-pointer rounded-[10px] hover:opacity-80 transition-opacity border-none"
                    style={{ padding: "10px 14px", background: "var(--surface)", border: "1px solid var(--brand)", fontFamily: "monospace", fontSize: 14, fontWeight: 700, color: "var(--brand)", letterSpacing: 1.5 }}>
                    {code}
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* All codes history */}
          <div className="rounded-[18px] overflow-hidden" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
            <div className="flex items-center justify-between" style={{ padding: "14px 20px", borderBottom: "1px solid var(--border)" }}>
              <button onClick={loadAllCodes} disabled={loadingCodes}
                className="cursor-pointer border-none rounded-[10px] font-bold transition-opacity hover:opacity-80 disabled:opacity-50"
                style={{ padding: "8px 16px", background: "var(--surface-2)", border: "1px solid var(--border)", color: "var(--ink-2)", fontSize: 13 }}>
                {loadingCodes ? "جارٍ التحميل..." : codesLoaded ? "تحديث" : "تحميل جميع الأكواد"}
              </button>
              <h3 style={{ fontFamily: "var(--font-head)", fontWeight: 800, fontSize: 16, color: "var(--ink)", margin: 0 }}>سجل الأكواد</h3>
            </div>
            {codesLoaded && (
              <div style={{ overflowX: "auto" }}>
                <table className="w-full text-sm" style={{ borderCollapse: "collapse", minWidth: "640px" }}>
                  <thead>
                    <tr style={{ background: "var(--bg)", borderBottom: "2px solid var(--border)" }}>
                      {["الكود","المبلغ","الحالة","مستخدم من","الانتهاء","تاريخ الإنشاء"].map(h => (
                        <th key={h} className="text-right" style={{ padding: "10px 14px", fontSize: 11.5, fontWeight: 700, color: "var(--ink-3)", whiteSpace: "nowrap" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {allCodes.length === 0 ? (
                      <tr><td colSpan={6} className="text-center py-8" style={{ color: "var(--ink-3)" }}>لا توجد أكواد بعد</td></tr>
                    ) : allCodes.map(c => (
                      <tr key={c.id} style={{ borderBottom: "1px solid var(--border)" }}
                        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "var(--surface-2)"; }}
                        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}>
                        <td style={{ padding: "11px 14px" }}>
                          <button onClick={() => copyCode(c.code)} className="cursor-pointer border-none bg-transparent font-bold font-mono hover:opacity-70 transition-opacity"
                            style={{ fontSize: 13, color: c.isUsed ? "var(--ink-3)" : "var(--brand)", letterSpacing: 1, textDecoration: c.isUsed ? "line-through" : "none" }}>
                            {c.code}
                          </button>
                        </td>
                        <td style={{ padding: "11px 14px", fontFamily: "var(--font-head)", fontWeight: 900, fontSize: 15, color: "var(--gold-2)" }}>{c.amount} جنيه</td>
                        <td style={{ padding: "11px 14px" }}>
                          <span style={{ padding: "3px 10px", borderRadius: 20, fontSize: 12, fontWeight: 700,
                            background: c.isUsed ? "var(--surface-2)" : "var(--brand-soft)",
                            color: c.isUsed ? "var(--ink-3)" : "var(--brand)" }}>
                            {c.isUsed ? "مستخدم" : "متاح"}
                          </span>
                        </td>
                        <td style={{ padding: "11px 14px", fontSize: 12, color: "var(--ink-3)" }}>
                          {c.usedAt ? new Date(c.usedAt).toLocaleDateString("ar-EG", { month: "short", day: "numeric" }) : "—"}
                        </td>
                        <td style={{ padding: "11px 14px", fontSize: 12, color: "var(--ink-3)" }}>
                          {c.expiresAt ? new Date(c.expiresAt).toLocaleDateString("ar-EG", { month: "short", day: "numeric" }) : "لا يوجد"}
                        </td>
                        <td style={{ padding: "11px 14px", fontSize: 12, color: "var(--ink-3)" }}>
                          {new Date(c.createdAt).toLocaleDateString("ar-EG", { year: "numeric", month: "short", day: "numeric" })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ═══ DISCOUNT CODES ═══ */}
      {tab === "discounts" && (
        <div className="space-y-6">
          {/* Create Discount Code Form */}
          <div className="rounded-[18px] p-6 space-y-4" style={{ background: "var(--surface)", border: "1px solid var(--border)", boxShadow: "var(--shadow-sm)" }}>
            <h3 style={{ fontFamily: "var(--font-head)", fontWeight: 800, fontSize: 18, color: "var(--ink)", margin: 0 }}>إنشاء كود خصم جديد (Discount Code)</h3>
            <p className="text-xs" style={{ color: "var(--ink-3)", marginTop: -4 }}>
              أكواد الخصم تقلل سعر الشراء فقط ولا تدخل في رصيد محفظة الطالب ولا تمنح قيمة نقدية مباشرة.
            </p>
            <form onSubmit={handleCreateDiscount} className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
              <div>
                <label className="block text-sm font-semibold mb-2" style={{ color: "var(--ink-2)" }}>كود الخصم *</label>
                <input type="text" required value={dCode} onChange={e => setDCode(e.target.value.toUpperCase())}
                  placeholder="مثال: SUMMER2026" dir="ltr" className={input} style={inputStyle} />
              </div>
              <div>
                <label className="block text-sm font-semibold mb-2" style={{ color: "var(--ink-2)" }}>نوع الخصم *</label>
                <select value={dType} onChange={e => setDType(e.target.value as any)} className={input} style={inputStyle}>
                  <option value="PERCENTAGE">نسبة مئوية (%)</option>
                  <option value="FIXED_AMOUNT">مبلغ ثابت (جنيه مصري)</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold mb-2" style={{ color: "var(--ink-2)" }}>قيمة الخصم *</label>
                <input type="number" min="0.1" step="0.5" required value={dValue} onChange={e => setDValue(e.target.value)}
                  placeholder={dType === "PERCENTAGE" ? "مثال: 20 (يعني 20%)" : "مثال: 100 (يعني 100 جنيه)"}
                  dir="ltr" className={input} style={inputStyle} />
              </div>
              <div>
                <label className="block text-sm font-semibold mb-2" style={{ color: "var(--ink-2)" }}>نطاق الخصم (Scope) *</label>
                <select value={dScope} onChange={e => setDScope(e.target.value)} className={input} style={inputStyle}>
                  <option value="PLATFORM_WIDE">شامل المنصة بالكامل (All)</option>
                  <option value="TEACHER">خاص بمعلم محدد (Teacher)</option>
                  <option value="COURSE">خاص بكورس محدد (Course)</option>
                  <option value="FOLDER">خاص بمحاضرة محددة (Folder)</option>
                  <option value="VIDEO">خاص بدرس محدد (Video)</option>
                  <option value="PLAN">خاص بخطة دراسية (Plan)</option>
                </select>
              </div>

              {dScope !== "PLATFORM_WIDE" && (
                <div style={{ gridColumn: "1 / -1" }}>
                  <label className="block text-sm font-semibold mb-2" style={{ color: "var(--ink-2)" }}>
                    معرف العنصر المستهدف (Target ID) *
                  </label>
                  <input type="text" required value={dTargetId} onChange={e => setDTargetId(e.target.value.trim())}
                    placeholder="أدخل ID المعلم أو الكورس أو المحاضرة..." dir="ltr" className={input} style={inputStyle} />
                </div>
              )}

              <div>
                <label className="block text-sm font-semibold mb-2" style={{ color: "var(--ink-2)" }}>تاريخ الانتهاء (اختياري)</label>
                <input type="datetime-local" value={dExpiresAt} onChange={e => setDExpiresAt(e.target.value)}
                  dir="ltr" className={input} style={inputStyle} />
              </div>
              <div>
                <label className="block text-sm font-semibold mb-2" style={{ color: "var(--ink-2)" }}>الحد الأقصى الإجمالي للاستخدام</label>
                <input type="number" min="1" value={dMaxTotal} onChange={e => setDMaxTotal(e.target.value)}
                  placeholder="فارغ = غير محدود" dir="ltr" className={input} style={inputStyle} />
              </div>
              <div>
                <label className="block text-sm font-semibold mb-2" style={{ color: "var(--ink-2)" }}>مرات الاستخدام لكل طالب</label>
                <input type="number" min="1" required value={dMaxPerStudent} onChange={e => setDMaxPerStudent(e.target.value)}
                  placeholder="1" dir="ltr" className={input} style={inputStyle} />
              </div>

              {/* Allowed payment methods control */}
              <div style={{ gridColumn: "1 / -1" }}>
                <label className="block text-sm font-semibold mb-2" style={{ color: "var(--ink-2)" }}>
                  طرق الدفع المسموح بها (فارغ = جميع الطرق متاحة):
                </label>
                <div className="flex flex-wrap gap-4 p-3 rounded-xl" style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}>
                  {PAYMENT_METHODS_OPTIONS.map(m => {
                    const checked = dAllowedMethods.includes(m.id);
                    return (
                      <label key={m.id} className="flex items-center gap-2 cursor-pointer text-xs sm:text-sm font-semibold">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={e => {
                            if (e.target.checked) {
                              setDAllowedMethods(prev => [...prev, m.id]);
                            } else {
                              setDAllowedMethods(prev => prev.filter(x => x !== m.id));
                            }
                          }}
                        />
                        <span>{m.label}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div style={{ gridColumn: "1 / -1" }}>
                <button type="submit" disabled={creatingDiscount}
                  className="w-full cursor-pointer border-none rounded-[12px] text-white font-bold transition-opacity hover:opacity-90 disabled:opacity-50"
                  style={{ padding: "13px", background: "var(--brand)", fontSize: 15, fontFamily: "var(--font-head)", boxShadow: "0 6px 16px -6px var(--brand-shadow)" }}>
                  {creatingDiscount ? "جارٍ الإنشاء..." : `حفظ ونشر كود الخصم`}
                </button>
              </div>
            </form>
          </div>

          {/* Discount Codes Table */}
          <div className="rounded-[18px] overflow-hidden" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
            <div className="flex items-center justify-between" style={{ padding: "14px 20px", borderBottom: "1px solid var(--border)" }}>
              <button onClick={loadDiscountCodes} disabled={loadingDiscounts}
                className="cursor-pointer border-none rounded-[10px] font-bold transition-opacity hover:opacity-80 disabled:opacity-50"
                style={{ padding: "8px 16px", background: "var(--surface-2)", border: "1px solid var(--border)", color: "var(--ink-2)", fontSize: 13 }}>
                {loadingDiscounts ? "جارٍ التحميل..." : "تحديث القائمة"}
              </button>
              <h3 style={{ fontFamily: "var(--font-head)", fontWeight: 800, fontSize: 16, color: "var(--ink)", margin: 0 }}>
                أكواد الخصم الحالية ({discountCodes.length})
              </h3>
            </div>

            <div style={{ overflowX: "auto" }}>
              <table className="w-full text-sm" style={{ borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: "var(--bg)", borderBottom: "2px solid var(--border)" }}>
                    {["الكود", "النوع والقيمة", "النطاق (Scope)", "مرات الاستخدام", "طرق الدفع", "الحالة", "الانتهاء", "إجراءات"].map(h => (
                      <th key={h} className="text-right" style={{ padding: "10px 14px", fontSize: 11.5, fontWeight: 700, color: "var(--ink-3)", whiteSpace: "nowrap" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {discountCodes.length === 0 ? (
                    <tr><td colSpan={8} className="text-center py-8" style={{ color: "var(--ink-3)" }}>لا توجد أكواد خصم مسجلة</td></tr>
                  ) : discountCodes.map(d => (
                    <tr key={d.id} style={{ borderBottom: "1px solid var(--border)" }}
                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "var(--surface-2)"; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}>
                      <td style={{ padding: "11px 14px" }}>
                        <button onClick={() => copyCode(d.code)} className="cursor-pointer border-none bg-transparent font-bold font-mono hover:opacity-70 transition-opacity"
                          style={{ fontSize: 14, color: d.isActive ? "var(--brand)" : "var(--ink-3)", letterSpacing: 1 }}>
                          {d.code}
                        </button>
                      </td>
                      <td style={{ padding: "11px 14px", fontWeight: 800, color: "var(--gold-2)" }}>
                        {d.discountType === "PERCENTAGE" ? `${d.discountValue}%` : `${d.discountValue} ج`}
                      </td>
                      <td style={{ padding: "11px 14px", fontSize: 12 }}>
                        <span className="px-2 py-0.5 rounded-md" style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}>
                          {d.scope} {d.targetId ? `(${d.targetId.slice(0, 8)}...)` : ""}
                        </span>
                      </td>
                      <td style={{ padding: "11px 14px", fontWeight: 700 }}>
                        {d._count?.usages ?? 0} {d.maxTotalUses ? `/ ${d.maxTotalUses}` : "(غير محدود)"}
                      </td>
                      <td style={{ padding: "11px 14px", fontSize: 11, color: "var(--ink-3)" }}>
                        {d.allowedPaymentMethods ? `${JSON.parse(d.allowedPaymentMethods).length} طرق محددة` : "الكل"}
                      </td>
                      <td style={{ padding: "11px 14px" }}>
                        <span style={{
                          padding: "3px 10px", borderRadius: 20, fontSize: 12, fontWeight: 700,
                          background: d.isActive ? "var(--brand-soft)" : "var(--surface-2)",
                          color: d.isActive ? "var(--brand)" : "var(--ink-3)"
                        }}>
                          {d.isActive ? "مفعّل" : "معطّل"}
                        </span>
                      </td>
                      <td style={{ padding: "11px 14px", fontSize: 12, color: "var(--ink-3)" }}>
                        {d.expiresAt ? new Date(d.expiresAt).toLocaleDateString("ar-EG", { month: "short", day: "numeric" }) : "دائم"}
                      </td>
                      <td style={{ padding: "11px 14px" }}>
                        <button
                          onClick={() => handleToggleDiscount(d.id, d.isActive)}
                          className="px-3 py-1 rounded-lg text-xs font-bold cursor-pointer transition-opacity border-none"
                          style={{
                            background: d.isActive ? "rgba(239, 68, 68, 0.15)" : "var(--brand-soft)",
                            color: d.isActive ? "#ef4444" : "var(--brand)",
                          }}
                        >
                          {d.isActive ? "تعطيل ⏸" : "تفعيل ▶"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ═══ CREDIT STUDENT ═══ */}
      {tab === "credit" && (
        <div className="space-y-5">
          {/* Search */}
          <div className="rounded-[18px] p-5" style={{ background: "var(--surface)", border: "1px solid var(--border)", boxShadow: "var(--shadow-sm)" }}>
            <h3 style={{ fontFamily: "var(--font-head)", fontWeight: 800, fontSize: 17, color: "var(--ink)", margin: "0 0 14px" }}>🔍 بحث عن طالب</h3>
            <div className="flex gap-3">
              <button onClick={searchStudents} disabled={searching || !searchQ.trim()}
                className="shrink-0 cursor-pointer border-none rounded-[11px] text-white font-bold disabled:opacity-40 hover:opacity-90 transition-opacity"
                style={{ padding: "11px 20px", background: "var(--brand)", fontSize: 14 }}>
                {searching ? "..." : "بحث"}
              </button>
              <input
                type="text"
                value={searchQ}
                onChange={e => setSearchQ(e.target.value)}
                onKeyDown={e => e.key === "Enter" && searchStudents()}
                placeholder="ابحث باسم الطالب أو رقم هاتفه"
                className={input}
                style={inputStyle}
              />
            </div>

            {/* Results */}
            {students.length > 0 && (
              <div className="mt-4 space-y-2">
                {students.map(s => (
                  <button key={s.id} onClick={() => setSelected(s)}
                    className="w-full flex items-center gap-4 cursor-pointer border-none rounded-[12px] transition-colors text-right"
                    style={{
                      padding: "13px 16px",
                      background: selected?.id === s.id ? "var(--brand-soft)" : "var(--surface-2)",
                      border: `1px solid ${selected?.id === s.id ? "var(--brand)" : "var(--border)"}`,
                    }}>
                    <span style={{ fontFamily: "var(--font-head)", fontWeight: 900, fontSize: 16, color: "var(--gold-2)", minWidth: 80 }}>
                      {s.balance} جنيه
                    </span>
                    <div className="flex-1">
                      <div style={{ fontWeight: 700, fontSize: 15, color: "var(--ink)" }}>{s.name}</div>
                      {s.phone && <div style={{ fontSize: 12.5, color: "var(--ink-3)", direction: "ltr", textAlign: "right" }}>{s.phone}</div>}
                      {s.educationalStage && <div style={{ fontSize: 12, color: "var(--ink-3)" }}>{s.educationalStage}</div>}
                    </div>
                    {selected?.id === s.id && (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--brand)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5"/></svg>
                    )}
                  </button>
                ))}
              </div>
            )}
            {searching === false && searchQ && students.length === 0 && (
              <p className="mt-3 text-center text-sm" style={{ color: "var(--ink-3)" }}>لا توجد نتائج</p>
            )}
          </div>

          {/* Credit form */}
          {selected && (
            <div className="rounded-[18px] p-5" style={{ background: "var(--surface)", border: "1px solid var(--brand)", boxShadow: "0 0 0 3px var(--brand-shadow)" }}>
              <div className="flex items-center justify-between mb-4">
                <span style={{ fontFamily: "var(--font-head)", fontWeight: 900, fontSize: 20, color: "var(--gold-2)" }}>
                  رصيده الحالي: {selected.balance} جنيه
                </span>
                <h3 style={{ fontFamily: "var(--font-head)", fontWeight: 800, fontSize: 17, color: "var(--ink)", margin: 0 }}>
                  شحن رصيد: {selected.name}
                </h3>
              </div>

              <form onSubmit={handleCredit} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold mb-2" style={{ color: "var(--ink-2)" }}>المبلغ (جنيه) — سالب للخصم</label>
                    <input type="number" step="0.5" required value={creditAmt} onChange={e => setCreditAmt(e.target.value)}
                      placeholder="مثال: 100 أو -50" dir="ltr" className={input} style={inputStyle} />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold mb-2" style={{ color: "var(--ink-2)" }}>ملاحظة (اختياري)</label>
                    <input type="text" value={note} onChange={e => setNote(e.target.value)}
                      placeholder="سبب الشحن أو الخصم" className={input} style={inputStyle} />
                  </div>
                </div>

                {/* Quick amount buttons */}
                <div>
                  <p className="text-xs font-semibold mb-2" style={{ color: "var(--ink-3)" }}>مبالغ سريعة:</p>
                  <div className="flex flex-wrap gap-2">
                    {[25, 50, 100, 150, 200, 250, 300, 500].map(amt => (
                      <button key={amt} type="button" onClick={() => setCreditAmt(String(amt))}
                        className="cursor-pointer border-none rounded-[8px] font-bold transition-colors"
                        style={{
                          padding: "6px 14px", fontSize: 13,
                          background: creditAmt === String(amt) ? "var(--brand)" : "var(--surface-2)",
                          border: `1px solid ${creditAmt === String(amt) ? "var(--brand)" : "var(--border)"}`,
                          color: creditAmt === String(amt) ? "#fff" : "var(--ink-2)",
                        }}>
                        {amt} جنيه
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex gap-3">
                  <button type="button" onClick={() => setSelected(null)}
                    className="cursor-pointer border-none rounded-[12px] font-bold transition-opacity hover:opacity-80"
                    style={{ padding: "12px 20px", background: "var(--surface-2)", border: "1px solid var(--border)", color: "var(--ink-2)", fontSize: 14 }}>
                    إلغاء
                  </button>
                  <button type="submit" disabled={crediting || !creditAmt}
                    className="flex-1 cursor-pointer border-none rounded-[12px] text-white font-bold transition-opacity hover:opacity-90 disabled:opacity-40"
                    style={{
                      padding: "12px", fontSize: 15, fontFamily: "var(--font-head)",
                      background: parseFloat(creditAmt) < 0 ? "var(--danger)" : "var(--brand)",
                      boxShadow: "0 6px 16px -6px var(--brand-shadow)",
                    }}>
                    {crediting ? "جارٍ التنفيذ..." : parseFloat(creditAmt) < 0
                      ? `خصم ${Math.abs(parseFloat(creditAmt) || 0)} جنيه من ${selected.name}`
                      : `إضافة ${creditAmt || "؟"} جنيه لـ ${selected.name}`}
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>
      )}

      {/* ═══ COURSE ACCESS & DIRECT ENROLLMENT ═══ */}
      {tab === "course_access" && (
        <div className="space-y-6">
          {/* Card 1: Generate Access Codes */}
          <div className="rounded-[18px] p-6 space-y-4" style={{ background: "var(--surface)", border: "1px solid var(--border)", boxShadow: "var(--shadow-sm)" }}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 style={{ fontFamily: "var(--font-head)", fontWeight: 800, fontSize: 18, color: "var(--ink)", margin: 0 }}>
                  🎟️ إنشاء وتوليد أكواد وصول لكورس (Access Codes)
                </h3>
                <p className="text-xs text-[var(--ink-muted)] mt-1">
                  الأكواد المولدة هنا تمنح الطالب صلاحية فتح الكورس أو المحاضرة في مكتبته فوراً، ولا تضاف إلى رصيد المحفظة المالي إطلاقاً.
                </p>
              </div>
              <span className="px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                🔒 وصول تعليمي فقط (بدون رصيد)
              </span>
            </div>

            <form onSubmit={handleGenerateAccessCodes} className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="block text-sm font-semibold mb-2" style={{ color: "var(--ink-2)" }}>اختر الكورس المستهدف *</label>
                {loadingCourses ? (
                  <div className="p-3 text-xs text-[var(--ink-muted)] bg-[var(--surface-2)] rounded-xl border border-[var(--border)]">جاري تحميل قائمة الكورسات...</div>
                ) : coursesList.length === 0 ? (
                  <div className="p-3 text-xs text-rose-400 bg-rose-500/10 rounded-xl border border-rose-500/20">لا توجد كورسات مسجلة في المنصة حالياً</div>
                ) : (
                  <select
                    value={accessCourseId}
                    onChange={(e) => setAccessCourseId(e.target.value)}
                    required
                    className={input}
                    style={inputStyle}
                  >
                    {coursesList.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.title} — ({c.subject || "عام"}) {c.teacher?.name ? `| أستاذ: ${c.teacher.name}` : ""}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div>
                <label className="block text-sm font-semibold mb-2" style={{ color: "var(--ink-2)" }}>عدد الأكواد (1-100) *</label>
                <input
                  type="number"
                  min="1"
                  max="100"
                  required
                  value={accessCount}
                  onChange={(e) => setAccessCount(e.target.value)}
                  placeholder="مثال: 10"
                  dir="ltr"
                  className={input}
                  style={inputStyle}
                />
              </div>

              <div>
                <label className="block text-sm font-semibold mb-2" style={{ color: "var(--ink-2)" }}>بادئة الكود (Prefix)</label>
                <input
                  type="text"
                  value={accessPrefix}
                  onChange={(e) => setAccessPrefix(e.target.value.toUpperCase())}
                  placeholder="مثال: CRS أو MATH"
                  maxLength={10}
                  dir="ltr"
                  className={input}
                  style={inputStyle}
                />
              </div>

              <div className="sm:col-span-2">
                <button
                  type="submit"
                  disabled={generatingAccess || !accessCourseId || coursesList.length === 0}
                  className="w-full cursor-pointer border-none rounded-[12px] text-white font-bold transition-opacity hover:opacity-90 disabled:opacity-50"
                  style={{
                    padding: "13px",
                    background: "var(--brand)",
                    fontSize: 15,
                    fontFamily: "var(--font-head)",
                    boxShadow: "0 6px 16px -6px var(--brand-shadow)",
                  }}
                >
                  {generatingAccess ? "جارٍ توليد أكواد الوصول..." : `توليد ${accessCount || "1"} كود وصول للكورس المحدد 🚀`}
                </button>
              </div>
            </form>

            {/* Generated access codes display */}
            {generatedAccessCodes.length > 0 && (
              <div className="mt-5 p-4 rounded-2xl bg-[var(--surface-2)] border border-emerald-500/30 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-emerald-400">
                    ✅ تم توليد {generatedAccessCodes.length} كود وصول بنجاح
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      const allText = generatedAccessCodes.map((c) => c.code).join("\n");
                      navigator.clipboard.writeText(allText).catch(() => {});
                      toastSuccess("تم نسخ جميع أكواد الوصول");
                    }}
                    className="px-3 py-1 rounded-lg bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 text-xs font-bold transition-colors cursor-pointer border border-emerald-500/30"
                  >
                    📋 نسخ جميع الأكواد
                  </button>
                </div>
                <div className="grid gap-2 sm:grid-cols-2 max-h-60 overflow-y-auto p-1">
                  {generatedAccessCodes.map((c) => (
                    <div
                      key={c.id || c.code}
                      className="flex items-center justify-between p-2.5 rounded-xl bg-[var(--surface)] border border-[var(--border)] font-mono text-xs text-[var(--ink)]"
                    >
                      <span className="font-bold text-sky-400">{c.code}</span>
                      <button
                        type="button"
                        onClick={() => copyCode(c.code)}
                        className="px-2 py-1 rounded-md bg-[var(--surface-2)] hover:bg-[var(--surface-3,#2d3748)] text-[10px] text-[var(--ink-muted)] hover:text-white transition-colors"
                      >
                        نسخ
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Card 2: Direct Student Enrollment */}
          <div className="rounded-[18px] p-6 space-y-4" style={{ background: "var(--surface)", border: "1px solid var(--border)", boxShadow: "var(--shadow-sm)" }}>
            <div>
              <h3 style={{ fontFamily: "var(--font-head)", fontWeight: 800, fontSize: 18, color: "var(--ink)", margin: 0 }}>
                ⚡ تسجيل وإضافة طالب مباشر في كورس (Direct Enrollment)
              </h3>
              <p className="text-xs text-[var(--ink-muted)] mt-1">
                يمكنك البحث عن أي طالب وتسجيله في الكورس فوراً لفتح المحتوى في مكتبته دون الحاجة لإدخال كود وصول.
              </p>
            </div>

            {/* Student Search */}
            <div>
              <label className="block text-sm font-semibold mb-2" style={{ color: "var(--ink-2)" }}>ابحث عن الطالب (بالاسم أو الهاتف أو البريد) *</label>
              <div className="relative">
                <input
                  type="text"
                  value={enrollStudentQ}
                  onChange={(e) => handleEnrollSearch(e.target.value)}
                  placeholder="اكتب اسم الطالب أو رقم هاتفه..."
                  className={input}
                  style={inputStyle}
                />
                {enrollSearching && (
                  <span className="absolute left-3 top-2.5 text-xs text-[var(--ink-muted)] font-bold animate-pulse">
                    جارٍ البحث...
                  </span>
                )}
              </div>

              {/* Search Results Dropdown */}
              {enrollStudents.length > 0 && !enrollSelectedStudent && (
                <div className="mt-2 rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] max-h-48 overflow-y-auto divide-y divide-[var(--border)] shadow-lg">
                  {enrollStudents.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => {
                        setEnrollSelectedStudent(s);
                        setEnrollStudents([]);
                      }}
                      className="w-full p-3 flex items-center justify-between text-right hover:bg-[var(--surface)] transition-colors cursor-pointer border-none"
                    >
                      <div>
                        <div className="font-bold text-sm text-[var(--ink)]">{s.name}</div>
                        <div className="text-xs text-[var(--ink-muted)] font-mono dir-ltr text-right">{s.phone || "بدون هاتف"}</div>
                      </div>
                      <span className="px-2 py-1 rounded-lg text-xs font-bold bg-sky-500/10 text-sky-400 border border-sky-500/20">
                        اختيار الطالب 👈
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Selected Student & Enrollment Action */}
            {enrollSelectedStudent && (
              <form onSubmit={handleDirectEnroll} className="p-4 rounded-2xl bg-sky-500/10 border border-sky-500/30 space-y-4 animate-fadeIn">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xl">🎓</span>
                    <div>
                      <div className="font-bold text-sm text-sky-950 dark:text-sky-200">
                        الطالب المختار: {enrollSelectedStudent.name}
                      </div>
                      <div className="text-xs text-sky-700 dark:text-sky-400 font-mono dir-ltr text-right">
                        {enrollSelectedStudent.phone || "بدون رقم هاتف"}
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setEnrollSelectedStudent(null)}
                    className="px-2.5 py-1 rounded-lg bg-rose-500/20 text-rose-400 hover:bg-rose-500/30 text-xs font-bold transition-colors cursor-pointer border border-rose-500/30"
                  >
                    تغيير الطالب
                  </button>
                </div>

                <div>
                  <label className="block text-xs font-bold mb-1 text-[var(--ink-2)]">اختر الكورس لتسجيل الطالب فيه:</label>
                  <select
                    value={enrollCourseId}
                    onChange={(e) => setEnrollCourseId(e.target.value)}
                    required
                    className={input}
                    style={inputStyle}
                  >
                    {coursesList.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.title} — ({c.subject || "عام"}) {c.teacher?.name ? `| أستاذ: ${c.teacher.name}` : ""}
                      </option>
                    ))}
                  </select>
                </div>

                <button
                  type="submit"
                  disabled={enrolling || !enrollCourseId}
                  className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm shadow-md transition-all cursor-pointer disabled:opacity-50"
                >
                  {enrolling ? "جارٍ تسجيل الطالب..." : `تأكيد تسجيل ${enrollSelectedStudent.name} في الكورس فوراً 🚀`}
                </button>
              </form>
            )}
          </div>
        </div>
      )}
      </div>
    </AccessGate>
  );
}
