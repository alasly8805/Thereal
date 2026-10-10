"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, Copy, Eye, LogOut, MessageCircle, RefreshCw, RotateCcw, ShieldCheck, Users } from "lucide-react";
import { phonesMatch } from "@/lib/phone-match";
import { EDUCATIONAL_STAGES } from "@/types";
import { useToast } from "@/components/ui/Toast";
import { Badge, Button, Chip, EmptyState, Modal, Notice, SearchInput, SkeletonRows, Switch, fmtDate, fmtNum, readJson, waLink } from "@/components/admin/ui/kit";

interface EnrollmentSource {
  type: "DIRECT_ENROLLMENT" | "ACCESS_CODE" | "TEACHER_SUBSCRIPTION";
  label: string;
  code?: string;
  amount?: number;
  date: string;
}

interface EnrolledStudent {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  parentPhone: string | null;
  educationalStage: string | null;
  lastActive: string | null;
  firstEnrolledAt: string;
  watchCount: number;
  isExcluded: boolean;
  sources: EnrollmentSource[];
}

interface CourseStudentsModalProps {
  courseId: string;
  courseTitle: string;
  teacherName: string;
  isOpen: boolean;
  onClose: () => void;
  onStudentCountChanged?: (courseId: string, newActiveCount: number) => void;
}

const SOURCE_TONE: Record<EnrollmentSource["type"], "gold" | "info" | "ok"> = {
  ACCESS_CODE: "gold",
  TEACHER_SUBSCRIPTION: "info",
  DIRECT_ENROLLMENT: "ok",
};

function stageLabel(v: string | null) {
  if (!v) return null;
  return EDUCATIONAL_STAGES.find((s) => s.value === v)?.label ?? v;
}

