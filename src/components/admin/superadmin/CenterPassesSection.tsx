"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Building2, CheckCircle2, ChevronDown, Copy, FileText, Lock, PlayCircle, Plus, RefreshCw, Save, Shuffle, UserX, Video } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import {
  Badge,
  Button,
  EmptyState,
  Field,
  Input,
  Modal,
  Notice,
  PageHeader,
  Panel,
  SearchInput,
  Select,
  SkeletonRows,
  Textarea,
  fmtNum,
  readJson,
} from "@/components/admin/ui/kit";

type PassRow = {
  id: string;
  publicId: string;
  title: string;
  notes: string | null;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  itemCount: number;
  student: { id: string; name: string; isActive: boolean; createdAt: string };
};

type CatalogItem = { id: string; title: string; type?: string; isPublished?: boolean; durationMinutes?: number };

type CatalogFolder = {
  id: string;
  name: string;
  videos: CatalogItem[];
  quizzes: CatalogItem[];
  homeworks: CatalogItem[];
  materials: CatalogItem[];
};

type CatalogCourse = {
  id: string;
  title: string;
  subject: string;
  deliveryMode: string;
  folders: CatalogFolder[];
  looseHomeworks: CatalogItem[];
};

type DraftItem = {
  kind: "VIDEO" | "HOMEWORK" | "QUIZ" | "MATERIAL";
  sourceId: string;
  courseId: string;
  folderId: string | null;
  title: string;
};

// Same alphabet as src/lib/center-pass.ts (no I, O, 0, 1 — they get confused on printed cards).
const PUBLIC_ID_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const PASSWORD_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";

function randomString(alphabet: string, length: number) {
  const bytes = new Uint32Array(length);
  crypto.getRandomValues(bytes);
  let out = "";
  for (let i = 0; i < length; i++) out += alphabet[bytes[i] % alphabet.length];
  return out;
}

const generatePublicId = () => `CTR-${randomString(PUBLIC_ID_ALPHABET, 6)}`;
const generatePassword = () => randomString(PASSWORD_ALPHABET, 10);

function itemKey(kind: string, sourceId: string) {
  return `${kind}:${sourceId}`;
}

function formatCenterPublicIdInput(raw: string) {
  const cleaned = raw.toUpperCase().replace(/[^A-Z0-9-]/g, "");
  let suffix = cleaned.startsWith("CTR-") ? cleaned.slice(4) : cleaned.startsWith("CTR") ? cleaned.slice(3) : cleaned;
  suffix = suffix.replace(/-/g, "").slice(0, 6);
  if (!suffix) return "CTR-";
  return `CTR-${suffix}`;
}

function publicIdProblem(id: string) {
  const suffix = id.replace(/^CTR-/, "");
  if (!suffix) return null;
  if ([...suffix].some((c) => !PUBLIC_ID_ALPHABET.includes(c))) return "بدون I و O و 0 و 1 — عشان ما تتلخبطش في الطباعة";
  if (suffix.length !== 6) return `باقي ${fmtNum(6 - suffix.length)} خانات`;
  return null;
}

function folderRows(course: CatalogCourse, folder: CatalogFolder): DraftItem[] {
  return [
    ...folder.videos.map((row) => ({ kind: "VIDEO" as const, sourceId: row.id, courseId: course.id, folderId: folder.id, title: row.title })),
    ...folder.quizzes.map((row) => ({ kind: "QUIZ" as const, sourceId: row.id, courseId: course.id, folderId: folder.id, title: row.title })),
    ...folder.homeworks.map((row) => ({ kind: "HOMEWORK" as const, sourceId: row.id, courseId: course.id, folderId: folder.id, title: row.title })),
    ...folder.materials.map((row) => ({ kind: "MATERIAL" as const, sourceId: row.id, courseId: course.id, folderId: folder.id, title: row.title })),
  ];
}

