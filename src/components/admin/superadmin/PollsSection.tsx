"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowRight, BarChart3, Plus, RefreshCw, Trash2, Users, Vote, X } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { EDUCATIONAL_STAGES } from "@/types";
import {
  Badge,
  Button,
  EmptyState,
  Field,
  IconButton,
  Input,
  Modal,
  Notice,
  PageHeader,
  Panel,
  SearchInput,
  Select,
  SkeletonRows,
  Stat,
  Switch,
  Textarea,
  fmtDate,
  fmtDateTime,
  fmtNum,
  readJson,
} from "@/components/admin/ui/kit";

interface PollSummary {
  id: string;
  question: string;
  educationalStage: string | null;
  isActive: boolean;
  createdAt: string;
  _count: { votes: number; options: number };
}

interface PollDetails extends Omit<PollSummary, "_count"> {
  options: Array<{ id: string; text: string; _count: { votes: number } }>;
  votes: Array<{
    id: string;
    optionId: string;
    createdAt: string;
    student: { id: string; name: string; phone: string | null; educationalStage: string | null };
  }>;
}

const MAX_OPTIONS = 8;
/** Live results refresh while an open poll's results are on screen. */
const LIVE_MS = 15000;

function stageLabel(v: string | null) {
  if (!v) return "كل الطلاب";
  return EDUCATIONAL_STAGES.find((s) => s.value === v)?.label ?? v;
}

const pct = (n: number, total: number) => (total ? Math.round((n / total) * 100) : 0);

