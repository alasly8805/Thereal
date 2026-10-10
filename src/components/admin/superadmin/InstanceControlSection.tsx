"use client";
import { useCallback, useEffect, useState } from "react";
import { Activity, Construction, Database, Gauge, KeyRound, LogIn, RefreshCw, Search, ShieldCheck, Trash2, UserPlus, Users } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import {
  Badge,
  Button,
  EmptyState,
  Field,
  Input,
  Modal,
  PageHeader,
  Panel,
  Switch,
  Tabs,
  Textarea,
  fmtDateTime,
  fmtNum,
  readJson,
} from "@/components/admin/ui/kit";

interface Superadmin {
  id: string;
  name: string;
  email: string;
  isOwner: boolean;
  isActive: boolean;
}

interface FoundStudent {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  parentPhone: string | null;
  educationalStage: string | null;
  age: number | null;
  isActive: boolean;
  points: number;
  createdAt: string;
  lastLoginAt: string | null;
  _count?: { accessCodes: number; courseEnrollments: number; quizResults: number };
}

interface ActivityLogItem {
  id: string;
  adminName: string;
  action: string;
  targetType: string;
  targetId: string;
  targetName: string;
  createdAt: string;
  meta?: Record<string, unknown> | null;
}

interface LiveLogStudent {
  id: string;
  name: string;
  phone: string | null;
  parentPhone: string | null;
  educationalStage: string | null;
  email: string;
  createdAt: string;
  lastLoginAt: string | null;
  isActive: boolean;
  points: number;
}

interface OverloadState {
  mode: "auto" | "on" | "off";
  ramThresholdPct: number;
  cooldownUntil: string | null;
  message: string;
  isTriggered: boolean;
  remainingMinutes: number;
  memory: { usedMemPct: number; usedMemMb: number; totalMemMb: number; processRssMb: number };
}

const STAGE: Record<string, string> = { sec_1: "أولى ثانوي", sec_2: "ثانية ثانوي", sec_3: "ثالثة ثانوي" };

type PendingConfirm =
  | { kind: "maintenance-on" }
  | { kind: "overload-on" }
  | { kind: "clear-virtual" }
  | { kind: "remove-admin"; admin: Superadmin }
  | { kind: "clear-pw"; admin: Superadmin }
  | null;

function storedActionPassword() {
  try {
    return sessionStorage.getItem("admin_action_password") || "";
  } catch {
    return "";
  }
}

