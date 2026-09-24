import { execFile } from "node:child_process";
import { accessSync, constants } from "node:fs";
import { promisify } from "node:util";
import type { CopilotModelInfo } from "./types";

const execFileAsync = promisify(execFile);

const AGY_BIN = "/home/ec2-user/.local/bin/agy";
const AGY_MODEL = process.env.SUPERADMIN_COPILOT_AGY_MODEL?.trim() || "gemini-3.8-flash-high";
const AGY_LABEL = "Gemini 3.8 Flash (High)";

type ChatMsg =
  | { role: "system"; content: string }
  | { role: "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: ToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string };

type ToolCall = {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
  extra_content?: unknown;
};

export type ProviderChatResult = {
  model: CopilotModelInfo;
  message?: { role: "assistant"; content: string | null; tool_calls?: ToolCall[] };
  error?: string;
};

type Provider = {
  id: string;
  label: string;
  provider: string;
  model: string;
  baseUrl: string;
  apiKey: string;
};

function agyInstalled(): boolean {
  try {
    accessSync(AGY_BIN, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

const AGY_INFO: CopilotModelInfo = {
  id: AGY_MODEL,
  label: AGY_LABEL,
  provider: "Antigravity (agy)",
  fallback: false,
};

function configuredHttpProviders(): Provider[] {
  const list: Provider[] = [];
  const deepseekKey = process.env.DEEPSEEK_API_KEY?.trim();
  if (deepseekKey) {
    list.push({
      id: "deepseek",
      label: "DeepSeek V3",
      provider: "DeepSeek",
      model: process.env.DEEPSEEK_MODEL?.trim() || "deepseek-chat",
      baseUrl: (process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com/v1").replace(/\/$/, ""),
      apiKey: deepseekKey,
    });
  }
  const geminiKey =
    process.env.GEMINI_KEY_1?.trim() ||
    process.env.GEMINI_API_KEY?.trim() ||
    process.env.AI_BACKUP_API_KEY?.trim();
  if (geminiKey) {
    const geminiBase = "https://generativelanguage.googleapis.com/v1beta/openai";
    list.push({
      id: "gemini",
      label: "Google Gemini 3.6 Flash (HTTP fallback)",
      provider: "Google",
      model: process.env.SUPERADMIN_COPILOT_GEMINI_MODEL?.trim() || "gemini-3.6-flash",
      baseUrl: geminiBase,
      apiKey: geminiKey,
    });
  }
  return list;
}

export function listCopilotModels(): CopilotModelInfo[] {
  const http = configuredHttpProviders().map((p, i) => ({
    id: p.model,
    label: p.label,
    provider: p.provider,
    fallback: agyInstalled() || i > 0,
  }));
  return agyInstalled() ? [AGY_INFO, ...http] : http;
}

export function preferredCopilotModel(): CopilotModelInfo | null {
  if (agyInstalled()) return AGY_INFO;
  const p = configuredHttpProviders()[0];
  if (!p) return null;
  return { id: p.model, label: p.label, provider: p.provider, fallback: false };
}

function compactTools(tools: unknown[]): string {
  try {
    const names = (tools as Array<{ function?: { name?: string; description?: string; parameters?: unknown } }>).map((t) => ({
      name: t.function?.name,
      description: t.function?.description,
      parameters: t.function?.parameters,
    }));
    return JSON.stringify(names);
  } catch {
    return "[]";
  }
}

function transcript(messages: ChatMsg[]): string {
  return messages
    .map((m) => {
      if (m.role === "system") return `SYSTEM:\n${m.content}`;
      if (m.role === "user") return `USER:\n${m.content}`;
      if (m.role === "assistant") {
        if (m.tool_calls?.length) {
          return `ASSISTANT_TOOLS:\n${JSON.stringify(m.tool_calls.map((c) => ({ name: c.function.name, arguments: c.function.arguments })))}`;
        }
        return `ASSISTANT:\n${m.content || ""}`;
      }
      return `TOOL_RESULT ${m.tool_call_id}:\n${m.content}`;
    })
    .join("\n\n")
    .slice(0, 24000);
}

function parseAgyOutput(raw: string): { content: string | null; tool_calls?: ToolCall[] } {
  const cleaned = raw
    .replace(/```json/gi, "```")
    .replace(/```/g, "")
    .trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start >= 0 && end > start) {
    try {
      const obj = JSON.parse(cleaned.slice(start, end + 1)) as {
        message?: string;
        tool_calls?: Array<{ name?: string; arguments?: unknown; function?: { name?: string; arguments?: unknown } }>;
      };
      const calls = (obj.tool_calls || [])
        .map((c, i) => {
          const name = c.name || c.function?.name;
          if (!name) return null;
          const args = c.arguments ?? c.function?.arguments ?? {};
          return {
            id: `agy_${Date.now()}_${i}`,
            type: "function" as const,
            function: {
              name,
              arguments: typeof args === "string" ? args : JSON.stringify(args),
            },
          };
        })
        .filter((c): c is ToolCall => Boolean(c));
      if (calls.length) return { content: obj.message || null, tool_calls: calls };
      if (typeof obj.message === "string" && obj.message.trim()) return { content: obj.message };
    } catch {
      /* fall through */
    }
  }
  return { content: cleaned || null };
}

async function chatViaAgy(params: { messages: ChatMsg[]; tools: unknown[]; signal?: AbortSignal }): Promise<ProviderChatResult> {
  const protocol =
    `You are running inside agy print mode for the Code-UP superadmin HQ copilot.\n` +
    `READ ONLY. Do not edit files, do not run shell, do not call agy tools. Use ONLY the JSON protocol below.\n\n` +
    `Available HQ tools (we execute them, not you):\n${compactTools(params.tools)}\n\n` +
    `If you need a tool, output ONLY:\n{"tool_calls":[{"name":"tool_name","arguments":{}}]}\n` +
    `If you can answer, output ONLY:\n{"message":"your reply"}\n` +
    `No markdown. No other text.\n\n` +
    transcript(params.messages);

  const { stdout, stderr } = await execFileAsync(
    AGY_BIN,
    [
      "--sandbox",
      "--model",
      AGY_MODEL,
      "--output-format",
      "text",
      "--print-timeout",
      "90s",
      "--disable-slash-commands",
      `-p=${protocol}`,
    ],
    {
      cwd: "/home/ec2-user/Thefake",
      timeout: 95_000,
      maxBuffer: 1_500_000,
      env: {
        ...process.env,
        HOME: "/home/ec2-user",
        PATH: `/home/ec2-user/.local/bin:${process.env.PATH || "/usr/bin"}`,
      },
      signal: params.signal,
    }
  );
  const raw = (stdout || "").trim() || (stderr || "").trim();
  if (!raw) {
    return { model: AGY_INFO, error: "agy أعاد رداً فارغاً" };
  }
  const parsed = parseAgyOutput(raw);
  return {
    model: AGY_INFO,
    message: {
      role: "assistant",
      content: parsed.content,
      tool_calls: parsed.tool_calls,
    },
  };
}

async function chatViaHttp(params: { messages: ChatMsg[]; tools: unknown[]; signal?: AbortSignal }): Promise<ProviderChatResult> {
  const providers = configuredHttpProviders();
  if (!providers.length) {
    return {
      model: { id: "none", label: "غير مُعدّ", provider: "—", fallback: true },
      error: "agy غير متاح ولا يوجد مفتاح HTTP احتياطي.",
    };
  }

  let lastError = "تعذر الاتصال بأي نموذج HTTP";
  for (let i = 0; i < providers.length; i++) {
    const p = providers[i];
    try {
      const res = await fetch(`${p.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${p.apiKey}`,
        },
        body: JSON.stringify({
          model: p.model,
          messages: params.messages,
          tools: params.tools,
          tool_choice: "auto",
          temperature: 0.2,
          max_tokens: 1800,
        }),
        signal: params.signal,
      });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        lastError = `${p.label} HTTP ${res.status}: ${body.slice(0, 180)}`;
        continue;
      }
      const data = (await res.json()) as {
        model?: string;
        choices?: Array<{
          message?: {
            content?: string | null;
            tool_calls?: Array<{
              id: string;
              type?: string;
              function?: { name: string; arguments?: unknown };
              extra_content?: unknown;
            }>;
          };
        }>;
      };
      const msg = data.choices?.[0]?.message;
      const toolCalls = (msg?.tool_calls || []).map((c) => ({
        ...c,
        type: "function" as const,
        function: {
          name: c.function?.name || "",
          arguments:
            typeof c.function?.arguments === "string"
              ? c.function.arguments
              : JSON.stringify(c.function?.arguments ?? {}),
        },
      }));
      return {
        model: {
          id: data.model || p.model,
          label: p.label,
          provider: p.provider,
          fallback: true,
        },
        message: {
          role: "assistant",
          content: msg?.content ?? null,
          tool_calls: toolCalls.length ? toolCalls : undefined,
        },
      };
    } catch (err) {
      if (params.signal?.aborted) throw err;
      lastError = err instanceof Error ? err.message : String(err);
    }
  }
  return {
    model: { id: providers[0].model, label: providers[0].label, provider: providers[0].provider, fallback: true },
    error: lastError,
  };
}

export async function copilotChat(params: {
  messages: ChatMsg[];
  tools: unknown[];
  signal?: AbortSignal;
}): Promise<ProviderChatResult> {
  if (agyInstalled()) {
    try {
      const agy = await chatViaAgy(params);
      if (!agy.error && agy.message) return agy;
      console.warn("[superadmin-copilot] agy empty/error, falling back to HTTP", agy.error);
    } catch (err) {
      if (params.signal?.aborted) throw err;
      console.warn("[superadmin-copilot] agy failed", err instanceof Error ? err.message : err);
    }
  }
  return chatViaHttp(params);
}
