"use client";

import React, { useEffect, useState } from "react";
import { Landmark, Percent, Plus, Receipt, Trash2 } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { Badge, Button, EmptyState, Field, IconButton, Input, Modal, Notice, Select, Skeleton, Stat, Tabs, fmtDate, fmtMoney, fmtNum, readJson } from "@/components/admin/ui/kit";

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

const CATEGORIES = [
  { v: "تقنية وسيرفرات", l: "تقنية وسيرفرات (AWS / VdoCipher)" },
  { v: "تسويق وإعلانات", l: "تسويق وإعلانات" },
  { v: "رسائل واتساب وSMS", l: "رسائل واتساب و SMS" },
  { v: "رواتب ومكافآت", l: "رواتب ومكافآت" },
  { v: "مصاريف بنكية ورسوم", l: "مصاريف بنكية وبوابات دفع" },
  { v: "عام وتشغيلي", l: "عام وتشغيلي" },
];

function parsePct(v: string): number | null {
  if (v.trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 && n <= 100 ? n : null;
}

export function MoneyControlModal({ isOpen, onClose, onUpdated }: MoneyControlModalProps) {
  const { success: toastSuccess, error: toastError } = useToast();
  const [activeTab, setActiveTab] = useState<"shares" | "expenses">("shares");
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<MoneyControlData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savingTeacherId, setSavingTeacherId] = useState<string | null>(null);
  const [editingPercentages, setEditingPercentages] = useState<Record<string, string>>({});
  const [defaultPctInput, setDefaultPctInput] = useState("25");
  const [savingDefault, setSavingDefault] = useState(false);

  const [expenseTitle, setExpenseTitle] = useState("");
  const [expenseAmount, setExpenseAmount] = useState("");
  const [expenseCategory, setExpenseCategory] = useState(CATEGORIES[0].v);
  const [expenseNote, setExpenseNote] = useState("");
  const [addingExpense, setAddingExpense] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ExpenseItem | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchData = async (showSpinner = true) => {
    if (showSpinner) setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/superadmin/money-control", { cache: "no-store", credentials: "include" });
      const json = await readJson<MoneyControlData & { error?: string }>(res);
      if (!res.ok || !json) throw new Error(json?.error || "تعذر جلب بيانات الأرباح");
      setData(json);
      setDefaultPctInput(String(json.defaultPercentage ?? 25));
      setEditingPercentages(Object.fromEntries(json.teachers.map((t) => [t.teacherId, String(t.platformPercentage)])));
    } catch (err) {
      setError(err instanceof Error ? err.message : "حدث خطأ غير متوقع");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) void fetchData();
  }, [isOpen]);

  const patchPercentages = async (body: Record<string, unknown>, fallback: string) => {
    const res = await fetch("/api/admin/superadmin/money-control/percentages", {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error((await readJson<{ error?: string }>(res))?.error || fallback);
  };

  const handleSaveTeacherPercentage = async (t: TeacherFinancial) => {
    const pct = parsePct(editingPercentages[t.teacherId] ?? "");
    if (pct === null) return toastError("أدخل نسبة بين ٠ و ١٠٠");
    setSavingTeacherId(t.teacherId);
    try {
      await patchPercentages({ teacherId: t.teacherId, percentage: pct }, "تعذر حفظ النسبة");
      toastSuccess(`نسبة المنصة من ${t.teacherName} الآن ${fmtNum(pct)}٪`);
      await fetchData(false);
      onUpdated?.();
    } catch (err) {
      toastError(err instanceof Error ? err.message : "تعذر حفظ النسبة");
    } finally {
      setSavingTeacherId(null);
    }
  };

  const handleSaveDefaultPercentage = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const pct = parsePct(defaultPctInput);
    if (pct === null) return toastError("أدخل نسبة بين ٠ و ١٠٠");
    setSavingDefault(true);
    try {
      await patchPercentages({ defaultPercentage: pct }, "تعذر حفظ النسبة الافتراضية");
      toastSuccess(`النسبة الافتراضية للمنصة الآن ${fmtNum(pct)}٪`);
      await fetchData(false);
      onUpdated?.();
    } catch (err) {
      toastError(err instanceof Error ? err.message : "تعذر حفظ النسبة الافتراضية");
    } finally {
      setSavingDefault(false);
    }
  };

  const handleAddExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    const amountNum = parseFloat(expenseAmount);
    if (!expenseTitle.trim()) return toastError("اكتب اسم المصروف");
    if (!Number.isFinite(amountNum) || amountNum <= 0) return toastError("أدخل مبلغاً أكبر من صفر");
    setAddingExpense(true);
    try {
      const res = await fetch("/api/admin/superadmin/money-control/expenses", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: expenseTitle.trim(), amount: amountNum, category: expenseCategory, note: expenseNote.trim() || undefined }),
      });
      if (!res.ok) throw new Error((await readJson<{ error?: string }>(res))?.error || "تعذر إضافة المصروف");
      toastSuccess(`سُجّل مصروف ${fmtMoney(amountNum)}`);
      setExpenseTitle("");
      setExpenseAmount("");
      setExpenseNote("");
      await fetchData(false);
      onUpdated?.();
    } catch (err) {
      toastError(err instanceof Error ? err.message : "تعذر إضافة المصروف");
    } finally {
      setAddingExpense(false);
    }
  };

  const handleDeleteExpense = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/admin/superadmin/money-control/expenses/${deleteTarget.id}`, { method: "DELETE", credentials: "include" });
      if (!res.ok) throw new Error((await readJson<{ error?: string }>(res))?.error || "تعذر حذف المصروف");
      toastSuccess("حُذف المصروف");
      setDeleteTarget(null);
      await fetchData(false);
      onUpdated?.();
    } catch (err) {
      toastError(err instanceof Error ? err.message : "تعذر حذف المصروف");
    } finally {
      setDeleting(false);
    }
  };

  const s = data?.summary;

  return (
    <>
      <Modal
        open={isOpen}
        onClose={onClose}
        size="xl"
        title="الأرباح والمصروفات"
        description="نسبة المنصة من كل معلم (افتراضية أو مخصصة)، ومصروفات المنصة، وصافي الربح. تتحدث أرقام النظرة العامة تلقائياً بعد أي تعديل."
        icon={
          <span className="w-10 h-10 rounded-[12px] grid place-items-center" style={{ background: "var(--gold-soft)", color: "var(--gold)" }}>
            <Landmark size={20} />
          </span>
        }
        footer={<Button onClick={onClose}>إغلاق</Button>}
      >
        <div className="flex flex-col gap-5">
          {loading && !data ? (
            <div className="adm-stats">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} h={92} r={12} />)}</div>
          ) : (
            <div className="adm-stats">
              <Stat well label="إجمالي دخل المعلمين" value={fmtMoney(s?.totalGrossRevenue)} tone="gold" sub="الكورسات والباقات المدفوعة" />
              <Stat well label="حصة المنصة" value={fmtMoney(s?.totalPlatformShare)} tone="info" sub="حسب نسبة كل معلم" />
              <Stat well label="المصروفات" value={fmtMoney(s?.totalExpenses)} tone="bad" sub={`${fmtNum(data?.expenses.length ?? 0)} بند`} />
              <Stat well label="صافي الربح" value={fmtMoney(s?.netPlatformProfit)} tone={(s?.netPlatformProfit ?? 0) >= 0 ? "ok" : "bad"} sub="حصة المنصة − المصروفات" />
            </div>
          )}

          <Tabs<"shares" | "expenses">
            label="الأرباح والمصروفات"
            value={activeTab}
            onChange={setActiveTab}
            items={[
              { id: "shares", label: "نسب المنصة", icon: <Percent size={14} />, badge: <Badge>{fmtNum(data?.teachers.length ?? 0)}</Badge> },
              { id: "expenses", label: "المصروفات", icon: <Receipt size={14} />, badge: <Badge>{fmtNum(data?.expenses.length ?? 0)}</Badge> },
            ]}
          />

          {error ? (
            <Notice tone="bad" title={error} action={<Button size="sm" onClick={() => void fetchData()}>إعادة المحاولة</Button>} />
          ) : loading && !data ? (
            <Skeleton h={220} r={12} />
          ) : activeTab === "shares" ? (
            <div className="flex flex-col gap-4">
              <form onSubmit={handleSaveDefaultPercentage} className="adm-well p-4 flex flex-wrap items-end justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold">النسبة الافتراضية للمنصة</p>
                  <p className="adm-hint">تُطبّق على كل معلم ليس له نسبة مخصصة.</p>
                </div>
                <div className="flex items-end gap-2">
                  <PctInput id="mc-default" value={defaultPctInput} onChange={setDefaultPctInput} label="النسبة الافتراضية" />
                  <Button type="submit" variant="primary" size="sm" loading={savingDefault} disabled={parsePct(defaultPctInput) === null || Number(defaultPctInput) === data?.defaultPercentage}>
                    حفظ
                  </Button>
                </div>
              </form>

              {!data?.teachers.length ? (
                <EmptyState title="لا يوجد معلمون" />
              ) : (
                <div className="adm-well overflow-hidden">
                  <div className="adm-table-wrap">
                    <table className="adm-table" style={{ minWidth: 680 }}>
                      <thead>
                        <tr>
                          <th>المعلم</th>
                          <th className="is-num">الدخل</th>
                          <th>نسبة المنصة</th>
                          <th className="is-num">حصة المنصة</th>
                          <th className="is-num">مستحقات المعلم</th>
                          <th className="is-actions" />
                        </tr>
                      </thead>
                      <tbody>
                        {data.teachers.map((t) => {
                          const raw = editingPercentages[t.teacherId] ?? String(t.platformPercentage);
                          const pct = parsePct(raw);
                          const platform = pct === null ? null : (t.grossRevenue * pct) / 100;
                          const isCustom = data.teacherPercentages[t.teacherId] !== undefined;
                          const changed = pct !== null && pct !== t.platformPercentage;
                          return (
                            <tr key={t.teacherId}>
                              <td>
                                <p className="font-bold">{t.teacherName}</p>
                                <p className="text-xs adm-muted adm-mono">{t.teacherEmail}</p>
                              </td>
                              <td className="is-num font-bold" style={{ color: "var(--gold)" }}>{fmtMoney(t.grossRevenue)}</td>
                              <td>
                                <div className="flex items-center gap-2">
                                  <PctInput id={`mc-${t.teacherId}`} value={raw} onChange={(v) => setEditingPercentages((p) => ({ ...p, [t.teacherId]: v }))} label={`نسبة المنصة من ${t.teacherName}`} small />
                                  <Badge tone={isCustom ? "info" : "neutral"}>{isCustom ? "مخصصة" : "افتراضية"}</Badge>
                                </div>
                              </td>
                              <td className="is-num" style={{ color: "var(--info)" }}>{platform === null ? "—" : fmtMoney(platform)}</td>
                              <td className="is-num" style={{ color: "var(--ok)" }}>{platform === null ? "—" : fmtMoney(t.grossRevenue - platform)}</td>
                              <td className="is-actions">
                                <Button size="sm" variant={changed ? "primary" : "secondary"} disabled={!changed} loading={savingTeacherId === t.teacherId} onClick={() => void handleSaveTeacherPercentage(t)}>
                                  حفظ
                                </Button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              <form onSubmit={handleAddExpense} className="adm-well p-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 items-end">
                <Field label="المصروف" htmlFor="ex-title" className="lg:col-span-2">
                  <Input id="ex-title" required value={expenseTitle} onChange={(e) => setExpenseTitle(e.target.value)} placeholder="تجديد سيرفر، إعلان…" />
                </Field>
                <Field label="المبلغ (ج.م)" htmlFor="ex-amount">
                  <Input id="ex-amount" type="number" min="0.1" step="any" required mono value={expenseAmount} onChange={(e) => setExpenseAmount(e.target.value)} />
                </Field>
                <Field label="التصنيف" htmlFor="ex-cat">
                  <Select id="ex-cat" value={expenseCategory} onChange={(e) => setExpenseCategory(e.target.value)}>
                    {CATEGORIES.map((c) => (
                      <option key={c.v} value={c.v}>{c.l}</option>
                    ))}
                  </Select>
                </Field>
                <Field label="ملاحظات" hint="اختياري — رقم فاتورة أو تفاصيل" htmlFor="ex-note" className="sm:col-span-2 lg:col-span-3">
                  <Input id="ex-note" value={expenseNote} onChange={(e) => setExpenseNote(e.target.value)} />
                </Field>
                <Button type="submit" variant="primary" loading={addingExpense} icon={<Plus size={15} />}>تسجيل المصروف</Button>
              </form>

              {!data?.expenses.length ? (
                <EmptyState icon={<Receipt size={20} />} title="لا توجد مصروفات مسجلة" />
              ) : (
                <div className="adm-well overflow-hidden">
                  <div className="adm-table-wrap">
                    <table className="adm-table" style={{ minWidth: 600 }}>
                      <thead>
                        <tr>
                          <th>المصروف</th>
                          <th>التصنيف</th>
                          <th className="is-num">المبلغ</th>
                          <th>بواسطة</th>
                          <th className="is-actions" />
                        </tr>
                      </thead>
                      <tbody>
                        {data.expenses.map((exp) => (
                          <tr key={exp.id}>
                            <td>
                              <p className="font-bold">{exp.title}</p>
                              {exp.note && <p className="text-xs adm-muted">{exp.note}</p>}
                            </td>
                            <td><Badge>{exp.category}</Badge></td>
                            <td className="is-num font-bold" style={{ color: "var(--danger)" }}>−{fmtMoney(exp.amount)}</td>
                            <td className="text-xs">
                              <p>{exp.addedBy}</p>
                              <p className="adm-muted">{fmtDate(exp.createdAt)}</p>
                            </td>
                            <td className="is-actions">
                              <IconButton label="حذف المصروف" size="sm" onClick={() => setDeleteTarget(exp)} style={{ color: "var(--danger)" }}>
                                <Trash2 size={15} />
                              </IconButton>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </Modal>

      <Modal
        open={!!deleteTarget}
        onClose={() => !deleting && setDeleteTarget(null)}
        size="sm"
        title="حذف المصروف؟"
        description={deleteTarget ? `${deleteTarget.title} — ${fmtMoney(deleteTarget.amount)}. سيرتفع صافي الربح بنفس المبلغ.` : undefined}
        footer={
          <>
            <Button onClick={() => setDeleteTarget(null)} disabled={deleting}>إلغاء</Button>
            <Button variant="danger-solid" loading={deleting} onClick={() => void handleDeleteExpense()}>حذف</Button>
          </>
        }
      />
    </>
  );
}

function PctInput({ id, value, onChange, label, small }: { id: string; value: string; onChange: (v: string) => void; label: string; small?: boolean }) {
  const invalid = value.trim() !== "" && parsePct(value) === null;
  return (
    <div className="relative" style={{ width: small ? 84 : 100 }}>
      <Input
        id={id}
        type="number"
        min={0}
        max={100}
        step={0.5}
        inputSize={small ? "sm" : "md"}
        mono
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={label}
        aria-invalid={invalid || value.trim() === "" || undefined}
        style={{ paddingRight: 24, textAlign: "center" }}
      />
      <span className="absolute top-1/2 -translate-y-1/2 text-xs adm-muted pointer-events-none" style={{ right: 9 }}>٪</span>
    </div>
  );
}
