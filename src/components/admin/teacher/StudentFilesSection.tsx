"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CheckCircle2,
  Download,
  ExternalLink,
  FileArchive,
  FileImage,
  FileText,
  FolderOpen,
  Hourglass,
  RefreshCw,
  Users,
  XCircle,
} from "lucide-react";
import {
  Badge,
  Button,
  Chip,
  EmptyState,
  Field,
  Modal,
  Notice,
  PageHeader,
  Pagination,
  Panel,
  SearchInput,
  Select,
  SkeletonRows,
  Stat,
  Textarea,
  fmtDateTime,
  fmtNum,
  readJson,
} from "@/components/admin/ui/kit";
import { useToast } from "@/components/ui/Toast";

type StudentFile = {
  submissionId: string;
  homeworkId: string;
  homeworkTitle: string;
  place: string | null;
  student: { id: string; name: string; email: string | null; phone: string | null };
  fileName: string;
  ext: string;
  size: number | null;
  status: string;
  allowRetake: boolean;
  review: { verdict: string; note: string | null; reviewedAt: string } | null;
  completedAt: string;
  previewUrl: string;
  downloadUrl: string;
};

type FilesResponse = {
  stats: { total: number; awaitingReview: number; accepted: number; rejected: number; students: number };
  homeworks: Array<{ id: string; title: string; count: number }>;
  files: StudentFile[];
  page: number;
  pageCount: number;
  total: number;
};

type StatusFilter = "all" | "review" | "accepted" | "rejected";

const IMAGE_EXT = new Set(["png", "jpg", "jpeg", "gif", "webp"]);
const PREVIEWABLE = new Set(["pdf", ...IMAGE_EXT]);

