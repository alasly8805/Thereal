"use client";

import { useCallback, useEffect, useState } from "react";
import { useToast } from "@/components/ui/Toast";
import { TeacherAIGradingSettings } from "@/components/admin/teacher/TeacherAIGradingSettings";

interface AIGradeView {
  status: "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED" | "SKIPPED";
  skipReason: string | null;
  attempts: number;
  lastError: string | null;
  score: number | null;
  maxPoints: number | null;
  verdict: "CORRECT" | "PARTIAL" | "INCORRECT" | null;
  confidence: "high" | "medium" | "low" | null;
  needsReview: boolean;
  feedback: {
    summary: string;
    criteria: Array<{ index: number; criterion: string; met: "yes" | "partial" | "no"; evidence: string }>;
    missingPoints: string[];
    misconceptions: string[];
    reviewReasons: string[];
    injectionSuspected: boolean;
  } | null;
  model: string | null;
  mode: string;
  appliedByAI: boolean;
}

const SKIP_LABELS: Record<string, string> = {
  NO_CRITERIA: "لم يُقيَّم آلياً: لا توجد معايير تصحيح لهذا السؤال",
  EMPTY_ANSWER: "لم يُقيَّم آلياً: الإجابة فارغة",
  TOO_LONG: "لم يُقيَّم آلياً: الإجابة أطول من الحد المسموح",
  DISABLED: "لم يُقيَّم آلياً: التصحيح الذكي كان متوقفاً",
  NOT_GRADED: "لم يُقيَّم آلياً",
};

const REVIEW_REASON_LABELS: Record<string, string> = {
  MODEL_REQUESTED_REVIEW: "طلب الذكاء الاصطناعي مراجعتك",
  CRITERIA_NOT_ALL_ASSESSED: "لم تُقيَّم كل المعايير",
  NO_RUBRIC: "لا توجد نقاط مطلوبة (تقييم استرشادي)",
  EVIDENCE_NOT_FOUND: "اقتباس غير موجود في إجابة الطالب",
  INJECTION_SUSPECTED: "محاولة للتأثير على التصحيح داخل الإجابة",
  PARTIAL_CREDIT: "إجابة جزئية",
};

function TeacherAIBlock({ ai, onRetry, retrying }: { ai: AIGradeView; onRetry: () => void; retrying: boolean }) {
  if (ai.status === "SKIPPED") {
    return <p className="text-[11px] text-slate-500 dark:text-gray-400">🤖 {SKIP_LABELS[ai.skipReason ?? ""] ?? "لم يُقيَّم آلياً"}</p>;
  }
  if (ai.status === "PENDING" || ai.status === "PROCESSING") {
    return <p className="text-[11px] text-sky-500 font-bold">🤖 جارٍ التقييم بالذكاء الاصطناعي…</p>;
  }
  if (ai.status === "FAILED") {
    return (
      <div className="flex items-center gap-2 text-[11px]">
        <span className="text-rose-500 font-bold">🤖 تعذر التقييم الآلي بعد {ai.attempts} محاولات{ai.lastError ? ` (${ai.lastError})` : ""}</span>
        <button onClick={onRetry} disabled={retrying} className="px-2 py-1 rounded-lg bg-slate-200 dark:bg-gray-700 font-bold disabled:opacity-50">
          {retrying ? "..." : "إعادة المحاولة"}
        </button>
      </div>
    );
  }
  const verdictLabel = ai.verdict === "CORRECT" ? "صحيحة" : ai.verdict === "INCORRECT" ? "غير صحيحة" : "جزئية";
  const confLabel = ai.confidence === "high" ? "ثقة عالية" : ai.confidence === "medium" ? "ثقة متوسطة" : "ثقة منخفضة";
  return (
    <div className="rounded-xl border border-sky-500/25 bg-sky-500/5 p-3 text-xs space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-bold text-sky-600 dark:text-sky-300">🤖 اقتراح الذكاء الاصطناعي:</span>
        <span className="font-black text-slate-900 dark:text-white" dir="ltr">
          {ai.score}/{ai.maxPoints}
        </span>
        <span className="px-2 py-0.5 rounded-lg bg-slate-200 dark:bg-gray-700 font-bold">{verdictLabel}</span>
        <span className="text-slate-500 dark:text-gray-400">{confLabel}</span>
        {ai.appliedByAI && (
          <span className="px-2 py-0.5 rounded-lg bg-purple-500/15 text-purple-500 font-bold">اعتُمد تلقائياً — يمكنك تعديله</span>
        )}
      </div>
      {ai.feedback?.summary && <p className="text-slate-700 dark:text-gray-200 leading-relaxed">{ai.feedback.summary}</p>}
      {ai.feedback && ai.feedback.criteria.length > 0 && (
        <ul className="space-y-1">
          {ai.feedback.criteria.map((c) => (
            <li key={c.index} className="text-slate-700 dark:text-gray-300">
              {c.met === "yes" ? "✓" : c.met === "partial" ? "◐" : "✕"} {c.criterion}
              {c.evidence && c.met !== "no" && <span className="text-slate-500 dark:text-gray-400"> — «{c.evidence}»</span>}
            </li>
          ))}
        </ul>
      )}
      {ai.needsReview && ai.feedback && ai.feedback.reviewReasons.length > 0 && (
        <p className="text-amber-600 dark:text-amber-300 font-bold">
          يحتاج مراجعتك: {ai.feedback.reviewReasons.map((r) => REVIEW_REASON_LABELS[r] ?? r).join(" · ")}
        </p>
      )}
    </div>
  );
}

