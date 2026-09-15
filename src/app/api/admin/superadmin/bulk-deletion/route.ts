import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { verifyRoleActionPassword, logAdminAction, LOG_ACTIONS } from "@/lib/admin-auth";
import { hasPermission } from "@/lib/rbac";
import {
  GRACE_DAYS,
  getPurgeDays,
  isBulkScope,
  scopeLabel,
  countScope,
  softDeleteScope,
  runBulkMaintenance,
  verifyBulkDeletePassword,
  bulkDeletePasswordConfigured,
} from "@/lib/bulk-deletion";

const DAY_MS = 86_400_000;

/** List requests + live scope counts. Runs lazy maintenance first. */
export async function GET() {
  const session = await getSession();
  if (!session || !hasPermission(session.role, "bulk_delete_users")) {
    return NextResponse.json({ error: "غير مصرح" }, { status: 403 });
  }

  try {
    const demoTour = session.demoTour === true;
    // A showroom session must never run due deletions or trash purge.
    if (!demoTour) {
      await runBulkMaintenance();
    }

    const [requests, students, teachers, purgeDays] = await Promise.all([
      demoTour
        ? Promise.resolve([])
        : prisma.bulkDeletionRequest.findMany({ orderBy: { createdAt: "desc" }, take: 20 }),
      countScope("students", { demoOnly: demoTour }),
      countScope("teachers", { demoOnly: demoTour }),
      getPurgeDays(),
    ]);

    return NextResponse.json({
      requests,
      counts: { students, teachers, all: students + teachers },
      graceDays: GRACE_DAYS,
      purgeDays,
      instantConfigured: bulkDeletePasswordConfigured(),
    });
  } catch (error) {
    // Table not migrated yet → empty state instead of a 500 toast loop.
    console.error("Bulk-deletion list error:", error);
    return NextResponse.json({
      requests: [],
      counts: { students: 0, teachers: 0, all: 0 },
      graceDays: GRACE_DAYS,
      purgeDays: 30,
      instantConfigured: bulkDeletePasswordConfigured(),
    });
  }
}

/** Create a scheduled request, or run an instant deletion (env-password gated). */
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
  if (!session || !hasPermission(session.role, "bulk_delete_users")) {
    return NextResponse.json({ error: "غير مصرح" }, { status: 403 });
  }
  if (session.demoTour) {
    return NextResponse.json({ ok: true, success: true, affectedCount: 0 });
  }

  try {
    const body = (await req.json().catch(() => ({}))) as {
      scope?: string;
      instant?: boolean;
      actionPassword?: string;
    };

    if (!isBulkScope(body.scope)) {
      return NextResponse.json({ error: "نطاق الحذف غير صالح" }, { status: 400 });
    }
    const scope = body.scope;
    const password = body.actionPassword ?? "";

    // ── Instant: gated by the dedicated BULK_DELETE_PASSWORD ──
    if (body.instant) {
      if (!bulkDeletePasswordConfigured()) {
        return NextResponse.json(
          { error: "الحذف الفوري غير مُفعّل: لم يتم ضبط BULK_DELETE_PASSWORD في الخادم" },
          { status: 400 }
        );
      }
      if (!verifyBulkDeletePassword(password)) {
        return NextResponse.json({ error: "كلمة مرور الحذف الفوري غير صحيحة" }, { status: 401 });
      }

      const affectedCount = await softDeleteScope(scope, session.id);
      const request = await prisma.bulkDeletionRequest.create({
        data: {
          scope,
          status: "executed",
          instant: true,
          requestedById: session.id,
          requestedByName: session.name,
          executeAt: new Date(),
          executedAt: new Date(),
          affectedCount,
        },
      });

      await logAdminAction({
        adminId: session.id,
        adminName: session.name,
        action: LOG_ACTIONS.BULK_DELETE_INSTANT,
        targetType: "bulk",
        targetId: request.id,
        targetName: scopeLabel(scope),
        metadata: { scope, affectedCount },
      });

      return NextResponse.json({ success: true, instant: true, affectedCount, request });
    }

    // ── Scheduled: standard superadmin action password ──
    if (!verifyRoleActionPassword(session.role, password)) {
      return NextResponse.json({ error: "كلمة مرور المشرف غير صحيحة" }, { status: 401 });
    }

    const existing = await prisma.bulkDeletionRequest.findFirst({
      where: { status: "pending", scope },
    });
    if (existing) {
      return NextResponse.json(
        { error: "يوجد طلب حذف مجدول بالفعل لهذا النطاق. ألغِه أولاً قبل إنشاء طلب جديد." },
        { status: 409 }
      );
    }

    const request = await prisma.bulkDeletionRequest.create({
      data: {
        scope,
        status: "pending",
        instant: false,
        requestedById: session.id,
        requestedByName: session.name,
        executeAt: new Date(Date.now() + GRACE_DAYS * DAY_MS),
      },
    });

    await logAdminAction({
      adminId: session.id,
      adminName: session.name,
      action: LOG_ACTIONS.BULK_DELETE_SCHEDULED,
      targetType: "bulk",
      targetId: request.id,
      targetName: scopeLabel(scope),
      metadata: { scope, executeAt: request.executeAt.toISOString() },
    });

    return NextResponse.json({ success: true, request });
  } catch (error) {
    console.error("Bulk-deletion create error:", error);
    return NextResponse.json({ error: "تعذر إنشاء طلب الحذف" }, { status: 500 });
  }
}
