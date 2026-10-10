import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { logAdminAction } from "@/lib/admin-auth";
import { cairoDateKey } from "@/lib/superadmin-copilot/dates";
import { COPILOT_TOOLS, type CopilotChart, type CopilotKpi, type CopilotMessage, type CopilotProposal, type CopilotTable } from "@/lib/superadmin-copilot/types";
import { executeCopilotTool, TOOL_LABELS } from "@/lib/superadmin-copilot/tools";
import { copilotChat, listCopilotModels, preferredCopilotModel } from "@/lib/superadmin-copilot/provider";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

async function requireSuperadmin() {
  const session = await getSession();
  if (!session || (session.role !== "superadmin" && !session.isOwner)) {
    return { session: null as null, error: NextResponse.json({ error: "غير مصرح — هذا المساعد للمشرف العام فقط" }, { status: 403 }) };
  }
  if (session.demoTour) {
    return { session: null as null, error: NextResponse.json({ error: "الجولة التجريبية لا تصل لبيانات المقر الحقيقية" }, { status: 403 }) };
  }
  return { session, error: null };
}

function systemPrompt(): string {
  const today = cairoDateKey();
  return `You are the Superadmin HQ copilot for Code-UP (منصة Code-UP). Superadmin only.

HARD RULE — you never edit code, files, money, or SQL yourself:
- never write/edit/delete files
- never run shell that changes state
- never restart PM2, nginx, postgres
- never deploy, migrate, commit, push
- never confirm payments, change wallet balances, delete users
If the user asks you to fix/restart/deploy, inspect the problem, then tell THEM the exact command or file to change. Do not do it.

You MAY prepare exactly two student edits. Preparing does NOT save. Nothing changes until the superadmin presses the confirm button in the chat:
- propose_points_change: leaderboard points only. mode "add" for "plus 100" / "زود 100" (negative amount subtracts). mode "set" for "make the points 500".
- propose_grade_change: one quiz or homework official percentage (الدرجة), 0 to 100. Call list_student_grades first and pass its targetId. Use which "latest" only when they explicitly said the latest exam. Do not rewrite individual answers.
If more than one student or exam matches, ask which one. Never guess. After a proposal, say what will change and that it is NOT saved yet. Never claim the change is done.

You MAY also: read source files (read_file), search code (search_code), list dirs, tail named logs, inspect_health, inspect_git, and all HQ money/student/price tools (those are database reads).

Jail: only files under Thefake. .env, keys, credentials, node_modules, .git objects are blocked. Log secrets are redacted.

Today is ${today} in Africa/Cairo. Date ranges like "from 9 september to the 20" → 2026-09-09 through 2026-09-20.

YOU MUST call tools for numbers and for code claims. Never invent net, student counts, or file contents.
For bugs: search_code → read_file the hit → read_logs / inspect_health if it looks like a runtime issue. Quote file:line.
Reply in the user's language. Headline, then bullets, then "what you should do" (instructions only).`;
}

export async function GET() {
  const gate = await requireSuperadmin();
  if (gate.error) return gate.error;

  const models = listCopilotModels();
  const primary = preferredCopilotModel();
  return NextResponse.json({
    ok: true,
    today: cairoDateKey(),
    timezone: "Africa/Cairo",
    model: primary,
    models,
    suggestions: [
      { label: "صافي ٩–٢٠ سبتمبر مع رسم", prompt: "ما هو صافي ربح المنصة من 9 سبتمبر إلى 20 سبتمبر؟ أظهر الرسم البياني اليومي." },
      { label: "ملخص المقر الآن", prompt: "أعطني ملخص المقر الآن: الطلاب، الحجوزات السارية، الصافي، والمعلّق." },
      { label: "أسعار الباقات والكورسات", prompt: "اعرض أسعار خطط الحجز لكل معلم وأسعار الكورسات المدفوعة." },
      { label: "ترتيب المعلمين", prompt: "من أعلى المعلمين إيراداً في آخر أسبوعين؟" },
      { label: "المدفوعات المعلقة", prompt: "من العالق في الدفع وما المبلغ المعلّق؟" },
      { label: "تسجيلات آخر ١٤ يوم", prompt: "كم طالب سجّل من آخر 14 يوم؟ أظهر الرسم." },
      { label: "قارن هذا الأسبوع باللي فات", prompt: "قارن صافي هذا الأسبوع بالأسبوع السابق مع رسم." },
      { label: "افحص صحة السيرفر", prompt: "افحص صحة السيرفر: PM2، الذاكرة، القرص، وBUILD_ID. قراءة فقط." },
      { label: "آخر أخطاء PM2", prompt: "اقرأ آخر أخطاء pm2-error وقل لي ما المشكلة — بدون أي إجراء." },
      { label: "ابحث في الكود عن الدفع", prompt: "ابحث في الكود عن pending payment وافتح الملف المسؤول. لا تعدّل شيئاً." },
      { label: "زوّد نقاط طالب", prompt: "ابحث عن الطالب بالاسم الذي سأكتبه، ثم جهّز زيادة نقاطه 100. لا تحفظ قبل ما أضغط تأكيد." },
      { label: "عدّل درجة اختبار", prompt: "اعرض درجات الطالب الذي سأسميه، ثم جهّز جعل درجة الاختبار الذي أحدده 30٪. لا تحفظ قبل التأكيد." },
    ],
  });
}

