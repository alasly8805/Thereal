"use client";

import { use, useEffect, useState } from "react";

interface ChildGateInfo {
  name: string;
  stage: string | null;
  maskedStudentPhone: string;
}

interface ExamItem {
  title: string;
  score: number | null;
  maxScore: number;
  /** null while essay answers are awaiting teacher review */
  percent: number | null;
  status: string;
  statusLabel?: string;
  pendingEssays?: number;
  date: string;
}

interface TeacherNote {
  teacherName: string;
  content: string;
  date: string;
}

interface SubscriptionItem {
  id: string;
  teacherName: string;
  teacherPhone: string | null;
  planLabel: string;
  amount: number;
  createdAt: string;
  status: string;
}

interface ReportData {
  student: {
    id: string;
    name: string;
    educationalStage: string | null;
    points: number;
    parentPhone: string | null;
    phone: string | null;
  };
  overallAveragePercent: number | null;
  overallStatusBadge: { label: string; color: string; text: string } | null;
  attendancePercent: number | null;
  homeworkStats: {
    completed: number;
    pending: number;
    late: number | null;
  };
  recentExams: ExamItem[];
  teacherNotes: TeacherNote[];
  subscriptions: SubscriptionItem[];
}

export default function ParentPortalPage({ params }: { params: Promise<{ token: string }> }) {
  const resolvedParams = use(params);
  const token = resolvedParams.token;

  const [loading, setLoading] = useState(true);
  const [stage, setStage] = useState<"GATE" | "REPORT" | "DEAD">("DEAD");
  const [gateChild, setGateChild] = useState<ChildGateInfo | null>(null);
  const [reportData, setReportData] = useState<ReportData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);

  useEffect(() => {
    async function loadPortal() {
      try {
        const res = await fetch(`/api/parent/portal?token=${encodeURIComponent(token)}`);
        const json = await res.json();
        if (res.ok && json.success) {
          if (json.stage === "GATE") {
            setStage("GATE");
            setGateChild(json.child);
          } else if (json.stage === "REPORT") {
            setStage("REPORT");
            setReportData(json);
          } else {
            setStage("DEAD");
          }
        } else {
          setStage("DEAD");
          setError(json.error || "الرابط غير صالح أو تم التعديل عليه");
        }
      } catch (err: any) {
        setStage("DEAD");
        setError(err?.message || "حدث خطأ أثناء تحميل البيانات");
      } finally {
        setLoading(false);
      }
    }
    loadPortal();
  }, [token]);

  // Submit GATE confirmation answer (YES / NO)
  const handleVerifyAnswer = async (answer: "YES" | "NO") => {
    setVerifying(true);
    try {
      const res = await fetch("/api/parent/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, answer }),
      });
      const json = await res.json();
      if (res.ok && json.ok) {
        if (json.stage === "REPORT") {
          // Re-fetch report data
          const repRes = await fetch(`/api/parent/portal?token=${encodeURIComponent(token)}`);
          const repJson = await repRes.json();
          if (repRes.ok && repJson.stage === "REPORT") {
            setReportData(repJson);
            setStage("REPORT");
          } else {
            setStage("DEAD");
          }
        } else {
          setStage("DEAD");
        }
      } else {
        setStage("DEAD");
      }
    } catch {
      setStage("DEAD");
    } finally {
      setVerifying(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#FBF8F1] text-[#1A1A1A] flex flex-col items-center justify-center p-6 text-center font-serif" dir="rtl">
        <div className="w-10 h-10 border-4 border-[#0F7B4F] border-t-transparent rounded-full animate-spin mb-4" />
        <h2 className="text-xl font-bold text-[#1A1A1A]">جارٍ تحميل تقرير الطالب...</h2>
      </div>
    );
  }

  if (stage === "GATE" && gateChild) {
    return (
      <div
        className="min-h-screen bg-[#FBF8F1] text-[#1A1A1A] p-4 sm:p-6 flex flex-col items-center justify-center font-serif"
        dir="rtl"
        style={{ fontSize: "19px", lineHeight: 1.9 }}
      >
        <style jsx global>{`
          @import url('https://fonts.googleapis.com/css2?family=Amiri:ital,wght@0,400;0,700;1,400;1,700&family=Noto+Naskh+Arabic:wght@400..700&display=swap');
          body {
            font-family: 'Amiri', 'Noto Naskh Arabic', serif;
            background-color: #FBF8F1;
            color: #1A1A1A;
          }
        `}</style>

        <div className="w-full max-w-lg bg-white border-2 border-[#1A1A1A] p-6 sm:p-8 shadow-xl rounded-2xl space-y-6">
          {/* Header */}
          <div className="border-b-2 border-[#1A1A1A] pb-4 text-center">
            <p className="text-xs uppercase tracking-widest font-sans font-bold text-gray-600 mb-1">Code-UP منصة التعليم</p>
            <h1 className="text-2xl sm:text-3xl font-black text-[#1A1A1A]">تأكيد صفة ولي الأمر</h1>
          </div>

          <div className="space-y-4 text-center">
            <p className="text-lg text-[#1A1A1A] leading-relaxed">
              مرحباً بحضرتك. للتأكد من وصول التقرير لشخصكم الكريم:
            </p>

            <div className="bg-[#FBF8F1] border border-gray-400 p-4 rounded-xl space-y-1">
              <p className="text-xl font-bold text-[#0F7B4F]">{gateChild.name}</p>
              {gateChild.stage && <p className="text-base text-gray-700">{gateChild.stage}</p>}
              <p className="text-sm font-mono text-gray-600">رقم الطالب: {gateChild.maskedStudentPhone}</p>
            </div>

            <p className="text-xl font-bold text-[#1A1A1A] pt-2">
              هل حضرتك ولي أمر الطالب المذكور؟
            </p>
          </div>

          {/* Action buttons (min 56px tall) */}
          <div className="space-y-3 pt-2">
            <button
              onClick={() => handleVerifyAnswer("YES")}
              disabled={verifying}
              className="w-full min-h-[56px] py-3 px-6 rounded-xl bg-[#0F7B4F] hover:bg-[#0b5f3d] disabled:opacity-50 text-white font-bold text-lg transition-colors flex items-center justify-center gap-2 shadow-md cursor-pointer"
            >
              {verifying ? "جارٍ التحقق..." : "أيوه، أنا ولي أمره"}
            </button>

            <button
              onClick={() => handleVerifyAnswer("NO")}
              disabled={verifying}
              className="w-full min-h-[56px] py-3 px-6 rounded-xl bg-[#B3261E] hover:bg-[#8f1e18] disabled:opacity-50 text-white font-bold text-lg transition-colors flex items-center justify-center gap-2 shadow-md cursor-pointer"
            >
              {verifying ? "جارٍ التحقق..." : "لأ، مش أنا"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // DEAD VIEW (Link Unknown, Expired, or Rejected)
  // ══════════════════════════════════════════════════════════════════════════
  if (stage === "DEAD" || !reportData) {
    return (
      <div
        className="min-h-screen bg-[#FBF8F1] text-[#1A1A1A] p-4 sm:p-6 flex flex-col items-center justify-center font-serif"
        dir="rtl"
        style={{ fontSize: "19px", lineHeight: 1.9 }}
      >
        <div className="w-full max-w-md bg-white border-2 border-[#1A1A1A] p-8 text-center space-y-5 rounded-2xl shadow-xl">
          <div className="w-16 h-16 bg-red-100 text-[#B3261E] border border-red-300 rounded-full flex items-center justify-center text-3xl mx-auto">
            ⚠️
          </div>
          <h1 className="text-2xl font-black text-[#1A1A1A]">عذراً، الرابط غير متاح</h1>
          <p className="text-base text-gray-700 leading-relaxed">
            {error || "الرابط المطلوب غير صالح، أو انتهت صلاحيته، أو تم إلغاؤه بناءً على طلب ولي الأمر."}
          </p>
        </div>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // REPORT VIEW (Newspaper Theme)
  // ══════════════════════════════════════════════════════════════════════════
  const { student, overallAveragePercent, overallStatusBadge, homeworkStats, recentExams, teacherNotes, subscriptions } = reportData;

  const formattedDate = new Date().toLocaleDateString("ar-EG", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  // Calculate total paid across subscriptions
  const totalPaid = subscriptions.reduce((sum, s) => sum + (s.amount || 0), 0);

  // Find primary teacher phone from subscriptions if available
  const primaryTeacherPhone = subscriptions.find((s) => s.teacherPhone)?.teacherPhone;

  // Compose The Lead (الافتتاحية) in العامية الرسمية using real data only
  const leadSentences: string[] = [];
  if (overallAveragePercent !== null) {
    leadSentences.push(`ابنك ${student.name} متوسط درجاته حتى الآن ${overallAveragePercent}٪.`);
  } else {
    leadSentences.push(`تقرير متابعة أداء الطالب ${student.name}.`);
  }

  if (homeworkStats.completed > 0) {
    leadSentences.push(`سلّم ${homeworkStats.completed} واجب دراسي.`);
  }
  if (homeworkStats.pending > 0) {
    leadSentences.push(`وفيه ${homeworkStats.pending} واجب في الانتظار.`);
  }

  const leadText = leadSentences.join(" ");

  return (
    <div
      className="min-h-screen bg-[#FBF8F1] text-[#1A1A1A] font-serif p-4 sm:p-8 pb-20 selection:bg-[#0F7B4F] selection:text-white"
      dir="rtl"
      style={{ fontSize: "19px", lineHeight: 1.9 }}
    >
      <style jsx global>{`
        @import url('https://fonts.googleapis.com/css2?family=Amiri:ital,wght@0,400;0,700;1,400;1,700&family=Noto+Naskh+Arabic:wght@400..700&display=swap');
        body {
          font-family: 'Amiri', 'Noto Naskh Arabic', serif;
          background-color: #FBF8F1;
          color: #1A1A1A;
        }
        @media print {
          .no-print {
            display: none !important;
          }
          body {
            background-color: #ffffff !important;
            color: #000000 !important;
          }
          .newspaper-box {
            border: 1px solid #000000 !important;
            box-shadow: none !important;
          }
        }
      `}</style>

      <div className="max-w-2xl mx-auto space-y-6">

        {/* 1. MASTHEAD (الترويسة) */}
        <header className="newspaper-box border-b-4 border-t-4 border-[#1A1A1A] py-5 px-4 text-center space-y-2 bg-white">
          <div className="flex items-center justify-between text-xs font-sans font-bold text-gray-700 border-b border-gray-300 pb-2">
            <span>منصة Code-UP التعليمية</span>
            <span>{formattedDate}</span>
            <span>تقرير متابعة دوري</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-black text-[#1A1A1A] tracking-tight pt-1">
            تقرير متابعة الطالب
          </h1>
          <p className="text-xl font-bold text-[#0F7B4F]">{student.name}</p>
          {student.educationalStage && (
            <p className="text-sm text-gray-700 font-sans font-semibold">{student.educationalStage}</p>
          )}
        </header>

        {/* 2. THE LEAD (الافتتاحية) */}
        <section className="newspaper-box bg-white border-2 border-[#1A1A1A] p-5 sm:p-6 rounded-xl space-y-2">
          <h2 className="text-base font-sans font-bold text-[#0F7B4F] uppercase tracking-wider">الافتتاحية</h2>
          <p className="text-xl leading-relaxed text-[#1A1A1A] font-bold">
            «{leadText}»
          </p>
        </section>

        {/* 3. KEY STATS (الأرقام المهمة) */}
        <section className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Average percent card */}
          <div className="newspaper-box bg-white border-2 border-[#1A1A1A] p-5 rounded-xl text-center space-y-1">
            <h3 className="text-sm font-sans font-bold text-gray-700">متوسط درجات الطالب</h3>
            {overallAveragePercent !== null ? (
              <>
                <div className="text-5xl font-black text-[#0F7B4F] py-1">{overallAveragePercent}٪</div>
                <div className="text-base font-bold text-[#1A1A1A]">
                  {overallStatusBadge ? `${overallAveragePercent}٪ — يعني ${overallStatusBadge.label}` : `${overallAveragePercent}٪`}
                </div>
              </>
            ) : (
              <div className="py-4 text-base text-gray-500 font-bold">لا توجد درجات مسجلة بعد</div>
            )}
          </div>

          {/* Homework card */}
          <div className="newspaper-box bg-white border-2 border-[#1A1A1A] p-5 rounded-xl text-center space-y-1">
            <h3 className="text-sm font-sans font-bold text-gray-700">إجمالي الواجبات والتطبيقات</h3>
            <div className="text-5xl font-black text-[#1A1A1A] py-1">
              {homeworkStats.completed + homeworkStats.pending}
            </div>
            <div className="text-base font-bold text-gray-800">
              {homeworkStats.completed} مُكتمل · {homeworkStats.pending} في الانتظار
            </div>
          </div>
        </section>

        {/* 4. EXAM RESULTS (نتائج الامتحانات) */}
        {recentExams && recentExams.length > 0 && (
          <section className="newspaper-box bg-white border-2 border-[#1A1A1A] p-5 sm:p-6 rounded-xl space-y-4">
            <div className="flex items-center justify-between border-b-2 border-[#1A1A1A] pb-2">
              <h2 className="text-xl font-black text-[#1A1A1A]">نتائج الامتحانات والاختبارات</h2>
              <span className="text-xs font-sans font-bold text-gray-700">عدد {recentExams.length} اختبارات</span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-right text-base border-collapse">
                <thead>
                  <tr className="border-b-2 border-[#1A1A1A] text-gray-800 font-bold">
                    <th className="py-2.5 px-3">اسم الاختبار</th>
                    <th className="py-2.5 px-3 text-center">الدرجة</th>
                    <th className="py-2.5 px-3 text-center">النسبة</th>
                    <th className="py-2.5 px-3 text-center">التقييم</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-300">
                  {recentExams.map((ex, idx) => (
                    <tr key={idx} className="hover:bg-[#FBF8F1]">
                      <td className="py-3 px-3 font-bold text-[#1A1A1A]">{ex.title}</td>
                      <td className="py-3 px-3 text-center font-mono font-bold text-gray-800" dir="ltr">
                        {ex.percent == null ? "—" : `${ex.score} / ${ex.maxScore}`}
                      </td>
                      <td className="py-3 px-3 text-center font-mono font-bold text-[#0F7B4F]">
                        {ex.percent == null ? "—" : `${ex.percent}٪`}
                      </td>
                      <td className="py-3 px-3 text-center">
                        {ex.percent == null ? (
                          <span className="text-amber-700 font-bold" title={ex.pendingEssays ? `${ex.pendingEssays} سؤال مقالي بانتظار تصحيح المعلم` : undefined}>
                            ⏳ يتم المراجعة
                          </span>
                        ) : ex.percent >= 85 ? (
                          <span className="text-[#0F7B4F] font-bold">ممتاز</span>
                        ) : ex.percent >= 65 ? (
                          <span className="text-amber-700 font-bold">مقبول</span>
                        ) : (
                          <span className="text-[#B3261E] font-bold">ضعيف</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* 5. HOMEWORK TRACKING (الواجبات) */}
        <section className="newspaper-box bg-white border-2 border-[#1A1A1A] p-5 rounded-xl space-y-3">
          <h2 className="text-xl font-black text-[#1A1A1A] border-b-2 border-[#1A1A1A] pb-2">متابعة الواجبات</h2>
          <div className="grid grid-cols-2 gap-3 text-center">
            <div className="bg-[#FBF8F1] border border-gray-300 p-3 rounded-lg">
              <p className="text-xs font-sans font-bold text-gray-700">الواجبات المسلّمة</p>
              <p className="text-3xl font-black text-[#0F7B4F] mt-1">{homeworkStats.completed}</p>
            </div>
            <div className="bg-[#FBF8F1] border border-gray-300 p-3 rounded-lg">
              <p className="text-xs font-sans font-bold text-gray-700">في انتظار التسليم</p>
              <p className="text-3xl font-black text-amber-700 mt-1">{homeworkStats.pending}</p>
            </div>
          </div>
        </section>

        {/* 6. SUBSCRIPTIONS & PAYMENTS (الاشتراكات والمدفوعات) */}
        {subscriptions && subscriptions.length > 0 && (
          <section className="newspaper-box bg-white border-2 border-[#1A1A1A] p-5 sm:p-6 rounded-xl space-y-4">
            <h2 className="text-xl font-black text-[#1A1A1A] border-b-2 border-[#1A1A1A] pb-2">الاشتراكات والمدفوعات</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-right text-base border-collapse">
                <thead>
                  <tr className="border-b-2 border-[#1A1A1A] text-gray-800 font-bold">
                    <th className="py-2.5 px-3">المعلم</th>
                    <th className="py-2.5 px-3">نوع الاشتراك</th>
                    <th className="py-2.5 px-3 text-center">التاريخ</th>
                    <th className="py-2.5 px-3 text-center">المبلغ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-300">
                  {subscriptions.map((sub) => (
                    <tr key={sub.id} className="hover:bg-[#FBF8F1]">
                      <td className="py-3 px-3 font-bold text-[#1A1A1A]">{sub.teacherName}</td>
                      <td className="py-3 px-3 text-gray-800">{sub.planLabel}</td>
                      <td className="py-3 px-3 text-center font-mono text-xs text-gray-700">{sub.createdAt}</td>
                      <td className="py-3 px-3 text-center font-bold text-[#0F7B4F]">{sub.amount} جنيه</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="border-t-2 border-[#1A1A1A] pt-3 text-left font-bold text-lg text-[#1A1A1A]">
              إجمالي المدفوع: <span className="text-[#0F7B4F] font-black">{totalPaid} جنيه</span>
            </div>
          </section>
        )}

        {/* 7. TEACHER NOTES (كلام المدرس) */}
        <section className="newspaper-box bg-white border-2 border-[#1A1A1A] p-5 sm:p-6 rounded-xl space-y-3">
          <h2 className="text-xl font-black text-[#1A1A1A] border-b-2 border-[#1A1A1A] pb-2">ملاحظات المعلم</h2>
          {teacherNotes && teacherNotes.length > 0 ? (
            <div className="space-y-4">
              {teacherNotes.map((note, idx) => (
                <blockquote key={idx} className="bg-[#FBF8F1] border-s-4 border-[#0F7B4F] p-4 rounded-e-xl space-y-1">
                  <div className="flex items-center justify-between text-xs font-sans font-bold text-gray-700">
                    <span>{note.teacherName}</span>
                    <span className="font-mono text-gray-500">{note.date}</span>
                  </div>
                  <p className="text-lg text-[#1A1A1A] font-bold leading-relaxed">«{note.content}»</p>
                </blockquote>
              ))}
            </div>
          ) : (
            <p className="text-base text-gray-600 py-4 text-center font-bold">
              لسه مفيش ملاحظات مكتوبة من المدرس.
            </p>
          )}
        </section>

        {/* 8. CONTACT BUTTONS (التواصل) — Min 56px Tall */}
        <section className="no-print space-y-3 pt-4">
          {primaryTeacherPhone && (
            <a
              href={`https://wa.me/${primaryTeacherPhone.replace(/\+/g, "")}`}
              target="_blank"
              rel="noreferrer"
              className="w-full min-h-[56px] rounded-xl bg-[#0F7B4F] hover:bg-[#0b5f3d] text-white font-bold text-lg flex items-center justify-center gap-2 shadow-md transition-colors no-underline cursor-pointer"
            >
              💬 كلّم المدرس عبر الواتساب
            </a>
          )}

          <button
            onClick={() => window.print()}
            className="w-full min-h-[56px] rounded-xl bg-[#1A1A1A] hover:bg-gray-800 text-white font-bold text-lg flex items-center justify-center gap-2 shadow-md transition-colors cursor-pointer"
          >
            🖨️ طباعة التقرير (نسخة ورقية)
          </button>
        </section>

      </div>
    </div>
  );
}
