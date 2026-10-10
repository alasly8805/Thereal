/**
 * Sha7nawy Payment Gateway SDK Service (https://gate.sha7nawy.com)
 * Handles payment transactions for Sha7nawy-routed mobile wallet providers:
 * - Vodafone Cash (vf_cash) -> *9*1# prompt
 * - Etisalat Cash (et_cash) -> e& Money App prompt
 * - Orange Cash (or_cash)   -> Orange Cash app prompt
 * (Fawry is the only method routed via Shake-Out at dash.shake-out.com)
 */

import { getPaymentMethod, PAYMENT_METHODS } from "./payment-methods";

export type Sha7nawyWalletMethod =
  | "vf_cash"
  | "or_cash"
  | "et_cash"
  | "we_pay"
  | "instapay"
  | "fawry"
  | "bank_card"
  | "meeza"
  | "wallet_balance"
  | "voucher"
  | "bank_transfer"
  | (string & {});

export interface CreatePaymentParams {
  number: string;
  amount: number;
  method: Sha7nawyWalletMethod;
  client?: string;
  details?: string;
  webhook_url?: string;
}

export interface Sha7nawyPaymentData {
  id: number;
  amount: string;
  number: string;
  method: Sha7nawyWalletMethod;
  reference: string;
  status: string;
  client?: string;
  details?: string;
  transaction_id?: string;
  provider_transaction_id?: string;
  transaction_Time?: string;
  last_updated?: string;
  created_at?: string;
  updated_at?: string;
  payment_page_url?: string;
  url?: string;
}

export interface Sha7nawyCreateResponse {
  status: boolean;
  code: number;
  message: string;
  data?: Sha7nawyPaymentData;
  error?: string;
}

/**
 * Dynamic lookup helper that resolves labels from central PAYMENT_METHODS.
 */
export const WALLET_METHOD_LABELS: Record<string, string> = Object.fromEntries(
  PAYMENT_METHODS.map((m) => [m.id, m.label])
);

/**
 * Dynamic lookup helper that resolves instructions from central PAYMENT_METHODS.
 */
export const WALLET_INSTRUCTIONS: Record<string, string> = Object.fromEntries(
  PAYMENT_METHODS.map((m) => [m.id, m.shortNote])
);

// Ledger types + note format used to bind Sha7nawy webhooks to the pending
// payment that was recorded when a logged-in user initiated the payment.
export const SHA7NAWY_PENDING_TYPE = "credit_sha7nawy_pending";
export const SHA7NAWY_CREDITED_TYPE = "credit_sha7nawy_wallet";

export const SHA7NAWY_PAID_STATUSES = ["completed", "paid", "settled", "success"];

export function sha7nawyRefNote(reference: string): string {
  return `sha7nawy_ref:${reference}`;
}

/**
 * The gateway's own transaction id, tagged into the pending row's note.
 *
 * Verification lookups only work with this id — our SH-... reference is not
 * something the gateway's info endpoint recognises — so it has to be captured
 * when the payment is created and carried on the ledger row.
 */
export function sha7nawyGatewayIdNote(gatewayId: string | number): string {
  return `gwid:${gatewayId}`;
}

/** Reads the gateway transaction id back out of a pending row's note. */
export function readSha7nawyGatewayId(note: string | null | undefined): string | null {
  if (!note) return null;
  const m = note.match(/\|gwid:([A-Za-z0-9_-]+)/);
  return m ? m[1] : null;
}

/**
 * Calculates tax/fee on base payment amount based on the selected method config
 */
export function calculateAmountWithTax(
  baseAmount: number,
  methodId: string = "vf_cash"
): { baseAmount: number; taxAmount: number; totalAmount: number; feePercentage: number } {
  const method = getPaymentMethod(methodId);
  const feePct = method?.feePercentage ?? 2;
  const taxAmount = Math.round(baseAmount * (feePct / 100) * 100) / 100;
  const totalAmount = Math.round((baseAmount + taxAmount) * 100) / 100;
  return { baseAmount, taxAmount, totalAmount, feePercentage: feePct };
}

/**
 * Normalizes phone number format supporting:
 * - Arabic-Indic (٠١٢٣٤٥٦٧٨٩) and Eastern Arabic (۰۱۲۳۴۵۶۷۸۹) numerals
 * - International (+20, 0020, 20) and local prefixes (010, 10)
 * - Removing whitespace, hyphens, and non-digit characters
 */
