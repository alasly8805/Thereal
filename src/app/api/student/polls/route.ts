import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

/**
 * The oldest open poll this student hasn't answered yet, or null.
 * Polled by the site-wide prompt, so it stays to two small queries.
 */
export async function GET() {
  const session = await getSession({ preferStudent: true });
  if (!session || session.supportView) return NextResponse.json({ poll: null });

  const user = await prisma.user.findUnique({
    where: { id: session.id },
    select: { educationalStage: true },
  });

  const poll = await prisma.poll.findFirst({
    where: {
      isActive: true,
      OR: [{ educationalStage: null }, ...(user?.educationalStage ? [{ educationalStage: user.educationalStage }] : [])],
      votes: { none: { studentId: session.id } },
    },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      question: true,
      options: { orderBy: { order: "asc" }, select: { id: true, text: true } },
    },
  });

  return NextResponse.json({ poll });
}