export function InstanceControlSection() {
  const { success: toastSuccess, error: toastError } = useToast();
  const [actionPassword, setActionPassword] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingConfirm>(null);

  const [studentPhoneSearch, setStudentPhoneSearch] = useState("");
  const [foundStudents, setFoundStudents] = useState<FoundStudent[]>([]);
  const [searchingStudent, setSearchingStudent] = useState(false);
  const [impersonatingId, setImpersonatingId] = useState<string | null>(null);

  const [liveStudents, setLiveStudents] = useState<LiveLogStudent[]>([]);
  const [activityLogs, setActivityLogs] = useState<ActivityLogItem[]>([]);
  const [totalStudentsCount, setTotalStudentsCount] = useState(0);
  const [loadingLiveLogs, setLoadingLiveLogs] = useState(false);
  const [liveTab, setLiveTab] = useState<"students" | "actions">("students");
  const [autoRefreshLive, setAutoRefreshLive] = useState(true);

  const [maintOn, setMaintOn] = useState(false);
  const [maintMsg, setMaintMsg] = useState("");
  const [vCounts, setVCounts] = useState({ students: 0, teachers: 0, courses: 0 });
  const [gen, setGen] = useState({ teachers: 3, students: 15, courses: 4 });
  const [admins, setAdmins] = useState<Superadmin[]>([]);
  const [selfId, setSelfId] = useState("");
  const [newAdmin, setNewAdmin] = useState({ name: "", email: "", password: "" });
  const [overloadState, setOverloadState] = useState<OverloadState | null>(null);

  useEffect(() => setActionPassword(storedActionPassword()), []);

  const loadAll = useCallback(async () => {
    const get = (url: string) => fetch(url, { credentials: "include" }).then((r) => readJson<Record<string, unknown>>(r)).catch(() => null);
    const [m, v, s, ov] = await Promise.all([
      get("/api/admin/superadmin/maintenance"),
      get("/api/admin/superadmin/virtual-data"),
      get("/api/admin/superadmin/superadmins"),
      get("/api/admin/superadmin/overload-protection"),
    ]);
    if (m && typeof m.on === "boolean") {
      setMaintOn(m.on);
      setMaintMsg((m.message as string) ?? "");
    }
    if (v && typeof v.students === "number") setVCounts(v as typeof vCounts);
    if (s && Array.isArray(s.superadmins)) {
      setAdmins(s.superadmins as Superadmin[]);
      setSelfId((s.selfId as string) ?? "");
    }
    if (ov?.state) setOverloadState(ov.state as OverloadState);
    if (!m && !v && !s && !ov) toastError("تعذر تحميل لوحة السيرفر");
  }, [toastError]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const needPw = () => {
    if (!actionPassword) {
      toastError("أدخل كلمة مرور المشرف في الأعلى أولاً");
      return false;
    }
    return true;
  };

  const send = async (method: "POST" | "PATCH" | "DELETE", url: string, body: Record<string, unknown> = {}) => {
    const res = await fetch(url, {
      method,
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...body, actionPassword }),
    });
    const json = await readJson<Record<string, unknown> & { error?: string }>(res);
    if (!res.ok) throw new Error(json?.error ?? "تعذر تنفيذ العملية");
    return json ?? {};
  };

  /** Runs an action with the busy flag + toast handling. */
  const run = async (tag: string, fn: () => Promise<void>) => {
    if (!needPw()) return;
    setBusy(tag);
    try {
      await fn();
    } catch (e) {
      toastError(e instanceof Error ? e.message : "خطأ");
    } finally {
      setBusy(null);
    }
  };

  const setMaintenance = (next: boolean) =>
    run("maint", async () => {
      await send("POST", "/api/admin/superadmin/maintenance", { on: next, message: maintMsg });
      setMaintOn(next);
      toastSuccess(next ? "وضع الصيانة مفعّل — الزوّار يرون صفحة الصيانة" : "أُوقف وضع الصيانة — الموقع متاح");
    });

  const saveMessage = () =>
    run("maint-msg", async () => {
      await send("POST", "/api/admin/superadmin/maintenance", { message: maintMsg });
      toastSuccess("حُفظت رسالة الصيانة");
    });

  const updateOverload = (tag: string, action: string, payload: Record<string, unknown> = {}) =>
    run(tag, async () => {
      const res = await send("POST", "/api/admin/superadmin/overload-protection", { action, ...payload });
      if (res.state) setOverloadState(res.state as OverloadState);
      toastSuccess("حُدّث نظام حماية السيرفر");
    });

  const generate = () =>
    run("gen", async () => {
      const r = (await send("POST", "/api/admin/superadmin/virtual-data", { action: "generate", ...gen })) as { created?: { teachers: number; students: number; courses: number } };
      toastSuccess(`أُنشئ ${fmtNum(r.created?.teachers ?? 0)} مدرس و${fmtNum(r.created?.students ?? 0)} طالب و${fmtNum(r.created?.courses ?? 0)} كورس`);
      await loadAll();
    });

  const clearVirtual = () =>
    run("clear-virtual", async () => {
      const r = (await send("POST", "/api/admin/superadmin/virtual-data", { action: "clear" })) as { cleared?: { users: number; courses: number } };
      toastSuccess(`حُذف ${fmtNum(r.cleared?.users ?? 0)} حساب و${fmtNum(r.cleared?.courses ?? 0)} كورس تجريبي`);
      await loadAll();
    });

  const renameAdmin = (id: string, name: string) =>
    run(`rename:${id}`, async () => {
      await send("PATCH", `/api/admin/superadmin/superadmins/${id}`, { name });
      toastSuccess("حُدّث الاسم");
      await loadAll();
    });

  const changePw = (id: string, password: string) =>
    run(`pw:${id}`, async () => {
      await send("PATCH", `/api/admin/superadmin/superadmins/${id}`, { password });
      toastSuccess("تم تغيير كلمة المرور");
    });

  const clearPw = (a: Superadmin) =>
    run(`clearpw:${a.id}`, async () => {
      await send("PATCH", `/api/admin/superadmin/superadmins/${a.id}`, { clearPassword: true });
      toastSuccess(`حُذفت كلمة مرور ${a.name}`);
    });

  const toggleActive = (a: Superadmin) =>
    run(`active:${a.id}`, async () => {
      await send("PATCH", `/api/admin/superadmin/superadmins/${a.id}`, { isActive: !a.isActive });
      toastSuccess(a.isActive ? `أُوقف ${a.name}` : `فُعّل ${a.name}`);
      await loadAll();
    });

  const removeAdmin = (a: Superadmin) =>
    run(`remove:${a.id}`, async () => {
      await send("DELETE", `/api/admin/superadmin/superadmins/${a.id}`);
      toastSuccess(`حُذف المشرف ${a.name}`);
      await loadAll();
    });

  const createAdmin = (e: React.FormEvent) => {
    e.preventDefault();
    void run("create-admin", async () => {
      await send("POST", "/api/admin/superadmin/superadmins", newAdmin);
      toastSuccess("أُنشئ مشرف عام جديد");
      setNewAdmin({ name: "", email: "", password: "" });
      await loadAll();
    });
  };

  const searchStudent = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!studentPhoneSearch.trim()) return toastError("أدخل رقم هاتف الطالب");
    setSearchingStudent(true);
    setFoundStudents([]);
    try {
      const res = await fetch("/api/admin/superadmin/impersonate", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "search", phone: studentPhoneSearch }),
      });
      const data = await readJson<{ students?: FoundStudent[]; error?: string }>(res);
      if (!res.ok) throw new Error(data?.error || "لم يُعثر على طالب");
      setFoundStudents(data?.students || []);
      if (!data?.students?.length) toastError("لا يوجد طالب بهذا الرقم");
    } catch (err) {
      toastError(err instanceof Error ? err.message : "خطأ أثناء البحث");
    } finally {
      setSearchingStudent(false);
    }
  };

  const loginAsStudent = async (studentId: string, studentName: string) => {
    if (!needPw()) return;
    setImpersonatingId(studentId);
    try {
      const res = await fetch("/api/admin/superadmin/impersonate", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "impersonate", studentId, actionPassword }),
      });
      const data = await readJson<{ redirectUrl?: string; error?: string }>(res);
      if (!res.ok) throw new Error(data?.error || "تعذر الدخول لحساب الطالب");
      toastSuccess(`جارٍ الانتقال لحساب ${studentName}…`);
      setTimeout(() => {
        window.location.href = data?.redirectUrl || "/courses";
      }, 500);
    } catch (err) {
      toastError(err instanceof Error ? err.message : "خطأ أثناء الدخول للحساب");
      setImpersonatingId(null);
    }
  };

  const fetchLiveLogs = useCallback(async () => {
    setLoadingLiveLogs(true);
    try {
      const res = await fetch("/api/admin/superadmin/live-logs", { credentials: "include" });
      const data = await readJson<{ success?: boolean; recentStudents?: LiveLogStudent[]; activityLogs?: ActivityLogItem[]; totalStudents?: number }>(res);
      if (res.ok && data?.success) {
        setLiveStudents(data.recentStudents || []);
        setActivityLogs(data.activityLogs || []);
        setTotalStudentsCount(data.totalStudents || 0);
      }
    } catch {
      /* quiet poll */
    } finally {
      setLoadingLiveLogs(false);
    }
  }, []);

  // Poll every 10s, only while the tab is visible.
  useEffect(() => {
    void fetchLiveLogs();
    if (!autoRefreshLive) return;
    const id = setInterval(() => {
      if (document.visibilityState === "visible") void fetchLiveLogs();
    }, 10000);
    return () => clearInterval(id);
  }, [fetchLiveLogs, autoRefreshLive]);

  const confirmMeta: Record<NonNullable<PendingConfirm>["kind"], { title: string; text: string; action: string; danger?: boolean }> = {
    "maintenance-on": { title: "تفعيل وضع الصيانة؟", text: "كل الزوّار والطلاب سيرون صفحة الصيانة بدل الموقع حتى تُوقفه. لوحة الإدارة تبقى متاحة.", action: "تفعيل الصيانة", danger: true },
    "overload-on": { title: "تفعيل غرفة الانتظار إجبارياً؟", text: "الطلاب الجدد سيُحوّلون لغرفة الانتظار فوراً بغض النظر عن حمل السيرفر.", action: "تفعيل", danger: true },
    "clear-virtual": { title: "حذف كل البيانات التجريبية؟", text: "ستُحذف كل الحسابات والكورسات التجريبية التي أنشأها المولّد.", action: "حذف", danger: true },
    "remove-admin": { title: "حذف المشرف العام؟", text: "", action: "حذف المشرف", danger: true },
    "clear-pw": { title: "حذف كلمة المرور؟", text: "", action: "حذف كلمة المرور", danger: true },
  };

  const runPending = async () => {
    const p = pending;
    setPending(null);
    if (!p) return;
    if (p.kind === "maintenance-on") await setMaintenance(true);
    else if (p.kind === "overload-on") await updateOverload("ov-mode", "setMode", { mode: "on" });
    else if (p.kind === "clear-virtual") await clearVirtual();
    else if (p.kind === "remove-admin") await removeAdmin(p.admin);
    else if (p.kind === "clear-pw") await clearPw(p.admin);
  };

  const mem = overloadState?.memory;
  const memColor = !mem ? "var(--brand)" : mem.usedMemPct > 80 ? "var(--danger)" : mem.usedMemPct > 60 ? "var(--warn)" : "var(--ok)";

  return (
    <div dir="rtl" className="flex flex-col gap-5 max-w-4xl">
      <PageHeader title="السيرفر" description="أدوات المالك: الدخول كطالب، السجل المباشر، الصيانة، حماية السيرفر من الضغط، البيانات التجريبية، والمشرفون العامون." />

      <Panel title="كلمة مرور المشرف" icon={<KeyRound size={16} />} description="مطلوبة لكل إجراء في هذه الصفحة. تُعبّأ تلقائياً من مفتاح الإجراءات إن كان محفوظاً.">
        <Input type="password" value={actionPassword} onChange={(e) => setActionPassword(e.target.value)} placeholder="••••••••" aria-label="كلمة مرور المشرف" autoComplete="current-password" className="max-w-sm" />
      </Panel>

      <Panel title="الدخول كطالب" icon={<LogIn size={16} />} description="ابحث برقم هاتف الطالب لترى المنصة كما يراها وتحل مشكلته." actions={<Badge tone="gold">للمالك فقط</Badge>}>
        <form onSubmit={searchStudent} className="flex flex-wrap gap-2">
          <Input value={studentPhoneSearch} onChange={(e) => setStudentPhoneSearch(e.target.value)} placeholder="01113871409" mono inputMode="tel" aria-label="رقم هاتف الطالب" className="flex-1 min-w-[200px]" />
          <Button type="submit" variant="primary" loading={searchingStudent} icon={<Search size={15} />}>بحث</Button>
        </form>
        {foundStudents.length > 0 && (
          <ul className="adm-well adm-list mt-4">
            {foundStudents.map((st) => (
              <li key={st.id} className="adm-row" style={{ padding: "12px 14px" }}>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold flex flex-wrap items-center gap-2">
                    {st.name}
                    <Badge>{STAGE[st.educationalStage ?? ""] ?? st.educationalStage ?? "غير محدد"}</Badge>
                    <Badge tone={st.isActive ? "ok" : "bad"}>{st.isActive ? "نشط" : "معطل"}</Badge>
                  </p>
                  <p className="text-xs adm-muted mt-1">
                    <span className="adm-mono">{st.phone || "—"}</span>
                    {st.parentPhone && <> · ولي الأمر <span className="adm-mono">{st.parentPhone}</span></>}
                    {" "}· {fmtNum(st.points)} نقطة · {fmtNum(st._count?.courseEnrollments || st._count?.accessCodes || 0)} كورس
                  </p>
                </div>
                <Button size="sm" variant="primary" loading={impersonatingId === st.id} onClick={() => void loginAsStudent(st.id, st.name)} icon={<LogIn size={14} />}>
                  الدخول كطالب
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel
        title="السجل المباشر"
        icon={<Activity size={16} />}
        description={`آخر التسجيلات والعمليات · إجمالي الطلاب ${fmtNum(totalStudentsCount)}`}
        padded={false}
        actions={
          <>
            <label className="inline-flex items-center gap-2 text-xs font-semibold" style={{ color: "var(--ink-2)" }}>
              تحديث كل ١٠ ث
              <Switch checked={autoRefreshLive} onChange={setAutoRefreshLive} label="تحديث تلقائي" />
            </label>
            <Button size="sm" onClick={() => void fetchLiveLogs()} loading={loadingLiveLogs} icon={<RefreshCw size={14} />}>تحديث</Button>
          </>
        }
      >
        <div className="px-4 pt-3">
          <Tabs<"students" | "actions">
            label="السجل المباشر"
            value={liveTab}
            onChange={setLiveTab}
            items={[
              { id: "students", label: "تسجيلات الطلاب", icon: <Users size={14} />, badge: <Badge>{fmtNum(liveStudents.length)}</Badge> },
              { id: "actions", label: "العمليات", icon: <Activity size={14} />, badge: <Badge>{fmtNum(activityLogs.length)}</Badge> },
            ]}
          />
        </div>
        <div className="max-h-80 overflow-y-auto mt-2">
          {liveTab === "students" ? (
            liveStudents.length === 0 ? (
              <EmptyState title="لا توجد تسجيلات حديثة" />
            ) : (
              <ul className="adm-list">
                {liveStudents.map((st) => (
                  <li key={st.id} className="adm-row" style={{ padding: "10px 16px" }}>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold">{st.name} <span className="adm-mono adm-muted font-normal">{st.phone || st.email}</span></p>
                      <p className="text-xs adm-muted">{fmtDateTime(st.createdAt)} · {STAGE[st.educationalStage ?? ""] ?? st.educationalStage ?? "عام"}</p>
                    </div>
                    <Button size="sm" variant="ghost" loading={impersonatingId === st.id} onClick={() => void loginAsStudent(st.id, st.name)}>دخول كطالب</Button>
                  </li>
                ))}
              </ul>
            )
          ) : activityLogs.length === 0 ? (
            <EmptyState title="لا توجد عمليات حديثة" />
          ) : (
            <ul className="adm-list">
              {activityLogs.map((log) => (
                <li key={log.id} className="adm-row" style={{ padding: "10px 16px" }}>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm flex flex-wrap items-center gap-2">
                      <Badge tone={log.action === "COURSE_LIBRARY_REMOVE" ? "bad" : log.action === "STUDENT_IMPERSONATE" ? "ok" : "info"}>
                        {log.action === "COURSE_LIBRARY_REMOVE" ? "حذف كورس من المكتبة" : log.action === "STUDENT_IMPERSONATE" ? "دخول إداري كطالب" : log.action}
                      </Badge>
                      <b>{log.adminName}</b>
                      <span className="adm-muted">← {log.targetName}</span>
                      {log.meta?.studentPhone ? <span className="adm-mono adm-muted">{String(log.meta.studentPhone)}</span> : null}
                    </p>
                  </div>
                  <span className="text-xs adm-muted whitespace-nowrap">{fmtDateTime(log.createdAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Panel>

      <Panel
        title="وضع الصيانة"
        icon={<Construction size={16} />}
        description="يُظهر للزوّار صفحة «شيء رائع قادم». المشرفون ولوحة الإدارة يعملون طبيعياً."
        actions={
          <>
            <Badge tone={maintOn ? "warn" : "ok"} dot>{maintOn ? "الصيانة مفعّلة" : "الموقع يعمل"}</Badge>
            <Switch checked={maintOn} disabled={busy === "maint"} onChange={(v) => (v ? setPending({ kind: "maintenance-on" }) : void setMaintenance(false))} label="وضع الصيانة" />
          </>
        }
      >
        <Field label="رسالة الصيانة" hint={`${fmtNum(maintMsg.length)} / ٢٨٠`} htmlFor="maint-msg">
          <Textarea id="maint-msg" rows={2} maxLength={280} value={maintMsg} onChange={(e) => setMaintMsg(e.target.value)} placeholder="الرسالة المعروضة للزوّار" />
        </Field>
        <Button className="mt-3" onClick={() => void saveMessage()} loading={busy === "maint-msg"}>حفظ الرسالة</Button>
      </Panel>

      <Panel
        title="حماية السيرفر من الضغط"
        icon={<Gauge size={16} />}
        description="عند اقتراب الرام من الحد الأقصى، يُحوّل الطلاب الجدد لغرفة انتظار ١٥ دقيقة لمنع انهيار السيرفر. لوحة الإدارة تعمل دائماً."
        actions={overloadState?.isTriggered ? <Badge tone="warn" live>غرفة الانتظار مفعّلة الآن</Badge> : undefined}
      >
        <div className="flex flex-col gap-4">
          {mem && (
            <div>
              <div className="flex items-center justify-between text-xs mb-1.5">
                <span className="adm-muted">استهلاك الرام</span>
                <span className="adm-num font-bold">
                  {fmtNum(mem.usedMemPct)}٪ · {fmtNum(mem.usedMemMb)} / {fmtNum(mem.totalMemMb)} MB
                </span>
              </div>
              <div className="adm-bar" role="progressbar" aria-valuenow={mem.usedMemPct} aria-valuemin={0} aria-valuemax={100} aria-label="استهلاك الرام">
                <span style={{ width: `${Math.min(100, mem.usedMemPct)}%`, background: memColor }} />
              </div>
            </div>
          )}

          <div role="radiogroup" aria-label="وضع الحماية" className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {(
              [
                { id: "auto", label: "تلقائي", sub: `عند ${fmtNum(overloadState?.ramThresholdPct ?? 85)}٪ رام` },
                { id: "on", label: "تفعيل إجباري", sub: "غرفة الانتظار الآن" },
                { id: "off", label: "إيقاف", sub: "بدون حماية" },
              ] as const
            ).map((m) => {
              const active = overloadState?.mode === m.id;
              return (
                <button
                  key={m.id}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  disabled={busy === "ov-mode"}
                  onClick={() => (m.id === "on" ? setPending({ kind: "overload-on" }) : void updateOverload("ov-mode", "setMode", { mode: m.id }))}
                  className="rounded-xl px-3 py-2.5 text-start cursor-pointer disabled:opacity-50"
                  style={{ border: `1px solid ${active ? "var(--brand)" : "var(--border-strong)"}`, background: active ? "var(--brand-soft)" : "var(--surface)" }}
                >
                  <p className="text-sm font-bold" style={{ color: active ? "var(--brand)" : "var(--ink)" }}>{m.label}</p>
                  <p className="text-xs adm-muted">{m.sub}</p>
                </button>
              );
            })}
          </div>

          <div className="adm-well p-3 flex flex-wrap items-center gap-2">
            <span className="adm-label me-auto">مهلة غرفة الانتظار</span>
            <Button size="sm" loading={busy === "ov-15"} onClick={() => void updateOverload("ov-15", "addCooldown", { addMinutes: 15 })}>+١٥ دقيقة</Button>
            <Button size="sm" loading={busy === "ov-30"} onClick={() => void updateOverload("ov-30", "addCooldown", { addMinutes: 30 })}>+٣٠ دقيقة</Button>
            <Button size="sm" variant="danger" loading={busy === "ov-reset"} onClick={() => void updateOverload("ov-reset", "resetCooldown")}>إلغاء الانتظار الآن</Button>
            {overloadState?.remainingMinutes ? <p className="w-full text-xs" style={{ color: "var(--warn)" }}>متبقٍ {fmtNum(overloadState.remainingMinutes)} دقيقة</p> : null}
          </div>

          <Field label="رسالة غرفة الانتظار" htmlFor="ov-msg">
            <Textarea
              id="ov-msg"
              rows={2}
              maxLength={300}
              value={overloadState?.message || ""}
              onChange={(e) => setOverloadState((prev) => (prev ? { ...prev, message: e.target.value } : prev))}
            />
          </Field>
          <div>
            <Button loading={busy === "ov-msg"} onClick={() => void updateOverload("ov-msg", "setMessage", { message: overloadState?.message })}>حفظ الرسالة</Button>
          </div>
        </div>
      </Panel>

      <Panel
        title="البيانات التجريبية"
        icon={<Database size={16} />}
        description={`طلاب ومدرسون وكورسات وهمية بفيديوهات يوتيوب للعرض. الحالي: ${fmtNum(vCounts.students)} طالب · ${fmtNum(vCounts.teachers)} مدرس · ${fmtNum(vCounts.courses)} كورس`}
      >
        <div className="grid grid-cols-3 gap-3 max-w-md">
          {(["teachers", "students", "courses"] as const).map((k) => (
            <Field key={k} label={k === "teachers" ? "مدرسون" : k === "students" ? "طلاب" : "كورسات"} htmlFor={`gen-${k}`}>
              <Input id={`gen-${k}`} type="number" min={1} mono value={gen[k]} onChange={(e) => setGen({ ...gen, [k]: Math.max(1, parseInt(e.target.value, 10) || 1) })} />
            </Field>
          ))}
        </div>
        <div className="flex flex-wrap gap-2 mt-4">
          <Button variant="primary" loading={busy === "gen"} onClick={() => void generate()}>توليد</Button>
          <Button variant="danger" icon={<Trash2 size={15} />} loading={busy === "clear-virtual"} onClick={() => setPending({ kind: "clear-virtual" })}>حذف كل البيانات التجريبية</Button>
        </div>
      </Panel>

      <Panel title="المشرفون العامون" icon={<ShieldCheck size={16} />} padded={false}>
        <ul className="adm-list">
          {admins.map((a) => (
            <SuperadminRow
              key={a.id}
              admin={a}
              isSelf={a.id === selfId}
              busy={busy}
              onRename={(name) => void renameAdmin(a.id, name)}
              onChangePw={(pw) => void changePw(a.id, pw)}
              onClearPw={() => setPending({ kind: "clear-pw", admin: a })}
              onToggleActive={() => void toggleActive(a)}
              onRemove={() => setPending({ kind: "remove-admin", admin: a })}
            />
          ))}
        </ul>
        <form onSubmit={createAdmin} className="adm-panel-foot" style={{ alignItems: "flex-end" }}>
          <p className="adm-label w-full flex items-center gap-1.5"><UserPlus size={14} aria-hidden /> مشرف عام جديد</p>
          <div className="grid gap-2 sm:grid-cols-3 flex-1 min-w-[260px]">
            <Input inputSize="sm" required value={newAdmin.name} onChange={(e) => setNewAdmin({ ...newAdmin, name: e.target.value })} placeholder="الاسم" aria-label="الاسم" />
            <Input inputSize="sm" required type="email" mono value={newAdmin.email} onChange={(e) => setNewAdmin({ ...newAdmin, email: e.target.value })} placeholder="البريد" aria-label="البريد" />
            <Input inputSize="sm" required type="password" autoComplete="new-password" value={newAdmin.password} onChange={(e) => setNewAdmin({ ...newAdmin, password: e.target.value })} placeholder="كلمة المرور" aria-label="كلمة المرور" />
          </div>
          <Button type="submit" size="sm" variant="primary" loading={busy === "create-admin"}>إنشاء</Button>
        </form>
      </Panel>

      <Modal
        open={!!pending}
        onClose={() => setPending(null)}
        size="sm"
        title={pending ? confirmMeta[pending.kind].title : ""}
        description={
          pending?.kind === "remove-admin"
            ? `سيُحذف حساب ${pending.admin.name} (${pending.admin.email}) ولن يستطيع الدخول.`
            : pending?.kind === "clear-pw"
              ? `لن يستطيع ${pending.admin.name} الدخول بكلمة مرور بعد ذلك.`
              : pending
                ? confirmMeta[pending.kind].text
                : undefined
        }
        footer={
          <>
            <Button onClick={() => setPending(null)}>إلغاء</Button>
            <Button variant={pending && confirmMeta[pending.kind].danger ? "danger-solid" : "primary"} onClick={() => void runPending()}>
              {pending ? confirmMeta[pending.kind].action : ""}
            </Button>
          </>
        }
      />
    </div>
  );
}

function SuperadminRow({
  admin,
  isSelf,
  busy,
  onRename,
  onChangePw,
  onClearPw,
  onToggleActive,
  onRemove,
}: {
  admin: Superadmin;
  isSelf: boolean;
  busy: string | null;
  onRename: (name: string) => void;
  onChangePw: (password: string) => void;
  onClearPw: () => void;
  onToggleActive: () => void;
  onRemove: () => void;
}) {
  const [name, setName] = useState(admin.name);
  const [pw, setPw] = useState("");

  return (
    <li className="px-4 py-4 flex flex-col gap-3">
      <p className="text-sm font-bold flex flex-wrap items-center gap-2">
        <span className="adm-mono">{admin.email}</span>
        {admin.isOwner && <Badge tone="gold">المالك</Badge>}
        {!admin.isActive && <Badge tone="bad">موقوف</Badge>}
        {isSelf && <Badge>أنت</Badge>}
      </p>
      <div className="flex flex-wrap items-end gap-2">
        <form
          className="flex items-end gap-2 flex-1 min-w-[220px]"
          onSubmit={(e) => {
            e.preventDefault();
            onRename(name);
          }}
        >
          <Field label="الاسم" htmlFor={`sa-name-${admin.id}`} className="flex-1">
            <Input id={`sa-name-${admin.id}`} inputSize="sm" value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Button type="submit" size="sm" disabled={name === admin.name} loading={busy === `rename:${admin.id}`}>حفظ</Button>
        </form>
        <form
          className="flex items-end gap-2 flex-1 min-w-[220px]"
          onSubmit={(e) => {
            e.preventDefault();
            if (pw) {
              onChangePw(pw);
              setPw("");
            }
          }}
        >
          <Field label="كلمة مرور جديدة" htmlFor={`sa-pw-${admin.id}`} className="flex-1">
            <Input id={`sa-pw-${admin.id}`} inputSize="sm" type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} />
          </Field>
          <Button type="submit" size="sm" disabled={!pw} loading={busy === `pw:${admin.id}`}>تغيير</Button>
        </form>
      </div>
      {!admin.isOwner && (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="ghost" onClick={onClearPw} loading={busy === `clearpw:${admin.id}`}>حذف كلمة المرور</Button>
          <Button size="sm" variant="ghost" onClick={onToggleActive} loading={busy === `active:${admin.id}`}>{admin.isActive ? "إيقاف" : "تفعيل"}</Button>
          {!isSelf && (
            <Button size="sm" variant="danger" onClick={onRemove} loading={busy === `remove:${admin.id}`} icon={<Trash2 size={14} />}>حذف</Button>
          )}
        </div>
      )}
    </li>
  );
}
