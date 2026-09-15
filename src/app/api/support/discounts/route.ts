import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSupportSession, logSupportAction } from "@/lib/support-auth";
import { DiscountService } from "@/services/discount/DiscountService";

/**
 * The hard ceiling on anything this panel can create.
 *
 * It lives here, on the server, rather than as a `max` attribute on the input:
 * a cap that only exists in the form is not a cap, since the endpoint is one
 * fetch() away from anyone who opens devtools. The superadmin panel keeps its
 * own unrestricted discount tooling — this limit binds support only.
 */
const MAX_SUPPORT_DISCOUNT_PERCENT = 10;

/** GET /api/support/discounts — platform-wide codes this panel can see. */
export async function GET() {
  const support = await getSupportSession();
  if (!support) return NextResponse.json({ error: "غير مصرح" }, { status: 401 });

  const codes = await prisma.discountCode.findMany({
    where: { scope: "PLATFORM_WIDE", discountType: "PERCENTAGE" },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      id: true,
      code: true,
      discountValue: true,
      isActive: true,
      expiresAt: true,
      maxTotalUses: true,
      maxUsesPerStudent: true,
      createdAt: true,
      _count: { select: { usages: true } },
    },
  });

  return NextResponse.json({
    codes: codes.map((c) => ({ ...c, usedCount: c._count.usages, _count: undefined })),
    maxPercent: MAX_SUPPORT_DISCOUNT_PERCENT,
  });
}

/**
 * POST /api/support/discounts
 * Body: { code, percent, expiresInDays?, maxTotalUses?, maxUsesPerStudent? }
 *
 * Creates a platform-wide percentage discount, capped at 10%.
 */
export async function POST(req: NextRequest) {
  const support = await getSupportSession();
  if (!support) return NextResponse.json({ error: "غير مصرح" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as {
    code?: string;
    percent?: number;
    expiresInDays?: number | null;
    maxTotalUses?: number | null;
    maxUsesPerStudent?: number;
  };

  const cleanCode = DiscountService.normalizeCode(String(body.code || ""));
  if (!cleanCode || cleanCode.length < 3) {
    return NextResponse.json(
      { error: "كود الخصم يجب أن يتكون من 3 أحرف/أرقام على الأقل" },
      { status: 400 }
    );
  }

  const percent = Number(body.percent);
  if (!Number.isFinite(percent) || percent <= 0) {
    return NextResponse.json({ error: "نسبة الخصم يجب أن تكون أكبر من صفر" }, { status: 400 });
  }
  // Refuse rather than clamp: an agent who typed 25 should be told the limit,
  // not quietly handed a 10% code they think is 25%.
  if (percent > MAX_SUPPORT_DISCOUNT_PERCENT) {
    return NextResponse.json(
      { error: `الحد الأقصى للخصم من لوحة الدعم هو ${MAX_SUPPORT_DISCOUNT_PERCENT}%` },
      { status: 400 }
    );
  }

  const existing = await prisma.discountCode.findUnique({ where: { code: cleanCode } });
  if (existing) {
    return NextResponse.json({ error: "هذا الكود مستخدم بالفعل" }, { status: 409 });
  }

  let expiresAt: Date | null = null;
  if (body.expiresInDays) {
    const days = Number(body.expiresInDays);
    if (!Number.isFinite(days) || days < 1 || days > 730) {
      return NextResponse.json({ error: "مدة الصلاحية يجب أن تكون بين 1 و 730 يوماً" }, { status: 400 });
    }
    expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  }

  const maxTotalUses =
    body.maxTotalUses === null || body.maxTotalUses === undefined || Number(body.maxTotalUses) <= 0
      ? null
      : Math.floor(Number(body.maxTotalUses));

  const maxUsesPerStudent =
    Number.isFinite(Number(body.maxUsesPerStudent)) && Number(body.maxUsesPerStudent) > 0
      ? Math.floor(Number(body.maxUsesPerStudent))
      : 1;

  // DiscountCode.createdById is a required FK to User. The panel is a shared
  // login with no user row, so the code is attributed to the owner superadmin;
  // who actually created it is recorded in ActivityLog.
  const owner =
    (await prisma.user.findFirst({
      where: { role: "superadmin", isOwner: true, isDeleted: false },
      select: { id: true },
    })) ??
    (await prisma.user.findFirst({
      where: { role: "superadmin", isDeleted: false },
      select: { id: true },
    }));

  if (!owner) {
    return NextResponse.json(
      { error: "لا يوجد حساب مشرف عام لنسب الكود إليه" },
      { status: 500 }
    );
  }

  try {
    const created = await prisma.discountCode.create({
      data: {
        code: cleanCode,
        discountType: "PERCENTAGE",
        discountValue: percent,
        scope: "PLATFORM_WIDE",
        isActive: true,
        expiresAt,
        maxTotalUses,
        maxUsesPerStudent,
        createdById: owner.id,
      },
      select: { id: true, code: true, discountValue: true, expiresAt: true, isActive: true },
    });

    await logSupportAction({
      action: "SUPPORT_CREATE_DISCOUNT_CODE",
      targetType: "discount_code",
      targetId: created.id,
      targetName: `${created.code} (${percent}%)`,
      metadata: {
        agent: support.agent,
        percent,
        scope: "PLATFORM_WIDE",
        expiresAt: expiresAt?.toISOString() ?? null,
        maxTotalUses,
        maxUsesPerStudent,
      },
    });

    return NextResponse.json({ ok: true, code: created }, { status: 201 });
  } catch (err) {
    console.error("support create discount failed:", err);
    return NextResponse.json({ error: "تعذر إنشاء كود الخصم" }, { status: 500 });
  }
}

/** PATCH /api/support/discounts — activate or deactivate an existing code. */
export async function PATCH(req: NextRequest) {
  const support = await getSupportSession();
  if (!support) return NextResponse.json({ error: "غير مصرح" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { id?: string; isActive?: boolean };
  const id = String(body.id || "").trim();
  if (!id || typeof body.isActive !== "boolean") {
    return NextResponse.json({ error: "طلب غير صالح" }, { status: 400 });
  }

  const existing = await prisma.discountCode.findFirst({
    where: { id, scope: "PLATFORM_WIDE" },
    select: { id: true, code: true },
  });
  if (!existing) {
    return NextResponse.json({ error: "الكود غير موجود أو خارج نطاق لوحة الدعم" }, { status: 404 });
  }

  await prisma.discountCode.update({ where: { id }, data: { isActive: body.isActive } });

  await logSupportAction({
    action: body.isActive ? "SUPPORT_ENABLE_DISCOUNT_CODE" : "SUPPORT_DISABLE_DISCOUNT_CODE",
    targetType: "discount_code",
    targetId: id,
    targetName: existing.code,
    metadata: { agent: support.agent },
  });

  return NextResponse.json({ ok: true, isActive: body.isActive });
}
