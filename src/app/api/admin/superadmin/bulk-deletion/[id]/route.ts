import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { verifyRoleActionPassword, logAdminAction, LOG_ACTIONS } from "@/lib/admin-auth";
import { hasPermission } from "@/lib/rbac";
import { isBulkScope, scopeLabel } from "@/lib/bulk-deletion";

/** Cancel a pending (not-yet-executed) bulk deletion request. */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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
    return NextResponse.json({ ok: true, success: true });
  }

  try {
    const { id } = await params;
    const body = (await req.json().catch(() => ({}))) as { actionPassword?: string };

    if (!verifyRoleActionPassword(session.role, body.actionPassword ?? "")) {
      return NextResponse.json({ error: "كلمة مرور المشرف غير صحيحة" }, { status: 401 });
    }

    const request = await prisma.bulkDeletionRequest.findUnique({ where: { id } });
    if (!request || request.status !== "pending") {
      return NextResponse.json(
        { error: "الطلب غير موجود أو تم تنفيذه/إلغاؤه بالفعل" },
        { status: 404 }
      );
    }

    await prisma.bulkDeletionRequest.update({
      where: { id },
      data: { status: "cancelled", cancelledAt: new Date() },
    });

    await logAdminAction({
      adminId: session.id,
      adminName: session.name,
      action: LOG_ACTIONS.BULK_DELETE_CANCELLED,
      targetType: "bulk",
      targetId: id,
      targetName: isBulkScope(request.scope) ? scopeLabel(request.scope) : request.scope,
      metadata: { scope: request.scope },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Bulk-deletion cancel error:", error);
    return NextResponse.json({ error: "تعذر إلغاء طلب الحذف" }, { status: 500 });
  }
}
