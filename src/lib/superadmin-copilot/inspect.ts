import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { lstat, readdir, readFile, realpath } from "node:fs/promises";
import path from "node:path";
import type { ToolResult } from "./types";

const execFileAsync = promisify(execFile);

const APP_ROOT = path.resolve("/home/ec2-user/Thefake");
const MAX_FILE_BYTES = 80_000;
const MAX_LINES = 400;
const MAX_GREP_HITS = 40;

const SECRET_NAME =
  /(^|\/)(\.env([.].*)?|credentials(\.json)?|\.aws|\.ssh|id_rsa|id_ed25519|.*\.(pem|key|p12|pfx|crt))$/i;

const DENY_DIR_PARTS = new Set([
  "node_modules",
  ".git",
  ".cursor",
  ".gemini",
  ".antigravity-ide-server",
  ".cursor-server",
  "terminals",
]);

function refused(why: string): ToolResult {
  return { ok: false, summary: `مرفوض (قراءة فقط): ${why}`, data: { refused: true, reason: why } };
}

function insideRoot(abs: string): boolean {
  const rel = path.relative(APP_ROOT, abs);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

async function resolveSafe(userPath: string): Promise<{ ok: true; abs: string } | { ok: false; reason: string }> {
  const raw = (userPath || "").trim();
  if (!raw) return { ok: false, reason: "مسار فارغ" };
  if (raw.includes("\0")) return { ok: false, reason: "مسار غير صالح" };

  const candidate = path.isAbsolute(raw) ? path.resolve(raw) : path.resolve(APP_ROOT, raw);
  let real: string;
  try {
    real = await realpath(candidate);
  } catch {
    // File may not exist yet — still jail the unresolved path
    real = candidate;
  }
  if (!insideRoot(real) && !insideRoot(candidate)) {
    return { ok: false, reason: "خارج مجلد المنصة. المساعد لا يقرأ إلا داخل Thefake." };
  }
  const rel = path.relative(APP_ROOT, real);
  const parts = rel.split(path.sep);
  if (parts.some((p) => DENY_DIR_PARTS.has(p))) {
    return { ok: false, reason: "هذا المجلد محجوب (node_modules / .git / أسرار)." };
  }
  if (SECRET_NAME.test(real) || SECRET_NAME.test(path.basename(real))) {
    return { ok: false, reason: "ملفات الأسرار (.env، المفاتيح، credentials) محجوبة." };
  }
  return { ok: true, abs: real };
}

async function readTextLimited(abs: string, offsetLine = 1): Promise<{ text: string; truncated: boolean; totalHint: string }> {
  const buf = await readFile(abs);
  if (buf.length > MAX_FILE_BYTES) {
    const slice = buf.subarray(0, MAX_FILE_BYTES).toString("utf8");
    return { text: slice, truncated: true, totalHint: `${buf.length} bytes, showing first ${MAX_FILE_BYTES}` };
  }
  const all = buf.toString("utf8");
  const lines = all.split(/\r?\n/);
  const start = Math.max(0, offsetLine - 1);
  const chunk = lines.slice(start, start + MAX_LINES);
  const truncated = start + chunk.length < lines.length || start > 0;
  return {
    text: chunk.map((line, i) => `${start + i + 1}| ${line}`).join("\n"),
    truncated,
    totalHint: `${lines.length} lines`,
  };
}

export async function inspectReadFile(args: { path?: string; offset?: number }): Promise<ToolResult> {
  const safe = await resolveSafe(args.path || "");
  if (!safe.ok) return refused(safe.reason);
  try {
    const st = await lstat(safe.abs);
    if (st.isDirectory()) return refused("هذا مجلد — استخدم list_dir");
    if (st.size > 2_000_000) return refused("الملف أكبر من 2MB");
    const { text, truncated, totalHint } = await readTextLimited(safe.abs, args.offset || 1);
    const rel = path.relative(APP_ROOT, safe.abs);
    return {
      ok: true,
      summary: `قرأ ${rel} (${totalHint}${truncated ? "، مقطوع" : ""})`,
      data: { path: rel, truncated, totalHint, content: text },
    };
  } catch (err) {
    return refused(err instanceof Error ? err.message : "تعذر القراءة");
  }
}

export async function inspectListDir(args: { path?: string }): Promise<ToolResult> {
  const safe = await resolveSafe(args.path || ".");
  if (!safe.ok) return refused(safe.reason);
  try {
    const st = await lstat(safe.abs);
    if (!st.isDirectory()) return refused("ليس مجلداً");
    const names = await readdir(safe.abs);
    const rows: string[][] = [];
    for (const name of names.slice(0, 80)) {
      if (DENY_DIR_PARTS.has(name) || SECRET_NAME.test(name)) continue;
      const p = path.join(safe.abs, name);
      try {
        const s = await lstat(p);
        rows.push([s.isDirectory() ? "dir" : "file", name, s.isDirectory() ? "—" : `${s.size}`]);
      } catch {
        rows.push(["?", name, "—"]);
      }
    }
    const rel = path.relative(APP_ROOT, safe.abs) || ".";
    return {
      ok: true,
      summary: `محتويات ${rel}: ${rows.length} عنصر`,
      data: { path: rel, entries: rows },
      tables: [{ id: "dir", title: rel, columns: ["نوع", "الاسم", "حجم"], rows }],
    };
  } catch (err) {
    return refused(err instanceof Error ? err.message : "تعذر العرض");
  }
}

export async function inspectSearchCode(args: { query?: string; glob?: string }): Promise<ToolResult> {
  const q = (args.query || "").trim();
  if (q.length < 2) return refused("اكتب حرفين على الأقل للبحث في الكود");
  if (q.length > 80) return refused("نمط البحث طويل جداً");

  const roots = ["src", "scripts", "prisma"].map((d) => path.join(APP_ROOT, d));
  const needle = q.toLowerCase();
  const hits: string[] = [];
  const glob = args.glob?.replace(/[^\w.*?/]/g, "") || "";

  async function walk(dir: string): Promise<void> {
    if (hits.length >= MAX_GREP_HITS) return;
    let names: string[] = [];
    try {
      names = await readdir(dir);
    } catch {
      return;
    }
    for (const name of names) {
      if (hits.length >= MAX_GREP_HITS) return;
      if (DENY_DIR_PARTS.has(name) || SECRET_NAME.test(name)) continue;
      const abs = path.join(dir, name);
      let st;
      try {
        st = await lstat(abs);
      } catch {
        continue;
      }
      if (st.isDirectory()) {
        await walk(abs);
        continue;
      }
      if (!st.isFile() || st.size > 200_000) continue;
      if (!/\.(ts|tsx|js|mjs|cjs|json|md|prisma)$/.test(name)) continue;
      if (glob && !name.includes(glob.replace(/\*/g, ""))) continue;
      let text: string;
      try {
        text = (await readFile(abs)).toString("utf8");
      } catch {
        continue;
      }
      const lines = text.split(/\r?\n/);
      const rel = path.relative(APP_ROOT, abs);
      let perFile = 0;
      for (let i = 0; i < lines.length; i++) {
        if (perFile >= 8) break;
        if (lines[i].toLowerCase().includes(needle)) {
          hits.push(`${rel}:${i + 1}: ${lines[i].trim().slice(0, 180)}`);
          perFile += 1;
          if (hits.length >= MAX_GREP_HITS) return;
        }
      }
    }
  }

  for (const root of roots) await walk(root);

  return {
    ok: true,
    summary: hits.length ? `وُجد ${hits.length} سطر يطابق «${q}»` : `لا نتائج لـ «${q}»`,
    data: { query: q, hits },
    tables: hits.length
      ? [{ id: "grep", title: `بحث الكود: ${q}`, columns: ["الموقع"], rows: hits.map((l) => [l]) }]
      : [],
  };
}

const LOG_ALIASES: Record<string, string> = {
  watchdog: path.join(APP_ROOT, "logs/watchdog.log"),
  "watchdog-events": path.join(APP_ROOT, "logs/watchdog-events.log"),
  "pm2-out": path.join("/home/ec2-user/.pm2/logs/Thefake-out.log"),
  "pm2-error": path.join("/home/ec2-user/.pm2/logs/Thefake-error.log"),
};

export async function inspectLogs(args: { which?: string; lines?: number }): Promise<ToolResult> {
  const key = (args.which || "pm2-error").trim();
  const abs = LOG_ALIASES[key];
  if (!abs) {
    return refused(`سجل غير معروف. المسموح: ${Object.keys(LOG_ALIASES).join(", ")}`);
  }
  const n = Math.min(Math.max(args.lines || 80, 20), 200);
  try {
    const { stdout } = await execFileAsync("/usr/bin/tail", ["-n", String(n), abs], {
      timeout: 5000,
      maxBuffer: 120_000,
    });
    const redacted = redactSecrets(stdout);
    return {
      ok: true,
      summary: `آخر ${n} سطر من ${key}`,
      data: { which: key, content: redacted.slice(-MAX_FILE_BYTES) },
    };
  } catch (err) {
    return refused(err instanceof Error ? err.message : "تعذر قراءة السجل");
  }
}

function redactSecrets(text: string): string {
  return text
    .replace(/(api[_-]?key|secret|password|token|jwt)([^\S\n]*[=:][^\S\n]*)([^\s,;]+)/gi, "$1$2***")
    .replace(/sk-[a-zA-Z0-9_-]{10,}/g, "sk-***")
    .replace(/gsk_[a-zA-Z0-9]{10,}/g, "gsk_***");
}

export async function inspectHealth(): Promise<ToolResult> {
  const run = async (bin: string, argv: string[]) => {
    try {
      const { stdout, stderr } = await execFileAsync(bin, argv, {
        timeout: 6000,
        maxBuffer: 2_000_000,
        cwd: APP_ROOT,
        env: process.env,
      });
      return (stdout || stderr || "").trim();
    } catch (err) {
      return `error: ${err instanceof Error ? err.message : String(err)}`;
    }
  };

  const [pm2Raw, disk, mem, buildId] = await Promise.all([
    run("pm2", ["jlist"]),
    run("df", ["-h", "/"]),
    run("free", ["-h"]),
    readFile(path.join(APP_ROOT, ".next/BUILD_ID"), "utf8").then((s) => s.trim()).catch(() => "missing"),
  ]);

  let pm2Brief = "pm2 unavailable";
  try {
    const list = JSON.parse(pm2Raw) as Array<{
      name?: string;
      pm2_env?: { status?: string; restart_time?: number; unstable_restarts?: number; exec_mode?: string };
      monit?: { memory?: number; cpu?: number };
    }>;
    pm2Brief = list
      .map((p) => {
        const memMb = Math.round((p.monit?.memory || 0) / 1048576);
        return `${p.name || "?"} status=${p.pm2_env?.status || "?"} restarts=${p.pm2_env?.restart_time ?? "?"} unstable=${p.pm2_env?.unstable_restarts ?? "?"} cpu=${p.monit?.cpu ?? "?"} mem=${memMb}MB`;
      })
      .join(" | ");
  } catch {
    pm2Brief = "pm2 parse failed";
  }

  return {
    ok: true,
    summary: `صحة السيرفر: ${pm2Brief}. BUILD_ID ${buildId}`,
    data: {
      pm2: pm2Brief,
      disk: redactSecrets(disk).slice(0, 500),
      mem: redactSecrets(mem).slice(0, 400),
      buildId,
    },
    kpis: [
      { key: "pm2", label: "PM2", value: pm2Brief.slice(0, 80), tone: pm2Brief.includes("online") ? "good" : "warn" },
      { key: "build", label: "BUILD_ID", value: buildId.slice(0, 18), tone: "gold" },
    ],
  };
}

export async function inspectGit(): Promise<ToolResult> {
  const run = async (argv: string[]) => {
    const { stdout } = await execFileAsync("/usr/bin/git", argv, {
      cwd: APP_ROOT,
      timeout: 6000,
      maxBuffer: 40_000,
    });
    return stdout.trim();
  };
  try {
    const [status, log, branch] = await Promise.all([
      run(["status", "-sb"]),
      run(["log", "-8", "--oneline"]),
      run(["rev-parse", "--abbrev-ref", "HEAD"]),
    ]);
    return {
      ok: true,
      summary: `فرع ${branch}. ${status.split("\n")[0]}`,
      data: { branch, status, log },
    };
  } catch (err) {
    return refused(err instanceof Error ? err.message : "تعذر git");
  }
}

export const INSPECT_TOOL_NAMES = [
  "read_file",
  "list_dir",
  "search_code",
  "read_logs",
  "inspect_health",
  "inspect_git",
] as const;
