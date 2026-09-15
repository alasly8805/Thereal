"use client";
import { useState, useEffect } from "react";
import { EDUCATIONAL_STAGES } from "@/types";
import { useToast } from "@/components/ui/Toast";
import { ConfirmActionModal } from "./ConfirmActionModal";
import { hasPermission } from "@/lib/rbac";

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
  teacher: {
    id: string;
    name: string;
  };
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
    folder?: {
      course: { id: string; title: string };
    } | null;
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

interface CourseGroup {
  courseTitle: string;
  results: QuizResultEntry[];
}

function stageLabel(value: string | null) {
  if (!value) return "—";
  return EDUCATIONAL_STAGES.find((s) => s.value === value)?.label ?? value;
}

function fmtDate(d: string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("ar-EG", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

interface InfoRowProps {
  label: string;
  value: string;
  mono?: boolean;
}

function InfoRow({ label, value, mono = false }: InfoRowProps) {
  return (
    <div>
      <p className="text-gray-500 text-xs mb-0.5">{label}</p>
      <p className={`text-white text-sm ${mono ? "font-mono" : ""}`}>{value}</p>
    </div>
  );
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
  const { success: toastSuccess } = useToast();
  const [data, setData] = useState<DetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [confirmingReset, setConfirmingReset] = useState(false);
  const [resettingDevices, setResettingDevices] = useState(false);

  useEffect(() => {
    fetch(`/api/admin/superadmin/students/${studentId}`, { credentials: "include" })
      .then(async (res) => {
        const json = (await res.json()) as DetailResponse;
        if (!res.ok) {
          setError(json.error ?? "تعذر جلب البيانات");
          return;
        }
        setData(json);
      })
      .catch(() => setError("تعذر الاتصال بالخادم"))
      .finally(() => setLoading(false));
  }, [studentId]);

  const resultsByCourse = data?.quizResults.reduce<Record<string, CourseGroup>>(
    (acc, r) => {
      const courseId = r.quiz.folder?.course?.id ?? 'plan';
      if (!acc[courseId]) {
        acc[courseId] = { courseTitle: r.quiz.folder?.course?.title ?? "خطة دراسية", results: [] };
      }
      acc[courseId].results.push(r);
      return acc;
    },
    {}
  );

  const handleSuspend = async (password: string) => {
    const isActive = pendingAction === "unsuspend";
    const res = await fetch(`/api/admin/superadmin/students/${studentId}`, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ actionPassword: password, isActive }),
    });
    const json = (await res.json()) as { error?: string; isActive?: boolean };
    if (!res.ok) throw new Error(json.error ?? "تعذر تعديل حالة الحساب");
    toastSuccess(isActive ? "تم رفع التعليق عن الحساب بنجاح" : "تم تعليق الحساب بنجاح");
    if (data) setData({ ...data, student: { ...data.student, isActive } });
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
    const json = (await res.json()) as { error?: string };
    if (!res.ok) throw new Error(json.error ?? "تعذر حذف المتعلم");
    toastSuccess("تم حذف حساب المتعلم نهائياً");
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
      const json = (await res.json()) as { cleared?: number; error?: string };
      if (!res.ok) throw new Error(json.error ?? "تعذر تصفير الأجهزة");
      if (data) setData({ ...data, devices: [] });
      toastSuccess(
        json.cleared ? `تم تصفير ${json.cleared} جهاز — يمكن للمتعلم الدخول من جهاز جديد` : "لا توجد أجهزة مسجّلة"
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذر تصفير الأجهزة");
    } finally {
      setResettingDevices(false);
      setConfirmingReset(false);
    }
  };

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) onClose();
  };

  const canResetDevices = hasPermission(userRole, "suspend_student");

  return (
    <div
      className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={handleBackdropClick}
    >
      <div
        className="bg-gray-800 rounded-2xl border border-gray-700 w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col"
        dir="rtl"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-gray-700 shrink-0">
          <h2 className="text-white font-bold text-lg">ملف المتعلم</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white text-2xl leading-none transition-colors"
            aria-label="إغلاق"
          >
            ×
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {loading && (
            <div className="text-center py-10 text-gray-500">جارٍ التحميل...</div>
          )}
          {error && (
            <div className="text-center py-10 text-red-400">{error}</div>
          )}

          {data && (() => {
            // Defensive: the detail endpoint should always send these, but never
            // let a missing field hard-crash the whole modal.
            const devices = data.devices ?? [];
            const maxDevices = data.maxDevices ?? 0;
            return (
            <>
              {/* Profile card */}
              <div className="bg-gray-900/60 rounded-xl p-5 border border-gray-700">
                <div className="flex items-center gap-4 mb-4">
                  <div className="w-14 h-14 bg-linear-to-br from-green-600 to-blue-600 rounded-2xl flex items-center justify-center text-white font-black text-xl shrink-0">
                    {data.student.name[0]}
                  </div>
                  <div>
                    <h3 className="text-white font-bold text-lg">{data.student.name}</h3>
                    <p className="text-gray-400 text-sm">{stageLabel(data.student.educationalStage)}</p>
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full ${
                        data.student.isActive
                          ? "bg-green-500/10 text-green-400"
                          : "bg-red-500/10 text-red-400"
                      }`}
                    >
                      {data.student.isActive ? "حساب نشط" : "حساب موقوف"}
                    </span>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <InfoRow label="السن" value={data.student.age ? `${data.student.age} سنة` : "—"} />
                  <InfoRow label="النقاط الأكاديمية" value={data.student.points?.toString() || "0"} mono />
                  <InfoRow label="رقم المتعلم" value={data.student.phone ?? "—"} mono />
                  <InfoRow label="رقم ولي الأمر" value={data.student.parentPhone ?? "—"} mono />
                  <InfoRow label="تاريخ التسجيل" value={fmtDate(data.student.createdAt)} />
                  <InfoRow label="آخر دخول" value={fmtDate(data.student.lastLoginAt)} />
                  <InfoRow
                    label="الفيديوهات المشاهدة"
                    value={`${data.watchedCount} فيديو`}
                  />
                </div>

                {/* Action buttons */}
                <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t border-gray-700">
                  {/* Communication Options */}
                  {data.student.phone && (
                    <>
                      <a href={`tel:${data.student.phone}`} className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 border border-blue-500/30 transition-colors" title="اتصال بالمتعلم">📞 المتعلم</a>
                      <a href={`https://wa.me/2${data.student.phone.startsWith('0') ? data.student.phone.slice(1) : data.student.phone}`} target="_blank" rel="noreferrer" className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-green-500/10 hover:bg-green-500/20 text-green-400 border border-green-500/30 transition-colors" title="واتساب المتعلم">💬 المتعلم</a>
                    </>
                  )}
                  {data.student.parentPhone && (
                    <>
                      <a href={`tel:${data.student.parentPhone}`} className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-purple-500/10 hover:bg-purple-500/20 text-purple-400 border border-purple-500/30 transition-colors" title="اتصال بولي الأمر">📞 ولي الأمر</a>
                      <a href={`https://wa.me/2${data.student.parentPhone.startsWith('0') ? data.student.parentPhone.slice(1) : data.student.parentPhone}`} target="_blank" rel="noreferrer" className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-green-500/10 hover:bg-green-500/20 text-green-400 border border-green-500/30 transition-colors" title="واتساب ولي الأمر">💬 ولي الأمر</a>
                    </>
                  )}
                  
                  {/* Admin Controls */}
                  {(hasPermission(userRole, "suspend_student") || hasPermission(userRole, "soft_delete_student")) && (
                    <>
                      <div className="w-px h-6 bg-gray-700 mx-1 self-center" />
                      {data.student.isActive ? (
                    <button
                      onClick={() => setPendingAction("suspend")}
                      className="px-4 py-2 text-xs font-semibold rounded-lg bg-yellow-500/10 hover:bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 transition-colors"
                    >
                      ⚠️ تعليق الحساب
                    </button>
                  ) : (
                    <button
                      onClick={() => setPendingAction("unsuspend")}
                      className="px-4 py-2 text-xs font-semibold rounded-lg bg-green-500/10 hover:bg-green-500/20 text-green-400 border border-green-500/30 transition-colors"
                    >
                      ✅ رفع التعليق
                    </button>
                  )}
                  {hasPermission(userRole, "soft_delete_student") && (
                  <button
                    onClick={() => setPendingAction("delete")}
                    className="px-4 py-2 text-xs font-semibold rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 transition-colors"
                  >
                    🗑️ أرشفة الحساب
                  </button>
                  )}
                    </>
                  )}
                </div>
              </div>

              {/* Registered devices */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-white font-semibold text-sm">
                    الأجهزة المسجّلة ({devices.length}/{maxDevices})
                  </h4>
                  {canResetDevices && devices.length > 0 && !confirmingReset && (
                    <button
                      onClick={() => setConfirmingReset(true)}
                      className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30 transition-colors"
                    >
                      تصفير الأجهزة
                    </button>
                  )}
                </div>

                {confirmingReset && (
                  <div className="mb-3 rounded-xl border border-amber-500/30 bg-amber-950/30 p-4">
                    <p className="text-amber-200 text-sm leading-relaxed mb-3">
                      سيتم حذف كل الأجهزة المسجّلة لهذا المتعلم. سيتمكن من تسجيل الدخول من أي جهاز جديد بعد ذلك (حتى الحد الأقصى المسموح). هل تريد المتابعة؟
                    </p>
                    <div className="flex gap-2">
                      <button
                        onClick={handleResetDevices}
                        disabled={resettingDevices}
                        className="px-4 py-2 text-xs font-semibold rounded-lg bg-amber-600 hover:bg-amber-700 disabled:opacity-60 text-white transition-colors"
                      >
                        {resettingDevices ? "جارٍ التصفير..." : "تأكيد التصفير"}
                      </button>
                      <button
                        onClick={() => setConfirmingReset(false)}
                        disabled={resettingDevices}
                        className="px-4 py-2 text-xs font-semibold rounded-lg bg-gray-700 hover:bg-gray-600 disabled:opacity-60 text-gray-300 transition-colors"
                      >
                        إلغاء
                      </button>
                    </div>
                  </div>
                )}

                {devices.length === 0 ? (
                  <p className="text-gray-500 text-sm">لا توجد أجهزة مسجّلة</p>
                ) : (
                  <div className="space-y-2">
                    {devices.map((d) => (
                      <div
                        key={d.id}
                        className="flex items-center justify-between bg-gray-900/50 rounded-lg px-4 py-3 border border-gray-700"
                      >
                        <div className="min-w-0">
                          <p className="text-white text-sm font-medium truncate">{d.label ?? "جهاز غير معروف"}</p>
                          <p className="text-gray-400 text-xs font-mono">{d.ipAddress ?? "—"}</p>
                        </div>
                        <span className="text-gray-400 text-xs shrink-0">
                          آخر دخول {fmtDate(d.lastSeenAt)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Teacher Subscriptions */}
              <div>
                <h4 className="text-white font-semibold text-sm mb-3">
                  حجوزات باقات المعلمين ({data.student.studentSubscriptions?.length ?? 0})
                </h4>
                {!data.student.studentSubscriptions || data.student.studentSubscriptions.length === 0 ? (
                  <p className="text-gray-500 text-sm">لا توجد حجوزات باقات مسجلة لهذا المتعلم</p>
                ) : (
                  <div className="space-y-2">
                    {data.student.studentSubscriptions.map((sub) => {
                      const isGateway = sub.paymentSource === "PAYMENT_GATEWAY";
                      const isWallet = sub.paymentSource === "WALLET";
                      const isTester = sub.paymentSource === "TESTER_BYPASS" || (sub.amount === 0 && sub.paymentSource !== "MANUAL");

                      return (
                        <div
                          key={sub.id}
                          className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-gray-900/50 rounded-lg p-3 border border-gray-700"
                        >
                          <div>
                            <div className="flex items-center gap-2">
                              <p className="text-white text-sm font-medium">{sub.planLabel}</p>
                              <span className="text-xs text-sky-400 font-semibold">· أ. {sub.teacher.name}</span>
                            </div>
                            <div className="flex flex-wrap items-center gap-2 mt-1">
                              {isGateway ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                                  <span>💳</span>
                                  <span>بوابة دفع (Payment Gateway)</span>
                                </span>
                              ) : isWallet ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-purple-500/15 text-purple-300 border border-purple-500/30">
                                  <span>👛</span>
                                  <span>رصيد المحفظة (Wallet)</span>
                                </span>
                              ) : isTester ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-slate-500/15 text-slate-300 border border-slate-500/30">
                                  <span>🧪</span>
                                  <span>تجريبي (QA Bypass)</span>
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30">
                                  <span>✍️</span>
                                  <span>يدوي (Manual)</span>
                                </span>
                              )}
                              <span className="text-xs text-emerald-400 font-bold font-mono">
                                💰 {sub.amount > 0 ? `${sub.amount.toLocaleString("ar-EG")} ج.م` : "مجاني"}
                              </span>
                            </div>
                          </div>
                          <div className="text-left sm:text-right text-[11px] font-mono text-gray-400 shrink-0">
                            <div>
                              {new Date(sub.createdAt).toLocaleDateString("ar-EG", {
                                year: "numeric",
                                month: "2-digit",
                                day: "2-digit",
                              })}
                            </div>
                            <div className="text-sky-400 text-[10px]">
                              ⏰ {new Date(sub.createdAt).toLocaleTimeString("ar-EG", {
                                hour: "2-digit",
                                minute: "2-digit",
                                hour12: true,
                              })}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Enrolled courses */}
              <div>
                <h4 className="text-white font-semibold text-sm mb-3">
                  الكورسات المشتركة ({data.student.accessCodes.length})
                </h4>
                {data.student.accessCodes.length === 0 ? (
                  <p className="text-gray-500 text-sm">لم يشترك في أي كورس بعد</p>
                ) : (
                  <div className="space-y-2">
                    {data.student.accessCodes.map((ac) => (
                      <div
                        key={ac.id}
                        className="flex items-center justify-between bg-gray-900/50 rounded-lg px-4 py-3 border border-gray-700"
                      >
                        <div>
                          <p className="text-white text-sm font-medium">{ac.course.title}</p>
                          <p className="text-gray-400 text-xs">
                            {ac.course.subject} · أ. {ac.course.teacher.name}
                          </p>
                        </div>
                        <span
                          className={`text-xs px-2 py-0.5 rounded-full ${
                            ac.isActive
                              ? "bg-green-500/10 text-green-400"
                              : "bg-red-500/10 text-red-400"
                          }`}
                        >
                          {ac.isActive ? "نشط" : "موقوف"}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Quiz results grouped by course */}
              <div>
                <h4 className="text-white font-semibold text-sm mb-3">
                  نتائج الاختبارات ({data.quizResults.length})
                </h4>
                {data.quizResults.length === 0 ? (
                  <p className="text-gray-500 text-sm">لا توجد نتائج اختبارات بعد</p>
                ) : (
                  <div className="space-y-4">
                    {Object.entries(resultsByCourse ?? {}).map(
                      ([courseId, { courseTitle, results }]) => (
                        <div key={courseId}>
                          <p className="text-gray-300 text-xs font-semibold mb-2">
                            📚 {courseTitle}
                          </p>
                          <div className="overflow-x-auto rounded-xl border border-gray-700">
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="border-b border-gray-700 text-gray-500">
                                  <th className="text-right px-3 py-2 font-medium">الاختبار</th>
                                  <th className="text-right px-3 py-2 font-medium">الدرجة</th>
                                  <th className="text-right px-3 py-2 font-medium">التاريخ</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-200 dark:divide-gray-700">
                                {results.map((r) => (
                                  <tr key={r.id}>
                                    <td className="px-3 py-2 text-gray-300">{r.quiz.title}</td>
                                    <td className="px-3 py-2">
                                      {(r.pendingEssays ?? 0) > 0 ? (
                                        <span
                                          className="font-bold text-amber-400"
                                          title={`${r.pendingEssays} سؤال مقالي بانتظار تصحيح المعلم`}
                                        >
                                          ⏳ يتم المراجعة
                                        </span>
                                      ) : (
                                        <>
                                          <span
                                            className={`font-bold ${
                                              r.score >= 50 ? "text-green-400" : "text-red-400"
                                            }`}
                                          >
                                            {r.score.toFixed(0)}%
                                          </span>
                                          <span className="text-gray-500">
                                            {" "}
                                            ({Math.round((r.score * r.totalQ) / 100)}/{r.totalQ})
                                          </span>
                                        </>
                                      )}
                                    </td>
                                    <td className="px-3 py-2 text-gray-400">
                                      {fmtDate(r.completedAt)}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )
                    )}
                  </div>
                )}
              </div>
            </>
            );
          })()}
        </div>
      </div>

      {/* Suspend / Unsuspend modal */}
      {(pendingAction === "suspend" || pendingAction === "unsuspend") && (
        <ConfirmActionModal
          title={
            pendingAction === "suspend" ? "تعليق الحساب" : "رفع التعليق"
          }
          description={
            pendingAction === "suspend"
              ? `سيتم منع المتعلم "‏${data?.student.name}‏" من تسجيل الدخول والوصول للنظام. يمكن التراجع لاحقاً.`
              : `سيُعاد تفعيل حساب المتعلم "‏${data?.student.name}‏" ويستطيع تسجيل الدخول مجدداً.`
          }
          actionLabel={
            pendingAction === "suspend" ? "تعليق الحساب" : "رفع التعليق"
          }
          variant="warning"
          onConfirm={handleSuspend}
          onClose={() => setPendingAction(null)}
        />
      )}

      {/* Soft-delete (archive) modal */}
      {pendingAction === "delete" && (
        <ConfirmActionModal
          title="أرشفة حساب المتعلم"
          description={`سيتم نقل حساب المتعلم "‏${data?.student.name}‏" إلى سلة المحذوفات. يمكن للمشرف العام استعادته لاحقاً.`}
          actionLabel="أرشفة الحساب"
          variant="danger"
          onConfirm={handleDelete}
          onClose={() => setPendingAction(null)}
        />
      )}
    </div>
  );
}
