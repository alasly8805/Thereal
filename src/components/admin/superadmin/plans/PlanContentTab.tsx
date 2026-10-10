"use client";

import { useState, useEffect, useCallback } from "react";
import { useToast } from "@/components/ui/Toast";
import { admConfirm } from "@/components/admin/ui/kit";

// ─── Types ─────────────────────────────────────────────────────────────────────

interface Video { id: string; title: string; order: number; lessonIndexInMonth: number | null }
interface Folder { id: string; name: string; monthIndex: number | null; videos: Video[]; quizzes: any[] }
interface Course { id: string; title: string; teacher: { id: string; name: string }; folders: Folder[] }
interface Source { id: string; isDefault: boolean; isManual: boolean; video?: { title: string } }
interface Quiz { id: string; title: string; timeLimitMinutes: number; questions: QuizQuestion[] }
interface QuizQuestion { id: string; question: string; optionA: string; optionB: string; optionC: string; optionD: string; correctAnswer: string; order: number }
interface Lesson { id: string; title: string; order: number; sources: Source[]; quizzes: Quiz[]; requiresQuiz: boolean; requiresHomework: boolean; hasProject: boolean; gatesNextLesson: boolean }

type ActivePanel = "sources" | "quiz";

const emptyQuestion = () => ({ question: "", optionA: "", optionB: "", optionC: "", optionD: "", correctAnswer: "A" });

// ─── PlanContentTab ─────────────────────────────────────────────────────────────

