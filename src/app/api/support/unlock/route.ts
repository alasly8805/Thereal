import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ContentType } from "@/generated/prisma";
import { getSupportSession, logSupportAction } from "@/lib/support-auth";

const VALID_TYPES = Object.values(ContentType) as string[];

/**
 * Resolves the human title of the thing being unlocked, so the audit log and
 * the panel list read as "الدرس الثالث" rather than a cuid.
 */
async function titleOf(contentType: ContentType, sourceId: string): Promise<string | null> {
  if (contentType === ContentType.VIDEO || contentType === ContentType.SOLUTION_VIDEO) {
    const v = await prisma.video.findUnique({ where: { id: sourceId }, select: { title: true } });
    return v?.title ?? null;
  }
  if (contentType === ContentType.QUIZ || contentType === ContentType.EXAM) {
    const q = await prisma.quiz.findUnique({ where: { id: sourceId }, select: { title: true } });
    if (q) return q.title;
  }
  if (contentType === ContentType.HOMEWORK || contentType === ContentType.EXAM) {
    const h = await prisma.homework.findUnique({ where: { id: sourceId }, select: { title: true } });
    return h?.title ?? null;
  }
  return null;
}

/**
 * POST /api/support/unlock
 * Body: { studentId, contentType, sourceId, reason?, expiresInDays? }
 *
 * Opens ONE item for ONE student past the prerequisite graph — the fix for
 * "the homework closed and now the next lesson won't open".
 *
 * It writes an override row instead of faking a HomeworkSubmission. A fake
 * submission would show up as a real attempt in the student's grades, in the
 * teacher's completion stats and in the leaderboard; the student would appear
 * to have done work they never did. An override records the truth: the work is
 * still outstanding, support decided it should not block this one item.
 *
 * The bypass covers the prerequisite gate only. Enrollment, ownership and
 * payment checks are separate and untouched, so this can never hand a student
 * content nobody paid for.
 */
export async function POST(req: NextRequest) {
  const support = await getSupportSession();
  if (!support) return NextResponse.json({ error: "غير مصرح" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as {
    studentId?: string;
    contentType?: string;
    sourceId?: string;
    reason?: string;
    expiresInDays?: number | null;
  };

  const studentId = String(body.studentId || "").trim();
  const sourceId = String(body.sourceId || "").trim();
  const contentTypeRaw = String(body.contentType || "").trim().toUpperCase();
  const reason = String(body.reason || "").trim().slice(0, 500);

  if (!studentId || !sourceId) {
    return NextResponse.json({ error: "معرّف الطالب والمحتوى مطلوبان" }, { status: 400 });
  }
  if (!VALID_TYPES.includes(contentTypeRaw)) {
    return NextResponse.json(
      { error: `نوع المحتوى غير صالح. المسموح: ${VALID_TYPES.join(", ")}` },
      { status: 400 }
    );
  }
  const contentType = contentTypeRaw as ContentType;

  let expiresAt: Date | null = null;
  if (body.expiresInDays !== null && body.expiresInDays !== undefined && body.expiresInDays !== 0) {
    const days = Number(body.expiresInDays);
    if (!Number.isFinite(days) || days < 1 || days > 365) {
      return NextResponse.json({ error: "مدة الصلاحية يجب أن تكون بين 1 و 365 يوماً" }, { status: 400 });
    }
    expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  }

  const student = await prisma.user.findFirst({
    where: { id: studentId, role: "student", isDeleted: false },
    select: { id: true, name: true },
  });
  if (!student) return NextResponse.json({ error: "الطالب غير موجود" }, { status: 404 });

  const contentTitle = await titleOf(contentType, sourceId);
  if (!contentTitle) {
    return NextResponse.json(
      { error: "المحتوى غير موجود — تأكد من اختيار النوع الصحيح" },
      { status: 404 }
    );
  }

  try {
    // Re-unlocking an item support previously revoked must revive it, hence the
    // upsert clearing revokedAt rather than a bare create.
    const override = await prisma.contentAccessOverride.upsert({
      where: {
        studentId_contentType_sourceId: { studentId, contentType, sourceId },
      },
      create: {
        studentId,
        contentType,
        sourceId,
        reason: reason || null,
        grantedById: "support-panel",
        grantedByName: `دعم فني (${support.agent})`,
        expiresAt,
      },
      update: {
        reason: reason || null,
        grantedByName: `دعم فني (${support.agent})`,
        expiresAt,
        revokedAt: null,
        revokedByName: null,
      },
    });

    await logSupportAction({
      action: "SUPPORT_UNLOCK_CONTENT",
      targetType: "student",
      targetId: studentId,
      targetName: `${student.name} — ${contentTitle}`,
      metadata: {
        agent: support.agent,
        contentType,
        sourceId,
        contentTitle,
        reason: reason || null,
        expiresAt: expiresAt?.toISOString() ?? null,
      },
    });

    return NextResponse.json({ ok: true, override: { ...override, contentTitle } });
  } catch (err) {
    console.error("support unlock failed:", err);
    return NextResponse.json({ error: "تعذر فتح المحتوى" }, { status: 500 });
  }
}

/**
 * DELETE /api/support/unlock?id=...
 * Takes the bypass back. Soft: the row stays so the audit trail survives.
 */
export async function DELETE(req: NextRequest) {
  const support = await getSupportSession();
  if (!support) return NextResponse.json({ error: "غير مصرح" }, { status: 401 });

  const id = req.nextUrl.searchParams.get("id")?.trim();
  if (!id) return NextResponse.json({ error: "معرّف الاستثناء مطلوب" }, { status: 400 });

  const existing = await prisma.contentAccessOverride.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "الاستثناء غير موجود" }, { status: 404 });

  await prisma.contentAccessOverride.update({
    where: { id },
    data: { revokedAt: new Date(), revokedByName: `دعم فني (${support.agent})` },
  });

  await logSupportAction({
    action: "SUPPORT_REVOKE_CONTENT_UNLOCK",
    targetType: "student",
    targetId: existing.studentId,
    targetName: `${existing.contentType} ${existing.sourceId}`,
    metadata: { agent: support.agent, overrideId: id },
  });

  return NextResponse.json({ ok: true });
}