export function normalizeEgyptianPhone(phone: string): string {
  if (!phone) return "";
  const raw = String(phone).trim();
  const arabicMap: Record<string, string> = {
    "٠": "0", "١": "1", "٢": "2", "٣": "3", "٤": "4", "٥": "5", "٦": "6", "٧": "7", "٨": "8", "٩": "9",
    "۰": "0", "۱": "1", "۲": "2", "۳": "3", "۴": "4", "۵": "5", "۶": "6", "۷": "7", "۸": "8", "۹": "9",
  };
  const cleaned = raw.replace(/[٠-٩۰-۹]/g, (d) => arabicMap[d] || d);
  let digits = cleaned.replace(/\D/g, "");

  if (digits.startsWith("0020") && digits.length >= 13) {
    digits = "0" + digits.slice(4);
  } else if (digits.startsWith("20") && digits.length >= 12) {
    digits = "0" + digits.slice(2);
  } else if ((digits.startsWith("10") || digits.startsWith("11") || digits.startsWith("12") || digits.startsWith("15")) && digits.length === 10) {
    digits = "0" + digits;
  }
  return digits;
}

/**
 * Validates a Vodafone Cash phone number (must be 11 digits starting with 010)
 */
export function validateVodafoneCashPhone(phone: string): boolean {
  const clean = normalizeEgyptianPhone(phone);
  return /^010\d{8}$/.test(clean);
}

/**
 * Validates a mobile wallet phone number across Egyptian carriers (010, 011, 012, 015)
 */
export function validateEgyptianPhone(phone: string): boolean {
  const clean = normalizeEgyptianPhone(phone);
  return /^01[0125]\d{8}$/.test(clean);
}

/**
 * True when the gateway says the number has no active wallet — e.g. Vodafone's
 * "العميل غير مشترك", which is what comes back for a plain Vodafone line
 * without Vodafone Cash, or a student typing their own number when the wallet
 * is on a parent's line.
 */
export function isWalletNotRegisteredMessage(message: string): boolean {
  return /غير\s*مشترك|مش\s*مشترك|غير\s*مسجل|لا\s*توجد\s*محفظة|not\s*(subscribed|registered)|unregistered|no\s*wallet|wallet\s*not\s*found/i.test(
    message
  );
}

/**
 * Creates a mobile wallet or gateway payment request via Payment Gateway API
 */
export async function createSha7nawyPayment(
  params: CreatePaymentParams
): Promise<Sha7nawyCreateResponse> {
  const baseUrl = (process.env.SHA7NAWY_BASE_URL || "https://gate.sha7nawy.com").replace(/\/$/, "");
  const publicKey = process.env.SHA7NAWY_PUBLIC_KEY;

  if (!publicKey) {
    console.warn("[Payment API] Public key is not configured in environment");
    return {
      status: false,
      code: 400,
      message: "بوابة الدفع المباشر قيد الصيانة المؤقتة. يرجى اختيار وسيلة دفع أخرى.",
    };
  }

  const methodConfig = getPaymentMethod(params.method);
  if (methodConfig && !methodConfig.available) {
    return {
      status: false,
      code: 400,
      message: methodConfig.unavailableNote || `طريقة الدفع (${methodConfig.label}) غير متاحة حالياً.`,
    };
  }

  // Validate phone number if method requires it
  let cleanPhone = params.number ? normalizeEgyptianPhone(params.number) : "01000000000";
  if (params.method === "vf_cash") {
    if (!validateVodafoneCashPhone(cleanPhone)) {
      return {
        status: false,
        code: 400,
        message: "رقم محفظة فودافون كاش غير صحيح — يجب أن يبدأ بـ 010 ويتكون من 11 رقماً (مثال: 010xxxxxxx)",
      };
    }
  } else if (methodConfig?.needsPhone) {
    if (!validateEgyptianPhone(cleanPhone)) {
      return {
        status: false,
        code: 400,
        message: "يرجى كتابة رقم هاتف المحفظة بشكل صحيح",
      };
    }
  }

  const minAmt = methodConfig?.minAmount ?? 5;
  const maxAmt = methodConfig?.maxAmount ?? 50000;
  if (!params.amount || params.amount < minAmt || params.amount > maxAmt) {
    return {
      status: false,
      code: 400,
      message: `المبلغ غير مسموح به — الحد الأدنى ${minAmt} جنيه والحد الأقصى ${maxAmt.toLocaleString()} جنيه`,
    };
  }

  const endpoint = `${baseUrl}/api/payment/create`;

  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/json",
        "Authorization": publicKey,
      },
      body: JSON.stringify({
        number: cleanPhone,
        amount: params.amount,
        method: params.method,
        client: params.client || "codeup-user",
        details: params.details || "Code-UP Balance Top-up",
        webhook_url: params.webhook_url,
      }),
      signal: AbortSignal.timeout(12000),
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok || data.status === false) {
      let rawMsg = String(data.message || data.error || "").trim();
      let normalizedMsg = rawMsg;

      // Record every gateway rejection so wallet failures can be diagnosed later.
      // Only the last 3 digits of the wallet number are kept.
      console.warn(
        `[Sha7nawy Create] Rejected (HTTP ${res.status}) method=${params.method} number=*******${cleanPhone.slice(-3)} message=${JSON.stringify(rawMsg)}`
      );

      if (isWalletNotRegisteredMessage(rawMsg)) {
        normalizedMsg =
          params.method === "vf_cash"
            ? "الرقم ده مفيش عليه محفظة فودافون كاش مفعّلة. اكتب الرقم اللي عليه المحفظة (ممكن يكون رقم ولي الأمر)، أو ادفع بإنستاباي أو فوري."
            : "الرقم ده مفيش عليه محفظة مفعّلة لطريقة الدفع دي. اكتب الرقم اللي عليه المحفظة، أو ادفع بإنستاباي أو فوري.";
      } else if (!rawMsg || rawMsg.toLowerCase().includes("provider error") || rawMsg.toLowerCase().includes("internal server error")) {
        normalizedMsg = "خدمة الخصم التلقائي للمحفظة تواجه صيانة مؤقتة لدى شبكة الاتصالات. يمكنك استخدام إنستاباي (InstaPay) أو فوري لإتمام الدفع فوراً.";
      } else if (rawMsg.includes("Unauthorized") || rawMsg.includes("401")) {
        normalizedMsg = "بوابة الدفع قيد التحديث المؤقت. يرجى اختيار وسيلة دفع بديلة مثل إنستاباي أو فوري.";
      }

      return {
        status: false,
        code: res.status !== 200 ? res.status : 400,
        message: normalizedMsg,
      };
    }

    const shortNote = methodConfig?.shortNote || WALLET_INSTRUCTIONS[params.method] || "تم بدء العملية بنجاح";

    return {
      status: data.status ?? true,
      code: data.code ?? 200,
      message: data.message || shortNote,
      data: data.data,
    };
  } catch (error: any) {
    console.error("[Gateway API] Error calling create payment:", error);
    return {
      status: false,
      code: 500,
      message: "تعذر الاتصال بشبكة المحفظة الإلكترونية حالياً. يرجى تجربة إنستاباي أو فوري للإتمام الفوري.",
    };
  }
}

