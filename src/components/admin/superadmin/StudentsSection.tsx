"use client";
import { useState, useCallback, useRef, useEffect } from "react";
import { History, MessageCircle, Pencil, RefreshCw, RotateCcw, Search, Smartphone, UserRound, Users } from "lucide-react";
import { EDUCATIONAL_STAGES } from "@/types";
import { StudentDetailModal } from "./StudentDetailModal";
import { CopyStudentReport } from "@/components/CopyStudentReport";
import { useToast } from "@/components/ui/Toast";
import { hasPermission } from "@/lib/rbac";
import {
  Badge,
  Button,
  Chip,
  EmptyState,
  Field,
  Input,
  Modal,
  Notice,
  PageHeader,
  Pagination,
  Panel,
  Select,
  SkeletonRows,
  fmtDateTime,
  fmtNum,
  readJson,
} from "@/components/admin/ui/kit";

interface ParentVerificationEvent {
  id: string;
  action: string;
  phone: string | null;
  ip: string | null;
  userAgent: string | null;
  createdAt: string;
}

interface Student {
  id: string;
  name: string;
  age: number | null;
  educationalStage: string | null;
  phone: string | null;
  parentPhone: string | null;
  isActive: boolean;
  parentVerified: boolean;
  parentVerificationStatus: string;
  createdAt: string;
  parentToken?: {
    sentAt: string | null;
    lastAccessedAt: string | null;
    issueCount: number;
    parentPhoneSnapshot: string | null;
  } | null;
  parentVerificationEvents?: ParentVerificationEvent[];
}

type Verification = "all" | "confirmed" | "pending" | "rejected";

interface SearchFilters {
  name: string;
  stage: string;
  age: string;
  phone: string;
  parentPhone: string;
  verification: Verification;
}

interface VerificationCounts {
  confirmed: number;
  pending: number;
  rejected: number;
  unverified: number;
}

const PAGE_SIZE = 20;

const EMPTY_FILTERS: SearchFilters = {
  name: "",
  stage: "",
  age: "",
  phone: "",
  parentPhone: "",
  verification: "all",
};

const EVENT_LABEL: Record<string, { text: string; tone: "ok" | "bad" | "info" | "neutral" }> = {
  CONFIRMED: { text: "ولي الأمر أكّد", tone: "ok" },
  REJECTED: { text: "ولي الأمر رفض", tone: "bad" },
  REISSUED: { text: "أُعيد إرسال الرابط", tone: "info" },
  OPENED: { text: "فُتح الرابط", tone: "neutral" },
};

function stageLabel(value: string | null) {
  if (!value) return "—";
  return EDUCATIONAL_STAGES.find((s) => s.value === value)?.label ?? value;
}

