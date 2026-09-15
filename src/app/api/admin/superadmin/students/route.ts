import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasPermission } from "@/lib/rbac";

function buildWhere(params: {
  name: string;
  stage: string;
  ageNum: number | undefined;
  phone: string;
  parentPhone: string;
  verification: string;
}) {
  const where: any = {
    role: "student",
    isDeleted: false,
    name: params.name ? { contains: params.name } : undefined,
    educationalStage: params.stage || undefined,
    age: params.ageNum,
    phone: params.phone ? { contains: params.phone } : undefined,
    parentPhone: params.parentPhone ? { contains: params.parentPhone } : undefined,
  };

  if (params.verification === "confirmed") {
    where.parentVerificationStatus = "CONFIRMED";
  } else if (params.verification === "pending") {
    where.parentVerificationStatus = "PENDING";
  } else if (params.verification === "rejected") {
    where.parentVerificationStatus = "REJECTED";
  }

  return where;
}

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session || !hasPermission(session.role, "view_students")) {
    return NextResponse.json({ error: "غير مصرح" }, { status: 403 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const name = searchParams.get("name")?.trim() ?? "";
    const stage = searchParams.get("stage")?.trim() ?? "";
    const ageRaw = searchParams.get("age")?.trim() ?? "";
    const phone = searchParams.get("phone")?.trim() ?? "";
    const parentPhone = searchParams.get("parentPhone")?.trim() ?? "";
    const verification = searchParams.get("verification")?.trim() ?? "all";
    const limit = Math.min(parseInt(searchParams.get("limit") ?? "50"), 100);
    const offset = Math.max(parseInt(searchParams.get("offset") ?? "0"), 0);
    const ageNum = ageRaw !== "" && !isNaN(parseInt(ageRaw)) ? parseInt(ageRaw) : undefined;

    const where = {
      ...buildWhere({ name, stage, ageNum, phone, parentPhone, verification }),
      ...(session.demoTour ? { isDemo: true } : {}),
    };

    const baseWhere = { role: "student", isDeleted: false, ...(session.demoTour ? { isDemo: true } : {}) };

    const [students, total, confirmedCount, pendingCount, rejectedCount] = await Promise.all([
      prisma.user.findMany({
        where,
        select: {
          id: true,
          name: true,
          age: true,
          educationalStage: true,
          phone: true,
          parentPhone: true,
          isActive: true,
          parentVerified: true,
          parentVerificationStatus: true,
          createdAt: true,
          parentToken: {
            select: {
              sentAt: true,
              lastAccessedAt: true,
              issueCount: true,
              parentPhoneSnapshot: true,
            },
          },
          parentVerificationEvents: {
            select: {
              id: true,
              action: true,
              phone: true,
              ip: true,
              userAgent: true,
              createdAt: true,
            },
            orderBy: { createdAt: "desc" },
            take: 20,
          },
        },
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
      }),
      prisma.user.count({ where }),
      prisma.user.count({ where: { ...baseWhere, parentVerificationStatus: "CONFIRMED" } }),
      prisma.user.count({ where: { ...baseWhere, parentVerificationStatus: "PENDING" } }),
      prisma.user.count({ where: { ...baseWhere, parentVerificationStatus: "REJECTED" } }),
    ]);

    return NextResponse.json({
      students,
      total,
      counts: {
        confirmed: confirmedCount,
        pending: pendingCount,
        rejected: rejectedCount,
        unverified: pendingCount + rejectedCount,
      },
    });
  } catch (error) {
    console.error("Superadmin students fetch error:", error);
    return NextResponse.json({ error: "تعذر جلب المتعلمين" }, { status: 500 });
  }
}
