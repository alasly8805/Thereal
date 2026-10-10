"use client";
import { useEffect, useMemo, useState } from "react";
import { Archive, BookOpen, MessageCircle, Phone, PlayCircle, ShieldCheck, ShieldOff, Smartphone, Ticket, Trophy } from "lucide-react";
import { EDUCATIONAL_STAGES } from "@/types";
import { useToast } from "@/components/ui/Toast";
import { CopyStudentReport } from "@/components/CopyStudentReport";
import { ConfirmActionModal } from "./ConfirmActionModal";
import { hasPermission } from "@/lib/rbac";
import { PaymentSourcePill } from "./overview/primitives";
import { Badge, Button, EmptyState, KeyValues, Modal, Notice, Skeleton, fmtDate, fmtDateTime, fmtMoney, fmtNum, readJson, waLink } from "@/components/admin/ui/kit";

interface CourseInfo {
  id: string;
  title: string;
  subject: string;
  educationalStage: string;
  teacher: { id: string; name: string };
}

interface AccessCodeEntry {
  id: string;
  isActive: boolean;
  usedAt: string | null;
  course: CourseInfo;
}

interface StudentSubscriptionEntry {
  id: string;
  planType: string;
  planLabel: string;
  amount: number;
  paymentSource: string | null;
  paymentRef: string | null;
  status: string;
  createdAt: string;
  expiresAt: string | null;
  teacher: { id: string; name: string };
}

interface StudentDetail {
  id: string;
  name: string;
  email: string;
  points: number;
  age: number | null;
  phone: string | null;
  parentPhone: string | null;
  educationalStage: string | null;
  isActive: boolean;
  profileCompleted: boolean;
  createdAt: string;
  lastLoginAt: string | null;
  accessCodes: AccessCodeEntry[];
  studentSubscriptions?: StudentSubscriptionEntry[];
}

interface QuizResultEntry {
  id: string;
  score: number;
  totalQ: number;
  completedAt: string;
  pendingEssays?: number;
  gradingStatus?: "PENDING" | "GRADED";
  quiz: {
    id: string;
    title: string;
    folder?: { course: { id: string; title: string } } | null;
  };
}

interface DeviceEntry {
  id: string;
  label: string | null;
  lastSeenAt: string;
  ipAddress: string | null;
}

interface DetailResponse {
  student: StudentDetail;
  quizResults: QuizResultEntry[];
  watchedCount: number;
  devices: DeviceEntry[];
  maxDevices: number;
  error?: string;
}

function stageLabel(value: string | null) {
  if (!value) return "—";
  return EDUCATIONAL_STAGES.find((s) => s.value === value)?.label ?? value;
}

type PendingAction = "suspend" | "unsuspend" | "delete" | null;

interface Props {
  studentId: string;
  onClose: () => void;
  userRole?: string;
  /** Called after a successful suspend/unsuspend or delete so the parent can refresh the list */
  onStudentModified?: () => void;
}

