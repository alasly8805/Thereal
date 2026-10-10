import { NextRequest, NextResponse } from "next/server";
import { spawn } from "node:child_process";
import { getSession } from "@/lib/auth";
import { verifyTerminalPassword, logAdminAction } from "@/lib/admin-auth";
import {
  getTerminalEnv,
  validateCwd,
  registerProcess,
  unregisterProcess,
  AGENT_BIN,
  CLAUDE_BIN,
  AGY_BIN,
} from "@/lib/terminal-runner";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface ExecuteRequestBody {
  execId: string;
  tool: "agent" | "claude" | "agy" | "bash";
  command: string;
  flags?: string[];
  cwd?: string;
  password?: string;
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "superadmin") {
    return NextResponse.json({ ok: false, error: "غير مصرح (المشرف العام فقط)" }, { status: 403 });
  }

  const passHeader = req.headers.get("x-terminal-password") || "";
  const body = (await req.json().catch(() => ({}))) as ExecuteRequestBody;
  const password = passHeader || body.password || "";

  if (!verifyTerminalPassword(password)) {
    return NextResponse.json({ ok: false, error: "كلمة المرور غير صحيحة" }, { status: 401 });
  }

  const { execId, tool = "agent", command = "", flags = [], cwd: requestedCwd } = body;

  if (!execId) {
    return NextResponse.json({ ok: false, error: "execId مطلوب" }, { status: 400 });
  }

  const trimmedCmd = (command || "").trim();
  const cwd = validateCwd(requestedCwd);
  const env = getTerminalEnv();

  // Build the final command to execute
  let shellCmd = "";

  if (tool === "bash") {
    if (!trimmedCmd) {
      return NextResponse.json({ ok: false, error: "الأمر فارغ" }, { status: 400 });
    }
    shellCmd = trimmedCmd;
  } else if (tool === "agent") {
    shellCmd = buildToolShellCmd("agent", AGENT_BIN, trimmedCmd, flags);
  } else if (tool === "claude") {
    shellCmd = buildToolShellCmd("claude", CLAUDE_BIN, trimmedCmd, flags);
  } else if (tool === "agy") {
    shellCmd = buildToolShellCmd("agy", AGY_BIN, trimmedCmd, flags);
  }

  // Log action
  try {
    await logAdminAction({
      adminId: session.id,
      adminName: session.name,
      action: "SUPERADMIN_ACTION",
      targetType: "TERMINAL_COMMAND",
      targetId: execId,
      targetName: `${tool}: ${shellCmd.slice(0, 100)}`,
    });
  } catch {
    /* ignore logging failure */
  }

  const startTime = Date.now();
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      const sendEvent = (data: Record<string, unknown>) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        } catch {
          /* controller might be closed */
        }
      };

      sendEvent({
        type: "start",
        execId,
        tool,
        cmd: shellCmd,
        cwd,
        timestamp: startTime,
      });

      // Spawn bash process with PTY-like or pipe stdio
      const proc = spawn("/bin/bash", ["-c", shellCmd], {
        cwd,
        env,
        stdio: ["ignore", "pipe", "pipe"],
      });

      registerProcess(execId, proc);

      proc.stdout.on("data", (chunk: Buffer) => {
        sendEvent({
          type: "stdout",
          text: chunk.toString("utf8"),
        });
      });

      proc.stderr.on("data", (chunk: Buffer) => {
        sendEvent({
          type: "stderr",
          text: chunk.toString("utf8"),
        });
      });

      // Keepalive ping every 12 seconds to prevent Cloudflare/proxy timeouts (which trigger "network error")
      const keepaliveInterval = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(": keepalive\n\n"));
        } catch {
          clearInterval(keepaliveInterval);
        }
      }, 12000);

      proc.on("error", (err) => {
        clearInterval(keepaliveInterval);
        sendEvent({
          type: "error",
          error: err.message,
        });
        unregisterProcess(execId);
        try {
          controller.close();
        } catch {}
      });

      proc.on("close", (code, signal) => {
        clearInterval(keepaliveInterval);
        unregisterProcess(execId);
        sendEvent({
          type: "exit",
          code: code ?? (signal ? 130 : 0),
          signal: signal ?? null,
          durationMs: Date.now() - startTime,
        });
        try {
          controller.close();
        } catch {}
      });

      // Handle client abort / disconnect
      req.signal.addEventListener("abort", () => {
        clearInterval(keepaliveInterval);
        unregisterProcess(execId);
        try {
          proc.kill("SIGTERM");
        } catch {}
      });
    },
    cancel() {
      unregisterProcess(execId);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

function escapeShellArg(arg: string): string {
  // Safe single-quote escape for bash
  return `'${arg.replace(/'/g, "'\\''")}'`;
}

function buildToolShellCmd(
  tool: "agent" | "claude" | "agy",
  binPath: string,
  rawCmd: string,
  inputFlags: string[] = []
): string {
  let cmd = (rawCmd || "").trim();

  // Strip leading tool invocation if present: e.g. "agy ...", "claude ...", "agent ..."
  const toolPrefixRegex = new RegExp(`^${tool}\\s+`, "i");
  if (toolPrefixRegex.test(cmd)) {
    cmd = cmd.replace(toolPrefixRegex, "").trim();
  }

  // Set of flags
  const flagsSet = new Set<string>(inputFlags);

  // For agy in headless web terminal, auto-approve permissions unless explicitly disabled,
  // because headless mode cannot answer interactive stdin permission prompts.
  if (tool === "agy" && !flagsSet.has("--no-dangerously-skip-permissions")) {
    flagsSet.add("--dangerously-skip-permissions");
  }
  // For claude, also include --dangerously-skip-permissions by default in headless mode
  if (tool === "claude" && !flagsSet.has("--no-dangerously-skip-permissions")) {
    flagsSet.add("--dangerously-skip-permissions");
  }
  // For agent, include --yolo by default in headless mode
  if (tool === "agent" && !flagsSet.has("--no-yolo")) {
    flagsSet.add("--yolo");
  }

  // Check for common subcommands or informational flags that shouldn't take -p
  const subcommands = [
    "doctor",
    "changelog",
    "update",
    "install",
    "version",
    "-v",
    "--version",
    "help",
    "-h",
    "--help",
    "models",
    "agents",
    "mcp",
    "plugin",
    "plugins",
    "status",
    "whoami",
  ];
  const isDirectSubcommand = subcommands.some(
    (sc) => cmd === sc || cmd.startsWith(`${sc} `)
  );
  if (isDirectSubcommand) {
    return `${binPath} ${cmd}`.trim();
  }

  // If command already explicitly uses -p or --print
  if (/^-(p|-print)\b/.test(cmd) || /\s-(p|-print)\b/.test(cmd)) {
    const flagStr = Array.from(flagsSet).join(" ");
    return `${binPath} ${flagStr} ${cmd}`.trim();
  }

  // Extract known flags that might have been typed inside the input box:
  // e.g. --dangerously-skip-permissions, --continue, -c, --yolo, --verbose
  const flagTokens = [
    "--dangerously-skip-permissions",
    "--continue",
    "-c",
    "--yolo",
    "--verbose",
  ];
  for (const token of flagTokens) {
    const regex = new RegExp(`(^|\\s)${token}(\\s|$)`, "g");
    if (regex.test(cmd)) {
      flagsSet.add(token);
      cmd = cmd.replace(regex, " ").trim();
    }
  }

  const isContinue = flagsSet.has("--continue") || flagsSet.has("-c");
  const flagStr = Array.from(flagsSet).join(" ");

  // If cmd is empty
  if (!cmd) {
    if (isContinue) {
      // In non-interactive mode, both agy and claude fail if no prompt is provided with --continue.
      // Providing a default prompt ensures the continuation turn executes properly.
      return `${binPath} ${flagStr} -p "continue"`.trim();
    }
    if (flagsSet.size > 0) {
      return `${binPath} ${flagStr}`.trim();
    }
    return `${binPath} --help`;
  }

  // Non-empty prompt
  return `${binPath} ${flagStr} -p ${escapeShellArg(cmd)}`.trim();
}