/**
 * Confirms a payment transaction using ref_code
 */
export async function confirmSha7nawyPayment(ref_code: string): Promise<Sha7nawyCreateResponse> {
  const baseUrl = (process.env.SHA7NAWY_BASE_URL || "https://gate.sha7nawy.com").replace(/\/$/, "");
  const publicKey = process.env.SHA7NAWY_PUBLIC_KEY;

  if (!publicKey) {
    return { status: false, code: 400, message: "مفتاح الربط مع Sha7nawy غير مهيأ" };
  }

  try {
    const res = await fetch(`${baseUrl}/api/payment/confirm`, {
      method: "POST",
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/json",
        "Authorization": publicKey,
      },
      body: JSON.stringify({ ref_code }),
    });

    const data = await res.json().catch(() => ({}));
    return {
      status: data.status ?? res.ok,
      code: data.code ?? res.status,
      message: data.message || (res.ok ? "تم التأكيد بنجاح" : "تعذر التأكيد"),
      data: data.data,
    };
  } catch (error: any) {
    console.error("[Gateway API] Error calling confirm payment:", error);
    return { status: false, code: 500, message: "تعذر الاتصال بسيرفر التأكيد" };
  }
}

/**
 * Server-to-server payment verification (Secret Key Auth)
 */
export async function getSha7nawyPaymentInfo(transaction_id: string | number): Promise<Sha7nawyCreateResponse> {
  const baseUrl = (process.env.SHA7NAWY_BASE_URL || "https://gate.sha7nawy.com").replace(/\/$/, "");
  const secretKey = process.env.SHA7NAWY_SECRET_KEY;

  if (!secretKey) {
    return { status: false, code: 400, message: "مفتاح الاستعلام مع Sha7nawy غير مهيأ" };
  }

  try {
    // The gateway exposes this as a query parameter. The path form
    // (/api/payment/info/{id}) is not a route on their side and answers with an
    // HTML 404 from their nginx, which made every verification fail — and since
    // verification is mandatory in the webhook, no Sha7nawy payment could ever
    // be fulfilled. Pass the gateway's own numeric transaction id here (the `id`
    // field of the create response), not our own SH-... reference.
    const res = await fetch(`${baseUrl}/api/payment/info?transaction_id=${encodeURIComponent(String(transaction_id))}`, {
      method: "GET",
      headers: {
        "Accept": "application/json",
        "Authorization": secretKey,
      },
      signal: AbortSignal.timeout(12000),
    });

    const data = await res.json().catch(() => ({}));
    return {
      status: data.status ?? res.ok,
      code: data.code ?? res.status,
      message: data.message || "تم استعلام البيانات بنجاح",
      data: data.data,
    };
  } catch (error: any) {
    console.error("[Gateway API] Error querying payment info:", error);
    return { status: false, code: 500, message: "تعذر الاستعلام من سيرفر التأكيد" };
  }
}
