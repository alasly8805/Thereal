import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";

const GEMINI_KEYS = [
  process.env.GEMINI_KEY_1 || process.env.GEMINI_API_KEY || "",
  process.env.GEMINI_KEY_2 || process.env.GEMINI_API_KEY_SECONDARY || "",
  process.env.GEMINI_KEY_3 || "",
].filter(Boolean);
const BACKUP_BASE_RAW = process.env.AI_BACKUP_BASE_URL || "https://generativelanguage.googleapis.com/v1beta";
const BACKUP_BASE_URL = BACKUP_BASE_RAW.replace(/\/+$/, "");
const BACKUP_MODEL = process.env.AI_BACKUP_MODEL || "gemini-flash-lite-latest";

// ── Per-user in-process rate limit (5 req / 60 s) ─────────────────────────────
const AI_RATE_WINDOW_MS = 60_000;
const AI_RATE_MAX = 5;
const aiRateMap = new Map<string, { count: number; windowStart: number }>();

function checkAiRateLimit(userId: string): boolean {
  const now = Date.now();
  const entry = aiRateMap.get(userId);
  if (!entry || now - entry.windowStart > AI_RATE_WINDOW_MS) {
    aiRateMap.set(userId, { count: 1, windowStart: now });
    return true;
  }
  if (entry.count >= AI_RATE_MAX) return false;
  entry.count++;
  return true;
}

async function callGeminiFallback(
  messages: { role: string; content: string }[]
): Promise<string | null> {
  if (GEMINI_KEYS.length === 0) return null;
  const prompt = messages.map((m) => `${m.role}: ${m.content}`).join("\n");
  const geminiBase = BACKUP_BASE_URL.endsWith("/models")
    ? BACKUP_BASE_URL
    : `${BACKUP_BASE_URL}/models`;
  const models = Array.from(
    new Set([BACKUP_MODEL, "gemini-flash-lite-latest", "gemini-flash-latest", "gemini-2.5-pro"])
  );

  for (const key of GEMINI_KEYS) {
    for (const model of models) {
      try {
        const url = `${geminiBase}/${model}:generateContent?key=${key}`;
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.7, maxOutputTokens: 1200 },
          }),
          signal: AbortSignal.timeout(10_000),
        });
        if (!res.ok) {
          if (res.status === 401 || res.status === 403) break;
          continue;
        }
        const data = await res.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) return text;
      } catch {
        continue;
      }
    }
  }
  return null;
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
  }

  // Rate limit
  if (!checkAiRateLimit(session.id)) {
    return NextResponse.json(
      { error: "حد الطلبات تجاوزت. حاول بعد دقيقة." },
      { status: 429 }
    );
  }

  let body: { messages?: unknown; courses?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { messages, courses } = body;

  // Guard: messages must be an array, cap at 20 items, each content max 2000 chars
  if (!Array.isArray(messages)) {
    return NextResponse.json({ error: "messages must be an array" }, { status: 400 });
  }
  const safeMessages = (messages as { role?: unknown; content?: unknown }[])
    .slice(0, 20)
    .filter((m) => typeof m.role === "string" && typeof m.content === "string")
    .map((m) => ({
      role: String(m.role).slice(0, 50),
      content: String(m.content).slice(0, 2000),
    }));

  // Guard: courses must be an array of strings, cap at 30 items
  const safeCourses = Array.isArray(courses)
    ? (courses as unknown[]).slice(0, 30).map((c) => String(c).slice(0, 200))
    : [];

  const systemPrompt = [
    "أنت مساعد تدريبي ذكي لمنصة كورسات مصرية. مهمتك مساعدة المتعلمين في وضع خطط تدريبية يومية.",
    `الكورسات المسجل فيها المتعلم: ${safeCourses.join(", ") || "لا يوجد كورسات"}`,
    "أجب باللغة العربية دائمًا. كن مفيدًا وداعمًا.",
  ].join("\n");

  const formattedMessages = [
    { role: "system", content: systemPrompt },
    ...safeMessages,
  ];

  const reply =
    (await callGeminiFallback(formattedMessages)) ||
    "مساعد الذكاء الاصطناعي قيد التحديث والصيانة حاليًا، يرجى المحاولة مرة أخرى لاحقًا \u23F3";

  return NextResponse.json({ reply });
}
