import { NextRequest, NextResponse } from "next/server";
import { getSupportSession, logSupportAction } from "@/lib/support-auth";
import { getConfigBool, setConfig } from "@/lib/config";

/**
 * The only two platform settings this panel may touch. Anything else stays in
 * the superadmin config screen — a support login should not be able to change
 * JWT expiry or purge thresholds.
 */
const ALLOWED_KEYS = ["quiz_time_limit_disabled", "homework_deadline_disabled"] as const;
type AllowedKey = (typeof ALLOWED_KEYS)[number];

export async function GET() {
  const support = await getSupportSession();
  if (!support) return NextResponse.json({ error: "غير مصرح" }, { status: 401 });

  const [quizOpen, homeworkOpen] = await Promise.all([
    getConfigBool("quiz_time_limit_disabled"),
    getConfigBool("homework_deadline_disabled"),
  ]);

  return NextResponse.json({
    quiz_time_limit_disabled: quizOpen,
    homework_deadline_disabled: homeworkOpen,
  });
}

export async function POST(req: NextRequest) {
  const support = await getSupportSession();
  if (!support) return NextResponse.json({ error: "غير مصرح" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { key?: string; value?: boolean };
  const key = String(body.key || "") as AllowedKey;

  if (!ALLOWED_KEYS.includes(key)) {
    return NextResponse.json({ error: "هذا الإعداد غير متاح من لوحة الدعم" }, { status: 400 });
  }
  if (typeof body.value !== "boolean") {
    return NextResponse.json({ error: "القيمة يجب أن تكون true أو false" }, { status: 400 });
  }

  await setConfig(key, body.value);

  await logSupportAction({
    action: "SUPPORT_UPDATE_PLATFORM_SETTING",
    targetType: "platform_config",
    targetId: key,
    targetName: `${key} = ${body.value}`,
    metadata: { agent: support.agent },
  });

  return NextResponse.json({ ok: true, key, value: body.value });
}
