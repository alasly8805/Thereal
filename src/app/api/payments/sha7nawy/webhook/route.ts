import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  getSha7nawyPaymentInfo,
  SHA7NAWY_PENDING_TYPE,
  SHA7NAWY_CREDITED_TYPE,
  SHA7NAWY_PAID_STATUSES,
  sha7nawyRefNote,
} from "@/lib/sha7nawy";
import { fulfillPendingItemPurchase } from "@/lib/fulfillment";
import { secretsMatch } from "@/lib/secret-compare";

export async function POST(req: NextRequest) {
  try {
    const webhookSecret = process.env.SHA7NAWY_WEBHOOK_SECRET;
    if (!webhookSecret) {
      console.error("[Sha7nawy Webhook] SHA7NAWY_WEBHOOK_SECRET is not configured");
      return NextResponse.json({ error: "Webhook configuration missing" }, { status: 500 });
    }
    const incomingSecret =
      req.headers.get("x-webhook-secret") ||
      req.headers.get("x-sha7nawy-secret");
    if (!secretsMatch(incomingSecret, webhookSecret)) {
      const ip = req.headers.get("x-forwarded-for")?.split(",")[0] || req.headers.get("x-real-ip") || "127.0.0.1";
      // A rejected delivery means the money is taken but nothing is fulfilled, and
      // the previous log line said nothing about *why* the secret did not match.
      // Record which headers actually arrived (names only — never the values) so a
      // mismatch can be told apart from the gateway simply using a different header.
      const headerNames = Array.from(req.headers.keys()).sort().join(",");
      console.warn(
        `[Sha7nawy Webhook] Unauthorized secret attempt from IP: ${ip} | secret header present: ${Boolean(incomingSecret)} | headers seen: ${headerNames}`
      );
      return NextResponse.json({ error: "Unauthorized webhook caller" }, { status: 401 });
    }

    const payload = await req.json().catch(() => ({}));

    const event = payload.event || req.headers.get("x-webhook-event");
    const transaction = payload.transaction || payload.data || {};

    const status = transaction.status || req.headers.get("x-transaction-status") || payload.status;
    const reference = transaction.reference || req.headers.get("x-transaction-reference") || transaction.id;
    const transactionId = transaction.id || transaction.transaction_id || req.headers.get("x-transaction-id");

    if (event !== "transaction.updated" && !status) {
      return NextResponse.json({ success: true, message: "Ignored non-transaction event" }, { status: 200 });
    }

    if (status === "rejected" || status === "failed") {
      console.warn(`[Sha7nawy Webhook] Transaction ${reference} was rejected/failed.`);
      return NextResponse.json({ success: true, processed: false, reason: "Transaction rejected" }, { status: 200 });
    }

    const isCompleted = SHA7NAWY_PAID_STATUSES.includes(String(status || "").toLowerCase());
    if (!isCompleted) {
      return NextResponse.json({ success: true, processed: false, reason: `Status is ${status}` }, { status: 200 });
    }

    // Server-side verification is mandatory: never trust amount/user from the payload.
    if (!transactionId || !reference) {
      console.warn("[Sha7nawy Webhook] Missing transactionId or reference");
      return NextResponse.json({ error: "Missing transaction identifiers" }, { status: 400 });
    }

    let verified;
    try {
      verified = await getSha7nawyPaymentInfo(transactionId);
    } catch (verifyError: any) {
      console.error("[Sha7nawy Webhook] Verification unavailable:", verifyError?.message || verifyError);
      return NextResponse.json({ error: "Payment verification unavailable" }, { status: 503 });
    }

    if (!verified.status || !verified.data) {
      console.warn(`[Sha7nawy Webhook] Verification failed for transaction ${transactionId} (ref ${reference})`);
      return NextResponse.json({ error: "Transaction verification failed" }, { status: 400 });
    }

    const verifiedData = verified.data;
    const verifiedStatus = String(verifiedData.status || "").toLowerCase();
    if (!SHA7NAWY_PAID_STATUSES.includes(verifiedStatus)) {
      console.warn(`[Sha7nawy Webhook] Server status is ${verifiedData.status} for ref ${reference}`);
      return NextResponse.json({ error: "Verification status mismatch" }, { status: 400 });
    }

    const verifiedReference = verifiedData.reference ? String(verifiedData.reference) : null;
    if (verifiedReference && verifiedReference !== String(reference)) {
      console.warn(`[Sha7nawy Webhook] Reference mismatch: payload=${reference} server=${verifiedReference}`);
      return NextResponse.json({ error: "Reference mismatch" }, { status: 400 });
    }

    // Guard 2: Reference match with fast multi-token lookup via providerRef and note tags
    const refStr = String(reference).trim();
    const txIdStr = String(transactionId).trim();
    const verifiedRefStr = verifiedReference ? String(verifiedReference).trim() : "";
    const searchTokens = Array.from(new Set([refStr, txIdStr, verifiedRefStr].filter(Boolean)));

    let pendingTx: { id: string; userId: string; amount: number; note: string } | null = null;
    let targetType = SHA7NAWY_PENDING_TYPE;
    let isLatePayment = false;

    // 1. Direct providerRef match on active pending
    pendingTx = await prisma.balanceTransaction.findFirst({
      where: {
        type: SHA7NAWY_PENDING_TYPE,
        providerRef: { in: searchTokens },
      } as any,
      select: { id: true, userId: true, amount: true, note: true },
    });

    // 2. Note search on active pending
    if (!pendingTx) {
      for (const token of searchTokens) {
        const refPrefix = sha7nawyRefNote(token);
        const candidates = await prisma.balanceTransaction.findMany({
          where: {
            type: SHA7NAWY_PENDING_TYPE,
            note: { contains: refPrefix },
          },
          select: { id: true, userId: true, amount: true, note: true },
        });

        if (candidates.length > 0) {
          pendingTx = candidates[0];
          break;
        }
      }
    }

    // 3. Search expired rows for late payments
    if (!pendingTx) {
      let expiredTx = await prisma.balanceTransaction.findFirst({
        where: {
          type: "credit_sha7nawy_expired",
          providerRef: { in: searchTokens },
        } as any,
        select: { id: true, userId: true, amount: true, note: true },
      });

      if (!expiredTx) {
        for (const token of searchTokens) {
          const refPrefix = sha7nawyRefNote(token);
          const candidates = await prisma.balanceTransaction.findMany({
            where: {
              type: "credit_sha7nawy_expired",
              note: { contains: refPrefix },
            },
            select: { id: true, userId: true, amount: true, note: true },
          });

          if (candidates.length > 0) {
            expiredTx = candidates[0];
            break;
          }
        }
      }

      if (expiredTx) {
        pendingTx = expiredTx;
        targetType = "credit_sha7nawy_expired";
        isLatePayment = true;
        console.log(`LATE_PAYMENT_CREDITED: Sha7nawy ref ${reference} matched expired row ${expiredTx.id}`);
      }
    }

    // 4. Check if already credited
    if (!pendingTx) {
      const alreadyCreditedDirect = await prisma.balanceTransaction.findFirst({
        where: {
          type: SHA7NAWY_CREDITED_TYPE,
          providerRef: { in: searchTokens },
        } as any,
        select: { id: true, note: true },
      });

      if (alreadyCreditedDirect) {
        return NextResponse.json({ success: true, processed: false, reason: "Already credited" }, { status: 200 });
      }

      for (const token of searchTokens) {
        const refPrefix = sha7nawyRefNote(token);
        const creditedCandidates = await prisma.balanceTransaction.findMany({
          where: {
            type: SHA7NAWY_CREDITED_TYPE,
            note: { contains: refPrefix },
          },
          select: { id: true, note: true },
        });

        if (creditedCandidates.length > 0) {
          return NextResponse.json({ success: true, processed: false, reason: "Already credited" }, { status: 200 });
        }
      }

      console.warn(`[Sha7nawy Webhook] No pending or expired transaction found for ref ${reference} (tokens: ${searchTokens.join(",")})`);
      return NextResponse.json({ error: "Unknown transaction reference" }, { status: 400 });
    }

    if (verifiedData.client && verifiedData.client !== pendingTx.userId) {
      console.warn(
        `[Sha7nawy Webhook] Client mismatch: server client=${verifiedData.client} pending user=${pendingTx.userId}`
      );
      return NextResponse.json({ error: "Client mismatch" }, { status: 400 });
    }

    const verifiedAmount = parseFloat(String(verifiedData.amount));
    if (!isFinite(verifiedAmount) || verifiedAmount <= 0) {
      console.warn(`[Sha7nawy Webhook] Invalid verified amount: ${verifiedData.amount}`);
      return NextResponse.json({ error: "Invalid verified amount" }, { status: 400 });
    }

    const totalMatch = pendingTx.note?.match(/\|total:([\d.]+)/);
    const expectedChargedAmount = totalMatch ? parseFloat(totalMatch[1]) : pendingTx.amount;

    if (Math.abs(verifiedAmount - expectedChargedAmount) > 0.01) {
      console.warn(
        `[Sha7nawy Webhook] Amount mismatch: verified=${verifiedAmount} expectedCharged=${expectedChargedAmount} pendingBase=${pendingTx.amount} ref=${reference}`
      );
      return NextResponse.json({ error: "Amount mismatch" }, { status: 400 });
    }

    // Atomically claim the pending entry and credit the balance. updateMany on
    // targetType guarantees only one concurrent webhook wins.
    let fulfillmentRes: any = null;
    const processed = await prisma.$transaction(async (tx: any) => {
      const claim = await tx.balanceTransaction.updateMany({
        where: { id: pendingTx!.id, type: targetType },
        data: {
          type: SHA7NAWY_CREDITED_TYPE,
          note: `${pendingTx!.note} — شحن محفظة عبر Sha7nawy${isLatePayment ? " (دفع متأخر)" : ""}`,
        },
      });

      if (claim.count === 0) {
        return false; // another delivery already processed it
      }

      await tx.user.update({
        where: { id: pendingTx!.userId },
        data: { balance: { increment: pendingTx!.amount } },
      });

      // Auto-fulfill item purchase if item metadata exists in note
      fulfillmentRes = await fulfillPendingItemPurchase({
        userId: pendingTx!.userId,
        note: pendingTx!.note,
        tx,
      });

      return true;
    });

    if (!processed) {
      return NextResponse.json({ success: true, processed: false, reason: "Already credited" }, { status: 200 });
    }

    console.log(`[Sha7nawy Webhook] Credited ${pendingTx.amount} EGP to user ${pendingTx.userId} (ref ${reference})${isLatePayment ? " [LATE_PAYMENT_CREDITED]" : ""}. Fulfillment:`, fulfillmentRes);
    return NextResponse.json({ success: true, credited: pendingTx.amount, reference, fulfillment: fulfillmentRes }, { status: 200 });
  } catch (error: any) {
    console.error("[Sha7nawy Webhook] Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
