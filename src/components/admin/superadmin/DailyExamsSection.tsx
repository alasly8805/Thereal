"use client";
import { useCallback, useEffect, useState } from "react";
import { ArrowRight, BarChart3, CalendarDays, CheckCircle2, ListChecks, Plus, Trash2, Trophy } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { EDUCATIONAL_STAGES } from "@/types";
import {
  Badge,
  Button,
  EmptyState,
  Field,
  IconButton,
  Input,
  Modal,
  Notice,
  PageHeader,
  Panel,
  Select,
  SkeletonRows,
  Switch,
  Textarea,
  fmtDate,
  fmtNum,
  readJson,
} from "@/components/admin/ui/kit";

interface Question {
  id: string;
  question: string;
  optionA: string;
  optionB: string;
  optionC: string;
  optionD: string;
  correctAnswer: string;
}

interface DailyExam {
  id: string;
  title: string;
  educationalStage: string;
  date: string;
  timeLimitMinutes: number;
  isActive: boolean;
  _count?: { questions: number; results: number };
  questions?: Question[];
}

const LETTERS: Array<{ key: "A" | "B" | "C" | "D"; ar: string; field: keyof Question }> = [
  { key: "A", ar: "أ", field: "optionA" },
  { key: "B", ar: "ب", field: "optionB" },
  { key: "C", ar: "ج", field: "optionC" },
  { key: "D", ar: "د", field: "optionD" },
];

const EMPTY_Q = { question: "", optionA: "", optionB: "", optionC: "", optionD: "", correctAnswer: "A" };

function stageLabel(v: string) {
  return EDUCATIONAL_STAGES.find((s) => s.value === v)?.label ?? v;
}

