/**
 * Reconciles Sha7nawy payments that were charged to a student but never fulfilled.
 *
 * Sha7nawy's verification endpoint was being called on a URL that does not exist
 * on their side, so every webhook failed its mandatory verification step and the
 * pending ledger rows were never converted into wallet credit or subscriptions.
 * This walks those rows and settles the ones that can be *proven* paid.
 *
 * Nothing is ever credited on trust: a row is only fulfilled when a verification
 * source confirms both that the payment completed and that the amount matches
 * what we recorded. Rows that cannot be confirmed are left exactly as they are
 * and listed for a human.
 *
 *   npx tsx -r dotenv/config scripts/reconcile-sha7nawy.ts
 *   npx tsx -r dotenv/config scripts/reconcile-sha7nawy.ts --apply
 *   npx tsx -r dotenv/config scripts/reconcile-sha7nawy.ts --source=file --file=confirmed.csv
 *
 * Dry-run is the default; --apply is required to write anything.
 *
 * --source=gateway (default) asks the gateway about each transaction.
 * --source=file    reads a list of references the gateway confirmed as paid,
 *                  for when the API cannot answer (wrong key, closed account) but
 *                  the dashboard can be exported. One record per line:
 *                      SH-1549175781,102.00
 *                  The amount is required and is checked against our own record.
 */

import { PrismaClient } from "@/generated/prisma";
import { readFileSync } from "fs";
import {
  getSha7nawyPaymentInfo,
  readSha7nawyGatewayId,
  SHA7NAWY_PENDING_TYPE,
  SHA7NAWY_CREDITED_TYPE,
  SHA7NAWY_PAID_STATUSES,
} from "@/lib/sha7nawy";
import { fulfillPendingItemPurchase } from "@/lib/fulfillment";

const prisma = new PrismaClient();

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const SOURCE = (args.find((a) => a.startsWith("--source="))?.split("=")[1] ?? "gateway") as "gateway" | "file";
const FILE = args.find((a) => a.startsWith("--file="))?.split("=")[1];

type Verdict = "PAID" | "NOT_PAID" | "UNKNOWN" | "NO_ID" | "AMOUNT_MISMATCH";

interface Row {
  id: string;
  userId: string;
  userName: string;
  amount: number;
  note: string;
  providerRef: string | null;
  createdAt: Date;
  gatewayId: string | null;
  verdict: Verdict;
  detail: string;
}

/** Reads the "reference,amount" confirmation list exported from the dashboard. */
function loadConfirmedFile(path: string): Map<string, number> {
  const map = new Map<string, number>();
  const text = readFileSync(path, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const [ref, amt] = trimmed.split(",").map((x) => x?.trim());
    if (!ref || !amt) {
      console.warn(`  ! skipping malformed line (needs "reference,amount"): ${trimmed}`);
      continue;
    }
    const parsed = parseFloat(amt);
    if (!isFinite(parsed) || parsed <= 0) {
      console.warn(`  ! skipping line with bad amount: ${trimmed}`);
      continue;
    }
    map.set(ref, parsed);
  }
  return map;
}

/** The amount the student was actually charged, which includes the gateway's fee. */
function chargedTotal(note: string, base: number): number {
  const m = note?.match(/\|total:([\d.]+)/);
  return m ? parseFloat(m[1]) : base;
}

async function verifyViaGateway(row: Row): Promise<{ verdict: Verdict; detail: string }> {
  const lookupId = row.gatewayId ?? row.providerRef;
  if (!lookupId) {
    return { verdict: "NO_ID", detail: "no gateway id and no reference on the row" };
  }
  if (!row.gatewayId) {
    // Pre-fix rows never stored the gateway's own id. Our SH-... reference is not
    // something the info endpoint accepts, so this will almost certainly fail —
    // it is attempted anyway in case the gateway also indexes by reference.
  }

  const info = await getSha7nawyPaymentInfo(lookupId);
  if (!info.status || !info.data) {
    return { verdict: "UNKNOWN", detail: `gateway: ${String(info.message || "no answer").trim()} (code ${info.code})` };
  }

  const status = String(info.data.status || "").toLowerCase();
  if (!SHA7NAWY_PAID_STATUSES.includes(status)) {
    return { verdict: "NOT_PAID", detail: `gateway status = ${status || "unknown"}` };
  }

  const verifiedAmount = parseFloat(String(info.data.amount));
  const expected = chargedTotal(row.note, row.amount);
  if (!isFinite(verifiedAmount) || Math.abs(verifiedAmount - expected) > 0.01) {
    return { verdict: "AMOUNT_MISMATCH", detail: `gateway says ${verifiedAmount}, we recorded ${expected}` };
  }

  return { verdict: "PAID", detail: `confirmed ${verifiedAmount} EGP, status ${status}` };
}