export function CourseStudentsModal({ courseId, courseTitle, teacherName, isOpen, onClose, onStudentCountChanged }: CourseStudentsModalProps) {
  const { success: toastSuccess, error: toastError } = useToast();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [students, setStudents] = useState<EnrolledStudent[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "active" | "excluded">("all");
  const [targetStudent, setTargetStudent] = useState<EnrolledStudent | null>(null);
  const [revokeSession, setRevokeSession] = useState(true);
  const [actionId, setActionId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const reqSeq = useRef(0);

  const activeCount = useMemo(() => students.filter((s) => !s.isExcluded).length, [students]);
  const excludedCount = students.length - activeCount;

  const fetchStudents = useCallback(async () => {
    if (!courseId) return;
    const seq = ++reqSeq.current;
    setLoading(true);
    setLoadError("");
    try {
      const res = await fetch(`/api/admin/superadmin/courses/${courseId}/students`, { credentials: "include" });
      const data = await readJson<{ students?: EnrolledStudent[]; error?: string }>(res);
      if (seq !== reqSeq.current) return; // a different course was opened meanwhile
      if (!res.ok || !data?.students) {
        setLoadError(data?.error || "تعذر جلب قائمة الطلاب");
        return;
      }
      setStudents(data.students);
    } catch {
      if (seq === reqSeq.current) setLoadError("تعذر الاتصال بالخادم");
    } finally {
      if (seq === reqSeq.current) setLoading(false);
    }
  }, [courseId]);

  useEffect(() => {
    if (!isOpen || !courseId) return;
    setStudents([]);
    setSearchQuery("");
    setFilter("all");
    setTargetStudent(null);
    void fetchStudents();
  }, [isOpen, courseId, fetchStudents]);

  const setExcluded = (id: string, excluded: boolean) => {
    const next = students.map((s) => (s.id === id ? { ...s, isExcluded: excluded } : s));
    setStudents(next);
    onStudentCountChanged?.(courseId, next.filter((s) => !s.isExcluded).length);
  };

  const handleCopy = async (text: string, id: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 1800);
    } catch {
      toastError("تعذر النسخ");
    }
  };

  const handleConfirmSignOut = async () => {
    if (!targetStudent) return;
    setActionId(targetStudent.id);
    try {
      const res = await fetch(`/api/admin/superadmin/courses/${courseId}/students`, {
        method: "DELETE",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ studentId: targetStudent.id, revokeSession }),
      });
      const data = await readJson<{ success?: boolean; message?: string; error?: string }>(res);
      if (!res.ok || !data?.success) throw new Error(data?.error || "تعذر إخراج الطالب من الكورس");
      toastSuccess(data.message || `أُخرج ${targetStudent.name} من الكورس`);
      setExcluded(targetStudent.id, true);
      setTargetStudent(null);
    } catch (err) {
      toastError(err instanceof Error ? err.message : "تعذر تنفيذ الإجراء");
    } finally {
      setActionId(null);
    }
  };

  const handleRestoreStudent = async (student: EnrolledStudent) => {
    setActionId(student.id);
    try {
      const res = await fetch(`/api/admin/superadmin/courses/${courseId}/students`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ studentId: student.id, action: "restore" }),
      });
      const data = await readJson<{ success?: boolean; message?: string; error?: string }>(res);
      if (!res.ok || !data?.success) throw new Error(data?.error || "تعذر إعادة إتاحة الكورس");
      toastSuccess(data.message || `أُعيد ${student.name} للكورس`);
      setExcluded(student.id, false);
    } catch (err) {
      toastError(err instanceof Error ? err.message : "تعذر تنفيذ الإجراء");
    } finally {
      setActionId(null);
    }
  };

  const filteredStudents = useMemo(() => {
    let list = students;
    if (filter === "active") list = list.filter((s) => !s.isExcluded);
    if (filter === "excluded") list = list.filter((s) => s.isExcluded);
    const q = searchQuery.toLowerCase().trim();
    if (q) {
      list = list.filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          s.email.toLowerCase().includes(q) ||
          (s.phone ?? "").includes(q) ||
          phonesMatch(s.phone, q) ||
          (s.parentPhone ?? "").includes(q) ||
          phonesMatch(s.parentPhone, q) ||
          s.sources.some((src) => src.label.toLowerCase().includes(q) || (src.code ?? "").toLowerCase().includes(q))
      );
    }
    return list;
  }, [students, filter, searchQuery]);

  return (
    <>
      <Modal
        open={isOpen}
        onClose={onClose}
        size="xl"
        title="طلاب الكورس"
        description={`${courseTitle} · أ. ${teacherName}`}
        icon={
          <span className="w-10 h-10 rounded-[12px] grid place-items-center" style={{ background: "var(--brand-soft)", color: "var(--brand)" }}>
            <Users size={20} />
          </span>
        }
        footer={
          <>
            <span className="me-auto text-[13px] adm-muted">
              {fmtNum(activeCount)} نشط{excludedCount > 0 ? ` · ${fmtNum(excludedCount)} أُخرجوا` : ""}
            </span>
            <Button onClick={onClose}>إغلاق</Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <Notice tone="neutral" icon={<ShieldCheck size={18} />}>
            حسابات المشرفين ومعاينة المعلم والحسابات التجريبية مستبعدة من العدد. الإخراج صامت ولا يُرسل إشعاراً للمعلم.
          </Notice>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <SearchInput value={searchQuery} onChange={setSearchQuery} placeholder="الاسم، الهاتف، البريد، أو كود التفعيل" inputSize="sm" className="flex-1 min-w-[220px] max-w-md" />
            <div className="flex flex-wrap items-center gap-2">
              <Chip pressed={filter === "all"} onClick={() => setFilter("all")} count={students.length}>الكل</Chip>
              <Chip pressed={filter === "active"} onClick={() => setFilter("active")} count={activeCount}>النشطون</Chip>
              {excludedCount > 0 && (
                <Chip pressed={filter === "excluded"} onClick={() => setFilter("excluded")} count={excludedCount}>أُخرجوا</Chip>
              )}
              <Button size="sm" variant="ghost" className="is-icon" aria-label="تحديث" title="تحديث" loading={loading} onClick={() => void fetchStudents()}>
                <RefreshCw size={15} />
              </Button>
            </div>
          </div>

          {loadError ? (
            <Notice tone="bad" title={loadError} action={<Button size="sm" onClick={() => void fetchStudents()}>إعادة المحاولة</Button>} />
          ) : loading && students.length === 0 ? (
            <SkeletonRows rows={5} h={52} />
          ) : filteredStudents.length === 0 ? (
            <EmptyState
              icon={<Users size={22} />}
              title={searchQuery ? "لا يوجد طلاب مطابقون" : "لا يوجد طلاب في هذا الكورس"}
              action={searchQuery ? <Button size="sm" onClick={() => setSearchQuery("")}>مسح البحث</Button> : undefined}
            />
          ) : (
            <div className="adm-well overflow-hidden">
              <div className="adm-table-wrap">
                <table className="adm-table" style={{ minWidth: 820 }}>
                  <thead>
                    <tr>
                      <th>الطالب</th>
                      <th>الهاتف</th>
                      <th>مصدر التسجيل</th>
                      <th className="is-num">المشاهدات</th>
                      <th>الحالة</th>
                      <th className="is-actions" />
                    </tr>
                  </thead>
                  <tbody>
                    {filteredStudents.map((s) => (
                      <tr key={s.id} className={s.isExcluded ? "is-muted" : undefined}>
                        <td>
                          <div className="flex items-center gap-2.5">
                            <span className="adm-avatar" style={{ width: 32, height: 32, fontSize: 13 }} aria-hidden>{s.name?.[0] ?? "؟"}</span>
                            <div className="min-w-0">
                              <p className="font-bold flex items-center gap-1.5">
                                {s.name}
                                {stageLabel(s.educationalStage) && <Badge>{stageLabel(s.educationalStage)}</Badge>}
                              </p>
                              <p className="text-xs adm-muted adm-mono truncate max-w-[220px]">{s.email}</p>
                            </div>
                          </div>
                        </td>
                        <td>
                          {s.phone ? (
                            <div className="flex flex-col gap-0.5">
                              <span className="flex items-center gap-1">
                                <span className="adm-mono">{s.phone}</span>
                                <button type="button" onClick={() => void handleCopy(s.phone!, `p_${s.id}`)} className="adm-btn is-ghost is-icon is-sm" style={{ width: 26, minHeight: 26 }} aria-label="نسخ الرقم" title="نسخ الرقم">
                                  {copiedId === `p_${s.id}` ? <Check size={13} style={{ color: "var(--ok)" }} /> : <Copy size={13} />}
                                </button>
                                <a href={waLink(s.phone)} target="_blank" rel="noreferrer" className="adm-btn is-ghost is-icon is-sm" style={{ width: 26, minHeight: 26 }} aria-label="واتساب" title="واتساب">
                                  <MessageCircle size={13} />
                                </a>
                              </span>
                              {s.parentPhone && <span className="text-xs adm-muted">ولي الأمر <span className="adm-mono">{s.parentPhone}</span></span>}
                            </div>
                          ) : (
                            <span className="adm-muted">—</span>
                          )}
                        </td>
                        <td>
                          <div className="flex flex-col items-start gap-1">
                            {s.sources.map((src, i) => (
                              <Badge key={i} tone={SOURCE_TONE[src.type] ?? "neutral"} title={src.code}>{src.label}</Badge>
                            ))}
                            <span className="text-xs adm-muted">منذ {fmtDate(s.firstEnrolledAt)}</span>
                          </div>
                        </td>
                        <td className="is-num">
                          <span className="inline-flex items-center gap-1"><Eye size={13} className="adm-muted" aria-hidden /> {fmtNum(s.watchCount)}</span>
                        </td>
                        <td>
                          <Badge tone={s.isExcluded ? "bad" : "ok"} dot>{s.isExcluded ? "أُخرج" : "نشط"}</Badge>
                        </td>
                        <td className="is-actions">
                          {s.isExcluded ? (
                            <Button size="sm" icon={<RotateCcw size={14} />} loading={actionId === s.id} disabled={actionId !== null} onClick={() => void handleRestoreStudent(s)}>
                              إعادة الإتاحة
                            </Button>
                          ) : (
                            <Button size="sm" variant="danger" icon={<LogOut size={14} />} disabled={actionId !== null} onClick={() => { setRevokeSession(true); setTargetStudent(s); }}>
                              إخراج
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </Modal>

      <Modal
        open={!!targetStudent}
        onClose={() => !actionId && setTargetStudent(null)}
        size="sm"
        title="إخراج الطالب من الكورس؟"
        description={targetStudent ? `${targetStudent.name} — ${courseTitle}` : undefined}
        footer={
          <>
            <Button onClick={() => setTargetStudent(null)} disabled={!!actionId}>إلغاء</Button>
            <Button variant="danger-solid" icon={<LogOut size={15} />} loading={!!actionId} onClick={() => void handleConfirmSignOut()}>إخراج الطالب</Button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <p className="text-sm leading-relaxed" style={{ color: "var(--ink-2)" }}>
            سيُلغى تسجيله وكوده في هذا الكورس فوراً وتنتهي أي مشاهدة جارية. لا يصل المعلم أي إشعار. يمكنك إعادة إتاحته لاحقاً من نفس القائمة.
          </p>
          <label className="adm-well flex items-start justify-between gap-3 p-3">
            <span>
              <span className="text-sm font-semibold block">تسجيل خروجه من كل أجهزته</span>
              <span className="adm-hint">يُبطل جلساته الحالية على المتصفح والتطبيق.</span>
            </span>
            <Switch checked={revokeSession} onChange={setRevokeSession} label="تسجيل الخروج من كل الأجهزة" />
          </label>
        </div>
      </Modal>
    </>
  );
}
