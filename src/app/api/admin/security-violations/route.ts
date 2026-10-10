import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma";

export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session || (session.role !== "superadmin" && session.role !== "admin")) {
      return NextResponse.json({ error: "غير مصرح" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const type = searchParams.get("type");
    const search = searchParams.get("search");

    const where: Prisma.SecurityViolationWhereInput = {};
    if (type) {
      where.type = type;
    }
    if (search) {
      where.OR = [
        { student: { name: { contains: search } } },
        { student: { phone: { contains: search } } },
        { ip: { contains: search } },
      ];
    }

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const [violations, totalCount, todayCount, devToolsCount, screenshotCount, vpnCount] = await Promise.all([
      prisma.securityViolation.findMany({
        where,
        include: {
          student: {
            select: {
              id: true,
              name: true,
              phone: true,
              parentPhone: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
        take: 100,
      }),
      prisma.securityViolation.count(),
      prisma.securityViolation.count({ where: { createdAt: { gte: todayStart } } }),
      prisma.securityViolation.count({ where: { type: "DEVTOOLS" } }),
      prisma.securityViolation.count({ where: { type: "SCREENSHOT" } }),
      prisma.securityViolation.count({ where: { type: "VPN_DETECTED" } }),
    ]);

    return NextResponse.json({
      success: true,
      violations,
      stats: {
        totalCount,
        total: totalCount,
        todayCount,
        today: todayCount,
        devToolsCount,
        screenshotCount,
        vpnCount,
      },
    });
  } catch (error: unknown) {
    console.error("Failed to fetch security violations:", error);
    return NextResponse.json({ error: "خطأ داخلي" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session || (session.role !== "superadmin" && session.role !== "admin")) {
      return NextResponse.json({ error: "غير مصرح" }, { status: 403 });
    }

    const { studentId, action } = (await req.json()) as { studentId?: string; action?: "ban" | "unban" };

    if (!studentId || !action) {
      return NextResponse.json({ error: "البيانات غير مكتملة" }, { status: 400 });
    }

    // Toggle user status
    await prisma.user.update({
      where: { id: studentId },
      data: {
        isActive: action === "ban" ? false : true,
      },
    });

    return NextResponse.json({ success: true, message: action === "ban" ? "تم حظر حساب الطالب بنجاح" : "تم إلغاء الحظر بنجاح" });
  } catch (error: unknown) {
    console.error("Failed to execute student security action:", error);
    return NextResponse.json({ error: "تعذر تنفيذ الإجراء" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session || (session.role !== "superadmin" && session.role !== "admin")) {
      return NextResponse.json({ error: "غير مصرح" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    const action = searchParams.get("action");

    if (action === "purge-false-positives") {
      const deleted = await prisma.securityViolation.deleteMany({
        where: {
          OR: [
            { details: { contains: "threshold" } },
            { details: { contains: "focus" } },
          ],
        },
      });
      return NextResponse.json({ success: true, count: deleted.count, message: `تم حذف ${deleted.count} إنذار كاذب بنجاح` });
    }

    if (action === "clear-all") {
      const deleted = await prisma.securityViolation.deleteMany({});
      return NextResponse.json({ success: true, count: deleted.count, message: "تم إفراغ سجل المخالفات بالكامل" });
    }

    if (id) {
      await prisma.securityViolation.delete({ where: { id } });
      return NextResponse.json({ success: true, message: "تم حذف المخالفة بنجاح" });
    }

    return NextResponse.json({ error: "معرف غير صالح" }, { status: 400 });
  } catch (error: unknown) {
    console.error("Failed to delete security violation:", error);
    return NextResponse.json({ error: "تعذر الحذف" }, { status: 500 });
  }
}
