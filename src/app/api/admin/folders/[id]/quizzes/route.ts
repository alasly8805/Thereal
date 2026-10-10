import { logAdminAction } from "@/lib/admin-auth";
/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { isTeacherLike, actingTeacherId, hasAssistantPermission } from "@/lib/teacher-scope";
import { prisma } from "@/lib/prisma";
import {
  ContentType,
  parseCloseSchedule,
  syncContentCloseSchedule,
} from "@/lib/content-access-engine";
import { parseDegree } from "@/lib/quiz-grading";
import { FolderContentType } from "@/generated/prisma";
import { appendFolderContent } from "@/lib/folder-content-order";

// Validation constants
const MIN_QUESTIONS = 1;
const MAX_QUESTIONS = 200;
const MIN_OPTIONS = 2;
const MAX_OPTIONS = 4;
const MAX_QUESTION_LENGTH = 500;
const MAX_OPTION_LENGTH = 200;
const MAX_TITLE_LENGTH = 100;
const MIN_TIME_LIMIT = 1;
const MAX_TIME_LIMIT = 240;

function validateQuizData(title: string, questions: any[]): { valid: boolean; error?: string } {
  // Validate title
  if (!title || typeof title !== "string") {
    return { valid: false, error: "عنوان الاختبار مطلوب" };
  }
  
  if (title.trim().length === 0) {
    return { valid: false, error: "عنوان الاختبار لا يمكن أن يكون فارغاً" };
  }
  
  if (title.length > MAX_TITLE_LENGTH) {
    return { valid: false, error: `عنوان الاختبار لا يمكن أن يزيد عن ${MAX_TITLE_LENGTH} حرف` };
  }

  // Validate questions array
  if (!Array.isArray(questions) || questions.length === 0) {
    return { valid: false, error: "يجب أن يحتوي الاختبار على سؤال واحد على الأقل" };
  }

  if (questions.length > MAX_QUESTIONS) {
    return { valid: false, error: `لا يمكن أن يحتوي الاختبار على أكثر من ${MAX_QUESTIONS} سؤال` };
  }

  // Validate each question
  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];

    if (!q || typeof q !== "object") {
      return { valid: false, error: `السؤال ${i + 1} غير صحيح` };
    }

    if (!q.question || typeof q.question !== "string" || q.question.trim().length === 0) {
      return { valid: false, error: `السؤال ${i + 1} فارغ` };
    }

    if (q.question.length > MAX_QUESTION_LENGTH) {
      return { valid: false, error: `السؤال ${i + 1} طويل جداً (الحد الأقصى ${MAX_QUESTION_LENGTH} حرف)` };
    }

    const isEssay = q.questionType === "essay";

    if (!isEssay) {
      const options = ["optionA", "optionB", "optionC", "optionD"];
      const filledOptions = options.filter((opt) => q[opt] && q[opt].trim().length > 0);

      if (filledOptions.length < MIN_OPTIONS) {
        return { valid: false, error: `السؤال ${i + 1} يجب أن يحتوي على خيارين على الأقل` };
      }

      for (const opt of filledOptions) {
        if (!q[opt] || typeof q[opt] !== "string") {
          return { valid: false, error: `السؤال ${i + 1} يحتوي على خيار غير صحيح` };
        }

        if (q[opt].trim().length === 0) {
          return { valid: false, error: `السؤال ${i + 1} يحتوي على خيار فارغ` };
        }

        if (q[opt].length > MAX_OPTION_LENGTH) {
          return { valid: false, error: `خيار في السؤال ${i + 1} طويل جداً (الحد الأقصى ${MAX_OPTION_LENGTH} حرف)` };
        }
      }

      if (!q.correctAnswer || typeof q.correctAnswer !== "string") {
        return { valid: false, error: `السؤال ${i + 1} لا يحتوي على إجابة صحيحة` };
      }

      const correctOption = `option${q.correctAnswer}`;
      if (!options.includes(correctOption) || !q[correctOption] || q[correctOption].trim().length === 0) {
        return { valid: false, error: `السؤال ${i + 1} يحتوي على إجابة صحيحة غير موجودة` };
      }
    }
  }

  return { valid: true };
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: folderId } = await params;
    const session = await getSession();

    if (session && session.role === "superadmin") {
      try {
        await logAdminAction({
          adminId: session.id,
          adminName: session.name,
          action: "SUPERADMIN_ACTION",
          targetType: "API_ROUTE",
          targetId: req.nextUrl ? req.nextUrl.pathname : req.url,
          targetName: req.method,
        });
      } catch (e) {}
    }
    if (!session || !isTeacherLike(session.role)) {
      return NextResponse.json({ error: "غير مصرح" }, { status: 403 });
    }
    if (!hasAssistantPermission(session, "editCourses")) {
      return NextResponse.json({ error: "المدرّس لم يمنحك صلاحية تعديل الكورسات" }, { status: 403 });
    }

    const { title, questions, timeLimitMinutes, closeAt, enableAutoClose, hideAnswersUntilEssayGraded } = await req.json();

    // Validate quiz data
    const validation = validateQuizData(title, questions);
    if (!validation.valid) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    // Verify folder exists and belongs to teacher
    const folder = await prisma.folder.findFirst({
      where: {
        id: folderId,
        course: { teacherId: actingTeacherId(session) },
      },
    });

    if (!folder) {
      return NextResponse.json({ error: "المحاضرة غير موجودة" }, { status: 404 });
    }

    // Validate and normalize time limit
    const parsedLimit = Number(timeLimitMinutes);
    const normalizedLimit =
      Number.isFinite(parsedLimit) && parsedLimit >= MIN_TIME_LIMIT
        ? Math.min(Math.round(parsedLimit), MAX_TIME_LIMIT)
        : 30;

    const closeSchedule = parseCloseSchedule({ closeAt, enableAutoClose });
    if (closeSchedule.error) {
      return NextResponse.json({ error: closeSchedule.error }, { status: 400 });
    }

    // Create quiz with validated data
    const quiz = await prisma.quiz.create({
      data: {
        title: title.trim(),
        folderId,
        timeLimitMinutes: normalizedLimit,
        closeAt: closeSchedule.closeAt,
        enableAutoClose: closeSchedule.enableAutoClose,
        hideAnswersUntilEssayGraded: Boolean(hideAnswersUntilEssayGraded),
        questions: {
          create: questions.map(
            (
              q: {
                question: string;
                questionType?: string;
                type?: string;
                imageUrl?: string;
                optionA?: string;
                optionB?: string;
                optionC?: string;
                optionD?: string;
                options?: string[];
                correctAnswer?: string;
                correctIndex?: number;
                explanation?: string;
                modelNumber?: number;
              },
              i: number
            ) => {
              const isEssay = q.questionType === "essay" || q.type === "ESSAY" || q.type === "essay";
              const optA = isEssay ? "" : (q.optionA?.trim() || (Array.isArray(q.options) ? q.options[0]?.trim() : "") || "");
              const optB = isEssay ? "" : (q.optionB?.trim() || (Array.isArray(q.options) ? q.options[1]?.trim() : "") || "");
              const optC = isEssay ? "" : (q.optionC?.trim() || (Array.isArray(q.options) ? q.options[2]?.trim() : "") || "");
              const optD = isEssay ? "" : (q.optionD?.trim() || (Array.isArray(q.options) ? q.options[3]?.trim() : "") || "");
              const optionsArr = Array.isArray(q.options) ? q.options : [optA, optB, optC, optD].filter(Boolean);
              const corrAns = isEssay ? "A" : (q.correctAnswer || (typeof q.correctIndex === "number" ? ["A", "B", "C", "D"][q.correctIndex] : "A"));
              const corrIdx = typeof q.correctIndex === "number" ? q.correctIndex : ["A", "B", "C", "D"].indexOf(corrAns);

              return {
                question: q.question.trim(),
                questionType: isEssay ? "essay" : "mcq",
                type: isEssay ? "ESSAY" : "MCQ",
                imageUrl: q.imageUrl?.trim() || null,
                optionA: optA,
                optionB: optB,
                optionC: optC,
                optionD: optD,
                options: optionsArr,
                correctAnswer: corrAns,
                correctIndex: corrIdx >= 0 ? corrIdx : 0,
                explanation: q.explanation || null,
                degree: parseDegree((q as { degree?: unknown }).degree),
                modelNumber: Number(q.modelNumber) || 1,
                order: i,
              };
            }
          ),
        },
      },
      include: { questions: true },
    });

    // Auto-create ContentItem graph node for the new quiz
    await syncContentCloseSchedule({
      type: ContentType.QUIZ,
      sourceId: quiz.id,
      title: quiz.title,
      closeAt: quiz.closeAt,
      enableAutoClose: quiz.enableAutoClose,
    });

    await appendFolderContent(folderId, FolderContentType.EXAM, quiz.id);

    return NextResponse.json({ quiz }, { status: 201 });
  } catch (error) {
    console.error("Failed to create quiz:", error);
    return NextResponse.json({ error: "تعذر إنشاء الاختبار" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || !isTeacherLike(session.role)) {
    return NextResponse.json({ error: "غير مصرح" }, { status: 403 });
  }
  if (!hasAssistantPermission(session, "editCourses")) {
    return NextResponse.json({ error: "المدرّس لم يمنحك صلاحية تعديل الكورسات" }, { status: 403 });
  }

  const { id: folderId } = await params;
  const body = await req.json() as {
    quizId?: string;
    closeAt?: string | null;
    enableAutoClose?: boolean;
    hideAnswersUntilEssayGraded?: boolean;
  };
  if (!body.quizId) return NextResponse.json({ error: "quizId مطلوب" }, { status: 400 });

  const quiz = await prisma.quiz.findFirst({
    where: { id: body.quizId, folderId, folder: { course: { teacherId: actingTeacherId(session) } } },
    select: { id: true, title: true },
  });
  if (!quiz) return NextResponse.json({ error: "الاختبار غير موجود" }, { status: 404 });

  const closeSchedule = parseCloseSchedule({
    closeAt: body.closeAt,
    enableAutoClose: body.enableAutoClose,
  });
  if (closeSchedule.error) {
    return NextResponse.json({ error: closeSchedule.error }, { status: 400 });
  }

  const updated = await prisma.quiz.update({
    where: { id: quiz.id },
    data: {
      closeAt: closeSchedule.closeAt,
      enableAutoClose: closeSchedule.enableAutoClose,
      ...(body.hideAnswersUntilEssayGraded !== undefined ? { hideAnswersUntilEssayGraded: Boolean(body.hideAnswersUntilEssayGraded) } : {}),
    },
  });

  await syncContentCloseSchedule({
    type: ContentType.QUIZ,
    sourceId: updated.id,
    title: updated.title,
    closeAt: updated.closeAt,
    enableAutoClose: updated.enableAutoClose,
  });

  return NextResponse.json({ quiz: updated });
}
