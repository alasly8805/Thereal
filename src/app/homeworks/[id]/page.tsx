"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Navbar } from "@/components/ui/Navbar";
import { Footer } from "@/components/ui/Footer";
import { useToast } from "@/components/ui/Toast";
import { homeworkUploadNetworkMessage, uploadHomeworkFile } from "@/lib/student-homework-upload";

// ─── Types ───────────────────────────────────────────────────────────────────

type HWQuestion = {
  id: string;
  question: string;
  imageUrl?: string | null;
  optionA: string;
  optionB: string;
  optionC: string;
  optionD: string;
  order: number;
  /** Present only after the attempt is locked (submitted) or for staff. */
  correctAnswer?: string | null;
};

type HWSubmission = {
  id: string;
  status: string;
  score?: number | null;
  totalQ?: number | null;
  submittedOutput?: string | null;
  fileUrl?: string | null;
  fileName?: string | null;
  answers?: string | null;
  completedAt?: string;
  allowRetake?: boolean;
  review?: {
    verdict?: string | null;
    note?: string | null;
    reviewedAt?: string | null;
  } | null;
};

type HomeworkData = {
  id: string;
  title: string;
  description?: string | null;
  type: "link" | "exam" | "terminal" | "upload";
  linkUrl?: string | null;
  expectedOutput?: string | null;
  codeTemplate?: string | null;
  codeLanguage?: string | null;
  allowedFileTypes?: string | null;
  dueAt?: string | null;
  timeLimitMinutes: number;
  isPublished: boolean;
  courseId?: string | null;
  folderId?: string | null;
  videoId?: string | null;
  teacher?: {
    id: string;
    name: string;
    teacherProfile?: { slug: string } | null;
  } | null;
  folder?: {
    id: string;
    name: string;
    courseId: string;
    course?: { id: string; title: string; subject?: string | null } | null;
  } | null;
  video?: { id: string; title: string } | null;
  questions?: HWQuestion[];
  mySubmission?: HWSubmission | null;
};

const OPTION_KEYS = ["A", "B", "C", "D"] as const;