interface QuizResultItem {
  id: string;
  studentId: string;
  student: { id: string; name: string; email: string; phone: string | null };
  quizId: string;
  quiz: { id: string; title: string; folderName: string; courseId: string; courseTitle: string };
  score: number;
  totalQ: number;
  allowRetake: boolean;
  completedAt: string;
  pendingCount: number;
  essayCount: number;
  mcqCount: number;
  mcqCorrect: number;
  essayApproved: number;
  gradingStatus: "PENDING" | "GRADED";
  passed: boolean | null;
}

interface AnswerSheetItem {
  id: string;
  questionId: string;
  questionType: string;
  question: string;
  imageUrl: string | null;
  optionA: string;
  optionB: string;
  optionC: string;
  optionD: string;
  selectedAnswer: string | null;
  essayAnswer: string | null;
  correctAnswer: string;
  isCorrect: boolean;
  status: "PENDING" | "APPROVED" | "DISAPPROVED";
  teacherReply: string | null;
  reviewedAt: string | null;
  aiGrade?: AIGradeView | null;
}

interface AnswerSheet {
  result: QuizResultItem & { correct: number };
  answers: AnswerSheetItem[];
}

const OPTION_LABELS = ["A", "B", "C", "D"] as const;

function ScoreCell({ r }: { r: QuizResultItem }) {
  if (r.gradingStatus === "PENDING") {
    return (
      <div className="text-center min-w-[110px]">
        <div className="text-lg font-black text-amber-400">قيد التصحيح</div>
        <p className="text-xs text-slate-500 dark:text-gray-500">
          {r.pendingCount} مقالي معلق
          {r.mcqCount > 0 && ` · اختياري ${r.mcqCorrect}/${r.mcqCount}`}
        </p>
      </div>
    );
  }
  return (
    <div className="text-center min-w-[110px]">
      <div
        className={`text-2xl font-black ${
          r.score >= 80 ? "text-emerald-400" : r.score >= 50 ? "text-sky-400" : "text-rose-400"
        }`}
      >
        {Math.round(r.score)}%
      </div>
      <p className="text-xs text-slate-500 dark:text-gray-500">{r.score >= 50 ? "ناجح" : "راسب"}</p>
    </div>
  );
}

