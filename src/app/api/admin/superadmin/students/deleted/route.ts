import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasPermission } from "@/lib/rbac";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session || !hasPermission(session.role, "view_deleted_students")) {
    return NextResponse.json({ error: "غير مصرح" }, { status: 403 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const name = searchParams.get("name")?.trim() ?? "";
    const limit = Math.min(parseInt(searchParams.get("limit") ?? "50"), 100);
    const offset = Math.max(parseInt(searchParams.get("offset") ?? "0"), 0);

    const where = {
      role: "student",
      isDeleted: true,
      ...(session.demoTour ? { isDemo: true } : {}),
      ...(name ? { name: { contains: name } } : {}),
    };

    const [students, total] = await Promise.all([
      prisma.user.findMany({
        where,
        select: {
          id: true,
          name: true,
          age: true,
          educationalStage: true,
          phone: true,
          deletedAt: true,
          createdAt: true,
        },
        orderBy: { deletedAt: "desc" },
        take: limit,
        skip: offset,
      }),
      prisma.user.count({ where }),
    ]);

    return NextResponse.json({ students, total });
  } catch (error) {
    console.error("Deleted students fetch error:", error);
    return NextResponse.json({ error: "تعذر جلب المتعلمين المحذوفين" }, { status: 500 });
  }
}
