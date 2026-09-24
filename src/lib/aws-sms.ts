import { SNSClient, PublishCommand } from "@aws-sdk/client-sns";
import { normalizeEgyptPhone } from "@/lib/phone";
import { sendVerificationSms as sendZadxVerificationSms, type ZadxSendResult } from "@/lib/zadx-sms";

const awsRegion = process.env.AWS_REGION || "eu-north-1";

const snsClient = new SNSClient({
  region: awsRegion,
  credentials:
    process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
      ? {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID,
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        }
      : undefined,
});

export type AwsSmsResult = {
  method: "dev" | "sns" | "zadx";
  dev?: boolean;
  code?: string;
  messageId?: string;
  [key: string]: unknown;
};

async function sendSnsVerificationSms(phone: string, code: string): Promise<AwsSmsResult> {
  let toNumber: string;
  if (typeof phone === "string" && /^\+20\d{10}$/.test(phone)) {
    toNumber = phone;
  } else {
    toNumber = normalizeEgyptPhone(phone);
  }

  if (process.env.DEV_SKIP_SMS === "true" || process.env.BYPASS_PHONE_VERIFICATION === "true") {
    console.log(`[AWS SNS DEV_SKIP] Skipping SMS to ${toNumber} — code=${code}`);
    return { dev: true, code, method: "dev" };
  }

  const message = `رمز التحقق من Code-UP: ${code}. ينتهي خلال 10 دقائق.`;

  const command = new PublishCommand({
    Message: message,
    PhoneNumber: toNumber,
    MessageAttributes: {
      "AWS.SNS.SMS.SMSType": {
        DataType: "String",
        StringValue: "Transactional",
      },
      "AWS.SNS.SMS.SenderID": {
        DataType: "String",
        StringValue: "CodeUP",
      },
    },
  });

  try {
    const response = await snsClient.send(command);
    console.log(`[AWS SNS SMS] Message sent to ${toNumber}; MessageId=${response.MessageId}`);
    return { method: "sns", messageId: response.MessageId };
  } catch (err: any) {
    console.error(`[AWS SNS SMS] Error sending SMS to ${toNumber}:`, err);
    throw new Error(`AWS SNS SMS delivery failed: ${err?.message || err}`);
  }
}

/**
 * Default SMS path is ZADX (Egyptian OTP). Set SMS_PROVIDER=sns to roll back
 * to Amazon SNS without a code change.
 */
export async function sendVerificationSms(phone: string, code: string): Promise<AwsSmsResult | ZadxSendResult> {
  const provider = (process.env.SMS_PROVIDER || "zadx").toLowerCase();
  if (provider === "sns") {
    return sendSnsVerificationSms(phone, code);
  }
  return sendZadxVerificationSms(phone, code);
}

/**
 * Dev-only escape hatch that treats every phone as verified.
 *
 * Refused in production: with it on, `/api/auth/reset-password` accepts no code
 * at all, so anyone could reset any account by phone number alone.
 */
export function isPhoneVerificationBypassed() {
  if (process.env.BYPASS_PHONE_VERIFICATION !== "true") return false;
  if (process.env.NODE_ENV === "production") {
    console.error(
      "[security] BYPASS_PHONE_VERIFICATION is set in production and is being ignored — " +
        "it would allow password reset without an OTP. Remove it from the environment."
    );
    return false;
  }
  return true;
}
