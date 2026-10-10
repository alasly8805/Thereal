"use client";

import { useCallback, useEffect, useState } from "react";
import { Copy, RefreshCw, Share2 } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { Button, EmptyState, IconButton, Notice, PageHeader, Panel, SkeletonRows, Stat, fmtMoney, fmtNum, readJson } from "@/components/admin/ui/kit";

interface TeacherSummary {
  teacherId: string;
  teacherName: string;
  teacherEmail: string;
  promoCode: string;
  promoCodeCreatedAt?: string;
  referredStudentsCount: number;
  attributionsCount: number;
  totalAmount: number;
}

export function SuperadminReferredStudentsSection() {
  const { success, error: toastError } = useToast();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [teachers, setTeachers] = useState<TeacherSummary[]>([]);
  const [platformTotal, setPlatformTotal] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const res = await fetch("/api/admin/superadmin/referred-students", { credentials: "include" });
      const data = await readJson<{ teachers?: TeacherSummary[]; platformTotalAmount?: number; error?: string }>(res);
      if (!res.ok || !Array.isArray(data?.teachers)) {
        setLoadError(data?.error || "تعذر تحميل بيانات الإحالات");
        return;
      }
      setTeachers([...data.teachers].sort((a, b) => b.totalAmount - a.totalAmount));
      setPlatformTotal(data.platformTotalAmount || 0);
    } catch {
      setLoadError("تعذر الاتصال بالخادم");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const totalStudents = teachers.reduce((s, t) => s + t.referredStudentsCount, 0);
  const totalSales = teachers.reduce((s, t) => s + t.attributionsCount, 0);

  const copy = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      success(`نُسخ ${code}`);
    } catch {
      toastError("تعذر النسخ");
    }
  };

  return (
    <div dir="rtl" className="flex flex-col gap-5">
      <PageHeader
        title="إحالات المعلمين"
        description="المعلمون المفعّل لهم برنامج الإحالة، وكم طالباً ومبيعة جاءت من أكوادهم. فعّل البرنامج لأي معلم من قسم «المعلمون»."
        actions={<Button onClick={() => void load()} loading={loading} icon={<RefreshCw size={15} />}>تحديث</Button>}
      />

      {loadError && <Notice tone="bad" title={loadError} action={<Button size="sm" onClick={() => void load()}>إعادة المحاولة</Button>} />}

      <div className="adm-stats">
        <Stat label="إجمالي إيرادات الإحالات" value={fmtMoney(platformTotal)} tone="brand" />
        <Stat label="معلمون مشاركون" value={fmtNum(teachers.length)} />
        <Stat label="طلاب محالون" value={fmtNum(totalStudents)} tone="gold" />
        <Stat label="مبيعات" value={fmtNum(totalSales)} />
      </div>

      <Panel padded={false} title="المعلمون المشاركون" icon={<Share2 size={16} />}>
        {loading && teachers.length === 0 ? (
          <SkeletonRows rows={4} />
        ) : teachers.length === 0 ? (
          <EmptyState icon={<Share2 size={22} />} title="لا يوجد معلمون في برنامج الإحالة" text="فعّل البرنامج لمعلم من قسم «المعلمون» ليحصل على كود إحالة." />
        ) : (
          <div className="adm-table-wrap">
            <table className="adm-table" style={{ minWidth: 620 }}>
              <thead>
                <tr>
                  <th>المعلم</th>
                  <th>كود الإحالة</th>
                  <th className="is-num">طلاب محالون</th>
                  <th className="is-num">مبيعات</th>
                  <th className="is-num">الإيراد</th>
                </tr>
              </thead>
              <tbody>
                {teachers.map((t) => (
                  <tr key={t.teacherId}>
                    <td>
                      <p className="font-bold">{t.teacherName}</p>
                      <p className="text-xs adm-muted adm-mono">{t.teacherEmail}</p>
                    </td>
                    <td>
                      <span className="inline-flex items-center gap-1">
                        <span className="adm-mono font-bold" style={{ color: "var(--brand)" }}>{t.promoCode}</span>
                        <IconButton label="نسخ الكود" size="sm" onClick={() => void copy(t.promoCode)}>
                          <Copy size={14} />
                        </IconButton>
                      </span>
                    </td>
                    <td className="is-num font-semibold">{fmtNum(t.referredStudentsCount)}</td>
                    <td className="is-num">{fmtNum(t.attributionsCount)}</td>
                    <td className="is-num font-bold" style={{ color: "var(--brand)" }}>{fmtMoney(t.totalAmount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}
