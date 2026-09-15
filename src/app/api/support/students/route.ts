import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSupportSession } from "@/lib/support-auth";

/**
 * GET /api/support/students?q=...
 * Finds the student a ticket is about. Name, phone or email — support usually
 * has one of the three and rarely the internal id.
 */
export async function GET(req: NextRequest) {
  const support = await getSupportSession();
  if (!support) return NextResponse.json({ error: "غير مصرح" }, { status: 401 });

  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) return NextResponse.json({ students: [] });

  const students = await prisma.user.findMany({
    where: {
      role: "student",
      isDeleted: false,
      OR: [
        { name: { contains: q, mode: "insensitive" } },
        { phone: { contains: q } },
        { parentPhone: { contains: q } },
        { email: { contains: q, mode: "insensitive" } },
      ],
    },
    select: {
      id: true,
      name: true,
      phone: true,
      email: true,
      isActive: true,
      balance: true,
      educationalStage: true,
      lastLoginAt: true,
      createdAt: true,
    },
    take: 25,
    orderBy: { name: "asc" },
  });

  return NextResponse.json({ students });
}
