"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ASSISTANT_PERMISSION_META,
  DEFAULT_ASSISTANT_PERMISSIONS,
  type AssistantPermissions,
} from "@/lib/teacher-scope";

type AssistantRow = {
  id: string;
  name: string;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  permissions: AssistantPermissions;
};

type Sheet =
  | { type: "create" }
  | { type: "password"; name: string; password: string; hint?: string }
  | { type: "delete"; assistant: AssistantRow }
  | { type: "perms"; assistant: AssistantRow }
  | null;

async function readJson<T>(res: Response): Promise<T | null> {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

function formatWhen(iso: string | null): string {
  if (!iso) return "لم يسجّل دخول بعد";
  try {
    return new Date(iso).toLocaleString("ar-EG", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export function TeacherAssistantsSection() {
  const [assistants, setAssistants] = useState<AssistantRow[]>([]);
  const [maxAssistants, setMaxAssistants] = useState(8);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sheet, setSheet] = useState<Sheet>(null);
  const [newName, setNewName] = useState("");
  const [newPerms, setNewPerms] = useState<AssistantPermissions>({ ...DEFAULT_ASSISTANT_PERMISSIONS });
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/teacher/assistants", { credentials: "include" });
    const data = await readJson<{ assistants?: AssistantRow[]; maxAssistants?: number; error?: string }>(res);
    setAssistants(data?.assistants ?? []);
    if (data?.maxAssistants) setMaxAssistants(data.maxAssistants);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const closeSheet = () => {
    setSheet(null);
    setError("");
    setCopied(false);
    setNewName("");
    setNewPerms({ ...DEFAULT_ASSISTANT_PERMISSIONS });
  };

  const copyPassword = async (password: string) => {
    try {
      await navigator.clipboard.writeText(password);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setError("انسخ الباسورد يدوياً");
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    const res = await fetch("/api/teacher/assistants", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName, permissions: newPerms }),
    });
    const data = await readJson<{ error?: string; password?: string; assistant?: { name: string } }>(res);
    setBusy(false);
    if (!res.ok || !data?.password) {
      setError(data?.error ?? "تعذر إنشاء الحساب");
      return;
    }
    setSheet({
      type: "password",
      name: data.assistant?.name || newName,
      password: data.password,
      hint: "انسخ الباسورد ودّيه للمساعد. مش هيظهر تاني.",
    });
    setNewName("");
    setNewPerms({ ...DEFAULT_ASSISTANT_PERMISSIONS });
    void load();
  };

  const patchAssistant = async (id: string, body: Record<string, unknown>) => {
    setBusy(true);
    setError("");
    const res = await fetch(`/api/teacher/assistants/${id}`, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await readJson<{ error?: string; password?: string; message?: string; assistant?: AssistantRow }>(res);
    setBusy(false);
    if (!res.ok) {
      setError(data?.error ?? "تعذر التعديل");
      return null;
    }
    return data;
  };

  const handleReset = async (assistant: AssistantRow) => {
    const data = await patchAssistant(assistant.id, { action: "reset_password" });
    if (data?.password) {
      setSheet({
        type: "password",
        name: assistant.name,
        password: data.password,
        hint: data.message || "باسورد جديد — الجلسات القديمة اتقفلت.",
      });
      void load();
    }
  };

  const handleToggle = async (assistant: AssistantRow) => {
    await patchAssistant(assistant.id, { isActive: !assistant.isActive });
    void load();
  };

  const handleSavePerms = async (assistant: AssistantRow, permissions: AssistantPermissions) => {
    const data = await patchAssistant(assistant.id, { permissions });
    if (data) {
      closeSheet();
      void load();
    }
  };

  const handleDelete = async (assistant: AssistantRow) => {
    setBusy(true);
    setError("");
    const res = await fetch(`/api/teacher/assistants/${assistant.id}`, {
      method: "DELETE",
      credentials: "include",
    });
    const data = await readJson<{ error?: string }>(res);
    setBusy(false);
    if (!res.ok) {
      setError(data?.error ?? "تعذر الحذف");
      return;
    }
    closeSheet();
    void load();
  };

  return (
    <div className="space-y-4 pb-28 sm:pb-8" dir="rtl">
      <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <p className="text-lg font-black text-slate-900 dark:text-white">المساعدون</p>
        <p className="mt-1.5 text-sm leading-7 text-slate-500 dark:text-slate-400">
          اعمل حساب Assistant للمساعد اللي بيصحح أو بيرد على الطلاب. هو يسجّل من لوحة الإدارة → تبويب{" "}
          <span className="font-black text-sky-600">مساعد</span> ويدخل{" "}
          <span className="font-black">لوحة المساعد</span> بالاسم والباسورد اللي هتديهوله.
        </p>
        <p className="mt-3 text-xs font-bold text-slate-400">
          {assistants.length} / {maxAssistants} حسابات
        </p>
      </div>

      {error && !sheet && (
        <div className="rounded-2xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-600 dark:border-rose-900 dark:bg-rose-950/40">
          {error}
        </div>
      )}

      {loading ? (
        <div className="rounded-3xl border border-slate-200 bg-white p-10 text-center text-sm font-bold text-slate-400 dark:border-slate-800 dark:bg-slate-900">
          جارٍ التحميل...
        </div>
      ) : assistants.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50 px-5 py-12 text-center dark:border-slate-700 dark:bg-slate-900/40">
          <p className="text-base font-black text-slate-800 dark:text-white">لسه مفيش مساعدين</p>
          <p className="mt-2 text-sm leading-7 text-slate-500">دوس على الزر تحت عشان تعمل أول حساب.</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {assistants.map((a) => (
            <li
              key={a.id}
              className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-base font-black text-slate-900 dark:text-white">{a.name}</p>
                  <p className="mt-1 text-xs text-slate-500">{formatWhen(a.lastLoginAt)}</p>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-black ${
                    a.isActive
                      ? "bg-emerald-500/15 text-emerald-600"
                      : "bg-slate-200 text-slate-500 dark:bg-slate-800"
                  }`}
                >
                  {a.isActive ? "نشط" : "موقوف"}
                </span>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setSheet({ type: "perms", assistant: a })}
                  className="min-h-12 rounded-2xl border border-slate-200 bg-slate-50 text-sm font-black text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                >
                  الصلاحيات
                </button>
                <button
                  type="button"
                  onClick={() => void handleReset(a)}
                  disabled={busy}
                  className="min-h-12 rounded-2xl bg-sky-500 text-sm font-black text-white disabled:opacity-50"
                >
                  باسورد جديد
                </button>
                <button
                  type="button"
                  onClick={() => void handleToggle(a)}
                  disabled={busy}
                  className="min-h-12 rounded-2xl border border-slate-200 text-sm font-black text-slate-700 dark:border-slate-700 dark:text-slate-200"
                >
                  {a.isActive ? "إيقاف" : "تفعيل"}
                </button>
                <button
                  type="button"
                  onClick={() => setSheet({ type: "delete", assistant: a })}
                  className="min-h-12 rounded-2xl bg-rose-50 text-sm font-black text-rose-600 dark:bg-rose-950/40"
                >
                  حذف
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <button
        type="button"
        onClick={() => {
          setError("");
          setSheet({ type: "create" });
        }}
        disabled={assistants.length >= maxAssistants}
        className="fixed bottom-24 left-4 right-4 z-30 min-h-14 rounded-2xl bg-sky-500 text-base font-black text-white shadow-lg shadow-sky-500/30 disabled:opacity-50 sm:static sm:w-full lg:max-w-sm"
      >
        + حساب Assistant جديد
      </button>

      {sheet && (
        <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4" onClick={closeSheet}>
          <div
            className="w-full max-w-lg max-h-[92vh] overflow-y-auto rounded-t-3xl bg-white p-5 pb-8 shadow-2xl dark:bg-slate-900 sm:rounded-3xl"
            onClick={(e) => e.stopPropagation()}
          >
            {error && (
              <div className="mb-4 rounded-2xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-600">
                {error}
              </div>
            )}

            {sheet.type === "create" && (
              <form onSubmit={handleCreate} className="space-y-5">
                <div>
                  <h3 className="text-lg font-black text-slate-900 dark:text-white">حساب مساعد جديد</h3>
                  <p className="mt-1 text-sm text-slate-500">الاسم ده هو اسم الدخول. اختار اسم سهل يفتكره.</p>
                </div>
                <label className="block">
                  <span className="mb-2 block text-sm font-bold text-slate-600">اسم الدخول</span>
                  <input
                    required
                    minLength={2}
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="مثلاً: أحمد المساعد"
                    className="w-full min-h-14 rounded-2xl border border-slate-200 bg-slate-50 px-4 text-base text-slate-900 outline-none focus:border-sky-400 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  />
                </label>
                <PermissionToggles value={newPerms} onChange={setNewPerms} />
                <button
                  type="submit"
                  disabled={busy}
                  className="w-full min-h-14 rounded-2xl bg-sky-500 text-base font-black text-white disabled:opacity-50"
                >
                  {busy ? "جارٍ الإنشاء..." : "إنشاء وإظهار الباسورد"}
                </button>
                <button type="button" onClick={closeSheet} className="w-full min-h-12 text-sm font-bold text-slate-500">
                  إلغاء
                </button>
              </form>
            )}

            {sheet.type === "password" && (
              <div className="space-y-5 text-center">
                <p className="text-sm font-bold text-slate-500">باسورد حساب</p>
                <p className="text-xl font-black text-slate-900 dark:text-white">{sheet.name}</p>
                <div
                  dir="ltr"
                  className="select-all rounded-2xl border-2 border-dashed border-sky-300 bg-sky-50 px-4 py-6 font-mono text-2xl font-black tracking-[0.2em] text-sky-800 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-200"
                >
                  {sheet.password}
                </div>
                <p className="text-sm leading-7 text-amber-700 dark:text-amber-300">{sheet.hint}</p>
                <p className="text-xs leading-6 text-slate-500">
                  المساعد يسجّل من لوحة الإدارة → تبويب مساعد → الاسم + الباسورد ده، ويدخل لوحة المساعد مش لوحة المدرّس.
                </p>
                <button
                  type="button"
                  onClick={() => void copyPassword(sheet.password)}
                  className="w-full min-h-14 rounded-2xl bg-sky-500 text-base font-black text-white"
                >
                  {copied ? "تم النسخ ✓" : "نسخ الباسورد"}
                </button>
                <button type="button" onClick={closeSheet} className="w-full min-h-12 text-sm font-bold text-slate-500">
                  تمام، أديته للمساعد
                </button>
              </div>
            )}

            {sheet.type === "perms" && (
              <PermsEditor
                assistant={sheet.assistant}
                busy={busy}
                onCancel={closeSheet}
                onSave={(perms) => void handleSavePerms(sheet.assistant, perms)}
              />
            )}

            {sheet.type === "delete" && (
              <div className="space-y-5">
                <h3 className="text-lg font-black text-slate-900 dark:text-white">حذف {sheet.assistant.name}؟</h3>
                <p className="text-sm leading-7 text-slate-500">
                  الحساب هيتقفل ومش هيقدر يدخل تاني. تقدر تعمل حساب جديد بعدين.
                </p>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void handleDelete(sheet.assistant)}
                  className="w-full min-h-14 rounded-2xl bg-rose-500 text-base font-black text-white disabled:opacity-50"
                >
                  {busy ? "جارٍ الحذف..." : "تأكيد الحذف"}
                </button>
                <button type="button" onClick={closeSheet} className="w-full min-h-12 text-sm font-bold text-slate-500">
                  رجوع
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function PermissionToggles({
  value,
  onChange,
}: {
  value: AssistantPermissions;
  onChange: (next: AssistantPermissions) => void;
}) {
  return (
    <div className="space-y-2">
      <p className="text-sm font-black text-slate-800 dark:text-white">الصلاحيات</p>
      {ASSISTANT_PERMISSION_META.map((item) => {
        const on = value[item.key];
        return (
          <button
            key={item.key}
            type="button"
            onClick={() => onChange({ ...value, [item.key]: !on })}
            className={`flex w-full min-h-[4.25rem] items-center justify-between gap-3 rounded-2xl border px-4 text-right transition-colors ${
              on
                ? "border-emerald-300 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/30"
                : "border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/40"
            }`}
          >
            <div className="min-w-0">
              <p className="text-sm font-black text-slate-900 dark:text-white">{item.label}</p>
              <p className="mt-0.5 text-[11px] leading-5 text-slate-500">{item.hint}</p>
            </div>
            <span
              className={`shrink-0 rounded-full px-3 py-1.5 text-[11px] font-black ${
                on ? "bg-emerald-500 text-white" : "bg-slate-200 text-slate-500 dark:bg-slate-700"
              }`}
            >
              {on ? "نعم" : "لا"}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function PermsEditor({
  assistant,
  busy,
  onCancel,
  onSave,
}: {
  assistant: AssistantRow;
  busy: boolean;
  onCancel: () => void;
  onSave: (perms: AssistantPermissions) => void;
}) {
  const [perms, setPerms] = useState<AssistantPermissions>({ ...assistant.permissions });
  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-lg font-black text-slate-900 dark:text-white">صلاحيات {assistant.name}</h3>
        <p className="mt-1 text-sm text-slate-500">غيّر اللي يقدر يعمله، وبعدين احفظ.</p>
      </div>
      <PermissionToggles value={perms} onChange={setPerms} />
      <button
        type="button"
        disabled={busy}
        onClick={() => onSave(perms)}
        className="w-full min-h-14 rounded-2xl bg-sky-500 text-base font-black text-white disabled:opacity-50"
      >
        {busy ? "جارٍ الحفظ..." : "حفظ الصلاحيات"}
      </button>
      <button type="button" onClick={onCancel} className="w-full min-h-12 text-sm font-bold text-slate-500">
        إلغاء
      </button>
    </div>
  );
}