export async function POST(req: NextRequest) {
  const gate = await requireSuperadmin();
  if (gate.error) return gate.error;
  const session = gate.session!;

  let body: { messages?: CopilotMessage[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "طلب غير صالح" }, { status: 400 });
  }

  const incoming = Array.isArray(body.messages) ? body.messages.slice(-16) : [];
  const lastUser = [...incoming].reverse().find((m) => m.role === "user");
  if (!lastUser?.content?.trim()) {
    return NextResponse.json({ error: "اكتب سؤالاً" }, { status: 400 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: unknown) => {
        controller.enqueue(encoder.encode(`${JSON.stringify(obj)}\n`));
      };
      try {
        const primary = preferredCopilotModel();
        send({ type: "hello", model: primary });

        type LoopMsg =
          | { role: "system"; content: string }
          | { role: "user"; content: string }
          | { role: "assistant"; content: string | null; tool_calls?: Array<{ id: string; type: "function"; function: { name: string; arguments: string } }> }
          | { role: "tool"; tool_call_id: string; content: string };

        const messages: LoopMsg[] = [
          { role: "system", content: systemPrompt() },
          ...incoming
            .filter((m) => m.role === "user" || m.role === "assistant")
            .map((m) => ({ role: m.role, content: m.content.slice(0, 8000) })),
        ];

        const charts: CopilotChart[] = [];
        const tables: CopilotTable[] = [];
        const kpis: CopilotKpi[] = [];
        const proposals: CopilotProposal[] = [];
        const toolsUsed: Array<{ name: string; label: string; ok: boolean; summary: string }> = [];
        let usedModel = primary;

        for (let round = 0; round < 5; round++) {
          send({ type: "status", text: round === 0 ? "يفكر ويحدد ماذا يجلب من المقر..." : "يكمل التحليل بعد النتائج..." });
          const result = await copilotChat({
            messages,
            tools: COPILOT_TOOLS,
            signal: req.signal,
          });
          usedModel = result.model;
          send({ type: "hello", model: result.model });

          if (result.error || !result.message) {
            send({ type: "error", message: result.error || "النموذج لم يرجع رداً" });
            controller.close();
            return;
          }

          const toolCalls = result.message.tool_calls?.filter((c) => c?.function?.name) || [];
          if (!toolCalls.length) {
            send({
              type: "done",
              message: (result.message.content || "").trim() || "لا توجد إجابة.",
              model: result.model,
              charts,
              tables,
              kpis,
              proposals,
              toolsUsed,
            });
            controller.close();
            return;
          }

          messages.push({
            role: "assistant",
            content: result.message.content,
            tool_calls: toolCalls,
          });

          for (const call of toolCalls) {
            const label = TOOL_LABELS[call.function.name] || call.function.name;
            send({ type: "tool_start", id: call.id, name: call.function.name, label });
            let toolResult;
            try {
              toolResult = await executeCopilotTool(call.function.name, call.function.arguments || "{}");
            } catch (err) {
              toolResult = {
                ok: false,
                summary: err instanceof Error ? err.message : "فشل تنفيذ الأداة",
                data: null,
              };
            }
            if (toolResult.charts) charts.push(...toolResult.charts);
            if (toolResult.tables) tables.push(...toolResult.tables);
            if (toolResult.kpis) kpis.push(...toolResult.kpis);
            if (toolResult.proposal) proposals.push(toolResult.proposal);
            toolsUsed.push({
              name: call.function.name,
              label,
              ok: toolResult.ok,
              summary: toolResult.summary,
            });
            send({ type: "tool_end", id: call.id, ok: toolResult.ok, summary: toolResult.summary });
            messages.push({
              role: "tool",
              tool_call_id: call.id,
              content: JSON.stringify({
                summary: toolResult.summary,
                data: toolResult.data,
                awaitingConfirm: Boolean(toolResult.proposal),
              }).slice(0, 12000),
            });
          }
        }

        send({
          type: "done",
          message: "وصلت لحد الأدوات. هذا ما جمعته من المقر — أعد صياغة السؤال إن احتجت تفصيلاً أكثر.",
          model: usedModel,
          charts,
          tables,
          kpis,
          proposals,
          toolsUsed,
        });
        controller.close();
      } catch (err) {
        if (req.signal.aborted) {
          controller.close();
          return;
        }
        send({ type: "error", message: err instanceof Error ? err.message : "فشل المساعد" });
        controller.close();
      }
    },
  });

  void logAdminAction({
    adminId: session.id,
    adminName: session.name || "مشرف عام",
    action: "SUPERADMIN_COPILOT_QUERY",
    targetType: "AI",
    targetId: session.id,
    targetName: "superadmin-copilot",
    metadata: { prompt: lastUser.content.slice(0, 400) },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
