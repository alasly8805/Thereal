"use client";

import React, { useState, useEffect } from "react";

export interface ExpenseItem {
  id: string;
  title: string;
  amount: number;
  category: string;
  note?: string;
  addedBy: string;
  createdAt: string;
}

export interface TeacherFinancial {
  teacherId: string;
  teacherName: string;
  teacherEmail: string;
  grossRevenue: number;
  platformPercentage: number;
  platformShare: number;
  teacherShare: number;
}

interface MoneyControlData {
  defaultPercentage: number;
  teacherPercentages: Record<string, number>;
  expenses: ExpenseItem[];
  teachers: TeacherFinancial[];
  summary: {
    totalGrossRevenue: number;
    totalPlatformShare: number;
    totalTeachersShare: number;
    totalExpenses: number;
    netPlatformProfit: number;
  };
}

interface MoneyControlModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUpdated?: () => void;
}

export function MoneyControlModal({ isOpen, onClose, onUpdated }: MoneyControlModalProps) {
  const [activeTab, setActiveTab] = useState<"shares" | "expenses">("shares");
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<MoneyControlData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savingTeacherId, setSavingTeacherId] = useState<string | null>(null);
  const [editingPercentages, setEditingPercentages] = useState<Record<string, number>>({});
  const [defaultPctInput, setDefaultPctInput] = useState<number>(25);
  const [savingDefault, setSavingDefault] = useState(false);

  // New Expense form
  const [expenseTitle, setExpenseTitle] = useState("");
  const [expenseAmount, setExpenseAmount] = useState("");
  const [expenseCategory, setExpenseCategory] = useState("تقنية وسيرفرات");
  const [expenseNote, setExpenseNote] = useState("");
  const [addingExpense, setAddingExpense] = useState(false);
  const [deletingExpenseId, setDeletingExpenseId] = useState<string | null>(null);

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch("/api/admin/superadmin/money-control", { cache: "no-store" });
      if (!res.ok) throw new Error("تعذر جلب بيانات الأرباح");
      const json: MoneyControlData = await res.json();
      setData(json);
      setDefaultPctInput(json.defaultPercentage ?? 25);
      const initialPcts: Record<string, number> = {};
      json.teachers.forEach((t) => {
        initialPcts[t.teacherId] = t.platformPercentage;
      });
      setEditingPercentages(initialPcts);
    } catch (err: any) {
      setError(err.message || "حدث خطأ غير متوقع");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchData();
    }
  }, [isOpen]);

  const handleSaveTeacherPercentage = async (teacherId: string) => {
    const pct = editingPercentages[teacherId];
    if (pct === undefined || isNaN(pct) || pct < 0 || pct > 100) {
      alert("يرجى إدخال نسبة صحيحة بين 0 و 100%");
      return;
    }

    try {
      setSavingTeacherId(teacherId);
      const res = await fetch("/api/admin/superadmin/money-control/percentages", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teacherId, percentage: pct }),
      });
      if (!res.ok) throw new Error("تعذر حفظ النسبة");
      await fetchData();
      if (onUpdated) onUpdated();
    } catch (err: any) {
      alert(err.message || "فشل حفظ النسبة");
    } finally {
      setSavingTeacherId(null);
    }
  };

  const handleSaveDefaultPercentage = async () => {
    if (isNaN(defaultPctInput) || defaultPctInput < 0 || defaultPctInput > 100) {
      alert("يرجى إدخال نسبة صحيحة بين 0 و 100%");
      return;
    }

    try {
      setSavingDefault(true);
      const res = await fetch("/api/admin/superadmin/money-control/percentages", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ defaultPercentage: defaultPctInput }),
      });
      if (!res.ok) throw new Error("تعذر حفظ النسبة الافتراضية");
      await fetchData();
      if (onUpdated) onUpdated();
    } catch (err: any) {
      alert(err.message || "فشل حفظ النسبة الافتراضية");
    } finally {
      setSavingDefault(false);
    }
  };

  const handleAddExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    const amountNum = parseFloat(expenseAmount);
    if (!expenseTitle.trim()) {
      alert("يرجى كتابة عنوان المصروف");
      return;
    }
    if (isNaN(amountNum) || amountNum <= 0) {
      alert("يرجى إدخال مبلغ صحيح أكبر من الصفر");
      return;
    }

    try {
      setAddingExpense(true);
      const res = await fetch("/api/admin/superadmin/money-control/expenses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: expenseTitle.trim(),
          amount: amountNum,
          category: expenseCategory,
          note: expenseNote.trim() || undefined,
        }),
      });
      if (!res.ok) throw new Error("تعذر إضافة المصروف");
      setExpenseTitle("");
      setExpenseAmount("");
      setExpenseNote("");
      await fetchData();
      if (onUpdated) onUpdated();
    } catch (err: any) {
      alert(err.message || "فشل إضافة المصروف");
    } finally {
      setAddingExpense(false);
    }
  };

  const handleDeleteExpense = async (expenseId: string) => {
    if (!confirm("هل أنت متأكد من حذف هذا المصروف؟")) return;

    try {
      setDeletingExpenseId(expenseId);
      const res = await fetch(`/api/admin/superadmin/money-control/expenses/${expenseId}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("تعذر حذف المصروف");
      await fetchData();
      if (onUpdated) onUpdated();
    } catch (err: any) {
      alert(err.message || "فشل حذف المصروف");
    } finally {
      setDeletingExpenseId(null);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/75 backdrop-blur-sm animate-fadeIn" dir="rtl">
      <div
        className="w-full max-w-5xl max-h-[92vh] rounded-3xl overflow-hidden flex flex-col shadow-2xl border border-slate-700/80 bg-slate-900 text-slate-100"
        style={{ background: "linear-gradient(180deg, #101927 0%, #0b111a 100%)" }}
      >
        {/* Header */}
        <div className="p-4 sm:p-6 border-b border-slate-800 flex items-center justify-between bg-slate-900/80">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-xl sm:text-2xl shadow-inner shrink-0">
              💰
            </div>
            <div>
              <h2 className="text-base sm:text-xl font-black text-white flex items-center gap-2">
                التحكم في الأموال ونسب الأرباح والمصروفات
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                تحديد نسبة المنصة (الافتراضية 25% مع إمكانية التخصيص لكل معلم) وتسجيل مصروفات المنصة وحساب صافي الأرباح
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition-colors cursor-pointer border-none text-base sm:text-lg shrink-0"
          >
            ✕
          </button>
        </div>

        {/* Summary Financial Cards */}
        <div className="p-4 sm:p-6 pb-2 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="p-4 rounded-2xl bg-slate-800/60 border border-slate-700/50">
            <div className="text-xs font-semibold text-slate-400">إجمالي دخل المعلمين</div>
            <div className="text-2xl font-black text-amber-400 mt-1 font-mono">
              {(data?.summary.totalGrossRevenue ?? 0).toLocaleString("ar-EG")} <span className="text-xs font-normal">ج.م</span>
            </div>
            <div className="text-[11px] text-slate-500 mt-0.5">شامل الكورسات والباقات المدفوعة</div>
          </div>

          <div className="p-4 rounded-2xl bg-slate-800/60 border border-slate-700/50">
            <div className="text-xs font-semibold text-slate-400">حصة المنصة (الإجمالية)</div>
            <div className="text-2xl font-black text-sky-400 mt-1 font-mono">
              {(data?.summary.totalPlatformShare ?? 0).toLocaleString("ar-EG")} <span className="text-xs font-normal">ج.م</span>
            </div>
            <div className="text-[11px] text-slate-500 mt-0.5">بناءً على نسبة كل معلم</div>
          </div>

          <div className="p-4 rounded-2xl bg-slate-800/60 border border-slate-700/50">
            <div className="text-xs font-semibold text-slate-400">إجمالي المصروفات</div>
            <div className="text-2xl font-black text-rose-400 mt-1 font-mono">
              {(data?.summary.totalExpenses ?? 0).toLocaleString("ar-EG")} <span className="text-xs font-normal">ج.م</span>
            </div>
            <div className="text-[11px] text-slate-500 mt-0.5">{data?.expenses.length ?? 0} بند مصروف مسجل</div>
          </div>

          <div className="p-4 rounded-2xl bg-emerald-950/40 border border-emerald-500/30">
            <div className="text-xs font-semibold text-emerald-300">صافي ربح المنصة (بعد المصروفات)</div>
            <div className="text-2xl font-black text-emerald-400 mt-1 font-mono">
              {(data?.summary.netPlatformProfit ?? 0).toLocaleString("ar-EG")} <span className="text-xs font-normal">ج.م</span>
            </div>
            <div className="text-[11px] text-emerald-400/70 mt-0.5">حصة المنصة − المصروفات</div>
          </div>
        </div>

        {/* Tabs navigation */}
        <div className="px-6 pt-2 border-b border-slate-800 flex gap-2">
          <button
            onClick={() => setActiveTab("shares")}
            className={`px-4 py-2.5 text-sm font-bold rounded-t-xl transition-all border-b-2 cursor-pointer ${
              activeTab === "shares"
                ? "border-sky-400 text-sky-400 bg-slate-800/60"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            📊 نسب المنصة والمعلمين ({data?.teachers.length ?? 0})
          </button>
          <button
            onClick={() => setActiveTab("expenses")}
            className={`px-4 py-2.5 text-sm font-bold rounded-t-xl transition-all border-b-2 cursor-pointer ${
              activeTab === "expenses"
                ? "border-rose-400 text-rose-400 bg-slate-800/60"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            💸 تسجيل وإدارة المصروفات ({data?.expenses.length ?? 0})
          </button>
        </div>

        {/* Tab Contents */}
        <div className="p-6 flex-1 overflow-y-auto max-h-[60vh]">
          {loading ? (
            <div className="p-12 text-center text-slate-400">
              <div className="text-3xl mb-2 animate-pulse">⏳</div>
              جاري حساب الأرباح والمصروفات...
            </div>
          ) : error ? (
            <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-sm text-center">
              {error}
            </div>
          ) : activeTab === "shares" ? (
            <div className="space-y-5">
              {/* Default platform share bar */}
              <div className="p-4 rounded-2xl bg-slate-800/80 border border-slate-700 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="font-bold text-sm text-white">النسبة الافتراضية للمنصة لجميع المعلمين:</div>
                  <div className="text-xs text-slate-400 mt-0.5">
                    تُطبق تلقائياً على أي معلم ما لم يتم تحديد نسبة مخصصة له بالأسفل (الافتراضي: 25%)
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="relative flex items-center">
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="1"
                      value={defaultPctInput}
                      onChange={(e) => setDefaultPctInput(parseFloat(e.target.value) || 0)}
                      className="w-20 px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-white font-mono text-center font-bold text-sm focus:border-sky-400 focus:outline-none"
                    />
                    <span className="absolute left-2 text-xs text-slate-400">%</span>
                  </div>
                  <button
                    onClick={handleSaveDefaultPercentage}
                    disabled={savingDefault}
                    className="px-4 py-1.5 rounded-lg bg-sky-500 hover:bg-sky-600 text-white text-xs font-bold transition-colors cursor-pointer border-none disabled:opacity-50"
                  >
                    {savingDefault ? "حفظ..." : "حفظ الافتراضي"}
                  </button>
                </div>
              </div>

              {/* Teachers table */}
              <div className="rounded-2xl overflow-hidden border border-slate-800 bg-slate-900/60">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs min-w-[620px]">
                  <thead className="bg-slate-800/80 border-b border-slate-700/80 text-slate-400 font-medium">
                    <tr>
                      <th className="px-4 py-3 text-right">المعلم</th>
                      <th className="px-3 py-3 text-center">إجمالي الدخل</th>
                      <th className="px-3 py-3 text-center">نسبة المنصة %</th>
                      <th className="px-3 py-3 text-center">حصة المنصة (ج.م)</th>
                      <th className="px-3 py-3 text-center">مستحقات المعلم (ج.م)</th>
                      <th className="px-3 py-3 text-center">إجراء</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {data?.teachers.map((t) => {
                      const currentInputPct = editingPercentages[t.teacherId] ?? t.platformPercentage;
                      const calculatedPlatformShare = (t.grossRevenue * currentInputPct) / 100;
                      const calculatedTeacherShare = t.grossRevenue - calculatedPlatformShare;
                      const isCustom = data.teacherPercentages[t.teacherId] !== undefined;

                      return (
                        <tr key={t.teacherId} className="hover:bg-slate-800/40 transition-colors">
                          <td className="px-4 py-3">
                            <div className="font-bold text-white text-sm">{t.teacherName}</div>
                            <div className="text-[11px] text-slate-400 font-mono">{t.teacherEmail}</div>
                          </td>
                          <td className="px-3 py-3 text-center">
                            <span className="font-bold text-amber-400 font-mono text-sm">
                              {t.grossRevenue.toLocaleString("ar-EG")} ج.م
                            </span>
                          </td>
                          <td className="px-3 py-3 text-center">
                            <div className="inline-flex items-center gap-1.5">
                              <div className="relative flex items-center">
                                <input
                                  type="number"
                                  min="0"
                                  max="100"
                                  step="0.5"
                                  value={currentInputPct}
                                  onChange={(e) => {
                                    const val = parseFloat(e.target.value) || 0;
                                    setEditingPercentages((prev) => ({ ...prev, [t.teacherId]: val }));
                                  }}
                                  className="w-16 px-2 py-1 rounded-lg bg-slate-800 border border-slate-700 text-white font-mono text-center font-bold text-xs focus:border-sky-400 focus:outline-none"
                                />
                                <span className="absolute left-1.5 text-[10px] text-slate-400">%</span>
                              </div>
                              {isCustom ? (
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-sky-500/20 text-sky-300 font-medium">
                                  مخصصة
                                </span>
                              ) : (
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-700/50 text-slate-400">
                                  افتراضية
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-3 py-3 text-center font-bold text-sky-400 font-mono">
                            {calculatedPlatformShare.toLocaleString("ar-EG")} ج.م
                          </td>
                          <td className="px-3 py-3 text-center font-bold text-emerald-400 font-mono">
                            {calculatedTeacherShare.toLocaleString("ar-EG")} ج.م
                          </td>
                          <td className="px-3 py-3 text-center">
                            <button
                              onClick={() => handleSaveTeacherPercentage(t.teacherId)}
                              disabled={savingTeacherId === t.teacherId}
                              className="px-3 py-1 rounded-lg bg-slate-800 hover:bg-sky-500 text-slate-300 hover:text-white text-xs font-bold transition-all border border-slate-700 cursor-pointer disabled:opacity-50"
                            >
                              {savingTeacherId === t.teacherId ? "حفظ..." : "حفظ النسبة"}
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
          ) : (
            <div className="space-y-6">
              {/* Add Expense Form */}
              <form onSubmit={handleAddExpense} className="p-4 rounded-2xl bg-slate-800/80 border border-slate-700 space-y-3">
                <div className="font-bold text-sm text-white flex items-center gap-2">
                  <span>➕</span>
                  <span>تسجيل مصروف جديد للمنصة</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <label className="text-xs text-slate-400 block mb-1">اسم / سبب المصروف *</label>
                    <input
                      type="text"
                      placeholder="مثال: تجديد سيرفرات، إعلانات تيك توك..."
                      value={expenseTitle}
                      onChange={(e) => setExpenseTitle(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white text-xs focus:border-rose-400 focus:outline-none"
                      required
                    />
                  </div>
                  <div>
                    <label className="text-xs text-slate-400 block mb-1">المبلغ (ج.م) *</label>
                    <input
                      type="number"
                      min="0.1"
                      step="any"
                      placeholder="0.00"
                      value={expenseAmount}
                      onChange={(e) => setExpenseAmount(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white text-xs font-mono font-bold focus:border-rose-400 focus:outline-none"
                      required
                    />
                  </div>
                  <div>
                    <label className="text-xs text-slate-400 block mb-1">التصنيف</label>
                    <select
                      value={expenseCategory}
                      onChange={(e) => setExpenseCategory(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white text-xs focus:border-rose-400 focus:outline-none"
                    >
                      <option value="تقنية وسيرفرات">تقنية وسيرفرات (AWS/VdoCipher)</option>
                      <option value="تسويق وإعلانات">تسويق وإعلانات (Facebook/TikTok)</option>
                      <option value="رسائل واتساب وSMS">رسائل واتساب و SMS</option>
                      <option value="رواتب ومكافآت">رواتب ومكافآت وتيم العمل</option>
                      <option value="مصاريف بنكية ورسوم">مصاريف بنكية وبوابات دفع</option>
                      <option value="عام وتشغيلي">عام وتشغيلي</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="text-xs text-slate-400 block mb-1">ملاحظات إضافية (اختياري)</label>
                  <input
                    type="text"
                    placeholder="أي تفاصيل أو أرقام فواتير..."
                    value={expenseNote}
                    onChange={(e) => setExpenseNote(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white text-xs focus:border-rose-400 focus:outline-none"
                  />
                </div>
                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={addingExpense}
                    className="px-5 py-2 rounded-xl bg-rose-500 hover:bg-rose-600 text-white text-xs font-bold transition-colors cursor-pointer border-none disabled:opacity-50"
                  >
                    {addingExpense ? "جاري الإضافة..." : "+ إضافة المصروف وخصمه من الأرباح"}
                  </button>
                </div>
              </form>

              {/* Expenses List */}
              <div className="rounded-2xl overflow-hidden border border-slate-800 bg-slate-900/60">
                <div className="p-3 bg-slate-800/80 border-b border-slate-700 flex items-center justify-between">
                  <h3 className="font-bold text-xs text-white">سجل المصروفات المسجلة</h3>
                  <span className="text-xs font-bold text-rose-400 font-mono">
                    إجمالي: {(data?.summary.totalExpenses ?? 0).toLocaleString("ar-EG")} ج.م
                  </span>
                </div>

                {!data?.expenses || data.expenses.length === 0 ? (
                  <p className="p-8 text-xs text-center text-slate-500">لا توجد مصروفات مسجلة بعد.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs min-w-[550px]">
                      <thead className="bg-slate-800/40 border-b border-slate-700/60 text-slate-400 font-medium">
                        <tr>
                          <th className="px-3 py-2 text-right">المصروف</th>
                          <th className="px-3 py-2 text-center">التصنيف</th>
                          <th className="px-3 py-2 text-center">المبلغ</th>
                          <th className="px-3 py-2 text-center">المشرف / التاريخ</th>
                          <th className="px-3 py-2 text-center">حذف</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800">
                        {data.expenses.map((exp) => (
                          <tr key={exp.id} className="hover:bg-slate-800/30 transition-colors">
                            <td className="px-3 py-2.5">
                              <div className="font-bold text-white">{exp.title}</div>
                              {exp.note && <div className="text-[11px] text-slate-400 mt-0.5">{exp.note}</div>}
                            </td>
                            <td className="px-3 py-2.5 text-center">
                              <span className="inline-flex px-2 py-0.5 rounded text-[10px] font-medium bg-slate-800 text-slate-300 border border-slate-700">
                                {exp.category}
                              </span>
                            </td>
                            <td className="px-3 py-2.5 text-center font-bold text-rose-400 font-mono text-sm">
                              -{exp.amount.toLocaleString("ar-EG")} ج.م
                            </td>
                            <td className="px-3 py-2.5 text-center text-[11px] text-slate-400">
                              <div>{exp.addedBy}</div>
                              <div className="text-[10px] text-slate-500 font-mono">
                                {new Date(exp.createdAt).toLocaleDateString("ar-EG")}
                              </div>
                            </td>
                            <td className="px-3 py-2.5 text-center">
                              <button
                                onClick={() => handleDeleteExpense(exp.id)}
                                disabled={deletingExpenseId === exp.id}
                                className="w-7 h-7 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 flex items-center justify-center transition-colors cursor-pointer border-none mx-auto disabled:opacity-50"
                                title="حذف المصروف"
                              >
                                🗑️
                              </button>
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
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-800 bg-slate-900/80 flex items-center justify-between">
          <div className="text-xs text-slate-400">
            يتم تحديث جميع حسابات وأرقام الصفحة الرئيسية تلقائياً بعد أي تعديل.
          </div>
          <button
            onClick={onClose}
            className="px-6 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs transition-colors cursor-pointer border border-slate-700"
          >
            إغلاق
          </button>
        </div>
      </div>
    </div>
  );
}
