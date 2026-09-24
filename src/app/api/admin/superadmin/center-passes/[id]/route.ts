import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logAdminAction } from "@/lib/admin-auth";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession();
    if (!session || session.role !== "superadmin") {
      return NextResponse.json({ error: "غير مصرح" }, { status: 403 });
    }

    const { id } = await params;
    const pass = await prisma.centerPass.findUnique({
      where: { id },
      include: {
        student: { select: { id: true, name: true, isActive: true, createdAt: true } },
        items: { orderBy: [{ courseId: "asc" }, { sortOrder: "asc" }] },
      },
    });

    if (!pass) {
      return NextResponse.json({ error: "الرقم التعريفي غير موجود" }, { status: 404 });
    }

    const courseIds = [...new Set(pass.items.map((item) => item.courseId))];
    const courses = courseIds.length
      ? await prisma.course.findMany({
          where: { id: { in: courseIds } },
          select: {
            id: true,
            title: true,
            subject: true,
            deliveryMode: true,
            teacher: { select: { id: true, name: true } },
          },
        })
      : [];
    const courseMap = new Map(courses.map((course) => [course.id, course]));

    return NextResponse.json({
      pass: {
        id: pass.id,
        publicId: pass.publicId,
        title: pass.title,
        notes: pass.notes,
        isActive: pass.isActive && pass.student.isActive,
        lastLoginAt: pass.lastLoginAt,
        createdAt: pass.createdAt,
        student: pass.student,
        items: pass.items.map((item) => ({
          id: item.id,
          kind: item.kind,
          sourceId: item.sourceId,
          courseId: item.courseId,
          folderId: item.folderId,
          title: item.title,
          sortOrder: item.sortOrder,
          course: courseMap.get(item.courseId) || null,
        })),
      },
    });
  } catch (err) {
    console.error("GET /api/admin/superadmin/center-passes/[id] error:", err);
    return NextResponse.json({ error: "حدث خطأ في الخادم" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession();
    if (!session || session.role !== "superadmin") {
      return NextResponse.json({ error: "غير مصرح" }, { status: 403 });
    }

    const { id } = await params;
    const body = (await req.json().catch(() => ({}))) as {
      name?: string;
      title?: string;
      notes?: string;
      isActive?: boolean;
      password?: string;
    };

    const pass = await prisma.centerPass.findUnique({ where: { id } });
    if (!pass) {
      return NextResponse.json({ error: "الرقم التعريفي غير موجود" }, { status: 404 });
    }

    if (session.demoTour) {
      return NextResponse.json({ ok: true, success: true });
    }

    const passData: { title?: string; notes?: string | null; isActive?: boolean } = {};
    const userData: { name?: string; isActive?: boolean; password?: string; tokenVersion?: { increment: number } } = {};

    if (body.title !== undefined) passData.title = body.title.trim() || "باقة السنتر";
    if (body.notes !== undefined) passData.notes = body.notes.trim() || null;
    if (body.isActive !== undefined) {
      passData.isActive = body.isActive;
      userData.isActive = body.isActive;
    }
    if (body.name !== undefined) userData.name = body.name.trim() || undefined;
    if (body.password) {
      if (body.password.length < 6) {
        return NextResponse.json({ error: "كلمة المرور يجب أن تكون 6 أحرف على الأقل" }, { status: 400 });
      }
      userData.password = await bcrypt.hash(body.password, 12);
      userData.tokenVersion = { increment: 1 };
    }

    const updated = await prisma.$transaction(async (tx) => {
      if (Object.keys(userData).length) {
        await tx.user.update({ where: { id: pass.studentId }, data: userData });
      }
      return tx.centerPass.update({
        where: { id },
        data: passData,
        include: {
          student: { select: { id: true, name: true, isActive: true, createdAt: true } },
          _count: { select: { items: true } },
        },
      });
    });

    await logAdminAction({
      adminId: session.id,
      adminName: session.name,
      action: "UPDATE_CENTER_PASS",
      targetType: "CenterPass",
      targetId: updated.id,
      targetName: updated.publicId,
      metadata: { keys: Object.keys({ ...passData, ...userData }) },
    });

    return NextResponse.json({
      success: true,
      pass: {
        id: updated.id,
        publicId: updated.publicId,
        title: updated.title,
        notes: updated.notes,
        isActive: updated.isActive && updated.student.isActive,
        lastLoginAt: updated.lastLoginAt,
        createdAt: updated.createdAt,
        itemCount: updated._count.items,
        student: updated.student,
      },
    });
  } catch (err) {
    console.error("PATCH /api/admin/superadmin/center-passes/[id] error:", err);
    return NextResponse.json({ error: "حدث خطأ في الخادم" }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession();
    if (!session || session.role !== "superadmin") {
      return NextResponse.json({ error: "غير مصرح" }, { status: 403 });
    }

    const { id } = await params;
    const pass = await prisma.centerPass.findUnique({
      where: { id },
      include: { student: { select: { id: true, name: true } } },
    });
    if (!pass) {
      return NextResponse.json({ error: "الرقم التعريفي غير موجود" }, { status: 404 });
    }

    if (session.demoTour) {
      return NextResponse.json({ ok: true, success: true });
    }

    await prisma.$transaction([
      prisma.centerPass.update({ where: { id }, data: { isActive: false } }),
      prisma.user.update({
        where: { id: pass.studentId },
        data: { isActive: false, tokenVersion: { increment: 1 } },
      }),
    ]);

    await logAdminAction({
      adminId: session.id,
      adminName: session.name,
      action: "DEACTIVATE_CENTER_PASS",
      targetType: "CenterPass",
      targetId: pass.id,
      targetName: `${pass.publicId} — ${pass.student.name}`,
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("DELETE /api/admin/superadmin/center-passes/[id] error:", err);
    return NextResponse.json({ error: "حدث خطأ في الخادم" }, { status: 500 });
  }
}
