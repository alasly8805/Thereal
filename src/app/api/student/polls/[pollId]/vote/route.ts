import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

export async function POST(req: NextRequest, { params }: { params: Promise<{ pollId: string }> }) {
  const session = await getSession({ preferStudent: true });
  if (!session) return NextResponse.json({ error: "سجّل الدخول أولاً" }, { status: 401 });
  if (session.supportView) return NextResponse.json({ error: "وضع الاطلاع فقط" }, { status: 403 });

  const { pollId } = await params;
  const body = await req.json().catch(() => null);
  const optionId = typeof body?.optionId === "string" ? body.optionId : "";
  if (!optionId) return NextResponse.json({ error: "اختر إجابة" }, { status: 400 });

  const [poll, user] = await Promise.all([
    prisma.poll.findUnique({
      where: { id: pollId },
      select: { isActive: true, educationalStage: true, options: { where: { id: optionId }, select: { id: true } } },
    }),
    prisma.user.findUnique({ where: { id: session.id }, select: { educationalStage: true } }),
  ]);

  if (!poll || !poll.isActive) return NextResponse.json({ error: "الاستطلاع مغلق" }, { status: 410 });
  if (poll.educationalStage && poll.educationalStage !== user?.educationalStage) {
    return NextResponse.json({ error: "الاستطلاع غير متاح لصفك" }, { status: 403 });
  }
  if (poll.options.length === 0) return NextResponse.json({ error: "اختيار غير صحيح" }, { status: 400 });

  try {
    await prisma.pollVote.create({ data: { pollId, optionId, studentId: session.id } });
  } catch (error) {
    if ((error as { code?: string })?.code === "P2002") {
      return NextResponse.json({ error: "سبق وشاركت في الاستطلاع ده" }, { status: 409 });
    }
    console.error("Error recording poll vote:", error);
    return NextResponse.json({ error: "حدث خطأ داخلي" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
