"use client";
import { useCallback, useEffect, useState } from "react";
import { Archive, RotateCcw, Search, Trash2 } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { ConfirmActionModal } from "./ConfirmActionModal";
import { EDUCATIONAL_STAGES } from "@/types";
import { hasPermission } from "@/lib/rbac";
import {
  Button,
  EmptyState,
  Input,
  Notice,
  PageHeader,
  Pagination,
  Panel,
  SkeletonRows,
  fmtDate,
  fmtNum,
  readJson,
} from "@/components/admin/ui/kit";

interface DeletedStudent {
  id: string;
  name: string;
  age: number | null;
  educationalStage: string | null;
  phone: string | null;
  deletedAt: string | null;
  createdAt: string;
}

type ModalAction = { type: "restore" | "hard_delete"; student: DeletedStudent } | null;

const PAGE_SIZE = 20;

function stageLabel(v: string | null) {
  if (!v) return "—";
  return EDUCATIONAL_STAGES.find((s) => s.value === v)?.label ?? v;
}

export function DeletedStudentsSection({ userRole = "superadmin" }: { userRole?: string }) {
  const { success: toastSuccess } = useToast();
  const [students, setStudents] = useState<DeletedStudent[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [page, setPage] = useState(0);
  const [nameFilter, setNameFilter] = useState("");
  const [lastFilter, setLastFilter] = useState("");
  const [modalAction, setModalAction] = useState<ModalAction>(null);

  const canRestore = hasPermission(userRole, "restore_student");
  const canHardDelete = hasPermission(userRole, "hard_delete_student");

  const fetchDeleted = useCallback(async (name: string, pageOffset: number) => {
    setLoading(true);
    setLoadError("");
    const params = new URLSearchParams();
    if (name.trim()) params.set("name", name.trim());
    params.set("limit", String(PAGE_SIZE));
    params.set("offset", String(pageOffset * PAGE_SIZE));
    try {
      const res = await fetch(`/api/admin/superadmin/students/deleted?${params.toString()}`, { credentials: "include" });
      const data = await readJson<{ students?: DeletedStudent[]; total?: number; error?: string }>(res);
      if (!res.ok) {
        setLoadError(data?.error || "تعذر تحميل المتعلمين المحذوفين");
        return;
      }
      setStudents(data?.students ?? []);
      setTotal(data?.total ?? 0);
    } catch {
      setLoadError("تعذر الاتصال بالخادم");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchDeleted("", 0);
  }, [fetchDeleted]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(0);
    setLastFilter(nameFilter);
    void fetchDeleted(nameFilter, 0);
  };

  const handlePageChange = (newPage: number) => {
    setPage(newPage);
    void fetchDeleted(lastFilter, newPage);
  };

  const removeFromList = (id: string) => {
    setStudents((prev) => prev.filter((s) => s.id !== id));
    setTotal((t) => Math.max(0, t - 1));
  };

  const handleRestore = async (password: string) => {
    if (modalAction?.type !== "restore") return;
    const { student } = modalAction;
    const res = await fetch(`/api/admin/superadmin/students/${student.id}/restore`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ actionPassword: password }),
    });
    const json = await readJson<{ error?: string }>(res);
    if (!res.ok) throw new Error(json?.error ?? "تعذر استعادة الحساب");
    toastSuccess(`استُعيد حساب ${student.name}`);
    removeFromList(student.id);
    setModalAction(null);
  };

  const handleHardDelete = async (password: string) => {
    if (modalAction?.type !== "hard_delete") return;
    const { student } = modalAction;
    const res = await fetch(`/api/admin/superadmin/students/${student.id}`, {
      method: "DELETE",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ actionPassword: password, permanent: true }),
    });
    const json = await readJson<{ error?: string }>(res);
    if (!res.ok) throw new Error(json?.error ?? "تعذر الحذف النهائي");
    toastSuccess(`حُذف حساب ${student.name} نهائياً`);
    removeFromList(student.id);
    setModalAction(null);
  };

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div dir="rtl" className="flex flex-col gap-5">
      <PageHeader
        title="المتعلمون المحذوفون"
        description="حسابات أُرشفت من ملف المتعلم. يمكن استعادتها كما كانت، أو حذفها نهائياً."
      />

      <Panel
        padded={false}
        title={loading && students.length === 0 ? "جارٍ التحميل" : `${fmtNum(total)} حساب مؤرشف`}
        actions={
          <form onSubmit={handleSubmit} className="flex gap-2">
            <Input
              inputSize="sm"
              value={nameFilter}
              onChange={(e) => setNameFilter(e.target.value)}
              placeholder="بحث بالاسم"
              aria-label="بحث باسم المتعلم"
              className="w-56 max-w-full"
            />
            <Button type="submit" size="sm" icon={<Search size={14} />} loading={loading}>
              بحث
            </Button>
          </form>
        }
        footer={
          totalPages > 1 ? (
            <Pagination page={page} pageCount={totalPages} total={total} unit="حساب" onPage={handlePageChange} disabled={loading} />
          ) : undefined
        }
      >
        {loadError ? (
          <div className="p-4">
            <Notice tone="bad" title={loadError} action={<Button size="sm" onClick={() => void fetchDeleted(lastFilter, page)}>إعادة المحاولة</Button>} />
          </div>
        ) : loading && students.length === 0 ? (
          <SkeletonRows rows={4} h={52} />
        ) : students.length === 0 ? (
          <EmptyState
            icon={<Archive size={22} />}
            title={lastFilter ? "لا نتائج مطابقة" : "لا يوجد متعلمون مؤرشفون"}
            text={lastFilter ? undefined : "عند أرشفة متعلم من ملفه سيظهر هنا."}
          />
        ) : (
          <ul className="adm-list" style={{ opacity: loading ? 0.6 : 1 }}>
            {students.map((s) => (
              <li key={s.id} className="adm-row">
                <div className="flex items-center gap-3 min-w-0 flex-1 basis-60">
                  <span className="adm-avatar" style={{ background: "var(--surface-2)", color: "var(--ink-3)" }} aria-hidden>
                    {s.name?.[0] ?? "؟"}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-bold truncate">{s.name}</p>
                    <p className="text-xs adm-muted">
                      {stageLabel(s.educationalStage)}
                      {s.age ? ` · ${fmtNum(s.age)} سنة` : ""}
                      {s.phone ? <> · <span className="adm-mono">{s.phone}</span></> : null}
                      {" "}· أُرشف {fmtDate(s.deletedAt)}
                    </p>
                  </div>
                </div>
                <div className="flex gap-2">
                  {canRestore && (
                    <Button size="sm" variant="primary" icon={<RotateCcw size={14} />} onClick={() => setModalAction({ type: "restore", student: s })}>
                      استعادة
                    </Button>
                  )}
                  {canHardDelete && (
                    <Button size="sm" variant="danger" icon={<Trash2 size={14} />} onClick={() => setModalAction({ type: "hard_delete", student: s })}>
                      حذف نهائي
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      {modalAction?.type === "restore" && (
        <ConfirmActionModal
          title="استعادة حساب المتعلم"
          description={`سيُعاد تفعيل حساب "‏${modalAction.student.name}‏" ويستطيع تسجيل الدخول مجدداً.`}
          actionLabel="استعادة الحساب"
          variant="warning"
          onConfirm={handleRestore}
          onClose={() => setModalAction(null)}
        />
      )}

      {modalAction?.type === "hard_delete" && (
        <ConfirmActionModal
          title="حذف نهائي — لا يمكن التراجع"
          description={`ستُحذف بيانات "‏${modalAction.student.name}‏" وكل سجلاته نهائياً ولا يمكن استرجاعها.`}
          actionLabel="حذف نهائياً"
          variant="danger"
          onConfirm={handleHardDelete}
          onClose={() => setModalAction(null)}
        />
      )}
    </div>
  );
}
