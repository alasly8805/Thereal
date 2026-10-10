"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { StudentReportsLinks } from "@/components/AssistantSidebar";
import { CopyStudentReport } from "@/components/CopyStudentReport";

function formatWhen(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("ar-EG", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function Shell({
  title,
  backHref,
  children,
}: {
  title: string;
  backHref: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--ink)]" dir="rtl" style={{ fontFamily: "var(--font-body)" }}>
      <header className="sticky top-0 z-30 border-b border-[var(--border)] bg-[var(--surface)]/95 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3">
          <div>
            <p className="text-base font-black" style={{ fontFamily: "var(--font-head)" }}>
              {title}
            </p>
          </div>
          <Link href={backHref} className="text-sm font-bold text-[var(--ink-3)]">
            رجوع
          </Link>
        </div>
        <div className="mx-auto grid max-w-3xl grid-cols-2 gap-2 px-4 pb-3">
          <StudentReportsLinks />
        </div>
      </header>
      <main className="mx-auto max-w-3xl space-y-4 px-4 py-5">{children}</main>
    </div>
  );
}

type StudentRow = {
  id: string;
  name: string;
  code?: string | null;
  referralCode?: string | null;
  phone?: string | null;
  parentPhone?: string | null;
  email: string | null;
  educationalStage: string | null;
  isActive: boolean;
  lastLoginAt: string | null;
  courses: Array<{ id: string; title: string }>;
};

