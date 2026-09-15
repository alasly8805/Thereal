import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasPermission } from "@/lib/rbac";
import { logAdminAction, LOG_ACTIONS, verifyRoleActionPassword } from "@/lib/admin-auth";

// GET /api/admin/superadmin/staff-accounts — list all admin + staff users
export async function GET() {
  try {
    const session = await getSession();
    if (!session || !hasPermission(session.role, "view_staff_accounts")) {
      return NextResponse.json({ error: "غير مصرح" }, { status: 403 });
    }

    const accounts = await prisma.user.findMany({
      where: {
        role: { in: ["admin", "staff"] },
        isDeleted: false,
        ...(session.demoTour ? { isDemo: true } : {}),
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ accounts });
  } catch (err) {
    console.error("GET staff-accounts error:", err);
    return NextResponse.json({ error: "حدث خطأ في الخادم" }, { status: 500 });
  }
}

// POST /api/admin/superadmin/staff-accounts — create a new admin or staff account
export async function POST(req: NextRequest) {
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
    if (!session || !hasPermission(session.role, "manage_staff_accounts")) {
      return NextResponse.json({ error: "غير مصرح" }, { status: 403 });
    }

    const body = (await req.json()) as {
      name?: string;
      email?: string;
      password?: string;
      role?: string;
      actionPassword?: string;
    };

    const name = body.name?.trim() ?? "";
    const email = body.email?.trim().toLowerCase() ?? "";
    const password = body.password ?? "";
    const role = body.role ?? "";
    const actionPassword = body.actionPassword ?? "";

    if (!name || !email || !password || !role) {
      return NextResponse.json({ error: "جميع الحقول مطلوبة" }, { status: 400 });
    }
    if (!["admin", "staff"].includes(role)) {
      return NextResponse.json({ error: "الدور يجب أن يكون admin أو staff" }, { status: 400 });
    }
    if (password.length < 6) {
      return NextResponse.json({ error: "كلمة المرور يجب أن تكون 6 أحرف على الأقل" }, { status: 400 });
    }
    if (!verifyRoleActionPassword(session.role, actionPassword)) {
      return NextResponse.json({ error: "كلمة مرور الإجراء غير صحيحة" }, { status: 403 });
    }

    const existing = await prisma.user.findFirst({ where: { email } });
    if (existing) {
      return NextResponse.json({ error: "البريد الإلكتروني مستخدم مسبقاً" }, { status: 409 });
    }

    const hashed = await bcrypt.hash(password, 12);
    const account = await prisma.user.create({
      data: {
        name,
        email,
        password: hashed,
        role,
        isActive: true,
        isDeleted: false,
        profileCompleted: true,
      },
      select: { id: true, name: true, email: true, role: true, isActive: true, createdAt: true },
    });

    await logAdminAction({
      adminId: session.id,
      adminName: session.name,
      action: LOG_ACTIONS.CREATE_STAFF_ACCOUNT,
      targetType: "StaffAccount",
      targetId: account.id,
      targetName: account.name,
      metadata: { role, email },
    });

    return NextResponse.json({ account }, { status: 201 });
  } catch (err) {
    console.error("POST staff-accounts error:", err);
    return NextResponse.json({ error: "حدث خطأ في الخادم" }, { status: 500 });
  }
}