function fmtSize(bytes: number | null) {
  if (bytes == null) return "على S3";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function statusBadge(file: Pick<StudentFile, "status" | "allowRetake">) {
  if (file.status === "passed") return <Badge tone="ok" dot>مقبول</Badge>;
  if (file.status === "failed")
    return file.allowRetake ? <Badge tone="info" dot>مسموح يرفع تاني</Badge> : <Badge tone="bad" dot>مرفوض</Badge>;
  return <Badge tone="warn" live>مستني مراجعة</Badge>;
}

function FileGlyph({ ext }: { ext: string }) {
  const Icon = IMAGE_EXT.has(ext) || ext === "heic" ? FileImage : ext === "zip" ? FileArchive : FileText;
  return (
    <span className="adm-avatar" aria-hidden>
      <Icon size={18} />
    </span>
  );
}

/**
 * Every file students uploaded to this teacher's homework, in one place:
 * search, filter, preview in the page, accept/reject, and ZIP download.
 */
export function StudentFilesSection() {
  const { success: toastSuccess, error: toastError } = useToast();
  const [data, setData] = useState<FilesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [status, setStatus] = useState<StatusFilter>("review");
  const [homeworkId, setHomeworkId] = useState("");
  const [student, setStudent] = useState<{ id: string; name: string } | null>(null);
  const [page, setPage] = useState(0);
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const requestSeq = useRef(0);

  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedQ(q.trim());
      setPage(0);
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  // Any filter change starts again from the first page.
  const filterBy = {
    status: (v: StatusFilter) => { setStatus(v); setPage(0); },
    homework: (v: string) => { setHomeworkId(v); setPage(0); },
    student: (v: { id: string; name: string } | null) => { setStudent(v); setPage(0); },
  };

  const load = useCallback(async () => {
    const seq = ++requestSeq.current;
    setLoading(true);
    setLoadError(null);
    const params = new URLSearchParams({ status, page: String(page) });
    if (debouncedQ) params.set("q", debouncedQ);
    if (homeworkId) params.set("homeworkId", homeworkId);
    if (student) params.set("studentId", student.id);
    try {
      const res = await fetch(`/api/teacher/student-files?${params}`, { credentials: "include" });
      const json = await readJson<FilesResponse & { error?: string }>(res);
      if (seq !== requestSeq.current) return;
      if (!res.ok || !json) throw new Error(json?.error || "تعذر تحميل الملفات");
      setData(json);
    } catch (err) {
      if (seq === requestSeq.current) setLoadError(err instanceof Error ? err.message : "تعذر تحميل الملفات");
    } finally {
      if (seq === requestSeq.current) setLoading(false);
    }
  }, [status, page, debouncedQ, homeworkId, student]);

  useEffect(() => {
    void load();
  }, [load]);

  const files = useMemo(() => data?.files ?? [], [data]);
  const current = openIndex != null ? files[openIndex] ?? null : null;

  const onReviewed = (submissionId: string, verdict: "passed" | "failed", note: string) => {
    setData((prev) =>
      prev
        ? {
            ...prev,
            files: prev.files.map((f) =>
              f.submissionId === submissionId
                ? { ...f, status: verdict, allowRetake: false, review: { verdict, note, reviewedAt: new Date().toISOString() } }
                : f
            ),
          }
        : prev
    );
    toastSuccess(verdict === "passed" ? "تم قبول الملف" : "تم رفض الملف — الطالب هيشوف الملاحظة");
  };

  const zipHref = homeworkId
    ? `/api/teacher/student-files/zip?homeworkId=${encodeURIComponent(homeworkId)}`
    : student
      ? `/api/teacher/student-files/zip?studentId=${encodeURIComponent(student.id)}`
      : null;

  const stats = data?.stats;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="ملفات الطلاب"
        description="كل ملف رفعه طالب في واجباتك في مكان واحد. افتح الملف هنا من غير تحميل، واقبل أو ارفض من نفس الشاشة."
        actions={
          <>
            <Button icon={<RefreshCw size={15} />} onClick={() => void load()} loading={loading && !!data}>
              تحديث
            </Button>
            {zipHref ? (
              <a className="adm-btn is-primary" href={zipHref}>
                <Download size={15} aria-hidden />
                تحميل الكل ZIP
              </a>
            ) : (
              <Button variant="primary" icon={<Download size={15} />} disabled title="اختار واجب أو طالب الأول">
                تحميل الكل ZIP
              </Button>
            )}
          </>
        }
      />

      <div className="adm-stats">
        <Stat label="كل الملفات" value={fmtNum(stats?.total)} icon={<FolderOpen size={16} />} />
        <Stat
          label="مستنية مراجعة"
          value={fmtNum(stats?.awaitingReview)}
          tone={(stats?.awaitingReview ?? 0) > 0 ? "warn" : "neutral"}
          icon={<Hourglass size={16} />}
        />
        <Stat label="مقبولة" value={fmtNum(stats?.accepted)} tone="ok" icon={<CheckCircle2 size={16} />} />
        <Stat label="مرفوضة" value={fmtNum(stats?.rejected)} tone="bad" icon={<XCircle size={16} />} />
        <Stat label="طلاب رفعوا ملفات" value={fmtNum(stats?.students)} icon={<Users size={16} />} />
      </div>

      <Panel padded tight>
        <div className="flex flex-col gap-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <SearchInput value={q} onChange={setQ} placeholder="ابحث باسم الطالب أو الإيميل أو الرقم" />
            <Select value={homeworkId} onChange={(e) => filterBy.homework(e.target.value)} aria-label="الواجب">
              <option value="">كل الواجبات</option>
              {(data?.homeworks ?? []).map((h) => (
                <option key={h.id} value={h.id}>
                  {h.title} ({fmtNum(h.count)})
                </option>
              ))}
            </Select>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Chip pressed={status === "review"} onClick={() => filterBy.status("review")} count={stats?.awaitingReview}>
              مستنية مراجعة
            </Chip>
            <Chip pressed={status === "all"} onClick={() => filterBy.status("all")} count={stats?.total}>
              الكل
            </Chip>
            <Chip pressed={status === "accepted"} onClick={() => filterBy.status("accepted")} count={stats?.accepted}>
              مقبولة
            </Chip>
            <Chip pressed={status === "rejected"} onClick={() => filterBy.status("rejected")} count={stats?.rejected}>
              مرفوضة
            </Chip>
            {student && (
              <Badge tone="brand">
                ملفات {student.name}
                <button
                  type="button"
                  className="ms-1 font-black"
                  aria-label="إلغاء فلتر الطالب"
                  onClick={() => filterBy.student(null)}
                >
                  ×
                </button>
              </Badge>
            )}
          </div>
        </div>
      </Panel>

      {loadError && (
        <Notice tone="bad" title="تعذر تحميل الملفات" action={<Button size="sm" onClick={() => void load()}>إعادة المحاولة</Button>}>
          {loadError}
        </Notice>
      )}

      <Panel padded={false}>
        {loading && !data ? (
          <SkeletonRows rows={6} h={56} />
        ) : files.length === 0 ? (
          <EmptyState
            icon={<FolderOpen size={22} />}
            title={status === "review" ? "مفيش ملفات مستنية مراجعة" : "مفيش ملفات هنا"}
            text={status === "review" ? "كل الملفات اتراجعت. اختار «الكل» تشوف الملفات القديمة." : "جرّب تغيّر البحث أو الفلتر."}
          />
        ) : (
          <ul className="adm-list" aria-busy={loading}>
            {files.map((f, i) => (
              <li key={f.submissionId} className="adm-row">
                <FileGlyph ext={f.ext} />
                <div className="min-w-0 flex-1" style={{ flexBasis: 220 }}>
                  <button
                    type="button"
                    onClick={() => setOpenIndex(i)}
                    className="block max-w-full truncate text-start font-bold hover:underline"
                    style={{ color: "var(--ink)" }}
                    title={f.fileName}
                  >
                    {f.fileName}
                  </button>
                  <p className="adm-muted truncate text-[12.5px]">
                    {f.homeworkTitle}
                    {f.place ? ` · ${f.place}` : ""}
                  </p>
                </div>
                <div className="min-w-0" style={{ flexBasis: 160 }}>
                  <button
                    type="button"
                    className="block max-w-full truncate text-start text-[13.5px] font-semibold hover:underline"
                    style={{ color: "var(--ink)" }}
                    onClick={() => filterBy.student({ id: f.student.id, name: f.student.name })}
                    title="كل ملفات الطالب ده"
                  >
                    {f.student.name}
                  </button>
                  <p className="adm-muted adm-mono truncate text-[12px]">{f.student.phone || f.student.email || ""}</p>
                </div>
                <div className="flex flex-col items-start gap-1" style={{ minWidth: 120 }}>
                  {statusBadge(f)}
                  <span className="adm-muted adm-num text-[12px]">
                    {fmtDateTime(f.completedAt)} · {fmtSize(f.size)}
                  </span>
                </div>
                <div className="ms-auto flex gap-2">
                  <Button size="sm" variant="primary" onClick={() => setOpenIndex(i)}>
                    {PREVIEWABLE.has(f.ext) ? "افتح" : "راجع"}
                  </Button>
                  <a className="adm-btn is-sm" href={f.downloadUrl} aria-label={`تحميل ${f.fileName}`} title="تحميل">
                    <Download size={14} aria-hidden />
                  </a>
                </div>
              </li>
            ))}
          </ul>
        )}
        {data && data.pageCount > 1 && (
          <div className="adm-panel-foot">
            <Pagination page={page} pageCount={data.pageCount} total={data.total} onPage={setPage} disabled={loading} unit="ملف" />
          </div>
        )}
      </Panel>

      {current && (
        <FilePreviewModal
          key={current.submissionId}
          file={current}
          position={{ index: openIndex!, count: files.length }}
          onClose={() => setOpenIndex(null)}
          onStep={(delta) => setOpenIndex((i) => (i == null ? i : Math.min(files.length - 1, Math.max(0, i + delta))))}
          onReviewed={onReviewed}
          onError={toastError}
        />
      )}
    </div>
  );
}

