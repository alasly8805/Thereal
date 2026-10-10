import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const CODE_MAX_LEN = 50;

/** GET — current balance + last 50 transactions */
export async function GET() {
  const { getSession } = await import("@/lib/auth");
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "غير مصرح" }, { status: 401 });

  let [user, rawTransactions] = await Promise.all([
    prisma.user.findUnique({ where: { id: session.id }, select: { balance: true } }),
    prisma.balanceTransaction.findMany({
      where: { userId: session.id },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: { id: true, type: true, amount: true, note: true, createdAt: true },
    }),
  ]);

  // Reconcile recent pending transactions (within 48 h, max 3)
  const pendingTxs = rawTransactions
    .filter(
      (tx) =>
        tx.type.toLowerCase().includes("pending") &&
        Date.now() - new Date(tx.createdAt).getTime() < 48 * 60 * 60 * 1000
    )
    .slice(0, 3);

  let didReconcileAny = false;

  if (pendingTxs.length > 0) {
    for (const pTx of pendingTxs) {
      try {
        const refMatch = pTx.note?.match(/(?:shakeout_ref|sha7nawy_ref):([^\s|]+)/);
        const ref = refMatch ? refMatch[1] : null;
        if (!ref) continue;

        if (pTx.type.includes("shakeout")) {
          const [
            { getShakeOutPaymentInfo, SHAKEOUT_PAID_STATUSES, SHAKEOUT_CREDITED_TYPE },
            { fulfillPendingItemPurchase },
          ] = await Promise.all([
            import("@/lib/shakeout"),
            import("@/lib/fulfillment"),
          ]);
          const info = await getShakeOutPaymentInfo(ref);
          const normalizedStatus = (info.data?.status ?? "unknown").toString().toLowerCase();
          if (SHAKEOUT_PAID_STATUSES.includes(normalizedStatus)) {
            const processed = await prisma.$transaction(async (tx) => {
              const claim = await tx.balanceTransaction.updateMany({
                where: { id: pTx.id, type: pTx.type },
                data: {
                  type: SHAKEOUT_CREDITED_TYPE,
                  note: `${pTx.note} — سداد عبر Shake-Out (تأكيد تلقائي)`,
                },
              });
              if (claim.count === 0) return false;
              await tx.user.update({
                where: { id: session.id },
                data: { balance: { increment: pTx.amount } },
              });
              await fulfillPendingItemPurchase({ userId: session.id, note: pTx.note, tx });
              return true;
            });
            if (processed) didReconcileAny = true;
          }
        } else if (pTx.type.includes("sha7nawy")) {
          const [
            { getSha7nawyPaymentInfo, SHA7NAWY_PAID_STATUSES, SHA7NAWY_CREDITED_TYPE },
            { fulfillPendingItemPurchase },
          ] = await Promise.all([
            import("@/lib/sha7nawy"),
            import("@/lib/fulfillment"),
          ]);
          const info = await getSha7nawyPaymentInfo(ref);
          const normalizedStatus = (info.data?.status ?? "unknown").toString().toLowerCase();
          if (SHA7NAWY_PAID_STATUSES.includes(normalizedStatus)) {
            const processed = await prisma.$transaction(async (tx) => {
              const claim = await tx.balanceTransaction.updateMany({
                where: { id: pTx.id, type: pTx.type },
                data: {
                  type: SHA7NAWY_CREDITED_TYPE,
                  note: `${pTx.note} — سداد عبر Sha7nawy (تأكيد تلقائي)`,
                },
              });
              if (claim.count === 0) return false;
              await tx.user.update({
                where: { id: session.id },
                data: { balance: { increment: pTx.amount } },
              });
              await fulfillPendingItemPurchase({ userId: session.id, note: pTx.note, tx });
              return true;
            });
            if (processed) didReconcileAny = true;
          }
        }
      } catch (err) {
        // Log but continue — a single gateway error must not block the balance view
        console.error("[balance] reconcile failed for tx", pTx.id, err);
      }
    }

    if (didReconcileAny) {
      [user, rawTransactions] = await Promise.all([
        prisma.user.findUnique({ where: { id: session.id }, select: { balance: true } }),
        prisma.balanceTransaction.findMany({
          where: { userId: session.id },
          orderBy: { createdAt: "desc" },
          take: 50,
          select: { id: true, type: true, amount: true, note: true, createdAt: true },
        }),
      ]);
    }
  }

  const transactions = rawTransactions.map((tx) => {
    const isPending = tx.type.toLowerCase().includes("pending");
    let url: string | null = null;
    let ref: string | null = null;

    if (tx.note) {
      const urlMatch = tx.note.match(/\|url:(https?:\/\/[^\s|]+)/);
      if (urlMatch) url = urlMatch[1];
      const refMatch = tx.note.match(/(?:shakeout_ref|sha7nawy_ref):([^\s|]+)/);
      if (refMatch) ref = refMatch[1];
    }

    return {
      id: tx.id,
      type: tx.type,
      amount: tx.amount,
      note: tx.note,
      createdAt: tx.createdAt,
      isPending,
      status: isPending ? "UNPAID" : "PAID",
      paymentUrl: url,
      reference: ref,
    };
  });

  return NextResponse.json(
    { balance: user?.balance ?? 0, transactions },
    { headers: { "Cache-Control": "no-store" } }
  );
}

