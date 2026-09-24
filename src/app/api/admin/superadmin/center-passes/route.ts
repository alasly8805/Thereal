import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logAdminAction } from "@/lib/admin-auth";
import {
  assertPublicIdAvailable,
  centerPassEmail,
  generateCenterPassword,
  parseCustomPublicId,
} from "@/lib/center-pass";

export async function GET() {
  try {
    const session = await getSession();
    if (!session || session.role !== "superadmin") {
      return NextResponse.json({ error: "غير مصرح — مخصص للمشرف العام فقط" }, { status: 403 });
    }

    const passes = await prisma.centerPass.findMany({
      where: session.demoTour ? { student: { isDemo: true } } : undefined,
      include: {
        student: {
          select: { id: true, name: true, isActive: true, createdAt: true },
        },
        _count: { select: { items: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({
      passes: passes.map((pass) => ({
        id: pass.id,
        publicId: pass.publicId,
        title: pass.title,
        notes: pass.notes,
        isActive: pass.isActive && pass.student.isActive,
        lastLoginAt: pass.lastLoginAt,
        createdAt: pass.createdAt,
        itemCount: pass._count.items,
        student: pass.student,
      })),
    });
  } catch (err) {
    console.error("GET /api/admin/superadmin/center-passes error:", err);
    return NextResponse.json({ error: "حدث خطأ في الخادم" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session || session.role !== "superadmin") {
      return NextResponse.json({ error: "غير مصرح — مخصص للمشرف العام فقط" }, { status: 403 });
    }

    const body = (await req.json().catch(() => ({}))) as {
      name?: string;
      password?: string;
      publicId?: string;
      title?: string;
      notes?: string;
    };

    const name = (body.name || "").trim();
    const title = (body.title || "").trim() || "باقة السنتر";
    const notes = (body.notes || "").trim() || null;
    const password = (body.password || "").trim() || generateCenterPassword();
    const parsedId = parseCustomPublicId(body.publicId || "");

    if (!name) {
      return NextResponse.json({ error: "اسم الطالب مطلوب" }, { status: 400 });
    }
    if (!parsedId.ok) {
      return NextResponse.json({ error: parsedId.error }, { status: 400 });
    }
    if (password.length < 6) {
      return NextResponse.json({ error: "كلمة المرور يجب أن تكون 6 أحرف على الأقل" }, { status: 400 });
    }

    const publicId = parsedId.publicId;

    if (session.demoTour) {
      return NextResponse.json({
        ok: true,
        success: true,
        pass: {
          id: "demo",
          publicId,
          title,
          notes,
          isActive: true,
          student: { id: "demo", name },
        },
        credentials: { publicId, password },
      });
    }

    const available = await assertPublicIdAvailable(publicId);
    if (!available.ok) {
      return NextResponse.json({ error: available.error }, { status: 409 });
    }
    const hashed = await bcrypt.hash(password, 12);
    const email = centerPassEmail(publicId);

    const student = await prisma.user.create({
      data: {
        name,
        email,
        password: hashed,
        role: "student",
        accountMode: "CENTER_ID",
        isActive: true,
        isDeleted: false,
        profileCompleted: true,
        isVerified: true,
        testerNotes: notes,
      },
    });

    const pass = await prisma.centerPass.create({
      data: {
        publicId,
        studentId: student.id,
        createdById: session.id,
        title,
        notes,
        isActive: true,
      },
    });

    await logAdminAction({
      adminId: session.id,
      adminName: session.name,
      action: "CREATE_CENTER_PASS",
      targetType: "CenterPass",
      targetId: pass.id,
      targetName: `${publicId} — ${name}`,
      metadata: { publicId, studentId: student.id },
    });

    return NextResponse.json(
      {
        success: true,
        pass: {
          id: pass.id,
          publicId: pass.publicId,
          title: pass.title,
          notes: pass.notes,
          isActive: true,
          createdAt: pass.createdAt,
          itemCount: 0,
          student: { id: student.id, name: student.name, isActive: true, createdAt: student.createdAt },
        },
        credentials: { publicId, password },
      },
      { status: 201 }
    );
  } catch (err) {
    console.error("POST /api/admin/superadmin/center-passes error:", err);
    if (typeof err === "object" && err && "code" in err && (err as { code: string }).code === "P2002") {
      return NextResponse.json({ error: "هذا الكود مستخدم بالفعل — اختر كوداً آخر" }, { status: 409 });
    }
    return NextResponse.json({ error: "حدث خطأ في الخادم" }, { status: 500 });
  }
}