export function StudentsSection({ userRole = "superadmin", refreshKey }: { userRole?: string; refreshKey?: number }) {
  const { success: toastSuccess, error: toastError } = useToast();
  const canManageDevices = hasPermission(userRole, "suspend_student");
  const [maxDevices, setMaxDevices] = useState<number | null>(null);
  const [deviceBounds, setDeviceBounds] = useState({ min: 1, max: 10 });
  const [draftMaxDevices, setDraftMaxDevices] = useState("");
  const [savingDevices, setSavingDevices] = useState(false);

  const [filters, setFilters] = useState<SearchFilters>(EMPTY_FILTERS);
  const [students, setStudents] = useState<Student[]>([]);
  const [total, setTotal] = useState(0);
  const [counts, setCounts] = useState<VerificationCounts>({ confirmed: 0, pending: 0, rejected: 0, unverified: 0 });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [page, setPage] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const [historyStudent, setHistoryStudent] = useState<Student | null>(null);
  const [editPhoneStudent, setEditPhoneStudent] = useState<Student | null>(null);
  const [newParentPhone, setNewParentPhone] = useState("");
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const lastSearch = useRef<{ filters: SearchFilters; page: number }>({ filters: EMPTY_FILTERS, page: 0 });
  const [appliedFilters, setAppliedFilters] = useState<SearchFilters>(EMPTY_FILTERS);
  const requestSeq = useRef(0);

  const search = useCallback(async (f: SearchFilters, pageOffset: number) => {
    const seq = ++requestSeq.current;
    lastSearch.current = { filters: f, page: pageOffset };
    setAppliedFilters(f);
    setLoading(true);
    setLoadError("");
    const params = new URLSearchParams();
    if (f.name.trim()) params.set("name", f.name.trim());
    if (f.stage) params.set("stage", f.stage);
    if (f.age) params.set("age", f.age);
    if (f.phone.trim()) params.set("phone", f.phone.trim());
    if (f.parentPhone.trim()) params.set("parentPhone", f.parentPhone.trim());
    if (f.verification !== "all") params.set("verification", f.verification);
    params.set("limit", String(PAGE_SIZE));
    params.set("offset", String(pageOffset * PAGE_SIZE));

    try {
      const res = await fetch(`/api/admin/superadmin/students?${params.toString()}`, { credentials: "include" });
      const data = await readJson<{ students?: Student[]; total?: number; counts?: VerificationCounts; error?: string }>(res);
      if (seq !== requestSeq.current) return; // a newer search already started
      if (!res.ok) {
        setLoadError(data?.error || "تعذر تحميل قائمة المتعلمين");
        return;
      }
      setStudents(data?.students ?? []);
      setTotal(data?.total ?? 0);
      if (data?.counts) setCounts(data.counts);
    } catch {
      if (seq === requestSeq.current) setLoadError("تعذر الاتصال بالخادم");
    } finally {
      if (seq === requestSeq.current) setLoading(false);
    }
  }, []);

  const refresh = useCallback(() => search(lastSearch.current.filters, lastSearch.current.page), [search]);

  // Load the first page as soon as the section opens.
  useEffect(() => {
    void search(EMPTY_FILTERS, 0);
  }, [search]);

  useEffect(() => {
    if (refreshKey && refreshKey > 0) void refresh();
  }, [refreshKey, refresh]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(0);
    void search(filters, 0);
  };

  const handleVerificationFilterChange = (verification: Verification) => {
    const updated = { ...filters, verification };
    setFilters(updated);
    setPage(0);
    void search(updated, 0);
  };

  const handlePageChange = (newPage: number) => {
    setPage(newPage);
    void search(lastSearch.current.filters, newPage);
  };

  const handleReset = () => {
    setFilters(EMPTY_FILTERS);
    setPage(0);
    void search(EMPTY_FILTERS, 0);
  };

  const handleStudentModified = () => {
    setSelectedId(null);
    void refresh();
  };

  const postParentPhone = async (body: Record<string, unknown>, fallback: string) => {
    const res = await fetch("/api/student/parent-phone", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await readJson<{ error?: string; message?: string }>(res);
    if (!res.ok) throw new Error(json?.error || fallback);
    return json;
  };

  const handleResendLink = async (student: Student) => {
    if (!student.parentPhone) {
      toastError("لا يوجد رقم ولي أمر مسجّل لهذا الطالب.");
      return;
    }
    setActionLoading(`resend:${student.id}`);
    try {
      const json = await postParentPhone(
        { parentPhone: student.parentPhone, studentId: student.id, allowSamePhone: true },
        "تعذر إعادة إرسال الرابط"
      );
      toastSuccess(json?.message || "أُعيد إرسال الرابط عبر واتساب");
      void refresh();
    } catch (err) {
      toastError(err instanceof Error ? err.message : "تعذر إعادة إرسال الرابط");
    } finally {
      setActionLoading(null);
    }
  };

  const handleSaveParentPhone = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editPhoneStudent || !newParentPhone.trim()) return;
    setActionLoading("edit");
    try {
      const json = await postParentPhone(
        { parentPhone: newParentPhone.trim(), studentId: editPhoneStudent.id },
        "تعذر تحديث الرقم وإرسال الرابط"
      );
      toastSuccess(json?.message || "تم تحديث الرقم وإرسال الرابط");
      setEditPhoneStudent(null);
      setNewParentPhone("");
      void refresh();
    } catch (err) {
      toastError(err instanceof Error ? err.message : "تعذر تحديث الرقم وإرسال الرابط");
    } finally {
      setActionLoading(null);
    }
  };

  const handleResetParentLimits = async (student: Student) => {
    setActionLoading(`reset:${student.id}`);
    try {
      const json = await postParentPhone({ studentId: student.id, resetCount: true }, "تعذر تصفير العداد");
      toastSuccess(json?.message || "تم تصفير عداد المحاولات");
      void refresh();
    } catch (err) {
      toastError(err instanceof Error ? err.message : "تعذر تصفير العداد");
    } finally {
      setActionLoading(null);
    }
  };

  useEffect(() => {
    if (!canManageDevices) return;
    fetch("/api/admin/superadmin/settings/max-devices", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { maxDevices?: number; min?: number; max?: number } | null) => {
        if (!d || typeof d.maxDevices !== "number") return;
        setMaxDevices(d.maxDevices);
        setDraftMaxDevices(String(d.maxDevices));
        setDeviceBounds({ min: d.min ?? 1, max: d.max ?? 10 });
      })
      .catch(() => {});
  }, [canManageDevices]);

  const handleSaveMaxDevices = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const n = Number(draftMaxDevices);
    if (!Number.isInteger(n) || n < deviceBounds.min || n > deviceBounds.max) {
      toastError(`عدد الأجهزة يجب أن يكون رقماً صحيحاً بين ${deviceBounds.min} و ${deviceBounds.max}`);
      return;
    }
    setSavingDevices(true);
    try {
      const res = await fetch("/api/admin/superadmin/settings/max-devices", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ maxDevices: n }),
      });
      const json = await readJson<{ maxDevices?: number; error?: string }>(res);
      if (!res.ok) throw new Error(json?.error ?? "تعذر حفظ الحد");
      setMaxDevices(json?.maxDevices ?? n);
      setDraftMaxDevices(String(json?.maxDevices ?? n));
      toastSuccess(`الحد الأقصى للأجهزة الآن ${json?.maxDevices ?? n}`);
    } catch (err) {
      toastError(err instanceof Error ? err.message : "تعذر حفظ الحد");
    } finally {
      setSavingDevices(false);
    }
  };

  const totalPages = Math.ceil(total / PAGE_SIZE);
  const hasFilters = JSON.stringify(appliedFilters) !== JSON.stringify(EMPTY_FILTERS);

  return (
    <div dir="rtl" className="flex flex-col gap-5">
      <PageHeader
        title="المتعلمون"
        description="ابحث عن أي متعلم بالاسم أو الهاتف أو الصف، وتابع توثيق ولي الأمر، وافتح ملفه لإدارة الأجهزة والاشتراكات."
        actions={
          <Button onClick={() => void refresh()} loading={loading} icon={<RefreshCw size={15} />}>
            تحديث
          </Button>
        }
      />

      {counts.unverified > 0 && (
        <Notice
          tone="warn"
          title={`${fmtNum(counts.unverified)} متعلم بدون ولي أمر مؤكد`}
          action={
            <Button size="sm" onClick={() => handleVerificationFilterChange("rejected")}>
              عرض المرفوضين
            </Button>
          }
        >
          {fmtNum(counts.pending)} في الانتظار · {fmtNum(counts.rejected)} مرفوض
        </Notice>
      )}

      <Panel padded={false} clip={false}>
        <form onSubmit={handleSubmit} className="adm-panel-body flex flex-col gap-4">
          <div className="flex flex-col sm:flex-row gap-3 sm:items-end">
            <Field label="الاسم" htmlFor="st-name" className="flex-1">
              <Input
                id="st-name"
                value={filters.name}
                onChange={(e) => setFilters({ ...filters, name: e.target.value })}
                placeholder="اسم المتعلم"
              />
            </Field>
            <Field label="رقم المتعلم" htmlFor="st-phone" className="sm:w-52">
              <Input
                id="st-phone"
                inputMode="tel"
                mono
                value={filters.phone}
                onChange={(e) => setFilters({ ...filters, phone: e.target.value })}
                placeholder="01XXXXXXXXX"
              />
            </Field>
            <div className="flex gap-2">
              <Button type="submit" variant="primary" loading={loading} icon={<Search size={15} />}>
                بحث
              </Button>
              <Button variant="ghost" onClick={() => setShowAdvanced((v) => !v)} aria-expanded={showAdvanced}>
                {showAdvanced ? "فلاتر أقل" : "فلاتر أكثر"}
              </Button>
            </div>
          </div>

          {showAdvanced && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Field label="الصف" htmlFor="st-stage">
                <Select id="st-stage" value={filters.stage} onChange={(e) => setFilters({ ...filters, stage: e.target.value })}>
                  <option value="">كل الصفوف</option>
                  {EDUCATIONAL_STAGES.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="السن" htmlFor="st-age">
                <Input
                  id="st-age"
                  type="number"
                  min={6}
                  max={25}
                  value={filters.age}
                  onChange={(e) => setFilters({ ...filters, age: e.target.value })}
                  placeholder="مثال: 16"
                />
              </Field>
              <Field label="رقم ولي الأمر" htmlFor="st-parent">
                <Input
                  id="st-parent"
                  inputMode="tel"
                  mono
                  value={filters.parentPhone}
                  onChange={(e) => setFilters({ ...filters, parentPhone: e.target.value })}
                  placeholder="01XXXXXXXXX"
                />
              </Field>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <span className="adm-label me-1">توثيق ولي الأمر:</span>
            <Chip pressed={filters.verification === "all"} onClick={() => handleVerificationFilterChange("all")}>
              الكل
            </Chip>
            <Chip pressed={filters.verification === "confirmed"} onClick={() => handleVerificationFilterChange("confirmed")} count={counts.confirmed}>
              مؤكد
            </Chip>
            <Chip pressed={filters.verification === "pending"} onClick={() => handleVerificationFilterChange("pending")} count={counts.pending}>
              في الانتظار
            </Chip>
            <Chip pressed={filters.verification === "rejected"} onClick={() => handleVerificationFilterChange("rejected")} count={counts.rejected}>
              مرفوض
            </Chip>
            {hasFilters && (
              <Button size="sm" variant="ghost" onClick={handleReset} icon={<RotateCcw size={14} />}>
                مسح الفلاتر
              </Button>
            )}
          </div>
        </form>
      </Panel>

      <Panel
        padded={false}
        title={loading && students.length === 0 ? "جارٍ التحميل" : `${fmtNum(total)} متعلم`}
        footer={
          totalPages > 1 ? (
            <Pagination page={page} pageCount={totalPages} total={total} unit="متعلم" onPage={handlePageChange} disabled={loading} />
          ) : undefined
        }
      >
        {loadError ? (
          <div className="p-4">
            <Notice tone="bad" title={loadError} action={<Button size="sm" onClick={() => void refresh()}>إعادة المحاولة</Button>} />
          </div>
        ) : loading && students.length === 0 ? (
          <SkeletonRows rows={6} />
        ) : students.length === 0 ? (
          <EmptyState
            icon={<Users size={22} />}
            title="لا يوجد متعلمون مطابقون"
            text={hasFilters ? "جرّب اسماً أقصر أو امسح الفلاتر." : "لم يسجّل أي متعلم بعد."}
            action={hasFilters ? <Button onClick={handleReset}>مسح الفلاتر</Button> : undefined}
          />
        ) : (
          <div className="adm-table-wrap" aria-busy={loading}>
            <table className="adm-table" style={{ minWidth: 860, opacity: loading ? 0.6 : 1 }}>
              <thead>
                <tr>
                  <th>المتعلم</th>
                  <th>الصف</th>
                  <th>الهاتف</th>
                  <th>ولي الأمر</th>
                  <th>التوثيق</th>
                  <th>الحساب</th>
                  <th className="is-actions">إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {students.map((s) => {
                  const isRejected = s.parentVerificationStatus === "REJECTED";
                  const isConfirmed = s.parentVerificationStatus === "CONFIRMED" || s.parentVerified;
                  const issueCount = s.parentToken?.issueCount ?? 0;
                  return (
                    <tr key={s.id} className={isRejected ? "is-bad" : undefined}>
                      <td>
                        <div className="flex items-center gap-2.5">
                          <span className="adm-avatar" aria-hidden>{s.name?.[0] ?? "؟"}</span>
                          <div className="min-w-0">
                            <button
                              type="button"
                              onClick={() => setSelectedId(s.id)}
                              className="font-bold text-start hover:underline cursor-pointer"
                              style={{ color: "var(--ink)" }}
                            >
                              {s.name}
                            </button>
                            {issueCount >= 3 && (
                              <div className="flex items-center gap-1.5 mt-1">
                                <Badge tone="warn" title="غيّر المتعلم رقم ولي الأمر ٣ مرات أو أكثر">
                                  غيّر الرقم {fmtNum(issueCount)} مرات
                                </Badge>
                                <button
                                  type="button"
                                  onClick={() => void handleResetParentLimits(s)}
                                  disabled={actionLoading !== null}
                                  className="text-xs font-bold underline cursor-pointer disabled:opacity-50"
                                  style={{ color: "var(--brand)" }}
                                  title="تصفير عداد المحاولات وفك الحظر"
                                >
                                  تصفير
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="whitespace-nowrap">{stageLabel(s.educationalStage)}</td>
                      <td><span className="adm-mono">{s.phone ?? "—"}</span></td>
                      <td><span className="adm-mono">{s.parentPhone ?? "—"}</span></td>
                      <td>
                        <Badge tone={isConfirmed ? "ok" : isRejected ? "bad" : "warn"} dot>
                          {isConfirmed ? "مؤكد" : isRejected ? "مرفوض" : "في الانتظار"}
                        </Badge>
                      </td>
                      <td>
                        <Badge tone={s.isActive ? "ok" : "bad"}>{s.isActive ? "نشط" : "موقوف"}</Badge>
                      </td>
                      <td className="is-actions">
                        <div className="inline-flex items-center gap-1">
                          <Button size="sm" variant="primary" onClick={() => setSelectedId(s.id)} icon={<UserRound size={14} />}>
                            الملف
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => void handleResendLink(s)}
                            loading={actionLoading === `resend:${s.id}`}
                            disabled={actionLoading !== null || !s.parentPhone}
                            title="إعادة إرسال رابط متابعة ولي الأمر عبر واتساب"
                            icon={<MessageCircle size={14} />}
                          >
                            إرسال
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setEditPhoneStudent(s);
                              setNewParentPhone(s.parentPhone || "");
                            }}
                            title="تعديل رقم ولي الأمر"
                            icon={<Pencil size={14} />}
                          >
                            تعديل
                          </Button>
                          <CopyStudentReport student={s} />
                          <Button size="sm" variant="ghost" onClick={() => setHistoryStudent(s)} title="سجل محاولات التوثيق" icon={<History size={14} />}>
                            السجل
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {canManageDevices && maxDevices !== null && (
        <Panel
          title="الحد الأقصى لأجهزة المتعلم"
          icon={<Smartphone size={16} />}
          description="عدد الأجهزة التي يمكن للمتعلم الدخول منها. عند الوصول للحد يُمنع الدخول من جهاز جديد حتى تُصفّر أجهزته من ملفه."
        >
          <form onSubmit={handleSaveMaxDevices} className="flex items-end gap-2">
            <Field label={`عدد الأجهزة (${deviceBounds.min}–${deviceBounds.max})`} htmlFor="st-max-dev">
              <Input
                id="st-max-dev"
                type="number"
                min={deviceBounds.min}
                max={deviceBounds.max}
                value={draftMaxDevices}
                onChange={(e) => setDraftMaxDevices(e.target.value)}
                className="w-28 text-center"
              />
            </Field>
            <Button type="submit" variant="primary" loading={savingDevices} disabled={draftMaxDevices === String(maxDevices)}>
              حفظ
            </Button>
          </form>
        </Panel>
      )}

      {selectedId && (
        <StudentDetailModal
          studentId={selectedId}
          userRole={userRole}
          onClose={() => setSelectedId(null)}
          onStudentModified={handleStudentModified}
        />
      )}

      <Modal
        open={!!historyStudent}
        onClose={() => setHistoryStudent(null)}
        title="سجل توثيق ولي الأمر"
        description={historyStudent?.name}
        size="md"
        footer={<Button onClick={() => setHistoryStudent(null)}>إغلاق</Button>}
      >
        {!historyStudent?.parentVerificationEvents?.length ? (
          <EmptyState icon={<History size={20} />} title="لا توجد محاولات مسجلة بعد" />
        ) : (
          <ol className="flex flex-col gap-2">
            {historyStudent.parentVerificationEvents.map((ev) => {
              const meta = EVENT_LABEL[ev.action] ?? { text: ev.action, tone: "neutral" as const };
              return (
                <li key={ev.id} className="adm-well p-3 flex flex-col gap-1">
                  <div className="flex items-center justify-between gap-2">
                    <Badge tone={meta.tone} dot>{meta.text}</Badge>
                    <span className="text-xs adm-muted">{fmtDateTime(ev.createdAt)}</span>
                  </div>
                  {ev.phone && (
                    <p className="text-[13px]">
                      الرقم: <span className="adm-mono">{ev.phone}</span>
                    </p>
                  )}
                  {ev.ip && (
                    <p className="text-xs adm-muted">
                      IP: <span className="adm-mono">{ev.ip}</span>
                    </p>
                  )}
                </li>
              );
            })}
          </ol>
        )}
      </Modal>

      <Modal
        open={!!editPhoneStudent}
        onClose={() => setEditPhoneStudent(null)}
        title="تعديل رقم ولي الأمر"
        description={editPhoneStudent ? `${editPhoneStudent.name} — سيُرسل رابط متابعة جديد عبر واتساب فوراً.` : undefined}
        size="sm"
        footer={
          <>
            <Button onClick={() => setEditPhoneStudent(null)}>إلغاء</Button>
            <Button type="submit" form="st-edit-parent" variant="primary" loading={actionLoading === "edit"}>
              حفظ وإرسال الرابط
            </Button>
          </>
        }
      >
        <form id="st-edit-parent" onSubmit={handleSaveParentPhone}>
          <Field label="رقم ولي الأمر الجديد" htmlFor="st-new-parent">
            <Input
              id="st-new-parent"
              data-autofocus
              required
              inputMode="tel"
              mono
              value={newParentPhone}
              onChange={(e) => setNewParentPhone(e.target.value)}
              placeholder="01XXXXXXXXX"
            />
          </Field>
        </form>
      </Modal>
    </div>
  );
}