export function DailyExamsSection() {
  const { success, error } = useToast();
  const [exams, setExams] = useState<DailyExam[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [newExam, setNewExam] = useState({ title: "", educationalStage: "sec_1", date: "", timeLimitMinutes: "30" });
  const [creating, setCreating] = useState(false);
  const [selectedExam, setSelectedExam] = useState<DailyExam | null>(null);
  const [newQuestion, setNewQuestion] = useState(EMPTY_Q);
  const [addingQ, setAddingQ] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{ kind: "exam"; exam: DailyExam } | { kind: "question"; q: Question } | null>(null);

  const fetchExams = useCallback(async () => {
    setLoadError("");
    try {
      const res = await fetch("/api/admin/superadmin/daily-exams", { credentials: "include" });
      const data = await readJson<{ exams?: DailyExam[]; error?: string }>(res);
      if (!res.ok) {
        setLoadError(data?.error || "تعذر تحميل الامتحانات");
        return;
      }
      setExams(data?.exams ?? []);
    } catch {
      setLoadError("تعذر الاتصال بالخادم");
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchExamDetails = async (id: string) => {
    setBusyId(`open:${id}`);
    try {
      const res = await fetch(`/api/admin/superadmin/daily-exams/${id}`, { credentials: "include" });
      const data = await readJson<{ exam?: DailyExam; error?: string }>(res);
      if (!res.ok || !data?.exam) throw new Error(data?.error || "تعذر فتح الامتحان");
      setSelectedExam(data.exam);
    } catch (e) {
      error(e instanceof Error ? e.message : "تعذر فتح الامتحان");
    } finally {
      setBusyId(null);
    }
  };

  useEffect(() => {
    void fetchExams();
  }, [fetchExams]);

  const handleCreateExam = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    try {
      const res = await fetch("/api/admin/superadmin/daily-exams", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...newExam, timeLimitMinutes: parseInt(newExam.timeLimitMinutes, 10) || 30 }),
      });
      const data = await readJson<{ error?: string; exam?: DailyExam }>(res);
      if (!res.ok) throw new Error(data?.error || "تعذر إنشاء الامتحان");
      success("أُنشئ الامتحان — أضف أسئلته الآن");
      setNewExam({ title: "", educationalStage: newExam.educationalStage, date: "", timeLimitMinutes: "30" });
      await fetchExams();
      if (data?.exam?.id) void fetchExamDetails(data.exam.id);
    } catch (err) {
      error(err instanceof Error ? err.message : "تعذر إنشاء الامتحان");
    } finally {
      setCreating(false);
    }
  };

  const handleToggleStatus = async (exam: DailyExam) => {
    setBusyId(`toggle:${exam.id}`);
    try {
      const res = await fetch(`/api/admin/superadmin/daily-exams/${exam.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !exam.isActive }),
      });
      if (!res.ok) throw new Error((await readJson<{ error?: string }>(res))?.error || "تعذر تغيير الحالة");
      setExams((prev) => prev.map((x) => (x.id === exam.id ? { ...x, isActive: !x.isActive } : x)));
      success(exam.isActive ? "عُطّل الامتحان" : "فُعّل الامتحان");
    } catch (e) {
      error(e instanceof Error ? e.message : "تعذر تغيير الحالة");
    } finally {
      setBusyId(null);
    }
  };

  const handleAddQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedExam) return;
    setAddingQ(true);
    try {
      const res = await fetch(`/api/admin/superadmin/daily-exams/${selectedExam.id}/questions`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newQuestion),
      });
      const data = await readJson<{ error?: string }>(res);
      if (!res.ok) throw new Error(data?.error || "تعذر إضافة السؤال");
      success("أُضيف السؤال");
      setNewQuestion(EMPTY_Q);
      void fetchExamDetails(selectedExam.id);
      void fetchExams();
    } catch (err) {
      error(err instanceof Error ? err.message : "تعذر إضافة السؤال");
    } finally {
      setAddingQ(false);
    }
  };

  const runConfirm = async () => {
    const c = confirm;
    if (!c) return;
    setBusyId("confirm");
    try {
      const url = c.kind === "exam" ? `/api/admin/superadmin/daily-exams/${c.exam.id}` : `/api/admin/superadmin/daily-exams/questions/${c.q.id}`;
      const res = await fetch(url, { method: "DELETE", credentials: "include" });
      if (!res.ok) throw new Error((await readJson<{ error?: string }>(res))?.error || "تعذر الحذف");
      success(c.kind === "exam" ? "حُذف الامتحان" : "حُذف السؤال");
      setConfirm(null);
      if (c.kind === "exam" && selectedExam?.id === c.exam.id) setSelectedExam(null);
      if (c.kind === "question" && selectedExam) void fetchExamDetails(selectedExam.id);
      void fetchExams();
    } catch (e) {
      error(e instanceof Error ? e.message : "تعذر الحذف");
    } finally {
      setBusyId(null);
    }
  };

  const confirmModal = (
    <Modal
      open={!!confirm}
      onClose={() => busyId !== "confirm" && setConfirm(null)}
      size="sm"
      title={confirm?.kind === "exam" ? "حذف الامتحان؟" : "حذف السؤال؟"}
      description={confirm?.kind === "exam" ? `سيُحذف "${confirm.exam.title}" بأسئلته ونتائجه.` : "سيُحذف السؤال من الامتحان."}
      footer={
        <>
          <Button onClick={() => setConfirm(null)} disabled={busyId === "confirm"}>إلغاء</Button>
          <Button variant="danger-solid" loading={busyId === "confirm"} onClick={() => void runConfirm()}>حذف</Button>
        </>
      }
    />
  );

  /* ── Question editor view ── */
  if (selectedExam) {
    const questions = selectedExam.questions ?? [];
    return (
      <div dir="rtl" className="flex flex-col gap-5">
        <Button variant="ghost" size="sm" icon={<ArrowRight size={15} />} onClick={() => setSelectedExam(null)} className="self-start">
          كل الامتحانات
        </Button>
        <PageHeader
          title={selectedExam.title}
          description={`${fmtDate(selectedExam.date)} · ${stageLabel(selectedExam.educationalStage)} · ${fmtNum(selectedExam.timeLimitMinutes)} دقيقة`}
          actions={
            <a href={`/adminpanel/superadmin/daily-exams/${selectedExam.id}/results`} className="adm-btn">
              <BarChart3 size={15} aria-hidden /> النتائج
            </a>
          }
        />
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)] items-start">
          <Panel title="سؤال جديد" icon={<Plus size={16} />}>
            <form onSubmit={handleAddQuestion} className="flex flex-col gap-3">
              <Field label="نص السؤال" htmlFor="dq-text">
                <Textarea id="dq-text" rows={3} required value={newQuestion.question} onChange={(e) => setNewQuestion({ ...newQuestion, question: e.target.value })} />
              </Field>
              {LETTERS.map((l) => (
                <Field key={l.key} label={`الخيار ${l.ar}`} htmlFor={`dq-${l.key}`}>
                  <Input
                    id={`dq-${l.key}`}
                    required
                    value={newQuestion[l.field as keyof typeof newQuestion]}
                    onChange={(e) => setNewQuestion({ ...newQuestion, [l.field]: e.target.value })}
                  />
                </Field>
              ))}
              <Field label="الإجابة الصحيحة" htmlFor="dq-correct">
                <Select id="dq-correct" value={newQuestion.correctAnswer} onChange={(e) => setNewQuestion({ ...newQuestion, correctAnswer: e.target.value })}>
                  {LETTERS.map((l) => (
                    <option key={l.key} value={l.key}>الخيار {l.ar}</option>
                  ))}
                </Select>
              </Field>
              <Button type="submit" variant="primary" loading={addingQ}>إضافة السؤال</Button>
            </form>
          </Panel>

          <Panel title={`الأسئلة (${fmtNum(questions.length)})`} icon={<ListChecks size={16} />} padded={questions.length === 0}>
            {questions.length === 0 ? (
              <EmptyState title="لا توجد أسئلة بعد" text="أضف أول سؤال من النموذج. الطلاب يرون الامتحان عند تفعيله ووجود أسئلة." />
            ) : (
              <ol className="adm-list">
                {questions.map((q, i) => (
                  <li key={q.id} className="px-[18px] py-4 flex flex-col gap-3">
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-sm font-bold leading-relaxed">
                        <span className="adm-muted adm-num me-1">{fmtNum(i + 1)}.</span>
                        {q.question}
                      </p>
                      <IconButton label="حذف السؤال" size="sm" onClick={() => setConfirm({ kind: "question", q })} style={{ color: "var(--danger)" }}>
                        <Trash2 size={15} />
                      </IconButton>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[13px]">
                      {LETTERS.map((l) => {
                        const correct = q.correctAnswer === l.key;
                        return (
                          <div
                            key={l.key}
                            className="rounded-[10px] px-3 py-2 flex items-start gap-2"
                            style={{
                              background: correct ? "var(--ok-soft)" : "var(--surface-2)",
                              border: `1px solid ${correct ? "color-mix(in srgb, var(--ok) 40%, transparent)" : "var(--border)"}`,
                            }}
                          >
                            <b style={{ color: correct ? "var(--ok)" : "var(--ink-3)" }}>{l.ar}</b>
                            <span className="flex-1">{q[l.field] as string}</span>
                            {correct && <CheckCircle2 size={14} style={{ color: "var(--ok)" }} aria-label="الإجابة الصحيحة" />}
                          </div>
                        );
                      })}
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </Panel>
        </div>
        {confirmModal}
      </div>
    );
  }

  /* ── List view ── */
  return (
    <div dir="rtl" className="flex flex-col gap-5">
      <PageHeader title="امتحانات لوحة الشرف" description="التحديات اليومية لكل صف. الطلاب يحلّونها في وقت محدد، وتظهر نتائجهم في لوحة الشرف." />

      <Panel title="امتحان جديد" icon={<Trophy size={16} />}>
        <form onSubmit={handleCreateExam} className="grid gap-4 items-end" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 170px), 1fr))" }}>
          <Field label="العنوان" htmlFor="de-title" className="col-span-full sm:col-span-2">
            <Input id="de-title" required value={newExam.title} onChange={(e) => setNewExam({ ...newExam, title: e.target.value })} placeholder="التحدي اليومي — الاثنين" />
          </Field>
          <Field label="الصف" htmlFor="de-stage">
            <Select id="de-stage" value={newExam.educationalStage} onChange={(e) => setNewExam({ ...newExam, educationalStage: e.target.value })}>
              {EDUCATIONAL_STAGES.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </Select>
          </Field>
          <Field label="التاريخ" htmlFor="de-date">
            <Input id="de-date" type="date" required value={newExam.date} onChange={(e) => setNewExam({ ...newExam, date: e.target.value })} />
          </Field>
          <Field label="المدة (دقائق)" htmlFor="de-mins">
            <Input id="de-mins" type="number" min="1" required mono value={newExam.timeLimitMinutes} onChange={(e) => setNewExam({ ...newExam, timeLimitMinutes: e.target.value })} />
          </Field>
          <Button type="submit" variant="primary" loading={creating}>إنشاء</Button>
        </form>
      </Panel>

      <Panel padded={false} title={`الامتحانات (${fmtNum(exams.length)})`}>
        {loadError ? (
          <div className="p-4"><Notice tone="bad" title={loadError} action={<Button size="sm" onClick={() => void fetchExams()}>إعادة المحاولة</Button>} /></div>
        ) : loading ? (
          <SkeletonRows rows={4} h={56} />
        ) : exams.length === 0 ? (
          <EmptyState icon={<Trophy size={22} />} title="لا توجد امتحانات" text="أنشئ أول تحدٍّ يومي من النموذج بالأعلى." />
        ) : (
          <ul className="adm-list">
            {exams.map((exam) => {
              const noQuestions = (exam._count?.questions ?? 0) === 0;
              return (
                <li key={exam.id} className="adm-row">
                  <div className="min-w-0 flex-1 basis-64">
                    <p className="text-sm font-bold flex flex-wrap items-center gap-2">
                      {exam.title}
                      <Badge>{stageLabel(exam.educationalStage)}</Badge>
                      {!exam.isActive && <Badge tone="bad">معطل</Badge>}
                      {exam.isActive && noQuestions && <Badge tone="warn">بلا أسئلة</Badge>}
                    </p>
                    <p className="text-xs adm-muted mt-1 flex flex-wrap gap-x-3">
                      <span className="inline-flex items-center gap-1"><CalendarDays size={12} aria-hidden /> {fmtDate(exam.date)}</span>
                      <span>{fmtNum(exam.timeLimitMinutes)} دقيقة</span>
                      <span>{fmtNum(exam._count?.questions ?? 0)} سؤال</span>
                      <span>{fmtNum(exam._count?.results ?? 0)} مشارك</span>
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Button size="sm" variant="primary" loading={busyId === `open:${exam.id}`} onClick={() => void fetchExamDetails(exam.id)}>الأسئلة</Button>
                    <a href={`/adminpanel/superadmin/daily-exams/${exam.id}/results`} className="adm-btn is-sm is-ghost">النتائج</a>
                    <Switch checked={exam.isActive} onChange={() => void handleToggleStatus(exam)} disabled={busyId === `toggle:${exam.id}`} label={`تفعيل ${exam.title}`} />
                    <IconButton label="حذف الامتحان" size="sm" onClick={() => setConfirm({ kind: "exam", exam })} style={{ color: "var(--danger)" }}>
                      <Trash2 size={15} />
                    </IconButton>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>
      {confirmModal}
    </div>
  );
}
