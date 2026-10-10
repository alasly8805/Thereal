import { logAdminAction } from "@/lib/admin-auth";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { EDUCATIONAL_STAGES } from "@/types";

const MAX_OPTIONS = 8;

export async function GET() {
  const session = await getSession();
  if (!session || session.role !== "superadmin") {
    return NextResponse.json({ error: "غير مصرح لك" }, { status: 401 });
  }

  const polls = await prisma.poll.findMany({
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { votes: true, options: true } } },
  });

  return NextResponse.json({ polls });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "superadmin") {
    return NextResponse.json({ error: "غير مصرح لك" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const question = typeof body.question === "string" ? body.question.trim() : "";
    const options: string[] = Array.isArray(body.options)
      ? body.options.map((o: unknown) => (typeof o === "string" ? o.trim() : "")).filter(Boolean)
      : [];
    const stage = typeof body.educationalStage === "string" && body.educationalStage ? body.educationalStage : null;

    if (!question) return NextResponse.json({ error: "اكتب السؤال" }, { status: 400 });
    if (options.length < 2) return NextResponse.json({ error: "أضف اختيارين على الأقل" }, { status: 400 });
    if (options.length > MAX_OPTIONS) return NextResponse.json({ error: `الحد الأقصى ${MAX_OPTIONS} اختيارات` }, { status: 400 });
    if (stage && !EDUCATIONAL_STAGES.some((s) => s.value === stage)) {
      return NextResponse.json({ error: "الصف غير صحيح" }, { status: 400 });
    }

    const poll = await prisma.poll.create({
      data: {
        question,
        educationalStage: stage,
        isActive: body.isActive === true,
        options: { create: options.map((text, order) => ({ text, order })) },
      },
    });

    try {
      await logAdminAction({
        adminId: session.id,
        adminName: session.name,
        action: "SUPERADMIN_ACTION",
        targetType: "POLL",
        targetId: poll.id,
        targetName: `create: ${question}`,
      });
    } catch {}

    return NextResponse.json({ poll });
  } catch (error) {
    console.error("Error creating poll:", error);
    return NextResponse.json({ error: "حدث خطأ داخلي" }, { status: 500 });
  }
}
