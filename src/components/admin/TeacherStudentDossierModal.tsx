"use client";

import { useEffect, useMemo, useState } from "react";
import { StudentPhoneActions } from "@/components/admin/StudentPhoneActions";
import { EDUCATIONAL_STAGES } from "@/types";

type HwStatus = string;

type HomeworkRow = {
  id: string;
  title: string;
  type: string;
  dueAt: string | null;
  isPublished: boolean;
  videoId: string | null;
  submitted: boolean;
  status?: HwStatus;
  score?: number | null;
  totalQ?: number | null;
  completedAt?: string | null;
  fileName?: string | null;
  submissionId?: string | null;
  allowRetake?: boolean;
  reviewVerdict?: string | null;
  reviewNote?: string | null;
  reviewedAt?: string | null;
  contentChanged?: boolean;
};

type QuizRow = {
  id: string;
  title: string;
  timeLimitMinutes: number;
  taken: boolean;
  score?: number | null;
  totalQ?: number | null;
  pendingEssays?: number;
  completedAt?: string | null;
  allowRetake?: boolean;
  gradeRequests?: Array<{
    status: string;
    currentScore: number;
    requestedScore: number | null;
    reason: string;
    createdAt: string;
  }>;
};

type VideoRow = {
  id: string;
  title: string;
  durationMinutes: number;
  maxWatchesPerUser: number;
  publishAt: string | null;
  opened: boolean;
  watched: boolean;
  watchedAt: string | null;
  lastWatchedAt: string | null;
  lastPositionSeconds: number;
  watchedSecondsTotal: number;
  percent: number;
  watchCount: number;
  extraViewRequests: Array<{ status: string; grantedViews: number; createdAt: string }>;
  inVideoQuestions: Array<{
    id: string;
    questionText: string;
    questionType: string;
    triggerSecond: number;
    answered: boolean;
    isCorrect: boolean | null;
    status: string | null;
    answeredAt: string | null;
  }>;
  homeworks: HomeworkRow[];
};

type FolderRow = {
  id: string;
  name: string;
  order: number;
  publishAt: string | null;
  videos: VideoRow[];
  quizzes: QuizRow[];
  homeworks: HomeworkRow[];
};

type Dossier = {
  student: {
    id: string;
    name: string;
    email: string;
    phone: string | null;
    parentPhone: string | null;
    educationalStage: string | null;
    isActive: boolean;
    lastLoginAt: string | null;
    createdAt: string;
    loginStreak: number;
    deviceCount: number;
  };
  course: { id: string; title: string };
  access: Array<{
    code: string;
    isActive: boolean;
    accessType: string;
    usedAt: string | null;
    folder: { name: string } | null;
    video: { title: string } | null;
  }>;
  summary: {
    videosTotal: number;
    videosOpened: number;
    videosWatched: number;
    quizzesTotal: number;
    quizzesTaken: number;
    homeworkTotal: number;
    homeworkSubmitted: number;
    homeworkPassed: number;
  };
  folders: FolderRow[];
  courseHomeworks: HomeworkRow[];
  permissions: { phones: boolean; quizzes: boolean; homework: boolean };
  error?: string;
};

type Filter = "all" | "lectures" | "homework" | "exams";