const TYPE_CONFIG = {
  exam: { label: "اختبار اختيارات", icon: "📝", color: "bg-sky-500/10 text-sky-400 border-sky-500/20" },
  terminal: { label: "تمرين برمجي", icon: "💻", color: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" },
  upload: { label: "تسليم ملف", icon: "📎", color: "bg-amber-500/10 text-amber-400 border-amber-500/20" },
  link: { label: "رابط خارجي", icon: "🔗", color: "bg-purple-500/10 text-purple-400 border-purple-500/20" },
};

export default function HomeworkDetailPage() {
  const params = useParams<{ id: string }>();
  const homeworkId = params?.id;
  const router = useRouter();
  const { success: toastSuccess, error: toastError } = useToast();

  const [user, setUser] = useState<{ id?: string; name: string; role: string } | null>(null);
  const [homework, setHomework] = useState<HomeworkData | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [prereqLock, setPrereqLock] = useState<{ title: string; type: string } | null>(null);

  // Form states
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [terminalOutput, setTerminalOutput] = useState("");
  const [userCode, setUserCode] = useState("");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Fetch current user
  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => {
        if (d?.user) setUser(d.user);
        else setUser(null);
      })
      .catch(() => setUser(null));
  }, []);

  // Fetch homework data. `silent` skips the full-page spinner (used for the
  // post-submit refetch, where the result panel is already on screen).
  const loadHomework = useCallback(async (silent = false) => {
    if (!homeworkId) return;
    if (!silent) setLoading(true);
    setErrorMsg(null);
    setPrereqLock(null);

    try {
      const res = await fetch(`/api/homework/${homeworkId}`);
      const data = await res.json();

      if (!res.ok) {
        if (res.status === 401) {
          router.push(`/login?redirect=/homeworks/${homeworkId}`);
          return;
        }
        if (data.code === "PREREQUISITE_LOCKED") {
          setPrereqLock(data.requiredItem || { title: "الدرس السابق", type: "VIDEO" });
          return;
        }
        throw new Error(data.error || "تعذر تحميل الواجب");
      }

      const hw: HomeworkData = data.homework;
      setHomework(hw);

      if (hw.codeTemplate) {
        setUserCode(hw.codeTemplate);
      }
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "حدث خطأ أثناء تحميل الواجب");
    } finally {
      if (!silent) setLoading(false);
    }
  }, [homeworkId, router]);

  useEffect(() => {
    loadHomework();
  }, [loadHomework]);

  // Derived information
  const course = homework?.folder?.course;
  const courseId = homework?.folder?.courseId || homework?.courseId;
  const teacher = homework?.teacher;
  const questions = homework?.questions || [];
  const answeredCount = useMemo(() => Object.keys(answers).length, [answers]);
  const isAllAnswered = questions.length > 0 && answeredCount === questions.length;
  const mySub = homework?.mySubmission;
  const canResubmitRejectedPdf = homework?.type === "upload" && mySub?.status === "failed";
  const canSubmit = !mySub || !!mySub.allowRetake || !!canResubmitRejectedPdf;

  // Parsed past answers if any
  const parsedPastAnswers = useMemo(() => {
    if (!mySub?.answers) return null;
    try {
      return JSON.parse(mySub.answers) as Record<string, string>;
    } catch {
      return null;
    }
  }, [mySub?.answers]);

  // Handle Exam Submit
  const handleExamSubmit = async () => {
    if (!homework) return;
    if (answeredCount === 0) {
      toastError("يرجى الإجابة على الأسئلة أولاً");
      return;
    }
    if (!isAllAnswered) {
      const remaining = questions.length - answeredCount;
      const confirmSubmit = window.confirm(
        `لم تقم بالإجابة على ${remaining} من الأسئلة.\n\nالتسليم نهائي: الدرجة تُحسب مرة واحدة ولا يمكن إعادة الاختبار بعد كده.\nهل أنت متأكد؟`
      );
      if (!confirmSubmit) return;
    } else {
      const confirmSubmit = window.confirm(
        "التسليم نهائي: الدرجة تُحسب مرة واحدة ولا يمكن إعادة الاختبار بعد كده.\nهل أنت متأكد من التسليم؟"
      );
      if (!confirmSubmit) return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`/api/homework/${homework.id}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers }),
      });
      const data = await res.json();

      if (res.status === 409 && data.alreadySubmitted && data.submission) {
        toastSuccess("تم احتساب درجتك من قبل — لا يمكن الإعادة");
        // Refetch: the post-submit response includes correctAnswer for review.
        await loadHomework(true);
        return;
      }

      if (!res.ok) {
        throw new Error(data.error || "فشل تسليم الواجب");
      }

      toastSuccess("شكراً — تم احتساب درجتك");
      // Refetch so the freshly locked attempt loads questions WITH the correct
      // answers — the pre-submit copy in state intentionally lacks them.
      await loadHomework(true);
    } catch (err: unknown) {
      toastError(err instanceof Error ? err.message : "تعذر إرسال الإجابة");
    } finally {
      setSubmitting(false);
    }
  };

  // Handle Terminal Submit
  const handleTerminalSubmit = async () => {
    if (!homework) return;
    if (!terminalOutput.trim()) {
      toastError("أدخل ناتج تشغيل الكود أولاً");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`/api/homework/${homework.id}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ submittedOutput: terminalOutput }),
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "تعذر إرسال الإجابة");
      }

      toastSuccess("تم تسليم الناتج بنجاح!");
      setHomework((prev) => (prev ? { ...prev, mySubmission: data.submission } : prev));
    } catch (err: unknown) {
      toastError(err instanceof Error ? err.message : "تعذر إرسال الإجابة");
    } finally {
      setSubmitting(false);
    }
  };

  const parseJsonResponse = async (res: Response) => {
    const text = await res.text();
    try {
      return text ? JSON.parse(text) : {};
    } catch {
      throw new Error("استجابة غير متوقعة من الخادم، يرجى المحاولة مرة أخرى");
    }
  };

  // Handle Upload Submit
  const handleUploadSubmit = async () => {
    if (!homework || !uploadFile) {
      toastError("اختر ملفاً لرفعه أولاً");
      return;
    }

    if (uploadFile.size > 10 * 1024 * 1024) {
      toastError("حجم الملف يجب ألا يتجاوز 10 ميجابايت");
      return;
    }

    setSubmitting(true);
    try {
      const upData = await uploadHomeworkFile(homework.id, uploadFile);

      const subRes = await fetch(`/api/homework/${homework.id}/submit`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileUrl: upData.fileUrl, fileName: upData.fileName }),
      });
      const subData = await parseJsonResponse(subRes);

      if (!subRes.ok) {
        throw new Error(subData.error || "تعذر إرسال الواجب");
      }

      toastSuccess("تم رفع الملف وتسليم الواجب بنجاح!");
      setHomework((prev) => (prev ? { ...prev, mySubmission: subData.submission } : prev));
    } catch (err: unknown) {
      toastError(homeworkUploadNetworkMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0b0f19] text-slate-100 flex flex-col font-sans" dir="rtl">
      <Navbar user={user} />

      <main className="flex-1 max-w-5xl w-full mx-auto px-4 py-8 sm:px-6">
        {/* Navigation Breadcrumb */}
        <div className="flex items-center justify-between gap-4 mb-6 text-sm">
          <div className="flex items-center gap-2 text-slate-400 overflow-x-auto whitespace-nowrap">
            <Link href="/" className="hover:text-white transition-colors">
              الرئيسية
            </Link>
            <span>/</span>
            {courseId && (
              <>
                <Link href={`/courses/${courseId}/learn`} className="hover:text-white transition-colors">
                  {course?.title || "الكورس"}
                </Link>
                <span>/</span>
              </>
            )}
            <span className="text-white font-bold truncate">{homework?.title || "الواجب"}</span>
          </div>

          {courseId && (
            <Link
              href={`/courses/${courseId}/learn`}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-700 bg-slate-800/80 hover:bg-slate-700 text-xs text-slate-300 hover:text-white transition-all shrink-0"
            >
              <span>←</span>
              <span>العودة للكورس</span>
            </Link>
          )}
        </div>

        {/* Loading State */}
        {loading && (
          <div className="rounded-3xl border border-slate-800 bg-slate-900/60 p-12 text-center space-y-4">
            <div className="w-12 h-12 border-4 border-sky-500 border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-slate-400 font-medium">جارٍ تحميل بيانات الواجب...</p>
          </div>
        )}

        {/* Prerequisite Locked State */}
        {!loading && prereqLock && (
          <div className="rounded-3xl border border-amber-500/30 bg-amber-500/10 p-8 sm:p-10 text-center space-y-4">
            <span className="text-5xl inline-block">🔒</span>
            <h2 className="text-xl sm:text-2xl font-black text-amber-300">الواجب مقفل حالياً</h2>
            <p className="text-slate-300 text-sm max-w-md mx-auto leading-relaxed">
              يتطلب هذا الواجب إكمال المتطلب التالي أولاً:
              <br />
              <strong className="text-white font-bold text-base mt-2 inline-block">
                «{prereqLock.title}»
              </strong>
            </p>
            <div className="pt-2">
              {courseId ? (
                <Link
                  href={`/courses/${courseId}/learn`}
                  className="inline-flex items-center gap-2 px-6 py-3 rounded-2xl bg-amber-600 hover:bg-amber-500 text-white font-bold text-sm shadow-lg shadow-amber-600/20 transition-all"
                >
                  <span>📺</span>
                  <span>الانتقال لمشاهدة المحاضرة</span>
                </Link>
              ) : (
                <button
                  onClick={() => router.back()}
                  className="px-6 py-3 rounded-2xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-sm transition-colors"
                >
                  العودة للصفحة السابقة
                </button>
              )}
            </div>
          </div>
        )}

        {/* Error State */}
        {!loading && errorMsg && !prereqLock && (
          <div className="rounded-3xl border border-red-500/30 bg-red-500/10 p-8 sm:p-10 text-center space-y-4">
            <span className="text-5xl inline-block">⚠️</span>
            <h2 className="text-xl font-black text-red-300">تعذر فتح الواجب</h2>
            <p className="text-slate-300 text-sm max-w-md mx-auto">{errorMsg}</p>
            <div className="pt-2 flex justify-center gap-3">
              <button
                onClick={() => loadHomework()}
                className="px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-sm transition-colors"
              >
                إعادة المحاولة
              </button>
              {courseId && (
                <Link
                  href={`/courses/${courseId}/learn`}
                  className="px-5 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-bold text-sm transition-colors"
                >
                  العودة للكورس
                </Link>
              )}
            </div>
          </div>
        )}

        {/* Content Loaded */}
        {!loading && homework && !prereqLock && (
          <div className="space-y-6">
            {/* Header Card */}
            <div className="rounded-3xl border border-slate-800 bg-slate-900/80 backdrop-blur-xl p-6 sm:p-8 shadow-xl">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span
                      className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border ${
                        TYPE_CONFIG[homework.type]?.color || "bg-slate-700 text-slate-300 border-slate-600"
                      }`}
                    >
                      <span>{TYPE_CONFIG[homework.type]?.icon || "📝"}</span>
                      <span>{TYPE_CONFIG[homework.type]?.label || homework.type}</span>
                    </span>

                    {mySub && (
                      <span
                        className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold ${
                          mySub.allowRetake
                            ? "bg-sky-500/20 text-sky-400 border border-sky-500/30"
                            : mySub.status === "passed"
                            ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                            : mySub.status === "failed"
                            ? "bg-red-500/20 text-red-400 border border-red-500/30"
                            : "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                        }`}
                      >
                        {mySub.status === "passed"
                          ? "✅ مكتمل بنجاح"
                          : mySub.allowRetake
                          ? "🔓 مسموح إعادة المحاولة"
                          : mySub.status === "failed"
                          ? "❌ مرفوض"
                          : "⏳ قيد المراجعة"}
                      </span>
                    )}
                  </div>

                  <h1 className="text-2xl sm:text-3xl font-black text-white">{homework.title}</h1>

                  <div className="flex flex-wrap items-center gap-y-1 gap-x-4 text-xs text-slate-400">
                    {course?.title && (
                      <span>
                        الكورس: <strong className="text-slate-200">{course.title}</strong>
                      </span>
                    )}
                    {homework.folder?.name && (
                      <span>
                        المحاضرة: <strong className="text-slate-200">{homework.folder.name}</strong>
                      </span>
                    )}
                    {teacher?.name && (
                      <span>
                        المعلم: <strong className="text-slate-200">{teacher.name}</strong>
                      </span>
                    )}
                    {homework.dueAt && (
                      <span>
                        آخر موعد:{" "}
                        <strong className="text-slate-200">
                          {new Date(homework.dueAt).toLocaleDateString("ar-EG")}
                        </strong>
                      </span>
                    )}
                  </div>
                </div>

                {homework.type === "exam" && questions.length > 0 && (
                  <div className="rounded-2xl bg-slate-800/80 border border-slate-700/80 px-4 py-3 text-center min-w-[120px]">
                    <div className="text-[11px] text-slate-400">عدد الأسئلة</div>
                    <div className="text-2xl font-black text-sky-400">{questions.length}</div>
                  </div>
                )}
              </div>

              {homework.description && (
                <div className="mt-4 pt-4 border-t border-slate-800 text-sm text-slate-300 whitespace-pre-wrap leading-relaxed">
                  {homework.description}
                </div>
              )}
            </div>

            {/* ─────────────────────────────────────────────────────────────
                SECTION A: SUBMISSION RESULT (IF SUBMITTED)
               ───────────────────────────────────────────────────────────── */}
            {mySub && !canSubmit ? (
              <div className="space-y-6">
                <div
                  className={`rounded-3xl border p-6 sm:p-8 text-center space-y-3 ${
                    mySub.status === "passed"
                      ? "bg-emerald-950/30 border-emerald-500/40 text-emerald-300"
                      : mySub.status === "failed"
                      ? "bg-red-950/30 border-red-500/40 text-red-300"
                      : "bg-amber-950/30 border-amber-500/40 text-amber-300"
                  }`}
                >
                  <span className="text-5xl inline-block">
                    {mySub.status === "passed" ? "🎉" : mySub.status === "failed" ? "📊" : "⏳"}
                  </span>
                  <h2 className="text-xl sm:text-2xl font-black text-white">
                    {homework.type === "exam"
                      ? "شكراً — تم احتساب درجتك"
                      : mySub.status === "passed"
                      ? "أحسنت! تم تسليم الواجب واجتيازه بنجاح"
                      : mySub.status === "failed"
                      ? homework.type === "upload"
                        ? "تم رفض الملف — الواجب اتقفل لحد ما المعلم يسمح بمحاولة تانية"
                        : "تم تسليم الواجب — درجتك أقل من نسبة النجاح المطلوبة"
                      : "تم تسليم الواجب بنجاح — في انتظار مراجعة المعلم"}
                  </h2>

                  {mySub.score != null && (
                    <div className="inline-block px-5 py-2 rounded-2xl bg-slate-900/80 border border-slate-700 text-2xl font-black text-white my-2">
                      الدرجة: <span className="text-emerald-400">{mySub.score}%</span>
                      {mySub.totalQ != null && (
                        <span className="text-xs text-slate-400 mr-2 font-normal">
                          ({Math.round(((mySub.score || 0) / 100) * mySub.totalQ)} من {mySub.totalQ} صحيح)
                        </span>
                      )}
                    </div>
                  )}

                  {homework.type === "exam" && (
                    <p className="text-sm text-amber-300/90 font-bold">
                      🔒 محاولة واحدة فقط — لا يمكن إعادة الاختبار
                    </p>
                  )}

                  {mySub.review?.note && (
                    <div className="rounded-2xl bg-slate-900/60 border border-slate-700/60 p-4 max-w-lg mx-auto text-right text-xs text-slate-300 space-y-1">
                      <p className="font-bold text-amber-400">💬 ملاحظة المعلم:</p>
                      <p>{mySub.review.note}</p>
                    </div>
                  )}

                  {mySub.fileName && (
                    <p className="text-xs text-slate-400">
                      الملف المرفوع: <strong className="text-slate-200">{mySub.fileName}</strong>
                    </p>
                  )}

                  <div className="pt-3">
                    {courseId && (
                      <Link
                        href={`/courses/${courseId}/learn`}
                        className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-bold text-sm transition-colors shadow-lg shadow-sky-600/20"
                      >
                        <span>←</span>
                        <span>العودة لمتابعة المحاضرات</span>
                      </Link>
                    )}
                  </div>
                </div>

                {/* Exam Review: Show answers */}
                {homework.type === "exam" && questions.length > 0 && (
                  <div className="space-y-4">
                    <h3 className="text-lg font-black text-white px-1">مراجعة أسئلة الواجب</h3>
                    {parsedPastAnswers && questions.some((q) => q.correctAnswer) && (
                      <p className="px-1 text-sm font-bold text-slate-300">
                        <span className="text-emerald-400">
                          ✓ {questions.filter((q) => q.correctAnswer && parsedPastAnswers[q.id] === q.correctAnswer).length} صحيحة
                        </span>
                        {" · "}
                        <span className="text-rose-400">
                          ✗ {questions.filter((q) => q.correctAnswer && parsedPastAnswers[q.id] !== q.correctAnswer).length} خاطئة
                        </span>
                      </p>
                    )}
                    {questions.map((q, idx) => {
                      const studentAnswer = parsedPastAnswers?.[q.id];
                      const correct = q.correctAnswer ?? null;
                      const isWrong = !!correct && studentAnswer !== correct;
                      return (
                        <div
                          key={q.id}
                          className={`rounded-2xl border p-5 space-y-4 ${
                            correct
                              ? isWrong
                                ? "border-rose-500/40 bg-rose-950/20"
                                : "border-emerald-500/30 bg-slate-900/60"
                              : "border-slate-800 bg-slate-900/60"
                          }`}
                        >
                          <div className="flex items-start gap-3">
                            <span
                              className={`inline-flex items-center justify-center w-7 h-7 rounded-xl text-xs font-bold shrink-0 ${
                                correct
                                  ? isWrong
                                    ? "bg-rose-500/20 text-rose-300"
                                    : "bg-emerald-500/20 text-emerald-300"
                                  : "bg-slate-800 text-slate-300"
                              }`}
                            >
                              {idx + 1}
                            </span>
                            <div className="flex-1">
                              <p className="text-sm sm:text-base font-bold text-white leading-relaxed">
                                {q.question}
                              </p>
                              {q.imageUrl && (
                                <div className="mt-3 overflow-hidden rounded-xl border border-slate-800 bg-slate-950 p-2">
                                  <img
                                    src={q.imageUrl}
                                    alt="توضيح السؤال"
                                    className="max-h-72 w-full object-contain rounded-lg"
                                  />
                                </div>
                              )}
                            </div>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                            {OPTION_KEYS.filter((opt) => !!q[`option${opt}`]?.trim()).map((opt) => {
                              const isSelected = studentAnswer === opt;
                              const isCorrectOpt = !!correct && correct === opt;
                              const isWrongPick = isSelected && !!correct && !isCorrectOpt;
                              return (
                                <div
                                  key={opt}
                                  className={`px-4 py-3 rounded-xl text-sm border text-right transition-all flex items-center justify-between ${
                                    isCorrectOpt
                                      ? "bg-emerald-950/40 border-emerald-500/60 text-emerald-200 font-bold"
                                      : isWrongPick
                                      ? "bg-rose-950/40 border-rose-500/60 text-rose-200 font-bold"
                                      : isSelected
                                      ? "bg-sky-950/40 border-sky-500/60 text-sky-200 font-bold"
                                      : "border-slate-800 bg-slate-900/30 text-slate-400"
                                  }`}
                                >
                                  <span>
                                    ({opt}) {q[`option${opt}`]}
                                  </span>
                                  {isCorrectOpt && (
                                    <span className="text-xs text-emerald-400 font-bold mr-2">
                                      {isSelected ? "إجابتك ✓" : "الإجابة الصحيحة ✓"}
                                    </span>
                                  )}
                                  {isWrongPick && (
                                    <span className="text-xs text-rose-400 font-bold mr-2">
                                      إجابتك ✗
                                    </span>
                                  )}
                                  {!correct && isSelected && (
                                    <span className="text-xs text-sky-400 font-bold mr-2">
                                      إجابتك ✓
                                    </span>
                                  )}
                                </div>
                              );
                            })}
                            {!!correct && !studentAnswer && (
                              <p className="text-xs font-bold text-rose-400 sm:col-span-2">
                                لم تختر إجابة لهذا السؤال
                              </p>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ) : (
              /* ─────────────────────────────────────────────────────────────
                  SECTION B: SOLVING FORMS (NOT SUBMITTED YET)
                 ───────────────────────────────────────────────────────────── */
              <div className="space-y-6">
                {(mySub?.allowRetake || canResubmitRejectedPdf) && (
                  <div className="rounded-3xl border border-sky-500/40 bg-sky-950/30 p-5 sm:p-6 text-center space-y-2">
                    <p className="text-lg font-black text-white">
                      {canResubmitRejectedPdf && !mySub?.allowRetake
                        ? "❌ الملف اترفض — ارفع نسخة جديدة"
                        : "🔓 المعلم فتح لك محاولة تانية"}
                    </p>
                    <p className="text-sm text-sky-200">
                      {homework.type === "upload"
                        ? "ارفع نسخة جديدة من الملف. المحتوى التالي يبقى مقفول لحد ما المعلم يقبل الواجب."
                        : "حل من تاني وسلّم. اللي بعده هيفضل مقفول لحد ما الواجب يتقبل."}
                    </p>
                    {mySub.review?.note && (
                      <div className="rounded-2xl bg-slate-900/60 border border-slate-700/60 p-4 max-w-lg mx-auto text-right text-xs text-slate-300 space-y-1">
                        <p className="font-bold text-amber-400">💬 ملاحظة المعلم:</p>
                        <p>{mySub.review.note}</p>
                      </div>
                    )}
                    {mySub.fileName && (
                      <p className="text-xs text-slate-400">
                        الملف السابق: <strong className="text-slate-200">{mySub.fileName}</strong>
                      </p>
                    )}
                  </div>
                )}
                {homework.type === "exam" && (
                  <div className="space-y-5">
                    <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200 font-bold text-center">
                      {mySub?.allowRetake
                        ? "محاولة جديدة بعد السماح بالإعادة — بعد التسليم تُحسب الدرجة وتتقفل تاني"
                        : "محاولة واحدة فقط — بعد التسليم تُحسب الدرجة ولا يمكن الإعادة، حتى لو معاد التسليم لسه مفتوح"}
                    </div>
                    {/* Progress Bar Header */}
                    <div className="sticky top-4 z-20 rounded-2xl border border-slate-800 bg-slate-900/90 backdrop-blur-xl p-4 shadow-lg flex items-center justify-between gap-4">
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-slate-400">الإجابات المكتملة:</span>
                        <span className="text-sm font-black text-white">
                          {answeredCount} <span className="text-slate-500 font-normal">من</span>{" "}
                          {questions.length}
                        </span>
                      </div>

                      <div className="flex items-center gap-3">
                        <button
                          onClick={handleExamSubmit}
                          disabled={submitting || answeredCount === 0}
                          className="px-5 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white font-bold text-xs transition-all shadow-md shadow-sky-600/20"
                        >
                          {submitting ? "⏳ جارٍ التسليم..." : "✅ تسليم الواجب"}
                        </button>
                      </div>
                    </div>

                    {/* Questions List */}
                    {questions.map((q, idx) => {
                      const currentSelected = answers[q.id];
                      return (
                        <div
                          key={q.id}
                          className="rounded-3xl border border-slate-800 bg-slate-900/60 p-5 sm:p-6 space-y-4 transition-all hover:border-slate-700"
                        >
                          <div className="flex items-start gap-3">
                            <span
                              className={`inline-flex items-center justify-center w-8 h-8 rounded-2xl text-xs font-black shrink-0 transition-colors ${
                                currentSelected
                                  ? "bg-sky-500 text-white shadow-md shadow-sky-500/20"
                                  : "bg-slate-800 text-slate-400"
                              }`}
                            >
                              {idx + 1}
                            </span>
                            <div className="flex-1">
                              <h3 className="text-base sm:text-lg font-bold text-white leading-relaxed">
                                {q.question}
                              </h3>

                              {q.imageUrl && (
                                <div className="mt-3 overflow-hidden rounded-2xl border border-slate-800 bg-slate-950 p-2">
                                  <img
                                    src={q.imageUrl}
                                    alt="صورة توضيحية للسؤال"
                                    className="max-h-80 w-full object-contain rounded-xl"
                                  />
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Options */}
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                            {OPTION_KEYS.filter((opt) => !!q[`option${opt}`]?.trim()).map((opt) => {
                              const active = currentSelected === opt;
                              return (
                                <button
                                  key={opt}
                                  type="button"
                                  onClick={() => setAnswers((prev) => ({ ...prev, [q.id]: opt }))}
                                  className={`text-right px-4 py-3.5 rounded-2xl text-sm border transition-all flex items-center justify-between ${
                                    active
                                      ? "bg-sky-600 border-sky-500 text-white font-bold shadow-lg shadow-sky-600/20 scale-[1.01]"
                                      : "border-slate-800 bg-slate-800/40 text-slate-300 hover:border-slate-700 hover:bg-slate-800"
                                  }`}
                                >
                                  <span>
                                    ({opt}) {q[`option${opt}`]}
                                  </span>
                                  {active && <span className="text-sm">✓</span>}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}

                    {/* Bottom Submit Banner */}
                    <div className="rounded-3xl border border-slate-800 bg-slate-900/80 p-6 text-center space-y-4">
                      <p className="text-sm text-slate-400">
                        {isAllAnswered
                          ? "التسليم نهائي: الدرجة تُحسب مرة واحدة ولا يمكن الإعادة"
                          : `متبقي ${questions.length - answeredCount} سؤال — التسليم نهائي ولا يمكن الإعادة`}
                      </p>
                      <button
                        onClick={handleExamSubmit}
                        disabled={submitting || answeredCount === 0}
                        className="w-full sm:w-auto px-8 py-3.5 rounded-2xl bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white font-black text-sm shadow-xl shadow-sky-600/20 transition-all active:scale-98"
                      >
                        {submitting ? "⏳ جارٍ تسليم الواجب..." : "✅ تأكيد وتسليم الواجب"}
                      </button>
                    </div>
                  </div>
                )}

                {/* 2. TYPE = TERMINAL */}
                {homework.type === "terminal" && (
                  <div className="rounded-3xl border border-slate-800 bg-slate-900/60 p-6 sm:p-8 space-y-5">
                    {homework.codeTemplate && (
                      <div className="space-y-2">
                        <label className="text-xs font-bold text-slate-400">
                          الكود المطلوب تشغيله ({homework.codeLanguage || "Python"}):
                        </label>
                        <pre className="p-4 rounded-2xl bg-slate-950 border border-slate-800 font-mono text-xs sm:text-sm text-emerald-400 overflow-x-auto whitespace-pre-wrap">
                          {homework.codeTemplate}
                        </pre>
                      </div>
                    )}

                    <div className="space-y-2">
                      <label className="text-xs font-bold text-slate-400">
                        الكود الخاص بك (اختياري):
                      </label>
                      <textarea
                        rows={6}
                        value={userCode}
                        onChange={(e) => setUserCode(e.target.value)}
                        placeholder="# اكتب الكود الخاص بك هنا..."
                        className="w-full p-4 rounded-2xl bg-slate-950 border border-slate-800 font-mono text-sm text-slate-200 focus:outline-none focus:border-sky-500"
                        dir="ltr"
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-xs font-bold text-slate-300">
                        ناتج تنفيذ الكود (Output) <span className="text-rose-400">*</span>:
                      </label>
                      <textarea
                        rows={4}
                        value={terminalOutput}
                        onChange={(e) => setTerminalOutput(e.target.value)}
                        placeholder="انسخ والصق ناتج تنفيذ الكود هنا..."
                        className="w-full p-4 rounded-2xl bg-slate-950 border border-slate-800 font-mono text-sm text-emerald-300 focus:outline-none focus:border-emerald-500"
                        dir="ltr"
                      />
                    </div>

                    <button
                      onClick={handleTerminalSubmit}
                      disabled={submitting || !terminalOutput.trim()}
                      className="w-full py-4 rounded-2xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-black text-sm shadow-xl shadow-emerald-600/20 transition-all"
                    >
                      {submitting ? "⏳ جارٍ إرسال الناتج..." : "🚀 تسليم ناتج الكود"}
                    </button>
                  </div>
                )}

                {/* 3. TYPE = UPLOAD */}
                {homework.type === "upload" && (
                  <div className="rounded-3xl border border-slate-800 bg-slate-900/60 p-6 sm:p-8 space-y-5">
                    {homework.allowedFileTypes && (
                      <div className="flex items-center gap-2 text-xs text-slate-400">
                        <span>الامتدادات المسموح بها:</span>
                        <span className="font-mono px-2 py-0.5 rounded bg-slate-800 text-sky-400 font-bold">
                          {homework.allowedFileTypes}
                        </span>
                      </div>
                    )}

                    <label className="flex flex-col items-center justify-center gap-3 border-2 border-dashed border-slate-700 hover:border-sky-500 rounded-3xl p-10 cursor-pointer transition-all bg-slate-950/40 group">
                      <span className="text-4xl group-hover:scale-110 transition-transform">📎</span>
                      <span className="text-sm text-slate-300 font-bold group-hover:text-white transition-colors">
                        {uploadFile ? uploadFile.name : "اضغط لاختيار ملف الواجب أو اسحبه وأفلته هنا"}
                      </span>
                      {uploadFile && (
                        <span className="text-xs text-slate-500 font-mono">
                          {(uploadFile.size / 1024).toFixed(1)} KB
                        </span>
                      )}
                      <input
                        type="file"
                        className="hidden"
                        accept={
                          homework.allowedFileTypes
                            ? homework.allowedFileTypes
                                .split(",")
                                .map((e) => `.${e.trim()}`)
                                .join(",")
                            : undefined
                        }
                        onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                      />
                    </label>

                    {uploadFile && (
                      <div className="flex items-center justify-between p-3 rounded-xl bg-slate-800 border border-slate-700 text-xs">
                        <span className="text-slate-300 font-mono truncate">{uploadFile.name}</span>
                        <button
                          onClick={() => setUploadFile(null)}
                          className="text-rose-400 hover:text-rose-300 font-bold px-2 py-1"
                        >
                          إلغاء الملف ✕
                        </button>
                      </div>
                    )}

                    <button
                      onClick={handleUploadSubmit}
                      disabled={submitting || !uploadFile}
                      className="w-full py-4 rounded-2xl bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white font-black text-sm shadow-xl shadow-sky-600/20 transition-all"
                    >
                      {submitting ? "⏳ جارٍ رفع الملف وإرساله..." : "📤 رفع وتسليم الواجب"}
                    </button>
                  </div>
                )}

                {/* 4. TYPE = LINK */}
                {homework.type === "link" && (
                  <div className="rounded-3xl border border-slate-800 bg-slate-900/60 p-8 text-center space-y-4">
                    <span className="text-4xl inline-block">🔗</span>
                    <h3 className="text-lg font-bold text-white">واجب عبر رابط خارجي</h3>
                    <p className="text-sm text-slate-400 max-w-md mx-auto">
                      هذا الواجب يتطلب منك الانتقال إلى منصة أو رابط خارجي لحله.
                    </p>
                    <div className="pt-2">
                      <a
                        href={homework.linkUrl || "#"}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 px-8 py-3.5 rounded-2xl bg-sky-600 hover:bg-sky-500 text-white font-bold text-sm shadow-xl shadow-sky-600/20 transition-all"
                      >
                        <span>فتح الواجب الخارجي</span>
                        <span>↗</span>
                      </a>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </main>

      <Footer />
    </div>
  );
}