function verifyViaFile(row: Row, confirmed: Map<string, number>): { verdict: Verdict; detail: string } {
  const key = row.providerRef ?? "";
  if (!key || !confirmed.has(key)) {
    return { verdict: "UNKNOWN", detail: "reference not present in the confirmation file" };
  }
  const fileAmount = confirmed.get(key)!;
  const expected = chargedTotal(row.note, row.amount);
  if (Math.abs(fileAmount - expected) > 0.01) {
    return { verdict: "AMOUNT_MISMATCH", detail: `file says ${fileAmount}, we recorded ${expected}` };
  }
  return { verdict: "PAID", detail: `confirmed from file at ${fileAmount} EGP` };
}

async function settle(row: Row): Promise<string> {
  return await prisma.$transaction(async (tx: any) => {
    // updateMany on the pending type makes this idempotent and safe to run beside
    // a live webhook: whichever claims the row first wins, the other sees count 0.
    const claim = await tx.balanceTransaction.updateMany({
      where: { id: row.id, type: SHA7NAWY_PENDING_TYPE },
      data: {
        type: SHA7NAWY_CREDITED_TYPE,
        note: `${row.note} — تسوية يدوية بعد تعطل تأكيد Sha7nawy`,
      },
    });
    if (claim.count === 0) return "already settled by another process — skipped";

    await tx.user.update({
      where: { id: row.userId },
      data: { balance: { increment: row.amount } },
    });

    const fulfillment = await fulfillPendingItemPurchase({ userId: row.userId, note: row.note, tx });
    return `credited ${row.amount} EGP · ${fulfillment?.message ?? "no item fulfillment"}`;
  });
}

(async () => {
  console.log(`\nSha7nawy reconciliation — source=${SOURCE} · mode=${APPLY ? "APPLY (writes)" : "DRY RUN (no writes)"}\n`);

  let confirmed = new Map<string, number>();
  if (SOURCE === "file") {
    if (!FILE) {
      console.error("--source=file requires --file=<path>");
      process.exit(1);
    }
    confirmed = loadConfirmedFile(FILE);
    console.log(`loaded ${confirmed.size} confirmed reference(s) from ${FILE}\n`);
  }

  const pending = await prisma.balanceTransaction.findMany({
    where: { type: SHA7NAWY_PENDING_TYPE },
    include: { user: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
  });

  console.log(`found ${pending.length} unfulfilled Sha7nawy payment(s)\n`);

  const rows: Row[] = [];
  for (const t of pending) {
    const row: Row = {
      id: t.id,
      userId: t.userId,
      userName: t.user?.name ?? "—",
      amount: t.amount,
      note: t.note ?? "",
      providerRef: t.providerRef ?? null,
      createdAt: t.createdAt,
      gatewayId: readSha7nawyGatewayId(t.note),
      verdict: "UNKNOWN",
      detail: "",
    };
    const res = SOURCE === "gateway" ? await verifyViaGateway(row) : verifyViaFile(row, confirmed);
    row.verdict = res.verdict;
    row.detail = res.detail;
    rows.push(row);
    process.stdout.write(".");
  }
  console.log("\n");

  const width = { name: 26, ref: 16 };
  console.log("VERDICT         DATE        AMOUNT  REFERENCE        STUDENT                     DETAIL");
  console.log("─".repeat(120));
  for (const r of rows) {
    console.log(
      `${r.verdict.padEnd(15)} ${r.createdAt.toISOString().slice(0, 10)} ${String(r.amount).padStart(7)}  ` +
        `${(r.providerRef ?? "—").padEnd(width.ref)} ${(r.userName || "—").slice(0, width.name).padEnd(width.name)} ${r.detail}`
    );
  }

  const paid = rows.filter((r) => r.verdict === "PAID");
  const totals = rows.reduce<Record<string, { n: number; egp: number }>>((acc, r) => {
    acc[r.verdict] ??= { n: 0, egp: 0 };
    acc[r.verdict].n += 1;
    acc[r.verdict].egp += r.amount;
    return acc;
  }, {});

  console.log("\nSUMMARY");
  for (const [verdict, v] of Object.entries(totals)) {
    console.log(`  ${verdict.padEnd(16)} ${String(v.n).padStart(3)} payment(s)  ${v.egp.toFixed(2)} EGP`);
  }

  if (!APPLY) {
    console.log(
      `\nDRY RUN — nothing written. ${paid.length} payment(s) would be settled ` +
        `(${paid.reduce((s, r) => s + r.amount, 0).toFixed(2)} EGP).`
    );
    console.log("Re-run with --apply to settle exactly the rows marked PAID above.\n");
    await prisma.$disconnect();
    return;
  }

  if (paid.length === 0) {
    console.log("\nNothing confirmed as paid — nothing to apply. No rows were touched.\n");
    await prisma.$disconnect();
    return;
  }

  console.log(`\nAPPLYING to ${paid.length} confirmed payment(s)…\n`);
  let ok = 0;
  for (const r of paid) {
    try {
      const result = await settle(r);
      console.log(`  ✓ ${r.providerRef ?? r.id} (${r.userName}) — ${result}`);
      ok += 1;
    } catch (e: any) {
      console.error(`  ✗ ${r.providerRef ?? r.id} (${r.userName}) — FAILED: ${e?.message ?? e}`);
    }
  }
  console.log(`\nSettled ${ok}/${paid.length}. Rows not marked PAID were left untouched.\n`);
  await prisma.$disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
