import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { isTeacherLike, actingTeacherId } from "@/lib/teacher-scope";
import { prisma } from "@/lib/prisma";

const PROMO_EXPIRY_DAYS = 350;
const PROMO_EXPIRY_MS = PROMO_EXPIRY_DAYS * 24 * 60 * 60 * 1000;

export async function GET() {
  try {
    const session = await getSession();
    if (!session || !isTeacherLike(session.role)) {
      return NextResponse.json({ error: "غير مصرح — للمعلمين فقط" }, { status: 403 });
    }

    const teacher = await prisma.user.findUnique({
      where: { id: session.id },
      select: {
        id: true,
        name: true,
        promoProgramEnabled: true,
        promoCode: true,
        promoCodeCreatedAt: true,
      },
    });

    if (!teacher) {
      return NextResponse.json({ error: "حساب المعلم غير موجود" }, { status: 404 });
    }

    if (!teacher.promoProgramEnabled) {
      return NextResponse.json({
        enabled: false,
        message: "برنامج كود الخصم والإحالة غير مفعّل لحسابك من قبل المشرف العام",
      });
    }

    const now = new Date();
    const createdAt = teacher.promoCodeCreatedAt ? new Date(teacher.promoCodeCreatedAt) : null;
    const expiresAt = createdAt ? new Date(createdAt.getTime() + PROMO_EXPIRY_MS) : null;
    const isExpired = expiresAt ? now > expiresAt : false;

    return NextResponse.json({
      enabled: true,
      promoCode: teacher.promoCode,
      promoCodeCreatedAt: teacher.promoCodeCreatedAt,
      expiresAt: expiresAt?.toISOString() ?? null,
      isExpired,
    });
  } catch (error) {
    console.error("Teacher promo-code GET error:", error);
    return NextResponse.json({ error: "حدث خطأ أثناء قراءة كود الخصم" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session || !isTeacherLike(session.role)) {
      return NextResponse.json({ error: "غير مصرح — للمعلمين فقط" }, { status: 403 });
    }

    const teacher = await prisma.user.findUnique({
      where: { id: session.id },
      select: { id: true, promoProgramEnabled: true, promoCode: true },
    });

    if (!teacher) {
      return NextResponse.json({ error: "حساب المعلم غير موجود" }, { status: 404 });
    }

    if (!teacher.promoProgramEnabled) {
      return NextResponse.json(
        { error: "برنامج كود الخصم غير مفعّل لحسابك من قبل المشرف العام" },
        { status: 403 }
      );
    }

    const body = (await req.json().catch(() => ({}))) as { promoCode?: string };
    const rawCode = body.promoCode?.trim().toUpperCase();

    if (!rawCode) {
      return NextResponse.json({ error: "كود الخصم مطلوب" }, { status: 400 });
    }

    if (rawCode.length < 2 || rawCode.length > 30) {
      return NextResponse.json({ error: "كود الخصم يجب أن يكون بين 2 و 30 حرف/رقم" }, { status: 400 });
    }

    // Check if code is already claimed by another teacher
    const existing = await prisma.user.findUnique({
      where: { promoCode: rawCode },
      select: { id: true },
    });

    if (existing && existing.id !== session.id) {
      return NextResponse.json({ error: "كود الخصم مستخدم بالفعل من قبل معلم آخر" }, { status: 400 });
    }

    const now = new Date();
    const expiresAt = new Date(now.getTime() + PROMO_EXPIRY_MS);

    const updated = await prisma.user.update({
      where: { id: session.id },
      data: {
        promoCode: rawCode,
        promoCodeCreatedAt: now,
      },
      select: {
        promoCode: true,
        promoCodeCreatedAt: true,
      },
    });

    return NextResponse.json({
      success: true,
      promoCode: updated.promoCode,
      promoCodeCreatedAt: updated.promoCodeCreatedAt,
      expiresAt: expiresAt.toISOString(),
      message: `تم حفظ كود الخصم "${updated.promoCode}" بنجاح ويكون صالحاً لمدة 350 يوماً`,
    });
  } catch (error) {
    console.error("Teacher promo-code POST error:", error);
    return NextResponse.json({ error: "حدث خطأ أثناء حفظ كود الخصم" }, { status: 500 });
  }
}
