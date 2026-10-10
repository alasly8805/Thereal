"use client";

import { useCallback, useEffect, useState } from "react";
import { ClipboardCheck, FileText, RefreshCw } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { Badge, Button, EmptyState, Field, Input, Modal, Notice, Panel, SkeletonRows, Textarea, fmtDateTime, fmtNum, readJson } from "@/components/admin/ui/kit";

interface Submission {
  id: string;
  content: string;
  fileUrl: string | null;
  status: string;
  submittedAt?: string;
  student?: { id: string; name: string; email: string };
  planLesson?: { title: string } | null;
}

export function GradingQueue() {
  const { success, error: toastError } = useToast();
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [target, setTarget] = useState<Submission | null>(null);
  const [grade, setGrade] = useState("");
  const [feedback, setFeedback] = useState("");
  const [saving, setSaving] = useState<"graded" | "failed" | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const res = await fetch("/api/admin/plan-submissions?status=pending", { credentials: "include" });
      const data = await readJson<{ submissions?: Submission[]; error?: string }>(res);
      if (!res.ok) {
        setLoadError(data?.error || "تعذر جلب المشاريع");
        return;
      }
      setSubmissions(data?.submissions || []);
    } catch {
      setLoadError("تعذر الاتصال بالخادم");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const open = (s: Submission) => {
    setTarget(s);
    setGrade("");
    setFeedback("");
  };

  const submitGrade = async (status: "graded" | "failed") => {
    if (!target) return;
    const g = grade.trim() === "" ? undefined : Number(grade);
    if (status === "graded" && (g === undefined || !Number.isFinite(g) || g < 0 || g > 100)) {
      toastError("أدخل درجة بين ٠ و ١٠٠");
      return;
    }
    setSaving(status);
    try {
      const res = await fetch(`/api/admin/plan-submissions/${target.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, grade: g, feedback: feedback.trim() || undefined }),
      });
      const data = await readJson<{ error?: string }>(res);
      if (!res.ok) throw new Error(data?.error || "تعذر حفظ التقييم");
      success(status === "graded" ? "حُفظ التقييم" : "سُجّل المشروع كغير مقبول");
      setSubmissions((prev) => prev.filter((s) => s.id !== target.id));
      setTarget(null);
    } catch (e) {
      toastError(e instanceof Error ? e.message : "تعذر حفظ التقييم");
    } finally {
      setSaving(null);
    }
  };

  return (
    <Panel
      padded={false}
      title={`${fmtNum(submissions.length)} مشروع ينتظر التقييم`}
      icon={<ClipboardCheck size={16} />}
      actions={<Button size="sm" onClick={() => void load()} loading={loading} icon={<RefreshCw size={14} />}>تحديث</Button>}
    >
      {loadError ? (
        <div className="p-4"><Notice tone="bad" title={loadError} /></div>
      ) : loading && submissions.length === 0 ? (
        <SkeletonRows rows={3} h={64} />
      ) : submissions.length === 0 ? (
        <EmptyState icon={<ClipboardCheck size={22} />} title="لا توجد مشاريع تنتظر التقييم" />
      ) : (
        <ul className="adm-list">
          {submissions.map((sub) => (
            <li key={sub.id} className="adm-row" style={{ alignItems: "flex-start" }}>
              <div className="min-w-0 flex-1 basis-72">
                <p className="text-sm font-bold flex flex-wrap items-center gap-2">
                  {sub.student?.name ?? "طالب"}
                  <Badge tone="warn">قيد الانتظار</Badge>
                </p>
                <p className="text-xs adm-muted mt-0.5">
                  {sub.planLesson?.title ?? "درس غير معروف"}
                  {sub.submittedAt ? ` · ${fmtDateTime(sub.submittedAt)}` : ""}
                </p>
                {sub.content && <p className="text-[13px] mt-2 line-clamp-2" style={{ color: "var(--ink-2)" }}>{sub.content}</p>}
              </div>
              <div className="flex items-center gap-2">
                {sub.fileUrl && (
                  <a href={sub.fileUrl} target="_blank" rel="noreferrer" className="adm-btn is-sm is-ghost">
                    <FileText size={14} aria-hidden /> الملف
                  </a>
                )}
                <Button size="sm" variant="primary" onClick={() => open(sub)}>تقييم</Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Modal
        open={!!target}
        onClose={() => !saving && setTarget(null)}
        title="تقييم المشروع"
        description={target ? `${target.student?.name ?? ""} · ${target.planLesson?.title ?? ""}` : undefined}
        size="md"
        footer={
          <>
            <Button onClick={() => setTarget(null)} disabled={!!saving}>إلغاء</Button>
            <Button variant="danger" loading={saving === "failed"} disabled={!!saving} onClick={() => void submitGrade("failed")}>غير مقبول</Button>
            <Button variant="primary" loading={saving === "graded"} disabled={!!saving} onClick={() => void submitGrade("graded")}>حفظ الدرجة</Button>
          </>
        }
      >
        {target && (
          <div className="flex flex-col gap-4">
            {target.content && <div className="adm-code" style={{ direction: "rtl", textAlign: "right", fontFamily: "inherit" }}>{target.content}</div>}
            {target.fileUrl && (
              <a href={target.fileUrl} target="_blank" rel="noreferrer" className="adm-btn is-sm self-start">
                <FileText size={14} aria-hidden /> فتح الملف المرفق
              </a>
            )}
            <Field label="الدرجة (من ١٠٠)" htmlFor="gr-grade">
              <Input id="gr-grade" data-autofocus type="number" min={0} max={100} mono value={grade} onChange={(e) => setGrade(e.target.value)} className="w-32" />
            </Field>
            <Field label="ملاحظات للطالب" hint="اختياري" htmlFor="gr-fb">
              <Textarea id="gr-fb" rows={3} value={feedback} onChange={(e) => setFeedback(e.target.value)} />
            </Field>
          </div>
        )}
      </Modal>
    </Panel>
  );
}
