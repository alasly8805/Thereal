import { logAdminAction } from "@/lib/admin-auth";
/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { isTeacherLike, actingTeacherId, hasAssistantPermission } from "@/lib/teacher-scope";
import { prisma } from "@/lib/prisma";

// Validation constants
const MIN_QUESTIONS = 1;
const MAX_QUESTIONS = 50;
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

    const { id: folderId } = await params;
    const { title, questions, timeLimitMinutes } = await req.json();

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

    // Create quiz with validated data
    const quiz = await prisma.quiz.create({
      data: {
        title: title.trim(),
        folderId,
        timeLimitMinutes: normalizedLimit,
        questions: {
          create: questions.map(
            (
              q: {
                question: string;
                questionType?: string;
                imageUrl?: string;
                optionA?: string;
                optionB?: string;
                optionC?: string;
                optionD?: string;
                correctAnswer?: string;
              },
              i: number
            ) => ({
              question: q.question.trim(),
              questionType: q.questionType === "essay" ? "essay" : "mcq",
              imageUrl: q.imageUrl?.trim() || null,
              optionA: q.questionType === "essay" ? "" : (q.optionA?.trim() || ""),
              optionB: q.questionType === "essay" ? "" : (q.optionB?.trim() || ""),
              optionC: q.questionType === "essay" ? "" : (q.optionC?.trim() || ""),
              optionD: q.questionType === "essay" ? "" : (q.optionD?.trim() || ""),
              correctAnswer: q.questionType === "essay" ? "A" : (q.correctAnswer || "A"),
              order: i,
            })
          ),
        },
      },
      include: { questions: true },
    });

    // Auto-create ContentItem graph node for the new quiz
    await prisma.contentItem.upsert({
      where: {
        type_sourceId: {
          type: "QUIZ",
          sourceId: quiz.id,
        },
      },
      create: {
        type: "QUIZ",
        sourceId: quiz.id,
        title: quiz.title,
      },
      update: {
        title: quiz.title,
      },
    }).catch(console.error);

    return NextResponse.json({ quiz }, { status: 201 });
  } catch (error) {
    console.error("Failed to create quiz:", error);
    return NextResponse.json({ error: "تعذر إنشاء الاختبار" }, { status: 500 });
  }
}
