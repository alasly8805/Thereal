import { createHash, createHmac, timingSafeEqual } from "crypto";
import { Prisma } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";
import { acquireAdvisoryLock } from "@/lib/distributed-lock";
import { PASS_MARK } from "@/lib/quiz-grading";
import type { CopilotProposal, ToolResult } from "./types";

const studentWhere = {
  role: "student" as const,
  isDeleted: false,
  accountMode: { not: "TESTER" as const },
};

const PROPOSAL_TTL_MS = 15 * 60 * 1000;
const ADD_LIMIT = 10_000;
const SET_LIMIT = 1_000_000;

type StudentHit = { id: string; name: string; phone: string | null; email: string; points: number };

type PointsBody = {
  v: 1;
  kind: "points";
  studentId: string;
  mode: "add" | "set";
  amount: number;
  exp: number;
};

type GradeBody = {
  v: 1;
  kind: "grade";
  studentId: string;
  target: "quiz" | "homework";
  targetId: string;
  score: number;
  exp: number;
};

type ProposalBody = PointsBody | GradeBody;

function secret(): string {
  const value = process.env.JWT_SECRET;
  if (!value) throw new Error("JWT_SECRET missing");
  return value;
}

function signProposal(body: ProposalBody): string {
  const payload = Buffer.from(JSON.stringify(body)).toString("base64url");
  const sig = createHmac("sha256", secret()).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

function readProposal(token: string): ProposalBody {
  const dot = token.indexOf(".");
  if (dot <= 0) throw new Error("bad");
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = createHmac("sha256", secret()).update(payload).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw new Error("bad");
  const body = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as ProposalBody;
  if (!body || body.v !== 1 || typeof body.exp !== "number" || body.exp < Date.now()) throw new Error("expired");
  if (body.kind !== "points" && body.kind !== "grade") throw new Error("bad");
  return body;
}

function digitsOnly(s: string): string {
  return s.replace(/\D/g, "");
}

function fmtScore(n: number): string {
  const rounded = Math.round(n * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2);
}

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" ? (v as Record<string, unknown>) : {};
}

