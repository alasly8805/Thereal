import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { normalizeEgyptPhone } from "@/lib/phone";
import { DEFAULT_TESTER_CAPABILITIES } from "@/lib/tester";
import { logAdminAction } from "@/lib/admin-auth";

// GET /api/admin/superadmin/testers — list all tester accounts
export async function GET() {
  try {
    const session = await getSession();
    if (!session || session.role !== "superadmin") {
      return NextResponse.json({ error: "غير مصرح — مخصص للمشرف العام فقط" }, { status: 403 });
    }

    const testers = await prisma.user.findMany({
      where: { accountMode: "TESTER", isDeleted: false, ...(session.demoTour ? { isDemo: true } : {}) },
      select: {
        id: true,
        name: true,
        phone: true,
        email: true,
        accountMode: true,
        testerCapabilities: true,
        testerNotes: true,
        isActive: true,
        createdAt: true,
        _count: {
          select: {
            testerActivityLogs: true,
            courseEnrollments: true,
            folderPurchases: true,
            videoPurchases: true,
            watchSessions: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const formatted = testers.map((t) => {
      let capabilities = { ...DEFAULT_TESTER_CAPABILITIES };
      try {
        if (t.testerCapabilities) {
          capabilities = { ...capabilities, ...JSON.parse(t.testerCapabilities) };
        }
      } catch {}

      return {
        id: t.id,
        name: t.name,
        phone: t.phone,
        email: t.email,
        accountMode: t.accountMode,
        capabilities,
        notes: t.testerNotes,
        isActive: t.isActive,
        createdAt: t.createdAt,
        stats: {
          activityLogsCount: t._count.testerActivityLogs,
          enrolledCoursesCount: t._count.courseEnrollments,
          folderPurchasesCount: t._count.folderPurchases,
          videoPurchasesCount: t._count.videoPurchases,
          watchSessionsCount: t._count.watchSessions,
        },
      };
    });

    return NextResponse.json({ testers: formatted });
  } catch (err) {
    console.error("GET /api/admin/superadmin/testers error:", err);
    return NextResponse.json({ error: "حدث خطأ في الخادم" }, { status: 500 });
  }
}

// POST /api/admin/superadmin/testers — create a new tester account
export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session || session.role !== "superadmin") {
      return NextResponse.json({ error: "غير مصرح — مخصص للمشرف العام فقط" }, { status: 403 });
    }

    const body = (await req.json()) as {
      phone?: string;
      password?: string;
      name?: string;
      notes?: string;
      capabilities?: Record<string, boolean>;
    };

    const rawPhone = body.phone?.trim() ?? "";
    const rawPassword = body.password ?? "";
    const name = body.name?.trim() ?? "QA Platform Tester";
    const notes = body.notes?.trim() ?? "";
    const capabilities = { ...DEFAULT_TESTER_CAPABILITIES, ...(body.capabilities || {}) };

    if (!rawPhone || !rawPassword) {
      return NextResponse.json({ error: "رقم الهاتف وكلمة المرور مطلوبان" }, { status: 400 });
    }

    if (rawPassword.length < 6) {
      return NextResponse.json({ error: "كلمة المرور يجب أن تكون 6 أحرف على الأقل" }, { status: 400 });
    }

    const normalizedPhone = normalizeEgyptPhone(rawPhone);
    if (!normalizedPhone || normalizedPhone.length < 10) {
      return NextResponse.json({ error: "رقم الهاتف غير صالح" }, { status: 400 });
    }

    // 409 Conflict Guard: Verify phone does not belong to any existing account
    const existing = await prisma.user.findFirst({
      where: {
        OR: [
          { phone: normalizedPhone },
          { email: `tester_${normalizedPhone}@code-up.internal` },
        ],
      },
    });

    if (existing) {
      return NextResponse.json(
        {
          error: "رقم الهاتف مستخدم بالفعل لحساب آخر على المنصة",
          code: "PHONE_EXISTS",
        },
        { status: 409 }
      );
    }

    const hashedPassword = await bcrypt.hash(rawPassword, 12);
    const email = `tester_${normalizedPhone}@code-up.internal`;

    const tester = await prisma.user.create({
      data: {
        name,
        phone: normalizedPhone,
        email,
        password: hashedPassword,
        role: "student",
        accountMode: "TESTER",
        testerNotes: notes,
        testerCapabilities: JSON.stringify(capabilities),
        isActive: true,
        isDeleted: false,
        profileCompleted: true,
      },
      select: {
        id: true,
        name: true,
        phone: true,
        email: true,
        accountMode: true,
        testerCapabilities: true,
        testerNotes: true,
        isActive: true,
        createdAt: true,
      },
    });

    await logAdminAction({
      adminId: session.id,
      adminName: session.name,
      action: "CREATE_TESTER_ACCOUNT",
      targetType: "TesterAccount",
      targetId: tester.id,
      targetName: tester.name,
      metadata: { phone: normalizedPhone, capabilities },
    });

    return NextResponse.json(
      {
        success: true,
        tester: {
          ...tester,
          capabilities,
        },
      },
      { status: 201 }
    );
  } catch (err) {
    console.error("POST /api/admin/superadmin/testers error:", err);
    return NextResponse.json({ error: "حدث خطأ في الخادم" }, { status: 500 });
  }
}
