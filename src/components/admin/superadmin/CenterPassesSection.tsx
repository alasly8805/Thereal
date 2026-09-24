"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Building2,
  CheckCircle,
  ChevronDown,
  Copy,
  FileText,
  Key,
  Lock,
  PlayCircle,
  Plus,
  RefreshCw,
  Save,
  Search,
  Trash2,
  Video,
} from "lucide-react";

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

function itemKey(kind: string, sourceId: string) {
  return `${kind}:${sourceId}`;
}

function generatePassword() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  let out = "";
  for (let i = 0; i < 10; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)];
  return out;
}

function formatCenterPublicIdInput(raw: string) {
  const cleaned = raw.toUpperCase().replace(/[^A-Z0-9-]/g, "");
  let suffix = cleaned.startsWith("CTR-") ? cleaned.slice(4) : cleaned.startsWith("CTR") ? cleaned.slice(3) : cleaned;
  suffix = suffix.replace(/-/g, "").slice(0, 6);
  if (!suffix) return "CTR-";
  return `CTR-${suffix}`;
}

export function CenterPassesSection() {
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
  const [creating, setCreating] = useState(false);
  const [credentials, setCredentials] = useState<{ publicId: string; password: string; name: string } | null>(null);

  const [activePassId, setActivePassId] = useState<string | null>(null);
  const [teachers, setTeachers] = useState<{ id: string; name: string; _count?: { courses?: number } }[]>([]);
  const [teacherId, setTeacherId] = useState("");
  const [catalog, setCatalog] = useState<CatalogCourse[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [selected, setSelected] = useState<Record<string, DraftItem>>({});
  const [expandedCourses, setExpandedCourses] = useState<Record<string, boolean>>({});
  const [savingBundle, setSavingBundle] = useState(false);
  const [resetPassword, setResetPassword] = useState("");

  const fetchPasses = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/superadmin/center-passes", { credentials: "include" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "تعذر تحميل أرقام السنتر");
        return;
      }
      setPasses(data.passes || []);
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

  const loadPassBundle = useCallback(async (id: string) => {
    const res = await fetch(`/api/admin/superadmin/center-passes/${id}`, { credentials: "include" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return;
    const next: Record<string, DraftItem> = {};
    for (const item of data.pass?.items || []) {
      next[itemKey(item.kind, item.sourceId)] = {
        kind: item.kind,
        sourceId: item.sourceId,
        courseId: item.courseId,
        folderId: item.folderId,
        title: item.title,
      };
    }
    setSelected(next);
  }, []);

  const loadCatalog = useCallback(async (id: string) => {
    if (!id) {
      setCatalog([]);
      return;
    }
    setCatalogLoading(true);
    try {
      const res = await fetch(`/api/admin/superadmin/center-passes/catalog?teacherId=${encodeURIComponent(id)}`, {
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      setCatalog(Array.isArray(data.courses) ? data.courses : []);
      const open: Record<string, boolean> = {};
      for (const course of data.courses || []) open[course.id] = true;
      setExpandedCourses(open);
    } finally {
      setCatalogLoading(false);
    }
  }, []);

  const openEditor = async (pass: PassRow) => {
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
    const rows: DraftItem[] = [
      ...folder.videos.map((row) => ({ kind: "VIDEO" as const, sourceId: row.id, courseId: course.id, folderId: folder.id, title: row.title })),
      ...folder.quizzes.map((row) => ({ kind: "QUIZ" as const, sourceId: row.id, courseId: course.id, folderId: folder.id, title: row.title })),
      ...folder.homeworks.map((row) => ({ kind: "HOMEWORK" as const, sourceId: row.id, courseId: course.id, folderId: folder.id, title: row.title })),
      ...folder.materials.map((row) => ({ kind: "MATERIAL" as const, sourceId: row.id, courseId: course.id, folderId: folder.id, title: row.title })),
    ];
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

  const createPass = async () => {
    if (!createName.trim() || creating) return;
    setCreating(true);
    setError("");
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
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "تعذر إنشاء الرقم التعريفي");
        return;
      }
      setCredentials({
        publicId: data.credentials.publicId,
        password: data.credentials.password,
        name: createName.trim(),
      });
      setCreateOpen(false);
      setCreateName("");
      setCreateNotes("");
      setCreatePublicId("");
      setCreatePassword("");
      await fetchPasses();
      if (data.pass?.id) await openEditor(data.pass);
    } finally {
      setCreating(false);
    }
  };

  const saveBundle = async () => {
    if (!activePassId) return;
    setSavingBundle(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/superadmin/center-passes/${activePassId}/bundle`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: Object.values(selected) }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "تعذر حفظ الباقة");
        return;
      }
      await fetchPasses();
    } finally {
      setSavingBundle(false);
    }
  };

  const patchPass = async (id: string, body: Record<string, unknown>) => {
    const res = await fetch(`/api/admin/superadmin/center-passes/${id}`, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error || "تعذر التحديث");
      return;
    }
    await fetchPasses();
    if (body.password) setResetPassword("");
  };

  const deactivatePass = async (pass: PassRow) => {
    if (!window.confirm(`إيقاف ${pass.publicId} — ${pass.student.name}؟`)) return;
    await fetch(`/api/admin/superadmin/center-passes/${pass.id}`, { method: "DELETE", credentials: "include" });
    if (activePassId === pass.id) setActivePassId(null);
    await fetchPasses();
  };

  const copyText = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 border border-slate-700/60 rounded-2xl p-6">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <span className="p-2.5 rounded-xl bg-amber-500/15 text-amber-300 border border-amber-500/30">
              <Building2 className="w-6 h-6" />
            </span>
            <div>
              <h2 className="text-xl font-bold text-white">أرقام السنتر (Center ID)</h2>
              <p className="text-sm text-gray-300 mt-1 max-w-2xl">
                اكتب أنت الرقم التعريفي بنفس شكل CTR-ZMK5HY ثم كلمة المرور، وبعدها خصّص المحتوى على center.code-up.tech.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              setCreatePublicId("");
              setCreatePassword("");
              setCreateOpen(true);
            }}
            className="flex items-center gap-2 px-5 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 text-sm font-black rounded-xl"
          >
            <Plus className="w-4 h-4" />
            إنشاء رقم تعريفي
          </button>
        </div>
      </div>

      {error ? (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{error}</div>
      ) : null}

      {credentials ? (
        <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-5">
          <p className="text-sm font-black text-emerald-200">احفظ هذه البيانات الآن — كلمة المرور لن تظهر مرة أخرى</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <CredentialRow label="الرقم التعريفي" value={credentials.publicId} onCopy={() => copyText(credentials.publicId)} />
            <CredentialRow label="كلمة المرور" value={credentials.password} onCopy={() => copyText(credentials.password)} />
          </div>
          <p className="mt-2 text-xs text-emerald-300/80">الطالب: {credentials.name} — الدخول من زر Get by ID على منصة السنتر</p>
          <button type="button" onClick={() => setCredentials(null)} className="mt-3 text-xs font-bold text-slate-300 hover:text-white">
            إغلاق
          </button>
        </div>
      ) : null}

      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="بحث بالرقم التعريفي أو الاسم..."
            className="w-full pr-10 pl-4 py-2 bg-gray-900/80 border border-gray-700 rounded-xl text-white text-sm"
          />
        </div>
        <button type="button" onClick={() => void fetchPasses()} className="p-2.5 bg-gray-900 border border-gray-700 rounded-xl text-gray-300">
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.2fr)]">
        <div className="bg-gray-800 rounded-2xl border border-gray-700 overflow-hidden">
          {loading ? (
            <div className="p-10 text-center text-gray-400">جارٍ التحميل...</div>
          ) : filteredPasses.length === 0 ? (
            <div className="p-10 text-center text-gray-400">لا توجد أرقام تعريفية بعد</div>
          ) : (
            <div className="divide-y divide-gray-700">
              {filteredPasses.map((pass) => (
                <button
                  key={pass.id}
                  type="button"
                  onClick={() => void openEditor(pass)}
                  className={`w-full text-right p-4 hover:bg-gray-750 ${activePassId === pass.id ? "bg-amber-500/10" : ""}`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-mono text-sm font-black text-amber-300">{pass.publicId}</p>
                      <p className="text-sm text-white mt-0.5">{pass.student.name}</p>
                      <p className="text-xs text-gray-400 mt-1">
                        {pass.itemCount} عنصر · {pass.isActive ? "نشط" : "موقوف"}
                      </p>
                    </div>
                    <span className={`text-[11px] font-bold px-2 py-1 rounded-lg ${pass.isActive ? "bg-emerald-500/15 text-emerald-300" : "bg-rose-500/15 text-rose-300"}`}>
                      {pass.isActive ? "Active" : "Off"}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="bg-gray-800 rounded-2xl border border-gray-700 p-5 min-h-[420px]">
          {!activePass ? (
            <p className="text-sm text-gray-400">اختر رقماً تعريفياً من القائمة ثم خصّص محتواه من كورسات المعلم.</p>
          ) : (
            <div className="space-y-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-mono text-lg font-black text-amber-300">{activePass.publicId}</p>
                  <p className="text-white font-bold">{activePass.student.name}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => void patchPass(activePass.id, { isActive: !activePass.isActive })}
                    className="px-3 py-1.5 rounded-lg border border-slate-600 text-xs font-bold text-slate-200"
                  >
                    {activePass.isActive ? "إيقاف" : "تفعيل"}
                  </button>
                  <button
                    type="button"
                    onClick={() => void deactivatePass(activePass)}
                    className="px-3 py-1.5 rounded-lg border border-rose-500/40 text-xs font-bold text-rose-300"
                  >
                    <Trash2 className="w-3.5 h-3.5 inline ml-1" />
                    حذف
                  </button>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <input
                  value={resetPassword}
                  onChange={(e) => setResetPassword(e.target.value)}
                  placeholder="كلمة مرور جديدة"
                  className="flex-1 min-w-[160px] px-3 py-2 rounded-xl bg-gray-900 border border-gray-700 text-sm text-white"
                />
                <button
                  type="button"
                  onClick={() => setResetPassword(generatePassword())}
                  className="px-3 py-2 rounded-xl border border-slate-600 text-xs font-bold text-slate-200"
                >
                  توليد
                </button>
                <button
                  type="button"
                  disabled={resetPassword.length < 6}
                  onClick={() => void patchPass(activePass.id, { password: resetPassword })}
                  className="px-3 py-2 rounded-xl bg-slate-700 text-xs font-bold text-white disabled:opacity-40"
                >
                  <Lock className="w-3.5 h-3.5 inline ml-1" />
                  حفظ كلمة المرور
                </button>
              </div>

              <div>
                <label className="text-xs font-bold text-gray-400">اختر المعلم</label>
                <select
                  value={teacherId}
                  onChange={(e) => {
                    setTeacherId(e.target.value);
                    void loadCatalog(e.target.value);
                  }}
                  className="mt-1 w-full px-3 py-2.5 rounded-xl bg-gray-900 border border-gray-700 text-sm text-white"
                >
                  <option value="">— المعلم —</option>
                  {teachers.map((teacher) => (
                    <option key={teacher.id} value={teacher.id}>
                      {teacher.name} ({teacher._count?.courses ?? 0} كورس)
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center justify-between">
                <p className="text-sm text-gray-300">
                  محدد الآن: <span className="font-black text-amber-300">{selectedCount}</span> عنصر
                </p>
                <button
                  type="button"
                  onClick={() => void saveBundle()}
                  disabled={savingBundle}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-black disabled:opacity-50"
                >
                  <Save className="w-4 h-4" />
                  {savingBundle ? "جارٍ الحفظ..." : "حفظ الباقة المخصصة"}
                </button>
              </div>

              {catalogLoading ? (
                <p className="text-sm text-gray-400">جارٍ تحميل كورسات المعلم...</p>
              ) : (
                <div className="space-y-3 max-h-[70vh] overflow-auto pr-1">
                  {catalog.map((course) => (
                    <div key={course.id} className="rounded-xl border border-slate-700 bg-slate-900/60">
                      <button
                        type="button"
                        onClick={() => setExpandedCourses((prev) => ({ ...prev, [course.id]: !prev[course.id] }))}
                        className="w-full flex items-center justify-between px-3 py-2.5 text-right"
                      >
                        <span className="text-sm font-bold text-white">
                          {course.title}
                          <span className="mr-2 text-[10px] font-bold text-amber-300">{course.deliveryMode}</span>
                        </span>
                        <ChevronDown className={`w-4 h-4 text-slate-400 ${expandedCourses[course.id] ? "rotate-180" : ""}`} />
                      </button>
                      {expandedCourses[course.id] ? (
                        <div className="px-3 pb-3 space-y-3">
                          {course.folders.map((folder) => (
                            <div key={folder.id} className="rounded-lg border border-slate-800 p-2.5">
                              <div className="flex items-center justify-between mb-2">
                                <p className="text-xs font-black text-slate-200">{folder.name}</p>
                                <button
                                  type="button"
                                  onClick={() => setFolderAll(course, folder, true)}
                                  className="text-[10px] font-bold text-amber-300"
                                >
                                  تحديد الكل
                                </button>
                              </div>
                              <ItemGroup
                                icon={<Video className="w-3 h-3" />}
                                label="فيديوهات"
                                items={folder.videos}
                                kind="VIDEO"
                                courseId={course.id}
                                folderId={folder.id}
                                selected={selected}
                                onToggle={toggleItem}
                              />
                              <ItemGroup
                                icon={<FileText className="w-3 h-3" />}
                                label="واجبات"
                                items={folder.homeworks}
                                kind="HOMEWORK"
                                courseId={course.id}
                                folderId={folder.id}
                                selected={selected}
                                onToggle={toggleItem}
                              />
                              <ItemGroup
                                icon={<PlayCircle className="w-3 h-3" />}
                                label="اختبارات"
                                items={folder.quizzes}
                                kind="QUIZ"
                                courseId={course.id}
                                folderId={folder.id}
                                selected={selected}
                                onToggle={toggleItem}
                              />
                              <ItemGroup
                                icon={<FileText className="w-3 h-3" />}
                                label="ملفات"
                                items={folder.materials}
                                kind="MATERIAL"
                                courseId={course.id}
                                folderId={folder.id}
                                selected={selected}
                                onToggle={toggleItem}
                              />
                            </div>
                          ))}
                          {course.looseHomeworks.length ? (
                            <ItemGroup
                              icon={<FileText className="w-3 h-3" />}
                              label="واجبات بدون مجلد"
                              items={course.looseHomeworks}
                              kind="HOMEWORK"
                              courseId={course.id}
                              folderId={null}
                              selected={selected}
                              onToggle={toggleItem}
                            />
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {createOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 p-5 space-y-3">
            <h3 className="text-lg font-black text-white">إنشاء رقم تعريفي</h3>
            <p className="text-xs text-slate-400">الرقم التعريفي زي CTR-ZMK5HY — اكتبه كما هو على الكرت. زر التوليد اختياري فقط.</p>
            <input
              value={createName}
              onChange={(e) => setCreateName(e.target.value)}
              placeholder="اسم الطالب"
              className="w-full px-3 py-2.5 rounded-xl bg-gray-950 border border-gray-700 text-sm text-white"
            />
            <div className="flex gap-2">
              <input
                value={createPublicId}
                onChange={(e) => setCreatePublicId(formatCenterPublicIdInput(e.target.value))}
                onFocus={() => {
                  if (!createPublicId) setCreatePublicId("CTR-");
                }}
                placeholder="CTR-ZMK5HY"
                className="flex-1 px-3 py-2.5 rounded-xl bg-gray-950 border border-amber-500/40 text-sm text-white font-mono tracking-wide"
                autoComplete="off"
                spellCheck={false}
              />
              <button
                type="button"
                onClick={() => setCreatePublicId(generatePublicId())}
                className="px-3 rounded-xl border border-slate-600 text-xs font-bold text-slate-200"
                title="توليد كود عشوائي إذا احتجت"
              >
                توليد
              </button>
            </div>
            <input
              value={createTitle}
              onChange={(e) => setCreateTitle(e.target.value)}
              placeholder="عنوان الباقة"
              className="w-full px-3 py-2.5 rounded-xl bg-gray-950 border border-gray-700 text-sm text-white"
            />
            <textarea
              value={createNotes}
              onChange={(e) => setCreateNotes(e.target.value)}
              placeholder="ملاحظات داخلية (اختياري)"
              className="w-full px-3 py-2.5 rounded-xl bg-gray-950 border border-gray-700 text-sm text-white min-h-[72px]"
            />
            <div className="flex gap-2">
              <input
                value={createPassword}
                onChange={(e) => setCreatePassword(e.target.value)}
                placeholder="كلمة المرور (6 أحرف على الأقل)"
                className="flex-1 px-3 py-2.5 rounded-xl bg-gray-950 border border-gray-700 text-sm text-white"
              />
              <button type="button" onClick={() => setCreatePassword(generatePassword())} className="px-3 rounded-xl border border-slate-600 text-xs font-bold text-slate-200">
                توليد
              </button>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setCreateOpen(false)} className="px-4 py-2 text-sm text-slate-300">
                إلغاء
              </button>
              <button
                type="button"
                onClick={() => void createPass()}
                disabled={creating || !createName.trim() || createPublicId.replace(/^CTR-/, "").length !== 6 || createPassword.trim().length < 6}
                className="px-4 py-2 rounded-xl bg-amber-500 text-slate-950 text-sm font-black disabled:opacity-40"
              >
                {creating ? "جارٍ الإنشاء..." : "إنشاء"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function CredentialRow({ label, value, onCopy }: { label: string; value: string; onCopy: () => void }) {
  return (
    <div className="rounded-xl border border-emerald-500/20 bg-slate-950/40 px-3 py-2">
      <p className="text-[10px] font-bold text-emerald-400/80">{label}</p>
      <div className="mt-1 flex items-center justify-between gap-2">
        <code className="text-sm font-black text-white">{value}</code>
        <button type="button" onClick={onCopy} className="text-emerald-300">
          <Copy className="w-3.5 h-3.5" />
        </button>
      </div>
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
      <p className="flex items-center gap-1.5 text-[11px] font-black text-slate-400 mb-1">
        {icon}
        {label}
      </p>
      <div className="space-y-1">
        {items.map((item) => {
          const checked = Boolean(selected[itemKey(kind, item.id)]);
          return (
            <label key={item.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-slate-800/80 cursor-pointer">
              <input
                type="checkbox"
                checked={checked}
                onChange={() =>
                  onToggle({ kind, sourceId: item.id, courseId, folderId, title: item.title })
                }
              />
              <span className="text-xs text-slate-200">{item.title}</span>
              {item.isPublished === false ? <span className="text-[10px] text-amber-400">غير منشور</span> : null}
              {checked ? <CheckCircle className="w-3 h-3 text-emerald-400 mr-auto" /> : <Key className="w-3 h-3 text-slate-600 mr-auto" />}
            </label>
          );
        })}
      </div>
    </div>
  );
}
