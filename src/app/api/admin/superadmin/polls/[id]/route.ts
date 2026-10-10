import { logAdminAction } from "@/lib/admin-auth";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

type Ctx = { params: Promise<{ id: string }> };

async function requireSuperadmin() {
  const session = await getSession();
  return session && session.role === "superadmin" ? session : null;
}

/** Poll with per-option counts and the full voter list (who chose what). */
export async function GET(_req: NextRequest, { params }: Ctx) {
  if (!(await requireSuperadmin())) {
    return NextResponse.json({ error: "غير مصرح لك" }, { status: 401 });
  }
  const { id } = await params;

  const poll = await prisma.poll.findUnique({
    where: { id },
    include: {
      options: { orderBy: { order: "asc" }, include: { _count: { select: { votes: true } } } },
      votes: {
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          optionId: true,
          createdAt: true,
          student: { select: { id: true, name: true, phone: true, educationalStage: true } },
        },
      },
    },
  });
  if (!poll) return NextResponse.json({ error: "الاستطلاع غير موجود" }, { status: 404 });

  return NextResponse.json({ poll });
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const session = await requireSuperadmin();
  if (!session) return NextResponse.json({ error: "غير مصرح لك" }, { status: 401 });
  const { id } = await params;

  try {
    const { isActive } = await req.json();
    if (typeof isActive !== "boolean") {
      return NextResponse.json({ error: "طلب غير صحيح" }, { status: 400 });
    }
    const poll = await prisma.poll.update({ where: { id }, data: { isActive } });

    try {
      await logAdminAction({
        adminId: session.id,
        adminName: session.name,
        action: "SUPERADMIN_ACTION",
        targetType: "POLL",
        targetId: id,
        targetName: isActive ? "open" : "close",
      });
    } catch {}

    return NextResponse.json({ poll });
  } catch (error) {
    console.error("Error updating poll:", error);
    return NextResponse.json({ error: "حدث خطأ داخلي" }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const session = await requireSuperadmin();
  if (!session) return NextResponse.json({ error: "غير مصرح لك" }, { status: 401 });
  const { id } = await params;

  try {
    await prisma.poll.delete({ where: { id } });

    try {
      await logAdminAction({
        adminId: session.id,
        adminName: session.name,
        action: "SUPERADMIN_ACTION",
        targetType: "POLL",
        targetId: id,
        targetName: "delete",
      });
    } catch {}

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting poll:", error);
    return NextResponse.json({ error: "حدث خطأ داخلي" }, { status: 500 });
  }
}
