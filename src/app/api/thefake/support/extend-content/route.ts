import { NextRequest, NextResponse } from "next/server";
import { ContentType } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";
import { ContentType as GraphContentType, restartQuizClockForSupportReopen, syncHomeworkContentProgress } from "@/lib/content-access-engine";
import { getSupportSession, logSupportAction } from "@/lib/support-auth";

const ASSESSMENT_TYPES = new Set<string>([
  ContentType.QUIZ,
  ContentType.HOMEWORK,
  ContentType.EXAM,
]);

async function resolveOrCreateContentItem(input: {
  contentId?: string;
  sourceId?: string;
  contentType?: string;
}) {
  if (input.contentId) {
    const existing = await prisma.contentItem.findUnique({
      where: { id: input.contentId },
      select: { id: true, title: true, type: true, sourceId: true },
    });
    if (existing) return existing;
  }

  const sourceId = String(input.sourceId || "").trim();
  const typeRaw = String(input.contentType || "").trim().toUpperCase();
  if (!sourceId || !ASSESSMENT_TYPES.has(typeRaw)) return null;

  const type = typeRaw as ContentType;
  if (type === ContentType.QUIZ || type === ContentType.EXAM) {
    const quiz = await prisma.quiz.findUnique({
      where: { id: sourceId },
      select: { id: true, title: true },
    });
    if (quiz) {
      return prisma.contentItem.upsert({
        where: { type_sourceId: { type: ContentType.QUIZ, sourceId: quiz.id } },
        create: { type: ContentType.QUIZ, sourceId: quiz.id, title: quiz.title },
        update: { title: quiz.title },
        select: { id: true, title: true, type: true, sourceId: true },
      });
    }
  }

  const homework = await prisma.homework.findUnique({
    where: { id: sourceId },
    select: { id: true, title: true },
  });
  if (!homework) return null;
  return prisma.contentItem.upsert({
    where: { type_sourceId: { type: ContentType.HOMEWORK, sourceId: homework.id } },
    create: { type: ContentType.HOMEWORK, sourceId: homework.id, title: homework.title },
    update: { title: homework.title },
    select: { id: true, title: true, type: true, sourceId: true },
  });
}

/** Students who already submitted can start again for the reopen window. */
async function grantSubmittedRetake(
  item: { sourceId: string; type: ContentType; title: string },
  studentId: string | null
): Promise<number> {
  if (item.type === ContentType.QUIZ || item.type === ContentType.EXAM) {
    const updated = await prisma.quizResult.updateMany({
      where: {
        quizId: item.sourceId,
        completedAt: { not: null },
        ...(studentId ? { studentId } : {}),
      },
      data: { allowRetake: true },
    });
    return updated.count;
  }

  if (item.type !== ContentType.HOMEWORK) return 0;

  const submissions = await prisma.homeworkSubmission.findMany({
    where: {
      homeworkId: item.sourceId,
      ...(studentId ? { studentId } : {}),
      OR: [{ completedAt: { not: null } }, { score: { not: null } }],
    },
    select: { id: true, studentId: true, status: true, score: true, fileUrl: true },
  });
  if (submissions.length === 0) return 0;

  await prisma.homeworkSubmission.updateMany({
    where: { id: { in: submissions.map((row) => row.id) } },
    data: { allowRetake: true },
  });
  // Same rule as the teacher retake: a reopened exam gets a fresh order.
  await prisma.homeworkExamView.deleteMany({
    where: { homeworkId: item.sourceId, studentId: { in: submissions.map((row) => row.studentId) } },
  });

  for (const row of submissions) {
    await syncHomeworkContentProgress(
      row.studentId,
      { type: GraphContentType.HOMEWORK, sourceId: item.sourceId, title: item.title },
      row.status,
      { score: row.score, allowRetake: true, hasUploadedFile: Boolean(row.fileUrl) }
    );
  }
  return submissions.length;
}

function serializeExtension(row: {
  id: string;
  contentId: string;
  studentId: string | null;
  extendedUntil: Date;
  reason: string | null;
  supportId: string;
  createdAt: Date;
  content?: { title: string; sourceId: string; type: ContentType };
  student?: { name: string } | null;
}) {
  return {
    id: row.id,
    contentId: row.contentId,
    studentId: row.studentId,
    extendedUntil: row.extendedUntil,
    reason: row.reason,
    supportId: row.supportId,
    createdAt: row.createdAt,
    title: row.content?.title ?? null,
    sourceId: row.content?.sourceId ?? null,
    contentType: row.content?.type ?? null,
    studentName: row.student?.name ?? null,
    scope: row.studentId ? "student" : "all",
  };
}