export function TeacherStudentsListPage({
  embedded = false,
  onOpenStudent,
}: {
  embedded?: boolean;
  onOpenStudent?: (id: string) => void;
} = {}) {
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/teacher/students", { credentials: "include" })
      .then((r) => r.json())
      .then((data) => {
        if (data.error) setError(data.error);
        else setStudents(data.students || []);
      })
      .catch(() => setError("تعذر تحميل الطلاب"))
      .finally(() => setLoading(false));
  }, []);

  const body = (
    <>
      {error && (
        <div className="rounded-2xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-600">
          {error}
        </div>
      )}
      {loading ? (
        <p className="py-10 text-center text-sm text-[var(--ink-3)]">جارٍ التحميل...</p>
      ) : students.length === 0 ? (
        <p className="rounded-3xl border border-dashed border-[var(--border)] py-12 text-center text-sm text-[var(--ink-3)]">
          مفيش طلاب مسجّلين
        </p>
      ) : (
        <ul className="space-y-3">
          {students.map((s) => (
            <li key={s.id}>
              <Link
                href={onOpenStudent ? "#students" : `/teacher/students/${s.id}`}
                onClick={
                  onOpenStudent
                    ? (event) => {
                        event.preventDefault();
                        onOpenStudent(s.id);
                      }
                    : undefined
                }
                className="block rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-sm"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-base font-black">{s.name}</p>
                    <p className="mt-1 truncate text-xs text-[var(--ink-3)]">{s.email}</p>
                    <p className="mt-1 text-[11px] text-[var(--ink-3)]">
                      {s.courses.length} كورس · آخر دخول {formatWhen(s.lastLoginAt)}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                    <CopyStudentReport student={s} />
                    <span
                      className={`shrink-0 rounded-full px-2 py-1 text-[11px] font-black ${
                        s.isActive ? "bg-emerald-500/15 text-emerald-600" : "bg-rose-500/10 text-rose-500"
                      }`}
                    >
                      {s.isActive ? "نشط" : "موقوف"}
                    </span>
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );

  if (embedded) return <div className="space-y-4">{body}</div>;
  return (
    <Shell title="الطلاب" backHref="/adminpanel/assistant">
      {body}
    </Shell>
  );
}

type ReportRow = StudentRow & {
  noActiveCourse?: boolean;
  homeworkSubmitted: number;
  homeworkTotal: number;
  quizzesTaken: number;
  quizAverage: number | null;
  videosWatched: number;
  videosTotal: number;
};

export function TeacherReportsPage({
  embedded = false,
  onOpenStudent,
}: {
  embedded?: boolean;
  onOpenStudent?: (id: string) => void;
} = {}) {
  const [rows, setRows] = useState<ReportRow[]>([]);
  const [totals, setTotals] = useState({ students: 0, homeworks: 0, quizzes: 0, videos: 0 });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/teacher/reports", { credentials: "include" })
      .then((r) => r.json())
      .then((data) => {
        if (data.error) setError(data.error);
        else {
          setRows(data.students || []);
          setTotals(data.totals || totals);
        }
      })
      .catch(() => setError("تعذر تحميل التقارير"))
      .finally(() => setLoading(false));
  }, []);

  const body = (
    <>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="الطلاب" value={totals.students} />
        <Stat label="الواجبات" value={totals.homeworks} />
        <Stat label="الاختبارات" value={totals.quizzes} />
        <Stat label="الحصص" value={totals.videos} />
      </div>
      {error && (
        <div className="rounded-2xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-600">
          {error}
        </div>
      )}
      {loading ? (
        <p className="py-10 text-center text-sm text-[var(--ink-3)]">جارٍ التحميل...</p>
      ) : rows.length === 0 ? (
        <p className="rounded-3xl border border-dashed border-[var(--border)] py-12 text-center text-sm text-[var(--ink-3)]">
          مفيش تقارير لسه
        </p>
      ) : (
        <ul className="space-y-3">
          {rows.map((s) => (
            <li key={s.id}>
              <Link
                href={onOpenStudent ? "#students" : `/teacher/students/${s.id}`}
                onClick={
                  onOpenStudent
                    ? (event) => {
                        event.preventDefault();
                        onOpenStudent(s.id);
                      }
                    : undefined
                }
                className="block rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-sm"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-black">{s.name}</p>
                    {s.noActiveCourse ? (
                      <p className="mt-2 text-xs font-bold text-amber-600">لا يوجد كورس مفعل</p>
                    ) : (
                      <p className="mt-2 text-xs leading-6 text-[var(--ink-3)]">
                        الكورس المفعل: {s.courses.map((c) => c.title).join(" · ") || "—"}
                        <br />
                        واجبات {s.homeworkSubmitted}/{s.homeworkTotal} · اختبارات {s.quizzesTaken}
                        {s.quizAverage != null ? ` · متوسط ${s.quizAverage}%` : ""} · حضور {s.videosWatched}/
                        {s.videosTotal}
                      </p>
                    )}
                  </div>
                  <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
                    <CopyStudentReport student={s} />
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );

  if (embedded) return <div className="space-y-4">{body}</div>;
  return (
    <Shell title="التقارير" backHref="/adminpanel/assistant">
      {body}
    </Shell>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-3 py-3 text-center">
      <p className="text-lg font-black">{value}</p>
      <p className="text-[11px] font-bold text-[var(--ink-3)]">{label}</p>
    </div>
  );
}

type StudentReport = {
  student: {
    id: string;
    name: string;
    email: string | null;
    phone: string | null;
    educationalStage: string | null;
    isActive: boolean;
    lastLoginAt: string | null;
    loginStreak: number;
  };
  courses: Array<{ id: string; title: string }>;
  activeCourses?: Array<{ id: string; title: string }>;
  noActiveCourse?: boolean;
  message?: string | null;
  summary: {
    courses: number;
    homeworkTotal: number;
    homeworkSubmitted: number;
    quizzesTaken: number;
    quizAverage: number | null;
    videosOpened: number;
    videosWatched: number;
  };
  homework: Array<{
    id: string;
    title: string;
    type: string;
    dueAt: string | null;
    submitted: boolean;
    status: string;
    score: number | null;
    totalQ: number | null;
  }>;
  grades: Array<{
    quizId: string;
    title: string;
    courseTitle: string | null;
    score: number;
    totalQ: number;
    percent: number;
    completedAt: string | null;
  }>;
  attendance: Array<{
    videoId: string;
    title: string;
    folder: string;
    courseTitle: string;
    watched: boolean;
    percent: number;
    lastWatchedAt: string | null;
  }>;
};

export function TeacherStudentReportPage({
  studentId,
  embedded = false,
  onBack,
}: {
  studentId: string;
  embedded?: boolean;
  onBack?: () => void;
}) {
  const router = useRouter();
  const [report, setReport] = useState<StudentReport | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/teacher/students/${encodeURIComponent(studentId)}`, { credentials: "include" })
      .then((r) => r.json())
      .then((data) => {
        if (data.error) setError(data.error);
        else setReport(data);
      })
      .catch(() => setError("تعذر تحميل تقرير الطالب"))
      .finally(() => setLoading(false));
  }, [studentId]);

  const goBack = () => {
    if (onBack) onBack();
    else router.push("/teacher/students");
  };

  const body = (
    <>
      {embedded && (
        <button type="button" onClick={goBack} className="text-sm font-bold text-[var(--ink-3)]">
          رجوع للطلاب
        </button>
      )}
      {loading && <p className="py-10 text-center text-sm text-[var(--ink-3)]">جارٍ التحميل...</p>}
      {error && (
        <div className="rounded-2xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-600">
          {error}
          <button type="button" className="mt-2 block text-xs" onClick={goBack}>
            رجوع للطلاب
          </button>
        </div>
      )}
      {report && (
        <>
          <section className="rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-lg font-black">{report.student.name}</p>
                <p className="mt-1 text-sm text-[var(--ink-3)]">{report.student.email}</p>
              </div>
              <CopyStudentReport
                student={{
                  ...report.student,
                  ...report,
                  completedVideos: (report.attendance || []).filter((a) => a.watched).map((a) => ({
                    id: a.videoId,
                    title: a.title,
                    courseTitle: a.courseTitle,
                    folderName: a.folder,
                    lastWatchedAt: a.lastWatchedAt,
                  })),
                  watchedCount: report.summary.videosWatched,
                  totalVideos: report.summary.videosOpened,
                  courses: report.activeCourses || report.courses,
                }}
              />
            </div>
            <p className="mt-2 text-xs leading-6 text-[var(--ink-3)]">
              {report.student.educationalStage || "بدون مرحلة"} · آخر دخول {formatWhen(report.student.lastLoginAt)} ·
              ستريك {report.student.loginStreak}
            </p>
            <p className="mt-3 text-sm font-black text-sky-600">
              {report.noActiveCourse
                ? "لا يوجد كورس مفعل"
                : `الكورس المفعل: ${(report.activeCourses || report.courses).map((c) => c.title).join(" · ") || "—"}`}
            </p>
          </section>

          {report.noActiveCourse ? (
            <p className="rounded-3xl border border-dashed border-[var(--border)] py-12 text-center text-sm font-bold text-[var(--ink-3)]">
              {report.message || "لا يوجد كورس مفعل"}
            </p>
          ) : (
            <>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat label="واجبات مسلّمة" value={report.summary.homeworkSubmitted} />
            <Stat label="اختبارات" value={report.summary.quizzesTaken} />
            <Stat label="متوسط الدرجات" value={report.summary.quizAverage ?? 0} />
            <Stat label="حصص حضرت" value={report.summary.videosWatched} />
          </div>

          <Section title="الواجبات">
            {report.homework.length === 0 ? (
              <Empty text="مفيش واجبات" />
            ) : (
              <ul className="space-y-2">
                {report.homework.map((h) => (
                  <li key={h.id} className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-3 py-3">
                    <p className="text-sm font-black">{h.title}</p>
                    <p className="mt-1 text-[11px] text-[var(--ink-3)]">
                      {h.submitted ? `تم التسليم · ${h.status}` : "لم يُسلّم"}
                      {h.score != null ? ` · ${h.score}${h.totalQ ? `/${h.totalQ}` : ""}` : ""}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section title="الدرجات">
            {report.grades.length === 0 ? (
              <Empty text="مفيش درجات اختبارات" />
            ) : (
              <ul className="space-y-2">
                {report.grades.map((g) => (
                  <li key={g.quizId} className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-3 py-3">
                    <p className="text-sm font-black">{g.title}</p>
                    <p className="mt-1 text-[11px] text-[var(--ink-3)]">
                      {g.percent}% ({g.score}/{g.totalQ}) · {g.courseTitle || "كورس"} · {formatWhen(g.completedAt)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section title="الحضور">
            {report.attendance.length === 0 ? (
              <Empty text="مفيش حضور مسجّل" />
            ) : (
              <ul className="space-y-2">
                {report.attendance.map((a) => (
                  <li key={a.videoId} className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-3 py-3">
                    <p className="text-sm font-black">{a.title}</p>
                    <p className="mt-1 text-[11px] text-[var(--ink-3)]">
                      {a.courseTitle} · {a.folder} · {a.percent}% · {formatWhen(a.lastWatchedAt)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Section>
            </>
          )}
        </>
      )}
    </>
  );

  if (embedded) return <div className="space-y-4">{body}</div>;
  return (
    <Shell title={report?.student.name || "تقرير الطالب"} backHref="/teacher/students">
      {body}
    </Shell>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="text-sm font-black">{title}</h2>
      {children}
    </section>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <p className="rounded-2xl border border-dashed border-[var(--border)] py-6 text-center text-xs text-[var(--ink-3)]">
      {text}
    </p>
  );
}