export function PollsSection() {
  const { success, error } = useToast();
  const [polls, setPolls] = useState<PollSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [form, setForm] = useState({ question: "", stage: "", options: ["", ""], openNow: true });
  const [creating, setCreating] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<PollSummary | null>(null);
  const [openPollId, setOpenPollId] = useState<string | null>(null);

  const fetchPolls = useCallback(async () => {
    setLoadError("");
    try {
      const res = await fetch("/api/admin/superadmin/polls", { credentials: "include" });
      const data = await readJson<{ polls?: PollSummary[]; error?: string }>(res);
      if (!res.ok) {
        setLoadError(data?.error || "تعذر تحميل الاستطلاعات");
        return;
      }
      setPolls(data?.polls ?? []);
    } catch {
      setLoadError("تعذر الاتصال بالخادم");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchPolls();
  }, [fetchPolls]);

  const setOption = (i: number, v: string) => setForm((f) => ({ ...f, options: f.options.map((o, j) => (j === i ? v : o)) }));

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const options = form.options.map((o) => o.trim()).filter(Boolean);
    if (options.length < 2) {
      error("أضف اختيارين على الأقل");
      return;
    }
    setCreating(true);
    try {
      const res = await fetch("/api/admin/superadmin/polls", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: form.question, educationalStage: form.stage || null, options, isActive: form.openNow }),
      });
      const data = await readJson<{ error?: string }>(res);
      if (!res.ok) throw new Error(data?.error || "تعذر إنشاء الاستطلاع");
      success(form.openNow ? "الاستطلاع شغال — هيظهر للطلاب خلال دقيقتين" : "اتحفظ الاستطلاع — شغّله وقت ما تحب");
      setForm({ question: "", stage: form.stage, options: ["", ""], openNow: true });
      void fetchPolls();
    } catch (err) {
      error(err instanceof Error ? err.message : "تعذر إنشاء الاستطلاع");
    } finally {
      setCreating(false);
    }
  };

  const toggle = async (poll: PollSummary) => {
    setBusyId(`toggle:${poll.id}`);
    try {
      const res = await fetch(`/api/admin/superadmin/polls/${poll.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !poll.isActive }),
      });
      if (!res.ok) throw new Error((await readJson<{ error?: string }>(res))?.error || "تعذر تغيير الحالة");
      setPolls((prev) => prev.map((p) => (p.id === poll.id ? { ...p, isActive: !p.isActive } : p)));
      success(poll.isActive ? "اتقفل الاستطلاع" : "الاستطلاع شغال — هيظهر للطلاب خلال دقيقتين");
    } catch (e) {
      error(e instanceof Error ? e.message : "تعذر تغيير الحالة");
    } finally {
      setBusyId(null);
    }
  };

  const runDelete = async () => {
    const poll = confirmDelete;
    if (!poll) return;
    setBusyId("delete");
    try {
      const res = await fetch(`/api/admin/superadmin/polls/${poll.id}`, { method: "DELETE", credentials: "include" });
      if (!res.ok) throw new Error((await readJson<{ error?: string }>(res))?.error || "تعذر الحذف");
      success("اتحذف الاستطلاع");
      setConfirmDelete(null);
      setPolls((prev) => prev.filter((p) => p.id !== poll.id));
    } catch (e) {
      error(e instanceof Error ? e.message : "تعذر الحذف");
    } finally {
      setBusyId(null);
    }
  };

  if (openPollId) {
    return (
      <PollResults
        pollId={openPollId}
        onBack={() => {
          setOpenPollId(null);
          void fetchPolls();
        }}
      />
    );
  }

  return (
    <div dir="rtl" className="flex flex-col gap-5">
      <PageHeader
        title="استطلاعات الرأي"
        description="اسأل الطلاب سؤال باختيارات. وأنت مشغّله، الاستطلاع بيظهر للطالب في أي صفحة (غير الفيديو والامتحانات) لحد ما يجاوب."
      />

      <Panel title="استطلاع جديد" icon={<Plus size={16} />}>
        <form onSubmit={handleCreate} className="flex flex-col gap-4">
          <Field label="السؤال" htmlFor="poll-q">
            <Textarea id="poll-q" rows={2} required value={form.question} onChange={(e) => setForm({ ...form, question: e.target.value })} placeholder="تحب الحصة الجاية تكون الساعة كام؟" />
          </Field>

          <div className="flex flex-col gap-2">
            <span className="text-sm font-bold">الاختيارات</span>
            {form.options.map((o, i) => (
              <div key={i} className="flex items-center gap-2">
                <Input
                  aria-label={`الاختيار ${fmtNum(i + 1)}`}
                  value={o}
                  onChange={(e) => setOption(i, e.target.value)}
                  placeholder={`الاختيار ${fmtNum(i + 1)}`}
                  required={i < 2}
                />
                {form.options.length > 2 && (
                  <IconButton label="شيل الاختيار" size="sm" onClick={() => setForm((f) => ({ ...f, options: f.options.filter((_, j) => j !== i) }))}>
                    <X size={15} />
                  </IconButton>
                )}
              </div>
            ))}
            {form.options.length < MAX_OPTIONS && (
              <Button type="button" size="sm" variant="ghost" icon={<Plus size={14} />} className="self-start" onClick={() => setForm((f) => ({ ...f, options: [...f.options, ""] }))}>
                زوّد اختيار
              </Button>
            )}
          </div>

          <div className="flex flex-wrap items-end gap-4">
            <Field label="مين يشوفه" htmlFor="poll-stage">
              <Select id="poll-stage" value={form.stage} onChange={(e) => setForm({ ...form, stage: e.target.value })}>
                <option value="">كل الطلاب</option>
                {EDUCATIONAL_STAGES.map((s) => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </Select>
            </Field>
            <label className="flex items-center gap-2 text-sm font-bold pb-2">
              <Switch checked={form.openNow} onChange={(v) => setForm({ ...form, openNow: v })} label="شغّله فوراً" />
              شغّله فوراً
            </label>
            <Button type="submit" variant="primary" loading={creating} className="ms-auto">إنشاء</Button>
          </div>
        </form>
      </Panel>

      <Panel padded={false} title={`الاستطلاعات (${fmtNum(polls.length)})`}>
        {loadError ? (
          <div className="p-4"><Notice tone="bad" title={loadError} action={<Button size="sm" onClick={() => void fetchPolls()}>إعادة المحاولة</Button>} /></div>
        ) : loading ? (
          <SkeletonRows rows={3} h={56} />
        ) : polls.length === 0 ? (
          <EmptyState icon={<Vote size={22} />} title="مفيش استطلاعات لسه" text="اعمل أول استطلاع من الفورم اللي فوق." />
        ) : (
          <ul className="adm-list">
            {polls.map((poll) => (
              <li key={poll.id} className="adm-row">
                <div className="min-w-0 flex-1 basis-64">
                  <p className="text-sm font-bold flex flex-wrap items-center gap-2">
                    {poll.question}
                    <Badge>{stageLabel(poll.educationalStage)}</Badge>
                    {poll.isActive ? <Badge tone="ok">شغال</Badge> : <Badge>مقفول</Badge>}
                  </p>
                  <p className="text-xs adm-muted mt-1 flex flex-wrap gap-x-3">
                    <span>{fmtDate(poll.createdAt)}</span>
                    <span>{fmtNum(poll._count.options)} اختيارات</span>
                    <span>{fmtNum(poll._count.votes)} صوت</span>
                  </p>
                </div>
                <div className="flex items-center gap-1.5">
                  <Button size="sm" variant="primary" icon={<BarChart3 size={14} />} onClick={() => setOpenPollId(poll.id)}>النتائج</Button>
                  <Switch
                    checked={poll.isActive}
                    onChange={() => void toggle(poll)}
                    disabled={busyId === `toggle:${poll.id}`}
                    label={poll.isActive ? `اقفل ${poll.question}` : `شغّل ${poll.question}`}
                  />
                  <IconButton label="حذف الاستطلاع" size="sm" onClick={() => setConfirmDelete(poll)} style={{ color: "var(--danger)" }}>
                    <Trash2 size={15} />
                  </IconButton>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Modal
        open={!!confirmDelete}
        onClose={() => busyId !== "delete" && setConfirmDelete(null)}
        size="sm"
        title="حذف الاستطلاع؟"
        description={confirmDelete ? `هيتحذف "${confirmDelete.question}" بكل الأصوات (${fmtNum(confirmDelete._count.votes)}).` : undefined}
        footer={
          <>
            <Button onClick={() => setConfirmDelete(null)} disabled={busyId === "delete"}>إلغاء</Button>
            <Button variant="danger-solid" loading={busyId === "delete"} onClick={() => void runDelete()}>حذف</Button>
          </>
        }
      />
    </div>
  );
}

function PollResults({ pollId, onBack }: { pollId: string; onBack: () => void }) {
  const { success, error } = useToast();
  const [poll, setPoll] = useState<PollDetails | null>(null);
  const [loadError, setLoadError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [filter, setFilter] = useState<string | null>(null);
  const [q, setQ] = useState("");

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const res = await fetch(`/api/admin/superadmin/polls/${pollId}`, { credentials: "include", cache: "no-store" });
      const data = await readJson<{ poll?: PollDetails; error?: string }>(res);
      if (!res.ok || !data?.poll) {
        setLoadError(data?.error || "تعذر تحميل النتائج");
        return;
      }
      setPoll(data.poll);
      setLoadError("");
    } catch {
      setLoadError("تعذر الاتصال بالخادم");
    } finally {
      setRefreshing(false);
    }
  }, [pollId]);

  useEffect(() => {
    void load();
  }, [load]);

  // Live results while the poll is open.
  useEffect(() => {
    if (!poll?.isActive) return;
    const t = setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, LIVE_MS);
    return () => clearInterval(t);
  }, [poll?.isActive, load]);

  const toggle = async () => {
    if (!poll) return;
    setToggling(true);
    try {
      const res = await fetch(`/api/admin/superadmin/polls/${poll.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !poll.isActive }),
      });
      if (!res.ok) throw new Error((await readJson<{ error?: string }>(res))?.error || "تعذر تغيير الحالة");
      setPoll({ ...poll, isActive: !poll.isActive });
      success(poll.isActive ? "اتقفل الاستطلاع" : "الاستطلاع شغال");
    } catch (e) {
      error(e instanceof Error ? e.message : "تعذر تغيير الحالة");
    } finally {
      setToggling(false);
    }
  };

  const optionText = useMemo(() => new Map(poll?.options.map((o) => [o.id, o.text]) ?? []), [poll]);

  const voters = useMemo(() => {
    if (!poll) return [];
    const term = q.trim().toLowerCase();
    return poll.votes.filter(
      (v) =>
        (!filter || v.optionId === filter) &&
        (!term || v.student.name.toLowerCase().includes(term) || (v.student.phone ?? "").includes(term))
    );
  }, [poll, filter, q]);

  const back = (
    <Button variant="ghost" size="sm" icon={<ArrowRight size={15} />} onClick={onBack} className="self-start">
      كل الاستطلاعات
    </Button>
  );

  if (loadError && !poll) {
    return (
      <div dir="rtl" className="flex flex-col gap-5">
        {back}
        <Notice tone="bad" title={loadError} action={<Button size="sm" onClick={() => void load()}>إعادة المحاولة</Button>} />
      </div>
    );
  }
  if (!poll) {
    return (
      <div dir="rtl" className="flex flex-col gap-5">
        {back}
        <Panel><SkeletonRows rows={4} h={36} /></Panel>
      </div>
    );
  }

  const total = poll.votes.length;
  const max = Math.max(1, ...poll.options.map((o) => o._count.votes));
  const leader = total ? poll.options.reduce((a, b) => (b._count.votes > a._count.votes ? b : a)) : null;
  const tie = leader ? poll.options.filter((o) => o._count.votes === leader._count.votes).length > 1 : false;

  return (
    <div dir="rtl" className="flex flex-col gap-5">
      {back}
      <PageHeader
        title={poll.question}
        description={`${stageLabel(poll.educationalStage)} · اتعمل ${fmtDate(poll.createdAt)}${poll.isActive ? " · النتائج بتتحدث لوحدها" : ""}`}
        actions={
          <>
            <Button size="sm" icon={<RefreshCw size={14} />} loading={refreshing} onClick={() => void load()}>تحديث</Button>
            <Button size="sm" variant={poll.isActive ? "danger-solid" : "primary"} loading={toggling} onClick={() => void toggle()}>
              {poll.isActive ? "اقفل الاستطلاع" : "شغّل الاستطلاع"}
            </Button>
          </>
        }
      />

      <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 180px), 1fr))" }}>
        <Stat label="إجمالي الأصوات" value={fmtNum(total)} icon={<Users size={16} />} />
        <Stat
          label="الأكثر اختياراً"
          value={leader ? (tie ? "تعادل" : leader.text) : "—"}
          sub={leader ? `${fmtNum(leader._count.votes)} صوت · ${fmtNum(pct(leader._count.votes, total))}٪` : undefined}
          icon={<BarChart3 size={16} />}
        />
        <Stat label="الحالة" value={poll.isActive ? "شغال" : "مقفول"} tone={poll.isActive ? "ok" : "neutral"} icon={<Vote size={16} />} />
      </div>

      <Panel title="النتائج" icon={<BarChart3 size={16} />}>
        {total === 0 ? (
          <EmptyState title="مفيش أصوات لسه" text={poll.isActive ? "الطلاب هيشوفوا الاستطلاع خلال دقيقتين من تشغيله." : "شغّل الاستطلاع عشان يظهر للطلاب."} />
        ) : (
          <>
            <p className="text-xs adm-muted mb-3">دوس على أي عمود عشان تشوف مين اختاره بس.</p>
            <ul className="flex flex-col gap-3" role="list">
              {poll.options.map((o) => {
                const n = o._count.votes;
                const dim = filter !== null && filter !== o.id;
                return (
                  <li key={o.id}>
                    <button
                      type="button"
                      onClick={() => setFilter(filter === o.id ? null : o.id)}
                      aria-pressed={filter === o.id}
                      title={`${o.text}: ${fmtNum(n)} صوت (${fmtNum(pct(n, total))}٪)`}
                      className="w-full text-right cursor-pointer rounded-lg p-1 -m-1 transition-opacity hover:bg-[var(--surface-2)]"
                      style={{ opacity: dim ? 0.45 : 1 }}
                    >
                      <div className="flex items-baseline justify-between gap-3 text-sm mb-1.5">
                        <span className="font-bold truncate">{o.text}</span>
                        <span className="adm-num shrink-0" style={{ color: "var(--ink-2)" }}>
                          {fmtNum(n)} · <b style={{ color: "var(--ink)" }}>{fmtNum(pct(n, total))}٪</b>
                        </span>
                      </div>
                      <div className="h-5 w-full rounded-[4px]" style={{ background: "var(--surface-2)" }}>
                        <div
                          className="h-full"
                          style={{
                            width: `${(n / max) * 100}%`,
                            minWidth: n ? 4 : 0,
                            background: "var(--brand)",
                            borderStartEndRadius: 4,
                            borderEndEndRadius: 4,
                            transition: "width .4s ease",
                          }}
                        />
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </Panel>

      <Panel
        padded={false}
        title={filter ? `اللي اختاروا "${optionText.get(filter)}" (${fmtNum(voters.length)})` : `مين اختار إيه (${fmtNum(voters.length)})`}
        icon={<Users size={16} />}
        actions={
          <div className="flex items-center gap-2">
            {filter && <Button size="sm" variant="ghost" onClick={() => setFilter(null)}>عرض الكل</Button>}
            <SearchInput value={q} onChange={setQ} placeholder="اسم أو رقم" inputSize="sm" />
          </div>
        }
      >
        {voters.length === 0 ? (
          <EmptyState title={total ? "مفيش نتايج للبحث ده" : "مفيش أصوات لسه"} />
        ) : (
          <div className="adm-table-wrap">
            <table className="adm-table" style={{ minWidth: 640 }}>
              <thead>
                <tr>
                  <th>الطالب</th>
                  <th>الموبايل</th>
                  <th>الصف</th>
                  <th>اختار</th>
                  <th>الوقت</th>
                </tr>
              </thead>
              <tbody>
                {voters.map((v) => (
                  <tr key={v.id}>
                    <td className="font-bold">{v.student.name}</td>
                    <td className="adm-num" dir="ltr" style={{ textAlign: "right" }}>{v.student.phone || "—"}</td>
                    <td>{v.student.educationalStage ? stageLabel(v.student.educationalStage) : "—"}</td>
                    <td><Badge tone="brand">{optionText.get(v.optionId) ?? "—"}</Badge></td>
                    <td className="adm-muted">{fmtDateTime(v.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}