export function PlanContentTab({ planId }: { planId: string }) {
  const { success, error: toastError } = useToast();

  // Course browser state
  const [courses, setCourses] = useState<any[]>([]);
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);
  const [courseDetail, setCourseDetail] = useState<Course | null>(null);
  const [courseSearch, setCourseSearch] = useState("");
  const [loadingCourses, setLoadingCourses] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);

  // Lesson panel state
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [loadingLessons, setLoadingLessons] = useState(true);
  const [selectedLessonId, setSelectedLessonId] = useState<string | null>(null);
  const [activePanel, setActivePanel] = useState<ActivePanel>("sources");

  // Source operations
  const [attachingVideoId, setAttachingVideoId] = useState<string | null>(null);

  // Quiz builder state
  const [quizForm, setQuizForm] = useState({
    title: "",
    timeLimitMinutes: 30,
    questions: [emptyQuestion()],
  });
  const [savingQuiz, setSavingQuiz] = useState(false);
  const [deletingQuizId, setDeletingQuizId] = useState<string | null>(null);

  // ── Fetch courses list ──
  const fetchCourses = useCallback(async () => {
    setLoadingCourses(true);
    try {
      const res = await fetch("/api/admin/superadmin/courses");
      const data = await res.json();
      if (res.ok) setCourses(data.courses || []);
    } finally {
      setLoadingCourses(false);
    }
  }, []);

  // ── Fetch course details ──
  const fetchCourseDetail = useCallback(async (id: string) => {
    setLoadingDetail(true);
    try {
      const res = await fetch(`/api/admin/superadmin/courses/${id}`);
      const data = await res.json();
      if (res.ok) setCourseDetail(data.course);
      else toastError(data.error || "تعذر جلب الدورة");
    } finally {
      setLoadingDetail(false);
    }
  }, []);

  // ── Fetch plan lessons ──
  const fetchLessons = useCallback(async () => {
    setLoadingLessons(true);
    try {
      const res = await fetch(`/api/admin/superadmin/plans/${planId}/lessons`);
      const data = await res.json();
      if (res.ok) setLessons(data.lessons || []);
    } finally {
      setLoadingLessons(false);
    }
  }, [planId]);

  useEffect(() => { fetchCourses(); }, [fetchCourses]);
  useEffect(() => { fetchLessons(); }, [fetchLessons]);

  useEffect(() => {
    if (selectedCourseId) fetchCourseDetail(selectedCourseId);
  }, [selectedCourseId, fetchCourseDetail]);

  // ── Attach video to lesson ──
  const handleAttachVideo = async (video: Video) => {
    if (!selectedLessonId) {
      toastError("اختر درساً أولاً من الجانب الأيمن");
      return;
    }
    setAttachingVideoId(video.id);
    try {
      const res = await fetch(`/api/admin/superadmin/plans/${planId}/lessons/${selectedLessonId}/sources`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videoId: video.id, isDefault: false }),
      });
      const data = await res.json();
      if (res.ok) {
        success(`تم إضافة "${video.title}" كمصدر للدرس ✓`);
        fetchLessons();
      } else {
        toastError(data.error || "فشل إضافة المصدر");
      }
    } finally {
      setAttachingVideoId(null);
    }
  };

  // ── Remove source from lesson ──
  const handleRemoveSource = async (lessonId: string, sourceId: string) => {
    if (!(await admConfirm({ title: "إزالة هذا المصدر من الدرس؟", confirmLabel: "إزالة", danger: true }))) return;
    try {
      const res = await fetch(`/api/admin/superadmin/plans/${planId}/lessons/${lessonId}/sources/${sourceId}`, {
        method: "DELETE",
      });
      if (res.ok) { success("تم إزالة المصدر"); fetchLessons(); }
      else { const d = await res.json(); toastError(d.error || "فشل الحذف"); }
    } catch { toastError("حدث خطأ"); }
  };

  // ── Set default source ──
  const handleSetDefault = async (lessonId: string, sourceId: string) => {
    try {
      const res = await fetch(`/api/admin/superadmin/plans/${planId}/lessons/${lessonId}/sources/${sourceId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isDefault: true }),
      });
      if (res.ok) { success("تم تعيين المصدر الافتراضي ✓"); fetchLessons(); }
      else { const d = await res.json(); toastError(d.error || "فشل التحديث"); }
    } catch { toastError("حدث خطأ"); }
  };

  // ── Create quiz ──
  const handleCreateQuiz = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedLessonId) { toastError("اختر درساً أولاً"); return; }
    if (!quizForm.title.trim()) { toastError("عنوان الاختبار مطلوب"); return; }
    if (quizForm.questions.length === 0) { toastError("أضف سؤالاً واحداً على الأقل"); return; }

    setSavingQuiz(true);
    try {
      const res = await fetch(`/api/admin/superadmin/plans/${planId}/lessons/${selectedLessonId}/quiz`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: quizForm.title,
          timeLimitMinutes: quizForm.timeLimitMinutes,
          questions: quizForm.questions,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        success(`تم إنشاء الاختبار "${quizForm.title}" ✓`);
        setQuizForm({ title: "", timeLimitMinutes: 30, questions: [emptyQuestion()] });
        fetchLessons();
      } else {
        toastError(data.error || "فشل إنشاء الاختبار");
      }
    } finally {
      setSavingQuiz(false);
    }
  };

  // ── Delete quiz ──
  const handleDeleteQuiz = async (quizId: string, lessonId: string) => {
    if (!(await admConfirm({ title: "حذف هذا الاختبار؟", text: "ستُحذف كل أسئلته.", confirmLabel: "حذف", danger: true }))) return;
    setDeletingQuizId(quizId);
    try {
      const res = await fetch(`/api/admin/superadmin/plans/${planId}/lessons/${lessonId}/quiz`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quizId }),
      });
      if (res.ok) { success("تم حذف الاختبار"); fetchLessons(); }
      else { const d = await res.json(); toastError(d.error || "فشل الحذف"); }
    } finally {
      setDeletingQuizId(null);
    }
  };

  const filteredCourses = courses.filter(c =>
    courseSearch.trim() === "" ||
    c.title.toLowerCase().includes(courseSearch.toLowerCase()) ||
    c.teacher?.name?.toLowerCase().includes(courseSearch.toLowerCase())
  );

  const selectedLesson = lessons.find(l => l.id === selectedLessonId);

  // ─── Render ───────────────────────────────────────────────────────────────────

  const inp = "w-full px-3 py-2 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] text-[var(--ink)] text-sm focus:outline-none focus:border-[var(--brand)] transition-all";
  const lbl = "block text-xs font-bold text-[var(--ink-2)] mb-1";

  return (
    <div className="flex flex-col h-full gap-0" dir="rtl">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 h-full">

        {/* ── LEFT: Course & Video Browser ── */}
        <div className="lg:col-span-1 flex flex-col gap-4">
          <div>
            <h3 className="font-black text-sm text-[var(--ink)] mb-2">📚 تصفح محتوى المعلمين</h3>
            <input
              type="text"
              placeholder="بحث عن دورة أو معلم..."
              value={courseSearch}
              onChange={e => setCourseSearch(e.target.value)}
              className={inp}
            />
          </div>

          {/* Course list */}
          <div className="flex flex-col gap-1.5 max-h-52 overflow-y-auto">
            {loadingCourses ? (
              <p className="text-xs text-[var(--ink-3)] text-center py-4">جارٍ التحميل...</p>
            ) : filteredCourses.length === 0 ? (
              <p className="text-xs text-[var(--ink-3)] text-center py-4">لا توجد دورات</p>
            ) : filteredCourses.map(c => (
              <button
                key={c.id}
                onClick={() => { setSelectedCourseId(c.id); setCourseDetail(null); }}
                className={`text-right px-3 py-2 rounded-xl text-sm border transition-all ${
                  selectedCourseId === c.id
                    ? "border-[color-mix(in_srgb,var(--info)_32%,transparent)] bg-[var(--info-soft)] text-[var(--info)] font-bold"
                    : "border-[var(--border)] text-[var(--ink)] hover:border-[color-mix(in_srgb,var(--info)_32%,transparent)]"
                }`}
              >
                <div className="font-semibold truncate">{c.title}</div>
                <div className="text-xs opacity-70 mt-0.5">{c.teacher?.name}</div>
              </button>
            ))}
          </div>

          {/* Course folders & videos */}
          {selectedCourseId && (
            <div className="flex-1 overflow-y-auto border rounded-2xl" style={{ borderColor: "var(--border)" }}>
              {loadingDetail ? (
                <p className="text-xs text-center py-6 text-[var(--ink-3)]">جارٍ تحميل الدورة...</p>
              ) : !courseDetail ? null : (
                <div>
                  <div className="px-4 py-3 border-b bg-[var(--surface-2)] sticky top-0" style={{ borderColor: "var(--border)" }}>
                    <p className="font-black text-xs text-[var(--ink)]">{courseDetail.title}</p>
                    <p className="text-xs text-[var(--ink-3)]">{courseDetail.teacher.name} · {courseDetail.folders.length} محاضرة</p>
                  </div>

                  {courseDetail.folders.map(folder => (
                    <div key={folder.id}>
                      <div className="px-4 py-2 bg-[var(--info-soft)] border-b" style={{ borderColor: "var(--border)" }}>
                        <p className="text-xs font-black text-[var(--info)]">📁 {folder.name}</p>
                        <p className="text-xs text-[var(--ink-3)]">{folder.videos.length} فيديو</p>
                      </div>
                      <div className="divide-y" style={{ borderColor: "var(--border)" }}>
                        {folder.videos.map(video => {
                          const isAlreadyAttached = selectedLesson?.sources?.some(s => s.video?.title === video.title);
                          return (
                            <div key={video.id} className="px-4 py-2.5 flex items-center gap-2 hover:bg-[var(--adm-hover)]">
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-semibold text-[var(--ink)] truncate">{video.title}</p>
                                {video.lessonIndexInMonth && (
                                  <p className="text-xs text-[var(--ink-3)]">درس {video.lessonIndexInMonth}</p>
                                )}
                              </div>
                              <button
                                onClick={() => handleAttachVideo(video)}
                                disabled={attachingVideoId === video.id || !selectedLessonId}
                                title={!selectedLessonId ? "اختر درساً أولاً" : "إضافة كمصدر للدرس المختار"}
                                className={`text-xs px-2 py-1 rounded-lg font-bold border-none cursor-pointer transition-colors shrink-0 ${
                                  !selectedLessonId
                                    ? "bg-[var(--surface-2)] text-[var(--ink-2)] cursor-not-allowed"
                                    : isAlreadyAttached
                                    ? "bg-[var(--ok-soft)] text-[var(--ok)] cursor-default"
                                    : attachingVideoId === video.id
                                    ? "bg-[var(--info-soft)] text-[var(--info)]"
                                    : "bg-[var(--brand)] hover:bg-[var(--brand-strong)] text-[var(--on-brand)]"
                                }`}
                              >
                                {isAlreadyAttached ? "✓ مضاف" : attachingVideoId === video.id ? "..." : "إضافة →"}
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── RIGHT: Lesson Panel ── */}
        <div className="lg:col-span-2 flex flex-col gap-4">

          {/* Lesson selector */}
          <div>
            <h3 className="font-black text-sm text-[var(--ink)] mb-2">🎯 دروس الخطة — اختر درساً لتعديله</h3>
            {loadingLessons ? (
              <p className="text-xs text-[var(--ink-3)] py-4 text-center">جارٍ التحميل...</p>
            ) : lessons.length === 0 ? (
              <div className="text-center py-8 text-[var(--ink-3)] text-sm border border-dashed rounded-xl" style={{ borderColor: "var(--border)" }}>
                لا توجد دروس — أضف دروساً من تبويب "محتوى الدروس" أولاً
              </div>
            ) : (
              <div className="flex flex-col gap-1.5 max-h-48 overflow-y-auto">
                {lessons.map((lesson, idx) => (
                  <button
                    key={lesson.id}
                    onClick={() => { setSelectedLessonId(lesson.id); setActivePanel("sources"); }}
                    className={`text-right px-4 py-2.5 rounded-xl border transition-all flex items-center gap-3 ${
                      selectedLessonId === lesson.id
                        ? "border-[color-mix(in_srgb,var(--ok)_32%,transparent)] bg-[var(--ok-soft)]"
                        : "border-[var(--border)] hover:border-[color-mix(in_srgb,var(--ok)_32%,transparent)]"
                    }`}
                  >
                    <span className={`w-7 h-7 rounded-full font-black text-xs flex items-center justify-center shrink-0 ${
                      selectedLessonId === lesson.id ? "bg-emerald-500 text-white" : "bg-[var(--surface-2)] text-[var(--ink-2)]"
                    }`}>{idx + 1}</span>
                    <div className="flex-1 min-w-0">
                      <p className={`font-bold text-sm truncate ${selectedLessonId === lesson.id ? "text-[var(--ok)]" : "text-[var(--ink)]"}`}>{lesson.title}</p>
                      <div className="flex gap-1 mt-0.5">
                        <span className={`text-xs font-semibold px-1.5 py-0.5 rounded-full ${lesson.sources.length > 0 ? "bg-[var(--ok-soft)] text-[var(--ok)]" : "bg-[var(--danger-soft)] text-[var(--danger)]"}`}>
                          {lesson.sources.length} مصدر
                        </span>
                        <span className={`text-xs font-semibold px-1.5 py-0.5 rounded-full ${lesson.quizzes.length > 0 ? "bg-[var(--warn-soft)] text-[var(--warn)]" : "bg-[var(--surface-2)] text-[var(--ink-3)]"}`}>
                          {lesson.quizzes.length} اختبار
                        </span>
                      </div>
                    </div>
                    {lesson.sources.some(s => s.isDefault) && (
                      <span className="text-xs text-[var(--ok)] font-bold shrink-0">✓ مكتمل</span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Selected lesson content */}
          {selectedLesson && (
            <div className="flex-1 border rounded-2xl overflow-hidden" style={{ borderColor: "var(--border)" }}>
              {/* Header */}
              <div className="p-4 border-b bg-[var(--surface-2)] flex items-center gap-3" style={{ borderColor: "var(--border)" }}>
                <div className="flex-1">
                  <h4 className="font-black text-[var(--ink)] text-sm">{selectedLesson.title}</h4>
                </div>
                <div className="flex gap-1">
                  <button
                    onClick={() => setActivePanel("sources")}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold border-none cursor-pointer transition-colors ${
                      activePanel === "sources" ? "bg-[var(--brand)] text-[var(--on-brand)]" : "bg-[var(--surface)] text-[var(--ink-2)] hover:bg-[var(--surface-2)]"
                    }`}
                  >
                    🎬 مصادر الفيديو
                  </button>
                  <button
                    onClick={() => setActivePanel("quiz")}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold border-none cursor-pointer transition-colors ${
                      activePanel === "quiz" ? "bg-orange-500 text-white" : "bg-[var(--surface)] text-[var(--ink-2)] hover:bg-[var(--surface-2)]"
                    }`}
                  >
                    📝 اختبار (Quiz)
                  </button>
                </div>
              </div>

              <div className="p-5 overflow-y-auto max-h-[580px]">

                {/* ── SOURCES PANEL ── */}
                {activePanel === "sources" && (
                  <div className="space-y-4">
                    <p className="text-xs text-[var(--ink-3)]">اختر فيديو من الجانب الأيسر ثم اضغط "إضافة →" لربطه بهذا الدرس. يجب تعيين مصدر افتراضي واحد لنشر الخطة.</p>

                    {selectedLesson.sources.length === 0 ? (
                      <div className="text-center py-10 border border-dashed rounded-xl text-[var(--ink-3)] text-sm" style={{ borderColor: "var(--border)" }}>
                        <div className="text-3xl mb-2">🎬</div>
                        لا يوجد مصادر فيديو — اضغط فيديو من القائمة على اليسار
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {selectedLesson.sources.map(source => (
                          <div
                            key={source.id}
                            className={`flex items-center gap-3 p-3 rounded-xl border transition-all ${
                              source.isDefault ? "border-[color-mix(in_srgb,var(--ok)_32%,transparent)] bg-[var(--ok-soft)]" : "border-[var(--border)]"
                            }`}
                          >
                            <div className="text-lg">{source.isDefault ? "✅" : "🎬"}</div>
                            <div className="flex-1 min-w-0">
                              <p className="font-bold text-sm text-[var(--ink)] truncate">{source.video?.title || "فيديو"}</p>
                              <p className="text-xs text-[var(--ink-3)]">
                                {source.isDefault ? "الافتراضي — سيُعرض هذا للطالب" : source.isManual ? "يدوي" : "تلقائي"}
                              </p>
                            </div>
                            <div className="flex gap-1.5 shrink-0">
                              {!source.isDefault && (
                                <button
                                  onClick={() => handleSetDefault(selectedLesson.id, source.id)}
                                  className="text-xs px-2 py-1 rounded-lg bg-[var(--ok-soft)] hover:bg-[color-mix(in_srgb,var(--ok)_18%,transparent)] text-[var(--ok)] font-bold border-none cursor-pointer"
                                >
                                  تعيين افتراضي
                                </button>
                              )}
                              <button
                                onClick={() => handleRemoveSource(selectedLesson.id, source.id)}
                                className="text-xs px-2 py-1 rounded-lg bg-[var(--danger-soft)] hover:bg-[color-mix(in_srgb,var(--danger)_18%,transparent)] text-[var(--danger)] font-bold border-none cursor-pointer"
                              >
                                إزالة
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* ── QUIZ PANEL ── */}
                {activePanel === "quiz" && (
                  <div className="space-y-5">
                    {/* Existing quizzes */}
                    {selectedLesson.quizzes.length > 0 && (
                      <div className="space-y-2">
                        <h5 className="text-xs font-black text-[var(--ink-2)] uppercase tracking-wide">الاختبارات المرتبطة</h5>
                        {selectedLesson.quizzes.map(quiz => (
                          <div key={quiz.id} className="flex items-center gap-3 p-3 rounded-xl border border-[color-mix(in_srgb,var(--warn)_32%,transparent)] bg-[var(--warn-soft)]">
                            <div className="text-lg">📝</div>
                            <div className="flex-1 min-w-0">
                              <p className="font-bold text-sm text-[var(--ink)]">{quiz.title}</p>
                              <p className="text-xs text-[var(--ink-3)]">
                                {quiz.questions?.length ?? 0} سؤال · {quiz.timeLimitMinutes} دقيقة
                              </p>
                            </div>
                            <button
                              onClick={() => handleDeleteQuiz(quiz.id, selectedLesson.id)}
                              disabled={deletingQuizId === quiz.id}
                              className="text-xs px-2 py-1 rounded-lg bg-[var(--danger-soft)] hover:bg-[color-mix(in_srgb,var(--danger)_18%,transparent)] text-[var(--danger)] font-bold border-none cursor-pointer disabled:opacity-50"
                            >
                              {deletingQuizId === quiz.id ? "..." : "حذف"}
                            </button>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Quiz creation form */}
                    <form onSubmit={handleCreateQuiz} className="space-y-4 border border-dashed rounded-2xl p-5" style={{ borderColor: "var(--border)" }}>
                      <h5 className="font-black text-sm text-[var(--ink)]">+ إنشاء اختبار جديد</h5>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className={lbl}>عنوان الاختبار *</label>
                          <input
                            type="text"
                            required
                            value={quizForm.title}
                            onChange={e => setQuizForm(f => ({ ...f, title: e.target.value }))}
                            className={inp}
                            placeholder="مثال: اختبار الدرس الأول"
                          />
                        </div>
                        <div>
                          <label className={lbl}>مدة الاختبار (دقيقة)</label>
                          <input
                            type="number"
                            min={1} max={240}
                            value={quizForm.timeLimitMinutes}
                            onChange={e => setQuizForm(f => ({ ...f, timeLimitMinutes: Number(e.target.value) || 30 }))}
                            className={inp}
                            dir="ltr"
                          />
                        </div>
                      </div>

                      {/* Questions */}
                      <div className="space-y-3">
                        <label className={lbl}>الأسئلة</label>
                        {quizForm.questions.map((q, qi) => (
                          <div key={qi} className="border border-[var(--border)] rounded-xl p-4 space-y-2.5 bg-[var(--surface-2)]">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-black text-[var(--ink-2)]">سؤال {qi + 1}</span>
                              {quizForm.questions.length > 1 && (
                                <button
                                  type="button"
                                  onClick={() => setQuizForm(f => ({ ...f, questions: f.questions.filter((_, i) => i !== qi) }))}
                                  className="text-xs text-[var(--danger)] hover:underline bg-transparent border-none cursor-pointer"
                                >
                                  حذف
                                </button>
                              )}
                            </div>

                            <input
                              required
                              value={q.question}
                              onChange={e => {
                                const qs = [...quizForm.questions];
                                qs[qi] = { ...qs[qi], question: e.target.value };
                                setQuizForm(f => ({ ...f, questions: qs }));
                              }}
                              className={inp}
                              placeholder="نص السؤال *"
                            />

                            <div className="grid grid-cols-2 gap-2">
                              {(["A", "B", "C", "D"] as const).map(opt => (
                                <div key={opt} className="flex gap-1.5 items-center">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const qs = [...quizForm.questions];
                                      qs[qi] = { ...qs[qi], correctAnswer: opt };
                                      setQuizForm(f => ({ ...f, questions: qs }));
                                    }}
                                    className={`w-6 h-6 rounded-full text-xs font-black shrink-0 transition-colors border-none cursor-pointer ${
                                      q.correctAnswer === opt
                                        ? "bg-emerald-500 text-white"
                                        : "bg-[var(--border)] text-[var(--ink-3)] hover:bg-[color-mix(in_srgb,var(--ok)_18%,transparent)]"
                                    }`}
                                  >
                                    {opt}
                                  </button>
                                  <input
                                    value={(q as any)[`option${opt}`]}
                                    onChange={e => {
                                      const qs = [...quizForm.questions];
                                      (qs[qi] as any)[`option${opt}`] = e.target.value;
                                      setQuizForm(f => ({ ...f, questions: qs }));
                                    }}
                                    className={`${inp} flex-1 text-xs`}
                                    placeholder={`الخيار ${opt}`}
                                  />
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}

                        <button
                          type="button"
                          onClick={() => setQuizForm(f => ({ ...f, questions: [...f.questions, emptyQuestion()] }))}
                          className="text-sm text-[var(--info)] hover:text-[var(--info)] bg-transparent border-none cursor-pointer font-bold"
                        >
                          + إضافة سؤال
                        </button>
                      </div>

                      <button
                        type="submit"
                        disabled={savingQuiz}
                        className="w-full py-2.5 bg-orange-500 hover:bg-orange-600 text-white font-bold rounded-xl text-sm border-none cursor-pointer disabled:opacity-50 transition-colors"
                      >
                        {savingQuiz ? "جارٍ الحفظ..." : "💾 حفظ الاختبار"}
                      </button>
                    </form>
                  </div>
                )}
              </div>
            </div>
          )}

          {!selectedLesson && lessons.length > 0 && (
            <div className="flex-1 flex items-center justify-center text-[var(--ink-3)] text-sm border border-dashed rounded-2xl py-16" style={{ borderColor: "var(--border)" }}>
              <div className="text-center">
                <div className="text-4xl mb-3">👆</div>
                <p>اختر درساً من القائمة أعلاه لإدارة مصادره واختباراته</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
