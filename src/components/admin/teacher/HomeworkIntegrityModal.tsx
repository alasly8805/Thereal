"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Clock, Copy, EyeOff, ShieldCheck } from "lucide-react";
import {
  Badge,
  Button,
  EmptyState,
  Field,
  Input,
  Modal,
  Notice,
  SkeletonRows,
  Switch,
  Tabs,
  fmtNum,
  readJson,
} from "@/components/admin/ui/kit";
import { useToast } from "@/components/ui/Toast";

export type IntegrityHomework = {
  id: string;
  title: string;
  questionCount: number;
  shuffleQuestions: boolean;
  shuffleChoices: boolean;
  questionsPerStudent: number | null;
  revealAnswers: boolean;
};

type Report = {
  medianMinutes: number | null;
  students: Array<{
    studentId: string;
    name: string;
    score: number | null;
    totalQ: number | null;
    focusLosses: number | null;
    minutes: number | null;
    shuffled: boolean;
    drawn: number | null;
    flags: { leftPage: boolean; veryFast: boolean; similar: number };
  }>;
  pairs: Array<{
    a: { studentId: string; name: string };
    b: { studentId: string; name: string };
    sharedWrong: number;
    bothAnswered: number;
    ratio: number;
  }>;
};

function SettingRow({
  icon,
  title,
  text,
  checked,
  onChange,
}: {
  icon: React.ReactNode;
  title: string;
  text: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="adm-row" style={{ paddingInline: 0 }}>
      <span className="adm-avatar" aria-hidden>{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="font-bold">{title}</p>
        <p className="adm-muted text-[13px]">{text}</p>
      </div>
      <Switch checked={checked} onChange={onChange} label={title} />
    </div>
  );
}

/**
 * Anti-cheating settings for one exam homework, and the integrity report
 * (timing, page exits, copied wrong answers) for the sheets already in.
 */
export function HomeworkIntegrityModal({
  homework,
  initialTab = "settings",
  onClose,
  onSaved,
}: {
  homework: IntegrityHomework;
  initialTab?: "settings" | "report";
  onClose: () => void;
  onSaved: (next: Partial<IntegrityHomework>) => void;
}) {
  const { success: toastSuccess, error: toastError } = useToast();
  const [tab, setTab] = useState<"settings" | "report">(initialTab);
  const [form, setForm] = useState({
    shuffleQuestions: homework.shuffleQuestions,
    shuffleChoices: homework.shuffleChoices,
    revealAnswers: homework.revealAnswers,
    usePool: homework.questionsPerStudent != null,
    pool: String(homework.questionsPerStudent ?? Math.max(1, Math.ceil(homework.questionCount * 0.7))),
  });
  const [saving, setSaving] = useState(false);
  const [report, setReport] = useState<Report | null>(null);
  const [reportError, setReportError] = useState<string | null>(null);

  const loadReport = useCallback(async () => {
    setReportError(null);
    try {
      const res = await fetch(`/api/admin/homework/${homework.id}/integrity`, { credentials: "include" });
      const json = await readJson<Report & { error?: string }>(res);
      if (!res.ok || !json) throw new Error(json?.error || "تعذر تحميل التقرير");
      setReport(json);
    } catch (err) {
      setReportError(err instanceof Error ? err.message : "تعذر تحميل التقرير");
    }
  }, [homework.id]);

  useEffect(() => {
    if (tab === "report" && !report) void loadReport();
  }, [tab, report, loadReport]);

  const poolNumber = Number(form.pool);
  const poolInvalid = form.usePool && (!Number.isInteger(poolNumber) || poolNumber < 1 || poolNumber > homework.questionCount);

  const save = async () => {
    if (poolInvalid) return;
    setSaving(true);
    const payload = {
      homeworkId: homework.id,
      shuffleQuestions: form.shuffleQuestions,
      shuffleChoices: form.shuffleChoices,
      revealAnswers: form.revealAnswers,
      questionsPerStudent: form.usePool ? poolNumber : null,
    };
    try {
      const res = await fetch("/api/admin/homework", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await readJson<{ error?: string; homework?: IntegrityHomework }>(res);
      if (!res.ok) throw new Error(json?.error || "تعذر حفظ الإعدادات");
      onSaved({
        shuffleQuestions: payload.shuffleQuestions,
        shuffleChoices: payload.shuffleChoices,
        revealAnswers: payload.revealAnswers,
        questionsPerStudent: json?.homework?.questionsPerStudent ?? payload.questionsPerStudent,
      });
      toastSuccess("تم حفظ إعدادات منع الغش");
      onClose();
    } catch (err) {
      toastError(err instanceof Error ? err.message : "تعذر حفظ الإعدادات");
    } finally {
      setSaving(false);
    }
  };

  const flagged = report?.students.filter((s) => s.flags.leftPage || s.flags.veryFast || s.flags.similar > 0) ?? [];

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      icon={<ShieldCheck size={20} style={{ color: "var(--brand)" }} />}
      title={`منع الغش — ${homework.title}`}
      description={`${fmtNum(homework.questionCount)} سؤال في البنك`}
      footer={
        tab === "settings" ? (
          <>
            <Button onClick={onClose}>إلغاء</Button>
            <Button variant="primary" loading={saving} disabled={poolInvalid} onClick={() => void save()}>
              حفظ الإعدادات
            </Button>
          </>
        ) : (
          <Button onClick={onClose}>إغلاق</Button>
        )
      }
    >
      <div className="flex flex-col gap-4">
        <Tabs<"settings" | "report">
          label="منع الغش"
          value={tab}
          onChange={setTab}
          items={[
            { id: "settings", label: "الإعدادات" },
            {
              id: "report",
              label: "تقرير النزاهة",
              badge: flagged.length ? <Badge tone="bad">{fmtNum(flagged.length)}</Badge> : undefined,
            },
          ]}
        />

        {tab === "settings" ? (
          <>
            <div className="adm-list">
              <SettingRow
                icon={<Copy size={17} />}
                title="بنك أسئلة: كل طالب ياخد عدد عشوائي من الأسئلة"
                text="حط أسئلة كتير في الواجب، وكل طالب يطلع له جزء منها بس. الدرجة بتتحسب من الأسئلة اللي طلعت له."
                checked={form.usePool}
                onChange={(v) => setForm((f) => ({ ...f, usePool: v }))}
              />
              {form.usePool && (
                <div className="pb-3">
                  <Field
                    label="عدد الأسئلة لكل طالب"
                    error={poolInvalid ? `اكتب رقم من 1 لـ ${homework.questionCount}` : undefined}
                    hint={`من ${fmtNum(homework.questionCount)} سؤال. كل ما البنك أكبر من العدد ده، الطلاب هيتشابهوا أقل.`}
                  >
                    <Input
                      type="number"
                      min={1}
                      max={homework.questionCount}
                      value={form.pool}
                      onChange={(e) => setForm((f) => ({ ...f, pool: e.target.value }))}
                      dir="ltr"
                      style={{ maxWidth: 140 }}
                    />
                  </Field>
                </div>
              )}
              <SettingRow
                icon={<EyeOff size={17} />}
                title="إظهار الإجابات الصحيحة بعد التسليم"
                text="لو قفلتها، الطالب يشوف درجته وإجاباته بس، من غير الحل الصحيح — فمايقدرش يبعته لزمايله اللي لسه ماحلّوش."
                checked={form.revealAnswers}
                onChange={(v) => setForm((f) => ({ ...f, revealAnswers: v }))}
              />
            </div>
            <Notice tone="info">
              التغيير بيطبق على أي محاولة جديدة. الطالب اللي فاتح الواجب دلوقتي بيكمل بنفس الترتيب اللي قدامه، ومفيش إجابة
              بتتصحح غلط. ولما تسمح لطالب بإعادة المحاولة، بياخد ترتيب وأسئلة جديدة.
            </Notice>
          </>
        ) : reportError ? (
          <Notice tone="bad" title="تعذر تحميل التقرير" action={<Button size="sm" onClick={() => void loadReport()}>إعادة</Button>}>
            {reportError}
          </Notice>
        ) : !report ? (
          <SkeletonRows rows={4} />
        ) : report.students.length === 0 ? (
          <EmptyState icon={<ShieldCheck size={22} />} title="لسه مفيش تسليمات" text="التقرير بيظهر أول ما الطلاب يسلّموا." />
        ) : (
          <>
            {report.pairs.length > 0 ? (
              <Notice tone="warn" title={`${fmtNum(report.pairs.length)} حالة إجابات غلط متطابقة`}>
                الطلاب دول اختاروا نفس الإجابة الغلط في أسئلة كتير. الغلط الطبيعي بيتوزع على الاختيارات، فالتطابق ده علامة
                غش محتملة — مش دليل. راجعهم قبل ما تاخد قرار.
              </Notice>
            ) : (
              <Notice tone="ok">مفيش تطابق مريب في الإجابات الغلط بين الطلاب.</Notice>
            )}

            {report.pairs.length > 0 && (
              <div className="adm-table-wrap adm-well">
                <table className="adm-table">
                  <thead>
                    <tr>
                      <th>الطالب الأول</th>
                      <th>الطالب التاني</th>
                      <th className="is-num">غلط متطابق</th>
                      <th className="is-num">نسبة التطابق</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.pairs.map((p) => (
                      <tr key={`${p.a.studentId}-${p.b.studentId}`}>
                        <td>{p.a.name}</td>
                        <td>{p.b.name}</td>
                        <td className="is-num">{fmtNum(p.sharedWrong)}</td>
                        <td className="is-num">{fmtNum(Math.round(p.ratio * 100))}٪</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="adm-table-wrap adm-well">
              <table className="adm-table">
                <thead>
                  <tr>
                    <th>الطالب</th>
                    <th className="is-num">الدرجة</th>
                    <th className="is-num">الوقت</th>
                    <th className="is-num">خرج من الصفحة</th>
                    <th>ملاحظات</th>
                  </tr>
                </thead>
                <tbody>
                  {report.students.map((s) => {
                    const bad = s.flags.leftPage || s.flags.veryFast || s.flags.similar > 0;
                    return (
                      <tr key={s.studentId} className={bad ? "is-bad" : undefined}>
                        <td>{s.name}</td>
                        <td className="is-num">{s.score == null ? "—" : `${fmtNum(Math.round(s.score))}٪`}</td>
                        <td className="is-num">{s.minutes == null ? "—" : `${fmtNum(s.minutes)} د`}</td>
                        <td className="is-num">{s.focusLosses == null ? "—" : fmtNum(s.focusLosses)}</td>
                        <td>
                          <div className="flex flex-wrap gap-1">
                            {s.flags.similar > 0 && <Badge tone="bad" title="إجابات غلط متطابقة مع طالب تاني"><Copy size={12} /> تطابق</Badge>}
                            {s.flags.leftPage && <Badge tone="warn" title="خرج من صفحة الواجب 3 مرات أو أكتر"><AlertTriangle size={12} /> خروج متكرر</Badge>}
                            {s.flags.veryFast && <Badge tone="warn" title="أسرع بكتير من متوسط الفصل"><Clock size={12} /> سريع جداً</Badge>}
                            {s.drawn != null && <Badge tone="neutral">{fmtNum(s.drawn)} سؤال</Badge>}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="adm-hint">
              {report.medianMinutes != null && <>متوسط وقت الحل: {fmtNum(report.medianMinutes)} دقيقة. </>}
              «خرج من الصفحة» بيتسجل للتسليمات الجديدة بس، والتسليمات القديمة بتظهر «—».
            </p>
          </>
        )}
      </div>
    </Modal>
  );
}