function FilePreviewModal({
  file,
  position,
  onClose,
  onStep,
  onReviewed,
  onError,
}: {
  file: StudentFile;
  position: { index: number; count: number };
  onClose: () => void;
  onStep: (delta: number) => void;
  onReviewed: (submissionId: string, verdict: "passed" | "failed", note: string) => void;
  onError: (text: string) => void;
}) {
  const [note, setNote] = useState(file.review?.note ?? "");
  const [saving, setSaving] = useState<"passed" | "failed" | null>(null);
  const isImage = IMAGE_EXT.has(file.ext);
  const isPdf = file.ext === "pdf";

  const review = async (verdict: "passed" | "failed") => {
    if (verdict === "failed" && !note.trim()) {
      onError("اكتب للطالب سبب الرفض الأول — هيظهر له مع الواجب");
      return;
    }
    setSaving(verdict);
    try {
      const res = await fetch(`/api/homework/${file.homeworkId}/review`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ submissionId: file.submissionId, verdict, note: note.trim() }),
      });
      const json = await readJson<{ error?: string }>(res);
      if (!res.ok) throw new Error(json?.error || "تعذر حفظ القرار");
      onReviewed(file.submissionId, verdict, note.trim());
      if (position.index < position.count - 1) onStep(1);
    } catch (err) {
      onError(err instanceof Error ? err.message : "تعذر حفظ القرار");
    } finally {
      setSaving(null);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      size="xl"
      title={file.fileName}
      description={`${file.student.name} · ${file.homeworkTitle} · ${fmtDateTime(file.completedAt)}`}
      footer={
        <div className="flex w-full flex-wrap items-center gap-2">
          <Button size="sm" onClick={() => onStep(-1)} disabled={position.index === 0}>
            السابق
          </Button>
          <span className="adm-muted adm-num text-[13px]">
            {fmtNum(position.index + 1)} / {fmtNum(position.count)}
          </span>
          <Button size="sm" onClick={() => onStep(1)} disabled={position.index >= position.count - 1}>
            التالي
          </Button>
          <div className="ms-auto flex flex-wrap gap-2">
            <Button variant="danger" loading={saving === "failed"} disabled={!!saving} onClick={() => void review("failed")} icon={<XCircle size={15} />}>
              رفض
            </Button>
            <Button variant="primary" loading={saving === "passed"} disabled={!!saving} onClick={() => void review("passed")} icon={<CheckCircle2 size={15} />}>
              قبول
            </Button>
          </div>
        </div>
      }
    >
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {statusBadge(file)}
          <span className="adm-muted text-[12.5px]">{fmtSize(file.size)}</span>
          <a className="adm-btn is-sm ms-auto" href={file.previewUrl} target="_blank" rel="noreferrer">
            <ExternalLink size={14} aria-hidden />
            افتح في تبويب جديد
          </a>
          <a className="adm-btn is-sm" href={file.downloadUrl}>
            <Download size={14} aria-hidden />
            تحميل
          </a>
        </div>

        <div className="adm-well overflow-hidden" style={{ height: "min(62vh, 720px)" }}>
          {isPdf ? (
            <iframe src={file.previewUrl} title={file.fileName} className="h-full w-full" style={{ border: 0, background: "#fff" }} />
          ) : isImage ? (
            <div className="grid h-full w-full place-items-center overflow-auto p-2">
              {/* eslint-disable-next-line @next/next/no-img-element -- auth-gated API file, not a static asset */}
              <img src={file.previewUrl} alt={file.fileName} className="max-h-full max-w-full object-contain" />
            </div>
          ) : (
            <div className="grid h-full place-items-center p-6 text-center">
              <div className="flex flex-col items-center gap-3">
                <FileGlyph ext={file.ext} />
                <p className="font-bold">الملف ده ({file.ext || "بدون امتداد"}) مينفعش يتعرض في المتصفح</p>
                <a className="adm-btn is-primary" href={file.downloadUrl}>
                  <Download size={15} aria-hidden />
                  حمّله وافتحه
                </a>
              </div>
            </div>
          )}
        </div>

        <Field label="ملاحظة للطالب" hint="بتظهر للطالب مع القرار. مطلوبة لو هترفض.">
          <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="مثال: حل السؤال التالت ناقص" />
        </Field>
      </div>
    </Modal>
  );
}