export function CenterPassesSection() {
  const { success: toastSuccess, error: toastError } = useToast();
  const [passes, setPasses] = useState<PassRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [error, setError] = useState("");

  const [createOpen, setCreateOpen] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createTitle, setCreateTitle] = useState("باقة السنتر");
  const [createNotes, setCreateNotes] = useState("");
  const [createPassword, setCreatePassword] = useState("");
  const [createPublicId, setCreatePublicId] = useState("");
  const [createError, setCreateError] = useState("");
  const [creating, setCreating] = useState(false);
  const [credentials, setCredentials] = useState<{ publicId: string; password: string; name: string } | null>(null);

  const [activePassId, setActivePassId] = useState<string | null>(null);
  const [teachers, setTeachers] = useState<{ id: string; name: string; _count?: { courses?: number } }[]>([]);
  const [teacherId, setTeacherId] = useState("");
  const [catalog, setCatalog] = useState<CatalogCourse[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [selected, setSelected] = useState<Record<string, DraftItem>>({});
  const [savedKeys, setSavedKeys] = useState<string>("");
  const [expandedCourses, setExpandedCourses] = useState<Record<string, boolean>>({});
  const [savingBundle, setSavingBundle] = useState(false);
  const [resetPassword, setResetPassword] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [deactivateTarget, setDeactivateTarget] = useState<PassRow | null>(null);
  const [pendingSwitch, setPendingSwitch] = useState<PassRow | null>(null);

  const fetchPasses = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/superadmin/center-passes", { credentials: "include" });
      const data = await readJson<{ passes?: PassRow[]; error?: string }>(res);
      if (!res.ok) {
        setError(data?.error || "تعذر تحميل أرقام السنتر");
        return;
      }
      setPasses(data?.passes || []);
      setError("");
    } catch {
      setError("تعذر الاتصال بالخادم");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchPasses();
    fetch("/api/admin/teachers", { credentials: "include" })
      .then((res) => res.json())
      .then((data) => setTeachers(Array.isArray(data.teachers) ? data.teachers : []))
      .catch(() => setTeachers([]));
  }, [fetchPasses]);

  const selectionSignature = (sel: Record<string, DraftItem>) => Object.keys(sel).sort().join("|");
  const dirty = activePassId != null && selectionSignature(selected) !== savedKeys;

  const loadPassBundle = useCallback(async (id: string) => {
    const res = await fetch(`/api/admin/superadmin/center-passes/${id}`, { credentials: "include" });
    const data = await readJson<{ pass?: { items?: DraftItem[] } }>(res);
    if (!res.ok) return;
    const next: Record<string, DraftItem> = {};
    for (const item of data?.pass?.items || []) {
      next[itemKey(item.kind, item.sourceId)] = {
        kind: item.kind,
        sourceId: item.sourceId,
        courseId: item.courseId,
        folderId: item.folderId,
        title: item.title,
      };
    }
    setSelected(next);
    setSavedKeys(selectionSignature(next));
  }, []);

  const loadCatalog = useCallback(async (id: string) => {
    if (!id) {
      setCatalog([]);
      return;
    }
    setCatalogLoading(true);
    try {
      const res = await fetch(`/api/admin/superadmin/center-passes/catalog?teacherId=${encodeURIComponent(id)}`, { credentials: "include" });
      const data = await readJson<{ courses?: CatalogCourse[] }>(res);
      const courses = Array.isArray(data?.courses) ? data!.courses! : [];
      setCatalog(courses);
      setExpandedCourses(Object.fromEntries(courses.map((c) => [c.id, true])));
    } finally {
      setCatalogLoading(false);
    }
  }, []);

  const openEditor = async (pass: PassRow, force = false) => {
    if (!force && dirty && pass.id !== activePassId) {
      setPendingSwitch(pass);
      return;
    }
    setPendingSwitch(null);
    setActivePassId(pass.id);
    setTeacherId("");
    setCatalog([]);
    setResetPassword("");
    await loadPassBundle(pass.id);
  };

  const toggleItem = (item: DraftItem) => {
    setSelected((prev) => {
      const key = itemKey(item.kind, item.sourceId);
      if (prev[key]) {
        const next = { ...prev };
        delete next[key];
        return next;
      }
      return { ...prev, [key]: item };
    });
  };

  const setFolderAll = (course: CatalogCourse, folder: CatalogFolder, on: boolean) => {
    const rows = folderRows(course, folder);
    setSelected((prev) => {
      const next = { ...prev };
      for (const row of rows) {
        const key = itemKey(row.kind, row.sourceId);
        if (on) next[key] = row;
        else delete next[key];
      }
      return next;
    });
  };

  const selectedCount = Object.keys(selected).length;
  const activePass = passes.find((pass) => pass.id === activePassId) || null;

  const filteredPasses = useMemo(() => {
    const needle = searchQuery.trim().toLowerCase();
    if (!needle) return passes;
    return passes.filter(
      (pass) =>
        pass.publicId.toLowerCase().includes(needle) ||
        pass.student.name.toLowerCase().includes(needle) ||
        (pass.notes || "").toLowerCase().includes(needle) ||
        pass.title.toLowerCase().includes(needle)
    );
  }, [passes, searchQuery]);

  const openCreate = () => {
    setCreatePublicId("");
    setCreatePassword("");
    setCreateName("");
    setCreateNotes("");
    setCreateTitle("باقة السنتر");
    setCreateError("");
    setCreateOpen(true);
  };

  const idProblem = publicIdProblem(createPublicId);
  const canCreate =
    !creating && !!createName.trim() && createPublicId.replace(/^CTR-/, "").length === 6 && !idProblem && createPassword.trim().length >= 6;

  const createPass = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!canCreate) return;
    setCreating(true);
    setCreateError("");
    try {
      const res = await fetch("/api/admin/superadmin/center-passes", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: createName.trim(),
          publicId: createPublicId.trim(),
          password: createPassword,
          title: createTitle.trim(),
          notes: createNotes.trim(),
        }),
      });
      const data = await readJson<{ error?: string; credentials?: { publicId: string; password: string }; pass?: PassRow }>(res);
      if (!res.ok || !data?.credentials) {
        setCreateError(data?.error || "تعذر إنشاء الرقم التعريفي");
        return;
      }
      setCredentials({ publicId: data.credentials.publicId, password: data.credentials.password, name: createName.trim() });
      setCreateOpen(false);
      await fetchPasses();
      if (data.pass?.id) await openEditor(data.pass, true);
    } catch {
      setCreateError("تعذر الاتصال بالخادم");
    } finally {
      setCreating(false);
    }
  };

  const saveBundle = async () => {
    if (!activePassId) return;
    setSavingBundle(true);
    try {
      const res = await fetch(`/api/admin/superadmin/center-passes/${activePassId}/bundle`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: Object.values(selected) }),
      });
      const data = await readJson<{ error?: string }>(res);
      if (!res.ok) {
        toastError(data?.error || "تعذر حفظ الباقة");
        return;
      }
      setSavedKeys(selectionSignature(selected));
      toastSuccess(`حُفظت الباقة — ${fmtNum(selectedCount)} عنصر`);
      await fetchPasses();
    } catch {
      toastError("تعذر الاتصال بالخادم");
    } finally {
      setSavingBundle(false);
    }
  };

  const patchPass = async (id: string, body: Record<string, unknown>, tag: string, okMsg: string) => {
    setBusy(tag);
    try {
      const res = await fetch(`/api/admin/superadmin/center-passes/${id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await readJson<{ error?: string }>(res);
      if (!res.ok) {
        toastError(data?.error || "تعذر التحديث");
        return;
      }
      toastSuccess(okMsg);
      await fetchPasses();
      if (body.password) setResetPassword("");
    } catch {
      toastError("تعذر الاتصال بالخادم");
    } finally {
      setBusy(null);
    }
  };

  const deactivatePass = async () => {
    const pass = deactivateTarget;
    if (!pass) return;
    setBusy("deactivate");
    try {
      const res = await fetch(`/api/admin/superadmin/center-passes/${pass.id}`, { method: "DELETE", credentials: "include" });
      const data = await readJson<{ error?: string }>(res);
      if (!res.ok) {
        toastError(data?.error || "تعذر إيقاف الرقم");
        return;
      }
      toastSuccess(`أُوقف ${pass.publicId} وسُجّل خروج ${pass.student.name}`);
      setDeactivateTarget(null);
      await fetchPasses();
    } catch {
      toastError("تعذر الاتصال بالخادم");
    } finally {
      setBusy(null);
    }
  };

  const copyText = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toastSuccess("نُسخ");
    } catch {
      toastError("تعذر النسخ");
    }
  };

  return (
    <div dir="rtl" className="flex flex-col gap-5">
      <PageHeader
        title="أرقام السنتر"
        description="أرقام تعريفية بشكل CTR-ZMK5HY لطلاب السنتر. أنشئ الرقم وكلمة المرور، ثم خصّص المحتوى الذي يراه الطالب على center.code-up.tech."
        actions={
          <>
            <Button onClick={() => void fetchPasses()} loading={loading} icon={<RefreshCw size={15} />}>تحديث</Button>
            <Button variant="primary" onClick={openCreate} icon={<Plus size={15} />}>رقم جديد</Button>
          </>
        }
      />

      {error && <Notice tone="bad" title={error} />}

      {credentials && (
        <Notice
          tone="ok"
          title="احفظ هذه البيانات الآن — كلمة المرور لن تظهر مرة أخرى"
          action={<Button size="sm" onClick={() => setCredentials(null)}>تم الحفظ</Button>}
        >
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            <CredentialRow label="الرقم التعريفي" value={credentials.publicId} onCopy={() => void copyText(credentials.publicId)} />
            <CredentialRow label="كلمة المرور" value={credentials.password} onCopy={() => void copyText(credentials.password)} />
          </div>
          <p className="mt-2 text-xs">الطالب: {credentials.name} — يدخل من زر Get by ID على منصة السنتر.</p>
        </Notice>
      )}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,0.85fr)_minmax(0,1.3fr)] items-start">
        <Panel
          padded={false}
          title={`${fmtNum(passes.length)} رقم`}
          actions={<SearchInput value={searchQuery} onChange={setSearchQuery} placeholder="الرقم أو الاسم" inputSize="sm" className="w-52 max-w-full" />}
        >
          {loading && passes.length === 0 ? (
            <SkeletonRows rows={4} h={58} />
          ) : filteredPasses.length === 0 ? (
            <EmptyState
              icon={<Building2 size={22} />}
              title={passes.length === 0 ? "لا توجد أرقام بعد" : "لا نتائج مطابقة"}
              action={passes.length === 0 ? <Button variant="primary" onClick={openCreate}>إنشاء أول رقم</Button> : undefined}
            />
          ) : (
            <ul className="adm-list max-h-[70vh] overflow-y-auto">
              {filteredPasses.map((pass) => {
                const active = activePassId === pass.id;
                return (
                  <li key={pass.id}>
                    <button
                      type="button"
                      onClick={() => void openEditor(pass)}
                      aria-current={active ? "true" : undefined}
                      className="adm-row w-full text-start cursor-pointer hover:bg-[var(--adm-hover)]"
                      style={active ? { background: "var(--brand-soft)" } : undefined}
                    >
                      <div className="min-w-0 flex-1">
                        <p className="adm-mono font-bold" style={{ color: active ? "var(--brand)" : "var(--ink)" }}>{pass.publicId}</p>
                        <p className="text-sm mt-0.5 truncate">{pass.student.name}</p>
                        <p className="text-xs adm-muted mt-0.5">{fmtNum(pass.itemCount)} عنصر · {pass.title}</p>
                      </div>
                      <Badge tone={pass.isActive ? "ok" : "bad"} dot>{pass.isActive ? "نشط" : "موقوف"}</Badge>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>

        <Panel
          clip={false}
          title={activePass ? activePass.publicId : "تخصيص المحتوى"}
          description={activePass ? `${activePass.student.name} · ${activePass.title}` : undefined}
          actions={
            activePass && (
              <>
                <Button
                  size="sm"
                  loading={busy === "toggle"}
                  onClick={() => void patchPass(activePass.id, { isActive: !activePass.isActive }, "toggle", activePass.isActive ? "أُوقف الرقم مؤقتاً" : "أُعيد تفعيل الرقم")}
                >
                  {activePass.isActive ? "إيقاف مؤقت" : "تفعيل"}
                </Button>
                {activePass.isActive && (
                  <Button size="sm" variant="danger" icon={<UserX size={14} />} onClick={() => setDeactivateTarget(activePass)}>
                    إيقاف وتسجيل خروج
                  </Button>
                )}
              </>
            )
          }
        >
          {!activePass ? (
            <EmptyState icon={<Building2 size={22} />} title="اختر رقماً من القائمة" text="ثم اختر المعلم وحدد الفيديوهات والاختبارات والواجبات التي يراها الطالب." />
          ) : (
            <div className="flex flex-col gap-5">
              <form
                className="flex flex-wrap items-end gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (resetPassword.length >= 6) void patchPass(activePass.id, { password: resetPassword }, "password", "تم تغيير كلمة المرور");
                }}
              >
                <Field label="كلمة مرور جديدة" htmlFor="cp-reset" className="flex-1 min-w-[180px]">
                  <Input id="cp-reset" mono value={resetPassword} onChange={(e) => setResetPassword(e.target.value)} placeholder="٦ أحرف على الأقل" autoComplete="off" />
                </Field>
                <Button icon={<Shuffle size={14} />} onClick={() => setResetPassword(generatePassword())}>توليد</Button>
                <Button type="submit" icon={<Lock size={14} />} disabled={resetPassword.length < 6} loading={busy === "password"}>حفظ</Button>
              </form>

              <Field label="المعلم" htmlFor="cp-teacher">
                <Select
                  id="cp-teacher"
                  value={teacherId}
                  onChange={(e) => {
                    setTeacherId(e.target.value);
                    void loadCatalog(e.target.value);
                  }}
                >
                  <option value="">— اختر المعلم لعرض كورساته —</option>
                  {teachers.map((teacher) => (
                    <option key={teacher.id} value={teacher.id}>
                      {teacher.name} ({fmtNum(teacher._count?.courses ?? 0)} كورس)
                    </option>
                  ))}
                </Select>
              </Field>

              <div
                className="adm-well sticky flex flex-wrap items-center justify-between gap-3 px-4 py-3"
                style={{ top: 72, zIndex: 2 }}
              >
                <p className="text-sm">
                  محدد: <b className="adm-num">{fmtNum(selectedCount)}</b> عنصر
                  {dirty && <Badge tone="warn" className="ms-2">تغييرات غير محفوظة</Badge>}
                </p>
                <Button variant="primary" onClick={() => void saveBundle()} loading={savingBundle} disabled={!dirty} icon={<Save size={15} />}>
                  حفظ الباقة
                </Button>
              </div>

              {catalogLoading ? (
                <SkeletonRows rows={3} h={48} />
              ) : !teacherId ? (
                <p className="adm-hint">اختر معلماً لعرض كورساته. العناصر المحددة من معلمين آخرين تبقى محفوظة.</p>
              ) : catalog.length === 0 ? (
                <p className="adm-hint">لا توجد كورسات لهذا المعلم.</p>
              ) : (
                <div className="flex flex-col gap-3">
                  {catalog.map((course) => (
                    <div key={course.id} className="adm-well overflow-hidden">
                      <button
                        type="button"
                        onClick={() => setExpandedCourses((prev) => ({ ...prev, [course.id]: !prev[course.id] }))}
                        aria-expanded={!!expandedCourses[course.id]}
                        className="w-full flex items-center justify-between gap-2 px-4 py-3 text-start cursor-pointer"
                      >
                        <span className="text-sm font-bold flex items-center gap-2">
                          {course.title}
                          <Badge>{course.deliveryMode}</Badge>
                        </span>
                        <ChevronDown size={16} style={{ color: "var(--ink-3)", transform: expandedCourses[course.id] ? "rotate(180deg)" : undefined }} aria-hidden />
                      </button>
                      {expandedCourses[course.id] && (
                        <div className="px-3 pb-3 flex flex-col gap-2">
                          {course.folders.map((folder) => {
                            const rows = folderRows(course, folder);
                            const allOn = rows.length > 0 && rows.every((r) => selected[itemKey(r.kind, r.sourceId)]);
                            return (
                              <div key={folder.id} className="rounded-[10px] p-3" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
                                <div className="flex items-center justify-between mb-1">
                                  <p className="text-sm font-bold">{folder.name}</p>
                                  {rows.length > 0 && (
                                    <Button size="sm" variant="ghost" onClick={() => setFolderAll(course, folder, !allOn)}>
                                      {allOn ? "إلغاء الكل" : "تحديد الكل"}
                                    </Button>
                                  )}
                                </div>
                                <ItemGroup icon={<Video size={13} />} label="فيديوهات" items={folder.videos} kind="VIDEO" courseId={course.id} folderId={folder.id} selected={selected} onToggle={toggleItem} />
                                <ItemGroup icon={<FileText size={13} />} label="واجبات" items={folder.homeworks} kind="HOMEWORK" courseId={course.id} folderId={folder.id} selected={selected} onToggle={toggleItem} />
                                <ItemGroup icon={<PlayCircle size={13} />} label="اختبارات" items={folder.quizzes} kind="QUIZ" courseId={course.id} folderId={folder.id} selected={selected} onToggle={toggleItem} />
                                <ItemGroup icon={<FileText size={13} />} label="ملفات" items={folder.materials} kind="MATERIAL" courseId={course.id} folderId={folder.id} selected={selected} onToggle={toggleItem} />
                              </div>
                            );
                          })}
                          {course.looseHomeworks.length > 0 && (
                            <ItemGroup icon={<FileText size={13} />} label="واجبات بدون مجلد" items={course.looseHomeworks} kind="HOMEWORK" courseId={course.id} folderId={null} selected={selected} onToggle={toggleItem} />
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </Panel>
      </div>

      <Modal
        open={createOpen}
        onClose={() => !creating && setCreateOpen(false)}
        title="رقم تعريفي جديد"
        description="اكتب الرقم كما هو على الكرت (CTR- ثم ٦ خانات). زر التوليد اختياري."
        size="md"
        footer={
          <>
            <Button onClick={() => setCreateOpen(false)} disabled={creating}>إلغاء</Button>
            <Button type="submit" form="cp-create" variant="primary" loading={creating} disabled={!canCreate}>إنشاء</Button>
          </>
        }
      >
        <form id="cp-create" onSubmit={createPass} className="grid gap-4 sm:grid-cols-2">
          {createError && <Notice tone="bad" title={createError} className="sm:col-span-2" />}
          <Field label="اسم الطالب" htmlFor="cp-name" className="sm:col-span-2">
            <Input id="cp-name" data-autofocus required value={createName} onChange={(e) => setCreateName(e.target.value)} />
          </Field>
          <Field label="الرقم التعريفي" htmlFor="cp-id" error={idProblem && createPublicId.length > 4 ? idProblem : undefined}>
            <div className="flex gap-2">
              <Input
                id="cp-id"
                mono
                value={createPublicId}
                onChange={(e) => setCreatePublicId(formatCenterPublicIdInput(e.target.value))}
                onFocus={() => {
                  if (!createPublicId) setCreatePublicId("CTR-");
                }}
                placeholder="CTR-ZMK5HY"
                autoComplete="off"
                spellCheck={false}
                aria-invalid={idProblem && createPublicId.length > 4 ? true : undefined}
              />
              <IconShuffle onClick={() => setCreatePublicId(generatePublicId())} label="توليد رقم عشوائي" />
            </div>
          </Field>
          <Field label="كلمة المرور" htmlFor="cp-pass" hint="٦ أحرف على الأقل">
            <div className="flex gap-2">
              <Input id="cp-pass" mono value={createPassword} onChange={(e) => setCreatePassword(e.target.value)} autoComplete="off" />
              <IconShuffle onClick={() => setCreatePassword(generatePassword())} label="توليد كلمة مرور" />
            </div>
          </Field>
          <Field label="عنوان الباقة" htmlFor="cp-title" className="sm:col-span-2">
            <Input id="cp-title" value={createTitle} onChange={(e) => setCreateTitle(e.target.value)} />
          </Field>
          <Field label="ملاحظات داخلية" hint="اختياري — لا يراها الطالب" htmlFor="cp-notes" className="sm:col-span-2">
            <Textarea id="cp-notes" rows={2} value={createNotes} onChange={(e) => setCreateNotes(e.target.value)} />
          </Field>
        </form>
      </Modal>

      <Modal
        open={!!deactivateTarget}
        onClose={() => busy !== "deactivate" && setDeactivateTarget(null)}
        size="sm"
        title="إيقاف الرقم وتسجيل الخروج؟"
        description={deactivateTarget ? `سيُوقف ${deactivateTarget.publicId} ويُسجَّل خروج ${deactivateTarget.student.name} من كل الأجهزة، ويُوقف حسابه.` : undefined}
        footer={
          <>
            <Button onClick={() => setDeactivateTarget(null)} disabled={busy === "deactivate"}>إلغاء</Button>
            <Button variant="danger-solid" onClick={() => void deactivatePass()} loading={busy === "deactivate"}>إيقاف</Button>
          </>
        }
      />

      <Modal
        open={!!pendingSwitch}
        onClose={() => setPendingSwitch(null)}
        size="sm"
        title="تغييرات غير محفوظة"
        description="اختيارات المحتوى لهذا الرقم لم تُحفظ بعد. هل تريد تجاهلها والانتقال؟"
        footer={
          <>
            <Button onClick={() => setPendingSwitch(null)}>البقاء</Button>
            <Button variant="danger" onClick={() => pendingSwitch && void openEditor(pendingSwitch, true)}>تجاهل والانتقال</Button>
          </>
        }
      />
    </div>
  );
}

function IconShuffle({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <Button className="is-icon" aria-label={label} title={label} onClick={onClick}>
      <Shuffle size={15} />
    </Button>
  );
}

function CredentialRow({ label, value, onCopy }: { label: string; value: string; onCopy: () => void }) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-[10px] px-3 py-2" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
      <div className="min-w-0">
        <p className="text-xs adm-muted">{label}</p>
        <code className="adm-mono font-bold" style={{ color: "var(--ink)" }}>{value}</code>
      </div>
      <Button size="sm" variant="ghost" className="is-icon" aria-label={`نسخ ${label}`} onClick={onCopy}>
        <Copy size={14} />
      </Button>
    </div>
  );
}

function ItemGroup({
  icon,
  label,
  items,
  kind,
  courseId,
  folderId,
  selected,
  onToggle,
}: {
  icon: ReactNode;
  label: string;
  items: CatalogItem[];
  kind: DraftItem["kind"];
  courseId: string;
  folderId: string | null;
  selected: Record<string, DraftItem>;
  onToggle: (item: DraftItem) => void;
}) {
  if (!items.length) return null;
  return (
    <div className="mt-2">
      <p className="flex items-center gap-1.5 text-xs font-bold adm-muted mb-1">
        {icon}
        {label}
      </p>
      <div className="flex flex-col">
        {items.map((item) => {
          const checked = Boolean(selected[itemKey(kind, item.id)]);
          return (
            <label key={item.id} className="adm-check rounded-lg px-2 hover:bg-[var(--adm-hover)]" style={{ minHeight: 36 }}>
              <input type="checkbox" checked={checked} onChange={() => onToggle({ kind, sourceId: item.id, courseId, folderId, title: item.title })} />
              <span className="text-[13px] flex-1">{item.title}</span>
              {item.isPublished === false && <Badge tone="warn">غير منشور</Badge>}
              {checked && <CheckCircle2 size={14} style={{ color: "var(--ok)" }} aria-hidden />}
            </label>
          );
        })}
      </div>
    </div>
  );
}
