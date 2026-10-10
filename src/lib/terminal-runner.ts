import { ChildProcess } from "node:child_process";
import path from "node:path";
import fs from "node:fs";

export const AGENT_BIN = "/home/ec2-user/.local/bin/agent";
export const CLAUDE_BIN = "/home/ec2-user/.local/bin/claude";
export const AGY_BIN = "/home/ec2-user/.local/bin/agy";
export const BASH_BIN = "/bin/bash";

export const DEFAULT_CWD = "/home/ec2-user/Thefake";
export const EC2_HOME_CWD = "/home/ec2-user";

declare global {
  var __ACTIVE_TERMINAL_PROCS: Map<string, ChildProcess> | undefined;
}

export function getActiveProcs(): Map<string, ChildProcess> {
  if (!globalThis.__ACTIVE_TERMINAL_PROCS) {
    globalThis.__ACTIVE_TERMINAL_PROCS = new Map<string, ChildProcess>();
  }
  return globalThis.__ACTIVE_TERMINAL_PROCS;
}

export function registerProcess(execId: string, proc: ChildProcess) {
  getActiveProcs().set(execId, proc);
}

export function unregisterProcess(execId: string) {
  getActiveProcs().delete(execId);
}

export function killTerminalProcess(execId: string): boolean {
  const procs = getActiveProcs();
  const proc = procs.get(execId);
  if (!proc) return false;
  try {
    proc.kill("SIGTERM");
    setTimeout(() => {
      try {
        if (!proc.killed) proc.kill("SIGKILL");
      } catch {
        /* ignore */
      }
    }, 1500);
    procs.delete(execId);
    return true;
  } catch {
    procs.delete(execId);
    return false;
  }
}

export function getTerminalEnv(): NodeJS.ProcessEnv {
  const systemPath = process.env.PATH || "";
  const extraPaths = [
    "/home/ec2-user/.gemini/antigravity-cli/bin",
    "/home/ec2-user/.local/bin",
    "/home/ec2-user/.nvm/versions/node/v20.20.2/bin",
    "/usr/local/bin",
    "/usr/bin",
    "/bin",
  ];
  const combinedPath = Array.from(new Set([...extraPaths, ...systemPath.split(":")])).join(":");

  return {
    ...process.env,
    PATH: combinedPath,
    HOME: "/home/ec2-user",
    USER: "ec2-user",
    LOGNAME: "ec2-user",
    SHELL: "/bin/bash",
    TERM: "xterm-256color",
    COLORTERM: "truecolor",
    FORCE_COLOR: "1",
    LANG: "en_US.UTF-8",
  };
}

export function validateCwd(requestedCwd?: string): string {
  if (!requestedCwd) return DEFAULT_CWD;
  const candidate = path.resolve(requestedCwd);
  // Allowed roots: /home/ec2-user/Thefake and /home/ec2-user
  if (candidate.startsWith("/home/ec2-user") && fs.existsSync(candidate)) {
    return candidate;
  }
  return DEFAULT_CWD;
}