function str(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

async function findStudents(query: string): Promise<StudentHit[]> {
  const q = query.trim();
  if (!q) return [];
  const phone = digitsOnly(q);
  const rows = await prisma.user.findMany({
    where: {
      ...studentWhere,
      OR: [
        { id: q },
        { name: { equals: q, mode: "insensitive" } },
        { email: { equals: q, mode: "insensitive" } },
        ...(phone.length >= 8 ? [{ phone: { contains: phone } }] : []),
        { name: { contains: q, mode: "insensitive" } },
      ],
    },
    select: { id: true, name: true, phone: true, email: true, points: true },
    take: 8,
  });
  const exact = rows.filter(
    (s) => s.id === q || s.name.toLowerCase() === q.toLowerCase() || s.email.toLowerCase() === q.toLowerCase()
  );
  return exact.length === 1 ? exact : rows;
}

function ambiguous(query: string, students: StudentHit[]): ToolResult {
  if (!students.length) {
    return { ok: false, summary: `لا يوجد طالب مطابق لـ «${query}».`, data: { students: [] } };
  }
  return {
    ok: false,
    summary: `وُجد ${students.length} طلاب مطابقون لـ «${query}». اسأل المشرف أيهم، ولا تختر أنت.`,
    data: {
      students: students.map((s) => ({ id: s.id, name: s.name, phone: s.phone, points: s.points })),
    },
    tables: [
      {
        id: "student-choice",
        title: "اختَر طالباً واحداً",
        columns: ["الاسم", "الهاتف", "النقاط", "المعرّف"],
        rows: students.map((s) => [s.name, s.phone || "—", String(s.points), s.id]),
      },
    ],
  };
}

export async function listStudentGrades(args: { query?: string }): Promise<ToolResult> {
  const query = (args.query || "").trim();
  if (query.length < 2) return { ok: false, summary: "حدد الطالب بالاسم أو الهاتف أو المعرّف.", data: null };
  const students = await findStudents(query);
  if (students.length !== 1) return ambiguous(query, students);
  const student = students[0];

  const [quizzes, homeworks] = await Promise.all([
    prisma.quizResult.findMany({
      where: { studentId: student.id, completedAt: { not: null } },
      orderBy: { completedAt: "desc" },
      take: 8,
      select: {
        quizId: true,
        score: true,
        totalQ: true,
        completedAt: true,
        quiz: { select: { title: true } },
      },
    }),
    prisma.homeworkSubmission.findMany({
      where: { studentId: student.id },
      orderBy: { completedAt: "desc" },
      take: 8,
      select: {
        homeworkId: true,
        score: true,
        status: true,
        completedAt: true,
        homework: { select: { title: true } },
      },
    }),
  ]);

  return {
    ok: true,
    summary: `${student.name}: ${student.points} نقطة، ${quizzes.length} اختبار مسلَّم، ${homeworks.length} واجب.`,
    data: {
      student: { id: student.id, name: student.name, phone: student.phone, points: student.points },
      quizzes: quizzes.map((q) => ({
        targetId: q.quizId,
        title: q.quiz.title,
        scorePercent: q.score,
        completedAt: q.completedAt?.toISOString() || null,
      })),
      homeworks: homeworks.map((h) => ({
        targetId: h.homeworkId,
        title: h.homework.title,
        scorePercent: h.score,
        status: h.status,
        completedAt: h.completedAt.toISOString(),
      })),
    },
    kpis: [{ key: "points", label: "نقاط لوحة الشرف", value: String(student.points), tone: "gold" }],
    tables: [
      {
        id: "grades",
        title: `درجات ${student.name}`,
        columns: ["النوع", "العنوان", "الدرجة ٪", "المعرّف"],
        rows: [
          ...quizzes.map((q) => ["اختبار", q.quiz.title, fmtScore(q.score), q.quizId]),
          ...homeworks.map((h) => ["واجب", h.homework.title, h.score == null ? "—" : fmtScore(h.score), h.homeworkId]),
        ],
      },
    ],
  };
}

function wholeAmount(v: unknown): number | null {
  if (typeof v === "number" && Number.isInteger(v)) return v;
  if (typeof v === "string" && /^-?\d+$/.test(v.trim())) return Number(v.trim());
  return null;
}

export async function proposePointsChange(raw: unknown): Promise<ToolResult> {
  const args = asRecord(raw);
  const query = str(args.query) || "";
  const mode = args.mode === "add" || args.mode === "set" ? args.mode : null;
  const amount = wholeAmount(args.amount);
  if (!query || !mode || amount == null) {
    return { ok: false, summary: "يلزم طالب، ونوع التعديل add أو set، وعدد نقاط صحيح.", data: null };
  }
  if (mode === "add" && (amount === 0 || Math.abs(amount) > ADD_LIMIT)) {
    return { ok: false, summary: `الزيادة أو الخصم يجب أن يكون بين 1 و ${ADD_LIMIT} نقطة.`, data: null };
  }
  if (mode === "set" && (amount < 0 || amount > SET_LIMIT)) {
    return { ok: false, summary: `النقاط الجديدة يجب أن تكون بين 0 و ${SET_LIMIT}.`, data: null };
  }

  const students = await findStudents(query);
  if (students.length !== 1) return ambiguous(query, students);
  const student = students[0];
  const after = mode === "set" ? amount : Math.max(0, student.points + amount);
  const verb = mode === "set" ? "تعيين النقاط إلى" : amount > 0 ? "زيادة النقاط بمقدار" : "خصم نقاط بمقدار";
  const proposal: CopilotProposal = {
    token: signProposal({
      v: 1,
      kind: "points",
      studentId: student.id,
      mode,
      amount,
      exp: Date.now() + PROPOSAL_TTL_MS,
    }),
    title: `${verb} ${Math.abs(amount)} — ${student.name}`,
    detail: "لن يتغيّر شيء حتى تضغط تأكيد. هذا يعدّل نقاط لوحة الشرف فقط.",
    before: `${student.points} نقطة`,
    after: `${after} نقطة`,
  };
  return {
    ok: true,
    summary: `اقتراح جاهز ولم يُحفظ: ${student.name} من ${student.points} إلى ${after} نقطة. أخبر المشرف أن يضغط تأكيد.`,
    data: { awaitingConfirm: true, studentId: student.id, name: student.name, before: student.points, after },
    proposal,
  };
}

export async function proposeGradeChange(raw: unknown): Promise<ToolResult> {
  const args = asRecord(raw);
  const query = str(args.query) || "";
  const kind = args.kind === "quiz" || args.kind === "homework" ? args.kind : null;
  const scoreRaw = typeof args.score === "number" ? args.score : typeof args.score === "string" ? Number(args.score) : NaN;
  const targetId = str(args.targetId);
  const title = str(args.title);
  const latest = args.which === "latest";
  if (!query || !kind || !Number.isFinite(scoreRaw) || scoreRaw < 0 || scoreRaw > 100) {
    return { ok: false, summary: "يلزم طالب، ونوع quiz أو homework، ودرجة من 0 إلى 100.", data: null };
  }
  const score = Math.round(scoreRaw * 100) / 100;
  const students = await findStudents(query);
  if (students.length !== 1) return ambiguous(query, students);
  const student = students[0];

  if (kind === "quiz") return proposeQuiz(student, score, { targetId, title, latest });
  return proposeHomework(student, score, { targetId, title, latest });
}

async function proposeQuiz(
  student: StudentHit,
  score: number,
  pick: { targetId?: string; title?: string; latest: boolean }
): Promise<ToolResult> {
  const rows = await prisma.quizResult.findMany({
    where: {
      studentId: student.id,
      completedAt: { not: null },
      ...(pick.targetId ? { quizId: pick.targetId } : {}),
      ...(pick.title && !pick.targetId
        ? { quiz: { title: { contains: pick.title, mode: "insensitive" } } }
        : {}),
    },
    orderBy: { completedAt: "desc" },
    take: pick.targetId || pick.latest ? 1 : 8,
    select: { quizId: true, score: true, quiz: { select: { title: true } } },
  });
  if (!pick.targetId && !pick.title && !pick.latest) {
    return {
      ok: false,
      summary: "حدد الاختبار بـ targetId من list_student_grades، أو قل آخر امتحان.",
      data: { quizzes: rows.map((r) => ({ targetId: r.quizId, title: r.quiz.title, score: r.score })) },
    };
  }
  if (rows.length !== 1) {
    return {
      ok: false,
      summary: rows.length
        ? `أكثر من اختبار يطابق. اسأل أيها. لا تختر أنت.`
        : `${student.name} ليس لديه اختبار مسلَّم بهذا الوصف. لا تُنشئ محاولة جديدة.`,
      data: { quizzes: rows.map((r) => ({ targetId: r.quizId, title: r.quiz.title, score: r.score })) },
      tables: rows.length
        ? [
            {
              id: "quiz-choice",
              title: "اختَر الاختبار",
              columns: ["العنوان", "الدرجة الحالية ٪", "المعرّف"],
              rows: rows.map((r) => [r.quiz.title, fmtScore(r.score), r.quizId]),
            },
          ]
        : [],
    };
  }
  const row = rows[0];
  const proposal: CopilotProposal = {
    token: signProposal({
      v: 1,
      kind: "grade",
      studentId: student.id,
      target: "quiz",
      targetId: row.quizId,
      score,
      exp: Date.now() + PROPOSAL_TTL_MS,
    }),
    title: `درجة اختبار «${row.quiz.title}» — ${student.name}`,
    detail: "النسبة الرسمية فقط. إجابات الأسئلة تبقى كما سلّمها الطالب. لا تُمنح نقاط إضافية بسبب هذه الدرجة.",
    before: `${fmtScore(row.score)}٪`,
    after: `${fmtScore(score)}٪`,
  };
  return {
    ok: true,
    summary: `اقتراح جاهز ولم يُحفظ: ${student.name} / ${row.quiz.title} من ${fmtScore(row.score)}٪ إلى ${fmtScore(score)}٪. اطلب ضغط تأكيد.`,
    data: { awaitingConfirm: true, studentId: student.id, quizId: row.quizId, title: row.quiz.title },
    proposal,
  };
}

async function proposeHomework(
  student: StudentHit,
  score: number,
  pick: { targetId?: string; title?: string; latest: boolean }
): Promise<ToolResult> {
  const rows = await prisma.homeworkSubmission.findMany({
    where: {
      studentId: student.id,
      ...(pick.targetId ? { homeworkId: pick.targetId } : {}),
      ...(pick.title && !pick.targetId
        ? { homework: { title: { contains: pick.title, mode: "insensitive" } } }
        : {}),
    },
    orderBy: { completedAt: "desc" },
    take: pick.targetId || pick.latest ? 1 : 8,
    select: { homeworkId: true, score: true, status: true, homework: { select: { title: true } } },
  });
  if (!pick.targetId && !pick.title && !pick.latest) {
    return {
      ok: false,
      summary: "حدد الواجب بـ targetId من list_student_grades، أو قل آخر واجب.",
      data: { homeworks: rows.map((r) => ({ targetId: r.homeworkId, title: r.homework.title, score: r.score })) },
    };
  }
  if (rows.length !== 1) {
    return {
      ok: false,
      summary: rows.length
        ? "أكثر من واجب يطابق. اسأل أيها. لا تختر أنت."
        : `${student.name} ليس لديه واجب بهذا الوصف.`,
      data: { homeworks: rows.map((r) => ({ targetId: r.homeworkId, title: r.homework.title, score: r.score })) },
      tables: rows.length
        ? [
            {
              id: "hw-choice",
              title: "اختَر الواجب",
              columns: ["العنوان", "الدرجة الحالية ٪", "المعرّف"],
              rows: rows.map((r) => [r.homework.title, r.score == null ? "—" : fmtScore(r.score), r.homeworkId]),
            },
          ]
        : [],
    };
  }
  const row = rows[0];
  const statusNote =
    row.status === "passed" || row.status === "failed"
      ? score >= PASS_MARK
        ? " حالة الواجب ستصبح ناجح إذا كانت 50٪ أو أكثر."
        : " حالة الواجب ستصبح راسب لأن الدرجة أقل من 50٪."
      : " حالة المراجعة الحالية لن تتغيّر.";
  const proposal: CopilotProposal = {
    token: signProposal({
      v: 1,
      kind: "grade",
      studentId: student.id,
      target: "homework",
      targetId: row.homeworkId,
      score,
      exp: Date.now() + PROPOSAL_TTL_MS,
    }),
    title: `درجة واجب «${row.homework.title}» — ${student.name}`,
    detail: `النسبة المحفوظة وحالة النجاح/الرسوب.${statusNote} مسار الدروس التالية لا يُقفل ولا يُفتح من هنا.`,
    before: row.score == null ? "بدون درجة" : `${fmtScore(row.score)}٪`,
    after: `${fmtScore(score)}٪`,
  };
  return {
    ok: true,
    summary: `اقتراح جاهز ولم يُحفظ: ${student.name} / ${row.homework.title} إلى ${fmtScore(score)}٪. اطلب ضغط تأكيد.`,
    data: { awaitingConfirm: true, studentId: student.id, homeworkId: row.homeworkId, title: row.homework.title },
    proposal,
  };
}

export async function applyCopilotAction(params: {
  token: string;
  adminId: string;
  adminName: string;
}): Promise<{ ok: true; summary: string } | { ok: false; error: string }> {
  let body: ProposalBody;
  try {
    body = readProposal(params.token);
  } catch (err) {
    const expired = err instanceof Error && err.message === "expired";
    return { ok: false, error: expired ? "انتهت صلاحية التأكيد. اطلب التغيير من المساعد مرة أخرى." : "التأكيد غير صالح." };
  }

  const tokenHash = createHash("sha256").update(params.token).digest("hex");
  try {
    const summary = await prisma.$transaction(async (tx) => {
      await acquireAdvisoryLock(`copilot-apply:${tokenHash}`, tx);
      const dup = await tx.activityLog.findFirst({
        where: {
          action: { in: ["COPILOT_ADJUST_POINTS", "COPILOT_SET_GRADE"] },
          metadata: { contains: tokenHash },
        },
        select: { id: true },
      });
      if (dup) throw new Error("DUP");

      const applied =
        body.kind === "points"
          ? await applyPoints(tx, body)
          : await applyGrade(tx, body);

      await tx.activityLog.create({
        data: {
          adminId: params.adminId,
          adminName: params.adminName,
          action: body.kind === "points" ? "COPILOT_ADJUST_POINTS" : "COPILOT_SET_GRADE",
          targetType: "student",
          targetId: body.studentId,
          targetName: applied.targetName,
          metadata: JSON.stringify({ tokenHash, ...applied.meta }),
        },
      });
      return applied.summary;
    });
    console.log(
      JSON.stringify({
        event: "admin_action",
        action: body.kind === "points" ? "COPILOT_ADJUST_POINTS" : "COPILOT_SET_GRADE",
        adminId: params.adminId,
        targetId: body.studentId,
        timestamp: new Date().toISOString(),
      })
    );
    return { ok: true, summary };
  } catch (err) {
    if (err instanceof Error && err.message === "DUP") {
      return { ok: false, error: "هذا التغيير اتطبّق قبل كده." };
    }
    if (err instanceof Error && err.message.startsWith("NO:")) {
      return { ok: false, error: err.message.slice(3) };
    }
    console.error("[copilot-apply]", err);
    return { ok: false, error: "تعذر حفظ التغيير." };
  }
}

async function applyPoints(
  tx: Prisma.TransactionClient,
  body: PointsBody
): Promise<{ summary: string; targetName: string; meta: Record<string, unknown> }> {
  const student = await tx.user.findFirst({
    where: { id: body.studentId, ...studentWhere },
    select: { id: true, name: true, points: true },
  });
  if (!student) throw new Error("NO:الطالب غير موجود.");
  if (body.mode !== "add" && body.mode !== "set") throw new Error("NO:التأكيد غير صالح.");
  if (!Number.isInteger(body.amount)) throw new Error("NO:التأكيد غير صالح.");
  const after = body.mode === "set" ? body.amount : Math.max(0, student.points + body.amount);
  if (after < 0 || after > SET_LIMIT) throw new Error("NO:النقاط الناتجة خارج الحد المسموح.");
  await tx.user.update({
    where: { id: student.id },
    data: { points: after, pointsUpdatedAt: new Date() },
  });
  return {
    targetName: student.name,
    summary: `تم حفظ نقاط ${student.name}: ${student.points} ← ${after}.`,
    meta: { mode: body.mode, amount: body.amount, before: student.points, after },
  };
}

async function applyGrade(
  tx: Prisma.TransactionClient,
  body: GradeBody
): Promise<{ summary: string; targetName: string; meta: Record<string, unknown> }> {
  if (!Number.isFinite(body.score) || body.score < 0 || body.score > 100) throw new Error("NO:الدرجة خارج 0–100.");
  const student = await tx.user.findFirst({
    where: { id: body.studentId, ...studentWhere },
    select: { name: true },
  });
  if (!student) throw new Error("NO:الطالب غير موجود.");

  if (body.target === "quiz") {
    const result = await tx.quizResult.findFirst({
      where: { studentId: body.studentId, quizId: body.targetId, completedAt: { not: null } },
      select: { id: true, score: true, quiz: { select: { title: true } } },
    });
    if (!result) throw new Error("NO:الاختبار المسلَّم لم يعد موجوداً.");
    await tx.quizResult.update({ where: { id: result.id }, data: { score: body.score } });
    const latest = await tx.quizAttempt.findFirst({
      where: { studentId: body.studentId, quizId: body.targetId },
      orderBy: { attemptNumber: "desc" },
      select: { id: true },
    });
    if (latest) {
      await tx.quizAttempt.update({ where: { id: latest.id }, data: { score: body.score } });
    }
    return {
      targetName: student.name,
      summary: `تم حفظ درجة ${student.name} في «${result.quiz.title}»: ${fmtScore(result.score)}٪ ← ${fmtScore(body.score)}٪.`,
      meta: { target: "quiz", quizId: body.targetId, before: result.score, after: body.score },
    };
  }

  const submission = await tx.homeworkSubmission.findFirst({
    where: { studentId: body.studentId, homeworkId: body.targetId },
    select: { id: true, score: true, status: true, homework: { select: { title: true } } },
  });
  if (!submission) throw new Error("NO:الواجب لم يعد موجوداً.");
  const nextStatus =
    submission.status === "passed" || submission.status === "failed"
      ? body.score >= PASS_MARK
        ? "passed"
        : "failed"
      : submission.status;
  await tx.homeworkSubmission.update({
    where: { id: submission.id },
    data: { score: body.score, status: nextStatus },
  });
  return {
    targetName: student.name,
    summary: `تم حفظ درجة ${student.name} في واجب «${submission.homework.title}»: ${fmtScore(body.score)}٪.`,
    meta: {
      target: "homework",
      homeworkId: body.targetId,
      before: submission.score,
      after: body.score,
      status: nextStatus,
    },
  };
}
