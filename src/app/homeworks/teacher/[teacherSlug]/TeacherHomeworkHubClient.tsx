"use client";

import { useState, useMemo } from "react";
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
};

type HWSubmission = {
  id: string;
  status: string;
  score?: number | null;
  totalQ?: number | null;
  submittedOutput?: string | null;
  fileUrl?: string | null;
  fileName?: string | null;
  allowRetake?: boolean;
  review?: { verdict?: string | null; note?: string | null } | null;
};

export type HomeworkItem = {
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
  courseTitle?: string;
  lessonTitle?: string;
  questions?: HWQuestion[];
  mySubmission?: HWSubmission | null;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function statusBadge(sub?: HWSubmission | null) {
  if (!sub) return { label: "لم يُرسل", color: "bg-slate-500/15 text-slate-400" };
  if (sub.allowRetake) return { label: "🔓 مسموح الإعادة", color: "bg-sky-500/15 text-sky-400" };
  switch (sub.status) {
    case "passed":          return { label: "✅ ناجح",       color: "bg-emerald-500/15 text-emerald-400" };
    case "failed":          return { label: "❌ راسب",        color: "bg-red-500/15 text-red-400" };
    case "review_requested":return { label: "🔍 قيد المراجعة", color: "bg-amber-500/15 text-amber-400" };
    case "pending":         return { label: "⏳ معلق",        color: "bg-blue-500/15 text-blue-400" };
    default:                return { label: sub.status,      color: "bg-slate-500/15 text-slate-400" };
  }
}

const TYPE_LABELS: Record<string, string> = {
  link: "🔗 رابط",
  exam: "📝 اختبار",
  terminal: "💻 كود",
  upload: "📎 رفع ملف",
};

// ─── TerminalForm ────────────────────────────────────────────────────────────

function TerminalForm({ hw, onSuccess }: { hw: HomeworkItem; onSuccess: (sub: HWSubmission) => void }) {
  const [code, setCode] = useState(hw.codeTemplate ?? "");
  const [output, setOutput] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ status: string; explanation?: string } | null>(null);
  const { error: toastError } = useToast();

  const submit = async () => {
    if (!output.trim()) { toastError("أدخل ناتج الكود أولاً"); return; }
    setLoading(true);
    try {
      const res = await fetch(`/api/homework/${hw.id}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ submittedOutput: output }),
      });
      const data = await res.json();
      if (res.ok) {
        setResult({ status: data.status });
        onSuccess(data.submission);
      } else {
        toastError(data.error || "تعذر إرسال الإجابة");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4 mt-4">
      {hw.description && <p className="text-sm text-slate-400">{hw.description}</p>}
      {hw.codeTemplate && (
        <div>
          <p className="text-xs font-semibold text-slate-400 mb-1">💡 الكود البدئي ({hw.codeLanguage}):</p>
          <pre className="bg-slate-900 border border-slate-700 rounded-xl p-4 text-sm text-emerald-300 font-mono overflow-x-auto whitespace-pre-wrap">{hw.codeTemplate}</pre>
        </div>
      )}
      <div>
        <label className="text-xs font-semibold text-slate-400 block mb-1">📋 الكود الذي كتبته (اختياري):</label>
        <textarea
          value={code}
          onChange={e => setCode(e.target.value)}
          rows={6}
          className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-sm text-white font-mono focus:outline-none focus:border-sky-500 transition-colors resize-y"
          placeholder={`# أكتب الكود هنا...`}
          dir="ltr"
        />
      </div>
      <div>
        <label className="text-xs font-semibold text-slate-400 block mb-1">⚡ ناتج الكود (الـ output):</label>
        <textarea
          value={output}
          onChange={e => setOutput(e.target.value)}
          rows={4}
          className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-sm text-emerald-300 font-mono focus:outline-none focus:border-emerald-500 transition-colors resize-y"
          placeholder="الصق ناتج الكود هنا..."
          dir="ltr"
        />
      </div>
      {result && (
        <div className={`rounded-xl p-3 text-sm font-bold ${result.status === "passed" ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30" : result.status === "review_requested" ? "bg-amber-500/15 text-amber-400 border border-amber-500/30" : "bg-red-500/15 text-red-400 border border-red-500/30"}`}>
          {result.status === "passed" ? "✅ أحسنت! الإجابة صحيحة" : result.status === "review_requested" ? "🔍 تم الإرسال — في انتظار مراجعة المعلم" : "❌ الإجابة غير صحيحة، حاول مرة أخرى"}
        </div>
      )}
      <button
        onClick={submit}
        disabled={loading || !output.trim()}
        className="w-full py-3 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-bold text-sm transition-colors disabled:opacity-50"
      >
        {loading ? "⏳ جارٍ الإرسال..." : "🚀 إرسال الإجابة"}
      </button>
    </div>
  );
}

// ─── ExamForm ────────────────────────────────────────────────────────────────

function ExamForm({ hw, onSuccess }: { hw: HomeworkItem; onSuccess: (sub: HWSubmission) => void }) {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState<HWSubmission | null>(null);
  const { error: toastError } = useToast();

  const questions = hw.questions ?? [];
  const allAnswered = questions.every(q => answers[q.id]);

  const submit = async () => {
    if (!allAnswered) { toastError("أجب على جميع الأسئلة أولاً"); return; }
    setLoading(true);
    try {
      const res = await fetch(`/api/homework/${hw.id}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers }),
      });
      const data = await res.json();
      if (res.ok) { setSubmitted(data.submission); onSuccess(data.submission); }
      else toastError(data.error || "تعذر إرسال الإجابة");
    } finally { setLoading(false); }
  };

  if (submitted) {
    const badge = statusBadge(submitted);
    return (
      <div className="mt-4 rounded-xl p-4 border border-slate-700 bg-slate-800/50 text-center space-y-2">
        <span className={`inline-flex px-3 py-1 rounded-full text-sm font-bold ${badge.color}`}>{badge.label}</span>
        {submitted.score != null && <p className="text-white font-bold text-lg">{submitted.score}%</p>}
      </div>
    );
  }

  return (
    <div className="space-y-5 mt-4">
      {hw.description && <p className="text-sm text-slate-400">{hw.description}</p>}
      {questions.map((q, qi) => (
        <div key={q.id} className="rounded-xl border border-slate-700 p-4 space-y-3">
          <p className="text-sm font-semibold text-white">{qi + 1}. {q.question}</p>
          {q.imageUrl && <img src={q.imageUrl} alt="" className="rounded-lg max-h-60 object-contain" />}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {(["A","B","C","D"] as const)
              .filter(opt => !!q[`option${opt}` as "optionA" | "optionB" | "optionC" | "optionD"]?.trim())
              .map(opt => (
              <button
                key={opt}
                onClick={() => setAnswers(a => ({ ...a, [q.id]: opt }))}
                className={`text-right px-3 py-2.5 rounded-xl text-sm border transition-colors ${answers[q.id] === opt ? "bg-sky-600 border-sky-500 text-white font-bold" : "border-slate-700 text-slate-300 hover:border-sky-600"}`}
              >
                ({opt}) {q[`option${opt}` as "optionA" | "optionB" | "optionC" | "optionD"]}
              </button>
            ))}
          </div>
        </div>
      ))}
      <button
        onClick={submit}
        disabled={loading || !allAnswered}
        className="w-full py-3 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-bold text-sm transition-colors disabled:opacity-50"
      >
        {loading ? "⏳ جارٍ الإرسال..." : "✅ تسليم الاختبار"}
      </button>
    </div>
  );
}

// ─── UploadForm ───────────────────────────────────────────────────────────────

function UploadForm({ hw, onSuccess }: { hw: HomeworkItem; onSuccess: (sub: HWSubmission) => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [submitted, setSubmitted] = useState<HWSubmission | null>(null);
  const { error: toastError, success: toastSuccess } = useToast();

  const doSubmit = async () => {
    if (!file) { toastError("اختر ملفاً أولاً"); return; }
    if (file.size > 10 * 1024 * 1024) {
      toastError("حجم الملف يجب ألا يتجاوز 10 ميجابايت");
      return;
    }
    setUploading(true);
    try {
      let upData: { fileUrl: string; fileName: string };
      try {
        upData = await uploadHomeworkFile(hw.id, file);
      } catch (err: unknown) {
        toastError(homeworkUploadNetworkMessage(err));
        return;
      }

      // Step 2: create submission
      const subRes = await fetch(`/api/homework/${hw.id}/submit`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileUrl: upData.fileUrl, fileName: upData.fileName }),
      });
      const subText = await subRes.text();
      let subData: { error?: string; submission?: HWSubmission } = {};
      try { subData = subText ? JSON.parse(subText) : {}; } catch {
        toastError("استجابة غير متوقعة من الخادم، يرجى المحاولة مرة أخرى");
        return;
      }
      if (subRes.ok) {
        setSubmitted(subData.submission ?? null);
        if (subData.submission) onSuccess(subData.submission);
        toastSuccess("تم رفع الملف وإرسال الواجب بنجاح!");
      } else {
        toastError(subData.error || "تعذر إرسال الواجب");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "";
      if (/failed to fetch|networkerror|load failed/i.test(msg)) {
        toastError("تعذر الاتصال بالخادم أثناء رفع الملف. تحقق من اتصال الإنترنت وحجم الملف (حد أقصى 10 ميجابايت) ثم أعد المحاولة");
      } else {
        toastError(msg || "تعذر رفع الملف");
      }
    } finally { setUploading(false); }
  };

  if (submitted) {
    return (
      <div className="mt-4 rounded-xl p-4 border border-slate-700 bg-slate-800/50 text-center">
        <p className="text-sm text-emerald-400 font-bold">📎 تم رفع الملف بنجاح — في انتظار مراجعة المعلم</p>
        <p className="text-xs text-slate-500 mt-1">{submitted.fileName}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 mt-4">
      {hw.description && <p className="text-sm text-slate-400">{hw.description}</p>}
      {hw.allowedFileTypes && (
        <p className="text-xs text-slate-500">الأنواع المسموحة: <span className="text-sky-400 font-mono">{hw.allowedFileTypes}</span></p>
      )}
      <label className="flex flex-col items-center justify-center gap-3 border-2 border-dashed border-slate-600 hover:border-sky-500 rounded-xl p-8 cursor-pointer transition-colors group">
        <span className="text-3xl">📎</span>
        <span className="text-sm text-slate-400 group-hover:text-white transition-colors">
          {file ? file.name : "اضغط لاختيار ملف أو اسحب وأفلت هنا"}
        </span>
        {file && <span className="text-xs text-slate-500">{(file.size / 1024).toFixed(1)} KB</span>}
        <input
          type="file"
          className="hidden"
          accept={hw.allowedFileTypes ? hw.allowedFileTypes.split(",").map(e => `.${e.trim()}`).join(",") : undefined}
          onChange={e => setFile(e.target.files?.[0] ?? null)}
        />
      </label>
      <button
        onClick={doSubmit}
        disabled={uploading || !file}
        className="w-full py-3 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-bold text-sm transition-colors disabled:opacity-50"
      >
        {uploading ? "⏳ جارٍ الرفع..." : "📤 رفع وإرسال"}
      </button>
    </div>
  );
}

// ─── HomeworkCard ────────────────────────────────────────────────────────────

function HomeworkCard({ hw: initHw }: { hw: HomeworkItem }) {
  const [hw, setHw] = useState(initHw);
  const [open, setOpen] = useState(false);

  const badge = statusBadge(hw.mySubmission);
  const isDone =
    ["passed", "failed", "pending", "review_requested"].includes(hw.mySubmission?.status ?? "") &&
    !hw.mySubmission?.allowRetake;

  const handleSuccess = (sub: HWSubmission) => {
    setHw(prev => ({ ...prev, mySubmission: sub }));
  };

  return (
    <div className="rounded-2xl border border-slate-700/60 bg-slate-800/50 backdrop-blur overflow-hidden transition-all hover:border-slate-600">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between gap-3 p-5 text-right hover:bg-slate-700/20 transition-colors"
      >
        <div className="flex items-center gap-3 min-w-0">
          <span className="text-xl shrink-0">{TYPE_LABELS[hw.type]?.split(" ")[0] ?? "📋"}</span>
          <div className="min-w-0">
            <p className="font-bold text-white truncate">{hw.title}</p>
            <p className="text-xs text-slate-500 mt-0.5 truncate">
              {hw.courseTitle && <span>{hw.courseTitle}</span>}
              {hw.lessonTitle && <span> · {hw.lessonTitle}</span>}
              {hw.dueAt && <span> · يُسلَّم {new Date(hw.dueAt).toLocaleDateString("ar-EG")}</span>}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${badge.color}`}>{badge.label}</span>
          <span className="text-xs text-slate-400 px-2 py-1 rounded-lg bg-slate-700/50">{TYPE_LABELS[hw.type]}</span>
          <svg className={`w-4 h-4 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><polyline points="18 15 12 9 6 15" /></svg>
        </div>
      </button>

      {open && (
        <div className="border-t border-slate-700/60 px-5 pb-5">
          {hw.mySubmission?.allowRetake && !isDone && (
            <div className="mt-4 rounded-xl p-4 border border-sky-500/40 bg-sky-950/30 space-y-1">
              <p className="text-sm font-bold text-sky-200">🔓 المعلم فتح لك محاولة تانية — سلّم نسخة جديدة</p>
              {hw.mySubmission.review?.note && (
                <p className="text-xs text-slate-300">ملاحظة المعلم: {hw.mySubmission.review.note}</p>
              )}
            </div>
          )}
          {isDone ? (
            <div className="mt-4 rounded-xl p-4 border border-slate-700 bg-slate-900/40 space-y-2">
              <p className="text-sm font-bold text-slate-300">تفاصيل تسليمك:</p>
              <span className={`inline-flex px-3 py-1 rounded-full text-sm font-bold ${badge.color}`}>{badge.label}</span>
              {hw.mySubmission?.score != null && (
                <p className="text-white font-bold">{hw.mySubmission.score}% ({hw.mySubmission.totalQ} سؤال)</p>
              )}
              {hw.mySubmission?.status === "review_requested" && (
                <p className="text-xs text-amber-400">🕐 إجابتك قيد المراجعة من المعلم. ستُعلَم بالنتيجة قريباً.</p>
              )}
              {hw.mySubmission?.review?.note && (
                <p className="text-xs text-slate-400">ملاحظة المعلم: {hw.mySubmission.review.note}</p>
              )}
            </div>
          ) : hw.type === "link" ? (
            <div className="mt-4">
              {hw.description && <p className="text-sm text-slate-400 mb-3">{hw.description}</p>}
              <a
                href={hw.linkUrl ?? "#"}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-bold text-sm transition-colors"
              >
                🔗 فتح الواجب
              </a>
            </div>
          ) : hw.type === "exam" ? (
            <ExamForm hw={hw} onSuccess={handleSuccess} />
          ) : hw.type === "terminal" ? (
            <TerminalForm hw={hw} onSuccess={handleSuccess} />
          ) : hw.type === "upload" ? (
            <UploadForm hw={hw} onSuccess={handleSuccess} />
          ) : null}
        </div>
      )}
    </div>
  );
}

// ─── Main Hub ────────────────────────────────────────────────────────────────

type FilterStatus = "all" | "pending" | "done" | "review_requested";

export function TeacherHomeworkHubClient({
  teacherName,
  homeworks,
}: {
  teacherName: string;
  homeworks: HomeworkItem[];
}) {
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<FilterStatus>("all");
  const [filterCourse, setFilterCourse] = useState("all");
  const [filterType, setFilterType] = useState("all");

  const courses = useMemo(() => {
    const set = new Set(homeworks.map(h => h.courseTitle ?? "").filter(Boolean));
    return Array.from(set);
  }, [homeworks]);

  const filtered = useMemo(() => {
    return homeworks.filter(hw => {
      if (filterCourse !== "all" && hw.courseTitle !== filterCourse) return false;
      if (filterType !== "all" && hw.type !== filterType) return false;
      if (filterStatus === "pending" && hw.mySubmission && !hw.mySubmission.allowRetake) return false;
      if (filterStatus === "done" && (!hw.mySubmission || hw.mySubmission.allowRetake || !["passed","failed","pending"].includes(hw.mySubmission.status))) return false;
      if (filterStatus === "review_requested" && hw.mySubmission?.status !== "review_requested") return false;
      if (search && !hw.title.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [homeworks, filterCourse, filterType, filterStatus, search]);

  const filterBtn = (val: FilterStatus, label: string, active: FilterStatus) => (
    <button
      onClick={() => setFilterStatus(val)}
      className={`px-4 py-2 rounded-xl text-sm font-bold transition-colors ${filterStatus === val ? "bg-sky-600 text-white" : "bg-slate-800 text-slate-400 hover:text-white"}`}
    >
      {label}
    </button>
  );

  return (
    <div className="min-h-screen bg-[#0d1117] text-white" dir="rtl">
      {/* Header */}
      <div className="border-b border-slate-800 bg-slate-900/80 backdrop-blur sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-black text-white">📚 واجبات {teacherName}</h1>
            <p className="text-xs text-slate-500 mt-0.5">{homeworks.length} واجب متاح لك</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500 font-mono">homework.code-up.tech</span>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-6 space-y-5">
        {/* Filters */}
        <div className="space-y-3">
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="🔍 ابحث عن واجب..."
            className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-sky-500 transition-colors"
          />
          <div className="flex flex-wrap gap-2">
            {filterBtn("all", "الكل", filterStatus)}
            {filterBtn("pending", "لم يُرسل", filterStatus)}
            {filterBtn("done", "مكتمل", filterStatus)}
            {filterBtn("review_requested", "قيد المراجعة", filterStatus)}
          </div>
          <div className="flex flex-wrap gap-2">
            <select
              value={filterCourse}
              onChange={e => setFilterCourse(e.target.value)}
              className="bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-sky-500"
            >
              <option value="all">كل الكورسات</option>
              {courses.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <select
              value={filterType}
              onChange={e => setFilterType(e.target.value)}
              className="bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-sky-500"
            >
              <option value="all">كل الأنواع</option>
              <option value="exam">📝 اختبار</option>
              <option value="terminal">💻 كود</option>
              <option value="upload">📎 رفع ملف</option>
              <option value="link">🔗 رابط</option>
            </select>
          </div>
        </div>

        {/* Cards */}
        {filtered.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-4xl mb-3">📭</p>
            <p className="text-slate-400">لا توجد واجبات تطابق الفلتر المختار</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map(hw => (
              <HomeworkCard key={hw.id} hw={hw} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