export function TeacherQuizResults() {
  const { success, error } = useToast();
  const [results, setResults] = useState<QuizResultItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState<string | null>(null);
  const [filterCourse, setFilterCourse] = useState("");
  const [filterQuiz, setFilterQuiz] = useState("");
  const [filterStatus, setFilterStatus] = useState<"" | "PENDING" | "GRADED">("");
  const [search, setSearch] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  // Answer-sheet modal
  const [sheetFor, setSheetFor] = useState<string | null>(null);
  const [sheet, setSheet] = useState<AnswerSheet | null>(null);
  const [sheetLoading, setSheetLoading] = useState(false);
  const [replyText, setReplyText] = useState<Record<string, string>>({});
  const [gradingId, setGradingId] = useState<string | null>(null);
  const [retryingId, setRetryingId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const fetchResults = async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        if (filterCourse) params.set("courseId", filterCourse);
        if (filterQuiz) params.set("quizId", filterQuiz);
        const res = await fetch(`/api/admin/quiz-results?${params}`);
        const data = await res.json();
        if (!cancelled) setResults(data.results || []);
      } catch (err) {
        console.error(err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    fetchResults();
    return () => { cancelled = true; };
  }, [filterCourse, filterQuiz, reloadKey]);

  const loadSheet = useCallback(async (resultId: string) => {
    setSheetLoading(true);
    try {
      const res = await fetch(`/api/admin/quiz-results/${resultId}`);
      const data = await res.json();
      if (!res.ok) {
        error(data.error || "تعذر تحميل الإجابات");
        setSheetFor(null);
        return;
      }
      setSheet(data);
    } catch {
      error("تعذر تحميل الإجابات");
      setSheetFor(null);
    } finally {
      setSheetLoading(false);
    }
  }, [error]);

  const openSheet = (resultId: string) => {
    setSheetFor(resultId);
    setSheet(null);
    void loadSheet(resultId);
  };

  const closeSheet = () => {
    setSheetFor(null);
    setSheet(null);
  };

  const gradeEssay = async (answerId: string, status: "APPROVED" | "DISAPPROVED") => {
    if (!sheetFor) return;
    setGradingId(answerId);
    try {
      const res = await fetch("/api/admin/teacher/quiz-essay-responses", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answerId, status, teacherReply: replyText[answerId] || "" }),
      });
      const data = await res.json();
      if (!res.ok) {
        error(data.error || "فشل التصحيح");
        return;
      }
      success(
        data.pendingCount > 0
          ? `تم الحفظ — باقي ${data.pendingCount} سؤال مقالي`
          : `تم التصحيح — الدرجة النهائية ${Math.round(data.newScore)}%`
      );
      setReplyText((prev) => {
        const next = { ...prev };
        delete next[answerId];
        return next;
      });
      await loadSheet(sheetFor);
      setReloadKey((k) => k + 1);
    } catch {
      error("حدث خطأ");
    } finally {
      setGradingId(null);
    }
  };

  const retryAI = async (answerId: string) => {
    if (!sheetFor) return;
    setRetryingId(answerId);
    try {
      const res = await fetch("/api/admin/teacher/ai-grading/retry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answerId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        error(data.error || "تعذرت إعادة المحاولة");
        return;
      }
      success("أُعيد إرسال الإجابة للتقييم الآلي");
      await loadSheet(sheetFor);
    } catch {
      error("حدث خطأ");
    } finally {
      setRetryingId(null);
    }
  };

  const toggleRetake = async (resultId: string, allow: boolean) => {
    setToggling(resultId);
    try {
      const res = await fetch("/api/admin/quiz-results", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resultId, allowRetake: allow }),
      });
      const data = await res.json();
      if (!res.ok) {
        error(data.error || "فشل");
        return;
      }
      success(data.message);
      setResults((prev) =>
        prev.map((r) => (r.id === resultId ? { ...r, allowRetake: allow } : r))
      );
    } catch {
      error("حدث خطأ");
    } finally {
      setToggling(null);
    }
  };

  // Derive unique courses and quizzes for filters
  const courses = Array.from(new Map(results.map((r) => [r.quiz.courseId, r.quiz.courseTitle])).entries());
  const quizzes = Array.from(
    new Map(
      results
        .filter((r) => !filterCourse || r.quiz.courseId === filterCourse)
        .map((r) => [r.quizId, r.quiz.title])
    ).entries()
  );

  const filtered = results.filter((r) => {
    if (filterCourse && r.quiz.courseId !== filterCourse) return false;
    if (filterQuiz && r.quizId !== filterQuiz) return false;
    if (filterStatus && r.gradingStatus !== filterStatus) return false;
    if (search) {
      const s = search.toLowerCase();
      return (
        r.student.name.toLowerCase().includes(s) ||
        r.student.email.toLowerCase().includes(s) ||
        (r.student.phone || "").includes(s)
      );
    }
    return true;
  });

  // Averages and pass counts only make sense for final grades.
  const graded = filtered.filter((r) => r.gradingStatus === "GRADED");
  const pendingTotal = filtered.filter((r) => r.gradingStatus === "PENDING").length;
  const avgScore = graded.length > 0 ? Math.round(graded.reduce((a, r) => a + r.score, 0) / graded.length) : 0;
  const passCount = graded.filter((r) => r.score >= 50).length;

  return (
    <div className="space-y-6">
      <TeacherAIGradingSettings />
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-xl font-black text-slate-900 dark:text-white">📝 نتائج الاختبارات</h2>
        <div className="mr-auto flex items-center gap-2 text-sm text-slate-500 dark:text-gray-400">
          <span>{filtered.length} نتيجة</span>
          <span>•</span>
          <span>متوسط {avgScore}%</span>
          <span>•</span>
          <span>{passCount} ناجح</span>
          {pendingTotal > 0 && (
            <>
              <span>•</span>
              <span className="text-amber-400 font-bold">{pendingTotal} قيد التصحيح</span>
            </>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <select
          value={filterCourse}
          onChange={(e) => {
            setFilterCourse(e.target.value);
            setFilterQuiz("");
          }}
          className="px-3 py-2 rounded-lg border border-slate-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-white text-sm"
        >
          <option value="">كل الكورسات</option>
          {courses.map(([id, title]) => (
            <option key={id} value={id}>{title}</option>
          ))}
        </select>
        <select
          value={filterQuiz}
          onChange={(e) => setFilterQuiz(e.target.value)}
          className="px-3 py-2 rounded-lg border border-slate-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-white text-sm"
        >
          <option value="">كل الاختبارات</option>
          {quizzes.map(([id, title]) => (
            <option key={id} value={id}>{title}</option>
          ))}
        </select>
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value as "" | "PENDING" | "GRADED")}
          className="px-3 py-2 rounded-lg border border-slate-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-white text-sm"
        >
          <option value="">كل الحالات</option>
          <option value="PENDING">قيد التصحيح (مقالي)</option>
          <option value="GRADED">مُصحَّحة</option>
        </select>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="بحث بالاسم أو الإيميل..."
          className="flex-1 min-w-[200px] px-3 py-2 rounded-lg border border-slate-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-white text-sm"
        />
      </div>

      {loading ? (
        <div className="text-center py-12 text-slate-500 dark:text-gray-400">جارٍ التحميل...</div>
      ) : filtered.length === 0 ? (
        <div className="bg-white dark:bg-gray-800 rounded-2xl p-12 text-center text-slate-500 dark:text-gray-400 border border-slate-200 dark:border-gray-700">
          لا توجد نتائج اختبارات
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((r) => (
            <div
              key={r.id}
              className="bg-white dark:bg-gray-800 rounded-2xl border border-slate-200 dark:border-gray-700 p-4 flex items-center gap-4 flex-wrap"
            >
              {/* Student info */}
              <div className="flex-1 min-w-[200px]">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span className="font-bold text-slate-900 dark:text-white">{r.student.name}</span>
                  {r.allowRetake && (
                    <span className="px-2 py-0.5 bg-amber-600/20 text-amber-300 text-xs rounded-full border border-amber-600/30">
                      🔓 مسموح بالإعادة
                    </span>
                  )}
                  {r.pendingCount > 0 && (
                    <span className="px-2 py-0.5 bg-purple-600/20 text-purple-300 text-xs rounded-full border border-purple-600/30">
                      📝 {r.pendingCount} مقالي بانتظار التصحيح
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-500 dark:text-gray-400">
                  {r.student.email}
                  {r.student.phone && ` · ${r.student.phone}`}
                </p>
              </div>

              {/* Quiz info */}
              <div className="min-w-[180px]">
                <p className="text-sm font-medium text-slate-900 dark:text-white">{r.quiz.title}</p>
                <p className="text-xs text-slate-500 dark:text-gray-400">{r.quiz.courseTitle} · {r.quiz.folderName}</p>
                <p className="text-[11px] text-slate-500 dark:text-gray-500 mt-0.5">
                  {r.mcqCount > 0 && `${r.mcqCount} اختياري`}
                  {r.mcqCount > 0 && r.essayCount > 0 && " · "}
                  {r.essayCount > 0 && `${r.essayCount} مقالي`}
                </p>
              </div>

              <ScoreCell r={r} />

              {/* Date */}
              <div className="text-xs text-slate-500 dark:text-gray-500 min-w-[100px] text-center">
                {new Date(r.completedAt).toLocaleDateString("ar-EG")}
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  onClick={() => openSheet(r.id)}
                  className={`px-4 py-2 text-sm rounded-lg font-bold transition-colors min-w-[130px] ${
                    r.pendingCount > 0
                      ? "bg-purple-600 hover:bg-purple-500 text-white"
                      : "bg-slate-100 dark:bg-gray-700 hover:bg-gray-600 text-slate-800 dark:text-gray-100"
                  }`}
                >
                  {r.pendingCount > 0 ? "📝 تصحيح وعرض الإجابات" : "👁 عرض الإجابات"}
                </button>
                <button
                  onClick={() => toggleRetake(r.id, !r.allowRetake)}
                  disabled={toggling === r.id}
                  className={`px-4 py-2 text-sm rounded-lg font-bold transition-colors min-w-[130px] ${
                    r.allowRetake
                      ? "bg-gray-100 dark:bg-gray-700 hover:bg-gray-600 text-gray-300"
                      : "bg-blue-600 hover:bg-blue-500 text-white"
                  } ${toggling === r.id ? "opacity-50" : ""}`}
                >
                  {toggling === r.id
                    ? "جارٍ..."
                    : r.allowRetake
                      ? "🔒 إلغاء الإعادة"
                      : "🔓 السماح بالإعادة"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Answer sheet modal */}
      {sheetFor && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={closeSheet}
          dir="rtl"
        >
          <div
            className="w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-3xl bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-700 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-slate-200 dark:border-gray-700 bg-white/95 dark:bg-gray-900/95 backdrop-blur px-5 py-4">
              <div>
                <h3 className="text-lg font-black text-slate-900 dark:text-white">
                  {sheet ? `إجابات ${sheet.result.student.name}` : "إجابات الطالب"}
                </h3>
                {sheet && (
                  <p className="text-xs text-slate-500 dark:text-gray-400 mt-1">
                    {sheet.result.quiz.title} · {sheet.result.quiz.courseTitle}
                    {" · "}
                    {sheet.result.gradingStatus === "PENDING" ? (
                      <span className="text-amber-500 font-bold">
                        قيد التصحيح — {sheet.result.pendingCount} مقالي معلق
                      </span>
                    ) : (
                      <span className={sheet.result.score >= 50 ? "text-emerald-500 font-bold" : "text-rose-500 font-bold"}>
                        الدرجة النهائية {Math.round(sheet.result.score)}% ({sheet.result.correct}/{sheet.result.totalQ})
                      </span>
                    )}
                  </p>
                )}
              </div>
              <button
                onClick={closeSheet}
                className="rounded-lg px-3 py-1.5 text-sm font-bold text-slate-600 hover:bg-slate-100 dark:text-gray-300 dark:hover:bg-gray-800"
              >
                إغلاق ✕
              </button>
            </div>

            <div className="p-5 space-y-4">
              {sheetLoading || !sheet ? (
                <div className="py-12 text-center text-sm text-slate-500 dark:text-gray-400">جارٍ تحميل الإجابات...</div>
              ) : sheet.answers.length === 0 ? (
                <div className="py-12 text-center text-sm text-slate-500 dark:text-gray-400">
                  لا توجد إجابات محفوظة لهذه المحاولة.
                </div>
              ) : (
                sheet.answers.map((a, index) => {
                  const isEssay = a.questionType === "essay";
                  const tone = isEssay
                    ? a.status === "APPROVED"
                      ? "border-emerald-300 dark:border-emerald-800"
                      : a.status === "DISAPPROVED"
                        ? "border-rose-300 dark:border-rose-800"
                        : "border-amber-300 dark:border-amber-800"
                    : a.isCorrect
                      ? "border-emerald-300 dark:border-emerald-800"
                      : "border-rose-300 dark:border-rose-800";
                  return (
                    <article key={a.id} className={`rounded-2xl border p-4 bg-slate-50 dark:bg-gray-800/60 ${tone}`}>
                      <div className="flex items-start gap-3 mb-3">
                        <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-slate-200 dark:bg-gray-700 text-sm font-black text-slate-800 dark:text-white">
                          {index + 1}
                        </span>
                        <div className="flex-1">
                          <p className="text-sm font-bold text-slate-900 dark:text-white leading-relaxed">{a.question}</p>
                          <span
                            className={`inline-block mt-1 text-[10px] font-bold px-2 py-0.5 rounded-lg ${
                              isEssay ? "bg-purple-500/10 text-purple-500" : "bg-blue-500/10 text-blue-500"
                            }`}
                          >
                            {isEssay ? "📝 مقالي" : "اختيار من متعدد"}
                          </span>
                        </div>
                        <span className="text-lg">
                          {isEssay
                            ? a.status === "APPROVED" ? "✓" : a.status === "DISAPPROVED" ? "✕" : "⏳"
                            : a.isCorrect ? "✓" : "✕"}
                        </span>
                      </div>

                      {a.imageUrl && (
                        <img src={a.imageUrl} alt="" className="mb-3 max-h-56 rounded-xl object-contain border border-slate-200 dark:border-gray-700" />
                      )}

                      {isEssay ? (
                        <div className="space-y-3">
                          <div>
                            <p className="text-xs font-bold text-slate-500 dark:text-gray-400 mb-1">إجابة الطالب:</p>
                            <p className="text-sm whitespace-pre-wrap leading-relaxed rounded-xl bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-700 p-3 text-slate-900 dark:text-gray-100">
                              {a.essayAnswer?.trim() || "— لم يكتب الطالب إجابة —"}
                            </p>
                          </div>
                          <div className="flex items-center gap-2 text-xs">
                            <span
                              className={`px-2.5 py-1 rounded-lg font-bold ${
                                a.status === "APPROVED"
                                  ? "bg-emerald-500/15 text-emerald-500"
                                  : a.status === "DISAPPROVED"
                                    ? "bg-red-500/15 text-red-500"
                                    : "bg-amber-500/15 text-amber-500"
                              }`}
                            >
                              {a.status === "APPROVED" ? "مقبولة ✓" : a.status === "DISAPPROVED" ? "مرفوضة ✗" : "قيد التصحيح ⏳"}
                            </span>
                            {a.reviewedAt && (
                              <span className="text-slate-500 dark:text-gray-500">
                                صُحِّحت {new Date(a.reviewedAt).toLocaleString("ar-EG")}
                              </span>
                            )}
                          </div>
                          {a.teacherReply && (
                            <div className="rounded-xl bg-purple-500/5 border border-purple-500/20 p-3 text-xs">
                              <p className="font-bold text-purple-500 mb-1">ملاحظة المعلم:</p>
                              <p className="text-slate-800 dark:text-gray-200">{a.teacherReply}</p>
                            </div>
                          )}
                          {a.aiGrade && (
                            <TeacherAIBlock ai={a.aiGrade} onRetry={() => void retryAI(a.id)} retrying={retryingId === a.id} />
                          )}
                          <div className="flex flex-col sm:flex-row gap-2 pt-1">
                            <input
                              type="text"
                              placeholder={a.status === "PENDING" ? "ملاحظة للطالب (اختياري)..." : "تعديل الملاحظة وإعادة التصحيح..."}
                              value={replyText[a.id] ?? ""}
                              onChange={(e) => setReplyText({ ...replyText, [a.id]: e.target.value })}
                              className="flex-1 rounded-xl border border-slate-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-xs text-slate-900 dark:text-gray-100 focus:outline-none focus:border-purple-400"
                            />
                            <div className="flex gap-2 shrink-0">
                              <button
                                onClick={() => gradeEssay(a.id, "APPROVED")}
                                disabled={gradingId === a.id}
                                className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-white text-xs font-bold disabled:opacity-50"
                              >
                                قبول ✓
                              </button>
                              <button
                                onClick={() => gradeEssay(a.id, "DISAPPROVED")}
                                disabled={gradingId === a.id}
                                className="px-4 py-2 rounded-xl bg-red-500 hover:bg-red-400 text-white text-xs font-bold disabled:opacity-50"
                              >
                                رفض ✗
                              </button>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                          {OPTION_LABELS.filter((l) => (a[`option${l}` as const] || "").trim()).map((label) => {
                            const text = a[`option${label}` as const];
                            const isCorrectOpt = a.correctAnswer === label;
                            const isChosen = a.selectedAnswer === label;
                            return (
                              <div
                                key={label}
                                className={`rounded-xl border px-3 py-2 text-sm ${
                                  isCorrectOpt
                                    ? "border-emerald-500 bg-emerald-500/10 text-emerald-900 dark:text-emerald-100"
                                    : isChosen
                                      ? "border-rose-500 bg-rose-500/10 text-rose-900 dark:text-rose-100"
                                      : "border-slate-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-slate-700 dark:text-gray-300"
                                }`}
                              >
                                <span className="text-xs font-bold opacity-70 me-2">{label}</span>
                                {text}
                                {isChosen && (
                                  <span className="block mt-1 text-[11px] font-bold opacity-80">
                                    {isCorrectOpt ? "إجابة الطالب ✓" : "إجابة الطالب ✗"}
                                  </span>
                                )}
                                {isCorrectOpt && !isChosen && (
                                  <span className="block mt-1 text-[11px] font-bold text-emerald-600 dark:text-emerald-400">الإجابة الصحيحة</span>
                                )}
                              </div>
                            );
                          })}
                          {!a.selectedAnswer && (
                            <p className="sm:col-span-2 text-xs text-rose-500 font-bold">لم يختر الطالب إجابة</p>
                          )}
                        </div>
                      )}
                    </article>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
