import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getConfigBool } from "@/lib/config";
import { evaluateTerminalWithAI } from "@/lib/ai-service";
import { checkHomeworkAccess } from "@/lib/authorization";
import path from "path";
import fs from "fs/promises";
import { blockSupportView } from "@/lib/support-auth";
import {
  canAccessContent,
  canReplaceRejectedHomeworkUpload,
  contentDeniedPayload,
  ContentType,
  HOMEWORK_REVIEW_REQUESTED_STATUS,
  syncHomeworkContentProgress,
} from "@/lib/content-access-engine";
import { scoreHomeworkExam } from "@/lib/homework-regrade";

/** Normalize output: collapse whitespace, trim lines, lowercase */
function normalizeOutput(s: string): string {
  return s
    .split("\n")
    .map((l) => l.trim().replace(/\s+/g, " "))
    .filter(Boolean)
    .join("\n")
    .toLowerCase();
}

/** POST /api/homework/[id]/submit */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  // Defence in depth behind the proxy guard: never let a support agent act as
  // the student on grades, progress or money.
  const supportBlocked = blockSupportView(session);
  if (supportBlocked) return supportBlocked;
  if (!session || session.role !== "student")
    return NextResponse.json({ error: "غير مصرح" }, { status: 403 });

  const { id: homeworkId } = await params;

  const hw = await prisma.homework.findUnique({
    where: { id: homeworkId },
    include: { questions: { orderBy: { order: "asc" } } },
  });

  if (!hw || !hw.isPublished)
    return NextResponse.json({ error: "الواجب غير موجود" }, { status: 404 });

  // Homework stays open by default (homework_deadline_disabled). dueAt remains
  // the date shown to the student and the one late-submission reporting uses;
  // this switch only decides whether the server hard-refuses a late submit.
  if (hw.dueAt && new Date() > hw.dueAt && !(await getConfigBool("homework_deadline_disabled"))) {
    return NextResponse.json({ error: "انتهى موعد تسليم الواجب" }, { status: 400 });
  }

  // Enforce enrollment validation
  const hasAccess = await checkHomeworkAccess(session.id, session.role, homeworkId);
  if (!hasAccess) {
    return NextResponse.json({ error: "غير مصرح لك بالوصول لهذا الواجب" }, { status: 403 });
  }

  const access = await canAccessContent(session.id, {
    type: ContentType.HOMEWORK,
    sourceId: homeworkId,
    title: hw.title,
  });
  const denied = contentDeniedPayload(access);
  if (denied) return NextResponse.json(denied.body, { status: denied.status });

  // One graded attempt unless the teacher/assistant reopened it.
  // The deadline never substitutes for this lock: a student who submits late
  // still gets a score, and cannot submit again without allowRetake.
  const existing = await prisma.homeworkSubmission.findUnique({
    where: { homeworkId_studentId: { homeworkId, studentId: session.id } },
    include: { review: { select: { id: true, verdict: true } } },
  });
  // Rejected PDF: student may replace the file. Keep the previous review row
  // so the teacher UI can show that the file changed; unlock still follows
  // the new قيد المراجعة status (review_requested → COMPLETED).
  const afterRejection =
    existing?.status === "failed" || existing?.review?.verdict === "failed";
  // Upload may already have written a قيد المراجعة row (file persist). Allow
  // this follow-up submit to finalize the same attempt instead of 409.
  const uploadResubmit =
    hw.type === "upload" &&
    !!existing &&
    (existing.status === "pending" || existing.status === HOMEWORK_REVIEW_REQUESTED_STATUS) &&
    !existing.allowRetake;
  if (
    existing &&
    !canReplaceRejectedHomeworkUpload(hw.type, existing.status, existing.allowRetake) &&
    !uploadResubmit
  ) {
    return NextResponse.json(
      { error: "تم احتساب درجتك مرة واحدة. لا يمكن إعادة الاختبار.", alreadySubmitted: true, submission: existing },
      { status: 409 }
    );
  }

  const body = (await req.json()) as {
    submittedOutput?: string; // terminal
    fileUrl?: string;         // upload
    fileName?: string;        // upload
    answers?: Record<string, string>; // MCQ: { questionId: "A"|"B"|"C"|"D" }
  };

  let status = "pending";
  let score: number | null = null;
  let totalQ: number | null = null;

  // ── Terminal ──────────────────────────────────────────────────────────────
  if (hw.type === "terminal") {
    if (!body.submittedOutput?.trim())
      return NextResponse.json({ error: "يجب إدخال الناتج" }, { status: 400 });

    const expected = normalizeOutput(hw.expectedOutput ?? "");
    const submitted = normalizeOutput(body.submittedOutput);

    if (submitted === expected) {
      status = "passed";
    } else {
      // AI semantic fallback
      try {
        const aiResult = await evaluateTerminalWithAI(
          hw.codeTemplate ?? "",
          body.submittedOutput,
          hw.expectedOutput ?? "",
          hw.codeLanguage ?? "python"
        );
        status = aiResult.passed ? "passed" : "failed";
      } catch {
        // AI unavailable → flag for manual review
        status = HOMEWORK_REVIEW_REQUESTED_STATUS;
      }
    }
  }

  // ── Upload ────────────────────────────────────────────────────────────────
  else if (hw.type === "upload") {
    if (!body.fileUrl || typeof body.fileUrl !== "string") {
      return NextResponse.json({ error: "يجب رفع ملف أولاً" }, { status: 400 });
    }

    const expectedPrefix = `homework/${homeworkId}/${session.id}/`;
    if (!body.fileUrl.startsWith(expectedPrefix) || body.fileUrl.includes("..") || body.fileUrl.includes("\0")) {
      return NextResponse.json({ error: "مسار الملف غير صالح أو لا ينتمي لهذا الطالب" }, { status: 400 });
    }

    const physicalPath = path.join(process.cwd(), "uploads", body.fileUrl);
    try {
      await fs.access(physicalPath);
    } catch {
      return NextResponse.json({ error: "الملف المشار إليه غير موجود على السيرفر، يرجى إعادة رفعه" }, { status: 400 });
    }

    // PDF / file homework waits for the teacher ("قيد المراجعة").
    // Global rule: this status is COMPLETED progress and unlocks the next item.
    status = HOMEWORK_REVIEW_REQUESTED_STATUS;
  }

  // ── Exam (MCQ) ────────────────────────────────────────────────────────────
  else if (hw.type === "exam") {
    if (!body.answers || Object.keys(body.answers).length === 0)
      return NextResponse.json({ error: "يجب الإجابة على الأسئلة" }, { status: 400 });

    const graded = scoreHomeworkExam(hw.questions, body.answers);
    totalQ = graded.totalQ;
    score = graded.score;
    status = graded.status;
  }

  // ── Link (no submission needed) ───────────────────────────────────────────
  else {
    return NextResponse.json({ error: "هذا الواجب لا يحتاج إرسال" }, { status: 400 });
  }

  let submission;
  try {
    submission = await prisma.$transaction(async (tx) => {
      let savedSubmission;
      if (existing) {
        if (existing.review && !(hw.type === "upload" && afterRejection)) {
          await tx.homeworkReview.delete({ where: { submissionId: existing.id } });
        }
        savedSubmission = await tx.homeworkSubmission.update({
          where: { id: existing.id },
          data: {
            answers:         body.answers ? JSON.stringify(body.answers) : null,
            score,
            totalQ,
            submittedOutput: body.submittedOutput ?? null,
            fileUrl:         body.fileUrl ?? null,
            fileName:        body.fileName ?? null,
            status,
            allowRetake:     false,
            completedAt:     new Date(),
          },
        });
      } else {
        savedSubmission = await tx.homeworkSubmission.create({
          data: {
            homeworkId,
            studentId:       session.id,
            answers:         body.answers ? JSON.stringify(body.answers) : null,
            score,
            totalQ,
            submittedOutput: body.submittedOutput ?? null,
            fileUrl:         body.fileUrl ?? null,
            fileName:        body.fileName ?? null,
            status,
            allowRetake:     false,
          },
        });
      }
      await syncHomeworkContentProgress(
        session.id,
        { type: ContentType.HOMEWORK, sourceId: homeworkId, title: hw.title },
        status,
        {
          score,
          completedAt: savedSubmission.completedAt,
          hasUploadedFile: Boolean(body.fileUrl || savedSubmission.fileUrl),
        },
        tx
      );
      return savedSubmission;
    });
  } catch (error: unknown) {
    const err = error as { code?: string };
    if (err?.code === "P2002") {
      return NextResponse.json(
        { error: "تم احتساب درجتك مرة واحدة. لا يمكن إعادة الاختبار.", alreadySubmitted: true },
        { status: 409 }
      );
    }
    throw error;
  }

  return NextResponse.json({ submission, status });
}

/** GET /api/homework/[id]/submit — student checks their own submission (teachers/admins check query param) */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "غير مصرح" }, { status: 401 });

  const { id: homeworkId } = await params;

  const hasAccess = await checkHomeworkAccess(session.id, session.role, homeworkId);
  if (!hasAccess) {
    return NextResponse.json({ error: "غير مصرح لك بالوصول لهذا الواجب" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const targetStudentId = (session.role === "teacher" || session.role === "admin" || session.role === "superadmin")
    ? (searchParams.get("studentId") ?? session.id)
    : session.id;

  const submission = await prisma.homeworkSubmission.findUnique({
    where: { homeworkId_studentId: { homeworkId, studentId: targetStudentId } },
    include: { review: true },
  });

  return NextResponse.json({ submission });
}
