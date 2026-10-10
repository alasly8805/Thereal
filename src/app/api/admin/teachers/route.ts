import { logAdminAction } from "@/lib/admin-auth";
import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasPermission } from "@/lib/rbac";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store, max-age=0" };

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
  if (!hasPermission(session.role, "view_teachers")) {
    return NextResponse.json({ error: "غير مصرح" }, { status: 403 });
  }
  try {
    const teachers = await prisma.user.findMany({
      where: {
        role: "teacher",
        isDeleted: false,
        ...(session.demoTour ? { isDemo: true } : { isDemo: false }),
      },
      select: {
        id: true,
        name: true,
        email: true,
        createdAt: true,
        promoProgramEnabled: true,
        promoCode: true,
        promoCodeCreatedAt: true,
        _count: { select: { courses: true } },
        courses: { select: { id: true, title: true, subject: true }, orderBy: { createdAt: "desc" } },
      },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({ teachers }, { headers: NO_STORE });
  } catch (error) {
    console.error("Teachers GET error:", error);
    return NextResponse.json({ error: "تعذر جلب المعلمين" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
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
  if (!session) return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
  if (session.demoTour) {
    return NextResponse.json({ ok: true, success: true });
  }
  if (!hasPermission(session.role, "create_teacher")) {
    return NextResponse.json({ error: "غير مصرح" }, { status: 403 });
  }

  const { name, password, promoProgramEnabled } = await req.json();
  if (!name || !password) {
    return NextResponse.json({ error: "الاسم وكلمة المرور مطلوبان" }, { status: 400 });
  }

  const email = `teacher_${Date.now()}@platform.local`;
  const hashed = await bcrypt.hash(password, 12);

  const teacher = await prisma.user.create({
    data: {
      name,
      email,
      password: hashed,
      role: "teacher",
      promoProgramEnabled: !!promoProgramEnabled,
    },
    select: {
      id: true,
      name: true,
      email: true,
      createdAt: true,
      promoProgramEnabled: true,
      promoCode: true,
    },
  });

  return NextResponse.json({ teacher }, { status: 201 });
}
