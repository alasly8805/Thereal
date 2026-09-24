import { randomUUID } from "crypto";
import { normalizeEgyptPhone } from "@/lib/phone";

const ZADX_API_BASE = process.env.ZADX_API_BASE || "https://smsapi.zadx.net/api/v1";

export type ZadxSendResult = {
  method: "dev" | "zadx";
  dev?: boolean;
  code?: string;
  id?: number;
  status?: string;
  remaining_credits?: number;
  [key: string]: unknown;
};

export class ZadxSmsError extends Error {
  status: number;
  code: string;

  constructor(message: string, status: number, code: string) {
    super(message);
    this.name = "ZadxSmsError";
    this.status = status;
    this.code = code;
  }
}

function maskPhone(phone: string) {
  return phone.replace(/\d(?=\d{4})/g, "*");
}

function toEgyptMobile(phone: string): string {
  if (typeof phone === "string" && /^\+20\d{10}$/.test(phone)) {
    return phone;
  }
  return normalizeEgyptPhone(phone);
}

function getCredentials() {
  const apiKey = process.env.ZADX_API_KEY;
  const apiSecret = process.env.ZADX_API_SECRET;
  if (!apiKey || !apiSecret) {
    throw new Error("ZADX credentials missing. Set ZADX_API_KEY and ZADX_API_SECRET");
  }
  return { apiKey, apiSecret };
}

function authHeaders(idempotencyKey?: string): Record<string, string> {
  const { apiKey, apiSecret } = getCredentials();
  const headers: Record<string, string> = {
    "X-Api-Key": apiKey,
    "X-Api-Secret": apiSecret,
    Accept: "application/json",
  };
  if (idempotencyKey) {
    headers["Idempotency-Key"] = idempotencyKey;
    headers["Content-Type"] = "application/json";
  }
  return headers;
}

function parseError(status: number, body: string): ZadxSmsError {
  try {
    const json = JSON.parse(body);
    const code = json?.error?.code || "unknown_error";
    const message = json?.error?.message || body || `ZADX error ${status}`;
    return new ZadxSmsError(message, status, String(code));
  } catch {
    return new ZadxSmsError(body || `ZADX error ${status}`, status, "unknown_error");
  }
}

/**
 * One provider attempt only. ZADX never auto-retries OTP, and a timeout
 * becomes pending_verification with credits reserved — do not resend.
 */
async function zadxFetch(path: string, init: RequestInit): Promise<Response> {
  const res = await fetch(`${ZADX_API_BASE}${path}`, init);
  return res;
}

export async function sendVerificationSms(phone: string, code: string): Promise<ZadxSendResult> {
  const otp = String(code || "").trim();
  if (!/^[A-Za-z0-9]{4,6}$/.test(otp)) {
    throw new Error("OTP must be 4 to 6 alphanumeric characters");
  }

  const toNumber = toEgyptMobile(phone);

  if (process.env.DEV_SKIP_SMS === "true" || process.env.BYPASS_PHONE_VERIFICATION === "true") {
    console.log(`[ZADX DEV_SKIP] Skipping SMS to ${maskPhone(toNumber)} — code=${otp}`);
    return { method: "dev", dev: true, code: otp };
  }

  const senderId = process.env.ZADX_SENDER_ID || "ZADX";
  const locale = process.env.ZADX_LOCALE || "ar";
  const body = {
    to: toNumber,
    otp,
    sender_id: senderId,
    locale,
  };
  const idempotencyKey = `otp-${toNumber}-${otp}`;

  const res = await zadxFetch("/otp/send", {
    method: "POST",
    headers: authHeaders(idempotencyKey),
    body: JSON.stringify(body),
  });

  const text = await res.text();
  if (!res.ok) {
    const err = parseError(res.status, text);
    console.error(`[ZADX OTP] send failed to ${maskPhone(toNumber)}: ${res.status} ${err.code} ${err.message}`);
    throw err;
  }

  const json = text ? JSON.parse(text) : {};
  console.log(
    `[ZADX OTP] ${json.status || "accepted"} to ${maskPhone(toNumber)}; id=${json.id ?? "n/a"}; credits=${json.remaining_credits ?? "n/a"}`
  );
  return { ...json, method: "zadx" } as ZadxSendResult;
}

export async function sendTransactionalSms(phone: string, message: string): Promise<ZadxSendResult> {
  const toNumber = toEgyptMobile(phone);
  const senderId = process.env.ZADX_SENDER_ID || "ZADX";
  const body = {
    to: toNumber,
    message,
    sender_id: senderId,
  };

  const res = await zadxFetch("/sms/send", {
    method: "POST",
    headers: authHeaders(randomUUID()),
    body: JSON.stringify(body),
  });

  const text = await res.text();
  if (!res.ok) {
    throw parseError(res.status, text);
  }
  const json = text ? JSON.parse(text) : {};
  return { ...json, method: "zadx" } as ZadxSendResult;
}

export async function getZadxBalance(): Promise<unknown> {
  const res = await zadxFetch("/sms/balance", {
    method: "GET",
    headers: authHeaders(),
  });
  const text = await res.text();
  if (!res.ok) {
    throw parseError(res.status, text);
  }
  return text ? JSON.parse(text) : {};
}