export function StudentDetailModal({ studentId, onClose, onStudentModified, userRole = "superadmin" }: Props) {
  const { success: toastSuccess, error: toastError } = useToast();
  const [data, setData] = useState<DetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [confirmingReset, setConfirmingReset] = useState(false);
  const [resettingDevices, setResettingDevices] = useState(false);
  const [openedAt] = useState(() => Date.now());

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    fetch(`/api/admin/superadmin/students/${studentId}`, { credentials: "include" })
      .then(async (res) => {
        const json = await readJson<DetailResponse>(res);
        if (cancelled) return;
        if (!res.ok || !json?.student) {
          setError(json?.error ?? "تعذر جلب بيانات المتعلم");
          return;
        }
        setData(json);
      })
      .catch(() => !cancelled && setError("تعذر الاتصال بالخادم"))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [studentId]);

  const resultsByCourse = useMemo(() => {
    const groups = new Map<string, { courseTitle: string; results: QuizResultEntry[] }>();
    for (const r of data?.quizResults ?? []) {
      const id = r.quiz.folder?.course?.id ?? "plan";
      if (!groups.has(id)) groups.set(id, { courseTitle: r.quiz.folder?.course?.title ?? "خطة دراسية", results: [] });
      groups.get(id)!.results.push(r);
    }
    return [...groups.entries()];
  }, [data?.quizResults]);

  const handleSuspend = async (password: string) => {
    const isActive = pendingAction === "unsuspend";
    const res = await fetch(`/api/admin/superadmin/students/${studentId}`, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ actionPassword: password, isActive }),
    });
    const json = await readJson<{ error?: string }>(res);
    if (!res.ok) throw new Error(json?.error ?? "تعذر تعديل حالة الحساب");
    toastSuccess(isActive ? "أُعيد تفعيل الحساب" : "تم إيقاف الحساب");
    setData((prev) => (prev ? { ...prev, student: { ...prev.student, isActive } } : prev));
    setPendingAction(null);
    onStudentModified?.();
  };

  const handleDelete = async (password: string) => {
    const res = await fetch(`/api/admin/superadmin/students/${studentId}`, {
      method: "DELETE",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ actionPassword: password }),
    });
    const json = await readJson<{ error?: string }>(res);
    if (!res.ok) throw new Error(json?.error ?? "تعذر أرشفة المتعلم");
    // Soft delete: the account moves to "المتعلمون المحذوفون" and can be restored.
    toastSuccess("نُقل الحساب إلى المتعلمين المحذوفين — يمكن استعادته من هناك");
    setPendingAction(null);
    onStudentModified?.();
    onClose();
  };

  const handleResetDevices = async () => {
    setResettingDevices(true);
    try {
      const res = await fetch(`/api/admin/students/${studentId}/reset-devices`, {
        method: "POST",
        credentials: "include",
      });
      const json = await readJson<{ cleared?: number; error?: string }>(res);
      if (!res.ok) throw new Error(json?.error ?? "تعذر تصفير الأجهزة");
      setData((prev) => (prev ? { ...prev, devices: [] } : prev));
      toastSuccess(json?.cleared ? `تم تصفير ${json.cleared} جهاز — يمكنه الدخول من جهاز جديد` : "لا توجد أجهزة مسجّلة");
      setConfirmingReset(false);
    } catch (err) {
      toastError(err instanceof Error ? err.message : "تعذر تصفير الأجهزة");
    } finally {
      setResettingDevices(false);
    }
  };

  const canResetDevices = hasPermission(userRole, "reset_student_devices");
  const canSuspend = hasPermission(userRole, "suspend_student");
  const canArchive = hasPermission(userRole, "soft_delete_student");
  const s = data?.student;
  const devices = data?.devices ?? [];
  const maxDevices = data?.maxDevices ?? 0;
  const subs = s?.studentSubscriptions ?? [];

  return (
    <>
      <Modal
        open
        onClose={onClose}
        size="lg"
        title={s ? s.name : "ملف المتعلم"}
        description={s ? `${stageLabel(s.educationalStage)} · انضم ${fmtDate(s.createdAt)}` : undefined}
        icon={s ? <span className="adm-avatar" style={{ width: 40, height: 40 }}>{s.name?.[0] ?? "؟"}</span> : undefined}
      >
        {loading ? (
          <div className="flex flex-col gap-3">
            <Skeleton h={120} />
            <Skeleton h={80} />
            <Skeleton h={160} />
          </div>
        ) : error ? (
          <Notice tone="bad" title={error} />
        ) : s ? (
          <div className="flex flex-col gap-6">
            {/* Summary */}
            <div className="flex flex-col gap-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={s.isActive ? "ok" : "bad"} dot>{s.isActive ? "حساب نشط" : "حساب موقوف"}</Badge>
                {!s.profileCompleted && <Badge tone="warn">الملف غير مكتمل</Badge>}
                <Badge tone="gold"><Trophy size={12} aria-hidden /> {fmtNum(s.points ?? 0)} نقطة</Badge>
                <Badge tone="info"><PlayCircle size={12} aria-hidden /> {fmtNum(data?.watchedCount ?? 0)} فيديو</Badge>
              </div>
              <div className="adm-well p-4">
                <KeyValues
                  items={[
                    { k: "رقم المتعلم", v: <span className="adm-mono">{s.phone ?? "—"}</span> },
                    { k: "رقم ولي الأمر", v: <span className="adm-mono">{s.parentPhone ?? "—"}</span> },
                    { k: "السن", v: s.age ? `${fmtNum(s.age)} سنة` : "—" },
                    { k: "آخر دخول", v: s.lastLoginAt ? fmtDateTime(s.lastLoginAt) : "—" },
                    { k: "البريد", v: <span className="adm-mono">{s.email}</span> },
                  ]}
                />
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <CopyStudentReport student={data ? { ...data.student, ...data } : s} />
                {s.phone && (
                  <>
                    <a href={`tel:${s.phone}`} className="adm-btn is-sm"><Phone size={14} aria-hidden /> اتصال بالمتعلم</a>
                    <a href={waLink(s.phone)} target="_blank" rel="noreferrer" className="adm-btn is-sm">
                      <MessageCircle size={14} aria-hidden /> واتساب المتعلم
                    </a>
                  </>
                )}
                {s.parentPhone && (
                  <>
                    <a href={`tel:${s.parentPhone}`} className="adm-btn is-sm"><Phone size={14} aria-hidden /> اتصال بولي الأمر</a>
                    <a href={waLink(s.parentPhone)} target="_blank" rel="noreferrer" className="adm-btn is-sm">
                      <MessageCircle size={14} aria-hidden /> واتساب ولي الأمر
                    </a>
                  </>
                )}
              </div>
            </div>

            {/* Devices */}
            <ModalSection
              title="الأجهزة المسجّلة"
              icon={<Smartphone size={16} />}
              meta={<Badge tone={devices.length >= maxDevices && maxDevices > 0 ? "warn" : "neutral"}>{fmtNum(devices.length)} / {fmtNum(maxDevices)}</Badge>}
              action={
                canResetDevices && devices.length > 0 && !confirmingReset ? (
                  <Button size="sm" onClick={() => setConfirmingReset(true)}>تصفير الأجهزة</Button>
                ) : undefined
              }
            >
              {confirmingReset && (
                <Notice
                  tone="warn"
                  title="تصفير كل أجهزة هذا المتعلم؟"
                  className="mb-3"
                  action={
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => setConfirmingReset(false)} disabled={resettingDevices}>إلغاء</Button>
                      <Button size="sm" variant="primary" onClick={() => void handleResetDevices()} loading={resettingDevices}>تأكيد</Button>
                    </div>
                  }
                >
                  سيتمكن من الدخول من أي جهاز جديد حتى الحد المسموح.
                </Notice>
              )}
              {devices.length === 0 ? (
                <p className="adm-hint">لا توجد أجهزة مسجّلة.</p>
              ) : (
                <ul className="adm-well adm-list">
                  {devices.map((d) => (
                    <li key={d.id} className="adm-row" style={{ padding: "10px 14px" }}>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold truncate">{d.label ?? "جهاز غير معروف"}</p>
                        <p className="text-xs adm-muted"><span className="adm-mono">{d.ipAddress ?? "—"}</span></p>
                      </div>
                      <span className="text-xs adm-muted">آخر دخول {fmtDate(d.lastSeenAt)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </ModalSection>

            {/* Subscriptions */}
            <ModalSection title="حجوزات باقات المعلمين" icon={<Ticket size={16} />} meta={<Badge>{fmtNum(subs.length)}</Badge>}>
              {subs.length === 0 ? (
                <p className="adm-hint">لا توجد حجوزات باقات لهذا المتعلم.</p>
              ) : (
                <ul className="adm-well adm-list">
                  {subs.map((sub) => {
                    const expired = sub.expiresAt ? new Date(sub.expiresAt).getTime() < openedAt : false;
                    return (
                      <li key={sub.id} className="adm-row" style={{ padding: "10px 14px" }}>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold">
                            {sub.planLabel} <span className="adm-muted font-normal">· أ. {sub.teacher.name}</span>
                          </p>
                          <div className="flex flex-wrap items-center gap-1.5 mt-1">
                            <PaymentSourcePill source={sub.paymentSource ?? undefined} />
                            <Badge tone={sub.amount > 0 ? "ok" : "neutral"}>{sub.amount > 0 ? fmtMoney(sub.amount) : "مجاني"}</Badge>
                            {sub.expiresAt && (
                              <Badge tone={expired ? "bad" : "info"}>{expired ? "انتهى" : "ينتهي"} {fmtDate(sub.expiresAt)}</Badge>
                            )}
                          </div>
                        </div>
                        <span className="text-xs adm-muted whitespace-nowrap">{fmtDateTime(sub.createdAt)}</span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </ModalSection>

            {/* Courses */}
            <ModalSection title="الكورسات المشترك فيها" icon={<BookOpen size={16} />} meta={<Badge>{fmtNum(s.accessCodes.length)}</Badge>}>
              {s.accessCodes.length === 0 ? (
                <p className="adm-hint">لم يشترك في أي كورس بعد.</p>
              ) : (
                <ul className="adm-well adm-list">
                  {s.accessCodes.map((ac) => (
                    <li key={ac.id} className="adm-row" style={{ padding: "10px 14px" }}>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold">{ac.course.title}</p>
                        <p className="text-xs adm-muted">{ac.course.subject} · أ. {ac.course.teacher.name}</p>
                      </div>
                      <Badge tone={ac.isActive ? "ok" : "bad"}>{ac.isActive ? "نشط" : "موقوف"}</Badge>
                    </li>
                  ))}
                </ul>
              )}
            </ModalSection>

            {/* Quiz results */}
            <ModalSection title="نتائج الاختبارات" icon={<Trophy size={16} />} meta={<Badge>{fmtNum(data?.quizResults.length ?? 0)}</Badge>}>
              {!data?.quizResults.length ? (
                <p className="adm-hint">لا توجد نتائج اختبارات بعد.</p>
              ) : (
                <div className="flex flex-col gap-4">
                  {resultsByCourse.map(([courseId, { courseTitle, results }]) => (
                    <div key={courseId}>
                      <p className="adm-label mb-2">{courseTitle}</p>
                      <div className="adm-well overflow-hidden">
                        <div className="adm-table-wrap">
                          <table className="adm-table">
                            <thead>
                              <tr>
                                <th>الاختبار</th>
                                <th>الدرجة</th>
                                <th>التاريخ</th>
                              </tr>
                            </thead>
                            <tbody>
                              {results.map((r) => (
                                <tr key={r.id}>
                                  <td>{r.quiz.title}</td>
                                  <td className="whitespace-nowrap">
                                    {(r.pendingEssays ?? 0) > 0 ? (
                                      <Badge tone="warn" title={`${r.pendingEssays} سؤال مقالي بانتظار التصحيح`}>بانتظار التصحيح</Badge>
                                    ) : (
                                      <>
                                        <b className="adm-num" style={{ color: r.score >= 50 ? "var(--ok)" : "var(--danger)" }}>
                                          {fmtNum(Math.round(r.score))}٪
                                        </b>{" "}
                                        <span className="adm-muted adm-num">
                                          ({fmtNum(Math.round((r.score * r.totalQ) / 100))}/{fmtNum(r.totalQ)})
                                        </span>
                                      </>
                                    )}
                                  </td>
                                  <td className="adm-muted whitespace-nowrap">{fmtDate(r.completedAt)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </ModalSection>

            {/* Account actions */}
            {(canSuspend || canArchive) && (
              <ModalSection title="إجراءات الحساب" icon={<ShieldCheck size={16} />}>
                <div className="flex flex-wrap gap-2">
                  {canSuspend &&
                    (s.isActive ? (
                      <Button onClick={() => setPendingAction("suspend")} icon={<ShieldOff size={15} />}>إيقاف الحساب</Button>
                    ) : (
                      <Button variant="primary" onClick={() => setPendingAction("unsuspend")} icon={<ShieldCheck size={15} />}>إعادة التفعيل</Button>
                    ))}
                  {canArchive && (
                    <Button variant="danger" onClick={() => setPendingAction("delete")} icon={<Archive size={15} />}>أرشفة الحساب</Button>
                  )}
                </div>
                <p className="adm-hint mt-2">الأرشفة تنقل الحساب إلى «المتعلمون المحذوفون» ويمكن استعادته.</p>
              </ModalSection>
            )}
          </div>
        ) : (
          <EmptyState title="لا توجد بيانات" />
        )}
      </Modal>

      {(pendingAction === "suspend" || pendingAction === "unsuspend") && (
        <ConfirmActionModal
          title={pendingAction === "suspend" ? "إيقاف الحساب" : "إعادة تفعيل الحساب"}
          description={
            pendingAction === "suspend"
              ? `سيُمنع "‏${s?.name}‏" من تسجيل الدخول. يمكن التراجع لاحقاً.`
              : `سيستطيع "‏${s?.name}‏" تسجيل الدخول مجدداً.`
          }
          actionLabel={pendingAction === "suspend" ? "إيقاف الحساب" : "إعادة التفعيل"}
          variant="warning"
          onConfirm={handleSuspend}
          onClose={() => setPendingAction(null)}
        />
      )}

      {pendingAction === "delete" && (
        <ConfirmActionModal
          title="أرشفة حساب المتعلم"
          description={`سيُنقل حساب "‏${s?.name}‏" إلى المتعلمين المحذوفين. يمكن للمشرف العام استعادته لاحقاً.`}
          actionLabel="أرشفة الحساب"
          variant="danger"
          onConfirm={handleDelete}
          onClose={() => setPendingAction(null)}
        />
      )}
    </>
  );
}

function ModalSection({
  title,
  icon,
  meta,
  action,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  meta?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="flex items-center justify-between gap-2 mb-2.5">
        <h3 className="adm-h3 flex items-center gap-2">
          <span style={{ color: "var(--brand)" }} aria-hidden>{icon}</span>
          {title}
          {meta}
        </h3>
        {action}
      </div>
      {children}
    </section>
  );
}
