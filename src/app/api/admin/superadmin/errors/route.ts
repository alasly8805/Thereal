import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasPermission } from "@/lib/rbac";

export async function GET(req: NextRequest) {

      try {
      const session = await getSession();
      if (!session) return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
      if (!hasPermission(session.role, "view_error_logs")) {
        return NextResponse.json({ error: "غير مصرح" }, { status: 403 });
      }

      const { searchParams } = new URL(req.url);
      const type = searchParams.get("type")?.trim() ?? "";
      const limit = Math.min(parseInt(searchParams.get("limit") ?? "100"), 200);
      const offset = Math.max(parseInt(searchParams.get("offset") ?? "0"), 0);

      const where = type ? { type } : {};

      const [errors, total] = await Promise.all([
        prisma.clientError.findMany({
          where,
          orderBy: { createdAt: "desc" },
          take: limit,
          skip: offset,
        }),
        prisma.clientError.count({ where }),
      ]);

      return NextResponse.json({ errors, total });
    } catch (error) {
        console.error("[admin/superadmin/errors] error:", error);
        return NextResponse.json(
          { error: "حدث خطأ داخلي" },
          { status: 500 }
        );
      }
}

export async function DELETE() {

      try {
      const session = await getSession();
      if (!session) return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
      if (!hasPermission(session.role, "view_error_logs")) {
        return NextResponse.json({ error: "غير مصرح" }, { status: 403 });
      }

      const { count } = await prisma.clientError.deleteMany({});
      return NextResponse.json({ cleared: count });
    } catch (error) {
        console.error("[admin/superadmin/errors] error:", error);
        return NextResponse.json(
          { error: "حدث خطأ داخلي" },
          { status: 500 }
        );
      }
}