/** GET /api/thefake/support/extend-content — active reopen windows */
export async function GET(req: NextRequest) {
  const support = await getSupportSession();
  if (!support) return NextResponse.json({ error: "غير مصرح" }, { status: 401 });

  const studentId = req.nextUrl.searchParams.get("studentId")?.trim() || "";
  const contentId = req.nextUrl.searchParams.get("contentId")?.trim() || "";
  const now = new Date();

  const rows = await prisma.contentExtension.findMany({
    where: {
      revokedAt: null,
      extendedUntil: { gte: now },
      ...(contentId ? { contentId } : {}),
      ...(studentId
        ? { OR: [{ studentId }, { studentId: null }] }
        : {}),
    },
    include: {
      content: { select: { title: true, sourceId: true, type: true } },
      student: { select: { name: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 80,
  });

  return NextResponse.json({ extensions: rows.map(serializeExtension) });
}

/**
 * POST /api/thefake/support/extend-content
 * Body: { contentId? | sourceId+contentType, studentId? | "ALL", extendedUntil, reason }
 */
export async function POST(req: NextRequest) {
  const support = await getSupportSession();
  if (!support) return NextResponse.json({ error: "غير مصرح" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as {
    contentId?: string;
    sourceId?: string;
    contentType?: string;
    studentId?: string | null;
    extendedUntil?: string;
    reason?: string;
  };

  const item = await resolveOrCreateContentItem({
    contentId: String(body.contentId || "").trim() || undefined,
    sourceId: String(body.sourceId || "").trim() || undefined,
    contentType: String(body.contentType || "").trim() || undefined,
  });
  if (!item) {
    return NextResponse.json({ error: "المحتوى غير موجود. اختر اختباراً أو واجباً." }, { status: 400 });
  }

  const rawStudent = body.studentId == null ? "" : String(body.studentId).trim();
  const forAll = !rawStudent || rawStudent.toUpperCase() === "ALL";
  let studentId: string | null = null;
  let studentName = "كل الطلاب";
  if (!forAll) {
    const student = await prisma.user.findFirst({
      where: { id: rawStudent, role: "student", isDeleted: false },
      select: { id: true, name: true },
    });
    if (!student) return NextResponse.json({ error: "الطالب غير موجود" }, { status: 404 });
    studentId = student.id;
    studentName = student.name;
  }

  const until = body.extendedUntil ? new Date(body.extendedUntil) : null;
  if (!until || Number.isNaN(until.getTime())) {
    return NextResponse.json({ error: "حدد وقت التمديد" }, { status: 400 });
  }
  if (until.getTime() <= Date.now()) {
    return NextResponse.json({ error: "وقت التمديد يجب أن يكون في المستقبل" }, { status: 400 });
  }

  const reason = String(body.reason || "").trim().slice(0, 500);
  if (!reason) {
    return NextResponse.json({ error: "سبب إعادة الفتح مطلوب" }, { status: 400 });
  }

  const created = await prisma.contentExtension.create({
    data: {
      contentId: item.id,
      studentId,
      extendedUntil: until,
      reason,
      supportId: support.agent,
    },
    include: {
      content: { select: { title: true, sourceId: true, type: true } },
      student: { select: { name: true } },
    },
  });

  const retakeGranted = await grantSubmittedRetake(item, studentId);
  const clockRestarted =
    item.type === ContentType.QUIZ || item.type === ContentType.EXAM
      ? await restartQuizClockForSupportReopen(item.sourceId, studentId)
      : 0;

  await logSupportAction({
    action: "SUPPORT_EXTEND_CONTENT",
    targetType: studentId ? "student" : "content",
    targetId: studentId ?? item.id,
    targetName: `${studentName} — ${item.title}`,
    metadata: {
      agent: support.agent,
      contentId: item.id,
      sourceId: item.sourceId,
      contentType: item.type,
      extendedUntil: until.toISOString(),
      reason,
      scope: studentId ? "student" : "all",
      retakeGranted,
      clockRestarted,
    },
  });

  return NextResponse.json({ ok: true, extension: serializeExtension(created), retakeGranted }, { status: 201 });
}

/** DELETE /api/thefake/support/extend-content?id= */
export async function DELETE(req: NextRequest) {
  const support = await getSupportSession();
  if (!support) return NextResponse.json({ error: "غير مصرح" }, { status: 401 });

  const id = req.nextUrl.searchParams.get("id")?.trim() || "";
  if (!id) return NextResponse.json({ error: "معرّف التمديد مطلوب" }, { status: 400 });

  const existing = await prisma.contentExtension.findUnique({
    where: { id },
    include: { content: { select: { title: true } }, student: { select: { name: true } } },
  });
  if (!existing || existing.revokedAt) {
    return NextResponse.json({ error: "التمديد غير موجود" }, { status: 404 });
  }

  await prisma.contentExtension.update({
    where: { id },
    data: { revokedAt: new Date() },
  });

  await logSupportAction({
    action: "SUPPORT_REVOKE_CONTENT_EXTENSION",
    targetType: existing.studentId ? "student" : "content",
    targetId: existing.studentId ?? existing.contentId,
    targetName: `${existing.student?.name ?? "كل الطلاب"} — ${existing.content.title}`,
    metadata: { agent: support.agent, extensionId: id },
  });

  return NextResponse.json({ ok: true });
}