/** POST — redeem a money code */
export async function POST(req: NextRequest) {
  const { getSession } = await import("@/lib/auth");
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "غير مصرح" }, { status: 401 });

  const clientIp = req.headers.get("x-forwarded-for")?.split(",")[0] || "127.0.0.1";
  const { AccessCodeGuard } = await import("@/services/security/AccessCodeGuard");

  const rateCheck = await AccessCodeGuard.verifyRateLimit(clientIp, session.id);
  if (!rateCheck.allowed) {
    await AccessCodeGuard.logAttempt({ ip: clientIp, userId: session.id, codeAttempted: "money_code_rate_limited", success: false });
    return NextResponse.json(
      { error: `تم تجاوز عدد محاولات الكود المسموح بها. يرجى الانتظار ${rateCheck.lockTimeSeconds} ثانية قبل المحاولة مجدداً.` },
      { status: 429 }
    );
  }

  const body = (await req.json().catch(() => ({}))) as { code?: unknown };
  const { code } = body;

  if (!code || typeof code !== "string" || !code.trim()) {
    return NextResponse.json({ error: "الكود مطلوب" }, { status: 400 });
  }

  // Guard: prevent DoS via oversized strings before DB lookup
  if (code.trim().length > CODE_MAX_LEN) {
    return NextResponse.json({ error: "كود غير صالح" }, { status: 400 });
  }

  const normalized = code.trim().toUpperCase();

  try {
    const creditedAmount = await prisma.$transaction(async (tx) => {
      const moneyCode = await tx.moneyCode.findUnique({ where: { code: normalized } });
      if (!moneyCode) throw new Error("NOT_FOUND");
      if (moneyCode.isUsed) throw new Error("ALREADY_USED");
      if (moneyCode.expiresAt && moneyCode.expiresAt < new Date()) throw new Error("EXPIRED");

      // Optimistic lock — if another request already used it, count === 0
      const updateResult = await tx.moneyCode.updateMany({
        where: { id: moneyCode.id, isUsed: false },
        data: { isUsed: true, usedById: session.id, usedAt: new Date() },
      });
      if (updateResult.count === 0) throw new Error("ALREADY_USED");

      await tx.user.update({
        where: { id: session.id },
        data: { balance: { increment: moneyCode.amount } },
      });

      await tx.balanceTransaction.create({
        data: {
          userId: session.id,
          type: "credit_code",
          amount: moneyCode.amount,
          note: `كود: ${normalized}`,
        },
      });

      return moneyCode.amount;
    });

    await AccessCodeGuard.logAttempt({ ip: clientIp, userId: session.id, codeAttempted: normalized, success: true });

    const { ReferralService } = await import("@/services/referral/ReferralService");
    void ReferralService.qualifyAndRewardReferral(session.id, `code:${normalized}`).catch(() => {});

    return NextResponse.json({
      success: true,
      credited: creditedAmount,
      message: `تم إضافة ${creditedAmount} جنيه إلى رصيدك!`,
    });
  } catch (error: unknown) {
    await AccessCodeGuard.logAttempt({ ip: clientIp, userId: session.id, codeAttempted: normalized, success: false });
    const msg = error instanceof Error ? error.message : "";
    if (msg === "NOT_FOUND") return NextResponse.json({ error: "الكود غير صحيح" }, { status: 404 });
    if (msg === "ALREADY_USED") return NextResponse.json({ error: "هذا الكود مستخدم بالفعل" }, { status: 400 });
    if (msg === "EXPIRED") return NextResponse.json({ error: "الكود منتهي الصلاحية" }, { status: 400 });
    console.error("[balance redemption] error:", error);
    return NextResponse.json({ error: "حدث خطأ داخلي" }, { status: 500 });
  }
}
