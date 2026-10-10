import "@/components/admin/ui/admin.css";
import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowRight, CheckCircle2, Trophy, Users } from "lucide-react";
import { EDUCATIONAL_STAGES } from "@/types";

export const dynamic = "force-dynamic";

export default async function DailyExamResultsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const exam = await prisma.dailyExam.findUnique({
    where: { id },
    include: {
      results: {
        select: {
          id: true,
          score: true,
          totalQ: true,
          completedAt: true,
          student: { select: { name: true, email: true, phone: true } },
        },
        orderBy: [{ score: "desc" }, { completedAt: "asc" }],
      },
      _count: { select: { questions: true } },
    },
  });

  if (!exam) return notFound();

  const n = exam.results.length;
  const avg = n > 0 ? exam.results.reduce((acc, r) => acc + r.score, 0) / n : 0;
  const perfect = exam.results.filter((r) => r.score === exam._count.questions && exam._count.questions > 0).length;
  const stage = EDUCATIONAL_STAGES.find((s) => s.value === exam.educationalStage)?.label ?? exam.educationalStage;
  const num = (v: number) => v.toLocaleString("ar-EG");

  return (
    <div className="adm min-h-dvh" dir="rtl">
      <main className="adm-main" style={{ paddingBottom: 48 }}>
        <div className="adm-main-inner" style={{ maxWidth: 1100 }}>
          <Link href="/adminpanel/superadmin?section=daily-exams" className="adm-btn is-ghost is-sm" style={{ alignSelf: "flex-start" }}>
            <ArrowRight size={15} aria-hidden /> امتحانات لوحة الشرف
          </Link>

          <header className="adm-page-head">
            <div>
              <h1 className="adm-h1">نتائج: {exam.title}</h1>
              <p className="adm-lede">
                {exam.date.toLocaleDateString("ar-EG", { weekday: "long", year: "numeric", month: "long", day: "numeric" })} · {stage} · {num(exam._count.questions)} سؤال
              </p>
            </div>
          </header>

          <div className="adm-stats">
            <div className="adm-stat">
              <div className="adm-stat-label">المشاركون <Users size={16} style={{ color: "var(--brand)" }} aria-hidden /></div>
              <div className="adm-stat-value">{num(n)}</div>
            </div>
            <div className="adm-stat">
              <div className="adm-stat-label">متوسط الدرجات <Trophy size={16} style={{ color: "var(--gold)" }} aria-hidden /></div>
              <div className="adm-stat-value">
                {avg.toLocaleString("ar-EG", { maximumFractionDigits: 1 })} / {num(exam._count.questions)}
              </div>
            </div>
            <div className="adm-stat">
              <div className="adm-stat-label">درجة كاملة <CheckCircle2 size={16} style={{ color: "var(--ok)" }} aria-hidden /></div>
              <div className="adm-stat-value" style={{ color: "var(--ok)" }}>{num(perfect)}</div>
            </div>
          </div>

          <section className="adm-panel adm-panel-clip">
            <div className="adm-table-wrap">
              <table className="adm-table" style={{ minWidth: 560 }}>
                <thead>
                  <tr>
                    <th className="is-center" style={{ width: 64 }}>#</th>
                    <th>المتعلم</th>
                    <th className="is-num">الدرجة</th>
                    <th>وقت الإنهاء</th>
                  </tr>
                </thead>
                <tbody>
                  {n > 0 ? (
                    exam.results.map((r, i) => (
                      <tr key={r.id}>
                        <td className="is-center">
                          <span className="adm-avatar" style={{ width: 30, height: 30, margin: "0 auto", fontSize: 13 }}>{num(i + 1)}</span>
                        </td>
                        <td>
                          <p className="font-bold">{r.student.name}</p>
                          <p className="text-xs adm-muted adm-mono">{r.student.phone || r.student.email}</p>
                        </td>
                        <td className="is-num font-bold" style={{ color: r.score === exam._count.questions ? "var(--ok)" : undefined }}>
                          {num(r.score)} / {num(r.totalQ)}
                        </td>
                        <td className="adm-muted whitespace-nowrap">{r.completedAt.toLocaleString("ar-EG")}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={4}>
                        <div className="adm-empty">
                          <p className="adm-empty-title">لا توجد نتائج بعد</p>
                          <p className="adm-empty-text">ستظهر النتائج هنا فور حل الطلاب للتحدي.</p>
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