function fmtDate(d: string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleString("ar-EG", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fmtClock(seconds: number) {
  const s = Math.max(0, Math.floor(seconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
}

function stageLabel(value: string | null) {
  if (!value) return "—";
  return EDUCATIONAL_STAGES.find((s) => s.value === value)?.label ?? value;
}

function hwTypeLabel(type: string) {
  if (type === "exam") return "امتحان";
  if (type === "upload") return "رفع ملف";
  if (type === "terminal") return "تيرمينال";
  if (type === "link") return "رابط";
  return type;
}

function hwStatus(row: HomeworkRow) {
  if (!row.submitted) {
    return { text: "لم يسلّم", cls: "bg-slate-500/12 text-slate-500" };
  }
  if (row.contentChanged) {
    return { text: "المحتوى اتغيّر بعد الموافقة", cls: "bg-rose-500/15 text-rose-500" };
  }
  if (row.allowRetake) return { text: "مسموح إعادة المحاولة", cls: "bg-sky-500/15 text-sky-600" };
  if (row.status === "passed") return { text: "تم الحل — مقبول", cls: "bg-emerald-500/15 text-emerald-600" };
  if (row.status === "failed") return { text: "تم التسليم — مرفوض", cls: "bg-rose-500/15 text-rose-500" };
  if (row.status === "review_requested") return { text: "في انتظار المراجعة", cls: "bg-amber-500/15 text-amber-600" };
  if (row.status === "pending" || row.status === "submitted") {
    return { text: "اتسلّم — قيد التصحيح", cls: "bg-sky-500/15 text-sky-600" };
  }
  return { text: "اتسلّم", cls: "bg-sky-500/15 text-sky-600" };
}

function lectureStatus(v: VideoRow) {
  if (v.watched) return { text: "أفرج على المحاضرة كاملة", cls: "text-emerald-600" };
  if (v.opened) return { text: "فتح المحاضرة وما كملهاش", cls: "text-amber-600" };
  return { text: "ما فتحش المحاضرة", cls: "text-[var(--ink-muted)]" };
}

function accessLabel(a: Dossier["access"][number]) {
  if (a.accessType === "FOLDER" && a.folder) return `مجلد: ${a.folder.name}`;
  if (a.accessType === "VIDEO" && a.video) return `محاضرة: ${a.video.title}`;
  return "الكورس كامل";
}

export function TeacherStudentDossierModal({
  studentId,
  courseId,
  onClose,
}: {
  studentId: string;
  courseId: string;
  onClose: () => void;
}) {
  const [data, setData] = useState<Dossier | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [openFolders, setOpenFolders] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError("");
    fetch(`/api/admin/students/${encodeURIComponent(studentId)}/dossier?courseId=${encodeURIComponent(courseId)}`, {
      credentials: "include",
    })
      .then(async (res) => {
        const json = (await res.json()) as Dossier;
        if (!alive) return;
        if (!res.ok) {
          setError(json.error || "تعذر جلب تقرير الطالب");
          return;
        }
        setData(json);
        const initial: Record<string, boolean> = {};
        for (const f of json.folders) initial[f.id] = true;
        setOpenFolders(initial);
      })
      .catch(() => {
        if (alive) setError("تعذر الاتصال بالخادم");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [studentId, courseId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const summaryBits = useMemo(() => {
    if (!data) return [];
    const s = data.summary;
    return [
      { label: "محاضرات اكتملت", value: `${s.videosWatched} / ${s.videosTotal}` },
      { label: "محاضرات اتفتحت", value: `${s.videosOpened} / ${s.videosTotal}` },
      { label: "واجبات اتسلّمت", value: `${s.homeworkSubmitted} / ${s.homeworkTotal}` },
      { label: "واجبات مقبولة", value: `${s.homeworkPassed} / ${s.homeworkTotal}` },
      { label: "امتحانات", value: `${s.quizzesTaken} / ${s.quizzesTotal}` },
    ];
  }, [data]);

  return (
    <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center" dir="rtl">
      <button
        type="button"
        aria-label="إغلاق"
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative z-10 flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-t-3xl sm:rounded-3xl border border-[var(--border)] bg-[var(--surface)] shadow-2xl">
        <header className="shrink-0 border-b border-[var(--border)] px-4 py-3 sm:px-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[11px] font-bold text-[var(--ink-muted)]">تقرير الطالب في الكورس</p>
              <h2 className="mt-0.5 truncate text-base font-black text-[var(--ink)]">
                {data?.student.name || "جارٍ التحميل..."}
              </h2>
              <p className="truncate text-xs text-[var(--ink-muted)]">{data?.course.title}</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[var(--surface-muted)] text-lg font-black text-[var(--ink)]"
            >
              ✕
            </button>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5 space-y-4">
          {loading && <p className="py-16 text-center text-sm text-[var(--ink-muted)]">بنجهّز تقرير الطالب...</p>}
          {error && (
            <div className="rounded-2xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-600">
              {error}
            </div>
          )}

          {data && (
            <>
              <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface-muted)] p-4 space-y-3">
                <p className="text-xs text-[var(--ink-muted)] truncate" dir="ltr">
                  {data.student.email}
                </p>
                <div className="flex flex-wrap gap-2 text-[11px] font-bold">
                  <span
                    className={`rounded-full px-2 py-1 ${
                      data.student.isActive ? "bg-emerald-500/15 text-emerald-600" : "bg-rose-500/10 text-rose-500"
                    }`}
                  >
                    {data.student.isActive ? "حساب نشط" : "حساب موقوف"}
                  </span>
                  <span className="rounded-full bg-[var(--surface)] px-2 py-1 text-[var(--ink-muted)]">
                    المرحلة: {stageLabel(data.student.educationalStage)}
                  </span>
                  <span className="rounded-full bg-[var(--surface)] px-2 py-1 text-[var(--ink-muted)]">
                    آخر دخول: {fmtDate(data.student.lastLoginAt)}
                  </span>
                  <span className="rounded-full bg-[var(--surface)] px-2 py-1 text-[var(--ink-muted)]">
                    سلسلة حضور: {data.student.loginStreak} يوم
                  </span>
                  <span className="rounded-full bg-[var(--surface)] px-2 py-1 text-[var(--ink-muted)]">
                    أجهزة مسجّلة: {data.student.deviceCount}
                  </span>
                </div>
                <StudentPhoneActions phone={data.student.phone} />
                {data.student.parentPhone && (
                  <div>
                    <p className="mb-1 text-[11px] font-bold text-[var(--ink-muted)]">رقم ولي الأمر</p>
                    <StudentPhoneActions phone={data.student.parentPhone} />
                  </div>
                )}
                {data.access.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-[11px] font-bold text-[var(--ink-muted)]">نوع الوصول</p>
                    {data.access.map((a) => (
                      <p key={a.code} className="text-xs text-[var(--ink)]">
                        {accessLabel(a)} — {a.isActive ? "ساري" : "موقوف"}
                        {a.usedAt ? ` · من ${fmtDate(a.usedAt)}` : ""}
                      </p>
                    ))}
                  </div>
                )}
              </section>

              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                {summaryBits.map((b) => (
                  <div key={b.label} className="rounded-2xl border border-[var(--border)] p-3">
                    <p className="text-[10px] font-bold text-[var(--ink-muted)]">{b.label}</p>
                    <p className="mt-1 text-sm font-black text-[var(--ink)]">{b.value}</p>
                  </div>
                ))}
              </div>

              <div className="flex gap-2 overflow-x-auto pb-1">
                {(
                  [
                    ["all", "الكل"],
                    ["lectures", "المحاضرات"],
                    ["homework", "الواجبات"],
                    ["exams", "الامتحانات"],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setFilter(id)}
                    className={`min-h-11 shrink-0 rounded-2xl px-4 text-xs font-black ${
                      filter === id
                        ? "bg-sky-500 text-white"
                        : "bg-[var(--surface-muted)] text-[var(--ink)]"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {data.courseHomeworks.length > 0 && filter !== "lectures" && filter !== "exams" && (
                <section className="space-y-2">
                  <h3 className="text-sm font-black">واجبات على مستوى الكورس</h3>
                  {data.courseHomeworks.map((h) => (
                    <HomeworkCard key={h.id} row={h} showDetails={data.permissions.homework} />
                  ))}
                </section>
              )}

              {data.folders.length === 0 ? (
                <p className="rounded-2xl border border-dashed border-[var(--border)] py-10 text-center text-sm text-[var(--ink-muted)]">
                  مفيش مجلدات في الكورس ده
                </p>
              ) : (
                data.folders.map((folder) => {
                  const showLectures = filter === "all" || filter === "lectures";
                  const showHw = filter === "all" || filter === "homework";
                  const showExams = filter === "all" || filter === "exams";
                  const visible =
                    (showLectures && folder.videos.length > 0) ||
                    (showHw && (folder.homeworks.length > 0 || folder.videos.some((v) => v.homeworks.length > 0))) ||
                    (showExams && folder.quizzes.length > 0);
                  if (!visible) return null;

                  const watchedInFolder = folder.videos.filter((v) => v.watched).length;
                  const hwInFolder = [
                    ...folder.homeworks,
                    ...folder.videos.flatMap((v) => v.homeworks),
                  ];
                  const examsTaken = folder.quizzes.filter((q) => q.taken).length;

                  return (
                    <section key={folder.id} className="overflow-hidden rounded-3xl border border-[var(--border)]">
                      <button
                        type="button"
                        onClick={() => setOpenFolders((prev) => ({ ...prev, [folder.id]: !prev[folder.id] }))}
                        className="flex w-full items-center justify-between gap-3 bg-[var(--surface-muted)] px-4 py-3 text-right"
                      >
                        <div className="min-w-0">
                          <p className="truncate font-black text-[var(--ink)]">{folder.name}</p>
                          <p className="mt-0.5 text-[11px] text-[var(--ink-muted)]">
                            محاضرات {watchedInFolder}/{folder.videos.length} · واجبات{" "}
                            {hwInFolder.filter((h) => h.submitted).length}/{hwInFolder.length} · امتحانات {examsTaken}/
                            {folder.quizzes.length}
                          </p>
                        </div>
                        <span className="text-xs font-black text-[var(--ink-muted)]">
                          {openFolders[folder.id] ? "إخفاء" : "عرض"}
                        </span>
                      </button>

                      {openFolders[folder.id] && (
                        <div className="space-y-3 p-3 sm:p-4">
                          {showLectures &&
                            folder.videos.map((v) => {
                              const st = lectureStatus(v);
                              return (
                                <article key={v.id} className="rounded-2xl border border-[var(--border)] p-3 space-y-2">
                                  <div className="flex items-start justify-between gap-2">
                                    <div className="min-w-0">
                                      <p className="font-black text-sm text-[var(--ink)]">{v.title}</p>
                                      <p className={`text-[11px] font-bold ${st.cls}`}>{st.text}</p>
                                    </div>
                                    <span className="shrink-0 text-[11px] font-black text-sky-600">{v.percent}%</span>
                                  </div>
                                  <div className="h-1.5 overflow-hidden rounded-full bg-[var(--surface-muted)]">
                                    <div
                                      className="h-full rounded-full bg-sky-500"
                                      style={{ width: `${v.percent}%` }}
                                    />
                                  </div>
                                  <p className="text-[11px] text-[var(--ink-muted)] leading-relaxed">
                                    مشاهدات مستهلكة: {v.watchCount} / {v.maxWatchesPerUser}
                                    {v.durationMinutes > 0 ? ` · مدة المحاضرة ${v.durationMinutes} د` : ""}
                                    {v.opened
                                      ? ` · وصل لـ ${fmtClock(v.lastPositionSeconds)} · وقت مشاهدة فعلي ${fmtClock(v.watchedSecondsTotal)}`
                                      : ""}
                                    {v.lastWatchedAt ? ` · آخر مشاهدة ${fmtDate(v.lastWatchedAt)}` : ""}
                                  </p>
                                  {v.extraViewRequests.length > 0 && (
                                    <p className="text-[11px] font-bold text-amber-600">
                                      طلبات مشاهدات إضافية:{" "}
                                      {v.extraViewRequests
                                        .map((r) => `${r.status}${r.grantedViews ? ` (+${r.grantedViews})` : ""}`)
                                        .join("، ")}
                                    </p>
                                  )}
                                  {v.inVideoQuestions.length > 0 && (
                                    <div className="rounded-xl bg-[var(--surface-muted)] p-2 space-y-1">
                                      <p className="text-[11px] font-black">أسئلة جوه الفيديو</p>
                                      {v.inVideoQuestions.map((q) => (
                                        <p key={q.id} className="text-[11px] text-[var(--ink)]">
                                          عند {fmtClock(q.triggerSecond)} — {q.answered ? "جاوب" : "ما جاوبش"}
                                          {q.answered && q.isCorrect != null
                                            ? q.isCorrect
                                              ? " · صح"
                                              : " · غلط"
                                            : ""}
                                          {q.status && q.status !== "APPROVED" ? ` · ${q.status}` : ""}
                                        </p>
                                      ))}
                                    </div>
                                  )}
                                  {showHw &&
                                    v.homeworks.map((h) => (
                                      <HomeworkCard key={h.id} row={h} showDetails={data.permissions.homework} nested />
                                    ))}
                                </article>
                              );
                            })}

                          {showHw &&
                            folder.homeworks.map((h) => (
                              <HomeworkCard key={h.id} row={h} showDetails={data.permissions.homework} />
                            ))}

                          {showExams &&
                            folder.quizzes.map((q) => (
                              <article key={q.id} className="rounded-2xl border border-[var(--border)] p-3 space-y-1">
                                <p className="text-sm font-black">{q.title}</p>
                                {q.taken ? (
                                  <p className={`text-[11px] font-bold ${(q.pendingEssays ?? 0) > 0 ? "text-amber-600" : "text-emerald-600"}`}>
                                    امتحن
                                    {data.permissions.quizzes
                                      ? (q.pendingEssays ?? 0) > 0
                                        ? ` — ⏳ يتم المراجعة (${q.pendingEssays} مقالي بانتظار التصحيح)`
                                        : q.score != null && q.totalQ != null
                                          ? ` — الدرجة ${q.score}%`
                                          : ""
                                      : ""}
                                    {q.completedAt ? ` · ${fmtDate(q.completedAt)}` : ""}
                                    {q.allowRetake ? " · مسموح إعادة" : ""}
                                  </p>
                                ) : (
                                  <p className="text-[11px] font-bold text-slate-500">ما امتحنش</p>
                                )}
                                {q.gradeRequests && q.gradeRequests.length > 0 && (
                                  <p className="text-[11px] text-amber-600">
                                    طلبات تعديل درجة:{" "}
                                    {q.gradeRequests.map((g) => `${g.status}`).join("، ")}
                                  </p>
                                )}
                              </article>
                            ))}
                        </div>
                      )}
                    </section>
                  );
                })
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function HomeworkCard({
  row,
  showDetails,
  nested = false,
}: {
  row: HomeworkRow;
  showDetails: boolean;
  nested?: boolean;
}) {
  const [allowRetake, setAllowRetake] = useState(!!row.allowRetake);
  const [retrying, setRetrying] = useState(false);
  const [retryError, setRetryError] = useState("");
  const st = hwStatus({ ...row, allowRetake });
  const canToggleRetry =
    showDetails &&
    !!row.submissionId &&
    (row.status === "passed" || row.status === "failed");

  const toggleRetry = async () => {
    if (!row.submissionId) return;
    setRetrying(true);
    setRetryError("");
    const next = !allowRetake;
    try {
      const res = await fetch(`/api/homework/${encodeURIComponent(row.id)}/retry`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ submissionId: row.submissionId, allowRetake: next }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setRetryError(data.error || "تعذر تحديث إعادة المحاولة");
        return;
      }
      setAllowRetake(next);
    } catch {
      setRetryError("تعذر تحديث إعادة المحاولة");
    } finally {
      setRetrying(false);
    }
  };

  return (
    <article
      className={`rounded-2xl border p-3 space-y-1 ${
        row.contentChanged ? "border-rose-400 bg-rose-50/40" : "border-[var(--border)]"
      } ${nested ? "bg-[var(--surface-muted)]" : ""}`}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-black">
          واجب{nested ? " على المحاضرة" : ""}: {row.title}
        </p>
        <span className="shrink-0 text-[10px] font-bold text-[var(--ink-muted)]">{hwTypeLabel(row.type)}</span>
      </div>
      <p className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-black ${st.cls}`}>{st.text}</p>
      {showDetails && row.submitted && (
        <p className="text-[11px] text-[var(--ink-muted)] leading-relaxed">
          {row.score != null && row.totalQ != null ? `درجة ${row.score} من ${row.totalQ} · ` : ""}
          {row.completedAt ? `التسليم ${fmtDate(row.completedAt)}` : ""}
          {row.fileName ? ` · الملف ${row.fileName}` : ""}
          {row.reviewVerdict ? ` · مراجعة المدرّس: ${row.reviewVerdict === "passed" ? "قبول" : "رفض"}` : ""}
          {row.reviewNote ? ` · ملاحظة: ${row.reviewNote}` : ""}
        </p>
      )}
      {row.dueAt && (
        <p className="text-[10px] text-[var(--ink-muted)]">آخر موعد: {fmtDate(row.dueAt)}</p>
      )}
      {canToggleRetry && (
        <button
          type="button"
          onClick={() => void toggleRetry()}
          disabled={retrying}
          className={`mt-1 w-full min-h-10 rounded-xl text-[11px] font-black disabled:opacity-50 ${
            allowRetake
              ? "bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200"
              : "bg-sky-600 text-white"
          }`}
        >
          {retrying
            ? "جارٍ..."
            : allowRetake
              ? "🔒 إلغاء إعادة المحاولة"
              : "🔓 السماح بإعادة المحاولة"}
        </button>
      )}
      {retryError && <p className="text-[11px] font-bold text-rose-500">{retryError}</p>}
    </article>
  );
}

export function StudentDossierButton({
  studentId,
  courseId,
}: {
  studentId: string;
  courseId: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full min-h-11 px-2.5 text-xs font-black rounded-xl text-indigo-600 bg-indigo-500/12"
      >
        تقرير الطالب
      </button>
      {open && (
        <TeacherStudentDossierModal studentId={studentId} courseId={courseId} onClose={() => setOpen(false)} />
      )}
    </>
  );
}
