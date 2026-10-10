"use client";

import { useCallback, useEffect, useState } from "react";
import { Link2, RefreshCw, Unlink, X } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { Button, EmptyState, Field, Modal, Notice, Panel, Select, SkeletonRows, fmtDate, fmtNum, readJson } from "@/components/admin/ui/kit";

interface UnmatchedItem {
  id: string;
  title: string;
  reason: string;
  createdAt: string;
  video?: { title: string } | null;
}

interface PlanOption {
  id: string;
  title: string;
}

interface LessonOption {
  id: string;
  title: string;
  order?: number;
}

export function UnmatchedQueue() {
  const { success, error: toastError } = useToast();
  const [items, setItems] = useState<UnmatchedItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const [assignTarget, setAssignTarget] = useState<UnmatchedItem | null>(null);
  const [plans, setPlans] = useState<PlanOption[]>([]);
  const [planId, setPlanId] = useState("");
  const [lessons, setLessons] = useState<LessonOption[]>([]);
  const [lessonId, setLessonId] = useState("");
  const [lessonsLoading, setLessonsLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const res = await fetch("/api/admin/superadmin/plans/unmatched-content?limit=100", { credentials: "include" });
      const data = await readJson<{ items?: UnmatchedItem[]; total?: number; error?: string }>(res);
      if (!res.ok) {
        setLoadError(data?.error || "تعذر جلب المحتوى غير المطابق");
        return;
      }
      setItems(data?.items || []);
      setTotal(data?.total ?? data?.items?.length ?? 0);
    } catch {
      setLoadError("تعذر الاتصال بالخادم");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const resolve = async (item: UnmatchedItem, body: Record<string, unknown>, okMsg: string) => {
    setBusyId(item.id);
    try {
      const res = await fetch(`/api/admin/superadmin/plans/unmatched-content/${item.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await readJson<{ error?: string }>(res);
      if (!res.ok) throw new Error(data?.error || "تعذر تحديث العنصر");
      success(okMsg);
      setItems((prev) => prev.filter((i) => i.id !== item.id));
      setTotal((t) => Math.max(0, t - 1));
      return true;
    } catch (e) {
      toastError(e instanceof Error ? e.message : "تعذر تحديث العنصر");
      return false;
    } finally {
      setBusyId(null);
    }
  };

  const openAssign = async (item: UnmatchedItem) => {
    setAssignTarget(item);
    setPlanId("");
    setLessonId("");
    setLessons([]);
    if (plans.length === 0) {
      try {
        const res = await fetch("/api/admin/superadmin/plans?limit=100", { credentials: "include" });
        const data = await readJson<{ plans?: PlanOption[] }>(res);
        setPlans(data?.plans ?? []);
      } catch {
        toastError("تعذر تحميل الخطط");
      }
    }
  };

  const pickPlan = async (id: string) => {
    setPlanId(id);
    setLessonId("");
    setLessons([]);
    if (!id) return;
    setLessonsLoading(true);
    try {
      const res = await fetch(`/api/admin/superadmin/plans/${id}/lessons`, { credentials: "include" });
      const data = await readJson<{ lessons?: LessonOption[] }>(res);
      setLessons(data?.lessons ?? []);
    } finally {
      setLessonsLoading(false);
    }
  };

  const confirmAssign = async () => {
    if (!assignTarget || !lessonId) return;
    const ok = await resolve(assignTarget, { assignToLessonId: lessonId }, "رُبط الفيديو بالدرس");
    if (ok) setAssignTarget(null);
  };

  return (
    <Panel
      padded={false}
      title={`${fmtNum(total)} فيديو بلا درس`}
      icon={<Unlink size={16} />}
      description="فيديوهات من كورسات مرتبطة بخطط لم يُعثر لها على درس مطابق تلقائياً. اربطها بدرس أو تجاهلها."
      actions={<Button size="sm" onClick={() => void load()} loading={loading} icon={<RefreshCw size={14} />}>تحديث</Button>}
    >
      {loadError ? (
        <div className="p-4"><Notice tone="bad" title={loadError} /></div>
      ) : loading && items.length === 0 ? (
        <SkeletonRows rows={3} h={56} />
      ) : items.length === 0 ? (
        <EmptyState icon={<Link2 size={22} />} title="كل المحتوى مطابق" text="لا توجد فيديوهات تحتاج ربطاً يدوياً." />
      ) : (
        <ul className="adm-list">
          {items.map((item) => (
            <li key={item.id} className="adm-row">
              <div className="min-w-0 flex-1 basis-72">
                <p className="text-sm font-bold">{item.video?.title || item.title || "فيديو بدون عنوان"}</p>
                <p className="text-xs adm-muted mt-0.5">{item.reason} · {fmtDate(item.createdAt)}</p>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="primary" icon={<Link2 size={14} />} disabled={busyId === item.id} onClick={() => void openAssign(item)}>
                  ربط بدرس
                </Button>
                <Button size="sm" variant="ghost" icon={<X size={14} />} loading={busyId === item.id} onClick={() => void resolve(item, { dismiss: true }, "تم التجاهل")}>
                  تجاهل
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Modal
        open={!!assignTarget}
        onClose={() => !busyId && setAssignTarget(null)}
        title="ربط الفيديو بدرس"
        description={assignTarget?.video?.title || assignTarget?.title}
        size="sm"
        footer={
          <>
            <Button onClick={() => setAssignTarget(null)} disabled={!!busyId}>إلغاء</Button>
            <Button variant="primary" loading={!!busyId} disabled={!lessonId} onClick={() => void confirmAssign()}>ربط</Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <Field label="الخطة" htmlFor="um-plan">
            <Select id="um-plan" value={planId} onChange={(e) => void pickPlan(e.target.value)}>
              <option value="">— اختر الخطة —</option>
              {plans.map((p) => (
                <option key={p.id} value={p.id}>{p.title}</option>
              ))}
            </Select>
          </Field>
          <Field label="الدرس" htmlFor="um-lesson" hint={lessonsLoading ? "جارٍ تحميل الدروس…" : planId && lessons.length === 0 ? "لا توجد دروس في هذه الخطة" : undefined}>
            <Select id="um-lesson" value={lessonId} onChange={(e) => setLessonId(e.target.value)} disabled={!planId || lessonsLoading}>
              <option value="">— اختر الدرس —</option>
              {lessons.map((l, i) => (
                <option key={l.id} value={l.id}>{fmtNum((l.order ?? i) + 1)}. {l.title}</option>
              ))}
            </Select>
          </Field>
        </div>
      </Modal>
    </Panel>
  );
}
