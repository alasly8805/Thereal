import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { AIEngine } from "@/ai/AIEngine";

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session || (session.role !== "superadmin" && session.role !== "owner")) {
      return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
    }

    const { prompt, subject } = await req.json();
    if (!prompt) {
      return NextResponse.json({ error: "السؤال مطلوب" }, { status: 400 });
    }

    const startTime = Date.now();
    const engine = new AIEngine();

    const response = await engine.processRequest({
      userMessage: prompt,
      studentId: session.id,
      subject: subject || "عام",
      grade: "3",
    });

    const latency = Date.now() - startTime;

    const tokens = (response.telemetry?.inputTokens || 0) + (response.telemetry?.outputTokens || 0);
    const content = response.formattedResponse?.renderedContent || response.formattedResponse?.rawContent || "";
    if (!content) {
      return NextResponse.json({ error: "لم يرجع المحرك أي إجابة" }, { status: 502 });
    }
    return NextResponse.json({
      response: content,
      latency,
      tokens: tokens > 0 ? tokens : null,
      provider: response.telemetry?.provider ?? null,
    });
  } catch (err) {
    console.error("AI Playground API error:", err);
    return NextResponse.json({ error: "حدث خطأ أثناء معالجة الطلب" }, { status: 500 });
  }
}
